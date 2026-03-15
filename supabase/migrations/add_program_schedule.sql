-- Program schedule: start/end time and available days per program
ALTER TABLE programs ADD COLUMN IF NOT EXISTS schedule_start_time TIME;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS schedule_end_time TIME;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS schedule_days TEXT[] DEFAULT '{}';
