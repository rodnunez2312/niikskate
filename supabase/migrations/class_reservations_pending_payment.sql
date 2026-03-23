-- Pending payment: hold chosen dates at checkout without deducting credits.
-- Requires app to insert class_reservations with status 'pending_payment' while user_credits.remaining_credits = 0.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'credit_status'
      AND e.enumlabel = 'pending_payment'
  ) THEN
    ALTER TYPE credit_status ADD VALUE 'pending_payment';
  END IF;
END $$;

-- Ensure trigger function exists (some projects never ran add_credits_system.sql).
CREATE OR REPLACE FUNCTION deduct_credit_on_reservation()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_credits
  SET remaining_credits = remaining_credits - 1,
      updated_at = NOW()
  WHERE id = NEW.credit_id
    AND remaining_credits > 0;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only deduct credits when the reservation is active (not while payment is pending).
DROP TRIGGER IF EXISTS trigger_deduct_credit_on_reservation ON class_reservations;
CREATE TRIGGER trigger_deduct_credit_on_reservation
  AFTER INSERT ON class_reservations
  FOR EACH ROW
  WHEN (NEW.credit_id IS NOT NULL AND NEW.status = 'active'::credit_status)
  EXECUTE FUNCTION deduct_credit_on_reservation();
