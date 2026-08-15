-- Link skater profiles to a guardian (family) account.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS guardian_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_guardian_user
  ON profiles(guardian_user_id)
  WHERE guardian_user_id IS NOT NULL;

COMMENT ON COLUMN profiles.guardian_user_id IS 'Parent/guardian profile when this customer is a skater with their own login.';
