<script setup lang="ts">
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
} from 'date-fns'
import { es as esLocale } from 'date-fns/locale'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const client = useSupabaseClient()
const { language } = useI18n()
const lang = computed(() => (language.value === 'es' ? 'es' : 'en') as 'en' | 'es')

const programs = ref<Array<{ id: string; name: string; description?: string | null; color?: string | null; is_active?: boolean }>>([])
const loadingPrograms = ref(true)

const monthCursor = ref(new Date())
const plansLoading = ref(false)
const classPlansRows = ref<Array<{ plan_date: string; time_slot: string; coach_id: string }>>([])
const coachNames = ref<Record<string, string>>({})

async function loadPrograms() {
  loadingPrograms.value = true
  try {
    const { data } = await client
      .from('programs')
      .select('id, name, description, color, is_active')
      .order('name')
    programs.value = data || []
  } catch (e) {
    console.error(e)
    programs.value = []
  } finally {
    loadingPrograms.value = false
  }
}

async function loadMonthPlans() {
  const start = format(startOfMonth(monthCursor.value), 'yyyy-MM-dd')
  const end = format(endOfMonth(monthCursor.value), 'yyyy-MM-dd')
  plansLoading.value = true
  try {
    const { data, error } = await client
      .from('class_plans')
      .select('plan_date, time_slot, coach_id')
      .gte('plan_date', start)
      .lte('plan_date', end)
    if (error) throw error
    classPlansRows.value = (data || []) as typeof classPlansRows.value
    const ids = [...new Set(classPlansRows.value.map((r) => r.coach_id).filter(Boolean))]
    if (ids.length) {
      const { data: profs } = await client.from('profiles').select('id, full_name').in('id', ids)
      const m: Record<string, string> = {}
      for (const p of profs || []) m[p.id] = p.full_name || '—'
      coachNames.value = m
    } else {
      coachNames.value = {}
    }
  } catch (e) {
    console.error(e)
    classPlansRows.value = []
  } finally {
    plansLoading.value = false
  }
}

const coachSessionCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const row of classPlansRows.value) {
    counts[row.coach_id] = (counts[row.coach_id] || 0) + 1
  }
  return Object.entries(counts)
    .map(([coachId, count]) => ({
      coachId,
      name: coachNames.value[coachId] || '—',
      count,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
})

const calendarDays = computed(() => {
  const start = startOfMonth(monthCursor.value)
  const end = endOfMonth(monthCursor.value)
  const days = eachDayOfInterval({ start, end })
  const byDate: Record<string, Record<string, number>> = {}
  for (const row of classPlansRows.value) {
    if (!byDate[row.plan_date]) byDate[row.plan_date] = {}
    byDate[row.plan_date][row.coach_id] = (byDate[row.plan_date][row.coach_id] || 0) + 1
  }
  return days.map((d) => {
    const key = format(d, 'yyyy-MM-dd')
    const perCoach = byDate[key] || {}
    const total = Object.values(perCoach).reduce((a, b) => a + b, 0)
    return { date: d, key, total, perCoach }
  })
})

const monthLabel = computed(() =>
  format(monthCursor.value, language.value === 'es' ? 'MMMM yyyy' : 'MMMM yyyy', {
    locale: language.value === 'es' ? esLocale : undefined,
  }),
)

/** Monday-first: 0 = first column (Mon) */
const leadingEmptyCells = computed(() => {
  const d = startOfMonth(monthCursor.value)
  return (d.getDay() + 6) % 7
})

onMounted(async () => {
  await loadPrograms()
  await loadMonthPlans()
})

watch(monthCursor, () => loadMonthPlans())
</script>

<template>
  <div class="min-h-screen bg-gray-950 pb-24">
    <header class="sticky top-0 z-10 bg-gray-950/95 border-b border-gray-800 px-4 py-4">
      <div class="max-w-2xl mx-auto flex items-center gap-3">
        <NuxtLink
          to="/member/coach/plans"
          class="p-2 -ml-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800"
          :aria-label="lang === 'es' ? 'Volver a planeación' : 'Back to planning'"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </NuxtLink>
        <div>
          <h1 class="text-xl font-bold text-white">
            {{ lang === 'es' ? 'Centro de programas' : 'Program resource hub' }}
          </h1>
          <p class="text-sm text-gray-500">
            {{
              lang === 'es'
                ? 'Guía de sesión, enfoque y calendario de sesiones por coach.'
                : 'Session template, teaching focus, and per-coach session calendar.'
            }}
          </p>
        </div>
      </div>
    </header>

    <div class="px-4 max-w-2xl mx-auto py-6 space-y-8">
      <ProgramPedagogyBlock :language="lang" />

      <!-- Program tracks -->
      <section>
        <h2 class="text-lg font-bold text-white mb-2">
          {{ lang === 'es' ? 'Tus programas' : 'Your programs' }}
        </h2>
        <p class="text-sm text-gray-500 mb-4">
          {{
            lang === 'es'
              ? 'Iniciación, Street, Park y Avanzado — abre cada uno para ver contexto y equipo.'
              : 'Iniciación, Street, Park, and Advanced — open each for context and roster.'
          }}
        </p>
        <div v-if="loadingPrograms" class="py-8 text-center text-gray-500 text-sm">…</div>
        <ul v-else class="space-y-2">
          <li v-for="p in programs" :key="p.id">
            <NuxtLink
              :to="`/member/coach/plans/programs/${p.id}`"
              class="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gold-500/40 transition-colors"
            >
              <span
                class="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                :style="{ background: p.color || '#374151' }"
              >
                {{ p.name.charAt(0) }}
              </span>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-white truncate">{{ p.name }}</p>
                <p v-if="p.description" class="text-xs text-gray-500 line-clamp-2">{{ p.description }}</p>
              </div>
              <svg class="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </NuxtLink>
          </li>
        </ul>
        <p v-if="!loadingPrograms && programs.length === 0" class="text-sm text-gray-500 text-center py-4">
          {{ lang === 'es' ? 'No hay programas. Créalos en Planeación → Programas.' : 'No programs yet. Create them under Planning → Programs.' }}
        </p>
      </section>

      <!-- Calendar: classes per coach (from class_plans) -->
      <section class="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 sm:p-5">
        <div class="flex items-center justify-between gap-2 mb-4">
          <h2 class="text-sm font-bold text-gold-400 uppercase tracking-wide">
            {{ lang === 'es' ? 'Sesiones planificadas (por coach)' : 'Planned sessions (per coach)' }}
          </h2>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="p-1.5 rounded-lg text-gray-400 hover:bg-gray-800"
              @click="monthCursor = subMonths(monthCursor, 1)"
            >
              ‹
            </button>
            <span class="text-sm text-white font-medium min-w-[8rem] text-center capitalize">{{ monthLabel }}</span>
            <button
              type="button"
              class="p-1.5 rounded-lg text-gray-400 hover:bg-gray-800"
              @click="monthCursor = addMonths(monthCursor, 1)"
            >
              ›
            </button>
          </div>
        </div>
        <p class="text-xs text-gray-500 mb-4">
          {{
            lang === 'es'
              ? 'Cada fila en «Sesiones» en Planeación genera un bloque. Los totales reflejan planes guardados (early + late cuentan por separado).'
              : 'Each row in Planning → Sessions creates a plan block. Totals count saved plans (early and late count separately).'
          }}
        </p>

        <div v-if="plansLoading" class="py-6 text-center text-gray-500 text-sm">…</div>
        <template v-else>
          <div v-if="coachSessionCounts.length" class="space-y-2 mb-6">
            <div
              v-for="row in coachSessionCounts"
              :key="row.coachId"
              class="flex items-center justify-between text-sm bg-gray-950/80 rounded-lg px-3 py-2 border border-gray-800"
            >
              <span class="text-gray-200">{{ row.name }}</span>
              <span class="text-gold-400 font-bold tabular-nums">{{ row.count }}</span>
            </div>
          </div>
          <p v-else class="text-sm text-gray-500 mb-4">
            {{ lang === 'es' ? 'Sin planes en este mes.' : 'No plans in this month.' }}
          </p>

          <div class="grid grid-cols-7 gap-0.5 text-center text-[10px] sm:text-xs mb-1 text-gray-500">
            <span v-for="d in ['L', 'M', 'X', 'J', 'V', 'S', 'D']" :key="d" class="py-1">{{ d }}</span>
          </div>
          <div class="grid grid-cols-7 gap-0.5">
            <div
              v-for="(_, i) in Array.from({ length: leadingEmptyCells })"
              :key="'e' + i"
              class="min-h-[2.5rem]"
            />
            <div
              v-for="cell in calendarDays"
              :key="cell.key"
              class="min-h-[2.5rem] rounded border border-gray-800/80 bg-gray-950/50 p-0.5 flex flex-col items-center justify-start"
            >
              <span class="text-[10px] text-gray-500 leading-none">{{ format(cell.date, 'd') }}</span>
              <span
                v-if="cell.total"
                class="text-[9px] sm:text-[10px] font-bold text-gold-400 leading-tight mt-0.5"
              >{{ cell.total }}</span>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>
