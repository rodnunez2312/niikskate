-- Let skaters see their own assigned program and its public phase structure.
-- Coaches/admins retain their existing management policies.

ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE area_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students read own program assignment" ON program_students;
CREATE POLICY "Students read own program assignment"
  ON program_students FOR SELECT TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Students read assigned programs" ON programs;
CREATE POLICY "Students read assigned programs"
  ON programs FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM program_students ps
      WHERE ps.program_id = programs.id
        AND ps.student_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Authenticated users read active skill groups" ON skill_groups;
CREATE POLICY "Authenticated users read active skill groups"
  ON skill_groups FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated users read skill areas" ON skill_areas;
CREATE POLICY "Authenticated users read skill areas"
  ON skill_areas FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM skill_groups g
      WHERE g.id = skill_areas.group_id AND g.is_active = true
    )
  );

DROP POLICY IF EXISTS "Authenticated users read area skills" ON area_skills;
CREATE POLICY "Authenticated users read area skills"
  ON area_skills FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM skill_areas a
      JOIN skill_groups g ON g.id = a.group_id
      WHERE a.id = area_skills.area_id AND g.is_active = true
    )
  );
