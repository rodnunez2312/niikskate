-- Add color and is_default to programs (for Create New Program form)
ALTER TABLE programs ADD COLUMN IF NOT EXISTS color TEXT;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false NOT NULL;
