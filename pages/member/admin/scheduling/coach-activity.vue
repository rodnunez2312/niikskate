<script setup lang="ts">
import { format, startOfWeek, endOfWeek, addWeeks, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import type { CoachActivityCoach, CoachActivityResponse } from '~/server/api/admin/coach-activity.get'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()
const esLang = computed(() => language.value === 'es')

const isAdmin = ref(false)
const checkingRole = ref(true)
const loading = ref(false)
const loadError = ref('')
const data = ref<CoachActivityResponse | null>(null)

const tab = ref<'overview' | 'scorecard'>('overview')
const programFilter = ref('')
const periodKey = ref<'week' | 'month' | 'quarter'>('week')
/** 0 is the current week, month, or quarter. Arrows move this. */
const periodOffset = ref(0)
const selectedCoachId = ref('')
/** How many older months sit to the right of the current one. */
const historyMonths = ref(0)

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')

function rangeFor(key: 'week' | 'month' | 'quarter', offset: number) {
  const today = new Date()
  if (key === 'month') {
    const start = startOfMonth(addMonths(today, offset))
    return { from: start, to: endOfMonth(start) }
  }
  if (key === 'quarter') {
    const end = endOfMonth(addMonths(startOfMonth(today), offset * 3))
    const start = startOfMonth(subMonths(end, 2))
    return { from: start, to: end }
  }
  const start = startOfWeek(addWeeks(today, offset), { weekStartsOn: 1 })
  return { from: start, to: endOfWeek(start, { weekStartsOn: 1 }) }
}

/** This week is Monday through Sunday. Arrows step a whole week, month, or quarter. */
const period = computed(() => {
  const range = rangeFor(periodKey.value, periodOffset.value)
  return { from: ymd(range.from), to: ymd(range.to) }
})

const PERIOD_KINDS = [
  { key: 'week' as const, es: 'Semana', en: 'Week' },
  { key: 'month' as const, es: 'Mes', en: 'Month' },
  { key: 'quarter' as const, es: '3 meses', en: '3 months' },
]

const periodLabel = computed(() => {
  const locale = esLang.value ? es : undefined
  const { from, to } = rangeFor(periodKey.value, periodOffset.value)
  if (periodKey.value === 'month') {
    const label = format(from, 'MMMM yyyy', { locale })
    return label.charAt(0).toUpperCase() + label.slice(1)
  }
  if (periodKey.value === 'quarter') {
    return `${format(from, 'MMM', { locale })} – ${format(to, 'MMM yyyy', { locale })}`
  }
  const sameMonth = from.getMonth() === to.getMonth()
  return sameMonth
    ? `${format(from, 'd', { locale })} – ${format(to, 'd MMM yyyy', { locale })}`
    : `${format(from, 'd MMM', { locale })} – ${format(to, 'd MMM yyyy', { locale })}`
})

function shiftPeriod(delta: number) {
  periodOffset.value += delta
}

let loadSeq = 0
const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = ''
  try {
    const { data: session } = await client.auth.getSession()
    const token = session.session?.access_token
    if (!token) throw new Error(esLang.value ? 'Sesión expirada' : 'Session expired')

    const next = await $fetch<CoachActivityResponse>('/api/admin/coach-activity', {
      headers: { Authorization: `Bearer ${token}` },
      query: {
        from: period.value.from,
        to: period.value.to,
        program: programFilter.value || undefined,
        historyMonths: historyMonths.value,
      },
    })
    if (seq !== loadSeq) return
    data.value = next
    if (!selectedCoachId.value && next.coaches.length) {
      selectedCoachId.value = next.coaches[0].id
    }
  } catch (e: any) {
    if (seq === loadSeq) loadError.value = e?.data?.message || e?.message || 'Error'
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/member/admin/scheduling/coach-activity')
    return
  }
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if (profile?.role !== 'admin') {
    router.push('/')
    return
  }
  isAdmin.value = true
  checkingRole.value = false
  await load()
})

watch(periodKey, () => {
  if (periodOffset.value !== 0) periodOffset.value = 0
})

