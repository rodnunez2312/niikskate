<script setup lang="ts">
import { format, startOfWeek, endOfWeek, subDays, subMonths, parseISO } from 'date-fns'
import { es as esLocale } from 'date-fns/locale'
import { TIME_SLOT_LABELS, type TimeSlot } from '~/types'

definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

type TodaySession = {
  id: string
  title: string
  event_type: string
  start_time: string | null
  time_slot: TimeSlot | null
  skatepark: string | null
}

type PastStatus = 'done' | 'cancelled' | 'open'

type PastSession = {
  id: string
  title: string
  start_date: string
  start_time: string | null
  end_time: string | null
  time_slot: TimeSlot | null
  session_outcome: string | null
  cancelled_at: string | null
}

type AttentionItem = {
  id: string
  area: string
  where: string
  label: string
  href: string
}

type HighlightItem = {
  id: string
  text: string
  date: string
}

const client = useSupabaseClient()
const { fullName, isAdmin } = useSiteProfile()
const { language } = useI18n()

const es = computed(() => language.value === 'es')
const loading = ref(true)

const todaySessions = ref<TodaySession[]>([])
const attentionItems = ref<AttentionItem[]>([])
const highlights = ref<HighlightItem[]>([])
const snapshot = ref({
  athletes: 0,
  coaches: 0,
  sessionsThisWeek: 0,
  attendancePct: null as number | null,
})

const firstName = computed(() => {
  const n = fullName.value?.trim()
  if (!n) return es.value ? 'equipo' : 'team'
  return n.split(' ')[0]
})

