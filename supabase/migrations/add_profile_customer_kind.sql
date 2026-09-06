-- Separate the parent who books from the skater who rides.
--
-- Admin → Academia → Usuarios already asked for customer_kind when creating an
-- account, but never stored it, so a guardian looked identical to a skater and
-- got their own progress card, trick bag and seat in the class picker.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS customer_kind TEXT
    CHECK (customer_kind IS NULL OR customer_kind IN ('guardian', 'skater'));

COMMENT ON COLUMN profiles.customer_kind IS
  'Customer accounts only. guardian = parent/tutor who manages the family and does not skate; skater = the person on the board. NULL on staff and on legacy accounts, which are treated as skaters.';

-- Backfill from the links that already exist: anyone pointing at a guardian is
-- a skater, and anyone pointed at is a guardian.
UPDATE profiles
  SET customer_kind = 'skater'
  WHERE customer_kind IS NULL
    AND role = 'customer'
    AND guardian_user_id IS NOT NULL;

UPDATE profiles
  SET customer_kind = 'guardian'
  WHERE customer_kind IS NULL
    AND role = 'customer'
    AND id IN (SELECT guardian_user_id FROM profiles WHERE guardian_user_id IS NOT NULL);
