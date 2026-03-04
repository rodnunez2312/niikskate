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
  getWeek
} from 'date-fns'
import { es } from 'date-fns/locale'

// Use blank layout - no bottom navigation
definePageMeta({
  layout: false
})

const router = useRouter()
const route = useRoute()
const { t, formatPrice, language, currency } = useI18n()
const { fetchCoaches, coaches, isClassDay, getAvailableCoaches } = useClasses()

// Auth
const user = useSupabaseUser()
const supabase = useSupabaseClient()

// Wizard state
const currentStep = ref(1)
const totalSteps = 5

// Step 1: Class type
const classType = ref<'single' | 'package' | null>(null)

// Step 2: Specific class selection
const selectedClass = ref<string | null>(null)

// Step 3: Equipment
const selectedEquipment = ref<string[]>([])

// Step 4: Date & Session
const currentDate = ref(new Date())
const selectedDate = ref<Date | null>(null)
const selectedDates = ref<Date[]>([]) // For packages with multiple classes
const selectedSession = ref<'early' | 'late' | null>(null)
const availableCoachesForDate = ref<any[]>([])

// Get max classes for selected package
const maxClassesForPackage = computed(() => {
  if (!selectedClass.value) return 1
  switch (selectedClass.value) {
    case 'monthly':
    case 'monthly_intermediate':
      return 8
    case 'pkg_10':
      return 10
    case 'pkg_5':
      return 5
    case 'pkg_3':
      return 3
    case 'saturdays':
      return 4
    default:
      return 1 // Single class
  }
})

// Check if multi-date selection is enabled
const isMultiDateSelection = computed(() => {
  return maxClassesForPackage.value > 1
})

// Check if this is a monthly program (max 2 classes per week)
const isMonthlyProgram = computed(() => {
  return selectedClass.value === 'monthly' || selectedClass.value === 'monthly_intermediate'
})

// Get week key for a date (year-week format)
const getWeekKey = (date: Date): string => {
  const weekStart = startOfWeek(date, { weekStartsOn: 0 }) // Sunday as week start
  return format(weekStart, 'yyyy-MM-dd')
}

// Count how many dates are selected per week
const datesPerWeek = computed(() => {
  const counts: Record<string, number> = {}
  for (const date of selectedDates.value) {
    const weekKey = getWeekKey(date)
    counts[weekKey] = (counts[weekKey] || 0) + 1
  }
  return counts
})

// Check if a week has reached the max (2 for monthly programs)
const isWeekFull = (date: Date): boolean => {
  if (!isMonthlyProgram.value) return false
  const weekKey = getWeekKey(date)
  return (datesPerWeek.value[weekKey] || 0) >= 2
}

// Check if adding a date would exceed weekly limit
const canAddDateToWeek = (date: Date): boolean => {
  if (!isMonthlyProgram.value) return true
  const weekKey = getWeekKey(date)
  const currentCount = datesPerWeek.value[weekKey] || 0
  return currentCount < 2
}

// Step 5: Confirmation
const customerEmail = ref('')
const customerPhone = ref('')
const selectedCountryCode = ref('+52') // Default to Mexico
const skipEmail = ref(false)

// Country codes list (Mexico first, US second, then alphabetical)
const countryCodes = [
  { code: '+52', flag: '🇲🇽', name: 'México', short: 'MX' },
  { code: '+1', flag: '🇺🇸', name: 'United States', short: 'US' },
  { code: '+1', flag: '🇨🇦', name: 'Canada', short: 'CA' },
  { code: '+54', flag: '🇦🇷', name: 'Argentina', short: 'AR' },
  { code: '+55', flag: '🇧🇷', name: 'Brasil', short: 'BR' },
  { code: '+56', flag: '🇨🇱', name: 'Chile', short: 'CL' },
  { code: '+57', flag: '🇨🇴', name: 'Colombia', short: 'CO' },
  { code: '+506', flag: '🇨🇷', name: 'Costa Rica', short: 'CR' },
  { code: '+593', flag: '🇪🇨', name: 'Ecuador', short: 'EC' },
  { code: '+503', flag: '🇸🇻', name: 'El Salvador', short: 'SV' },
  { code: '+34', flag: '🇪🇸', name: 'España', short: 'ES' },
  { code: '+502', flag: '🇬🇹', name: 'Guatemala', short: 'GT' },
  { code: '+504', flag: '🇭🇳', name: 'Honduras', short: 'HN' },
  { code: '+505', flag: '🇳🇮', name: 'Nicaragua', short: 'NI' },
  { code: '+507', flag: '🇵🇦', name: 'Panamá', short: 'PA' },
  { code: '+51', flag: '🇵🇪', name: 'Perú', short: 'PE' },
  { code: '+1', flag: '🇵🇷', name: 'Puerto Rico', short: 'PR' },
  { code: '+44', flag: '🇬🇧', name: 'United Kingdom', short: 'UK' },
  { code: '+58', flag: '🇻🇪', name: 'Venezuela', short: 'VE' },
]
const paymentMethod = ref<'cash' | 'online' | null>(null)
const isSubmitting = ref(false)
const bookingConfirmed = ref(false)

// Get the raw digits for validation (local number only, without country code)
const phoneDigits = computed(() => customerPhone.value.replace(/\D/g, ''))

// Full phone number with country code
const fullPhoneNumber = computed(() => {
  if (!phoneDigits.value) return ''
  return `${selectedCountryCode.value}${phoneDigits.value}`
})

// Load coaches on mount and handle query params
onMounted(() => {
  fetchCoaches()
  
  // Check if class was pre-selected from home page
  const preSelectedClass = route.query.class as string
  if (preSelectedClass) {
    // Map query param to class selection
    switch (preSelectedClass) {
      case 'monthly_beginner':
        classType.value = 'package'
        selectedClass.value = 'monthly'
        currentStep.value = 3 // Skip to equipment selection
        break
      case 'monthly_intermediate':
        classType.value = 'package'
        selectedClass.value = 'monthly_intermediate'
        currentStep.value = 3
        break
      case 'grouped':
        classType.value = 'single'
        selectedClass.value = 'grouped'
        currentStep.value = 3
        break
      case 'individual':
        classType.value = 'single'
        selectedClass.value = 'individual'
        currentStep.value = 3
        break
      case 'pkg_3':
        classType.value = 'package'
        selectedClass.value = 'pkg_3'
        currentStep.value = 3
        break
      case 'pkg_5':
        classType.value = 'package'
        selectedClass.value = 'pkg_5'
        currentStep.value = 3
        break
      case 'pkg_10':
        classType.value = 'package'
        selectedClass.value = 'pkg_10'
        currentStep.value = 3
        break
      case 'saturdays':
      case 'pkg_saturday':
        classType.value = 'package'
        selectedClass.value = 'saturdays'
        currentStep.value = 3
        break
    }
  }
})

