-- Optional English copy for news_feed (Spanish remains in title, content, excerpt)
ALTER TABLE news_feed
  ADD COLUMN IF NOT EXISTS title_en VARCHAR(255),
  ADD COLUMN IF NOT EXISTS content_en TEXT,
  ADD COLUMN IF NOT EXISTS excerpt_en VARCHAR(500);

COMMENT ON COLUMN news_feed.title_en IS 'English title; shown when app language is English if set';
COMMENT ON COLUMN news_feed.content_en IS 'English body; fallback to content if null';
COMMENT ON COLUMN news_feed.excerpt_en IS 'English excerpt; fallback to excerpt if null';

-- Seed English for the default welcome post (matches create_news_feed.sql Spanish insert)
UPDATE news_feed
SET
  title_en = 'Welcome to NiikSkate Academy',
  excerpt_en = 'Discover all the new features of our booking and progress-tracking platform.',
  content_en = E'We''re excited to launch our new booking and progress-tracking platform. Here you can book classes, track your progress, and connect with our skater community.\n\n## New features\n\n- **Credit system**: Buy monthly packages or single classes\n- **Progress tracking**: See your evolution with Tony Hawk–style stats\n- **Easy booking**: Schedule classes in a few taps\n\nSee you at the park! 🛹'
WHERE title = 'Bienvenidos a NiikSkate Academy'
  AND (title_en IS NULL OR title_en = '');
