-- Curso de verano daytime block: 9:00 AM – 1:00 PM.

ALTER TYPE time_slot ADD VALUE IF NOT EXISTS 'summer';

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_time_slot_check;
ALTER TABLE school_calendar_events ADD CONSTRAINT school_calendar_events_time_slot_check
  CHECK (time_slot IS NULL OR time_slot IN ('monday', 'morning', 'early', 'late', 'summer'));