watch([periodKey, programFilter, periodOffset], () => {
  historyMonths.value = 0
  load()
})
const weeksLoading = ref(false)

/** Older months are appended inside Clases por semana. The rest of the page stays put. */
async function loadOlderMonth() {
  if (weeksLoading.value) return
  weeksLoading.value = true
  const nextMonths = historyMonths.value + 1
  try {
    const { data: session } = await client.auth.getSession()
    const token = session.session?.access_token
    if (!token) return
    const next = await $fetch<CoachActivityResponse>('/api/admin/coach-activity', {
      headers: { Authorization: `Bearer ${token}` },
      query: {
        from: period.value.from,
        to: period.value.to,
        program: programFilter.value || undefined,
        historyMonths: nextMonths,
      },
    })
    if (data.value) data.value = { ...data.value, nearby: next.nearby }
    historyMonths.value = nextMonths
  } catch (e: any) {
    loadError.value = e?.data?.message || e?.message || 'Error'
  } finally {
    weeksLoading.value = false
  }
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

const coaches = computed(() => data.value?.coaches ?? [])
const totals = computed(() => data.value?.totals)

const contributionTotals = computed(() => [
  { key: 'evaluations' as const, value: totals.value?.evaluations ?? 0, label: esLang.value ? 'Evaluaciones completadas' : 'Assessments completed' },
  { key: 'videos' as const, value: totals.value?.videos ?? 0, label: esLang.value ? 'Videos subidos' : 'Videos uploaded' },
  { key: 'classes_given' as const, value: totals.value?.classes_given ?? 0, label: esLang.value ? 'Clases dadas' : 'Classes given' },
  { key: 'tricks_marked' as const, value: totals.value?.tricks_marked ?? 0, label: esLang.value ? 'Trucos marcados' : 'Tricks marked' },
])

type MetricKey = 'classes_given' | 'evaluations' | 'videos' | 'class_plans' | 'tricks_marked'

/** null ranks coaches by the sum of every module. */
const contributionMetric = ref<MetricKey | null>(null)
const CONTRIBUTION_KEYS = ['evaluations', 'videos', 'classes_given', 'tricks_marked'] as const

function toggleContributionMetric(key: MetricKey) {
  contributionMetric.value = contributionMetric.value === key ? null : key
}
const contributors = computed(() => {
  const key = contributionMetric.value
  const valueOf = (c: CoachActivityCoach) =>
    key ? c[key] : CONTRIBUTION_KEYS.reduce((n, k) => n + c[k], 0)
  const rows = [...coaches.value].sort((a, b) => valueOf(b) - valueOf(a))
  const max = Math.max(1, ...rows.map(valueOf))
  return rows.map(c => ({ coach: c, value: valueOf(c), pct: Math.round((valueOf(c) / max) * 100) }))
})

const selectedCoach = computed(
  () => coaches.value.find(c => c.id === selectedCoachId.value) ?? null,
)

const nearby = computed(() => data.value?.nearby ?? [])
const PILL_COLORS = ['bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-orange-500']

function pillColor(id: string, name?: string) {
  const ordered = [...coaches.value].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  let index = ordered.findIndex(coach => coach.id === id)
  if (index < 0 && name) {
    const wanted = name.trim().toLowerCase()
    index = ordered.findIndex(coach => coach.name.trim().toLowerCase() === wanted)
  }
  const slot = index >= 0 ? index : ordered.length
  return PILL_COLORS[slot % PILL_COLORS.length]
}

function oldestMonthStart(today: string, back: number) {
  const [y, m] = today.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 10)
}

function mondayOf(key: string) {
  const [y, m, d] = key.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const back = dow === 0 ? 6 : dow - 1
  return new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10)
}

