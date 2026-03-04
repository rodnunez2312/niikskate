-- =====================================================
-- Fix reservations to use correct auth user ID
-- =====================================================

-- First, let's see the auth user for test.skater
SELECT 'AUTH USER' as info, id, email 
FROM auth.users 
WHERE email = 'test.skater@niikskate.com';

-- See the profile for test.skater  
SELECT 'PROFILE' as info, id, email, full_name 
FROM profiles 
WHERE email = 'test.skater@niikskate.com';

-- See current reservations and their user_id
SELECT 'CURRENT RESERVATIONS' as info,
  cr.id,
  cr.user_id,
  cr.reservation_date,
  cr.time_slot,
  cr.status
FROM class_reservations cr
WHERE cr.reservation_date >= CURRENT_DATE;

-- Update reservations to use the auth user ID (which should match profile ID)
-- In Supabase, auth.users.id should equal profiles.id

-- Delete existing test reservations first
DELETE FROM class_reservations 
WHERE user_id IN (SELECT id FROM profiles WHERE email = 'test.skater@niikskate.com');

-- Re-create reservations using the auth user ID directly
INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  au.id,  -- Use auth.users.id directly
  uc.id,
  '2026-02-04'::DATE,
  'early',
  'grouped_beginner',
  'active',
  'Tuesday 5:30 PM class'
FROM auth.users au
LEFT JOIN user_credits uc ON uc.user_id = au.id
WHERE au.email = 'test.skater@niikskate.com'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  au.id,
  uc.id,
  '2026-02-05'::DATE,
  'early',
  'grouped_beginner',
  'active',
  'Thursday 5:30 PM class'
FROM auth.users au
LEFT JOIN user_credits uc ON uc.user_id = au.id
WHERE au.email = 'test.skater@niikskate.com'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  au.id,
  uc.id,
  '2026-02-06'::DATE,
  'early',
  'grouped_beginner',
  'active',
  'Friday 5:30 PM class'
FROM auth.users au
LEFT JOIN user_credits uc ON uc.user_id = au.id
WHERE au.email = 'test.skater@niikskate.com'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  au.id,
  uc.id,
  '2026-02-07'::DATE,
  'early',
  'grouped_beginner',
  'active',
  'Saturday 5:30 PM class'
FROM auth.users au
LEFT JOIN user_credits uc ON uc.user_id = au.id
WHERE au.email = 'test.skater@niikskate.com'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

-- Verify the new reservations
SELECT 'NEW RESERVATIONS' as info,
  cr.user_id,
  cr.reservation_date,
  cr.time_slot,
  cr.status,
  au.email
FROM class_reservations cr
JOIN auth.users au ON au.id = cr.user_id
WHERE au.email = 'test.skater@niikskate.com'
ORDER BY cr.reservation_date;
