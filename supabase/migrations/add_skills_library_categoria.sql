-- Store raw Categoria from Excel (1 - Basics, 2 - Principiantes, 3 - Intermedios, 4 - Avanzados, 0 - Warmup) for filtering.
ALTER TABLE skills_library
  ADD COLUMN IF NOT EXISTS categoria TEXT;
COMMENT ON COLUMN skills_library.categoria IS 'Excel Categoria: 0 - Warmup, 1 - Basics, 2 - Principiantes, 3 - Intermedios, 4 - Avanzados';
