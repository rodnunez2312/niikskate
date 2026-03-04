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
  isToday,
  isBefore,
  startOfDay
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { ClassSchedule, TimeSlot, User } from '~/types'

const router = useRouter()
const { t, formatPrice, language } = useI18n()
const { 
  fetchClasses, 
  classes, 
  fetchMonthSchedules, 
  fetchCoaches, 
  coaches,
  getAvailableCoaches,
  getDayOfWeek,
  isClassDay 
} = useClasses()

// Current view state
const currentDate = ref(new Date())
const selectedDate = ref<Date | null>(null)
const selectedTimeSlot = ref<TimeSlot | null>(null)
const schedules = ref<ClassSchedule[]>([])
const availableCoaches = ref<User[]>([])
const loading = ref(true)
const loadingCoaches = ref(false)

// Calendar computations
const currentMonth = computed(() => currentDate.value.getMonth() + 1)
const currentYear = computed(() => currentDate.value.getFullYear())
const monthLabel = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  return format(currentDate.value, 'MMMM yyyy', { locale })
})

// Generate calendar days
const calendarDays = computed(() => {
  const start = startOfMonth(currentDate.value)
  const end = endOfMonth(currentDate.value)
  const days = eachDayOfInterval({ start, end })
  
  // Add padding for first week
  const firstDayOfWeek = getDay(start)
  const paddingDays = Array(firstDayOfWeek).fill(null)
  
  return [...paddingDays, ...days]
})

// Get schedules for a specific day
const getSchedulesForDay = (date: Date) => {
  const dateStr = format(date, 'yyyy-MM-dd')
  return schedules.value.filter(s => s.date === dateStr)
}

// Check if a day has classes
const hasClasses = (date: Date) => {
  return getSchedulesForDay(date).length > 0
}

