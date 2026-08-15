-- Crew skaters can exist without a family; assign guardian later in admin.

ALTER TABLE crew_members
  ALTER COLUMN guardian_user_id DROP NOT NULL;

COMMENT ON COLUMN crew_members.guardian_user_id IS 'Optional parent/guardian profile; may be assigned later by admin.';
