-- =============================================================================
-- VERIFY KANBAN / PATINADORES SCHEMA (read-only — safe anytime)
-- Run in Supabase SQL Editor. Check the Results tabs.
-- =============================================================================

-- A) Does profiles.skill_group_id exist?
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'profiles'
        AND column_name = 'skill_group_id'
    ) THEN 'OK — profiles.skill_group_id exists'
    ELSE 'MISSING — run ensure_kanban_profile_columns.sql'
  END AS skill_group_id_status;

-- B) Other Kanban-related columns on profiles
SELECT
  column_name,
  data_type,
  CASE WHEN column_name IS NOT NULL THEN 'exists' ELSE 'missing' END AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN (
    'skill_group_id',
    'skater_schedule',
    'guardian_user_id',
    'skill_level',
    'stance',
    'rating_fundamentals'
  )
ORDER BY column_name;

-- C) skill_groups table + Level 1–5 rows
SELECT
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'skill_groups'
    ) THEN 'OK — skill_groups table exists'
    ELSE 'MISSING — run add_skill_groups_structure.sql first'
  END AS skill_groups_table;

SELECT id, name, sort_order, is_active
FROM skill_groups
WHERE is_active IS DISTINCT FROM false
ORDER BY sort_order, name;

-- C2) Flag duplicate names (should return 0 rows after cleanup_duplicate_skill_groups.sql)
SELECT name, COUNT(*) AS duplicates
FROM skill_groups
WHERE is_active IS DISTINCT FROM false
GROUP BY name
HAVING COUNT(*) > 1;

-- D) How many skaters per program level (only if skill_group_id exists)
DO $$
DECLARE
  r RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'skill_group_id'
  ) THEN
    RAISE NOTICE 'SKIP query D: profiles.skill_group_id missing — run ensure_kanban_profile_columns.sql';
    RETURN;
  END IF;

  RAISE NOTICE 'Skaters per program level:';
  FOR r IN
    EXECUTE $q$
      SELECT
        COALESCE(sg.name, '(sin programa)') AS program_level,
        COUNT(p.id)::bigint AS skaters
      FROM profiles p
      LEFT JOIN skill_groups sg ON sg.id = p.skill_group_id
      WHERE p.role = 'customer'
      GROUP BY sg.name
      ORDER BY 1
    $q$
  LOOP
    RAISE NOTICE '  % → % skaters', r.program_level, r.skaters;
  END LOOP;
END $$;
