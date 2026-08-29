/**
 * Strength session generator.
 *
 * Coach picks level + training duration + pillar focus. The generator distributes
 * the training budget across the focus pillars, guarantees the skate-critical body
 * areas are trained, orders the result by training phase, and appends the locked
 * 10-minute stretch block.
 */

import {
  LEVELS_INCLUDED,
  SELECTION_PRIORITIES,
  SKATE_CRITICAL_BODY_AREAS,
  STRETCH_MINUTES_LOCKED,
  TRAINING_PHASE_ORDER,
  TRAINING_PILLAR_IDS,
  type BodyArea,
  type StrengthExercise,
  type StrengthLevel,
  type TrainingPhase,
  type TrainingPillar,
} from './strengthTraining'

export type SessionAudience = 'tots_5_7' | 'kids_7_12' | 'teens_13_17' | 'adults_18_plus'

export interface GenerateSessionOptions {
  exercises: StrengthExercise[]
  level: StrengthLevel
  trainingMinutes: number
  /** Empty or all five = distribute across every pillar. */
  pillars?: TrainingPillar[]
  audience?: SessionAudience | null
  /** Equipment on hand. `null`/omitted allows everything. */
  availableEquipment?: string[] | null
  /** Changing the seed reshuffles picks so repeat sessions differ. */
  seed?: number
}

export interface SessionBlock {
  phase: TrainingPhase
  exercises: StrengthExercise[]
  seconds: number
}

export interface GeneratedSession {
  level: StrengthLevel
  trainingMinutes: number
  pillars: TrainingPillar[]
  blocks: SessionBlock[]
  stretch: StrengthExercise[]
  trainingSeconds: number
  stretchSeconds: number
  totalSeconds: number
  coverage: Partial<Record<BodyArea, number>>
  warnings: string[]
  generatedAt: string
}

/** Share of training time spent warming up, clamped to sane bounds. */
const WARMUP_FRACTION = 0.12
const WARMUP_MIN_SECONDS = 60
const WARMUP_MAX_SECONDS = 180

/** Allow a pillar to run slightly over budget rather than leave a large gap. */
const OVERSHOOT_TOLERANCE = 1.15

/** Below this there is no room for another exercise, so stop topping up. */
const MIN_TOPUP_SECONDS = 30

function priorityWeight(p: StrengthExercise['priority']): number {
  return SELECTION_PRIORITIES.find(x => x.id === p)?.weight ?? 1
}

