const sessions = new Map();

// Session timeout: 30 minutes
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Valid session steps:
 * - AWAITING_DRIVER_ID
 * - AWAITING_VEHICLE_REG
 * - CONFIRM_DETAILS
 * - CHECKLIST
 * - AWAITING_COMMENTS
 */

/**
 * Get an existing session or initialize a new default one.
 */
function getSession(jid) {
    if (!sessions.has(jid)) {
        sessions.set(jid, {
            currentStep: 'AWAITING_DRIVER_ID',
            
            // Collected Data
            driverID: null,
            driverName: null,
            branch: null,
            
            vehicleReg: null,
            vehicleMake: null,
            vehicleModel: null,
            
            // Checklist State
            checklistIndex: 0,
            checklistResults: [], // Array of { item: string, status: 'OK'|'FAULT', fault_description: string|null }
            awaitingFaultDescription: false,
            currentFaultItem: null,
            
            comments: null,
            
            // Cleanup timer reference
            timeoutRef: null
        });
        resetTimeout(jid);
    }
    return sessions.get(jid);
}

/**
 * Partially update a session object.
 */
function updateSession(jid, partialData) {
    const session = getSession(jid);
    Object.assign(session, partialData);
    sessions.set(jid, session);
    resetTimeout(jid);
}

/**
 * Erase a session entirely.
 */
function clearSession(jid) {
    if (sessions.has(jid)) {
        const session = sessions.get(jid);
        if (session.timeoutRef) clearTimeout(session.timeoutRef);
        sessions.delete(jid);
    }
}

/**
 * Internal: Reset the 30-minute inactivity timer.
 */
function resetTimeout(jid) {
    const session = sessions.get(jid);
    if (!session) return;
    
    if (session.timeoutRef) {
        clearTimeout(session.timeoutRef);
    }
    
    session.timeoutRef = setTimeout(() => {
        console.log(`Session expired for JID: ${jid}`);
        clearSession(jid);
    }, SESSION_TIMEOUT_MS);
}

/**
 * Initialise a brand-new route session for a JID.
 * Clears any previous session first.
 */
function initRouteSession(jid) {
    clearSession(jid);
    const session = {
        flow: 'route',
        currentStep: 'ROUTE_PERMISSION',

        driverID:   null,
        driverName: null,

        vehicles:             [],   // All active vehicles fetched from DB
        currentVehicleIndex:  0,
        tempRoutes:           null, // Used during ROUTE_AWAIT_DISTANCE step
        vehicleRoutes:        [],   // Accumulated results

        awaitingRetry: false,       // True when re-asking same vehicle

        // Cleanup timer
        timeoutRef: null
    };
    sessions.set(jid, session);
    resetTimeout(jid);
    return session;
}

module.exports = {
    getSession,
    updateSession,
    clearSession,
    initRouteSession
};
