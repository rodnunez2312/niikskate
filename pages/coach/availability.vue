<script setup lang="ts">
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isBefore,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { DayOfWeek, TimeSlot } from '~/types'
import { TIME_SLOT_LABELS, TIME_SLOT_NAMES } from '~/types'
import { jsDayToDayOfWeek, slotsForWeekday } from '~/utils/classSchedule'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

type CalendarEventRow = {
  id: string
  title: string
  event_type: string
  start_date: string
  end_date: string | null
  time_slot: TimeSlot | null
  start_time: string | null
  end_time: string | null
}

/** Event types that mean "a class is planned that day". */
const CLASS_EVENT_TYPES = ['class_session', 'class_individual'] as const

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()
const {
  loading,
  fetchMonthlyAvailability,
  fetchDateOverrides,
  setDateOverrides,
  clearDateOverrides,
  hasDateOverride,
  getEffectiveAvailability,
} = useCoachAvailability()

const isCoach = ref(false)
const checkingRole = ref(true)
const coachName = ref('')
const events = ref<CalendarEventRow[]>([])
const eventsError = ref('')
const saving = ref(false)
const saveSuccess = ref(false)

const viewMonth = ref(new Date())
/** Multi-day selection, stored as 'yyyy-MM-dd' keys. */
const selectedYmds = ref<string[]>([])

/** Unsaved edits: { 'yyyy-MM-dd': { early: true, ... } } */
const draft = ref<Record<string, Partial<Record<TimeSlot, boolean>>>>({})

const es_ = computed(() => language.value === 'es')
const locale = computed(() => (es_.value ? es : undefined))

const monthLabel = computed(() => format(viewMonth.value, 'MMMM yyyy', { locale: locale.value }))

const monthGrid = computed(() => {
  const start = startOfWeek(startOfMonth(viewMonth.value), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(viewMonth.value), { weekStartsOn: 0 })
  return eachDayOfInterval({ start, end })
})

const weekdayHeaders = computed(() =>
  es_.value
    ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
)

const ymd = (date: Date) => format(date, 'yyyy-MM-dd')

const fromYmd = (value: string) => {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const dayOfWeekFor = (date: Date): DayOfWeek | null =>
  (jsDayToDayOfWeek(getDay(date)) as DayOfWeek | null)

/** Slots the schedule offers on that weekday (Monday 4:30 only, Saturday adds morning). */
const scheduleSlots = (date: Date): TimeSlot[] => slotsForWeekday(getDay(date))

const eventsByDate = computed(() => {
  const map: Record<string, CalendarEventRow[]> = {}
  for (const ev of events.value) {
    const list = map[ev.start_date] || (map[ev.start_date] = [])
    list.push(ev)
  }
  return map
})

const classesOn = (date: Date): CalendarEventRow[] =>
  (eventsByDate.value[ymd(date)] || [])
    .filter(ev => (CLASS_EVENT_TYPES as readonly string[]).includes(ev.event_type))
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))

const holidayOn = (date: Date): CalendarEventRow | null =>
  (eventsByDate.value[ymd(date)] || []).find(
    ev => ev.event_type === 'holiday' || ev.event_type === 'school_closure',
  ) || null

/** Slots to confirm for a date: the planned classes if any, else the standard schedule. */
const slotsOn = (date: Date): TimeSlot[] => {
  const planned = classesOn(date)
    .map(ev => ev.time_slot)
    .filter((s): s is TimeSlot => !!s)
  if (planned.length) return [...new Set(planned)]
  return scheduleSlots(date)
}

const draftValue = (date: Date, slot: TimeSlot): boolean | undefined =>
  draft.value[ymd(date)]?.[slot]

const slotValue = (date: Date, slot: TimeSlot): boolean => {
  const pending = draftValue(date, slot)
  if (pending !== undefined) return pending
  const dow = dayOfWeekFor(date)
  if (!dow) return false
  return getEffectiveAvailability(ymd(date), dow, slot)
}

const slotIsConfirmed = (date: Date, slot: TimeSlot): boolean =>
  draftValue(date, slot) !== undefined || !!hasDateOverride(ymd(date), slot)

