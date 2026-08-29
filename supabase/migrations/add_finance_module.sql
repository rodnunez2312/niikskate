-- NIIK Skate finance module: price list, income ledger, expense ledger, break-even settings.
-- Source of truth for the price list is the "Costos" sheet of the business Excel;
-- these tables replace it so the same grid is editable from laptop and phone.
--
-- Coach tiers reuse the keys already in utils/classPricing.ts so the create-program
-- form can map a program straight onto a price row:
--   principiante = "Coach Niik"  ·  pro_street = "Coach Pro Street"  ·  pro_bowl = "Coach Pro Bowl"

-- ---------------------------------------------------------------------------
-- 1. Price list — one row per coach tier x class package
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_price_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  coach_tier TEXT NOT NULL
    CHECK (coach_tier IN ('principiante', 'pro_street', 'pro_bowl')),

  -- Mirrors ClassPackageKind in utils/classPricing.ts.
  class_kind TEXT NOT NULL
    CHECK (class_kind IN (
      'monthly_4', 'monthly_8', 'monthly_12', 'monthly_16', 'monthly_24',
      'group_session', 'individual_session',
      'group_pack_3', 'group_pack_5', 'individual_pack_3', 'individual_pack_5'
    )),

  label_es TEXT NOT NULL,
  label_en TEXT,

  -- "Precio": list price before discount.
  list_mxn NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (list_mxn >= 0),
  -- "Descuento": stored as a fraction (0.20 = 20%).
  discount_pct NUMERIC(5, 4) CHECK (discount_pct IS NULL OR (discount_pct >= 0 AND discount_pct < 1)),
  -- "Precio final": kept explicit because the sheet rounds up to the nearest 100
  -- on some rows and not others. NULL = sold at list price.
  final_mxn NUMERIC(10, 2) CHECK (final_mxn IS NULL OR final_mxn >= 0),

  sessions INTEGER NOT NULL DEFAULT 1 CHECK (sessions > 0),

  -- "Vendidos": manual planning figure kept editable like the sheet. Actual sales
  -- are counted from finance_payments.price_list_id.
  units_sold INTEGER NOT NULL DEFAULT 0 CHECK (units_sold >= 0),

  -- "% Academia": the academy's cut; the coach receives the remainder.
  academy_pct NUMERIC(5, 4) NOT NULL DEFAULT 0.20
    CHECK (academy_pct >= 0 AND academy_pct <= 1),

  -- "Cuota minima": logic still undefined, intentionally left NULL.
  min_fee_mxn NUMERIC(10, 2) CHECK (min_fee_mxn IS NULL OR min_fee_mxn >= 0),

  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (coach_tier, class_kind)
);

COMMENT ON TABLE finance_price_list IS 'Editable class price sheet; drives program pricing and break-even math.';
COMMENT ON COLUMN finance_price_list.final_mxn IS 'Precio final. NULL means the row sells at list_mxn.';
COMMENT ON COLUMN finance_price_list.academy_pct IS 'Academy share of the sale; coach pay = total - academy cut.';
COMMENT ON COLUMN finance_price_list.min_fee_mxn IS 'Cuota minima — reserved, no logic applied yet.';

CREATE INDEX IF NOT EXISTS idx_finance_price_list_tier ON finance_price_list(coach_tier);
CREATE INDEX IF NOT EXISTS idx_finance_price_list_active ON finance_price_list(is_active);

-- ---------------------------------------------------------------------------
-- 2. Income ledger — money collected by the academy
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_mxn NUMERIC(10, 2) NOT NULL CHECK (amount_mxn >= 0),

  -- Validated in the app (utils/finance.ts) rather than by CHECK so categories
  -- can be added without a migration.
  category TEXT NOT NULL DEFAULT 'class_program',

  payment_method TEXT NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
  status TEXT NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid', 'pending', 'refunded')),

  payer_name TEXT,
  skater_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Which price row was sold, plus a denormalized snapshot so the entry still
  -- reads correctly if the price sheet is edited later.
  price_list_id UUID REFERENCES finance_price_list(id) ON DELETE SET NULL,
  coach_tier TEXT,
  class_kind TEXT,
  sessions INTEGER,

  -- Split captured at sale time, not read live from the price sheet.
  academy_pct NUMERIC(5, 4) NOT NULL DEFAULT 0
    CHECK (academy_pct >= 0 AND academy_pct <= 1),
  academy_cut_mxn NUMERIC(12, 2)
    GENERATED ALWAYS AS (ROUND(amount_mxn * academy_pct, 2)) STORED,
  coach_pay_mxn NUMERIC(12, 2)
    GENERATED ALWAYS AS (amount_mxn - ROUND(amount_mxn * academy_pct, 2)) STORED,

  reference TEXT,
  notes TEXT,
  received_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE finance_payments IS 'Academy income ledger. Replaces the legacy payments table, which requires an order or booking.';
