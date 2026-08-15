-- =============================================================================
-- Clean up duplicate / legacy skill_groups rows
-- Fixes: "0 - Warmup" still visible, duplicate "Level 5: Advanced"
-- Safe to re-run.
-- =============================================================================

ALTER TABLE skill_groups
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false NOT NULL;

-- ---------------------------------------------------------------------------
-- 1) Merge duplicate groups that share the same name (keep oldest row)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
  keeper_id UUID;
  dupe_id UUID;
  i INT;
BEGIN
  FOR rec IN
    SELECT name, array_agg(id ORDER BY created_at NULLS LAST, id) AS ids
    FROM skill_groups
    GROUP BY name
    HAVING COUNT(*) > 1
  LOOP
    keeper_id := rec.ids[1];
    FOR i IN 2..array_length(rec.ids, 1) LOOP
      dupe_id := rec.ids[i];

      UPDATE profiles SET skill_group_id = keeper_id WHERE skill_group_id = dupe_id;

      UPDATE skill_areas sa
      SET group_id = keeper_id
      WHERE sa.group_id = dupe_id
        AND NOT EXISTS (
          SELECT 1 FROM skill_areas x
          WHERE x.group_id = keeper_id AND x.name = sa.name
        );
      DELETE FROM skill_areas WHERE group_id = dupe_id;

      UPDATE skill_subgroups ss
      SET group_id = keeper_id
      WHERE ss.group_id = dupe_id
        AND NOT EXISTS (
          SELECT 1 FROM skill_subgroups x
          WHERE x.group_id = keeper_id AND x.name = ss.name
        );
      DELETE FROM skill_subgroups WHERE group_id = dupe_id;

      DELETE FROM skill_groups WHERE id = dupe_id;
      RAISE NOTICE 'Merged duplicate skill_group "%" — removed id %, kept %', rec.name, dupe_id, keeper_id;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Fold "0 - Warmup" into Strength Training (planning-only, not Kanban)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  warmup_id UUID;
  strength_id UUID;
BEGIN
  SELECT id INTO warmup_id FROM skill_groups WHERE name = '0 - Warmup' LIMIT 1;
  SELECT id INTO strength_id FROM skill_groups WHERE name = 'Strength Training' ORDER BY created_at LIMIT 1;

  IF warmup_id IS NULL THEN
    RETURN;
  END IF;

  IF strength_id IS NULL THEN
    UPDATE skill_groups
    SET name = 'Strength Training',
        description = 'Strength and mobility drills for class planning (not assigned to skaters)',
        sort_order = 0,
        is_active = true,
        is_system = true
    WHERE id = warmup_id;
    RAISE NOTICE 'Renamed 0 - Warmup → Strength Training (id %)', warmup_id;
    RETURN;
  END IF;

  IF warmup_id = strength_id THEN
    RETURN;
  END IF;

  UPDATE profiles SET skill_group_id = strength_id WHERE skill_group_id = warmup_id;

  UPDATE skill_areas sa
  SET group_id = strength_id
  WHERE sa.group_id = warmup_id
    AND NOT EXISTS (
      SELECT 1 FROM skill_areas x WHERE x.group_id = strength_id AND x.name = sa.name
    );
  DELETE FROM skill_areas WHERE group_id = warmup_id;

  UPDATE skill_subgroups ss
  SET group_id = strength_id
  WHERE ss.group_id = warmup_id
    AND NOT EXISTS (
      SELECT 1 FROM skill_subgroups x WHERE x.group_id = strength_id AND x.name = ss.name
    );
  DELETE FROM skill_subgroups WHERE group_id = warmup_id;

  DELETE FROM skill_groups WHERE id = warmup_id;
  RAISE NOTICE 'Removed 0 - Warmup (id %) — merged into Strength Training (id %)', warmup_id, strength_id;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Normalize canonical Level 1–5 + Strength Training metadata
-- ---------------------------------------------------------------------------
UPDATE skill_groups
SET is_active = false
WHERE name ILIKE 'Level 6:%' OR name ILIKE 'Level 7:%'
   OR name ILIKE 'Level 8:%' OR name ILIKE 'Level 9:%' OR name ILIKE 'Level 10:%'
   OR name ILIKE 'Level 6:%' OR name = 'Level 6: Advanced Basics';

UPDATE skill_groups
SET name = 'Level 5: Advanced',
    description = 'Advanced tricks and lines',
    sort_order = 5,
    is_active = true
WHERE name = 'Level 5: Intermediate';

UPDATE skill_groups
SET description = 'Strength and mobility drills for class planning (not assigned to skaters)',
    sort_order = 0,
    is_active = true,
    is_system = true
WHERE name = 'Strength Training';

UPDATE skill_groups SET sort_order = 1, is_active = true WHERE name = 'Level 1: Foundations';
UPDATE skill_groups SET sort_order = 2, is_active = true WHERE name = 'Level 2: Balance & Control';
UPDATE skill_groups SET sort_order = 3, is_active = true WHERE name = 'Level 3: Basic Tricks';
UPDATE skill_groups SET sort_order = 4, is_active = true WHERE name = 'Level 4: Progression';
UPDATE skill_groups SET sort_order = 5, is_active = true WHERE name = 'Level 5: Advanced';

UPDATE profiles
SET skill_group_id = NULL
WHERE skill_group_id IN (
  SELECT id FROM skill_groups WHERE name IN ('Strength Training', '0 - Warmup')
);

NOTIFY pgrst, 'reload schema';

-- Summary
SELECT name, COUNT(*) AS row_count
FROM skill_groups
WHERE is_active IS DISTINCT FROM false
GROUP BY name
HAVING COUNT(*) > 1;

SELECT id, name, sort_order, is_active, is_system
FROM skill_groups
WHERE is_active IS DISTINCT FROM false
ORDER BY sort_order, name;
