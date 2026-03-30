-- =========================================================
-- Update Route Distances
-- Use this script to update an EXISTING database with the latest distances.
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/kviqyqmbbemsagstefmo/sql
-- =========================================================

-- 1. Ensure the column exists
ALTER TABLE routes ADD COLUMN IF NOT EXISTS distance_km NUMERIC(7,2);

-- 2. Insert missing routes
INSERT INTO routes (id, name, branch, distance_km) VALUES
('54', 'Hwedza', 'Harare', 331.00)
ON CONFLICT (id) DO UPDATE SET distance_km = EXCLUDED.distance_km;

-- 3. Update existing distances
UPDATE routes SET distance_km = 170.00 WHERE id = '3';
UPDATE routes SET distance_km = 190.00 WHERE id = '4';
UPDATE routes SET distance_km = 264.00 WHERE id = '5';
UPDATE routes SET distance_km = 391.00 WHERE id = '6';
UPDATE routes SET distance_km = 293.00 WHERE id = '7';
UPDATE routes SET distance_km = 165.00 WHERE id = '8';
UPDATE routes SET distance_km = 110.00 WHERE id = '9';
UPDATE routes SET distance_km = 100.00 WHERE id = '10';
UPDATE routes SET distance_km = 60.00  WHERE id = '11';
UPDATE routes SET distance_km = 110.00 WHERE id = '12';
UPDATE routes SET distance_km = 66.00  WHERE id = '13';
UPDATE routes SET distance_km = 20.00  WHERE id = '14';
UPDATE routes SET distance_km = 70.00  WHERE id = '15';
UPDATE routes SET distance_km = 72.00  WHERE id = '16';
UPDATE routes SET distance_km = 65.00  WHERE id = '17';
UPDATE routes SET distance_km = 2.00   WHERE id = '18';
UPDATE routes SET distance_km = 180.00 WHERE id = '19';
UPDATE routes SET distance_km = 53.00  WHERE id = '20';
UPDATE routes SET distance_km = 100.00 WHERE id = '21';
UPDATE routes SET distance_km = 60.00  WHERE id = '22';
UPDATE routes SET distance_km = 50.00  WHERE id = '23';
UPDATE routes SET distance_km = 406.00 WHERE id = '24';
UPDATE routes SET distance_km = 264.00 WHERE id = '25';
UPDATE routes SET distance_km = 306.00 WHERE id = '26';
UPDATE routes SET distance_km = 166.00 WHERE id = '27';
UPDATE routes SET distance_km = 238.00 WHERE id = '28';
UPDATE routes SET distance_km = 80.00  WHERE id = '29';
UPDATE routes SET distance_km = 70.00  WHERE id = '30';
UPDATE routes SET distance_km = 62.00  WHERE id = '31';
UPDATE routes SET distance_km = 80.00  WHERE id = '32';
UPDATE routes SET distance_km = 66.00  WHERE id = '33';
UPDATE routes SET distance_km = 66.00  WHERE id = '34';
UPDATE routes SET distance_km = 334.00 WHERE id = '35';
UPDATE routes SET distance_km = 76.00  WHERE id = '36';
UPDATE routes SET distance_km = 302.00 WHERE id = '37';
UPDATE routes SET distance_km = 190.00 WHERE id = '38';
UPDATE routes SET distance_km = 190.00 WHERE id = '39';
UPDATE routes SET distance_km = 299.00 WHERE id = '40';
UPDATE routes SET distance_km = 33.00  WHERE id = '41';
UPDATE routes SET distance_km = 36.00  WHERE id = '42';
UPDATE routes SET distance_km = 21.00  WHERE id = '43';
UPDATE routes SET distance_km = 10.00  WHERE id = '44';
UPDATE routes SET distance_km = 80.00  WHERE id = '45';
UPDATE routes SET distance_km = 50.00  WHERE id = '46';
UPDATE routes SET distance_km = 7.00   WHERE id = '47';
UPDATE routes SET distance_km = 95.00  WHERE id = '48';
UPDATE routes SET distance_km = 70.00  WHERE id = '49';
UPDATE routes SET distance_km = 85.00  WHERE id = '50';
-- 51 is missing
UPDATE routes SET distance_km = 200.00 WHERE id = '52';
UPDATE routes SET distance_km = 200.00 WHERE id = '53';
UPDATE routes SET distance_km = 331.00 WHERE id = '54';
