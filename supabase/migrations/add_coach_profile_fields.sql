-- Everything the admin knows about a coach beyond their name lived in someone's
-- head: what to call them, how long they have been coaching, what they are
-- certified in, and who leads a program. profiles already carries bio and
-- specialties for coaches, so these join them rather than starting a new table.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS experience TEXT,
  ADD COLUMN IF NOT EXISTS certifications TEXT[],
  ADD COLUMN IF NOT EXISTS is_head_coach BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.title IS
  'Shown under the coach name on their card, e.g. "Coach" or "Fundamentos".';
COMMENT ON COLUMN profiles.experience IS
  'Free text as the admin typed it, e.g. "5 anios, Intermedio". Never parsed.';
COMMENT ON COLUMN profiles.certifications IS
  'Free-text badges on the coach card. Unrelated to the certifications page, which tracks skater progress.';
COMMENT ON COLUMN profiles.is_head_coach IS
  'Leads the programs this coach is assigned to.';

-- A coach can cover several programs, but one of them is the home program shown
-- as their primary chip.
ALTER TABLE program_coaches
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN program_coaches.is_primary IS
  'The program this coach belongs to first. At most one per coach.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_program_coaches_one_primary
  ON program_coaches (coach_id)
  WHERE is_primary;
