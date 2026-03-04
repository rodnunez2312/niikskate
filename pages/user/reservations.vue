<script setup lang="ts">
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  getDay, 
  addMonths, 
  subMonths,
  addDays,
  isToday,
  isBefore,
  isAfter,
  startOfDay,
  startOfWeek,
  isSaturday
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { UserCredit, ClassReservation, CreditType } from '~/types'
import { CREDIT_TYPE_INFO } from '~/types'

const router = useRouter()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { language, t, formatPrice, currency } = useI18n()
const { isClassDay } = useClasses()

// Redirect if not logged in
watch(user, (newUser) => {
  if (!newUser) {
    router.push('/auth/login')
  }
}, { immediate: true })

// State
const loading = ref(true)
const credits = ref<UserCredit[]>([])
const reservations = ref<ClassReservation[]>([])
const selectedCredit = ref<UserCredit | null>(null)
const currentDate = ref(new Date())
const selectedDates = ref<Date[]>([])
const selectedSession = ref<'early' | 'late' | null>(null)
const weeklyLimitWarning = ref(false)
const submitting = ref(false)
const successMessage = ref(false)

// Fetch user credits and reservations
onMounted(async () => {
  if (user.value) {
    await Promise.all([fetchCredits(), fetchReservations()])
  }
})

const fetchCredits = async () => {
  loading.value = true
  try {
    const { data, error } = await client
      .from('user_credits')
      .select('*')
      .eq('user_id', user.value?.id)
      .gt('remaining_credits', 0)
      .gte('expiration_date', new Date().toISOString())
      .order('expiration_date', { ascending: true })

    if (error) throw error
    credits.value = data || []
  } catch (e) {
    console.error('Error fetching credits:', e)
  } finally {
    loading.value = false
  }
}

const fetchReservations = async () => {
  try {
    console.log('Fetching reservations for user:', user.value?.id)
    console.log('Today date:', format(new Date(), 'yyyy-MM-dd'))
    
    const { data, error } = await client
      .from('class_reservations')
      .select('*')
      .eq('user_id', user.value?.id)
      .eq('status', 'active')
      .gte('reservation_date', format(new Date(), 'yyyy-MM-dd'))
      .order('reservation_date', { ascending: true })

    console.log('Reservations result:', data, 'Error:', error)
    
    if (error) throw error
    reservations.value = data || []
  } catch (e) {
    console.error('Error fetching reservations:', e)
  }
}

// Get credit type info
const selectedCreditInfo = computed(() => {
  if (!selectedCredit.value) return null
  return CREDIT_TYPE_INFO[selectedCredit.value.credit_type as CreditType]
})

// Check if this is a monthly program (max 2 per week)
const isMonthlyProgram = computed(() => {
  return selectedCreditInfo.value?.max_per_week === 2
})

// Check if this is saturdays only
const isSaturdaysOnly = computed(() => {
  return selectedCreditInfo.value?.saturdays_only === true
})

// Get week key for a date
const getWeekKey = (date: Date): string => {
  const weekStart = startOfWeek(date, { weekStartsOn: 0 })
  return format(weekStart, 'yyyy-MM-dd')
}

// Count dates per week (including existing reservations for this credit)
const datesPerWeek = computed(() => {
  const counts: Record<string, number> = {}
  
  // Count selected dates
  for (const date of selectedDates.value) {
    const weekKey = getWeekKey(date)
    counts[weekKey] = (counts[weekKey] || 0) + 1
  }
  
  // Count existing reservations for this credit
  if (selectedCredit.value) {
    for (const res of reservations.value) {
      if (res.credit_id === selectedCredit.value.id) {
        const weekKey = getWeekKey(new Date(res.reservation_date))
        counts[weekKey] = (counts[weekKey] || 0) + 1
      }
    }
  }
  
  return counts
})

// Check if a week is full (has 2 reservations for monthly programs)
const isWeekFull = (date: Date): boolean => {
  if (!isMonthlyProgram.value) return false
  const weekKey = getWeekKey(date)
  return (datesPerWeek.value[weekKey] || 0) >= 2
}

// Check if can add date to week
const canAddDateToWeek = (date: Date): boolean => {
  if (!isMonthlyProgram.value) return true
  const weekKey = getWeekKey(date)
  const currentCount = datesPerWeek.value[weekKey] || 0
  return currentCount < 2
}

