-- Morning weekend slot (7:00–8:30 AM) + recurring program grouping + fixed capacity cap.

ALTER TYPE time_slot ADD VALUE IF NOT EXISTS 'morning';
ALTER TYPE day_of_week ADD VALUE IF NOT EXISTS 'sunday';

ALTER TABLE school_calendar_events
  ADD COLUMN IF NOT EXISTS program_series_id UUID,
  ADD COLUMN IF NOT EXISTS max_capacity_override INTEGER
    CHECK (max_capacity_override IS NULL OR (max_capacity_override >= 1 AND max_capacity_override <= 99));

COMMENT ON COLUMN school_calendar_events.program_series_id IS 'Groups sessions from one recurring program (e.g. monthly 8-class pack).';
COMMENT ON COLUMN school_calendar_events.max_capacity_override IS 'When set, caps enrollment (e.g. 6 skaters max per session).';

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_time_slot_check;
ALTER TABLE school_calendar_events ADD CONSTRAINT school_calendar_events_time_slot_check
  CHECK (time_slot IS NULL OR time_slot IN ('monday', 'morning', 'early', 'late'));

CREATE INDEX IF NOT EXISTS idx_school_calendar_program_series
  ON school_calendar_events(program_series_id)
  WHERE program_series_id IS NOT NULL;
