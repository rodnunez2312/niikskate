-- =============================================================================
-- FIX: Kanban "skill_group_id not in schema cache" error
-- Safe to re-run. Run entire script in Supabase SQL Editor.
--
-- Correct order if starting fresh:
--   1. add_skill_groups_structure.sql
--   2. add_skate_tricks_manual_schema.sql
--   3. this file (ensure_kanban_profile_columns.sql)
-- =============================================================================

-- Step 1: skill_groups must exist (minimal bootstrap if missing)
CREATE TABLE IF NOT EXISTS skill_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Step 2: Add columns on profiles (no FK yet — avoids failure if table was missing before)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS skill_group_id UUID;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS skater_schedule JSONB;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS guardian_user_id UUID;

-- Step 3: Foreign keys (only if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_skill_group_id_fkey'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_skill_group_id_fkey
      FOREIGN KEY (skill_group_id) REFERENCES skill_groups(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_guardian_user_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'guardian_user_id'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_guardian_user_id_fkey
      FOREIGN KEY (guardian_user_id) REFERENCES profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_skill_group_id
  ON profiles(skill_group_id)
  WHERE skill_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_guardian_user
  ON profiles(guardian_user_id)
  WHERE guardian_user_id IS NOT NULL;

COMMENT ON COLUMN profiles.skill_group_id IS 'Assigned skate program level (skill_groups), used for Kanban and group progress.';
COMMENT ON COLUMN profiles.skater_schedule IS 'Optional weekly availability: start, end (HH:MM), days (0–6 Sun–Sat).';

-- Step 4: Reload PostgREST schema cache (fixes "not in schema cache" after column added)
NOTIFY pgrst, 'reload schema';

-- Step 5: Confirm
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'skill_group_id'
  ) THEN
    RAISE NOTICE 'SUCCESS: profiles.skill_group_id is ready. Refresh Patinadores page.';
  ELSE
    RAISE EXCEPTION 'FAILED: profiles.skill_group_id still missing';
  END IF;
END $$;
