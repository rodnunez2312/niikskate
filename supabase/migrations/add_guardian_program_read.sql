-- A tutor opens Programa as themselves. The assignment lives on the child's
-- profile, so the parent could not read program_students, the program row, or
-- that child's progress. Profiles are already public; these tables were not.

DROP POLICY IF EXISTS "Guardians read family program assignments" ON program_students;
CREATE POLICY "Guardians read family program assignments"
  ON program_students FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = program_students.student_id
        AND p.guardian_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Guardians read family programs" ON programs;
CREATE POLICY "Guardians read family programs"
  ON programs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM program_students ps
      JOIN profiles p ON p.id = ps.student_id
      WHERE ps.program_id = programs.id
        AND p.guardian_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Guardians read family progress" ON student_progress;
CREATE POLICY "Guardians read family progress"
  ON student_progress FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = student_progress.student_id
        AND p.guardian_user_id = auth.uid()
    )
  );
