import { PROGRAM_SKILL_TRACKS, SKATE_SKILL_LEVELS, type SkateSkillLevelId } from '~/types'

/** Strength Training is for class planning (drills/skills), not skater level assignment. */

export const PLANNING_SKILL_GROUP_NAMES = ['Strength Training', '0 - Warmup'] as const

export const STRENGTH_TRAINING_DISPLAY_NAME = 'Strength Training'

export function isPlanningSkillGroupName(name?: string | null): boolean {
  const n = (name || '').trim()
  return PLANNING_SKILL_GROUP_NAMES.some(p => p === n)
}

export function normalizeSkillGroupDisplayName(name?: string | null): string {
  const n = (name || '').trim()
  if (n === '0 - Warmup') return STRENGTH_TRAINING_DISPLAY_NAME
  return n
}

/** Levels 1–5 use the public Principiante / Intermedio / Avanzado copy. */
const PUBLIC_LEVEL_BY_NUMBER: Record<number, SkateSkillLevelId> = {
  1: 'beginner_1',
  2: 'beginner_2',
  3: 'intermediate_3',
  4: 'intermediate_4',
  5: 'advanced_5',
}

export function publicProgramLevelCopy(name: string | null | undefined, es: boolean) {
  const match = (name || '').match(/(?:level|nivel)\s*(\d+)/i)
  const levelNum = match ? Number(match[1]) : 0
  const id = PUBLIC_LEVEL_BY_NUMBER[levelNum]
  const level = SKATE_SKILL_LEVELS.find(row => row.id === id)
  if (!level) return null
  const trackId = levelNum <= 2 ? 'beginner' : levelNum <= 4 ? 'intermediate' : 'advanced'
  const track = PROGRAM_SKILL_TRACKS.find(row => row.id === trackId)
  return {
    emoji: track?.emoji || '🛹',
    title: es ? level.title.es : level.title.en,
    description: es ? level.description.es : level.description.en,
  }
}

export type SkillGroupRow = { id: string; name: string; sort_order?: number; is_active?: boolean | null }

export function isPlanningSkillGroupId(
  id: string | null | undefined,
  groups: SkillGroupRow[],
): boolean {
  if (!id) return false
  const g = groups.find(x => x.id === id)
  return g ? isPlanningSkillGroupName(g.name) : false
}

/** Levels 1–5 (and any custom levels) — excludes Strength Training planning group. */
export function assignableSkillGroups<T extends SkillGroupRow>(groups: T[]): T[] {
  return groups.filter(g => g.is_active !== false && !isPlanningSkillGroupName(g.name))
}

/** Competitions are only for program phases 4 and 5. Beginner phases stay out. */
export function isCompetitionPhase(groupName?: string | null): boolean {
  const match = (groupName || '').match(/(?:level|nivel)\s*(\d+)/i)
  if (!match) return false
  const phase = Number(match[1])
  return phase === 4 || phase === 5
}

export function effectiveSkaterLevelId(
  skillGroupId: string | null | undefined,
  groups: SkillGroupRow[],
): string | null {
  if (!skillGroupId || isPlanningSkillGroupId(skillGroupId, groups)) return null
  return skillGroupId
}
