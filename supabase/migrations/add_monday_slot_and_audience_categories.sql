-- Monday 4:30–6:00 PM slot + audience categories for bookable classes.

ALTER TYPE time_slot ADD VALUE IF NOT EXISTS 'monday';
ALTER TYPE day_of_week ADD VALUE IF NOT EXISTS 'monday';

ALTER TABLE school_calendar_events
  ADD COLUMN IF NOT EXISTS audience_category TEXT;

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_time_slot_check;
ALTER TABLE school_calendar_events ADD CONSTRAINT school_calendar_events_time_slot_check
  CHECK (time_slot IS NULL OR time_slot IN ('monday', 'early', 'late'));

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_audience_category_check;
ALTER TABLE school_calendar_events ADD CONSTRAINT school_calendar_events_audience_category_check
  CHECK (
    audience_category IS NULL
    OR audience_category IN (
      'tots_3_5',
      'principiantes_6_12',
      'principiantes_13_17',
      'intermedios_under_12',
      'intermedios_over_13',
      'adults_18_plus',
      'everyone'
    )
  );

COMMENT ON COLUMN school_calendar_events.audience_category IS 'Who the group class is for (class_session / bookable).';

-- Multi-select audience groups (run once in Supabase SQL Editor).
ALTER TABLE school_calendar_events
  ADD COLUMN IF NOT EXISTS audience_categories TEXT[] DEFAULT '{}';

UPDATE school_calendar_events
SET audience_categories = ARRAY[audience_category]
WHERE audience_category IS NOT NULL
  AND (audience_categories IS NULL OR audience_categories = '{}');

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_audience_categories_check;
ALTER TABLE school_calendar_events ADD CONSTRAINT school_calendar_events_audience_categories_check
  CHECK (
    audience_categories IS NULL
    OR audience_categories <@ ARRAY[
      'tots_3_5',
      'principiantes_6_12',
      'principiantes_13_17',
      'intermedios_under_12',
      'intermedios_over_13',
      'adults_18_plus',
      'everyone'
    ]::text[]
  );

COMMENT ON COLUMN school_calendar_events.audience_categories IS 'Who the event is for (one or more audience groups).';

-- Multi-select audience groups (run after audience_category column exists).
ALTER TABLE school_calendar_events
  ADD COLUMN IF NOT EXISTS audience_categories TEXT[] DEFAULT '{}';

UPDATE school_calendar_events
SET audience_categories = ARRAY[audience_category]
WHERE audience_category IS NOT NULL
  AND (audience_categories IS NULL OR audience_categories = '{}');

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_audience_categories_check;
ALTER TABLE school_calendar_events ADD CONSTRAINT school_calendar_events_audience_categories_check
  CHECK (
    audience_categories IS NULL
    OR audience_categories <@ ARRAY[
      'tots_3_5',
      'principiantes_6_12',
      'principiantes_13_17',
      'intermedios_under_12',
      'intermedios_over_13',
      'adults_18_plus',
      'everyone'
    ]::text[]
  );

COMMENT ON COLUMN school_calendar_events.audience_categories IS 'Who the event is for (one or more audience groups).';
