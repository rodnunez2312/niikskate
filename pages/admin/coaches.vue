<script setup lang="ts">
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

// Check if user is admin
const isAdmin = ref(false)
const checkingRole = ref(true)
const loading = ref(false)

// Availability is stored by date string YYYY-MM-DD (only class days matter)
const coaches = ref([
  {
    id: 'coach-rod',
    name: 'Rod',
    email: 'rod@niikskate.com',
    specialty: 'Vert & Street',
    color: 'flame-600',
    gradient: 'from-flame-600 to-glass-orange',
    emoji: '🧑‍🏫',
    isActive: true,
    availability: {} as Record<string, boolean>,
  },
  {
    id: 'coach-leo',
    name: 'Leo',
    email: 'leo@niikskate.com',
    specialty: 'Vert & Street',
    color: 'glass-blue',
    gradient: 'from-glass-blue to-glass-purple',
    emoji: '👨‍🏫',
    isActive: true,
    availability: {} as Record<string, boolean>,
  },
  {
    id: 'coach-itza',
    name: 'Itza',
    email: 'itza@niikskate.com',
    specialty: 'Fundamentos',
    color: 'glass-green',
    gradient: 'from-glass-green to-glass-blue',
    emoji: '👩‍🏫',
    isActive: true,
    availability: {} as Record<string, boolean>,
  },
])

// Selected coach for editing
const selectedCoach = ref<typeof coaches.value[0] | null>(null)
const showEditModal = ref(false)

// Calendar state (main page)
const currentDate = ref(new Date())
const monthLabel = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  return format(currentDate.value, 'MMMM yyyy', { locale })
})

// --- 45-day availability calendar (modal) ---
const AVAILABILITY_DAYS = 45
const calendarStartDate = ref(new Date())

// Next 45 days from today (fixed window, no more)
const next45Days = computed(() => {
  const start = new Date(calendarStartDate.value)
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: AVAILABILITY_DAYS }, (_, i) => addDays(start, i))
})

// Grid for modal: 7 columns, rows of 7 (pad first row to align week)
const calendarGrid = computed(() => {
  const days = next45Days.value
  const first = days[0]
  const pad = getDay(first) // 0 = Sun, 2 = Tue, etc.
  const padding = Array(pad).fill(null)
  const grid = [...padding, ...days]
  return grid
})

const calendarRangeLabel = computed(() => {
  const start = next45Days.value[0]
  const end = next45Days.value[AVAILABILITY_DAYS - 1]
  const locale = language.value === 'es' ? es : undefined
  return `${format(start, 'd MMM', { locale })} – ${format(end, 'd MMM yyyy', { locale })}`
})

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/admin/coaches')
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
})

// Reset 45-day window when opening modal (always from today)
const openEditModal = () => {
  calendarStartDate.value = new Date()
}

// Calendar navigation (main page)
const goToPrevMonth = () => {
  currentDate.value = subMonths(currentDate.value, 1)
}

const goToNextMonth = () => {
  currentDate.value = addMonths(currentDate.value, 1)
}

// Get calendar days for the month (main page)
const calendarDays = computed(() => {
  const start = startOfMonth(currentDate.value)
  const end = endOfMonth(currentDate.value)
  const days = eachDayOfInterval({ start, end })
  const startDayOfWeek = getDay(start)
  const padding = Array(startDayOfWeek).fill(null)
  return [...padding, ...days]
})

// Class days: Tue (2), Thu (4), Sat (6)
const isClassDay = (date: Date): boolean => {
  const dayNum = getDay(date)
  return dayNum === 2 || dayNum === 4 || dayNum === 6
}

const getCoachesForDate = (date: Date) => {
  if (!isClassDay(date)) return []
  return coaches.value.filter(c => c.isActive)
}

const weekDays = computed(() => {
  return language.value === 'es' 
    ? ['D', 'L', 'M', 'M', 'J', 'V', 'S']
    : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
})

const toDateKey = (date: Date) => format(date, 'yyyy-MM-dd')

// Open coach availability editor (45-day calendar)
const editCoachAvailability = (coach: typeof coaches.value[0]) => {
  selectedCoach.value = coach
  openEditModal()
  showEditModal.value = true
}

