-- Class plan: skill track, beginner audience, and per-section trick lists (mobile planning)
ALTER TABLE class_plans
  ADD COLUMN IF NOT EXISTS skill_track TEXT,
  ADD COLUMN IF NOT EXISTS audience_category TEXT,
  ADD COLUMN IF NOT EXISTS plan_sections JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN class_plans.skill_track IS 'Coarse level: beginner | intermediate | advanced';
COMMENT ON COLUMN class_plans.audience_category IS 'When skill_track=beginner: tots_5_7 | kids_7_12 | adults_18_plus';
COMMENT ON COLUMN class_plans.plan_sections IS 'JSON array [{ id: games|drills|closure, skill_ids: uuid[] }]';