// Single class options (with dual pricing: MXN and USD)
const singleClassOptions = computed(() => [
  {
    id: 'grouped',
    name: language.value === 'es' ? 'Clase Grupal' : 'Group Class',
    description: language.value === 'es' ? 'Aprende con otros estudiantes' : 'Learn with other students',
    priceMXN: 130,
    priceUSD: 200,
    icon: '👥',
    color: 'from-green-400 to-green-600',
  },
  {
    id: 'individual',
    name: language.value === 'es' ? 'Clase Individual' : 'Individual Class',
    description: language.value === 'es' ? 'Entrenamiento personalizado' : 'Personalized coaching',
    priceMXN: 130,
    priceUSD: 200,
    icon: '👤',
    color: 'from-purple-400 to-purple-600',
  },
])

// Package options (with dual pricing: MXN and USD)
const packageOptions = computed(() => [
  {
    id: 'monthly',
    name: language.value === 'es' ? 'Programa Mensual Principiantes' : 'Monthly Beginners Program',
    description: language.value === 'es' ? '8 clases grupales' : '8 group classes',
    priceMXN: 600,
    priceUSD: 35,
    icon: '🏆',
    color: 'from-gold-400 to-gold-600',
    badge: language.value === 'es' ? 'Mejor valor' : 'Best value',
  },
  {
    id: 'monthly_intermediate',
    name: language.value === 'es' ? 'Programa Mensual Intermedios' : 'Monthly Intermediate Program',
    description: language.value === 'es' ? '8 clases • Bowl, Street, Surf Skate' : '8 classes • Bowl, Street, Surf Skate',
    priceMXN: 800,
    priceUSD: 50,
    icon: '⭐',
    color: 'from-purple-400 to-blue-600',
    badge: language.value === 'es' ? 'Competitivo' : 'Competitive',
  },
  {
    id: 'pkg_3',
    name: language.value === 'es' ? 'Paquete 3 Clases' : '3 Classes Package',
    description: language.value === 'es' ? '10% descuento • Válido 1 mes' : '10% off • Valid 1 month',
    priceMXN: 350,
    priceUSD: 540,
    icon: '3️⃣',
    color: 'from-green-400 to-green-600',
    badge: '10% OFF',
  },
  {
    id: 'pkg_5',
    name: language.value === 'es' ? 'Paquete 5 Clases' : '5 Classes Package',
    description: language.value === 'es' ? '15% descuento • Válido 1 mes' : '15% off • Valid 1 month',
    priceMXN: 560,
    priceUSD: 850,
    icon: '5️⃣',
    color: 'from-yellow-400 to-yellow-600',
    badge: '15% OFF',
  },
  {
    id: 'pkg_10',
    name: language.value === 'es' ? 'Paquete 10 Clases' : '10 Classes Package',
    description: language.value === 'es' ? '20% descuento • Válido 1 mes' : '20% off • Valid 1 month',
    priceMXN: 1040,
    priceUSD: 1600,
    icon: '🔟',
    color: 'from-glass-purple to-glass-blue',
    badge: language.value === 'es' ? 'Mejor valor' : 'Best value',
  },
  {
    id: 'saturdays',
    name: language.value === 'es' ? 'Solo Sábados' : 'Saturdays Only',
    description: language.value === 'es' ? '4 clases del mes' : '4 classes per month',
    priceMXN: 420,
    priceUSD: 35,
    icon: '🗓️',
    color: 'from-orange-400 to-orange-600',
  },
])

// Equipment options
const equipmentOptions = computed(() => [
  {
    id: 'helmet',
    name: language.value === 'es' ? 'Casco' : 'Helmet',
    priceMXN: 50,
    priceUSD: 5,
    image: '⛑️',
  },
  {
    id: 'pads',
    name: language.value === 'es' ? 'Protecciones' : 'Pads',
    priceMXN: 50,
    priceUSD: 5,
    image: '🛡️',
  },
  {
    id: 'skateboard',
    name: language.value === 'es' ? 'Patineta' : 'Skateboard',
    priceMXN: 50,
    priceUSD: 5,
    image: '🛹',
  },
])

// Equipment total (returns object with both currencies)
const equipmentTotalMXN = computed(() => {
  const count = selectedEquipment.value.length
  if (count === 3) return 100 // Bundle price in MXN
  return count * 50
})

const equipmentTotalUSD = computed(() => {
  const count = selectedEquipment.value.length
  if (count === 3) return 10 // Bundle price in USD
  return count * 5
})

// Backwards compatibility
const equipmentTotal = computed(() => equipmentTotalMXN.value)

// Toggle equipment
const toggleEquipment = (id: string) => {
  if (selectedEquipment.value.includes(id)) {
    selectedEquipment.value = selectedEquipment.value.filter(e => e !== id)
  } else {
    selectedEquipment.value.push(id)
  }
}

// Calendar computations
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

// Warning message for weekly limit
const weeklyLimitWarning = ref(false)

// Select date
const selectDate = async (date: Date) => {
  if (!isDateBookable(date)) return
  
  // For packages with multiple classes, toggle date selection
  if (isMultiDateSelection.value) {
    const dateStr = format(date, 'yyyy-MM-dd')
    const existingIndex = selectedDates.value.findIndex(d => format(d, 'yyyy-MM-dd') === dateStr)
    
    if (existingIndex >= 0) {
      // Remove date if already selected
      selectedDates.value.splice(existingIndex, 1)
      weeklyLimitWarning.value = false
    } else if (selectedDates.value.length < maxClassesForPackage.value) {
      // Check weekly limit for monthly programs
      if (isMonthlyProgram.value && !canAddDateToWeek(date)) {
        // Show warning - can't add more than 2 per week
        weeklyLimitWarning.value = true
        setTimeout(() => { weeklyLimitWarning.value = false }, 3000)
        return
      }
      // Add date if under limit
      selectedDates.value.push(date)
      weeklyLimitWarning.value = false
    }
    // Set the most recently selected date as the "active" one for session selection
    if (selectedDates.value.length > 0) {
      selectedDate.value = selectedDates.value[selectedDates.value.length - 1]
    } else {
      selectedDate.value = null
    }
  } else {
    // Single date selection
    selectedDate.value = date
  }
  selectedSession.value = null
  
  // Get available coaches for this date
  const dateStr = format(date, 'yyyy-MM-dd')
  availableCoachesForDate.value = await getAvailableCoaches(dateStr, 'early')
}

// Get coach for date (for calendar hover)
const getCoachForDate = (date: Date) => {
  // Return first available coach for preview
  if (coaches.value.length > 0) {
    return coaches.value[0]
  }
  return null
}

// Navigation
const goToPrevMonth = () => {
  currentDate.value = subMonths(currentDate.value, 1)
}

