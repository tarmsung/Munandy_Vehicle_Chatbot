/**
 * vanFlow.js
 * Handles all logic for the "Van Inspection" flow.
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
            case 'VAN_AWAIT_DRIVER_ID':
                sessionManager.updateSession(senderJid, { driverID: text });
                await sock.sendMessage(senderJid, { text: "Please enter your vehicle registration number." });
                sessionManager.updateSession(senderJid, { currentStep: 'VAN_AWAIT_VEHICLE_REG' });
                break;

            case 'VAN_AWAIT_VEHICLE_REG':
                sessionManager.updateSession(senderJid, { vehicleReg: text });
                
                const lookupResult = await db.lookupDriverAndVehicle(session.driverID, session.vehicleReg);
                
                if (!lookupResult) {
                    await sock.sendMessage(senderJid, { text: "Sorry, we could not find a matching driver and vehicle. Please try again." });
                    sessionManager.clearSession(senderJid);
                    // Restart
                    sessionManager.initVanSession(senderJid);
                    await sock.sendMessage(senderJid, { text: "Welcome to the Vehicle Check System. Please enter your Driver ID." });
                } else {
                    // Store DB info to session
                    sessionManager.updateSession(senderJid, {
                        driverName: lookupResult.driver_name,
                        branch: lookupResult.branch,
                        vehicleMake: lookupResult.vehicle_make,
                        vehicleModel: lookupResult.vehicle_model,
                        currentStep: 'VAN_AWAIT_CONFIRM'
                    });
                    
                    const confirmMsg = `Vehicle Details: ${lookupResult.vehicle_make} ${lookupResult.vehicle_model}\nDriver Details: ${lookupResult.driver_name} (${lookupResult.branch})\nReply *Y* to confirm or *N* to cancel.`;
                    await sock.sendMessage(senderJid, { text: confirmMsg });
                }
                break;

            case 'VAN_AWAIT_CONFIRM':
                if (textLower === 'y' || textLower === 'yes') {
                    sessionManager.updateSession(senderJid, { currentStep: 'VAN_CHECKLIST' });
                    // Ask first checklist item
                    await askNextChecklistItem(sock, senderJid, session);
                } else if (textLower === 'n' || textLower === 'no') {
                    await sock.sendMessage(senderJid, { text: "Session cancelled." });
                    sessionManager.clearSession(senderJid);
                } else {
                    await sock.sendMessage(senderJid, { text: "Please reply with Y to confirm or N to cancel." });
                }
                break;

            case 'VAN_CHECKLIST':
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
                
            case 'VAN_AWAIT_COMMENTS':
                // Store comments
                let finalComments = textLower === 'none' ? '' : text;
                sessionManager.updateSession(senderJid, { comments: finalComments });
                
                // Finalize and Save
                const finalSession = sessionManager.getSession(senderJid);
                
                try {
                    if (finalSession.isEditing) {
                        // UPDATE
                        await db.updateReport(finalSession.editingReportId, 'van', {
                            checklist: finalSession.checklistResults,
                            comments:  finalSession.comments
                        });
                        // Regenerate image with Edited label
                        await reportHelper.sendReportToGroup(sock, { ...finalSession, isEdited: true });
                        await sock.sendMessage(senderJid, { text: "Report updated successfully. ✅" });
                    } else {
                        // INSERT
                        const reportData = {
                            driverId:     finalSession.driverID,
                            vehicleReg:   finalSession.vehicleReg,
                            checklist:    finalSession.checklistResults,
                            comments:     finalSession.comments,
                            reporterJid:  senderJid
                        };
                        await db.saveInspectionReport(reportData);
                        await reportHelper.sendReportToGroup(sock, finalSession);
                        await sock.sendMessage(senderJid, { text: "Report submitted successfully. Have a safe trip! 🚗" });
                    }
                } catch (err) {
                    console.error("Failed to save/update report:", err);
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
        // Checklist complete
        sessionManager.updateSession(jid, { currentStep: 'VAN_AWAIT_COMMENTS' });
        await sock.sendMessage(jid, { text: "Please enter any additional comments, or reply *none*." });
    }
}

module.exports = {
    handleVanMessage
};
