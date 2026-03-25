/**
 * routeFlow.js
 * Handles all logic for the "Route Reporting" flow.
 * This is completely separate from the Van inspection flow.
 */

const db = require('./db');
const sessionManager = require('./session');
const { sendRouteReportToGroup } = require('./routeReport');

// Branch display order for the route list message
const BRANCH_ORDER = ['Bulawayo', 'Harare', 'Mutare'];

/**
 * Extract the bare phone number from a WhatsApp JID.
 * e.g. "263772143082@s.whatsapp.net" → "263772143082"
 */
function extractPhoneNumber(jid) {
    return jid.split('@')[0].split(':')[0];
}

/**
 * Build the formatted route list message from DB data.
 * Includes distance in km if available.
 */
function buildRouteListMessage(routes) {
    let msg = 'Below are the list of all routes and their IDs\n';

    for (const branch of BRANCH_ORDER) {
        const branchRoutes = routes
            .filter(r => r.branch === branch)
            .sort((a, b) => Number(a.id) - Number(b.id));

        if (branchRoutes.length === 0) continue;

        msg += `\nBranch ${branch}\n`;
        for (const r of branchRoutes) {
            const dist = r.distance_km != null ? ` (${r.distance_km} km)` : '';
            msg += `${r.id} | ${r.name}${dist}\n`;
        }
    }

    return msg.trim();
}

/**
 * Ask the bot user for the current vehicle's route(s).
 */
async function askCurrentVehicle(sock, jid, session) {
    const vehicle = session.vehicles[session.currentVehicleIndex];
    const question =
        `For *${vehicle.make} ${vehicle.nickname}* (${vehicle.registration}) at *${vehicle.branch}*, ` +
        `which route(s) did it go? (If multiple routes separate each route ID with a , (comma)\n` +
        `Reply *0* if no route today, or *cancel* to end the session.`;
    await sock.sendMessage(jid, { text: question });
}

/**
 * Main message handler for the Route flow.
 * Called from index.js whenever a session with flow='route' receives a message.
 */
