-- DEPRECATED: superseded by strength_training_planning_only.sql
-- Skaters are not assigned to Strength Training; use Level 1–5 only.

-- Kept for history; no-op if planning migration already ran.
UPDATE profiles p
SET skill_group_id = NULL
WHERE skill_group_id IN (
  SELECT id FROM skill_groups WHERE name IN ('Strength Training', '0 - Warmup')
);
