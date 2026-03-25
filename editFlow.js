/**
 * editFlow.js
 * Handles the logic for editing previously submitted reports.
 */

const db = require('./db');
const sessionManager = require('./session');
const { handleRouteMessage } = require('./routeFlow');
const reportHelper = require('./report');
const { sendRouteReportToGroup } = require('./routeReport');

/**
 * Main dispatcher for the Edit flow.
 */
async function handleEditMessage(sock, senderJid, text, session) {
    const textLower = text.trim().toLowerCase();
    if (textLower === 'cancel') {
        await sock.sendMessage(senderJid, { text: 'Edit session cancelled.' });
        sessionManager.clearSession(senderJid);
        return;
    }

    switch (session.currentStep) {
        // -------------------------------------------------------
        // STEP 1: Select Type (Van vs Route)
        // -------------------------------------------------------
        case 'EDIT_SELECT_TYPE': {
            let type;
            if (text === '1') type = 'van';
            else if (text === '2') type = 'route';
            else {
                await sock.sendMessage(senderJid, { text: 'Invalid selection. Please reply with 1 for Van or 2 for Route.' });
                return;
            }

            const reports = await db.getRecentUserReports(senderJid, type);
            if (!reports || reports.length === 0) {
                await sock.sendMessage(senderJid, { text: `We couldn't find any recent ${type} reports submitted by you.` });
                sessionManager.clearSession(senderJid);
                return;
            }

            session.editType = type;
            session.recentReports = reports;
            session.currentStep = 'EDIT_SELECT_REPORT';
            sessionManager.updateSession(senderJid, session);

            let msg = `Select the report you want to edit:\n\n`;
            reports.forEach((r, i) => {
                const date = new Date(r.submitted_at).toLocaleString();
                const detail = type === 'van' ? r.vehicle_registration : 'Route Report';
                msg += `${i + 1}. ${date} - ${detail}\n`;
            });
            msg += `\nReply with the number or *cancel*.`;
            await sock.sendMessage(senderJid, { text: msg });
            break;
        }

        // -------------------------------------------------------
        // STEP 2: Select specific report
        // -------------------------------------------------------
        case 'EDIT_SELECT_REPORT': {
            const index = parseInt(text) - 1;
            if (isNaN(index) || index < 0 || index >= session.recentReports.length) {
                await sock.sendMessage(senderJid, { text: `Invalid selection. Please enter a number between 1 and ${session.recentReports.length}.` });
                return;
            }

            const chosen = session.recentReports[index];
            session.editingReportId = chosen.id;
            
            if (session.editType === 'van') {
                session.currentStep = 'EDIT_VAN_FIELD_SELECT';
                await sock.sendMessage(senderJid, { text: "What would you like to edit?\n1. Entire Checklist\n2. Additional Comments\n\nReply with the number." });
            } else {
                session.currentStep = 'EDIT_ROUTE_START';
                await sock.sendMessage(senderJid, { text: "You are now editing this Route Report. You will be asked to re-enter the routes and distances for all vehicles.\n\nReply *ok* to start." });
            }
            sessionManager.updateSession(senderJid, session);
            break;
        }

        // -------------------------------------------------------
        // VAN EDIT SUB-FLOW
        // -------------------------------------------------------
        case 'EDIT_VAN_FIELD_SELECT': {
            if (text === '1') {
                // Re-run full checklist
                // We'll reset the session to look like a Van flow but with isEditing flag
                session.currentStep = 'CHECKLIST';
                session.checklistIndex = 0;
                session.checklistResults = [];
                session.awaitingFaultDescription = false;
                session.isEditing = true;
                sessionManager.updateSession(senderJid, session);

                await sock.sendMessage(senderJid, { text: "(Editing) Let's re-run the checklist. Oil level in good condition? Reply Y/N." });
            } else if (text === '2') {
                session.currentStep = 'EDIT_VAN_COMMENTS';
                await sock.sendMessage(senderJid, { text: "Please enter the corrected comments:" });
            } else {
                await sock.sendMessage(senderJid, { text: "Invalid choice. Reply 1 or 2." });
            }
            sessionManager.updateSession(senderJid, session);
            break;
        }

        case 'EDIT_VAN_COMMENTS': {
            const report = await db.getReportById(session.editingReportId, 'van');
            const updated = await db.updateReport(session.editingReportId, 'van', { comments: text });
            
            // Regenerate image and notify group
            const fullSession = {
                driverName:   updated.driver_id, // We'd need to look up name for better display
                vehicleReg:   updated.vehicle_registration,
                checklistResults: updated.checklist,
                comments:     updated.comments,
                branch:       'Updated', // Placeholder
                is_edited:    true
            };
            // NOTE: reportHelper needs update to show "EDITED" label
            await reportHelper.sendReportToGroup(sock, fullSession);
            
            await sock.sendMessage(senderJid, { text: "Comments updated successfully and group notified. ✅" });
            sessionManager.clearSession(senderJid);
            break;
        }

        // -------------------------------------------------------
        // ROUTE EDIT SUB-FLOW
        // -------------------------------------------------------
        case 'EDIT_ROUTE_START': {
            if (textLower === 'ok') {
                // Initialize a route-like session inside the edit session
                // We'll reuse handleRouteMessage by changing the flow type temporarily
                const activeVehicles = await db.getAllActiveVehicles();
                session.flow = 'route';
                session.currentStep = 'ROUTE_AWAIT_ROUTE';
                session.vehicles = activeVehicles;
                session.currentVehicleIndex = 0;
                session.vehicleRoutes = [];
                session.isEditing = true; // Flag for finalization
                
                sessionManager.updateSession(senderJid, session);
                
                // Trigger the first route question
                const vehicle = activeVehicles[0];
                await sock.sendMessage(senderJid, { text: `(Editing) For *${vehicle.make} ${vehicle.nickname}*... which route(s)?` });
            } else {
                await sock.sendMessage(senderJid, { text: "Reply *ok* to start editing." });
            }
            break;
        }

        default:
            sessionManager.clearSession(senderJid);
            break;
    }
}

module.exports = { handleEditMessage };
