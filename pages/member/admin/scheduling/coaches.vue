<script setup lang="ts">
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  startOfDay,
  isBefore,
  isAfter,
  isSameDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { UserRole } from '~/types'
import { daySlotsFullyUnavailable, isClassDay, slotsForDate, slotsForDateStr } from '~/utils/classSchedule'

/** Sun-start week column indices for class days (Mon, Tue, Thu, Sat). */
const CLASS_WEEKDAY_HEADER_INDICES = [1, 2, 4, 6]

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

type CoachUi = {
  id: string
  full_name: string
  email: string
  role: UserRole
  is_active: boolean
  availability: Record<string, boolean>
  dotClass: string
  ringClass: string
  gradient: string
  emoji: string
}

const DOT_STYLES = [
  { dot: 'bg-flame-600', ring: 'ring-flame-600/50', gradient: 'from-flame-600 to-glass-orange', emoji: '🧑‍🏫' },
  { dot: 'bg-glass-blue', ring: 'ring-glass-blue/50', gradient: 'from-glass-blue to-glass-purple', emoji: '👨‍🏫' },
  { dot: 'bg-glass-green', ring: 'ring-glass-green/50', gradient: 'from-glass-green to-glass-blue', emoji: '👩‍🏫' },
  { dot: 'bg-glass-orange', ring: 'ring-glass-orange/50', gradient: 'from-glass-orange to-flame-600', emoji: '🛹' },
]

const isAdmin = ref(false)
const checkingRole = ref(true)
const loadingCoaches = ref(false)
const savingAvailability = ref(false)
const coaches = ref<CoachUi[]>([])

const showAddCoachModal = ref(false)
const addCoachSaving = ref(false)
const addCoachError = ref('')
const newCoachForm = ref({
  email: '',
  password: '',
  full_name: '',
  phone: '',
})

const adminAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error(language.value === 'es' ? 'Sesión expirada' : 'Session expired')
  return { Authorization: `Bearer ${token}` }
}

const openAddCoachModal = () => {
  newCoachForm.value = { email: '', password: '', full_name: '', phone: '' }
  addCoachError.value = ''
  showAddCoachModal.value = true
}

const closeAddCoachModal = () => {
  showAddCoachModal.value = false
  addCoachError.value = ''
}

const submitAddCoach = async () => {
  addCoachError.value = ''
  if (!newCoachForm.value.email?.trim()) {
    addCoachError.value = language.value === 'es' ? 'El email es obligatorio' : 'Email is required'
    return
  }
  if (!newCoachForm.value.password || newCoachForm.value.password.length < 6) {
    addCoachError.value =
      language.value === 'es' ? 'La contraseña debe tener al menos 6 caracteres' : 'Password must be at least 6 characters'
    return
  }

  addCoachSaving.value = true
  try {
    await $fetch('/api/admin/create-user', {
      method: 'POST',
      headers: await adminAuthHeaders(),
      body: {
        email: newCoachForm.value.email.trim(),
        password: newCoachForm.value.password,
        full_name: newCoachForm.value.full_name.trim() || undefined,
        phone: newCoachForm.value.phone.trim() || undefined,
        role: 'coach',
      },
    })
    closeAddCoachModal()
    await loadCoachesFromDb()
  } catch (e: any) {
    addCoachError.value = e?.data?.message || e?.message || 'Error creating coach'
  } finally {
    addCoachSaving.value = false
  }
}

/** `${coachId}|${yyyy-mm-dd}` → slot → is_available */
const monthOverrideByCoachDate = ref<Map<string, Record<string, boolean>>>(new Map())

const selectedCoach = ref<CoachUi | null>(null)
const showEditModal = ref(false)
/** Snapshot when modal opened (per date key) for diff on save */
const modalInitialSnapshot = ref<Record<string, boolean>>({})

const currentDate = ref(new Date())
const monthLabel = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  return format(currentDate.value, 'MMMM yyyy', { locale })
})

