<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { es as esLocale } from 'date-fns/locale'
import { TIME_SLOT_LABELS, type TimeSlot } from '~/types'
import { sessionProgramTitle } from '~/utils/sessionProgramTitle'
import { coachPillClass, withCoachLabels } from '~/utils/coachInitials'
import { isSummerCourseSeason } from '~/utils/programSeasons'

definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

type SessionRow = {
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
  discipline?: string | null
}

type VideoRow = {
  id: string
  title: string
  public_url: string
  created_at: string
  owner_id?: string | null
  owner_name: string
  owner_initials: string
}

const client = useSupabaseClient()
const { language } = useI18n()
const { isAdmin } = useSiteProfile()
const { selected: selectedSport, matchesSport } = useEnabledSports()
const es = computed(() => language.value === 'es')

type LiveRow = {
  id: string
  owner_id: string
  title: string
  startedAt: number
  totalMinutes: number
  skaterCount: number
  owner_name: string
  owner_initials: string
}

const loading = ref(true)
const tab = ref<'upcoming' | 'past'>('upcoming')
const sessions = ref<SessionRow[]>([])
const videos = ref<VideoRow[]>([])
const otherLive = ref<LiveRow[]>([])
const error = ref('')

const user = useSupabaseUser()
const {
  active: mySession,
  clockLabel: myClock,
  overtime: myOvertime,
  paused: myPaused,
  now,
  pauseActiveSession,
  resumeActiveSession,
} = useActiveSession()
const liveCount = computed(() => otherLive.value.length + (mySession.value ? 1 : 0))

function liveClock(row: LiveRow) {
  return formatSessionClock((now.value - row.startedAt) / 1000)
}

function liveOvertime(row: LiveRow) {
  return now.value - row.startedAt >= row.totalMinutes * 60_000
}

async function loadOtherLive() {
  const { data } = await client
    .from('class_plans')
    .select('id, coach_id, title, notes')
    .eq('plan_date', today)
  const rows: Array<Omit<LiveRow, 'owner_name' | 'owner_initials'>> = []
  for (const plan of (data || []) as Array<{ id: string; coach_id: string; title: string | null; notes: string | null }>) {
    if (plan.coach_id === user.value?.id) continue
    let notes: Record<string, any> = {}
    try { notes = JSON.parse(plan.notes || '{}') } catch { continue }
    if (notes.completed || !notes.started_at) continue
    const startedAt = Date.parse(notes.started_at)
    const totalMinutes = Number(notes.total_minutes) || 60
    if (!startedAt || Date.now() - startedAt > (totalMinutes + 120) * 60_000) continue
    rows.push({
      id: plan.id,
      owner_id: plan.coach_id,
      title: notes.session_title || plan.title || (es.value ? 'Sesión' : 'Session'),
      startedAt,
      totalMinutes,
      skaterCount: Array.isArray(notes.skater_ids) ? notes.skater_ids.length : 0,
    })
  }
  otherLive.value = await withCoachLabels(client, rows)
}

function typeLabel(type: string) {
  const labels: Record<string, { es: string; en: string }> = {
    class_session: { es: 'Clase grupal', en: 'Group class' },
    class_individual: { es: 'Clase individual', en: 'Private class' },
    practice: { es: 'Práctica', en: 'Practice' },
    camp: { es: 'Campamento', en: 'Camp' },
    event: { es: 'Evento', en: 'Event' },
    competition: { es: 'Competencia', en: 'Competition' },
  }
  const hit = labels[type]
  return hit ? (es.value ? hit.es : hit.en) : type
}

function clock(row: SessionRow) {
  if (row.start_time) return row.start_time.slice(0, 5)
  if (row.time_slot && TIME_SLOT_LABELS[row.time_slot]) return TIME_SLOT_LABELS[row.time_slot].display
  return ''
}

function hasEnded(row: SessionRow) {
  if (row.start_date < today) return true
  if (row.start_date > today) return false
  const end = (row.end_time || row.start_time || '').slice(0, 5)
  return Boolean(end) && end < format(new Date(), 'HH:mm')
}

