-- =====================================================
-- Create News Feed / Blog System
-- Admin can post news that appears for all users
-- =====================================================

-- Create news_feed table
CREATE TABLE IF NOT EXISTS news_feed (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  excerpt VARCHAR(500),
  image_url TEXT,
  video_url TEXT,
  category VARCHAR(50) DEFAULT 'general',
  tags TEXT[],
  author_id UUID REFERENCES profiles(id),
  is_published BOOLEAN DEFAULT false,
  is_featured BOOLEAN DEFAULT false,
  publish_date TIMESTAMPTZ,
  instagram_url TEXT,
  facebook_url TEXT,
  external_link TEXT,
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_news_feed_published ON news_feed(is_published, publish_date DESC);
CREATE INDEX IF NOT EXISTS idx_news_feed_category ON news_feed(category);
CREATE INDEX IF NOT EXISTS idx_news_feed_featured ON news_feed(is_featured, publish_date DESC);

-- Enable RLS
ALTER TABLE news_feed ENABLE ROW LEVEL SECURITY;

-- Everyone can read published news
CREATE POLICY "Anyone can view published news"
ON news_feed FOR SELECT
USING (is_published = true AND (publish_date IS NULL OR publish_date <= NOW()));

-- Admins can do everything
CREATE POLICY "Admins can manage all news"
ON news_feed FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Create social_accounts table for storing connected accounts
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform VARCHAR(50) NOT NULL, -- 'instagram', 'facebook', 'youtube', 'tiktok'
  account_name VARCHAR(255),
  account_url TEXT NOT NULL,
  embed_code TEXT,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for social_accounts
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;

-- Everyone can read social accounts
CREATE POLICY "Anyone can view active social accounts"
ON social_accounts FOR SELECT
USING (is_active = true);

-- Admins can manage social accounts
CREATE POLICY "Admins can manage social accounts"
ON social_accounts FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Insert default social accounts for NiikSkate
INSERT INTO social_accounts (platform, account_name, account_url, display_order) VALUES
('instagram', 'niikskate', 'https://www.instagram.com/niikskate/', 1),
('facebook', 'NiikSkate', 'https://www.facebook.com/niikskate/', 2)
ON CONFLICT DO NOTHING;

-- Insert sample news post
INSERT INTO news_feed (title, content, excerpt, category, is_published, is_featured, publish_date, author_id)
SELECT 
  'Bienvenidos a NiikSkate Academy',
  'Estamos emocionados de lanzar nuestra nueva plataforma de reservas y seguimiento de progreso. Aquí podrás reservar tus clases, ver tu progreso y conectar con nuestra comunidad de skaters.

## Nuevas Funciones

- **Sistema de Créditos**: Compra paquetes mensuales o clases individuales
- **Seguimiento de Progreso**: Ve tu evolución con estadísticas estilo Tony Hawk
- **Reservas Fáciles**: Agenda tus clases con unos pocos clicks

¡Nos vemos en el parque! 🛹',
  'Descubre todas las nuevas funciones de nuestra plataforma de reservas y seguimiento.',
  'announcement',
  true,
  true,
  NOW(),
  id
FROM profiles WHERE role = 'admin' LIMIT 1;
