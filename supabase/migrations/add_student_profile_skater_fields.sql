-- Optional skater profile fields for Student Dashboard (stance, style, location, level)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS stance TEXT;   -- e.g. 'regular', 'goofy'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skating_style TEXT;  -- e.g. 'vert', 'street'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_style TEXT;     -- e.g. 'never_mongo', 'mongo'
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skill_level TEXT;    -- 'beginner', 'intermediate', 'pro'

-- Circular ratings (0-10) for Skater Profile view: Fundamentals, Skate IQ, Street, Vert, etc.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating_fundamentals INTEGER CHECK (rating_fundamentals IS NULL OR (rating_fundamentals >= 0 AND rating_fundamentals <= 10));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating_skate_iq INTEGER CHECK (rating_skate_iq IS NULL OR (rating_skate_iq >= 0 AND rating_skate_iq <= 10));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating_street INTEGER CHECK (rating_street IS NULL OR (rating_street >= 0 AND rating_street <= 10));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating_vert INTEGER CHECK (rating_vert IS NULL OR (rating_vert >= 0 AND rating_vert <= 10));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating_speed_ollie INTEGER CHECK (rating_speed_ollie IS NULL OR (rating_speed_ollie >= 0 AND rating_speed_ollie <= 10));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating_fakie_switch INTEGER CHECK (rating_fakie_switch IS NULL OR (rating_fakie_switch >= 0 AND rating_fakie_switch <= 10));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating_slps INTEGER CHECK (rating_slps IS NULL OR (rating_slps >= 0 AND rating_slps <= 10));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS rating_rails INTEGER CHECK (rating_rails IS NULL OR (rating_rails >= 0 AND rating_rails <= 10));