type DayStatus = 'none' | 'unset' | 'available' | 'partial' | 'off'

const dayStatus = (date: Date): DayStatus => {
  const slots = slotsOn(date)
  if (!slots.length) return 'none'
  if (!slots.some(slot => slotIsConfirmed(date, slot))) return 'unset'
  const active = slots.filter(slot => slotValue(date, slot)).length
  if (active === slots.length) return 'available'
  if (active === 0) return 'off'
  return 'partial'
}

const isPastDay = (date: Date) => isBefore(startOfDay(date), startOfDay(new Date()))

// ---------------------------------------------------------------- selection

/** Days without classes can't be selected. */
const selectableDay = (date: Date) => slotsOn(date).length > 0

const isSelected = (date: Date) => selectedYmds.value.includes(ymd(date))

const setSelected = (date: Date, on: boolean) => {
  const key = ymd(date)
  const has = selectedYmds.value.includes(key)
  if (on && !has) selectedYmds.value = [...selectedYmds.value, key]
  else if (!on && has) selectedYmds.value = selectedYmds.value.filter(k => k !== key)
}

const clearSelection = () => {
  selectedYmds.value = []
}

const selectedDates = computed(() => [...selectedYmds.value].sort().map(fromYmd))
const selectionCount = computed(() => selectedYmds.value.length)
const singleSelected = computed(() =>
  selectionCount.value === 1 ? selectedDates.value[0] : null,
)

/** Select every occurrence of one weekday in the visible month (e.g. all Thursdays). */
const selectWeekday = (weekday: number) => {
  const days = monthGrid.value.filter(
    d => isSameMonth(d, viewMonth.value) && getDay(d) === weekday && selectableDay(d),
  )
  if (!days.length) return
  const allOn = days.every(isSelected)
  for (const d of days) setSelected(d, !allOn)
  saveSuccess.value = false
}

// -------------------------------------------------------- drag to select

const dragging = ref(false)
/** Painting on (true) or off (false), decided by the first day touched. */
const dragTarget = ref(true)

const onDayPointerDown = (date: Date, ev: PointerEvent) => {
  if (!selectableDay(date)) return
  saveSuccess.value = false
  dragging.value = true
  dragTarget.value = !isSelected(date)
  setSelected(date, dragTarget.value)
  // Touch pointers are implicitly captured; release so pointerenter still fires.
  const el = ev.currentTarget as HTMLElement | null
  el?.releasePointerCapture?.(ev.pointerId)
}

const onDayPointerEnter = (date: Date) => {
  if (!dragging.value || !selectableDay(date)) return
  setSelected(date, dragTarget.value)
}

/** Touch fallback: resolve the day under the finger since pointerenter may not fire. */
const onGridPointerMove = (ev: PointerEvent) => {
  if (!dragging.value || ev.pointerType === 'mouse') return
  const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null
  const key = (el?.closest?.('[data-day]') as HTMLElement | null)?.dataset.day
  if (!key) return
  const date = fromYmd(key)
  if (!selectableDay(date)) return
  setSelected(date, dragTarget.value)
}

const endDrag = () => {
  dragging.value = false
}

const dayCellClass = (date: Date) => {
  const inMonth = isSameMonth(date, viewMonth.value)
  const status = dayStatus(date)
  const base = inMonth ? '' : 'opacity-40'
  const selected = isSelected(date) ? 'ring-2 ring-gold-400 scale-[0.97]' : ''
  const tone = {
    none: 'bg-gray-900/40 border-gray-800/60 text-gray-600',
    unset: 'bg-gray-800 border-gray-600 text-white',
    available: 'bg-glass-green/25 border-glass-green text-white',
    partial: 'bg-gold-400/20 border-gold-400/70 text-white',
    off: 'bg-flame-600/20 border-flame-600/70 text-gray-300',
  }[status]
  return [base, tone, selected].filter(Boolean).join(' ')
}

// ------------------------------------------------- editing the selection

/** Fixed display order so the union of slots never jumps around. */
const SLOT_ORDER: TimeSlot[] = ['monday', 'morning', 'early', 'late', 'summer']