async function handleRouteMessage(sock, senderJid, text, session) {
    const textLower = text.trim().toLowerCase();

    switch (session.currentStep) {

        // -------------------------------------------------------
        // STEP 1: Permission check (runs automatically, not awaiting reply)
        // This step is handled at trigger time in index.js — if we ever
        // land here via a message, skip straight to driver ID prompt.
        // -------------------------------------------------------
        case 'ROUTE_PERMISSION':
            await sock.sendMessage(senderJid, { text: 'Enter your driver ID' });
            sessionManager.updateSession(senderJid, { currentStep: 'ROUTE_AWAIT_DRIVER_ID' });
            break;

        // -------------------------------------------------------
        // STEP 2: Driver ID entry & lookup
        // -------------------------------------------------------
        case 'ROUTE_AWAIT_DRIVER_ID': {
            const driver = await db.getDriverById(text.trim());
            if (!driver) {
                await sock.sendMessage(senderJid, { text: 'Driver ID not found. Please try again.' });
                await sock.sendMessage(senderJid, { text: 'Enter your driver ID' });
                break;
            }
            // Store and ask confirmation
            sessionManager.updateSession(senderJid, {
                driverID:    driver.id,
                driverName:  driver.name,
                currentStep: 'ROUTE_AWAIT_CONFIRM'
            });
            await sock.sendMessage(senderJid, {
                text: `Driver ${driver.name}. Is this correct?\nReply *yes* to confirm or *no* to cancel.`
            });
            break;
        }

        // -------------------------------------------------------
        // STEP 3: Confirm driver identity
        // -------------------------------------------------------
        case 'ROUTE_AWAIT_CONFIRM':
            if (textLower === 'yes' || textLower === 'y') {
                // Proceed to briefing
                await sendBriefing(sock, senderJid);
                sessionManager.updateSession(senderJid, { currentStep: 'ROUTE_AWAIT_READY' });
            } else if (textLower === 'no' || textLower === 'n' || textLower === 'cancel') {
                await sock.sendMessage(senderJid, { text: 'Session cancelled.' });
                sessionManager.clearSession(senderJid);
            } else {
                await sock.sendMessage(senderJid, {
                    text: 'Please reply *yes* to confirm or *no* to cancel.'
                });
            }
            break;

        // -------------------------------------------------------
        // STEP 4: User acknowledges instructions
        // -------------------------------------------------------
        case 'ROUTE_AWAIT_READY':
            if (textLower === 'yes' || textLower === 'y') {
                // Fetch vehicles and start loop
                console.log('Fetching all active vehicles...');
                const vehicles = await db.getAllActiveVehicles();
                if (!vehicles || vehicles.length === 0) {
                    await sock.sendMessage(senderJid, { text: 'No active vehicles found. Please contact an administrator.' });
                    sessionManager.clearSession(senderJid);
                    break;
                }
                sessionManager.updateSession(senderJid, {
                    vehicles:            vehicles,
                    currentVehicleIndex: 0,
                    vehicleRoutes:       [],
                    currentStep:         'ROUTE_AWAIT_ROUTE'
                });
                // Ask first vehicle — retrieve updated session
                const updatedSession = sessionManager.getSession(senderJid);
                await askCurrentVehicle(sock, senderJid, updatedSession);
            } else if (textLower === 'cancel') {
                await sock.sendMessage(senderJid, { text: 'Session ended.' });
                sessionManager.clearSession(senderJid);
            } else {
                await sock.sendMessage(senderJid, {
                    text: 'Please reply *yes* to continue or *cancel* to cancel the session.'
                });
            }
            break;

        // -------------------------------------------------------
        // STEP 5: Route entry loop
        // -------------------------------------------------------
        case 'ROUTE_AWAIT_ROUTE': {
            if (textLower === 'cancel') {
                await sock.sendMessage(senderJid, { text: 'Session ended.' });
                sessionManager.clearSession(senderJid);
                break;
            }

            const vehicle = session.vehicles[session.currentVehicleIndex];

            if (textLower === '0') {
                // No route for this vehicle
                session.vehicleRoutes.push({
                    registration: vehicle.registration,
                    nickname:     vehicle.nickname,
                    make:         vehicle.make,
                    branch:       vehicle.branch,
                    routes:       [],
                    reported_distance_km: 0
                });
                console.log(`Vehicle ${vehicle.registration}: no route.`);
                
                // Advance to next vehicle
                session.currentVehicleIndex++;
                sessionManager.updateSession(senderJid, session);

                if (session.currentVehicleIndex < session.vehicles.length) {
                    await askCurrentVehicle(sock, senderJid, session);
                } else {
                    // All vehicles done — save and notify
                    await finalizeRouteReport(sock, senderJid, session);
                }
                break;
            } else {
                // Parse comma-separated IDs
                const rawIds = text.split(',').map(s => s.trim()).filter(Boolean);
                const allRoutes = await db.getAllRoutes();
                const routeMap  = new Map(allRoutes.map(r => [String(r.id), r]));

                const invalidIds = rawIds.filter(id => !routeMap.has(id));
                if (invalidIds.length > 0) {
                    await sock.sendMessage(senderJid, {
                        text: `Invalid route ID(s): ${invalidIds.join(', ')}. Please try again.`
                    });
                    // Re-ask same vehicle
                    await askCurrentVehicle(sock, senderJid, session);
                    break;
                }

                const resolvedRoutes = rawIds.map(id => ({
                    id,
                    name:        routeMap.get(id).name,
                    distance_km: routeMap.get(id).distance_km ?? null
                }));
                
                // Save temporarily and ask for distance
                session.tempRoutes = resolvedRoutes;
                session.currentStep = 'ROUTE_AWAIT_DISTANCE';
                sessionManager.updateSession(senderJid, session);
                
                await sock.sendMessage(senderJid, { text: `Please enter the total distance covered by this vehicle in km (e.g. 150):` });
            }
            break;
        }

        // -------------------------------------------------------
        // STEP 6: Distance entry
        // -------------------------------------------------------
        case 'ROUTE_AWAIT_DISTANCE': {
            if (textLower === 'cancel') {
                await sock.sendMessage(senderJid, { text: 'Session ended.' });
                sessionManager.clearSession(senderJid);
                break;
            }

            const distance = parseFloat(text);
            if (isNaN(distance) || distance < 0) {
                await sock.sendMessage(senderJid, { text: 'Invalid distance. Please enter a valid number (e.g. 150):' });
                break;
            }

            const vehicle = session.vehicles[session.currentVehicleIndex];
            session.vehicleRoutes.push({
                registration: vehicle.registration,
                nickname:     vehicle.nickname,
                make:         vehicle.make,
                branch:       vehicle.branch,
                routes:       session.tempRoutes,
                reported_distance_km: distance
            });
            console.log(`Vehicle ${vehicle.registration}: routes ${session.tempRoutes.map(r => r.name).join(', ')}, distance: ${distance}km`);

            session.tempRoutes = null;
            // Advance to next vehicle
            session.currentVehicleIndex++;
            sessionManager.updateSession(senderJid, session);

            if (session.currentVehicleIndex < session.vehicles.length) {
                await askCurrentVehicle(sock, senderJid, session);
            } else {
                // All vehicles done — save and notify
                await finalizeRouteReport(sock, senderJid, session);
            }
            break;
        }

        default:
            sessionManager.clearSession(senderJid);
            break;
    }
}

