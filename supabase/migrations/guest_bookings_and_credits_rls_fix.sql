-- Local / prod: skaters must read linked guest_bookings (calendar fallback) and insert user_credits.

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
