<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const client = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const { t, formatPrice, language } = useI18n()
const { bookings, loading: bookingsLoading, fetchUserBookings, cancelBooking, getUpcomingBookings, getPastBookings } = useBookings()

// Credit-based reservations
const creditReservations = ref<any[]>([])
const loadingReservations = ref(false)

// Redirect if not logged in
watch(user, (newUser) => {
  if (!newUser) {
    router.push('/auth/login?redirect=/bookings')
  }
}, { immediate: true })

const activeTab = ref<'upcoming' | 'past'>('upcoming')
const cancellingId = ref<string | null>(null)
const showCancelModal = ref(false)
const selectedBookingId = ref<string | null>(null)
const cancellationReason = ref('')

// Fetch credit-based reservations
const fetchCreditReservations = async () => {
  if (!user.value) return
  loadingReservations.value = true
  try {
    console.log('Fetching credit reservations for user:', user.value.id)
    const { data, error } = await client
      .from('class_reservations')
      .select('*')
      .eq('user_id', user.value.id)
      .eq('status', 'active')
      .order('reservation_date', { ascending: true })
    
    console.log('Credit reservations:', data, 'Error:', error)
    creditReservations.value = data || []
  } catch (e) {
    console.error('Error fetching credit reservations:', e)
  } finally {
    loadingReservations.value = false
  }
}

// Combined loading state
const loading = computed(() => bookingsLoading.value || loadingReservations.value)

// Upcoming credit reservations
const upcomingCreditReservations = computed(() => {
  const today = format(new Date(), 'yyyy-MM-dd')
  return creditReservations.value.filter(r => r.reservation_date >= today)
})

// Past credit reservations
const pastCreditReservations = computed(() => {
  const today = format(new Date(), 'yyyy-MM-dd')
  return creditReservations.value.filter(r => r.reservation_date < today)
})

onMounted(() => {
  if (user.value) {
    fetchUserBookings()
    fetchCreditReservations()
  }
})

const handleCancelBooking = async () => {
  if (!selectedBookingId.value) return
  
  cancellingId.value = selectedBookingId.value
  const result = await cancelBooking(selectedBookingId.value, cancellationReason.value)
  
  if (result.success) {
    showCancelModal.value = false
    cancellationReason.value = ''
    selectedBookingId.value = null
    await fetchUserBookings()
  }
  
  cancellingId.value = null
}

const openCancelModal = (bookingId: string) => {
  selectedBookingId.value = bookingId
  showCancelModal.value = true
}

const formatDate = (date: string) => {
  const locale = language.value === 'es' ? es : undefined
  return format(new Date(date), 'EEE, d MMM yyyy', { locale })
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  confirmed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  completed: 'bg-blue-100 text-blue-800',
  no_show: 'bg-gray-100 text-gray-800',
}

const getStatusLabel = (status: string) => {
  return t(`status.${status}`)
}