function statusOf(row: SessionRow) {
  if (row.cancelled_at || row.session_outcome === 'cancelled') return 'cancelled'
  if (row.session_outcome === 'done') return 'done'
  return hasEnded(row) ? 'pending' : 'open'
}

const REASON_LABELS: Record<string, { es: string; en: string }> = {
  clima: { es: 'Clima', en: 'Weather' },
  weather: { es: 'Clima', en: 'Weather' },
  asistencia: { es: 'Asistencia', en: 'Attendance' },
  attendance: { es: 'Asistencia', en: 'Attendance' },
  coach: { es: 'Coach', en: 'Coach' },
}

function reasonLabel(raw: string | null | undefined) {
  const text = (raw || '').trim()
  if (!text) return ''
  const known = REASON_LABELS[text.toLowerCase()]
  if (known) return es.value ? known.es : known.en
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function statusText(row: SessionRow) {
  const status = statusOf(row)
  const label = statusLabel(status)
  if (status !== 'cancelled') return label
  const reason = reasonLabel(row.cancellation_reason)
  return reason ? `${label} ${es.value ? 'por' : 'for'} ${reason}` : label
}

function statusLabel(status: string) {
  if (status === 'done') return es.value ? 'Hecha' : 'Done'
  if (status === 'cancelled') return es.value ? 'Cancelada' : 'Cancelled'
  if (status === 'pending') return es.value ? 'Pendiente de actualizar' : 'Needs update'
  return es.value ? 'Programada' : 'Scheduled'
}

function statusClass(status: string) {
  if (status === 'done') return 'bg-acid/15 text-acid'
  if (status === 'cancelled') return 'bg-gray-800 text-gray-400'
  if (status === 'pending') return 'border border-orange-400/40 bg-orange-500/15 text-orange-300'
  return 'bg-white/10 text-white'
}

const today = format(new Date(), 'yyyy-MM-dd')

const { seasons } = useProgramSeasons()

/** Regular seasons that have started, most recent (the current one) first. */
const pastSeasons = computed(() =>
  seasons.value
    .filter(season => !isSummerCourseSeason(season.slug) && season.startDate < today)
    .sort((a, b) => b.startDate.localeCompare(a.startDate)),
)
const seasonsShown = ref(1)
const shownSeasons = computed(() => pastSeasons.value.slice(0, seasonsShown.value))
const pastFrom = computed(() => shownSeasons.value[shownSeasons.value.length - 1]?.startDate || '')

function seasonOf(date: string) {
  return shownSeasons.value.find(season => date >= season.startDate && date <= season.endDate)
}

function isShownPast(row: SessionRow) {
  return row.start_date < today && row.start_date >= pastFrom.value
}

const visible = computed(() => {
  const rows = sessions.value.filter(row => (tab.value === 'upcoming' ? row.start_date >= today : isShownPast(row)))
  // Days run newest-first in Pasadas, but within a day classes always go morning to evening.
  const dayDir = tab.value === 'upcoming' ? 1 : -1
  return [...rows].sort((a, b) =>
    a.start_date.localeCompare(b.start_date) * dayDir
    || (a.start_time || '').localeCompare(b.start_time || ''),
  )
})

/** Hex values so the staff theme's color remapping leaves them alone. */
const DAY_NEONS = ['#C9EF42', '#22D3EE', '#A78BFA', '#F472B6', '#FB923C']

/** Consecutive sessions on the same date, in list order. */
const visibleGroups = computed(() => {
  const groups: Array<{ date: string; rows: SessionRow[] }> = []
  for (const row of visible.value) {
    const last = groups[groups.length - 1]
    if (last && last.date === row.start_date) last.rows.push(row)
    else groups.push({ date: row.start_date, rows: [row] })
  }
  let colorIndex = 0
  let lastSeasonSlug = ''
  return groups.map((group) => {
    const season = tab.value === 'past' ? seasonOf(group.date) : undefined
    const seasonHeading = season && season.slug !== lastSeasonSlug ? season : undefined
    if (season) lastSeasonSlug = season.slug
    const color = group.rows.length > 1 ? DAY_NEONS[colorIndex++ % DAY_NEONS.length] : ''
    const slots: Array<{ key: string; label: string; rows: SessionRow[] }> = []
    for (const row of group.rows) {
      const time = clock12(row)
      const last = slots[slots.length - 1]
      if (last && last.key === time) last.rows.push(row)
      else slots.push({ key: time, label: [dayLabel(group.date), time].filter(Boolean).join(' · '), rows: [row] })
    }
    return {
      ...group,
      seasonHeading,
      slots,
      color,
      style: color ? { borderColor: `${color}99`, boxShadow: `0 0 14px ${color}1F` } : undefined,
    }
  })
})

function dayLabel(date: string) {
  return format(parseISO(date), 'EEE d MMM', { locale: es.value ? esLocale : undefined }).toUpperCase()
}

/** "7:00 PM", like the calendar's time pills. */
function clock12(row: SessionRow) {
  const hhmm = clock(row)
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!match) return hhmm
  const h = Number(match[1])
  return `${h % 12 || 12}:${match[2]} ${h < 12 ? 'AM' : 'PM'}`
}

