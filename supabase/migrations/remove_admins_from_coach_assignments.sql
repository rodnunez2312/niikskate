-- Admins are not coaches in this app (role = 'coach' is the only coach identity).
-- Remove mistaken rows where an admin profile was linked as a coach.

DELETE FROM program_coaches
WHERE coach_id IN (SELECT id FROM profiles WHERE role = 'admin');

DELETE FROM coach_availability
WHERE coach_id IN (SELECT id FROM profiles WHERE role = 'admin');

DELETE FROM coach_date_availability
WHERE coach_id IN (SELECT id FROM profiles WHERE role = 'admin');
