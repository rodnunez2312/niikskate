-- NiikSkate_Tricks_Manual columns + program levels 0–5 + trick bag statuses

ALTER TABLE skills_library
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS structure TEXT,
  ADD COLUMN IF NOT EXISTS trick_type TEXT,
  ADD COLUMN IF NOT EXISTS manual_id INTEGER;

COMMENT ON COLUMN skills_library.manual_id IS 'Row # from NiikSkate_Tricks_Manual.xlsx; sort_order mirrors this value';

CREATE INDEX IF NOT EXISTS idx_skills_library_manual_id ON skills_library(manual_id);

COMMENT ON COLUMN skills_library.area IS 'Excel Area: Warmup, Flatground, Street, Park, Bowl, Mini Ramp, Vert';
COMMENT ON COLUMN skills_library.structure IS 'Excel Structure / program level: Strength Training … Level 5: Advanced';
COMMENT ON COLUMN skills_library.trick_type IS 'Excel Type: Exercise, Drill, Trick';

-- Program levels 0–5 (deactivate legacy levels 6+)
UPDATE skill_groups SET is_active = false WHERE name ILIKE 'Level 6:%' OR name ILIKE 'Level 7:%'
  OR name ILIKE 'Level 8:%' OR name ILIKE 'Level 9:%' OR name ILIKE 'Level 10:%';

UPDATE skill_groups SET name = 'Level 5: Advanced', description = 'Advanced tricks and lines', sort_order = 5
  WHERE name = 'Level 5: Intermediate';

INSERT INTO skill_groups (name, description, color, sort_order, is_active)
SELECT 'Strength Training', 'Strength and mobility training', '#64748b', 0, true
WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Strength Training');

INSERT INTO skill_groups (name, description, color, sort_order, is_active)
SELECT v.name, v.description, v.color, v.ord, true
FROM (VALUES
  ('Level 1: Foundations', 'Basic board control and safety', '#16a34a', 1),
  ('Level 2: Balance & Control', 'Developing balance and basic movements', '#2563eb', 2),
  ('Level 3: Basic Tricks', 'First tricks and transitions', '#4f46e5', 3),
  ('Level 4: Progression', 'Building on fundamentals', '#7c3aed', 4),
  ('Level 5: Advanced', 'Advanced tricks and lines', '#a855f7', 5)
) AS v(name, description, color, ord)
WHERE NOT EXISTS (SELECT 1 FROM skill_groups g WHERE g.name = v.name);

UPDATE skill_groups SET sort_order = 1, is_active = true WHERE name = 'Level 1: Foundations';
UPDATE skill_groups SET sort_order = 2, is_active = true WHERE name = 'Level 2: Balance & Control';
UPDATE skill_groups SET sort_order = 3, is_active = true WHERE name = 'Level 3: Basic Tricks';
UPDATE skill_groups SET sort_order = 4, is_active = true WHERE name = 'Level 4: Progression';
UPDATE skill_groups SET sort_order = 5, is_active = true WHERE name IN ('Level 5: Advanced', 'Level 5: Intermediate');

-- Trick bag: assigned → pending → done
ALTER TABLE student_skill_focus DROP CONSTRAINT IF EXISTS student_skill_focus_status_check;

UPDATE student_skill_focus SET status = 'assigned' WHERE status = 'active';
UPDATE student_skill_focus SET status = 'done' WHERE status = 'completed';

ALTER TABLE student_skill_focus
  ADD CONSTRAINT student_skill_focus_status_check
  CHECK (status IN ('assigned', 'pending', 'done', 'dismissed'));

DROP INDEX IF EXISTS idx_student_skill_focus_active_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_skill_focus_open_unique
  ON student_skill_focus (student_id, skill_id)
  WHERE status IN ('assigned', 'pending');

DROP INDEX IF EXISTS idx_student_skill_focus_active;
CREATE INDEX IF NOT EXISTS idx_student_skill_focus_open
  ON student_skill_focus(student_id)
  WHERE status IN ('assigned', 'pending');

COMMENT ON TABLE student_skill_focus IS 'Skater trick bag: assigned, pending (in progress), done (mastered)';
