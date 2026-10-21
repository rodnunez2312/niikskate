-- Each person belongs to one or more sports, and at least one.
-- Existing accounts are skateboarding only.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sports text[];

UPDATE profiles
SET sports = ARRAY['skateboarding']::text[];

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_sports_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_sports_check CHECK (
    sports IS NOT NULL
    AND cardinality(sports) >= 1
    AND sports <@ ARRAY['skateboarding', 'scooter', 'rollerblading', 'bmx', 'parkour']::text[]
  );

ALTER TABLE profiles ALTER COLUMN sports SET DEFAULT ARRAY['skateboarding']::text[];
ALTER TABLE profiles ALTER COLUMN sports SET NOT NULL;

ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS sports text[];

UPDATE crew_members
SET sports = ARRAY['skateboarding']::text[];

ALTER TABLE crew_members DROP CONSTRAINT IF EXISTS crew_members_sports_check;
ALTER TABLE crew_members
  ADD CONSTRAINT crew_members_sports_check CHECK (
    sports IS NOT NULL
    AND cardinality(sports) >= 1
    AND sports <@ ARRAY['skateboarding', 'scooter', 'rollerblading', 'bmx', 'parkour']::text[]
  );

ALTER TABLE crew_members ALTER COLUMN sports SET DEFAULT ARRAY['skateboarding']::text[];
ALTER TABLE crew_members ALTER COLUMN sports SET NOT NULL;
