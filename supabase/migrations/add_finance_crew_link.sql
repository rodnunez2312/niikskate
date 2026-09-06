-- Track a crew member on the finance sheet.
--
-- finance_student_enrollments could only point at profiles.id, so a child added
-- by their parent under Familia (crew_members, no login) was tracked by name
-- only. Without a real link the family screen cannot tell whose classes and
-- payments those are.

ALTER TABLE finance_student_enrollments
  ADD COLUMN IF NOT EXISTS crew_member_id UUID REFERENCES crew_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN finance_student_enrollments.crew_member_id IS
  'Skater without a login. Mutually exclusive with skater_id; both NULL means the row is name-only.';

ALTER TABLE finance_student_enrollments
  DROP CONSTRAINT IF EXISTS finance_enrollments_one_skater;
ALTER TABLE finance_student_enrollments
  ADD CONSTRAINT finance_enrollments_one_skater
    CHECK (skater_id IS NULL OR crew_member_id IS NULL);

CREATE INDEX IF NOT EXISTS idx_finance_enrollments_crew
  ON finance_student_enrollments (crew_member_id)
  WHERE crew_member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_finance_enrollments_skater
  ON finance_student_enrollments (skater_id)
  WHERE skater_id IS NOT NULL;

-- Same story for the income ledger, so "pagos realizados" can be shown per kid.
ALTER TABLE finance_payments
  ADD COLUMN IF NOT EXISTS crew_member_id UUID REFERENCES crew_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN finance_payments.crew_member_id IS
  'Skater without a login that this payment was for. Mutually exclusive with skater_id.';

CREATE INDEX IF NOT EXISTS idx_finance_payments_crew
  ON finance_payments (crew_member_id)
  WHERE crew_member_id IS NOT NULL;