const goToNextMonth = () => {
  currentDate.value = addMonths(currentDate.value, 1)
}

// Step navigation
const nextStep = () => {
  if (currentStep.value < totalSteps) {
    currentStep.value++
  }
}

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--
  }
}

// Auto-advance selection functions
const selectClassType = (type: 'single' | 'package') => {
  classType.value = type
  selectedClass.value = null
  // Brief delay for visual feedback before advancing
  setTimeout(() => {
    nextStep()
  }, 200)
}

const selectSpecificClass = (classId: string) => {
  selectedClass.value = classId
  // Brief delay for visual feedback before advancing
  setTimeout(() => {
    nextStep()
  }, 200)
}

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 1:
      return classType.value !== null
    case 2:
      return selectedClass.value !== null
    case 3:
      return true // Equipment is optional
    case 4:
      // For packages, all dates must be selected. For single class, just one date.
      if (isMultiDateSelection.value) {
        return selectedDates.value.length === maxClassesForPackage.value && selectedSession.value !== null
      }
      return selectedDate.value !== null && selectedSession.value !== null
    case 5:
      // If skipping email, phone is required (10 digits local number). Otherwise email is required.
      const hasValidContact = skipEmail.value 
        ? phoneDigits.value.length >= 10 
        : customerEmail.value.includes('@')
      return hasValidContact && paymentMethod.value !== null
    default:
      return false
  }
})

// Get selected class details
const selectedClassDetails = computed(() => {
  if (!selectedClass.value) return null
  
  if (classType.value === 'single') {
    return singleClassOptions.value.find(c => c.id === selectedClass.value)
  } else {
    return packageOptions.value.find(c => c.id === selectedClass.value)
  }
})

// Calculate total (raw MXN - for backwards compatibility)
const totalPriceMXN = computed(() => {
  let total = selectedClassDetails.value?.priceMXN || 0
  total += equipmentTotalMXN.value
  return total
})

// For display: sum the individual converted/rounded prices so math matches
// This ensures $35 + $10 = $45, not $40
const totalPrice = computed(() => {
  return totalPriceMXN.value
})

// Get the display total that matches individual line items
const displayTotal = computed(() => {
  const classDetails = selectedClassDetails.value
  
  if (currency.value === 'USD') {
    const classPrice = classDetails?.priceUSD || 0
    const equipPrice = equipmentTotalUSD.value
    return classPrice + equipPrice
  }
  
  // MXN
  const classPrice = classDetails?.priceMXN || 0
  const equipPrice = equipmentTotalMXN.value
  return classPrice + equipPrice
})

// Format the display total
const formattedDisplayTotal = computed(() => {
  if (currency.value === 'USD') {
    return `$${displayTotal.value} USD`
  }
  return `$${displayTotal.value} MXN`
})

// Map class selection to credit type
const getCreditType = (classSelection: string | null): string | null => {
  switch (classSelection) {
    case 'monthly': return 'monthly_beginner'
    case 'monthly_intermediate': return 'monthly_intermediate'
    case 'pkg_3': return 'pkg_3'
    case 'pkg_5': return 'pkg_5'
    case 'pkg_10': return 'pkg_10'
    case 'saturdays': return 'saturdays'
    case 'grouped': return 'single_group'
    case 'individual': return 'single_individual'
    default: return null
  }
}

// Get total credits for a class type
const getTotalCredits = (classSelection: string | null): number => {
  switch (classSelection) {
    case 'monthly':
    case 'monthly_intermediate':
      return 8
    case 'pkg_10': return 10
    case 'pkg_5': return 5
    case 'pkg_3': return 3
    case 'saturdays': return 4
    case 'grouped':
    case 'individual':
      return 1
    default: return 0
  }
}

// Submit booking
const submitBooking = async () => {
  if (!canProceed.value) return
  
  isSubmitting.value = true
  
  // Build booking data
  const bookingData = {
    class_type: selectedClass.value,
    class_name: selectedClassDetails.value?.name || '',
    date: selectedDate.value ? format(selectedDate.value, 'yyyy-MM-dd') : '',
    dates: selectedDates.value.map(d => format(d, 'yyyy-MM-dd')),
    session: selectedSession.value,
    equipment: selectedEquipment.value,
    total_mxn: totalPriceMXN.value,
    total_usd: displayTotal.value,
    payment_method: paymentMethod.value,
    contact_email: !skipEmail.value ? customerEmail.value : null,
    contact_phone: skipEmail.value ? `${selectedCountryCode.value}${phoneDigits.value}` : null,
    created_at: new Date().toISOString()
  }
  
  try {
    if (user.value) {
      // Logged in user - save booking to database
      const { error: bookingError } = await supabase
        .from('guest_bookings')
        .insert({
          email: user.value.email,
          phone: bookingData.contact_phone,
          full_name: user.value.user_metadata?.full_name || user.value.email,
          booking_data: bookingData,
          linked_user_id: user.value.id,
          linked_at: new Date().toISOString()
        })
      
      if (bookingError) {
        console.error('Error saving booking:', bookingError)
      }
      
      // Create credits for the user
      const creditType = getCreditType(selectedClass.value)
      const totalCredits = getTotalCredits(selectedClass.value)
      
      if (creditType && totalCredits > 0) {
        const expirationDate = addDays(new Date(), 30) // Credits expire in 30 days
        
        const { error: creditError } = await supabase
          .from('user_credits')
          .insert({
            user_id: user.value.id,
            credit_type: creditType,
            total_credits: totalCredits,
            remaining_credits: totalCredits,
            purchase_date: new Date().toISOString(),
            expiration_date: expirationDate.toISOString(),
            price_paid_mxn: totalPriceMXN.value,
            price_paid_usd: currency.value === 'USD' ? displayTotal.value : null,
            payment_method: paymentMethod.value,
            payment_status: paymentMethod.value === 'cash' ? 'pending' : 'pending'
          })
        
        if (creditError) {
          console.error('Error creating credits:', creditError)
        }
      }
    } else {
      // Guest user - save to localStorage
      const guestBookings = JSON.parse(localStorage.getItem('guest_bookings') || '[]')
      guestBookings.push({
        id: crypto.randomUUID(),
        email: bookingData.contact_email,
        phone: bookingData.contact_phone,
        booking_data: bookingData,
        created_at: new Date().toISOString()
      })
      localStorage.setItem('guest_bookings', JSON.stringify(guestBookings))
    }
    
    // Simulate API delay for UX
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    bookingConfirmed.value = true
  } catch (error) {
    console.error('Booking error:', error)
  } finally {
    isSubmitting.value = false
  }
}

// Format selected date
const formattedSelectedDate = computed(() => {
  if (!selectedDate.value) return ''
  const locale = language.value === 'es' ? es : undefined
  return format(selectedDate.value, 'EEEE, d MMMM', { locale })
})

