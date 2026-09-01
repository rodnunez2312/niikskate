-- Which coach price list a program sells at.
-- The tier used to be guessed from the skill level, so every Intermedio/Avanzado
-- program was priced as Coach Pro Street. Admins now pick it per program and
-- rows left NULL fall back to Coach Niik.
ALTER TABLE school_calendar_events
  ADD COLUMN IF NOT EXISTS coach_tier TEXT
    CHECK (coach_tier IS NULL OR coach_tier IN ('principiante', 'pro_street', 'pro_bowl'));

COMMENT ON COLUMN school_calendar_events.coach_tier IS
  'Coach price list for this program. Matches finance_price_list.coach_tier and CoachPricingTier in utils/classPricing.ts. NULL means Coach Niik (principiante).';
