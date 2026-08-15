import { SKATE_TRICK_STRUCTURES, skillStructure } from '~/utils/skateTrickTaxonomy'

/** Skate program levels 1–5 (matches Skate Program sidebar). Each = 20% when fully completed. */
export const SKATER_PROGRAM_LEVELS = [
  {
    structure: 'Level 1: Foundations',
    levelNum: 1,
    labelEn: 'Level 1: Foundations',
    labelEs: 'Nivel 1: Fundamentos',
    shortLabelEn: 'Foundations',
    shortLabelEs: 'Fundamentos',
    descriptionEn: 'Basic board control and safety',
    descriptionEs: 'Control básico de la tabla y seguridad',
  },
  {
    structure: 'Level 2: Balance & Control',
    levelNum: 2,
    labelEn: 'Level 2: Balance & Control',
    labelEs: 'Nivel 2: Equilibrio y control',
    shortLabelEn: 'Balance & Control',
    shortLabelEs: 'Equilibrio y control',
    descriptionEn: 'Developing balance and basic movements',
    descriptionEs: 'Desarrollo de equilibrio y movimientos básicos',
  },
  {
    structure: 'Level 3: Basic Tricks',
    levelNum: 3,
    labelEn: 'Level 3: Basic Tricks',
    labelEs: 'Nivel 3: Trucos básicos',
    shortLabelEn: 'Basic Tricks',
    shortLabelEs: 'Trucos básicos',
    descriptionEn: 'First tricks and transitions',
    descriptionEs: 'Primeros trucos y transiciones',
  },
  {
    structure: 'Level 4: Progression',
    levelNum: 4,
    labelEn: 'Level 4: Progression',
    labelEs: 'Nivel 4: Progresión',
    shortLabelEn: 'Progression',
    shortLabelEs: 'Progresión',
    descriptionEn: 'Building on fundamentals',
    descriptionEs: 'Construyendo sobre fundamentos',
  },
  {
    structure: 'Level 5: Advanced',
    levelNum: 5,
    labelEn: 'Level 5: Advanced',
    labelEs: 'Nivel 5: Avanzado',
    shortLabelEn: 'Advanced',
    shortLabelEs: 'Avanzado',
    descriptionEn: 'Advanced tricks and lines',
    descriptionEs: 'Trucos avanzados y líneas',
  },
] as const

export type SkaterProgramLevel = (typeof SKATER_PROGRAM_LEVELS)[number]['structure']

export type MilestonePhase = 'complete' | 'active' | 'locked'

const MILESTONE_PCT = 20

export type SkaterProgramMilestone = {
  structure: SkaterProgramLevel
  levelNum: number
  labelEn: string
  labelEs: string
  shortLabelEn: string
  shortLabelEs: string
  descriptionEn: string
  descriptionEs: string
  total: number
  /** Raw completions in this level (including extras while locked). */
  learned: number
  complete: boolean
  phase: MilestonePhase
  segmentPct: number
  markerPct: number
  timelinePct: number
}

export type SkaterProgramProgress = {
  totalPct: number
  /** 1–5 while progressing; 5 when all levels complete. */
  activeLevelNum: number
  milestones: SkaterProgramMilestone[]
}

type SkillLike = {
  id: string
  structure?: string | null
  categoria?: string | null
}

/** Map a skill to one of Level 1–5 via structure / categoria. */
export function skillProgramLevel(skill?: SkillLike | null): SkaterProgramLevel | null {
  if (!skill) return null
  const struct = skillStructure(skill)
  if (!struct || struct === 'Strength Training') return null
  const hit = (SKATE_TRICK_STRUCTURES as readonly string[]).find(s => s === struct)
  if (hit && hit !== 'Strength Training') return hit as SkaterProgramLevel
  return null
}

/**
 * Linear program progress: skater stays on the first incomplete level until every
 * skill/drill there is done. Later levels can record extras but do not advance the phase.
 */
export function computeSkaterProgramMilestones(
  skills: SkillLike[],
  learnedSkillIds: Set<string> | string[],
): SkaterProgramProgress {
  const learned = learnedSkillIds instanceof Set ? learnedSkillIds : new Set(learnedSkillIds)
  let cumulativeMarker = 0

  const raw = SKATER_PROGRAM_LEVELS.map((level, index) => {
    cumulativeMarker += MILESTONE_PCT
    const levelSkills = skills.filter(sk => skillProgramLevel(sk) === level.structure)
    const total = levelSkills.length
    const learnedCount = levelSkills.filter(sk => learned.has(sk.id)).length
    const complete = total === 0 || learnedCount === total
    return {
      structure: level.structure,
      levelNum: level.levelNum,
      labelEn: level.labelEn,
      labelEs: level.labelEs,
      shortLabelEn: level.shortLabelEn,
      shortLabelEs: level.shortLabelEs,
      descriptionEn: level.descriptionEn,
      descriptionEs: level.descriptionEs,
      total,
      learned: learnedCount,
      complete,
      phase: 'locked' as MilestonePhase,
      segmentPct: 0,
      markerPct: cumulativeMarker,
      timelinePct: 10 + index * 20,
    }
  })

  const firstIncomplete = raw.findIndex(m => !m.complete)
  const activeIndex = firstIncomplete === -1 ? raw.length : firstIncomplete
  const activeLevelNum =
    activeIndex < raw.length ? raw[activeIndex].levelNum : raw[raw.length - 1]?.levelNum ?? 5

  let totalPct = 0

  for (let i = 0; i < raw.length; i++) {
    const m = raw[i]
    if (m.complete) {
      m.phase = 'complete'
      m.segmentPct = MILESTONE_PCT
      totalPct += MILESTONE_PCT
    } else if (i === activeIndex) {
      m.phase = 'active'
      m.segmentPct =
        m.total > 0 ? Math.round((m.learned / m.total) * MILESTONE_PCT * 10) / 10 : 0
      totalPct += m.segmentPct
    } else {
      m.phase = 'locked'
      m.segmentPct = 0
    }
  }

  return {
    totalPct: Math.min(100, Math.round(totalPct)),
    activeLevelNum,
    milestones: raw,
  }
}