const selectedIds = ref<string[]>([])
const bulkBusy = ref(false)
const bulkError = ref('')
watch(tab, () => { selectedIds.value = [] })

const cancelReasons = [
  { id: 'clima', es: 'Clima', en: 'Weather' },
  { id: 'asistencia', es: 'Asistencia', en: 'Attendance' },
  { id: 'coach', es: 'Coach', en: 'Coach' },
  { id: 'other', es: 'Otro', en: 'Other' },
]
const cancelPanelOpen = ref(false)
const cancelReason = ref('')
const cancelReasonOther = ref('')
const cancelReasonText = computed(() =>
  cancelReason.value === 'other'
    ? cancelReasonOther.value.trim()
    : (cancelReasons.find(item => item.id === cancelReason.value)?.[es.value ? 'es' : 'en'] || ''),
)
watch(selectedIds, (ids) => { if (!ids.length) cancelPanelOpen.value = false })

function openBulkCancel() {
  cancelPanelOpen.value = !cancelPanelOpen.value
  cancelReason.value = ''
  cancelReasonOther.value = ''
}

function toggleSelected(id: string) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter(x => x !== id)
    : [...selectedIds.value, id]
}

async function bulkUpdate(outcome: 'done' | 'cancelled') {
  const ids = [...selectedIds.value]
  if (!ids.length || bulkBusy.value) return
  const reason = cancelReasonText.value
  if (outcome === 'cancelled' && !reason) {
    bulkError.value = es.value ? 'Elige el motivo de la cancelación.' : 'Choose a reason for cancelling.'
    return
  }
  const rows = sessions.value.filter(row => ids.includes(row.id))
  const allPast = rows.every(row => row.start_date < today)
  if (outcome === 'cancelled' && !allPast) {
    const ok = window.confirm(es.value
      ? `Se cancelarán ${ids.length} sesiones y se avisará por correo a las familias inscritas. ¿Continuar?`
      : `This cancels ${ids.length} sessions and emails enrolled families. Continue?`)
    if (!ok) return
  }
  bulkBusy.value = true
  bulkError.value = ''
  try {
    const { data: auth } = await client.auth.getSession()
    const token = auth.session?.access_token
    if (!token) throw new Error(es.value ? 'Sesión expirada.' : 'Session expired.')
    const post = (body: Record<string, unknown>) => $fetch('/api/classes/session-status', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    })
    if (outcome === 'done') {
      await post({ eventIds: ids, outcome })
    } else if (allPast) {
      await post({ eventIds: ids, outcome, reason, notify: false })
    } else {
      for (const id of ids) await post({ eventId: id, outcome, reason })
    }
    cancelPanelOpen.value = false
    selectedIds.value = []
    await load()
  } catch (e: any) {
    bulkError.value = e?.data?.message || e?.message || 'Error'
  } finally {
    bulkBusy.value = false
  }
}

const counts = computed(() => ({
  upcoming: sessions.value.filter(row => row.start_date >= today).length,
  past: sessions.value.filter(isShownPast).length,
}))

