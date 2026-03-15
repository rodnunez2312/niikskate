-- =============================================================================
-- INSPECT CURRENT SETUP (READ-ONLY — safe to run anytime)
-- =============================================================================
-- Run this in Supabase SQL Editor to see what your database has right now.
-- It does NOT create, alter, or delete anything. Use the output to decide
-- which migrations you still need to run.
-- =============================================================================

-- 1) List all tables in public schema (name and approximate row count)
SELECT
  'TABLE' AS kind,
  schemaname AS schema_name,
  relname AS name,
  n_live_tup::bigint AS row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;

-- 2) Columns for key app tables (so you can see if a migration was already applied)
SELECT
  table_schema,
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles',
    'programs',
    'skill_groups',
    'skill_areas',
    'skill_subgroups',
    'skills_library',
    'emergency_contacts',
    'student_evaluations',
    'class_reservations',
    'attendance_confirmed',
    'attendance_report_sent'
  )
ORDER BY table_name, ordinal_position;

-- 3) Which key tables exist (and row count from stats — no direct read of app tables)
WITH wanted(tab) AS (
  SELECT unnest(ARRAY[
    'profiles','programs','program_coaches','program_students',
    'skills_library','skill_groups','skill_areas','skill_subgroups',
    'emergency_contacts','student_evaluations','class_reservations',
    'attendance_confirmed','attendance_report_sent','class_plans'
  ])
)
SELECT
  w.tab AS table_name,
  CASE WHEN p.relname IS NOT NULL THEN 'exists' ELSE 'missing' END AS status,
  COALESCE(p.n_live_tup::bigint, 0) AS row_count_approx
FROM wanted w
LEFT JOIN pg_stat_user_tables p ON p.schemaname = 'public' AND p.relname = w.tab
ORDER BY w.tab;
