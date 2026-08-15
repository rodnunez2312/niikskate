-- Coaches/admins can update skater profile fields (ratings, stance, style, push).

CREATE POLICY "Coaches can update skater profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles coach
      WHERE coach.id = auth.uid()
        AND coach.role IN ('admin', 'coach')
    )
    AND profiles.role = 'customer'
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles coach
      WHERE coach.id = auth.uid()
        AND coach.role IN ('admin', 'coach')
    )
    AND role = 'customer'
  );
