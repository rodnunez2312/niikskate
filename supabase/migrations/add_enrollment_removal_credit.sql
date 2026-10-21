-- Remember how a removed class seat gave one class back, so adding the
-- skater to the same session can undo that return.
-- Run this in the Supabase SQL editor.

ALTER TABLE class_session_enrollments
  ADD COLUMN IF NOT EXISTS credit_returned text,
  ADD COLUMN IF NOT EXISTS credit_finance_enrollment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_session_enrollments_credit_returned_check'
  ) THEN
    ALTER TABLE class_session_enrollments
      ADD CONSTRAINT class_session_enrollments_credit_returned_check
      CHECK (credit_returned IS NULL OR credit_returned IN ('pack', 'mark', 'none'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_session_enrollments_credit_finance_enrollment_id_fkey'
  ) THEN
    ALTER TABLE class_session_enrollments
      ADD CONSTRAINT class_session_enrollments_credit_finance_enrollment_id_fkey
      FOREIGN KEY (credit_finance_enrollment_id)
      REFERENCES finance_student_enrollments(id)
      ON DELETE SET NULL;
  END IF;
END $$;
