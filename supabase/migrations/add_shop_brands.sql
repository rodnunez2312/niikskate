-- Optional: brand logos for Skateshop "Marcas" filter
CREATE TABLE IF NOT EXISTS shop_brands (
  name TEXT PRIMARY KEY,
  logo_url TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE shop_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read shop_brands" ON shop_brands;
CREATE POLICY "Public can read shop_brands" ON shop_brands
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins manage shop_brands" ON shop_brands;
CREATE POLICY "Admins manage shop_brands" ON shop_brands
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
