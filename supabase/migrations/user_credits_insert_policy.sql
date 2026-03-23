-- Skaters can insert their own credit purchase rows (remaining_credits stay 0 until admin confirms payment).
-- Admins already have full access via existing policy.

DROP POLICY IF EXISTS "Users can insert own credits" ON user_credits;
CREATE POLICY "Users can insert own credits" ON user_credits
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