const getClassTypeColor = (classType: string) => {
  const colors: Record<string, string> = {
    grouped_beginner: 'bg-green-500',
    grouped_intermediate: 'bg-yellow-500',
    individual: 'bg-purple-500',
  }
  return colors[classType] || 'bg-gray-400'
}
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <header class="bg-white border-b border-gray-100 sticky top-0 z-40 pt-safe">
      <div class="px-4 py-4 max-w-lg mx-auto">
        <h1 class="text-2xl font-bold text-gray-900 mb-4">{{ t('bookings.title') }}</h1>

        <!-- Tabs -->
        <div class="flex bg-gray-100 rounded-xl p-1">
          <button
            @click="activeTab = 'upcoming'"
            class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all"
            :class="[
              activeTab === 'upcoming'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500'
            ]"
          >
            {{ t('bookings.upcoming') }}
          </button>
          <button
            @click="activeTab = 'past'"
            class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all"
            :class="[
              activeTab === 'past'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500'
            ]"
          >
            {{ t('bookings.past') }}
          </button>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div class="px-4 py-6 max-w-lg mx-auto">
      <!-- Loading State -->
      <div v-if="loading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="card p-4 animate-pulse">
          <div class="flex gap-4">
            <div class="w-16 h-16 bg-gray-200 rounded-xl"></div>
            <div class="flex-1 space-y-2">
              <div class="h-4 bg-gray-200 rounded w-3/4"></div>
              <div class="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Upcoming Bookings -->
      <template v-else-if="activeTab === 'upcoming'">
        <div v-if="getUpcomingBookings.length === 0 && upcomingCreditReservations.length === 0" class="text-center py-12">
          <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center text-4xl">
            🛹
          </div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ t('bookings.noUpcoming') }}</h3>
          <p class="text-gray-500 mb-4">
            {{ t('bookings.bookToStart') }}
          </p>
          <NuxtLink to="/schedule" class="btn bg-yellow-400 text-gray-900 font-bold">
            {{ t('bookings.bookClass') }}
          </NuxtLink>
        </div>

        <div v-else class="space-y-4">
          <!-- Credit-based Reservations -->
          <div
            v-for="res in upcomingCreditReservations"
            :key="'credit-' + res.id"
            class="card p-4"
          >
            <div class="flex gap-4">
              <div class="w-16 h-16 rounded-xl flex items-center justify-center text-2xl bg-green-500">
                🛹
              </div>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="font-semibold text-gray-900 truncate">
                    {{ language === 'es' ? 'Clase Grupal' : 'Group Class' }}
                  </h3>
                  <span class="badge text-xs bg-green-100 text-green-800">
                    {{ language === 'es' ? 'Confirmada' : 'Confirmed' }}
                  </span>
                </div>
                
                <p class="text-sm text-gray-600 mt-1 capitalize">
                  {{ formatDate(res.reservation_date) }}
                </p>
                <p class="text-sm text-gray-500">
                  {{ res.time_slot === 'early' ? '5:30 PM - 7:00 PM' : '7:00 PM - 8:30 PM' }}
                </p>
                
                <p v-if="res.notes" class="text-xs text-gray-400 mt-1">
                  {{ res.notes }}
                </p>
              </div>
            </div>
          </div>

          <!-- Regular Bookings -->
          <div
            v-for="booking in getUpcomingBookings"
            :key="booking.id"
            class="card p-4"
          >
            <div class="flex gap-4">
              <div 
                class="w-16 h-16 rounded-xl flex items-center justify-center text-2xl"
                :class="getClassTypeColor(booking.schedule?.skate_class?.class_type || 'grouped_beginner')"
              >
                🛹
              </div>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="font-semibold text-gray-900 truncate">
                    {{ booking.schedule?.skate_class?.name }}
                  </h3>
                  <span :class="['badge text-xs', statusColors[booking.status]]">
                    {{ getStatusLabel(booking.status) }}
                  </span>
                </div>
                
                <p class="text-sm text-gray-600 mt-1 capitalize">
                  {{ formatDate(booking.schedule?.date || '') }}
                </p>
                <p class="text-sm text-gray-500">
                  {{ booking.schedule?.time_slot === 'early' ? '5:30 PM - 7:00 PM' : '7:00 PM - 8:30 PM' }}
                </p>
                
                <p v-if="booking.schedule?.coach" class="text-xs text-gray-400 mt-1">
                  {{ t('bookings.coach') }}: {{ booking.schedule.coach.full_name }}
                </p>

                <div class="flex items-center gap-2 mt-3">
                  <NuxtLink
                    to="/schedule"
                    class="text-sm text-yellow-600 font-medium"
                  >
                    {{ t('bookings.viewSchedule') }}
                  </NuxtLink>
                  <span class="text-gray-300">•</span>
                  <button
                    @click="openCancelModal(booking.id)"
                    class="text-sm text-red-500 font-medium"
                  >
                    {{ t('bookings.cancel') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Past Bookings -->
      <template v-else>
        <div v-if="getPastBookings.length === 0 && pastCreditReservations.length === 0" class="text-center py-12">
          <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center text-4xl">
            📋
          </div>
          <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ t('bookings.noPast') }}</h3>
          <p class="text-gray-500">
            {{ t('bookings.historyHere') }}
          </p>
        </div>

        <div v-else class="space-y-4">
          <!-- Past Credit Reservations -->
          <div
            v-for="res in pastCreditReservations"
            :key="'credit-past-' + res.id"
            class="card p-4 opacity-75"
          >
            <div class="flex gap-4">
              <div class="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-2xl">
                🛹
              </div>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="font-semibold text-gray-900 truncate">
                    {{ language === 'es' ? 'Clase Grupal' : 'Group Class' }}
                  </h3>
                  <span class="badge text-xs bg-blue-100 text-blue-800">
                    {{ language === 'es' ? 'Completada' : 'Completed' }}
                  </span>
                </div>
                
                <p class="text-sm text-gray-500 mt-1 capitalize">
                  {{ formatDate(res.reservation_date) }}
                </p>
                <p class="text-sm text-gray-400">
                  {{ res.time_slot === 'early' ? '5:30 PM - 7:00 PM' : '7:00 PM - 8:30 PM' }}
                </p>
              </div>
            </div>
          </div>

          <!-- Past Regular Bookings -->
          <div
            v-for="booking in getPastBookings"
            :key="booking.id"
            class="card p-4 opacity-75"
          >
            <div class="flex gap-4">
              <div class="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-2xl">
                🛹
              </div>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <h3 class="font-semibold text-gray-900 truncate">
                    {{ booking.schedule?.skate_class?.name }}
                  </h3>
                  <span :class="['badge text-xs', statusColors[booking.status]]">
                    {{ getStatusLabel(booking.status) }}
                  </span>
                </div>
                
                <p class="text-sm text-gray-500 mt-1 capitalize">
                  {{ formatDate(booking.schedule?.date || '') }}
                </p>
                
                <p v-if="booking.cancellation_reason" class="text-xs text-red-500 mt-1">
                  {{ language === 'es' ? 'Cancelado:' : 'Cancelled:' }} {{ booking.cancellation_reason }}
                </p>

                <NuxtLink
                  to="/schedule"
                  class="text-sm text-yellow-600 font-medium mt-2 inline-block"
                >
                  {{ t('bookings.bookAgain') }}
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Cancel Modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-all duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-all duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="showCancelModal"
          class="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          @click.self="showCancelModal = false"
        >
          <div class="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-safe">
            <div class="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6"></div>
            
            <h3 class="text-xl font-bold text-gray-900 mb-2">{{ t('bookings.cancelBooking') }}</h3>
            <p class="text-gray-500 mb-4">
              {{ t('bookings.cancelConfirm') }}
            </p>
            
            <div class="mb-6">
              <label class="label">{{ t('bookings.reason') }}</label>
              <textarea
                v-model="cancellationReason"
                class="input"
                rows="2"
                :placeholder="t('bookings.reasonPlaceholder')"
              ></textarea>
            </div>
            
            <div class="flex gap-3">
              <button
                @click="showCancelModal = false"
                class="btn-ghost flex-1 py-3"
              >
                {{ t('bookings.keepBooking') }}
              </button>
              <button
                @click="handleCancelBooking"
                :disabled="cancellingId !== null"
                class="btn flex-1 py-3 bg-red-600 text-white hover:bg-red-700"
              >
                {{ cancellingId ? t('bookings.cancelling') : t('bookings.cancelBooking') }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
