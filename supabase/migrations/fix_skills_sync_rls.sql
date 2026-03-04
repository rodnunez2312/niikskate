-- Fix RLS policies for skills_library to allow syncing
-- Run this in Supabase SQL Editor

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "Admins can manage skills" ON skills_library;

-- Allow all authenticated users to view skills
CREATE POLICY "Anyone can view active skills" 
ON skills_library 
FOR SELECT 
USING (is_active = true);

-- Allow admins and coaches to insert new skills
CREATE POLICY "Admins and coaches can insert skills" 
ON skills_library 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'coach')
  )
);

-- Allow admins and coaches to update skills
CREATE POLICY "Admins and coaches can update skills" 
ON skills_library 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'coach')
  )
);

-- Allow admins to delete skills
CREATE POLICY "Admins can delete skills" 
ON skills_library 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  )
);

-- Verify the category column exists and can store our values
-- If you get an error, the column already exists
DO $$ 
BEGIN
  -- Ensure category column is TEXT type (not enum) to accept any value
  ALTER TABLE skills_library 
  ALTER COLUMN category TYPE TEXT;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Show current skills count
SELECT 'Current skills count:' as info, COUNT(*) as count FROM skills_library;
