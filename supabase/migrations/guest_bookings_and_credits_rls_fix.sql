-- Skaters: read linked guest_bookings (calendar fallback) + INSERT own rows on user_credits at checkout.
--
-- Error: "new row violates row-level security policy for table user_credits"
-- → Run this whole script in Supabase Dashboard → SQL Editor for the project that matches production SUPABASE_URL.

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT ON TABLE user_credits TO authenticated;

DROP POLICY IF EXISTS "Users can view own linked guest bookings" ON guest_bookings;
CREATE POLICY "Users can view own linked guest bookings" ON guest_bookings
  FOR SELECT
  TO authenticated
  USING (linked_user_id IS NOT NULL AND auth.uid() = linked_user_id);

DROP POLICY IF EXISTS "Users can insert own credits" ON user_credits;
CREATE POLICY "Users can insert own credits" ON user_credits
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
