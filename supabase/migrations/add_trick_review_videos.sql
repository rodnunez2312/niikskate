-- A skater can send a trick for coach review and attach a video.
-- "done" stays with the coach, who confirms it in person.

ALTER TABLE student_skill_focus DROP CONSTRAINT IF EXISTS student_skill_focus_status_check;
ALTER TABLE student_skill_focus
  ADD CONSTRAINT student_skill_focus_status_check
  CHECK (status IN ('assigned', 'pending', 'review', 'done', 'dismissed'));

COMMENT ON TABLE student_skill_focus IS
  'Trick bag: assigned, pending (in progress), review (waiting on the coach), done (coach confirmed).';

CREATE TABLE IF NOT EXISTS trick_evidence_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  focus_id UUID NOT NULL REFERENCES student_skill_focus(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_path)
);

CREATE INDEX IF NOT EXISTS idx_trick_evidence_videos_student
  ON trick_evidence_videos (student_id);

ALTER TABLE trick_evidence_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read trick evidence" ON trick_evidence_videos;
CREATE POLICY "Staff read trick evidence"
  ON trick_evidence_videos FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('coach', 'admin'))
  );

DROP POLICY IF EXISTS "Family read trick evidence" ON trick_evidence_videos;
CREATE POLICY "Family read trick evidence"
  ON trick_evidence_videos FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = trick_evidence_videos.student_id
        AND p.guardian_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Family insert trick evidence" ON trick_evidence_videos;
CREATE POLICY "Family insert trick evidence"
  ON trick_evidence_videos FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      student_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = trick_evidence_videos.student_id
          AND p.guardian_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Guardians update family trick status" ON student_skill_focus;
CREATE POLICY "Guardians update family trick status"
  ON student_skill_focus FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = student_skill_focus.student_id
        AND p.guardian_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = student_skill_focus.student_id
        AND p.guardian_user_id = auth.uid()
    )
  );

-- Evidence clips live in the public images bucket under trick-evidence/{uploader}/.
DROP POLICY IF EXISTS "Family upload trick evidence" ON storage.objects;
CREATE POLICY "Family upload trick evidence"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND name LIKE 'trick-evidence/' || auth.uid()::text || '/%'
  );
