-- A program sits above skill_groups (levels).
-- Run this in the Supabase SQL Editor. Vercel deploys do not apply SQL.

CREATE TABLE IF NOT EXISTS training_programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  discipline TEXT NOT NULL CHECK (discipline IN ('skateboarding', 'scooter', 'rollerblading', 'bmx', 'parkour')),
  description TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  is_favorite BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE training_programs ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE training_programs ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false NOT NULL;

ALTER TABLE skill_groups
  ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES training_programs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_skill_groups_program ON skill_groups(program_id);
CREATE INDEX IF NOT EXISTS idx_training_programs_discipline ON training_programs(discipline);

INSERT INTO training_programs (name, discipline, description, is_active)
SELECT 'Skateboarding', 'skateboarding', 'Existing skate levels', true
WHERE NOT EXISTS (
  SELECT 1 FROM training_programs
  WHERE discipline = 'skateboarding' AND name = 'Skateboarding'
);

UPDATE skill_groups
SET program_id = (
  SELECT id FROM training_programs
  WHERE discipline = 'skateboarding' AND name = 'Skateboarding'
  LIMIT 1
)
WHERE program_id IS NULL;

UPDATE training_programs
SET is_favorite = true
WHERE discipline = 'skateboarding' AND name = 'Skateboarding' AND is_favorite = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON training_programs TO authenticated;

ALTER TABLE training_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches and admins select training_programs" ON training_programs;
CREATE POLICY "Coaches and admins select training_programs" ON training_programs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));

DROP POLICY IF EXISTS "Authenticated users read active training_programs" ON training_programs;
CREATE POLICY "Authenticated users read active training_programs" ON training_programs
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Coaches and admins insert training_programs" ON training_programs;
CREATE POLICY "Coaches and admins insert training_programs" ON training_programs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));

DROP POLICY IF EXISTS "Coaches and admins update training_programs" ON training_programs;
CREATE POLICY "Coaches and admins update training_programs" ON training_programs
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));

DROP POLICY IF EXISTS "Admin or creator can delete training_programs" ON training_programs;
CREATE POLICY "Admin or creator can delete training_programs" ON training_programs
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR created_by = auth.uid()
  );
