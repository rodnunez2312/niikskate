<script setup lang="ts">
import { format, startOfWeek, endOfWeek, addWeeks, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import type { CoachActivityCoach, CoachActivityResponse } from '~/server/api/admin/coach-activity.get'
import { PROGRAM_SKILL_TRACKS, type ProgramSkillTrack } from '~/types'

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

const progressInfoOpen = ref(false)
const levelsInfoOpen = ref(false)
const videosInfoOpen = ref(false)
const { selected: selectedSport } = useEnabledSports()
const sportsQuery = computed(() => selectedSport.value)
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

/** Responses by period and filter, so stepping between weeks shows the last result at once. */
const activityCache = new Map<string, { at: number; request: Promise<CoachActivityResponse> }>()
const CACHE_FRESH_MS = 30_000

const activityKey = (from: string, to: string, months: number) => `${from}|${to}|${sportsQuery.value}|${months}`

function fetchActivity(from: string, to: string, months: number, maxAge = CACHE_FRESH_MS) {
  const key = activityKey(from, to, months)
  const cached = activityCache.get(key)
  if (cached && Date.now() - cached.at < maxAge) return cached.request
  const request = (async () => {
    const { data: session } = await client.auth.getSession()
    const token = session.session?.access_token
    if (!token) throw new Error(esLang.value ? 'Sesión expirada' : 'Session expired')
    return $fetch<CoachActivityResponse>('/api/admin/coach-activity', {
      headers: { Authorization: `Bearer ${token}` },
      query: { from, to, sports: sportsQuery.value, historyMonths: months },
    })
  })()
  const entry = { at: Date.now(), request }
  activityCache.set(key, entry)
  request.catch(() => {
    if (activityCache.get(key) === entry) activityCache.delete(key)
  })
  return request
}

function prefetchNeighbours() {
  for (const offset of [periodOffset.value - 1, periodOffset.value + 1]) {
    const range = rangeFor(periodKey.value, offset)
    fetchActivity(ymd(range.from), ymd(range.to), 0, Infinity).catch(() => {})
  }
}

let loadSeq = 0
const load = async () => {
  const seq = ++loadSeq
  loading.value = true
  loadError.value = ''
  try {
    const { from, to } = period.value
    const hit = activityCache.get(activityKey(from, to, historyMonths.value))
    if (hit) {
      const early = await hit.request.catch(() => null)
      if (seq !== loadSeq) return
      if (early) data.value = early
    }
    const next = await fetchActivity(from, to, historyMonths.value)
    if (seq !== loadSeq) return
    data.value = next
    prefetchNeighbours()
    if (selectedCoachId.value && !next.coaches.some(coach => coach.id === selectedCoachId.value)) {
      selectedCoachId.value = ''
    }
  } catch (e: any) {
    if (seq === loadSeq) loadError.value = e?.data?.message || e?.message || 'Error'
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

onMounted(async () => {
  try {
    if (!user.value) {
      await router.push('/auth/login?redirect=/member/admin/scheduling/coach-activity')
      return
    }
    // The API checks the admin role itself, so the data request does not wait on this lookup.
    const firstLoad = load()
    const { data: profile, error } = await client.from('profiles').select('role').eq('id', user.value.id).single()
    if (error) throw error
    if (profile?.role !== 'admin') {
      await router.push('/')
      return
    }
    isAdmin.value = true
    checkingRole.value = false
    await firstLoad
  } catch (e: any) {
    loadError.value = e?.data?.message || e?.message || (esLang.value ? 'No se pudo abrir Actividad' : 'Could not open Activity')
    isAdmin.value = true
  } finally {
    checkingRole.value = false
  }
})

watch(periodKey, () => {
  if (periodOffset.value !== 0) periodOffset.value = 0
})

watch([periodKey, sportsQuery, periodOffset], () => {
  historyMonths.value = 0
  load()
})

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

const coaches = computed(() => data.value?.coaches ?? [])
const totals = computed(() => data.value?.totals)

function levelStat(id: ProgramSkillTrack) {
  if (!selectedCoachId.value) {
    return data.value?.classes_by_level?.find(row => row.id === id) || { given: 0, scheduled: 0 }
  }
  const words = id === 'beginner'
    ? ['principiante', 'beginner']
    : id === 'intermediate'
      ? ['intermedio', 'intermediate']
      : ['avanzado', 'advanced']
  let given = 0
  let scheduled = 0
  for (const row of coachPeriodClasses.value) {
    const title = (row.title || '').toLowerCase()
    if (!words.some(word => title.includes(word))) continue
    if (row.status === 'cancelled') continue
    scheduled += 1
    if (row.status === 'done') given += 1
  }
  return { given, scheduled }
}

function shortDate(key: string) {
  const [y, m, d] = key.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

const periodRangeLabel = computed(() => `${shortDate(period.value.from)} – ${shortDate(period.value.to)}`)

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

function classMatchesCoach(row: { coachIds: string[]; pills: Array<{ id: string }> }, id: string) {
  return row.coachIds.includes(id) || row.pills.some(pill => pill.id === id)
}

function toggleSelectedCoach(id: string) {
  selectedCoachId.value = selectedCoachId.value === id ? '' : id
}

const coachPeriodClasses = computed(() => {
  const id = selectedCoachId.value
  if (!id) return []
  const { from, to } = period.value
  return nearby.value.filter(row => row.date >= from && row.date <= to && classMatchesCoach(row, id))
})

const boardStats = computed(() => {
  const team = totals.value
  const coach = selectedCoach.value
  if (!team) return null
  if (!coach) {
    return {
      classesGiven: team.classes_given,
      classesInPeriod: team.classes_in_period as number | null,
      cancelled: team.classes_cancelled,
      videos: team.videos,
      sessionVideos: team.session_videos,
      evalVideos: team.evaluation_videos,
      progress: team.athletes_with_progress,
      active: team.active_skaters,
    }
  }
  return {
    classesGiven: coach.classes_given,
    classesInPeriod: null,
    cancelled: coach.classes_cancelled,
    videos: coach.videos,
    sessionVideos: coach.session_videos,
    evalVideos: coach.evaluation_videos,
    progress: coach.athletes_with_progress,
    active: coach.athletes_taught,
  }
})

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

type BreakdownRow = CoachActivityResponse['nearby'][number]

/** Every class in the selected period: by day for a week, by week for a month, by month for 3 months. */
const breakdown = computed(() => {
  const locale = esLang.value ? es : undefined
  const { from, to } = period.value
  const rows = nearby.value
    .filter(row => row.date >= from && row.date <= to)
    .filter(row => !selectedCoachId.value || classMatchesCoach(row, selectedCoachId.value))
    .sort((a, b) => a.date.localeCompare(b.date))

  const groupKey = (date: string) =>
    periodKey.value === 'week' ? date : periodKey.value === 'month' ? mondayOf(date) : date.slice(0, 7)
  const day = (key: string, pattern: string) => format(new Date(`${key}T00:00:00`), pattern, { locale })
  const groupLabel = (key: string) => {
    if (periodKey.value === 'week') return day(key, 'EEE d MMM')
    if (periodKey.value === 'month') {
      const start = key < from ? from : key
      const end = shiftKey(key, 6) > to ? to : shiftKey(key, 6)
      return `${day(start, 'd MMM')} – ${day(end, 'd MMM')}`
    }
    return day(`${key}-01`, 'MMMM yyyy')
  }

  const groups = new Map<string, BreakdownRow[]>()
  for (const row of rows) {
    const key = groupKey(row.date)
    const list = groups.get(key) || []
    list.push(row)
    groups.set(key, list)
  }
  const count = (list: BreakdownRow[], status: BreakdownRow['status']) => list.filter(row => row.status === status).length

  return {
    done: count(rows, 'done'),
    cancelled: count(rows, 'cancelled'),
    open: count(rows, 'open'),
    upcoming: count(rows, 'upcoming'),
    groups: [...groups.entries()].map(([key, classes]) => ({
      key,
      label: groupLabel(key),
      classes,
      done: count(classes, 'done'),
      total: classes.length,
    })),
  }
})

function classDateLabel(date: string) {
  return format(new Date(`${date}T00:00:00`), 'EEE d', { locale: esLang.value ? es : undefined })
}

/** The − and + in Class breakdown step the same period as the arrows at the top. */
function stepPeriod(delta: number) {
  periodOffset.value += delta
}

const expandedClassId = ref('')

function statusAccent(status: 'done' | 'cancelled' | 'open' | 'upcoming') {
  if (status === 'done') return '#A3FF12'
  if (status === 'upcoming') return '#4C9AFF'
  if (status === 'cancelled') return '#FF4D4D'
  return '#FFB547'
}

function toggleClassRow(id: string) {
  expandedClassId.value = expandedClassId.value === id ? '' : id
}

function levelMarks(title: string) {
  const text = title.toLowerCase()
  const marks: Array<{ emoji: string; label: string }> = []
  if (text.includes('principiante') || text.includes('beginner')) marks.push({ emoji: '🌱', label: esLang.value ? 'Principiante' : 'Beginner' })
  if (text.includes('intermedio') || text.includes('intermediate')) marks.push({ emoji: '🚀', label: esLang.value ? 'Intermedio' : 'Intermediate' })
  if (text.includes('avanzado') || text.includes('advanced')) marks.push({ emoji: '⚡', label: esLang.value ? 'Avanzado' : 'Advanced' })
  return marks
}

function classLine(row: { title: string; time: string; endTime?: string; age?: string; pills: Array<{ id: string; initials: string; name: string }> }) {
  const title = row.title || ''
  const text = title.toLowerCase()
  const individual = text.includes('individual')
  const grouped = !individual && (text.includes('grupal') || /\bgroup\b/.test(text))
  const age = row.age || title.match(/(?:grupo de edad|age group)\s*:\s*([^·]+)/i)?.[1]?.trim() || ''
  // 18+ classes are about hanging out, not skill level.
  const adults = /18\s*\+/.test(age) || /18\s*\+/.test(title)
  const marks = adults
    ? [{ emoji: '👊', label: esLang.value ? 'Clase de adultos' : 'Adult class' }]
    : levelMarks(title)
  return {
    fallback: marks.length ? '' : title,
    age,
    time: row.endTime && row.time ? `${row.time} – ${row.endTime}` : row.time,
    marks,
    kind: individual ? 'individual' : grouped ? 'group' : '',
    kindLabel: individual
      ? (esLang.value ? 'Clase individual' : 'Individual class')
      : grouped
        ? (esLang.value ? 'Clase grupal' : 'Group class')
        : '',
    coaches: row.pills.filter(pill => pill.initials),
  }
}

const periodJump = computed(() => {
  if (periodKey.value === 'month') {
    return {
      prev: esLang.value ? 'Mes pasado' : 'Last month',
      current: esLang.value ? 'Mes actual' : 'This month',
      next: esLang.value ? 'Mes siguiente' : 'Next month',
    }
  }
  if (periodKey.value === 'quarter') {
    return {
      prev: esLang.value ? 'Trimestre pasado' : 'Last quarter',
      current: esLang.value ? 'Trimestre actual' : 'This quarter',
      next: esLang.value ? 'Trimestre siguiente' : 'Next quarter',
    }
  }
  return {
    prev: esLang.value ? 'Semana pasada' : 'Last week',
    current: esLang.value ? 'Semana actual' : 'This week',
    next: esLang.value ? 'Semana siguiente' : 'Next week',
  }
})

function jumpStyle(offset: number) {
  return periodOffset.value === offset
    ? { background: '#A3FF12', color: '#000', fontWeight: '600' }
    : { background: 'transparent', color: '#999' }
}

const MEDALS = ['🥇', '🥈', '🥉']

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

      <!-- Filters. Equal side columns keep the period slider on the same center as the date. -->
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div class="justify-self-start">
          <div class="inline-flex items-center rounded-lg border border-gray-800 bg-gray-900">
            <button
              v-for="kind in PERIOD_KINDS"
              :key="kind.key"
              type="button"
              class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              :class="periodKey === kind.key ? 'bg-acid text-charcoal font-semibold' : 'text-gray-500 hover:text-gray-300'"
              @click="periodKey = kind.key"
            >
              {{ esLang ? kind.es : kind.en }}
            </button>
          </div>
        </div>

        <div class="inline-flex items-center justify-center rounded-lg border border-gray-800 bg-gray-900 justify-self-center">
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-sm"
            :style="jumpStyle(-1)"
            @click="periodOffset = -1"
          >
            ← {{ periodJump.prev }}
          </button>
          <span class="px-1 text-[#666]" aria-hidden="true">|</span>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-sm"
            :style="jumpStyle(0)"
            @click="periodOffset = 0"
          >
            {{ periodJump.current }}
          </button>
          <span class="px-1 text-[#666]" aria-hidden="true">|</span>
          <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-sm"
            :style="jumpStyle(1)"
            @click="periodOffset = 1"
          >
            {{ periodJump.next }} →
          </button>
        </div>
        <div class="hidden sm:block" aria-hidden="true" />
      </div>

      <p v-if="loadError" class="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
        {{ loadError }}
      </p>

      <div v-else-if="loading && !totals" class="rounded-xl border border-gray-800 bg-gray-900 px-4 py-10 text-center">
        <p class="text-sm text-gray-500">{{ esLang ? 'Cargando…' : 'Loading…' }}</p>
      </div>

      <template v-else-if="totals">
        <div class="text-center">
          <p class="h-4 text-[11px] leading-4 text-gray-500" aria-live="polite">
            <template v-if="loading">{{ esLang ? 'Actualizando…' : 'Updating…' }}</template>
          </p>
          <p class="text-sm font-semibold tabular-nums text-white">{{ periodRangeLabel }}</p>
        </div>
        <div class="space-y-4">
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div class="relative rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5">
              <div
                class="absolute right-2.5 top-2.5 z-10"
                @mouseenter="levelsInfoOpen = true"
                @mouseleave="levelsInfoOpen = false"
              >
                <button
                  type="button"
                  class="flex h-5 w-5 items-center justify-center rounded-full border border-gray-600 text-[11px] font-semibold text-gray-300 hover:border-acid hover:text-acid"
                  :aria-label="esLang ? 'Clases por nivel' : 'Classes by level'"
                  :aria-expanded="levelsInfoOpen"
                >
                  i
                </button>
                <div v-show="levelsInfoOpen" class="absolute right-0 top-6 w-44 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 shadow-lg">
                  <p
                    v-for="track in PROGRAM_SKILL_TRACKS"
                    :key="track.id"
                    class="flex items-center justify-between gap-2 py-0.5 text-[11px] text-gray-300"
                  >
                    <span class="flex items-center gap-1 min-w-0">
                      <span aria-hidden="true">{{ track.emoji }}</span>
                      <span class="truncate">{{ esLang ? track.label.es : track.label.en }}</span>
                    </span>
                    <span class="shrink-0 tabular-nums text-white">{{ levelStat(track.id).given }}/{{ levelStat(track.id).scheduled }}</span>
                  </p>
                </div>
              </div>
              <p class="pr-6 text-xs text-gray-400">{{ esLang ? 'Clases dadas' : 'Classes given' }}</p>
              <div class="mt-0.5 flex items-end justify-between gap-2">
                <p class="text-3xl font-bold leading-none text-white">
                  {{ boardStats?.classesGiven }}<span v-if="boardStats?.classesInPeriod != null" class="text-gray-600 text-xl"> / {{ boardStats.classesInPeriod }}</span>
                </p>
                <p class="pb-0.5 text-[11px] text-acid">
                  {{ boardStats?.cancelled }} {{ esLang ? 'canceladas' : 'cancelled' }}
                </p>
              </div>
            </div>
            <div class="relative rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5">
              <div
                class="absolute right-2.5 top-2.5 z-10"
                @mouseenter="videosInfoOpen = true"
                @mouseleave="videosInfoOpen = false"
              >
                <button
                  type="button"
                  class="flex h-5 w-5 items-center justify-center rounded-full border border-gray-600 text-[11px] font-semibold text-gray-300 hover:border-acid hover:text-acid"
                  :aria-label="esLang ? 'Videos por tipo' : 'Videos by type'"
                  :aria-expanded="videosInfoOpen"
                >
                  i
                </button>
                <div v-show="videosInfoOpen" class="absolute right-0 top-6 w-44 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 shadow-lg">
                  <p class="flex items-center justify-between gap-2 py-0.5 text-[11px] text-gray-300">
                    <span>{{ esLang ? 'Sesión' : 'Session' }}</span>
                    <span class="shrink-0 tabular-nums text-white">{{ boardStats?.sessionVideos }}</span>
                  </p>
                  <p class="flex items-center justify-between gap-2 py-0.5 text-[11px] text-gray-300">
                    <span>{{ esLang ? 'Evaluaciones' : 'Evaluations' }}</span>
                    <span class="shrink-0 tabular-nums text-white">{{ boardStats?.evalVideos }}</span>
                  </p>
                </div>
              </div>
              <p class="pr-6 text-xs text-gray-400">{{ esLang ? 'Videos subidos' : 'Videos uploaded' }}</p>
              <p class="text-3xl font-bold leading-none text-white mt-0.5">{{ boardStats?.videos }}</p>
            </div>
            <div class="relative rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5">
              <div
                class="absolute right-2.5 top-2.5 z-10"
                @mouseenter="progressInfoOpen = true"
                @mouseleave="progressInfoOpen = false"
              >
                <button
                  type="button"
                  class="flex h-5 w-5 items-center justify-center rounded-full border border-gray-600 text-[11px] font-semibold text-gray-300 hover:border-acid hover:text-acid"
                  :aria-label="esLang ? 'Qué cuenta aquí' : 'What this counts'"
                  :aria-expanded="progressInfoOpen"
                >
                  i
                </button>
                <div v-show="progressInfoOpen" class="absolute right-0 top-6 w-52 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 shadow-lg">
                  <p class="flex items-center justify-between gap-2 py-0.5 text-[11px] text-gray-300">
                    <span>{{ esLang ? 'Clase' : 'Class' }}</span>
                    <span class="shrink-0 text-right text-white">{{ esLang ? 'en el período' : 'in the period' }}</span>
                  </p>
                  <p class="flex items-center justify-between gap-2 py-0.5 text-[11px] text-gray-300">
                    <span>{{ esLang ? 'Truco' : 'Trick' }}</span>
                    <span class="shrink-0 text-right text-white">{{ esLang ? 'al menos uno' : 'at least one' }}</span>
                  </p>
                </div>
              </div>
              <p class="pr-6 text-xs text-gray-400">{{ esLang ? 'Skaters con progreso' : 'Athletes with progress' }}</p>
              <p class="text-3xl font-bold leading-none text-white mt-0.5">
                {{ boardStats?.progress }}<span class="text-gray-600 text-xl"> / {{ boardStats?.active }}</span>
              </p>
            </div>
            <div class="rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5">
              <p class="text-xs text-gray-400">{{ esLang ? 'Coaches activos' : 'Coaches contributing' }}</p>
              <p class="text-3xl font-bold leading-none text-white mt-0.5">
                {{ totals.coaches_contributing }}<span class="text-gray-600 text-xl"> / {{ totals.coaches_total }}</span>
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
                  v-for="(row, index) in contributors"
                  :key="row.coach.id"
                  class="flex items-center gap-2"
                >
                  <span v-if="index < 3 && row.value > 0" class="w-6 text-center text-base shrink-0" aria-hidden="true">{{ MEDALS[index] }}</span>
                  <span
                    v-else
                    class="w-7 h-7 rounded-full text-[11px] font-bold text-white flex items-center justify-center shrink-0"
                    :class="pillColor(row.coach.id)"
                  >
                    {{ initials(row.coach.name) }}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        class="min-w-0 truncate text-left text-sm"
                        :style="selectedCoachId === row.coach.id ? { color: '#A3FF12', fontWeight: '600' } : { color: '#fff' }"
                        :aria-pressed="selectedCoachId === row.coach.id"
                        @click="toggleSelectedCoach(row.coach.id)"
                      >
                        {{ row.coach.name }}
                      </button>
                      <span class="text-sm font-semibold text-white shrink-0">{{ row.value }}</span>
                    </div>
                    <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden mt-1">
                      <div
                        class="h-full rounded-full transition-all"
                        :style="{ width: `${Math.max(row.pct, row.value > 0 ? 8 : 2)}%`, background: row.value > 0 ? '#A3FF12' : '#444' }"
                      />
                    </div>
                  </div>
                </li>
              </ul>
            </section>

            <div class="space-y-4">
              <!-- Class breakdown -->
              <section class="rounded-xl border border-gray-800 bg-gray-900 p-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h2 class="text-base font-semibold text-white">Class breakdown</h2>
                    <p class="text-xs text-gray-500 mt-0.5">
                      {{ esLang ? 'Toca una clase para ver el título y abrirla.' : 'Tap a class to see the title and open it.' }}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      class="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-700 text-base leading-none text-gray-300 hover:border-gray-500 hover:text-white"
                      :title="periodJump.prev"
                      :aria-label="periodJump.prev"
                      @click="stepPeriod(-1)"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      class="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-700 text-base leading-none text-gray-300 hover:border-gray-500 hover:text-white"
                      :title="periodJump.next"
                      :aria-label="periodJump.next"
                      @click="stepPeriod(1)"
                    >
                      +
                    </button>
                  </div>
                </div>

                <p class="mt-2 mb-3 flex flex-wrap gap-x-3 text-[11px] text-gray-500">
                  <span>{{ esLang ? 'Hechas' : 'Done' }} <span class="font-semibold text-acid">{{ breakdown.done }}</span></span>
                  <span v-if="breakdown.cancelled">{{ esLang ? 'Canceladas' : 'Cancelled' }} <span class="font-semibold text-red-400">{{ breakdown.cancelled }}</span></span>
                  <span v-if="breakdown.open">{{ esLang ? 'Sin marcar' : 'Unmarked' }} <span class="font-semibold text-gray-300">{{ breakdown.open }}</span></span>
                  <span v-if="breakdown.upcoming">{{ esLang ? 'Próximas' : 'Upcoming' }} <span class="font-semibold text-gray-300">{{ breakdown.upcoming }}</span></span>
                </p>

                <p v-if="!breakdown.groups.length" class="text-sm text-gray-500">
                  {{ esLang ? 'Sin clases en este periodo.' : 'No classes in this period.' }}
                </p>
                <div v-for="group in breakdown.groups" :key="group.key" class="mb-3 last:mb-0">
                  <div class="mb-1 flex items-center justify-between gap-2">
                    <p class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">{{ group.label }}</p>
                    <p class="text-[10px] text-gray-500">
                      {{ esLang ? 'Hechas' : 'Done' }} <span class="font-semibold text-acid">{{ group.done }}</span>/{{ group.total }}
                    </p>
                  </div>
                  <div class="space-y-1.5">
                    <div
                      v-for="row in group.classes"
                      :key="row.id"
                      class="rounded-md bg-gray-950 text-left"
                      :style="{ borderLeft: `4px solid ${statusAccent(row.status)}` }"
                    >
                      <button
                        type="button"
                        class="block w-full space-y-1.5 px-3 py-2.5 text-left"
                        :aria-expanded="expandedClassId === row.id"
                        @click="toggleClassRow(row.id)"
                      >
                        <span
                          class="flex items-center gap-x-1.5 overflow-hidden whitespace-nowrap text-xs leading-tight"
                          :class="row.status === 'cancelled' ? 'line-through text-gray-400' : 'text-gray-300'"
                        >
                          <span v-if="periodKey !== 'week'" class="w-12 shrink-0 text-[10px] uppercase text-gray-500">{{ classDateLabel(row.date) }}</span>
                          <MemberSessionKindIcon
                            v-if="classLine(row).kind"
                            :kind="classLine(row).kind"
                            :title="classLine(row).kindLabel"
                            :aria-label="classLine(row).kindLabel"
                          />
                          <span v-if="classLine(row).marks.length" class="inline-flex items-center gap-0.5 text-sm leading-none">
                            <span v-for="mark in classLine(row).marks" :key="mark.label" :title="mark.label" :aria-label="mark.label">{{ mark.emoji }}</span>
                          </span>
                          <span v-else class="truncate font-semibold" :class="row.status === 'cancelled' ? '' : 'text-white'">{{ classLine(row).fallback }}</span>
                          <span v-if="classLine(row).age">{{ classLine(row).age }}</span>
                          <span v-if="classLine(row).time">&#128336; {{ classLine(row).time }}</span>
                        </span>
                        <span class="flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11px] text-gray-400">
                          <svg class="h-3.5 w-3.5 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                            <circle cx="12" cy="8" r="3.5" />
                            <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
                          </svg>
                          <span class="text-gray-500">Coach:</span>
                          <template v-if="classLine(row).coaches.length">
                            <span v-for="pill in classLine(row).coaches" :key="pill.id" class="inline-flex items-center gap-1">
                              <span
                                class="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                                :class="pillColor(pill.id, pill.name)"
                              >{{ pill.initials }}</span>
                              <span class="text-gray-300">{{ pill.name }}</span>
                            </span>
                          </template>
                          <span v-else class="text-amber-300">{{ esLang ? 'Sin coach' : 'No coach' }}</span>
                          <span v-if="row.warning && classLine(row).coaches.length" class="ml-auto truncate text-amber-300">{{ row.warning }}</span>
                        </span>
                      </button>
                      <div v-if="expandedClassId === row.id" class="px-3 pb-2.5 space-y-0.5 text-[11px] text-gray-300">
                        <p>{{ row.title }}</p>
                        <NuxtLink :to="`/member/staff/sessions/${row.id}`" class="inline-block pt-1 font-semibold text-[#A3FF12]">
                          {{ esLang ? 'Abrir sesión' : 'Open session' }}
                        </NuxtLink>
                      </div>
                    </div>
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