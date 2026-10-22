-- =============================================================================
-- Remove the leftover crew character named only "Bell".
-- Run once in Supabase Dashboard → SQL Editor. Run the whole file as one query.
--
-- Kyan Bell (kyan.bell@niikskate.com, Level 2 profile) is not touched.
-- The dummy is the crew row whose displayed name is exactly "Bell": no login,
-- no program, and an empty class package.
-- =============================================================================

DO $$
DECLARE
  crew_ids uuid[] := '{}';
  profile_ids uuid[] := '{}';
  enrollment_ids uuid[] := '{}';
BEGIN
  SELECT coalesce(array_agg(c.id), '{}')
  INTO crew_ids
  FROM crew_members c
  WHERE lower(coalesce(c.first_name, '')) <> 'kyan'
    AND (
      lower(trim(coalesce(c.full_name, ''))) = 'bell'
      OR lower(trim(coalesce(c.first_name, ''))) = 'bell'
      OR (
        lower(trim(coalesce(c.last_name, ''))) = 'bell'
        AND trim(coalesce(c.first_name, '')) = ''
      )
    );

  -- A login named only "Bell", if one exists. Never Kyan.
  SELECT coalesce(array_agg(p.id), '{}')
  INTO profile_ids
  FROM profiles p
  WHERE lower(
    CASE
      WHEN length(trim(concat_ws(' ', nullif(trim(coalesce(p.first_name, '')), ''), nullif(trim(coalesce(p.last_name, '')), ''))))
         > length(trim(coalesce(p.full_name, '')))
      THEN trim(concat_ws(' ', nullif(trim(coalesce(p.first_name, '')), ''), nullif(trim(coalesce(p.last_name, '')), '')))
      ELSE trim(coalesce(p.full_name, ''))
    END
  ) = 'bell'
    AND lower(coalesce(p.email, '')) <> 'kyan.bell@niikskate.com'
    AND lower(coalesce(p.full_name, '')) NOT LIKE '%kyan%'
    AND lower(coalesce(p.first_name, '')) <> 'kyan';

  -- The Alumnos row title is the package name, which can be "Bell" even when
  -- the linked crew record is stored under a different name.
  SELECT coalesce(array_agg(e.id), '{}')
  INTO enrollment_ids
  FROM finance_student_enrollments e
  WHERE e.crew_member_id = ANY(crew_ids)
     OR e.skater_id = ANY(profile_ids)
     OR (
       lower(trim(e.student_name)) = 'bell'
       AND NOT EXISTS (
         SELECT 1 FROM profiles p
         WHERE p.id = e.skater_id
           AND (
             lower(coalesce(p.email, '')) = 'kyan.bell@niikskate.com'
             OR lower(coalesce(p.first_name, '')) = 'kyan'
             OR lower(coalesce(p.full_name, '')) LIKE 'kyan %'
           )
       )
     );

  IF to_regclass('public.finance_enrollment_session_marks') IS NOT NULL THEN
    DELETE FROM finance_enrollment_session_marks
    WHERE enrollment_id = ANY(enrollment_ids);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'finance_payments'
      AND column_name = 'crew_member_id'
  ) THEN
    DELETE FROM finance_payments
    WHERE crew_member_id = ANY(crew_ids)
       OR skater_id = ANY(profile_ids);
  ELSE
    DELETE FROM finance_payments
    WHERE skater_id = ANY(profile_ids);
  END IF;

  DELETE FROM finance_student_enrollments
  WHERE id = ANY(enrollment_ids);

  -- Class seats, tokens, and coupon allow-list rows cascade from the crew delete.
  DELETE FROM crew_members
  WHERE id = ANY(crew_ids);

  -- Drop a dummy login named only "Bell", if one was found.
  UPDATE profiles SET guardian_user_id = NULL
  WHERE guardian_user_id = ANY(profile_ids);

  UPDATE crew_members SET guardian_user_id = NULL
  WHERE guardian_user_id = ANY(profile_ids);

  DELETE FROM auth.identities
  WHERE user_id = ANY(profile_ids);

  DELETE FROM auth.users
  WHERE id = ANY(profile_ids);

  RAISE NOTICE 'Removed % crew row(s) named Bell, % profile(s) named Bell, % finance package(s). Kyan Bell was not included.',
    cardinality(crew_ids), cardinality(profile_ids), cardinality(enrollment_ids);
END $$;
