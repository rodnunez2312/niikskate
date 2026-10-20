/**
 * The coach's live "Iniciar sesión" session, kept in localStorage so it survives
 * leaving the page, reloads, and other tabs. One shared clock drives every timer,
 * pauses the session, and ends it at its planned length from any page.
 */
export type ActiveSessionSnapshot = {
  userId: string
  /** Epoch ms when the timer started. */
  startedAt: number
  totalMinutes: number
  title: string
  programName: string
  skaterCount: number
  /** Epoch ms when the session was paused; null while running. */
  pausedAt?: number | null
  /** Total paused time before the current pause. */
  pausedMs?: number
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

let clockStarted = false

function readStored(): ActiveSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ActiveSessionSnapshot
    if (!parsed?.startedAt || !parsed.userId) return null
    return parsed
  } catch {
    return null
  }
}

export function sessionElapsedMs(snap: ActiveSessionSnapshot, now: number) {
  const pausedNow = snap.pausedAt ? now - snap.pausedAt : 0
  return Math.max(0, now - snap.startedAt - (snap.pausedMs || 0) - pausedNow)
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
  const client = useSupabaseClient()
  const stored = useState<ActiveSessionSnapshot | null>('niik-active-session', () => null)
  const now = useState('niik-active-session-now', () => Date.now())
  /** The live board ends its own session (with the alert); elsewhere the clock does it. */
  const boardOpen = useState('niik-live-board-open', () => false)

  function write(snapshot: ActiveSessionSnapshot | null) {
    stored.value = snapshot
    try {
      if (snapshot) localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
      else localStorage.removeItem(STORAGE_KEY)
    } catch { /* private mode */ }
  }

  /** Marks the saved class plan complete when the session runs out away from the board. */
  async function finishExpired(snap: ActiveSessionSnapshot) {
    write(null)
    const { planDate, timeSlot } = snap.state
    if (!planDate || !timeSlot) return
    const { data } = await client
      .from('class_plans')
      .select('id, notes')
      .eq('coach_id', snap.userId)
      .eq('plan_date', planDate)
      .eq('time_slot', timeSlot)
      .maybeSingle()
    const row = data as { id: string; notes: string | null } | null
    if (!row) return
    let notes: Record<string, unknown> = {}
    try { notes = JSON.parse(row.notes || '{}') } catch { /* keep empty */ }
    notes.completed = true
    notes.elapsed_seconds = snap.totalMinutes * 60
    await client.from('class_plans').update({ notes: JSON.stringify(notes) } as never).eq('id', row.id)
  }

  if (import.meta.client && !clockStarted) {
    clockStarted = true
    // Read after hydration so server and client render the same first frame.
    onNuxtReady(() => {
      stored.value = readStored()
      now.value = Date.now()
      setInterval(() => {
        now.value = Date.now()
        const snap = stored.value
        if (!snap || boardOpen.value || snap.pausedAt) return
        if (sessionElapsedMs(snap, now.value) >= snap.totalMinutes * 60_000) void finishExpired(snap)
      }, 1000)
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

  const paused = computed(() => Boolean(active.value?.pausedAt))
  const elapsedSeconds = computed(() =>
    active.value ? Math.floor(sessionElapsedMs(active.value, now.value) / 1000) : 0,
  )
  const clockLabel = computed(() => formatSessionClock(elapsedSeconds.value))
  const overtime = computed(() =>
    Boolean(active.value && elapsedSeconds.value >= active.value.totalMinutes * 60),
  )

  function saveActiveSession(snapshot: ActiveSessionSnapshot) {
    write(snapshot)
  }

  function clearActiveSession() {
    write(null)
  }

  function pauseActiveSession() {
    const snap = active.value
    if (!snap || snap.pausedAt) return
    write({ ...snap, pausedAt: Date.now() })
  }

  function resumeActiveSession() {
    const snap = active.value
    if (!snap?.pausedAt) return
    write({ ...snap, pausedMs: (snap.pausedMs || 0) + (Date.now() - snap.pausedAt), pausedAt: null })
  }

  return {
    active,
    now,
    paused,
    boardOpen,
    elapsedSeconds,
    clockLabel,
    overtime,
    loadStoredSession,
    saveActiveSession,
    clearActiveSession,
    pauseActiveSession,
    resumeActiveSession,
  }
}
