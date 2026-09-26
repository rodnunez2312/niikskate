<script setup lang="ts">
import { format, startOfWeek, subMonths, startOfMonth } from 'date-fns'
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
const selectedCoachId = ref('')

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')

/** Periods are inclusive of today, so "this week" means Monday through now. */
const period = computed(() => {
  const today = new Date()
  if (periodKey.value === 'month') return { from: ymd(startOfMonth(today)), to: ymd(today) }
  if (periodKey.value === 'quarter') return { from: ymd(subMonths(today, 3)), to: ymd(today) }
  return { from: ymd(startOfWeek(today, { weekStartsOn: 1 })), to: ymd(today) }
})

const periodLabel = computed(() => {
  const locale = esLang.value ? es : undefined
  const d = data.value
  if (!d) return ''
  return `${format(new Date(`${d.from}T00:00:00`), 'd MMM', { locale })} – ${format(new Date(`${d.to}T00:00:00`), 'd MMM yyyy', { locale })}`
})

const load = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const { data: session } = await client.auth.getSession()
    const token = session.session?.access_token
    if (!token) throw new Error(esLang.value ? 'Sesión expirada' : 'Session expired')

    data.value = await $fetch<CoachActivityResponse>('/api/admin/coach-activity', {
      headers: { Authorization: `Bearer ${token}` },
      query: { from: period.value.from, to: period.value.to, program: programFilter.value || undefined },
    })
    if (!selectedCoachId.value && data.value.coaches.length) {
      selectedCoachId.value = data.value.coaches[0].id
    }
  } catch (e: any) {
    loadError.value = e?.data?.message || e?.message || 'Error'
  } finally {
    loading.value = false
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

watch([periodKey, programFilter], () => load())

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

const coaches = computed(() => data.value?.coaches ?? [])
const totals = computed(() => data.value?.totals)

type MetricKey = 'classes_given' | 'evaluations' | 'videos' | 'class_plans' | 'tricks_marked'

const contributionMetric = ref<MetricKey>('classes_given')

const METRIC_LABELS: Record<MetricKey, { es: string; en: string }> = {
  classes_given: { es: 'Clases dadas', en: 'Classes given' },
  evaluations: { es: 'Evaluaciones', en: 'Evaluations' },
  videos: { es: 'Videos subidos', en: 'Videos uploaded' },
  class_plans: { es: 'Planes de clase', en: 'Class plans' },
  tricks_marked: { es: 'Trucos marcados', en: 'Tricks marked' },
}

function metricLabel(k: MetricKey) {
  return esLang.value ? METRIC_LABELS[k].es : METRIC_LABELS[k].en
}

const contributors = computed(() => {
  const key = contributionMetric.value
  const rows = [...coaches.value].sort((a, b) => b[key] - a[key])
  const max = Math.max(1, ...rows.map(c => c[key]))
  return rows.map(c => ({ coach: c, value: c[key], pct: Math.round((c[key] / max) * 100) }))
})

const selectedCoach = computed(
  () => coaches.value.find(c => c.id === selectedCoachId.value) ?? null,
)

/** Bars are relative to the busiest week so a quiet period still reads clearly. */
const weekly = computed(() => {
  const rows = data.value?.weekly ?? []
  const max = Math.max(1, ...rows.map(r => r.classes))
  return rows.map(r => ({
    ...r,
    pct: Math.round((r.classes / max) * 100),
    label: format(new Date(`${r.week_start}T00:00:00`), 'd MMM', {
      locale: esLang.value ? es : undefined,
    }),
  }))
})

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

    <div v-else-if="isAdmin" class="px-4 py-6 max-w-5xl mx-auto space-y-5 pb-16">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <NuxtLink
              to="/member/admin/scheduling/coaches"
              class="p-1 -ml-1 text-gray-500 hover:text-white transition-colors"
              :aria-label="esLang ? 'Volver a coaches' : 'Back to coaches'"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </NuxtLink>
            <h1 class="text-2xl font-bold text-white">
              {{ esLang ? 'Actividad de coaches' : 'Coach activity' }}
            </h1>
          </div>
          <p class="text-sm text-gray-400 mt-0.5">
            {{ esLang
              ? 'Mira el trabajo, reconoce el esfuerzo y sabe dónde ayudar.'
              : 'See the work, recognize the effort, and know where to help.' }}
          </p>
        </div>
        <button
          type="button"
          class="px-3 py-2 rounded-xl border border-gray-700 text-gray-200 text-sm font-medium hover:border-teal-500/60 hover:text-white transition-colors flex items-center gap-2 shrink-0"
          @click="exportCsv"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {{ esLang ? 'Exportar CSV' : 'Export CSV' }}
        </button>
      </div>

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
          <select
            v-model="periodKey"
            class="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-lg text-white text-sm outline-none focus:border-teal-500"
          >
            <option value="week">{{ esLang ? 'Esta semana' : 'This week so far' }}</option>
            <option value="month">{{ esLang ? 'Este mes' : 'This month' }}</option>
            <option value="quarter">{{ esLang ? 'Últimos 3 meses' : 'Last 3 months' }}</option>
          </select>
        </div>
      </div>

      <p v-if="periodLabel" class="text-[11px] text-gray-500 -mt-2">
        Niik Skate · {{ periodLabel }}
      </p>

      <p v-if="loadError" class="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
        {{ loadError }}
      </p>

      <div v-else-if="loading" class="rounded-xl border border-gray-800 bg-gray-900 px-4 py-10 text-center">
        <p class="text-sm text-gray-500">{{ esLang ? 'Cargando…' : 'Loading…' }}</p>
      </div>

      <template v-else-if="totals">
        <!-- Team overview -->
        <div v-show="tab === 'overview'" class="space-y-4">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs text-gray-400">{{ esLang ? 'Clases dadas' : 'Classes given' }}</p>
              <p class="text-3xl font-bold text-white mt-1">{{ totals.classes_given }}</p>
              <p class="text-[11px] text-gray-600 mt-1">
                {{ esLang ? 'Clases con coach asignado' : 'Classes with an assigned coach' }}
              </p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs text-gray-400">{{ esLang ? 'Videos subidos' : 'Videos uploaded' }}</p>
              <p class="text-3xl font-bold text-white mt-1">{{ totals.videos }}</p>
              <p class="text-[11px] text-gray-600 mt-1">
                {{ esLang ? 'Clips de progreso en evaluaciones' : 'Progress clips on evaluations' }}
              </p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs text-gray-400">{{ esLang ? 'Skaters con progreso' : 'Athletes with progress' }}</p>
              <p class="text-3xl font-bold text-white mt-1">{{ totals.athletes_with_progress }}</p>
              <p class="text-[11px] text-gray-600 mt-1">
                {{ esLang ? 'Con al menos un truco marcado' : 'With at least one trick marked' }}
              </p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-xs text-gray-400">{{ esLang ? 'Coaches activos' : 'Coaches contributing' }}</p>
              <p class="text-3xl font-bold text-white mt-1">
                {{ totals.coaches_contributing }}<span class="text-gray-600 text-xl"> / {{ totals.coaches_total }}</span>
              </p>
              <p class="text-[11px] text-gray-600 mt-1">
                {{ esLang ? 'Con trabajo registrado en el periodo' : 'With recorded work in this period' }}
              </p>
            </div>
          </div>

          <div class="grid lg:grid-cols-2 gap-4">
            <!-- Contributors -->
            <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <div class="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 class="text-base font-semibold text-white">
                    {{ esLang ? 'Quién hizo qué' : 'Top contributors' }}
                  </h2>
                  <p class="text-xs text-gray-500 mt-0.5">
                    {{ esLang
                      ? 'Cada coach destaca en algo distinto.'
                      : 'Recognize a different strength in every coach.' }}
                  </p>
                </div>
                <select
                  v-model="contributionMetric"
                  class="px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs outline-none focus:border-teal-500 shrink-0"
                >
                  <option v-for="k in (['classes_given','evaluations','videos','class_plans','tricks_marked'] as MetricKey[])" :key="k" :value="k">
                    {{ metricLabel(k) }}
                  </option>
                </select>
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
                  <span class="w-7 h-7 rounded-full bg-gray-800 text-[11px] font-semibold text-gray-300 flex items-center justify-center shrink-0">
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

              <p class="mt-3 pt-3 border-t border-gray-800 text-[11px] text-gray-600">
                {{ esLang
                  ? 'Esto mide lo que quedó registrado, no la calidad del coaching.'
                  : 'This measures what was recorded, not coaching quality.' }}
              </p>
            </section>

            <div class="space-y-4">
              <!-- Weekly chart -->
              <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <h2 class="text-base font-semibold text-white">
                  {{ esLang ? 'Clases por semana' : 'Classes over time' }}
                </h2>
                <p class="text-xs text-gray-500 mt-0.5 mb-4">
                  {{ esLang ? 'Clases con coach asignado en el periodo' : 'Classes with an assigned coach in the period' }}
                </p>

                <p v-if="weekly.length === 0" class="text-sm text-gray-500 py-6 text-center">
                  {{ esLang ? 'Sin clases registradas todavía.' : 'No classes recorded yet.' }}
                </p>

                <div v-else class="flex items-end justify-between gap-2 h-28">
                  <div v-for="w in weekly" :key="w.week_start" class="flex-1 flex flex-col items-center gap-1">
                    <span class="text-xs font-semibold text-white">{{ w.classes }}</span>
                    <div
                      class="w-full rounded-t bg-teal-500/80"
                      :style="{ height: `${Math.max(w.pct, 3)}%` }"
                    />
                    <span class="text-[10px] text-gray-500 whitespace-nowrap">{{ w.label }}</span>
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

          <!-- Footer totals -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-2xl font-bold text-white">{{ totals.evaluations }}</p>
              <p class="text-[11px] text-gray-500 mt-0.5">
                {{ esLang ? 'Evaluaciones completadas' : 'Assessments completed' }}
              </p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-2xl font-bold text-white">{{ totals.class_plans }}</p>
              <p class="text-[11px] text-gray-500 mt-0.5">
                {{ esLang ? 'Planes de clase creados' : 'Class plans created' }}
              </p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-2xl font-bold text-white">{{ totals.attendance_marked }}</p>
              <p class="text-[11px] text-gray-500 mt-0.5">
                {{ esLang ? 'Asistencias marcadas' : 'Attendance marked' }}
              </p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-900 p-4">
              <p class="text-2xl font-bold text-white">{{ totals.tricks_marked }}</p>
              <p class="text-[11px] text-gray-500 mt-0.5">
                {{ esLang ? 'Trucos marcados' : 'Tricks marked' }}
              </p>
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
                <span class="w-11 h-11 rounded-xl bg-gray-800 text-sm font-semibold text-gray-200 flex items-center justify-center shrink-0">
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
          ? 'Las clases dadas cuentan las sesiones donde el coach quedó asignado en el calendario. Los videos vienen de los clips adjuntos a evaluaciones. Todo lo demás se cuenta de lo que cada coach registró en el sistema.'
          : 'Classes given counts sessions where the coach was assigned on the calendar. Videos come from clips attached to evaluations. Everything else is counted from what each coach recorded in the system.' }}
      </p>
    </div>
  </div>
</template>
