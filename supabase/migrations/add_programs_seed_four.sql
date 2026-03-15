-- Seed the 4 main programs (run this if you already had the programs table with the old single seed)
INSERT INTO programs (name, description, is_active)
SELECT '1 - Iniciacion', 'Introduction / beginner program', true
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE name = '1 - Iniciacion');
INSERT INTO programs (name, description, is_active)
SELECT '2 - Street', 'Street skating program', true
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE name = '2 - Street');
INSERT INTO programs (name, description, is_active)
SELECT '3 - Park', 'Park / bowl program', true
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE name = '3 - Park');
INSERT INTO programs (name, description, is_active)
SELECT '4 - Advanced', 'Advanced program', true
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE name = '4 - Advanced');
