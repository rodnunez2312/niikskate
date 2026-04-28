-- =============================================================================
-- Remove fernanda@niikskate.com (old account) — keep valentina.orozco@niikskate.com only.
-- Run once in Supabase Dashboard → SQL Editor.
--
-- What it does:
--   1) Moves skater-owned rows (credits, reservations, bookings, etc.) to Valentina's user id.
--   2) De-duplicates where both accounts would violate a UNIQUE constraint (drops Fernanda's copy).
--   3) NULLs optional FKs that still point at Fernanda (marked_by, coach_id on reservations, etc.).
--   4) Deletes Fernanda's auth user → cascades away her profiles row.
--
-- Preconditions:
--   • Valentina must exist: auth.users.email = valentina.orozco@niikskate.com
--   • Fernanda must exist as a *different* user id, or the script no-ops with a NOTICE.
--
-- If a statement fails (missing table in your project), comment out that block and re-run.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  fer uuid;
  val uuid;
BEGIN
  SELECT id INTO fer FROM auth.users WHERE lower(email) = lower('fernanda@niikskate.com') LIMIT 1;
  SELECT id INTO val FROM auth.users WHERE lower(email) = lower('valentina.orozco@niikskate.com') LIMIT 1;

  IF val IS NULL THEN
    RAISE EXCEPTION 'valentina.orozco@niikskate.com not found in auth.users — create/fix that account first.';
  END IF;

  IF fer IS NULL THEN
    RAISE NOTICE 'No fernanda@niikskate.com in auth.users — nothing to delete (already removed).';
    RETURN;
  END IF;

  IF fer = val THEN
    RAISE NOTICE 'Fernanda and Valentina are the same user id — nothing to merge.';
    RETURN;
  END IF;

  -- ---------------------------------------------------------------------------
  -- Merge skater data: remove Fernanda rows that would duplicate Valentina
  -- ---------------------------------------------------------------------------

  -- class_reservations UNIQUE (user_id, reservation_date, time_slot)
  DELETE FROM class_reservations cr_f
  USING class_reservations cr_v
  WHERE cr_f.user_id = fer
    AND cr_v.user_id = val
    AND cr_v.reservation_date = cr_f.reservation_date
    AND cr_v.time_slot = cr_f.time_slot;

  UPDATE class_reservations SET user_id = val WHERE user_id = fer;

  -- bookings UNIQUE (user_id, schedule_id)
  DELETE FROM bookings b_f
  USING bookings b_v
  WHERE b_f.user_id = fer
    AND b_v.user_id = val
    AND b_v.schedule_id = b_f.schedule_id;

  UPDATE bookings SET user_id = val WHERE user_id = fer;

  UPDATE user_credits SET user_id = val WHERE user_id = fer;

  UPDATE guest_bookings SET linked_user_id = val WHERE linked_user_id = fer;

  UPDATE orders SET customer_id = val WHERE customer_id = fer;

  -- student_progress UNIQUE (student_id, skill_id)
  DELETE FROM student_progress sp_f
  USING student_progress sp_v
  WHERE sp_f.student_id = fer
    AND sp_v.student_id = val
    AND sp_v.skill_id = sp_f.skill_id;

  UPDATE student_progress SET student_id = val WHERE student_id = fer;

  -- attendance UNIQUE (student_id, class_date, time_slot)
  DELETE FROM attendance a_f
  USING attendance a_v
  WHERE a_f.student_id = fer
    AND a_v.student_id = val
    AND a_v.class_date = a_f.class_date
    AND a_v.time_slot = a_f.time_slot;

  UPDATE attendance SET student_id = val WHERE student_id = fer;

  -- program_students UNIQUE (program_id, student_id)
  DELETE FROM program_students ps_f
  USING program_students ps_v
  WHERE ps_f.student_id = fer
    AND ps_v.student_id = val
    AND ps_v.program_id = ps_f.program_id;

  UPDATE program_students SET student_id = val WHERE student_id = fer;

  -- student_skill_focus: keep one row per (student, skill) if both had same skill
  DELETE FROM student_skill_focus ssf_f
  USING student_skill_focus ssf_v
  WHERE ssf_f.student_id = fer
    AND ssf_v.student_id = val
    AND ssf_v.skill_id = ssf_f.skill_id;

  UPDATE student_skill_focus SET student_id = val WHERE student_id = fer;

  -- coach_favorite_students UNIQUE (coach_id, student_id)
  DELETE FROM coach_favorite_students cfs_f
  USING coach_favorite_students cfs_v
  WHERE cfs_f.student_id = fer
    AND cfs_v.student_id = val
    AND cfs_v.coach_id = cfs_f.coach_id;

  UPDATE coach_favorite_students SET student_id = val WHERE student_id = fer;

  -- coach_id is NOT NULL — remove evaluations where Fernanda was the coach, then move student rows
  DELETE FROM student_evaluations WHERE coach_id = fer;
  UPDATE student_evaluations SET student_id = val WHERE student_id = fer;

  -- ---------------------------------------------------------------------------
  -- Clear optional references to Fernanda (so profile/auth delete does not fail)
  -- ---------------------------------------------------------------------------

  UPDATE class_reservations SET coach_id = NULL WHERE coach_id = fer;

  UPDATE student_progress SET marked_by = NULL WHERE marked_by = fer;
  UPDATE attendance SET marked_by = NULL WHERE marked_by = fer;

  UPDATE payments SET received_by = NULL WHERE received_by = fer;
  UPDATE inventory_transactions SET performed_by = NULL WHERE performed_by = fer;

  UPDATE registration_requests SET reviewed_by = NULL WHERE reviewed_by = fer;

  UPDATE news_events SET created_by = NULL WHERE created_by = fer;

  UPDATE ramp_quotes SET customer_id = NULL WHERE customer_id = fer;

  UPDATE coach_payments SET paid_by = NULL WHERE paid_by = fer;

  UPDATE news_feed SET author_id = NULL WHERE author_id = fer;

  UPDATE school_calendar_events SET created_by = NULL WHERE created_by = fer;

  UPDATE attendance_report_sent SET sent_by = NULL WHERE sent_by = fer;

  UPDATE attendance_confirmed SET confirmed_by = NULL WHERE confirmed_by = fer;

  UPDATE skill_groups SET created_by = NULL WHERE created_by = fer;

  -- Fernanda as coach in junction / coach-only tables (safe for a customer; no-op if empty)
  DELETE FROM coach_favorite_students WHERE coach_id = fer;
  DELETE FROM coach_monthly_approvals WHERE coach_id = fer;
  DELETE FROM program_coaches WHERE coach_id = fer;

  -- ---------------------------------------------------------------------------
  -- Remove auth identity + user (profiles row for fer cascades from auth delete)
  -- ---------------------------------------------------------------------------

  DELETE FROM auth.identities WHERE user_id = fer;
  DELETE FROM auth.users WHERE id = fer;

  RAISE NOTICE 'Removed fernanda@niikskate.com (id %). Valentina remains (id %).', fer, val;
END $$;

COMMIT;

-- Optional verification:
-- SELECT id, email, full_name FROM profiles WHERE lower(email) LIKE '%fernanda%' OR id IN (
--   SELECT id FROM auth.users WHERE lower(email) IN (
--     lower('fernanda@niikskate.com'),
--     lower('valentina.orozco@niikskate.com')
--   )
-- );
