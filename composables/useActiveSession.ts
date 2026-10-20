/**
 * The coach's live "Iniciar sesión" session, kept in localStorage so it survives
 * leaving the page, reloads, and other tabs. One shared clock drives every timer.
 */
export type ActiveSessionSnapshot = {
  userId: string
  /** Epoch ms when the timer started. */
  startedAt: number
  totalMinutes: number
  title: string
  programName: string
  skaterCount: number
  /** Wizard state needed to resume the live board. */
  state: {
    programId: string
    skaterIds: string[]
    location: string
    placeTypeIds: string[]
    setup: string
    trickIds: string[]
    segments: Array<{ id: string; minutes: number } & Record<string, unknown>>
    athleteSkillIds: Record<string, string[]>
    focusedAthleteId: string
    videos: Array<{ id: string; name: string; url: string }>
    trickAttempts?: Record<string, { misses: number; lands: number; mastered: boolean }>
    calendarEventId?: string
    planDate?: string
    timeSlot?: string
  }
}

const STORAGE_KEY = 'niik.active-session.v1'
/** A session left open this long past its planned length is treated as abandoned. */
const STALE_AFTER_MS = 2 * 60 * 60 * 1000

let clockStarted = false

function readStored(): ActiveSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ActiveSessionSnapshot
    if (!parsed?.startedAt || !parsed.userId) return null
    if (Date.now() - parsed.startedAt > parsed.totalMinutes * 60_000 + STALE_AFTER_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function formatSessionClock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(r).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export function useActiveSession() {
  const user = useSupabaseUser()
  const stored = useState<ActiveSessionSnapshot | null>('niik-active-session', () => null)
  const now = useState('niik-active-session-now', () => Date.now())

  if (import.meta.client && !clockStarted) {
    clockStarted = true
    // Read after hydration so server and client render the same first frame.
    onNuxtReady(() => {
      stored.value = readStored()
      now.value = Date.now()
      setInterval(() => { now.value = Date.now() }, 1000)
    })
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) stored.value = readStored()
    })
  }

  function loadStoredSession() {
    if (import.meta.client) stored.value = readStored()
  }

  /** Only the signed-in coach's own session counts. */
  const active = computed(() => {
    const snap = stored.value
    if (!snap || !user.value || snap.userId !== user.value.id) return null
    return snap
  })

  const elapsedSeconds = computed(() =>
    active.value ? Math.max(0, Math.floor((now.value - active.value.startedAt) / 1000)) : 0,
  )
  const clockLabel = computed(() => formatSessionClock(elapsedSeconds.value))
  const overtime = computed(() =>
    Boolean(active.value && elapsedSeconds.value >= active.value.totalMinutes * 60),
  )

  function saveActiveSession(snapshot: ActiveSessionSnapshot) {
    stored.value = snapshot
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)) } catch { /* private mode */ }
  }

  function clearActiveSession() {
    stored.value = null
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* private mode */ }
  }

  return { active, now, elapsedSeconds, clockLabel, overtime, loadStoredSession, saveActiveSession, clearActiveSession }
}
