-- =============================================================================
-- One-off: rename Fernanda → Valentina, fix Leo Cruz display name, add 4 skaters
-- Run in Supabase Dashboard → SQL Editor (single transaction recommended).
--
-- If Fernanda + Valentina were two separate accounts and you want only Valentina:
-- run scripts/delete_fernanda_merge_into_valentina.sql first, then re-run section B here if needed.
--
-- Before running:
--   1) Fernanda → Valentina: only runs if valentina@ is NOT already a *different* auth user.
--      If Valentina already has her own account, the script skips the rename (see NOTICE in results).
--   2) Change v_temp_password below if you like (users should reset via Forgot password).
--   3) Requires extension pgcrypto (usually already on).
--
-- New skaters (from roster): auth row + identity + trigger-created profile;
-- then profiles.city / skill_level updated (Principiante → beginner).
-- There is no date_of_birth column on profiles in this repo; omit DOB or add a migration later.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- A) Display name for coach Leo
-- -----------------------------------------------------------------------------
UPDATE profiles
SET
  full_name = 'Leo Cruz',
  updated_at = now()
WHERE lower(email) = lower('diinleonardocruz@gmail.com');

-- -----------------------------------------------------------------------------
-- B) Fernanda → Valentina (sync auth + public profile)
-- Skips safely when valentina@ already belongs to another user (duplicate email).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  fernanda_id uuid;
  valentina_id uuid;
BEGIN
  SELECT id INTO fernanda_id FROM auth.users WHERE lower(email) = lower('fernanda@niikskate.com') LIMIT 1;
  SELECT id INTO valentina_id FROM auth.users WHERE lower(email) = lower('valentina.orozco@niikskate.com') LIMIT 1;

  IF fernanda_id IS NULL THEN
    RAISE NOTICE 'B) No auth user fernanda@niikskate.com — skip rename (already migrated or never existed).';
    RETURN;
  END IF;

  IF valentina_id IS NOT NULL AND valentina_id IS DISTINCT FROM fernanda_id THEN
    RAISE NOTICE
      'B) Skipping rename: valentina.orozco@niikskate.com is already user %. Fernanda remains fernanda@niikskate.com (user %). To use one account only: delete or merge in Dashboard, or delete the empty duplicate then re-run this section.',
      valentina_id,
      fernanda_id;
    RETURN;
  END IF;

  UPDATE auth.users
  SET
    email = 'valentina.orozco@niikskate.com',
    updated_at = now()
  WHERE id = fernanda_id;

  UPDATE profiles
  SET
    email = 'valentina.orozco@niikskate.com',
    updated_at = now()
  WHERE id = fernanda_id;

  UPDATE auth.identities
  SET
    identity_data =
      jsonb_set(
        coalesce(identity_data, '{}'::jsonb),
        '{email}',
        to_jsonb('valentina.orozco@niikskate.com'::text),
        true
      ),
    updated_at = now()
  WHERE provider = 'email'
    AND user_id = fernanda_id;
END $$;

-- B2) Auth already says valentina but profile row still says fernanda (out of sync)
UPDATE profiles p
SET
  email = 'valentina.orozco@niikskate.com',
  updated_at = now()
FROM auth.users u
WHERE p.id = u.id
  AND lower(u.email) = lower('valentina.orozco@niikskate.com')
  AND lower(p.email) = lower('fernanda@niikskate.com');

-- -----------------------------------------------------------------------------
-- C) Four new skaters (auth + identity; handle_new_user creates profiles row)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  inst uuid;
  v_temp_password text := crypt('NiikTemp2026!', gen_salt('bf'));
  uid uuid;