const selectionSlots = computed(() => {
  const set = new Set<TimeSlot>()
  for (const date of selectedDates.value) {
    for (const slot of slotsOn(date)) set.add(slot)
  }
  return SLOT_ORDER.filter(slot => set.has(slot))
})

/** Selected days that actually offer this slot. */
const datesWithSlot = (slot: TimeSlot) =>
  selectedDates.value.filter(date => slotsOn(date).includes(slot))

type SlotState = 'all' | 'none' | 'mixed'

const slotState = (slot: TimeSlot): SlotState => {
  const dates = datesWithSlot(slot)
  if (!dates.length) return 'none'
  const on = dates.filter(date => slotValue(date, slot)).length
  if (on === dates.length) return 'all'
  if (on === 0) return 'none'
  return 'mixed'
}

const selectionStatus = computed<DayStatus>(() => {
  const dates = selectedDates.value
  if (!dates.length) return 'none'
  const statuses = dates.map(dayStatus)
  if (statuses.every(s => s === 'available')) return 'available'
  if (statuses.every(s => s === 'off')) return 'off'
  if (statuses.every(s => s === 'unset')) return 'unset'
  return 'partial'
})

const selectedClasses = computed(() =>
  selectedDates.value.flatMap(date => classesOn(date)),
)

const selectedHoliday = computed(() => {
  for (const date of selectedDates.value) {
    const holiday = holidayOn(date)
    if (holiday) return holiday
  }
  return null
})

/** Class titles for a slot — only meaningful when a single day is selected. */
const classesForSlot = (slot: TimeSlot) => {
  const date = singleSelected.value
  if (!date) return []
  return classesOn(date).filter(ev => ev.time_slot === slot)
}

const setDraft = (date: Date, slot: TimeSlot, value: boolean) => {
  const key = ymd(date)
  draft.value[key] = { ...(draft.value[key] || {}), [slot]: value }
  saveSuccess.value = false
}

/** Toggle one slot across every selected day that offers it. */
const toggleSlot = (slot: TimeSlot) => {
  const turnOn = slotState(slot) !== 'all'
  for (const date of datesWithSlot(slot)) setDraft(date, slot, turnOn)
}

/** Step 1: confirm (or decline) every selected day at once. */
const confirmSelection = (available: boolean) => {
  for (const date of selectedDates.value) {
    for (const slot of slotsOn(date)) setDraft(date, slot, available)
  }
}

const selectionLabel = computed(() => {
  const single = singleSelected.value
  if (single) {
    return format(single, es_.value ? "EEEE d 'de' MMMM" : 'EEEE, MMMM d', {
      locale: locale.value,
    })
  }
  return es_.value
    ? `${selectionCount.value} días seleccionados`
    : `${selectionCount.value} days selected`
})

const chipLabel = (date: Date) => format(date, 'd MMM', { locale: locale.value })

/** Confirm every class day of the visible month in one pass. */
const confirmMonth = (available: boolean) => {
  for (const day of monthGrid.value) {
    if (!isSameMonth(day, viewMonth.value)) continue
    for (const slot of slotsOn(day)) setDraft(day, slot, available)
  }
}

const slotName = (slot: TimeSlot) =>
  es_.value ? TIME_SLOT_NAMES[slot].es : TIME_SLOT_NAMES[slot].en

const pendingDates = computed(() => Object.keys(draft.value).filter(d => {
  const slots = draft.value[d]
  return slots && Object.keys(slots).length > 0
}))

const pendingCount = computed(() =>
  pendingDates.value.reduce((n, d) => n + Object.keys(draft.value[d] || {}).length, 0),
)

const monthClassDays = computed(
  () => monthGrid.value.filter(d => isSameMonth(d, viewMonth.value) && slotsOn(d).length).length,
)

const monthConfirmedDays = computed(
  () =>
    monthGrid.value.filter(
      d => isSameMonth(d, viewMonth.value) && slotsOn(d).length && dayStatus(d) !== 'unset',
    ).length,
)

const loadMonth = async () => {
  if (!user.value) return
  const year = viewMonth.value.getFullYear()
  const month = viewMonth.value.getMonth() + 1

  await Promise.all([
    fetchMonthlyAvailability(user.value.id, year, month),
    fetchDateOverrides(user.value.id, year, month),
    loadEvents(),
  ])
  draft.value = {}
}

