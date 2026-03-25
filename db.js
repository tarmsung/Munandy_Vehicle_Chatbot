require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Initialize the Supabase client using environment variables
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

/**
 * Look up a driver and vehicle independently.
 * Drivers can use any vehicle on any given day — no fixed assignment needed.
 * Returns the combined data or null if either is not found.
 */
async function lookupDriverAndVehicle(driverId, vehicleReg) {
    try {
        // Look up driver
        const { data: driver, error: driverError } = await supabase
            .from('drivers')
            .select('id, name, branch')
            .eq('id', driverId)
            .single();

        if (driverError || !driver) {
            console.log(`Driver not found: [${driverId}]`);
            return null;
        }

        // Look up vehicle
        const { data: vehicle, error: vehicleError } = await supabase
            .from('vehicles')
            .select('registration, make, model')
            .eq('registration', vehicleReg)
            .single();

        if (vehicleError || !vehicle) {
            console.log(`Vehicle not found: [${vehicleReg}]`);
            return null;
        }

        // Return combined result
        return {
            driver_id:     driver.id,
            driver_name:   driver.name,
            branch:        driver.branch,
            vehicle_reg:   vehicle.registration,
            vehicle_make:  vehicle.make,
            vehicle_model: vehicle.model
        };
    } catch (err) {
        console.error('Error in lookupDriverAndVehicle:', err);
        throw err;
    }
}

/**
 * Save the completed inspection report to the inspection_reports table.
 * Returns the new record's id.
 */
async function saveInspectionReport({ driverId, vehicleReg, checklist, comments, reporterJid }) {
    try {
        const { data, error } = await supabase
            .from('inspection_reports')
            .insert([{
                driver_id:            driverId,
                vehicle_registration: vehicleReg,
                submitted_at:         new Date().toISOString(),
                checklist:            checklist,  // stored as JSONB
                comments:             comments || '',
                reporter_jid:         reporterJid
            }])
            .select('id')
            .single();

        if (error) {
            console.error('Error saving inspection report:', error);
            throw error;
        }

        console.log(`Inspection report saved with id: ${data.id}`);
        return data.id;
    } catch (err) {
        console.error('Error in saveInspectionReport:', err);
        throw err;
    }
}

/**
 * Check if a phone number is authorized to submit route reports.
 * phoneNumber should be the bare number part of the JID (e.g. "263772143082")
 */
async function getRouteReporter(phoneNumber) {
    try {
        const { data, error } = await supabase
            .from('route_reporters')
            .select('driver_id, phone_number, name')
            .eq('phone_number', phoneNumber)
            .single();

        if (error || !data) return null;
        return data;
    } catch (err) {
        console.error('Error in getRouteReporter:', err);
        throw err;
    }
}

/**
 * Look up a single driver by their ID (used in Route flow auth step).
 */
async function getDriverById(driverId) {
    try {
        const { data, error } = await supabase
            .from('drivers')
            .select('id, name, branch')
            .eq('id', driverId)
            .single();

        if (error || !data) return null;
        return data;
    } catch (err) {
        console.error('Error in getDriverById:', err);
        throw err;
    }
}

/**
 * Fetch all routes sorted: Bulawayo → Harare → Mutare, then by ID ascending.
 */
async function getAllRoutes() {
    try {
        const { data, error } = await supabase
            .from('routes')
            .select('id, name, branch, distance_km')
            .order('branch', { ascending: true })
            .order('id', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error in getAllRoutes:', err);
        throw err;
    }
}

/**
 * Fetch all active vehicles sorted by branch then nickname.
 */
async function getAllActiveVehicles() {
    try {
        const { data, error } = await supabase
            .from('vehicles')
            .select('registration, nickname, make, branch')
            .eq('is_active', true)
            .order('branch', { ascending: true })
            .order('nickname', { ascending: true });

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error('Error in getAllActiveVehicles:', err);
        throw err;
    }
}

/**
 * Save a completed route report to route_reports table.
 */
async function saveRouteReport(driverId, vehicleRoutes, reporterJid) {
    try {
        const { data, error } = await supabase
            .from('route_reports')
            .insert([{
                driver_id:      driverId,
                submitted_at:   new Date().toISOString(),
                vehicle_routes: vehicleRoutes,
                reporter_jid:   reporterJid
            }])
            .select('id')
            .single();

        if (error) {
            console.error('Error saving route report:', error);
            throw error;
        }
        console.log(`Route report saved with id: ${data.id}`);
        return data.id;
    } catch (err) {
        console.error('Error in saveRouteReport:', err);
        throw err;
    }
}

/**
 * Fetch recent reports of a specific type for a specific JID.
 */
async function getRecentUserReports(jid, type, limit = 5) {
    const table = type === 'van' ? 'inspection_reports' : 'route_reports';
    try {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('reporter_jid', jid)
            .order('submitted_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (err) {
        console.error(`Error fetching recent ${type} reports:`, err);
        throw err;
    }
}

/**
 * Fetch a single report by ID.
 */
async function getReportById(id, type) {
    const table = type === 'van' ? 'inspection_reports' : 'route_reports';
    try {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .eq('id', id)
            .single();

        if (error) return null;
        return data;
    } catch (err) {
        console.error(`Error fetching ${type} report ${id}:`, err);
        throw err;
    }
}

/**
 * Update an existing report with new data and mark as edited.
 */
async function updateReport(id, type, updateData) {
    const table = type === 'van' ? 'inspection_reports' : 'route_reports';
    try {
        const payload = {
            ...updateData,
            is_edited: true,
            edited_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from(table)
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    } catch (err) {
        console.error(`Error updating ${type} report ${id}:`, err);
        throw err;
    }
}

module.exports = {
    supabase,
    lookupDriverAndVehicle,
    saveInspectionReport,
    // Route flow helpers
    getRouteReporter,
    getDriverById,
    getAllRoutes,
    getAllActiveVehicles,
    saveRouteReport,
    // Edit flow helpers
    getRecentUserReports,
    getReportById,
    updateReport
};
