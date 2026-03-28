-- Add golden token types for pro-skater classes.
-- Existing credit types remain the regular token set.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'credit_type'
      AND n.nspname = 'public'
  ) THEN
    ALTER TYPE credit_type ADD VALUE IF NOT EXISTS 'golden_monthly';
    ALTER TYPE credit_type ADD VALUE IF NOT EXISTS 'golden_pkg_3';
    ALTER TYPE credit_type ADD VALUE IF NOT EXISTS 'golden_pkg_5';
    ALTER TYPE credit_type ADD VALUE IF NOT EXISTS 'golden_single';
  END IF;
END $$;

