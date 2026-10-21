import { eventSport, SPORT_PROGRAMS, type SportProgramId } from '~/composables/useEnabledSports'

type Client = ReturnType<typeof useSupabaseClient>

/** The five things a sport needs before it can run as a full program. */
export type SetupKey = 'coach' | 'program' | 'schedule' | 'students' | 'tricks'

export type SetupItem = {
  /** `setup:<sport>:<key>`, shared with the read/unread state. */
  id: string
  key: SetupKey
  es: string
  en: string
  to: string
}

const CLASS_TYPES = ['class_session', 'class_individual']

function setupItem(sport: SportProgramId, label: string, key: SetupKey): SetupItem {
  const copy: Record<SetupKey, { es: string; en: string; to: string }> = {
    coach: { es: `Añadir un coach de ${label}`, en: `Add a ${label} coach`, to: '/member/admin/scheduling/coaches' },
    program: { es: `Crear un programa de ${label}`, en: `Create a ${label} program`, to: '/member/coach/library?create=1' },
    schedule: { es: `Añadir horario de clases de ${label}`, en: `Add a ${label} class schedule`, to: '/member/admin/scheduling/calendar' },
    students: { es: `Inscribir alumnos en clases de ${label}`, en: `Enroll students in ${label} classes`, to: '/member/admin/finance/students' },
    tricks: { es: `Añadir trucos de ${label} a la Bolsa de trucos`, en: `Add ${label} tricks to the Bag of Tricks`, to: '/member/coach/tricks?create=1' },
  }
  return { id: `setup:${sport}:${key}`, key, ...copy[key] }
}

/** Class ids per sport, newest first. */
async function classIdsBySport(client: Client) {
  const { data } = await client
    .from('school_calendar_events')
    .select('id, discipline, title')
    .in('event_type', CLASS_TYPES)
    .order('start_date', { ascending: false })
    .limit(2000)
  const bySport = new Map<string, string[]>()
  for (const ev of (data || []) as Array<{ id: string; discipline: string | null; title: string | null }>) {
    const sport = eventSport(ev)
    const list = bySport.get(sport) || []
    list.push(ev.id)
    bySport.set(sport, list)
  }
  return bySport
}

/** Profiles booked into classes of one sport. Used to keep other sports' students out of a sport's pages. */
export async function sportStudentIds(client: Client, sport: SportProgramId): Promise<Set<string>> {
  const ids = ((await classIdsBySport(client)).get(sport) || []).slice(0, 150)
  if (!ids.length) return new Set()
  const { data } = await client
    .from('class_session_enrollments')
    .select('user_id, skater_profile_id')
    .in('calendar_event_id', ids)
    .neq('status', 'cancelled')
  return new Set(
    ((data || []) as Array<{ user_id: string | null; skater_profile_id: string | null }>)
      .map(row => row.skater_profile_id || row.user_id)
      .filter((id): id is string => Boolean(id)),
  )
}

/** Required setup still missing, per sport. Strength runs on the shared gym library, so it has none. */
export async function loadSportSetup(client: Client): Promise<Partial<Record<SportProgramId, SetupItem[]>>> {
  const [coachRows, programRows, trickRows, classIds] = await Promise.all([
    client.from('profiles').select('coach_discipline').in('role', ['coach', 'admin']).eq('is_active', true),
    client.from('training_programs').select('discipline').eq('is_active', true),
    client.from('skills_library').select('discipline').eq('is_active', true),
    classIdsBySport(client),
  ])

  const coachSports = new Set<string>()
  for (const row of (coachRows.data || []) as Array<{ coach_discipline: unknown }>) {
    const list = Array.isArray(row.coach_discipline) ? row.coach_discipline : row.coach_discipline ? [row.coach_discipline] : ['skateboarding']
    for (const sport of list) coachSports.add(String(sport))
  }
  const programSports = new Set(((programRows.data || []) as Array<{ discipline: string | null }>).map(row => row.discipline).filter(Boolean))
  const trickSports = new Set<string>()
  if (trickRows.error && /discipline|schema cache/i.test(trickRows.error.message || '')) trickSports.add('skateboarding')
  else for (const row of (trickRows.data || []) as Array<{ discipline: string | null }>) trickSports.add(row.discipline || 'skateboarding')

  const sports = SPORT_PROGRAMS.filter(program => program.id !== 'strength')
  const studentChecks = await Promise.all(sports.map(async (program) => {
    const ids = (classIds.get(program.id) || []).slice(0, 100)
    if (!ids.length) return [program.id, false] as const
    const { data } = await client
      .from('class_session_enrollments')
      .select('id')
      .in('calendar_event_id', ids)
      .neq('status', 'cancelled')
      .limit(1)
    return [program.id, Boolean(data?.length)] as const
  }))
  const studentSports = new Set(studentChecks.filter(([, has]) => has).map(([id]) => id))

  const result: Partial<Record<SportProgramId, SetupItem[]>> = { strength: [] }
  for (const program of sports) {
    const items: SetupItem[] = []
    if (!coachSports.has(program.id)) items.push(setupItem(program.id, program.label, 'coach'))
    if (!programSports.has(program.id)) items.push(setupItem(program.id, program.label, 'program'))
    if (!classIds.get(program.id)?.length) items.push(setupItem(program.id, program.label, 'schedule'))
    if (!studentSports.has(program.id)) items.push(setupItem(program.id, program.label, 'students'))
    if (!trickSports.has(program.id)) items.push(setupItem(program.id, program.label, 'tricks'))
    result[program.id] = items
  }
  return result
}

/** Missing setup per sport, shared by the sport picker and the dashboard. */
export function useSportSetup() {
  const client = useSupabaseClient()
  const setup = useState<Partial<Record<SportProgramId, SetupItem[]>>>('niik-sport-setup', () => ({}))
  const loaded = useState('niik-sport-setup-loaded', () => false)

  async function refresh() {
    setup.value = await loadSportSetup(client)
    loaded.value = true
  }

  async function ensure() {
    if (!loaded.value) await refresh()
  }

  const itemsFor = (sport: SportProgramId) => setup.value[sport] || []

  return { setup, itemsFor, refresh, ensure }
}

/**
 * Read and deleted state for warnings, kept per browser.
 * Required setup can only be marked read or unread; it stays until it is done.
 * Other warnings can also be deleted.
 */
export function useWarningState() {
  const options = { default: () => [] as string[], maxAge: 60 * 60 * 24 * 400, sameSite: 'lax' as const }
  const readCookie = useCookie<string[]>('niik-warn-read', options)
  const deletedCookie = useCookie<string[]>('niik-warn-deleted', options)
  const read = useState<string[]>('niik-warn-read', () => readCookie.value || [])
  const deleted = useState<string[]>('niik-warn-deleted', () => deletedCookie.value || [])

  const isRead = (id: string) => read.value.includes(id)
  const isDeleted = (id: string) => deleted.value.includes(id)

  function setRead(ids: string[], value: boolean) {
    const next = value
      ? [...new Set([...read.value, ...ids])]
      : read.value.filter(id => !ids.includes(id))
    read.value = next
    readCookie.value = next
  }

  function toggleRead(id: string) {
    setRead([id], !isRead(id))
  }

  function remove(id: string) {
    if (id.startsWith('setup:')) return
    const next = [...new Set([...deleted.value, id])]
    deleted.value = next
    deletedCookie.value = next
  }

  return { isRead, isDeleted, setRead, toggleRead, remove }
}
