-- =====================================================
-- SETUP USERS: Admins, Coaches, and Test User
-- Run this AFTER creating the auth users in Supabase Dashboard
-- =====================================================

-- Update Rod's profile (Admin + Coach)
UPDATE profiles SET 
  role = 'admin',
  full_name = 'Rod Nuñez',
  bio = 'Head Coach & Founder. Specializes in Vert and Street skating.',
  specialties = ARRAY['Vert', 'Street', 'Competition Training'],
  is_active = true
WHERE email = 'rodnunez23@gmail.com';

-- Update Marina's profile (Admin)
UPDATE profiles SET 
  role = 'admin',
  full_name = 'Marina Sanchez',
  bio = 'Academy Administrator',
  is_active = true
WHERE email = 'marinarssanchez@gmail.com';

-- Update Itza's profile (Coach)
UPDATE profiles SET 
  role = 'coach',
  full_name = 'Itza Sanchez',
  bio = 'Street Coach. Skilled in street skating techniques and tricks.',
  specialties = ARRAY['Street', 'Tricks', 'Technical'],
  is_active = true
WHERE email = 'itza.sanchez2312@gmail.com';

-- Update Leo's profile (Coach)
UPDATE profiles SET 
  role = 'coach',
  full_name = 'Leo Coach',
  bio = 'Vert & Street specialist. Focused on intermediate and advanced techniques.',
  specialties = ARRAY['Vert', 'Street', 'Bowl'],
  is_active = true
WHERE email = 'leo.coach@gmail.com';

-- Update Test User profile (Customer)
UPDATE profiles SET 
  role = 'customer',
  full_name = 'Test Skater',
  phone = '+521234567890',
  is_active = true
WHERE email = 'test.skater@niikskate.com';

-- Verify the updates
SELECT email, full_name, role, specialties, is_active 
FROM profiles 
WHERE email IN (
  'rodnunez23@gmail.com',
  'marinarssanchez@gmail.com', 
  'itza.sanchez2312@gmail.com',
  'leo.coach@gmail.com',
  'test.skater@niikskate.com'
);
