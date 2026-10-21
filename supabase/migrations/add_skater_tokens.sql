-- Colored class tokens: one paid class mints one token, one class spends one.
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS skater_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skater_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('group', 'individual', 'pro', 'free')),
  status TEXT NOT NULL CHECK (status IN ('available', 'spent', 'owed', 'void')),
  source TEXT NOT NULL CHECK (source IN ('payment', 'attendance', 'level')),
  finance_enrollment_id UUID REFERENCES finance_student_enrollments(id) ON DELETE SET NULL,
  calendar_event_id UUID REFERENCES school_calendar_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  spent_at TIMESTAMPTZ,
  CHECK (skater_id IS NOT NULL OR crew_member_id IS NOT NULL)
);

COMMENT ON TABLE skater_tokens IS 'Class wallet. Payment mints a colored token; a class spends a matching token or a free one.';

CREATE INDEX IF NOT EXISTS idx_skater_tokens_profile ON skater_tokens(skater_id, status);
CREATE INDEX IF NOT EXISTS idx_skater_tokens_crew ON skater_tokens(crew_member_id, status);
CREATE INDEX IF NOT EXISTS idx_skater_tokens_enrollment ON skater_tokens(finance_enrollment_id);

CREATE TABLE IF NOT EXISTS skater_token_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skater_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE,
  -- -1 means the attendance reward has not been baselined yet.
  attendance_rewards_issued INTEGER NOT NULL DEFAULT -1,
  level_baselined BOOLEAN NOT NULL DEFAULT false,
  last_rewarded_level INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (skater_id IS NOT NULL OR crew_member_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS skater_token_rewards_profile
  ON skater_token_rewards(skater_id) WHERE skater_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS skater_token_rewards_crew
  ON skater_token_rewards(crew_member_id) WHERE crew_member_id IS NOT NULL;

ALTER TABLE class_session_enrollments
  ADD COLUMN IF NOT EXISTS spent_token_id UUID REFERENCES skater_tokens(id) ON DELETE SET NULL;

-- Dropping a purchase voids tokens that were still unused or owed.
CREATE OR REPLACE FUNCTION void_skater_tokens_on_enrollment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE skater_tokens
  SET status = 'void'
  WHERE finance_enrollment_id = OLD.id
    AND status IN ('available', 'owed');
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS void_skater_tokens_before_enrollment_delete ON finance_student_enrollments;
CREATE TRIGGER void_skater_tokens_before_enrollment_delete
  BEFORE DELETE ON finance_student_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION void_skater_tokens_on_enrollment_delete();

ALTER TABLE skater_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE skater_token_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skater_tokens_staff_read" ON skater_tokens;
CREATE POLICY "skater_tokens_staff_read" ON skater_tokens
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ));

DROP POLICY IF EXISTS "skater_tokens_admin_write" ON skater_tokens;
CREATE POLICY "skater_tokens_admin_write" ON skater_tokens
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "skater_token_rewards_staff_read" ON skater_token_rewards;
CREATE POLICY "skater_token_rewards_staff_read" ON skater_token_rewards
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ));

DROP POLICY IF EXISTS "skater_token_rewards_admin_write" ON skater_token_rewards;
CREATE POLICY "skater_token_rewards_admin_write" ON skater_token_rewards
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- One token per class still left on each active package. Owed when the balance is negative.
INSERT INTO skater_tokens (skater_id, crew_member_id, kind, status, source, finance_enrollment_id)
SELECT
  e.skater_id,
  e.crew_member_id,
  CASE
    WHEN e.coach_tier IN ('pro_street', 'pro_bowl') THEN 'pro'
    WHEN e.class_kind LIKE 'individual%' THEN 'individual'
    ELSE 'group'
  END,
  CASE WHEN e.remaining_sessions < 0 THEN 'owed' ELSE 'available' END,
  'payment',
  e.id
FROM finance_student_enrollments e
CROSS JOIN LATERAL generate_series(1, ABS(e.remaining_sessions)) AS n
WHERE e.is_active
  AND e.remaining_sessions <> 0
  AND (e.skater_id IS NOT NULL OR e.crew_member_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM skater_tokens t
    WHERE t.finance_enrollment_id = e.id AND t.source = 'payment'
  );
