/**
 * Strength training taxonomy — canonical from NiikSkate_Ticks_Manual.xlsx,
 * sheet "Strength_Training".
 *
 * The hierarchy the generator reasons over:
 *   5 PILLARS (what quality) → BODY AREA (where) → MOTOR SKILL (which ability)
 *   → SKATE APPLICATION (why it matters)
 *
 * Pillar and phase are independent: a squat is pillar Endurance in phase Strength.
 * "Strength" is never a pillar.
 */

// ---------------------------------------------------------------------------
// The 5 pillars
// ---------------------------------------------------------------------------

export const TRAINING_PILLARS = [
  { id: 'balance', emoji: '⚖️', es: 'Balance', en: 'Balance', color: '#2563eb' },
  { id: 'coordination', emoji: '🧠', es: 'Coordinación', en: 'Coordination', color: '#7c3aed' },
  { id: 'mobility', emoji: '🧘', es: 'Movilidad', en: 'Mobility', color: '#0d9488' },
  { id: 'power', emoji: '💥', es: 'Potencia', en: 'Power', color: '#ea580c' },
  { id: 'endurance', emoji: '❤️', es: 'Resistencia', en: 'Endurance', color: '#dc2626' },
] as const

export type TrainingPillar = (typeof TRAINING_PILLARS)[number]['id']

export const TRAINING_PILLAR_IDS = TRAINING_PILLARS.map(p => p.id) as TrainingPillar[]

// ---------------------------------------------------------------------------
// The 6 body areas
// ---------------------------------------------------------------------------

export const BODY_AREAS = [
  { id: 'neck', es: 'Cuello', en: 'Neck' },
  { id: 'shoulders', es: 'Hombros', en: 'Shoulders' },
  { id: 'arms', es: 'Brazos', en: 'Arms' },
  { id: 'core', es: 'Core', en: 'Core' },
  { id: 'lower_body', es: 'Tren inferior', en: 'Lower Body' },
  { id: 'ankles', es: 'Tobillos', en: 'Ankles' },
] as const

export type BodyArea = (typeof BODY_AREAS)[number]['id']

/** Skateboarding loads these hardest; every session must reach them. */
export const SKATE_CRITICAL_BODY_AREAS: BodyArea[] = ['lower_body', 'core', 'ankles']

// ---------------------------------------------------------------------------
// Training phases — session order, independent of pillars
// ---------------------------------------------------------------------------

export const TRAINING_PHASES = [
  { id: 'warmup', es: 'Calentamiento', en: 'Warm-up' },
  { id: 'mobility', es: 'Movilidad', en: 'Mobility' },
  { id: 'activation', es: 'Activación', en: 'Activation' },
  { id: 'balance', es: 'Balance', en: 'Balance' },
  { id: 'coordination', es: 'Coordinación', en: 'Coordination' },
  { id: 'power', es: 'Potencia', en: 'Power' },
  { id: 'strength', es: 'Fuerza', en: 'Strength' },
  { id: 'conditioning', es: 'Acondicionamiento', en: 'Conditioning' },
  { id: 'stretch', es: 'Estiramiento', en: 'Cool-down / Stretch' },
] as const

export type TrainingPhase = (typeof TRAINING_PHASES)[number]['id']

/**
 * Session order. Power sits before Strength so explosive work happens on fresh legs.
 * Stretch is excluded: it is appended as the locked block, never scheduled here.
 */
export const TRAINING_PHASE_ORDER: TrainingPhase[] = [
  'warmup',
  'mobility',
  'activation',
  'balance',
  'coordination',
  'power',
  'strength',
  'conditioning',
]

// ---------------------------------------------------------------------------
// Level and selection priority
// ---------------------------------------------------------------------------

export const STRENGTH_LEVELS = [
  { id: 'beginner', es: 'Básico', en: 'Beginner' },
  { id: 'intermediate', es: 'Intermedio', en: 'Intermediate' },
  { id: 'advanced', es: 'Avanzado', en: 'Advanced' },
] as const

export type StrengthLevel = (typeof STRENGTH_LEVELS)[number]['id']

export const SELECTION_PRIORITIES = [
  { id: 'primary', es: 'Primario', en: 'Primary', weight: 3 },
  { id: 'secondary', es: 'Secundario', en: 'Secondary', weight: 2 },
  { id: 'support', es: 'Soporte', en: 'Support', weight: 1 },
] as const

