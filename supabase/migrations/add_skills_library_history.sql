-- The app is now the source of truth for the trick library (Bolsa de trucos).
-- Every insert, edit and delete on skills_library is recorded here, and the
-- drag-and-drop order is saved through reorder_skills_library() as one entry
-- per move instead of one per renumbered row.

CREATE TABLE IF NOT EXISTS skills_library_changes (
  id BIGSERIAL PRIMARY KEY,
  skill_id UUID,
  skill_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete', 'reorder')),
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_by UUID DEFAULT auth.uid(),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS skills_library_changes_changed_at_idx ON skills_library_changes (changed_at DESC);
CREATE INDEX IF NOT EXISTS skills_library_changes_skill_idx ON skills_library_changes (skill_id);

ALTER TABLE skills_library_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read trick library history" ON skills_library_changes;
CREATE POLICY "Staff read trick library history" ON skills_library_changes
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'coach'))
  );

-- Rows are only written by the trigger and the reorder function below.

CREATE OR REPLACE FUNCTION log_skills_library_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_diff JSONB := '{}'::jsonb;
  k TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO skills_library_changes (skill_id, skill_name, action, changes)
    VALUES (NEW.id, COALESCE(NEW.name_es, NEW.name), 'insert', to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO skills_library_changes (skill_id, skill_name, action, changes)
    VALUES (OLD.id, COALESCE(OLD.name_es, OLD.name), 'delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;

  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  FOR k IN SELECT jsonb_object_keys(v_new) LOOP
    -- sort_order moves are logged once per drag by reorder_skills_library().
    CONTINUE WHEN k IN ('sort_order', 'updated_at');
    IF (v_new -> k) IS DISTINCT FROM (v_old -> k) THEN
      v_diff := v_diff || jsonb_build_object(k, jsonb_build_object('from', v_old -> k, 'to', v_new -> k));
    END IF;
  END LOOP;

  IF v_diff <> '{}'::jsonb THEN
    INSERT INTO skills_library_changes (skill_id, skill_name, action, changes)
    VALUES (NEW.id, COALESCE(NEW.name_es, NEW.name), 'update', v_diff);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS skills_library_history ON skills_library;
CREATE TRIGGER skills_library_history
  AFTER INSERT OR UPDATE OR DELETE ON skills_library
  FOR EACH ROW EXECUTE FUNCTION log_skills_library_change();

-- Save the whole library order in one statement. p_ids is every active trick in
-- its new order; position 1 becomes sort_order 1.
CREATE OR REPLACE FUNCTION reorder_skills_library(p_ids UUID[], p_moved UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from INTEGER;
  v_to INTEGER;
  v_count INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'coach')) THEN
    RAISE EXCEPTION 'Only staff can reorder the trick library';
  END IF;

  SELECT sort_order INTO v_from FROM skills_library WHERE id = p_moved;

  UPDATE skills_library s
  SET sort_order = g.pos::INTEGER
  FROM unnest(p_ids) WITH ORDINALITY AS g(id, pos)
  WHERE s.id = g.id
    AND s.sort_order IS DISTINCT FROM g.pos::INTEGER;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF p_moved IS NOT NULL AND v_count > 0 THEN
    SELECT sort_order INTO v_to FROM skills_library WHERE id = p_moved;
    INSERT INTO skills_library_changes (skill_id, skill_name, action, changes)
    SELECT id, COALESCE(name_es, name), 'reorder',
      jsonb_build_object('sort_order', jsonb_build_object('from', v_from, 'to', v_to))
    FROM skills_library
    WHERE id = p_moved;
  END IF;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION reorder_skills_library(UUID[], UUID) TO authenticated;
