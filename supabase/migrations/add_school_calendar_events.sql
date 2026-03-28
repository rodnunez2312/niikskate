-- School calendar: events, holidays, closures, competitions (admin-managed; optional visibility to families).

CREATE TABLE IF NOT EXISTS school_calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'event'
    CHECK (event_type IN (
      'event', 'competition', 'holiday', 'school_closure', 'school_open',
      'practice', 'meeting', 'camp', 'show', 'custom'
    )),
  start_date DATE NOT NULL,
  end_date DATE,
  all_day BOOLEAN NOT NULL DEFAULT true,
  start_time TIME,
  end_time TIME,
  location TEXT,
  description TEXT,
  visible_to_parents BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_school_calendar_start ON school_calendar_events(start_date);
CREATE INDEX IF NOT EXISTS idx_school_calendar_end ON school_calendar_events(end_date);

COMMENT ON TABLE school_calendar_events IS 'NiikSkate school-wide calendar entries; admins manage; customers may read when visible_to_parents.';

ALTER TABLE school_calendar_events ENABLE ROW LEVEL SECURITY;

-- Read: families see public rows; staff sees all
DROP POLICY IF EXISTS "school_calendar_select" ON school_calendar_events;
CREATE POLICY "school_calendar_select" ON school_calendar_events
  FOR SELECT TO authenticated
  USING (
    visible_to_parents = true
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

-- Write: admins only
DROP POLICY IF EXISTS "school_calendar_insert" ON school_calendar_events;
CREATE POLICY "school_calendar_insert" ON school_calendar_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "school_calendar_update" ON school_calendar_events;
CREATE POLICY "school_calendar_update" ON school_calendar_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "school_calendar_delete" ON school_calendar_events;
CREATE POLICY "school_calendar_delete" ON school_calendar_events
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP TRIGGER IF EXISTS update_school_calendar_events_updated_at ON school_calendar_events;
CREATE TRIGGER update_school_calendar_events_updated_at
  BEFORE UPDATE ON school_calendar_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