// Max classes for selected credit
const maxClassesForCredit = computed(() => {
  if (!selectedCredit.value) return 0
  return selectedCredit.value.remaining_credits
})

// Check if date is already reserved by user
const isDateReserved = (date: Date): boolean => {
  const dateStr = format(date, 'yyyy-MM-dd')
  return reservations.value.some(r => r.reservation_date === dateStr)
}

// Check if date is selected
const isDateSelected = (date: Date): boolean => {
  const dateStr = format(date, 'yyyy-MM-dd')
  return selectedDates.value.some(d => format(d, 'yyyy-MM-dd') === dateStr)
}

// Check if date is bookable
const isDateBookable = (date: Date): boolean => {
  const isValidClassDay = isClassDay(date)
  const isNotPast = !isBefore(date, startOfDay(new Date()))
  const maxDate = addDays(startOfDay(new Date()), 30)
  const isWithin30Days = !isAfter(startOfDay(date), maxDate)
  const isNotReserved = !isDateReserved(date)
  
  // For Saturdays only packages, only allow Saturdays
  if (isSaturdaysOnly.value && !isSaturday(date)) {
    return false
  }
  
  return isValidClassDay && isNotPast && isWithin30Days && isNotReserved
}

// Select/deselect date
const selectDate = (date: Date) => {
  if (!isDateBookable(date)) return
  if (!selectedCredit.value) return
  
  const dateStr = format(date, 'yyyy-MM-dd')
  const existingIndex = selectedDates.value.findIndex(d => format(d, 'yyyy-MM-dd') === dateStr)
  
  if (existingIndex >= 0) {
    selectedDates.value.splice(existingIndex, 1)
    weeklyLimitWarning.value = false
  } else if (selectedDates.value.length < maxClassesForCredit.value) {
    // Check weekly limit
    if (isMonthlyProgram.value && !canAddDateToWeek(date)) {
      weeklyLimitWarning.value = true
      setTimeout(() => { weeklyLimitWarning.value = false }, 3000)
      return
    }
    selectedDates.value.push(date)
    weeklyLimitWarning.value = false
  }
}

// Calendar
const monthLabel = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  return format(currentDate.value, 'MMMM yyyy', { locale })
})

const calendarDays = computed(() => {
  const start = startOfMonth(currentDate.value)
  const end = endOfMonth(currentDate.value)
  const days = eachDayOfInterval({ start, end })
  const firstDayOfWeek = getDay(start)
  const paddingDays = Array(firstDayOfWeek).fill(null)
  return [...paddingDays, ...days]
})

const weekDays = computed(() => {
  if (language.value === 'es') {
    return ['D', 'L', 'M', 'M', 'J', 'V', 'S']
  }
  return ['S', 'M', 'T', 'W', 'T', 'F', 'S']
})

const goToPrevMonth = () => {
  currentDate.value = subMonths(currentDate.value, 1)
}

const goToNextMonth = () => {
  currentDate.value = addMonths(currentDate.value, 1)
}

// Format dates for display
const formattedSelectedDates = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  return selectedDates.value
    .sort((a, b) => a.getTime() - b.getTime())
    .map(d => format(d, 'EEE d MMM', { locale }))
})

// Submit reservations
const submitReservations = async () => {
  if (!selectedCredit.value || selectedDates.value.length === 0 || !selectedSession.value) return
  
  submitting.value = true
  try {
    const reservationsToInsert = selectedDates.value.map(date => ({
      user_id: user.value?.id,
      credit_id: selectedCredit.value!.id,
      reservation_date: format(date, 'yyyy-MM-dd'),
      time_slot: selectedSession.value,
      status: 'active'
    }))
    
    const { error } = await client
      .from('class_reservations')
      .insert(reservationsToInsert)
    
    if (error) throw error
    
    // Show success and reset
    successMessage.value = true
    selectedDates.value = []
    selectedSession.value = null
    
    // Refresh data
    await Promise.all([fetchCredits(), fetchReservations()])
    
    setTimeout(() => {
      successMessage.value = false
    }, 3000)
  } catch (e) {
    console.error('Error creating reservations:', e)
    alert(language.value === 'es' ? 'Error al crear reservas' : 'Error creating reservations')
  } finally {
    submitting.value = false
  }
}

