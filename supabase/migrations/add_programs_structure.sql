-- Programs structure: programs, program_coaches, program_students (athletes)
-- For coaches/admins to configure programs and assign coaches and students.

CREATE TABLE IF NOT EXISTS programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS program_coaches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE NOT NULL,
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(program_id, coach_id)
);

CREATE TABLE IF NOT EXISTS program_students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID REFERENCES programs(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(program_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_program_coaches_program ON program_coaches(program_id);
CREATE INDEX IF NOT EXISTS idx_program_coaches_coach ON program_coaches(coach_id);
CREATE INDEX IF NOT EXISTS idx_program_students_program ON program_students(program_id);
CREATE INDEX IF NOT EXISTS idx_program_students_student ON program_students(student_id);

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_coaches ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_students ENABLE ROW LEVEL SECURITY;

-- Coaches and admins can read/write programs and assignments
DROP POLICY IF EXISTS "Coaches and admins can manage programs" ON programs;
CREATE POLICY "Coaches and admins can manage programs" ON programs
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );

DROP POLICY IF EXISTS "Coaches and admins can manage program_coaches" ON program_coaches;
CREATE POLICY "Coaches and admins can manage program_coaches" ON program_coaches
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );

DROP POLICY IF EXISTS "Coaches and admins can manage program_students" ON program_students;
CREATE POLICY "Coaches and admins can manage program_students" ON program_students
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );

-- Seed 4 main programs (insert if not already present)
INSERT INTO programs (name, description, is_active)
SELECT '1 - Iniciacion', 'Introduction / beginner program', true
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE name = '1 - Iniciacion');
INSERT INTO programs (name, description, is_active)
SELECT '2 - Street', 'Street skating program', true
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE name = '2 - Street');
INSERT INTO programs (name, description, is_active)
SELECT '3 - Park', 'Park / bowl program', true
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE name = '3 - Park');
INSERT INTO programs (name, description, is_active)
SELECT '4 - Advanced', 'Advanced program', true
WHERE NOT EXISTS (SELECT 1 FROM programs WHERE name = '4 - Advanced');
