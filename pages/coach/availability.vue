<script setup lang="ts">
import { format, addMonths, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import type { DayOfWeek, TimeSlot } from '~/types'
import { DAY_LABELS, TIME_SLOT_LABELS } from '~/types'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()
const {
  availability,
  loading,
  classDays,
  timeSlots,
  fetchMonthlyAvailability,
  setBulkAvailability,
  isAvailableFor,
} = useCoachAvailability()

// Check if user is a coach
const isCoach = ref(false)
const checkingRole = ref(true)
const coachName = ref('')

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/coach/availability')
    return
  }

  // Check user role
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

  // Load current month availability
  await loadAvailability()
})

// Current month state
const currentDate = ref(new Date())
const currentMonth = computed(() => currentDate.value.getMonth() + 1)
const currentYear = computed(() => currentDate.value.getFullYear())
const monthLabel = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  return format(currentDate.value, 'MMMM yyyy', { locale })
})

// Availability grid state
const availabilityGrid = ref<Record<string, boolean>>({})
const saving = ref(false)
const hasChanges = ref(false)
const saveSuccess = ref(false)

// Load availability for current month
const loadAvailability = async () => {
  if (!user.value) return

  await fetchMonthlyAvailability(user.value.id, currentYear.value, currentMonth.value)

  // Initialize grid from fetched data
  const grid: Record<string, boolean> = {}
  for (const day of classDays) {
    for (const slot of timeSlots) {
      const key = `${day}-${slot}`
      grid[key] = isAvailableFor(day, slot)
    }
  }
  availabilityGrid.value = grid
  hasChanges.value = false
}

// Navigation
const goToPrevMonth = async () => {
  currentDate.value = subMonths(currentDate.value, 1)
  await loadAvailability()
}

const goToNextMonth = async () => {
  currentDate.value = addMonths(currentDate.value, 1)
  await loadAvailability()
}

// Toggle availability
const toggleSlot = (day: DayOfWeek, slot: TimeSlot) => {
  const key = `${day}-${slot}`
  availabilityGrid.value[key] = !availabilityGrid.value[key]
  hasChanges.value = true
  saveSuccess.value = false
}

// Save availability
const saveAvailability = async () => {
  if (!user.value) return

  saving.value = true
  try {
    const result = await setBulkAvailability(
      user.value.id,
      currentYear.value,
      currentMonth.value,
      availabilityGrid.value
    )

    if (result.success) {
      hasChanges.value = false
      saveSuccess.value = true
      setTimeout(() => saveSuccess.value = false, 3000)
    } else {
      alert('Failed to save availability: ' + result.error)
    }
  } finally {
    saving.value = false
  }
}

// Select all / clear all
const selectAll = () => {
  for (const day of classDays) {
    for (const slot of timeSlots) {
      availabilityGrid.value[`${day}-${slot}`] = true
    }
  }
  hasChanges.value = true
}

const clearAll = () => {
  for (const day of classDays) {
    for (const slot of timeSlots) {
      availabilityGrid.value[`${day}-${slot}`] = false
    }
  }
  hasChanges.value = true
}

// Get availability for display
const getSlotAvailability = (day: DayOfWeek, slot: TimeSlot) => {
  return availabilityGrid.value[`${day}-${slot}`] ?? false
}

// Day labels in Spanish
const dayLabelsEs: Record<DayOfWeek, string> = {
  tuesday: 'Mar',
  thursday: 'Jue',
  saturday: 'Sáb',
}
</script>

