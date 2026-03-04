-- Skateboard Academy Database Schema
-- Run this in Supabase SQL Editor  

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing types if they exist (for clean setup)
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS class_type CASCADE;
DROP TYPE IF EXISTS time_slot CASCADE;
DROP TYPE IF EXISTS day_of_week CASCADE;
DROP TYPE IF EXISTS booking_status CASCADE;
DROP TYPE IF EXISTS product_category CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS payment_method CASCADE;
DROP TYPE IF EXISTS inventory_transaction_type CASCADE;

-- Create enum types
CREATE TYPE user_role AS ENUM ('admin', 'coach', 'customer');
CREATE TYPE class_type AS ENUM ('grouped_beginner', 'grouped_intermediate', 'individual');
CREATE TYPE time_slot AS ENUM ('early', 'late'); -- early = 5:30-7:00, late = 7:00-8:30
CREATE TYPE day_of_week AS ENUM ('tuesday', 'thursday', 'saturday');
CREATE TYPE booking_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
CREATE TYPE product_category AS ENUM ('safety_equipment', 'merchandise', 'skateboards', 'hardware', 'ramps');
CREATE TYPE order_status AS ENUM ('pending', 'processing', 'ready', 'completed', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded', 'partial');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'transfer', 'other');
CREATE TYPE inventory_transaction_type AS ENUM ('purchase', 'sale', 'adjustment', 'return', 'damage', 'transfer');

-- =====================================================
-- PROFILES & USERS
-- =====================================================

-- Profiles table (extends Supabase auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  role user_role DEFAULT 'customer' NOT NULL,
  phone TEXT,
  bio TEXT, -- For coaches
  specialties TEXT[], -- For coaches (e.g., ['beginner', 'tricks', 'ramps'])
  hourly_rate DECIMAL(10, 2), -- For coaches
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- CLASS DEFINITIONS
-- =====================================================

-- Skate classes (the 3 types of classes offered)
CREATE TABLE skate_classes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  class_type class_type NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  max_capacity INTEGER NOT NULL, -- Individual = 1, Grouped = more
  price DECIMAL(10, 2) NOT NULL,
  duration_minutes INTEGER DEFAULT 90 NOT NULL, -- 1.5 hours
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert the 3 class types (prices in MXN)
INSERT INTO skate_classes (class_type, name, description, max_capacity, price) VALUES
  ('grouped_beginner', 'Clase Grupal - Principiantes', 'Perfecto para principiantes. Aprende lo básico: equilibrio, impulso, frenado y tus primeros trucos en un ambiente de apoyo.', 8, 130.00),
  ('grouped_intermediate', 'Clase Grupal - Intermedios', 'Lleva tus habilidades al siguiente nivel. Enfócate en ollies, kickflips, rampas básicas y mejora tu técnica.', 6, 150.00),
  ('individual', 'Clase Individual', 'Entrenamiento uno a uno adaptado a tus metas específicas. Perfecto para mejorar rápidamente o trabajar técnicas avanzadas.', 1, 250.00);

-- =====================================================
-- COACH AVAILABILITY
-- =====================================================

-- Coach availability - coaches set which days/times they're available each month
CREATE TABLE coach_availability (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  day_of_week day_of_week NOT NULL,
  time_slot time_slot NOT NULL,
  is_available BOOLEAN DEFAULT TRUE NOT NULL,
  max_students INTEGER DEFAULT 8, -- Can override for specific slots
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(coach_id, year, month, day_of_week, time_slot)
);

-- Specific date availability (for exceptions/overrides)
CREATE TABLE coach_date_availability (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  time_slot time_slot NOT NULL,
  is_available BOOLEAN DEFAULT TRUE NOT NULL,
  reason TEXT, -- e.g., "vacation", "sick", "special event"
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(coach_id, date, time_slot)
);

-- =====================================================
-- CLASS SCHEDULES & BOOKINGS
-- =====================================================

-- Scheduled classes (actual instances on specific dates)
CREATE TABLE class_schedules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  class_id UUID REFERENCES skate_classes(id) ON DELETE CASCADE NOT NULL,
  coach_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  date DATE NOT NULL,
  time_slot time_slot NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  max_capacity INTEGER NOT NULL,
  current_bookings INTEGER DEFAULT 0 NOT NULL,
  price_override DECIMAL(10, 2), -- Optional price override
  is_cancelled BOOLEAN DEFAULT FALSE NOT NULL,
  cancellation_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(coach_id, date, time_slot)
);

-- Bookings
CREATE TABLE bookings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  schedule_id UUID REFERENCES class_schedules(id) ON DELETE CASCADE NOT NULL,
  status booking_status DEFAULT 'pending' NOT NULL,
  amount_paid DECIMAL(10, 2) DEFAULT 0,
  payment_status payment_status DEFAULT 'pending' NOT NULL,
  payment_method payment_method,
  booked_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  confirmed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, schedule_id)
);