COMMENT ON COLUMN finance_payments.academy_pct IS 'Snapshot of the academy split at sale time.';

CREATE INDEX IF NOT EXISTS idx_finance_payments_paid_on ON finance_payments(paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_finance_payments_category ON finance_payments(category);
CREATE INDEX IF NOT EXISTS idx_finance_payments_price_row ON finance_payments(price_list_id);
CREATE INDEX IF NOT EXISTS idx_finance_payments_skater ON finance_payments(skater_id);
CREATE INDEX IF NOT EXISTS idx_finance_payments_coach ON finance_payments(coach_id);

-- ---------------------------------------------------------------------------
-- 3. Expense ledger — money out
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  incurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  category TEXT NOT NULL DEFAULT 'other',
  vendor TEXT,
  description TEXT,
  amount_mxn NUMERIC(10, 2) NOT NULL CHECK (amount_mxn >= 0),

  payment_method TEXT NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'card', 'transfer', 'other')),
  status TEXT NOT NULL DEFAULT 'paid'
    CHECK (status IN ('paid', 'pending')),

  -- Recurring rows are what set the monthly floor in the break-even report.
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence TEXT
    CHECK (recurrence IS NULL OR recurrence IN ('monthly', 'quarterly', 'yearly')),

  coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE finance_expenses IS 'Academy expense ledger: rent, coaches paid directly, supplies, marketing, etc.';
COMMENT ON COLUMN finance_expenses.is_recurring IS 'Recurring rows form the fixed monthly cost used for minimum viable income.';

CREATE INDEX IF NOT EXISTS idx_finance_expenses_date ON finance_expenses(incurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_category ON finance_expenses(category);
CREATE INDEX IF NOT EXISTS idx_finance_expenses_recurring ON finance_expenses(is_recurring);

-- ---------------------------------------------------------------------------
-- 4. Break-even settings — single row
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),

  -- What the owner needs to take home each month.
  owner_draw_mxn NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (owner_draw_mxn >= 0),
  -- Profit to hold back on top of covering costs.
  target_profit_mxn NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (target_profit_mxn >= 0),
  -- Share of income set aside as reserve before profit is counted.
  reserve_pct NUMERIC(5, 4) NOT NULL DEFAULT 0
    CHECK (reserve_pct >= 0 AND reserve_pct < 1),
  -- Fixed costs not yet itemized in finance_expenses.
  extra_fixed_cost_mxn NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (extra_fixed_cost_mxn >= 0),

  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE finance_settings IS 'Single-row inputs for the minimum viable income calculation.';

INSERT INTO finance_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4b. Per-student enrollment tracker
--     Replicates the control sheet: what each skater paid for, the days they
--     said they would attend, attendance, absences and classes remaining.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS finance_student_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Optional link: the sheet must still work for a skater with no account yet.
  skater_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  student_name TEXT NOT NULL,

  -- What they bought.
  price_list_id UUID REFERENCES finance_price_list(id) ON DELETE SET NULL,
  coach_tier TEXT,
  class_kind TEXT,
  plan_label TEXT,
  price_mxn NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (price_mxn >= 0),
  -- "Vendidos" as kept in the sheet; the academy's own unit, not derived.
  packages_paid INTEGER NOT NULL DEFAULT 1 CHECK (packages_paid >= 0),
  -- "Total Vendido": explicit, because the sheet does not multiply it on every row.
  amount_paid_mxn NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_paid_mxn >= 0),
  sessions_paid INTEGER NOT NULL DEFAULT 0 CHECK (sessions_paid >= 0),
  last_payment_on DATE,

  -- Days the family committed to. JS weekdays: 0 = Sunday … 6 = Saturday,
  -- matching DEFAULT_PROGRAM_WEEKDAYS in utils/classSchedule.ts.
  attend_weekdays SMALLINT[] NOT NULL DEFAULT '{}'
    CHECK (attend_weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]),

  attended INTEGER NOT NULL DEFAULT 0 CHECK (attended >= 0),
  absences INTEGER NOT NULL DEFAULT 0 CHECK (absences >= 0),

  -- Quedan = sessions_paid - attended - absences (an absence burns a class).
  remaining_sessions INTEGER
    GENERATED ALWAYS AS (sessions_paid - attended - absences) STORED,

  coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  season_slug TEXT,
  started_on DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE finance_student_enrollments IS 'Per-skater control sheet: classes paid, committed weekdays, attendance, remaining.';
