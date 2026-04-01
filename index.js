const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, Browsers } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

const db = require('./db');
const sessionManager = require('./session');
const { handleRouteMessage } = require('./routeFlow');
const { handleEditMessage } = require('./editFlow');
const { handleVanMessage } = require('./vanFlow');

/**
 * Extract bare phone number from WhatsApp JID.
 * e.g. "263772143082@s.whatsapp.net" → "263772143082"
 */
function extractPhoneNumber(jid) {
    return jid.split('@')[0].split(':')[0];
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version, isLatest } = await fetchLatestBaileysVersion();
    console.log(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }), // Keeping it silent to avoid console spam
        browser: Browsers.macOS('Desktop') // Standard macOS desktop browser signature
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

        // ── UNIVERSAL CANCEL ──────────────────────────────────────────────
        if (textLower === 'cancel') {
            await sock.sendMessage(senderJid, { text: 'Session cancelled.' });
            sessionManager.clearSession(senderJid);
            return;
        }

        // ── ROUTE FLOW delegation ─────────────────────────────────────────
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

        // ── EDIT FLOW delegation ─────────────────────────────────────────
        if (session.flow === 'edit') {
            try {
                await handleEditMessage(sock, senderJid, text, session);
            } catch (err) {
                console.error('Error in edit flow:', err);
                await sock.sendMessage(senderJid, { text: 'An internal error occurred. Please try again.' });
                sessionManager.clearSession(senderJid);
            }
            return;
        }

        // ── VAN FLOW delegation ─────────────────────────────────────────
        if (session.flow === 'van') {
            try {
                await handleVanMessage(sock, senderJid, text, session);
            } catch (err) {
                console.error('Error in van flow:', err);
                await sock.sendMessage(senderJid, { text: 'An internal error occurred. Please try again.' });
                sessionManager.clearSession(senderJid);
            }
            return;
        }

        // ── IDLE / WAKE-WORD DETECTION ────────────────────────────────────
        if (session.currentStep === 'IDLE') {
            try {
                if (textLower === 'van') {
                    // Start Van inspection flow
                    sessionManager.initVanSession(senderJid);
                    await sock.sendMessage(senderJid, { text: "Welcome to the Vehicle Check System. Please enter your Driver ID." });
                } else if (textLower === 'route') {
                    // Start Route reporting flow — permission check first
                    const phoneNumber = extractPhoneNumber(senderJid);
                    console.log(`Route trigger from: ${phoneNumber}`);
                    // const reporter = await db.getRouteReporter(phoneNumber);

                    // TEMPORARILy DISABLED FOR TESTING
                    // if (!reporter) {
                    //     await sock.sendMessage(senderJid, { text: 'Sorry, you are not authorised to submit route reports.' });
                    //     sessionManager.clearSession(senderJid);
                    // } else {
                        sessionManager.initRouteSession(senderJid);
                        await sock.sendMessage(senderJid, { text: 'Enter your driver ID' });
                        sessionManager.updateSession(senderJid, { currentStep: 'ROUTE_AWAIT_DRIVER_ID' });
                    // }
                } else if (textLower === 'edit') {
                    // Start Edit flow
                    sessionManager.updateSession(senderJid, {
                        flow: 'edit',
                        currentStep: 'EDIT_SELECT_TYPE'
                    });
                    await sock.sendMessage(senderJid, { text: "Which type of report would you like to edit?\n1. Van Inspection\n2. Route Report\n\nReply with the number or *cancel*." });
                }
                // Silently ignore other commands to avoid exposing a menu to unauthorized users
            } catch (err) {
                console.error("Error processing wake word:", err);
                await sock.sendMessage(senderJid, { text: "An internal error occurred. Please try again later." });
                sessionManager.clearSession(senderJid);
            }
        }
    });
}

// Start bot
connectToWhatsApp();
