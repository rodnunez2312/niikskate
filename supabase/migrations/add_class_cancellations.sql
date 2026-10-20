-- Weather (and other) cancellations on a school calendar class.
-- Safe to re-run. Run this in the Supabase SQL editor.

ALTER TABLE school_calendar_events
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS makeup_note TEXT;

COMMENT ON COLUMN school_calendar_events.cancelled_at IS
  'Set when staff cancel the session (for example a wet park). Families are emailed separately.';
COMMENT ON COLUMN school_calendar_events.cancellation_reason IS
  'Short reason such as weather.';
COMMENT ON COLUMN school_calendar_events.makeup_note IS
  'When and how the cancelled class can be retaken. Included in the family email.';

ALTER TABLE school_calendar_events
  ADD COLUMN IF NOT EXISTS session_outcome TEXT;

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_session_outcome_check;
ALTER TABLE school_calendar_events
  ADD CONSTRAINT school_calendar_events_session_outcome_check
  CHECK (session_outcome IS NULL OR session_outcome IN ('done', 'cancelled'));

COMMENT ON COLUMN school_calendar_events.session_outcome IS
  'Null until a coach or admin marks the class done or cancelled. Only done counts as a class given.';

ALTER TABLE school_calendar_events
  ADD COLUMN IF NOT EXISTS discipline TEXT;

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_discipline_check;
ALTER TABLE school_calendar_events
  ADD CONSTRAINT school_calendar_events_discipline_check
  CHECK (
    discipline IS NULL
    OR discipline IN ('skateboarding', 'scooter', 'rollerblading', 'bmx', 'parkour')
  );

COMMENT ON COLUMN school_calendar_events.discipline IS
  'Sport for a class program. Existing rows stay skateboarding when this is empty.';

UPDATE school_calendar_events
SET discipline = 'skateboarding'
WHERE discipline IS NULL
  AND event_type IN ('class_session', 'class_individual');

-- A coach can mark their own assignment delivered. Admins still manage the whole table.
DROP POLICY IF EXISTS "Coaches update own class_session_coaches" ON class_session_coaches;
CREATE POLICY "Coaches update own class_session_coaches" ON class_session_coaches
  FOR UPDATE TO authenticated
  USING (
    coach_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  )
  WITH CHECK (
    coach_id = auth.uid()
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'coach')
  );
