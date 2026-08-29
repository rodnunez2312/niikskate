-- Fixes "new row violates row-level security policy for table skills_library"
-- when clicking "Sincronizar desde Excel", and repairs the library if a failed
-- sync left every row deactivated.
--
-- The old sync deactivated all rows first, then re-activated them via upsert. If
-- the upsert failed on RLS, the library was left completely dark. The client now
-- upserts first and only retires rows that left the sheet, but this script still
-- restores whatever the previous behaviour left behind.

-- ---------------------------------------------------------------------------
-- 1. Report the current state (read the output before/after)
-- ---------------------------------------------------------------------------

SELECT 'policies before' AS step, policyname, cmd, roles::TEXT, qual, with_check
FROM pg_policies
WHERE tablename = 'skills_library'
ORDER BY cmd, policyname;

SELECT 'admins on file' AS step, id, email, role
FROM profiles
WHERE role IN ('admin', 'coach')
ORDER BY role, email;

SELECT 'library state' AS step,
       COUNT(*) FILTER (WHERE is_active) AS active,
       COUNT(*) FILTER (WHERE NOT is_active) AS inactive,
       COUNT(*) FILTER (WHERE manual_id IS NOT NULL) AS with_manual_id,
       MIN(manual_id) AS min_manual_id,
       MAX(manual_id) AS max_manual_id
FROM skills_library;

-- ---------------------------------------------------------------------------
-- 2. Reinstall policies
-- ---------------------------------------------------------------------------

ALTER TABLE skills_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage skills" ON skills_library;
DROP POLICY IF EXISTS "Skills viewable by everyone" ON skills_library;
DROP POLICY IF EXISTS "Anyone can view active skills" ON skills_library;
DROP POLICY IF EXISTS "Admins and coaches can insert skills" ON skills_library;
DROP POLICY IF EXISTS "Admins and coaches can update skills" ON skills_library;
DROP POLICY IF EXISTS "Admins can delete skills" ON skills_library;
DROP POLICY IF EXISTS "skills_library_read_active" ON skills_library;
DROP POLICY IF EXISTS "skills_library_staff_read_all" ON skills_library;
DROP POLICY IF EXISTS "skills_library_staff_insert" ON skills_library;
DROP POLICY IF EXISTS "skills_library_staff_update" ON skills_library;
DROP POLICY IF EXISTS "skills_library_admin_delete" ON skills_library;

-- Everyone sees active tricks.
CREATE POLICY "skills_library_read_active" ON skills_library
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Staff also see retired rows, so the sync can count and reconcile them.
CREATE POLICY "skills_library_staff_read_all" ON skills_library
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ));

CREATE POLICY "skills_library_staff_insert" ON skills_library
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ));

-- USING controls which rows may be updated; WITH CHECK is stated explicitly so
-- upsert's ON CONFLICT DO UPDATE path cannot fail on a missing check expression.
CREATE POLICY "skills_library_staff_update" ON skills_library
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'coach')
  ));

CREATE POLICY "skills_library_admin_delete" ON skills_library
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- ---------------------------------------------------------------------------
-- 3. Restore activation: the 296 manual tricks on, detached strength rows off
-- ---------------------------------------------------------------------------

UPDATE skills_library SET is_active = true  WHERE manual_id IS NOT NULL AND NOT is_active;
UPDATE skills_library SET is_active = false WHERE manual_id IS NULL     AND is_active;

SELECT 'library state after' AS step,
       COUNT(*) FILTER (WHERE is_active) AS active,
       COUNT(*) FILTER (WHERE NOT is_active) AS inactive
FROM skills_library;

SELECT 'policies after' AS step, policyname, cmd, roles::TEXT
FROM pg_policies
WHERE tablename = 'skills_library'
ORDER BY cmd, policyname;
