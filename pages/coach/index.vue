<script setup lang="ts">
import { format, isToday, isTomorrow, addDays, startOfWeek, endOfWeek, startOfMonth, getDaysInMonth } from 'date-fns'
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
const profile = ref<any>(null)

// Get user's first name
const userFirstName = computed(() => {
  const fullName = profile.value?.full_name || ''
  return fullName.split(' ')[0] || 'Coach'
})

// Stats
const stats = ref({
  classesToday: 0,
  classesThisWeek: 0,
  totalStudents: 0,
  favoriteStudents: 0,
})

// Data
const upcomingClasses = ref<any[]>([])
const emergencyContacts = ref<any[]>([])
const favoriteStudents = ref<any[]>([])
const monthlyApproval = ref<any>(null)

// Current month for approval check
const currentMonth = new Date().getMonth() + 1
const currentYear = new Date().getFullYear()

// Check if this month's availability is approved
const isMonthApproved = computed(() => {
  if (!monthlyApproval.value) return false
  return monthlyApproval.value.year === currentYear && monthlyApproval.value.month === currentMonth
})

// Days until deadline (1st of month)
const daysUntilDeadline = computed(() => {
  const today = new Date()
  const day = today.getDate()
  if (day === 1) return 0
  return getDaysInMonth(today) - day + 1
})

// Show approval warning
const showApprovalWarning = computed(() => {
  return !isMonthApproved.value && daysUntilDeadline.value <= 5
})

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/coach')
    return
  }

  // Check user role
  const { data } = await client
    .from('profiles')
    .select('*')
    .eq('id', user.value.id)
    .single()

  if (data?.role !== 'coach' && data?.role !== 'admin') {
    router.push('/')
    return
  }

  profile.value = data
  isCoach.value = true
  await loadDashboardData()
  loading.value = false
})

const loadDashboardData = async () => {
  if (!user.value) return
  
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 0 })
  const weekEnd = endOfWeek(today, { weekStartsOn: 0 })
  
  // Fetch upcoming class reservations
  const { data: reservations } = await client
    .from('class_reservations')
    .select(`
      *,
      user:profiles(full_name, email)
    `)
    .gte('reservation_date', format(today, 'yyyy-MM-dd'))
    .lte('reservation_date', format(addDays(today, 14), 'yyyy-MM-dd'))
    .eq('status', 'active')
    .order('reservation_date')
    .order('time_slot')
  
  // Group by date and session
  const groupedClasses: Record<string, any> = {}
  for (const res of reservations || []) {
    const key = `${res.reservation_date}_${res.time_slot}`
    if (!groupedClasses[key]) {
      groupedClasses[key] = {
        id: key,
        date: res.reservation_date,
        session: res.time_slot,
        type: res.class_type || 'Group Class',
        students: 0,
        studentList: [],
      }
    }
    groupedClasses[key].students++
    groupedClasses[key].studentList.push(res.user)
  }
  upcomingClasses.value = Object.values(groupedClasses).slice(0, 6)
  
  // Fetch today's count
  const todayStr = format(today, 'yyyy-MM-dd')
  const { count: todayCount } = await client
    .from('class_reservations')
    .select('*', { count: 'exact', head: true })
    .eq('reservation_date', todayStr)
    .eq('status', 'active')
  
  // Fetch week count
  const { count: weekCount } = await client
    .from('class_reservations')
    .select('*', { count: 'exact', head: true })
    .gte('reservation_date', format(weekStart, 'yyyy-MM-dd'))
    .lte('reservation_date', format(weekEnd, 'yyyy-MM-dd'))
    .eq('status', 'active')
  
  // Fetch total active students
  const { count: studentCount } = await client
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'customer')
    .eq('is_active', true)
  
  // Fetch favorite students count
  const { count: favCount } = await client
    .from('coach_favorite_students')
    .select('*', { count: 'exact', head: true })
    .eq('coach_id', user.value.id)
  
  stats.value = {
    classesToday: todayCount || 0,
    classesThisWeek: weekCount || 0,
    totalStudents: studentCount || 0,
    favoriteStudents: favCount || 0,
  }
  
  // Fetch emergency contacts
  const { data: contacts } = await client
    .from('emergency_contacts')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  
  emergencyContacts.value = contacts || []
  
  // Fetch monthly approval status
  const { data: approval } = await client
    .from('coach_monthly_approvals')
    .select('*')
    .eq('coach_id', user.value.id)
    .eq('year', currentYear)
    .eq('month', currentMonth)
    .maybeSingle()
  
  monthlyApproval.value = approval
  
  // Fetch favorite students
  const { data: favorites } = await client
    .from('coach_favorite_students')
    .select(`
      *,
      student:profiles(id, full_name, email)
    `)
    .eq('coach_id', user.value.id)
    .limit(5)
  
  favoriteStudents.value = favorites || []
}

