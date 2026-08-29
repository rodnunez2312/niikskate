-- Strength training library: 5 pillars × body areas × motor skill × training phase.
-- Source of truth: NiikSkate_Ticks_Manual.xlsx → sheet "Strength_Training".
-- Synced by composables/useStrengthLibrary.ts from /data/niik-strength-library.json.

CREATE TABLE IF NOT EXISTS strength_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity: Ejercicio + Nivel, slugified. Four exercises repeat across levels
  -- (Skater squat, Good morning, Box jump, Jump rope), so name alone is not unique.
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT,

  level TEXT NOT NULL
    CHECK (level IN ('beginner', 'intermediate', 'advanced')),

  -- The 5 pillars: WHAT physical quality is trained.
  pillar_primary TEXT NOT NULL
    CHECK (pillar_primary IN ('balance', 'coordination', 'mobility', 'power', 'endurance')),
  pillar_secondary TEXT
    CHECK (pillar_secondary IN ('balance', 'coordination', 'mobility', 'power', 'endurance')),

  -- The 6 body areas: WHERE it is trained.
  body_areas TEXT[] NOT NULL DEFAULT '{}'
    CHECK (body_areas <@ ARRAY['neck', 'shoulders', 'arms', 'core', 'lower_body', 'ankles']::TEXT[]),

  -- WHAT motor ability improves. Required for every exercise.
  motor_skill_es TEXT,

  -- WHEN in the session it runs. Independent of pillar: a squat is pillar
  -- Endurance in phase Strength.
  training_phase TEXT NOT NULL
    CHECK (training_phase IN (
      'warmup', 'mobility', 'activation', 'balance', 'coordination',
      'power', 'strength', 'conditioning', 'stretch'
    )),

  -- WHY it matters for skateboarding.
  skate_application_es TEXT,

  equipment_es TEXT,
  prescription_es TEXT,
  rest_es TEXT,
  coach_cue_es TEXT,

  -- Generator weighting, not a per-pillar rank.
  priority TEXT NOT NULL DEFAULT 'primary'
    CHECK (priority IN ('primary', 'secondary', 'support')),

  -- Derived at parse time so the generator can fit a 15/20/30 min budget.
  work_seconds INTEGER NOT NULL DEFAULT 0,
  rest_seconds INTEGER NOT NULL DEFAULT 0,
  est_seconds INTEGER NOT NULL DEFAULT 0,
  per_side BOOLEAN NOT NULL DEFAULT false,
  reps INTEGER,

  kid_safe BOOLEAN NOT NULL DEFAULT true,
  video_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strength_exercises_level ON strength_exercises(level);
CREATE INDEX IF NOT EXISTS idx_strength_exercises_phase ON strength_exercises(training_phase);
CREATE INDEX IF NOT EXISTS idx_strength_exercises_pillar ON strength_exercises(pillar_primary);
CREATE INDEX IF NOT EXISTS idx_strength_exercises_active ON strength_exercises(is_active);
CREATE INDEX IF NOT EXISTS idx_strength_exercises_body_areas ON strength_exercises USING GIN(body_areas);

COMMENT ON TABLE strength_exercises IS 'Strength library from Excel sheet Strength_Training; feeds the session generator.';
COMMENT ON COLUMN strength_exercises.slug IS 'slugify(Ejercicio + Nivel); stable upsert key';
COMMENT ON COLUMN strength_exercises.pillar_primary IS 'One of the 5 pillars. "Strength" is a phase, never a pillar.';
COMMENT ON COLUMN strength_exercises.motor_skill_es IS 'Habilidad motriz desarrollada; distinct from pillar';
COMMENT ON COLUMN strength_exercises.est_seconds IS 'work_seconds (x2 when per_side) + rest_seconds; reps billed at 3s each';
COMMENT ON COLUMN strength_exercises.priority IS 'Primary/Secondary/Support: generator preference within a matching pool';
COMMENT ON COLUMN strength_exercises.kid_safe IS 'Defaults false for advanced level; gates tots/kids sessions';

ALTER TABLE strength_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "strength_exercises_read" ON strength_exercises;
CREATE POLICY "strength_exercises_read" ON strength_exercises
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "strength_exercises_admin_write" ON strength_exercises;
CREATE POLICY "strength_exercises_admin_write" ON strength_exercises
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP TRIGGER IF EXISTS update_strength_exercises_updated_at ON strength_exercises;
CREATE TRIGGER update_strength_exercises_updated_at
  BEFORE UPDATE ON strength_exercises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Generated session snapshot on the class plan. Stored rather than re-derived so a
-- past plan still shows what was actually prescribed after the library changes.
ALTER TABLE class_plans
  ADD COLUMN IF NOT EXISTS strength_block JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN class_plans.strength_block IS
  'Generated strength session: { training_minutes, level, pillars[], blocks: [{ phase, exercises: [...] }], stretch: [...] }';
