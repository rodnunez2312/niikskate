<script setup lang="ts">
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday } from 'date-fns'
import { es } from 'date-fns/locale'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

// State
const isCoach = ref(false)
const loading = ref(true)
const currentMonth = ref(new Date())
const selectedDate = ref<Date | null>(null)
const bookings = ref<any[]>([])

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/coach/calendar')
    return
  }

  const { data } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.value.id)
    .single()

  if (data?.role !== 'coach' && data?.role !== 'admin') {
    router.push('/')
    return
  }

  isCoach.value = true
  loading.value = false
})

// Calendar days
const calendarDays = computed(() => {
  const start = startOfMonth(currentMonth.value)
  const end = endOfMonth(currentMonth.value)
  const days = eachDayOfInterval({ start, end })
  
  const startPadding = getDay(start)
  const paddedDays: (Date | null)[] = []
  for (let i = 0; i < startPadding; i++) {
    paddedDays.push(null)
  }
  
  return [...paddedDays, ...days]
})

// Check if a date is a class day
const isClassDay = (date: Date): boolean => {
  const day = getDay(date)
  return day === 2 || day === 4 || day === 6
}

// Load bookings for date
const loadBookingsForDate = async (date: Date) => {
  selectedDate.value = date
  
  try {
    const dateStr = format(date, 'yyyy-MM-dd')
    
    const { data, error } = await client
      .from('guest_bookings')
      .select('*')
      .order('created_at')

    if (error) throw error
    
    // Filter for this date
    bookings.value = (data || []).filter((b: any) => {
      const bd = b.booking_data
      return bd?.date === dateStr || bd?.dates?.includes(dateStr)
    })
  } catch (e) {
    console.error('Error loading bookings:', e)
  }
}

// Navigation
const prevMonth = () => currentMonth.value = subMonths(currentMonth.value, 1)
const nextMonth = () => currentMonth.value = addMonths(currentMonth.value, 1)

// Month label
const monthLabel = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  return format(currentMonth.value, 'MMMM yyyy', { locale })
})

// Day labels
const dayLabels = computed(() => {
  return language.value === 'es' 
    ? ['D', 'L', 'M', 'X', 'J', 'V', 'S']
    : ['S', 'M', 'T', 'W', 'T', 'F', 'S']
})

// Format selected date
const formattedSelectedDate = computed(() => {
  if (!selectedDate.value) return ''
  const locale = language.value === 'es' ? es : undefined
  return format(selectedDate.value, 'EEEE, d MMMM', { locale })
})
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center gap-3">
          <button @click="router.push('/coach')" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl font-bold text-white">
              {{ language === 'es' ? 'Calendario de Reservas' : 'Booking Calendar' }}
            </h1>
            <p class="text-sm text-gray-400">{{ language === 'es' ? 'Ver estudiantes registrados' : 'View registered students' }}</p>
          </div>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div v-if="isCoach" class="px-4 py-6 max-w-2xl mx-auto">
      <!-- Calendar -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6">
        <!-- Month Navigation -->
        <div class="flex items-center justify-between mb-4">
          <button @click="prevMonth" class="p-2 text-gray-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h3 class="font-bold text-white capitalize">{{ monthLabel }}</h3>
          <button @click="nextMonth" class="p-2 text-gray-400 hover:text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <!-- Day Labels -->
        <div class="grid grid-cols-7 gap-1 mb-2">
          <div v-for="day in dayLabels" :key="day" class="text-center text-xs text-gray-500 font-medium py-2">
            {{ day }}
          </div>
        </div>

        <!-- Calendar Grid -->
        <div class="grid grid-cols-7 gap-1">
          <button
            v-for="(day, index) in calendarDays"
            :key="index"
            @click="day && isClassDay(day) && loadBookingsForDate(day)"
            :disabled="!day || !isClassDay(day)"
            class="aspect-square flex items-center justify-center rounded-lg text-sm transition-all"
            :class="{
              'cursor-pointer hover:bg-gold-400/20': day && isClassDay(day),
              'bg-gold-400 text-black font-bold': day && selectedDate && format(day, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'),
              'bg-glass-green/20 text-glass-green': day && isClassDay(day) && !(selectedDate && format(day, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')),
              'text-gray-600': day && !isClassDay(day),
              'ring-2 ring-gold-400/50': day && isToday(day),
            }"
          >
            <span v-if="day">{{ format(day, 'd') }}</span>
          </button>
        </div>
      </div>

      <!-- Selected Date Bookings -->
      <div v-if="selectedDate" class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <h3 class="font-bold text-white mb-4 capitalize">{{ formattedSelectedDate }}</h3>

        <div v-if="bookings.length === 0" class="text-center py-8">
          <p class="text-4xl mb-2">📋</p>
          <p class="text-gray-400">{{ language === 'es' ? 'No hay reservas para este día' : 'No bookings for this day' }}</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="booking in bookings"
            :key="booking.id"
            class="bg-gray-800/50 rounded-xl p-4"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-glass-blue to-glass-purple flex items-center justify-center text-lg font-bold text-white">
                {{ booking.full_name?.charAt(0).toUpperCase() || '?' }}
              </div>
              <div class="flex-1">
                <p class="font-semibold text-white">{{ booking.full_name || 'Guest' }}</p>
                <p class="text-sm text-gray-400">{{ booking.email }}</p>
              </div>
              <span class="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-full">
                {{ booking.booking_data?.session === 'early' ? '5:30 PM' : '7:00 PM' }}
              </span>
            </div>
            <div v-if="booking.booking_data?.class_name" class="mt-2 text-sm text-gray-400">
              {{ booking.booking_data.class_name }}
            </div>
          </div>
        </div>
      </div>

      <!-- No Date Selected -->
      <div v-else class="text-center py-12 text-gray-400">
        <p class="text-4xl mb-3">👆</p>
        <p>{{ language === 'es' ? 'Selecciona un día de clases' : 'Select a class day' }}</p>
      </div>
    </div>
  </div>
</template>
