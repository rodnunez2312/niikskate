-- Skater booking pipeline: requested (yellow) → admin_confirmed (blue) → attendance.attended (green on app)
DO $$ BEGIN
  CREATE TYPE reservation_workflow AS ENUM ('requested', 'admin_confirmed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE class_reservations
  ADD COLUMN IF NOT EXISTS workflow_status reservation_workflow;

-- Backfill: live reservations treated as already confirmed by admin; payment-pending = still requested
UPDATE class_reservations
SET workflow_status = 'admin_confirmed'
WHERE workflow_status IS NULL
  AND status IN ('active', 'pending_skater_confirm');

UPDATE class_reservations
SET workflow_status = 'requested'
WHERE workflow_status IS NULL;

ALTER TABLE class_reservations
  ALTER COLUMN workflow_status SET DEFAULT 'requested';

ALTER TABLE class_reservations
  ALTER COLUMN workflow_status SET NOT NULL;

COMMENT ON COLUMN class_reservations.workflow_status IS
  'requested=user asked for slot; admin_confirmed=staff confirmed availability; attendance row marks done';
