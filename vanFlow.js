/**
 * vanFlow.js
 * Handles all logic for the "Van Inspection" flow.
 *
 * New flow order:
 *   1. Inspector enters their ID        → VAN_AWAIT_INSPECTOR_ID
 *   2. Inspector enters vehicle reg     → VAN_AWAIT_VEHICLE_REG
 *   3. Confirm inspector + vehicle      → VAN_AWAIT_CONFIRM
 *   4. Checklist Y/N questions          → VAN_CHECKLIST
 *   5. Additional comments              → VAN_AWAIT_COMMENTS
 *   6. Inspector enters driver's ID     → VAN_AWAIT_DRIVER_ID
 *   7. Report saved & sent to group
 */

const db = require('./db');
const sessionManager = require('./session');
const reportHelper = require('./report');
const checklistItems = require('./checklist');

/**
 * Main message handler for the Van flow.
 * Called from index.js whenever a session with flow='van' receives a message.
 */
async function handleVanMessage(sock, senderJid, text, session) {
    const textLower = text.trim().toLowerCase();

    try {
        switch (session.currentStep) {

            // ── STEP 1: Collect Inspector ID ──────────────────────────────
            case 'VAN_AWAIT_INSPECTOR_ID': {
                const inspector = await db.getDriverById(text.trim());
                if (!inspector) {
                    await sock.sendMessage(senderJid, { text: "Sorry, we could not find anyone with that ID. Please enter your ID again." });
                } else {
                    sessionManager.updateSession(senderJid, {
                        inspectorID:     text.trim(),
                        inspectorName:   inspector.name,
                        inspectorBranch: inspector.branch,
                        currentStep:     'VAN_AWAIT_VEHICLE_REG'
                    });
                    await sock.sendMessage(senderJid, { text: `Welcome, ${inspector.name}. Please enter the vehicle registration number.` });
                }
                break;
            }

            // ── STEP 2: Collect Vehicle Registration ──────────────────────
            case 'VAN_AWAIT_VEHICLE_REG': {
                const vehicleReg = text.trim().toUpperCase();
                const vehicle = await db.lookupVehicle(vehicleReg);

                if (!vehicle) {
                    await sock.sendMessage(senderJid, { text: "Sorry, we could not find that vehicle. Please enter the registration number again." });
                } else {
                    sessionManager.updateSession(senderJid, {
                        vehicleReg:   vehicle.registration,
                        vehicleMake:  vehicle.make,
                        vehicleModel: vehicle.model,
                        currentStep:  'VAN_AWAIT_CONFIRM'
                    });

                    const updatedSession = sessionManager.getSession(senderJid);
                    const confirmMsg =
                        `Inspector: ${updatedSession.inspectorName} (${updatedSession.inspectorBranch})\n` +
                        `Vehicle: ${vehicle.make} ${vehicle.model} (${vehicle.registration})\n` +
                        `Reply *Y* to confirm or *N* to cancel.`;
                    await sock.sendMessage(senderJid, { text: confirmMsg });
                }
                break;
            }

            // ── STEP 3: Confirm ───────────────────────────────────────────
            case 'VAN_AWAIT_CONFIRM':
                if (textLower === 'y' || textLower === 'yes') {
                    sessionManager.updateSession(senderJid, { currentStep: 'VAN_CHECKLIST' });
                    await askNextChecklistItem(sock, senderJid, session);
                } else if (textLower === 'n' || textLower === 'no') {
                    await sock.sendMessage(senderJid, { text: "Session cancelled." });
                    sessionManager.clearSession(senderJid);
                } else {
                    await sock.sendMessage(senderJid, { text: "Please reply with *Y* to confirm or *N* to cancel." });
                }
                break;

            // ── STEP 4: Checklist ─────────────────────────────────────────
            case 'VAN_CHECKLIST':
                if (session.awaitingFaultDescription) {
                    // Current text is the fault description
                    session.checklistResults.push({
                        item: session.currentFaultItem,
                        status: 'FAULT',
                        fault_description: text
                    });
                    session.checklistIndex++;
                    session.awaitingFaultDescription = false;
                    session.currentFaultItem = null;
                    sessionManager.updateSession(senderJid, session);
                    await askNextChecklistItem(sock, senderJid, session);
                } else {
                    if (textLower === 'y' || textLower === 'yes') {
                        session.checklistResults.push({
                            item: checklistItems[session.checklistIndex],
                            status: 'OK',
                            fault_description: null
                        });
                        session.checklistIndex++;
                        sessionManager.updateSession(senderJid, session);
                        await askNextChecklistItem(sock, senderJid, session);
                    } else if (textLower === 'n' || textLower === 'no') {
                        session.awaitingFaultDescription = true;
                        session.currentFaultItem = checklistItems[session.checklistIndex];
                        sessionManager.updateSession(senderJid, session);
                        await sock.sendMessage(senderJid, { text: "Please describe the fault:" });
                    } else {
                        await sock.sendMessage(senderJid, { text: "Please reply with *Y*, *N*, or *cancel*." });
                        const curItem = checklistItems[session.checklistIndex];
                        await sock.sendMessage(senderJid, { text: `${curItem} in good condition? Reply *Y* for yes or *N* for no, or *cancel* to end the session.` });
                    }
                }
                break;

            // ── STEP 5: Additional Comments ───────────────────────────────
            case 'VAN_AWAIT_COMMENTS': {
                const finalComments = textLower === 'none' ? '' : text;
                sessionManager.updateSession(senderJid, {
                    comments:    finalComments,
                    currentStep: 'VAN_AWAIT_DRIVER_ID'
                });
                await sock.sendMessage(senderJid, { text: "Please enter the Driver ID for this vehicle." });
                break;
            }

            // ── STEP 6: Collect Driver ID & Save ──────────────────────────
            case 'VAN_AWAIT_DRIVER_ID': {
                const driver = await db.getDriverById(text.trim());
                if (!driver) {
                    await sock.sendMessage(senderJid, { text: "Sorry, we could not find a driver with that ID. Please enter the Driver ID again." });
                } else {
                    sessionManager.updateSession(senderJid, {
                        driverID:   text.trim(),
                        driverName: driver.name,
                        branch:     driver.branch
                    });

                    const finalSession = sessionManager.getSession(senderJid);

                    try {
                        if (finalSession.isEditing) {
                            // UPDATE
                            await db.updateReport(finalSession.editingReportId, 'van', {
                                checklist: finalSession.checklistResults,
                                comments:  finalSession.comments
                            });
                            await reportHelper.sendReportToGroup(sock, { ...finalSession, isEdited: true });
                            await sock.sendMessage(senderJid, { text: "Report updated successfully. ✅" });
                        } else {
                            // INSERT
                            const reportData = {
                                driverId:    finalSession.driverID,
                                inspectorId: finalSession.inspectorID,
                                vehicleReg:  finalSession.vehicleReg,
                                checklist:   finalSession.checklistResults,
                                comments:    finalSession.comments,
                                reporterJid: senderJid
                            };
                            await db.saveInspectionReport(reportData);
                            await reportHelper.sendReportToGroup(sock, finalSession);
                            await sock.sendMessage(senderJid, { text: "Report submitted successfully. Have a safe trip! 🚗" });
                        }
                    } catch (err) {
                        console.error("Failed to save/update report:", err);
                        await sock.sendMessage(senderJid, { text: "An error occurred while saving your report. Please contact an administrator." });
                    }

                    sessionManager.clearSession(senderJid);
                }
                break;
            }

            default:
                sessionManager.clearSession(senderJid);
                break;
        }
    } catch (err) {
        console.error("Error processing van message:", err);
        await sock.sendMessage(senderJid, { text: "An internal error occurred. Please try again later." });
        sessionManager.clearSession(senderJid);
    }
}

/**
 * Helper to orchestrate checklist flow
 */
async function askNextChecklistItem(sock, jid, session) {
    if (session.checklistIndex < checklistItems.length) {
        const item = checklistItems[session.checklistIndex];
        const prefix = session.isEditing ? "(Editing) " : "";
        const msg = `${prefix}${item} in good condition? Reply *Y* for yes or *N* for no, or *cancel* to end the session.`;
        await sock.sendMessage(jid, { text: msg });
    } else {
        // Checklist complete — ask for comments
        sessionManager.updateSession(jid, { currentStep: 'VAN_AWAIT_COMMENTS' });
        await sock.sendMessage(jid, { text: "Please enter any additional comments, or reply *none*." });
    }
}

module.exports = {
    handleVanMessage
};
