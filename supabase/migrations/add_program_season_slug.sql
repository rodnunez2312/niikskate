-- Links bookable class sessions to a program season (temporada).
ALTER TABLE school_calendar_events
  ADD COLUMN IF NOT EXISTS season_slug TEXT;

CREATE INDEX IF NOT EXISTS idx_school_calendar_season_slug
  ON school_calendar_events(season_slug)
  WHERE season_slug IS NOT NULL;

COMMENT ON COLUMN school_calendar_events.season_slug IS
  'Program season key (e.g. transicion-i-26). Matches utils/programSeasons.ts slugs.';