/** Set when opening the availability modal: “today” for editable range (today → end of next month). */
const availabilityModalToday = ref<Date | null>(null)

const modalFirstMonthStart = computed(() =>
  availabilityModalToday.value ? startOfMonth(availabilityModalToday.value) : startOfMonth(new Date()),
)
const modalSecondMonthStart = computed(() => addMonths(modalFirstMonthStart.value, 1))

const modalEditableEnd = computed(() =>
  availabilityModalToday.value
    ? endOfMonth(addMonths(startOfDay(availabilityModalToday.value), 1))
    : endOfMonth(addMonths(startOfDay(new Date()), 1)),
)

/** Class days from today through end of next month (can toggle). */
const editableModalClassDays = computed(() => {
  if (!availabilityModalToday.value) return [] as Date[]
  const t0 = startOfDay(availabilityModalToday.value)
  const last = modalEditableEnd.value
  const days = eachDayOfInterval({ start: t0, end: last })
  return days.filter(d => isClassDay(d))
})

function buildMonthCells(monthStart: Date): (Date | null)[] {
  const start = startOfMonth(monthStart)
  const end = endOfMonth(monthStart)
  const days = eachDayOfInterval({ start, end })
  const pad = getDay(start)
  const padding = Array(pad).fill(null) as null[]
  return [...padding, ...days]
}

const modalMonthOneCells = computed(() => buildMonthCells(modalFirstMonthStart.value))
const modalMonthTwoCells = computed(() => buildMonthCells(modalSecondMonthStart.value))

function modalMonthTitle(d: Date): string {
  const locale = language.value === 'es' ? es : undefined
  return format(d, 'MMMM yyyy', { locale })
}

const modalEditableRangeLabel = computed(() => {
  if (!availabilityModalToday.value) return ''
  const locale = language.value === 'es' ? es : undefined
  const a = availabilityModalToday.value
  const b = modalEditableEnd.value
  return `${format(a, 'd MMM', { locale })} – ${format(b, 'd MMM yyyy', { locale })}`
})

function isModalToday(day: Date): boolean {
  if (!availabilityModalToday.value) return false
  return isSameDay(startOfDay(day), availabilityModalToday.value)
}

/** Past days in the visible months are read-only; today through end of next month on class days = editable. */
function isModalDateEditable(date: Date): boolean {
  if (!availabilityModalToday.value || !isClassDay(date)) return false
  const t0 = startOfDay(availabilityModalToday.value)
  const d0 = startOfDay(date)
  const last = modalEditableEnd.value
  if (isBefore(d0, t0)) return false
  if (isAfter(d0, last)) return false
  return true
}

const loadCoachesFromDb = async () => {
  loadingCoaches.value = true
  try {
    const data = await fetchCoachDirectoryProfiles<{
      id: string
      full_name: string
      email: string
      is_active: boolean
      role: string
    }>(client, {
      select: 'id, full_name, email, is_active, role',
      activeOnly: false,
    })

    coaches.value = data.map((p, i) => {
      const s = DOT_STYLES[i % DOT_STYLES.length]
      return {
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        role: p.role as UserRole,
        is_active: p.is_active,
        availability: {} as Record<string, boolean>,
        dotClass: s.dot,
        ringClass: s.ring,
        gradient: s.gradient,
        emoji: s.emoji,
      }
    })
    await loadMonthOverrides()
  } catch (e) {
    console.error('loadCoachesFromDb:', e)
  } finally {
    loadingCoaches.value = false
  }
}

function coachDateKey(coachId: string, dateStr: string) {
  return `${coachId}|${dateStr}`
}

/** Per-day unavailability: all slots for that weekday are false */
function isCoachShowingOnDate(coach: CoachUi, date: Date): boolean {
  if (!coach.is_active) return false
  if (!isClassDay(date)) return false
  const d = format(date, 'yyyy-MM-dd')
  const o = monthOverrideByCoachDate.value.get(coachDateKey(coach.id, d))
  return !daySlotsFullyUnavailable(o, slotsForDate(date))
}