/** Deterministic PRNG so a given seed always yields the same session. */
function makeRandom(seed: number) {
  let state = (seed || 1) % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function isEquipmentAvailable(
  ex: StrengthExercise,
  available: string[] | null | undefined,
): boolean {
  if (!ex.equipment_es) return true
  if (!available) return true
  const need = ex.equipment_es.trim().toLowerCase()
  return available.some(a => a.trim().toLowerCase() === need)
}

function requiresKidSafe(audience: SessionAudience | null | undefined): boolean {
  return audience === 'tots_5_7' || audience === 'kids_7_12'
}

export function generateStrengthSession(opts: GenerateSessionOptions): GeneratedSession {
  const {
    exercises,
    level,
    trainingMinutes,
    audience = null,
    availableEquipment = null,
    seed = 1,
  } = opts

  const warnings: string[] = []
  const random = makeRandom(seed)

  const focusPillars =
    !opts.pillars || opts.pillars.length === 0
      ? [...TRAINING_PILLAR_IDS]
      : [...opts.pillars]

  const allowedLevels = LEVELS_INCLUDED[level]
  const kidSafeOnly = requiresKidSafe(audience)

  const eligible = exercises.filter(
    ex =>
      ex.is_active !== false
      && ex.training_phase !== 'stretch'
      && allowedLevels.includes(ex.level)
      && (!kidSafeOnly || ex.kid_safe)
      && isEquipmentAvailable(ex, availableEquipment),
  )

  const trainingSecondsTarget = trainingMinutes * 60
  const selected: StrengthExercise[] = []
  const usedSlugs = new Set<string>()
  // Four exercises repeat across levels; never prescribe two variants of one.
  const usedNames = new Set<string>()
  const coverage: Partial<Record<BodyArea, number>> = {}

  const take = (ex: StrengthExercise) => {
    selected.push(ex)
    usedSlugs.add(ex.slug)
    usedNames.add(ex.name.trim().toLowerCase())
    for (const area of ex.body_areas) coverage[area] = (coverage[area] || 0) + 1
  }

  const isTaken = (ex: StrengthExercise) =>
    usedSlugs.has(ex.slug) || usedNames.has(ex.name.trim().toLowerCase())

  const uncoveredCritical = () =>
    SKATE_CRITICAL_BODY_AREAS.filter(a => !coverage[a])

  /** Higher is better. Pillar fit, curated priority, and missing coverage all count. */
  const score = (ex: StrengthExercise, pillar: TrainingPillar) => {
    let s = priorityWeight(ex.priority) * 2
    if (ex.pillar_primary === pillar) s += 3
    else if (ex.pillar_secondary === pillar) s += 1
    const missing = uncoveredCritical()
    s += ex.body_areas.filter(a => missing.includes(a)).length * 2
    return s + random()
  }

  /** Best score across the focus pillars, for passes not tied to one pillar. */
  const scoreAcrossFocus = (ex: StrengthExercise) =>
    Math.max(...focusPillars.map(p => score(ex, p)))

  /** Fill up to `budget` seconds from `pool`, preferring the best-scoring exercise. */
  const fill = (
    pool: StrengthExercise[],
    scorer: (ex: StrengthExercise) => number,
    budget: number,
  ): number => {
    let spent = 0
    while (spent < budget) {
      const candidates = pool.filter(
        ex => !isTaken(ex) && spent + ex.est_seconds <= budget * OVERSHOOT_TOLERANCE,
      )
      if (!candidates.length) break
      const best = candidates.reduce((a, b) => (scorer(b) > scorer(a) ? b : a))
      take(best)
      spent += best.est_seconds
    }
    return spent
  }

  // 1. Warm-up first, pillar-agnostic.
  const warmupBudget = Math.min(
    WARMUP_MAX_SECONDS,
    Math.max(WARMUP_MIN_SECONDS, Math.round(trainingSecondsTarget * WARMUP_FRACTION)),
  )
  const warmupPool = eligible.filter(ex => ex.training_phase === 'warmup')
  let spent = warmupPool.length
    ? fill(warmupPool, ex => score(ex, 'mobility'), warmupBudget)
    : 0
  if (!warmupPool.length) {
    warnings.push('No warm-up exercises available for this level.')
  }

  // 2. Split what remains across the focus pillars, redistributing any pillar
  //    whose pool runs dry.
  const workPool = eligible.filter(ex => ex.training_phase !== 'warmup')
  let remaining = trainingSecondsTarget - spent
  const pillarQueue = [...focusPillars]

  for (let i = 0; i < pillarQueue.length; i++) {
    const pillar = pillarQueue[i]
    const pillarsLeft = pillarQueue.length - i
    const budget = Math.round(remaining / pillarsLeft)
    const pool = workPool.filter(
      ex => ex.pillar_primary === pillar || ex.pillar_secondary === pillar,
    )
    if (!pool.length) {
      warnings.push(`No ${pillar} exercises available at this level.`)
      continue
    }
    const used = fill(pool, ex => score(ex, pillar), budget)
    spent += used
    remaining -= used
  }

  // 2b. A narrow focus can exhaust its pool well short of the budget (Power at
  //     beginner is only a handful of exercises). Top up from the wider pool so the
  //     coach still gets the duration they asked for, keeping the focus dominant.
  if (remaining >= MIN_TOPUP_SECONDS) {
    const used = fill(workPool, scoreAcrossFocus, remaining)
    spent += used
    remaining -= used
  }

  // 3. Coverage guard: skateboarding needs lower body, core and ankles every session.
  for (const area of uncoveredCritical()) {
    const candidates = workPool.filter(ex => !isTaken(ex) && ex.body_areas.includes(area))
    if (!candidates.length) {
      warnings.push(`No exercise available for ${area}.`)
      continue
    }
    const best = candidates.reduce((a, b) =>
      priorityWeight(b.priority) > priorityWeight(a.priority) ? b : a,
    )
    take(best)
    spent += best.est_seconds
  }

  // 4. Group by phase in session order.
  const blocks: SessionBlock[] = []
  for (const phase of TRAINING_PHASE_ORDER) {
    const inPhase = selected
      .filter(ex => ex.training_phase === phase)
      .sort((a, b) => a.sort_order - b.sort_order)
    if (!inPhase.length) continue
    blocks.push({
      phase,
      exercises: inPhase,
      seconds: inPhase.reduce((n, ex) => n + ex.est_seconds, 0),
    })
  }

  // 5. The locked stretch block, always appended and never coach-editable.
  const stretch = exercises
    .filter(ex => ex.training_phase === 'stretch' && ex.is_active !== false)
    .sort((a, b) => a.sort_order - b.sort_order)
  const stretchSeconds = stretch.reduce((n, ex) => n + ex.est_seconds, 0)

  const trainingSeconds = blocks.reduce((n, b) => n + b.seconds, 0)

  if (trainingSeconds < trainingSecondsTarget * 0.8) {
    warnings.push(
      `Only ${Math.round(trainingSeconds / 60)} of ${trainingMinutes} training minutes could be filled. Add more exercises at this level.`,
    )
  }

  return {
    level,
    trainingMinutes,
    pillars: focusPillars,
    blocks,
    stretch,
    trainingSeconds,
    stretchSeconds,
    totalSeconds: trainingSeconds + stretchSeconds,
    coverage,
    warnings,
    generatedAt: new Date().toISOString(),
  }
}

/** Compact shape persisted on class_plans.strength_block. */
export interface StrengthBlockSnapshot {
  level: StrengthLevel
  training_minutes: number
  stretch_minutes: number
  pillars: TrainingPillar[]
  blocks: Array<{
    phase: TrainingPhase
    exercises: Array<{
      slug: string
      name: string
      level: StrengthLevel
      pillar: TrainingPillar
      body_areas: BodyArea[]
      motor_skill: string | null
      skate_application: string | null
      equipment: string | null
      prescription: string | null
      coach_cue: string | null
      seconds: number
    }>
  }>
  stretch: Array<{
    slug: string
    name: string
    prescription: string | null
    coach_cue: string | null
    seconds: number
  }>
  total_seconds: number
  generated_at: string
}

export function toSnapshot(session: GeneratedSession): StrengthBlockSnapshot {
  return {
    level: session.level,
    training_minutes: session.trainingMinutes,
    stretch_minutes: STRETCH_MINUTES_LOCKED,
    pillars: session.pillars,
    blocks: session.blocks.map(b => ({
      phase: b.phase,
      exercises: b.exercises.map(ex => ({
        slug: ex.slug,
        name: ex.name,
        level: ex.level,
        pillar: ex.pillar_primary,
        body_areas: ex.body_areas,
        motor_skill: ex.motor_skill_es || null,
        skate_application: ex.skate_application_es || null,
        equipment: ex.equipment_es || null,
        prescription: ex.prescription_es || null,
        coach_cue: ex.coach_cue_es || null,
        seconds: ex.est_seconds,
      })),
    })),
    stretch: session.stretch.map(ex => ({
      slug: ex.slug,
      name: ex.name,
      prescription: ex.prescription_es || null,
      coach_cue: ex.coach_cue_es || null,
      seconds: ex.est_seconds,
    })),
    total_seconds: session.totalSeconds,
    generated_at: session.generatedAt,
  }
}
