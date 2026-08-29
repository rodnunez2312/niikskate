-- Desafíos: free-text goals a coach sets for one skater.
--
-- Deliberately NOT tied to skills_library. A challenge is something like
-- "film a clean line at the bowl" or "land 10 ollies in a row" — it lives
-- outside the trick bag and never counts toward student_progress, which is
-- what the "Desafíos completados" bar used to (wrongly) mirror.

CREATE TABLE IF NOT EXISTS skater_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  description TEXT,

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed')),

  due_date DATE,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skater_challenges_student ON skater_challenges(student_id);
CREATE INDEX IF NOT EXISTS idx_skater_challenges_open
  ON skater_challenges(student_id)
  WHERE status = 'open';

COMMENT ON TABLE skater_challenges IS 'Coach-set goals for a skater; independent of the trick bag and skills_library';
COMMENT ON COLUMN skater_challenges.completed_by IS 'Who marked it done — the skater themselves or a coach/admin';

ALTER TABLE skater_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skater_challenges_select_own" ON skater_challenges;
CREATE POLICY "skater_challenges_select_own"
  ON skater_challenges FOR SELECT
  USING (auth.uid() = student_id);

-- Parents follow their kid's challenges from the family progress screen.
DROP POLICY IF EXISTS "skater_challenges_select_guardian" ON skater_challenges;
CREATE POLICY "skater_challenges_select_guardian"
  ON skater_challenges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = skater_challenges.student_id
        AND p.guardian_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "skater_challenges_select_staff" ON skater_challenges;
CREATE POLICY "skater_challenges_select_staff"
  ON skater_challenges FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('coach', 'admin'))
  );

DROP POLICY IF EXISTS "skater_challenges_insert_staff" ON skater_challenges;
CREATE POLICY "skater_challenges_insert_staff"
  ON skater_challenges FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('coach', 'admin'))
  );

DROP POLICY IF EXISTS "skater_challenges_update_staff" ON skater_challenges;
CREATE POLICY "skater_challenges_update_staff"
  ON skater_challenges FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('coach', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('coach', 'admin'))
  );

-- The skater accepts the challenge by marking it done; only staff create or delete.
DROP POLICY IF EXISTS "skater_challenges_update_own_status" ON skater_challenges;
CREATE POLICY "skater_challenges_update_own_status"
  ON skater_challenges FOR UPDATE
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "skater_challenges_delete_staff" ON skater_challenges;
CREATE POLICY "skater_challenges_delete_staff"
  ON skater_challenges FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('coach', 'admin'))
  );

DROP TRIGGER IF EXISTS update_skater_challenges_updated_at ON skater_challenges;
CREATE TRIGGER update_skater_challenges_updated_at
  BEFORE UPDATE ON skater_challenges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
