-- Custom ramp enquiries from the public /skateramps page.
--
-- Separate from skateramp_projects: that table is the admin design studio,
-- this one is the customer inbox that feeds it. Rows are written by
-- server/api/skateramps/request.post.ts with the service role, so there is
-- deliberately no anon INSERT policy — the public cannot write here directly.

CREATE TABLE IF NOT EXISTS skateramp_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  city TEXT,

  ramp_type TEXT
    CHECK (ramp_type IS NULL OR ramp_type IN (
      'mini_ramp', 'quarter_pipe', 'funbox', 'ledge_rail',
      'kicker', 'bowl', 'skatepark', 'other'
    )),
  space_width_m NUMERIC(6, 2),
  space_length_m NUMERIC(6, 2),
  surface TEXT
    CHECK (surface IS NULL OR surface IN (
      'concrete', 'asphalt', 'tile', 'dirt_grass', 'indoor', 'other'
    )),
  skill_level TEXT
    CHECK (skill_level IS NULL OR skill_level IN (
      'beginner', 'intermediate', 'advanced', 'mixed'
    )),
  budget_mxn INTEGER CHECK (budget_mxn IS NULL OR budget_mxn >= 0),
  timeline TEXT
    CHECK (timeline IS NULL OR timeline IN (
      'asap', 'one_three_months', 'later', 'exploring'
    )),

  message TEXT NOT NULL,
  image_urls TEXT[] NOT NULL DEFAULT '{}',

  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'archived')),
  admin_notes TEXT,

  -- Null when the notification email could not be sent (or is not configured);
  -- the request is still in this table, which is the source of truth.
  emailed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_skateramp_requests_status ON skateramp_requests(status);
CREATE INDEX IF NOT EXISTS idx_skateramp_requests_created ON skateramp_requests(created_at DESC);

COMMENT ON TABLE skateramp_requests IS 'Customer custom-ramp enquiries; admin inbox at /member/admin/skateramp-requests';
COMMENT ON COLUMN skateramp_requests.image_urls IS 'Public URLs under images/ramp-requests/<uuid>/, uploaded server-side';

ALTER TABLE skateramp_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skateramp_requests_admin_all" ON skateramp_requests;
CREATE POLICY "skateramp_requests_admin_all" ON skateramp_requests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP TRIGGER IF EXISTS update_skateramp_requests_updated_at ON skateramp_requests;
CREATE TRIGGER update_skateramp_requests_updated_at
  BEFORE UPDATE ON skateramp_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
