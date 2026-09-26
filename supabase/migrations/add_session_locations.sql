-- Parks a coach can pick when starting a session. La Plancha is the default;
-- anything else is a name they typed on the session form.

CREATE TABLE IF NOT EXISTS session_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

COMMENT ON TABLE session_locations IS
  'Training locations shown on Start a session. Names are free text.';

ALTER TABLE session_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read session_locations" ON session_locations;
CREATE POLICY "Staff can read session_locations" ON session_locations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );

DROP POLICY IF EXISTS "Staff can add session_locations" ON session_locations;
CREATE POLICY "Staff can add session_locations" ON session_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin'))
  );

DROP POLICY IF EXISTS "Admins can delete session_locations" ON session_locations;
CREATE POLICY "Admins can delete session_locations" ON session_locations
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

INSERT INTO session_locations (name)
VALUES ('Skatepark La Plancha')
ON CONFLICT (name) DO NOTHING;
