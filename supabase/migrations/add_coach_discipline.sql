-- Sports a coach teaches. One coach can have several.
-- Safe to run again if the first version stored a single sport.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'coach_discipline'
      AND data_type = 'text'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_coach_discipline_check;
    ALTER TABLE profiles
      ALTER COLUMN coach_discipline TYPE TEXT[]
      USING (
        CASE
          WHEN coach_discipline IS NULL OR btrim(coach_discipline) = ''
            THEN ARRAY['skateboarding']::text[]
          ELSE ARRAY[coach_discipline]::text[]
        END
      );
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'coach_discipline'
  ) THEN
    ALTER TABLE profiles ADD COLUMN coach_discipline TEXT[];
  END IF;
END $$;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_coach_disciplines_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_coach_disciplines_check
  CHECK (
    coach_discipline IS NULL
    OR coach_discipline <@ ARRAY['skateboarding', 'scooter', 'rollerblading', 'bmx', 'parkour']::text[]
  );

UPDATE profiles
SET coach_discipline = ARRAY['skateboarding']::text[]
WHERE (coach_discipline IS NULL OR cardinality(coach_discipline) = 0)
  AND (role = 'coach' OR email ILIKE 'rodnunez23@gmail.com');
