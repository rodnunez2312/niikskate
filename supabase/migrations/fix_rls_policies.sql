-- =====================================================
-- Fix RLS Policies for class_reservations
-- This ensures coaches can see all reservations
-- =====================================================

-- First, let's see what policies exist
-- SELECT * FROM pg_policies WHERE tablename = 'class_reservations';

-- Drop existing policies that might conflict
DROP POLICY IF EXISTS "Users can view own reservations" ON class_reservations;
DROP POLICY IF EXISTS "Users can create own reservations" ON class_reservations;
DROP POLICY IF EXISTS "Coaches can view reservations" ON class_reservations;
DROP POLICY IF EXISTS "Coaches can manage reservations" ON class_reservations;
DROP POLICY IF EXISTS "Admins can manage all reservations" ON class_reservations;

-- Create clear, non-conflicting policies

-- 1. Users can view their own reservations
CREATE POLICY "Users view own reservations" ON class_reservations
  FOR SELECT USING (auth.uid() = user_id);

-- 2. Users can create their own reservations
CREATE POLICY "Users create own reservations" ON class_reservations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. Users can update their own reservations
CREATE POLICY "Users update own reservations" ON class_reservations
  FOR UPDATE USING (auth.uid() = user_id);

-- 4. Coaches and Admins can view ALL reservations
CREATE POLICY "Staff view all reservations" ON class_reservations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

-- 5. Coaches and Admins can insert reservations for anyone
CREATE POLICY "Staff create reservations" ON class_reservations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

-- 6. Coaches and Admins can update any reservation
CREATE POLICY "Staff update reservations" ON class_reservations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

-- 7. Coaches and Admins can delete reservations
CREATE POLICY "Staff delete reservations" ON class_reservations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

-- Verify policies
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'class_reservations';

-- Test query - this should show Test Skater's reservation for Feb 5
SELECT 
  cr.reservation_date,
  cr.time_slot,
  p.full_name
FROM class_reservations cr
JOIN profiles p ON p.id = cr.user_id
WHERE cr.reservation_date = '2026-02-05'
  AND cr.time_slot = 'early'
  AND cr.status = 'active';
