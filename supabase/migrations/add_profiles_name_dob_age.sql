-- Skater roster fields (legal/display name split + demographics).
-- full_name remains the canonical display string; app may derive from first + last.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS age INTEGER;

COMMENT ON COLUMN profiles.first_name IS 'Given name(s), roster / legal split from last_name.';
COMMENT ON COLUMN profiles.last_name IS 'Family name(s); may be empty for mononyms.';
COMMENT ON COLUMN profiles.date_of_birth IS 'Skater DOB when known; timezone-neutral date.';
COMMENT ON COLUMN profiles.age IS 'Roster age when captured; prefer deriving from date_of_birth in UI when DOB is set.';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_age_reasonable_chk;
ALTER TABLE profiles ADD CONSTRAINT profiles_age_reasonable_chk
  CHECK (age IS NULL OR (age >= 0 AND age <= 120));
