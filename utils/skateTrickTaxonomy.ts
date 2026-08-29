/**
 * Canonical taxonomy from NiikSkate_Tricks_Manual.xlsx (Skate_Manual sheet).
 *
 * Strength exercises live in the Strength_Training sheet and the
 * `strength_exercises` table; see utils/strengthTraining.ts. They are no longer
 * part of the trick taxonomy, so 'Strength Training' and area 'Warmup' are gone.
 * Legacy normalizers below still recognise them for rows synced before the split.
 */

export const SKATE_TRICK_AREAS = [
  'Flatground',
  'Street',
  'Park',
  'Bowl',
  'Mini Ramp',
  'Vert',
] as const

export const SKATE_TRICK_STRUCTURES = [
  'Level 1: Foundations',
  'Level 2: Balance & Control',
  'Level 3: Basic Tricks',
  'Level 4: Progression',
  'Level 5: Advanced',
] as const

export const SKATE_TRICK_TYPES = ['Exercise', 'Drill', 'Trick'] as const

export const SKATE_TRICK_PROGRAMS = [
  'Foundations',
  'Beginners',
  'Intermediate',
  'Advanced',
] as const

export type SkateTrickArea = (typeof SKATE_TRICK_AREAS)[number]
export type SkateTrickStructure = (typeof SKATE_TRICK_STRUCTURES)[number]
export type SkateTrickType = (typeof SKATE_TRICK_TYPES)[number]
export type SkateTrickProgram = (typeof SKATE_TRICK_PROGRAMS)[number]

export type SkaterTrickBagStatus = 'assigned' | 'pending' | 'done'

export const SKATER_TRICK_BAG_STATUSES: SkateTrickBagStatus[] = ['assigned', 'pending', 'done']

export function trickBagStatusLabel(status: SkaterTrickBagStatus, es: boolean): string {
  if (status === 'assigned') return es ? 'Asignado' : 'Assigned'
  if (status === 'pending') return es ? 'En progreso' : 'In progress'
  return es ? 'Completado' : 'Completed'
}

/** Hover hint for the Estado column header. */
export function trickBagStatusFlowHint(es: boolean): string {
  return es
    ? 'Pulsa + para asignar. Luego clic en el estado: Asignado → En progreso → Completado.'
    : 'Press + to assign. Then click status: Assigned → In progress → Completed.'
}

/** Tooltip for the next action on a status control. */
export function trickBagStatusNextHint(
  status: SkaterTrickBagStatus | null | undefined,
  es: boolean,
): string {
  if (!status) {
    return es ? 'Pulsa + para asignar este truco' : 'Press + to assign this trick'
  }
  if (status === 'assigned') {
    return es ? 'Clic: pasar a En progreso' : 'Click: move to In progress'
  }
  if (status === 'pending') {
    return es ? 'Clic: marcar Completado' : 'Click: mark Completed'
  }
  return es ? 'Completado' : 'Completed'
}

export function nextTrickBagStatus(status: SkaterTrickBagStatus): SkaterTrickBagStatus | null {
  if (status === 'assigned') return 'pending'
  if (status === 'pending') return 'done'
  return null
}

/** Program levels shown in Skate Program sidebar (skill_groups). */
export const SKATE_PROGRAM_LEVELS = [
  { sort_order: 1, name: 'Level 1: Foundations', description: 'Basic board control and safety', color: '#16a34a' },
  { sort_order: 2, name: 'Level 2: Balance & Control', description: 'Developing balance and basic movements', color: '#2563eb' },
  { sort_order: 3, name: 'Level 3: Basic Tricks', description: 'First tricks and transitions', color: '#4f46e5' },
  { sort_order: 4, name: 'Level 4: Progression', description: 'Building on fundamentals', color: '#7c3aed' },
  { sort_order: 5, name: 'Level 5: Advanced', description: 'Advanced tricks and lines', color: '#a855f7' },
] as const

export function difficultyFromStructure(structure: string): 'beginner' | 'intermediate' | 'advanced' {
  if (/strength training|warmup|level 1|level 2/i.test(structure)) return 'beginner'
  if (/level 3|level 4/i.test(structure)) return 'intermediate'
  if (/level 5|advanced/i.test(structure)) return 'advanced'
  return 'beginner'
}

export type TrickTaxonomySortable = {
  structure?: string | null
  categoria?: string | null
  area?: string | null
  trick_type?: string | null
  name?: string | null
  name_es?: string | null
}

