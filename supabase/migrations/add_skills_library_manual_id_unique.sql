-- Column A (#) is the canonical trick key — one row per manual_id, exactly 320 from Niik manual.

-- Remove duplicate manual_id rows (keep oldest id per manual_id)
DELETE FROM skills_library a
USING skills_library b
WHERE a.manual_id IS NOT NULL
  AND b.manual_id IS NOT NULL
  AND a.manual_id = b.manual_id
  AND a.id > b.id;

DROP INDEX IF EXISTS idx_skills_library_manual_id;

ALTER TABLE skills_library DROP CONSTRAINT IF EXISTS skills_library_manual_id_key;

ALTER TABLE skills_library
  ADD CONSTRAINT skills_library_manual_id_key UNIQUE (manual_id);

COMMENT ON COLUMN skills_library.manual_id IS 'Excel column A (#) — unique trick key; sort_order mirrors this value';