// Load data
const loadData = async () => {
  loading.value = true
  try {
    await Promise.all([
      fetchClasses(),
      fetchCoaches(),
    ])
    schedules.value = await fetchMonthSchedules(currentYear.value, currentMonth.value)
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

// Watch for month changes
watch(currentDate, async () => {
  loading.value = true
  schedules.value = await fetchMonthSchedules(currentYear.value, currentMonth.value)
  loading.value = false
  selectedDate.value = null
  selectedTimeSlot.value = null
})

// Navigation
const goToPrevMonth = () => {
  currentDate.value = subMonths(currentDate.value, 1)
}

const goToNextMonth = () => {
  currentDate.value = addMonths(currentDate.value, 1)
}

const goToToday = () => {
  currentDate.value = new Date()
}

// Select a day
const selectDay = async (date: Date) => {
  if (!isClassDay(date)) return
  if (isBefore(date, startOfDay(new Date()))) return
  
  selectedDate.value = date
  selectedTimeSlot.value = null
  availableCoaches.value = []
}

// Select a time slot
const selectTimeSlot = async (slot: TimeSlot) => {
  if (!selectedDate.value) return
  
  selectedTimeSlot.value = slot
  loadingCoaches.value = true
  
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    availableCoaches.value = await getAvailableCoaches(dateStr, slot)
  } finally {
    loadingCoaches.value = false
  }
}

// Get schedules for selected date/slot
const selectedSchedules = computed(() => {
  if (!selectedDate.value) return []
  const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
  let filtered = schedules.value.filter(s => s.date === dateStr)
  if (selectedTimeSlot.value) {
    filtered = filtered.filter(s => s.time_slot === selectedTimeSlot.value)
  }
  return filtered
})

// Week day labels
const weekDays = computed(() => {
  if (language.value === 'es') {
    return ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  }
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
})

const classDayNums = [2, 4, 6] // Tue, Thu, Sat

// Time slot display
const timeSlotLabels = computed(() => ({
  early: { display: '5:30 PM - 7:00 PM', label: language.value === 'es' ? 'Sesión 1' : 'Session 1' },
  late: { display: '7:00 PM - 8:30 PM', label: language.value === 'es' ? 'Sesión 2' : 'Session 2' },
}))

// Individual class options
const individualClassOptions = computed(() => [
  {
    id: 'individual',
    name: language.value === 'es' ? 'Clase Individual' : 'Individual Class',
    description: language.value === 'es' ? 'Entrenamiento uno a uno' : 'One-on-one coaching',
    price: 250,
    color: 'bg-purple-500',
    capacity: 1,
  },
  {
    id: 'single_beginner',
    name: language.value === 'es' ? 'Clase Grupal - Principiantes' : 'Group Class - Beginners',
    description: language.value === 'es' ? 'Clase sin paquete' : 'Single class',
    price: 130,
    color: 'bg-green-500',
    capacity: 8,
  },
  {
    id: 'single_intermediate',
    name: language.value === 'es' ? 'Clase Grupal - Intermedios' : 'Group Class - Intermediate',
    description: language.value === 'es' ? 'Clase sin paquete' : 'Single class',
    price: 150,
    color: 'bg-yellow-500',
    capacity: 6,
  },
])

// Package options
const packageOptions = computed(() => [
  {
    id: 'package_3',
    name: language.value === 'es' ? 'Paquete 3 Clases' : '3 Classes Package',
    description: language.value === 'es' ? 'Grupales - Válido 1 mes' : 'Group classes - Valid 1 month',
    price: 350,
    color: 'bg-green-500',
    badge: null,
  },
  {
    id: 'package_5',
    name: language.value === 'es' ? 'Paquete 5 Clases' : '5 Classes Package',
    description: language.value === 'es' ? 'Grupales - Válido 1 mes' : 'Group classes - Valid 1 month',
    price: 520,
    color: 'bg-yellow-500',
    badge: 'Popular',
  },
  {
    id: 'package_saturday',
    name: language.value === 'es' ? 'Solo Sábados (4 Clases)' : 'Saturdays Only (4 Classes)',
    description: language.value === 'es' ? 'Todas del mes - Válido 1 mes' : 'All month - Valid 1 month',
    price: 420,
    color: 'bg-purple-500',
    badge: null,
  },
])

// Format selected date
const formattedSelectedDate = computed(() => {
  if (!selectedDate.value) return ''
  const locale = language.value === 'es' ? es : undefined
  return format(selectedDate.value, 'EEEE, d MMMM yyyy', { locale })
})
</script>

<template>
  <div class="page-container bg-gray-50">
    <!-- Header -->
    <header class="bg-white border-b border-gray-100 sticky top-0 z-40 pt-safe">
      <div class="px-4 py-4 max-w-lg mx-auto">
        <div class="flex items-center justify-between mb-4">
          <button @click="router.back()" class="p-2 -ml-2">
            <svg class="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 class="text-xl font-bold text-gray-900">{{ t('schedule.title') }}</h1>
          <button @click="goToToday" class="text-yellow-600 text-sm font-medium">
            {{ t('schedule.today') }}
          </button>
        </div>

        <!-- Month Navigation -->
        <div class="flex items-center justify-between">
          <button @click="goToPrevMonth" class="p-2 rounded-lg hover:bg-gray-100">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 class="text-lg font-semibold text-gray-900 capitalize">{{ monthLabel }}</h2>
          <button @click="goToNextMonth" class="p-2 rounded-lg hover:bg-gray-100">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Calendar -->
    <div class="px-4 py-4 max-w-lg mx-auto">
      <!-- Week day headers -->
      <div class="grid grid-cols-7 gap-1 mb-2">
        <div 
          v-for="(day, index) in weekDays" 
          :key="day" 
          class="text-center text-xs font-medium py-2"
          :class="classDayNums.includes(index) ? 'text-yellow-600' : 'text-gray-400'"
        >
          {{ day }}
        </div>
      </div>

      <!-- Calendar days -->
      <div class="grid grid-cols-7 gap-1">
        <template v-for="(day, index) in calendarDays" :key="index">
          <!-- Empty padding -->
          <div v-if="!day" class="aspect-square"></div>
          
          <!-- Actual day -->
          <button
            v-else
            @click="selectDay(day)"
            :disabled="!isClassDay(day) || isBefore(day, startOfDay(new Date()))"
            class="aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all"
            :class="[
              selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
                ? 'bg-yellow-400 text-gray-900'
                : isToday(day)
                  ? 'bg-gray-900 text-white'
                  : isClassDay(day) && !isBefore(day, startOfDay(new Date()))
                    ? 'bg-white hover:bg-yellow-50 text-gray-900 shadow-sm'
                    : 'text-gray-300 cursor-not-allowed',
            ]"
          >
            <span class="text-sm font-medium">{{ format(day, 'd') }}</span>
            <!-- Dot indicator for days with scheduled classes -->
            <div 
              v-if="hasClasses(day)"
              class="absolute bottom-1 flex gap-0.5"
            >
              <span class="w-1 h-1 rounded-full bg-green-500"></span>
            </div>
          </button>
        </template>
      </div>

      <!-- Legend -->
      <div class="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
        <span class="flex items-center gap-1">
          <span class="w-3 h-3 rounded bg-yellow-400"></span>
          {{ language === 'es' ? 'Día de Clase' : 'Class Day' }}
        </span>
        <span class="flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
          {{ language === 'es' ? 'Con Clases' : 'Has Classes' }}
        </span>
      </div>
    </div>

    <!-- Selected Day Details -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="opacity-0 translate-y-4"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-4"
    >
      <div v-if="selectedDate" class="px-4 pb-24 max-w-lg mx-auto">
        <div class="card p-4">
          <h3 class="font-bold text-gray-900 mb-4 capitalize">
            {{ formattedSelectedDate }}
          </h3>

          <!-- Time Slot Selection -->
          <div class="mb-4">
            <p class="text-sm text-gray-500 mb-2">{{ t('schedule.selectTimeSlot') }}</p>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="(slot, key) in timeSlotLabels"
                :key="key"
                @click="selectTimeSlot(key as TimeSlot)"
                class="p-3 rounded-xl border-2 transition-all text-left"
                :class="[
                  selectedTimeSlot === key
                    ? 'border-yellow-400 bg-yellow-50'
                    : 'border-gray-200 hover:border-gray-300'
                ]"
              >
                <p class="font-semibold text-gray-900">{{ slot.display }}</p>
                <p class="text-xs text-gray-500">{{ slot.label }}</p>
              </button>
            </div>
          </div>

          <!-- Available Coaches -->
          <div v-if="selectedTimeSlot" class="mb-4">
            <p class="text-sm text-gray-500 mb-2">{{ t('schedule.availableCoaches') }}</p>
            
            <div v-if="loadingCoaches" class="flex gap-2">
              <div v-for="i in 3" :key="i" class="w-12 h-12 rounded-full bg-gray-200 animate-pulse"></div>
            </div>
            
            <div v-else-if="availableCoaches.length === 0" class="text-sm text-gray-500 p-3 bg-gray-100 rounded-xl">
              {{ t('schedule.noCoaches') }}
            </div>
            
            <div v-else class="flex gap-3 overflow-x-auto pb-2">
              <div
                v-for="coach in availableCoaches"
                :key="coach.id"
                class="flex-shrink-0 text-center"
              >
                <div class="w-14 h-14 rounded-full bg-gray-200 overflow-hidden ring-2 ring-yellow-400">
                  <img
                    v-if="coach.avatar_url"
                    :src="coach.avatar_url"
                    :alt="coach.full_name"
                    class="w-full h-full object-cover"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center text-xl">🛹</div>
                </div>
                <p class="text-xs font-medium text-gray-900 mt-1">{{ coach.full_name?.split(' ')[0] }}</p>
              </div>
            </div>
          </div>

          <!-- Individual Class Options -->
          <div v-if="selectedTimeSlot">
            <p class="text-sm text-gray-500 mb-2">
              {{ language === 'es' ? 'Clases Individuales:' : 'Individual Classes:' }}
            </p>
            
            <div class="space-y-2 mb-4">
              <NuxtLink
                v-for="classOption in individualClassOptions"
                :key="classOption.id"
                :to="`/schedule/book?date=${format(selectedDate, 'yyyy-MM-dd')}&slot=${selectedTimeSlot}&type=${classOption.id}`"
                class="block p-3 rounded-xl border border-gray-200 hover:border-yellow-400 transition-all"
              >
                <div class="flex items-center gap-3">
                  <div 
                    class="w-2 h-10 rounded-full"
                    :class="classOption.color"
                  ></div>
                  <div class="flex-1">
                    <p class="font-semibold text-gray-900">{{ classOption.name }}</p>
                    <p class="text-xs text-gray-500">
                      {{ classOption.description }} • {{ language === 'es' ? 'Máx' : 'Max' }} {{ classOption.capacity }}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="font-bold text-yellow-600">{{ formatPrice(classOption.price) }}</p>
                  </div>
                </div>
              </NuxtLink>
            </div>

            <!-- Package Options -->
            <p class="text-sm text-gray-500 mb-2">
              {{ language === 'es' ? 'Paquetes (válido 1 mes):' : 'Packages (valid 1 month):' }}
            </p>
            
            <div class="space-y-2">
              <NuxtLink
                v-for="pkg in packageOptions"
                :key="pkg.id"
                :to="`/schedule/book?date=${format(selectedDate, 'yyyy-MM-dd')}&slot=${selectedTimeSlot}&type=${pkg.id}`"
                class="block p-3 rounded-xl border-2 border-dashed border-gray-200 hover:border-yellow-400 transition-all bg-gray-50"
              >
                <div class="flex items-center gap-3">
                  <div 
                    class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                    :class="pkg.color"
                  >
                    📦
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <p class="font-semibold text-gray-900">{{ pkg.name }}</p>
                      <span v-if="pkg.badge" class="badge bg-yellow-400 text-gray-900 text-xs">
                        {{ pkg.badge }}
                      </span>
                    </div>
                    <p class="text-xs text-gray-500">{{ pkg.description }}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-bold text-green-600">{{ formatPrice(pkg.price) }}</p>
                  </div>
                </div>
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Empty State for non-selected -->
    <div v-if="!selectedDate" class="px-4 pb-8 max-w-lg mx-auto">
      <div class="card p-6 text-center">
        <span class="text-4xl mb-3 block">📅</span>
        <p class="text-gray-500">
          {{ t('schedule.selectDay') }}
        </p>
        <p class="text-xs text-gray-400 mt-2">
          {{ t('schedule.classDays') }}
        </p>
      </div>
    </div>
  </div>
</template>
