-- Catalog media, construction type and client options for skateramp projects.

ALTER TABLE skateramp_projects
  ADD COLUMN IF NOT EXISTS construction_type TEXT
    CHECK (construction_type IS NULL OR construction_type IN (
      'kicker', 'quarters', 'mini_ramp', 'grind_box', 'rails', 'other'
    )),
  ADD COLUMN IF NOT EXISTS video_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS client_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_id TEXT;

COMMENT ON COLUMN skateramp_projects.construction_type IS
  'Build family shown as pills: kicker, quarters, mini-ramp, grind-box, rails, other.';
COMMENT ON COLUMN skateramp_projects.video_urls IS
  'Public catalog videos; same files as the admin studio.';
COMMENT ON COLUMN skateramp_projects.client_options IS
  'Allowed buyer options: surfacing, caster wheels, weather coating.';
COMMENT ON COLUMN skateramp_projects.template_id IS
  'Build template id, e.g. mini_quarter.';
