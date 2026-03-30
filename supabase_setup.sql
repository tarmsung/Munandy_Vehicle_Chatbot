-- =========================================================
-- Munandy Fleet - Supabase Setup SQL
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/kviqyqmbbemsagstefmo/sql
-- =========================================================


-- =========================================================
-- 1. CREATE TABLES
-- =========================================================

CREATE TABLE IF NOT EXISTS vehicles (
    registration TEXT PRIMARY KEY,
    make         TEXT NOT NULL,
    model        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drivers (
    id     TEXT PRIMARY KEY,   -- This is the unique_id drivers type into the bot
    name   TEXT NOT NULL,
    branch TEXT NOT NULL
);

-- No driver_vehicle table needed:
-- Drivers pick any available vehicle each day.

CREATE TABLE IF NOT EXISTS routes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    branch      TEXT NOT NULL,
    distance_km NUMERIC(7,2)
);

CREATE TABLE IF NOT EXISTS inspection_reports (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id            TEXT NOT NULL,
    vehicle_registration TEXT NOT NULL,
    submitted_at         TIMESTAMP NOT NULL DEFAULT NOW(),
    checklist            JSONB NOT NULL,
    comments             TEXT
);


-- =========================================================
-- 2. INSERT VEHICLES (from vehicle.sql)
-- Note: number_plate is used as registration key
-- =========================================================

INSERT INTO vehicles (registration, make, model) VALUES
('AES6291', 'Mercedes Benz', 'Panel Van'),
('AFX5488', 'Mercedes Benz', 'Micro Bus'),
('ACH4184', 'Toyota',        'Hiace'),
('ACU4512', 'Mercedes Benz', 'Panel Van'),
('ADI8233', 'Mercedes Benz', 'Sprinter'),
('AFT4319', 'Nissan',        'Vanet'),
('AGF5403', 'Hino',          'Dyna'),
('AHF2297', 'Mitsubishi',    'Canter'),
('AHN3602', 'Toyota',        'Dyna'),
('AHF9320', 'Hino',          'Dutro')
ON CONFLICT (registration) DO NOTHING;


-- =========================================================
-- 3. INSERT DRIVERS (from driver.sql)
-- unique_id is used as login ID in the bot
-- branch_id: 1=Harare, 2=Bulawayo, 3=Mutare (update if different)
-- =========================================================

INSERT INTO drivers (id, name, branch) VALUES
('617859', 'Romeo Kunyerezera',   'Mutare'),
('317810', 'Nickson Takunyai',    'Mutare'),
('535473', 'Tendai Magamu',       'Bulawayo'),
('723938', 'Tadiwa Muronda',      'Bulawayo'),
('113272', 'Prince Nyahwema',     'Bulawayo'),
('994544', 'Tinaye Magorimbo',    'Harare'),
('932907', 'Tinashe Chipfupi',    'Harare'),
('680904', 'Theophilus Chiwade',  'Harare'),
('505800', 'Trust Chaponda',      'Harare'),
('386287', 'Nyarai Chiwade',      'Harare')
ON CONFLICT (id) DO NOTHING;


-- =========================================================
-- 4. INSERT ROUTES
-- =========================================================

INSERT INTO routes (id, name, branch, distance_km) VALUES
-- Bulawayo
('53', 'Mberengwa', 'Bulawayo', 200.00),
('52', 'Filabusi', 'Bulawayo', 200.00),
('50', 'Amazon', 'Bulawayo', 85.00),
('49', 'Mavaveni', 'Bulawayo', 70.00),
('35', 'Makhaya', 'Bulawayo', 334.00),
('34', 'Town Byo', 'Bulawayo', 66.00),
('33', 'Pumula', 'Bulawayo', 66.00),
('32', 'Cowdry', 'Bulawayo', 80.00),
('31', 'Mzilikazi', 'Bulawayo', 62.00),
('30', 'Mpopoma', 'Bulawayo', 70.00),
('29', 'Fairbridge', 'Bulawayo', 80.00),
('28', 'Plumtree', 'Bulawayo', 238.00),
('27', 'Inyathi', 'Bulawayo', 166.00),
('26', 'Fortrixon', 'Bulawayo', 306.00),
('25', 'Gwanda', 'Bulawayo', 264.00),
('24', 'Zvishavane', 'Bulawayo', 406.00),
-- Harare
('54', 'Hwedza', 'Harare', 331.00),
('47', 'Showground', 'Harare', 7.00),
('46', 'Mission MH', 'Harare', 50.00),
('23', 'Town Hre', 'Harare', 50.00),
('22', 'Chisipite', 'Harare', 60.00),
('21', 'Town + Chisipite', 'Harare', 100.00),
('20', 'Gazaland', 'Harare', 53.00),
('19', 'Murewa', 'Harare', 180.00),
('18', '4th Rank', 'Harare', 2.00),
('17', 'Dz', 'Harare', 65.00),
('16', 'Hatcliffe', 'Harare', 72.00),
('15', 'Epworth', 'Harare', 70.00),
('14', 'Mbare', 'Harare', 20.00),
('13', 'Mabvuku', 'Harare', 66.00),
('12', 'Domboshava', 'Harare', 110.00),
('11', 'Whitehouse', 'Harare', 60.00),
('10', 'Norton', 'Harare', 100.00),
('9', 'Chitungwiza', 'Harare', 110.00),
('8', 'Ruwa', 'Harare', 165.00),
('7', 'Chinhoyi', 'Harare', 293.00),
('6', 'Kadoma', 'Harare', 391.00),
('5', 'Macheke', 'Harare', 264.00),
('4', 'Marondera', 'Harare', 190.00),
('3', 'Snacks Marondera', 'Harare', 170.00),
-- Mutare
('48', 'Odzi', 'Mutare', 95.00),
('45', 'Muchena', 'Mutare', 80.00),
('44', 'Sakubva Musika', 'Mutare', 10.00),
('43', 'Sakubva', 'Mutare', 21.00),
('42', 'Town Mtre', 'Mutare', 36.00),
('41', 'Dangamvura', 'Mutare', 33.00),
('40', 'Headlands', 'Mutare', 299.00),
('39', 'Rusape', 'Mutare', 190.00),
('38', 'Nyanga', 'Mutare', 190.00),
('37', 'Birchenough', 'Mutare', 302.00),
('36', 'Penhalonga', 'Mutare', 76.00)
ON CONFLICT (id) DO NOTHING;


