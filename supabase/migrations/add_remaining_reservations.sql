-- =====================================================
-- Add remaining 4 reservations for Test Skater
-- Week 3: Thursday and Saturday
-- Week 4: Tuesday and Thursday
-- =====================================================

-- Week 3: Thursday (alternating back to Thu/Sat pattern)
INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  '2026-02-19'::DATE,  -- Week 3 Thursday
  'early',
  'grouped_beginner',
  'active',
  'Week 3 - Thursday class'
FROM profiles p
JOIN user_credits uc ON uc.user_id = p.id
WHERE p.email = 'test.skater@niikskate.com'
AND uc.credit_type = 'monthly_beginner'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

-- Week 3: Saturday
INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  '2026-02-21'::DATE,  -- Week 3 Saturday
  'early',
  'grouped_beginner',
  'active',
  'Week 3 - Saturday class'
FROM profiles p
JOIN user_credits uc ON uc.user_id = p.id
WHERE p.email = 'test.skater@niikskate.com'
AND uc.credit_type = 'monthly_beginner'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

-- Week 4: Tuesday (alternating to Tue/Thu pattern)
INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  '2026-02-24'::DATE,  -- Week 4 Tuesday
  'early',
  'grouped_beginner',
  'active',
  'Week 4 - Tuesday class'
FROM profiles p
JOIN user_credits uc ON uc.user_id = p.id
WHERE p.email = 'test.skater@niikskate.com'
AND uc.credit_type = 'monthly_beginner'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

-- Week 4: Thursday
INSERT INTO class_reservations (user_id, credit_id, reservation_date, time_slot, class_type, status, notes)
SELECT 
  p.id,
  uc.id,
  '2026-02-26'::DATE,  -- Week 4 Thursday
  'early',
  'grouped_beginner',
  'active',
  'Week 4 - Thursday class'
FROM profiles p
JOIN user_credits uc ON uc.user_id = p.id
WHERE p.email = 'test.skater@niikskate.com'
AND uc.credit_type = 'monthly_beginner'
ON CONFLICT (user_id, reservation_date, time_slot) DO NOTHING;

-- Update remaining credits (8 total - 8 reserved = 0 remaining, but credits deduct on use)
-- Actually, let's just verify the count

-- Show all 8 reservations
SELECT 
  cr.reservation_date,
  cr.time_slot,
  cr.notes
FROM class_reservations cr
JOIN profiles p ON p.id = cr.user_id
WHERE p.email = 'test.skater@niikskate.com'
ORDER BY cr.reservation_date;

-- Show credit status
SELECT 
  uc.credit_type,
  uc.total_credits,
  uc.remaining_credits,
  (SELECT COUNT(*) FROM class_reservations cr WHERE cr.credit_id = uc.id) as reservations_made
FROM user_credits uc
JOIN profiles p ON p.id = uc.user_id
WHERE p.email = 'test.skater@niikskate.com';
