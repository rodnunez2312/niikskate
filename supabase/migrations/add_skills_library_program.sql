-- Store Excel "Program" column: Iniciacion, Park/Bowl, Street, Strength Training (used for tricks summary).
ALTER TABLE skills_library
  ADD COLUMN IF NOT EXISTS program TEXT;

COMMENT ON COLUMN skills_library.program IS 'Excel Program: Iniciacion, Park/Bowl, Street, Strength Training';
