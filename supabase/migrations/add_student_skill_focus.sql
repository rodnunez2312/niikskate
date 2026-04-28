-- Coach-assigned skills / focus for skaters (unlock practice targets)
CREATE TABLE IF NOT EXISTS student_skill_focus (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_id UUID NOT NULL REFERENCES skills_library(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  coach_note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_student_skill_focus_student ON student_skill_focus(student_id);
CREATE INDEX IF NOT EXISTS idx_student_skill_focus_active ON student_skill_focus(student_id) WHERE status = 'active';

ALTER TABLE student_skill_focus ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_skill_focus_select_own"
  ON student_skill_focus FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "student_skill_focus_select_staff"
  ON student_skill_focus FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('coach', 'admin'))
  );

CREATE POLICY "student_skill_focus_insert_staff"
  ON student_skill_focus FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('coach', 'admin'))
  );

CREATE POLICY "student_skill_focus_update_staff"
  ON student_skill_focus FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('coach', 'admin'))
  );

CREATE POLICY "student_skill_focus_update_own_status"
  ON student_skill_focus FOR UPDATE
  USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);

COMMENT ON TABLE student_skill_focus IS 'Coach-assigned library skills for a skater to practice toward unlocking';

-- One active assignment per skater per skill
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_skill_focus_active_unique
  ON student_skill_focus (student_id, skill_id)
  WHERE status = 'active';
