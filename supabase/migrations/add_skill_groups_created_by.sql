-- Track who created each skill group. Coaches can only delete groups they created; admins can delete any.
ALTER TABLE skill_groups
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_skill_groups_created_by ON skill_groups(created_by);

-- Restrict DELETE: only admin or the creator can delete. Other operations stay for coach/admin.
DROP POLICY IF EXISTS "Coaches and admins manage skill_groups" ON skill_groups;

CREATE POLICY "Coaches and admins select skill_groups" ON skill_groups
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));

CREATE POLICY "Coaches and admins insert skill_groups" ON skill_groups
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));

CREATE POLICY "Coaches and admins update skill_groups" ON skill_groups
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('coach', 'admin')));

CREATE POLICY "Admin or creator can delete skill_groups" ON skill_groups
  FOR DELETE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR created_by = auth.uid()
  );