// Approve monthly availability
const approveMonthlyAvailability = async () => {
  if (!user.value) return
  
  try {
    const { error } = await client
      .from('coach_monthly_approvals')
      .upsert({
        coach_id: user.value.id,
        year: currentYear,
        month: currentMonth,
        approved_at: new Date().toISOString(),
      })
    
    if (error) throw error
    
    monthlyApproval.value = {
      coach_id: user.value.id,
      year: currentYear,
      month: currentMonth,
      approved_at: new Date().toISOString(),
    }
  } catch (e) {
    console.error('Error approving availability:', e)
  }
}

// Format date
const formatClassDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const locale = language.value === 'es' ? es : undefined
  
  if (isToday(date)) return language.value === 'es' ? 'Hoy' : 'Today'
  if (isTomorrow(date)) return language.value === 'es' ? 'Mañana' : 'Tomorrow'
  return format(date, 'EEE d MMM', { locale })
}

// Session label
const sessionLabel = (session: string) => {
  return session === 'early' ? '5:30 PM - 7:00 PM' : '7:00 PM - 8:30 PM'
}

// Get contact icon
const getContactIcon = (role: string) => {
  switch (role) {
    case 'admin': return '👤'
    case 'park_manager': return '🏟️'
    case 'medical': return '🏥'
    default: return '📞'
  }
}