const toggleCoachStatus = (coach: typeof coaches.value[0]) => {
  coach.isActive = !coach.isActive
}

// Toggle one date for selected coach (only class days)
const toggleDateAvailability = (date: Date) => {
  if (!selectedCoach.value || !isClassDay(date)) return
  const key = toDateKey(date)
  selectedCoach.value.availability[key] = !selectedCoach.value.availability[key]
}

const getDateAvailability = (date: Date): boolean => {
  if (!selectedCoach.value) return false
  const key = toDateKey(date)
  return selectedCoach.value.availability[key] ?? true
}

// Save coach availability
const saveCoachAvailability = () => {
  showEditModal.value = false
  selectedCoach.value = null
}
</script>

<template>
  <div class="min-h-screen bg-black">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center gap-3">
          <button @click="router.push('/admin')" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl font-bold text-white">
              {{ language === 'es' ? 'Gestionar Coaches' : 'Manage Coaches' }}
            </h1>
            <p class="text-sm text-gray-400">{{ language === 'es' ? 'Disponibilidad y horarios' : 'Availability and schedules' }}</p>
          </div>
        </div>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="checkingRole" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-gray-400">{{ language === 'es' ? 'Cargando...' : 'Loading...' }}</p>
      </div>
    </div>

    <!-- Content -->
    <div v-else-if="isAdmin" class="px-4 py-6 max-w-2xl mx-auto space-y-6">
      <!-- Coaches List -->
      <section>
        <h2 class="text-lg font-bold text-white mb-3">
          {{ language === 'es' ? 'Coaches' : 'Coaches' }}
        </h2>
        
        <div class="space-y-3">
          <div 
            v-for="coach in coaches" 
            :key="coach.id"
            class="bg-gray-900 border border-gray-800 rounded-2xl p-4"
          >
            <div class="flex items-center gap-4">
              <!-- Avatar -->
              <div 
                class="w-16 h-16 rounded-full flex items-center justify-center ring-2"
                :class="[`bg-gradient-to-br ${coach.gradient}`, `ring-${coach.color}/50`]"
              >
                <span class="text-3xl">{{ coach.emoji }}</span>
              </div>

              <!-- Info -->
              <div class="flex-1">
                <div class="flex items-center gap-2">
                  <h3 class="font-bold text-white text-lg">{{ coach.name }}</h3>
                  <span 
                    class="px-2 py-0.5 rounded-full text-xs font-medium"
                    :class="coach.isActive ? 'bg-glass-green/20 text-glass-green' : 'bg-gray-700 text-gray-400'"
                  >
                    {{ coach.isActive ? (language === 'es' ? 'Activo' : 'Active') : (language === 'es' ? 'Inactivo' : 'Inactive') }}
                  </span>
                </div>
                <p class="text-sm text-gray-400">{{ coach.specialty }}</p>
                <p class="text-xs text-gray-500">{{ coach.email }}</p>
              </div>

              <!-- Actions -->
              <div class="flex flex-col gap-2">
                <button 
                  @click="editCoachAvailability(coach)"
                  class="px-3 py-1.5 bg-glass-blue/20 text-glass-blue rounded-lg text-sm font-medium"
                >
                  {{ language === 'es' ? 'Horarios' : 'Schedule' }}
                </button>
                <button 
                  @click="toggleCoachStatus(coach)"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium"
                  :class="coach.isActive ? 'bg-flame-600/20 text-flame-600' : 'bg-glass-green/20 text-glass-green'"
                >
                  {{ coach.isActive ? (language === 'es' ? 'Desactivar' : 'Deactivate') : (language === 'es' ? 'Activar' : 'Activate') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Calendar Overview -->
      <section>
        <h2 class="text-lg font-bold text-white mb-3">
          {{ language === 'es' ? 'Calendario de Disponibilidad' : 'Availability Calendar' }}
        </h2>

        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <!-- Month navigation -->
          <div class="flex items-center justify-between mb-4">
            <button @click="goToPrevMonth" class="p-2 rounded-lg hover:bg-gray-800 text-white">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h3 class="text-lg font-semibold text-white capitalize">{{ monthLabel }}</h3>
            <button @click="goToNextMonth" class="p-2 rounded-lg hover:bg-gray-800 text-white">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <!-- Week headers -->
          <div class="grid grid-cols-7 gap-1 mb-2">
            <div 
              v-for="(day, index) in weekDays" 
              :key="day" 
              class="text-center text-xs font-medium py-2"
              :class="[2, 4, 6].includes(index) ? 'text-gold-400' : 'text-gray-500'"
            >
              {{ day }}
            </div>
          </div>

          <!-- Calendar days -->
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
                <!-- Coach dots -->
                <div v-if="isClassDay(day)" class="flex gap-0.5 mt-0.5">
                  <template v-for="coach in getCoachesForDate(day)" :key="coach.id">
                    <span 
                      class="w-1.5 h-1.5 rounded-full"
                      :class="`bg-${coach.color}`"
                    ></span>
                  </template>
                </div>
              </div>
            </template>
          </div>

          <!-- Legend -->
          <div class="mt-4 pt-4 border-t border-gray-800 flex flex-wrap gap-3">
            <div v-for="coach in coaches" :key="coach.id" class="flex items-center gap-1.5">
              <span class="w-2.5 h-2.5 rounded-full" :class="`bg-${coach.color}`"></span>
              <span class="text-xs text-gray-400">{{ coach.name }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- Edit Availability Modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="showEditModal" class="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center">
          <div class="bg-gray-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-auto">
            <!-- Modal Header -->
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
                  <h3 class="font-bold text-white">{{ selectedCoach?.name }}</h3>
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Editar disponibilidad' : 'Edit availability' }}</p>
                </div>
              </div>
              <button @click="showEditModal = false" class="p-2 text-gray-400 hover:text-white">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Modal Content: 45-day calendar -->
            <div class="p-6 space-y-4">
              <p class="text-sm text-gray-400">
                {{ language === 'es' 
                  ? 'Marca los días en que el coach estará disponible para dar clase (solo Mar, Jue, Sáb). Vista de 45 días.'
                  : 'Confirm the dates the coach is available to teach (Tue, Thu, Sat only). 45-day view.'
                }}
              </p>
              <p class="text-xs text-gray-500 font-medium">{{ calendarRangeLabel }}</p>

              <!-- Week headers -->
              <div class="grid grid-cols-7 gap-1 mb-1">
                <div 
                  v-for="(day, index) in weekDays" 
                  :key="day" 
                  class="text-center text-xs font-medium py-1"
                  :class="[2, 4, 6].includes(index) ? 'text-gold-400' : 'text-gray-500'"
                >
                  {{ day }}
                </div>
              </div>

              <!-- 45-day grid -->
              <div class="grid grid-cols-7 gap-1">
                <template v-for="(day, index) in calendarGrid" :key="index">
                  <div v-if="!day" class="aspect-square"></div>
                  <button
                    v-else
                    type="button"
                    class="aspect-square rounded-lg flex flex-col items-center justify-center text-sm transition-all min-h-[44px]"
                    :class="isClassDay(day)
                      ? getDateAvailability(day)
                        ? 'bg-glass-green text-white hover:opacity-90'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      : 'bg-gray-800/50 text-gray-600 cursor-default'"
                    :disabled="!isClassDay(day)"
                    @click="toggleDateAvailability(day)"
                  >
                    <span class="font-medium">{{ format(day, 'd') }}</span>
                    <span v-if="isClassDay(day)" class="text-[10px] mt-0.5 opacity-80">
                      {{ getDateAvailability(day) ? (language === 'es' ? 'Sí' : 'Yes') : (language === 'es' ? 'No' : 'No') }}
                    </span>
                  </button>
                </template>
              </div>

              <p class="text-xs text-gray-500 pt-2">
                {{ language === 'es' ? 'Solo días de clase (Mar, Jue, Sáb) se pueden marcar.' : 'Only class days (Tue, Thu, Sat) can be toggled.' }}
              </p>
            </div>

            <!-- Modal Footer -->
            <div class="sticky bottom-0 bg-gray-900 px-6 py-4 border-t border-gray-800">
              <button
                @click="saveCoachAvailability"
                class="w-full py-3 rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold"
              >
                {{ language === 'es' ? 'Guardar Cambios' : 'Save Changes' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
