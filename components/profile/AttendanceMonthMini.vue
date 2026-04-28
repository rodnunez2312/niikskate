<script setup lang="ts">
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameMonth,
  max,
} from 'date-fns'
import { es } from 'date-fns/locale'

export type DayBookingState = 'attended' | 'admin_confirmed' | 'requested' | 'missed'

const props = defineProps<{
  /** Per yyyy-MM-dd: green = attended, blue = admin confirmed slot, yellow = user requested, rose = missed */
  dayStates: Map<string, DayBookingState>
  /** Hide outer card chrome when nested inside another panel */
  embedded?: boolean
  /** Which filter is active (legend copy) */
  calendarMode?: 'reserved' | 'attended' | 'missed'
}>()

const { language } = useI18n()

/** Earliest month skaters can view (no 2025 or earlier) */
const MIN_MONTH_START = startOfMonth(new Date(2026, 0, 1))

const currentMonth = ref(max([MIN_MONTH_START, startOfMonth(new Date())]))

const atMinMonth = computed(() => isSameMonth(currentMonth.value, MIN_MONTH_START))

const monthLabel = computed(() => {
  const loc = language.value === 'es' ? es : undefined
  return format(currentMonth.value, 'MMMM yyyy', { locale: loc })
})

const calendarDays = computed(() => {
  const start = startOfMonth(currentMonth.value)
  const end = endOfMonth(currentMonth.value)
  const days = eachDayOfInterval({ start, end })
  const pad = getDay(start)
  return [...Array(pad).fill(null), ...days] as (Date | null)[]
})

const weekDays = computed(() =>
  language.value === 'es' ? ['D', 'L', 'M', 'M', 'J', 'V', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
)

const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')

const stateFor = (d: Date | null): DayBookingState | null => {
  if (!d) return null
  return props.dayStates.get(dayKey(d)) ?? null
}

const isClassDay = (d: Date | null) => {
  if (!d) return false
  const n = getDay(d)
  return n === 2 || n === 4 || n === 6
}

const cellClass = (d: Date | null) => {
  const st = stateFor(d)
  if (!d) return ''
  if (st === 'attended') {
    return 'bg-glass-green/35 text-glass-green font-bold ring-1 ring-glass-green/50'
  }
  if (st === 'admin_confirmed') {
    return 'bg-glass-blue/30 text-sky-200 font-semibold ring-1 ring-glass-blue/45'
  }
  if (st === 'requested') {
    return 'bg-amber-500/25 text-amber-200 font-semibold ring-1 ring-amber-500/40'
  }
  if (st === 'missed') {
    return 'bg-rose-900/40 text-rose-200 font-semibold ring-1 ring-rose-500/45'
  }
  return isClassDay(d) ? 'bg-gray-800/80 text-gray-400' : 'text-gray-600'
}
</script>

<template>
  <div
    :class="
      embedded
        ? 'p-0'
        : 'bg-gray-900 border border-gray-800 rounded-2xl p-4'
    "
  >
    <div class="flex items-center justify-between mb-3">
      <button
        type="button"
        class="p-2 rounded-lg hover:bg-gray-800 text-white"
        :disabled="atMinMonth"
        :class="atMinMonth ? 'opacity-30 cursor-not-allowed' : ''"
        @click="currentMonth = subMonths(currentMonth, 1)"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h3 class="text-sm font-bold text-white capitalize">{{ monthLabel }}</h3>
      <button
        type="button"
        class="p-2 rounded-lg hover:bg-gray-800 text-white"
        :disabled="isSameMonth(currentMonth, new Date())"
        :class="isSameMonth(currentMonth, new Date()) ? 'opacity-30 cursor-not-allowed' : ''"
        @click="currentMonth = addMonths(currentMonth, 1)"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
    <p v-if="calendarMode === 'reserved' || !calendarMode" class="text-xs text-gray-500 mb-2">
      {{
        language === 'es'
          ? 'Amarillo = solicitud · Azul = cupo confirmado · Verde = asistencia'
          : 'Yellow = request · Blue = slot confirmed · Green = attended'
      }}
    </p>
    <p v-else-if="calendarMode === 'attended'" class="text-xs text-gray-500 mb-2">
      {{ language === 'es' ? 'Solo días con asistencia confirmada.' : 'Only days marked attended.' }}
    </p>
    <p v-else class="text-xs text-gray-500 mb-2">
      {{
        language === 'es'
          ? 'Reserva pasada sin asistencia confirmada (o marcada ausente).'
          : 'Past reserved class without attended marked (or marked absent).'
      }}
    </p>
    <div
      v-if="calendarMode === 'reserved' || !calendarMode"
      class="flex flex-wrap gap-3 text-[10px] text-gray-500 mb-2"
    >
      <span class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-sm bg-amber-500/50 ring-1 ring-amber-500/40" />
        {{ language === 'es' ? 'Solicitud' : 'Requested' }}
      </span>
      <span class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-sm bg-sky-500/50 ring-1 ring-sky-500/40" />
        {{ language === 'es' ? 'Confirmado' : 'Confirmed' }}
      </span>
      <span class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-sm bg-glass-green/50 ring-1 ring-glass-green/50" />
        {{ language === 'es' ? 'Asistió' : 'Attended' }}
      </span>
    </div>
    <div v-else-if="calendarMode === 'attended'" class="flex flex-wrap gap-3 text-[10px] text-gray-500 mb-2">
      <span class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-sm bg-glass-green/50 ring-1 ring-glass-green/50" />
        {{ language === 'es' ? 'Asistió' : 'Attended' }}
      </span>
    </div>
    <div v-else class="flex flex-wrap gap-3 text-[10px] text-gray-500 mb-2">
      <span class="flex items-center gap-1">
        <span class="w-2 h-2 rounded-sm bg-rose-500/50 ring-1 ring-rose-500/40" />
        {{ language === 'es' ? 'No asistió' : 'Did not attend' }}
      </span>
    </div>
    <div class="grid grid-cols-7 gap-0.5 text-center text-[10px] text-gray-500 mb-1">
      <span v-for="w in weekDays" :key="w" class="py-1">{{ w }}</span>
    </div>
    <div class="grid grid-cols-7 gap-0.5">
      <template v-for="(day, i) in calendarDays" :key="i">
        <div v-if="!day" class="aspect-square" />
        <div
          v-else
          class="aspect-square rounded-md flex flex-col items-center justify-center text-[11px]"
          :class="cellClass(day)"
        >
          {{ format(day, 'd') }}
        </div>
      </template>
    </div>
  </div>
</template>