const loadMonthOverrides = async () => {
  const start = startOfMonth(currentDate.value)
  const end = endOfMonth(currentDate.value)
  const ids = coaches.value.map(c => c.id)
  if (ids.length === 0) {
    monthOverrideByCoachDate.value = new Map()
    return
  }

  const { data, error } = await client
    .from('coach_date_availability')
    .select('coach_id, date, time_slot, is_available')
    .in('coach_id', ids)
    .gte('date', format(start, 'yyyy-MM-dd'))
    .lte('date', format(end, 'yyyy-MM-dd'))

  if (error) {
    console.error('loadMonthOverrides:', error)
    return
  }

  const m = new Map<string, Record<string, boolean>>()
  for (const row of data || []) {
    const k = coachDateKey(row.coach_id as string, row.date as string)
    const cur = m.get(k) || {}
    cur[row.time_slot as string] = row.is_available as boolean
    m.set(k, cur)
  }
  monthOverrideByCoachDate.value = m
}

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/member/admin/scheduling/coaches')
    return
  }

  const { data } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.value.id)
    .single()

  if (data?.role !== 'admin') {
    router.push('/')
    return
  }

  isAdmin.value = true
  checkingRole.value = false
  await loadCoachesFromDb()
})

watch(currentDate, () => {
  loadMonthOverrides()
})

const openEditModal = () => {
  availabilityModalToday.value = startOfDay(new Date())
}

const goToPrevMonth = () => {
  currentDate.value = subMonths(currentDate.value, 1)
}

const goToNextMonth = () => {
  currentDate.value = addMonths(currentDate.value, 1)
}

const calendarDays = computed(() => {
  const start = startOfMonth(currentDate.value)
  const end = endOfMonth(currentDate.value)
  const days = eachDayOfInterval({ start, end })
  const startDayOfWeek = getDay(start)
  const padding = Array(startDayOfWeek).fill(null)
  return [...padding, ...days]
})

const getCoachesForDate = (date: Date) => {
  if (!isClassDay(date)) return []
  return coaches.value.filter(c => isCoachShowingOnDate(c, date))
}

const weekDays = computed(() => {
  return language.value === 'es'
    ? ['D', 'L', 'M', 'M', 'J', 'V', 'S']
    : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
})

const toDateKey = (date: Date) => format(date, 'yyyy-MM-dd')

const loadModalAvailabilityForCoach = async (coach: CoachUi) => {
  if (!availabilityModalToday.value) return

  const rangeStart = startOfMonth(availabilityModalToday.value)
  const rangeEnd = endOfMonth(addMonths(availabilityModalToday.value, 1))

  const { data, error } = await client
    .from('coach_date_availability')
    .select('date, time_slot, is_available')
    .eq('coach_id', coach.id)
    .gte('date', format(rangeStart, 'yyyy-MM-dd'))
    .lte('date', format(rangeEnd, 'yyyy-MM-dd'))

  if (error) {
    console.error('loadModalAvailabilityForCoach:', error)
    return
  }

  const byDate = new Map<string, Record<string, boolean>>()
  for (const row of data || []) {
    const cur = byDate.get(row.date as string) || {}
    cur[row.time_slot as string] = row.is_available as boolean
    byDate.set(row.date as string, cur)
  }

  const avail: Record<string, boolean> = {}
  const allDays = eachDayOfInterval({ start: rangeStart, end: rangeEnd })
  for (const day of allDays) {
    if (!isClassDay(day)) continue
    const key = toDateKey(day)
    const o = byDate.get(key)
    avail[key] = !daySlotsFullyUnavailable(o, slotsForDate(day))
  }
  coach.availability = avail
  modalInitialSnapshot.value = { ...avail }
}

const closeEditModal = () => {
  showEditModal.value = false
  selectedCoach.value = null
  availabilityModalToday.value = null
}

