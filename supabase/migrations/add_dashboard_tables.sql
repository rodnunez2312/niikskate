-- =====================================================
-- MIGRATION: Add Role-Based Dashboard Tables
-- Run this in Supabase SQL Editor
-- =====================================================

-- Create new enums
CREATE TYPE skill_difficulty AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE skill_category AS ENUM ('bowl', 'street', 'surf_skate', 'fundamentals', 'safety');
CREATE TYPE registration_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE coach_payment_status AS ENUM ('pending', 'paid');

-- =====================================================
-- SKILLS LIBRARY (Predefined tricks/skills)
-- =====================================================

CREATE TABLE skills_library (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  name_es TEXT,
  description TEXT NOT NULL,
  description_es TEXT,
  difficulty skill_difficulty NOT NULL,
  category skill_category NOT NULL,
  video_url TEXT,
  tips TEXT[],
  prerequisites UUID[],
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert sample skills
INSERT INTO skills_library (name, name_es, description, description_es, difficulty, category, tips, sort_order) VALUES
  -- Fundamentals
  ('Stance & Balance', 'Postura y Equilibrio', 'Learn proper foot placement and balance on the board', 'Aprende la colocación correcta de los pies y el equilibrio en la tabla', 'beginner', 'fundamentals', ARRAY['Keep knees slightly bent', 'Weight centered over the board', 'Look where you want to go'], 1),
  ('Pushing', 'Impulso', 'Learn to push and gain speed', 'Aprende a impulsarte y ganar velocidad', 'beginner', 'fundamentals', ARRAY['Push with back foot', 'Keep pushing foot parallel', 'Smooth, consistent pushes'], 2),
  ('Stopping', 'Frenado', 'Learn different braking techniques', 'Aprende diferentes técnicas de frenado', 'beginner', 'fundamentals', ARRAY['Foot drag is easiest', 'Tail scrape for emergencies', 'Practice at low speeds first'], 3),
  ('Turning', 'Giros', 'Learn to carve and turn', 'Aprende a hacer carves y girar', 'beginner', 'fundamentals', ARRAY['Lean into turns', 'Use your shoulders', 'Start with wide turns'], 4),
  ('Tick Tack', 'Tick Tack', 'Gain speed by pivoting the board', 'Gana velocidad pivotando la tabla', 'beginner', 'fundamentals', ARRAY['Lift front wheels', 'Quick left-right motion', 'Use shoulders to lead'], 5),
  
  -- Street - Beginner
  ('Ollie', 'Ollie', 'The fundamental jump trick', 'El truco de salto fundamental', 'beginner', 'street', ARRAY['Pop the tail hard', 'Slide front foot up', 'Jump with the board'], 10),
  ('Manual', 'Manual', 'Balance on back wheels while rolling', 'Equilibrio sobre las ruedas traseras mientras ruedas', 'beginner', 'street', ARRAY['Find balance point', 'Arms out for stability', 'Look ahead, not down'], 11),
  ('Shuvit', 'Shuvit', 'Spin the board 180 degrees beneath you', 'Gira la tabla 180 grados debajo de ti', 'beginner', 'street', ARRAY['Scoop back foot', 'Jump straight up', 'Catch with front foot'], 12),
  
  -- Street - Intermediate
  ('Kickflip', 'Kickflip', 'Flip the board with a flick of your front foot', 'Voltea la tabla con un flick del pie delantero', 'intermediate', 'street', ARRAY['Flick off the side', 'Pop and flick together', 'Keep shoulders level'], 20),
  ('Heelflip', 'Heelflip', 'Flip the board using your heel', 'Voltea la tabla usando el talón', 'intermediate', 'street', ARRAY['Flick with heel edge', 'Kick out and up', 'Stay over the board'], 21),
  ('50-50 Grind', '50-50 Grind', 'Grind with both trucks on the edge', 'Grind con ambos trucks en el borde', 'intermediate', 'street', ARRAY['Approach parallel', 'Lock both trucks', 'Lean slightly in'], 22),
  ('Boardslide', 'Boardslide', 'Slide on the middle of the board', 'Desliza sobre el centro de la tabla', 'intermediate', 'street', ARRAY['Turn 90 degrees', 'Center over obstacle', 'Keep weight centered'], 23),
  
  -- Street - Advanced
  ('Tre Flip', 'Tre Flip', '360 flip combining kickflip and 360 shuvit', '360 flip combinando kickflip y 360 shuvit', 'advanced', 'street', ARRAY['Strong scoop', 'Flick and scoop together', 'Catch at peak'], 30),
  ('Hardflip', 'Hardflip', 'Frontside pop shuvit with a kickflip', 'Pop shuvit frontside con kickflip', 'advanced', 'street', ARRAY['Pop straight down', 'Flick between legs', 'Jump forward slightly'], 31),
  
  -- Bowl - Beginner
  ('Dropping In', 'Tirarse', 'Enter the bowl from the coping', 'Entra al bowl desde el coping', 'beginner', 'bowl', ARRAY['Commit fully', 'Lean forward', 'Stomp front foot'], 40),
  ('Pumping', 'Bombear', 'Gain speed in transitions', 'Gana velocidad en las transiciones', 'beginner', 'bowl', ARRAY['Extend on way up', 'Compress on way down', 'Use whole body'], 41),
  ('Kick Turn', 'Kick Turn', 'Turn on the transition using the tail', 'Gira en la transición usando el tail', 'beginner', 'bowl', ARRAY['Lift front wheels', 'Pivot on back wheels', 'Use shoulders'], 42),
  
  -- Bowl - Intermediate
  ('Rock to Fakie', 'Rock to Fakie', 'Rock the front wheels over coping and roll back', 'Poner las ruedas frontales sobre el coping y regresar', 'intermediate', 'bowl', ARRAY['Approach with speed', 'Tap front wheels over', 'Lean back to return'], 50),
  ('Axle Stall', 'Axle Stall', 'Stall with both trucks on coping', 'Stall con ambos trucks en el coping', 'intermediate', 'bowl', ARRAY['Get both trucks over', 'Pause at the top', 'Lean in to drop'], 51),
  ('Frontside Grind', 'Frontside Grind', 'Grind frontside on pool coping', 'Grind frontside en el coping del pool', 'intermediate', 'bowl', ARRAY['Approach at angle', 'Lock front truck', 'Keep momentum'], 52),
  
  -- Bowl - Advanced
  ('Backside Air', 'Backside Air', 'Aerial with backside grab', 'Aéreo con agarre backside', 'advanced', 'bowl', ARRAY['Pump for speed', 'Grab indy or melon', 'Extend at peak'], 60),
  ('Frontside Air', 'Frontside Air', 'Aerial going frontside', 'Aéreo yendo frontside', 'advanced', 'bowl', ARRAY['Carve up the wall', 'Grab and extend', 'Spot your landing'], 61),
  
  -- Surf Skate
  ('Carving', 'Carving', 'Deep flowing turns like surfing', 'Giros profundos y fluidos como en el surf', 'beginner', 'surf_skate', ARRAY['Bend knees deep', 'Lead with shoulders', 'Flow like water'], 70),
  ('Pumping (Surf)', 'Bombeo (Surf)', 'Generate speed through body movement', 'Genera velocidad con el movimiento del cuerpo', 'beginner', 'surf_skate', ARRAY['Use whole body', 'Twist hips', 'Rhythmic motion'], 71),
  ('Snap', 'Snap', 'Quick direction change at top of carve', 'Cambio rápido de dirección arriba del carve', 'intermediate', 'surf_skate', ARRAY['Build up speed', 'Quick hip rotation', 'Weight on back foot'], 72),
  ('Cutback', 'Cutback', 'Sharp turn back toward the start', 'Giro cerrado de regreso hacia el inicio', 'intermediate', 'surf_skate', ARRAY['Carve wide first', 'Compress then extend', 'Lead with shoulders'], 73),
  
  -- Safety
  ('Falling Safely', 'Caer de Forma Segura', 'How to fall without injury', 'Cómo caer sin lesionarse', 'beginner', 'safety', ARRAY['Roll, don''t catch yourself', 'Protect your head', 'Relax your body'], 80),
  ('Equipment Check', 'Revisión de Equipo', 'Checking your board and safety gear', 'Revisar tu tabla y equipo de seguridad', 'beginner', 'safety', ARRAY['Check trucks tightness', 'Inspect wheels', 'Verify helmet fit'], 81);

-- =====================================================
-- STUDENT PROGRESS
-- =====================================================

CREATE TABLE student_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  skill_id UUID REFERENCES skills_library(id) ON DELETE CASCADE NOT NULL,
  learned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  marked_by UUID REFERENCES profiles(id),
  proficiency INTEGER DEFAULT 1 CHECK (proficiency >= 1 AND proficiency <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(student_id, skill_id)
);

-- =====================================================
-- GUEST BOOKINGS
-- =====================================================

CREATE TABLE guest_bookings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT,
  full_name TEXT NOT NULL,
  booking_data JSONB NOT NULL,
  linked_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- REGISTRATION REQUESTS
-- =====================================================

CREATE TABLE registration_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  message TEXT,
  status registration_status DEFAULT 'pending' NOT NULL,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- ATTENDANCE
-- =====================================================

CREATE TABLE attendance (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  class_date DATE NOT NULL,
  time_slot time_slot NOT NULL,
  attended BOOLEAN DEFAULT FALSE NOT NULL,
  marked_by UUID REFERENCES profiles(id),
  marked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(student_id, class_date, time_slot)
);

-- =====================================================
-- CLASS PLANS
-- =====================================================

CREATE TABLE class_plans (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  plan_date DATE NOT NULL,
  time_slot time_slot NOT NULL,
  title TEXT,
  planned_skills UUID[],
  warmup_notes TEXT,
  main_activity_notes TEXT,
  cooldown_notes TEXT,
  equipment_needed TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(coach_id, plan_date, time_slot)
);

-- =====================================================
-- COACH PAYMENTS
-- =====================================================

CREATE TABLE coach_payments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  classes_taught INTEGER DEFAULT 0,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'MXN',
  status coach_payment_status DEFAULT 'pending' NOT NULL,
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES profiles(id),
  payment_method payment_method,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- NEWS & EVENTS
-- =====================================================

CREATE TABLE news_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  title_es TEXT,
  content TEXT NOT NULL,
  content_es TEXT,
  event_type TEXT DEFAULT 'news',
  event_date DATE,
  event_location TEXT,
  image_url TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_skills_library_category ON skills_library(category);
CREATE INDEX idx_skills_library_difficulty ON skills_library(difficulty);
CREATE INDEX idx_student_progress_student ON student_progress(student_id);
CREATE INDEX idx_student_progress_skill ON student_progress(skill_id);
CREATE INDEX idx_guest_bookings_email ON guest_bookings(email);
CREATE INDEX idx_guest_bookings_linked_user ON guest_bookings(linked_user_id);
CREATE INDEX idx_registration_requests_status ON registration_requests(status);
CREATE INDEX idx_registration_requests_email ON registration_requests(email);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_date ON attendance(class_date);
CREATE INDEX idx_class_plans_coach ON class_plans(coach_id);
CREATE INDEX idx_class_plans_date ON class_plans(plan_date);
CREATE INDEX idx_coach_payments_coach ON coach_payments(coach_id);
CREATE INDEX idx_coach_payments_status ON coach_payments(status);
CREATE INDEX idx_news_events_type ON news_events(event_type);
CREATE INDEX idx_news_events_published ON news_events(is_published);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE skills_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_events ENABLE ROW LEVEL SECURITY;

-- Skills library policies
CREATE POLICY "Skills viewable by everyone" ON skills_library FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage skills" ON skills_library FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Student progress policies
CREATE POLICY "Users can view own progress" ON student_progress FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Coaches and admins can view all progress" ON student_progress FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);
CREATE POLICY "Coaches can mark progress" ON student_progress FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);
CREATE POLICY "Coaches can update progress" ON student_progress FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);

