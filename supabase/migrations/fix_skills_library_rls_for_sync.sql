-- Allow coaches and admins to sync skills_library from "Sincronizar desde Excel".
-- Run this in Supabase → SQL Editor if you get "new row violates row-level security policy".

-- Remove admin-only policy
DROP POLICY IF EXISTS "Admins can manage skills" ON skills_library;

-- Optional: drop these if they exist from a previous fix (no error if missing)
DROP POLICY IF EXISTS "Anyone can view active skills" ON skills_library;
DROP POLICY IF EXISTS "Admins and coaches can insert skills" ON skills_library;
DROP POLICY IF EXISTS "Admins and coaches can update skills" ON skills_library;
DROP POLICY IF EXISTS "Admins can delete skills" ON skills_library;

-- Select: anyone can see active skills
CREATE POLICY "Anyone can view active skills"
ON skills_library FOR SELECT
USING (is_active = true);

-- Insert: coaches and admins (for "Sincronizar desde Excel")
CREATE POLICY "Admins and coaches can insert skills"
ON skills_library FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'coach')
  )
);

-- Update: coaches and admins
CREATE POLICY "Admins and coaches can update skills"
ON skills_library FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'coach')
  )
);

-- Delete: admins only
CREATE POLICY "Admins can delete skills"
ON skills_library FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);
