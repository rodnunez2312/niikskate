-- Skater must confirm scheduled slots after admin approves payment (before class counts as fully confirmed).
-- Class start = reservation_date + (early 17:30 / late 19:00) in America/Mexico_City.
-- Confirmation allowed only if class_start > now() + 24 hours.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'credit_status'
      AND e.enumlabel = 'pending_skater_confirm'
  ) THEN
    ALTER TYPE credit_status ADD VALUE 'pending_skater_confirm';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.confirm_class_reservation_skater(p_reservation_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r class_reservations%ROWTYPE;
  class_start timestamptz;
BEGIN
  SELECT * INTO r FROM class_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF r.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN json_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF r.status IS DISTINCT FROM 'pending_skater_confirm'::credit_status THEN
    RETURN json_build_object('ok', false, 'error', 'bad_status');
  END IF;

  class_start := (
    (r.reservation_date + CASE r.time_slot::text
      WHEN 'early' THEN time '17:30:00'
      ELSE time '19:00:00'
    END) AT TIME ZONE 'America/Mexico_City'
  );

  IF class_start <= now() THEN
    RETURN json_build_object('ok', false, 'error', 'class_started');
  END IF;
  IF class_start < now() + interval '24 hours' THEN
    RETURN json_build_object('ok', false, 'error', 'within_24h');
  END IF;

  UPDATE class_reservations
  SET status = 'active'::credit_status, updated_at = now()
  WHERE id = p_reservation_id;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_class_reservation_skater(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_class_reservation_skater(uuid) TO authenticated;
