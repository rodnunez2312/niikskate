-- Groups Structure: skill_groups (Level 1, 2, ...), skill_areas (Flatground, Street, ...), skill_subgroups (direct)
CREATE TABLE IF NOT EXISTS skill_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_areas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES skill_groups(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS skill_subgroups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES skill_groups(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skill_areas_group ON skill_areas(group_id);
CREATE INDEX IF NOT EXISTS idx_skill_subgroups_group ON skill_subgroups(group_id);

ALTER TABLE skill_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_subgroups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches and admins manage skill_groups" ON skill_groups;
CREATE POLICY "Coaches and admins manage skill_groups" ON skill_groups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));
DROP POLICY IF EXISTS "Coaches and admins manage skill_areas" ON skill_areas;
CREATE POLICY "Coaches and admins manage skill_areas" ON skill_areas FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));
DROP POLICY IF EXISTS "Coaches and admins manage skill_subgroups" ON skill_subgroups;
CREATE POLICY "Coaches and admins manage skill_subgroups" ON skill_subgroups FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));

-- Seed default groups (matching the reference UI)
INSERT INTO skill_groups (name, description, color, sort_order)
SELECT 'Level 1: Foundations', 'Basic board control and safety', '#16a34a', 1 WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Level 1: Foundations');
INSERT INTO skill_groups (name, description, color, sort_order)
SELECT 'Level 2: Balance & Control', 'Developing balance and basic movements', '#2563eb', 2 WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Level 2: Balance & Control');
INSERT INTO skill_groups (name, description, color, sort_order)
SELECT 'Level 3: Basic Tricks', 'First tricks and transitions', '#4f46e5', 3 WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Level 3: Basic Tricks');
INSERT INTO skill_groups (name, description, color, sort_order)
SELECT 'Level 4: Progression', 'Building on fundamentals', '#7c3aed', 4 WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Level 4: Progression');
INSERT INTO skill_groups (name, description, color, sort_order)
SELECT 'Level 5: Intermediate', 'More complex tricks', '#a855f7', 5 WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Level 5: Intermediate');
INSERT INTO skill_groups (name, description, color, sort_order)
SELECT 'Level 6: Advanced Basics', 'Advanced fundamental skills', '#db2777', 6 WHERE NOT EXISTS (SELECT 1 FROM skill_groups WHERE name = 'Level 6: Advanced Basics');

-- Add areas to Level 1 (run after groups exist)
INSERT INTO skill_areas (group_id, name, sort_order)
SELECT g.id, v.name, v.ord FROM skill_groups g,
(VALUES ('Flatground', 1), ('Street', 2), ('Park', 3), ('Bowl', 4), ('Mini Ramp', 5), ('Vert', 6)) AS v(name, ord)
WHERE g.name = 'Level 1: Foundations'
AND NOT EXISTS (SELECT 1 FROM skill_areas a WHERE a.group_id = g.id AND a.name = v.name);
