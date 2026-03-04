<script setup lang="ts">
import { format, startOfMonth, endOfMonth, startOfWeek, addDays, isToday, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

// Get user's first name from their profile
const profile = ref<any>(null)
const userFirstName = computed(() => {
  const fullName = profile.value?.full_name || ''
  return fullName.split(' ')[0] || 'Coach'
})

// State
const loading = ref(true)
const pendingRegistrations = ref<any[]>([])
const todayReservations = ref<any[]>([])
const weekReservations = ref<any[]>([])
const selectedWeekDate = ref<Date | null>(null)
const selectedTimeSlot = ref<'early' | 'late'>('early')
const stats = ref({
  total_students: 0,
  classes_today: 0,
  classes_this_week: 0,
  pending_approvals: 0
})

// Current week dates
const currentDate = new Date()
const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 })
const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

const router = useRouter()

onMounted(async () => {
  // Load user profile and enforce coach/admin only
  if (user.value) {
    const { data } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.value.id)
      .single()
    profile.value = data
    if (data && data.role !== 'coach' && data.role !== 'admin') {
      router.push('/')
      return
    }
  } else {
    router.push('/auth/login?redirect=/dashboard')
    return
  }
  await fetchData()
})

const fetchData = async () => {
  loading.value = true
  try {
    // Fetch pending registration requests
    const { data: registrations } = await client
      .from('registration_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5)
    
    pendingRegistrations.value = registrations || []

    // Fetch today's reservations
    const today = format(new Date(), 'yyyy-MM-dd')
    const { data: todayRes } = await client
      .from('class_reservations')
      .select(`
        *,
        user:profiles(full_name, email)
      `)
      .eq('reservation_date', today)
      .eq('status', 'active')
      .order('time_slot')
    
    todayReservations.value = todayRes || []

    // Fetch week reservations
    const weekEnd = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const { data: weekRes } = await client
      .from('class_reservations')
      .select(`
        *,
        user:profiles(full_name, email)
      `)
      .gte('reservation_date', format(weekStart, 'yyyy-MM-dd'))
      .lte('reservation_date', weekEnd)
      .eq('status', 'active')
      .order('reservation_date')
    
    weekReservations.value = weekRes || []

    // Fetch stats
    const { count: studentsCount } = await client
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'customer')
      .eq('is_active', true)

    const { count: pendingCount } = await client
      .from('registration_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')

    stats.value = {
      total_students: studentsCount || 0,
      classes_today: todayReservations.value.length,
      classes_this_week: weekReservations.value.length,
      pending_approvals: pendingCount || 0
    }
  } catch (e) {
    console.error('Error fetching data:', e)
  } finally {
    loading.value = false
  }
}

// Approve registration
const approveRegistration = async (id: string) => {
  try {
    await client
      .from('registration_requests')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', id)
    
    await fetchData()
  } catch (e) {
    console.error('Error approving:', e)
  }
}

// Reject registration
const rejectRegistration = async (id: string) => {
  try {
    await client
      .from('registration_requests')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', id)
    
    await fetchData()
  } catch (e) {
    console.error('Error rejecting:', e)
  }
}

// Check if date is a class day (Tue, Thu, Sat)
const isClassDay = (date: Date) => {
  const day = date.getDay()
  return day === 2 || day === 4 || day === 6 // Tuesday, Thursday, Saturday
}

// Get reservations for a specific date
const getReservationsForDate = (date: Date) => {
  const dateStr = format(date, 'yyyy-MM-dd')
  return weekReservations.value.filter(r => r.reservation_date === dateStr)
}

// Get reservations for the selected date and time slot
const getReservationsForSlot = (slot: 'early' | 'late') => {
  const targetDate = selectedWeekDate.value || currentDate
  const dateStr = format(targetDate, 'yyyy-MM-dd')
  return weekReservations.value.filter(r => 
    r.reservation_date === dateStr && r.time_slot === slot
  )
}

// Select a date from the week view
const selectWeekDate = (date: Date) => {
  if (isClassDay(date)) {
    selectedWeekDate.value = date
  }
}

// Format date
const formatDate = (dateStr: string) => {
  const locale = language.value === 'es' ? es : undefined
  return format(new Date(dateStr), 'dd MMM', { locale })
}
</script>

