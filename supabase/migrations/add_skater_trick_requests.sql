-- A skater can ask for a trick or drill. It stays "requested" until a coach
-- allows it (assigned) or turns it down (dismissed). The skater cannot
-- approve their own request or mark a trick completed.

ALTER TABLE student_skill_focus DROP CONSTRAINT IF EXISTS student_skill_focus_status_check;
ALTER TABLE student_skill_focus
  ADD CONSTRAINT student_skill_focus_status_check
  CHECK (status IN ('assigned', 'pending', 'review', 'done', 'dismissed', 'requested'));

DROP INDEX IF EXISTS idx_student_skill_focus_open_unique;
CREATE UNIQUE INDEX idx_student_skill_focus_open_unique
  ON student_skill_focus (student_id, skill_id)
  WHERE status IN ('assigned', 'pending', 'review', 'requested');

COMMENT ON TABLE student_skill_focus IS
  'Trick bag: requested (skater asked, coach must allow), assigned, pending, review, done.';

DROP POLICY IF EXISTS "Family request a trick" ON student_skill_focus;
CREATE POLICY "Family request a trick"
  ON student_skill_focus FOR INSERT TO authenticated
  WITH CHECK (
    status = 'requested'
    AND assigned_by = auth.uid()
    AND (
      student_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = student_skill_focus.student_id
          AND p.guardian_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "student_skill_focus_update_own_status" ON student_skill_focus;
CREATE POLICY "student_skill_focus_update_own_status"
  ON student_skill_focus FOR UPDATE TO authenticated
  USING (
    auth.uid() = student_id
    AND status IN ('assigned', 'pending', 'review')
  )
  WITH CHECK (
    auth.uid() = student_id
    AND status IN ('assigned', 'pending', 'review')
  );

DROP POLICY IF EXISTS "Guardians update family trick status" ON student_skill_focus;
CREATE POLICY "Guardians update family trick status"
  ON student_skill_focus FOR UPDATE TO authenticated
  USING (
    status IN ('assigned', 'pending', 'review')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = student_skill_focus.student_id
        AND p.guardian_user_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('assigned', 'pending', 'review')
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = student_skill_focus.student_id
        AND p.guardian_user_id = auth.uid()
    )
  );
