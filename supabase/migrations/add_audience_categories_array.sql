-- Multi-select audience groups per calendar event.

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
