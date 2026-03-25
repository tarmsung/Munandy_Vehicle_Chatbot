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
    id     TEXT PRIMARY KEY,
    name   TEXT NOT NULL,
    branch TEXT NOT NULL
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

INSERT INTO routes (id, name, branch) VALUES
-- Bulawayo
('53', 'Mberengwa', 'Bulawayo'),
('52', 'Filabusi', 'Bulawayo'),
('50', 'Amazon', 'Bulawayo'),
('49', 'Mavaveni', 'Bulawayo'),
('35', 'Makhaya', 'Bulawayo'),
('34', 'Town Byo', 'Bulawayo'),
('33', 'Pumula', 'Bulawayo'),
('32', 'Cowdry', 'Bulawayo'),
('31', 'Mzilikazi', 'Bulawayo'),
('30', 'Mpopoma', 'Bulawayo'),
('29', 'Fairbridge', 'Bulawayo'),
('28', 'Plumtree', 'Bulawayo'),
('27', 'Inyathi', 'Bulawayo'),
('26', 'Fortrixon', 'Bulawayo'),
('25', 'Gwanda', 'Bulawayo'),
('24', 'Zvishavane', 'Bulawayo'),
-- Harare
('47', 'Showground', 'Harare'),
('46', 'Mission MH', 'Harare'),
('23', 'Town Hre', 'Harare'),
('22', 'Chisipite', 'Harare'),
('21', 'Town + Chisipite', 'Harare'),
('20', 'Gazaland', 'Harare'),
('19', 'Murewa', 'Harare'),
('18', '4th Rank', 'Harare'),
('17', 'Dz', 'Harare'),
('16', 'Hatcliffe', 'Harare'),
('15', 'Epworth', 'Harare'),
('14', 'Mbare', 'Harare'),
('13', 'Mabvuku', 'Harare'),
('12', 'Domboshava', 'Harare'),
('11', 'Whitehouse', 'Harare'),
('10', 'Norton', 'Harare'),
('9', 'Chitungwiza', 'Harare'),
('8', 'Ruwa', 'Harare'),
('7', 'Chinhoyi', 'Harare'),
('6', 'Kadoma', 'Harare'),
('5', 'Macheke', 'Harare'),
('4', 'Marondera', 'Harare'),
('3', 'Snacks Marondera', 'Harare'),
-- Mutare
('48', 'Odzi', 'Mutare'),
('45', 'Muchena', 'Mutare'),
('44', 'Sakubva Musika', 'Mutare'),
('43', 'Sakubva', 'Mutare'),
('42', 'Town Mtre', 'Mutare'),
('41', 'Dangamvura', 'Mutare'),
('40', 'Headlands', 'Mutare'),
('39', 'Rusape', 'Mutare'),
('38', 'Nyanga', 'Mutare'),
('37', 'Birchenough', 'Mutare'),
('36', 'Penhalonga', 'Mutare')
ON CONFLICT (id) DO NOTHING;


