-- Skaters mark their own tricks as completed once a coach has assigned them.
--
-- student_skill_focus already lets a skater update their own rows
-- (student_skill_focus_update_own_status), but student_progress was
-- coach/admin-insert only, so "done" never unlocked the trick for them.
-- The bag membership check keeps this from becoming self-service for the
-- whole 296-trick library: a skater can only unlock what was assigned.

DROP POLICY IF EXISTS "student_progress_insert_own_assigned" ON student_progress;
CREATE POLICY "student_progress_insert_own_assigned"
  ON student_progress FOR INSERT
  WITH CHECK (
    auth.uid() = student_id
    AND EXISTS (
      SELECT 1 FROM student_skill_focus f
      WHERE f.student_id = student_progress.student_id
        AND f.skill_id = student_progress.skill_id
        AND f.status IN ('assigned', 'pending', 'done')
    )
  );

COMMENT ON POLICY "student_progress_insert_own_assigned" ON student_progress IS
  'Skater self-completion, limited to tricks a coach put in their bag. Undo stays staff-only.';
