<script setup lang="ts">
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  isSameMonth,
  isToday,
  isBefore,
  startOfDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { ClassSchedule } from '~/types'

const { language } = useI18n()
const { fetchMonthSchedules, isClassDay } = useClasses()

const calendarMonth = ref(new Date())
const schedules = ref<ClassSchedule[]>([])
const loading = ref(true)

const monthLabel = computed(() =>
  format(calendarMonth.value, 'LLLL yyyy', { locale: language.value === 'es' ? es : undefined }),
)

const calendarCells = computed(() => {
  const start = startOfWeek(startOfMonth(calendarMonth.value), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(calendarMonth.value), { weekStartsOn: 0 })
  return eachDayOfInterval({ start, end })
})

const dayMap = computed(() => {
  const map: Record<string, ClassSchedule[]> = {}
  for (const row of schedules.value) {
    if (!map[row.date]) map[row.date] = []
    map[row.date].push(row)
  }
  return map
})

const daySchedules = (date: Date) => dayMap.value[format(date, 'yyyy-MM-dd')] || []
const slotLabel = (slot: string) => (slot === 'early' ? '5:30' : '7:00')
const isPastDay = (date: Date) => isBefore(startOfDay(date), startOfDay(new Date()))

const slotStateClass = (row: ClassSchedule) => {
  const max = Number(row.max_capacity || 0)
  const booked = Number(row.current_bookings || 0)
  if (max > 0 && booked >= max) return 'bg-red-500/20 text-red-200 border border-red-500/35'
  return 'bg-glass-green/25 text-glass-green border border-glass-green/35'
}

const fetchMonth = async () => {
  loading.value = true
  try {
    const year = calendarMonth.value.getFullYear()
    const month = calendarMonth.value.getMonth() + 1
    schedules.value = await fetchMonthSchedules(year, month)
  } finally {
    loading.value = false
  }
}

watch(() => calendarMonth.value.getTime(), fetchMonth, { immediate: true })
</script>

<template>
  <section class="bg-black/70 backdrop-blur-sm rounded-2xl p-4 border border-glass-blue/40">
    <div class="flex items-center justify-between gap-2 mb-3">
      <h2 class="text-lg font-bold text-white">
        {{ language === 'es' ? 'Disponibilidad de clases' : 'Class availability' }}
      </h2>
      <NuxtLink to="/book" class="text-xs font-semibold text-glass-blue hover:text-glass-blue/80">
        {{ language === 'es' ? 'Reservar' : 'Book' }}
      </NuxtLink>
    </div>

    <div class="flex items-center justify-between mb-3">
      <button
        type="button"
        class="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
        :aria-label="language === 'es' ? 'Mes anterior' : 'Previous month'"
        @click="calendarMonth = addMonths(calendarMonth, -1)"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span class="text-white font-semibold capitalize text-sm text-center flex-1 px-2">{{ monthLabel }}</span>
      <button
        type="button"
        class="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
        :aria-label="language === 'es' ? 'Mes siguiente' : 'Next month'"
        @click="calendarMonth = addMonths(calendarMonth, 1)"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <div class="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-500 font-bold uppercase mb-1">
      <template v-if="language === 'es'">
        <span>D</span><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span>
      </template>
      <template v-else>
        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
      </template>
    </div>

    <div v-if="loading" class="h-40 bg-gray-800/50 rounded-xl animate-pulse"></div>
    <div v-else class="grid grid-cols-7 gap-1">
      <div
        v-for="(date, idx) in calendarCells"
        :key="idx"
        class="min-h-[2.75rem] rounded-lg flex flex-col items-center justify-start pt-1 text-xs border border-transparent"
        :class="[
          !isSameMonth(date, calendarMonth) ? 'opacity-25' : '',
          isToday(date) ? 'ring-1 ring-gold-400 bg-gold-400/10' : '',
          isClassDay(date) && isSameMonth(date, calendarMonth)
            ? isPastDay(date)
              ? 'bg-gray-800/60'
              : 'bg-emerald-500/20 ring-1 ring-emerald-400/35'
            : '',
        ]"
      >
        <span class="font-semibold text-gray-200" :class="[isToday(date) ? 'text-gold-400' : '']">
          {{ format(date, 'd') }}
        </span>
        <div v-if="daySchedules(date).length" class="flex flex-wrap gap-0.5 justify-center mt-0.5 px-0.5 w-full">
          <span
            v-for="r in daySchedules(date)"
            :key="`${r.id}-${r.time_slot}`"
            class="text-[8px] font-bold px-1 rounded leading-tight max-w-full truncate"
            :class="slotStateClass(r)"
          >
            {{ slotLabel(r.time_slot) }}
          </span>
        </div>
      </div>
    </div>

    <p class="text-[10px] text-gray-500 mt-3 text-center leading-relaxed px-1">
      {{
        language === 'es'
          ? '5:30 temprana · 7:00 tarde. Verde = cupo disponible · Rojo = lleno.'
          : '5:30 early · 7:00 late. Green = spots available · Red = full.'
      }}
    </p>
  </section>
</template>

