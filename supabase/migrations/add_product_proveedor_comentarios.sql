-- Internal catalog fields (admin / CSV only; not shown on public storefront queries)
ALTER TABLE products ADD COLUMN IF NOT EXISTS proveedor TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS comentarios TEXT;

COMMENT ON COLUMN products.proveedor IS 'Supplier name — admin only';
COMMENT ON COLUMN products.comentarios IS 'Internal notes — admin only';
