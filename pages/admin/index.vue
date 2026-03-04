<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language, formatPrice } = useI18n()

// Check if user is admin
const isAdmin = ref(false)
const checkingRole = ref(true)

// Dashboard stats
const stats = ref({
  totalBookings: 0,
  pendingBookings: 0,
  totalRevenue: 0,
  activeCoaches: 0,
  totalCustomers: 0,
  pendingRegistrations: 0,
})

// Recent bookings
const recentBookings = ref<any[]>([])

// All coaches
const coaches = ref<any[]>([])

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/admin')
    return
  }

  // Check user role
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

  await loadDashboardData()
})

const loadDashboardData = async () => {
  // Load coaches
  const { data: coachesData } = await client
    .from('profiles')
    .select('*')
    .eq('role', 'coach')
    .eq('is_active', true)

  coaches.value = coachesData || []
  stats.value.activeCoaches = coaches.value.length

  // Load total customers
  const { count: customersCount } = await client
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'customer')

  stats.value.totalCustomers = customersCount || 0

  // Load bookings stats
  const { count: totalBookings } = await client
    .from('bookings')
    .select('*', { count: 'exact', head: true })

  stats.value.totalBookings = totalBookings || 0

  const { count: pendingBookings } = await client
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  stats.value.pendingBookings = pendingBookings || 0

  // Load pending registrations
  const { count: pendingRegs } = await client
    .from('registration_requests')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending')

  stats.value.pendingRegistrations = pendingRegs || 0

  // Load recent bookings
  const { data: bookingsData } = await client
    .from('bookings')
    .select(`
      *,
      customer:profiles!customer_id(full_name, email),
      schedule:class_schedules(
        date,
        time_slot,
        coach:profiles!coach_id(full_name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(5)

  recentBookings.value = bookingsData || []
}

// Navigation functions
const goToCoachAvailability = () => router.push('/admin/coaches')
const goToBookings = () => router.push('/admin/bookings')
const goToCustomers = () => router.push('/admin/customers')

// Format date
const formatDate = (date: string) => {
  const locale = language.value === 'es' ? es : undefined
  return format(new Date(date), 'dd MMM yyyy', { locale })
}
</script>

<template>
  <div class="min-h-screen bg-black">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button @click="router.push('/')" class="p-2 -ml-2 text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 class="text-xl font-bold text-white">
                {{ language === 'es' ? 'Panel de Admin' : 'Admin Dashboard' }}
              </h1>
              <p class="text-sm text-gray-400">NiikSkate Academy</p>
            </div>
          </div>
          <div class="w-10 h-10 rounded-full bg-gradient-to-br from-gold-400 to-gold-500 flex items-center justify-center">
            <span class="text-black font-bold">👑</span>
          </div>
        </div>
      </div>
    </header>

    <!-- Loading State -->
    <div v-if="checkingRole" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-gray-400">{{ language === 'es' ? 'Verificando acceso...' : 'Verifying access...' }}</p>
      </div>
    </div>

    <!-- Dashboard Content -->
    <div v-else-if="isAdmin" class="px-4 py-6 max-w-2xl mx-auto space-y-6">
      <!-- Stats Grid -->
      <div class="grid grid-cols-2 gap-3">
        <!-- Total Bookings -->
        <div class="bg-gradient-to-br from-glass-blue/20 to-glass-purple/20 rounded-2xl p-4 border border-glass-blue/30">
          <p class="text-3xl font-bold text-white">{{ stats.totalBookings }}</p>
          <p class="text-sm text-gray-400">{{ language === 'es' ? 'Reservas Totales' : 'Total Bookings' }}</p>
        </div>

        <!-- Pending Bookings -->
        <div class="bg-gradient-to-br from-gold-400/20 to-gold-500/20 rounded-2xl p-4 border border-gold-400/30">
          <p class="text-3xl font-bold text-gold-400">{{ stats.pendingBookings }}</p>
          <p class="text-sm text-gray-400">{{ language === 'es' ? 'Pendientes' : 'Pending' }}</p>
        </div>

        <!-- Active Coaches -->
        <div class="bg-gradient-to-br from-glass-green/20 to-glass-blue/20 rounded-2xl p-4 border border-glass-green/30">
          <p class="text-3xl font-bold text-glass-green">{{ stats.activeCoaches }}</p>
          <p class="text-sm text-gray-400">{{ language === 'es' ? 'Coaches Activos' : 'Active Coaches' }}</p>
        </div>

        <!-- Total Customers -->
        <div class="bg-gradient-to-br from-flame-600/20 to-glass-orange/20 rounded-2xl p-4 border border-flame-600/30">
          <p class="text-3xl font-bold text-flame-600">{{ stats.totalCustomers }}</p>
          <p class="text-sm text-gray-400">{{ language === 'es' ? 'Clientes' : 'Customers' }}</p>
        </div>
      </div>

      <!-- Quick Actions -->
      <section>
        <h2 class="text-lg font-bold text-white mb-3">
          {{ language === 'es' ? 'Acciones Rápidas' : 'Quick Actions' }}
        </h2>
        <div class="space-y-2">
          <!-- Registration Approvals (with badge) -->
          <NuxtLink 
            to="/admin/registrations"
            class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition-all relative"
            :class="{ 'border-gold-400/50': stats.pendingRegistrations > 0 }"
          >
            <div class="w-12 h-12 rounded-xl bg-glass-purple/20 flex items-center justify-center text-2xl">
              ✅
            </div>
            <div class="flex-1">
              <p class="font-semibold text-white">{{ language === 'es' ? 'Aprobaciones' : 'Approvals' }}</p>
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Aprobar registros nuevos' : 'Approve new registrations' }}</p>
            </div>
            <span v-if="stats.pendingRegistrations > 0" class="px-2 py-1 bg-gold-400 text-black text-xs font-bold rounded-full">
              {{ stats.pendingRegistrations }}
            </span>
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </NuxtLink>

          <!-- Manage Coaches -->
          <NuxtLink 
            to="/admin/coaches"
            class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition-all"
          >
            <div class="w-12 h-12 rounded-xl bg-glass-green/20 flex items-center justify-center text-2xl">
              👨‍🏫
            </div>
            <div class="flex-1">
              <p class="font-semibold text-white">{{ language === 'es' ? 'Gestionar Coaches' : 'Manage Coaches' }}</p>
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Ver disponibilidad y horarios' : 'View availability and schedules' }}</p>
            </div>
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </NuxtLink>

          <!-- Attendance -->
          <NuxtLink 
            to="/admin/attendance"
            class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition-all"
          >
            <div class="w-12 h-12 rounded-xl bg-glass-blue/20 flex items-center justify-center text-2xl">
              📋
            </div>
            <div class="flex-1">
              <p class="font-semibold text-white">{{ language === 'es' ? 'Asistencia' : 'Attendance' }}</p>
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Marcar asistencia de clases' : 'Mark class attendance' }}</p>
            </div>
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </NuxtLink>

          <!-- Payments -->
          <NuxtLink 
            to="/admin/payments"
            class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition-all"
          >
            <div class="w-12 h-12 rounded-xl bg-gold-400/20 flex items-center justify-center text-2xl">
              💰
            </div>
            <div class="flex-1">
              <p class="font-semibold text-white">{{ language === 'es' ? 'Pagos' : 'Payments' }}</p>
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Registrar y ver pagos' : 'Record and view payments' }}</p>
            </div>
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </NuxtLink>

          <!-- Users Management -->
          <NuxtLink 
            to="/admin/users"
            class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition-all"
          >
            <div class="w-12 h-12 rounded-xl bg-flame-600/20 flex items-center justify-center text-2xl">
              👥
            </div>
            <div class="flex-1">
              <p class="font-semibold text-white">{{ language === 'es' ? 'Usuarios' : 'Users' }}</p>
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Gestionar usuarios y permisos' : 'Manage users and permissions' }}</p>
            </div>
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </NuxtLink>

          <!-- Manage Products -->
          <NuxtLink 
            to="/admin/products"
            class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gray-700 transition-all"
          >
            <div class="w-12 h-12 rounded-xl bg-glass-orange/20 flex items-center justify-center text-2xl">
              🛹
            </div>
            <div class="flex-1">
              <p class="font-semibold text-white">{{ language === 'es' ? 'Productos' : 'Products' }}</p>
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Inventario y tienda' : 'Inventory and shop' }}</p>
            </div>
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </NuxtLink>
        </div>
      </section>

      <!-- Coaches Overview -->
      <section>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold text-white">
            {{ language === 'es' ? 'Coaches' : 'Coaches' }}
          </h2>
          <NuxtLink to="/admin/coaches" class="text-sm text-gold-400">
            {{ language === 'es' ? 'Ver todos' : 'View all' }}
          </NuxtLink>
        </div>
        
        <div class="grid grid-cols-3 gap-3">
          <!-- Coach Rod -->
          <div class="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
            <div class="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-flame-600 to-glass-orange flex items-center justify-center ring-2 ring-flame-600/50 mb-2">
              <span class="text-2xl">🧑‍🏫</span>
            </div>
            <p class="font-semibold text-white text-sm">Rod</p>
            <p class="text-xs text-gray-500">Vert/Street</p>
            <div class="mt-2">
              <span class="inline-block px-2 py-0.5 bg-glass-green/20 text-glass-green text-xs rounded-full">
                {{ language === 'es' ? 'Activo' : 'Active' }}
              </span>
            </div>
          </div>

          <!-- Coach Leo -->
          <div class="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
            <div class="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-glass-blue to-glass-purple flex items-center justify-center ring-2 ring-glass-blue/50 mb-2">
              <span class="text-2xl">👨‍🏫</span>
            </div>
            <p class="font-semibold text-white text-sm">Leo</p>
            <p class="text-xs text-gray-500">Vert/Street</p>
            <div class="mt-2">
              <span class="inline-block px-2 py-0.5 bg-glass-green/20 text-glass-green text-xs rounded-full">
                {{ language === 'es' ? 'Activo' : 'Active' }}
              </span>
            </div>
          </div>

          <!-- Coach Itza -->
          <div class="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
            <div class="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-glass-green to-glass-blue flex items-center justify-center ring-2 ring-glass-green/50 mb-2">
              <span class="text-2xl">👩‍🏫</span>
            </div>
            <p class="font-semibold text-white text-sm">Itza</p>
            <p class="text-xs text-gray-500">Fundamentos</p>
            <div class="mt-2">
              <span class="inline-block px-2 py-0.5 bg-glass-green/20 text-glass-green text-xs rounded-full">
                {{ language === 'es' ? 'Activo' : 'Active' }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Recent Bookings -->
      <section>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold text-white">
            {{ language === 'es' ? 'Reservas Recientes' : 'Recent Bookings' }}
          </h2>
          <NuxtLink to="/admin/bookings" class="text-sm text-gold-400">
            {{ language === 'es' ? 'Ver todas' : 'View all' }}
          </NuxtLink>
        </div>

        <div v-if="recentBookings.length === 0" class="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center">
          <p class="text-gray-500">{{ language === 'es' ? 'No hay reservas aún' : 'No bookings yet' }}</p>
        </div>

        <div v-else class="space-y-2">
          <div 
            v-for="booking in recentBookings" 
            :key="booking.id"
            class="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-center gap-3"
          >
            <div class="w-10 h-10 rounded-full bg-glass-purple/20 flex items-center justify-center text-lg">
              🛹
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-medium text-white text-sm truncate">{{ booking.customer?.full_name || 'Guest' }}</p>
              <p class="text-xs text-gray-500">{{ formatDate(booking.created_at) }}</p>
            </div>
            <span 
              class="px-2 py-1 rounded-full text-xs font-medium"
              :class="{
                'bg-gold-400/20 text-gold-400': booking.status === 'pending',
                'bg-glass-green/20 text-glass-green': booking.status === 'confirmed',
                'bg-gray-700 text-gray-400': booking.status === 'cancelled',
              }"
            >
              {{ booking.status }}
            </span>
          </div>
        </div>
      </section>
    </div>

    <!-- Not Admin -->
    <div v-else class="flex items-center justify-center py-20">
      <div class="text-center">
        <p class="text-xl text-gray-400">{{ language === 'es' ? 'Acceso denegado' : 'Access denied' }}</p>
        <NuxtLink to="/" class="text-gold-400 mt-4 inline-block">
          {{ language === 'es' ? 'Volver al inicio' : 'Back to home' }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