async function load() {
  loading.value = true
  error.value = ''
  const { data, error: sessionError } = await client
    .from('school_calendar_events')
    .select('id, title, event_type, discipline, start_date, start_time, end_time, time_slot, skatepark, location, session_outcome, cancelled_at, cancellation_reason')
    .in('event_type', ['class_session', 'class_individual', 'practice'])
    .order('start_date', { ascending: false })
    .order('start_time', { ascending: true })
  if (sessionError) error.value = sessionError.message
  sessions.value = ((data || []) as SessionRow[]).filter(matchesSport)

  const { data: videoRows } = await client
    .from('session_videos')
    .select('id, title, public_url, created_at, owner_id')
    .order('created_at', { ascending: false })
    .limit(4)
  videos.value = await withCoachLabels(client, (videoRows || []) as Array<{ id: string; title: string; public_url: string; created_at: string; owner_id?: string | null }>)
  await loadOtherLive()
  loading.value = false
}

onMounted(load)
watch(selectedSport, load)
</script>

<template>
  <div class="min-h-full bg-black text-white">
    <MemberStaffPageHeader
      :title="es ? 'Sesiones' : 'Sessions'"
      :subtitle="es ? 'Clases, prácticas y videos de Niik Skate.' : 'Niik Skate classes, practices, and videos.'"
    >
      <template #actions>
        <NuxtLink
          :to="isAdmin ? '/member/admin/scheduling/calendar' : '/member/coach/plans'"
          class="px-3 py-2 rounded-xl border border-gray-700 text-sm"
        >
          {{ es ? 'Programar' : 'Schedule' }}
        </NuxtLink>
        <NuxtLink to="/member/coach/plans" class="px-3 py-2 rounded-xl bg-acid text-charcoal text-sm font-bold">
          <template v-if="mySession">{{ es ? 'Volver a la sesión' : 'Back to session' }} · {{ myClock }}</template>
          <template v-else>{{ es ? 'Iniciar sesión' : 'Start session' }}</template>
        </NuxtLink>
      </template>
    </MemberStaffPageHeader>

    <div class="max-w-6xl mx-auto px-3 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_20rem] gap-5">
      <section class="min-w-0 rounded-2xl bg-gray-900 border border-gray-800 p-3 sm:p-5">
        <div class="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div class="flex gap-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded-full text-xs font-bold"
              :class="tab === 'upcoming' ? 'bg-acid text-charcoal' : 'border border-gray-700 text-gray-300'"
              @click="tab = 'upcoming'"
            >
              {{ es ? 'Próximas' : 'Upcoming' }} · {{ counts.upcoming }}
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-full text-xs font-bold"
              :class="tab === 'past' ? 'bg-acid text-charcoal' : 'border border-gray-700 text-gray-300'"
              @click="tab = 'past'"
            >
              {{ es ? 'Pasadas' : 'Past' }} · {{ counts.past }}
            </button>
          </div>
          <div v-if="selectedIds.length" class="flex items-center gap-2">
            <span class="text-xs text-gray-400">
              {{ selectedIds.length }} {{ es ? (selectedIds.length === 1 ? 'seleccionada' : 'seleccionadas') : 'selected' }}
            </span>
            <button
              type="button"
              class="px-3 py-1.5 rounded-full text-xs font-bold bg-acid text-charcoal disabled:opacity-50"
              :disabled="bulkBusy"
              @click="bulkUpdate('done')"
            >
              {{ es ? 'Marcar hecha' : 'Mark done' }}
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded-full text-xs font-bold border text-gray-200 hover:border-gray-400 disabled:opacity-50"
              :class="cancelPanelOpen ? 'border-gray-300' : 'border-gray-600'"
              :disabled="bulkBusy"
              @click="openBulkCancel"
            >
              {{ es ? 'Marcar cancelada' : 'Mark cancelled' }}
            </button>
            <button
              type="button"
              class="text-gray-500 hover:text-white text-sm px-1"
              :aria-label="es ? 'Limpiar selección' : 'Clear selection'"
              @click="selectedIds = []"
            >
              ×
            </button>
          </div>
        </div>
        <div
          v-if="cancelPanelOpen && selectedIds.length"
          class="mb-4 ml-auto max-w-md rounded-xl border border-gray-800 bg-gray-950 p-3 space-y-2"
        >
          <p class="text-xs font-semibold text-white">
            {{ es ? 'Motivo de la cancelación' : 'Reason for cancelling' }}
            <span class="font-normal text-gray-500">· {{ selectedIds.length }} {{ es ? 'sesiones' : 'sessions' }}</span>
          </p>
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              class="h-7 w-7 rounded-full bg-acid text-charcoal text-sm font-bold disabled:opacity-40"
              :disabled="bulkBusy || !cancelReasonText"
              :aria-label="es ? 'Confirmar cancelación' : 'Confirm cancellation'"
              @click="bulkUpdate('cancelled')"
            >
              {{ bulkBusy ? '…' : '✓' }}
            </button>
            <button
              type="button"
              class="h-7 w-7 rounded-full border border-gray-600 text-gray-300 text-sm font-bold hover:border-gray-400 hover:text-white"
              :disabled="bulkBusy"
              :aria-label="es ? 'Descartar' : 'Dismiss'"
              @click="cancelPanelOpen = false"
            >
              ×
            </button>
            <button
              v-for="item in cancelReasons"
              :key="item.id"
              type="button"
              class="px-2.5 py-1 rounded-full text-[11px] font-semibold border"
              :class="cancelReason === item.id ? 'border-acid bg-acid text-charcoal' : 'border-gray-700 text-gray-300 hover:border-gray-500'"
              @click="cancelReason = item.id"
            >
              {{ es ? item.es : item.en }}
            </button>
          </div>
          <input
            v-if="cancelReason === 'other'"
            v-model="cancelReasonOther"
            type="text"
            class="w-full rounded-lg border border-gray-700 bg-black px-3 py-2 text-sm text-white outline-none focus:border-gray-500"
            :placeholder="es ? 'Escribe el motivo' : 'Write the reason'"
          >
        </div>
        <p v-if="bulkError" class="mb-3 text-sm text-amber-200">{{ bulkError }}</p>

        <div
          v-if="tab === 'past' && pastSeasons.length"
          class="mb-4 flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950 px-3 py-2"
        >
          <div class="min-w-0 flex-1">
            <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">{{ es ? 'Temporada' : 'Season' }}</p>
            <div class="mt-1 flex flex-wrap gap-1.5">
              <button
                v-for="(season, index) in pastSeasons"
                :key="season.slug"
                type="button"
                class="rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors"
                :class="index < seasonsShown
                  ? 'bg-white/10 text-white'
                  : 'border border-dashed border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'"
                :title="es ? season.dates.es : season.dates.en"
                @click="seasonsShown = index + 1"
              >
                {{ es ? season.name.es : season.name.en }}
              </button>
            </div>
          </div>
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-700 text-lg font-bold text-gray-200 hover:border-gray-500 disabled:opacity-30"
            :disabled="seasonsShown <= 1"
            :aria-label="es ? 'Mostrar menos temporadas' : 'Show fewer seasons'"
            @click="seasonsShown--"
          >
            −
          </button>
          <button
            type="button"
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-acid text-lg font-bold text-charcoal disabled:opacity-30"
            :disabled="seasonsShown >= pastSeasons.length"
            :aria-label="es ? 'Mostrar temporada anterior' : 'Show previous season'"
            @click="seasonsShown++"
          >
            +
          </button>
        </div>

        <p v-if="loading" class="text-sm text-gray-500 py-8 text-center">{{ es ? 'Cargando…' : 'Loading…' }}</p>
        <p v-else-if="error" class="text-sm text-amber-200">{{ error }}</p>
        <p v-else-if="!visible.length" class="text-sm text-gray-500 py-10 text-center">
          {{ tab === 'upcoming'
            ? (es ? 'No hay sesiones próximas.' : 'No upcoming sessions.')
            : (es ? 'No hay sesiones pasadas.' : 'No past sessions.') }}
        </p>
        <div v-else class="space-y-2 max-h-[42.5rem] overflow-y-auto overflow-x-hidden pr-1 overscroll-contain">
          <template v-for="group in visibleGroups" :key="group.date">
          <p
            v-if="group.seasonHeading && shownSeasons.length > 1"
            class="pt-2 text-[11px] font-bold uppercase tracking-[0.18em] text-acid"
          >
            {{ group.seasonHeading.icon }} {{ es ? group.seasonHeading.name.es : group.seasonHeading.name.en }}
            <span class="font-normal normal-case tracking-normal text-gray-500">· {{ es ? group.seasonHeading.dates.es : group.seasonHeading.dates.en }}</span>
          </p>
          <div
            class="space-y-3"
            :class="group.rows.length > 1 ? 'rounded-2xl border p-2' : ''"
            :style="group.style"
          >
          <div v-for="slot in group.slots" :key="slot.key" class="space-y-1.5">
          <p
            class="inline-flex rounded-md border border-white/20 bg-black/30 px-2 py-0.5 text-[10px] font-black tracking-wide"
            :style="{ color: group.color || '#E5E7EB' }"
          >
            {{ slot.label }}
          </p>
          <ul class="space-y-1.5">
            <li
              v-for="session in slot.rows"
              :key="session.id"
              class="flex items-center gap-3 rounded-xl bg-gray-950 border pl-3 pr-4 py-3 transition-colors"
              :class="selectedIds.includes(session.id) ? 'border-gray-400' : 'border-gray-800 hover:border-gray-600'"
            >
              <button
                type="button"
                role="checkbox"
                :aria-checked="selectedIds.includes(session.id)"
                :aria-label="es ? `Seleccionar ${session.title}` : `Select ${session.title}`"
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-400"
                :class="selectedIds.includes(session.id) ? 'border-acid bg-acid text-charcoal' : 'border-gray-600 hover:border-gray-400'"
                @click="toggleSelected(session.id)"
              >
                <svg v-if="selectedIds.includes(session.id)" class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fill-rule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z" clip-rule="evenodd" />
                </svg>
              </button>
              <NuxtLink
                :to="`/member/staff/sessions/${session.id}`"
                class="flex min-w-0 flex-1 items-center justify-between gap-3"
              >
                <div class="min-w-0">
                  <p class="font-semibold truncate">{{ sessionProgramTitle(session.title) }}</p>
                  <p class="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 min-w-0">
                    <MemberSessionKindIcon v-if="session.event_type === 'class_session' || session.event_type === 'class_individual'" :kind="session.event_type" />
                    <span v-else>{{ typeLabel(session.event_type) }}</span>
                    <span v-if="session.skatepark || session.location" class="truncate">· {{ session.skatepark || session.location }}</span>
                  </p>
                </div>
                <span
                  class="shrink-0 max-w-[45%] truncate rounded-full px-2 py-0.5 text-[10px] font-bold"
                  :class="statusClass(statusOf(session))"
                  :title="statusText(session)"
                >
                  {{ statusText(session) }}
                </span>
              </NuxtLink>
            </li>
          </ul>
          </div>
          </div>
          </template>
        </div>
      </section>

      <div class="min-w-0 space-y-5 h-fit">
      <section id="activas" class="scroll-mt-6 rounded-2xl bg-gray-900 border border-gray-800 p-5">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
            {{ es ? 'Sesiones activas' : 'Active sessions' }}
          </p>
          <span
            v-if="liveCount"
            class="inline-flex items-center gap-1.5 rounded-full border border-acid/40 px-2 py-0.5 text-[10px] font-bold text-acid"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-acid animate-pulse" aria-hidden="true" />
            {{ liveCount }} {{ es ? 'en curso' : 'live' }}
          </span>
        </div>

        <ul v-if="liveCount" class="mt-4 space-y-2">
          <li
            v-if="mySession"
            class="rounded-xl border bg-gray-950 px-4 py-3"
            :class="myPaused ? 'border-gray-700' : myOvertime ? 'border-amber-400/40' : 'border-acid/40'"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">
                {{ es ? 'Tu sesión' : 'Your session' }}<template v-if="myPaused"> · {{ es ? 'En pausa' : 'Paused' }}</template>
              </p>
              <span
                class="font-mono text-sm tabular-nums"
                :class="myPaused ? 'text-gray-400' : myOvertime ? 'text-amber-300' : 'text-acid'"
              >{{ myClock }}</span>
            </div>
            <p class="mt-1 font-semibold truncate">{{ mySession.title || mySession.programName }}</p>
            <p class="mt-0.5 text-xs text-gray-500">
              {{ mySession.skaterCount }} {{ es ? 'patinadores' : 'skaters' }}
              · {{ mySession.totalMinutes }} min
              <span v-if="myOvertime" class="text-amber-300"> · {{ es ? 'tiempo cumplido' : 'time is up' }}</span>
            </p>
            <div class="mt-3 flex items-center justify-between gap-2">
              <NuxtLink
                to="/member/coach/plans"
                class="text-xs font-bold hover:underline"
                :class="myPaused ? 'text-gray-300' : myOvertime ? 'text-amber-300' : 'text-acid'"
              >
                {{ es ? 'Volver a la sesión →' : 'Back to session →' }}
              </NuxtLink>
              <button
                type="button"
                class="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1 text-xs font-semibold text-white hover:border-gray-500"
                @click="myPaused ? resumeActiveSession() : pauseActiveSession()"
              >
                <svg v-if="myPaused" class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                <svg v-else class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
                {{ myPaused ? (es ? 'Reanudar' : 'Resume') : (es ? 'Pausar' : 'Pause') }}
              </button>
            </div>
          </li>
          <li
            v-for="row in otherLive"
            :key="row.id"
            class="rounded-xl border border-gray-800 bg-gray-950 px-4 py-3"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="flex items-center gap-2 min-w-0 text-xs text-gray-400">
                <span
                  class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                  :class="coachPillClass(row.owner_id)"
                  :title="row.owner_name"
                >{{ row.owner_initials }}</span>
                <span class="truncate">{{ row.owner_name }}</span>
              </p>
              <span class="font-mono text-sm tabular-nums" :class="liveOvertime(row) ? 'text-amber-300' : 'text-white'">{{ liveClock(row) }}</span>
            </div>
            <p class="mt-1 font-semibold truncate">{{ row.title }}</p>
            <p class="mt-0.5 text-xs text-gray-500">
              {{ row.skaterCount }} {{ es ? 'patinadores' : 'skaters' }} · {{ row.totalMinutes }} min
            </p>
          </li>
        </ul>
        <p v-else class="mt-4 text-sm text-gray-500">
          {{ es ? 'No hay sesiones en curso.' : 'No sessions running.' }}
        </p>
      </section>

      <section class="rounded-2xl bg-gray-900 border border-gray-800 p-5">
        <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
          {{ es ? 'Videos' : 'Videos' }}
        </p>
        <p class="mt-2 text-sm text-gray-400">
          {{ es
            ? 'Sube clips de las sesiones o graba uno nuevo desde la biblioteca.'
            : 'Upload session clips or record a new one from the library.' }}
        </p>
        <ul v-if="videos.length" class="mt-4 space-y-3">
          <li v-for="video in videos" :key="video.id">
            <p class="mb-1 flex items-center gap-2 text-xs text-gray-400">
              <span
                v-if="video.owner_initials !== '?'"
                class="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                :class="coachPillClass(video.owner_id || video.id)"
                :title="video.owner_name"
              >{{ video.owner_initials }}</span>
              <span class="truncate">{{ video.title }}</span>
            </p>
            <video :src="video.public_url" controls preload="metadata" class="w-full rounded-xl bg-black max-h-36" />
          </li>
        </ul>
        <p v-else class="mt-4 text-sm text-gray-500">
          {{ es ? 'Todavía no hay videos en la biblioteca.' : 'The library is empty.' }}
        </p>
        <NuxtLink to="/member/staff/videos" class="inline-flex mt-5 px-4 py-2 rounded-xl bg-acid text-charcoal text-sm font-bold">
          {{ es ? 'Abrir biblioteca' : 'Open library' }}
        </NuxtLink>
      </section>
      </div>
    </div>
  </div>
</template>
