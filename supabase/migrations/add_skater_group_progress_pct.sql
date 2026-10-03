-- Lets a skater (or their guardian) see the same group-average bar as the coach
-- profile, without opening every classmate's trick list.
-- Average is peers in the same skill group only. With no peers, it is the skater's own percent.

CREATE OR REPLACE FUNCTION public.skater_skill_group_average_pct(p_student_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group uuid;
  v_library integer;
  v_peer_count integer;
  v_avg integer;
BEGIN
  IF NOT (
    p_student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles me
      WHERE me.id = p_student_id AND me.guardian_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles staff
      WHERE staff.id = auth.uid() AND staff.role IN ('admin', 'coach')
    )
  ) THEN
    RETURN NULL;
  END IF;

  SELECT skill_group_id INTO v_group FROM profiles WHERE id = p_student_id;
  IF v_group IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_library
  FROM skills_library
  WHERE is_active = true AND trick_type IN ('Trick', 'Drill');

  IF v_library = 0 THEN
    RETURN 0;
  END IF;

  SELECT count(*) INTO v_peer_count
  FROM profiles p
  WHERE p.skill_group_id = v_group
    AND p.role = 'customer'
    AND p.id <> p_student_id;

  IF v_peer_count = 0 THEN
    SELECT round(100.0 * count(sp.skill_id) / v_library)::integer
    INTO v_avg
    FROM student_progress sp
    JOIN skills_library s ON s.id = sp.skill_id
    WHERE sp.student_id = p_student_id
      AND s.is_active = true
      AND s.trick_type IN ('Trick', 'Drill');
    RETURN COALESCE(v_avg, 0);
  END IF;

  SELECT round(avg(pct))::integer
  INTO v_avg
  FROM (
    SELECT
      round(
        100.0 * (
          SELECT count(*)
          FROM student_progress sp
          JOIN skills_library s ON s.id = sp.skill_id
          WHERE sp.student_id = p.id
            AND s.is_active = true
            AND s.trick_type IN ('Trick', 'Drill')
        ) / v_library
      )::integer AS pct
    FROM profiles p
    WHERE p.skill_group_id = v_group
      AND p.role = 'customer'
      AND p.id <> p_student_id
  ) peers;

  RETURN COALESCE(v_avg, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.skater_skill_group_average_pct(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.skater_skill_group_average_pct(uuid) TO authenticated;
