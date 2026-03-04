-- =====================================================
-- Add reservation for Test Skater on Feb 5th, 2026
-- 5:30 PM class (early slot)
-- =====================================================

-- First, let's see existing reservations
SELECT 
  cr.reservation_date,
  cr.time_slot,
  cr.status,
  cr.notes
FROM class_reservations cr
JOIN profiles p ON p.id = cr.user_id
WHERE p.email = 'test.skater@niikskate.com'
ORDER BY cr.reservation_date;

-- Add reservation for Feb 5th, 2026 (Thursday) - 5:30 PM class
INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  '2026-02-05'::DATE,  -- Feb 5th, 2026
  'early',             -- 5:30 PM - 7:00 PM slot
  'grouped_beginner',
  'active',
  'Thursday 5:30 PM class - Feb 5th'
FROM profiles p
JOIN user_credits uc ON uc.user_id = p.id
WHERE p.email = 'test.skater@niikskate.com'
AND uc.credit_type = 'monthly_beginner'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

-- Also add for today (Feb 4th) to test
INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  '2026-02-04'::DATE,  -- Feb 4th, 2026 (Today)
  'early',             -- 5:30 PM - 7:00 PM slot
  'grouped_beginner',
  'active',
  'Tuesday 5:30 PM class - Feb 4th'
FROM profiles p
JOIN user_credits uc ON uc.user_id = p.id
WHERE p.email = 'test.skater@niikskate.com'
AND uc.credit_type = 'monthly_beginner'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

-- Verify
SELECT 
  cr.reservation_date,
  cr.time_slot,
  cr.status,
  p.full_name
FROM class_reservations cr
JOIN profiles p ON p.id = cr.user_id
WHERE p.email = 'test.skater@niikskate.com'
ORDER BY cr.reservation_date;
