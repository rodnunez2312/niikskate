<script setup lang="ts">
import { format, startOfWeek, endOfWeek, subDays } from 'date-fns'
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

type AttentionItem = {
  id: string
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
        label: es.value
          ? `${pendingPay} reserva${pendingPay === 1 ? '' : 's'} con pago pendiente`
          : `${pendingPay} reservation${pendingPay === 1 ? '' : 's'} pending payment`,
        href: '/member/admin/payments',
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

onMounted(loadDashboard)

const quickActions = computed(() => {
  const items = [
    {
      id: 'session',
      label: es.value ? 'Iniciar sesión' : 'Start session',
      href: isAdmin.value ? '/member/admin/scheduling/attendance' : '/member/coach/plans',
      icon: 'play',
    },
    {
      id: 'enroll',
      label: es.value ? 'Inscribir patinador' : 'Enroll athlete',
      href: isAdmin.value ? '/member/admin/academy/registrations' : '/member/coach/students',
      icon: 'user-plus',
    },
    {
      id: 'family',
      label: es.value ? 'Invitar familia' : 'Invite family',
      href: '/member/admin/academy/registrations',
      adminOnly: true,
    },
    {
      id: 'coach',
      label: es.value ? 'Invitar coach' : 'Invite coach',
      href: '/member/admin/scheduling/coaches',
      adminOnly: true,
    },
  ]
  return items.filter(a => !a.adminOnly || isAdmin.value)
})
</script>

<template>
  <div class="min-h-full bg-black text-white">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 lg:py-8 space-y-6">
      <!-- Header -->
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-white">
          {{ greeting }}, {{ firstName }}.
        </h1>
        <p class="mt-1 text-sm text-gray-400">
          {{ snapshot.athletes }} {{ es ? 'patinadores' : 'athletes' }}
          · {{ snapshot.coaches }} {{ es ? 'coaches' : 'coaches' }}
          <span class="text-gray-500">· {{ todayLabel }}</span>
        </p>
      </div>

      <div v-if="loading" class="flex justify-center py-20">
        <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>

      <template v-else>
        <!-- Today's schedule -->
        <section class="rounded-2xl bg-gray-900 border border-gray-800 p-5 sm:p-6">
          <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500 mb-4">
            {{ es ? 'Horario de hoy' : "Today's schedule" }}
          </p>

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
              class="flex items-start justify-between gap-3 rounded-xl bg-gray-950 border border-gray-800 px-4 py-3"
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
            </li>
          </ul>
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
            <ul v-if="attentionItems.length" class="space-y-2 text-sm">
              <li v-for="item in attentionItems" :key="item.id">
                <NuxtLink :to="item.href" class="text-gray-300 hover:text-amber-400 underline-offset-2 hover:underline">
                  · {{ item.label }}
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
  </div>
</template>
