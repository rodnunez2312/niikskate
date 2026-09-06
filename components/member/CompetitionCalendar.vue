<script setup lang="ts">
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { CompetitionEvent } from '~/composables/useCompetitionEvents'

const props = defineProps<{
  events: CompetitionEvent[]
  loading?: boolean
}>()

const { language } = useI18n()
const viewMonth = ref(startOfMonth(new Date()))
const selectedDate = ref<string | null>(null)

const locale = computed(() => (language.value === 'es' ? es : undefined))
const monthLabel = computed(() =>
  format(viewMonth.value, 'MMMM yyyy', { locale: locale.value }),
)
const weekdayLabels = computed(() =>
  language.value === 'es'
    ? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
)

const days = computed(() => {
  const start = startOfWeek(startOfMonth(viewMonth.value), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(viewMonth.value), { weekStartsOn: 1 })
  return eachDayOfInterval({ start, end })
})

const today = () => format(new Date(), 'yyyy-MM-dd')
const isPast = (event: CompetitionEvent) =>
  (event.end_date || event.start_date).slice(0, 10) < today()

const eventsOnDay = (day: Date) => {
  const ymd = format(day, 'yyyy-MM-dd')
  return props.events.filter(event => {
    const start = event.start_date.slice(0, 10)
    const end = (event.end_date || event.start_date).slice(0, 10)
    return ymd >= start && ymd <= end
  })
}

const selectedEvents = computed(() => {
  if (!selectedDate.value) return []
  return eventsOnDay(parseISO(selectedDate.value))
})

const selectedLabel = computed(() => {
  if (!selectedDate.value) return ''
  return format(parseISO(selectedDate.value), 'EEE d MMM', {
    locale: locale.value,
  }).toUpperCase()
})

watch(
  () => props.events,
  events => {
    if (!events.length) return
    const next = events.find(event => !isPast(event)) || events[events.length - 1]
    viewMonth.value = startOfMonth(parseISO(next.start_date))
  },
  { immediate: true },
)

function selectDay(day: Date) {
  selectedDate.value = format(day, 'yyyy-MM-dd')
}
</script>

<template>
  <section class="overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
    <div class="flex items-center justify-between border-b border-gray-800 px-3 py-3">
      <button
        type="button"
        class="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
        :aria-label="language === 'es' ? 'Mes anterior' : 'Previous month'"
        @click="viewMonth = addMonths(viewMonth, -1)"
      >
        ‹
      </button>
      <p class="font-black capitalize text-white">{{ monthLabel }}</p>
      <button
        type="button"
        class="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
        :aria-label="language === 'es' ? 'Mes siguiente' : 'Next month'"
        @click="viewMonth = addMonths(viewMonth, 1)"
      >
        ›
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-gold-400 border-t-transparent" />
    </div>

    <template v-else>
      <div class="grid grid-cols-7 border-b border-gray-800">
        <div
          v-for="label in weekdayLabels"
          :key="label"
          class="py-2 text-center text-[9px] font-bold uppercase text-gray-500"
        >
          {{ label }}
        </div>
      </div>
      <div class="grid grid-cols-7">
        <button
          v-for="day in days"
          :key="day.toISOString()"
          type="button"
          class="relative min-h-14 border-b border-r border-gray-800 p-1 text-left last:border-r-0"
          :class="[
            isSameMonth(day, viewMonth) ? 'text-gray-200' : 'text-gray-700',
            selectedDate === format(day, 'yyyy-MM-dd') ? 'bg-gray-800 ring-1 ring-inset ring-white' : '',
          ]"
          @click="selectDay(day)"
        >
          <span
            class="text-[10px] font-bold"
            :class="isToday(day) ? 'text-white underline' : ''"
          >
            {{ format(day, 'd') }}
          </span>
          <span class="mt-1 flex flex-wrap gap-0.5">
            <span
              v-for="event in eventsOnDay(day)"
              :key="event.id"
              class="h-1.5 w-1.5 rounded-full"
              :class="isPast(event) ? 'bg-gray-600' : 'bg-orange-500'"
              :title="event.title"
            />
          </span>
        </button>
      </div>

      <div class="flex items-center gap-4 border-t border-gray-800 px-3 py-2 text-[10px] text-gray-500">
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-orange-500" />
          {{ language === 'es' ? 'Próximas' : 'Upcoming' }}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full bg-gray-600" />
          {{ language === 'es' ? 'Pasadas' : 'Past' }}
        </span>
      </div>

      <div v-if="selectedDate" class="border-t border-gray-800 p-3">
        <p class="mb-2 text-[10px] font-black tracking-wider text-gray-500">
          {{ selectedLabel }}
        </p>
        <p v-if="!selectedEvents.length" class="text-xs text-gray-600">
          {{ language === 'es' ? 'Sin competencias.' : 'No competitions.' }}
        </p>
        <div v-else class="space-y-2">
          <div
            v-for="event in selectedEvents"
            :key="event.id"
            class="flex items-start gap-2"
          >
            <span
              class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              :class="isPast(event) ? 'bg-gray-600' : 'bg-orange-500'"
            />
            <div>
              <p class="text-sm font-bold text-white">{{ event.title }}</p>
              <p v-if="event.location" class="text-xs text-gray-500">{{ event.location }}</p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
