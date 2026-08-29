-- Repair: classes detached from their program by an in-app edit.
--
-- Cause: the admin calendar's edit form wrote `program_series_id = NULL` on every
-- update, so renaming one class of a program dropped that class out of its series.
-- The sidebar groups by `program_series_id || id`, so the detached class then showed
-- up as an extra, separate program with the new name.
--
-- The app no longer does this. Run the steps below to reattach classes that were
-- already detached. STEP 1 and 2 are read-only — nothing changes until STEP 3.

-- ---------------------------------------------------------------------------
-- STEP 1 — detached classes: bookable program rows with no series
-- ---------------------------------------------------------------------------
SELECT
  e.id,
  e.title,
  e.start_date,
  e.time_slot,
  e.season_slug,
  e.skill_level,
  e.price_mxn
FROM school_calendar_events e
WHERE e.event_type IN ('class_session', 'class_individual')
  AND e.program_series_id IS NULL
ORDER BY e.start_date;

-- ---------------------------------------------------------------------------
-- STEP 2 — likely parent series for each detached class
--
-- Matches on season + time slot + skill level and keeps series whose date range
-- brackets the detached class. Check `title_matches` and the date span to confirm
-- you picked the right series before running STEP 3.
-- ---------------------------------------------------------------------------
WITH orphans AS (
  SELECT id, title, start_date, time_slot, season_slug, skill_level
  FROM school_calendar_events
  WHERE event_type IN ('class_session', 'class_individual')
    AND program_series_id IS NULL
),
series AS (
  SELECT
    program_series_id,
    min(title) AS series_title,
    min(start_date) AS first_class,
    max(start_date) AS last_class,
    count(*) AS class_count,
    min(time_slot) AS time_slot,
    min(season_slug) AS season_slug,
    min(skill_level) AS skill_level
  FROM school_calendar_events
  WHERE program_series_id IS NOT NULL
  GROUP BY program_series_id
)
SELECT
  o.id AS detached_class_id,
  o.title AS detached_title,
  o.start_date AS detached_date,
  s.program_series_id AS candidate_series_id,
  s.series_title,
  s.class_count,
  s.first_class,
  s.last_class,
  (s.series_title = o.title) AS title_matches
FROM orphans o
JOIN series s
  ON s.season_slug IS NOT DISTINCT FROM o.season_slug
 AND s.time_slot IS NOT DISTINCT FROM o.time_slot
 AND s.skill_level IS NOT DISTINCT FROM o.skill_level
 AND o.start_date BETWEEN s.first_class - INTERVAL '14 days'
                      AND s.last_class + INTERVAL '14 days'
ORDER BY o.start_date, s.first_class;

-- ---------------------------------------------------------------------------
-- STEP 3 — reattach. Replace both UUIDs with values from STEP 2, then run.
-- ---------------------------------------------------------------------------
-- UPDATE school_calendar_events
-- SET program_series_id = '<candidate_series_id>'
-- WHERE id = '<detached_class_id>';

-- ---------------------------------------------------------------------------
-- STEP 4 — optional: if the rename was the change you wanted to keep, apply that
-- title to the whole program so every class matches.
-- ---------------------------------------------------------------------------
-- UPDATE school_calendar_events
-- SET title = '<the name you want>'
-- WHERE program_series_id = '<candidate_series_id>';

-- ---------------------------------------------------------------------------
-- STEP 5 — verify: each program should be one row with its full class count.
-- ---------------------------------------------------------------------------
SELECT
  program_series_id,
  min(title) AS title,
  count(*) AS class_count,
  min(start_date) AS first_class,
  max(start_date) AS last_class
FROM school_calendar_events
WHERE event_type IN ('class_session', 'class_individual')
GROUP BY program_series_id
ORDER BY first_class;