// Format all selected dates for packages
const formattedSelectedDates = computed(() => {
  if (selectedDates.value.length === 0) return []
  const locale = language.value === 'es' ? es : undefined
  return selectedDates.value
    .sort((a, b) => a.getTime() - b.getTime())
    .map(d => format(d, 'EEE d MMM', { locale }))
})

// Check if a date is selected (for multi-date selection)
const isDateSelected = (date: Date): boolean => {
  const dateStr = format(date, 'yyyy-MM-dd')
  return selectedDates.value.some(d => format(d, 'yyyy-MM-dd') === dateStr)
}

// Check if a date is beyond 30 days from today
const maxBookingDate = computed(() => addDays(startOfDay(new Date()), 30))

const isBeyond30Days = (date: Date): boolean => {
  return isAfter(startOfDay(date), maxBookingDate.value)
}

// Check if a date is bookable (class day, not in past, within 30 days)
const isDateBookable = (date: Date): boolean => {
  return isClassDay(date) && 
         !isBefore(date, startOfDay(new Date())) && 
         !isBeyond30Days(date)
}
</script>

<template>
  <div class="min-h-screen bg-black">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40 pt-safe">
      <div class="px-4 py-4 max-w-lg mx-auto">
        <div class="flex items-center justify-between">
          <button @click="currentStep > 1 ? prevStep() : router.push('/')" class="p-2 -ml-2">
            <svg class="w-6 h-6 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div class="flex-1 mx-4">
            <!-- Progress bar -->
            <div class="h-1 bg-gray-700 rounded-full overflow-hidden">
              <div 
                class="h-full bg-gradient-to-r from-gold-400 to-gold-500 transition-all duration-300"
                :style="{ width: `${(currentStep / totalSteps) * 100}%` }"
              ></div>
            </div>
            <p class="text-xs text-gray-500 text-center mt-1">
              {{ currentStep }} / {{ totalSteps }}
            </p>
          </div>
          
          <NuxtLink to="/" class="p-2 -mr-2">
            <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </NuxtLink>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div class="px-4 py-6 max-w-lg mx-auto pb-32">
      
      <!-- STEP 1: Class Type Selection - Swipe Cards Style -->
      <div v-if="currentStep === 1" class="space-y-6">
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-white mb-2">
            {{ language === 'es' ? '¿Qué tipo de clase?' : 'What type of class?' }}
          </h1>
          <p class="text-gray-400">
            {{ language === 'es' ? 'Toca para seleccionar' : 'Tap to select' }}
          </p>
        </div>

        <div class="grid grid-cols-1 gap-4">
          <!-- Single Class Option - Auto advance -->
          <button
            @click="selectClassType('single')"
            class="relative overflow-hidden rounded-3xl p-6 text-left transition-all duration-300 transform active:scale-95"
            :class="[
              classType === 'single'
                ? 'ring-4 ring-gold-400 bg-gradient-to-br from-gold-400/20 to-glass-orange/20 scale-[1.02]'
                : 'bg-gray-900 border border-gray-800 hover:border-gold-400/50 hover:bg-gray-800'
            ]"
          >
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center shadow-lg shadow-gold-400/30">
                <span class="text-3xl font-bold text-black">1</span>
              </div>
              <div class="flex-1">
                <h3 class="text-xl font-bold text-white">
                  {{ language === 'es' ? '1 Clase' : '1 Class' }}
                </h3>
                <p class="text-gray-400 text-sm">
                  {{ language === 'es' ? 'Grupal o Individual' : 'Group or Individual' }}
                </p>
                <p class="text-gold-400 font-semibold mt-1">
                  {{ language === 'es' ? 'Desde' : 'From' }} {{ formatPrice(130) }}
                </p>
              </div>
              <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>

          <!-- Package Option - Auto advance -->
          <button
            @click="selectClassType('package')"
            class="relative overflow-hidden rounded-3xl p-6 text-left transition-all duration-300 transform active:scale-95"
            :class="[
              classType === 'package'
                ? 'ring-4 ring-gold-400 bg-gradient-to-br from-glass-green/20 to-glass-blue/20 scale-[1.02]'
                : 'bg-gray-900 border border-gray-800 hover:border-glass-green/50 hover:bg-gray-800'
            ]"
          >
            <div class="absolute top-3 right-12">
              <span class="px-2 py-1 bg-glass-green text-white text-xs font-bold rounded-full">
                {{ language === 'es' ? '¡Ahorra!' : 'Save!' }}
              </span>
            </div>
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-glass-green to-glass-blue flex items-center justify-center shadow-lg shadow-glass-green/30">
                <span class="text-2xl">📦</span>
              </div>
              <div class="flex-1">
                <h3 class="text-xl font-bold text-white">
                  {{ language === 'es' ? 'Paquete de Clases' : 'Class Package' }}
                </h3>
                <p class="text-gray-400 text-sm">
                  {{ language === 'es' ? 'Mensual o paquetes' : 'Monthly or packages' }}
                </p>
                <p class="text-glass-green font-semibold mt-1">
                  {{ language === 'es' ? 'Desde' : 'From' }} {{ formatPrice(350) }}
                </p>
              </div>
              <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>

        <!-- Visual hint -->
        <p class="text-center text-xs text-gray-500 mt-4">
          {{ language === 'es' ? '👆 Toca una opción para continuar' : '👆 Tap an option to continue' }}
        </p>
      </div>

      <!-- STEP 2: Specific Class Selection - Auto advance -->
      <div v-else-if="currentStep === 2" class="space-y-6">
        <div class="text-center mb-6">
          <h1 class="text-2xl font-bold text-white mb-2">
            {{ classType === 'single' 
              ? (language === 'es' ? '¿Qué clase prefieres?' : 'Which class do you prefer?')
              : (language === 'es' ? 'Elige tu paquete' : 'Choose your package') 
            }}
          </h1>
          <p class="text-gray-400">
            {{ language === 'es' ? 'Toca para seleccionar' : 'Tap to select' }}
          </p>
        </div>

        <!-- Single Class Options - Auto advance -->
        <div v-if="classType === 'single'" class="space-y-3">
          <button
            v-for="option in singleClassOptions"
            :key="option.id"
            @click="selectSpecificClass(option.id)"
            class="w-full rounded-2xl p-5 text-left transition-all duration-300 transform active:scale-95"
            :class="[
              selectedClass === option.id
                ? 'ring-4 ring-gold-400 bg-gradient-to-br from-gold-400/20 to-glass-orange/20 scale-[1.02]'
                : 'bg-gray-900 border border-gray-800 hover:border-gold-400/50'
            ]"
          >
            <div class="flex items-center gap-4">
              <div 
                class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br shadow-lg"
                :class="option.color"
              >
                {{ option.icon }}
              </div>
              <div class="flex-1">
                <h3 class="font-bold text-white text-lg">{{ option.name }}</h3>
                <p class="text-gray-400 text-sm">{{ option.description }}</p>
              </div>
              <div class="text-right flex items-center gap-2">
                <p class="font-bold text-xl text-gold-400">{{ currency === 'USD' ? `$${option.priceUSD} USD` : `$${option.priceMXN} MXN` }}</p>
                <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </button>
        </div>

        <!-- Package Options - Auto advance -->
        <div v-else class="space-y-3">
          <button
            v-for="option in packageOptions"
            :key="option.id"
            @click="selectSpecificClass(option.id)"
            class="w-full rounded-2xl p-5 text-left transition-all duration-300 transform active:scale-95 relative"
            :class="[
              selectedClass === option.id
                ? 'ring-4 ring-gold-400 bg-gradient-to-br from-glass-green/20 to-glass-blue/20 scale-[1.02]'
                : 'bg-gray-900 border border-gray-800 hover:border-glass-green/50'
            ]"
          >
            <span v-if="option.badge" class="absolute top-3 right-12 px-2 py-0.5 rounded-full text-xs font-bold"
              :class="option.badge === 'Popular' ? 'bg-gold-400 text-black' : 'bg-glass-green text-white'">
              {{ option.badge }}
            </span>
            <div class="flex items-center gap-4">
              <div 
                class="w-14 h-14 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br shadow-lg text-white"
                :class="option.color"
              >
                {{ option.icon }}
              </div>
              <div class="flex-1">
                <h3 class="font-bold text-white text-lg">{{ option.name }}</h3>
                <p class="text-gray-400 text-sm">{{ option.description }}</p>
              </div>
              <div class="text-right flex items-center gap-2">
                <p class="font-bold text-xl text-glass-green">{{ currency === 'USD' ? `$${option.priceUSD} USD` : `$${option.priceMXN} MXN` }}</p>
                <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </button>
        </div>

        <!-- Visual hint -->
        <p class="text-center text-xs text-gray-500 mt-4">
          {{ language === 'es' ? '👆 Toca una opción para continuar' : '👆 Tap an option to continue' }}
        </p>
      </div>

      <!-- STEP 3: Equipment Rental -->
      <div v-else-if="currentStep === 3" class="space-y-6">
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-white mb-2">
            {{ language === 'es' ? '¿Necesitas equipo?' : 'Need equipment?' }}
          </h1>
          <p class="text-gray-400">
            {{ language === 'es' ? 'Selecciona lo que necesites rentar' : 'Select what you need to rent' }}
          </p>
        </div>

        <!-- Equipment Grid -->
        <div class="grid grid-cols-3 gap-3">
          <button
            v-for="item in equipmentOptions"
            :key="item.id"
            @click="toggleEquipment(item.id)"
            class="relative rounded-2xl p-4 text-center transition-all duration-200 aspect-square flex flex-col items-center justify-center"
            :class="[
              selectedEquipment.includes(item.id)
                ? 'ring-4 ring-gold-400 bg-gold-400/10 scale-105'
                : 'bg-gray-900 border border-gray-800 hover:border-gold-400/50'
            ]"
          >
            <div class="text-4xl mb-2">{{ item.image }}</div>
            <p class="font-semibold text-white text-sm">{{ item.name }}</p>
            <p class="text-gold-400 font-bold text-sm">{{ currency === 'USD' ? `$${item.priceUSD} USD` : `$${item.priceMXN} MXN` }}</p>
            <div
              v-if="selectedEquipment.includes(item.id)"
              class="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gold-400 flex items-center justify-center"
            >
              <svg class="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </div>
          </button>
        </div>

        <!-- Equipment total -->
        <div v-if="selectedEquipment.length > 0" class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="flex justify-between items-center">
            <span class="text-gray-400">
              {{ language === 'es' ? 'Renta de equipo:' : 'Equipment rental:' }}
            </span>
            <span class="font-bold text-gold-400 text-lg">{{ currency === 'USD' ? `$${equipmentTotalUSD} USD` : `$${equipmentTotalMXN} MXN` }}</span>
          </div>
          <!-- Savings message when all 3 selected -->
          <div v-if="selectedEquipment.length === 3" class="mt-2 pt-2 border-t border-gray-800 flex items-center justify-between">
            <span class="text-glass-green text-sm flex items-center gap-1">
              <span>🎉</span>
              {{ language === 'es' ? '¡Descuento aplicado!' : 'Discount applied!' }}
            </span>
            <span class="text-glass-green font-bold text-sm">
              {{ language === 'es' ? 'Ahorraste' : 'You saved' }} {{ formatPrice(50) }}
            </span>
          </div>
        </div>

        <!-- No equipment button -->
        <button
          @click="selectedEquipment = []; nextStep()"
          class="w-full py-4 text-gray-500 hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          {{ language === 'es' ? 'No necesito equipo' : "I don't need equipment" }}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- STEP 4: Date & Session Selection -->
      <div v-else-if="currentStep === 4" class="space-y-6">
        <div class="text-center mb-6">
          <h1 class="text-2xl font-bold text-white mb-2">
            {{ language === 'es' ? 'Elige fecha y hora' : 'Choose date & time' }}
          </h1>
          <p class="text-gray-400">
            {{ language === 'es' ? 'Martes, Jueves y Sábados' : 'Tuesday, Thursday & Saturday' }}
          </p>
        </div>

        <!-- Class Counter for Packages -->
        <div v-if="isMultiDateSelection" class="bg-gradient-to-r from-glass-purple/20 to-glass-blue/20 rounded-2xl p-4 border border-glass-purple/30">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-white font-semibold">
                {{ language === 'es' ? 'Clases seleccionadas' : 'Classes selected' }}
              </p>
              <p class="text-xs text-gray-400">
                {{ language === 'es' 
                  ? `Selecciona ${maxClassesForPackage} fechas para tu paquete` 
                  : `Select ${maxClassesForPackage} dates for your package` 
                }}
              </p>
              <!-- Weekly limit rule for monthly programs -->
              <p v-if="isMonthlyProgram" class="text-xs text-gold-400 mt-1 flex items-center gap-1">
                <span>⚠️</span>
                {{ language === 'es' ? 'Máx. 2 clases por semana' : 'Max 2 classes per week' }}
              </p>
            </div>
            <div class="text-right">
              <p class="text-3xl font-bold">
                <span class="text-gold-400">{{ selectedDates.length }}</span>
                <span class="text-gray-500">/{{ maxClassesForPackage }}</span>
              </p>
              <p class="text-xs" :class="selectedDates.length === maxClassesForPackage ? 'text-glass-green' : 'text-gray-500'">
                {{ selectedDates.length === maxClassesForPackage 
                  ? (language === 'es' ? '✓ Completo' : '✓ Complete')
                  : (language === 'es' ? `Faltan ${maxClassesForPackage - selectedDates.length}` : `${maxClassesForPackage - selectedDates.length} remaining`)
                }}
              </p>
            </div>
          </div>
          
          <!-- Weekly limit warning -->
          <Transition
            enter-active-class="transition-all duration-300"
            enter-from-class="opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-200"
            leave-from-class="opacity-100"
            leave-to-class="opacity-0"
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
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <!-- Month navigation -->
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
              <button
                v-else
                @click="selectDate(day)"
                :disabled="!isDateBookable(day)"
                class="aspect-square rounded-xl flex flex-col items-center justify-center relative transition-all group"
                :class="[
                  // Multi-date selection styling
                  isMultiDateSelection && isDateSelected(day)
                    ? 'bg-gold-400 text-black shadow-lg ring-2 ring-gold-500'
                    // Single date selection styling
                    : !isMultiDateSelection && selectedDate && format(selectedDate, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')
                      ? 'bg-gold-400 text-black shadow-lg'
                      : isToday(day)
                        ? 'bg-glass-purple text-white'
                        // Beyond 30 days - grayed out with different style
                        : isClassDay(day) && isBeyond30Days(day)
                          ? 'bg-gray-800/30 text-gray-600 cursor-not-allowed'
                        // Week is full (for monthly programs) - show different style
                        : isMonthlyProgram && isDateBookable(day) && isWeekFull(day) && !isDateSelected(day)
                          ? 'bg-gray-800/50 text-gray-500 ring-1 ring-flame-600/30'
                        // Available class day
                        : isDateBookable(day)
                          ? 'bg-gray-800 hover:bg-gray-700 text-white'
                          : 'text-gray-600 cursor-not-allowed',
                ]"
              >
                <span class="text-sm font-medium">{{ format(day, 'd') }}</span>
                <!-- Selection number for multi-date -->
                <span 
                  v-if="isMultiDateSelection && isDateSelected(day)"
                  class="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black text-gold-400 text-[10px] font-bold flex items-center justify-center"
                >
                  {{ selectedDates.findIndex(d => format(d, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd')) + 1 }}
                </span>
                <!-- "Checking" indicator for dates beyond 30 days -->
                <span 
                  v-if="isClassDay(day) && isBeyond30Days(day)"
                  class="absolute -bottom-0.5 text-[8px] text-gray-500"
                >
                  ⏳
                </span>
                <!-- Week full indicator (for monthly programs) -->
                <span
                  v-else-if="isMonthlyProgram && isDateBookable(day) && isWeekFull(day) && !isDateSelected(day)"
                  class="absolute -bottom-0.5 text-[8px] text-flame-600"
                >
                  2/2
                </span>
                <!-- Coach indicator for bookable class days -->
                <div 
                  v-else-if="isDateBookable(day) && !isDateSelected(day)"
                  class="absolute -bottom-0.5 flex gap-0.5"
                >
                  <span class="w-1.5 h-1.5 rounded-full bg-flame-600"></span>
                  <span class="w-1.5 h-1.5 rounded-full bg-glass-blue"></span>
                  <span class="w-1.5 h-1.5 rounded-full bg-glass-green"></span>
                </div>
              </button>
            </template>
          </div>

          <!-- 30-day booking limit note -->
          <div class="mt-3 pt-3 border-t border-gray-800 flex items-center justify-center gap-2 text-xs text-gray-500">
            <span>⏳</span>
            <span>
              {{ language === 'es' 
                ? 'Fechas después de 30 días: verificando disponibilidad' 
                : 'Dates beyond 30 days: checking availability' 
              }}
            </span>
          </div>
        </div>

        <!-- Selected Dates List (for packages) -->
        <div v-if="isMultiDateSelection && selectedDates.length > 0" class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p class="text-sm text-gray-400 mb-3">{{ language === 'es' ? 'Tus clases:' : 'Your classes:' }}</p>
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

        <!-- Selected Date & Session (for single class) -->
        <Transition
          enter-active-class="transition-all duration-300"
          enter-from-class="opacity-0 translate-y-4"
          enter-to-class="opacity-100 translate-y-0"
        >
          <div v-if="!isMultiDateSelection && selectedDate" class="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-4">
            <div class="text-center">
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Fecha seleccionada' : 'Selected date' }}</p>
              <p class="font-bold text-white text-lg capitalize">{{ formattedSelectedDate }}</p>
            </div>

            <!-- Available coaches for this date -->
            <div>
              <p class="text-xs text-gray-400 text-center mb-2">
                {{ language === 'es' ? 'Coaches disponibles:' : 'Available coaches:' }}
              </p>
              <div class="flex justify-center gap-3">
                <!-- Coach Rod -->
                <div class="text-center">
                  <div class="w-12 h-12 rounded-full bg-gradient-to-br from-flame-600 to-glass-orange flex items-center justify-center ring-2 ring-gold-400 mx-auto">
                    <span class="text-xl">🧑‍🏫</span>
                  </div>
                  <p class="text-xs text-white mt-1">Rod</p>
                  <p class="text-[10px] text-gray-500">Vert/Street</p>
                </div>
                <!-- Coach Leo -->
                <div class="text-center">
                  <div class="w-12 h-12 rounded-full bg-gradient-to-br from-glass-blue to-glass-purple flex items-center justify-center ring-2 ring-gold-400 mx-auto">
                    <span class="text-xl">👨‍🏫</span>
                  </div>
                  <p class="text-xs text-white mt-1">Leo</p>
                  <p class="text-[10px] text-gray-500">Vert/Street</p>
                </div>
                <!-- Coach Itza -->
                <div class="text-center">
                  <div class="w-12 h-12 rounded-full bg-gradient-to-br from-glass-green to-glass-blue flex items-center justify-center ring-2 ring-gold-400 mx-auto">
                    <span class="text-xl">👩‍🏫</span>
                  </div>
                  <p class="text-xs text-white mt-1">Itza</p>
                  <p class="text-[10px] text-gray-500">Street</p>
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- Session selection (shown when dates are selected) -->
        <div v-if="(isMultiDateSelection && selectedDates.length > 0) || (!isMultiDateSelection && selectedDate)" class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <div class="space-y-2">
            <p class="text-sm text-gray-400 text-center">
              {{ language === 'es' ? 'Selecciona horario:' : 'Select session:' }}
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

        <!-- Ask for availability (for individual classes) -->
        <div v-if="selectedClass === 'individual'" class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-glass-purple/20 flex items-center justify-center text-2xl">
              📅
            </div>
            <div class="flex-1">
              <p class="font-semibold text-white">
                {{ language === 'es' ? '¿Fecha no disponible?' : 'Date not available?' }}
              </p>
              <p class="text-sm text-gray-400">
                {{ language === 'es' ? 'Pregunta a los coaches por disponibilidad' : 'Ask coaches for availability' }}
              </p>
            </div>
            <a 
              href="https://wa.me/+521234567890?text=Hola,%20quiero%20consultar%20disponibilidad%20para%20una%20clase%20individual"
              target="_blank"
              class="px-4 py-2 rounded-xl bg-glass-green text-white text-sm font-medium"
            >
              {{ language === 'es' ? 'Contactar' : 'Contact' }}
            </a>
          </div>
        </div>
      </div>

      <!-- STEP 5: Confirmation -->
      <div v-else-if="currentStep === 5" class="space-y-6">
        <!-- Booking Confirmed State -->
        <div v-if="bookingConfirmed" class="text-center py-8">
          <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg class="w-10 h-10 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-white mb-2">
            {{ language === 'es' ? '¡Clase Reservada!' : 'Class Booked!' }}
          </h1>
          <p class="text-gray-400 mb-6">
            {{ skipEmail
              ? (language === 'es' 
                  ? 'Te enviamos los detalles por SMS' 
                  : 'We sent the details via SMS')
              : (language === 'es' 
                  ? 'Te enviamos los detalles a tu correo' 
                  : 'We sent the details to your email')
            }}
          </p>
          
          <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-left mb-6">
            <div class="space-y-3">
              <div class="flex justify-between">
                <span class="text-gray-400">{{ language === 'es' ? 'Clase' : 'Class' }}</span>
                <span class="font-semibold text-white">{{ selectedClassDetails?.name || '-' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">{{ language === 'es' ? 'Fecha' : 'Date' }}</span>
                <span class="font-semibold text-white capitalize">{{ formattedSelectedDate || '-' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">{{ language === 'es' ? 'Hora' : 'Time' }}</span>
                <span class="font-semibold text-white">
                  {{ selectedSession === 'early' ? '5:30 PM - 7:00 PM' : selectedSession === 'late' ? '7:00 PM - 8:30 PM' : '-' }}
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">{{ language === 'es' ? 'Pago' : 'Payment' }}</span>
                <span class="font-semibold text-white">
                  {{ paymentMethod === 'cash' 
                    ? (language === 'es' ? 'Efectivo' : 'Cash')
                    : paymentMethod === 'online'
                      ? (language === 'es' ? 'En línea' : 'Online')
                      : '-'
                  }}
                </span>
              </div>
              <div class="border-t border-gray-700 pt-3 flex justify-between">
                <span class="font-bold text-white">Total</span>
                <span class="font-bold text-gold-400 text-xl">{{ formattedDisplayTotal }}</span>
              </div>
            </div>
          </div>

          <!-- Guest User Registration Prompt -->
          <div v-if="!user" class="bg-gradient-to-br from-glass-purple/20 to-glass-blue/20 border border-glass-purple/30 rounded-2xl p-5 mb-4">
            <div class="flex items-start gap-3">
              <div class="w-10 h-10 rounded-full bg-glass-purple flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div class="flex-1">
                <h4 class="font-bold text-white mb-1">
                  {{ language === 'es' ? '¡Crea tu cuenta!' : 'Create your account!' }}
                </h4>
                <p class="text-sm text-gray-400 mb-3">
                  {{ language === 'es' 
                    ? 'Registra tu cuenta para ver tu historial de clases, seguir tu progreso y reservar más fácil.'
                    : 'Register to see your class history, track your progress, and book easier.'
                  }}
                </p>
                <NuxtLink 
                  to="/auth/register" 
                  class="inline-flex items-center gap-2 px-4 py-2 bg-glass-purple text-white font-semibold rounded-lg hover:bg-glass-purple/80 transition-all"
                >
                  {{ language === 'es' ? 'Registrarme' : 'Register' }}
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </NuxtLink>
              </div>
            </div>
          </div>

          <NuxtLink to="/" class="btn bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold w-full py-4 rounded-xl">
            {{ language === 'es' ? 'Volver al Inicio' : 'Back to Home' }}
          </NuxtLink>
        </div>

        <!-- Confirmation Form -->
        <template v-else>
          <div class="text-center mb-6">
            <h1 class="text-2xl font-bold text-white mb-2">
              {{ language === 'es' ? 'Confirmar Reserva' : 'Confirm Booking' }}
            </h1>
            <p class="text-gray-400">
              {{ language === 'es' ? 'Revisa los detalles y completa tu reserva' : 'Review details and complete your booking' }}
            </p>
          </div>

          <!-- Summary with Checklist -->
          <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h3 class="font-bold text-white mb-4">
              {{ language === 'es' ? 'Resumen' : 'Summary' }}
            </h3>
            <div class="space-y-3">
              <!-- Class Type -->
              <div class="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl">
                <div class="w-8 h-8 rounded-full bg-glass-green flex items-center justify-center">
                  <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="flex-1">
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Clase' : 'Class' }}</p>
                  <p class="font-semibold text-white">{{ selectedClassDetails?.name || '-' }}</p>
                </div>
                <span class="text-gold-400 font-semibold">{{ currency === 'USD' ? `$${selectedClassDetails?.priceUSD || 0} USD` : `$${selectedClassDetails?.priceMXN || 0} MXN` }}</span>
              </div>

              <!-- Equipment -->
              <div class="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl">
                <div class="w-8 h-8 rounded-full flex items-center justify-center"
                     :class="equipmentTotal > 0 ? 'bg-glass-green' : 'bg-gray-700'">
                  <svg v-if="equipmentTotal > 0" class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  <span v-else class="text-gray-500 text-sm">—</span>
                </div>
                <div class="flex-1">
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Equipo' : 'Equipment' }}</p>
                  <p class="font-semibold text-white">
                    {{ equipmentTotal > 0 
                      ? (language === 'es' ? 'Renta de equipo' : 'Equipment rental')
                      : (language === 'es' ? 'Sin equipo' : 'No equipment') 
                    }}
                  </p>
                </div>
                <span v-if="equipmentTotal > 0" class="text-gold-400 font-semibold">{{ currency === 'USD' ? `$${equipmentTotalUSD} USD` : `$${equipmentTotalMXN} MXN` }}</span>
                <span v-else class="text-gray-500 font-semibold">$0</span>
              </div>

              <!-- Date -->
              <div class="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl">
                <div class="w-8 h-8 rounded-full bg-glass-blue flex items-center justify-center">
                  <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="flex-1">
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Fecha' : 'Date' }}</p>
                  <p class="font-semibold text-white capitalize">{{ formattedSelectedDate || '-' }}</p>
                </div>
              </div>

              <!-- Time -->
              <div class="flex items-center gap-3 p-3 bg-gray-800/50 rounded-xl">
                <div class="w-8 h-8 rounded-full bg-glass-purple flex items-center justify-center">
                  <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="flex-1">
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Horario' : 'Time' }}</p>
                  <p class="font-semibold text-white">
                    {{ selectedSession === 'early' ? '5:30 PM - 7:00 PM' : selectedSession === 'late' ? '7:00 PM - 8:30 PM' : '-' }}
                  </p>
                </div>
              </div>

              <!-- Total -->
              <div class="border-t border-gray-700 pt-4 mt-4 flex justify-between items-center">
                <span class="font-bold text-white text-lg">Total</span>
                <span class="font-bold text-gold-400 text-2xl">{{ formattedDisplayTotal }}</span>
              </div>
            </div>
          </div>

          <!-- Contact Info -->
          <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <!-- Email Input (when not skipped) -->
            <div v-if="!skipEmail">
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Tu correo electrónico' : 'Your email address' }}
              </label>
              <input
                v-model="customerEmail"
                type="email"
                :placeholder="language === 'es' ? 'ejemplo@correo.com' : 'example@email.com'"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none"
              />
              <p class="text-xs text-gray-500 mt-2">
                {{ language === 'es' 
                  ? 'Recibirás confirmación e invitación de calendario' 
                  : "You'll receive confirmation & calendar invite" }}
              </p>
            </div>

            <!-- Phone Input (when email is skipped) -->
            <div v-else>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Tu número de teléfono' : 'Your phone number' }}
                <span class="text-flame-600">*</span>
              </label>
              <div class="flex gap-2">
                <!-- Country Code Dropdown -->
                <div class="relative">
                  <select
                    v-model="selectedCountryCode"
                    class="appearance-none w-28 h-12 pl-3 pr-8 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none cursor-pointer"
                  >
                    <option 
                      v-for="country in countryCodes" 
                      :key="country.short" 
                      :value="country.code"
                    >
                      {{ country.flag }} {{ country.code }}
                    </option>
                  </select>
                  <!-- Dropdown arrow -->
                  <div class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
                <!-- Phone Number Input -->
                <input
                  v-model="customerPhone"
                  type="tel"
                  :placeholder="language === 'es' ? '33 1234 5678' : '555 123 4567'"
                  class="flex-1 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none"
                />
              </div>
              <p class="text-xs text-gray-500 mt-2">
                {{ language === 'es' 
                  ? 'Selecciona tu país e ingresa tu número local' 
                  : 'Select your country and enter your local number' }}
              </p>
            </div>

            <!-- SMS Preference Checkbox -->
            <label class="flex items-center gap-3 mt-4 cursor-pointer">
              <div 
                @click="skipEmail = !skipEmail"
                class="w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all"
                :class="skipEmail ? 'bg-gold-400 border-gold-400' : 'border-gray-600 bg-gray-800'"
              >
                <svg v-if="skipEmail" class="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </div>
              <div class="flex-1">
                <span class="text-sm text-white">
                  {{ language === 'es' ? 'Prefiero recibir confirmación por SMS' : 'I prefer to receive confirmation via SMS' }}
                </span>
                <p class="text-xs text-gray-500">
                  {{ language === 'es' ? 'Ingresa tu número de teléfono' : 'Enter your phone number' }}
                </p>
              </div>
              <span class="text-lg">📱</span>
            </label>
          </div>

          <!-- Payment Method -->
          <div class="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <h3 class="font-bold text-white mb-4">
              {{ language === 'es' ? 'Método de Pago' : 'Payment Method' }}
            </h3>
            <div class="space-y-3">
              <!-- Cash Payment -->
              <button
                @click="paymentMethod = 'cash'"
                class="w-full p-4 rounded-xl border-2 transition-all flex items-center gap-4"
                :class="paymentMethod === 'cash' ? 'border-gold-400 bg-gold-400/10' : 'border-gray-700 bg-gray-800'"
              >
                <div class="w-12 h-12 rounded-xl bg-glass-green/20 flex items-center justify-center text-2xl">
                  💵
                </div>
                <div class="flex-1 text-left">
                  <p class="font-semibold text-white">
                    {{ language === 'es' ? 'Efectivo' : 'Cash' }}
                  </p>
                  <p class="text-sm text-gray-400">
                    {{ language === 'es' ? 'Paga el día de tu clase' : 'Pay on the day of your class' }}
                  </p>
                </div>
                <div
                  class="w-6 h-6 rounded-full border-2 flex items-center justify-center"
                  :class="paymentMethod === 'cash' ? 'border-gold-400 bg-gold-400' : 'border-gray-600'"
                >
                  <svg v-if="paymentMethod === 'cash'" class="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                </div>
              </button>

              <!-- Online Payment (Disabled) -->
              <div
                class="w-full p-4 rounded-xl border-2 border-gray-800 bg-gray-800/50 flex items-center gap-4 opacity-50 cursor-not-allowed"
              >
                <div class="w-12 h-12 rounded-xl bg-gray-700/50 flex items-center justify-center text-2xl grayscale">
                  💳
                </div>
                <div class="flex-1 text-left">
                  <p class="font-semibold text-gray-500">
                    {{ language === 'es' ? 'Pago en Línea' : 'Pay Online' }}
                  </p>
                  <p class="text-sm text-gray-600">
                    {{ language === 'es' ? 'Próximamente' : 'Coming soon' }}
                  </p>
                </div>
                <div class="w-6 h-6 rounded-full border-2 border-gray-700 flex items-center justify-center">
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Bottom Action Button - Hidden for steps 1 & 2 (auto-advance) -->
    <div 
      v-if="!bookingConfirmed && currentStep > 2"
      class="fixed bottom-0 left-0 right-0 p-4 bg-gray-900 border-t border-gray-800 pb-safe"
    >
      <div class="max-w-lg mx-auto">
        <button
          v-if="currentStep < 5"
          @click="nextStep"
          :disabled="!canProceed"
          class="btn w-full py-4 text-lg font-bold transition-all rounded-xl"
          :class="canProceed ? 'bg-gradient-to-r from-gold-400 to-gold-500 text-black' : 'bg-gray-800 text-gray-500 cursor-not-allowed'"
        >
          {{ language === 'es' ? 'Continuar' : 'Continue' }}
        </button>
        <button
          v-else
          @click="submitBooking"
          :disabled="!canProceed || isSubmitting"
          class="btn w-full py-4 text-lg font-bold transition-all rounded-xl"
          :class="canProceed && !isSubmitting ? 'bg-gradient-to-r from-gold-400 to-gold-500 text-black' : 'bg-gray-800 text-gray-500 cursor-not-allowed'"
        >
          <span v-if="isSubmitting" class="flex items-center justify-center gap-2">
            <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ language === 'es' ? 'Reservando...' : 'Booking...' }}
          </span>
          <span v-else>
            {{ language === 'es' ? 'Confirmar Reserva' : 'Confirm Booking' }} • {{ formattedDisplayTotal }}
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
