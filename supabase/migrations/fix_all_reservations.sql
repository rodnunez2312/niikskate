-- =====================================================
-- FIX ALL: RLS Policies + Add Feb 5th Reservation
-- Run this ONCE in Supabase SQL Editor
-- =====================================================

-- STEP 1: Fix RLS Policies for class_reservations
-- =====================================================

-- Drop all existing policies on class_reservations
DROP POLICY IF EXISTS "Users can view their own reservations" ON class_reservations;
DROP POLICY IF EXISTS "Users can create their own reservations" ON class_reservations;
DROP POLICY IF EXISTS "Users can update their own reservations" ON class_reservations;
DROP POLICY IF EXISTS "Users can delete their own reservations" ON class_reservations;
DROP POLICY IF EXISTS "Staff can view all reservations" ON class_reservations;
DROP POLICY IF EXISTS "Staff can manage all reservations" ON class_reservations;
DROP POLICY IF EXISTS "Admins can manage all reservations" ON class_reservations;
DROP POLICY IF EXISTS "Coaches can view all reservations" ON class_reservations;
DROP POLICY IF EXISTS "Anyone can view reservations" ON class_reservations;
DROP POLICY IF EXISTS "Allow all reads" ON class_reservations;
DROP POLICY IF EXISTS "Allow authenticated reads" ON class_reservations;

-- Enable RLS (if not already)
ALTER TABLE class_reservations ENABLE ROW LEVEL SECURITY;

-- Create simple policy: ALL authenticated users can SELECT all reservations
CREATE POLICY "Authenticated users can view all reservations"
ON class_reservations FOR SELECT
TO authenticated
USING (true);

-- Users can INSERT their own reservations
CREATE POLICY "Users can create reservations"
ON class_reservations FOR INSERT
TO authenticated
WITH CHECK (true);

-- Users can UPDATE reservations (coaches need this for attendance)
CREATE POLICY "Users can update reservations"
ON class_reservations FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Users can DELETE reservations
CREATE POLICY "Users can delete reservations"
ON class_reservations FOR DELETE
TO authenticated
USING (true);

-- STEP 2: Add Feb 5th Reservation for Test Skater
-- =====================================================

-- Delete any existing reservation for Feb 5th to avoid conflicts
DELETE FROM class_reservations 
WHERE reservation_date = '2026-02-05'
AND user_id = (SELECT id FROM profiles WHERE email = 'test.skater@niikskate.com');

-- Add reservation for Feb 5th, 2026 (Thursday) - 5:30 PM class
INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  '2026-02-05'::DATE,
  'early',
  'grouped_beginner',
  'active',
  'Thursday 5:30 PM class'
FROM profiles p
LEFT JOIN user_credits uc ON uc.user_id = p.id AND uc.credit_type = 'monthly_beginner'
WHERE p.email = 'test.skater@niikskate.com';

-- Also add for Feb 4th (today)
DELETE FROM class_reservations 
WHERE reservation_date = '2026-02-04'
AND user_id = (SELECT id FROM profiles WHERE email = 'test.skater@niikskate.com');

INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  '2026-02-04'::DATE,
  'early',
  'grouped_beginner',
  'active',
  'Tuesday 5:30 PM class'
FROM profiles p
LEFT JOIN user_credits uc ON uc.user_id = p.id AND uc.credit_type = 'monthly_beginner'
WHERE p.email = 'test.skater@niikskate.com';

-- STEP 3: Verify everything works
-- =====================================================

-- Show all reservations for Test Skater
SELECT 
  'Test Skater Reservations' as info,
  cr.reservation_date,
  cr.time_slot,
  cr.status,
  p.full_name
FROM class_reservations cr
JOIN profiles p ON p.id = cr.user_id
WHERE p.email = 'test.skater@niikskate.com'
ORDER BY cr.reservation_date;

-- Count total reservations in system
SELECT 
  'Total Reservations' as info,
  COUNT(*) as count
FROM class_reservations;
