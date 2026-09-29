-- A tutor opens Programa as themselves. The assignment lives on the child's
-- profile, so the parent could not read program_students, the program row, or
-- that child's progress. Profiles are already public; these tables were not.

-- Keep each policy in a short transaction and lock referenced tables first.
-- This avoids deadlocks with live app queries that join these same tables.
BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE profiles IN ACCESS SHARE MODE;
LOCK TABLE program_students IN ACCESS EXCLUSIVE MODE;

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
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE profiles IN ACCESS SHARE MODE;
LOCK TABLE program_students IN ACCESS SHARE MODE;
LOCK TABLE programs IN ACCESS EXCLUSIVE MODE;

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
COMMIT;

BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE profiles IN ACCESS SHARE MODE;
LOCK TABLE student_progress IN ACCESS EXCLUSIVE MODE;

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
COMMIT;

-- The trick bag assignments are stored separately from completed progress.
-- Without this policy a tutor sees an empty bag even though the coach's rows
-- are still present.
BEGIN;
SET LOCAL lock_timeout = '15s';
LOCK TABLE profiles IN ACCESS SHARE MODE;
LOCK TABLE student_skill_focus IN ACCESS EXCLUSIVE MODE;

DROP POLICY IF EXISTS "Guardians read family trick focus" ON student_skill_focus;
CREATE POLICY "Guardians read family trick focus"
  ON student_skill_focus FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = student_skill_focus.student_id
        AND p.guardian_user_id = auth.uid()
    )
  );
COMMIT;
