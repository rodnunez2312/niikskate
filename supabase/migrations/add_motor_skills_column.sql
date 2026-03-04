-- Add motor_skills column to skills_library table
-- This stores body parts and motor skills developed by each trick

ALTER TABLE skills_library 
ADD COLUMN IF NOT EXISTS motor_skills TEXT[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN skills_library.motor_skills IS 'Body parts and motor skills developed (Habilidad motriz desarrollada)';
