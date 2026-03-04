<script setup lang="ts">
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isToday, isBefore, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

// State
const isAdmin = ref(false)
const loading = ref(true)
const currentMonth = ref(new Date())
const selectedDate = ref<Date | null>(null)
const selectedSession = ref<'early' | 'late' | null>(null)

// Data
const bookings = ref<any[]>([])
const attendance = ref<any[]>([])

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/admin/attendance')
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
  loading.value = false
})

// Calendar days
const calendarDays = computed(() => {
  const start = startOfMonth(currentMonth.value)
  const end = endOfMonth(currentMonth.value)
  const days = eachDayOfInterval({ start, end })
  
  // Add padding for start of month
  const startPadding = getDay(start)
  const paddedDays = []
  for (let i = 0; i < startPadding; i++) {
    paddedDays.push(null)
  }
  
  return [...paddedDays, ...days]
})

// Check if a date is a class day (Tue, Thu, Sat)
const isClassDay = (date: Date): boolean => {
  const day = getDay(date)
  return day === 2 || day === 4 || day === 6 // Tuesday, Thursday, Saturday
}

// Load bookings for selected date
const loadBookingsForDate = async () => {
  if (!selectedDate.value) return
  
  loading.value = true
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    
    // Load from guest_bookings for now (where bookings are stored)
    const { data: bookingsData, error } = await client
      .from('guest_bookings')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    
    // Filter bookings for this date
    bookings.value = (bookingsData || []).filter((b: any) => {
      const bookingData = b.booking_data
      return bookingData?.date === dateStr || bookingData?.dates?.includes(dateStr)
    })
    
    // Load existing attendance records
    const { data: attendanceData } = await client
      .from('attendance')
      .select('*')
      .eq('class_date', dateStr)
      .eq('time_slot', selectedSession.value)
    
    attendance.value = attendanceData || []
  } catch (e) {
    console.error('Error loading bookings:', e)
  } finally {
    loading.value = false
  }
}

// Select a date
const selectDate = (date: Date) => {
  if (!isClassDay(date) || isBefore(date, startOfDay(new Date()))) return
  selectedDate.value = date
  selectedSession.value = 'early'
  loadBookingsForDate()
}

// Toggle attendance
const toggleAttendance = async (booking: any, attended: boolean) => {
  if (!selectedDate.value || !selectedSession.value) return
  
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    const studentId = booking.linked_user_id || booking.id
    
    // Check if record exists
    const existing = attendance.value.find((a: any) => 
      a.student_id === studentId && a.class_date === dateStr && a.time_slot === selectedSession.value
    )
    
    if (existing) {
      // Update existing
      await client
        .from('attendance')
        .update({ attended, marked_by: user.value?.id, marked_at: new Date().toISOString() })
        .eq('id', existing.id)
    } else {
      // Insert new
      await client
        .from('attendance')
        .insert({
          student_id: studentId,
          class_date: dateStr,
          time_slot: selectedSession.value,
          attended,
          marked_by: user.value?.id,
          marked_at: new Date().toISOString(),
        })
    }
    
    await loadBookingsForDate()
  } catch (e) {
    console.error('Error toggling attendance:', e)
  }
}

// Check if student attended
const didAttend = (booking: any): boolean => {
  const studentId = booking.linked_user_id || booking.id
  const record = attendance.value.find((a: any) => a.student_id === studentId)
  return record?.attended || false
}

// Format date
const formatDateDisplay = (date: Date) => {
  const locale = language.value === 'es' ? es : undefined
  return format(date, 'EEEE, d MMMM', { locale })
}

