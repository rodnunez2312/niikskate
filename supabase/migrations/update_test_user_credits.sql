-- =====================================================
-- STEP 1: Create Credits System Tables (if not exist)
-- Run this in Supabase SQL Editor
-- =====================================================

-- Create credit_type enum if not exists
DO $$ BEGIN
  CREATE TYPE credit_type AS ENUM (
    'monthly_beginner',
    'monthly_intermediate',
    'pkg_3',
    'pkg_5',
    'pkg_10',
    'saturdays',
    'single_group',
    'single_individual'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create credit_status enum if not exists
DO $$ BEGIN
  CREATE TYPE credit_status AS ENUM (
    'active',
    'used',
    'expired',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create user_credits table if not exists
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  credit_type credit_type NOT NULL,
  total_credits INTEGER NOT NULL,
  remaining_credits INTEGER NOT NULL,
  purchase_date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expiration_date TIMESTAMPTZ NOT NULL,
  price_paid_mxn DECIMAL(10, 2),
  price_paid_usd DECIMAL(10, 2),
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create class_reservations table if not exists
CREATE TABLE IF NOT EXISTS class_reservations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  credit_id UUID REFERENCES user_credits(id) ON DELETE SET NULL,
  reservation_date DATE NOT NULL,
  time_slot time_slot NOT NULL,
  class_type class_type,
  status credit_status DEFAULT 'active' NOT NULL,
  equipment_rental JSONB DEFAULT '[]',
  coach_id UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, reservation_date, time_slot)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_expiration ON user_credits(expiration_date);
CREATE INDEX IF NOT EXISTS idx_class_reservations_user_id ON class_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_class_reservations_date ON class_reservations(reservation_date);

-- Enable RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_reservations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_credits
DROP POLICY IF EXISTS "Users can view own credits" ON user_credits;
CREATE POLICY "Users can view own credits" ON user_credits FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all credits" ON user_credits;
CREATE POLICY "Admins can manage all credits" ON user_credits FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- RLS Policies for class_reservations
DROP POLICY IF EXISTS "Users can view own reservations" ON class_reservations;
CREATE POLICY "Users can view own reservations" ON class_reservations FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own reservations" ON class_reservations;
CREATE POLICY "Users can create own reservations" ON class_reservations FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Coaches can view reservations" ON class_reservations;
CREATE POLICY "Coaches can view reservations" ON class_reservations FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);

DROP POLICY IF EXISTS "Admins can manage all reservations" ON class_reservations;
CREATE POLICY "Admins can manage all reservations" ON class_reservations FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Coaches can manage reservations" ON class_reservations;
CREATE POLICY "Coaches can manage reservations" ON class_reservations FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);

-- =====================================================
-- STEP 2: Update Test Skater with Monthly 2-per-week Plan
-- =====================================================

-- Delete any existing credits for the test user
DELETE FROM user_credits 
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test.skater@niikskate.com');

-- Delete existing reservations
DELETE FROM class_reservations 
WHERE user_id = (SELECT id FROM profiles WHERE email = 'test.skater@niikskate.com');

-- Insert a monthly beginner plan (8 classes, 2 per week)
INSERT INTO user_credits (
  user_id,
  credit_type,
  total_credits,
  remaining_credits,
  purchase_date,
  expiration_date,
  price_paid_mxn,
  payment_method,
  payment_status,
  notes
) VALUES (
  (SELECT id FROM profiles WHERE email = 'test.skater@niikskate.com'),
  'monthly_beginner',
  8,
  8,
  NOW(),
  NOW() + INTERVAL '30 days',
  1040.00,  -- Monthly price
  'cash',
  'paid',
  'Monthly plan: 2 classes per week (alternating Thu/Sat and Tue/Thu)'
);

-- Add reservations for this week (example: Thursday and Saturday)
-- Week 1: Thursday and Saturday
INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  CURRENT_DATE + (4 - EXTRACT(DOW FROM CURRENT_DATE))::INT,  -- Next Thursday
  'early',
  'grouped_beginner',
  'active',
  'Week 1 - Thursday class'
FROM profiles p
JOIN user_credits uc ON uc.user_id = p.id
WHERE p.email = 'test.skater@niikskate.com'
AND uc.credit_type = 'monthly_beginner'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  CURRENT_DATE + (6 - EXTRACT(DOW FROM CURRENT_DATE))::INT,  -- Next Saturday
  'early',
  'grouped_beginner',
  'active',
  'Week 1 - Saturday class'
FROM profiles p
JOIN user_credits uc ON uc.user_id = p.id
WHERE p.email = 'test.skater@niikskate.com'
AND uc.credit_type = 'monthly_beginner'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

-- Week 2: Tuesday and Thursday (next week)
INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  CURRENT_DATE + 7 + (2 - EXTRACT(DOW FROM CURRENT_DATE))::INT,  -- Next Tuesday
  'early',
  'grouped_beginner',
  'active',
  'Week 2 - Tuesday class'
FROM profiles p
JOIN user_credits uc ON uc.user_id = p.id
WHERE p.email = 'test.skater@niikskate.com'
AND uc.credit_type = 'monthly_beginner'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  CURRENT_DATE + 7 + (4 - EXTRACT(DOW FROM CURRENT_DATE))::INT,  -- Next Thursday
  'early',
  'grouped_beginner',
  'active',
  'Week 2 - Thursday class'
FROM profiles p
JOIN user_credits uc ON uc.user_id = p.id
WHERE p.email = 'test.skater@niikskate.com'
AND uc.credit_type = 'monthly_beginner'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

-- Add some attendance history for the test user
INSERT INTO attendance (student_id, class_date, time_slot, attended, marked_at)
SELECT 
  id,
  CURRENT_DATE - INTERVAL '7 days',
  'early',
  true,
  NOW()
FROM profiles WHERE email = 'test.skater@niikskate.com'
ON CONFLICT (student_id, class_date, time_slot) DO NOTHING;

INSERT INTO attendance (student_id, class_date, time_slot, attended, marked_at)
SELECT 
  id,
  CURRENT_DATE - INTERVAL '5 days',
  'early',
  true,
  NOW()
FROM profiles WHERE email = 'test.skater@niikskate.com'
ON CONFLICT (student_id, class_date, time_slot) DO NOTHING;

INSERT INTO attendance (student_id, class_date, time_slot, attended, marked_at)
SELECT 
  id,
  CURRENT_DATE - INTERVAL '2 days',
  'early',
  true,
  NOW()
FROM profiles WHERE email = 'test.skater@niikskate.com'
ON CONFLICT (student_id, class_date, time_slot) DO NOTHING;

-- Verify the updates
SELECT 
  p.full_name,
  p.email,
  uc.credit_type,
  uc.total_credits,
  uc.remaining_credits,
  uc.expiration_date
FROM profiles p
JOIN user_credits uc ON uc.user_id = p.id
WHERE p.email = 'test.skater@niikskate.com';

-- Show reservations
SELECT 
  cr.reservation_date,
  cr.time_slot,
  cr.notes
FROM class_reservations cr
JOIN profiles p ON p.id = cr.user_id
WHERE p.email = 'test.skater@niikskate.com'
ORDER BY cr.reservation_date;
