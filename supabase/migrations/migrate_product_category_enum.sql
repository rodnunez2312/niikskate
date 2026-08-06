-- Migrate product_category enum to Skateshop categories.
-- Fixes: invalid input value for enum product_category: "tablas"
-- Run once in Supabase Dashboard → SQL Editor (production project).

BEGIN;

-- 1) Store categories as text so we can remap values
ALTER TABLE products
  ALTER COLUMN category TYPE text
  USING category::text;

-- 2) Map legacy enum labels → new labels
UPDATE products SET category = 'tablas' WHERE category = 'skateboards';
UPDATE products SET category = 'merch' WHERE category = 'merchandise';
UPDATE products SET category = 'cascos'
  WHERE category = 'safety_equipment'
    AND (LOWER(name) LIKE '%helmet%' OR LOWER(name) LIKE '%casco%');
UPDATE products SET category = 'protecciones'
  WHERE category = 'safety_equipment';
-- hardware and ramps unchanged

-- 3) Replace enum type
DROP TYPE product_category;

CREATE TYPE product_category AS ENUM (
  'tablas',
  'llantas',
  'hardware',
  'lijas',
  'protecciones',
  'cascos',
  'merch',
  'ramps'
);

-- 4) Cast column back to enum
ALTER TABLE products
  ALTER COLUMN category TYPE product_category
  USING category::product_category;

COMMIT;

-- Optional: verify
-- SELECT category, COUNT(*) FROM products GROUP BY category ORDER BY category;