-- =====================================================
-- PRODUCTS & INVENTORY
-- =====================================================

-- Products
CREATE TABLE products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category product_category NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  cost DECIMAL(10, 2), -- Cost price for profit calculation
  sale_price DECIMAL(10, 2),
  stock_quantity INTEGER DEFAULT 0 NOT NULL,
  min_stock_level INTEGER DEFAULT 5, -- Alert when below this
  max_stock_level INTEGER DEFAULT 100,
  images TEXT[] DEFAULT '{}' NOT NULL,
  specifications JSONB DEFAULT '{}',
  brand TEXT,
  is_featured BOOLEAN DEFAULT FALSE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  is_service BOOLEAN DEFAULT FALSE NOT NULL, -- For ramp building services
  requires_quote BOOLEAN DEFAULT FALSE NOT NULL, -- For custom ramps
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Inventory transactions (track all stock movements)
CREATE TABLE inventory_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  transaction_type inventory_transaction_type NOT NULL,
  quantity INTEGER NOT NULL, -- Positive for in, negative for out
  unit_cost DECIMAL(10, 2),
  total_cost DECIMAL(10, 2),
  reference_id UUID, -- Can link to order_id, purchase_order_id, etc.
  reference_type TEXT, -- 'order', 'purchase', 'adjustment'
  notes TEXT,
  performed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- SALES & ORDERS
-- =====================================================

-- Sales/Orders
CREATE TABLE orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  customer_name TEXT, -- For walk-in customers without account
  customer_email TEXT,
  customer_phone TEXT,
  subtotal DECIMAL(10, 2) NOT NULL,
  tax DECIMAL(10, 2) DEFAULT 0 NOT NULL,
  discount DECIMAL(10, 2) DEFAULT 0 NOT NULL,
  total DECIMAL(10, 2) NOT NULL,
  amount_paid DECIMAL(10, 2) DEFAULT 0 NOT NULL,
  status order_status DEFAULT 'pending' NOT NULL,
  payment_status payment_status DEFAULT 'pending' NOT NULL,
  payment_method payment_method,
  is_pos_sale BOOLEAN DEFAULT FALSE NOT NULL, -- Point of sale (in-person)
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Order items
CREATE TABLE order_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL, -- Store name at time of purchase
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  discount DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Payments (support multiple payments per order)
CREATE TABLE payments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method payment_method NOT NULL,
  reference_number TEXT, -- Card last 4, transfer reference, etc.
  notes TEXT,
  received_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  CHECK (order_id IS NOT NULL OR booking_id IS NOT NULL)
);

-- =====================================================
-- RAMP BUILDING QUOTES
-- =====================================================

-- Ramp quotes/projects
CREATE TABLE ramp_quotes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  ramp_type TEXT NOT NULL, -- 'mini_ramp', 'quarter_pipe', 'half_pipe', 'rail', 'box', 'custom'
  dimensions JSONB, -- {length, width, height, etc.}
  description TEXT NOT NULL,
  location TEXT, -- Where to build/deliver
  estimated_cost DECIMAL(10, 2),
  final_cost DECIMAL(10, 2),
  status TEXT DEFAULT 'pending' NOT NULL, -- 'pending', 'quoted', 'approved', 'in_progress', 'completed', 'cancelled'
  quoted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  images TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_is_active ON profiles(is_active);
