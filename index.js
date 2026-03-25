const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const db = require('./db');
const sessionManager = require('./session');
const { initRouteSession } = require('./session');
const reportHelper = require('./report');
const checklistItems = require('./checklist');
const { handleRouteMessage } = require('./routeFlow');

/**
 * Extract bare phone number from WhatsApp JID.
 * e.g. "263772143082@s.whatsapp.net" → "263772143082"
 */
function extractPhoneNumber(jid) {
    return jid.split('@')[0].split(':')[0];
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        printQRInTerminal: true,
        auth: state,
        logger: pino({ level: 'silent' }) // Keeping it silent to avoid console spam
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('Scan the QR code below to log in:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom) ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut : true;
            console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
            if (shouldReconnect) {
                // Exponential backoff logic could wrap this call, but generic retry works natively most times.
                setTimeout(connectToWhatsApp, 3000); 
            }
        } else if (connection === 'open') {
            console.log('Bot is online and ready.');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        
        // Ignore own messages or status updates
        if (msg.key.fromMe || m.type !== 'notify' || !msg.message) return;

        const senderJid = msg.key.remoteJid;
        
        // Extract plain text from message
        let text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        text = text.trim();
        const textLower = text.toLowerCase();

        if (!text) return; // Only process text messages
        
        console.log(`[${senderJid}] Rx: ${text}`);

        // Get or create session
        const session = sessionManager.getSession(senderJid);

        // ── ROUTE FLOW delegation ─────────────────────────────────────────
        // If the session belongs to the route flow, hand off entirely.
        if (session.flow === 'route') {
            try {
                await handleRouteMessage(sock, senderJid, text, session);
            } catch (err) {
                console.error('Error in route flow:', err);
                await sock.sendMessage(senderJid, { text: 'An internal error occurred. Please try again.' });
                sessionManager.clearSession(senderJid);
            }
            return;
        }

        // ── VAN FLOW (and wake-word detection) ────────────────────────────
        try {
            switch (session.currentStep) {
                case 'IDLE':
                case 'AWAITING_DRIVER_ID':
                    if (textLower === 'van') {
                        // Start Van inspection flow
                        await sock.sendMessage(senderJid, { text: "Welcome to the Vehicle Check System. Please enter your Driver ID." });
                        sessionManager.updateSession(senderJid, { currentStep: 'AWAITING_VEHICLE_REG' });
                    } else if (textLower === 'route') {
                        // Start Route reporting flow — permission check first
                        const phoneNumber = extractPhoneNumber(senderJid);
                        console.log(`Route trigger from: ${phoneNumber}`);
                        const reporter = await db.getRouteReporter(phoneNumber);
                        if (!reporter) {
                            await sock.sendMessage(senderJid, { text: 'Sorry, you are not authorised to submit route reports.' });
                            sessionManager.clearSession(senderJid);
                        } else {
                            sessionManager.initRouteSession(senderJid);
                            await sock.sendMessage(senderJid, { text: 'Enter your driver ID' });
                            sessionManager.updateSession(senderJid, { currentStep: 'ROUTE_AWAIT_DRIVER_ID' });
                        }
                    }
                    break;

                case 'AWAITING_VEHICLE_REG':
                    sessionManager.updateSession(senderJid, { driverID: text });
                    await sock.sendMessage(senderJid, { text: "Please enter your vehicle registration number." });
                    sessionManager.updateSession(senderJid, { currentStep: 'CONFIRM_DETAILS' });
                    break;

                case 'CONFIRM_DETAILS':
                    sessionManager.updateSession(senderJid, { vehicleReg: text });
                    
                    const lookupResult = await db.lookupDriverAndVehicle(session.driverID, session.vehicleReg);
                    
                    if (!lookupResult) {
                        await sock.sendMessage(senderJid, { text: "Sorry, we could not find a matching driver and vehicle. Please try again." });
                        sessionManager.clearSession(senderJid);
                        // Restart
                        const newSession = sessionManager.getSession(senderJid);
                        await sock.sendMessage(senderJid, { text: "Welcome to the Vehicle Check System. Please enter your Driver ID." });
                        sessionManager.updateSession(senderJid, { currentStep: 'AWAITING_VEHICLE_REG' });
                    } else {
                        // Store DB info to session
                        sessionManager.updateSession(senderJid, {
                            driverName: lookupResult.driver_name,
                            branch: lookupResult.branch,
                            vehicleMake: lookupResult.vehicle_make,
                            vehicleModel: lookupResult.vehicle_model,
                            currentStep: 'AWAITING_CONFIRMATION'
                        });
                        
                        const confirmMsg = `Vehicle Details: ${lookupResult.vehicle_make} ${lookupResult.vehicle_model}\nDriver Details: ${lookupResult.driver_name} (${lookupResult.branch})\nReply *Y* to confirm or *N* to cancel.`;
                        await sock.sendMessage(senderJid, { text: confirmMsg });
                    }
                    break;

                case 'AWAITING_CONFIRMATION':
                    if (textLower === 'y' || textLower === 'yes') {
                        sessionManager.updateSession(senderJid, { currentStep: 'CHECKLIST' });
                        // Ask first checklist item
                        await askNextChecklistItem(sock, senderJid, session);
                    } else if (textLower === 'n' || textLower === 'no' || textLower === 'cancel') {
                        await sock.sendMessage(senderJid, { text: "Session cancelled." });
                        sessionManager.clearSession(senderJid);
                    } else {
                        await sock.sendMessage(senderJid, { text: "Please reply with Y to confirm or N to cancel." });
                    }
                    break;

                case 'CHECKLIST':
                    if (textLower === 'cancel') {
                        await sock.sendMessage(senderJid, { text: "Session ended." });
                        sessionManager.clearSession(senderJid);
                        break;
                    }

                    if (session.awaitingFaultDescription) {
                        // Current text is the fault description
                        session.checklistResults.push({
                            item: session.currentFaultItem,
                            status: 'FAULT',
                            fault_description: text
                        });
                        
                        // Proceed to next item
                        session.checklistIndex++;
                        session.awaitingFaultDescription = false;
                        session.currentFaultItem = null;
                        sessionManager.updateSession(senderJid, session);
                        await askNextChecklistItem(sock, senderJid, session);
                    } else {
                        // Awaiting Y/N for current item
                        if (textLower === 'y' || textLower === 'yes') {
                            session.checklistResults.push({
                                item: checklistItems[session.checklistIndex],
                                status: 'OK',
                                fault_description: null
                            });
                             // Proceed to next item
                            session.checklistIndex++;
                            sessionManager.updateSession(senderJid, session);
                            await askNextChecklistItem(sock, senderJid, session);
                        } else if (textLower === 'n' || textLower === 'no') {
                            session.awaitingFaultDescription = true;
                            session.currentFaultItem = checklistItems[session.checklistIndex];
                            sessionManager.updateSession(senderJid, session);
                            await sock.sendMessage(senderJid, { text: "Please describe the fault:" });
                        } else {
                            await sock.sendMessage(senderJid, { text: "Please reply with Y, N, or cancel." });
                            // Re-ask current question
                            const curItem = checklistItems[session.checklistIndex];
                            await sock.sendMessage(senderJid, { text: `${curItem} in good condition? Reply *Y* for yes or *N* for no, or *cancel* to end the session.` });
                        }
                    }
                    break;
                    
                case 'AWAITING_COMMENTS':
                    // Store comments
                    let finalComments = textLower === 'none' ? '' : text;
                    sessionManager.updateSession(senderJid, { comments: finalComments });
                    
                    // Finalize and Save
                    const finalSession = sessionManager.getSession(senderJid);
                    
                    try {
                        // 1. Save to DB
                        const reportData = {
                            driverId: finalSession.driverID,
                            vehicleReg: finalSession.vehicleReg,
                            checklist: finalSession.checklistResults,
                            comments: finalSession.comments
                        };
                        await db.saveInspectionReport(reportData);
                        
                        // 2. Notify Group
                        await reportHelper.sendReportToGroup(sock, finalSession);
                        
                        // 3. Inform Driver
                        await sock.sendMessage(senderJid, { text: "Report submitted successfully. Have a safe trip! 🚗" });
                        
                    } catch (err) {
                        console.error("Failed to save report:", err);
                        await sock.sendMessage(senderJid, { text: "An error occurred while saving your report. Please contact an administrator." });
                    }
                    
                    // Cleanup
                    sessionManager.clearSession(senderJid);
                    break;
                    
                default:
                    // Reset if in bad state
                    sessionManager.clearSession(senderJid);
                    break;
            }
        } catch (err) {
            console.error("Error processing message:", err);
            await sock.sendMessage(senderJid, { text: "An internal error occurred. Please try again later." });
            sessionManager.clearSession(senderJid);
        }
    });
}

/**
 * Helper to orchestrate checklist flow
 */
async function askNextChecklistItem(sock, jid, session) {
    if (session.checklistIndex < checklistItems.length) {
        const item = checklistItems[session.checklistIndex];
        const msg = `${item} in good condition? Reply *Y* for yes or *N* for no, or *cancel* to end the session.`;
        await sock.sendMessage(jid, { text: msg });
    } else {
        // Checklist complete
        sessionManager.updateSession(jid, { currentStep: 'AWAITING_COMMENTS' });
        await sock.sendMessage(jid, { text: "Please enter any additional comments, or reply *none*." });
    }
}

// Start bot
connectToWhatsApp();
