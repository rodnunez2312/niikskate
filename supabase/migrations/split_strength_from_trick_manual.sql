-- Strength exercises moved out of Skate_Manual into their own Excel sheet, so every
-- trick's Excel # shifted down by 24 (320 rows → 296). skills_library upserts on
-- manual_id, so syncing the new JSON without re-keying first would rewrite rows in
-- place and silently re-point skaters' trick bags at the wrong tricks.
--
-- RUN THIS BEFORE the next "Sync from Excel". Verified against the workbook: the
-- 296 remaining tricks match old order exactly, offset 24, zero mismatches.
--
-- Requires: add_strength_exercises.sql

DO $$
DECLARE
  v_strength INTEGER;
  v_out_of_range INTEGER;
  v_max_manual INTEGER;
  v_focus INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_strength
  FROM skills_library
  WHERE structure = 'Strength Training' AND manual_id IS NOT NULL;

  IF v_strength = 0 THEN
    RAISE NOTICE 'Strength rows already detached — manual_id re-key already applied. Skipping.';
    RETURN;
  END IF;

  -- Refuse to shift unless the library is in the exact pre-split shape.
  IF v_strength <> 24 THEN
    RAISE EXCEPTION
      'Expected 24 strength rows holding a manual_id, found %. Do not re-key until this is understood.',
      v_strength;
  END IF;

  SELECT COUNT(*) INTO v_out_of_range
  FROM skills_library
  WHERE structure = 'Strength Training' AND (manual_id < 1 OR manual_id > 24);

  IF v_out_of_range > 0 THEN
    RAISE EXCEPTION
      'Strength rows are expected at manual_id 1-24; % row(s) fall outside that range.',
      v_out_of_range;
  END IF;

  SELECT MAX(manual_id) INTO v_max_manual FROM skills_library;
  IF v_max_manual <> 320 THEN
    RAISE EXCEPTION
      'Expected max manual_id 320 before the split, found %. Library is not in the pre-split state.',
      v_max_manual;
  END IF;

  -- Trick-bag entries pointing at strength exercises: kept, but they now reference
  -- an inactive row. Strength lives in strength_exercises from here on.
  SELECT COUNT(*) INTO v_focus
  FROM student_skill_focus f
  JOIN skills_library s ON s.id = f.skill_id
  WHERE s.structure = 'Strength Training';

  IF v_focus > 0 THEN
    RAISE NOTICE '% trick-bag row(s) reference strength exercises; they now point at inactive rows.', v_focus;
  END IF;

  -- Free manual_id 1-24 without deleting: preserves UUIDs, so no FK is orphaned.
  UPDATE skills_library
  SET manual_id = NULL,
      is_active = false
  WHERE structure = 'Strength Training';

  -- Shift the remaining 296 down by 24. Done in two passes through an out-of-range
  -- offset because manual_id is unique and the target range overlaps the source.
  UPDATE skills_library SET manual_id = manual_id + 100000 WHERE manual_id >= 25;
  UPDATE skills_library
  SET manual_id = manual_id - 100024,
      sort_order = manual_id - 100024
  WHERE manual_id >= 100025;

  RAISE NOTICE 'Re-keyed 296 tricks to manual_id 1-296 and detached 24 strength rows.';
END $$;

-- The Strength Training group was already planning-only and never assigned to
-- skaters (strength_training_planning_only.sql). Its skills have moved, so retire it.
UPDATE skill_groups
SET is_active = false,
    description = 'Retired: strength lives in strength_exercises (Excel sheet Strength_Training)'
WHERE name IN ('Strength Training', '0 - Warmup');

-- Safety net in case any assignment survived.
UPDATE profiles
SET skill_group_id = NULL
WHERE skill_group_id IN (SELECT id FROM skill_groups WHERE name IN ('Strength Training', '0 - Warmup'));
