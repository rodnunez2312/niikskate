-- Skater program level (skill group) + preferred weekly schedule for admin assignment.
-- skill_group_id: which Level / skate program track (skill_groups row).
-- skater_schedule: JSON e.g. {"start":"09:00","end":"17:00","days":[1,2,3,4,5]} — days use JS getDay(): 0=Sun … 6=Sat

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS skill_group_id UUID REFERENCES skill_groups(id) ON DELETE SET NULL;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS skater_schedule JSONB;

CREATE INDEX IF NOT EXISTS idx_profiles_skill_group_id ON profiles(skill_group_id) WHERE skill_group_id IS NOT NULL;

COMMENT ON COLUMN profiles.skill_group_id IS 'Assigned skate program level (skill_groups), used for group progress comparison.';
COMMENT ON COLUMN profiles.skater_schedule IS 'Optional weekly availability: start, end (HH:MM), days (0–6 Sun–Sat).';
