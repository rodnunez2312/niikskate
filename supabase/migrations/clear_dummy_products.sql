-- DBA / owner only — NOT exposed in the admin app.
-- Wipe all products. Run manually in Supabase SQL Editor if you truly need a empty catalog.
-- Order history keeps line items but product_id may become NULL (ON DELETE SET NULL).

DELETE FROM inventory_transactions
WHERE product_id IN (SELECT id FROM products);

DELETE FROM products;