const greeting = computed(() => {
  const hour = new Date().getHours()
  if (es.value) {
    if (hour < 12) return 'Buenos días'
    if (hour < 18) return 'Buenas tardes'
    return 'Buenas noches'
  }
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const todayLabel = computed(() => {
  const loc = es.value ? esLocale : undefined
  return format(new Date(), 'EEEE d MMM', { locale: loc })
})

function formatSessionTime(session: TodaySession) {
  if (session.start_time) return session.start_time.slice(0, 5)
  if (session.time_slot && TIME_SLOT_LABELS[session.time_slot]) {
    return TIME_SLOT_LABELS[session.time_slot].display
  }
  return ''
}

function sessionTypeLabel(type: string) {
  const map: Record<string, { es: string; en: string }> = {
    class_session: { es: 'Clase grupal', en: 'Group class' },
    class_individual: { es: 'Clase individual', en: 'Private lesson' },
    practice: { es: 'Práctica', en: 'Practice' },
    event: { es: 'Evento', en: 'Event' },
    competition: { es: 'Competencia', en: 'Competition' },
  }
  const row = map[type]
  return row ? (es.value ? row.es : row.en) : type
}

// ---------------------------------------------------------------------------
// Past classes — newest 3 up front, the rest grouped by week like Clases por semana
// ---------------------------------------------------------------------------

const PAST_CLASS_TYPES = ['class_session', 'class_individual', 'practice']
const RECENT_PAST_COUNT = 3

const pastSessions = ref<PastSession[]>([])
/** How many months back the past-classes board reaches (0 = last 30 days). */
const pastMonthsBack = ref(0)
const pastLoading = ref(false)

const pastFromDate = () => format(subMonths(subDays(new Date(), 30), pastMonthsBack.value), 'yyyy-MM-dd')

async function loadPastSessions() {
  pastLoading.value = true
  try {
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data } = await client
      .from('school_calendar_events')
      .select('id, title, start_date, start_time, end_time, time_slot, session_outcome, cancelled_at')
      .gte('start_date', pastFromDate())
      .lte('start_date', today)
      .in('event_type', PAST_CLASS_TYPES)
      .order('start_date', { ascending: false })
      .order('start_time', { ascending: false })
    const nowHm = format(new Date(), 'HH:mm')
    pastSessions.value = ((data || []) as PastSession[]).filter(s => {
      if (s.start_date < today) return true
      const ends = (s.end_time || s.start_time)?.slice(0, 5)
      return Boolean(ends && ends <= nowHm)
    })
  } catch (e) {
    console.error('staff dashboard past sessions:', e)
  } finally {
    pastLoading.value = false
  }
}

async function loadOlderPastMonth() {
  if (pastLoading.value) return
  pastMonthsBack.value += 1
  await loadPastSessions()
}

function pastStatus(s: PastSession): PastStatus {
  if (s.cancelled_at || s.session_outcome === 'cancelled') return 'cancelled'
  if (s.session_outcome === 'done') return 'done'
  return 'open'
}

function pastChipClass(status: PastStatus) {
  if (status === 'done') return 'bg-acid text-charcoal'
  if (status === 'cancelled') return 'bg-transparent text-gray-500 line-through border border-gray-700'
  return 'bg-gray-500 text-white'
}

function pastStatusLabel(status: PastStatus) {
  if (status === 'done') return es.value ? 'Hecha' : 'Done'
  if (status === 'cancelled') return es.value ? 'Cancelada' : 'Cancelled'
  return es.value ? 'Sin marcar' : 'Unmarked'
}

const pastTime = (s: PastSession) =>
  s.start_time?.slice(0, 5) || (s.time_slot ? TIME_SLOT_LABELS[s.time_slot]?.start : '') || ''

/** Older history is fetched a month at a time; stop after a year of empty months. */
const MAX_PAST_MONTHS_BACK = 12

const pastVisibleCount = ref(RECENT_PAST_COUNT)
const pastList = ref<HTMLElement | null>(null)

const visiblePast = computed(() => pastSessions.value.slice(0, pastVisibleCount.value))

const pastHasMore = computed(
  () => pastSessions.value.length > pastVisibleCount.value || pastMonthsBack.value < MAX_PAST_MONTHS_BACK,
)

async function showMorePast() {
  if (pastLoading.value) return
  const want = pastVisibleCount.value + RECENT_PAST_COUNT
  while (pastSessions.value.length < want && pastMonthsBack.value < MAX_PAST_MONTHS_BACK) {
    await loadOlderPastMonth()
  }
  pastVisibleCount.value = Math.min(want, pastSessions.value.length)
  await nextTick()
  pastList.value?.scrollTo({ top: pastList.value.scrollHeight, behavior: 'smooth' })
}

/** Upcoming classes with nobody whose role is coach or admin on the roster. */
async function countClassesWithoutCoach(today: string) {
  type ClassRow = { id: string; session_outcome: string | null; cancelled_at: string | null }
  const open: ClassRow[] = []
  for (let from = 0; from < 5000; from += 1000) {
    const { data, error } = await client
      .from('school_calendar_events')
      .select('id, session_outcome, cancelled_at')
      .gte('start_date', today)
      .in('event_type', ['class_session', 'class_individual'])
      .order('start_date', { ascending: true })
      .range(from, from + 999)
    if (error || !data?.length) break
    for (const row of data as ClassRow[]) {
      if (row.session_outcome === 'cancelled' || row.cancelled_at) continue
      open.push(row)
    }
    if (data.length < 1000) break
  }
  if (!open.length) return 0

  const covered = new Set<string>()
  for (let i = 0; i < open.length; i += 200) {
    const slice = open.slice(i, i + 200).map(row => row.id)
    const { data: seats } = await client
      .from('class_session_coaches')
      .select('calendar_event_id, coach_id')
      .in('calendar_event_id', slice)
    const seatRows = (seats || []) as Array<{ calendar_event_id: string; coach_id: string }>
    const coachIds = [...new Set(seatRows.map(row => row.coach_id).filter(Boolean))]
    if (!coachIds.length) continue
    const { data: people } = await client.from('profiles').select('id, role').in('id', coachIds)
    const staff = new Set(
      ((people || []) as Array<{ id: string; role: string | null }>)
        .filter(person => person.role === 'coach' || person.role === 'admin')
        .map(person => person.id),
    )
    for (const seat of seatRows) {
      if (staff.has(seat.coach_id)) covered.add(seat.calendar_event_id)
    }
  }
  return open.filter(row => !covered.has(row.id)).length
}

async function loadDashboard() {
  loading.value = true
  const today = format(new Date(), 'yyyy-MM-dd')
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd')

  try {
    const [
      sessionsRes,
      weekSessionsRes,
      athletesRes,
      coachesCount,
      pendingRegsRes,
      pendingPaymentsRes,
      evalsRes,
    ] = await Promise.all([
      client
        .from('school_calendar_events')
        .select('id, title, event_type, start_time, time_slot, skatepark')
        .eq('start_date', today)
        .order('start_time', { ascending: true }),
      client
        .from('school_calendar_events')
        .select('id', { count: 'exact', head: true })
        .gte('start_date', weekStart)
        .lte('start_date', weekEnd)
        .in('event_type', ['class_session', 'class_individual', 'practice']),
      client.from('crew_members').select('id', { count: 'exact', head: true }),
      countActiveCoachDirectoryProfiles(client),
      isAdmin.value
        ? client.from('registration_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending')
        : Promise.resolve({ count: 0 }),
      isAdmin.value
        ? client
            .from('class_reservations')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending_payment')
        : Promise.resolve({ count: 0 }),
      client
        .from('student_evaluations')
        .select('id, evaluation_date, overall_rating, student_id')
        .gte('evaluation_date', weekAgo)
        .order('evaluation_date', { ascending: false })
        .limit(5),
    ])

    todaySessions.value = (sessionsRes.data || []) as TodaySession[]
    snapshot.value = {
      athletes: athletesRes.count || 0,
      coaches: coachesCount,
      sessionsThisWeek: weekSessionsRes.count || 0,
      attendancePct: null,
    }

    const attention: AttentionItem[] = []
    const pendingRegs = pendingRegsRes.count || 0
    if (pendingRegs > 0) {
      attention.push({
        id: 'regs',
        area: 'Academy',
        where: es.value ? 'Registros' : 'Registrations',
        label: es.value
          ? `${pendingRegs} solicitud${pendingRegs === 1 ? '' : 'es'} de registro pendiente${pendingRegs === 1 ? '' : 's'}`
          : `${pendingRegs} registration request${pendingRegs === 1 ? '' : 's'} pending`,
        href: '/member/admin/academy/registrations',
      })
    }
    const pendingPay = pendingPaymentsRes.count || 0
    if (pendingPay > 0 && isAdmin.value) {
      attention.push({
        id: 'payments',
        area: es.value ? 'Finanzas' : 'Finance',
        where: es.value ? 'Ingresos' : 'Income',
        label: es.value
          ? `${pendingPay} reserva${pendingPay === 1 ? '' : 's'} con pago pendiente`
          : `${pendingPay} reservation${pendingPay === 1 ? '' : 's'} pending payment`,
        href: '/member/admin/finance/income',
      })
    }
    const unassigned = isAdmin.value ? await countClassesWithoutCoach(today) : 0
    if (unassigned > 0) {
      attention.push({
        id: 'unassigned-coaches',
        area: 'Scheduling',
        where: es.value ? 'Calendario' : 'Calendar',
        label: es.value
          ? `${unassigned} clase${unassigned === 1 ? '' : 's'} sin coach asignado`
          : `${unassigned} class${unassigned === 1 ? '' : 'es'} with no coach assigned`,
        href: '/member/admin/scheduling/calendar',
      })
    }
    attentionItems.value = attention

    highlights.value = (evalsRes.data || []).map((row: any) => {
      const rating = row.overall_rating ? ` · ${row.overall_rating}/5` : ''
      return {
        id: row.id,
        date: row.evaluation_date,
        text: es.value
          ? `Nueva evaluación${rating}`
          : `New assessment${rating}`,
      }
    })
  } catch (e) {
    console.error('staff dashboard load:', e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadDashboard()
  loadPastSessions()
})

const quickOpen = ref(false)

const quickActions = computed(() => {
  const items = [
    {
      id: 'coach',
      label: es.value ? 'Invitar coach' : 'Invite coach',
      href: '/member/admin/scheduling/coaches',
      icon: 'users',
      adminOnly: true,
    },
    {
      id: 'family',
      label: es.value ? 'Invitar familia' : 'Invite family',
      href: '/member/admin/academy/users',
      icon: 'users',
      adminOnly: true,
    },
    {
      id: 'enroll',
      label: es.value ? 'Inscribir patinador' : 'Enroll athlete',
      href: isAdmin.value ? '/member/admin/academy/users' : '/member/coach/students',
      icon: 'user-plus',
    },
    {
      id: 'session',
      label: es.value ? 'Iniciar sesión' : 'Start session',
      href: '/member/coach/plans',
      icon: 'play',
    },
  ]
  return items.filter(a => !a.adminOnly || isAdmin.value)
})
</script>

<template>
  <div class="min-h-full bg-black text-white">
    <MemberStaffPageHeader
      :title="`${greeting}, ${firstName}`"
      :subtitle="`${snapshot.athletes} ${es ? 'patinadores' : 'athletes'} · ${snapshot.coaches} coaches · ${todayLabel}`"
    />
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-8 space-y-6">

      <div v-if="loading" class="flex justify-center py-20">
        <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>

      <template v-else>
        <!-- Today's schedule -->
        <section class="rounded-2xl bg-gray-900 border border-gray-800 p-5 sm:p-6 grid lg:grid-cols-2 gap-6">
          <div class="min-w-0">
          <div class="flex items-center justify-between gap-2 mb-4">
            <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
              {{ es ? 'Últimas sesiones' : 'Latest sessions' }}
            </p>
            <NuxtLink
              to="/member/staff/sessions"
              class="text-[11px] font-semibold text-gray-400 hover:text-acid"
            >
              {{ es ? 'Ver todas' : 'View all' }}
            </NuxtLink>
          </div>

          <div v-if="!todaySessions.length" class="py-8 text-center">
            <div class="text-4xl mb-3 opacity-40" aria-hidden="true">📅</div>
            <p class="text-gray-400 text-sm">
              {{ es ? 'No hay sesiones programadas para hoy' : 'No sessions scheduled for today' }}
            </p>
            <NuxtLink
              :to="isAdmin ? '/member/admin/scheduling/calendar' : '/member/coach/plans'"
              class="inline-flex mt-5 px-5 py-2.5 rounded-xl border border-gray-600 text-sm font-semibold text-gray-200 hover:border-gold-500/50 hover:text-gold-400 transition-colors"
            >
              {{ es ? 'Programar sesión' : 'Schedule a session' }}
            </NuxtLink>
          </div>

          <ul v-else class="space-y-3">
            <li
              v-for="session in todaySessions"
              :key="session.id"
            >
              <NuxtLink
                :to="`/member/staff/sessions/${session.id}`"
                class="flex items-start justify-between gap-3 rounded-xl bg-gray-950 border border-gray-800 px-4 py-3 hover:border-gray-600"
              >
              <div class="min-w-0">
                <p class="font-semibold text-white truncate">{{ session.title }}</p>
                <p class="text-xs text-gray-500 mt-0.5">
                  {{ sessionTypeLabel(session.event_type) }}
                  <span v-if="session.skatepark"> · {{ session.skatepark }}</span>
                </p>
              </div>
              <span v-if="formatSessionTime(session)" class="text-sm font-mono text-gray-400 shrink-0">
                {{ formatSessionTime(session) }}
              </span>
              </NuxtLink>
            </li>
          </ul>
          </div>

          <!-- Past classes -->
          <div class="min-w-0 lg:border-l lg:border-gray-800 lg:pl-6">
            <div class="flex items-center justify-between gap-2 mb-4">
              <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500">
                {{ es ? 'Clases pasadas' : 'Past classes' }}
              </p>
              <NuxtLink
                v-if="isAdmin"
                to="/member/admin/scheduling/coach-activity"
                class="text-[11px] font-semibold text-gray-400 hover:text-acid"
              >
                {{ es ? 'Actividad →' : 'Activity →' }}
              </NuxtLink>
            </div>

            <p v-if="pastLoading && !pastSessions.length" class="text-sm text-gray-500 py-6 text-center">
              {{ es ? 'Cargando…' : 'Loading…' }}
            </p>
            <p v-else-if="!pastSessions.length" class="text-sm text-gray-500 py-6 text-center">
              {{ es ? 'Sin clases en los últimos 30 días.' : 'No classes in the last 30 days.' }}
            </p>

            <template v-else>
              <ul
                ref="pastList"
                class="space-y-2"
                :class="pastVisibleCount > RECENT_PAST_COUNT ? 'past-scroll overflow-y-auto pr-1' : ''"
              >
                <li v-for="s in visiblePast" :key="s.id">
                  <NuxtLink
                    :to="`/member/staff/sessions/${s.id}`"
                    class="flex items-center justify-between gap-3 rounded-xl bg-gray-950 border border-gray-800 px-4 py-2.5 hover:border-gray-600"
                  >
                    <div class="min-w-0">
                      <p class="text-sm font-semibold text-white truncate">{{ s.title }}</p>
                      <p class="text-xs text-gray-500 mt-0.5">
                        {{ format(parseISO(s.start_date), 'EEE d MMM', { locale: es ? esLocale : undefined }) }}
                        <span v-if="pastTime(s)"> · {{ pastTime(s) }}</span>
                      </p>
                    </div>
                    <span
                      class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      :class="pastChipClass(pastStatus(s))"
                    >
                      {{ pastStatusLabel(pastStatus(s)) }}
                    </span>
                  </NuxtLink>
                </li>
              </ul>

              <div class="mt-3 flex items-center gap-3">
                <button
                  v-if="pastHasMore"
                  type="button"
                  class="shrink-0 rounded-lg border border-gray-700 px-3 py-2 text-lg leading-none text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50"
                  :title="es ? 'Ver 3 clases más' : 'Show 3 more classes'"
                  :aria-label="es ? 'Ver 3 clases más' : 'Show 3 more classes'"
                  :disabled="pastLoading"
                  @click="showMorePast"
                >
                  {{ pastLoading ? '…' : '+' }}
                </button>
                <p v-else class="text-[11px] text-gray-600">
                  {{ es ? 'No hay más clases.' : 'No more classes.' }}
                </p>
              </div>
            </template>
          </div>
        </section>

        <!-- Bottom grid -->
        <div class="grid lg:grid-cols-3 gap-4 sm:gap-5">
          <!-- Needs attention -->
          <section class="rounded-2xl bg-gray-900 border border-gray-800 p-5">
            <div class="flex items-center gap-2 mb-4">
              <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">
                {{ es ? 'Requiere atención' : 'Needs attention' }}
              </p>
              <span
                v-if="attentionItems.length"
                class="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500/15 text-[11px] font-bold text-amber-400"
              >
                {{ attentionItems.length }}
              </span>
            </div>
            <ul v-if="attentionItems.length" class="space-y-3 text-sm">
              <li v-for="item in attentionItems" :key="item.id">
                <NuxtLink :to="item.href" class="block rounded-xl border border-gray-800 bg-gray-950 px-3 py-2.5 hover:border-amber-500/40">
                  <p class="text-[11px] font-semibold text-amber-400">{{ item.area }} → {{ item.where }}</p>
                  <p class="mt-0.5 text-gray-200">{{ item.label }}</p>
                </NuxtLink>
              </li>
            </ul>
            <p v-else class="text-sm text-gray-500">
              {{ es ? 'Todo al día — nada pendiente.' : 'All caught up — nothing pending.' }}
            </p>
          </section>

          <!-- Recent highlights -->
          <section class="rounded-2xl bg-gray-900 border border-gray-800 p-5">
            <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 mb-4">
              {{ es ? 'Destacados recientes' : 'Recent highlights' }}
            </p>
            <ul v-if="highlights.length" class="space-y-3 text-sm">
              <li v-for="item in highlights" :key="item.id" class="text-gray-300">
                <span class="text-gray-500 text-xs block mb-0.5">{{ item.date }}</span>
                {{ item.text }}
              </li>
            </ul>
            <div v-else class="py-6 text-center">
              <div class="text-2xl mb-2 text-gray-600" aria-hidden="true">★</div>
              <p class="text-sm text-gray-500 leading-relaxed">
                {{
                  es
                    ? 'Aún no hay destacados esta semana. Evaluaciones y logros aparecerán aquí.'
                    : 'No highlights this week yet. Assessments and milestones appear here.'
                }}
              </p>
            </div>
          </section>

          <!-- Quick actions + snapshot -->
          <section class="rounded-2xl bg-gray-900 border border-gray-800 p-5 space-y-5">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 mb-3">
                {{ es ? 'Acciones rápidas' : 'Quick actions' }}
              </p>
              <div class="space-y-2">
                <NuxtLink
                  v-for="action in quickActions"
                  :key="action.id"
                  :to="action.href"
                  class="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-gray-950 border border-gray-800 hover:border-gray-700 hover:bg-gray-800 text-sm font-medium text-gray-200 transition-colors"
                >
                  <span class="w-5 h-5 flex items-center justify-center text-gray-500" aria-hidden="true">
                    <svg v-if="action.icon === 'play'" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <svg v-else-if="action.icon === 'user-plus'" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  </span>
                  {{ action.label }}
                </NuxtLink>
              </div>
            </div>

            <div class="pt-4 border-t border-gray-800">
              <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 mb-3">
                {{ es ? 'Resumen del programa' : 'Program snapshot' }}
              </p>
              <ul class="space-y-1.5 text-sm text-gray-400">
                <li>
                  {{ snapshot.athletes }} {{ es ? 'patinadores' : 'athletes' }}
                  · {{ snapshot.coaches }} {{ es ? 'coaches' : 'coaches' }}
                </li>
                <li>
                  {{ snapshot.sessionsThisWeek }}
                  {{ es ? 'sesiones esta semana' : 'sessions this week' }}
                </li>
                <li>
                  {{
                    snapshot.attendancePct != null
                      ? `${snapshot.attendancePct}% ${es ? 'asistencia promedio' : 'avg attendance'}`
                      : es
                        ? 'Asistencia — sin datos aún'
                        : 'Attendance — no data yet'
                  }}
                </li>
              </ul>
            </div>
          </section>
        </div>
      </template>
    </div>

    <button
      v-if="quickOpen"
      type="button"
      class="fixed inset-0 z-40 bg-transparent"
      :aria-label="es ? 'Cerrar acciones' : 'Close actions'"
      @click="quickOpen = false"
    />
    <div class="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      <div v-if="quickOpen" class="flex flex-col items-end gap-2 mb-1">
        <NuxtLink
          v-for="action in quickActions"
          :key="'fab-' + action.id"
          :to="action.href"
          class="flex items-center gap-3 rounded-2xl border border-charcoal-600 bg-charcoal-800 px-4 py-3 text-sm font-semibold text-cream shadow-lg hover:border-acid"
          @click="quickOpen = false"
        >
          {{ action.label }}
          <span class="w-5 h-5 flex items-center justify-center text-cream/70" aria-hidden="true">
            <svg v-if="action.icon === 'play'" class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </span>
        </NuxtLink>
      </div>
      <button
        type="button"
        class="w-14 h-14 rounded-full bg-acid text-charcoal text-3xl leading-none font-light shadow-xl hover:bg-acid-300"
        :aria-expanded="quickOpen"
        :aria-label="quickOpen ? (es ? 'Cerrar acciones' : 'Close actions') : (es ? 'Acciones rápidas' : 'Quick actions')"
        @click="quickOpen = !quickOpen"
      >
        {{ quickOpen ? '×' : '+' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Three cards tall; older classes scroll inside. */
.past-scroll {
  max-height: 14rem;
  scrollbar-width: thin;
}
</style>