BEGIN
  SELECT instance_id INTO inst FROM auth.users LIMIT 1;
  IF inst IS NULL THEN
    RAISE EXCEPTION 'Could not read auth.instance_id from an existing user. Add at least one Auth user first, or set inst manually.';
  END IF;

  -- 1) jose.acevedo@niikskate.com — Jose Maria Acevedo Cardos — DOB 2015-02-15 (DD/MM/YY)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower('jose.acevedo@niikskate.com')) THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      uid,
      inst,
      'authenticated',
      'authenticated',
      'jose.acevedo@niikskate.com',
      v_temp_password,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Jose Maria Acevedo Cardos"}'::jsonb,
      now(),
      now()
    );
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      uid,
      jsonb_build_object('sub', uid::text, 'email', 'jose.acevedo@niikskate.com'),
      'email',
      'jose.acevedo@niikskate.com',
      now(),
      now(),
      now()
    );
  END IF;

  -- 2) antoine.lopez@niikskate.com — Luis Antoine Lopez Menchaca — DOB 2009-05-10
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower('antoine.lopez@niikskate.com')) THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      uid,
      inst,
      'authenticated',
      'authenticated',
      'antoine.lopez@niikskate.com',
      v_temp_password,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Luis Antoine Lopez Menchaca"}'::jsonb,
      now(),
      now()
    );
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      uid,
      jsonb_build_object('sub', uid::text, 'email', 'antoine.lopez@niikskate.com'),
      'email',
      'antoine.lopez@niikskate.com',
      now(),
      now(),
      now()
    );
  END IF;

  -- 3) mateo.brito@niikskate.com — Mateo Brito Chi — DOB 2015-03-21 (spreadsheet 03/21/15 = US MM/DD/YY)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower('mateo.brito@niikskate.com')) THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      uid,
      inst,
      'authenticated',
      'authenticated',
      'mateo.brito@niikskate.com',
      v_temp_password,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Mateo Brito Chi"}'::jsonb,
      now(),
      now()
    );
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      uid,
      jsonb_build_object('sub', uid::text, 'email', 'mateo.brito@niikskate.com'),
      'email',
      'mateo.brito@niikskate.com',
      now(),
      now(),
      now()
    );
  END IF;

  -- 4) elina.ortiz@niikskate.com — Katerin Elina Ortiz Luna (no age/group/DOB on sheet)
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower('elina.ortiz@niikskate.com')) THEN
    uid := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    VALUES (
      uid,
      inst,
      'authenticated',
      'authenticated',
      'elina.ortiz@niikskate.com',
      v_temp_password,
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Katerin Elina Ortiz Luna"}'::jsonb,
      now(),
      now()
    );
    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    VALUES (
      gen_random_uuid(),
      uid,
      jsonb_build_object('sub', uid::text, 'email', 'elina.ortiz@niikskate.com'),
      'email',
      'elina.ortiz@niikskate.com',
      now(),
      now(),
      now()
    );
  END IF;
END $$;

-- If on_auth_user_created trigger is missing, profiles rows would not exist — backfill safely
INSERT INTO profiles (id, email, full_name)
SELECT
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
FROM auth.users u
WHERE lower(u.email) IN (
  lower('jose.acevedo@niikskate.com'),
  lower('antoine.lopez@niikskate.com'),
  lower('mateo.brito@niikskate.com'),
  lower('elina.ortiz@niikskate.com')
)
AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id)
ON CONFLICT (id) DO NOTHING;

-- Enrich profiles (columns from add_student_profile_skater_fields migration)
UPDATE profiles
SET
  city = 'Merida',
  skill_level = 'beginner',
  updated_at = now()
WHERE lower(email) IN (
  lower('jose.acevedo@niikskate.com'),
  lower('antoine.lopez@niikskate.com'),
  lower('mateo.brito@niikskate.com')
);

UPDATE profiles
SET
  city = 'Merida',
  skill_level = NULL,
  updated_at = now()
WHERE lower(email) = lower('elina.ortiz@niikskate.com');

-- -----------------------------------------------------------------------------
-- D) Verify (optional — inspect results)
-- -----------------------------------------------------------------------------
-- SELECT id, email, full_name, role, city, skill_level FROM profiles
-- WHERE lower(email) IN (
--   lower('diinleonardocruz@gmail.com'),
--   lower('valentina.orozco@niikskate.com'),
--   lower('jose.acevedo@niikskate.com'),
--   lower('antoine.lopez@niikskate.com'),
--   lower('mateo.brito@niikskate.com'),
--   lower('elina.ortiz@niikskate.com')
-- )
-- ORDER BY email;
