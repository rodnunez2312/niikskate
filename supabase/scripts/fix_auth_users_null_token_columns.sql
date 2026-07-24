-- =============================================================================
-- Fix: "Database error querying schema" when logging in SQL-seeded users
--
-- GoTrue scans auth.users token columns as non-nullable strings. Rows inserted
-- manually without these fields leave NULLs and password login returns 500 with
-- that message (see supabase/auth#1940).
--
-- Run once in Supabase Dashboard → SQL Editor on production if you created users
-- via raw INSERT into auth.users (e.g. onboarding_2026-04-26_profiles.sql before
-- token columns were added).
--
-- Safe: only replaces NULL with empty string; does not alter auth schema.
-- =============================================================================

UPDATE auth.users
SET
  confirmation_token = COALESCE(confirmation_token, ''),
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, ''),
  recovery_token = COALESCE(recovery_token, '')
WHERE confirmation_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR recovery_token IS NULL;