export type SelectionPriority = (typeof SELECTION_PRIORITIES)[number]['id']

/**
 * Levels are cumulative: an advanced session may draw on intermediate work.
 * The library is beginner-heavy (60/16/2), so without this an advanced
 * 30-minute session could not be filled.
 */
export const LEVELS_INCLUDED: Record<StrengthLevel, StrengthLevel[]> = {
  beginner: ['beginner'],
  intermediate: ['beginner', 'intermediate'],
  advanced: ['beginner', 'intermediate', 'advanced'],
}

// ---------------------------------------------------------------------------
// Session duration — training is selectable, stretch is not
// ---------------------------------------------------------------------------

/** Locked by system rule; the coach cannot shorten or skip it. */
export const STRETCH_MINUTES_LOCKED = 10

export const TRAINING_DURATIONS = [
  { minutes: 10, es: 'Express', en: 'Express' },
  { minutes: 15, es: 'Mínima', en: 'Minimum' },
  { minutes: 20, es: 'Estándar', en: 'Standard' },
  { minutes: 30, es: 'Completa', en: 'Full' },
] as const

export type TrainingMinutes = (typeof TRAINING_DURATIONS)[number]['minutes']

export function totalSessionMinutes(trainingMinutes: number): number {
  return trainingMinutes + STRETCH_MINUTES_LOCKED
}

// ---------------------------------------------------------------------------
// The exercise row
// ---------------------------------------------------------------------------

export interface StrengthExercise {
  id?: string
  slug: string
  name: string
  name_en?: string | null
  level: StrengthLevel
  pillar_primary: TrainingPillar
  pillar_secondary?: TrainingPillar | null
  body_areas: BodyArea[]
  motor_skill_es?: string | null
  training_phase: TrainingPhase
  skate_application_es?: string | null
  equipment_es?: string | null
  prescription_es?: string | null
  rest_es?: string | null
  coach_cue_es?: string | null
  priority: SelectionPriority
  work_seconds: number
  rest_seconds: number
  est_seconds: number
  per_side: boolean
  reps?: number | null
  kid_safe: boolean
  video_url?: string | null
  sort_order: number
  is_active?: boolean
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const label = <T extends { id: string; es: string; en: string }>(
  table: readonly T[],
  id: string | null | undefined,
  es: boolean,
): string => {
  const hit = table.find(t => t.id === id)
  if (!hit) return id || ''
  return es ? hit.es : hit.en
}

export const pillarLabel = (id: string | null | undefined, es: boolean) =>
  label(TRAINING_PILLARS, id, es)
export const bodyAreaLabel = (id: string | null | undefined, es: boolean) =>
  label(BODY_AREAS, id, es)
export const phaseLabel = (id: string | null | undefined, es: boolean) =>
  label(TRAINING_PHASES, id, es)
export const levelLabel = (id: string | null | undefined, es: boolean) =>
  label(STRENGTH_LEVELS, id, es)
export const priorityLabel = (id: string | null | undefined, es: boolean) =>
  label(SELECTION_PRIORITIES, id, es)

export function pillarEmoji(id: string | null | undefined): string {
  return TRAINING_PILLARS.find(p => p.id === id)?.emoji || ''
}

export function pillarTagClass(id: string | null | undefined): string {
  switch (id) {
    case 'balance':
      return 'bg-blue-500/20 text-blue-300'
    case 'coordination':
      return 'bg-violet-500/20 text-violet-300'
    case 'mobility':
      return 'bg-teal-500/20 text-teal-300'
    case 'power':
      return 'bg-orange-500/20 text-orange-300'
    case 'endurance':
      return 'bg-red-500/20 text-red-300'
    default:
      return 'bg-gray-700/50 text-gray-400'
  }
}

export function levelTagClass(id: string | null | undefined): string {
  if (id === 'intermediate') return 'bg-yellow-500/20 text-yellow-400'
  if (id === 'advanced') return 'bg-red-500/20 text-red-400'
  return 'bg-green-500/20 text-green-400'
}

export function formatDuration(seconds: number, es = true): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m === 0) return `${s}s`
  if (s === 0) return es ? `${m} min` : `${m} min`
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Exercise name in the requested language, falling back to Spanish. */
export function exerciseName(ex: StrengthExercise, es: boolean): string {
  if (es) return ex.name
  return ex.name_en || ex.name
}
