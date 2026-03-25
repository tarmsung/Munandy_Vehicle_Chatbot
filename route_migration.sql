-- =========================================================
-- Route Reporting Flow — Database Migration
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/kviqyqmbbemsagstefmo/sql
-- =========================================================


-- =========================================================
-- 1. ADD MISSING COLUMNS TO VEHICLES TABLE
-- =========================================================

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS nickname  TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS branch    TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;


-- =========================================================
-- 2. CREATE ROUTE REPORTERS TABLE
-- Stores phone numbers authorized to submit route reports
-- =========================================================

CREATE TABLE IF NOT EXISTS route_reporters (
    driver_id    TEXT NOT NULL,
    phone_number TEXT UNIQUE NOT NULL,  -- WhatsApp JID or bare phone number
    name         TEXT NOT NULL
);


-- =========================================================
-- 3. CREATE ROUTE REPORTS TABLE
-- Stores submitted route reports as JSONB
-- =========================================================

CREATE TABLE IF NOT EXISTS route_reports (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id      TEXT NOT NULL,
    submitted_at   TIMESTAMP DEFAULT NOW(),
    vehicle_routes JSONB NOT NULL
);


-- =========================================================
-- 4. ADD DISTANCE TO ROUTES TABLE
-- =========================================================

ALTER TABLE routes ADD COLUMN IF NOT EXISTS distance_km NUMERIC(7,2);

-- Update distances per route (fill in actual values in km)
-- Example:
-- UPDATE routes SET distance_km = 45.5 WHERE id = '3';


-- =========================================================
-- 5. POPULATE route_reporters
-- =========================================================

INSERT INTO route_reporters (driver_id, phone_number, name)
VALUES ('386287', '263772888646', 'Nyarai Chiwade')
ON CONFLICT (phone_number) DO NOTHING;


-- =========================================================
-- 5. UPDATE VEHICLES WITH BRANCH + NICKNAME
-- Set the branch and nickname for each vehicle.
-- =========================================================

-- Bulawayo branch
-- UPDATE vehicles SET branch = 'Bulawayo', nickname = 'Lustavira'   WHERE registration = 'AFT4319';
-- UPDATE vehicles SET branch = 'Bulawayo', nickname = 'Yellow Container' WHERE registration = 'AGF5403';
-- UPDATE vehicles SET branch = 'Bulawayo', nickname = 'White Container' WHERE registration = 'AHF2297';
-- UPDATE vehicles SET branch = 'Bulawayo', nickname = 'MH01'        WHERE registration = 'AHF9320';

-- Harare branch
-- UPDATE vehicles SET branch = 'Harare',   nickname = 'GKL'         WHERE registration = 'ACH4184';
-- UPDATE vehicles SET branch = 'Harare',   nickname = 'Yellow Bus'  WHERE registration = 'ACU4512';
-- UPDATE vehicles SET branch = 'Harare',   nickname = 'MM01'        WHERE registration = 'AHN3602';

-- Mutare branch
-- UPDATE vehicles SET branch = 'Mutare',   nickname = 'Big Sprinter'  WHERE registration = 'AES6291';
-- UPDATE vehicles SET branch = 'Mutare',   nickname = 'Baby Sprinter' WHERE registration = 'AFX5488';
-- UPDATE vehicles SET branch = 'Mutare',   nickname = 'ZI Sprinter'   WHERE registration = 'ADI8233';