COMMENT ON COLUMN finance_student_enrollments.attend_weekdays IS 'JS weekdays (0=Sun) the family committed to attend.';
COMMENT ON COLUMN finance_student_enrollments.remaining_sessions IS 'Quedan: paid minus attended minus absences.';

CREATE INDEX IF NOT EXISTS idx_finance_enrollments_skater ON finance_student_enrollments(skater_id);
CREATE INDEX IF NOT EXISTS idx_finance_enrollments_active ON finance_student_enrollments(is_active);
CREATE INDEX IF NOT EXISTS idx_finance_enrollments_last_payment ON finance_student_enrollments(last_payment_on DESC);

-- ---------------------------------------------------------------------------
-- 5. RLS — admin-only, matching the rest of the admin surface
-- ---------------------------------------------------------------------------

ALTER TABLE finance_price_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_student_enrollments ENABLE ROW LEVEL SECURITY;

-- Staff may read the price sheet so program forms can quote a price.
DROP POLICY IF EXISTS "finance_price_list_staff_read" ON finance_price_list;
CREATE POLICY "finance_price_list_staff_read" ON finance_price_list
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ));

DROP POLICY IF EXISTS "finance_price_list_admin_write" ON finance_price_list;
CREATE POLICY "finance_price_list_admin_write" ON finance_price_list
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "finance_payments_admin_all" ON finance_payments;
CREATE POLICY "finance_payments_admin_all" ON finance_payments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "finance_expenses_admin_all" ON finance_expenses;
CREATE POLICY "finance_expenses_admin_all" ON finance_expenses
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "finance_settings_admin_all" ON finance_settings;
CREATE POLICY "finance_settings_admin_all" ON finance_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Coaches read the tracker so they know who has classes left; only admins edit.
DROP POLICY IF EXISTS "finance_enrollments_staff_read" ON finance_student_enrollments;
CREATE POLICY "finance_enrollments_staff_read" ON finance_student_enrollments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ));

DROP POLICY IF EXISTS "finance_enrollments_admin_write" ON finance_student_enrollments;
CREATE POLICY "finance_enrollments_admin_write" ON finance_student_enrollments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ---------------------------------------------------------------------------
-- 6. updated_at triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS update_finance_price_list_updated_at ON finance_price_list;
CREATE TRIGGER update_finance_price_list_updated_at
  BEFORE UPDATE ON finance_price_list
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_finance_payments_updated_at ON finance_payments;
CREATE TRIGGER update_finance_payments_updated_at
  BEFORE UPDATE ON finance_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_finance_expenses_updated_at ON finance_expenses;
CREATE TRIGGER update_finance_expenses_updated_at
  BEFORE UPDATE ON finance_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_finance_settings_updated_at ON finance_settings;
CREATE TRIGGER update_finance_settings_updated_at
  BEFORE UPDATE ON finance_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_finance_enrollments_updated_at ON finance_student_enrollments;
CREATE TRIGGER update_finance_enrollments_updated_at
  BEFORE UPDATE ON finance_student_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 7. Seed the price sheet exactly as it stands in the Excel
--    ON CONFLICT DO NOTHING so re-running never overwrites edits made in the app.
-- ---------------------------------------------------------------------------

INSERT INTO finance_price_list
  (coach_tier, class_kind, label_es, label_en, list_mxn, discount_pct, final_mxn,
   sessions, academy_pct, sort_order)
VALUES
  -- Coach Niik
  ('principiante', 'monthly_8',          'Mensual (8 sesh)',   'Monthly (8 sesh)',   1200, 0.20, 1000,  8, 0.20, 10),
  ('principiante', 'monthly_12',         'Mensual (12 sesh)',  'Monthly (12 sesh)',  1800, 0.20, 1440, 12, 0.20, 20),
  ('principiante', 'monthly_4',          'Mensual (4 sesh)',   'Monthly (4 sesh)',    600, 0.10,  600,  4, 0.20, 30),
  ('principiante', 'group_session',      'Grp Princ',          'Group beginner',      150, NULL, NULL,  1, 0.20, 40),
  ('principiante', 'individual_session', 'Ind Princ',          'Individual beginner', 250, NULL, NULL,  1, 0.10, 50),
  ('principiante', 'group_pack_3',       'Grupal 3 sesiones',  'Group 3 sessions',    450, 0.20,  400,  3, 0.20, 60),
  ('principiante', 'group_pack_5',       'Grupal 5 sesiones',  'Group 5 sessions',    750, 0.20,  600,  5, 0.20, 70),
  ('principiante', 'individual_pack_3',  'Ind 3 sesiones',     'Individual 3 sessions',  750, 0.20,  600,  3, 0.20, 80),
  ('principiante', 'individual_pack_5',  'Ind 5 sesiones',     'Individual 5 sessions', 1250, 0.20, 1000,  5, 0.20, 90),

  -- Coach Pro Street
  ('pro_street', 'monthly_8',          'Mensual (8 sesh)',   'Monthly (8 sesh)',   2400, 0.20, 2000,  8, 0.20, 10),
  ('pro_street', 'monthly_12',         'Mensual (12 sesh)',  'Monthly (12 sesh)',  3600, 0.20, 2880, 12, 0.20, 20),
  ('pro_street', 'group_session',      'Grp Street',         'Group street',        300, NULL, NULL,  1, 0.20, 40),
  ('pro_street', 'individual_session', 'Ind Street',         'Individual street',   500, NULL, NULL,  1, 0.10, 50),
  ('pro_street', 'group_pack_3',       'Grupal 3 sesiones',  'Group 3 sessions',    900, 0.20,  800,  3, 0.20, 60),
  ('pro_street', 'group_pack_5',       'Grupal 5 sesiones',  'Group 5 sessions',   1500, 0.20, 1200,  5, 0.20, 70),
  ('pro_street', 'individual_pack_3',  'Ind 3 sesiones',     'Individual 3 sessions', 1500, 0.20, 1200,  3, 0.20, 80),
  ('pro_street', 'individual_pack_5',  'Ind 5 sesiones',     'Individual 5 sessions', 2500, 0.20, 2000,  5, 0.20, 90),

  -- Coach Pro Bowl
  ('pro_bowl', 'monthly_8',          'Mensual (8 sesh)',   'Monthly (8 sesh)',   3200, 0.20, 2600,  8, 0.20, 10),
  ('pro_bowl', 'monthly_12',         'Mensual (12 sesh)',  'Monthly (12 sesh)',  4800, 0.20, 3840, 12, 0.20, 20),
  ('pro_bowl', 'group_session',      'Grp Bowl',           'Group bowl',          400, NULL, NULL,  1, 0.20, 40),
  ('pro_bowl', 'individual_session', 'Ind Bowl',           'Individual bowl',     500, NULL, NULL,  1, 0.10, 50),
  ('pro_bowl', 'group_pack_3',       'Grupal 3 sesiones',  'Group 3 sessions',   1200, 0.20, 1000,  3, 0.20, 60),
  ('pro_bowl', 'group_pack_5',       'Grupal 5 sesiones',  'Group 5 sessions',   2000, 0.20, 1600,  5, 0.20, 70),
  ('pro_bowl', 'individual_pack_3',  'Ind 3 sesiones',     'Individual 3 sessions', 1500, 0.20, 1200,  3, 0.20, 80),
  ('pro_bowl', 'individual_pack_5',  'Ind 5 sesiones',     'Individual 5 sessions', 2500, 0.20, 2000,  5, 0.20, 90)
ON CONFLICT (coach_tier, class_kind) DO NOTHING;
