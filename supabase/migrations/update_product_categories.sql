-- Update Product Categories Migration
-- New categories: tablas, llantas, hardware, lijas, protecciones, cascos, merch, ramps
--
-- IMPORTANT: Run migrate_product_category_enum.sql first on databases that still have
-- the old enum (safety_equipment, merchandise, skateboards, hardware, ramps).

-- Add brand column if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'products' AND column_name = 'brand') THEN
        ALTER TABLE products ADD COLUMN brand TEXT;
    END IF;
END $$;

-- Sample insert for testing categories (safe to re-run)
INSERT INTO products (sku, name, description, category, price, stock_quantity, images, brand, is_featured)
VALUES
  ('SKU-TABLA-001', 'NiikSkate Pro Deck 8.0', 'Professional skateboard deck with custom NiikSkate design', 'tablas', 1200, 5, '{}', 'NiikSkate', true),
  ('SKU-LLANTA-001', 'Spitfire Formula Four 52mm', 'Classic street wheels, 99 durometer', 'llantas', 950, 8, '{}', 'Spitfire', false),
  ('SKU-HW-001', 'Independent Stage 11 149mm', 'Pro trucks for street and park', 'hardware', 1800, 4, '{}', 'Independent', false),
  ('SKU-LIJA-001', 'Mob Grip Sheet', 'High-quality grip tape sheet', 'lijas', 180, 20, '{}', 'Mob Grip', false),
  ('SKU-PROT-001', 'Triple 8 Knee Pads', 'Professional knee protection', 'protecciones', 650, 6, '{}', 'Triple 8', false),
  ('SKU-CASCO-001', 'Pro-Tec Classic Certified', 'CPSC certified skate helmet', 'cascos', 850, 5, '{}', 'Pro-Tec', true),
  ('SKU-MERCH-001', 'NiikSkate Logo Tee', 'Classic cotton t-shirt with logo', 'merch', 350, 15, '{}', 'NiikSkate', false)
ON CONFLICT (sku) DO NOTHING;
