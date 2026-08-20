-- Admin-created program seasons (public pages at /temporadas/{slug}).

CREATE TABLE IF NOT EXISTS program_seasons (
  slug TEXT PRIMARY KEY,
  name_es TEXT NOT NULL,
  name_en TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'enrolling'
    CHECK (status IN ('enrolling', 'soon', 'closed')),
  icon TEXT NOT NULL DEFAULT '📅',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT program_seasons_dates_ok CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_program_seasons_start ON program_seasons(start_date);

COMMENT ON TABLE program_seasons IS 'NiikSkate program seasons; public read; admins create/update.';

ALTER TABLE program_seasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "program_seasons_select" ON program_seasons;
CREATE POLICY "program_seasons_select" ON program_seasons
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "program_seasons_insert" ON program_seasons;
CREATE POLICY "program_seasons_insert" ON program_seasons
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "program_seasons_update" ON program_seasons;
CREATE POLICY "program_seasons_update" ON program_seasons
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "program_seasons_delete" ON program_seasons;
CREATE POLICY "program_seasons_delete" ON program_seasons
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS update_program_seasons_updated_at ON program_seasons;
CREATE TRIGGER update_program_seasons_updated_at
  BEFORE UPDATE ON program_seasons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
