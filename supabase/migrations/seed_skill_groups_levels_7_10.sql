-- Four remaining program levels (7–10) to complete the 10-level track alongside 1–6 from add_skill_groups_structure.sql.

INSERT INTO skill_groups (name, description, color, sort_order)
SELECT 'Level 7: Technical', 'Technical trick mastery', '#ec4899', 7
WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Level 7: Technical');

INSERT INTO skill_groups (name, description, color, sort_order)
SELECT 'Level 8: Expert', 'Expert-level skills', '#dc2626', 8
WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Level 8: Expert');

INSERT INTO skill_groups (name, description, color, sort_order)
SELECT 'Level 9: Advanced', 'Advanced competitive skills', '#b91c1c', 9
WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Level 9: Advanced');

INSERT INTO skill_groups (name, description, color, sort_order)
SELECT 'Level 10: Pro', 'Professional-level mastery', '#171717', 10
WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Level 10: Pro');
