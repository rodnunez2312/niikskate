-- Seed 6 default skill groups that cannot be removed. Run in Supabase SQL Editor.

-- Ensure created_by exists (used by delete policy below)
ALTER TABLE skill_groups
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_skill_groups_created_by ON skill_groups(created_by);

-- Add is_system flag so we can hide delete for these groups
ALTER TABLE skill_groups
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false NOT NULL;

-- Seed 6 groups (idempotent: only if not exist)
INSERT INTO skill_groups (name, description, color, sort_order, is_system)
SELECT v.name, v.description, v.color, v.sort_order, v.is_system
FROM (VALUES
  ('Level 1: Foundations', 'Basic board control and safety', '#16a34a', 1, true),
  ('Level 2: Balance & Control', 'Developing balance and basic movements', '#2563eb', 2, true),
  ('Level 3: Basic Tricks', 'First tricks and transitions', '#4f46e5', 3, true),
  ('Level 4: Progression', 'Building on fundamentals', '#7c3aed', 4, true),
  ('Level 5: Intermediate', 'More complex tricks', '#a855f7', 5, true),
  ('Level 6: Advanced Basics', 'Advanced fundamental skills', '#db2777', 6, true)
) AS v(name, description, color, sort_order, is_system)
WHERE NOT EXISTS (SELECT 1 FROM skill_groups g WHERE g.name = v.name);

-- Mark existing seeded groups as system (in case they were created by an older migration)
UPDATE skill_groups SET is_system = true
WHERE name IN (
  'Level 1: Foundations', 'Level 2: Balance & Control', 'Level 3: Basic Tricks',
  'Level 4: Progression', 'Level 5: Intermediate', 'Level 6: Advanced Basics'
);

-- Add 6 areas to every group that doesn't have them yet
INSERT INTO skill_areas (group_id, name, sort_order)
SELECT g.id, v.name, v.ord
FROM skill_groups g
CROSS JOIN (VALUES ('Flatground', 1), ('Street', 2), ('Park', 3), ('Bowl', 4), ('Mini Ramp', 5), ('Vert', 6)) AS v(name, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM skill_areas a WHERE a.group_id = g.id AND a.name = v.name
);

-- Prevent anyone from deleting system groups (update RLS)
DROP POLICY IF EXISTS "Admin or creator can delete skill_groups" ON skill_groups;
CREATE POLICY "Admin or creator can delete skill_groups" ON skill_groups
  FOR DELETE TO authenticated
  USING (
    (is_system IS FALSE OR is_system IS NULL)
    AND (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      OR created_by = auth.uid()
    )
  );
