/** Skater skill band for admin kanban (profiles.skill_level). */
import { SKILL_LEVEL_COLORS } from './semanticColors'

export type SkaterSkillLevelId = 'foundation' | 'beginner' | 'intermediate' | 'advanced'

export const SKATER_KANBAN_SKILL_LEVELS: Array<{
  id: SkaterSkillLevelId
  label: { en: string; es: string }
  color: string
}> = [
  { id: 'foundation', label: { en: 'Foundation', es: 'Fundamentos' }, color: SKILL_LEVEL_COLORS.beginner.solid },
  { id: 'beginner', label: { en: 'Beginner', es: 'Principiante' }, color: SKILL_LEVEL_COLORS.beginner.solid },
  { id: 'intermediate', label: { en: 'Intermediate', es: 'Intermedio' }, color: SKILL_LEVEL_COLORS.intermediate.solid },
  { id: 'advanced', label: { en: 'Advanced', es: 'Avanzado' }, color: SKILL_LEVEL_COLORS.advanced.solid },
]

export function normalizeSkaterSkillLevel(
  raw: string | null | undefined,
): SkaterSkillLevelId | null {
  const l = (raw || '').trim().toLowerCase()
  if (!l) return null
  if (l === 'foundation' || l === 'foundations' || l === 'fundamentos') return 'foundation'
  if (l === 'beginner' || l === 'principiante') return 'beginner'
  if (l === 'intermediate' || l === 'intermedio') return 'intermediate'
  if (l === 'advanced' || l === 'avanzado' || l === 'pro') return 'advanced'
  return null
}

export function skaterSkillLevelLabel(
  raw: string | null | undefined,
  es: boolean,
): string | null {
  const id = normalizeSkaterSkillLevel(raw)
  if (!id) return null
  const row = SKATER_KANBAN_SKILL_LEVELS.find(x => x.id === id)
  return row ? (es ? row.label.es : row.label.en) : null
}

export function isSkaterSkillLevelId(value: string): value is SkaterSkillLevelId {
  return SKATER_KANBAN_SKILL_LEVELS.some(l => l.id === value)
}
