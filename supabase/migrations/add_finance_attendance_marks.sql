-- Dated attendance for finance student packages.
-- Counters remain on finance_student_enrollments for backward compatibility;
-- these triggers keep them synchronized for all dated marks added from now on.

CREATE TABLE IF NOT EXISTS finance_enrollment_session_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID NOT NULL REFERENCES finance_student_enrollments(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('attended', 'absent')),
  calendar_event_id UUID REFERENCES school_calendar_events(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_finance_session_marks_enrollment
  ON finance_enrollment_session_marks(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_finance_session_marks_date
  ON finance_enrollment_session_marks(session_date);

CREATE OR REPLACE FUNCTION sync_finance_session_mark_counter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    UPDATE finance_student_enrollments
    SET attended = GREATEST(0, attended - CASE WHEN OLD.status = 'attended' THEN 1 ELSE 0 END),
        absences = GREATEST(0, absences - CASE WHEN OLD.status = 'absent' THEN 1 ELSE 0 END)
    WHERE id = OLD.enrollment_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    UPDATE finance_student_enrollments
    SET attended = attended + CASE WHEN NEW.status = 'attended' THEN 1 ELSE 0 END,
        absences = absences + CASE WHEN NEW.status = 'absent' THEN 1 ELSE 0 END
    WHERE id = NEW.enrollment_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_session_mark_counter ON finance_enrollment_session_marks;
CREATE TRIGGER finance_session_mark_counter
AFTER INSERT OR UPDATE OR DELETE ON finance_enrollment_session_marks
FOR EACH ROW EXECUTE FUNCTION sync_finance_session_mark_counter();

CREATE OR REPLACE FUNCTION touch_finance_session_mark_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finance_session_mark_updated_at ON finance_enrollment_session_marks;
CREATE TRIGGER finance_session_mark_updated_at
BEFORE UPDATE ON finance_enrollment_session_marks
FOR EACH ROW EXECUTE FUNCTION touch_finance_session_mark_updated_at();

ALTER TABLE finance_enrollment_session_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "finance_session_marks_staff_read" ON finance_enrollment_session_marks;
CREATE POLICY "finance_session_marks_staff_read" ON finance_enrollment_session_marks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ));

DROP POLICY IF EXISTS "finance_session_marks_admin_write" ON finance_enrollment_session_marks;
CREATE POLICY "finance_session_marks_admin_write" ON finance_enrollment_session_marks
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
