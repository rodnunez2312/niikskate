-- Trick rows belong to one sport. Warmup and strength stay shared (discipline NULL).
-- Everything already in the library is skateboarding.

ALTER TABLE skills_library ADD COLUMN IF NOT EXISTS discipline TEXT;

UPDATE skills_library
SET discipline = 'skateboarding'
WHERE discipline IS NULL
  AND COALESCE(area, '') NOT ILIKE 'warmup'
  AND COALESCE(structure, '') NOT ILIKE '%warmup%'
  AND COALESCE(structure, '') NOT ILIKE '%strength%'
  AND COALESCE(categoria, '') NOT ILIKE '%warmup%'
  AND COALESCE(categoria, '') NOT ILIKE '%strength%'
  AND COALESCE(program, '') NOT ILIKE 'strength training';

ALTER TABLE skills_library DROP CONSTRAINT IF EXISTS skills_library_discipline_check;
ALTER TABLE skills_library
  ADD CONSTRAINT skills_library_discipline_check CHECK (
    discipline IS NULL
    OR discipline IN ('skateboarding', 'scooter', 'rollerblading', 'bmx', 'parkour', 'shared')
  );

CREATE INDEX IF NOT EXISTS idx_skills_library_discipline ON skills_library(discipline);
