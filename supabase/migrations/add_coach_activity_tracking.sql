-- Two things the coach activity page needs that nothing recorded.
--
-- 1. Who actually taught a class. Capacity was inferred from who was *available*
--    for a slot (coachCount x SPOTS_PER_COACH), which is a forecast, not a
--    record. Nothing said "Itza taught Tuesday's 5:30", so "classes given" could
--    not be counted for anyone.
-- 2. Progress videos. Coaches film a skater's attempt and attach it to the
--    evaluation; the files had nowhere to live.

-- ---------------------------------------------------------------------------
-- Who taught the class
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS class_session_coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_event_id UUID NOT NULL REFERENCES school_calendar_events(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Set when the class is scheduled; cleared to false if the coach did not show.
  delivered BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (calendar_event_id, coach_id)
);

COMMENT ON TABLE class_session_coaches IS
  'Which coaches ran a scheduled class. Capacity still comes from coach_date_availability; this is the record of what happened.';
COMMENT ON COLUMN class_session_coaches.delivered IS
  'False when the coach was assigned but did not take the class, so it is not counted as given.';

CREATE INDEX IF NOT EXISTS idx_class_session_coaches_event
  ON class_session_coaches (calendar_event_id);
CREATE INDEX IF NOT EXISTS idx_class_session_coaches_coach
  ON class_session_coaches (coach_id);

ALTER TABLE class_session_coaches ENABLE ROW LEVEL SECURITY;

-- Staff read the whole board; only admins change who is on it.
DROP POLICY IF EXISTS "Staff can read class_session_coaches" ON class_session_coaches;
CREATE POLICY "Staff can read class_session_coaches" ON class_session_coaches
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );

DROP POLICY IF EXISTS "Admins can manage class_session_coaches" ON class_session_coaches;
CREATE POLICY "Admins can manage class_session_coaches" ON class_session_coaches
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- Progress videos on an evaluation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS evaluation_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES student_evaluations(id) ON DELETE CASCADE,
  -- Denormalised so the activity page can count a coach's uploads without
  -- joining through an evaluation that may later be reassigned.
  coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  caption TEXT,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_path)
);

COMMENT ON TABLE evaluation_videos IS
  'Progress clips a coach filmed for a skater, attached to the evaluation they belong to.';
COMMENT ON COLUMN evaluation_videos.storage_path IS
  'Path inside the videos storage bucket, e.g. evaluations/<evaluation_id>/<uuid>.mp4';

CREATE INDEX IF NOT EXISTS idx_evaluation_videos_evaluation
  ON evaluation_videos (evaluation_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_videos_coach
  ON evaluation_videos (coach_id);

ALTER TABLE evaluation_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage evaluation_videos" ON evaluation_videos;
CREATE POLICY "Staff can manage evaluation_videos" ON evaluation_videos
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );

-- A skater (or the guardian holding their account) sees clips on evaluations
-- that were shared with them.
DROP POLICY IF EXISTS "Skaters can read their shared evaluation_videos" ON evaluation_videos;
CREATE POLICY "Skaters can read their shared evaluation_videos" ON evaluation_videos
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM student_evaluations e
      WHERE e.id = evaluation_videos.evaluation_id
        AND e.is_shared_with_parent
        AND (
          e.student_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = e.student_id AND p.guardian_user_id = auth.uid()
          )
        )
    )
  );