export function trickTaxonomySortIndex(
  field: 'structure' | 'area' | 'type',
  value?: string | null,
): number {
  const v = (value || '').trim()
  if (field === 'structure') {
    const i = (SKATE_TRICK_STRUCTURES as readonly string[]).indexOf(v)
    return i >= 0 ? i : 999
  }
  if (field === 'area') {
    const i = (SKATE_TRICK_AREAS as readonly string[]).indexOf(v)
    return i >= 0 ? i : 999
  }
  const i = (SKATE_TRICK_TYPES as readonly string[]).indexOf(v)
  return i >= 0 ? i : 999
}

export function normalizeStructureValue(value?: string | null): string {
  const raw = (value || '').trim()
  if (!raw) return ''
  if (raw === '0 - Warmup') return 'Strength Training'
  if (/stregth training/i.test(raw)) return 'Strength Training'
  return raw
}

export function skillStructure(skill?: TrickTaxonomySortable | null): string {
  return normalizeStructureValue(skill?.structure || skill?.categoria)
}

export function compareSkillsByTaxonomy(a: TrickTaxonomySortable, b: TrickTaxonomySortable): number {
  const structA = skillStructure(a)
  const structB = skillStructure(b)
  let c = trickTaxonomySortIndex('structure', structA) - trickTaxonomySortIndex('structure', structB)
  if (c !== 0) return c
  c = trickTaxonomySortIndex('area', a.area) - trickTaxonomySortIndex('area', b.area)
  if (c !== 0) return c
  c = trickTaxonomySortIndex('type', a.trick_type) - trickTaxonomySortIndex('type', b.trick_type)
  if (c !== 0) return c
  return (a.name_es || a.name || '').localeCompare(b.name_es || b.name || '', undefined, { sensitivity: 'base' })
}

export type TrickManualSortable = TrickTaxonomySortable & {
  manual_id?: number | null
  sort_order?: number | null
}

/** Primary sort: Excel # column (manual_id), then sort_order fallback. */
export function compareSkillsByManualId(a: TrickManualSortable, b: TrickManualSortable): number {
  const idA = a.manual_id ?? a.sort_order ?? 999999
  const idB = b.manual_id ?? b.sort_order ?? 999999
  if (idA !== idB) return idA - idB
  return compareSkillsByTaxonomy(a, b)
}

export function difficultyTagClass(difficulty?: string | null): string {
  if (difficulty === 'intermediate') return 'bg-yellow-500/20 text-yellow-400'
  if (difficulty === 'advanced') return 'bg-red-500/20 text-red-400'
  return 'bg-green-500/20 text-green-400'
}

export function areaTagClass(area?: string | null): string {
  const a = (area || '').trim()
  if (a === 'Warmup') return 'bg-slate-500/25 text-slate-300'
  if (a === 'Flatground') return 'bg-teal-500/20 text-teal-300'
  if (a === 'Street') return 'bg-orange-500/20 text-orange-300'
  if (a === 'Park') return 'bg-emerald-500/20 text-emerald-300'
  if (a === 'Bowl') return 'bg-indigo-500/20 text-indigo-300'
  if (a === 'Mini Ramp') return 'bg-pink-500/20 text-pink-300'
  if (a === 'Vert') return 'bg-violet-500/20 text-violet-300'
  return 'bg-gray-700/50 text-gray-400'
}

export function typeTagClass(trickType?: string | null): string {
  const t = (trickType || '').trim()
  if (t === 'Exercise') return 'bg-purple-500/20 text-purple-300'
  if (t === 'Drill') return 'bg-amber-500/20 text-amber-300'
  if (t === 'Trick') return 'bg-sky-500/20 text-sky-300'
  return 'bg-gray-700/50 text-gray-400'
}

export function trickManualLabel(skill?: TrickManualSortable | null): string {
  const n = skill?.manual_id ?? skill?.sort_order
  return n != null && n > 0 ? `#${n}` : ''
}

export function categoryFromTrickMeta(area: string, program: string, trickType: string): string {
  const t = (trickType || '').toLowerCase()
  if (/exercise|drill/.test(t) && program === 'Strength Training') return 'excercise'
  const a = (area || '').toLowerCase()
  if (a === 'warmup') return 'excercise'
  if (a === 'street') return 'street'
  if (a === 'park' || a === 'bowl' || a === 'mini ramp' || a === 'vert') return 'vert_bowl'
  if (program === 'Foundations' || program === 'Beginners') return 'iniciacion'
  return 'iniciacion'
}
