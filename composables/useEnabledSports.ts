import { TRAINING_DISCIPLINES, type TrainingDiscipline } from '~/utils/trainingDisciplines'

/** Strength Training is a program, not a class discipline, so it never tags a session. */
export type SportProgramId = TrainingDiscipline | 'strength'

/** Every program the academy can add from the left-pane picker. `image` replaces the line icon when set. */
export const SPORT_PROGRAMS: ReadonlyArray<{ id: SportProgramId; label: string; image?: string }> = [
  { id: 'skateboarding', label: 'Skate' },
  { id: 'scooter', label: 'Scooter' },
  { id: 'rollerblading', label: 'Roller' },
  { id: 'bmx', label: 'BMX' },
  { id: 'parkour', label: 'Parkour' },
  { id: 'strength', label: 'Strength' },
]

const DEFAULT_PROGRAMS: SportProgramId[] = ['skateboarding', 'scooter', 'rollerblading']
const COOKIE_OPTIONS = { maxAge: 60 * 60 * 24 * 400, sameSite: 'lax' as const }

function isDiscipline(id: SportProgramId): id is TrainingDiscipline {
  return TRAINING_DISCIPLINES.some(row => row.id === id)
}

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
  const cookie = useCookie<SportProgramId[]>('niik-enabled-sports', { default: () => ['skateboarding'], ...COOKIE_OPTIONS })
  const programsCookie = useCookie<SportProgramId[]>('niik-sport-programs', { default: () => DEFAULT_PROGRAMS, ...COOKIE_OPTIONS })
  // Shared state so the sidebar and the open page react to the same pick.
  const stored = useState<SportProgramId[]>('niik-enabled-sports', () => cookie.value || ['skateboarding'])
  const addedIds = useState<SportProgramId[]>('niik-sport-programs', () => programsCookie.value || DEFAULT_PROGRAMS)

  /** Programs shown in the dropdown, in catalog order. The grid decides this list. */
  const programs = computed(() => {
    const listed = new Set(addedIds.value.length ? addedIds.value : DEFAULT_PROGRAMS)
    return SPORT_PROGRAMS.filter(program => listed.has(program.id))
  })

  const selected = computed<SportProgramId>(() => {
    const allowed = programs.value.map(program => program.id)
    return (stored.value || []).find(id => allowed.includes(id)) || allowed[0] || 'skateboarding'
  })

  /** Class disciplines for create forms; empty while a non-class program like Strength is picked. */
  const enabled = computed<TrainingDiscipline[]>(() => (isDiscipline(selected.value) ? [selected.value] : []))

  function isOn(id: SportProgramId) {
    return selected.value === id
  }

  function select(id: SportProgramId) {
    stored.value = [id]
    cookie.value = [id]
  }

  function addProgram(id: SportProgramId) {
    if (!addedIds.value.includes(id)) {
      addedIds.value = [...addedIds.value, id]
      programsCookie.value = addedIds.value
    }
    select(id)
  }

  /** Take a sport out of the dropdown. One sport always stays. */
  function removeProgram(id: SportProgramId) {
    const next = addedIds.value.filter(sport => sport !== id)
    if (!next.length) return
    addedIds.value = next
    programsCookie.value = next
    if (selected.value === id) {
      const fallback = SPORT_PROGRAMS.find(program => next.includes(program.id))
      if (fallback) select(fallback.id)
    }
  }

  /**
   * Holidays and closures belong to the academy, so they stay visible.
   * Every class, practice, and titled program follows the sport in the left pane.
   * A row with no discipline is skateboarding.
   */
  function matchesSport(ev: { event_type?: string | null; discipline?: string | null; title?: string | null }) {
    const shared = ev.event_type === 'holiday' || ev.event_type === 'closure'
    if (shared && !ev.discipline) return true
    if (!isDiscipline(selected.value)) return false
    return eventSport(ev) === selected.value
  }

  return {
    catalog: TRAINING_DISCIPLINES,
    programs,
    allPrograms: SPORT_PROGRAMS,
    selected,
    enabled,
    isOn,
    select,
    toggle: select,
    addProgram,
    removeProgram,
    matchesSport,
  }
}
