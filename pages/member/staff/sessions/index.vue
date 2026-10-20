<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { es as esLocale } from 'date-fns/locale'
import { TIME_SLOT_LABELS, type TimeSlot } from '~/types'
import { coachPillClass, withCoachLabels } from '~/utils/coachInitials'

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
const { active: mySession, clockLabel: myClock, overtime: myOvertime, now } = useActiveSession()
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

const visible = computed(() => {
  const rows = sessions.value.filter(row => (tab.value === 'upcoming' ? row.start_date >= today : row.start_date < today))
  const dir = tab.value === 'upcoming' ? 1 : -1
  return [...rows].sort((a, b) =>
    a.start_date.localeCompare(b.start_date) * dir
    || (a.start_time || '').localeCompare(b.start_time || '') * dir,
  )
})

const counts = computed(() => ({
  upcoming: sessions.value.filter(row => row.start_date >= today).length,
  past: sessions.value.filter(row => row.start_date < today).length,
}))

async function load() {
  loading.value = true
  error.value = ''
  const { data, error: sessionError } = await client
    .from('school_calendar_events')
    .select('id, title, event_type, start_date, start_time, end_time, time_slot, skatepark, location, session_outcome, cancelled_at')
    .in('event_type', ['class_session', 'class_individual', 'practice'])
    .order('start_date', { ascending: false })
    .order('start_time', { ascending: true })
  if (sessionError) error.value = sessionError.message
  sessions.value = (data || []) as SessionRow[]

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

    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-5">
      <section class="rounded-2xl bg-gray-900 border border-gray-800 p-5">
        <div class="flex gap-2 mb-4">
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

        <p v-if="loading" class="text-sm text-gray-500 py-8 text-center">{{ es ? 'Cargando…' : 'Loading…' }}</p>
        <p v-else-if="error" class="text-sm text-amber-200">{{ error }}</p>
        <p v-else-if="!visible.length" class="text-sm text-gray-500 py-10 text-center">
          {{ tab === 'upcoming'
            ? (es ? 'No hay sesiones próximas.' : 'No upcoming sessions.')
            : (es ? 'No hay sesiones pasadas.' : 'No past sessions.') }}
        </p>
        <ul v-else class="space-y-2 max-h-[42.5rem] overflow-y-auto pr-1 overscroll-contain">
          <li v-for="session in visible" :key="session.id">
            <NuxtLink
              :to="`/member/staff/sessions/${session.id}`"
              class="flex items-center justify-between gap-3 rounded-xl bg-gray-950 border border-gray-800 px-4 py-3 hover:border-gray-600"
            >
            <div class="min-w-0">
              <p class="font-semibold truncate">{{ session.title }}</p>
              <p class="text-xs text-gray-500 mt-0.5">
                {{ format(parseISO(session.start_date), 'EEE d MMM', { locale: es ? esLocale : undefined }) }}
                <span v-if="clock(session)"> · {{ clock(session) }}</span>
                · {{ typeLabel(session.event_type) }}
                <span v-if="session.skatepark || session.location"> · {{ session.skatepark || session.location }}</span>
              </p>
            </div>
            <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" :class="statusClass(statusOf(session))">
              {{ statusLabel(statusOf(session)) }}
            </span>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <div class="space-y-5 h-fit">
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
          <li v-if="mySession">
            <NuxtLink
              to="/member/coach/plans"
              class="block rounded-xl border bg-gray-950 px-4 py-3 transition-colors"
              :class="myOvertime ? 'border-amber-400/40 hover:border-amber-300/70' : 'border-acid/40 hover:border-acid/80'"
            >
              <div class="flex items-center justify-between gap-3">
                <p class="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-500">{{ es ? 'Tu sesión' : 'Your session' }}</p>
                <span class="font-mono text-sm tabular-nums" :class="myOvertime ? 'text-amber-300' : 'text-acid'">{{ myClock }}</span>
              </div>
              <p class="mt-1 font-semibold truncate">{{ mySession.title || mySession.programName }}</p>
              <p class="mt-0.5 text-xs text-gray-500">
                {{ mySession.skaterCount }} {{ es ? 'patinadores' : 'skaters' }}
                · {{ mySession.totalMinutes }} min
                <span v-if="myOvertime" class="text-amber-300"> · {{ es ? 'tiempo cumplido' : 'time is up' }}</span>
              </p>
              <p class="mt-2 text-xs font-bold" :class="myOvertime ? 'text-amber-300' : 'text-acid'">
                {{ es ? 'Volver a la sesión →' : 'Back to session →' }}
              </p>
            </NuxtLink>
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
