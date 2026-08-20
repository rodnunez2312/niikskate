-- Progresión (intermediate) is ages 7–17, not 7–14.

UPDATE school_calendar_events
SET
  min_age = CASE
    WHEN min_age IS NULL OR min_age > 7 THEN 7
    ELSE min_age
  END,
  max_age = 17,
  audience_categories = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(audience_categories, ARRAY[]::text[])
        || ARRAY['kids_7_12', 'teens_13_17']::text[]
      )
    )
  ),
  title = regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(title, '7[-–]14', '7-17', 'g'),
          '7[-–]12 y 13[-–]17',
          '7-17',
          'g'
        ),
        '7[-–]12 and 13[-–]17',
        '7-17',
        'gi'
      ),
      'para 7[-–]12',
      'para 7-17',
      'g'
    ),
    'for 7[-–]12',
    'for 7-17',
    'gi'
  )
WHERE event_type IN ('class_session', 'class_individual')
  AND skill_level LIKE 'intermediate%';