-- Guest bookings policies
CREATE POLICY "Anyone can create guest booking" ON guest_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view guest bookings" ON guest_bookings FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can update guest bookings" ON guest_bookings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Registration requests policies
CREATE POLICY "Anyone can create registration request" ON registration_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own request" ON registration_requests FOR SELECT USING (
  email = (SELECT email FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "Admins can view all requests" ON registration_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can update requests" ON registration_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Attendance policies
CREATE POLICY "Users can view own attendance" ON attendance FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Coaches and admins can view all attendance" ON attendance FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);
CREATE POLICY "Coaches and admins can manage attendance" ON attendance FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);

-- Class plans policies
CREATE POLICY "Coaches can view own plans" ON class_plans FOR SELECT USING (auth.uid() = coach_id);
CREATE POLICY "Admins can view all plans" ON class_plans FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Coaches can manage own plans" ON class_plans FOR ALL USING (auth.uid() = coach_id);
CREATE POLICY "Admins can manage all plans" ON class_plans FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Coach payments policies
CREATE POLICY "Coaches can view own payments" ON coach_payments FOR SELECT USING (auth.uid() = coach_id);
CREATE POLICY "Admins can manage payments" ON coach_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- News events policies
CREATE POLICY "Anyone can view published news" ON news_events FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can view all news" ON news_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can manage news" ON news_events FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE TRIGGER update_skills_library_updated_at
  BEFORE UPDATE ON skills_library FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_registration_requests_updated_at
  BEFORE UPDATE ON registration_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_class_plans_updated_at
  BEFORE UPDATE ON class_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_coach_payments_updated_at
  BEFORE UPDATE ON coach_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_news_events_updated_at
  BEFORE UPDATE ON news_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
