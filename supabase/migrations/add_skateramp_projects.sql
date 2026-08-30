-- Skateramp design studio: idea → concept sketch → build → publish to shop.

CREATE TABLE IF NOT EXISTS skateramp_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  description TEXT,
  stage TEXT NOT NULL DEFAULT 'idea'
    CHECK (stage IN ('idea', 'concept', 'build', 'published')),
  concept_notes TEXT,
  build_notes TEXT,
  sketch JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_urls TEXT[] NOT NULL DEFAULT '{}',
  ai_suggestions TEXT,
  ai_suggestions_at TIMESTAMPTZ,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skateramp_projects_stage ON skateramp_projects(stage);
CREATE INDEX IF NOT EXISTS idx_skateramp_projects_published ON skateramp_projects(is_published);
CREATE INDEX IF NOT EXISTS idx_skateramp_projects_slug ON skateramp_projects(slug);

COMMENT ON TABLE skateramp_projects IS 'Admin ramp concepts: sketch, photos, AI notes; publish links to products.';

ALTER TABLE skateramp_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skateramp_projects_public_read" ON skateramp_projects;
CREATE POLICY "skateramp_projects_public_read" ON skateramp_projects
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "skateramp_projects_admin_all" ON skateramp_projects;
CREATE POLICY "skateramp_projects_admin_all" ON skateramp_projects
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP TRIGGER IF EXISTS update_skateramp_projects_updated_at ON skateramp_projects;
CREATE TRIGGER update_skateramp_projects_updated_at
  BEFORE UPDATE ON skateramp_projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