<template>
  <div class="min-h-screen bg-black">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-lg mx-auto">
        <div class="flex items-center gap-4 mb-4">
          <button @click="router.push('/')" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl font-bold text-white">
              {{ language === 'es' ? 'Mi Disponibilidad' : 'My Availability' }}
            </h1>
            <p class="text-sm text-gray-400">{{ coachName }}</p>
          </div>
        </div>

        <!-- Month Navigation -->
        <div class="flex items-center justify-between bg-gray-800 rounded-xl p-2">
          <button @click="goToPrevMonth" class="p-2 rounded-lg hover:bg-gray-700 text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 class="text-lg font-semibold text-white capitalize">{{ monthLabel }}</h2>
          <button @click="goToNextMonth" class="p-2 rounded-lg hover:bg-gray-700 text-white">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="checkingRole || loading" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-gray-400">{{ language === 'es' ? 'Cargando...' : 'Loading...' }}</p>
      </div>
    </div>

    <!-- Content -->
    <div v-else-if="isCoach" class="px-4 py-6 max-w-lg mx-auto">
      <!-- Instructions -->
      <div class="bg-gradient-to-r from-glass-purple/20 to-glass-blue/20 rounded-2xl p-4 mb-6 border border-glass-purple/30">
        <p class="text-sm text-gray-300">
          <strong class="text-white">
            {{ language === 'es' ? 'Configura tu disponibilidad' : 'Set your availability' }}
          </strong> 
          {{ language === 'es' 
            ? `para ${monthLabel}. Toca un horario para activar/desactivar. Los estudiantes solo podrán reservar en tus horarios disponibles.`
            : `for ${monthLabel}. Tap a slot to toggle. Students can only book during your available times.`
          }}
        </p>
      </div>

      <!-- Quick Actions -->
      <div class="flex gap-2 mb-6">
        <button 
          @click="selectAll" 
          class="flex-1 py-3 px-4 rounded-xl border border-glass-green bg-glass-green/20 text-white text-sm font-medium"
        >
          {{ language === 'es' ? 'Seleccionar Todo' : 'Select All' }}
        </button>
        <button 
          @click="clearAll" 
          class="flex-1 py-3 px-4 rounded-xl border border-flame-600 bg-flame-600/20 text-white text-sm font-medium"
        >
          {{ language === 'es' ? 'Limpiar Todo' : 'Clear All' }}
        </button>
      </div>

      <!-- Availability Grid -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <!-- Header Row -->
        <div class="grid grid-cols-4 bg-gray-800 border-b border-gray-700">
          <div class="p-3 font-medium text-gray-500 text-sm"></div>
          <div 
            v-for="day in classDays" 
            :key="day"
            class="p-3 text-center font-semibold text-gold-400 text-sm"
          >
            {{ language === 'es' ? dayLabelsEs[day] : DAY_LABELS[day] }}
          </div>
        </div>

        <!-- Time Slot Rows -->
        <div
          v-for="slot in timeSlots"
          :key="slot"
          class="grid grid-cols-4 border-b border-gray-800 last:border-b-0"
        >
          <!-- Time Label -->
          <div class="p-3 flex flex-col justify-center">
            <span class="text-sm font-medium text-white">
              {{ slot === 'early' ? (language === 'es' ? 'Sesión 1' : 'Session 1') : (language === 'es' ? 'Sesión 2' : 'Session 2') }}
            </span>
            <span class="text-xs text-gray-500">
              {{ TIME_SLOT_LABELS[slot].display }}
            </span>
          </div>

          <!-- Day Toggles -->
          <div
            v-for="day in classDays"
            :key="`${day}-${slot}`"
            class="p-3 flex items-center justify-center"
          >
            <button
              @click="toggleSlot(day, slot)"
              class="w-14 h-14 rounded-xl transition-all flex items-center justify-center"
              :class="[
                getSlotAvailability(day, slot)
                  ? 'bg-glass-green text-white shadow-lg shadow-glass-green/30'
                  : 'bg-gray-800 text-gray-600 border border-gray-700'
              ]"
            >
              <svg v-if="getSlotAvailability(day, slot)" class="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
              <svg v-else class="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Legend -->
      <div class="flex items-center justify-center gap-6 mt-4 text-sm text-gray-400">
        <span class="flex items-center gap-2">
          <span class="w-4 h-4 rounded bg-glass-green"></span>
          {{ language === 'es' ? 'Disponible' : 'Available' }}
        </span>
        <span class="flex items-center gap-2">
          <span class="w-4 h-4 rounded bg-gray-800 border border-gray-700"></span>
          {{ language === 'es' ? 'No disponible' : 'Unavailable' }}
        </span>
      </div>

      <!-- Success Message -->
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
            ✓ {{ language === 'es' ? 'Disponibilidad guardada' : 'Availability saved' }}
          </p>
        </div>
      </Transition>

      <!-- Save Button -->
      <div class="mt-6">
        <button
          @click="saveAvailability"
          :disabled="!hasChanges || saving"
          class="w-full py-4 rounded-xl font-bold transition-all"
          :class="[
            hasChanges 
              ? 'bg-gradient-to-r from-gold-400 to-gold-500 text-black' 
              : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          ]"
        >
          {{ saving 
            ? (language === 'es' ? 'Guardando...' : 'Saving...') 
            : hasChanges 
              ? (language === 'es' ? 'Guardar Disponibilidad' : 'Save Availability')
              : (language === 'es' ? 'Sin cambios' : 'No Changes')
          }}
        </button>
      </div>

      <!-- Note -->
      <p class="text-xs text-gray-500 text-center mt-4">
        {{ language === 'es' 
          ? `Los cambios aplican solo para ${monthLabel}. Configura cada mes por separado.`
          : `Changes apply to ${monthLabel} only. Set availability for each month separately.`
        }}
      </p>
    </div>
  </div>
</template>