function shiftKey(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

const weekColumns = computed(() => {
  const locale = esLang.value ? es : undefined
  const thisMonday = mondayOf(period.value.to)
  const oldest = oldestMonthStart(period.value.to, historyMonths.value)
  const starts = new Set<string>([thisMonday])
  const lastMonday = shiftKey(thisMonday, -7)
  if (lastMonday >= oldest) starts.add(lastMonday)
  for (const row of nearby.value) {
    if (row.weekStart >= oldest) starts.add(row.weekStart)
  }
  const ordered = [...starts].sort((a, b) => {
    if (a === thisMonday) return -1
    if (b === thisMonday) return 1
    return b.localeCompare(a)
  })
  return ordered.map(start => {
    const rows = nearby.value.filter(row => row.weekStart === start)
    const byDate = new Map<string, typeof rows>()
    for (const row of rows) {
      const list = byDate.get(row.date) || []
      list.push(row)
      byDate.set(row.date, list)
    }
    const end = shiftKey(start, 6)
    const range = `${format(new Date(`${start}T00:00:00`), 'd MMM', { locale })}`
    const title = start === thisMonday
      ? (esLang.value ? 'Esta semana' : 'This week')
      : start === shiftKey(thisMonday, -7)
        ? (esLang.value ? 'Semana pasada' : 'Last week')
        : range
    return {
      id: start,
      current: start === thisMonday,
      title,
      range: format(new Date(`${end}T00:00:00`), 'd MMM', { locale }),
      done: rows.filter(row => row.status === 'done').length,
      cancelled: rows.filter(row => row.status === 'cancelled').length,
      open: rows.filter(row => row.status === 'open').length,
      classCount: rows.length,
      days: [...byDate.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, classes]) => ({
          date,
          label: format(new Date(`${date}T00:00:00`), 'EEE d', { locale }),
          classes,
        })),
    }
  })
})

function chipClass(status: 'done' | 'cancelled' | 'open' | 'upcoming', currentWeek = false) {
  if (status === 'done') return 'bg-acid text-charcoal'
  if (currentWeek && status !== 'cancelled') return 'bg-transparent text-gray-200 border border-gray-700'
  if (status === 'open') return 'bg-gray-500 text-white'
  if (status === 'cancelled') return 'bg-transparent text-gray-500 line-through border border-gray-700'
  return 'bg-gray-800 text-gray-300 border border-gray-700'
}

const needsFollowThrough = computed(() =>
  coaches.value.filter(c => c.classes_without_notes > 0),
)

const idleCoaches = computed(() =>
  coaches.value.filter(
    c =>
      c.is_active &&
      c.classes_given + c.evaluations + c.videos + c.class_plans + c.tricks_marked === 0,
  ),
)

