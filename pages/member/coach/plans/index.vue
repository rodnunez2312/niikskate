<script setup lang="ts">
import { DEFAULT_SKATEPARK } from '~/types'
import { PROGRAM_SEASONS, isSummerCourseSeason } from '~/utils/programSeasons'
import {
  skillStructure,
  trickManualLabel,
  compareSkillsByManualId,
} from '~/utils/skateTrickTaxonomy'
import { disciplineFromJoin, skillLevelWithDiscipline } from '~/utils/trainingDisciplines'
import {
  DEFAULT_SESSION_LENGTH,
  FIXED_SESSION_BLOCKS,
  SESSION_PRESETS,
  sessionBlockLabel,
  sessionPreset,
  type SessionBlock,
  type SessionLength,
} from '~/utils/sessionStructure'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const client = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const route = useRoute()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

type ProgramRow = {
  id: string
  name: string
  description: string | null
  color: string | null
  students: number
}

type SkaterRow = {
  id: string
  full_name: string
  skill_group_id: string | null
}

type TrickRow = {
  id: string
  name: string
  name_es: string | null
  area: string | null
  structure: string | null
  categoria: string | null
  trick_type: string | null
  manual_id: number | null
  sort_order: number | null
}

type PlaceType = {
  id: string
  es: string
  en: string
  /** Trick-library areas this place lines up with. */
  areas: string[]
  /** Extra tricks from any area whose name matches, e.g. bank drills filed under Park. */
  namePattern?: RegExp
}

const PLACE_TYPES: PlaceType[] = [
  { id: 'banks', es: 'Banks (rampa sin transición)', en: 'Banks (no transition)', areas: ['Flatground'], namePattern: /\bbank|slope/i },
  { id: 'bowl', es: 'Bowl', en: 'Bowl', areas: ['Bowl'] },
  { id: 'flatground', es: 'Flatground', en: 'Flatground', areas: ['Flatground'] },
  { id: 'ledges', es: 'Ledges', en: 'Ledges', areas: ['Street'] },
  { id: 'mini-ramp', es: 'Mini ramp', en: 'Mini Ramp', areas: ['Mini Ramp'] },
  { id: 'rails', es: 'Rails', en: 'Rails', areas: ['Street'] },
  // A street section mixes ledges, rails, and flat, so it pulls from both libraries.
  { id: 'street', es: 'Sección de street', en: 'Street section', areas: ['Street', 'Flatground'] },
  { id: 'vert', es: 'Vert ramp', en: 'Vert Ramp', areas: ['Vert'] },
]

const LOCATION_STORAGE_KEY = 'niik-session-locations'

type SetupKind = 'performance' | 'learning'

type TimerSegment = SessionBlock

const STEPS = [
  { id: 1, es: 'Programa', en: 'Program', hintEs: '¿Para qué programa es?', hintEn: 'Which program is this session for?' },
  { id: 2, es: 'Patinadores', en: 'Athletes', hintEs: '¿Quién entrena hoy?', hintEn: "Who's training today?" },
  { id: 3, es: 'Lugar', en: 'Location', hintEs: '¿Dónde entrenan?', hintEn: 'Where are you training?' },
  { id: 4, es: 'Enfoque', en: 'Setup', hintEs: 'Tipo de sesión', hintEn: 'Area and focus for the session' },
  { id: 5, es: 'Trucos', en: 'Skills', hintEs: 'Elige de la biblioteca', hintEn: 'Configure skills' },
  { id: 6, es: 'Tiempo', en: 'Timer', hintEs: 'Bloques de la sesión', hintEn: 'Set timer segments' },
] as const

const checking = ref(true)
const loading = ref(true)
const loadError = ref('')
const step = ref(1)
const phase = ref<'setup' | 'live'>('setup')
/** Class date from a session page. Today and future dates are allowed; a past date is ignored. */
const sessionPlanDate = ref('')
const sessionTimeSlot = ref('')
/** Set when this flow opened from an existing calendar class, so the program step is already known. */
const scheduledSession = ref(false)
const calendarEventId = ref('')

const programs = ref<ProgramRow[]>([])
const skaters = ref<SkaterRow[]>([])
const tricks = ref<TrickRow[]>([])

const programId = ref('')
const skaterIds = ref<string[]>([])
const showAllSkaters = ref(false)
const skaterQuery = ref('')
const locations = ref<string[]>([DEFAULT_SKATEPARK])
const location = ref(DEFAULT_SKATEPARK)
const locationDraft = ref('')
const locationError = ref('')
const placeTypeIds = ref<string[]>([])
const setup = ref<SetupKind | ''>('')
const trickIds = ref<string[]>([])
const trickQuery = ref('')
const trickLibraryWide = ref(false)
const SESSION_LENGTHS = Object.keys(SESSION_PRESETS).map(Number) as SessionLength[]
const segments = ref<TimerSegment[]>(sessionPreset(DEFAULT_SESSION_LENGTH))

const saveError = ref('')
const elapsed = ref(0)
const running = ref(false)
let ticker: ReturnType<typeof setInterval> | null = null

const skillQuery = ref('')
const skillLayout = ref<'list' | 'grid'>('list')
const addSkillOpen = ref(false)
const manageAthletesOpen = ref(false)
const addSkillQuery = ref('')
const addSkillIds = ref<string[]>([])
const addSkillAthleteIds = ref<string[]>([])
/** Skills marked on a skater during the session. The session list is `trickIds`. */
const athleteSkillIds = ref<Record<string, string[]>>({})
type TrickAttempt = { misses: number; lands: number; mastered: boolean }
/** Keyed by athlete id + skill id. Totals are written to the session page. */
const trickAttempts = ref<Record<string, TrickAttempt>>({})
const attemptError = ref('')
const focusedAthleteId = ref('')
const sessionDone = ref(false)
const sessionAlertOpen = ref(false)
const sessionAlerted = ref(false)
const videos = ref<Array<{ id: string; name: string; url: string }>>([])
const videoError = ref('')
const uploadingVideo = ref(false)

const selectedProgram = computed(() => programs.value.find(p => p.id === programId.value) ?? null)
const selectedPlaces = computed(() => PLACE_TYPES.filter(p => placeTypeIds.value.includes(p.id)))

const selectedPlacesLabel = computed(() =>
  selectedPlaces.value.map(p => (es.value ? p.es : p.en)).join(', '),
)

function togglePlaceType(id: string) {
  placeTypeIds.value = placeTypeIds.value.includes(id)
    ? placeTypeIds.value.filter(x => x !== id)
    : [...placeTypeIds.value, id]
}

function skillMatchesPlaces(skill: TrickRow) {
  const places = selectedPlaces.value
  if (!places.length) return true
  const area = (skill.area || '').trim()
  const label = `${skill.name || ''} ${skill.name_es || ''}`
  return places.some(p => p.areas.includes(area) || Boolean(p.namePattern?.test(label)))
}

const sessionTitle = computed(() => {
  const place = selectedPlacesLabel.value || location.value
  const kind = setup.value === 'learning'
    ? (es.value ? 'Aprendizaje' : 'Learning')
    : (es.value ? 'Performance' : 'Performance')
  return `${place} · ${kind}`
})

const sessionSkaters = computed(() =>
  skaterIds.value
    .map(id => skaters.value.find(s => s.id === id))
    .filter((s): s is SkaterRow => Boolean(s)),
)

function programNameFor(skater: SkaterRow) {
  return programs.value.find(p => p.id === skater.skill_group_id)?.name || ''
}

const addSkillChoices = computed(() => {
  const q = addSkillQuery.value.trim().toLowerCase()
  const rows = q
    ? tricks.value.filter(t => trickLabel(t).toLowerCase().includes(q))
    : tricks.value
  return rows.slice(0, 40)
})

const programSkaters = computed(() => {
  const rows = showAllSkaters.value || !programId.value
    ? skaters.value
    : skaters.value.filter(s => s.skill_group_id === programId.value)
  const q = skaterQuery.value.trim().toLowerCase()
  if (!q) return rows
  return rows.filter(s => (s.full_name || '').toLowerCase().includes(q))
})

const visibleTricks = computed(() => {
  const programName = (selectedProgram.value?.name || '').trim().toLowerCase()
  const q = trickQuery.value.trim().toLowerCase()
  const preferredType = setup.value === 'learning' ? 'drill' : setup.value === 'performance' ? 'trick' : ''

  return tricks.value.filter(skill => {
    if (!trickLibraryWide.value) {
      if (!skillMatchesPlaces(skill)) return false
      const structure = skillStructure(skill).trim().toLowerCase()
      if (programName && structure && structure !== programName && !programName.includes(structure)) return false
      if (preferredType && (skill.trick_type || '').trim().toLowerCase() !== preferredType) return false
    }
    if (!q) return true
    const label = `${skill.name_es || ''} ${skill.name || ''}`.toLowerCase()
    return label.includes(q)
  })
})

const totalMinutes = computed(() => segments.value.reduce((n, s) => n + s.minutes, 0))

const totalLabel = computed(() => {
  const mins = totalMinutes.value
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
})

function segmentLabel(id: TimerSegment['id']) {
  return sessionBlockLabel(id, es.value)
}

/** The preset the current blocks still match, or null once the coach tweaks a block. */
const activeSessionLength = computed<SessionLength | null>(() =>
  SESSION_LENGTHS.find(len =>
    SESSION_PRESETS[len].every((block, i) => segments.value[i]?.minutes === block.minutes),
  ) ?? null,
)

function applySessionLength(length: SessionLength) {
  segments.value = sessionPreset(length)
}

function isFixedSegment(id: TimerSegment['id']) {
  return FIXED_SESSION_BLOCKS[id] !== undefined
}

function segmentMinutes(id: TimerSegment['id']) {
  return segments.value.find(s => s.id === id)?.minutes ?? 0
}

function trickLabel(skill: TrickRow) {
  return es.value ? skill.name_es || skill.name : skill.name
}

function bumpMinutes(index: number, delta: number) {
  if (isFixedSegment(segments.value[index].id)) return
  const next = segments.value[index].minutes + delta
  segments.value[index].minutes = Math.max(0, Math.min(180, next))
}

function toggleSkater(id: string) {
  const i = skaterIds.value.indexOf(id)
  if (i >= 0) skaterIds.value.splice(i, 1)
  else skaterIds.value.push(id)
}

function rememberLocations(names: string[]) {
  const merged = [...locations.value]
  for (const raw of names) {
    const name = raw.trim()
    if (name && !merged.some(existing => existing.toLowerCase() === name.toLowerCase())) {
      merged.push(name)
    }
  }
  merged.sort((a, b) => {
    if (a === DEFAULT_SKATEPARK) return -1
    if (b === DEFAULT_SKATEPARK) return 1
    return a.localeCompare(b)
  })
  locations.value = merged
  try {
    localStorage.setItem(
      LOCATION_STORAGE_KEY,
      JSON.stringify(merged.filter(name => name !== DEFAULT_SKATEPARK)),
    )
  } catch { /* private mode */ }
}

function storedLocations(): string[] {
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(name => typeof name === 'string') : []
  } catch {
    return []
  }
}

async function addLocation() {
  const name = locationDraft.value.trim()
  locationError.value = ''
  if (!name) return
  if (locations.value.some(existing => existing.toLowerCase() === name.toLowerCase())) {
    location.value = locations.value.find(existing => existing.toLowerCase() === name.toLowerCase()) || name
    locationDraft.value = ''
    return
  }
  rememberLocations([name])
  location.value = name
  locationDraft.value = ''
  const { error } = await client.from('session_locations').insert({
    name,
    created_by: user.value?.id ?? null,
  })
  if (error && !/duplicate|unique|does not exist|schema cache/i.test(error.message || '')) {
    locationError.value = error.message
  }
}

function toggleTrick(id: string) {
  const i = trickIds.value.indexOf(id)
  if (i >= 0) trickIds.value.splice(i, 1)
  else trickIds.value.push(id)
}

const canAdvance = computed(() => {
  if (step.value === 1) return Boolean(programId.value)
  if (step.value === 2) return skaterIds.value.length > 0
  if (step.value === 3) return Boolean(location.value && placeTypeIds.value.length)
  if (step.value === 4) return Boolean(setup.value)
  if (step.value === 5) return trickIds.value.length > 0
  return totalMinutes.value > 0
})

function nextStep() {
  if (!canAdvance.value || step.value >= 6) return
  step.value += 1
}

function chooseProgram(id: string) {
  programId.value = id
  step.value = 2
}

function prevStep() {
  const floor = scheduledSession.value ? 2 : 1
  if (step.value > floor) step.value -= 1
}

function seasonSlugForDate(day: string) {
  const regular = PROGRAM_SEASONS.filter(season =>
    !isSummerCourseSeason(season.slug) && day >= season.startDate && day <= season.endDate,
  )
  if (regular[0]) return regular[0].slug
  return PROGRAM_SEASONS.find(season => day >= season.startDate && day <= season.endDate)?.slug || ''
}

function clockStamp(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`
}

/** A quick session is not a scheduled class, so it is added to the season as its own calendar block. */
async function ensureQuickCalendarEvent(planDate: string, timeSlot: string) {
  if (calendarEventId.value || !user.value) return
  const start = new Date()
  const end = new Date(start.getTime() + Math.max(totalMinutes.value, 1) * 60_000)
  const title = [selectedProgram.value?.name, es.value ? 'Sesión rápida' : 'Quick session'].filter(Boolean).join(' · ')
  const body: Record<string, unknown> = {
    title,
    event_type: 'event',
    start_date: planDate,
    end_date: planDate,
    all_day: false,
    start_time: clockStamp(start),
    end_time: clockStamp(end),
    location: location.value,
    skatepark: location.value,
    description: 'quick_session',
    visible_to_parents: false,
    season_slug: seasonSlugForDate(planDate),
    time_slot: timeSlot,
    is_bookable: false,
    created_by: user.value.id,
  }
  let createdId = ''
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await client.from('school_calendar_events').insert(body).select('id').single()
    if (!error && data?.id) {
      createdId = data.id
      break
    }
    const message = error?.message || ''
    const missing = ['season_slug', 'skatepark', 'time_slot', 'is_bookable', 'created_by'].find(column => message.includes(column))
    if (!missing) {
      saveError.value = message
      return
    }
    delete body[missing]
  }
  if (!createdId) return
  calendarEventId.value = createdId
  const seat = {
    calendar_event_id: createdId,
    coach_id: user.value.id,
    assigned_by: user.value.id,
    delivered: false,
  }
  const { error: seatError } = await client.from('class_session_coaches').insert(seat)
  if (seatError) {
    await client.from('class_session_coaches').insert({
      calendar_event_id: createdId,
      coach_id: user.value.id,
    })
  }
}

const sessionStartedAt = ref<number | null>(null)
let keepAliveAudio: HTMLAudioElement | null = null
const {
  active: storedSession,
  paused: sessionPaused,
  boardOpen,
  loadStoredSession,
  saveActiveSession,
  clearActiveSession,
  pauseActiveSession,
  resumeActiveSession,
} = useActiveSession()

onMounted(() => { boardOpen.value = true })
onUnmounted(() => { boardOpen.value = false })

function liveElapsedSeconds() {
  const snap = storedSession.value
  if (snap) return Math.floor(sessionElapsedMs(snap, Date.now()) / 1000)
  return sessionStartedAt.value ? Math.floor((Date.now() - sessionStartedAt.value) / 1000) : 0
}

function togglePause() {
  if (sessionPaused.value) resumeActiveSession()
  else pauseActiveSession()
  elapsed.value = liveElapsedSeconds()
}

/** Keeps the live session in the browser so leaving this page does not lose it. */
function rememberLiveSession() {
  if (!user.value || !sessionStartedAt.value || sessionDone.value) return
  saveActiveSession({
    userId: user.value.id,
    startedAt: sessionStartedAt.value,
    totalMinutes: totalMinutes.value,
    title: sessionTitle.value,
    programName: selectedProgram.value?.name || '',
    skaterCount: skaterIds.value.length,
    pausedAt: storedSession.value?.pausedAt ?? null,
    pausedMs: storedSession.value?.pausedMs ?? 0,
    state: {
      programId: programId.value,
      skaterIds: [...skaterIds.value],
      location: location.value,
      placeTypeIds: [...placeTypeIds.value],
      setup: setup.value,
      trickIds: [...trickIds.value],
      segments: JSON.parse(JSON.stringify(segments.value)),
      athleteSkillIds: JSON.parse(JSON.stringify(athleteSkillIds.value)),
      focusedAthleteId: focusedAthleteId.value,
      videos: [...videos.value],
      trickAttempts: JSON.parse(JSON.stringify(trickAttempts.value)),
      calendarEventId: calendarEventId.value,
      planDate: sessionPlanDate.value,
      timeSlot: sessionTimeSlot.value,
    },
  })
}

function resumeStoredSession() {
  loadStoredSession()
  const snap = storedSession.value
  if (!snap || phase.value === 'live') return
  const s = snap.state
  programId.value = s.programId
  skaterIds.value = [...s.skaterIds]
  location.value = s.location || location.value
  placeTypeIds.value = [...s.placeTypeIds]
  setup.value = (s.setup as SetupKind) || ''
  trickIds.value = [...s.trickIds]
  if (s.segments?.length) segments.value = s.segments as unknown as TimerSegment[]
  athleteSkillIds.value = s.athleteSkillIds || {}
  focusedAthleteId.value = s.focusedAthleteId || s.skaterIds[0] || ''
  videos.value = s.videos || []
  trickAttempts.value = s.trickAttempts || {}
  if (s.calendarEventId) calendarEventId.value = s.calendarEventId
  if (s.planDate) sessionPlanDate.value = s.planDate
  if (s.timeSlot) sessionTimeSlot.value = s.timeSlot
  sessionDone.value = false
  sessionAlerted.value = false
  step.value = 6
  phase.value = 'live'
  elapsed.value = Math.floor(sessionElapsedMs(snap, Date.now()) / 1000)
  startTicker(snap.startedAt)
}

function stopTicker() {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
  if (keepAliveAudio) {
    keepAliveAudio.pause()
    keepAliveAudio.currentTime = 0
  }
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    navigator.mediaSession.playbackState = 'none'
  }
  const worker = navigator.serviceWorker
  if (!worker) return
  void worker.ready.then(reg => reg.getNotifications({ tag: 'niik-session' })).then(list => {
    list.forEach(note => note.close())
  }).catch(() => {})
}

function formatClock(seconds: number) {
  const s = Math.max(0, seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

function notifySessionEnded() {
  const title = es.value ? 'La sesión terminó' : 'The session ended'
  const body = sessionTitle.value
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body })
    } catch { /* some browsers block the constructor */ }
  }
}

function publishSessionClock() {
  const clock = formatClock(elapsed.value)
  const title = sessionTitle.value || 'NiikSkate'
  const body = es.value ? `Sesión en curso · ${clock}` : `Session running · ${clock}`
  if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${clock} · ${title}`,
        artist: 'NiikSkate',
        album: es.value ? 'Sesión en curso' : 'Session in progress',
        artwork: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
      })
      navigator.mediaSession.playbackState = 'playing'
      const limit = Math.max(totalMinutes.value * 60, elapsed.value, 1)
      navigator.mediaSession.setPositionState({
        duration: limit,
        playbackRate: 1,
        position: Math.min(elapsed.value, limit),
      })
    } catch { /* some browsers reject position before metadata is ready */ }
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const worker = navigator.serviceWorker
  if (!worker) return
  void worker.ready.then(reg => reg.showNotification(title, {
    body,
    tag: 'niik-session',
    silent: true,
    icon: '/icons/icon-192.png',
  })).catch(() => {})
}

function startTicker(startedAt?: number) {
  if (ticker) {
    clearInterval(ticker)
    ticker = null
  }
  sessionStartedAt.value = startedAt ?? Date.now()
  running.value = true
  if (typeof Audio !== 'undefined') {
    if (!keepAliveAudio) {
      keepAliveAudio = new Audio('/sounds/silence.wav')
      keepAliveAudio.loop = true
    }
    void keepAliveAudio.play().catch(() => {})
  }
  const limit = totalMinutes.value * 60
  ticker = setInterval(() => {
    if (!running.value || sessionDone.value || !sessionStartedAt.value) return
    if (sessionPaused.value) return
    elapsed.value = liveElapsedSeconds()
    publishSessionClock()
    if (elapsed.value < limit || sessionAlerted.value) return
    sessionAlerted.value = true
    sessionDone.value = true
    running.value = false
    stopTicker()
    sessionAlertOpen.value = true
    notifySessionEnded()
    clearActiveSession()
    void persistSession()
  }, 1000)
}

function skillsForAthlete(id: string) {
  return (athleteSkillIds.value[id] || [])
    .map(skillId => tricks.value.find(t => t.id === skillId))
    .filter((t): t is TrickRow => Boolean(t))
}

function openAddSkill(athleteId?: string) {
  addSkillIds.value = []
  addSkillQuery.value = ''
  addSkillAthleteIds.value = athleteId ? [athleteId] : [...skaterIds.value]
  addSkillOpen.value = true
}

function toggleAddSkill(id: string) {
  const i = addSkillIds.value.indexOf(id)
  if (i >= 0) addSkillIds.value.splice(i, 1)
  else addSkillIds.value.push(id)
}

function toggleAddSkillAthlete(id: string) {
  const i = addSkillAthleteIds.value.indexOf(id)
  if (i >= 0) addSkillAthleteIds.value.splice(i, 1)
  else addSkillAthleteIds.value.push(id)
}

function confirmAddSkills() {
  for (const skillId of addSkillIds.value) {
    if (!trickIds.value.includes(skillId)) trickIds.value.push(skillId)
    for (const athleteId of addSkillAthleteIds.value) {
      const current = athleteSkillIds.value[athleteId] || []
      if (!current.includes(skillId)) {
        athleteSkillIds.value[athleteId] = [...current, skillId]
      }
    }
  }
  addSkillOpen.value = false
  void persistSession()
}

function attemptKey(athleteId: string, skillId: string) {
  return `${athleteId}:${skillId}`
}

function attemptFor(athleteId: string, skillId: string): TrickAttempt {
  return trickAttempts.value[attemptKey(athleteId, skillId)] || { misses: 0, lands: 0, mastered: false }
}

function attemptTotals() {
  let missed = 0
  let lands = 0
  let skills = 0
  for (const row of Object.values(trickAttempts.value)) {
    missed += row.misses
    lands += row.lands
    if (row.mastered) skills += 1
  }
  return { missed, lands, skills }
}

async function syncSessionReport() {
  if (!calendarEventId.value) return
  const totals = attemptTotals()
  const { error } = await client.from('session_reports').upsert({
    calendar_event_id: calendarEventId.value,
    total_missed: totals.missed,
    successful_lands: totals.lands,
    skills_mastered: totals.skills,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'calendar_event_id' })
  if (error) {
    attemptError.value = /session_reports|schema cache|does not exist/i.test(error.message || '')
      ? (es.value
        ? 'Falta la tabla de rendimiento. Ejecuta supabase/migrations/add_session_videos.sql.'
        : 'Missing performance table. Run supabase/migrations/add_session_videos.sql.')
      : error.message
    return
  }
  attemptError.value = ''
}

async function adjustAttempt(athleteId: string, skillId: string, kind: 'misses' | 'lands' | 'mastered', delta = 1) {
  const key = attemptKey(athleteId, skillId)
  const current = attemptFor(athleteId, skillId)
  const next: TrickAttempt = { ...current }
  if (kind === 'mastered') next.mastered = !current.mastered
  else next[kind] = Math.max(0, current[kind] + delta)
  const copy = { ...trickAttempts.value }
  if (!next.misses && !next.lands && !next.mastered) delete copy[key]
  else copy[key] = next
  trickAttempts.value = copy
  await persistSession()
  await syncSessionReport()
}

function removeAthleteSkill(athleteId: string, skillId: string) {
  athleteSkillIds.value[athleteId] = (athleteSkillIds.value[athleteId] || []).filter(id => id !== skillId)
  const key = attemptKey(athleteId, skillId)
  if (trickAttempts.value[key]) {
    const copy = { ...trickAttempts.value }
    delete copy[key]
    trickAttempts.value = copy
    void syncSessionReport()
  }
  void persistSession()
}

function openManageAthletes() {
  manageAthletesOpen.value = true
}

async function onVideoPicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !user.value) return
  videoError.value = ''
  uploadingVideo.value = true
  try {
    const safe = file.name.replace(/[^\w.\-]+/g, '_')
    const path = `session-videos/${user.value.id}/${Date.now()}-${safe}`
    const { error } = await client.storage.from('images').upload(path, file, {
      contentType: file.type || 'video/mp4',
      upsert: false,
    })
    if (error) throw error
    const { data } = client.storage.from('images').getPublicUrl(path)
    videos.value.push({ id: path, name: file.name, url: data.publicUrl })
    await persistSession()
  } catch (e: any) {
    videoError.value = e?.message || (es.value ? 'No se pudo subir el video' : 'Could not upload the video')
  } finally {
    uploadingVideo.value = false
  }
}

async function completeSession() {
  sessionDone.value = true
  running.value = false
  stopTicker()
  clearActiveSession()
  await persistSession()
}

async function persistSession() {
  saveError.value = ''
  if (!user.value) return
  if (phase.value === 'live') rememberLiveSession()
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const planDate = sessionPlanDate.value || todayKey
  const payload: Record<string, unknown> = {
    coach_id: user.value.id,
    plan_date: planDate,
    time_slot: sessionTimeSlot.value || (now.getHours() < 16 ? 'early' : 'late'),
    title: [selectedProgram.value?.name, setup.value === 'performance' ? 'Performance' : 'Learning']
      .filter(Boolean)
      .join(' · '),
    planned_skills: trickIds.value,
    warmup_notes: `${segmentMinutes('warmup')} min`,
    main_activity_notes: segments.value
      .filter(s => !isFixedSegment(s.id))
      .map(s => `${sessionBlockLabel(s.id, es.value)}: ${s.minutes} min`)
      .join(' · '),
    cooldown_notes: `${segmentMinutes('stretch')} min`,
    notes: JSON.stringify({
      program_id: programId.value,
      skater_ids: skaterIds.value,
      location: location.value,
      place_types: placeTypeIds.value,
      place_label: selectedPlacesLabel.value,
      setup: setup.value,
      segments: segments.value,
      athlete_skills: athleteSkillIds.value,
      trick_attempts: trickAttempts.value,
      videos: videos.value,
      calendar_event_id: calendarEventId.value || null,
      elapsed_seconds: elapsed.value,
      completed: sessionDone.value,
      started_at: sessionStartedAt.value ? new Date(sessionStartedAt.value).toISOString() : null,
      total_minutes: totalMinutes.value,
      session_title: sessionTitle.value,
    }),
    plan_sections: [{ id: 'tricks', skill_ids: trickIds.value }],
  }

  let { error } = await client
    .from('class_plans')
    .upsert(payload, { onConflict: 'coach_id,plan_date,time_slot' })

  if (error && /plan_sections|schema cache|column/i.test(error.message || '')) {
    delete payload.plan_sections
    ;({ error } = await client
      .from('class_plans')
      .upsert(payload, { onConflict: 'coach_id,plan_date,time_slot' }))
  }
  if (error) saveError.value = error.message
}

async function startSession() {
  if (!canAdvance.value) return
  elapsed.value = 0
  sessionDone.value = false
  sessionAlerted.value = false
  sessionAlertOpen.value = false
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
  const assigned: Record<string, string[]> = {}
  for (const id of skaterIds.value) assigned[id] = []
  athleteSkillIds.value = assigned
  trickAttempts.value = {}
  focusedAthleteId.value = skaterIds.value[0] || ''
  videos.value = []
  phase.value = 'live'
  startTicker()
  if (!scheduledSession.value) {
    const now = new Date()
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const slot = sessionTimeSlot.value || (now.getHours() < 16 ? 'early' : 'late')
    await ensureQuickCalendarEvent(sessionPlanDate.value || todayKey, slot)
  }
  await persistSession()
}

onUnmounted(stopTicker)

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/member/coach/plans')
    return
  }
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if (profile?.role !== 'admin' && profile?.role !== 'coach') {
    router.push('/')
    return
  }
  checking.value = false
  try {
    rememberLocations(storedLocations())

    const [skatersRes, tricksRes, locationsRes] = await Promise.all([
      client
        .from('profiles')
        .select('id, full_name, skill_group_id')
        .eq('role', 'customer')
        .eq('is_active', true)
        .order('full_name'),
      client
        .from('skills_library')
        .select('id, name, name_es, area, structure, categoria, trick_type, manual_id, sort_order')
        .eq('is_active', true),
      client.from('session_locations').select('name').order('name'),
    ])
    const groupsJoined = await client
      .from('skill_groups')
      .select('id, name, description, color, sort_order, is_active, training_programs(discipline)')
      .order('sort_order')
    const groupsRes = groupsJoined.error
      ? await client
        .from('skill_groups')
        .select('id, name, description, color, sort_order, is_active')
        .order('sort_order')
      : groupsJoined
    if (groupsRes.error) throw groupsRes.error
    if (skatersRes.error) throw skatersRes.error
    if (tricksRes.error) throw tricksRes.error

    const counts: Record<string, number> = {}
    for (const row of (skatersRes.data || []) as SkaterRow[]) {
      if (row.skill_group_id) counts[row.skill_group_id] = (counts[row.skill_group_id] || 0) + 1
    }
    programs.value = ((groupsRes.data || []) as any[])
      .filter(g => g.is_active !== false)
      .map(g => ({
        id: g.id,
        name: skillLevelWithDiscipline(g.name, disciplineFromJoin(g), es.value),
        description: g.description,
        color: g.color,
        students: counts[g.id] || 0,
      }))
    skaters.value = (skatersRes.data || []) as SkaterRow[]
    tricks.value = ((tricksRes.data || []) as TrickRow[]).sort(compareSkillsByManualId)
    if (!locationsRes.error) {
      rememberLocations(((locationsRes.data || []) as { name: string }[]).map(row => row.name))
    }
  } catch (e: any) {
    loadError.value = e?.message || 'Error'
  } finally {
    loading.value = false
  }
  const requestedDate = String(route.query.date || '')
  const todayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`
  const planningAhead = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate >= todayKey
  if (planningAhead) {
    sessionPlanDate.value = requestedDate
    sessionTimeSlot.value = String(route.query.slot || '')
    scheduledSession.value = true
    calendarEventId.value = String(route.query.event || '')
    step.value = 2
    const eventId = calendarEventId.value
    if (eventId) {
      const { data: scheduled } = await client
        .from('school_calendar_events')
        .select('title, skill_level, skatepark, location')
        .eq('id', eventId)
        .maybeSingle()
      if (scheduled) {
        const park = scheduled.skatepark || scheduled.location
        if (park) location.value = park
        const title = String(scheduled.title || '').toLowerCase()
        const match = programs.value.find(program => program.id === scheduled.skill_level)
          || programs.value.find(program => title.includes(program.name.toLowerCase()))
        if (match) programId.value = match.id
      }
    }
  }
  if (!loadError.value && !planningAhead) resumeStoredSession()
})
</script>

<template>
  <div class="min-h-screen bg-black">
    <div v-if="checking || loading" class="flex items-center justify-center py-20">
      <div class="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>

    <template v-else>
    <MemberStaffPageHeader
      v-if="phase === 'setup'"
      :title="es ? 'Iniciar sesión' : 'Start a session'"
      :subtitle="es ? 'Elige programa, patinadores y cómo va la clase.' : 'Select program, athletes, and setup.'"
    />
    <MemberStaffPageHeader
      v-else
      :title="sessionTitle"
      :subtitle="[
        `${sessionSkaters.length} ${es ? (sessionSkaters.length === 1 ? 'patinador' : 'patinadores') : (sessionSkaters.length === 1 ? 'athlete' : 'athletes')}`,
        location.trim(),
      ].filter(Boolean).join(' · ')"
    >
      <template #actions>
        <span
          class="text-lg font-bold tabular-nums"
          :class="sessionPaused ? 'text-gray-500' : 'text-white'"
          :title="totalLabel"
        >
          {{ formatClock(elapsed) }}
        </span>
        <button
          v-if="!sessionDone"
          type="button"
          class="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-700 text-white hover:border-gray-500"
          :aria-label="sessionPaused ? (es ? 'Reanudar sesión' : 'Resume session') : (es ? 'Pausar sesión' : 'Pause session')"
          :title="sessionPaused ? (es ? 'Reanudar' : 'Resume') : (es ? 'Pausar' : 'Pause')"
          @click="togglePause"
        >
          <svg v-if="sessionPaused" class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
          <svg v-else class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
        </button>
        <button
          type="button"
          class="px-3 py-2 rounded-xl border border-gray-700 text-white text-sm font-semibold"
          @click="openManageAthletes"
        >
          {{ es ? 'Gestionar' : 'Manage' }}
        </button>
        <button
          type="button"
          class="px-4 py-2.5 rounded-xl bg-acid text-charcoal text-sm font-semibold disabled:opacity-50"
          :disabled="sessionDone"
          @click="completeSession"
        >
          {{ sessionDone ? (es ? 'Sesión cerrada' : 'Session complete') : (es ? 'Cerrar sesión' : 'Complete session') }}
        </button>
      </template>
    </MemberStaffPageHeader>
    <div class="px-4 py-6 mx-auto pb-16" :class="phase === 'live' ? 'max-w-5xl' : 'max-w-3xl'">

      <p v-if="loadError" class="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
        {{ loadError }}
      </p>

      <template v-else-if="phase === 'setup'">
        <ol class="grid gap-1 mb-5" :class="scheduledSession ? 'grid-cols-5' : 'grid-cols-6'">
          <li v-for="s in STEPS" v-show="!scheduledSession || s.id !== 1" :key="s.id" class="text-center">
            <span
              class="mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
              :class="step === s.id
                ? 'bg-white text-black'
                : step > s.id
                  ? 'bg-teal-500/20 text-teal-300'
                  : 'bg-gray-800 text-gray-500'"
            >
              {{ step > s.id ? '✓' : s.id }}
            </span>
            <p class="mt-1 text-[10px] leading-tight" :class="step === s.id ? 'text-white' : 'text-gray-500'">
              {{ es ? s.es : s.en }}
            </p>
          </li>
        </ol>

        <section class="rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:p-5">
          <h2 class="text-base font-semibold text-white">
            {{ es ? 'Detalle de la sesión' : 'Session details' }}
          </h2>

          <!-- 1 Program -->
          <div v-if="step === 1 && !scheduledSession" class="mt-4 space-y-3">
            <div>
              <p class="text-sm font-medium text-white">{{ es ? 'Selecciona el programa' : 'Select program' }}</p>
              <p class="text-xs text-gray-500">{{ es ? STEPS[0].hintEs : STEPS[0].hintEn }}</p>
            </div>
            <p v-if="programs.length === 0" class="text-sm text-gray-500">
              {{ es ? 'No hay programas activos.' : 'No active programs.' }}
            </p>
            <button
              v-for="p in programs"
              :key="p.id"
              type="button"
              class="w-full text-left rounded-xl border px-4 py-3 transition-colors"
              :class="programId === p.id
                ? 'border-teal-500 bg-teal-500/10'
                : 'border-gray-800 hover:border-gray-700'"
              @click="chooseProgram(p.id)"
            >
              <span class="flex items-start gap-3">
                <span
                  class="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
                  :style="{ backgroundColor: p.color || '#2dd4bf' }"
                />
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-white">{{ p.name }}</span>
                  <span v-if="p.description" class="block text-xs text-gray-400 mt-0.5">{{ p.description }}</span>
                  <span class="block text-[11px] text-gray-500 mt-1">
                    {{ p.students }} {{ es ? (p.students === 1 ? 'patinador' : 'patinadores') : (p.students === 1 ? 'athlete' : 'athletes') }}
                  </span>
                </span>
              </span>
            </button>
          </div>

          <!-- 2 Athletes -->
          <div v-else-if="step === 2" class="mt-4 space-y-3">
            <div>
              <p class="text-sm font-medium text-white">{{ es ? 'Selecciona patinadores' : 'Select athletes' }}</p>
              <p class="text-xs text-gray-500">
                {{ es ? 'Del programa elegido. Puedes ver a todos.' : 'From the selected program. You can show everyone.' }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <input
                v-model="skaterQuery"
                type="search"
                class="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm outline-none focus:border-teal-500"
                :placeholder="es ? 'Buscar patinador' : 'Search skater'"
              />
              <label class="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
                <input v-model="showAllSkaters" type="checkbox" class="rounded border-gray-600 text-teal-500" />
                {{ es ? 'Todos' : 'All' }}
              </label>
            </div>
            <p class="text-[11px] text-gray-500">
              {{ skaterIds.length }} {{ es ? 'seleccionados' : 'selected' }}
            </p>
            <p v-if="programSkaters.length === 0" class="text-sm text-gray-500">
              {{ es ? 'Nadie en este programa. Activa Todos.' : 'Nobody in this program. Turn on All.' }}
            </p>
            <ul class="max-h-80 overflow-y-auto space-y-1.5">
              <li v-for="s in programSkaters" :key="s.id">
                <button
                  type="button"
                  class="w-full flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left"
                  :class="skaterIds.includes(s.id)
                    ? 'border-teal-500 bg-teal-500/10'
                    : 'border-gray-800 hover:border-gray-700'"
                  @click="toggleSkater(s.id)"
                >
                  <span
                    class="h-4 w-4 rounded border flex items-center justify-center text-[10px]"
                    :class="skaterIds.includes(s.id) ? 'border-teal-400 bg-teal-500 text-black' : 'border-gray-600'"
                  >
                    {{ skaterIds.includes(s.id) ? '✓' : '' }}
                  </span>
                  <span class="text-sm text-white">{{ s.full_name || (es ? 'Sin nombre' : 'Unnamed') }}</span>
                </button>
              </li>
            </ul>
          </div>

          <!-- 3 Location + place -->
          <div v-else-if="step === 3" class="mt-4 space-y-4">
            <div>
              <p class="text-sm font-medium text-white">{{ es ? '¿Dónde entrenan?' : 'Where are you training?' }}</p>
              <p class="text-xs text-gray-500">{{ es ? 'Lugar y tipo de spot.' : 'Location and the kind of spot.' }}</p>
            </div>
            <label class="block">
              <span class="block text-xs text-gray-400 mb-1">{{ es ? 'Ubicación' : 'Location' }}</span>
              <select
                v-model="location"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm outline-none focus:border-teal-500"
              >
                <option v-for="loc in locations" :key="loc" :value="loc">{{ loc }}</option>
              </select>
            </label>
            <div class="flex gap-2">
              <input
                v-model="locationDraft"
                type="text"
                class="flex-1 px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-white text-sm outline-none focus:border-teal-500"
                :placeholder="es ? 'Nueva ubicación' : 'New location'"
                @keydown.enter.prevent="addLocation"
              />
              <button
                type="button"
                class="px-3 py-2 rounded-xl border border-gray-700 text-sm text-gray-200 hover:border-teal-500 hover:text-white disabled:opacity-40"
                :disabled="!locationDraft.trim()"
                @click="addLocation"
              >
                {{ es ? 'Agregar' : 'Add' }}
              </button>
            </div>
            <p v-if="locationError" class="text-xs text-amber-300">{{ locationError }}</p>
            <div>
              <p class="text-xs text-gray-400 mb-2">
                {{ es ? 'Tipo de lugar' : 'Type of spot' }}
                <span class="text-gray-500">· {{ es ? 'puedes elegir varios' : 'pick as many as you need' }}</span>
              </p>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="place in PLACE_TYPES"
                  :key="place.id"
                  type="button"
                  class="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm"
                  :class="placeTypeIds.includes(place.id)
                    ? 'border-teal-500 bg-teal-500/10 text-white'
                    : 'border-gray-800 text-gray-300 hover:border-gray-700'"
                  :aria-pressed="placeTypeIds.includes(place.id)"
                  @click="togglePlaceType(place.id)"
                >
                  <span>{{ es ? place.es : place.en }}</span>
                  <span v-if="placeTypeIds.includes(place.id)" class="text-teal-300 shrink-0" aria-hidden="true">✓</span>
                </button>
              </div>
            </div>
          </div>

          <!-- 4 Setup -->
          <div v-else-if="step === 4" class="mt-4 space-y-3">
            <div>
              <p class="text-sm font-medium text-white">{{ es ? '¿Cuál es el enfoque?' : "What's the focus today?" }}</p>
              <p class="text-xs text-gray-500">{{ es ? 'Elige el tipo de sesión' : 'Choose the session type' }}</p>
            </div>
            <div class="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                class="rounded-xl border p-4 text-left"
                :class="setup === 'performance'
                  ? 'border-teal-500 bg-teal-500/10'
                  : 'border-gray-800 hover:border-gray-700'"
                @click="setup = 'performance'"
              >
                <p class="text-sm font-semibold text-white">{{ es ? 'Sesión de performance' : 'Performance sessions' }}</p>
                <p class="text-xs text-gray-400 mt-1">
                  {{ es ? 'Intentos, aterrizajes y seguimiento detallado.' : 'Focus on attempts, lands, detailed tracking.' }}
                </p>
              </button>
              <button
                type="button"
                class="rounded-xl border p-4 text-left"
                :class="setup === 'learning'
                  ? 'border-teal-500 bg-teal-500/10'
                  : 'border-gray-800 hover:border-gray-700'"
                @click="setup = 'learning'"
              >
                <p class="text-sm font-semibold text-white">{{ es ? 'Sesión de aprendizaje' : 'Learning sessions' }}</p>
                <p class="text-xs text-gray-400 mt-1">
                  {{ es ? 'Exploración y dominio, resultados simples.' : 'Focus on exploration, mastery states, simple outcomes.' }}
                </p>
              </button>
            </div>
          </div>

          <!-- 5 Tricks -->
          <div v-else-if="step === 5" class="mt-4 space-y-3">
            <div>
              <p class="text-sm font-medium text-white">{{ es ? 'Trucos de la sesión' : 'Session skills' }}</p>
              <p class="text-xs text-gray-500">
                {{ es
                  ? 'Filtrados por el programa, el lugar y el enfoque. Puedes ver toda la biblioteca.'
                  : 'Filtered by program, spot, and focus. You can open the whole library.' }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <input
                v-model="trickQuery"
                type="search"
                class="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm outline-none focus:border-teal-500"
                :placeholder="es ? 'Buscar truco' : 'Search trick'"
              />
              <label class="flex items-center gap-1.5 text-xs text-gray-400 shrink-0">
                <input v-model="trickLibraryWide" type="checkbox" class="rounded border-gray-600 text-teal-500" />
                {{ es ? 'Toda' : 'All' }}
              </label>
            </div>
            <p class="text-[11px] text-gray-500">
              {{ trickIds.length }} {{ es ? 'seleccionados' : 'selected' }}
              · {{ visibleTricks.length }} {{ es ? 'en la lista' : 'in the list' }}
            </p>
            <p v-if="visibleTricks.length === 0" class="text-sm text-gray-500">
              {{ es ? 'Nada con este filtro. Activa Toda.' : 'Nothing matches. Turn on All.' }}
            </p>
            <ul class="max-h-80 overflow-y-auto space-y-1.5">
              <li v-for="skill in visibleTricks" :key="skill.id">
                <button
                  type="button"
                  class="w-full flex items-center gap-3 rounded-xl border px-3 py-2 text-left"
                  :class="trickIds.includes(skill.id)
                    ? 'border-teal-500 bg-teal-500/10'
                    : 'border-gray-800 hover:border-gray-700'"
                  @click="toggleTrick(skill.id)"
                >
                  <span
                    class="h-4 w-4 rounded border flex items-center justify-center text-[10px] shrink-0"
                    :class="trickIds.includes(skill.id) ? 'border-teal-400 bg-teal-500 text-black' : 'border-gray-600'"
                  >
                    {{ trickIds.includes(skill.id) ? '✓' : '' }}
                  </span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm text-white truncate">{{ trickLabel(skill) }}</span>
                    <span class="block text-[11px] text-gray-500 truncate">
                      {{ [trickManualLabel(skill), skill.area, skill.trick_type].filter(Boolean).join(' · ') }}
                    </span>
                  </span>
                </button>
              </li>
            </ul>
          </div>

          <!-- 6 Timer -->
          <div v-else class="mt-4 space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-white">{{ es ? 'Tiempo de la sesión' : 'Session timer' }}</p>
                <p class="text-xs text-gray-500">
                  {{ es
                    ? 'Siempre inicia con calentamiento y cierra con estiramiento.'
                    : 'Always opens with a warm-up and closes with a stretch.' }}
                </p>
              </div>
              <p class="text-xs text-gray-400 shrink-0">{{ es ? 'Total' : 'Total' }}: {{ totalLabel }}</p>
            </div>

            <div class="flex flex-wrap gap-2" role="group" :aria-label="es ? 'Duración de la sesión' : 'Session length'">
              <button
                v-for="len in SESSION_LENGTHS"
                :key="len"
                type="button"
                class="px-3.5 py-1.5 rounded-full border text-sm font-semibold transition-colors"
                :class="activeSessionLength === len
                  ? 'border-teal-500 bg-teal-500/15 text-white'
                  : 'border-gray-700 text-gray-300 hover:border-gray-500'"
                :aria-pressed="activeSessionLength === len"
                @click="applySessionLength(len)"
              >
                {{ len === 120 ? '2 h' : `${len} min` }}
                <span v-if="len === DEFAULT_SESSION_LENGTH" class="text-[10px] text-gray-400 font-normal ml-1">
                  {{ es ? 'estándar' : 'standard' }}
                </span>
              </button>
              <span
                v-if="activeSessionLength === null"
                class="px-3.5 py-1.5 rounded-full border border-amber-500/50 text-amber-300 text-sm font-semibold"
              >
                {{ es ? 'Personalizada' : 'Custom' }}
              </span>
            </div>

            <div class="flex h-2 rounded-full overflow-hidden gap-0.5" aria-hidden="true">
              <span
                v-for="seg in segments"
                :key="'bar-' + seg.id"
                class="h-full"
                :class="isFixedSegment(seg.id) ? 'bg-gray-500' : 'bg-teal-500'"
                :style="{ flexGrow: seg.minutes }"
              />
            </div>

            <ol class="space-y-2">
              <li
                v-for="(seg, index) in segments"
                :key="seg.id"
                class="flex items-center gap-3 rounded-xl border border-gray-800 px-3 py-2.5"
              >
                <span class="w-6 h-6 rounded-full bg-gray-800 text-[11px] font-bold text-gray-300 flex items-center justify-center shrink-0">
                  {{ index + 1 }}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-white truncate">{{ segmentLabel(seg.id) }}</p>
                  <p v-if="isFixedSegment(seg.id)" class="text-[11px] text-gray-500">
                    {{ es ? 'Fijo' : 'Fixed' }}
                  </p>
                </div>
                <button
                  v-if="!isFixedSegment(seg.id)"
                  type="button"
                  class="h-8 w-8 rounded-lg border border-gray-700 text-gray-300 hover:text-white disabled:opacity-30"
                  :disabled="seg.minutes <= 0"
                  :aria-label="`${es ? 'Restar 5 min a' : 'Remove 5 min from'} ${segmentLabel(seg.id)}`"
                  @click="bumpMinutes(index, -5)"
                >
                  −
                </button>
                <span v-else class="w-8 shrink-0" aria-hidden="true" />
                <p class="w-16 text-center">
                  <span class="text-lg font-bold text-white tabular-nums">{{ seg.minutes }}</span>
                  <span class="text-[10px] uppercase tracking-wider text-gray-500 ml-1">min</span>
                </p>
                <button
                  v-if="!isFixedSegment(seg.id)"
                  type="button"
                  class="h-8 w-8 rounded-lg border border-gray-700 text-gray-300 hover:text-white"
                  :aria-label="`${es ? 'Sumar 5 min a' : 'Add 5 min to'} ${segmentLabel(seg.id)}`"
                  @click="bumpMinutes(index, 5)"
                >
                  +
                </button>
                <span v-else class="w-8 shrink-0 text-center text-gray-600 text-sm" aria-hidden="true">🔒</span>
              </li>
            </ol>
          </div>

          <div class="mt-5 flex items-center justify-between gap-3">
            <button
              v-if="step > (scheduledSession ? 2 : 1)"
              type="button"
              class="text-sm text-gray-400 hover:text-white"
              @click="prevStep"
            >
              {{ es ? 'Atrás' : 'Back' }}
            </button>
            <span v-else />
            <button
              v-if="step > 1 && step < 6"
              type="button"
              class="px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-40"
              :disabled="!canAdvance"
              @click="nextStep"
            >
              {{ es ? 'Siguiente' : 'Next' }} →
            </button>
            <button
              v-else
              type="button"
              class="px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-40"
              :disabled="!canAdvance"
              @click="startSession"
            >
              {{ es ? 'Iniciar sesión' : 'Start session' }}
            </button>
          </div>
        </section>
      </template>

      <div v-else class="space-y-4">

        <div class="rounded-xl border border-gray-800 bg-gray-900 p-3 flex items-center gap-2 flex-wrap">
          <input
            v-model="skillQuery"
            type="search"
            class="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm outline-none focus:border-teal-500"
            :placeholder="es ? 'Buscar trucos…' : 'Search skills…'"
          />
          <button
            type="button"
            class="px-2 py-1.5 rounded-lg border border-gray-700 text-xs text-gray-300"
            @click="skillLayout = skillLayout === 'list' ? 'grid' : 'list'"
          >
            {{ skillLayout === 'list' ? (es ? 'Lista' : 'List') : (es ? 'Tarjetas' : 'Grid') }}
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold"
            @click="openAddSkill()"
          >
            + {{ es ? 'Agregar truco' : 'Add skill' }}
          </button>
        </div>

        <p class="text-xs text-gray-500">
          {{ sessionSkaters.length }} {{ es ? 'patinadores' : 'athletes' }}
          · {{ trickIds.length }} {{ es ? 'trucos hoy' : 'skills today' }}
        </p>
        <p v-if="attemptError" class="text-xs text-amber-300">{{ attemptError }}</p>

        <div class="space-y-3">
          <article
            v-for="s in sessionSkaters"
            :key="s.id"
            class="rounded-xl border border-gray-800 bg-gray-900 p-4"
          >
            <div class="flex items-center gap-3">
              <span class="w-9 h-9 rounded-lg bg-gray-800 text-sm font-semibold text-white flex items-center justify-center">
                {{ (s.full_name || '?').slice(0, 1).toUpperCase() }}
              </span>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-white truncate">{{ s.full_name }}</p>
                <span
                  v-if="programNameFor(s)"
                  class="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300"
                >
                  {{ programNameFor(s) }}
                </span>
              </div>
            </div>

            <div v-if="skillsForAthlete(s.id).length === 0" class="py-8 text-center">
              <p class="text-sm text-gray-400">
                {{ es ? 'Sin trucos para este patinador.' : 'No skills selected for this athlete.' }}
              </p>
              <p class="text-xs text-gray-600 mt-1">
                {{ es ? 'Usa Agregar truco durante la sesión.' : 'Use Add skill to add skills during the session.' }}
              </p>
            </div>
            <ul
              v-else
              class="mt-3"
              :class="skillLayout === 'grid' ? 'grid sm:grid-cols-2 gap-2' : 'space-y-1.5'"
            >
              <li
                v-for="skill in skillsForAthlete(s.id).filter(t => !skillQuery || trickLabel(t).toLowerCase().includes(skillQuery.trim().toLowerCase()))"
                :key="skill.id"
                class="flex flex-wrap items-center gap-2 rounded-lg border border-gray-800 px-3 py-2"
              >
                <span class="min-w-0 flex-1 text-sm text-white truncate">{{ trickLabel(skill) }}</span>
                <div class="flex flex-wrap items-center gap-1.5">
                  <div
                    class="inline-flex h-7 items-center rounded-full border text-[11px]"
                    :class="attemptFor(s.id, skill.id).misses ? 'border-red-500/50 text-red-200' : 'border-white/15 text-gray-300'"
                  >
                    <span class="px-2">{{ es ? 'Fallo' : 'Miss' }}</span>
                    <button
                      type="button"
                      class="h-7 w-6 text-sm disabled:opacity-30"
                      :disabled="!attemptFor(s.id, skill.id).misses"
                      :aria-label="es ? 'Quitar un fallo' : 'Remove a miss'"
                      @click="adjustAttempt(s.id, skill.id, 'misses', -1)"
                    >−</button>
                    <span class="min-w-[1rem] text-center tabular-nums">{{ attemptFor(s.id, skill.id).misses }}</span>
                    <button
                      type="button"
                      class="h-7 w-6 text-sm"
                      :aria-label="es ? 'Sumar un fallo' : 'Add a miss'"
                      @click="adjustAttempt(s.id, skill.id, 'misses', 1)"
                    >+</button>
                  </div>
                  <div
                    class="inline-flex h-7 items-center rounded-full border text-[11px]"
                    :class="attemptFor(s.id, skill.id).lands ? 'border-acid text-acid' : 'border-white/15 text-gray-300'"
                  >
                    <span class="px-2">{{ es ? 'Aterrizaje' : 'Land' }}</span>
                    <button
                      type="button"
                      class="h-7 w-6 text-sm disabled:opacity-30"
                      :disabled="!attemptFor(s.id, skill.id).lands"
                      :aria-label="es ? 'Quitar un aterrizaje' : 'Remove a land'"
                      @click="adjustAttempt(s.id, skill.id, 'lands', -1)"
                    >−</button>
                    <span class="min-w-[1rem] text-center tabular-nums">{{ attemptFor(s.id, skill.id).lands }}</span>
                    <button
                      type="button"
                      class="h-7 w-6 text-sm"
                      :aria-label="es ? 'Sumar un aterrizaje' : 'Add a land'"
                      @click="adjustAttempt(s.id, skill.id, 'lands', 1)"
                    >+</button>
                  </div>
                  <button
                    type="button"
                    class="inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold"
                    :class="attemptFor(s.id, skill.id).mastered ? 'border-acid bg-acid text-charcoal' : 'border-white/15 text-gray-300'"
                    @click="adjustAttempt(s.id, skill.id, 'mastered')"
                  >
                    {{ es ? 'Dominado' : 'Mastered' }}
                  </button>
                  <button type="button" class="text-gray-500 hover:text-white text-xs" @click="removeAthleteSkill(s.id, skill.id)">
                    {{ es ? 'Quitar' : 'Remove' }}
                  </button>
                </div>
              </li>
            </ul>
          </article>
        </div>

        <section class="space-y-2">
          <div class="flex items-center justify-between gap-2">
            <h2 class="text-sm font-semibold text-white">{{ es ? 'Videos' : 'Videos' }} ({{ videos.length }})</h2>
            <div class="flex items-center gap-2">
              <NuxtLink to="/member/staff/videos" class="px-3 py-1.5 rounded-lg border border-gray-600 text-xs font-semibold text-white">
                {{ es ? 'Abrir biblioteca' : 'Open library' }}
              </NuxtLink>
            <label class="px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold cursor-pointer">
              {{ uploadingVideo ? (es ? 'Subiendo…' : 'Uploading…') : (es ? 'Subir video' : 'Upload video') }}
              <input type="file" accept="video/*" class="hidden" :disabled="uploadingVideo" @change="onVideoPicked" />
            </label>
            </div>
          </div>
          <p v-if="videoError" class="text-xs text-amber-300">{{ videoError }}</p>
          <div v-if="videos.length === 0" class="rounded-xl border border-gray-800 bg-gray-900 py-10 text-center">
            <p class="text-sm font-semibold text-white">{{ es ? 'Aún no hay videos' : 'No videos yet' }}</p>
            <p class="text-xs text-gray-500 mt-1">
              {{ es ? 'Los videos de esta sesión aparecen aquí.' : 'Videos recorded during this session will appear here.' }}
            </p>
          </div>
          <ul v-else class="space-y-2">
            <li v-for="video in videos" :key="video.id" class="rounded-xl border border-gray-800 bg-gray-900 p-3">
              <p class="text-sm text-white mb-2">{{ video.name }}</p>
              <video :src="video.url" controls class="w-full rounded-lg max-h-64 bg-black" />
            </li>
          </ul>
        </section>
      </div>

      <Teleport to="body">
        <div
          v-if="sessionAlertOpen"
          class="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
        >
          <div class="bg-gray-900 border border-teal-500/40 rounded-2xl w-full max-w-sm p-5 text-center space-y-3">
            <p class="text-lg font-bold text-white">
              {{ es ? 'La sesión terminó' : 'The session ended' }}
            </p>
            <p class="text-sm text-gray-400">
              {{ sessionTitle }} · {{ formatClock(elapsed) }}
            </p>
            <button
              type="button"
              class="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold"
              @click="sessionAlertOpen = false"
            >
              {{ es ? 'Entendido' : 'OK' }}
            </button>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="addSkillOpen"
          class="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-3"
          @click.self="addSkillOpen = false"
        >
          <div class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div class="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 class="text-sm font-semibold text-white">{{ es ? 'Agregar truco' : 'Add skill' }}</h3>
              <button type="button" class="text-gray-500 hover:text-white" @click="addSkillOpen = false">×</button>
            </div>
            <div class="px-4 py-3 space-y-3 overflow-y-auto">
              <input
                v-model="addSkillQuery"
                type="search"
                class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm outline-none focus:border-teal-500"
                :placeholder="es ? 'Buscar en la biblioteca' : 'Search the library'"
              />
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="s in sessionSkaters"
                  :key="s.id"
                  type="button"
                  class="px-2 py-1 rounded-full text-[11px] border"
                  :class="addSkillAthleteIds.includes(s.id) ? 'border-teal-500 text-teal-200' : 'border-gray-700 text-gray-500'"
                  @click="toggleAddSkillAthlete(s.id)"
                >
                  {{ s.full_name }}
                </button>
              </div>
              <ul class="space-y-1">
                <li v-for="skill in addSkillChoices" :key="skill.id">
                  <button
                    type="button"
                    class="w-full text-left px-3 py-2 rounded-lg border text-sm"
                    :class="addSkillIds.includes(skill.id) ? 'border-teal-500 bg-teal-500/10 text-white' : 'border-gray-800 text-gray-300'"
                    @click="toggleAddSkill(skill.id)"
                  >
                    {{ trickLabel(skill) }}
                  </button>
                </li>
              </ul>
            </div>
            <div class="px-4 py-3 border-t border-gray-800 flex justify-end">
              <button
                type="button"
                class="px-4 py-2 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-40"
                :disabled="addSkillIds.length === 0"
                @click="confirmAddSkills"
              >
                {{ es ? 'Agregar' : 'Add' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="manageAthletesOpen"
          class="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-3"
          @click.self="manageAthletesOpen = false"
        >
          <div class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-4 space-y-2">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-semibold text-white">{{ es ? 'Patinadores de la sesión' : 'Session athletes' }}</h3>
              <button type="button" class="text-gray-500 hover:text-white" @click="manageAthletesOpen = false">×</button>
            </div>
            <button
              v-for="s in skaters"
              :key="s.id"
              type="button"
              class="w-full text-left px-3 py-2 rounded-lg border text-sm"
              :class="skaterIds.includes(s.id) ? 'border-teal-500 bg-teal-500/10 text-white' : 'border-gray-800 text-gray-400'"
              @click="toggleSkater(s.id)"
            >
              {{ s.full_name }}
            </button>
          </div>
        </div>
      </Teleport>
    </div>
    </template>
  </div>
</template>
