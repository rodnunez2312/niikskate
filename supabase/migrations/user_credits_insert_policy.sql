-- Skaters can insert their own credit purchase rows (remaining_credits stay 0 until admin confirms payment).
-- Admins keep full access via existing "Admins can manage all credits" (or similar) policy.
--
-- If RLS still blocks: run guest_bookings_and_credits_rls_fix.sql (includes guest_bookings SELECT + same INSERT policy).

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON TABLE user_credits TO authenticated;

DROP POLICY IF EXISTS "Users can insert own credits" ON user_credits;
CREATE POLICY "Users can insert own credits" ON user_credits
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