const editCoachAvailability = async (coach: CoachUi) => {
  selectedCoach.value = coach
  openEditModal()
  showEditModal.value = true
  await loadModalAvailabilityForCoach(coach)
}

const toggleCoachStatus = async (coach: CoachUi) => {
  const next = !coach.is_active
  const { error } = await client.from('profiles').update({ is_active: next }).eq('id', coach.id)
  if (error) {
    console.error(error)
    alert(language.value === 'es' ? 'No se pudo actualizar el estado.' : 'Could not update coach status.')
    return
  }
  coach.is_active = next
  await loadMonthOverrides()
}

const toggleDateAvailability = (date: Date) => {
  if (!selectedCoach.value || !isModalDateEditable(date)) return
  const key = toDateKey(date)
  selectedCoach.value.availability[key] = !getDateAvailability(date)
}

const getDateAvailability = (date: Date): boolean => {
  if (!selectedCoach.value) return false
  const key = toDateKey(date)
  return selectedCoach.value.availability[key] ?? true
}

const saveCoachAvailability = async () => {
  if (!selectedCoach.value) return
  const coach = selectedCoach.value
  const initial = modalInitialSnapshot.value

  const datesUnavailable: string[] = []
  const datesAvailable: string[] = []

  for (const day of editableModalClassDays.value) {
    const key = toDateKey(day)
    const now = coach.availability[key] ?? true
    const before = initial[key] ?? true
    if (now === before) continue
    if (now) datesAvailable.push(key)
    else datesUnavailable.push(key)
  }

  savingAvailability.value = true
  try {
    if (datesUnavailable.length > 0) {
      const rows = datesUnavailable.flatMap(d =>
        slotsForDateStr(d).map(time_slot => ({
          coach_id: coach.id,
          date: d,
          time_slot,
          is_available: false,
        })),
      )
      const { error } = await client
        .from('coach_date_availability')
        .upsert(rows, { onConflict: 'coach_id,date,time_slot' })
      if (error) throw error
    }

    if (datesAvailable.length > 0) {
      for (const d of datesAvailable) {
        const { error } = await client
          .from('coach_date_availability')
          .delete()
          .eq('coach_id', coach.id)
          .eq('date', d)
          .in('time_slot', slotsForDateStr(d))
        if (error) throw error
      }
    }

    const m = new Map(monthOverrideByCoachDate.value)
    for (const d of datesUnavailable) {
      const slots = slotsForDateStr(d)
      const o: Record<string, boolean> = {}
      for (const s of slots) o[s] = false
      m.set(coachDateKey(coach.id, d), o)
    }
    for (const d of datesAvailable) {
      m.delete(coachDateKey(coach.id, d))
    }
    monthOverrideByCoachDate.value = m

    await loadMonthOverrides()
    closeEditModal()
  } catch (e) {
    console.error(e)
    alert(
      language.value === 'es'
        ? 'No se pudieron guardar los cambios. Revisa la consola.'
        : 'Could not save changes. Check the console.',
    )
  } finally {
    savingAvailability.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-black">
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <button type="button" class="p-2 -ml-2 text-white flex-shrink-0" @click="router.push('/member/staff/dashboard')">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div class="min-w-0">
              <h1 class="text-xl font-bold text-white">
                {{ language === 'es' ? 'Gestionar Coaches' : 'Manage Coaches' }}
              </h1>
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Disponibilidad y horarios' : 'Availability and schedules' }}</p>
            </div>
          </div>
          <button
            type="button"
            class="flex-shrink-0 px-4 py-2 rounded-xl bg-gold-400 text-black font-semibold text-sm flex items-center gap-2"
            @click="openAddCoachModal"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            {{ language === 'es' ? 'Añadir cuenta' : 'Add account' }}
          </button>
        </div>
      </div>
    </header>

    <div v-if="checkingRole" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-gray-400">{{ language === 'es' ? 'Cargando...' : 'Loading...' }}</p>
      </div>
    </div>

    <div v-else-if="isAdmin" class="px-4 py-6 max-w-2xl mx-auto space-y-6">
      <section>
        <h2 class="text-lg font-bold text-white mb-3">
          {{ language === 'es' ? 'Coaches' : 'Coaches' }}
        </h2>

        <p v-if="!loadingCoaches && coaches.length === 0" class="text-sm text-gray-400">
          {{
            language === 'es'
              ? 'No hay coaches en la base de datos.'
              : 'No coaches in the database.'
          }}
        </p>

        <div class="space-y-3">
          <div
            v-for="coach in coaches"
            :key="coach.id"
            class="bg-gray-900 border border-gray-800 rounded-2xl p-4"
          >
            <div class="flex items-center gap-4">
              <div
                class="w-16 h-16 rounded-full flex items-center justify-center ring-2"
                :class="[`bg-gradient-to-br ${coach.gradient}`, coach.ringClass]"
              >
                <span class="text-3xl">{{ coach.emoji }}</span>
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h3 class="font-bold text-white text-lg truncate">{{ coach.full_name }}</h3>
                  <span
                    v-if="coach.role === 'admin'"
                    class="px-2 py-0.5 rounded-full text-xs font-medium shrink-0 bg-gold-400/15 text-gold-400"
                  >
                    Admin
                  </span>
                  <span
                    class="px-2 py-0.5 rounded-full text-xs font-medium shrink-0"
                    :class="coach.is_active ? 'bg-glass-green/20 text-glass-green' : 'bg-gray-700 text-gray-400'"
                  >
                    {{ coach.is_active ? (language === 'es' ? 'Activo' : 'Active') : (language === 'es' ? 'Inactivo' : 'Inactive') }}
                  </span>
                </div>
                <p class="text-xs text-gray-500 truncate">{{ coach.email }}</p>
              </div>

              <div class="flex flex-col gap-2 shrink-0">
                <button
                  type="button"
                  class="px-3 py-1.5 bg-glass-blue/20 text-glass-blue rounded-lg text-sm font-medium"
                  @click="editCoachAvailability(coach)"
                >
                  {{ language === 'es' ? 'Horarios' : 'Schedule' }}
                </button>
                <button
                  v-if="coach.role === 'coach'"
                  type="button"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium"
                  :class="coach.is_active ? 'bg-flame-600/20 text-flame-600' : 'bg-glass-green/20 text-glass-green'"
                  @click="toggleCoachStatus(coach)"
                >
                  {{ coach.is_active ? (language === 'es' ? 'Desactivar' : 'Deactivate') : (language === 'es' ? 'Activar' : 'Activate') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 class="text-lg font-bold text-white mb-3">
          {{ language === 'es' ? 'Calendario de Disponibilidad' : 'Availability Calendar' }}
        </h2>

        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <div class="flex items-center justify-between mb-4">
            <button type="button" class="p-2 rounded-lg hover:bg-gray-800 text-white" @click="goToPrevMonth">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 class="text-lg font-semibold text-white capitalize">{{ monthLabel }}</h3>
            <button type="button" class="p-2 rounded-lg hover:bg-gray-800 text-white" @click="goToNextMonth">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div class="grid grid-cols-7 gap-1 mb-2">
            <div
              v-for="(day, index) in weekDays"
              :key="day"
              class="text-center text-xs font-medium py-2"
              :class="CLASS_WEEKDAY_HEADER_INDICES.includes(index) ? 'text-gold-400' : 'text-gray-500'"
            >
              {{ day }}
            </div>
          </div>

          <div class="grid grid-cols-7 gap-1">
            <template v-for="(day, index) in calendarDays" :key="index">
              <div v-if="!day" class="aspect-square"></div>
              <div
                v-else
                class="aspect-square rounded-lg flex flex-col items-center justify-center relative"
                :class="isClassDay(day) ? 'bg-gray-800' : 'bg-transparent'"
              >
                <span class="text-sm font-medium" :class="isClassDay(day) ? 'text-white' : 'text-gray-600'">
                  {{ format(day, 'd') }}
                </span>
                <div v-if="isClassDay(day)" class="flex gap-0.5 mt-0.5">
                  <span
                    v-for="c in getCoachesForDate(day)"
                    :key="c.id"
                    class="w-1.5 h-1.5 rounded-full"
                    :class="c.dotClass"
                  ></span>
                </div>
              </div>
            </template>
          </div>

          <div class="mt-4 pt-4 border-t border-gray-800 flex flex-wrap gap-3">
            <div v-for="coach in coaches" :key="coach.id" class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full" :class="coach.dotClass"></span>
              <span class="text-xs text-gray-400">{{ coach.full_name }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="showEditModal" class="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-2">
          <div class="bg-gray-900 w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-auto">
            <div class="sticky top-0 bg-gray-900 px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div
                  v-if="selectedCoach"
                  class="w-10 h-10 rounded-full flex items-center justify-center"
                  :class="`bg-gradient-to-br ${selectedCoach.gradient}`"
                >
                  <span class="text-xl">{{ selectedCoach.emoji }}</span>
                </div>
                <div>
                  <h3 class="font-bold text-white">{{ selectedCoach?.full_name }}</h3>
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Editar disponibilidad' : 'Edit availability' }}</p>
                </div>
              </div>
              <button type="button" class="p-2 text-gray-400 hover:text-white" @click="closeEditModal">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div class="p-6 space-y-4">
              <p class="text-sm text-gray-400">
                {{
                  language === 'es'
                    ? 'Vista mensual: este mes y el siguiente. Solo puedes cambiar desde hoy hasta el final del próximo mes (Lun, Mar, Jue, Sáb). Los días anteriores a hoy son solo lectura.'
                    : 'Two-month view: this month and next. You can only edit from today through the end of next month (Mon, Tue, Thu, Sat). Days before today are read-only.'
                }}
              </p>
              <p class="text-xs text-gold-400/90 font-medium">
                {{
                  language === 'es' ? 'Editable: ' : 'Editable: '
                }}{{ modalEditableRangeLabel }}
              </p>

              <div class="space-y-5">
                <div v-for="(monthStart, mi) in [modalFirstMonthStart, modalSecondMonthStart]" :key="mi">
                  <h4 class="text-sm font-bold text-white capitalize mb-2">
                    {{ modalMonthTitle(monthStart) }}
                  </h4>
                  <div class="grid grid-cols-7 gap-1 mb-1">
                    <div
                      v-for="(wd, index) in weekDays"
                      :key="wd + '-' + mi"
                      class="text-center text-[10px] font-medium py-1"
                      :class="CLASS_WEEKDAY_HEADER_INDICES.includes(index) ? 'text-gold-400' : 'text-gray-500'"
                    >
                      {{ wd }}
                    </div>
                  </div>
                  <div class="grid grid-cols-7 gap-1">
                    <template
                      v-for="(day, index) in mi === 0 ? modalMonthOneCells : modalMonthTwoCells"
                      :key="'m' + mi + '-' + index"
                    >
                      <div v-if="!day" class="aspect-square min-h-[40px]" />
                      <button
                        v-else-if="isClassDay(day) && isModalDateEditable(day)"
                        type="button"
                        class="aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all min-h-[40px] font-medium"
                        :class="[
                          getDateAvailability(day)
                            ? 'bg-glass-green text-white hover:opacity-90'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600',
                          isModalToday(day) ? 'ring-2 ring-gold-400/90 ring-offset-2 ring-offset-gray-900' : '',
                        ]"
                        @click="toggleDateAvailability(day)"
                      >
                        {{ format(day, 'd') }}
                        <span class="text-[9px] mt-0.5 opacity-85">
                          {{ getDateAvailability(day) ? (language === 'es' ? 'Sí' : 'Yes') : (language === 'es' ? 'No' : 'No') }}
                        </span>
                      </button>
                      <div
                        v-else-if="isClassDay(day)"
                        class="aspect-square rounded-lg flex flex-col items-center justify-center text-xs min-h-[40px] bg-gray-800/90 text-gray-500 cursor-not-allowed border border-gray-700/80"
                        :title="language === 'es' ? 'Pasado (solo lectura)' : 'Past (read-only)'"
                      >
                        {{ format(day, 'd') }}
                        <span class="text-[9px] mt-0.5 opacity-80">
                          {{ getDateAvailability(day) ? (language === 'es' ? 'Sí' : 'Yes') : (language === 'es' ? 'No' : 'No') }}
                        </span>
                      </div>
                      <div
                        v-else
                        class="aspect-square flex flex-col items-center justify-center text-[10px] text-gray-600 min-h-[40px]"
                      >
                        {{ format(day, 'd') }}
                      </div>
                    </template>
                  </div>
                </div>
              </div>

              <p class="text-xs text-gray-500 pt-1">
                {{
                  language === 'es'
                    ? 'Lun 4:30–6:00; Mar/Jue/Sáb 5:30–7:00 y 7:00–8:30. El anillo dorado es hoy.'
                    : 'Mon 4:30–6:00 PM; Tue/Thu/Sat 5:30–7:00 and 7:00–8:30 PM. Gold ring = today.'
                }}
              </p>
            </div>

            <div class="sticky bottom-0 bg-gray-900 px-6 py-4 border-t border-gray-800">
              <button
                type="button"
                class="w-full py-3 rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold disabled:opacity-50"
                :disabled="savingAvailability"
                @click="saveCoachAvailability"
              >
                {{
                  savingAvailability
                    ? language === 'es'
                      ? 'Guardando…'
                      : 'Saving…'
                    : language === 'es'
                      ? 'Guardar Cambios'
                      : 'Save Changes'
                }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Add coach modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="showAddCoachModal" class="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div class="bg-gray-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden border border-gray-800">
            <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 class="text-lg font-bold text-white">
                {{ language === 'es' ? 'Nuevo coach' : 'New coach' }}
              </h3>
              <button type="button" class="p-2 text-gray-400 hover:text-white" @click="closeAddCoachModal">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form class="p-6 space-y-4" @submit.prevent="submitAddCoach">
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Email *</label>
                <input
                  v-model="newCoachForm.email"
                  type="email"
                  required
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                  :placeholder="language === 'es' ? 'correo@ejemplo.com' : 'email@example.com'"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">{{
                  language === 'es' ? 'Contraseña temporal *' : 'Temporary password *'
                }}</label>
                <input
                  v-model="newCoachForm.password"
                  type="password"
                  required
                  minlength="6"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                  :placeholder="language === 'es' ? 'Mín. 6 caracteres' : 'Min. 6 characters'"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">{{
                  language === 'es' ? 'Nombre completo' : 'Full name'
                }}</label>
                <input
                  v-model="newCoachForm.full_name"
                  type="text"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                  :placeholder="language === 'es' ? 'Opcional' : 'Optional'"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">{{
                  language === 'es' ? 'Teléfono' : 'Phone'
                }}</label>
                <input
                  v-model="newCoachForm.phone"
                  type="tel"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                  :placeholder="language === 'es' ? 'Opcional' : 'Optional'"
                />
              </div>
              <p class="text-xs text-gray-500">
                {{
                  language === 'es'
                    ? 'El coach queda pendiente hasta que lo actives. No se puede crear admin desde aquí.'
                    : 'Coach stays pending until you activate them. Admins cannot be created here.'
                }}
              </p>
              <div v-if="addCoachError" class="text-sm text-red-400">{{ addCoachError }}</div>
              <div class="flex gap-3 pt-2">
                <button
                  type="button"
                  class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl"
                  @click="closeAddCoachModal"
                >
                  {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
                </button>
                <button
                  type="submit"
                  class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50"
                  :disabled="addCoachSaving"
                >
                  {{ addCoachSaving ? '...' : (language === 'es' ? 'Crear coach' : 'Create coach') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