// Can proceed to submit
const canSubmit = computed(() => {
  return selectedCredit.value && selectedDates.value.length > 0 && selectedSession.value
})

// Select credit
const selectCreditPack = (credit: UserCredit) => {
  selectedCredit.value = credit
  selectedDates.value = []
  selectedSession.value = null
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4 pt-safe pb-6">
      <div class="max-w-lg mx-auto pt-4">
        <div class="flex items-center gap-4 mb-4">
          <button @click="router.back()" class="p-2 -ml-2">
            <svg class="w-6 h-6 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 class="text-2xl font-bold text-white">
            {{ language === 'es' ? 'Mis Reservas' : 'My Reservations' }}
          </h1>
        </div>
      </div>
    </header>

    <div class="px-4 max-w-lg mx-auto">
      <!-- Loading -->
      <div v-if="loading" class="py-12 text-center">
        <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
      </div>

      <!-- No Credits -->
      <div v-else-if="credits.length === 0" class="py-12 text-center">
        <div class="text-6xl mb-4">🎫</div>
        <h2 class="text-xl font-bold text-white mb-2">
          {{ language === 'es' ? 'No tienes créditos disponibles' : 'No credits available' }}
        </h2>
        <p class="text-gray-400 mb-6">
          {{ language === 'es' 
            ? 'Compra un paquete de clases para comenzar a reservar' 
            : 'Purchase a class package to start booking' 
          }}
        </p>
        <NuxtLink 
          to="/book" 
          class="inline-block px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold rounded-xl"
        >
          {{ language === 'es' ? 'Comprar Clases' : 'Buy Classes' }}
        </NuxtLink>
      </div>

      <!-- Has Credits -->
      <template v-else>
        <!-- Success Message -->
        <Transition
          enter-active-class="transition-all duration-300"
          enter-from-class="opacity-0 -translate-y-4"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition-all duration-200"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div v-if="successMessage" class="mb-4 p-4 bg-glass-green/20 border border-glass-green rounded-xl flex items-center gap-3">
            <span class="text-2xl">✅</span>
            <p class="text-glass-green font-semibold">
              {{ language === 'es' ? '¡Clases reservadas exitosamente!' : 'Classes booked successfully!' }}
            </p>
          </div>
        </Transition>

        <!-- Step 1: Select Credit Pack -->
        <div class="mb-6">
          <h2 class="text-lg font-bold text-white mb-3">
            {{ language === 'es' ? '1. Selecciona tu paquete' : '1. Select your package' }}
          </h2>
          <div class="space-y-3">
            <button
              v-for="credit in credits"
              :key="credit.id"
              @click="selectCreditPack(credit)"
              class="w-full p-4 rounded-xl border-2 transition-all text-left"
              :class="selectedCredit?.id === credit.id 
                ? 'border-gold-400 bg-gold-400/10' 
                : 'border-gray-800 bg-gray-900 hover:border-gray-700'"
            >
              <div class="flex items-center justify-between">
                <div>
                  <h3 class="font-bold text-white">
                    {{ language === 'es' 
                      ? CREDIT_TYPE_INFO[credit.credit_type as CreditType]?.name_es 
                      : CREDIT_TYPE_INFO[credit.credit_type as CreditType]?.name 
                    }}
                  </h3>
                  <p class="text-sm text-gray-400">
                    {{ language === 'es' ? 'Expira:' : 'Expires:' }} 
                    {{ format(new Date(credit.expiration_date), 'dd MMM yyyy') }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-2xl font-bold text-gold-400">{{ credit.remaining_credits }}</p>
                  <p class="text-xs text-gray-500">
                    {{ language === 'es' ? 'clases restantes' : 'classes left' }}
                  </p>
                </div>
              </div>
              <!-- Weekly limit indicator for monthly programs -->
              <div v-if="CREDIT_TYPE_INFO[credit.credit_type as CreditType]?.max_per_week === 2" 
                   class="mt-2 pt-2 border-t border-gray-800">
                <p class="text-xs text-gold-400 flex items-center gap-1">
                  <span>⚠️</span>
                  {{ language === 'es' ? 'Máx. 2 clases por semana' : 'Max 2 classes per week' }}
                </p>
              </div>
            </button>
          </div>
        </div>

        <!-- Step 2: Select Dates (only if credit selected) -->
        <div v-if="selectedCredit" class="mb-6">
          <h2 class="text-lg font-bold text-white mb-3">
            {{ language === 'es' ? '2. Selecciona tus fechas' : '2. Select your dates' }}
          </h2>

          <!-- Counter -->
          <div class="bg-gradient-to-r from-glass-purple/20 to-glass-blue/20 rounded-2xl p-4 border border-glass-purple/30 mb-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-white font-semibold">
                  {{ language === 'es' ? 'Clases seleccionadas' : 'Classes selected' }}
                </p>
                <p class="text-xs text-gray-400">
                  {{ language === 'es' 
                    ? `Puedes reservar hasta ${maxClassesForCredit} clases` 
                    : `You can book up to ${maxClassesForCredit} classes` 
                  }}
                </p>
                <p v-if="isMonthlyProgram" class="text-xs text-gold-400 mt-1 flex items-center gap-1">
                  <span>⚠️</span>
                  {{ language === 'es' ? 'Máx. 2 por semana' : 'Max 2 per week' }}
                </p>
              </div>
              <div class="text-right">
                <p class="text-3xl font-bold">
                  <span class="text-gold-400">{{ selectedDates.length }}</span>
                  <span class="text-gray-500">/{{ maxClassesForCredit }}</span>
                </p>
              </div>
            </div>
            
            <!-- Weekly limit warning -->
            <Transition
              enter-active-class="transition-all duration-300"
              enter-from-class="opacity-0 -translate-y-2"
              enter-to-class="opacity-100 translate-y-0"
            >
              <div v-if="weeklyLimitWarning" class="mt-3 p-3 bg-flame-600/20 border border-flame-600/50 rounded-xl flex items-center gap-2">
                <span class="text-flame-600">⚠️</span>
                <p class="text-sm text-flame-600">
                  {{ language === 'es' 
                    ? 'Ya tienes 2 clases esta semana. Elige otra semana.' 
                    : 'You already have 2 classes this week. Choose another week.' 
                  }}
                </p>
              </div>
            </Transition>
          </div>

          <!-- Calendar -->
          <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
            <div class="flex items-center justify-between mb-4">
              <button @click="goToPrevMonth" class="p-2 rounded-lg hover:bg-gray-800 text-white">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 class="text-lg font-semibold text-white capitalize">{{ monthLabel }}</h2>
              <button @click="goToNextMonth" class="p-2 rounded-lg hover:bg-gray-800 text-white">
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
                :class="[2, 4, 6].includes(index) ? 'text-gold-400' : 'text-gray-500'"
              >
                {{ day }}
              </div>
            </div>

            <div class="grid grid-cols-7 gap-1">
              <template v-for="(day, index) in calendarDays" :key="index">
                <div v-if="!day" class="aspect-square"></div>
                <button
                  v-else
                  @click="selectDate(day)"
                  :disabled="!isDateBookable(day)"
                  class="aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all"
                  :class="[
                    isDateSelected(day)
                      ? 'bg-gold-400 text-black shadow-lg ring-2 ring-gold-500'
                      : isDateReserved(day)
                        ? 'bg-glass-green/30 text-glass-green ring-1 ring-glass-green'
                        : isToday(day)
                          ? 'bg-glass-purple text-white'
                          : isMonthlyProgram && isDateBookable(day) && isWeekFull(day)
                            ? 'bg-gray-800/50 text-gray-500 ring-1 ring-flame-600/30'
                            : isDateBookable(day)
                              ? 'bg-gray-800 hover:bg-gray-700 text-white'
                              : 'text-gray-600 cursor-not-allowed',
                  ]"
                >
                  <span class="text-sm font-medium">{{ format(day, 'd') }}</span>
                  <!-- Already reserved indicator -->
                  <span v-if="isDateReserved(day)" class="absolute -bottom-0.5 text-[8px]">✓</span>
                  <!-- Week full indicator -->
                  <span
                    v-else-if="isMonthlyProgram && isDateBookable(day) && isWeekFull(day)"
                    class="absolute -bottom-0.5 text-[8px] text-flame-600"
                  >
                    2/2
                  </span>
                  <!-- Selection number -->
                  <span 
                    v-else-if="isDateSelected(day)"
                    class="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black text-gold-400 text-[10px] font-bold flex items-center justify-center"
                  >
                    {{ selectedDates.findIndex(d => format(d, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')) + 1 }}
                  </span>
                </button>
              </template>
            </div>
          </div>

          <!-- Selected Dates List -->
          <div v-if="selectedDates.length > 0" class="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
            <p class="text-sm text-gray-400 mb-3">{{ language === 'es' ? 'Fechas seleccionadas:' : 'Selected dates:' }}</p>
            <div class="flex flex-wrap gap-2">
              <div 
                v-for="(dateStr, idx) in formattedSelectedDates" 
                :key="idx"
                class="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5"
              >
                <span class="w-5 h-5 rounded-full bg-gold-400 text-black text-xs font-bold flex items-center justify-center">
                  {{ idx + 1 }}
                </span>
                <span class="text-sm text-white capitalize">{{ dateStr }}</span>
              </div>
            </div>
          </div>

          <!-- Session Selection -->
          <div v-if="selectedDates.length > 0" class="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4">
            <p class="text-sm text-gray-400 mb-3">
              {{ language === 'es' ? '3. Selecciona horario:' : '3. Select session:' }}
            </p>
            <div class="grid grid-cols-2 gap-3">
              <button
                @click="selectedSession = 'early'"
                class="p-4 rounded-xl border-2 transition-all"
                :class="selectedSession === 'early' ? 'border-gold-400 bg-gold-400/20' : 'border-gray-700 bg-gray-800'"
              >
                <p class="font-bold text-white">5:30 PM</p>
                <p class="text-sm text-gray-400">- 7:00 PM</p>
              </button>
              <button
                @click="selectedSession = 'late'"
                class="p-4 rounded-xl border-2 transition-all"
                :class="selectedSession === 'late' ? 'border-gold-400 bg-gold-400/20' : 'border-gray-700 bg-gray-800'"
              >
                <p class="font-bold text-white">7:00 PM</p>
                <p class="text-sm text-gray-400">- 8:30 PM</p>
              </button>
            </div>
          </div>
        </div>

        <!-- Existing Reservations -->
        <div v-if="reservations.length > 0" class="mb-6">
          <h2 class="text-lg font-bold text-white mb-3">
            {{ language === 'es' ? 'Mis Clases Reservadas' : 'My Reserved Classes' }}
          </h2>
          <div class="space-y-2">
            <div 
              v-for="res in reservations" 
              :key="res.id"
              class="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between"
            >
              <div>
                <p class="font-semibold text-white capitalize">
                  {{ format(new Date(res.reservation_date), 'EEEE d MMMM', { locale: language === 'es' ? es : undefined }) }}
                </p>
                <p class="text-sm text-gray-400">
                  {{ res.time_slot === 'early' ? '5:30 PM - 7:00 PM' : '7:00 PM - 8:30 PM' }}
                </p>
              </div>
              <span class="px-3 py-1 bg-glass-green/20 text-glass-green text-xs font-bold rounded-full">
                {{ language === 'es' ? 'Reservado' : 'Reserved' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Submit Button -->
        <div v-if="selectedCredit" class="fixed bottom-0 left-0 right-0 p-4 bg-gray-900 border-t border-gray-800 pb-safe">
          <div class="max-w-lg mx-auto">
            <button
              @click="submitReservations"
              :disabled="!canSubmit || submitting"
              class="w-full py-4 font-bold rounded-xl transition-all"
              :class="canSubmit && !submitting 
                ? 'bg-gradient-to-r from-gold-400 to-gold-500 text-black' 
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'"
            >
              <span v-if="submitting" class="flex items-center justify-center gap-2">
                <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ language === 'es' ? 'Reservando...' : 'Booking...' }}
              </span>
              <span v-else>
                {{ language === 'es' 
                  ? `Reservar ${selectedDates.length} clase${selectedDates.length !== 1 ? 's' : ''}` 
                  : `Book ${selectedDates.length} class${selectedDates.length !== 1 ? 'es' : ''}` 
                }}
              </span>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
