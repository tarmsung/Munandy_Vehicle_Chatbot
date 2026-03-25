-- =========================================================
-- Report Editing Support — Database Migration
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/kviqyqmbbemsagstefmo/sql
-- =========================================================

-- 1. Update inspection_reports
ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS reporter_jid TEXT;
ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;

-- 2. Update route_reports
ALTER TABLE route_reports ADD COLUMN IF NOT EXISTS reporter_jid TEXT;
ALTER TABLE route_reports ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT false;
ALTER TABLE route_reports ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP;

-- 3. (Optional) Backfill existing reports with a placeholder if needed
-- UPDATE inspection_reports SET reporter_jid = 'unknown' WHERE reporter_jid IS NULL;
-- UPDATE route_reports SET reporter_jid = 'unknown' WHERE reporter_jid IS NULL;
