-- Allow coaches/admins to undo mistaken trick completions.

CREATE POLICY "Coaches can delete progress"
  ON student_progress FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

CREATE POLICY "student_skill_focus_delete_staff"
  ON student_skill_focus FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );
