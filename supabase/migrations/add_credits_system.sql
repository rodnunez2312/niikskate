-- =====================================================
-- USER CREDITS / TOKENS SYSTEM
-- Run this in Supabase SQL Editor
-- =====================================================

-- Enum for credit type (what kind of package/purchase)
CREATE TYPE credit_type AS ENUM (
  'monthly_beginner',    -- 8 classes, max 2 per week
  'monthly_intermediate', -- 8 classes, max 2 per week
  'pkg_3',               -- 3 classes (10% discount)
  'pkg_5',               -- 5 classes (15% discount)
  'pkg_10',              -- 10 classes (20% discount)
  'saturdays',           -- 4 classes (Saturdays only)
  'single_group',        -- 1 group class
  'single_individual'    -- 1 individual class
);

-- Enum for credit status
CREATE TYPE credit_status AS ENUM (
  'active',      -- Available to use
  'used',        -- Already booked
  'expired',     -- Past expiration date
  'cancelled'    -- Cancelled/refunded
);

-- User Credits table - tracks purchased class credits
CREATE TABLE user_credits (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  credit_type credit_type NOT NULL,
  total_credits INTEGER NOT NULL,           -- Total credits purchased
  remaining_credits INTEGER NOT NULL,       -- Credits still available
  purchase_date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expiration_date TIMESTAMPTZ NOT NULL,     -- Credits expire (usually 30 days)
  price_paid_mxn DECIMAL(10, 2),
  price_paid_usd DECIMAL(10, 2),
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Class Reservations table - tracks individual class bookings using credits
CREATE TABLE class_reservations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  credit_id UUID REFERENCES user_credits(id) ON DELETE SET NULL,  -- Which credit pack was used
  reservation_date DATE NOT NULL,
  time_slot time_slot NOT NULL,             -- 'early' or 'late'
  class_type class_type,                    -- Type of class
  status credit_status DEFAULT 'active' NOT NULL,
  equipment_rental JSONB DEFAULT '[]',      -- Equipment rented for this class
  coach_id UUID REFERENCES profiles(id),    -- Assigned coach (optional)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  -- Prevent double booking same date/slot
  UNIQUE(user_id, reservation_date, time_slot)
);

-- Indexes for performance
CREATE INDEX idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX idx_user_credits_expiration ON user_credits(expiration_date);
CREATE INDEX idx_class_reservations_user_id ON class_reservations(user_id);
CREATE INDEX idx_class_reservations_date ON class_reservations(reservation_date);
CREATE INDEX idx_class_reservations_credit_id ON class_reservations(credit_id);

-- Update timestamp trigger
CREATE TRIGGER update_user_credits_updated_at
  BEFORE UPDATE ON user_credits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_class_reservations_updated_at
  BEFORE UPDATE ON class_reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_reservations ENABLE ROW LEVEL SECURITY;

-- Users can view their own credits
CREATE POLICY "Users can view own credits" ON user_credits
  FOR SELECT USING (auth.uid() = user_id);

-- Users can view their own reservations
CREATE POLICY "Users can view own reservations" ON class_reservations
  FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own reservations
CREATE POLICY "Users can create own reservations" ON class_reservations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own reservations (cancel)
CREATE POLICY "Users can update own reservations" ON class_reservations
  FOR UPDATE USING (auth.uid() = user_id);

-- Admins can do everything
CREATE POLICY "Admins can manage all credits" ON user_credits
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admins can manage all reservations" ON class_reservations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Coaches can view reservations (to see who's in class)
CREATE POLICY "Coaches can view reservations" ON class_reservations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
  );

-- Function to check if user can add more reservations to a week (max 2 for monthly)
CREATE OR REPLACE FUNCTION check_weekly_reservation_limit(
  p_user_id UUID,
  p_credit_id UUID,
  p_date DATE
)
RETURNS BOOLEAN AS $$
DECLARE
  v_credit_type credit_type;
  v_week_start DATE;
  v_week_count INTEGER;
BEGIN
  -- Get the credit type
  SELECT credit_type INTO v_credit_type
  FROM user_credits
  WHERE id = p_credit_id;
  
  -- Only apply limit for monthly programs
  IF v_credit_type NOT IN ('monthly_beginner', 'monthly_intermediate') THEN
    RETURN TRUE;
  END IF;
  
  -- Get start of week (Sunday)
  v_week_start := DATE_TRUNC('week', p_date)::DATE;
  
  -- Count reservations this week for this credit
  SELECT COUNT(*) INTO v_week_count
  FROM class_reservations
  WHERE user_id = p_user_id
    AND credit_id = p_credit_id
    AND reservation_date >= v_week_start
    AND reservation_date < v_week_start + INTERVAL '7 days'
    AND status = 'active';
  
  -- Allow if less than 2
  RETURN v_week_count < 2;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to deduct credit when reservation is made
CREATE OR REPLACE FUNCTION deduct_credit_on_reservation()
RETURNS TRIGGER AS $$
BEGIN
  -- Deduct 1 credit from the credit pack
  UPDATE user_credits
  SET remaining_credits = remaining_credits - 1,
      updated_at = NOW()
  WHERE id = NEW.credit_id
    AND remaining_credits > 0;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to deduct credit
CREATE TRIGGER trigger_deduct_credit_on_reservation
  AFTER INSERT ON class_reservations
  FOR EACH ROW
  WHEN (NEW.credit_id IS NOT NULL)
  EXECUTE FUNCTION deduct_credit_on_reservation();

-- Function to restore credit when reservation is cancelled
CREATE OR REPLACE FUNCTION restore_credit_on_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status = 'active' THEN
    -- Restore 1 credit to the credit pack
    UPDATE user_credits
    SET remaining_credits = remaining_credits + 1,
        updated_at = NOW()
    WHERE id = NEW.credit_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to restore credit on cancellation
CREATE TRIGGER trigger_restore_credit_on_cancellation
  AFTER UPDATE ON class_reservations
  FOR EACH ROW
  WHEN (NEW.credit_id IS NOT NULL)
  EXECUTE FUNCTION restore_credit_on_cancellation();
