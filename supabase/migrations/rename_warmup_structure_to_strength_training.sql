-- Rename Structure / program level "0 - Warmup" → "Strength Training" (Excel update)

UPDATE skill_groups
SET name = 'Strength Training',
    description = 'Strength and mobility training'
WHERE name = '0 - Warmup';

INSERT INTO skill_groups (name, description, color, sort_order, is_active)
SELECT 'Strength Training', 'Strength and mobility training', '#64748b', 0, true
WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Strength Training');

UPDATE skills_library
SET structure = 'Strength Training',
    categoria = 'Strength Training'
WHERE structure IN ('0 - Warmup', 'Stregth Training')
   OR categoria IN ('0 - Warmup', 'Stregth Training');

COMMENT ON COLUMN skills_library.structure IS 'Excel Structure / program level: Strength Training … Level 5: Advanced';
