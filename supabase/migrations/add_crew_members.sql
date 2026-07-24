-- Family crew: guardians manage skaters (children) without separate auth accounts.
-- Enrollments reference the skater via crew_member_id (NULL = account holder).

CREATE TABLE IF NOT EXISTS crew_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  full_name TEXT,
  date_of_birth DATE,
  age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 120)),
  avatar_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_members_guardian ON crew_members(guardian_user_id);

COMMENT ON TABLE crew_members IS 'Skaters managed by a guardian account (parent). No separate login.';
COMMENT ON COLUMN crew_members.guardian_user_id IS 'profiles.id of the parent/guardian auth user.';

ALTER TABLE class_session_enrollments
  ADD COLUMN IF NOT EXISTS crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE;

COMMENT ON COLUMN class_session_enrollments.crew_member_id IS 'Skater in crew; NULL = account holder enrolled for self.';

-- One enrollment per skater per session
DROP INDEX IF EXISTS idx_class_session_enrollments_event_user;
ALTER TABLE class_session_enrollments DROP CONSTRAINT IF EXISTS class_session_enrollments_calendar_event_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_self
  ON class_session_enrollments (calendar_event_id, user_id)
  WHERE crew_member_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_crew
  ON class_session_enrollments (calendar_event_id, crew_member_id)
  WHERE crew_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_session_enrollments_crew
  ON class_session_enrollments(crew_member_id)
  WHERE crew_member_id IS NOT NULL;

ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crew_members_select_own" ON crew_members;
CREATE POLICY "crew_members_select_own" ON crew_members
  FOR SELECT TO authenticated
  USING (
    guardian_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

DROP POLICY IF EXISTS "crew_members_insert_own" ON crew_members;
CREATE POLICY "crew_members_insert_own" ON crew_members
  FOR INSERT TO authenticated
  WITH CHECK (guardian_user_id = auth.uid());

DROP POLICY IF EXISTS "crew_members_update_own" ON crew_members;
CREATE POLICY "crew_members_update_own" ON crew_members
  FOR UPDATE TO authenticated
  USING (guardian_user_id = auth.uid())
  WITH CHECK (guardian_user_id = auth.uid());

DROP POLICY IF EXISTS "crew_members_delete_own" ON crew_members;
CREATE POLICY "crew_members_delete_own" ON crew_members
  FOR DELETE TO authenticated
  USING (guardian_user_id = auth.uid());

DROP POLICY IF EXISTS "crew_members_staff_all" ON crew_members;
CREATE POLICY "crew_members_staff_all" ON crew_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')));
