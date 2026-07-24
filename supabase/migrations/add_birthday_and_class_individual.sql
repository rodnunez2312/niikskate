-- Event types: birthday + class_individual (private lesson programs).

ALTER TABLE school_calendar_events DROP CONSTRAINT IF EXISTS school_calendar_events_event_type_check;
ALTER TABLE school_calendar_events ADD CONSTRAINT school_calendar_events_event_type_check
  CHECK (event_type IN (
    'event', 'competition', 'holiday', 'school_closure', 'school_open',
    'practice', 'meeting', 'camp', 'show', 'custom', 'class_session',
    'birthday', 'class_individual'
  ));

COMMENT ON COLUMN school_calendar_events.event_type IS
  'Includes birthday; class_session = group program; class_individual = private lesson program.';
