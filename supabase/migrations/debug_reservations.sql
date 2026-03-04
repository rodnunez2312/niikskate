-- Debug: Check reservations for Feb 5, 2026
SELECT 
  cr.id,
  cr.reservation_date,
  cr.time_slot,
  cr.status,
  p.full_name,
  p.email
FROM class_reservations cr
JOIN profiles p ON p.id = cr.user_id
WHERE cr.reservation_date = '2026-02-05'
ORDER BY cr.time_slot;

-- Check all reservations for Test Skater
SELECT 
  cr.reservation_date,
  cr.time_slot,
  cr.status,
  cr.notes
FROM class_reservations cr
JOIN profiles p ON p.id = cr.user_id
WHERE p.email = 'test.skater@niikskate.com'
ORDER BY cr.reservation_date;

-- Check RLS is not blocking - run as service role or disable RLS temporarily
-- The issue might be that RLS is blocking the coach from seeing reservations
