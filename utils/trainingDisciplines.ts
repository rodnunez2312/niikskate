export const TRAINING_DISCIPLINES = [
  { id: 'skateboarding', es: 'Skate', en: 'Skateboarding' },
  { id: 'scooter', es: 'Scooter', en: 'Scooter' },
  { id: 'rollerblading', es: 'Patinaje', en: 'Rollerblading' },
  { id: 'bmx', es: 'BMX', en: 'BMX' },
  { id: 'parkour', es: 'Parkour', en: 'Parkour' },
] as const

export type TrainingDiscipline = (typeof TRAINING_DISCIPLINES)[number]['id']

export function isTrainingDiscipline(value: string | null | undefined): value is TrainingDiscipline {
  return TRAINING_DISCIPLINES.some(row => row.id === value)
}

export function disciplineEmoji(id: string | null | undefined) {
  if (id === 'scooter') return '🛴'
  if (id === 'rollerblading') return '🛼'
  if (id === 'bmx') return '🚲'
  if (id === 'parkour') return '🤸'
  if (id === 'skateboarding') return '🛹'
  return ''
}

export function disciplineLabel(id: string | null | undefined, es: boolean) {
  const row = TRAINING_DISCIPLINES.find(item => item.id === id)
  if (!row) return ''
  return es ? row.es : row.en
}

export function disciplineFromJoin(row: {
  training_programs?: { discipline?: string | null } | { discipline?: string | null }[] | null
} | null | undefined) {
  const joined = row?.training_programs
  if (Array.isArray(joined)) return joined[0]?.discipline ?? null
  return joined?.discipline ?? null
}

export function skillLevelWithDiscipline(
  levelName: string | null | undefined,
  discipline: string | null | undefined,
  es: boolean,
) {
  const level = (levelName || '').trim()
  const sport = disciplineLabel(discipline, es)
  if (sport && level) return `${sport} · ${level}`
  return level
}