/**
 * Send the two briefing messages in sequence.
 */
async function sendBriefing(sock, jid) {
    console.log('Fetching routes for briefing...');
    const routes = await db.getAllRoutes();
    const routeListMsg = buildRouteListMessage(routes);

    // Message 1: route list
    await sock.sendMessage(jid, { text: routeListMsg });

    // Message 2: instructions (sent immediately after, no wait)
    const instructions =
        `Instructions\n` +
        `1. You will be asked for the routes each active vehicle took today\n\n` +
        `2. First, enter the route ID(s) (comma separated e.g. 3,7,10)\n\n` +
        `3. Next, you will be asked to enter the total distance covered in km\n\n` +
        `4. If a vehicle did not do any route, reply with 0\n\n` +
        `Reply *yes* to continue or *cancel* to cancel the session.`;
    await sock.sendMessage(jid, { text: instructions });
}

/**
 * Save report to DB and send group notification.
 */
async function finalizeRouteReport(sock, jid, session) {
    try {
        if (session.isEditing) {
            // UPDATE existing report
            await db.updateReport(session.editingReportId, 'route', {
                vehicle_routes: session.vehicleRoutes
            });
            console.log(`Route report ${session.editingReportId} UPDATED by driver ${session.driverID}`);
        } else {
            // INSERT new report
            await db.saveRouteReport(session.driverID, session.vehicleRoutes, jid);
            console.log(`Route report submitted by driver ${session.driverID}`);
        }

        await sendRouteReportToGroup(sock, {
            driverName:    session.driverName,
            vehicleRoutes: session.vehicleRoutes,
            isEdited:      session.isEditing
        });

        const successMsg = session.isEditing 
            ? 'Report updated successfully ✅' 
            : 'Report submitted successfully ✅';
        await sock.sendMessage(jid, { text: successMsg });
    } catch (err) {
        console.error('Error finalizing route report:', err);
        await sock.sendMessage(jid, {
            text: 'An error occurred while saving your report. Please contact an administrator.'
        });
    } finally {
        sessionManager.clearSession(jid);
    }
}

module.exports = { handleRouteMessage };
