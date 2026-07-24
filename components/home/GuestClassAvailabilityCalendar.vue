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
import type { BookableClassSession, TimeSlot } from '~/types'
import { PROGRAM_AGE_BANDS, TIME_SLOT_LABELS } from '~/types'

type DaySlotChip = {
  key: string
  label: string
  status: BookableClassSession['status']
}

const { language } = useI18n()

const calendarMonth = ref(new Date())
const sessions = ref<BookableClassSession[]>([])
const loading = ref(true)
const loadError = ref('')

const monthLabel = computed(() =>
  format(calendarMonth.value, 'LLLL yyyy', { locale: language.value === 'es' ? es : undefined }),
)

const calendarCells = computed(() => {
  const start = startOfWeek(startOfMonth(calendarMonth.value), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(calendarMonth.value), { weekStartsOn: 0 })
  return eachDayOfInterval({ start, end })
})

const monthPrefix = computed(() => format(calendarMonth.value, 'yyyy-MM'))

/** Only published bookable sessions in the visible month */
const monthSessions = computed(() =>
  sessions.value.filter(s => s.start_date.startsWith(monthPrefix.value)),
)

const dayMap = computed(() => {
  const map: Record<string, BookableClassSession[]> = {}
  for (const row of monthSessions.value) {
    if (!map[row.start_date]) map[row.start_date] = []
    map[row.start_date].push(row)
  }
  for (const key of Object.keys(map)) {
    map[key].sort((a, b) => {
      const ao = slotOrder(a.time_slot)
      const bo = slotOrder(b.time_slot)
      return ao - bo
    })
  }
  return map
})

const slotOrder = (slot: TimeSlot | null) => {
  const order: Record<string, number> = { morning: 0, monday: 1, early: 2, late: 3 }
  return slot ? (order[slot] ?? 9) : 9
}

const daySessions = (date: Date) => dayMap.value[format(date, 'yyyy-MM-dd')] || []

const hasProgramDay = (date: Date) =>
  isSameMonth(date, calendarMonth.value) && daySessions(date).length > 0

const isPastDay = (date: Date) => isBefore(startOfDay(date), startOfDay(new Date()))

/** Short range for calendar cells (e.g. 5:30–7:00) */
const slotRangeLabel = (slot: TimeSlot | null) => {
  if (!slot) return '—'
  const row = TIME_SLOT_LABELS[slot]
  if (!row) return slot
  const fmt = (hm: string) => {
    const [h, m] = hm.split(':').map(Number)
    const hour12 = ((h + 11) % 12) + 1
    return m === 0 ? `${hour12}:00` : `${hour12}:${String(m).padStart(2, '0')}`
  }
  return `${fmt(row.start)}–${fmt(row.end)}`
}

/** Unique slots per day (dedupe if multiple programs share a slot) */
const daySlotChips = (date: Date): DaySlotChip[] => {
  const rows = daySessions(date)
  const seen = new Set<string>()
  const chips: DaySlotChip[] = []
  for (const r of rows) {
    const slot = r.time_slot || 'early'
    if (seen.has(slot)) {
      const existing = chips.find(c => c.key === slot)
      if (existing && (r.status === 'full' || (r.status === 'almost_full' && existing.status === 'open'))) {
        existing.status = r.status
      }
      continue
    }
    seen.add(slot)
    chips.push({
      key: slot,
      label: slotRangeLabel(r.time_slot),
      status: r.status,
    })
  }
  return chips
}

const chipClass = (status: BookableClassSession['status']) => {
  if (status === 'full') return 'bg-red-500/25 text-red-200 border border-red-500/40'
  if (status === 'almost_full') return 'bg-amber-500/25 text-amber-200 border border-amber-500/40'
  if (status === 'no_coaches') return 'bg-gray-600/40 text-gray-300 border border-gray-500/40'
  return 'bg-emerald-500/25 text-emerald-200 border border-emerald-400/40'
}

