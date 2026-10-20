-- Backup coach when the assigned coach is off for a class time.
-- Run in the Supabase SQL editor.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS backup_coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE class_session_coaches
  ADD COLUMN IF NOT EXISTS covering_for UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN profiles.backup_coach_id IS
  'Coach who takes the class when this coach is marked unavailable for that time.';
COMMENT ON COLUMN class_session_coaches.covering_for IS
  'Original coach this row is covering. Cleared when the original coach is available again.';

UPDATE profiles AS coach
SET backup_coach_id = backup.id
FROM profiles AS backup
WHERE coach.full_name ILIKE 'Rodrigo Sanchez%'
  AND backup.full_name ILIKE 'Marco Rodriguez%';

UPDATE profiles AS coach
SET backup_coach_id = backup.id
FROM profiles AS backup
WHERE coach.full_name ILIKE 'Marco Rodriguez%'
  AND backup.full_name ILIKE 'Rodrigo Sanchez%';

UPDATE profiles AS coach
SET backup_coach_id = backup.id
FROM profiles AS backup
WHERE coach.full_name ILIKE 'Itza Sanchez%'
  AND backup.full_name ILIKE 'Marco Rodriguez%';
