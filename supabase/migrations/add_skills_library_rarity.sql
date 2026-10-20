-- Collectible rarity per trick (Bolsa de trucos). NULL = automatic from program level
-- (Level 1-2 bronze, 3 silver, 4 gold, 5 platinum). Library sync never writes this column.
ALTER TABLE skills_library
  ADD COLUMN IF NOT EXISTS rarity TEXT
  CHECK (rarity IS NULL OR rarity IN ('bronze', 'silver', 'gold', 'platinum'));