// Month name
const monthName = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  return format(new Date(), 'MMMM', { locale })
})
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
    <header class="bg-gradient-to-br from-gold-400/20 to-glass-orange/20 px-4 pt-safe pb-6 relative z-10 backdrop-blur-sm">
      <div class="max-w-lg mx-auto pt-4">
        <div class="flex items-center justify-between mb-4">
          <div class="w-12 h-12 rounded-full bg-gold-400 flex items-center justify-center">
            <span class="text-black text-2xl">🛹</span>
          </div>
          <div class="flex items-center gap-2">
            <!-- Approval status badge -->
            <span 
              v-if="isMonthApproved"
              class="px-3 py-1 bg-glass-green/20 text-glass-green text-xs font-bold rounded-full"
            >
              ✓ {{ monthName }}
            </span>
            <span 
              v-else
              class="px-3 py-1 bg-flame-600/20 text-flame-600 text-xs font-bold rounded-full animate-pulse"
            >
              ⚠️ {{ language === 'es' ? 'Pendiente' : 'Pending' }}
            </span>
          </div>
        </div>
        
        <h1 class="text-2xl font-bold text-white mb-1">
          {{ language === 'es' ? `¡Hola, ${userFirstName}!` : `Hey, ${userFirstName}!` }}
        </h1>
        <p class="text-gray-400">{{ format(new Date(), language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale: language === 'es' ? es : undefined }) }}</p>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20 relative z-10">
      <div class="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <!-- Content -->
    <div v-else-if="isCoach" class="px-4 py-6 max-w-lg mx-auto space-y-6 relative z-10">
      <!-- Monthly Approval Warning -->
      <div 
        v-if="!isMonthApproved" 
        class="bg-gradient-to-r from-flame-600/20 to-gold-400/20 border border-flame-600/50 rounded-2xl p-4"
      >
        <div class="flex items-start gap-3">
          <span class="text-2xl">⚠️</span>
          <div class="flex-1">
            <h3 class="font-bold text-white mb-1">
              {{ language === 'es' ? 'Aprobación Requerida' : 'Approval Required' }}
            </h3>
            <p class="text-sm text-gray-300 mb-3">
              {{ language === 'es' 
                ? `Por favor aprueba tu disponibilidad para ${monthName}. Recuerda que debe ser antes del 1ro de cada mes.`
                : `Please approve your availability for ${monthName}. Remember it must be done by the 1st of each month.`
              }}
            </p>
            <div class="flex gap-2">
              <NuxtLink 
                to="/coach/availability"
                class="px-4 py-2 bg-gold-400 text-black text-sm font-bold rounded-lg"
              >
                {{ language === 'es' ? 'Configurar' : 'Configure' }}
              </NuxtLink>
              <button 
                @click="approveMonthlyAvailability"
                class="px-4 py-2 bg-glass-green text-white text-sm font-bold rounded-lg"
              >
                {{ language === 'es' ? 'Aprobar Ahora' : 'Approve Now' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-4 gap-2">
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
          <p class="text-2xl font-bold text-gold-400">{{ stats.classesToday }}</p>
          <p class="text-[10px] text-gray-400">{{ language === 'es' ? 'Hoy' : 'Today' }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
          <p class="text-2xl font-bold text-glass-green">{{ stats.classesThisWeek }}</p>
          <p class="text-[10px] text-gray-400">{{ language === 'es' ? 'Semana' : 'Week' }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
          <p class="text-2xl font-bold text-glass-blue">{{ stats.totalStudents }}</p>
          <p class="text-[10px] text-gray-400">{{ language === 'es' ? 'Alumnos' : 'Students' }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-3 text-center">
          <p class="text-2xl font-bold text-glass-purple">{{ stats.favoriteStudents }}</p>
          <p class="text-[10px] text-gray-400">{{ language === 'es' ? 'Favoritos' : 'Favorites' }}</p>
        </div>
      </div>

      <!-- Upcoming Classes (Primary Focus) -->
      <section>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            <span class="w-2 h-2 bg-glass-green rounded-full animate-pulse"></span>
            {{ language === 'es' ? 'Próximas Clases' : 'Upcoming Classes' }}
          </h2>
          <NuxtLink to="/dashboard/students" class="text-sm text-gold-400">
            {{ language === 'es' ? 'Asistencia' : 'Attendance' }}
          </NuxtLink>
        </div>

        <div v-if="upcomingClasses.length === 0" class="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
          <p class="text-4xl mb-2">📅</p>
          <p class="text-gray-400">{{ language === 'es' ? 'No hay clases programadas' : 'No classes scheduled' }}</p>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="cls in upcomingClasses"
            :key="cls.id"
            class="bg-gray-900 border border-gray-800 rounded-xl p-4"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-bold text-gold-400">{{ formatClassDate(cls.date) }}</span>
              <span class="px-2 py-0.5 bg-gray-800 text-gray-300 text-xs rounded-full">{{ sessionLabel(cls.session) }}</span>
            </div>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <!-- Student avatars -->
                <div class="flex -space-x-2">
                  <div 
                    v-for="(student, idx) in cls.studentList?.slice(0, 4)" 
                    :key="idx"
                    class="w-7 h-7 rounded-full bg-gradient-to-br from-glass-blue to-glass-purple flex items-center justify-center text-xs font-bold text-white border-2 border-gray-900"
                  >
                    {{ student?.full_name?.charAt(0)?.toUpperCase() || '?' }}
                  </div>
                  <div 
                    v-if="cls.students > 4"
                    class="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-white border-2 border-gray-900"
                  >
                    +{{ cls.students - 4 }}
                  </div>
                </div>
              </div>
              <span class="px-3 py-1 bg-glass-blue/20 text-glass-blue text-xs font-bold rounded-full">
                {{ cls.students }} {{ cls.students === 1 ? (language === 'es' ? 'alumno' : 'student') : (language === 'es' ? 'alumnos' : 'students') }}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Quick Actions -->
      <section>
        <h2 class="text-lg font-bold text-white mb-3">
          {{ language === 'es' ? 'Acciones Rápidas' : 'Quick Actions' }}
        </h2>
        <div class="grid grid-cols-2 gap-3">
          <NuxtLink 
            to="/coach/availability"
            class="bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-gold-400/50 transition-all"
          >
            <span class="text-2xl block mb-2">📅</span>
            <p class="font-semibold text-white text-sm">{{ language === 'es' ? 'Mi Disponibilidad' : 'My Availability' }}</p>
          </NuxtLink>

          <NuxtLink 
            to="/dashboard/students"
            class="bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-glass-blue/50 transition-all"
          >
            <span class="text-2xl block mb-2">✅</span>
            <p class="font-semibold text-white text-sm">{{ language === 'es' ? 'Asistencia' : 'Attendance' }}</p>
          </NuxtLink>

          <NuxtLink 
            to="/coach/students"
            class="bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-glass-green/50 transition-all"
          >
            <span class="text-2xl block mb-2">👨‍🎓</span>
            <p class="font-semibold text-white text-sm">{{ language === 'es' ? 'Progreso' : 'Progress' }}</p>
          </NuxtLink>

          <NuxtLink 
            to="/coach/evaluations"
            class="bg-gray-900 border border-gray-800 rounded-2xl p-4 hover:border-glass-purple/50 transition-all"
          >
            <span class="text-2xl block mb-2">📊</span>
            <p class="font-semibold text-white text-sm">{{ language === 'es' ? 'Evaluaciones' : 'Evaluations' }}</p>
          </NuxtLink>
        </div>
      </section>

      <!-- Favorite Students -->
      <section v-if="favoriteStudents.length > 0">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            ⭐ {{ language === 'es' ? 'Mis Favoritos' : 'My Favorites' }}
          </h2>
          <NuxtLink to="/coach/students" class="text-sm text-gold-400">
            {{ language === 'es' ? 'Ver todos' : 'View all' }}
          </NuxtLink>
        </div>
        <div class="flex gap-3 overflow-x-auto pb-2">
          <div 
            v-for="fav in favoriteStudents" 
            :key="fav.id"
            class="flex-shrink-0 bg-gray-900 border border-gold-400/30 rounded-xl p-3 w-28 text-center"
          >
            <div class="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-gold-400 to-glass-orange flex items-center justify-center text-xl font-bold text-black mb-2">
              {{ fav.student?.full_name?.charAt(0)?.toUpperCase() || '?' }}
            </div>
            <p class="text-sm font-semibold text-white truncate">{{ fav.student?.full_name?.split(' ')[0] }}</p>
          </div>
        </div>
      </section>

      <!-- Emergency Contacts -->
      <section>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-lg font-bold text-white flex items-center gap-2">
            🆘 {{ language === 'es' ? 'Contactos de Emergencia' : 'Emergency Contacts' }}
          </h2>
        </div>
        
        <div v-if="emergencyContacts.length === 0" class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p class="text-gray-400 text-sm">{{ language === 'es' ? 'No hay contactos configurados' : 'No contacts configured' }}</p>
        </div>
        
        <div v-else class="space-y-2">
          <a
            v-for="contact in emergencyContacts"
            :key="contact.id"
            :href="contact.phone !== 'N/A' ? `tel:${contact.phone}` : undefined"
            class="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl p-3 hover:border-gray-700 transition-all"
            :class="{ 'cursor-default': contact.phone === 'N/A' }"
          >
            <span class="text-2xl">{{ getContactIcon(contact.role) }}</span>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-white text-sm truncate">{{ contact.name }}</p>
              <p class="text-xs text-gray-400 truncate">{{ contact.description }}</p>
            </div>
            <div v-if="contact.phone !== 'N/A'" class="flex items-center gap-1 bg-glass-green/20 text-glass-green px-2 py-1 rounded-lg">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span class="text-xs font-bold">{{ contact.phone }}</span>
            </div>
          </a>
        </div>
      </section>

      <!-- More Options -->
      <section>
        <div class="space-y-2">
          <NuxtLink 
            to="/user/tips"
            class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all"
          >
            <span class="text-2xl">📚</span>
            <div class="flex-1">
              <p class="font-semibold text-white">{{ language === 'es' ? 'Trucos & Manuales' : 'Tricks & Manuals' }}</p>
              <p class="text-xs text-gray-400">{{ language === 'es' ? 'Biblioteca de trucos' : 'Tricks library' }}</p>
            </div>
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </NuxtLink>

          <NuxtLink 
            to="/dashboard/planning"
            class="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all"
          >
            <span class="text-2xl">📝</span>
            <div class="flex-1">
              <p class="font-semibold text-white">{{ language === 'es' ? 'Planear Clase' : 'Plan Class' }}</p>
              <p class="text-xs text-gray-400">{{ language === 'es' ? 'Preparar próxima clase' : 'Prepare next class' }}</p>
            </div>
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </NuxtLink>
        </div>
      </section>
    </div>
  </div>
</template>
