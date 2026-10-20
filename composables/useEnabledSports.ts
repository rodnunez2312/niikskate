import { TRAINING_DISCIPLINES, type TrainingDiscipline } from '~/utils/trainingDisciplines'

/** Sports the academy can turn on. Parkour stays out of this switch; BMX joins once it opens. */
export const ACADEMY_SPORTS = TRAINING_DISCIPLINES.filter(sport => sport.id !== 'parkour' && sport.id !== 'bmx')

/** Sport of a calendar row: its discipline column, else a hint in the title, else skate. */
export function eventSport(ev: { discipline?: string | null; title?: string | null }): TrainingDiscipline {
  const id = typeof ev?.discipline === 'string' ? ev.discipline.trim() : ''
  if (TRAINING_DISCIPLINES.some(row => row.id === id)) return id as TrainingDiscipline
  const text = (ev?.title || '').toLowerCase()
  if (text.includes('scooter')) return 'scooter'
  if (text.includes('bmx')) return 'bmx'
  if (text.includes('parkour')) return 'parkour'
  if (text.includes('patinaje') || text.includes('patines') || text.includes('roller') || text.includes('inline')) return 'rollerblading'
  return 'skateboarding'
}

/** The staff-wide sport filter picked in the left pane. One sport at a time. */
export function useEnabledSports() {
  const cookie = useCookie<TrainingDiscipline[]>('niik-enabled-sports', {
    default: () => ['skateboarding'],
    maxAge: 60 * 60 * 24 * 400,
    sameSite: 'lax',
  })
  // Shared state so the sidebar and the open page react to the same pick.
  const stored = useState<TrainingDiscipline[]>('niik-enabled-sports', () => cookie.value || ['skateboarding'])

  const selected = computed<TrainingDiscipline>(() => {
    const allowed = new Set(ACADEMY_SPORTS.map(sport => sport.id))
    const first = (stored.value || []).find(id => allowed.has(id as TrainingDiscipline))
    return (first as TrainingDiscipline) || 'skateboarding'
  })

  const enabled = computed<TrainingDiscipline[]>(() => [selected.value])

  function isOn(id: TrainingDiscipline) {
    return selected.value === id
  }

  function select(id: TrainingDiscipline) {
    stored.value = [id]
    cookie.value = [id]
  }

  /** Only rows that carry a sport are filtered; other events show for every sport. */
  function matchesSport(ev: { event_type?: string | null; discipline?: string | null; title?: string | null }) {
    const sportful = !ev.event_type || ['class_session', 'class_individual', 'practice'].includes(ev.event_type)
    if (!sportful && !ev.discipline) return true
    return eventSport(ev) === selected.value
  }

  return { catalog: ACADEMY_SPORTS, selected, enabled, isOn, select, toggle: select, matchesSport }
}