const loadEvents = async () => {
  eventsError.value = ''
  try {
    const grid = monthGrid.value
    const { data, error } = await client
      .from('school_calendar_events')
      .select('id, title, event_type, start_date, end_date, time_slot, start_time, end_time')
      .gte('start_date', ymd(grid[0]))
      .lte('start_date', ymd(grid[grid.length - 1]))
      .order('start_date', { ascending: true })
    if (error) throw error
    events.value = (data || []) as CalendarEventRow[]
  } catch (e) {
    eventsError.value = (e as { message?: string })?.message || String(e)
    events.value = []
  }
}

const goPrevMonth = async () => {
  viewMonth.value = subMonths(viewMonth.value, 1)
  clearSelection()
  await loadMonth()
}

const goNextMonth = async () => {
  viewMonth.value = addMonths(viewMonth.value, 1)
  clearSelection()
  await loadMonth()
}

const goToday = async () => {
  const today = new Date()
  const sameMonth = isSameMonth(today, viewMonth.value)
  viewMonth.value = today
  if (!sameMonth) await loadMonth()
  clearSelection()
  if (selectableDay(today)) setSelected(today, true)
}

const saveChanges = async () => {
  if (!user.value || !pendingCount.value) return
  saving.value = true
  try {
    const rows = pendingDates.value.flatMap(date =>
      Object.entries(draft.value[date] || {}).map(([slot, isAvailable]) => ({
        date,
        timeSlot: slot as TimeSlot,
        isAvailable: !!isAvailable,
      })),
    )
    const result = await setDateOverrides(user.value.id, rows)
    if (result.success) {
      draft.value = {}
      saveSuccess.value = true
      setTimeout(() => (saveSuccess.value = false), 3000)
    } else {
      alert(
        es_.value
          ? `No se pudo guardar: ${result.error}`
          : `Could not save: ${result.error}`,
      )
    }
  } finally {
    saving.value = false
  }
}

/** Back to the monthly default for every selected date. */
const resetSelection = async () => {
  if (!user.value || !selectionCount.value) return
  for (const key of [...selectedYmds.value]) {
    delete draft.value[key]
    await clearDateOverrides(user.value.id, key)
  }
}

onMounted(async () => {
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)

  if (!user.value) {
    router.push('/auth/login?redirect=/coach/availability')
    return
  }

  const { data } = await client
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.value.id)
    .single()

  if (data?.role !== 'coach' && data?.role !== 'admin') {
    router.push('/')
    return
  }

  isCoach.value = true
  coachName.value = data?.full_name || 'Coach'
  checkingRole.value = false

  await loadMonth()
  const today = new Date()
  if (selectableDay(today)) setSelected(today, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
})
</script>

