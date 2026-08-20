-- Persist removed built-in seasons so they stay off public/admin catalogs.

CREATE TABLE IF NOT EXISTS program_season_hidden (
  slug TEXT PRIMARY KEY,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE program_season_hidden IS 'Slugs of program seasons removed by admins (including built-in catalog).';

ALTER TABLE program_season_hidden ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "program_season_hidden_select" ON program_season_hidden;
CREATE POLICY "program_season_hidden_select" ON program_season_hidden
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "program_season_hidden_insert" ON program_season_hidden;
CREATE POLICY "program_season_hidden_insert" ON program_season_hidden
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "program_season_hidden_delete" ON program_season_hidden;
CREATE POLICY "program_season_hidden_delete" ON program_season_hidden
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
