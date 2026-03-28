<script setup lang="ts">
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'

definePageMeta({
  middleware: ['auth'],
})

export type SchoolCalendarEventType =
  | 'event'
  | 'competition'
  | 'holiday'
  | 'school_closure'
  | 'school_open'
  | 'practice'
  | 'meeting'
  | 'camp'
  | 'show'
  | 'custom'

export interface SchoolCalendarRow {
  id: string
  title: string
  event_type: SchoolCalendarEventType
  start_date: string
  end_date: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  location: string | null
  description: string | null
  visible_to_parents: boolean
  created_at: string
}

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

const isAdmin = ref(false)
const loading = ref(true)
const events = ref<SchoolCalendarRow[]>([])
const viewMonth = ref(new Date())
const selectedDate = ref<Date | null>(null)
const filterType = ref<SchoolCalendarEventType | 'all'>('all')

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const formError = ref('')

const form = ref({
  title: '',
  event_type: 'event' as SchoolCalendarEventType,
  start_date: '',
  end_date: '',
  all_day: true,
  location: '',
  description: '',
  visible_to_parents: true,
})

const EVENT_META: Record<
  SchoolCalendarEventType,
  { dot: string; label: { en: string; es: string }; emoji: string }
> = {
  event: { dot: 'bg-violet-500', label: { en: 'Event', es: 'Evento' }, emoji: '📅' },
  competition: { dot: 'bg-orange-500', label: { en: 'Competition', es: 'Competencia' }, emoji: '🏆' },
  holiday: { dot: 'bg-teal-500', label: { en: 'Holiday', es: 'Festivo' }, emoji: '✨' },
  school_closure: { dot: 'bg-red-500', label: { en: 'School closure', es: 'Cierre escolar' }, emoji: '🚫' },
  school_open: { dot: 'bg-emerald-600', label: { en: 'School open', es: 'Abierto' }, emoji: '✅' },
  practice: { dot: 'bg-sky-500', label: { en: 'Practice', es: 'Práctica' }, emoji: '🏃' },
  meeting: { dot: 'bg-indigo-500', label: { en: 'Meeting', es: 'Junta' }, emoji: '👥' },
  camp: { dot: 'bg-amber-500', label: { en: 'Camp', es: 'Campamento' }, emoji: '⛺' },
  show: { dot: 'bg-pink-500', label: { en: 'Show', es: 'Show' }, emoji: '🎭' },
  custom: { dot: 'bg-gray-500', label: { en: 'Custom', es: 'Personalizado' }, emoji: '🏷️' },
}

const eventTypeOrder = Object.keys(EVENT_META) as SchoolCalendarEventType[]

const tLabel = (type: SchoolCalendarEventType) =>
  language.value === 'es' ? EVENT_META[type].label.es : EVENT_META[type].label.en

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/admin/calendar')
    return
  }
  const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if (data?.role !== 'admin') {
    router.push('/')
    return
  }
  isAdmin.value = true
  await loadEvents()
})

