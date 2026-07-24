-- Bookable class sessions published via school calendar (admin-only create).
-- Capacity: 6 skaters per coach on duty (derived from coach_date_availability, else coach_availability).

ALTER TABLE school_calendar_events
  ADD COLUMN IF NOT EXISTS is_bookable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS time_slot TEXT CHECK (time_slot IS NULL OR time_slot IN ('early', 'late')),
  ADD COLUMN IF NOT EXISTS skill_level TEXT,
  ADD COLUMN IF NOT EXISTS min_age INTEGER CHECK (min_age IS NULL OR (min_age >= 3 AND min_age <= 99)),
  ADD COLUMN IF NOT EXISTS max_age INTEGER CHECK (max_age IS NULL OR (max_age >= 3 AND max_age <= 99)),
  ADD COLUMN IF NOT EXISTS skatepark TEXT DEFAULT 'Skatepark La Plancha',
  ADD COLUMN IF NOT EXISTS price_mxn NUMERIC(10, 2);

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_event_type_check;
ALTER TABLE school_calendar_events ADD CONSTRAINT school_calendar_events_event_type_check
  CHECK (event_type IN (
    'event', 'competition', 'holiday', 'school_closure', 'school_open',
    'practice', 'meeting', 'camp', 'show', 'custom', 'class_session'
  ));

COMMENT ON COLUMN school_calendar_events.is_bookable IS 'When true, families can enroll; usually event_type = class_session.';
COMMENT ON COLUMN school_calendar_events.time_slot IS 'early = 5:30–7:00 PM, late = 7:00–8:30 PM.';

CREATE TABLE IF NOT EXISTS class_session_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_event_id UUID NOT NULL REFERENCES school_calendar_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  child_age INTEGER CHECK (child_age IS NULL OR (child_age >= 3 AND child_age <= 99)),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (calendar_event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_class_session_enrollments_event ON class_session_enrollments(calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_class_session_enrollments_user ON class_session_enrollments(user_id);

ALTER TABLE class_session_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "class_session_enrollments_select_own" ON class_session_enrollments;
CREATE POLICY "class_session_enrollments_select_own" ON class_session_enrollments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

DROP POLICY IF EXISTS "class_session_enrollments_insert_own" ON class_session_enrollments;
CREATE POLICY "class_session_enrollments_insert_own" ON class_session_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "class_session_enrollments_staff_all" ON class_session_enrollments;
CREATE POLICY "class_session_enrollments_staff_all" ON class_session_enrollments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')));
