-- Remove the legacy "Niik Skate Academy" program (program_coaches and program_students are cascade-deleted)
DELETE FROM programs WHERE name = 'Niik Skate Academy';
