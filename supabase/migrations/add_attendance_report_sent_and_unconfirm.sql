-- Allow staff to unconfirm (toggle off) by deleting from attendance_confirmed
DROP POLICY IF EXISTS "Staff can confirm attendance" ON attendance_confirmed;
CREATE POLICY "Staff can confirm attendance" ON attendance_confirmed
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );

-- Table: attendance_report_sent
-- Records when the final roster was saved/sent for a given class date.
CREATE TABLE IF NOT EXISTS attendance_report_sent (
  class_date DATE PRIMARY KEY,
  sent_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE attendance_report_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view report sent" ON attendance_report_sent;
CREATE POLICY "Staff can view report sent" ON attendance_report_sent
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );

DROP POLICY IF EXISTS "Staff can save report sent" ON attendance_report_sent;
CREATE POLICY "Staff can save report sent" ON attendance_report_sent
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );

DROP POLICY IF EXISTS "Staff can update report sent" ON attendance_report_sent;
CREATE POLICY "Staff can update report sent" ON attendance_report_sent
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );
