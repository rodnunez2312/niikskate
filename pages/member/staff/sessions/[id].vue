<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { es as esLocale } from 'date-fns/locale'
import { TIME_SLOT_LABELS, type TimeSlot } from '~/types'
import { fetchCoachDirectoryProfiles } from '~/composables/coachDirectory'
import { coachPillClass, withCoachLabels } from '~/utils/coachInitials'

definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

type CalendarEvent = {
  id: string
  title: string
  event_type: string
  start_date: string
  start_time: string | null
  end_time: string | null
  time_slot: TimeSlot | null
  skatepark: string | null
  location: string | null
  session_outcome: string | null
  cancelled_at: string | null
  cancellation_reason?: string | null
}

type VideoRow = {
  id: string
  title: string
  public_url: string
  owner_id?: string | null
  owner_name: string
  owner_initials: string
}

const route = useRoute()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()
const es = computed(() => language.value === 'es')
const eventId = computed(() => String(route.params.id || ''))

const loading = ref(true)
const missing = ref(false)
const event = ref<CalendarEvent | null>(null)
const athleteCount = ref(0)
const athleteNames = ref<string[]>([])
type AthleteRow = { id: string; name: string; kind: 'profile' | 'crew' }
const athletes = ref<AthleteRow[]>([])
type NamedRow = { id: string; name: string }
const trickItems = ref<NamedRow[]>([])
const focusSetup = ref<'' | 'performance' | 'learning'>('')
const planCoachId = ref('')
const planSlot = ref('')
const planNotes = ref<Record<string, unknown>>({})
const skaterPickerOpen = ref(false)
const skaterOptions = ref<NamedRow[]>([])
const skaterQuery = ref('')
const trickPickerOpen = ref(false)
const trickOptions = ref<NamedRow[]>([])
const trickQuery = ref('')
const focusPickerOpen = ref(false)
const editError = ref('')
const editingRoster = ref(false)
const assignedCoaches = ref<{ id: string; name: string }[]>([])
const coachNames = computed(() => assignedCoaches.value.map(coach => coach.name))
const coachPickerOpen = ref(false)
const coachOptions = ref<{ id: string; name: string }[]>([])
const coachAssignError = ref('')
const assigningCoach = ref(false)
const availableCoaches = computed(() =>
  coachOptions.value.filter(coach => !assignedCoaches.value.some(assigned => assigned.id === coach.id)),
)
const focusLabel = ref('')
const trickNames = ref<string[]>([])
const timeBlocks = ref('')
const videos = ref<VideoRow[]>([])
const marking = ref(false)
const markError = ref('')
const cancelOpen = ref(false)
const cancelReason = ref('')
const cancelReasonOther = ref('')
const notes = ref('')
const savedNotes = ref('')
const editingNotes = ref(false)
const savingNotes = ref(false)
const noteError = ref('')
const metrics = ref({ missed: 0, lands: 0, skills: 0 })

const today = format(new Date(), 'yyyy-MM-dd')

const cancelled = computed(() => Boolean(event.value?.cancelled_at || event.value?.session_outcome === 'cancelled'))
const complete = computed(() => Boolean(event.value && !cancelled.value && event.value.session_outcome === 'done'))
const canStartSession = computed(() => Boolean(
  event.value && !cancelled.value && !complete.value && event.value.start_date >= today,
))
function startSessionTo() {
  if (!event.value) return '/member/coach/plans'
  const query = new URLSearchParams({ date: event.value.start_date, event: event.value.id })
  if (event.value.time_slot) query.set('slot', event.value.time_slot)
  return `/member/coach/plans?${query}`
}
const upcoming = computed(() => Boolean(event.value && event.value.start_date > today))

const REASON_LABELS: Record<string, { es: string; en: string }> = {
  clima: { es: 'clima', en: 'weather' },
  weather: { es: 'clima', en: 'weather' },
  asistencia: { es: 'asistencia', en: 'attendance' },
  attendance: { es: 'asistencia', en: 'attendance' },
  coach: { es: 'coach', en: 'coach' },
}

function reasonLabel(raw: string | null | undefined) {
  const text = (raw || '').trim()
  if (!text) return ''
  const known = REASON_LABELS[text.toLowerCase()]
  if (known) return es.value ? known.es : known.en
  return text
}

const cancelReasonText = computed(() => reasonLabel(event.value?.cancellation_reason))

const heading = computed(() => {
  if (cancelled.value) {
    const reason = cancelReasonText.value
    return reason
      ? (es.value ? `Sesión cancelada por ${reason}` : `Session cancelled for ${reason}`)
      : (es.value ? 'Sesión cancelada' : 'Session cancelled')
  }
  if (complete.value) return es.value ? 'Sesión completa' : 'Session complete'
  if (upcoming.value) return es.value ? 'Sesión próxima' : 'Upcoming session'
  return es.value ? 'Sesión programada' : 'Scheduled session'
})

const statusTone = computed(() => {
  if (cancelled.value) return { color: '#9A9A9A', glow: 'rgba(154,154,154,0.45)' }
  if (complete.value) return { color: '#A3FF12', glow: 'rgba(163,255,18,0.28)' }
  if (upcoming.value) return { color: '#4C9AFF', glow: 'rgba(76,154,255,0.32)' }
  if (event.value && event.value.start_date < today) return { color: '#FFB547', glow: 'rgba(255,181,71,0.32)' }
  return { color: '#A3FF12', glow: 'rgba(163,255,18,0.28)' }
})

const typeLabel = computed(() => {
  const type = event.value?.event_type
  const labels: Record<string, { es: string; en: string }> = {
    class_session: { es: 'Clase grupal', en: 'Group class' },
    class_individual: { es: 'Clase individual', en: 'Private class' },
    practice: { es: 'Práctica', en: 'Practice' },
  }
  const hit = type ? labels[type] : undefined
  return hit ? (es.value ? hit.es : hit.en) : (es.value ? 'Sesión' : 'Session')
})

const place = computed(() => event.value?.skatepark || event.value?.location || (es.value ? 'Sin lugar' : 'No location'))

const durationLabel = computed(() => {
  const start = event.value?.start_time?.slice(0, 5)
  const end = event.value?.end_time?.slice(0, 5)
    || (event.value?.time_slot ? TIME_SLOT_LABELS[event.value.time_slot]?.end : '')
  const startFallback = start || (event.value?.time_slot ? TIME_SLOT_LABELS[event.value.time_slot]?.start : '')
  if (!startFallback || !end) return es.value ? 'Sin hora' : 'No time'
  const [sh, sm] = startFallback.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let mins = (eh * 60 + em) - (sh * 60 + sm)
  if (mins <= 0) mins += 24 * 60
  const hours = Math.floor(mins / 60)
  const rest = mins % 60
  return `${hours}h ${rest}m`
})

function clock12(hhmm: string | undefined | null) {
  if (!hhmm) return ''
  const [h, m] = hhmm.slice(0, 5).split(':').map(Number)
  if (Number.isNaN(h)) return ''
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

const timeRange = computed(() => {
  const slot = event.value?.time_slot ? TIME_SLOT_LABELS[event.value.time_slot] : undefined
  const start = clock12(event.value?.start_time || slot?.start)
  const end = clock12(event.value?.end_time || slot?.end)
  if (!start) return es.value ? 'Sin hora' : 'No time'
  return end ? `${start} – ${end}` : start
})

const dateLong = computed(() => {
  if (!event.value) return ''
  const date = parseISO(event.value.start_date)
  return es.value ? format(date, "EEE d 'de' MMM", { locale: esLocale }) : format(date, 'EEE, MMM d')
})

/** "Temporada X: Grupal Principiante" → season + program. */
const titleParts = computed(() => {
  const title = event.value?.title || ''
  const at = title.indexOf(':')
  if (at < 0) return { season: '', program: title }
  return { season: title.slice(0, at).trim(), program: title.slice(at + 1).trim() }
})

const readiness = computed(() => [
  { id: 'athletes', label: es.value ? 'Inscritos' : 'Enrolled', done: athleteCount.value > 0 },
  { id: 'coach', label: 'Coach', done: coachNames.value.length > 0 },
  { id: 'focus', label: es.value ? 'Enfoque' : 'Focus', done: Boolean(focusLabel.value) },
  { id: 'skills', label: es.value ? 'Trucos' : 'Skills', done: trickNames.value.length > 0 },
])
const readyCount = computed(() => readiness.value.filter(item => item.done).length)

const executiveSummary = computed(() => {
  if (!event.value) return ''
  const isEs = es.value
  const who = athleteCount.value
    ? (isEs ? `${athleteCount.value} patinador${athleteCount.value === 1 ? '' : 'es'}` : `${athleteCount.value} skater${athleteCount.value === 1 ? '' : 's'}`)
    : (isEs ? 'sin inscritos' : 'no one enrolled')
  const coach = coachNames.value.length
    ? (isEs ? `con ${coachNames.value.join(' y ')}` : `with ${coachNames.value.join(' & ')}`)
    : (isEs ? 'sin coach asignado' : 'no coach assigned')
  const missing = readiness.value.filter(item => !item.done).map(item => item.label.toLowerCase())
  const pending = missing.length
    ? (isEs ? ` Pendiente: ${missing.join(', ')}.` : ` Pending: ${missing.join(', ')}.`)
    : (isEs ? ' Todo listo.' : ' All set.')
  return `${typeLabel.value} · ${durationLabel.value} · ${who}, ${coach}.${pending}`
})

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('')
}

const successRate = computed(() => {
  const attempts = metrics.value.lands + metrics.value.missed
  if (!attempts) return '0%'
  return `${Math.round((metrics.value.lands / attempts) * 100)}%`
})

const statCards = computed(() => [
  { label: es.value ? 'Fallos' : 'Total Missed', value: String(metrics.value.missed) },
  { label: es.value ? 'Aterrizajes' : 'Successful Lands', value: String(metrics.value.lands) },
  { label: es.value ? 'Tasa de éxito' : 'Success Rate', value: successRate.value },
  { label: es.value ? 'Trucos dominados' : 'Skills Mastered', value: String(metrics.value.skills) },
])

async function load() {
  loading.value = true
  missing.value = false
  const { data, error } = await client
    .from('school_calendar_events')
    .select('id, title, event_type, start_date, start_time, end_time, time_slot, skatepark, location, session_outcome, cancelled_at, cancellation_reason')
    .eq('id', eventId.value)
    .maybeSingle()
  if (error || !data) {
    missing.value = true
    loading.value = false
    return
  }
  event.value = data as CalendarEvent

  const { data: seats } = await client
    .from('class_session_enrollments')
    .select('user_id, skater_profile_id, crew_member_id')
    .eq('calendar_event_id', eventId.value)
    .neq('status', 'cancelled')
  const profileIds = [...new Set((seats || []).flatMap(row => [row.skater_profile_id, row.user_id]).filter(Boolean))] as string[]
  const crewIds = [...new Set((seats || []).map(row => row.crew_member_id).filter(Boolean))] as string[]
  const roster: AthleteRow[] = []
  const seen = new Set<string>()
  const rememberAthlete = (row: AthleteRow) => {
    if (!row.name || seen.has(`${row.kind}:${row.id}`)) return
    seen.add(`${row.kind}:${row.id}`)
    roster.push(row)
  }
  if (profileIds.length) {
    const { data: people } = await client.from('profiles').select('id, full_name').in('id', profileIds)
    for (const person of people || []) if (person.full_name) rememberAthlete({ id: person.id, name: person.full_name, kind: 'profile' })
  }
  if (crewIds.length) {
    const { data: crew } = await client.from('crew_members').select('id, full_name, first_name, last_name').in('id', crewIds)
    for (const member of crew || []) {
      const name = member.full_name || [member.first_name, member.last_name].filter(Boolean).join(' ')
      if (name) rememberAthlete({ id: member.id, name, kind: 'crew' })
    }
  }

  const { data: coachSeats } = await client
    .from('class_session_coaches')
    .select('coach_id')
    .eq('calendar_event_id', eventId.value)
  const coachIds = [...new Set((coachSeats || []).map(row => row.coach_id).filter(Boolean))]
  const staff: { id: string; name: string }[] = []
  if (coachIds.length) {
    const { data: assigned } = await client
      .from('profiles')
      .select('id, full_name, role')
      .in('id', coachIds)
    for (const person of assigned || []) {
      if (!person.full_name) continue
      if (person.role === 'coach' || person.role === 'admin') staff.push({ id: person.id, name: person.full_name })
      else rememberAthlete({ id: person.id, name: person.full_name, kind: 'profile' })
    }
  }
  assignedCoaches.value = staff

  focusLabel.value = ''
  focusSetup.value = ''
  trickNames.value = []
  trickItems.value = []
  timeBlocks.value = ''
  planNotes.value = {}
  planCoachId.value = ''
  planSlot.value = data.time_slot || ''
  const { data: plans } = await client
    .from('class_plans')
    .select('coach_id, notes, planned_skills, warmup_notes, main_activity_notes, cooldown_notes, time_slot')
    .eq('plan_date', data.start_date)
  const plan = (plans || []).find(row => row.time_slot === data.time_slot) || plans?.[0]
  if (plan) {
    planCoachId.value = plan.coach_id || ''
    planSlot.value = plan.time_slot || planSlot.value
    let parsed: Record<string, unknown> = {}
    try { parsed = JSON.parse(plan.notes || '{}') } catch { parsed = {} }
    planNotes.value = parsed
    focusSetup.value = parsed.setup === 'learning' || parsed.setup === 'performance' ? parsed.setup : ''
    const setup = focusSetup.value === 'learning' ? (es.value ? 'Aprendizaje' : 'Learning') : focusSetup.value === 'performance' ? 'Performance' : ''
    const placeLabel = typeof parsed.place_label === 'string' ? parsed.place_label : ''
    focusLabel.value = [setup, placeLabel].filter(Boolean).join(' · ')
    const plannedSkaterIds = Array.isArray(parsed.skater_ids)
      ? parsed.skater_ids.filter((id: unknown): id is string => typeof id === 'string')
      : []
    if (plannedSkaterIds.length) {
      const { data: planned } = await client.from('profiles').select('id, full_name').in('id', plannedSkaterIds)
      for (const person of planned || []) if (person.full_name) rememberAthlete({ id: person.id, name: person.full_name, kind: 'profile' })
    }
    const skillIds = Array.isArray(plan.planned_skills) ? plan.planned_skills.filter((id: unknown) => typeof id === 'string') : []
    if (skillIds.length) {
      const { data: skills } = await client.from('skills_library').select('id, name, name_es').in('id', skillIds)
      trickItems.value = (skills || []).map(skill => ({
        id: skill.id,
        name: (es.value ? skill.name_es || skill.name : skill.name) || skill.name,
      })).filter(skill => skill.name)
      trickNames.value = trickItems.value.map(skill => skill.name)
    }
    timeBlocks.value = [plan.warmup_notes, plan.main_activity_notes, plan.cooldown_notes].filter(Boolean).join(' · ')
  }

  athletes.value = roster.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  athleteNames.value = athletes.value.map(row => row.name)
  athleteCount.value = athletes.value.length

  const { data: report } = await client
    .from('session_reports')
    .select('coach_notes, total_missed, successful_lands, skills_mastered')
    .eq('calendar_event_id', eventId.value)
    .maybeSingle()
  notes.value = report?.coach_notes || ''
  savedNotes.value = notes.value
  metrics.value = {
    missed: report?.total_missed || 0,
    lands: report?.successful_lands || 0,
    skills: report?.skills_mastered || 0,
  }

  const { data: videoRows } = await client
    .from('session_videos')
    .select('id, title, public_url, owner_id')
    .eq('calendar_event_id', eventId.value)
    .order('created_at', { ascending: false })
  videos.value = await withCoachLabels(client, (videoRows || []) as Array<{ id: string; title: string; public_url: string; owner_id?: string | null }>)
  loading.value = false
}

async function saveNotes() {
  if (!user.value) return
  savingNotes.value = true
  noteError.value = ''
  const { error } = await client.from('session_reports').upsert({
    calendar_event_id: eventId.value,
    coach_notes: notes.value.trim(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'calendar_event_id' })
  savingNotes.value = false
  if (error) {
    noteError.value = /session_reports|schema cache|does not exist/i.test(error.message)
      ? (es.value
        ? 'Falta la tabla. Ejecuta supabase/migrations/add_session_videos.sql.'
        : 'Missing table. Run supabase/migrations/add_session_videos.sql.')
      : error.message
    return
  }
  savedNotes.value = notes.value.trim()
  notes.value = savedNotes.value
  editingNotes.value = false
}

const cancelReasons = [
  { id: 'clima', es: 'Clima', en: 'Weather' },
  { id: 'asistencia', es: 'Asistencia', en: 'Attendance' },
  { id: 'coach', es: 'Coach', en: 'Coach' },
  { id: 'other', es: 'Otro', en: 'Other' },
]

function openCancel() {
  cancelOpen.value = true
  cancelReason.value = ''
  cancelReasonOther.value = ''
  markError.value = ''
}

async function markSession(outcome: 'done' | 'open' | 'cancelled') {
  marking.value = true
  markError.value = ''
  const reason = cancelReason.value === 'other'
    ? cancelReasonOther.value.trim()
    : (cancelReasons.find(item => item.id === cancelReason.value)?.[es.value ? 'es' : 'en'] || cancelReason.value)
  if (outcome === 'cancelled' && !reason) {
    markError.value = es.value ? 'Escribe el motivo.' : 'Write the reason.'
    marking.value = false
    return
  }
  try {
    const { data: session } = await client.auth.getSession()
    const token = session.session?.access_token
    if (!token) throw new Error(es.value ? 'Sesión expirada.' : 'Session expired.')
    await $fetch('/api/classes/session-status', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        eventId: eventId.value,
        outcome,
        reason: outcome === 'cancelled' ? reason : undefined,
      },
    })
    cancelOpen.value = false
    await load()
  } catch (e: any) {
    markError.value = e?.data?.message || e?.message || (es.value ? 'No se pudo actualizar.' : 'Could not update.')
  } finally {
    marking.value = false
  }
}

async function toggleCoachPicker() {
  coachAssignError.value = ''
  coachPickerOpen.value = !coachPickerOpen.value
  if (!coachPickerOpen.value || coachOptions.value.length) return
  try {
    const rows = await fetchCoachDirectoryProfiles<{ id: string; full_name: string | null }>(client, {
      select: 'id, full_name',
      activeOnly: true,
    })
    coachOptions.value = rows.map(row => ({
      id: row.id,
      name: (row.full_name || '').trim() || 'Coach',
    }))
  } catch (e: any) {
    coachAssignError.value = e?.message || (es.value ? 'No se pudieron cargar los coaches.' : 'Could not load coaches.')
  }
}

async function assignCoach(coachId: string) {
  if (!event.value || assigningCoach.value) return
  assigningCoach.value = true
  coachAssignError.value = ''
  const row = {
    calendar_event_id: event.value.id,
    coach_id: coachId,
    assigned_by: user.value?.id ?? null,
    delivered: event.value.session_outcome === 'done',
  }
  let { error } = await client.from('class_session_coaches').insert(row)
  if (error && /delivered|assigned_by|schema cache|column/i.test(error.message || '')) {
    ;({ error } = await client.from('class_session_coaches').insert({
      calendar_event_id: row.calendar_event_id,
      coach_id: row.coach_id,
    }))
  }
  assigningCoach.value = false
  if (error) {
    coachAssignError.value = error.message
    return
  }
  coachPickerOpen.value = false
  await load()
}

async function removeCoach(coachId: string) {
  if (!event.value) return
  editError.value = ''
  const { error } = await client
    .from('class_session_coaches')
    .delete()
    .eq('calendar_event_id', event.value.id)
    .eq('coach_id', coachId)
  if (error) {
    editError.value = error.message
    return
  }
  await load()
}

async function savePlan(notesPatch: Record<string, unknown>, skillIds?: string[]) {
  if (!user.value || !event.value) return
  const coachId = planCoachId.value || assignedCoaches.value[0]?.id || user.value.id
  const slot = planSlot.value || event.value.time_slot || 'early'
  const notes = { ...planNotes.value, ...notesPatch }
  const planned = skillIds ?? trickItems.value.map(trick => trick.id)
  const payload = {
    planned_skills: planned,
    notes: JSON.stringify(notes),
  }
  const { error } = planCoachId.value
    ? await client.from('class_plans').update(payload)
      .eq('coach_id', planCoachId.value)
      .eq('plan_date', event.value.start_date)
      .eq('time_slot', slot)
    : await client.from('class_plans').upsert({
      ...payload,
      coach_id: coachId,
      plan_date: event.value.start_date,
      time_slot: slot,
      title: event.value.title,
    }, { onConflict: 'coach_id,plan_date,time_slot' })
  if (error) throw error
  planNotes.value = notes
  planCoachId.value = coachId
  planSlot.value = slot
}

const focusChoices = [
  { id: 'performance' as const, es: 'Performance', en: 'Performance' },
  { id: 'learning' as const, es: 'Aprendizaje', en: 'Learning' },
]

async function setFocus(setup: 'performance' | 'learning') {
  editingRoster.value = true
  editError.value = ''
  try {
    await savePlan({ setup })
    focusPickerOpen.value = false
    await load()
  } catch (e: any) {
    editError.value = e?.message || (es.value ? 'No se pudo guardar el enfoque.' : 'Could not save the focus.')
  } finally {
    editingRoster.value = false
  }
}

async function clearFocus() {
  editingRoster.value = true
  editError.value = ''
  try {
    await savePlan({ setup: '', place_label: '' })
    await load()
  } catch (e: any) {
    editError.value = e?.message || (es.value ? 'No se pudo quitar el enfoque.' : 'Could not remove the focus.')
  } finally {
    editingRoster.value = false
  }
}

const filteredSkaters = computed(() => {
  const q = skaterQuery.value.trim().toLowerCase()
  return skaterOptions.value
    .filter(row => !athletes.value.some(athlete => athlete.kind === 'profile' && athlete.id === row.id))
    .filter(row => !q || row.name.toLowerCase().includes(q))
    .slice(0, 12)
})

const filteredTricks = computed(() => {
  const q = trickQuery.value.trim().toLowerCase()
  return trickOptions.value
    .filter(row => !trickItems.value.some(trick => trick.id === row.id))
    .filter(row => !q || row.name.toLowerCase().includes(q))
    .slice(0, 12)
})

async function toggleSkaterPicker() {
  editError.value = ''
  skaterPickerOpen.value = !skaterPickerOpen.value
  if (!skaterPickerOpen.value || skaterOptions.value.length) return
  const { data, error } = await client
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'customer')
    .eq('is_active', true)
    .order('full_name')
  if (error) {
    editError.value = error.message
    return
  }
  skaterOptions.value = (data || []).map(row => ({ id: row.id, name: (row.full_name || '').trim() })).filter(row => row.name)
}

async function addSkater(skaterId: string) {
  if (!event.value || editingRoster.value) return
  editingRoster.value = true
  editError.value = ''
  const row = {
    calendar_event_id: event.value.id,
    user_id: skaterId,
    skater_profile_id: skaterId,
    status: 'confirmed',
  }
  let { error } = await client.from('class_session_enrollments').insert(row)
  if (error && /skater_profile_id|schema cache|column/i.test(error.message || '')) {
    ;({ error } = await client.from('class_session_enrollments').insert({
      calendar_event_id: row.calendar_event_id,
      user_id: row.user_id,
      status: 'confirmed',
    }))
  }
  if (error) {
    editingRoster.value = false
    editError.value = error.message
    return
  }
  const ids = Array.isArray(planNotes.value.skater_ids) ? planNotes.value.skater_ids.filter((id): id is string => typeof id === 'string') : []
  if (!ids.includes(skaterId)) {
    try { await savePlan({ skater_ids: [...ids, skaterId] }) } catch { /* enrollment is already saved */ }
  }
  skaterPickerOpen.value = false
  editingRoster.value = false
  await load()
}

async function removeAthlete(athlete: AthleteRow) {
  if (!event.value) return
  editError.value = ''
  if (athlete.kind === 'crew') {
    await client.from('class_session_enrollments').delete().eq('calendar_event_id', event.value.id).eq('crew_member_id', athlete.id)
  } else {
    await client.from('class_session_enrollments').delete().eq('calendar_event_id', event.value.id).eq('skater_profile_id', athlete.id)
    await client.from('class_session_enrollments').delete().eq('calendar_event_id', event.value.id).eq('user_id', athlete.id).is('skater_profile_id', null).is('crew_member_id', null)
    const ids = Array.isArray(planNotes.value.skater_ids) ? planNotes.value.skater_ids.filter((id): id is string => typeof id === 'string' && id !== athlete.id) : []
    try { await savePlan({ skater_ids: ids }) } catch (e: any) { editError.value = e?.message || '' }
  }
  await load()
}

async function toggleTrickPicker() {
  editError.value = ''
  trickPickerOpen.value = !trickPickerOpen.value
  if (!trickPickerOpen.value || trickOptions.value.length) return
  const { data, error } = await client
    .from('skills_library')
    .select('id, name, name_es')
    .eq('is_active', true)
    .order('name')
  if (error) {
    editError.value = error.message
    return
  }
  trickOptions.value = (data || []).map(row => ({
    id: row.id,
    name: (es.value ? row.name_es || row.name : row.name) || row.name,
  })).filter(row => row.name)
}

async function addTrick(trickId: string) {
  editingRoster.value = true
  editError.value = ''
  try {
    const ids = [...new Set([...trickItems.value.map(trick => trick.id), trickId])]
    await savePlan({}, ids)
    trickPickerOpen.value = false
    await load()
  } catch (e: any) {
    editError.value = e?.message || (es.value ? 'No se pudo agregar el truco.' : 'Could not add the skill.')
  } finally {
    editingRoster.value = false
  }
}

async function removeTrick(trickId: string) {
  editError.value = ''
  try {
    await savePlan({}, trickItems.value.map(trick => trick.id).filter(id => id !== trickId))
    await load()
  } catch (e: any) {
    editError.value = e?.message || (es.value ? 'No se pudo quitar el truco.' : 'Could not remove the skill.')
  }
}

watch(eventId, load)
onMounted(load)
</script>

<template>
  <div class="min-h-full bg-black text-white">
    <div class="border-b border-gray-800 bg-gray-950">
      <div class="max-w-3xl mx-auto px-4 py-4 flex items-start gap-3">
        <NuxtLink
          to="/member/staff/sessions"
          class="mt-1 w-9 h-9 rounded-full border border-gray-700 flex items-center justify-center text-gray-300"
          :aria-label="es ? 'Volver a sesiones' : 'Back to sessions'"
        >
          ‹
        </NuxtLink>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-xl font-bold">{{ heading }}</h1>
          </div>
          <p v-if="event" class="mt-1 text-sm text-gray-400 truncate">{{ place }} — {{ event.title }}</p>
          <div v-if="event" class="mt-3 space-y-3">
            <div class="flex flex-wrap items-center gap-2">
              <NuxtLink
                v-if="canStartSession"
                :to="startSessionTo()"
                class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-acid text-charcoal text-xs font-bold"
              >
                <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {{ es ? 'Iniciar sesión' : 'Start session' }}
              </NuxtLink>
              <button
                v-if="!cancelled && !complete"
                type="button"
                class="px-3 py-1.5 rounded-xl bg-acid text-charcoal text-xs font-bold disabled:opacity-50"
                :disabled="marking"
                @click="markSession('done')"
              >
                {{ marking && !cancelOpen ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Marcar hecha' : 'Mark done') }}
              </button>
              <button
                v-if="!cancelled && !complete"
                type="button"
                class="px-3 py-1.5 rounded-xl border border-gray-700 text-xs font-semibold disabled:opacity-50"
                :disabled="marking"
                @click="openCancel"
              >
                {{ es ? 'Marcar cancelada' : 'Mark cancelled' }}
              </button>
              <button
                v-if="complete || cancelled"
                type="button"
                class="px-3 py-1.5 rounded-xl border border-gray-700 text-xs font-semibold disabled:opacity-50"
                :disabled="marking"
                @click="markSession('open')"
              >
                {{ es ? 'Volver a programada' : 'Mark scheduled again' }}
              </button>
            </div>
            <div v-if="cancelOpen && !cancelled" class="rounded-xl border border-gray-800 bg-gray-900 p-3 max-w-md space-y-2">
              <p class="text-xs font-semibold text-white">{{ es ? 'Motivo de la cancelación' : 'Reason for cancelling' }}</p>
              <div class="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  class="h-7 w-7 rounded-full bg-acid text-charcoal text-sm font-bold disabled:opacity-40"
                  :disabled="marking || !cancelReason || (cancelReason === 'other' && !cancelReasonOther.trim())"
                  :aria-label="es ? 'Confirmar cancelación' : 'Confirm cancellation'"
                  @click="markSession('cancelled')"
                >
                  ✓
                </button>
                <button
                  type="button"
                  class="h-7 w-7 rounded-full bg-red-600 text-white text-sm font-bold"
                  :disabled="marking"
                  :aria-label="es ? 'Descartar' : 'Dismiss'"
                  @click="cancelOpen = false"
                >
                  ×
                </button>
                <button
                  v-for="item in cancelReasons"
                  :key="item.id"
                  type="button"
                  class="px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                  :class="cancelReason === item.id ? 'border-acid bg-acid text-charcoal' : 'border-gray-700 text-gray-300'"
                  @click="cancelReason = item.id"
                >
                  {{ es ? item.es : item.en }}
                </button>
              </div>
              <input
                v-if="cancelReason === 'other'"
                v-model="cancelReasonOther"
                type="text"
                class="w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-white"
                :placeholder="es ? 'Escribe el motivo' : 'Write the reason'"
              >
            </div>
            <p v-if="markError" class="text-xs text-amber-200">{{ markError }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="max-w-3xl mx-auto px-4 py-6 space-y-4">
      <p v-if="loading" class="text-sm text-gray-500">{{ es ? 'Cargando…' : 'Loading…' }}</p>
      <p v-else-if="missing" class="text-sm text-gray-400">
        {{ es ? 'No encontramos esta sesión.' : 'This session was not found.' }}
      </p>

      <template v-else-if="event">
        <section class="relative overflow-hidden rounded-2xl border border-white/10 bg-gray-950">
          <div class="exec-grid pointer-events-none absolute inset-0" aria-hidden="true" />
          <div
            class="pointer-events-none absolute -top-28 -right-20 w-72 h-72 rounded-full blur-3xl"
            :style="{ background: statusTone.glow }"
            aria-hidden="true"
          />

          <div class="relative p-5 sm:p-6 space-y-5">
            <!-- Eyebrow + readiness -->
            <div class="flex items-center justify-between gap-3">
              <p class="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-gray-400">
                <span class="relative flex h-2 w-2" aria-hidden="true">
                  <span
                    v-if="!cancelled"
                    class="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping"
                    :style="{ background: statusTone.color }"
                  />
                  <span class="relative inline-flex h-2 w-2 rounded-full" :style="{ background: statusTone.color }" />
                </span>
                {{ es ? 'Resumen ejecutivo' : 'Executive summary' }}
              </p>
              <p class="font-mono text-[10px] uppercase tracking-[0.2em]" :class="readyCount === readiness.length ? 'text-acid' : 'text-gray-500'">
                {{ es ? 'Prep' : 'Ready' }} {{ readyCount }}/{{ readiness.length }}
              </p>
            </div>

            <!-- Headline -->
            <div>
              <p v-if="titleParts.season" class="font-mono text-[11px] text-sage">{{ titleParts.season }}</p>
              <h2 class="mt-0.5 text-xl sm:text-2xl font-bold tracking-tight text-white">{{ titleParts.program }}</h2>
              <p class="mt-2 text-sm text-gray-400 leading-relaxed">{{ executiveSummary }}</p>
            </div>

            <!-- Readiness meter -->
            <div>
              <div class="grid grid-cols-4 gap-1.5" aria-hidden="true">
                <span
                  v-for="item in readiness"
                  :key="item.id"
                  class="h-1 rounded-full transition-colors"
                  :class="item.done ? 'bg-acid shadow-[0_0_8px_rgba(201,239,66,0.6)]' : 'bg-white/10'"
                />
              </div>
              <ul class="mt-2 grid grid-cols-4 gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                <li v-for="item in readiness" :key="item.id" :class="item.done ? 'text-gray-300' : 'text-gray-600'">
                  {{ item.done ? '✓' : '○' }} {{ item.label }}
                </li>
              </ul>
            </div>

            <!-- Key figures -->
            <dl class="grid grid-cols-2 sm:grid-cols-4 gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10">
              <div class="bg-gray-950/90 px-3 py-3">
                <dt class="font-mono text-[10px] uppercase tracking-wider text-gray-500">{{ es ? 'Fecha' : 'Date' }}</dt>
                <dd class="mt-1 text-sm font-semibold text-white capitalize">{{ dateLong }}</dd>
              </div>
              <div class="bg-gray-950/90 px-3 py-3">
                <dt class="font-mono text-[10px] uppercase tracking-wider text-gray-500">{{ es ? 'Horario' : 'Time' }}</dt>
                <dd class="mt-1 text-sm font-semibold text-white">{{ timeRange }}</dd>
              </div>
              <div class="bg-gray-950/90 px-3 py-3">
                <dt class="font-mono text-[10px] uppercase tracking-wider text-gray-500">{{ es ? 'Patinadores' : 'Skaters' }}</dt>
                <dd class="mt-1 text-sm font-semibold" :class="athleteCount ? 'text-acid' : 'text-gray-500'">{{ athleteCount }}</dd>
              </div>
              <div class="bg-gray-950/90 px-3 py-3 min-w-0">
                <dt class="font-mono text-[10px] uppercase tracking-wider text-gray-500">{{ es ? 'Lugar' : 'Location' }}</dt>
                <dd class="mt-1 text-sm font-semibold text-white truncate" :title="place">{{ place }}</dd>
              </div>
            </dl>

            <!-- Detail rows -->
            <dl class="divide-y divide-white/5 text-sm">
              <div class="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5">
                <dt class="font-mono text-[10px] uppercase tracking-wider text-gray-500 pt-0.5">Coaches</dt>
                <dd class="min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      v-for="coach in assignedCoaches"
                      :key="coach.id"
                      class="group relative inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 pl-0.5 pr-5 py-0.5 text-gray-200"
                    >
                      <span class="flex h-5 w-5 items-center justify-center rounded-full bg-acid text-[9px] font-bold text-charcoal">{{ initials(coach.name) }}</span>
                      {{ coach.name }}
                      <button
                        type="button"
                        class="absolute right-0.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full text-[13px] leading-none text-current opacity-0 transition-opacity hover:bg-white/15 group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-white/40 [@media(hover:none)]:opacity-70"
                        :aria-label="es ? `Quitar ${coach.name}` : `Remove ${coach.name}`"
                        @click="removeCoach(coach.id)"
                      >
                        ×
                      </button>
                    </span>
                    <button
                      v-if="!coachPickerOpen || !availableCoaches.length"
                      type="button"
                      class="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-base leading-none text-white hover:border-acid hover:text-acid"
                      :aria-label="es ? 'Asignar coach' : 'Assign coach'"
                      @click="toggleCoachPicker"
                    >
                      +
                    </button>
                    <button
                      v-for="coach in availableCoaches"
                      v-show="coachPickerOpen"
                      :key="coach.id"
                      type="button"
                      class="inline-flex h-7 items-center rounded-full border border-white/10 px-3 text-xs text-gray-200 hover:border-acid disabled:opacity-50"
                      :disabled="assigningCoach"
                      @click="assignCoach(coach.id)"
                    >
                      {{ coach.name }}
                    </button>
                    <span v-if="coachPickerOpen && !availableCoaches.length" class="text-xs text-gray-500">
                      {{ es ? 'No hay más coaches.' : 'No more coaches.' }}
                    </span>
                  </div>
                  <p v-if="coachAssignError" class="mt-1 text-xs text-amber-200">{{ coachAssignError }}</p>
                </dd>
              </div>
              <div class="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5">
                <dt class="font-mono text-[10px] uppercase tracking-wider text-gray-500 pt-0.5">{{ es ? 'Inscritos' : 'Roster' }}</dt>
                <dd class="min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      v-for="athlete in athletes"
                      :key="`${athlete.kind}:${athlete.id}`"
                      class="group relative inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 pr-5 py-0.5 text-gray-200"
                    >
                      {{ athlete.name }}
                      <button
                        type="button"
                        class="absolute right-0.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full text-[13px] leading-none text-current opacity-0 transition-opacity hover:bg-white/15 group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-white/40 [@media(hover:none)]:opacity-70"
                        :aria-label="es ? `Quitar ${athlete.name}` : `Remove ${athlete.name}`"
                        @click="removeAthlete(athlete)"
                      >
                        ×
                      </button>
                    </span>
                    <button
                      type="button"
                      class="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-base leading-none text-white hover:border-acid hover:text-acid"
                      :aria-label="es ? 'Agregar inscrito' : 'Add skater'"
                      @click="toggleSkaterPicker"
                    >
                      +
                    </button>
                  </div>
                  <div v-if="skaterPickerOpen" class="mt-2 space-y-2">
                    <input
                      v-model="skaterQuery"
                      type="text"
                      class="w-full max-w-xs rounded-lg border border-gray-700 bg-black px-3 py-1.5 text-xs text-white"
                      :placeholder="es ? 'Buscar patinador' : 'Search skater'"
                    >
                    <div class="flex flex-wrap gap-1.5">
                      <button
                        v-for="skater in filteredSkaters"
                        :key="skater.id"
                        type="button"
                        class="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-200 hover:border-acid disabled:opacity-50"
                        :disabled="editingRoster"
                        @click="addSkater(skater.id)"
                      >
                        {{ skater.name }}
                      </button>
                      <span v-if="!filteredSkaters.length" class="text-xs text-gray-500">{{ es ? 'Sin resultados.' : 'No matches.' }}</span>
                    </div>
                  </div>
                </dd>
              </div>
              <div class="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5">
                <dt class="font-mono text-[10px] uppercase tracking-wider text-gray-500 pt-0.5">{{ es ? 'Enfoque' : 'Focus' }}</dt>
                <dd class="min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      v-if="focusLabel && !focusPickerOpen"
                      class="group relative inline-flex h-7 items-center rounded-full border border-white/10 bg-white/5 px-2.5 pr-5 text-gray-200"
                    >
                      {{ focusLabel }}
                      <button
                        type="button"
                        class="absolute right-0.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full text-[13px] leading-none text-current opacity-0 transition-opacity hover:bg-white/15 group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-white/40 [@media(hover:none)]:opacity-70"
                        :aria-label="es ? 'Quitar enfoque' : 'Remove focus'"
                        @click="clearFocus"
                      >
                        ×
                      </button>
                    </span>
                    <button
                      v-if="!focusPickerOpen"
                      type="button"
                      class="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-base leading-none text-white hover:border-acid hover:text-acid"
                      :aria-label="es ? 'Elegir enfoque' : 'Choose focus'"
                      @click="focusPickerOpen = true"
                    >
                      +
                    </button>
                    <button
                      v-for="choice in focusChoices"
                      v-show="focusPickerOpen"
                      :key="choice.id"
                      type="button"
                      class="inline-flex h-7 items-center rounded-full border px-3 text-xs disabled:opacity-50"
                      :class="focusSetup === choice.id ? 'border-acid bg-acid text-charcoal' : 'border-white/10 text-gray-200 hover:border-acid'"
                      :disabled="editingRoster"
                      @click="setFocus(choice.id)"
                    >
                      {{ es ? choice.es : choice.en }}
                    </button>
                  </div>
                </dd>
              </div>
              <div class="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5">
                <dt class="font-mono text-[10px] uppercase tracking-wider text-gray-500 pt-0.5">{{ es ? 'Trucos' : 'Skills' }}</dt>
                <dd class="min-w-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <span
                      v-for="trick in trickItems"
                      :key="trick.id"
                      class="group relative inline-flex items-center rounded-md border border-acid/30 bg-acid/10 px-2 pr-5 py-0.5 text-acid text-xs"
                    >
                      {{ trick.name }}
                      <button
                        type="button"
                        class="absolute right-0.5 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full text-[13px] leading-none text-current opacity-0 transition-opacity hover:bg-white/15 group-hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-white/40 [@media(hover:none)]:opacity-70"
                        :aria-label="es ? `Quitar ${trick.name}` : `Remove ${trick.name}`"
                        @click="removeTrick(trick.id)"
                      >
                        ×
                      </button>
                    </span>
                    <button
                      type="button"
                      class="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 text-base leading-none text-white hover:border-acid hover:text-acid"
                      :aria-label="es ? 'Agregar truco' : 'Add skill'"
                      @click="toggleTrickPicker"
                    >
                      +
                    </button>
                  </div>
                  <div v-if="trickPickerOpen" class="mt-2 space-y-2">
                    <input
                      v-model="trickQuery"
                      type="text"
                      class="w-full max-w-xs rounded-lg border border-gray-700 bg-black px-3 py-1.5 text-xs text-white"
                      :placeholder="es ? 'Buscar truco' : 'Search skill'"
                    >
                    <div class="flex flex-wrap gap-1.5">
                      <button
                        v-for="trick in filteredTricks"
                        :key="trick.id"
                        type="button"
                        class="rounded-full border border-white/10 px-2.5 py-1 text-xs text-gray-200 hover:border-acid disabled:opacity-50"
                        :disabled="editingRoster"
                        @click="addTrick(trick.id)"
                      >
                        {{ trick.name }}
                      </button>
                      <span v-if="!filteredTricks.length" class="text-xs text-gray-500">{{ es ? 'Sin resultados.' : 'No matches.' }}</span>
                    </div>
                  </div>
                </dd>
              </div>
              <p v-if="editError" class="py-2 text-xs text-amber-200">{{ editError }}</p>
              <div v-if="timeBlocks" class="grid grid-cols-[6.5rem_1fr] gap-3 py-2.5">
                <dt class="font-mono text-[10px] uppercase tracking-wider text-gray-500 pt-0.5">{{ es ? 'Bloques' : 'Blocks' }}</dt>
                <dd class="text-gray-300">{{ timeBlocks }}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section class="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <h2 class="font-bold">{{ es ? 'Rendimiento' : 'Advanced Performance' }}</h2>
          <p class="mt-1 text-sm text-gray-500">
            {{ es
              ? 'Métricas de esta sesión. Se quedan en cero hasta que haya intentos registrados.'
              : 'Metrics for this session. They stay at zero until attempts are recorded.' }}
          </p>
          <div class="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div v-for="card in statCards" :key="card.label" class="rounded-xl bg-gray-950 border border-gray-800 px-3 py-4 text-center">
              <p class="text-2xl font-bold">{{ card.value }}</p>
              <p class="mt-1 text-[11px] text-gray-500">{{ card.label }}</p>
            </div>
          </div>
        </section>

        <section class="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <h2 class="font-bold">{{ es ? 'Análisis de rendimiento' : 'Performance Analytics' }}</h2>
          <p class="mt-1 text-sm text-gray-500">
            {{ es
              ? 'Razones de intento, consistencia y tendencia de esta sesión.'
              : 'Attempt ratios, consistency, and trends for this session.' }}
          </p>
        </section>

        <section class="rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <h2 class="font-bold">{{ es ? 'Notas del coach' : 'Coach Notes' }}</h2>
              <p class="mt-1 text-sm text-gray-500">
                {{ es ? 'Notas de esta sesión, visibles para el equipo.' : 'Notes about this session, visible to the team.' }}
              </p>
            </div>
            <button
              v-if="!editingNotes"
              type="button"
              class="shrink-0 px-3 py-1.5 rounded-xl border border-gray-700 text-xs font-semibold"
              @click="editingNotes = true"
            >
              {{ es ? 'Añadir notas' : 'Add Notes' }}
            </button>
          </div>
          <textarea
            v-if="editingNotes"
            v-model="notes"
            rows="4"
            class="mt-4 w-full rounded-xl bg-gray-950 border border-gray-700 px-3 py-2 text-sm"
            :placeholder="es ? 'Escribe lo que pasó en la sesión.' : 'Write what happened in this session.'"
          />
          <p v-else class="mt-4 rounded-xl bg-gray-950 border border-gray-800 px-3 py-3 text-sm text-gray-400">
            {{ savedNotes || (es
              ? 'Aún no hay notas. Usa Añadir notas para dejar lo que viste en esta sesión.'
              : 'No notes added yet. Click “Add Notes” to add your thoughts about this session.') }}
          </p>
          <p v-if="noteError" class="mt-2 text-xs text-amber-200">{{ noteError }}</p>
          <div v-if="editingNotes" class="mt-3 flex justify-end gap-2">
            <button type="button" class="px-3 py-1.5 rounded-xl border border-gray-700 text-xs" @click="notes = savedNotes; editingNotes = false">
              {{ es ? 'Cancelar' : 'Cancel' }}
            </button>
            <button type="button" class="px-3 py-1.5 rounded-xl bg-acid text-charcoal text-xs font-bold" :disabled="savingNotes" @click="saveNotes">
              {{ savingNotes ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar' : 'Save') }}
            </button>
          </div>
        </section>

        <section>
          <div class="flex items-center justify-between gap-3 mb-3">
            <h2 class="font-bold">{{ es ? 'Videos' : 'Videos' }} ({{ videos.length }})</h2>
            <NuxtLink :to="`/member/staff/videos?session=${event.id}`" class="text-sm font-semibold text-gray-300 hover:text-white">
              {{ es ? 'Abrir biblioteca' : 'Open library' }}
            </NuxtLink>
          </div>
          <div v-if="!videos.length" class="rounded-2xl border border-gray-800 bg-gray-900 px-6 py-14 text-center">
            <div class="mx-auto w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-gray-400" aria-hidden="true">▶</div>
            <p class="mt-4 font-semibold">{{ es ? 'Aún no hay videos' : 'No videos yet' }}</p>
            <p class="mt-1 text-sm text-gray-500">
              {{ es ? 'Los videos grabados en esta sesión aparecen aquí.' : 'Videos recorded during this session will appear here.' }}
            </p>
          </div>
          <ul v-else class="space-y-3">
            <li v-for="video in videos" :key="video.id" class="rounded-2xl border border-gray-800 bg-gray-900 p-3">
              <p class="mb-2 flex items-center gap-2 text-sm font-semibold">
                <span
                  v-if="video.owner_initials !== '?'"
                  class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                  :class="coachPillClass(video.owner_id || video.id)"
                  :title="video.owner_name"
                >{{ video.owner_initials }}</span>
                <span class="truncate">{{ video.title }}</span>
              </p>
              <video :src="video.public_url" controls preload="metadata" class="w-full rounded-xl bg-black max-h-64" />
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.exec-grid {
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
  background-size: 24px 24px;
  mask-image: linear-gradient(to bottom, black, transparent 85%);
}
</style>
