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

export function effectiveSkaterLevelId(
  skillGroupId: string | null | undefined,
  groups: SkillGroupRow[],
): string | null {
  if (!skillGroupId || isPlanningSkillGroupId(skillGroupId, groups)) return null
  return skillGroupId
}
