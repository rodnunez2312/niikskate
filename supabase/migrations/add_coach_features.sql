-- Coach Features Migration
-- Adds tables for: Emergency Contacts, Favorite Students, Monthly Approval Tracking, Student Evaluations

-- 1. Emergency Contacts Table
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- e.g., 'park_manager', 'medical', 'admin', 'other'
  phone TEXT NOT NULL,
  email TEXT,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Coach Monthly Approval Table (track when coaches approve their availability)
CREATE TABLE IF NOT EXISTS coach_monthly_approvals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  approved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(coach_id, year, month)
);

-- 3. Coach Favorite Students Table
CREATE TABLE IF NOT EXISTS coach_favorite_students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(coach_id, student_id)
);

-- 4. Student Evaluations Table (periodic assessments)
CREATE TABLE IF NOT EXISTS student_evaluations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Rating areas (1-5 scale)
  balance_rating INTEGER CHECK (balance_rating >= 1 AND balance_rating <= 5),
  technique_rating INTEGER CHECK (technique_rating >= 1 AND technique_rating <= 5),
  consistency_rating INTEGER CHECK (consistency_rating >= 1 AND consistency_rating <= 5),
  creativity_rating INTEGER CHECK (creativity_rating >= 1 AND creativity_rating <= 5),
  safety_rating INTEGER CHECK (safety_rating >= 1 AND safety_rating <= 5),
  effort_rating INTEGER CHECK (effort_rating >= 1 AND effort_rating <= 5),
  -- Overall assessment
  overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
  strengths TEXT,
  areas_to_improve TEXT,
  goals_for_next_period TEXT,
  notes TEXT,
  is_shared_with_parent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_coach_monthly_approvals_coach ON coach_monthly_approvals(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_monthly_approvals_period ON coach_monthly_approvals(year, month);
CREATE INDEX IF NOT EXISTS idx_coach_favorite_students_coach ON coach_favorite_students(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_favorite_students_student ON coach_favorite_students(student_id);
CREATE INDEX IF NOT EXISTS idx_student_evaluations_student ON student_evaluations(student_id);
CREATE INDEX IF NOT EXISTS idx_student_evaluations_coach ON student_evaluations(coach_id);
CREATE INDEX IF NOT EXISTS idx_student_evaluations_date ON student_evaluations(evaluation_date);

-- Enable RLS
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_monthly_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_favorite_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_evaluations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for emergency_contacts (readable by all authenticated users)
DROP POLICY IF EXISTS "Anyone can read active emergency contacts" ON emergency_contacts;
CREATE POLICY "Anyone can read active emergency contacts" ON emergency_contacts
  FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage emergency contacts" ON emergency_contacts;
CREATE POLICY "Admins can manage emergency contacts" ON emergency_contacts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for coach_monthly_approvals
DROP POLICY IF EXISTS "Coaches can manage own approvals" ON coach_monthly_approvals;
CREATE POLICY "Coaches can manage own approvals" ON coach_monthly_approvals
  FOR ALL TO authenticated
  USING (coach_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (coach_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for coach_favorite_students
DROP POLICY IF EXISTS "Coaches can manage own favorites" ON coach_favorite_students;
CREATE POLICY "Coaches can manage own favorites" ON coach_favorite_students
  FOR ALL TO authenticated
  USING (coach_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (coach_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- RLS Policies for student_evaluations
DROP POLICY IF EXISTS "Coaches can manage evaluations" ON student_evaluations;
CREATE POLICY "Coaches can manage evaluations" ON student_evaluations
  FOR ALL TO authenticated
  USING (
    coach_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    coach_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "Students can view shared evaluations" ON student_evaluations;
CREATE POLICY "Students can view shared evaluations" ON student_evaluations
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() AND is_shared_with_parent = true);

-- Insert default emergency contacts
INSERT INTO emergency_contacts (name, role, phone, email, description, sort_order) VALUES
  ('NiikSkate Admin', 'admin', '+52 55 1234 5678', 'admin@niikskate.com', 'Main administrative contact for all academy matters', 1),
  ('Skatepark Manager', 'park_manager', '+52 55 8765 4321', 'parque@niikskate.com', 'Contact for facility issues, equipment problems', 2),
  ('Emergency Medical', 'medical', '911', NULL, 'For serious injuries requiring immediate medical attention', 3),
  ('First Aid Kit Location', 'other', 'N/A', NULL, 'Located in the main office next to the entrance', 4)
ON CONFLICT DO NOTHING;

-- Verify tables created
SELECT 'emergency_contacts' as table_name, COUNT(*) as row_count FROM emergency_contacts
UNION ALL
SELECT 'coach_monthly_approvals', COUNT(*) FROM coach_monthly_approvals
UNION ALL
SELECT 'coach_favorite_students', COUNT(*) FROM coach_favorite_students
UNION ALL
SELECT 'student_evaluations', COUNT(*) FROM student_evaluations;
