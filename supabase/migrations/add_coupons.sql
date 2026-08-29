-- NIIK Skate coupon codes: grandfathered pricing and promotions.
--
-- Motivating case: the "day 1s" families kept the old $800 monthly (8 classes) while
-- the published price moved to $1,000. Coupon NIIKDAY1S pins their total to $800 and
-- is locked to a hand-picked list of skaters so the code cannot leak to new families.
--
-- Codes are never readable by customers. Validation and redemption run through
-- server/api/coupons/* with the service role, so a family can only test a code they
-- already know instead of enumerating the table.

-- ---------------------------------------------------------------------------
-- 1. Coupons
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Always stored upper-case with no spaces; the app normalizes what the user types.
  code TEXT NOT NULL UNIQUE CHECK (code = upper(btrim(code)) AND length(code) BETWEEN 3 AND 40),

  label_es TEXT NOT NULL,
  label_en TEXT,
  description TEXT,

  --   percent      → discount_value is a percentage off (20 = 20% off)
  --   fixed_amount → discount_value is MXN off the total
  --   fixed_price  → discount_value IS the final total in MXN (grandfathered price)
  discount_type TEXT NOT NULL
    CHECK (discount_type IN ('percent', 'fixed_amount', 'fixed_price')),
  discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value >= 0),

  -- Scope. Empty array = applies to everything.
  -- Values mirror ClassPackageKind / CoachPricingTier in utils/classPricing.ts.
  applies_to_class_kinds TEXT[] NOT NULL DEFAULT '{}',
  applies_to_coach_tiers TEXT[] NOT NULL DEFAULT '{}',

  -- When true the coupon only works for skaters listed in coupon_skaters.
  restricted_to_skaters BOOLEAN NOT NULL DEFAULT false,

  -- NULL = unlimited.
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  max_per_skater INTEGER CHECK (max_per_skater IS NULL OR max_per_skater > 0),
  times_redeemed INTEGER NOT NULL DEFAULT 0 CHECK (times_redeemed >= 0),

  starts_on DATE,
  expires_on DATE,

  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT coupons_percent_range
    CHECK (discount_type <> 'percent' OR discount_value <= 100),
  CONSTRAINT coupons_date_order
    CHECK (starts_on IS NULL OR expires_on IS NULL OR starts_on <= expires_on)
);

COMMENT ON TABLE coupons IS 'Discount codes for class purchases; validated server-side only.';
COMMENT ON COLUMN coupons.discount_value IS 'percent: % off · fixed_amount: MXN off · fixed_price: the final MXN total.';
COMMENT ON COLUMN coupons.applies_to_class_kinds IS 'ClassPackageKind values this code covers. Empty = all.';
COMMENT ON COLUMN coupons.restricted_to_skaters IS 'true = only skaters listed in coupon_skaters may redeem.';

CREATE INDEX IF NOT EXISTS idx_coupons_active ON coupons(is_active);

-- ---------------------------------------------------------------------------
-- 2. Allow-list — which skaters may use a restricted coupon
--    A guardian's profile authorizes their whole crew, or a single child can be
--    listed on its own.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS coupon_skaters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,

  skater_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE CASCADE,

  added_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT coupon_skaters_one_target
    CHECK (num_nonnulls(skater_id, crew_member_id) = 1)
);

COMMENT ON TABLE coupon_skaters IS 'Allow-list for restricted coupons (the "day 1s").';

CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_skaters_profile
  ON coupon_skaters(coupon_id, skater_id) WHERE skater_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_skaters_crew
  ON coupon_skaters(coupon_id, crew_member_id) WHERE crew_member_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Redemptions — one row per use, with the amounts frozen at redemption time
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  coupon_id UUID REFERENCES coupons(id) ON DELETE SET NULL,
  -- Snapshot so the log still reads correctly if the coupon is deleted or renamed.
  code TEXT NOT NULL,

  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  crew_member_id UUID REFERENCES crew_members(id) ON DELETE SET NULL,

  context TEXT NOT NULL DEFAULT 'book'
    CHECK (context IN ('book', 'season_enroll', 'admin_income', 'admin_enrollment')),

  class_kind TEXT,
  coach_tier TEXT,

  original_mxn NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (original_mxn >= 0),
  discount_mxn NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount_mxn >= 0),
  final_mxn NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (final_mxn >= 0),

  user_credit_id UUID REFERENCES user_credits(id) ON DELETE SET NULL,
  calendar_event_id UUID REFERENCES school_calendar_events(id) ON DELETE SET NULL,
  -- No FK: finance_payments comes from add_finance_module.sql, which may run later.
  finance_payment_id UUID,

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE coupon_redemptions IS 'Audit log of coupon uses with the amounts frozen at redemption.';

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_date ON coupon_redemptions(created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. RLS
--    Customers get no read access at all: that is what keeps codes unguessable.
-- ---------------------------------------------------------------------------

ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_skaters ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupons_staff_read" ON coupons;
CREATE POLICY "coupons_staff_read" ON coupons
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ));

DROP POLICY IF EXISTS "coupons_admin_write" ON coupons;
CREATE POLICY "coupons_admin_write" ON coupons
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "coupon_skaters_staff_read" ON coupon_skaters;
CREATE POLICY "coupon_skaters_staff_read" ON coupon_skaters
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ));

DROP POLICY IF EXISTS "coupon_skaters_admin_write" ON coupon_skaters;
CREATE POLICY "coupon_skaters_admin_write" ON coupon_skaters
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Families may see their own redemption history; writes only happen server-side.
DROP POLICY IF EXISTS "coupon_redemptions_own_read" ON coupon_redemptions;
CREATE POLICY "coupon_redemptions_own_read" ON coupon_redemptions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

DROP POLICY IF EXISTS "coupon_redemptions_admin_write" ON coupon_redemptions;
CREATE POLICY "coupon_redemptions_admin_write" ON coupon_redemptions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 5. updated_at trigger
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_coupons_updated_at ON coupons;
CREATE TRIGGER update_coupons_updated_at
  BEFORE UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. Seed the day-1 coupon
--    Pinned to the beginner 8-class monthly: $1,000 published → $800 for them.
--    restricted_to_skaters = true, so nothing happens until you add skaters to it
--    in Finanzas → Cupones.
-- ---------------------------------------------------------------------------

INSERT INTO coupons (
  code, label_es, label_en, description,
  discount_type, discount_value,
  applies_to_class_kinds, applies_to_coach_tiers,
  restricted_to_skaters, max_per_skater, is_active, notes
)
VALUES (
  'NIIKDAY1S',
  'Precio Day 1',
  'Day 1 price',
  'Mantiene el mensual de 8 clases en $800 para las familias fundadoras.',
  'fixed_price', 800,
  ARRAY['monthly_8'], ARRAY['principiante'],
  true, NULL, true,
  'Agrega aqui a los alumnos day 1. Sin alumnos en la lista el cupon no aplica a nadie.'
)
ON CONFLICT (code) DO NOTHING;
