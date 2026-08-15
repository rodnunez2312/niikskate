-- Coach ETA for trick bag assignments
ALTER TABLE student_skill_focus
  ADD COLUMN IF NOT EXISTS target_date DATE;

COMMENT ON COLUMN student_skill_focus.target_date IS 'Target date by when the skater should complete this trick';
