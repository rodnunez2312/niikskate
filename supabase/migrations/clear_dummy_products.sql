-- Remove ALL products (dummy seed data + manual tests).
-- Run once in Supabase SQL Editor before bulk import of real inventory.
-- Order history keeps line items but product_id may become NULL (ON DELETE SET NULL).

DELETE FROM inventory_transactions
WHERE product_id IN (SELECT id FROM products);

DELETE FROM products;