const loadEvents = async () => {
  loading.value = true
  formError.value = ''
  try {
    const { data, error } = await client.from('school_calendar_events').select('*').order('start_date', { ascending: true })
    if (error) throw error
    events.value = (data || []) as SchoolCalendarRow[]
  } catch (e: any) {
    console.error('loadEvents:', e)
    formError.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

const filteredEvents = computed(() => {
  if (filterType.value === 'all') return events.value
  return events.value.filter(e => e.event_type === filterType.value)
})

const monthRange = computed(() => {
  const start = startOfMonth(viewMonth.value)
  const end = endOfMonth(viewMonth.value)
  const gridStart = startOfWeek(start, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(end, { weekStartsOn: 0 })
  return { start, end, gridStart, gridEnd, days: eachDayOfInterval({ start: gridStart, end: gridEnd }) }
})

const overlapsDay = (ev: SchoolCalendarRow, day: Date) => {
  const d = format(day, 'yyyy-MM-dd')
  const s = ev.start_date
  const e = ev.end_date || ev.start_date
  return s <= d && e >= d
}

const eventsOnDay = (day: Date) => filteredEvents.value.filter(ev => overlapsDay(ev, day))

const monthLabel = computed(() => {
  const loc = language.value === 'es' ? es : undefined
  return format(viewMonth.value, 'MMMM yyyy', { locale: loc })
})

const weekdayLabels = computed(() =>
  language.value === 'es' ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
)

const openCreateForDay = (day: Date) => {
  selectedDate.value = day
  editingId.value = null
  const ymd = format(day, 'yyyy-MM-dd')
  form.value = {
    title: '',
    event_type: 'event',
    start_date: ymd,
    end_date: ymd,
    all_day: true,
    location: '',
    description: '',
    visible_to_parents: true,
  }
  modalOpen.value = true
  formError.value = ''
}

const openAddEvent = () => {
  openCreateForDay(new Date())
}

const openEdit = (ev: SchoolCalendarRow, e?: Event) => {
  e?.stopPropagation?.()
  selectedDate.value = new Date(ev.start_date + 'T12:00:00')
  editingId.value = ev.id
  form.value = {
    title: ev.title,
    event_type: ev.event_type,
    start_date: ev.start_date,
    end_date: ev.end_date || ev.start_date,
    all_day: ev.all_day,
    location: ev.location || '',
    description: ev.description || '',
    visible_to_parents: ev.visible_to_parents,
  }
  modalOpen.value = true
  formError.value = ''
}

const closeModal = () => {
  modalOpen.value = false
  editingId.value = null
}

const submitEvent = async () => {
  if (!user.value) return
  const title = form.value.title.trim()
  if (!title) {
    formError.value = language.value === 'es' ? 'El título es obligatorio' : 'Title is required'
    return
  }
  if (!form.value.start_date) {
    formError.value = language.value === 'es' ? 'La fecha de inicio es obligatoria' : 'Start date is required'
    return
  }
  const end = form.value.end_date?.trim() || form.value.start_date
  if (end < form.value.start_date) {
    formError.value = language.value === 'es' ? 'La fecha fin no puede ser antes del inicio' : 'End date cannot be before start'
    return
  }

  saving.value = true
  formError.value = ''
  try {
    const basePayload = {
      title,
      event_type: form.value.event_type,
      start_date: form.value.start_date,
      end_date: end === form.value.start_date ? null : end,
      all_day: form.value.all_day,
      start_time: null as string | null,
      end_time: null as string | null,
      location: form.value.location.trim() || null,
      description: form.value.description.trim() || null,
      visible_to_parents: form.value.visible_to_parents,
    }

    if (editingId.value) {
      const { error } = await client.from('school_calendar_events').update(basePayload).eq('id', editingId.value)
      if (error) throw error
    } else {
      const { error } = await client
        .from('school_calendar_events')
        .insert({ ...basePayload, created_by: user.value.id })
      if (error) throw error
    }
    await loadEvents()
    closeModal()
  } catch (e: any) {
    formError.value = e?.message || String(e)
  } finally {
    saving.value = false
  }
}

const deleteEvent = async () => {
  if (!editingId.value) return
  const ok = confirm(language.value === 'es' ? '¿Eliminar este evento?' : 'Delete this event?')
  if (!ok) return
  saving.value = true
  formError.value = ''
  try {
    const { error } = await client.from('school_calendar_events').delete().eq('id', editingId.value)
    if (error) throw error
    await loadEvents()
    closeModal()
  } catch (e: any) {
    formError.value = e?.message || String(e)
  } finally {
    saving.value = false
  }
}

const goToday = () => {
  viewMonth.value = new Date()
  selectedDate.value = new Date()
}

const isSelectedDay = (day: Date) => selectedDate.value && isSameDay(day, selectedDate.value)
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-4xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3 min-w-0">
          <button type="button" class="p-2 -ml-2 text-gold-400 shrink-0" @click="router.push('/admin')">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div class="min-w-0">
            <h1 class="text-xl font-bold text-white flex items-center gap-2">
              <span aria-hidden="true">📅</span>
              {{ language === 'es' ? 'Calendario escolar' : 'School calendar' }}
            </h1>
            <p class="text-xs text-gray-500 truncate">
              {{
                language === 'es'
                  ? 'Eventos, competencias, cierres y más.'
                  : 'Manage school events, holidays, closures, and more.'
              }}
            </p>
          </div>
        </div>
        <button
          type="button"
          class="shrink-0 px-4 py-2.5 rounded-xl bg-white text-black font-semibold text-sm"
          @click="openAddEvent"
        >
          + {{ language === 'es' ? 'Añadir evento' : 'Add event' }}
        </button>
      </div>
    </header>

    <div v-if="isAdmin" class="px-4 py-6 max-w-4xl mx-auto space-y-4">
      <div v-if="formError && !modalOpen" class="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">
        {{ formError }}
        <p class="text-xs text-red-300/80 mt-2">
          {{
            language === 'es'
              ? 'Si la tabla no existe, ejecuta add_school_calendar_events.sql en Supabase.'
              : 'If the table is missing, run add_school_calendar_events.sql in Supabase.'
          }}
        </p>
      </div>

      <!-- Toolbar -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
            @click="viewMonth = addMonths(viewMonth, -1)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span class="text-white font-semibold capitalize min-w-[140px] text-center">{{ monthLabel }}</span>
          <button
            type="button"
            class="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
            @click="viewMonth = addMonths(viewMonth, 1)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            type="button"
            class="ml-1 px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800"
            @click="goToday"
          >
            {{ language === 'es' ? 'Hoy' : 'Today' }}
          </button>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-gray-500 text-sm hidden sm:inline">{{ language === 'es' ? 'Filtrar' : 'Filter' }}</span>
          <select
            v-model="filterType"
            class="flex-1 sm:flex-none min-w-[160px] px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm"
          >
            <option value="all">{{ language === 'es' ? 'Todos los eventos' : 'All events' }}</option>
            <option v-for="t in eventTypeOrder" :key="t" :value="t">{{ tLabel(t) }}</option>
          </select>
        </div>
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-400">
        <span v-for="t in eventTypeOrder" :key="'leg-' + t" class="inline-flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full shrink-0" :class="EVENT_META[t].dot" />
          {{ tLabel(t) }}
        </span>
      </div>

      <!-- Grid -->
      <div v-if="loading" class="flex justify-center py-16">
        <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
      <div v-else class="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div class="grid grid-cols-7 border-b border-gray-800">
          <div
            v-for="w in weekdayLabels"
            :key="w"
            class="py-2 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide"
          >
            {{ w }}
          </div>
        </div>
        <div class="grid grid-cols-7 auto-rows-fr">
          <button
            v-for="(day, idx) in monthRange.days"
            :key="idx"
            type="button"
            class="min-h-[88px] sm:min-h-[100px] border-b border-r border-gray-800 p-1.5 text-left align-top transition-colors hover:bg-gray-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
            :class="{
              'bg-gray-950/50': !isSameMonth(day, viewMonth),
              'ring-2 ring-inset ring-white': isSelectedDay(day),
            }"
            @click="openCreateForDay(day)"
          >
            <div
              class="text-xs font-semibold mb-1"
              :class="[
                isSameMonth(day, viewMonth) ? 'text-white' : 'text-gray-600',
                isToday(day) ? 'text-gold-400' : '',
              ]"
            >
              {{ format(day, 'd') }}
            </div>
            <div class="flex flex-col gap-0.5">
              <button
                v-for="ev in eventsOnDay(day).slice(0, 2)"
                :key="ev.id"
                type="button"
                class="w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight truncate bg-gray-800/90 text-gray-200 border border-gray-700 hover:border-gold-500/50"
                @click.stop="openEdit(ev, $event)"
              >
                <span class="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" :class="EVENT_META[ev.event_type]?.dot || 'bg-gray-500'" />
                {{ ev.title }}
              </button>
              <span
                v-if="eventsOnDay(day).length > 2"
                class="text-[10px] text-gray-500 pl-0.5"
              >
                +{{ eventsOnDay(day).length - 2 }}
              </span>
            </div>
          </button>
        </div>
      </div>

      <p class="text-xs text-gray-600 text-center">
        {{ language === 'es' ? 'Toca un día para crear un evento. Toca un evento para editarlo.' : 'Tap a day to create an event. Tap an event chip to edit.' }}
      </p>
    </div>

    <Teleport to="body">
      <div
        v-if="modalOpen"
        class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
        @click.self="closeModal"
      >
        <div
          class="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto shadow-xl"
          @click.stop
        >
          <div class="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
            <h2 class="text-lg font-bold text-white">
              {{ editingId ? (language === 'es' ? 'Editar evento' : 'Edit event') : (language === 'es' ? 'Crear evento' : 'Create event') }}
            </h2>
            <button type="button" class="p-2 text-gray-400 hover:text-white rounded-lg" aria-label="Close" @click="closeModal">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="p-4 space-y-4">
            <div v-if="formError" class="text-sm text-red-400">{{ formError }}</div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Título' : 'Title' }} *</label>
              <input
                v-model="form.title"
                type="text"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-600 text-white placeholder-gray-500 text-sm"
                :placeholder="language === 'es' ? 'Nombre del evento' : 'Enter event title'"
              />
            </div>

            <div>
              <p class="text-xs font-medium text-gray-400 mb-2">{{ language === 'es' ? 'Tipo de evento' : 'Event type' }} *</p>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="t in eventTypeOrder"
                  :key="t"
                  type="button"
                  class="rounded-xl border px-2 py-2 text-left transition-all text-[11px] sm:text-xs leading-tight"
                  :class="
                    form.event_type === t
                      ? 'border-sky-500 bg-sky-500/15 text-white'
                      : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                  "
                  @click="form.event_type = t"
                >
                  <span class="block mb-0.5">{{ EVENT_META[t].emoji }}</span>
                  {{ tLabel(t) }}
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Inicio' : 'Start date' }} *</label>
                <input v-model="form.start_date" type="date" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Fin' : 'End date' }}</label>
                <input v-model="form.end_date" type="date" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" />
              </div>
            </div>

            <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input v-model="form.all_day" type="checkbox" class="rounded border-gray-600 text-sky-500 focus:ring-sky-500" />
              {{ language === 'es' ? 'Todo el día' : 'All day event' }}
            </label>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Ubicación' : 'Location' }}</label>
              <input
                v-model="form.location"
                type="text"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                :placeholder="language === 'es' ? 'Opcional' : 'Optional'"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Descripción' : 'Description' }}</label>
              <textarea
                v-model="form.description"
                rows="3"
                class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm resize-y min-h-[72px]"
                :placeholder="language === 'es' ? 'Opcional' : 'Optional'"
              />
            </div>

            <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input v-model="form.visible_to_parents" type="checkbox" class="rounded border-gray-600 text-sky-500 focus:ring-sky-500" />
              {{ language === 'es' ? 'Visible para familias / patinadores' : 'Visible to parents / skaters' }}
            </label>
          </div>

          <div class="sticky bottom-0 flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-800 bg-gray-900/95">
            <button
              v-if="editingId"
              type="button"
              class="text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
              :disabled="saving"
              @click="deleteEvent"
            >
              {{ language === 'es' ? 'Eliminar' : 'Delete' }}
            </button>
            <span v-else />
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="px-4 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800"
                :disabled="saving"
                @click="closeModal"
              >
                {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
              </button>
              <button
                type="button"
                class="px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-50"
                :disabled="saving"
                @click="submitEvent"
              >
                {{ saving ? '…' : editingId ? (language === 'es' ? 'Guardar' : 'Save') : (language === 'es' ? 'Crear' : 'Create') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
