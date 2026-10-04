-- Subgroups can live inside an area (Flatground, Street, …) and hold their own skills.
-- Direct program subgroups keep area_id null. Run this in the Supabase SQL Editor.

ALTER TABLE skill_subgroups
  ADD COLUMN IF NOT EXISTS area_id UUID REFERENCES skill_areas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_skill_subgroups_area ON skill_subgroups(area_id);

ALTER TABLE area_skills
  ADD COLUMN IF NOT EXISTS subgroup_id UUID REFERENCES skill_subgroups(id) ON DELETE CASCADE;

ALTER TABLE area_skills ALTER COLUMN area_id DROP NOT NULL;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.area_skills'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE area_skills DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'area_skills_place_skill_variant_key'
  ) THEN
    ALTER TABLE area_skills
      ADD CONSTRAINT area_skills_place_skill_variant_key
      UNIQUE NULLS NOT DISTINCT (area_id, subgroup_id, skill_id, variant);
  END IF;
END $$;

ALTER TABLE area_skills DROP CONSTRAINT IF EXISTS area_skills_has_parent;
ALTER TABLE area_skills
  ADD CONSTRAINT area_skills_has_parent
  CHECK (area_id IS NOT NULL OR subgroup_id IS NOT NULL);
