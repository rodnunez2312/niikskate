-- Allow new age-band audience IDs (Age + Skill model).
-- Keeps legacy IDs so existing calendar rows still validate.

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_audience_category_check;
ALTER TABLE school_calendar_events ADD CONSTRAINT school_calendar_events_audience_category_check
  CHECK (
    audience_category IS NULL
    OR audience_category IN (
      'tots_5_7',
      'kids_7_12',
      'teens_13_17',
      'adults_18_plus',
      'everyone',
      'tots_3_5',
      'principiantes_6_12',
      'principiantes_13_17',
      'intermedios_under_12',
      'intermedios_over_13'
    )
  );

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_audience_categories_check;
ALTER TABLE school_calendar_events ADD CONSTRAINT school_calendar_events_audience_categories_check
  CHECK (
    audience_categories IS NULL
    OR audience_categories <@ ARRAY[
      'tots_5_7',
      'kids_7_12',
      'teens_13_17',
      'adults_18_plus',
      'everyone',
      'tots_3_5',
      'principiantes_6_12',
      'principiantes_13_17',
      'intermedios_under_12',
      'intermedios_over_13'
    ]::text[]
  );

COMMENT ON COLUMN school_calendar_events.audience_category IS
  'Age band: tots_5_7 | kids_7_12 | teens_13_17 | adults_18_plus (skill is skill_level).';
COMMENT ON COLUMN school_calendar_events.audience_categories IS
  'One or more age bands for the class session.';
