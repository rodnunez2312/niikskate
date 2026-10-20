-- Directory of skate spots and parks. Safe to re-run.
-- Photos, obstacles, and a map link are stored now and filled in later.

CREATE TABLE IF NOT EXISTS skate_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT,
  region TEXT,
  country TEXT NOT NULL DEFAULT 'México',
  maps_url TEXT,
  description TEXT,
  obstacles TEXT[] NOT NULL DEFAULT '{}',
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

COMMENT ON TABLE skate_spots IS
  'Places where Niik holds class or that belong in the public skate-spot directory.';

ALTER TABLE skate_spots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skate_spots_public_read" ON skate_spots;
CREATE POLICY "skate_spots_public_read" ON skate_spots
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "skate_spots_admin_write" ON skate_spots;
CREATE POLICY "skate_spots_admin_write" ON skate_spots
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

GRANT SELECT ON skate_spots TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON skate_spots TO authenticated;

INSERT INTO skate_spots (name, city, region, country)
VALUES ('Skatepark La Plancha', 'Mérida', 'Yucatán', 'México')
ON CONFLICT (name) DO NOTHING;
