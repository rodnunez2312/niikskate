-- Token purchase and attendance ledger. Does not rewrite existing skater_tokens rows.
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS skater_token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skater_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('group', 'individual', 'pro', 'free')),
  tx_type TEXT NOT NULL CHECK (tx_type IN ('purchase', 'deduction', 'refund', 'adjustment')),
  quantity INTEGER NOT NULL CHECK (quantity <> 0),
  amount_mxn NUMERIC(10, 2),
  payment_method TEXT,
  payment_status TEXT NOT NULL DEFAULT 'paid'
    CHECK (payment_status IN ('paid', 'pending', 'failed')),
  tokens_applied BOOLEAN NOT NULL DEFAULT false,
  finance_enrollment_id UUID REFERENCES finance_student_enrollments(id) ON DELETE SET NULL,
  calendar_event_id UUID REFERENCES school_calendar_events(id) ON DELETE SET NULL,
  coupon_code TEXT,
  reason TEXT,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (skater_id IS NOT NULL OR crew_member_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS skater_token_transactions_idempotency
  ON skater_token_transactions(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_skater_token_tx_profile
  ON skater_token_transactions(skater_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_skater_token_tx_crew
  ON skater_token_transactions(crew_member_id, created_at DESC);

-- One spent token per skater per class. Existing rows are left as they are.
CREATE UNIQUE INDEX IF NOT EXISTS skater_tokens_one_spend_profile
  ON skater_tokens(skater_id, calendar_event_id)
  WHERE status = 'spent' AND skater_id IS NOT NULL AND calendar_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS skater_tokens_one_spend_crew
  ON skater_tokens(crew_member_id, calendar_event_id)
  WHERE status = 'spent' AND crew_member_id IS NOT NULL AND calendar_event_id IS NOT NULL;

ALTER TABLE skater_token_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skater_token_transactions_staff_read" ON skater_token_transactions;
CREATE POLICY "skater_token_transactions_staff_read" ON skater_token_transactions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ));

DROP POLICY IF EXISTS "skater_token_transactions_admin_write" ON skater_token_transactions;
CREATE POLICY "skater_token_transactions_admin_write" ON skater_token_transactions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