const dayCellClass = (date: Date) => {
  if (!hasProgramDay(date)) return ''
  if (isPastDay(date)) return 'bg-gray-800/60'
  const rows = daySessions(date)
  if (rows.every(r => r.status === 'full')) {
    return 'bg-red-500/20 ring-1 ring-red-400/40'
  }
  return 'bg-emerald-500/20 ring-1 ring-emerald-400/35'
}

const fetchSessions = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch<{ sessions: BookableClassSession[] }>('/api/classes/sessions')
    sessions.value = res.sessions || []
  } catch (e: any) {
    console.error('GuestClassAvailabilityCalendar:', e)
    sessions.value = []
    loadError.value =
      language.value === 'es'
        ? 'No se pudo cargar la disponibilidad.'
        : 'Could not load availability.'
  } finally {
    loading.value = false
  }
}

onMounted(fetchSessions)
</script>

<template>
  <section class="bg-black/70 backdrop-blur-sm rounded-2xl p-4 border border-glass-blue/40">
    <div class="flex items-center justify-between gap-2 mb-3">
      <h2 class="text-lg font-bold text-white">
        {{ language === 'es' ? 'Disponibilidad de clases' : 'Class availability' }}
      </h2>
      <NuxtLink to="/classes" class="text-xs font-semibold text-glass-blue hover:text-glass-blue/80">
        {{ language === 'es' ? 'Ver clases' : 'View classes' }}
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

    <div v-if="loading" class="h-40 bg-gray-800/50 rounded-xl animate-pulse" />
    <p v-else-if="loadError" class="text-center text-sm text-red-400 py-8">{{ loadError }}</p>
    <div v-else class="grid grid-cols-7 gap-1">
      <div
        v-for="(date, idx) in calendarCells"
        :key="idx"
        class="min-h-[3.75rem] rounded-lg flex flex-col items-center justify-start pt-1 pb-1 text-xs border border-transparent"
        :class="[
          !isSameMonth(date, calendarMonth) ? 'opacity-25' : '',
          isToday(date) ? 'ring-1 ring-gold-400 bg-gold-400/10' : '',
          dayCellClass(date),
        ]"
      >
        <span
          class="font-semibold text-gray-200 leading-none"
          :class="[isToday(date) ? 'text-gold-400' : '']"
        >
          {{ format(date, 'd') }}
        </span>
        <div
          v-if="hasProgramDay(date)"
          class="flex flex-col gap-0.5 items-center mt-0.5 px-0.5 w-full"
        >
          <span
            v-for="chip in daySlotChips(date)"
            :key="chip.key"
            class="text-[7px] font-bold px-0.5 rounded leading-tight max-w-full whitespace-nowrap"
            :class="chipClass(chip.status)"
          >
            {{ chip.label }}
          </span>
        </div>
      </div>
    </div>

    <p
      v-if="!loading && !loadError && monthSessions.length === 0"
      class="text-[11px] text-gray-400 mt-3 text-center"
    >
      {{
        language === 'es'
          ? 'No hay programas publicados en este mes.'
          : 'No published programs in this month.'
      }}
    </p>

    <div class="mt-4 pt-3 border-t border-gray-800 space-y-3">
      <p class="text-[10px] text-gray-500 text-center leading-relaxed">
        {{
          language === 'es'
            ? 'Solo días con clase publicada. Verde = cupo · Ámbar = casi lleno · Rojo = lleno.'
            : 'Only days with a published class. Green = open · Amber = almost full · Red = full.'
        }}
      </p>
      <div>
        <p class="text-[10px] font-bold uppercase tracking-wide text-gray-400 text-center mb-2">
          {{ language === 'es' ? 'Grupos de edad' : 'Age groups' }}
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          <span
            v-for="band in PROGRAM_AGE_BANDS"
            :key="band.id"
            class="inline-flex items-center gap-1 text-[10px] font-mono text-gray-300 bg-gray-900/80 border border-gray-700 rounded-full px-2 py-1"
          >
            <span aria-hidden="true">{{ band.emoji }}</span>
            {{ language === 'es' ? band.label.es : band.label.en }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