function lastActiveLabel(c: CoachActivityCoach): string {
  if (!c.last_active) return esLang.value ? 'Sin actividad' : 'No activity'
  return format(new Date(`${c.last_active}T00:00:00`), 'd MMM yyyy', {
    locale: esLang.value ? es : undefined,
  })
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('')
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Quote every field so names with commas survive the round trip. */
function csvCell(v: string | number | boolean | null): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`
}

function exportCsv() {
  const d = data.value
  if (!d) return
  const header = [
    'Coach',
    'Email',
    esLang.value ? 'Programas' : 'Programs',
    esLang.value ? 'Activo' : 'Active',
    esLang.value ? 'Clases dadas' : 'Classes given',
    esLang.value ? 'Clases canceladas' : 'Classes cancelled',
    esLang.value ? 'Skaters atendidos' : 'Athletes taught',
    esLang.value ? 'Evaluaciones' : 'Evaluations',
    esLang.value ? 'Videos' : 'Videos',
    esLang.value ? 'Planes de clase' : 'Class plans',
    esLang.value ? 'Trucos marcados' : 'Tricks marked',
    esLang.value ? 'Asistencias marcadas' : 'Attendance marked',
    esLang.value ? 'Clases sin nota' : 'Classes without notes',
    esLang.value ? 'Última actividad' : 'Last active',
  ]
  const lines = [
    header.map(csvCell).join(','),
    ...d.coaches.map(c =>
      [
        c.name,
        c.email,
        c.programs.join(' / '),
        c.is_active ? 'Si' : 'No',
        c.classes_given,
        c.classes_cancelled,
        c.athletes_taught,
        c.evaluations,
        c.videos,
        c.class_plans,
        c.tricks_marked,
        c.attendance_marked,
        c.classes_without_notes,
        c.last_active ?? '',
      ]
        .map(csvCell)
        .join(','),
    ),
  ]
  // BOM so Excel opens the accents correctly.
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `coach-activity-${d.from}-${d.to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="min-h-screen bg-black">
    <div v-if="checkingRole" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-gray-400">{{ esLang ? 'Cargando...' : 'Loading...' }}</p>
      </div>
    </div>

    <template v-else-if="isAdmin">
    <MemberStaffPageHeader
      :title="esLang ? 'Actividad' : 'Activity'"
      :subtitle="esLang ? 'Mira el trabajo, reconoce el esfuerzo y sabe dónde ayudar.' : 'See the work, recognize the effort, and know where to help.'"
    >
      <template #actions>
        <button
          type="button"
          class="px-4 py-2.5 rounded-xl border border-gray-700 text-gray-200 text-sm font-semibold"
          @click="exportCsv"
        >
          {{ esLang ? 'Exportar CSV' : 'Export CSV' }}
        </button>
      </template>
    </MemberStaffPageHeader>
    <div class="px-4 py-6 max-w-5xl mx-auto space-y-5 pb-16">

      <!-- Tabs + filters -->
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="inline-flex rounded-xl border border-gray-800 bg-gray-900 p-0.5">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            :class="tab === 'overview' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'"
            @click="tab = 'overview'"
          >
            {{ esLang ? 'Vista del equipo' : 'Team overview' }}
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            :class="tab === 'scorecard' ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'"
            @click="tab = 'scorecard'"
          >
            {{ esLang ? 'Ficha por coach' : 'Coach scorecard' }}
          </button>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <select
            v-model="programFilter"
            class="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm outline-none focus:border-teal-500"
          >
            <option value="">{{ esLang ? 'Todos los programas' : 'All programs' }}</option>
            <option v-for="p in data?.programs || []" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
      </div>

      <div class="flex items-center gap-3 flex-wrap -mt-1">
        <div class="inline-flex rounded-lg border border-gray-800 p-0.5">
          <button
            v-for="kind in PERIOD_KINDS"
            :key="kind.key"
            type="button"
            class="px-2.5 py-1 rounded-md text-xs font-medium transition-colors"
            :class="periodKey === kind.key ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'"
            @click="periodKey = kind.key"
          >
            {{ esLang ? kind.es : kind.en }}
          </button>
        </div>

        <div class="flex items-center gap-1">
          <button
            type="button"
            class="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5"
            :aria-label="esLang ? 'Periodo anterior' : 'Previous period'"
            @click="shiftPeriod(-1)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <p class="min-w-[11rem] text-center text-sm font-semibold text-white tabular-nums">{{ periodLabel }}</p>
          <button
            type="button"
            class="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5"
            :aria-label="esLang ? 'Periodo siguiente' : 'Next period'"
            @click="shiftPeriod(1)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            v-if="periodOffset !== 0"
            type="button"
            class="ml-1 text-xs text-gray-500 hover:text-white"
            @click="periodOffset = 0"
          >
            {{ esLang ? 'Hoy' : 'Today' }}
          </button>
          <span v-if="loading && totals" class="ml-2 text-xs text-gray-600">{{ esLang ? 'Actualizando…' : 'Updating…' }}</span>
        </div>
      </div>

      <p v-if="loadError" class="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
        {{ loadError }}
      </p>

      <div v-else-if="loading && !totals" class="rounded-xl border border-gray-800 bg-gray-900 px-4 py-10 text-center">
        <p class="text-sm text-gray-500">{{ esLang ? 'Cargando…' : 'Loading…' }}</p>
      </div>

      <template v-else-if="totals">
        <!-- Team overview -->
        <div v-show="tab === 'overview'" class="space-y-4">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs text-gray-400">{{ esLang ? 'Clases dadas' : 'Classes given' }}</p>
              <p class="text-3xl font-bold text-white mt-1">
                {{ totals.classes_given }}<span class="text-gray-600 text-xl"> / {{ totals.classes_in_period }}</span>
              </p>
              <p class="text-[11px] text-acid mt-1">
                {{ totals.classes_cancelled }} {{ esLang ? 'canceladas' : 'cancelled' }}
              </p>
              <p class="text-[11px] text-gray-600 mt-1">
                {{ esLang ? 'Marcadas hechas por el coach' : 'Marked done by the coach' }}
              </p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs text-gray-400">{{ esLang ? 'Videos subidos' : 'Videos uploaded' }}</p>
              <p class="text-3xl font-bold text-white mt-1">{{ totals.videos }}</p>
              <p class="text-[11px] text-gray-600 mt-1">
                {{ esLang
                  ? `${totals.session_videos} de sesión · ${totals.evaluation_videos} de evaluaciones`
                  : `${totals.session_videos} from sessions · ${totals.evaluation_videos} from evaluations` }}
              </p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs text-gray-400">{{ esLang ? 'Skaters con progreso' : 'Athletes with progress' }}</p>
              <p class="text-3xl font-bold text-white mt-1">
                {{ totals.athletes_with_progress }}<span class="text-gray-600 text-xl"> / {{ totals.active_skaters }}</span>
              </p>
              <p class="text-[11px] text-gray-600 mt-1">
                {{ esLang ? 'Con clase comprada o asignada en el período, y al menos un truco marcado' : 'With a class bought or assigned in this period, and at least one trick marked' }}
              </p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs text-gray-400">{{ esLang ? 'Coaches activos' : 'Coaches contributing' }}</p>
              <p class="text-3xl font-bold text-white mt-1">
                {{ totals.coaches_contributing }}<span class="text-gray-600 text-xl"> / {{ totals.coaches_total }}</span>
              </p>
              <p class="text-[11px] text-gray-600 mt-1">
                {{ esLang ? 'Asignados a una clase en el período, con trabajo registrado' : 'Assigned to a class in this period, with recorded work' }}
              </p>
            </div>
          </div>

          <div class="grid lg:grid-cols-2 gap-4">
            <!-- Contributors -->
            <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div class="flex items-start justify-between gap-3 mb-3">
                <h2 class="text-base font-semibold text-white">
                  {{ esLang ? 'Quién hizo qué' : 'Top contributors' }}
                </h2>
                <button
                  v-if="contributionMetric"
                  type="button"
                  class="text-xs text-gray-400 hover:text-white shrink-0"
                  @click="contributionMetric = null"
                >
                  {{ esLang ? 'Ver todo' : 'Show all' }}
                </button>
                <span v-else class="text-xs text-gray-500 shrink-0">
                  {{ esLang ? 'Toda la actividad' : 'All activity' }}
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2 mb-4">
                <button
                  v-for="stat in contributionTotals"
                  :key="stat.key"
                  type="button"
                  class="rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-500"
                  :class="contributionMetric === stat.key
                    ? 'border-gray-400 bg-white/[0.06]'
                    : 'border-gray-800 bg-gray-950/40 hover:border-gray-600'"
                  :aria-pressed="contributionMetric === stat.key"
                  @click="toggleContributionMetric(stat.key)"
                >
                  <p class="text-xl font-bold" :class="contributionMetric === stat.key ? 'text-acid' : 'text-white'">{{ stat.value }}</p>
                  <p class="text-[11px] mt-0.5" :class="contributionMetric === stat.key ? 'text-gray-200' : 'text-gray-500'">{{ stat.label }}</p>
                </button>
              </div>

              <p v-if="contributors.length === 0" class="text-sm text-gray-500 py-6 text-center">
                {{ esLang ? 'No hay coaches en este filtro.' : 'No coaches match this filter.' }}
              </p>

              <ul v-else class="space-y-2">
                <li
                  v-for="row in contributors"
                  :key="row.coach.id"
                  class="flex items-center gap-3"
                >
                  <span
                    class="w-7 h-7 rounded-full text-[11px] font-bold text-white flex items-center justify-center shrink-0"
                    :class="pillColor(row.coach.id)"
                  >
                    {{ initials(row.coach.name) }}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-sm text-white truncate">{{ row.coach.name }}</p>
                      <span class="text-sm font-semibold text-white shrink-0">{{ row.value }}</span>
                    </div>
                    <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
                      <div
                        class="h-full rounded-full transition-all"
                        :class="row.value > 0 ? 'bg-teal-500' : 'bg-gray-700'"
                        :style="{ width: `${Math.max(row.pct, row.value > 0 ? 6 : 2)}%` }"
                      />
                    </div>
                  </div>
                </li>
              </ul>
            </section>

            <div class="space-y-4">
              <!-- Weekly chart -->
              <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <h2 class="text-base font-semibold text-white">
                  {{ esLang ? 'Clases por semana' : 'Classes by week' }}
                </h2>
                <p class="text-xs text-gray-500 mt-0.5 mb-3">
                  {{ esLang
                    ? 'Gris sin marcar · verde hecha, cuenta para el pago · neutro si aún está programada.'
                    : 'Gray is unmarked · lime is done and counts for pay · neutral is still scheduled.' }}
                </p>

                <div class="week-board">
                  <div class="flex gap-3 items-start min-w-max pr-1">
                    <div v-for="week in weekColumns" :key="week.id" class="w-64 shrink-0">
                      <div class="sticky top-0 z-10 bg-gray-900 pb-1">
                        <div class="flex items-center justify-between gap-2">
                          <p class="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                            {{ week.title }}
                          </p>
                          <p class="text-[11px] text-gray-500 shrink-0">
                            {{ esLang ? 'Hechas' : 'Done' }} <span class="font-semibold text-acid">{{ week.done }}</span>
                          </p>
                        </div>
                        <p class="flex flex-wrap gap-x-2.5 text-[11px] text-gray-500 min-h-[1rem]">
                          <span v-if="week.cancelled">{{ esLang ? 'Canceladas' : 'Cancelled' }} <span class="font-semibold text-red-400">{{ week.cancelled }}</span></span>
                          <span v-if="week.open">{{ esLang ? 'Sin marcar' : 'Unmarked' }} <span class="font-semibold text-gray-300">{{ week.open }}</span></span>
                        </p>
                      </div>
                      <p v-if="week.days.length === 0" class="text-[11px] text-gray-600">
                        {{ esLang ? 'Sin clases' : 'No classes' }}
                      </p>
                      <div v-for="day in week.days" :key="day.date" class="mb-2">
                        <p class="text-[10px] uppercase text-gray-500 mb-1">{{ day.label }}</p>
                        <div class="space-y-1">
                          <NuxtLink
                            v-for="row in day.classes"
                            :key="row.id"
                            :to="`/member/staff/sessions/${row.id}`"
                            class="block w-full rounded px-1.5 py-1 text-left"
                            :class="chipClass(row.status, week.current)"
                            :title="row.title"
                          >
                            <span class="flex items-center gap-1 text-[10px] font-semibold leading-tight">
                              <span>{{ row.time }}</span>
                              <span
                                v-for="pill in row.pills"
                                :key="pill.id"
                                class="inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                                :class="pillColor(pill.id, pill.name)"
                                :title="pill.name"
                              >{{ pill.initials }}</span>
                            </span>
                            <span class="block text-[10px] leading-tight truncate opacity-80">{{ row.title }}</span>
                          </NuxtLink>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="shrink-0 self-start rounded-lg border border-gray-700 px-3 py-2 text-lg leading-none text-gray-300 hover:border-gray-500 hover:text-white disabled:opacity-50"
                      :title="esLang ? 'Mes anterior' : 'Previous month'"
                      :disabled="weeksLoading"
                      @click="loadOlderMonth"
                    >
                      {{ weeksLoading ? '…' : '+' }}
                    </button>
                  </div>
                </div>
              </section>

              <!-- Follow-through -->
              <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <h2 class="text-base font-semibold text-white">
                  {{ esLang ? 'Un poco de seguimiento' : 'A little follow-through' }}
                </h2>
                <p class="text-xs text-gray-500 mt-0.5 mb-3">
                  {{ esLang ? 'Clases dadas sin nota del coach' : 'Classes given without coach notes' }}
                </p>

                <p v-if="needsFollowThrough.length === 0" class="text-sm text-gray-500">
                  {{ esLang ? 'No faltan notas en este periodo.' : 'No missing notes in this period.' }}
                </p>
                <ul v-else class="space-y-1.5">
                  <li
                    v-for="c in needsFollowThrough"
                    :key="c.id"
                    class="flex items-center justify-between gap-2 text-sm"
                  >
                    <span class="text-gray-300 truncate">{{ c.name }}</span>
                    <span class="text-amber-400 font-medium shrink-0">
                      {{ c.classes_without_notes }} {{ esLang ? 'sin nota' : 'missing' }}
                    </span>
                  </li>
                </ul>

                <template v-if="idleCoaches.length">
                  <p class="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500 mb-1.5">
                    {{ esLang ? 'Sin actividad en el periodo' : 'No activity in this period' }}
                  </p>
                  <div class="flex flex-wrap gap-1.5">
                    <span
                      v-for="c in idleCoaches"
                      :key="c.id"
                      class="px-2 py-0.5 rounded-full text-[11px] bg-gray-800 text-gray-400"
                    >
                      {{ c.name }}
                    </span>
                  </div>
                </template>

                <p class="mt-3 pt-3 border-t border-gray-800 text-[11px] text-gray-600">
                  {{ esLang
                    ? 'Úsalo para iniciar una conversación, no como reprimenda.'
                    : 'Use these as conversation starters.' }}
                </p>
              </section>
            </div>
          </div>

        </div>

        <!-- Per-coach scorecard -->
        <div v-show="tab === 'scorecard'" class="space-y-4">
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="c in coaches"
              :key="c.id"
              type="button"
              class="px-3 py-1.5 rounded-full text-sm border transition-colors"
              :class="selectedCoachId === c.id
                ? 'border-teal-500/50 bg-teal-500/15 text-teal-300'
                : 'border-gray-800 text-gray-400 hover:border-gray-700 hover:text-gray-200'"
              @click="selectedCoachId = c.id"
            >
              {{ c.name }}
            </button>
          </div>

          <p v-if="!selectedCoach" class="text-sm text-gray-500">
            {{ esLang ? 'Elige un coach para ver su ficha.' : 'Pick a coach to see their scorecard.' }}
          </p>

          <template v-else>
            <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div class="flex items-start gap-3 flex-wrap">
                <img
                  v-if="selectedCoach.avatar_url"
                  :src="selectedCoach.avatar_url"
                  :alt="selectedCoach.name"
                  class="w-11 h-11 rounded-xl object-cover shrink-0"
                >
                <span
                  v-else
                  class="w-11 h-11 rounded-xl bg-gray-800 text-sm font-semibold text-gray-200 flex items-center justify-center shrink-0"
                >
                  {{ initials(selectedCoach.name) }}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h2 class="text-lg font-semibold text-white">{{ selectedCoach.name }}</h2>
                    <span
                      v-if="selectedCoach.is_head_coach"
                      class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400"
                    >
                      ★ Head
                    </span>
                    <span
                      v-if="!selectedCoach.is_active"
                      class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-800 text-gray-500"
                    >
                      {{ esLang ? 'Inactivo' : 'Inactive' }}
                    </span>
                  </div>
                  <p class="text-xs text-gray-400">
                    {{ selectedCoach.title || (esLang ? 'Coach' : 'Coach') }} · {{ selectedCoach.email }}
                  </p>
                  <div v-if="selectedCoach.programs.length" class="flex flex-wrap gap-1.5 mt-2">
                    <span
                      v-for="p in selectedCoach.programs"
                      :key="p"
                      class="px-2 py-0.5 rounded-full text-[11px] border border-teal-500/30 bg-teal-500/10 text-teal-300"
                    >
                      {{ p }}
                    </span>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-[11px] text-gray-500">{{ esLang ? 'Última actividad' : 'Last active' }}</p>
                  <p class="text-sm text-gray-300">{{ lastActiveLabel(selectedCoach) }}</p>
                </div>
              </div>
            </section>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p class="text-2xl font-bold text-white">{{ selectedCoach.classes_given }}</p>
                <p class="text-[11px] text-gray-500 mt-0.5">{{ esLang ? 'Clases dadas' : 'Classes given' }}</p>
                <p class="text-[11px] text-acid">{{ selectedCoach.classes_cancelled }} {{ esLang ? 'canceladas' : 'cancelled' }}</p>
              </div>
              <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p class="text-2xl font-bold text-white">{{ selectedCoach.athletes_taught }}</p>
                <p class="text-[11px] text-gray-500 mt-0.5">{{ esLang ? 'Skaters atendidos' : 'Athletes taught' }}</p>
              </div>
              <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p class="text-2xl font-bold text-white">{{ selectedCoach.evaluations }}</p>
                <p class="text-[11px] text-gray-500 mt-0.5">{{ esLang ? 'Evaluaciones' : 'Evaluations' }}</p>
              </div>
              <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p class="text-2xl font-bold text-white">{{ selectedCoach.videos }}</p>
                <p class="text-[11px] text-gray-500 mt-0.5">{{ esLang ? 'Videos subidos' : 'Videos uploaded' }}</p>
                <p class="text-[11px] text-gray-600">
                  {{ esLang
                    ? `${selectedCoach.session_videos} de sesión · ${selectedCoach.evaluation_videos} de evaluaciones`
                    : `${selectedCoach.session_videos} from sessions · ${selectedCoach.evaluation_videos} from evaluations` }}
                </p>
              </div>
              <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p class="text-2xl font-bold text-white">{{ selectedCoach.class_plans }}</p>
                <p class="text-[11px] text-gray-500 mt-0.5">{{ esLang ? 'Planes de clase' : 'Class plans' }}</p>
              </div>
              <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p class="text-2xl font-bold text-white">{{ selectedCoach.tricks_marked }}</p>
                <p class="text-[11px] text-gray-500 mt-0.5">{{ esLang ? 'Trucos marcados' : 'Tricks marked' }}</p>
              </div>
              <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p class="text-2xl font-bold text-white">{{ selectedCoach.attendance_marked }}</p>
                <p class="text-[11px] text-gray-500 mt-0.5">{{ esLang ? 'Asistencias marcadas' : 'Attendance marked' }}</p>
              </div>
              <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <p
                  class="text-2xl font-bold"
                  :class="selectedCoach.classes_without_notes > 0 ? 'text-amber-400' : 'text-white'"
                >
                  {{ selectedCoach.classes_without_notes }}
                </p>
                <p class="text-[11px] text-gray-500 mt-0.5">{{ esLang ? 'Clases sin nota' : 'Classes without notes' }}</p>
              </div>
            </div>
          </template>
        </div>
      </template>

      <p class="text-[11px] text-gray-600 leading-relaxed pt-2 border-t border-gray-900">
        {{ esLang
          ? 'Las clases dadas cuentan las sesiones donde el coach quedó asignado en el calendario. Los videos cuentan los clips de la biblioteca de sesiones y los adjuntos a evaluaciones, subidos en este periodo. Todo lo demás se cuenta de lo que cada coach registró en el sistema.'
          : 'Classes given counts sessions where the coach was assigned on the calendar. Videos count session-library clips and evaluation attachments uploaded in this period. Everything else is counted from what each coach recorded in the system.' }}
      </p>
    </div>
    </template>
  </div>
</template>

<style scoped>
/* One scroller for every week. Tall enough for 10 class rows; the old 26rem box only fit about 6. */
.week-board {
  max-height: 44rem;
  overflow: auto;
  scrollbar-width: thin;
}
.week-board::-webkit-scrollbar {
  display: block;
  width: 8px;
  height: 8px;
}
</style>