<template>
  <div class="min-h-screen pb-24 relative">
    <!-- Skateboard Background - Centered -->
    <div class="fixed inset-0 z-0 pointer-events-none flex items-center justify-center bg-black">
      <img 
        src="/Niik_StainedGlass.png" 
        alt=""
        class="h-screen w-auto object-contain"
      />
    </div>

    <!-- Header -->
    <header class="bg-gradient-to-br from-flame-600/90 via-glass-orange/90 to-gold-500/90 px-4 pt-safe pb-6 relative z-10 backdrop-blur-sm">
      <div class="max-w-lg mx-auto pt-4">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h1 class="text-2xl font-bold text-white">
              {{ language === 'es' ? `¡Hola, ${userFirstName}!` : `Hello, ${userFirstName}!` }}
            </h1>
            <p class="text-white/80 text-sm">
              {{ format(new Date(), language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale: language === 'es' ? es : undefined }) }}
            </p>
          </div>
          <div class="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
            <span class="text-2xl">🛹</span>
          </div>
        </div>
        
        <!-- Quick Stats -->
        <div class="grid grid-cols-4 gap-2">
          <div class="bg-white/20 backdrop-blur rounded-xl p-3 text-center">
            <p class="text-2xl font-bold text-white">{{ stats.classes_today }}</p>
            <p class="text-xs text-white/80">{{ language === 'es' ? 'Hoy' : 'Today' }}</p>
          </div>
          <div class="bg-white/20 backdrop-blur rounded-xl p-3 text-center">
            <p class="text-2xl font-bold text-white">{{ stats.classes_this_week }}</p>
            <p class="text-xs text-white/80">{{ language === 'es' ? 'Semana' : 'Week' }}</p>
          </div>
          <div class="bg-white/20 backdrop-blur rounded-xl p-3 text-center">
            <p class="text-2xl font-bold text-white">{{ stats.total_students }}</p>
            <p class="text-xs text-white/80">{{ language === 'es' ? 'Alumnos' : 'Students' }}</p>
          </div>
          <div class="bg-white/20 backdrop-blur rounded-xl p-3 text-center relative">
            <p class="text-2xl font-bold text-white">{{ stats.pending_approvals }}</p>
            <p class="text-xs text-white/80">{{ language === 'es' ? 'Solicitudes' : 'Requests' }}</p>
            <span v-if="stats.pending_approvals > 0" class="absolute -top-1 -right-1 w-3 h-3 bg-flame-600 rounded-full animate-pulse"></span>
          </div>
        </div>
      </div>
    </header>

    <div class="px-4 max-w-lg mx-auto -mt-2 relative z-10">
      <!-- Loading -->
      <div v-if="loading" class="py-12 text-center">
        <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
      </div>

      <template v-else>
        <!-- Pending Registrations -->
        <div v-if="pendingRegistrations.length > 0" class="mb-6">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-bold text-white flex items-center gap-2">
              <span class="w-2 h-2 bg-flame-600 rounded-full animate-pulse"></span>
              {{ language === 'es' ? 'Solicitudes Pendientes' : 'Pending Requests' }}
            </h2>
            <NuxtLink to="/admin/registrations" class="text-gold-400 text-sm">
              {{ language === 'es' ? 'Ver todas' : 'View all' }}
            </NuxtLink>
          </div>
          
          <div class="space-y-2">
            <div 
              v-for="req in pendingRegistrations" 
              :key="req.id"
              class="bg-gray-900 border border-flame-600/30 rounded-xl p-4"
            >
              <div class="flex items-start justify-between mb-2">
                <div>
                  <h3 class="font-bold text-white">{{ req.full_name }}</h3>
                  <p class="text-sm text-gray-400">{{ req.email }}</p>
                  <p class="text-xs text-gray-500">{{ formatDate(req.created_at) }}</p>
                </div>
              </div>
              <div class="flex gap-2">
                <button 
                  @click="approveRegistration(req.id)"
                  class="flex-1 py-2 bg-glass-green text-white text-sm font-semibold rounded-lg"
                >
                  {{ language === 'es' ? 'Aprobar' : 'Approve' }}
                </button>
                <button 
                  @click="rejectRegistration(req.id)"
                  class="flex-1 py-2 bg-gray-800 text-gray-400 text-sm font-semibold rounded-lg"
                >
                  {{ language === 'es' ? 'Rechazar' : 'Reject' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Week Calendar -->
        <div class="mb-6">
          <h2 class="text-lg font-bold text-white mb-3">
            {{ language === 'es' ? 'Esta Semana' : 'This Week' }}
          </h2>
          
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <!-- Week Days -->
            <div class="grid grid-cols-7 gap-1 mb-4">
              <div 
                v-for="date in weekDates" 
                :key="date.toISOString()"
                class="text-center"
              >
                <p class="text-xs text-gray-500 mb-1">
                  {{ format(date, 'EEE', { locale: language === 'es' ? es : undefined }) }}
                </p>
                <div 
                  class="w-10 h-10 mx-auto rounded-full flex items-center justify-center relative cursor-pointer"
                  :class="[
                    isToday(date) 
                      ? 'bg-gold-400 text-black' 
                      : isClassDay(date)
                        ? 'bg-glass-green/20 text-glass-green hover:bg-glass-green/30' 
                        : 'bg-gray-800 text-gray-400'
                  ]"
                  @click="selectWeekDate(date)"
                >
                  <span class="font-bold">{{ format(date, 'd') }}</span>
                  <span 
                    v-if="getReservationsForDate(date).length > 0"
                    class="absolute -top-1 -right-1 w-5 h-5 bg-glass-green rounded-full text-[10px] font-bold text-white flex items-center justify-center"
                  >
                    {{ getReservationsForDate(date).length }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Class Slots for Selected/Today -->
            <div class="border-t border-gray-800 pt-4">
              <div class="flex items-center justify-between mb-3">
                <p class="text-sm font-semibold text-white">
                  {{ language === 'es' ? 'Clases:' : 'Classes:' }}
                  <span class="text-gray-400 font-normal">
                    {{ format(selectedWeekDate || new Date(), 'd MMMM', { locale: language === 'es' ? es : undefined }) }}
                  </span>
                </p>
              </div>
              
              <!-- Time Slots -->
              <div class="grid grid-cols-2 gap-2 mb-4">
                <button
                  @click="selectedTimeSlot = 'early'"
                  class="py-3 rounded-xl font-semibold text-sm transition-all border-2"
                  :class="selectedTimeSlot === 'early' 
                    ? 'bg-gold-400 text-black border-gold-400' 
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gold-400/50'"
                >
                  5:30 PM - 7:00 PM
                  <span class="block text-xs opacity-70">
                    {{ getReservationsForSlot('early').length }} {{ language === 'es' ? 'alumnos' : 'students' }}
                  </span>
                </button>
                <button
                  @click="selectedTimeSlot = 'late'"
                  class="py-3 rounded-xl font-semibold text-sm transition-all border-2"
                  :class="selectedTimeSlot === 'late' 
                    ? 'bg-gold-400 text-black border-gold-400' 
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gold-400/50'"
                >
                  7:00 PM - 8:30 PM
                  <span class="block text-xs opacity-70">
                    {{ getReservationsForSlot('late').length }} {{ language === 'es' ? 'alumnos' : 'students' }}
                  </span>
                </button>
              </div>

              <!-- Students for selected slot -->
              <div v-if="getReservationsForSlot(selectedTimeSlot).length > 0" class="space-y-2">
                <div 
                  v-for="res in getReservationsForSlot(selectedTimeSlot)" 
                  :key="res.id"
                  class="flex items-center gap-3 p-2 bg-gray-800 rounded-lg"
                >
                  <div class="w-10 h-10 rounded-full bg-gold-400/20 flex items-center justify-center text-gold-400 font-bold">
                    {{ res.user?.full_name?.charAt(0)?.toUpperCase() || '?' }}
                  </div>
                  <div class="flex-1">
                    <p class="font-semibold text-white text-sm">{{ res.user?.full_name || 'Student' }}</p>
                    <p class="text-xs text-gray-500">{{ res.user?.email }}</p>
                  </div>
                  <span class="px-2 py-1 bg-glass-green/20 text-glass-green text-xs rounded-full">
                    {{ language === 'es' ? 'Confirmado' : 'Confirmed' }}
                  </span>
                </div>
              </div>
              
              <div v-else class="text-center py-4">
                <p class="text-gray-500 text-sm">
                  {{ language === 'es' ? 'No hay clases programadas para este horario' : 'No classes scheduled for this slot' }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="mb-6">
          <h2 class="text-lg font-bold text-white mb-3">
            {{ language === 'es' ? 'Acciones Rápidas' : 'Quick Actions' }}
          </h2>
          
          <div class="grid grid-cols-2 gap-3">
            <NuxtLink 
              to="/dashboard/planning"
              class="bg-gradient-to-br from-glass-purple to-glass-blue p-4 rounded-xl"
            >
              <span class="text-2xl mb-2 block">📋</span>
              <p class="font-bold text-white">{{ language === 'es' ? 'Planear Clase' : 'Plan Class' }}</p>
              <p class="text-xs text-white/70">{{ language === 'es' ? 'Preparar tu próxima clase' : 'Prepare your next class' }}</p>
            </NuxtLink>
            
            <NuxtLink 
              to="/dashboard/students"
              class="bg-gradient-to-br from-gold-400 to-glass-orange p-4 rounded-xl"
            >
              <span class="text-2xl mb-2 block">👥</span>
              <p class="font-bold text-black">{{ language === 'es' ? 'Asistencia' : 'Attendance' }}</p>
              <p class="text-xs text-black/70">{{ language === 'es' ? 'Marcar asistencia' : 'Mark attendance' }}</p>
            </NuxtLink>
            
            <NuxtLink 
              to="/coach/students"
              class="bg-gradient-to-br from-glass-green to-glass-blue p-4 rounded-xl"
            >
              <span class="text-2xl mb-2 block">📊</span>
              <p class="font-bold text-white">{{ language === 'es' ? 'Progreso' : 'Progress' }}</p>
              <p class="text-xs text-white/70">{{ language === 'es' ? 'Ver progreso alumnos' : 'View student progress' }}</p>
            </NuxtLink>
            
            <NuxtLink 
              to="/user/tips"
              class="bg-gradient-to-br from-flame-600 to-glass-orange p-4 rounded-xl"
            >
              <span class="text-2xl mb-2 block">🛹</span>
              <p class="font-bold text-white">{{ language === 'es' ? 'Trucos' : 'Tricks' }}</p>
              <p class="text-xs text-white/70">{{ language === 'es' ? 'Biblioteca de trucos' : 'Tricks library' }}</p>
            </NuxtLink>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
