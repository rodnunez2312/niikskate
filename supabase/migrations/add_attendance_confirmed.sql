-- Table: attendance_confirmed
-- Records when a coach/admin has confirmed (locked) attendance for a session.
-- Once confirmed, attendance for that class_date + time_slot is not editable.

CREATE TABLE IF NOT EXISTS attendance_confirmed (
  class_date DATE NOT NULL,
  time_slot TEXT NOT NULL CHECK (time_slot IN ('early', 'late')),
  confirmed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (class_date, time_slot)
);

CREATE INDEX IF NOT EXISTS idx_attendance_confirmed_date ON attendance_confirmed(class_date);

ALTER TABLE attendance_confirmed ENABLE ROW LEVEL SECURITY;

-- Coaches and admins can view and insert (confirm); no update/delete so once saved it stays
DROP POLICY IF EXISTS "Staff can view attendance confirmed" ON attendance_confirmed;
CREATE POLICY "Staff can view attendance confirmed" ON attendance_confirmed
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );

DROP POLICY IF EXISTS "Staff can confirm attendance" ON attendance_confirmed;
CREATE POLICY "Staff can confirm attendance" ON attendance_confirmed
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );
