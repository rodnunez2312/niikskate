/**
 * Skate-career gamification (THPS-style): XP, levels, ranks, stats, unlocks,
 * achievements and the weekly mission. Everything is derived from existing rows.
 */
import { SKATER_STYLE_OPTIONS } from '~/utils/skaterProfileFields'
import { SKATER_PROGRAM_LEVELS, skillProgramLevel } from '~/utils/skaterProgramProgress'
import { compareSkillsByManualId, isCoachDrill, isSkaterTrick } from '~/utils/skateTrickTaxonomy'

export const CAREER_TZ = 'America/Merida'

export const XP_RULES = {
  attend: 10,
  video: 15,
  drill: 20,
  trick: 25,
  evaluation: 50,
  weeklyMission: 50,
  phase: 100,
} as const

/** "Skate · Level 2: Balance & Control" → "LEVEL 2 BALANCE & CONTROL" */
export function campaignChapterLabel(label: string | null | undefined): string {
  const raw = (label || '').trim()
  const m = raw.match(/(?:level|nivel)\s*(\d+)\s*:?\s*(.*)$/i)
  if (m) return `LEVEL ${m[1]}${m[2] ? ` ${m[2]}` : ''}`.toUpperCase()
  return raw.toUpperCase()
}

/** Cumulative XP required to reach level N (index 0 = level 1). */
export const LEVEL_THRESHOLDS = [0, 100, 500, 1000, 1750, 2750, 4000, 5500, 7500, 10000] as const
export const MAX_LEVEL = LEVEL_THRESHOLDS.length

export type CareerRankId = 'rookie' | 'amateur' | 'advanced' | 'expert' | 'pro'

export type CareerRank = {
  id: CareerRankId
  label: string
  minLevel: number
  color: string
  glow: string
}

export const CAREER_RANKS: readonly CareerRank[] = [
  { id: 'rookie', label: 'Rookie', minLevel: 1, color: '#9CA3AF', glow: 'rgba(156,163,175,0.35)' },
  { id: 'amateur', label: 'Amateur', minLevel: 3, color: '#22C55E', glow: 'rgba(34,197,94,0.4)' },
  { id: 'advanced', label: 'Advanced', minLevel: 5, color: '#3B82F6', glow: 'rgba(59,130,246,0.45)' },
  { id: 'expert', label: 'Expert', minLevel: 7, color: '#A855F7', glow: 'rgba(168,85,247,0.45)' },
  { id: 'pro', label: 'Pro', minLevel: 9, color: '#FACC15', glow: 'rgba(250,204,21,0.5)' },
]

export type TrickRarityId = 'bronze' | 'silver' | 'gold' | 'platinum'

export type TrickRarity = {
  id: TrickRarityId
  labelEs: string
  labelEn: string
  color: string
}

export const TRICK_RARITIES: readonly TrickRarity[] = [
  { id: 'bronze', labelEs: 'Bronce', labelEn: 'Bronze', color: '#CD7F32' },
  { id: 'silver', labelEs: 'Plata', labelEn: 'Silver', color: '#C0C7D0' },
  { id: 'gold', labelEs: 'Oro', labelEn: 'Gold', color: '#FACC15' },
  { id: 'platinum', labelEs: 'Platino', labelEn: 'Platinum', color: '#7DD3FC' },
]

export function isTrickRarityId(value: unknown): value is TrickRarityId {
  return typeof value === 'string' && TRICK_RARITIES.some(r => r.id === value)
}

/** Coach-assigned `rarity` wins; otherwise Levels 1–2 Bronze, 3 Silver, 4 Gold, 5 Platinum, then difficulty. */
export function trickRarity(skill: { rarity?: string | null; structure?: string | null; categoria?: string | null; difficulty?: string | null } | null | undefined): TrickRarity {
  if (isTrickRarityId(skill?.rarity)) return TRICK_RARITIES.find(r => r.id === skill!.rarity)!
  return autoTrickRarity(skill)
}

export function autoTrickRarity(skill: { structure?: string | null; categoria?: string | null; difficulty?: string | null } | null | undefined): TrickRarity {
  const level = skillProgramLevel(skill ? { id: '', ...skill } : null)
  const byLevel: Record<string, TrickRarityId> = {
    'Level 1: Foundations': 'bronze',
    'Level 2: Balance & Control': 'bronze',
    'Level 3: Basic Tricks': 'silver',
    'Level 4: Progression': 'gold',
    'Level 5: Advanced': 'platinum',
  }
  let id: TrickRarityId = level ? byLevel[level] : 'bronze'
  if (!level) {
    const d = (skill?.difficulty || '').toLowerCase()
    if (d === 'intermediate') id = 'silver'
    else if (d === 'advanced') id = 'gold'
  }
  return TRICK_RARITIES.find(r => r.id === id)!
}

export type CareerSkill = {
  id: string
  name: string
  name_es?: string | null
  area?: string | null
  structure?: string | null
  categoria?: string | null
  trick_type?: string | null
  manual_id?: number | null
  sort_order?: number | null
  difficulty?: string | null
  rarity?: string | null
}

export type CareerInput = {
  skills: CareerSkill[]
  progress: { skill_id: string; learned_at?: string | null; created_at?: string | null }[]
  attendance: { class_date: string; attended: boolean }[]
  videos: { created_at: string }[]
  evaluations: { evaluation_date: string }[]
  /** Assigned program skill order; used to pick the next goal first. */
  programSkillIds?: string[]
  skatingStyle?: string | null
  es: boolean
  now?: Date
}

export type CareerEvent = {
  /** Stable identity used to detect newly earned events. */
  key: string
  kind: keyof typeof XP_RULES
  /** Skill or phase name for celebration toasts. */
  subject?: string
  rarity?: TrickRarity
  xp: number
  label: string
  date: string
}

export type CareerUnlock = { id: string; name: string }

export type CareerStat = {
  key: string
  label: string
  value: number
  unlocked: CareerUnlock | null
  next: CareerUnlock | null
}

export type CareerAchievement = {
  id: string
  label: string
  unlocked: boolean
}

export type CareerMissionTask = { id: string; label: string; done: boolean }

export type SkaterCareer = {
  xp: number
  level: number
  rank: CareerRank
  levelFloorXp: number
  nextLevelXp: number | null
  xpToNext: number
  levelPct: number
  title: string
  nextGoal: CareerUnlock | null
  latestTrick: CareerUnlock | null
  tricksCompleted: number
  drillsCompleted: number
  /** Completed tricks per rarity tier, in TRICK_RARITIES order. */
  rarityCounts: { rarity: TrickRarity; count: number }[]
  events: CareerEvent[]
  stats: CareerStat[]
  achievements: CareerAchievement[]
  mission: { tasks: CareerMissionTask[]; complete: boolean; reward: number }
}

/** YYYY-MM-DD in the academy timezone. */
export function careerDateKey(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-CA', { timeZone: CAREER_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Monday (YYYY-MM-DD) of the week containing the date key. */
export function careerWeekKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const dow = (dt.getUTCDay() + 6) % 7
  dt.setUTCDate(dt.getUTCDate() - dow)
  return dt.toISOString().slice(0, 10)
}

export function levelForXp(xp: number): number {
  let level = 1
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (xp >= LEVEL_THRESHOLDS[i]) level = i + 1
  }
  return level
}

export function rankForLevel(level: number): CareerRank {
  let rank = CAREER_RANKS[0]
  for (const r of CAREER_RANKS) if (level >= r.minLevel) rank = r
  return rank
}

function skillLabel(skill: CareerSkill, es: boolean): string {
  return (es ? skill.name_es || skill.name : skill.name) || skill.name
}

function shortDate(dateKey: string, es: boolean): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(es ? 'es-MX' : 'en-US', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

type StatDef = { key: string; label: string; match: (s: CareerSkill) => boolean }

const STAT_DEFS: StatDef[] = [
  {
    key: 'balance',
    label: 'Balance',
    match: s => {
      const lvl = skillProgramLevel(s)
      return lvl === 'Level 1: Foundations' || lvl === 'Level 2: Balance & Control'
    },
  },
  { key: 'control', label: 'Control', match: s => isCoachDrill(s) },
  { key: 'street', label: 'Street', match: s => /^(street|flatground)$/i.test((s.area || '').trim()) },
  { key: 'vert', label: 'Vert', match: s => /^(vert|mini ramp)$/i.test((s.area || '').trim()) },
  { key: 'speed', label: 'Speed', match: s => /^(park|bowl)$/i.test((s.area || '').trim()) },
  { key: 'tricks', label: 'Tricks', match: s => isSkaterTrick(s) },
]

export function computeSkaterCareer(input: CareerInput): SkaterCareer {
  const { es } = input
  const skillById = new Map(input.skills.map(s => [s.id, s]))
  const learnedAt = new Map<string, string>()
  for (const p of input.progress) {
    if (!skillById.has(p.skill_id) || learnedAt.has(p.skill_id)) continue
    learnedAt.set(p.skill_id, careerDateKey(p.learned_at || p.created_at || new Date()))
  }

  const events: CareerEvent[] = []
  for (const [id, date] of learnedAt) {
    const skill = skillById.get(id)!
    const name = skillLabel(skill, es)
    if (isSkaterTrick(skill)) {
      events.push({ key: `trick:${id}`, kind: 'trick', subject: name, rarity: trickRarity(skill), xp: XP_RULES.trick, label: `${name} ${es ? 'completado' : 'completed'}`, date })
    } else if (isCoachDrill(skill)) {
      events.push({ key: `drill:${id}`, kind: 'drill', subject: name, xp: XP_RULES.drill, label: `Drill ${name}`, date })
    }
  }

  for (const level of SKATER_PROGRAM_LEVELS) {
    const levelSkills = input.skills.filter(s => skillProgramLevel(s) === level.structure)
    if (!levelSkills.length || !levelSkills.every(s => learnedAt.has(s.id))) continue
    const date = levelSkills.map(s => learnedAt.get(s.id)!).sort().pop()!
    const name = es ? level.shortLabelEs : level.shortLabelEn
    events.push({
      key: `phase:${level.levelNum}`,
      kind: 'phase',
      subject: name,
      xp: XP_RULES.phase,
      label: `${es ? 'Fase completada' : 'Phase complete'}: ${name}`,
      date,
    })
  }

  const attendedDates = input.attendance.filter(a => a.attended).map(a => careerDateKey(a.class_date))
  attendedDates.forEach((date, i) => {
    events.push({ key: `attend:${date}:${i}`, kind: 'attend', xp: XP_RULES.attend, label: `${es ? 'Clase' : 'Class'} ${shortDate(date, es)}`, date })
  })
  const videoDates = input.videos.map(v => careerDateKey(v.created_at))
  input.videos.forEach((v, i) => {
    events.push({ key: `video:${v.created_at}:${i}`, kind: 'video', xp: XP_RULES.video, label: es ? 'Video subido' : 'Video uploaded', date: videoDates[i] })
  })
  input.evaluations.forEach((ev, i) => {
    const date = careerDateKey(ev.evaluation_date)
    events.push({ key: `evaluation:${date}:${i}`, kind: 'evaluation', xp: XP_RULES.evaluation, label: es ? 'Evaluación aprobada' : 'Evaluation passed', date })
  })

  const todayKey = careerDateKey(input.now ?? new Date())
  const thisWeek = careerWeekKey(todayKey)
  const weeksWith = (dates: string[]) => new Set(dates.map(careerWeekKey))
  const drillDates = [...learnedAt].filter(([id]) => isCoachDrill(skillById.get(id))).map(([, d]) => d)
  const trickDates = [...learnedAt].filter(([id]) => isSkaterTrick(skillById.get(id))).map(([, d]) => d)
  const attendWeeks = weeksWith(attendedDates)
  const drillWeeks = weeksWith(drillDates)
  const videoWeeks = weeksWith(videoDates)
  for (const wk of attendWeeks) {
    if (drillWeeks.has(wk) && videoWeeks.has(wk)) {
      events.push({
        key: `mission:${wk}`,
        kind: 'weeklyMission',
        xp: XP_RULES.weeklyMission,
        label: es ? 'Misión semanal completada' : 'Weekly mission complete',
        date: wk,
      })
    }
  }

  events.sort((a, b) => b.date.localeCompare(a.date))
  const xp = events.reduce((sum, e) => sum + e.xp, 0)
  const level = levelForXp(xp)
  const rank = rankForLevel(level)
  const levelFloorXp = LEVEL_THRESHOLDS[level - 1]
  const nextLevelXp = level < MAX_LEVEL ? LEVEL_THRESHOLDS[level] : null
  const xpToNext = nextLevelXp != null ? Math.max(0, nextLevelXp - xp) : 0
  const levelPct = nextLevelXp != null
    ? Math.round(((xp - levelFloorXp) / (nextLevelXp - levelFloorXp)) * 100)
    : 100

  const sorted = [...input.skills].sort(compareSkillsByManualId)
  const tricksOrdered = (() => {
    const programOrder = (input.programSkillIds || [])
      .map(id => skillById.get(id))
      .filter((s): s is CareerSkill => !!s && isSkaterTrick(s))
    const rest = sorted.filter(s => isSkaterTrick(s) && !programOrder.includes(s))
    return [...programOrder, ...rest]
  })()
  const nextTrick = tricksOrdered.find(s => !learnedAt.has(s.id)) || null
  const nextGoal = nextTrick ? { id: nextTrick.id, name: skillLabel(nextTrick, es) } : null

  const completedTricks = [...learnedAt]
    .filter(([id]) => isSkaterTrick(skillById.get(id)))
    .sort((a, b) => b[1].localeCompare(a[1]))
  const latest = completedTricks[0] ? skillById.get(completedTricks[0][0])! : null
  const latestTrick = latest ? { id: latest.id, name: skillLabel(latest, es) } : null

  const stats: CareerStat[] = STAT_DEFS.map(def => {
    const pool = sorted.filter(s => (isSkaterTrick(s) || isCoachDrill(s)) && def.match(s))
    const done = pool.filter(s => learnedAt.has(s.id))
    const lastDone = [...done].sort((a, b) => learnedAt.get(b.id)!.localeCompare(learnedAt.get(a.id)!))[0]
    const next = pool.find(s => !learnedAt.has(s.id))
    return {
      key: def.key,
      label: def.label,
      value: pool.length ? Math.round((done.length / pool.length) * 100) : 0,
      unlocked: lastDone ? { id: lastDone.id, name: skillLabel(lastDone, es) } : null,
      next: next ? { id: next.id, name: skillLabel(next, es) } : null,
    }
  })

  const level1Tricks = sorted.filter(s => isSkaterTrick(s) && skillProgramLevel(s) === 'Level 1: Foundations')
  const countBy = (dates: string[]) => {
    const m = new Map<string, number>()
    for (const d of dates) m.set(careerWeekKey(d), (m.get(careerWeekKey(d)) || 0) + 1)
    return Math.max(0, ...m.values())
  }
  const ollie = sorted.find(s => isSkaterTrick(s) && /^ollie$/i.test((s.name || '').trim()))
  const achievements: CareerAchievement[] = [
    { id: 'first_trick', label: es ? 'Primer Truco' : 'First Trick', unlocked: trickDates.length > 0 },
    { id: 'first_class', label: es ? 'Primera Clase' : 'First Class', unlocked: attendedDates.length > 0 },
    { id: 'first_video', label: es ? 'Primer Video' : 'First Video', unlocked: videoDates.length > 0 },
    { id: 'week_streak', label: es ? 'Una Semana Seguida' : 'Week Streak', unlocked: countBy(attendedDates) >= 2 },
    {
      id: 'skate_iq_1',
      label: es ? 'Skate IQ Nivel 1' : 'Skate IQ Level 1',
      unlocked: level1Tricks.length > 0 && level1Tricks.every(s => learnedAt.has(s.id)),
    },
    { id: 'ollie', label: es ? 'Ollie Dominado' : 'Ollie Mastered', unlocked: !!ollie && learnedAt.has(ollie.id) },
    { id: 'ten_classes', label: es ? '10 Clases Completadas' : '10 Classes Completed', unlocked: attendedDates.length >= 10 },
    { id: 'trick_combo', label: 'Trick Combo', unlocked: countBy(trickDates) >= 3 },
  ]

  const tasks: CareerMissionTask[] = [
    { id: 'attend', label: es ? 'Asistir a 1 clase' : 'Attend 1 class', done: attendWeeks.has(thisWeek) },
    { id: 'drill', label: es ? 'Completar 1 drill' : 'Complete 1 drill', done: drillWeeks.has(thisWeek) },
    { id: 'video', label: es ? 'Subir 1 video' : 'Upload 1 video', done: videoWeeks.has(thisWeek) },
  ]

  const style = SKATER_STYLE_OPTIONS.find(o => o.value === (input.skatingStyle || '').trim())
  const styleWord = style && style.value !== 'all_around' ? style.labelEn.toUpperCase() : ''
  const title = `LEVEL ${level} ${styleWord ? `${styleWord} ` : ''}SKATER`

  return {
    xp,
    level,
    rank,
    levelFloorXp,
    nextLevelXp,
    xpToNext,
    levelPct: Math.max(0, Math.min(100, levelPct)),
    title,
    nextGoal,
    latestTrick,
    tricksCompleted: completedTricks.length,
    drillsCompleted: drillDates.length,
    rarityCounts: TRICK_RARITIES.map(rarity => ({
      rarity,
      count: completedTricks.filter(([id]) => trickRarity(skillById.get(id)).id === rarity.id).length,
    })),
    events,
    stats,
    achievements,
    mission: { tasks, complete: tasks.every(t => t.done), reward: XP_RULES.weeklyMission },
  }
}