CREATE INDEX idx_coach_availability_coach ON coach_availability(coach_id);
CREATE INDEX idx_coach_availability_month ON coach_availability(year, month);
CREATE INDEX idx_coach_date_availability_coach ON coach_date_availability(coach_id);
CREATE INDEX idx_coach_date_availability_date ON coach_date_availability(date);
CREATE INDEX idx_class_schedules_date ON class_schedules(date);
CREATE INDEX idx_class_schedules_coach ON class_schedules(coach_id);
CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_schedule ON bookings(schedule_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_inventory_transactions_product ON inventory_transactions(product_id);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO counter FROM orders WHERE DATE(created_at) = CURRENT_DATE;
  new_number := 'SA-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Update stock quantity after sale
CREATE OR REPLACE FUNCTION update_stock_after_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- Decrease stock
  UPDATE products
  SET stock_quantity = stock_quantity - NEW.quantity
  WHERE id = NEW.product_id;
  
  -- Create inventory transaction
  INSERT INTO inventory_transactions (product_id, transaction_type, quantity, reference_id, reference_type)
  VALUES (NEW.product_id, 'sale', -NEW.quantity, NEW.order_id, 'order');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stock_after_sale
  AFTER INSERT ON order_items
  FOR EACH ROW EXECUTE FUNCTION update_stock_after_sale();

-- Update booking count on class schedule
CREATE OR REPLACE FUNCTION update_booking_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE class_schedules
    SET current_bookings = current_bookings + 1
    WHERE id = NEW.schedule_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status = 'cancelled' THEN
    UPDATE class_schedules
    SET current_bookings = current_bookings - 1
    WHERE id = NEW.schedule_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_booking_count
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_booking_count();

-- Check class availability
CREATE OR REPLACE FUNCTION check_class_availability(schedule_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  max_cap INTEGER;
  current_count INTEGER;
BEGIN
  SELECT max_capacity, current_bookings INTO max_cap, current_count
  FROM class_schedules
  WHERE id = schedule_uuid;
  
  RETURN current_count < max_cap;
END;
$$ LANGUAGE plpgsql STABLE;

-- Get coach availability for a month
CREATE OR REPLACE FUNCTION get_coach_monthly_availability(
  p_coach_id UUID,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS TABLE (
  day_of_week day_of_week,
  time_slot time_slot,
  is_available BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT ca.day_of_week, ca.time_slot, ca.is_available
  FROM coach_availability ca
  WHERE ca.coach_id = p_coach_id
  AND ca.year = p_year
  AND ca.month = p_month;
END;
$$ LANGUAGE plpgsql STABLE;

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_skate_classes_updated_at
  BEFORE UPDATE ON skate_classes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_coach_availability_updated_at
  BEFORE UPDATE ON coach_availability FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_class_schedules_updated_at
  BEFORE UPDATE ON class_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ramp_quotes_updated_at
  BEFORE UPDATE ON ramp_quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE skate_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_date_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ramp_quotes ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles viewable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update any profile" ON profiles FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Skate classes policies
CREATE POLICY "Classes viewable by everyone" ON skate_classes FOR SELECT USING (true);
CREATE POLICY "Admins can manage classes" ON skate_classes FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Coach availability policies
CREATE POLICY "Coach availability viewable by everyone" ON coach_availability FOR SELECT USING (true);
CREATE POLICY "Coaches can manage own availability" ON coach_availability FOR ALL USING (
  auth.uid() = coach_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Coach date availability viewable by everyone" ON coach_date_availability FOR SELECT USING (true);
CREATE POLICY "Coaches can manage own date availability" ON coach_date_availability FOR ALL USING (
  auth.uid() = coach_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Class schedules policies
CREATE POLICY "Schedules viewable by everyone" ON class_schedules FOR SELECT USING (true);
CREATE POLICY "Coaches and admins can manage schedules" ON class_schedules FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);

-- Bookings policies
CREATE POLICY "Users can view own bookings" ON bookings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins and coaches can view all bookings" ON bookings FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);
CREATE POLICY "Users can create own bookings" ON bookings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bookings" ON bookings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage all bookings" ON bookings FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Products policies
CREATE POLICY "Products viewable by everyone" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can view all products" ON products FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can manage products" ON products FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Inventory transactions policies
CREATE POLICY "Admins can view inventory" ON inventory_transactions FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can manage inventory" ON inventory_transactions FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Orders policies
CREATE POLICY "Users can view own orders" ON orders FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Admins can view all orders" ON orders FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Users can create orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage orders" ON orders FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Order items policies
CREATE POLICY "Users can view own order items" ON order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.customer_id = auth.uid())
);
CREATE POLICY "Admins can view all order items" ON order_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Order items can be created with orders" ON order_items FOR INSERT WITH CHECK (true);

-- Payments policies
CREATE POLICY "Admins can manage payments" ON payments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Ramp quotes policies
CREATE POLICY "Users can view own quotes" ON ramp_quotes FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Admins can view all quotes" ON ramp_quotes FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Anyone can create quotes" ON ramp_quotes FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can manage quotes" ON ramp_quotes FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- =====================================================
-- SAMPLE DATA
-- =====================================================

-- Sample products
INSERT INTO products (sku, name, description, category, price, cost, stock_quantity, images, brand, is_featured) VALUES
  -- Safety Equipment
  ('SAF-HEL-001', 'Pro Skate Helmet', 'CPSC certified skateboard helmet with adjustable fit system and removable padding.', 'safety_equipment', 49.99, 25.00, 20, ARRAY['https://images.unsplash.com/photo-1557296387-5358ad7997bb?w=400'], 'Triple Eight', true),
  ('SAF-KNE-001', 'Knee Pads Pro', 'Professional grade knee pads with hard cap and comfortable neoprene sleeve.', 'safety_equipment', 34.99, 18.00, 25, ARRAY['https://images.unsplash.com/photo-1564415637254-92c6e4b0e5e5?w=400'], 'Pro-Tec', false),
  ('SAF-ELB-001', 'Elbow Pads Pro', 'Matching elbow pads with hard shell protection and secure velcro straps.', 'safety_equipment', 29.99, 15.00, 25, ARRAY['https://images.unsplash.com/photo-1564415637254-92c6e4b0e5e5?w=400'], 'Pro-Tec', false),
  ('SAF-WRI-001', 'Wrist Guards', 'Essential wrist protection with splint support and breathable design.', 'safety_equipment', 24.99, 12.00, 30, ARRAY['https://images.unsplash.com/photo-1564415637254-92c6e4b0e5e5?w=400'], 'Triple Eight', false),
  ('SAF-SET-001', 'Complete Protection Set', 'Full protection kit: helmet, knee pads, elbow pads, and wrist guards.', 'safety_equipment', 119.99, 60.00, 15, ARRAY['https://images.unsplash.com/photo-1557296387-5358ad7997bb?w=400'], 'Triple Eight', true),
  
  -- Skateboards
  ('SKT-CMP-001', 'Beginner Complete Skateboard', 'Perfect starter board with 7.75" deck, reliable trucks, and smooth wheels.', 'skateboards', 79.99, 45.00, 12, ARRAY['https://images.unsplash.com/photo-1547447134-cd3f5c716030?w=400'], 'Academy', true),
  ('SKT-CMP-002', 'Pro Complete Skateboard', 'Professional grade complete with 8.0" maple deck and premium components.', 'skateboards', 149.99, 85.00, 8, ARRAY['https://images.unsplash.com/photo-1547447134-cd3f5c716030?w=400'], 'Element', true),
  ('SKT-DCK-001', 'Pro Deck 8.0"', 'Canadian maple 7-ply deck with medium concave for street and park.', 'skateboards', 54.99, 28.00, 20, ARRAY['https://images.unsplash.com/photo-1547447134-cd3f5c716030?w=400'], 'Baker', false),
  ('SKT-DCK-002', 'Pro Deck 8.25"', 'Wider deck for more stability, perfect for transition and bowls.', 'skateboards', 54.99, 28.00, 15, ARRAY['https://images.unsplash.com/photo-1547447134-cd3f5c716030?w=400'], 'Baker', false),
  
  -- Hardware
  ('HRD-TRK-001', 'Independent Trucks 139mm', 'Industry standard trucks with responsive turn and durability.', 'hardware', 54.99, 32.00, 18, ARRAY['https://images.unsplash.com/photo-1583574918820-1cf16f702c3c?w=400'], 'Independent', false),
  ('HRD-TRK-002', 'Thunder Trucks 147mm', 'Lightweight trucks with quick turning for technical skating.', 'hardware', 52.99, 30.00, 15, ARRAY['https://images.unsplash.com/photo-1583574918820-1cf16f702c3c?w=400'], 'Thunder', false),
  ('HRD-WHL-001', 'Street Wheels 52mm 99a', 'Hard wheels perfect for street skating and smooth surfaces.', 'hardware', 32.99, 16.00, 25, ARRAY['https://images.unsplash.com/photo-1583574918820-1cf16f702c3c?w=400'], 'Spitfire', false),
  ('HRD-WHL-002', 'Cruiser Wheels 56mm 78a', 'Soft wheels for smooth rides on rough surfaces.', 'hardware', 34.99, 18.00, 20, ARRAY['https://images.unsplash.com/photo-1583574918820-1cf16f702c3c?w=400'], 'OJ', false),
  ('HRD-BRG-001', 'ABEC 7 Bearings', 'High-speed bearings for smooth rolling.', 'hardware', 19.99, 8.00, 40, ARRAY['https://images.unsplash.com/photo-1583574918820-1cf16f702c3c?w=400'], 'Bones Reds', false),
  ('HRD-GRP-001', 'Grip Tape Sheet', 'Premium black grip tape, die-cut for easy application.', 'hardware', 9.99, 4.00, 50, ARRAY['https://images.unsplash.com/photo-1583574918820-1cf16f702c3c?w=400'], 'Mob', false),
  ('HRD-HDW-001', 'Mounting Hardware Set', 'Complete set of bolts for mounting trucks.', 'hardware', 4.99, 1.50, 60, ARRAY['https://images.unsplash.com/photo-1583574918820-1cf16f702c3c?w=400'], 'Independent', false),
  
  -- Merchandise
  ('MER-TEE-001', 'Academy Logo T-Shirt', 'Premium cotton tee with Skateboard Academy logo.', 'merchandise', 24.99, 10.00, 30, ARRAY['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400'], 'Academy', false),
  ('MER-HOD-001', 'Academy Hoodie', 'Comfortable hoodie with embroidered logo.', 'merchandise', 54.99, 25.00, 20, ARRAY['https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400'], 'Academy', true),
  ('MER-CAP-001', 'Academy Snapback Cap', 'Adjustable cap with flat brim and logo.', 'merchandise', 29.99, 12.00, 25, ARRAY['https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=400'], 'Academy', false),
  ('MER-STK-001', 'Sticker Pack', 'Pack of 10 assorted skateboard stickers.', 'merchandise', 9.99, 2.00, 100, ARRAY['https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400'], 'Academy', false),
  
  -- Ramps (Services)
  ('RMP-MNI-001', 'Mini Ramp (4ft)', 'Custom built 4ft mini ramp. Price is starting estimate - request quote for exact pricing.', 'ramps', 1500.00, 800.00, 0, ARRAY['https://images.unsplash.com/photo-1564429238304-3561964f3b78?w=400'], 'Academy', true),
  ('RMP-QTR-001', 'Quarter Pipe', 'Custom quarter pipe. Various sizes available - request quote.', 'ramps', 500.00, 250.00, 0, ARRAY['https://images.unsplash.com/photo-1564429238304-3561964f3b78?w=400'], 'Academy', false),
  ('RMP-BOX-001', 'Grind Box', 'Custom grind box with steel coping. Request quote for sizing.', 'ramps', 300.00, 150.00, 0, ARRAY['https://images.unsplash.com/photo-1564429238304-3561964f3b78?w=400'], 'Academy', false),
  ('RMP-RAL-001', 'Flat Rail', 'Custom flat rail, various lengths. Request quote.', 'ramps', 200.00, 100.00, 0, ARRAY['https://images.unsplash.com/photo-1564429238304-3561964f3b78?w=400'], 'Academy', false);

-- Update ramp products to require quotes
UPDATE products SET requires_quote = true, is_service = true WHERE category = 'ramps';

-- =====================================================
-- ROLE-BASED DASHBOARD TABLES
-- =====================================================

-- Drop new enums if they exist
DROP TYPE IF EXISTS skill_difficulty CASCADE;
DROP TYPE IF EXISTS skill_category CASCADE;
DROP TYPE IF EXISTS registration_status CASCADE;
DROP TYPE IF EXISTS coach_payment_status CASCADE;

-- Create new enums
CREATE TYPE skill_difficulty AS ENUM ('beginner', 'intermediate', 'advanced');
CREATE TYPE skill_category AS ENUM ('bowl', 'street', 'surf_skate', 'fundamentals', 'safety');
CREATE TYPE registration_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE coach_payment_status AS ENUM ('pending', 'paid');

-- =====================================================
-- SKILLS LIBRARY (Predefined tricks/skills)
-- =====================================================

CREATE TABLE skills_library (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  name_es TEXT, -- Spanish name
  description TEXT NOT NULL,
  description_es TEXT, -- Spanish description
  difficulty skill_difficulty NOT NULL,
  category skill_category NOT NULL,
  video_url TEXT, -- YouTube or video link
  tips TEXT[], -- Array of tips
  prerequisites UUID[], -- Array of skill IDs that should be learned first
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Insert sample skills
INSERT INTO skills_library (name, name_es, description, description_es, difficulty, category, tips, sort_order) VALUES
  -- Fundamentals
  ('Stance & Balance', 'Postura y Equilibrio', 'Learn proper foot placement and balance on the board', 'Aprende la colocación correcta de los pies y el equilibrio en la tabla', 'beginner', 'fundamentals', ARRAY['Keep knees slightly bent', 'Weight centered over the board', 'Look where you want to go'], 1),
  ('Pushing', 'Impulso', 'Learn to push and gain speed', 'Aprende a impulsarte y ganar velocidad', 'beginner', 'fundamentals', ARRAY['Push with back foot', 'Keep pushing foot parallel', 'Smooth, consistent pushes'], 2),
  ('Stopping', 'Frenado', 'Learn different braking techniques', 'Aprende diferentes técnicas de frenado', 'beginner', 'fundamentals', ARRAY['Foot drag is easiest', 'Tail scrape for emergencies', 'Practice at low speeds first'], 3),
  ('Turning', 'Giros', 'Learn to carve and turn', 'Aprende a hacer carves y girar', 'beginner', 'fundamentals', ARRAY['Lean into turns', 'Use your shoulders', 'Start with wide turns'], 4),
  ('Tick Tack', 'Tick Tack', 'Gain speed by pivoting the board', 'Gana velocidad pivotando la tabla', 'beginner', 'fundamentals', ARRAY['Lift front wheels', 'Quick left-right motion', 'Use shoulders to lead'], 5),
  
  -- Street - Beginner
  ('Ollie', 'Ollie', 'The fundamental jump trick', 'El truco de salto fundamental', 'beginner', 'street', ARRAY['Pop the tail hard', 'Slide front foot up', 'Jump with the board'], 10),
  ('Manual', 'Manual', 'Balance on back wheels while rolling', 'Equilibrio sobre las ruedas traseras mientras ruedas', 'beginner', 'street', ARRAY['Find balance point', 'Arms out for stability', 'Look ahead, not down'], 11),
  ('Shuvit', 'Shuvit', 'Spin the board 180 degrees beneath you', 'Gira la tabla 180 grados debajo de ti', 'beginner', 'street', ARRAY['Scoop back foot', 'Jump straight up', 'Catch with front foot'], 12),
  
  -- Street - Intermediate
  ('Kickflip', 'Kickflip', 'Flip the board with a flick of your front foot', 'Voltea la tabla con un flick del pie delantero', 'intermediate', 'street', ARRAY['Flick off the side', 'Pop and flick together', 'Keep shoulders level'], 20),
  ('Heelflip', 'Heelflip', 'Flip the board using your heel', 'Voltea la tabla usando el talón', 'intermediate', 'street', ARRAY['Flick with heel edge', 'Kick out and up', 'Stay over the board'], 21),
  ('50-50 Grind', '50-50 Grind', 'Grind with both trucks on the edge', 'Grind con ambos trucks en el borde', 'intermediate', 'street', ARRAY['Approach parallel', 'Lock both trucks', 'Lean slightly in'], 22),
  ('Boardslide', 'Boardslide', 'Slide on the middle of the board', 'Desliza sobre el centro de la tabla', 'intermediate', 'street', ARRAY['Turn 90 degrees', 'Center over obstacle', 'Keep weight centered'], 23),
  
  -- Street - Advanced
  ('Tre Flip', 'Tre Flip', '360 flip combining kickflip and 360 shuvit', '360 flip combinando kickflip y 360 shuvit', 'advanced', 'street', ARRAY['Strong scoop', 'Flick and scoop together', 'Catch at peak'], 30),
  ('Hardflip', 'Hardflip', 'Frontside pop shuvit with a kickflip', 'Pop shuvit frontside con kickflip', 'advanced', 'street', ARRAY['Pop straight down', 'Flick between legs', 'Jump forward slightly'], 31),
  
  -- Bowl - Beginner
  ('Dropping In', 'Tirarse', 'Enter the bowl from the coping', 'Entra al bowl desde el coping', 'beginner', 'bowl', ARRAY['Commit fully', 'Lean forward', 'Stomp front foot'], 40),
  ('Pumping', 'Bombear', 'Gain speed in transitions', 'Gana velocidad en las transiciones', 'beginner', 'bowl', ARRAY['Extend on way up', 'Compress on way down', 'Use whole body'], 41),
  ('Kick Turn', 'Kick Turn', 'Turn on the transition using the tail', 'Gira en la transición usando el tail', 'beginner', 'bowl', ARRAY['Lift front wheels', 'Pivot on back wheels', 'Use shoulders'], 42),
  
  -- Bowl - Intermediate
  ('Rock to Fakie', 'Rock to Fakie', 'Rock the front wheels over coping and roll back', 'Poner las ruedas frontales sobre el coping y regresar', 'intermediate', 'bowl', ARRAY['Approach with speed', 'Tap front wheels over', 'Lean back to return'], 50),
  ('Axle Stall', 'Axle Stall', 'Stall with both trucks on coping', 'Stall con ambos trucks en el coping', 'intermediate', 'bowl', ARRAY['Get both trucks over', 'Pause at the top', 'Lean in to drop'], 51),
  ('Frontside Grind', 'Frontside Grind', 'Grind frontside on pool coping', 'Grind frontside en el coping del pool', 'intermediate', 'bowl', ARRAY['Approach at angle', 'Lock front truck', 'Keep momentum'], 52),
  
  -- Bowl - Advanced
  ('Backside Air', 'Backside Air', 'Aerial with backside grab', 'Aéreo con agarre backside', 'advanced', 'bowl', ARRAY['Pump for speed', 'Grab indy or melon', 'Extend at peak'], 60),
  ('Frontside Air', 'Frontside Air', 'Aerial going frontside', 'Aéreo yendo frontside', 'advanced', 'bowl', ARRAY['Carve up the wall', 'Grab and extend', 'Spot your landing'], 61),
  
  -- Surf Skate
  ('Carving', 'Carving', 'Deep flowing turns like surfing', 'Giros profundos y fluidos como en el surf', 'beginner', 'surf_skate', ARRAY['Bend knees deep', 'Lead with shoulders', 'Flow like water'], 70),
  ('Pumping (Surf)', 'Bombeo (Surf)', 'Generate speed through body movement', 'Genera velocidad con el movimiento del cuerpo', 'beginner', 'surf_skate', ARRAY['Use whole body', 'Twist hips', 'Rhythmic motion'], 71),
  ('Snap', 'Snap', 'Quick direction change at top of carve', 'Cambio rápido de dirección arriba del carve', 'intermediate', 'surf_skate', ARRAY['Build up speed', 'Quick hip rotation', 'Weight on back foot'], 72),
  ('Cutback', 'Cutback', 'Sharp turn back toward the start', 'Giro cerrado de regreso hacia el inicio', 'intermediate', 'surf_skate', ARRAY['Carve wide first', 'Compress then extend', 'Lead with shoulders'], 73),
  
  -- Safety
  ('Falling Safely', 'Caer de Forma Segura', 'How to fall without injury', 'Cómo caer sin lesionarse', 'beginner', 'safety', ARRAY['Roll, don''t catch yourself', 'Protect your head', 'Relax your body'], 80),
  ('Equipment Check', 'Revisión de Equipo', 'Checking your board and safety gear', 'Revisar tu tabla y equipo de seguridad', 'beginner', 'safety', ARRAY['Check trucks tightness', 'Inspect wheels', 'Verify helmet fit'], 81);

-- =====================================================
-- STUDENT PROGRESS (Track skills learned)
-- =====================================================

CREATE TABLE student_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  skill_id UUID REFERENCES skills_library(id) ON DELETE CASCADE NOT NULL,
  learned_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  marked_by UUID REFERENCES profiles(id), -- Coach who marked it
  proficiency INTEGER DEFAULT 1 CHECK (proficiency >= 1 AND proficiency <= 5), -- 1-5 rating
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(student_id, skill_id)
);

-- =====================================================
-- GUEST BOOKINGS (For non-logged-in users)
-- =====================================================

CREATE TABLE guest_bookings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT,
  full_name TEXT NOT NULL,
  booking_data JSONB NOT NULL, -- Store all booking details
  linked_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- Set when user registers
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- REGISTRATION REQUESTS (Admin approval flow)
-- =====================================================

CREATE TABLE registration_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  message TEXT, -- Why they want to join
  status registration_status DEFAULT 'pending' NOT NULL,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- ATTENDANCE (Track class attendance)
-- =====================================================

CREATE TABLE attendance (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  class_date DATE NOT NULL,
  time_slot time_slot NOT NULL,
  attended BOOLEAN DEFAULT FALSE NOT NULL,
  marked_by UUID REFERENCES profiles(id),
  marked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(student_id, class_date, time_slot)
);

-- =====================================================
-- CLASS PLANS (Coach class planning)
-- =====================================================

CREATE TABLE class_plans (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  plan_date DATE NOT NULL,
  time_slot time_slot NOT NULL,
  title TEXT,
  planned_skills UUID[], -- Array of skill IDs to teach
  warmup_notes TEXT,
  main_activity_notes TEXT,
  cooldown_notes TEXT,
  equipment_needed TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(coach_id, plan_date, time_slot)
);

-- =====================================================
-- COACH PAYMENTS (Track coach compensation)
-- =====================================================

CREATE TABLE coach_payments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  coach_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  classes_taught INTEGER DEFAULT 0,
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'MXN',
  status coach_payment_status DEFAULT 'pending' NOT NULL,
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES profiles(id),
  payment_method payment_method,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- NEWS & EVENTS
-- =====================================================

CREATE TABLE news_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  title_es TEXT, -- Spanish title
  content TEXT NOT NULL,
  content_es TEXT, -- Spanish content
  event_type TEXT DEFAULT 'news', -- 'news', 'event', 'announcement'
  event_date DATE, -- For events
  event_location TEXT,
  image_url TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- =====================================================
-- INDEXES FOR NEW TABLES
-- =====================================================

CREATE INDEX idx_skills_library_category ON skills_library(category);
CREATE INDEX idx_skills_library_difficulty ON skills_library(difficulty);
CREATE INDEX idx_student_progress_student ON student_progress(student_id);
CREATE INDEX idx_student_progress_skill ON student_progress(skill_id);
CREATE INDEX idx_guest_bookings_email ON guest_bookings(email);
CREATE INDEX idx_guest_bookings_linked_user ON guest_bookings(linked_user_id);
CREATE INDEX idx_registration_requests_status ON registration_requests(status);
CREATE INDEX idx_registration_requests_email ON registration_requests(email);
CREATE INDEX idx_attendance_student ON attendance(student_id);
CREATE INDEX idx_attendance_date ON attendance(class_date);
CREATE INDEX idx_class_plans_coach ON class_plans(coach_id);
CREATE INDEX idx_class_plans_date ON class_plans(plan_date);
CREATE INDEX idx_coach_payments_coach ON coach_payments(coach_id);
CREATE INDEX idx_coach_payments_status ON coach_payments(status);
CREATE INDEX idx_news_events_type ON news_events(event_type);
CREATE INDEX idx_news_events_published ON news_events(is_published);

-- =====================================================
-- RLS FOR NEW TABLES
-- =====================================================

ALTER TABLE skills_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE guest_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE news_events ENABLE ROW LEVEL SECURITY;

-- Skills library - viewable by all
CREATE POLICY "Skills viewable by everyone" ON skills_library FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage skills" ON skills_library FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Student progress - users see own, coaches/admins see all
CREATE POLICY "Users can view own progress" ON student_progress FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Coaches and admins can view all progress" ON student_progress FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);
CREATE POLICY "Coaches can mark progress" ON student_progress FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);
CREATE POLICY "Coaches can update progress" ON student_progress FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);

-- Guest bookings - public insert, admin view
CREATE POLICY "Anyone can create guest booking" ON guest_bookings FOR INSERT WITH CHECK (true);
CREATE POLICY "Admins can view guest bookings" ON guest_bookings FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can update guest bookings" ON guest_bookings FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Registration requests - public insert, admin manage
CREATE POLICY "Anyone can create registration request" ON registration_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own request" ON registration_requests FOR SELECT USING (
  email = (SELECT email FROM profiles WHERE id = auth.uid())
);
CREATE POLICY "Admins can view all requests" ON registration_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can update requests" ON registration_requests FOR UPDATE USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Attendance - coaches/admins can manage
CREATE POLICY "Users can view own attendance" ON attendance FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Coaches and admins can view all attendance" ON attendance FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);
CREATE POLICY "Coaches and admins can manage attendance" ON attendance FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach'))
);

-- Class plans - coaches own, admins all
CREATE POLICY "Coaches can view own plans" ON class_plans FOR SELECT USING (auth.uid() = coach_id);
CREATE POLICY "Admins can view all plans" ON class_plans FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Coaches can manage own plans" ON class_plans FOR ALL USING (auth.uid() = coach_id);
CREATE POLICY "Admins can manage all plans" ON class_plans FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Coach payments - coaches view own, admins manage
CREATE POLICY "Coaches can view own payments" ON coach_payments FOR SELECT USING (auth.uid() = coach_id);
CREATE POLICY "Admins can manage payments" ON coach_payments FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- News events - public view published, admins manage
CREATE POLICY "Anyone can view published news" ON news_events FOR SELECT USING (is_published = true);
CREATE POLICY "Admins can view all news" ON news_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can manage news" ON news_events FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Add updated_at triggers for new tables
CREATE TRIGGER update_skills_library_updated_at
  BEFORE UPDATE ON skills_library FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_registration_requests_updated_at
  BEFORE UPDATE ON registration_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_class_plans_updated_at
  BEFORE UPDATE ON class_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_coach_payments_updated_at
  BEFORE UPDATE ON coach_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_news_events_updated_at
  BEFORE UPDATE ON news_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
