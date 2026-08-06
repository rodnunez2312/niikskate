-- Size label for decks, apparel, etc. (e.g. 8.25, M, L)
ALTER TABLE products ADD COLUMN IF NOT EXISTS size TEXT;