<template>
  <div class="min-h-screen bg-black pb-28">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-lg mx-auto">
        <div class="flex items-center gap-4 mb-4">
          <button @click="router.push('/')" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div class="min-w-0">
            <h1 class="text-xl font-bold text-white">
              {{ es_ ? 'Mi Disponibilidad' : 'My Availability' }}
            </h1>
            <p class="text-sm text-gray-400 truncate">{{ coachName }}</p>
          </div>
        </div>

        <div class="flex items-center justify-between bg-gray-800 rounded-xl p-2">
          <button @click="goPrevMonth" class="p-2 rounded-lg hover:bg-gray-700 text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button class="text-lg font-semibold text-white capitalize" @click="goToday">
            {{ monthLabel }}
          </button>
          <button @click="goNextMonth" class="p-2 rounded-lg hover:bg-gray-700 text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="checkingRole" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p class="text-gray-400">{{ es_ ? 'Cargando...' : 'Loading...' }}</p>
      </div>
    </div>

    <div v-else-if="isCoach" class="px-4 py-5 max-w-lg mx-auto">
      <!-- Instructions -->
      <div class="bg-gradient-to-r from-glass-purple/20 to-glass-blue/20 rounded-2xl p-4 mb-4 border border-glass-purple/30">
        <p class="text-sm text-gray-300">
          <strong class="text-white">
            {{ es_ ? '1. Elige los días con clase' : '1. Pick the days with a class' }}
          </strong>
          {{ es_
            ? 'tocando o arrastrando, confirma tu disponibilidad y luego ajusta cada horario.'
            : 'by tapping or dragging, confirm your availability, then adjust each class time.'
          }}
        </p>
        <p class="text-xs text-gray-400 mt-2">
          {{ monthConfirmedDays }} / {{ monthClassDays }}
          {{ es_ ? 'días confirmados este mes' : 'days confirmed this month' }}
        </p>
      </div>

      <p v-if="eventsError" class="text-xs text-flame-500 mb-3">{{ eventsError }}</p>

      <!-- Month-wide shortcuts -->
      <div class="flex gap-2 mb-4">
        <button
          type="button"
          class="flex-1 py-2.5 px-3 rounded-xl border border-glass-green bg-glass-green/15 text-white text-xs font-semibold"
          @click="confirmMonth(true)"
        >
          {{ es_ ? 'Confirmar todo el mes' : 'Confirm whole month' }}
        </button>
        <button
          type="button"
          class="flex-1 py-2.5 px-3 rounded-xl border border-flame-600 bg-flame-600/15 text-white text-xs font-semibold"
          @click="confirmMonth(false)"
        >
          {{ es_ ? 'Marcar mes no disponible' : 'Mark month unavailable' }}
        </button>
      </div>

      <!-- Month calendar -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-3 mb-4">
        <p class="text-[11px] text-gray-500 text-center mb-2">
          {{ es_
            ? 'Toca varios días o arrastra de lado a lado para seleccionarlos.'
            : 'Tap several days, or drag sideways to select a range.'
          }}
        </p>

        <!-- Tap a weekday header to select every one of them this month -->
        <div class="grid grid-cols-7 mb-1">
          <button
            v-for="(head, index) in weekdayHeaders"
            :key="head"
            type="button"
            class="text-center text-[11px] font-bold uppercase py-1 rounded transition-colors"
            :class="[1, 2, 4, 6].includes(index)
              ? 'text-gold-400 hover:bg-gray-800'
              : 'text-gray-600 cursor-default'"
            @click="[1, 2, 4, 6].includes(index) && selectWeekday(index)"
          >
            {{ head }}
          </button>
        </div>

        <div
          class="grid grid-cols-7 gap-1 select-none"
          style="touch-action: pan-y"
          @pointermove="onGridPointerMove"
        >
          <button
            v-for="day in monthGrid"
            :key="day.toISOString()"
            type="button"
            :data-day="format(day, 'yyyy-MM-dd')"
            :aria-disabled="!selectableDay(day)"
            :aria-pressed="isSelected(day)"
            class="relative aspect-square rounded-lg border flex flex-col items-center justify-center transition-all"
            :class="[dayCellClass(day), selectableDay(day) ? '' : 'cursor-default']"
            @pointerdown="onDayPointerDown(day, $event)"
            @pointerenter="onDayPointerEnter(day)"
          >
            <span
              class="text-sm font-bold leading-none"
              :class="isToday(day) ? 'text-gold-400' : ''"
            >
              {{ format(day, 'd') }}
            </span>

            <span v-if="classesOn(day).length" class="flex gap-0.5 mt-1">
              <span
                v-for="cls in classesOn(day).slice(0, 3)"
                :key="cls.id"
                class="w-1 h-1 rounded-full bg-current opacity-70"
              />
            </span>
            <span
              v-else-if="slotsOn(day).length"
              class="mt-1 text-[9px] leading-none text-gray-500"
            >
              ·
            </span>

            <span
              v-if="holidayOn(day)"
              class="absolute top-0.5 right-0.5 text-[9px] leading-none"
              :title="holidayOn(day)?.title"
            >
              🎉
            </span>
            <span
              v-if="pendingDates.includes(format(day, 'yyyy-MM-dd'))"
              class="absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-gold-400"
            />
          </button>
        </div>
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[11px] text-gray-400 mb-5">
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-glass-green/25 border border-glass-green" />
          {{ es_ ? 'Disponible' : 'Available' }}
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-gold-400/20 border border-gold-400/70" />
          {{ es_ ? 'Parcial' : 'Partial' }}
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-flame-600/20 border border-flame-600/70" />
          {{ es_ ? 'No disponible' : 'Unavailable' }}
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded bg-gray-800 border border-gray-600" />
          {{ es_ ? 'Sin confirmar' : 'Not confirmed' }}
        </span>
      </div>

      <!-- Selection detail -->
      <div v-if="selectionCount" class="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div class="px-4 py-3 bg-gray-800/70 border-b border-gray-700 flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-bold text-white capitalize">{{ selectionLabel }}</p>
            <p class="text-xs text-gray-400">
              {{ selectedClasses.length
                ? `${selectedClasses.length} ${es_ ? 'clase(s) programada(s)' : 'class(es) scheduled'}`
                : (es_ ? 'Horario regular (sin clases publicadas)' : 'Regular schedule (no published classes)')
              }}
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 text-xs text-gray-400 underline"
            @click="clearSelection"
          >
            {{ es_ ? 'Limpiar' : 'Clear' }}
          </button>
        </div>

        <!-- Selected day chips (multi-selection) -->
        <div v-if="selectionCount > 1" class="px-4 py-3 border-b border-gray-800 flex flex-wrap gap-1.5">
          <button
            v-for="date in selectedDates"
            :key="date.toISOString()"
            type="button"
            class="px-2 py-1 rounded-lg bg-gray-800 border border-gray-700 text-[11px] text-gray-300 flex items-center gap-1"
            @click="setSelected(date, false)"
          >
            {{ chipLabel(date) }}
            <span class="text-gray-500">✕</span>
          </button>
        </div>

        <div v-if="selectedHoliday" class="px-4 py-2 bg-flame-600/10 border-b border-flame-600/30">
          <p class="text-xs text-flame-500">
            🎉 {{ selectedHoliday.title }}
          </p>
        </div>

        <p v-if="singleSelected && isPastDay(singleSelected)" class="px-4 pt-3 text-xs text-gray-500">
          {{ es_ ? 'Día pasado — solo referencia.' : 'Past day — reference only.' }}
        </p>

        <!-- Step 1: confirm the selected days -->
        <div class="p-4 border-b border-gray-800">
          <p class="text-xs font-bold uppercase tracking-wide text-gold-400 mb-2">
            {{ selectionCount > 1
              ? (es_ ? `1. Disponibilidad de ${selectionCount} días` : `1. Availability for ${selectionCount} days`)
              : (es_ ? '1. Disponibilidad del día' : '1. Day availability')
            }}
          </p>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="py-3 rounded-xl text-sm font-bold border transition-all"
              :class="selectionStatus === 'available'
                ? 'border-glass-green bg-glass-green text-white'
                : 'border-glass-green/50 text-glass-green bg-glass-green/10'"
              @click="confirmSelection(true)"
            >
              ✓ {{ es_ ? 'Disponible' : 'Available' }}
            </button>
            <button
              type="button"
              class="py-3 rounded-xl text-sm font-bold border transition-all"
              :class="selectionStatus === 'off'
                ? 'border-flame-600 bg-flame-600 text-white'
                : 'border-flame-600/50 text-flame-500 bg-flame-600/10'"
              @click="confirmSelection(false)"
            >
              ✕ {{ es_ ? 'No puedo' : 'Unavailable' }}
            </button>
          </div>
        </div>

        <!-- Step 2: class schedule -->
        <div class="p-4">
          <p class="text-xs font-bold uppercase tracking-wide text-gold-400 mb-2">
            {{ es_ ? '2. Horario de la clase' : '2. Class schedule' }}
          </p>

          <div class="space-y-2">
            <button
              v-for="slot in selectionSlots"
              :key="slot"
              type="button"
              class="w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors"
              :class="{
                'border-glass-green/60 bg-glass-green/10': slotState(slot) === 'all',
                'border-gold-400/60 bg-gold-400/10': slotState(slot) === 'mixed',
                'border-gray-700 bg-gray-800/60': slotState(slot) === 'none',
              }"
              @click="toggleSlot(slot)"
            >
              <span
                class="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center"
                :class="{
                  'bg-glass-green text-white': slotState(slot) === 'all',
                  'bg-gold-400 text-black': slotState(slot) === 'mixed',
                  'bg-gray-800 text-gray-600 border border-gray-700': slotState(slot) === 'none',
                }"
              >
                <svg v-if="slotState(slot) === 'all'" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <span v-else-if="slotState(slot) === 'mixed'" class="text-lg font-black leading-none">–</span>
                <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
              </span>

              <span class="flex-1 min-w-0">
                <span class="block text-sm font-semibold text-white">{{ slotName(slot) }}</span>
                <span class="block text-xs text-gray-500">{{ TIME_SLOT_LABELS[slot].display }}</span>
                <span
                  v-for="cls in classesForSlot(slot)"
                  :key="cls.id"
                  class="block text-[11px] text-glass-blue truncate"
                >
                  🛹 {{ cls.title }}
                </span>
                <span v-if="selectionCount > 1" class="block text-[11px] text-gray-500">
                  {{ datesWithSlot(slot).length }}
                  {{ es_ ? 'de los días elegidos' : 'of the selected days' }}
                </span>
              </span>

              <span
                class="shrink-0 text-[10px] font-bold uppercase"
                :class="{
                  'text-glass-green': slotState(slot) === 'all',
                  'text-gold-400': slotState(slot) === 'mixed',
                  'text-gray-600': slotState(slot) === 'none',
                }"
              >
                {{ slotState(slot) === 'all'
                  ? (es_ ? 'Sí' : 'Yes')
                  : slotState(slot) === 'mixed'
                    ? (es_ ? 'Mixto' : 'Mixed')
                    : (es_ ? 'No' : 'No')
                }}
              </span>
            </button>
          </div>

          <button
            type="button"
            class="mt-3 text-xs text-gray-500 underline"
            @click="resetSelection"
          >
            {{ selectionCount > 1
              ? (es_ ? 'Usar mi horario habitual en estos días' : 'Use my usual schedule on these days')
              : (es_ ? 'Usar mi horario habitual este día' : 'Use my usual schedule for this day')
            }}
          </button>
        </div>
      </div>

      <div v-else class="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
        <p class="text-sm text-gray-400">
          {{ es_
            ? 'Toca uno o varios días del calendario para empezar.'
            : 'Tap one or more days on the calendar to start.'
          }}
        </p>
      </div>

      <!-- Success -->
      <Transition
        enter-active-class="transition-all duration-300"
        enter-from-class="opacity-0 translate-y-2"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition-all duration-300"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 translate-y-2"
      >
        <div v-if="saveSuccess" class="mt-4 bg-glass-green/20 border border-glass-green rounded-xl p-3 text-center">
          <p class="text-glass-green font-medium">
            ✓ {{ es_ ? 'Disponibilidad guardada' : 'Availability saved' }}
          </p>
        </div>
      </Transition>

      <p class="text-xs text-gray-500 text-center mt-5">
        {{ es_
          ? 'Confirmas día por día. Los estudiantes solo pueden reservar en los horarios que confirmes.'
          : 'You confirm day by day. Students can only book the times you confirm.'
        }}
      </p>
    </div>

    <!-- Sticky save bar -->
    <div
      v-if="isCoach && pendingCount"
      class="fixed bottom-0 left-0 right-0 z-40 bg-gray-950/95 backdrop-blur border-t border-gray-800 px-4 py-3 pb-safe"
    >
      <div class="max-w-lg mx-auto flex items-center gap-3">
        <p class="text-xs text-gray-400 flex-1 min-w-0">
          {{ pendingDates.length }}
          {{ es_ ? 'día(s) por guardar' : 'day(s) pending' }}
        </p>
        <button
          type="button"
          :disabled="saving || loading"
          class="px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-gold-400 to-gold-500 text-black disabled:opacity-60"
          @click="saveChanges"
        >
          {{ saving ? (es_ ? 'Guardando...' : 'Saving...') : (es_ ? 'Guardar' : 'Save') }}
        </button>
      </div>
    </div>
  </div>
</template>
