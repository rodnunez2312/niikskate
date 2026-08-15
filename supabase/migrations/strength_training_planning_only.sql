-- Strength Training = class planning only (drills/skills). Skaters use Level 1–5.

UPDATE skill_groups
SET name = 'Strength Training',
    description = 'Strength and mobility drills for class planning (not assigned to skaters)',
    is_system = true
WHERE name = '0 - Warmup';

UPDATE skill_groups
SET description = 'Strength and mobility drills for class planning (not assigned to skaters)',
    is_system = true
WHERE name = 'Strength Training';

INSERT INTO skill_groups (name, description, color, sort_order, is_active, is_system)
SELECT
  'Strength Training',
  'Strength and mobility drills for class planning (not assigned to skaters)',
  '#64748b',
  0,
  true,
  true
WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Strength Training');

-- Skaters are assigned Level 1–5 only; clear legacy Warmup / Strength Training assignments
UPDATE profiles p
SET skill_group_id = NULL
WHERE skill_group_id IN (
  SELECT id FROM skill_groups WHERE name IN ('Strength Training', '0 - Warmup')
);

UPDATE skills_library
SET structure = 'Strength Training',
    categoria = 'Strength Training'
WHERE structure IN ('0 - Warmup', 'Stregth Training')
   OR categoria IN ('0 - Warmup', 'Stregth Training');
