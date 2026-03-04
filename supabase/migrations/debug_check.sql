-- Quick debug to check what's in the database

-- 1. Check if Test Skater profile exists
SELECT 'PROFILES' as table_name, id, full_name, email 
FROM profiles 
WHERE email = 'test.skater@niikskate.com';

-- 2. Check ALL reservations in the system
SELECT 'ALL RESERVATIONS' as info, 
  cr.id,
  cr.user_id,
  cr.reservation_date,
  cr.time_slot,
  cr.status
FROM class_reservations cr
ORDER BY cr.reservation_date;

-- 3. Check reservations specifically for Feb 5th
SELECT 'FEB 5 RESERVATIONS' as info,
  cr.*
FROM class_reservations cr
WHERE cr.reservation_date = '2026-02-05';

-- 4. Check if RLS is blocking (run as authenticated user)
SELECT 'RLS CHECK' as info, COUNT(*) as total_visible 
FROM class_reservations;

-- 5. Check foreign key relationship
SELECT 
  'FK CHECK' as info,
  cr.id as reservation_id,
  cr.user_id,
  p.id as profile_id,
  p.full_name
FROM class_reservations cr
LEFT JOIN profiles p ON p.id = cr.user_id
WHERE cr.reservation_date = '2026-02-05';
