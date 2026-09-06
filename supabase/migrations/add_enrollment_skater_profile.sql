-- Let a guardian book a skater who has their own login.
--
-- A family has two kinds of skater: crew_members (no login, added by the
-- parent) and profiles linked through profiles.guardian_user_id (created by an
-- admin, with their own account). Enrollments could only name the first kind,
-- so booking the second one landed on the guardian's own row.

ALTER TABLE class_session_enrollments
  ADD COLUMN IF NOT EXISTS skater_profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE;

COMMENT ON COLUMN class_session_enrollments.skater_profile_id IS
  'Skater with their own login, booked by their guardian. NULL when the row is the account holder or a crew member.';

-- The "account holder" row now means no crew member AND no linked skater,
-- otherwise a parent booking two of their children collides on (event, user).
DROP INDEX IF EXISTS idx_enrollment_self;
CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_self
  ON class_session_enrollments (calendar_event_id, user_id)
  WHERE crew_member_id IS NULL AND skater_profile_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollment_skater_profile
  ON class_session_enrollments (calendar_event_id, skater_profile_id)
  WHERE skater_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_session_enrollments_skater
  ON class_session_enrollments (skater_profile_id)
  WHERE skater_profile_id IS NOT NULL;

-- Either side of the family can see the booking: the guardian who paid for it
-- and the skater whose account it is, whoever of the two made it.
DROP POLICY IF EXISTS "class_session_enrollments_select_own" ON class_session_enrollments;
CREATE POLICY "class_session_enrollments_select_own" ON class_session_enrollments
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR skater_profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = class_session_enrollments.skater_profile_id
        AND p.guardian_user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );
