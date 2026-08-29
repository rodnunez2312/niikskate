import type { AudienceCategory, ProgramSkillTrack } from '~/types'
import { PROGRAM_AGE_BANDS } from '~/types'

export type ClassPlanSectionId = 'games' | 'drills' | 'closure'

export type ClassPlanSection = {
  id: ClassPlanSectionId
  skill_ids: string[]
}

export const CLASS_PLAN_TRICK_SECTIONS: Array<{
  id: ClassPlanSectionId
  emoji: string
  label: { en: string; es: string }
  /** Pre-filter trick library by Excel program column when opening picker */
  defaultProgram?: string
}> = [
  {
    id: 'games',
    emoji: '🎮',
    label: { en: 'Games', es: 'Juegos' },
    defaultProgram: 'Iniciacion',
  },
  {
    id: 'drills',
    emoji: '🎯',
    label: { en: 'Focused drills', es: 'Drills enfocados' },
  },
  {
    id: 'closure',
    emoji: '🏁',
    label: { en: 'Closure', es: 'Cierre' },
  },
]

/** Beginner-only audience bands shown on the class plan form (tots / kids / adults). */
export const CLASS_PLAN_BEGINNER_AUDIENCES = PROGRAM_AGE_BANDS.filter(b =>
  (['tots_5_7', 'kids_7_12', 'adults_18_plus'] as AudienceCategory[]).includes(b.id),
)

const SECTION_IDS = new Set<ClassPlanSectionId>(CLASS_PLAN_TRICK_SECTIONS.map(s => s.id))

export function emptyPlanSections(): ClassPlanSection[] {
  return CLASS_PLAN_TRICK_SECTIONS.map(s => ({ id: s.id, skill_ids: [] }))
}

export function normalizePlanSections(
  raw: unknown,
  legacyPlannedSkills?: string[] | null,
): ClassPlanSection[] {
  const base = emptyPlanSections()
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== 'object') continue
      const id = (row as { id?: string }).id
      const skillIds = (row as { skill_ids?: unknown }).skill_ids
      if (!id || !SECTION_IDS.has(id as ClassPlanSectionId)) continue
      const slot = base.find(s => s.id === id)
      if (!slot || !Array.isArray(skillIds)) continue
      slot.skill_ids = skillIds.filter((x): x is string => typeof x === 'string' && x.length > 0)
    }
    return base
  }
  const legacy = (legacyPlannedSkills || []).filter(Boolean)
  if (legacy.length) {
    const drills = base.find(s => s.id === 'drills')
    if (drills) drills.skill_ids = [...legacy]
  }
  return base
}

export function allSectionSkillIds(sections: ClassPlanSection[]): string[] {
  return [...new Set(sections.flatMap(s => s.skill_ids))]
}

export function sectionDef(id: ClassPlanSectionId) {
  return CLASS_PLAN_TRICK_SECTIONS.find(s => s.id === id)!
}

export function difficultyForSkillTrack(track: ProgramSkillTrack | '' | null | undefined): string {
  if (track === 'intermediate') return 'intermediate'
  if (track === 'advanced') return 'advanced'
  if (track === 'beginner') return 'beginner'
  return ''
}