// Navigation
const prevMonth = () => {
  currentMonth.value = subMonths(currentMonth.value, 1)
}
const nextMonth = () => {
  currentMonth.value = addMonths(currentMonth.value, 1)
}

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
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
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
              {{ language === 'es' ? 'Asistencia' : 'Attendance' }}
            </h1>
            <p class="text-sm text-gray-400">{{ language === 'es' ? 'Marcar asistencia de clases' : 'Mark class attendance' }}</p>
          </div>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div v-if="isAdmin" class="px-4 py-6 max-w-2xl mx-auto">
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
          <div
            v-for="(day, index) in calendarDays"
            :key="index"
            @click="day && selectDate(day)"
            class="aspect-square flex items-center justify-center rounded-lg text-sm transition-all"
            :class="{
              'cursor-pointer': day && isClassDay(day),
              'bg-gold-400 text-black font-bold': day && selectedDate && format(day, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd'),
              'bg-glass-green/20 text-glass-green hover:bg-glass-green/30': day && isClassDay(day) && !(selectedDate && format(day, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd')),
              'text-gray-600': day && !isClassDay(day),
              'ring-2 ring-gold-400': day && isToday(day),
            }"
          >
            <span v-if="day">{{ format(day, 'd') }}</span>
          </div>
        </div>

        <!-- Legend -->
        <div class="flex items-center justify-center gap-4 mt-4 text-xs text-gray-500">
          <div class="flex items-center gap-1">
            <div class="w-3 h-3 rounded bg-glass-green/30"></div>
            <span>{{ language === 'es' ? 'Día de clases' : 'Class day' }}</span>
          </div>
        </div>
      </div>

      <!-- Selected Date Details -->
      <div v-if="selectedDate" class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <h3 class="font-bold text-white mb-4 capitalize">{{ formatDateDisplay(selectedDate) }}</h3>

        <!-- Session Selection -->
        <div class="flex gap-2 mb-4">
          <button
            @click="selectedSession = 'early'; loadBookingsForDate()"
            class="flex-1 py-3 rounded-xl font-semibold transition-all"
            :class="selectedSession === 'early' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            5:30 PM - 7:00 PM
          </button>
          <button
            @click="selectedSession = 'late'; loadBookingsForDate()"
            class="flex-1 py-3 rounded-xl font-semibold transition-all"
            :class="selectedSession === 'late' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            7:00 PM - 8:30 PM
          </button>
        </div>

        <!-- Students List -->
        <div v-if="loading" class="text-center py-8">
          <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>

        <div v-else-if="bookings.length === 0" class="text-center py-8">
          <p class="text-4xl mb-2">📋</p>
          <p class="text-gray-400">{{ language === 'es' ? 'No hay estudiantes registrados' : 'No students registered' }}</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="booking in bookings"
            :key="booking.id"
            class="flex items-center gap-3 p-3 rounded-xl"
            :class="didAttend(booking) ? 'bg-glass-green/20' : 'bg-gray-800'"
          >
            <button
              @click="toggleAttendance(booking, !didAttend(booking))"
              class="w-10 h-10 rounded-full flex items-center justify-center transition-all"
              :class="didAttend(booking) ? 'bg-glass-green text-white' : 'bg-gray-700 text-gray-400'"
            >
              <svg v-if="didAttend(booking)" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div class="flex-1">
              <p class="font-semibold text-white">{{ booking.full_name || 'Guest' }}</p>
              <p class="text-sm text-gray-400">{{ booking.email }}</p>
            </div>
            <span 
              class="px-3 py-1 rounded-full text-xs font-bold"
              :class="didAttend(booking) ? 'bg-glass-green text-white' : 'bg-gray-700 text-gray-400'"
            >
              {{ didAttend(booking) 
                ? (language === 'es' ? 'Asistió' : 'Attended') 
                : (language === 'es' ? 'No asistió' : 'Absent') 
              }}
            </span>
          </div>
        </div>
      </div>

      <!-- No Date Selected -->
      <div v-else class="text-center py-12 text-gray-400">
        <p class="text-4xl mb-3">👆</p>
        <p>{{ language === 'es' ? 'Selecciona un día de clases en el calendario' : 'Select a class day from the calendar' }}</p>
      </div>
    </div>
  </div>
</template>
