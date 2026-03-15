-- Link skill_areas to skills_library (drills/tricks from Niik Plan Clases).
-- variant: optional sub-label e.g. "stationary", "rolling", "low ramp".
CREATE TABLE IF NOT EXISTS area_skills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  area_id UUID REFERENCES skill_areas(id) ON DELETE CASCADE NOT NULL,
  skill_id UUID REFERENCES skills_library(id) ON DELETE CASCADE NOT NULL,
  variant TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(area_id, skill_id, variant)
);

CREATE INDEX IF NOT EXISTS idx_area_skills_area ON area_skills(area_id);
CREATE INDEX IF NOT EXISTS idx_area_skills_skill ON area_skills(skill_id);

ALTER TABLE area_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches and admins manage area_skills" ON area_skills;
CREATE POLICY "Coaches and admins manage area_skills" ON area_skills FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));

-- Ensure all skill groups have the same 6 areas (Flatground, Street, Park, Bowl, Mini Ramp, Vert).
INSERT INTO skill_areas (group_id, name, sort_order)
SELECT g.id, v.name, v.ord
FROM skill_groups g
CROSS JOIN (VALUES ('Flatground', 1), ('Street', 2), ('Park', 3), ('Bowl', 4), ('Mini Ramp', 5), ('Vert', 6)) AS v(name, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM skill_areas a WHERE a.group_id = g.id AND a.name = v.name
);
