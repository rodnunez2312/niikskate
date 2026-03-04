<script setup lang="ts">
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import type { GuestBooking, StudentProgress, Skill } from '~/types'

const router = useRouter()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { language, t, currency } = useI18n()

interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  phone?: string
  role: string
  bio?: string
  specialties?: string[]
}

const profile = ref<Profile | null>(null)
const loading = ref(true)
const saving = ref(false)
const editMode = ref(false)
const activeTab = ref<'overview' | 'bookings' | 'progress'>('overview')

// Booking data
const bookings = ref<GuestBooking[]>([])
const loadingBookings = ref(false)

// Progress data
const progress = ref<StudentProgress[]>([])
const skills = ref<Skill[]>([])
const loadingProgress = ref(false)

const editForm = ref({
  full_name: '',
  phone: '',
})

// Redirect guests to news page
watch(user, (newUser) => {
  if (!newUser) {
    router.push('/news')
  }
}, { immediate: true })

onMounted(async () => {
  if (user.value) {
    await Promise.all([
      fetchProfile(),
      fetchBookings(),
      fetchProgress()
    ])
  }
})


const fetchProfile = async () => {
  loading.value = true
  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.value?.id)
      .single()

    if (error) throw error
    profile.value = data
    editForm.value = {
      full_name: data.full_name || '',
      phone: data.phone || '',
    }
  } catch (e) {
    console.error('Error fetching profile:', e)
  } finally {
    loading.value = false
  }
}

const fetchBookings = async () => {
  loadingBookings.value = true
  try {
    // Fetch from guest_bookings (where bookings are stored)
    const { data, error } = await client
      .from('guest_bookings')
      .select('*')
      .eq('linked_user_id', user.value?.id)
      .order('created_at', { ascending: false })

    if (error) throw error
    bookings.value = data || []
    
    // Also check localStorage for any unlinked bookings
    const localBookings = JSON.parse(localStorage.getItem('guest_bookings') || '[]')
    const userEmail = user.value?.email
    const unlinkedBookings = localBookings.filter((b: any) => 
      b.email === userEmail && !bookings.value.some((db: any) => db.id === b.id)
    )
    
    // Merge unlinked bookings
    if (unlinkedBookings.length > 0) {
      bookings.value = [...bookings.value, ...unlinkedBookings]
    }
  } catch (e) {
    console.error('Error fetching bookings:', e)
  } finally {
    loadingBookings.value = false
  }
}

const fetchProgress = async () => {
  loadingProgress.value = true
  try {
    // Fetch skills learned
    const { data: progressData, error: progressError } = await client
      .from('student_progress')
      .select(`
        *,
        skill:skills_library(*)
      `)
      .eq('student_id', user.value?.id)
      .order('learned_at', { ascending: false })

    if (progressError) throw progressError
    progress.value = progressData || []
    
    // Fetch all skills for reference
    const { data: skillsData } = await client
      .from('skills_library')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    
    skills.value = skillsData || []
  } catch (e) {
    console.error('Error fetching progress:', e)
  } finally {
    loadingProgress.value = false
  }
}

const saveProfile = async () => {
  saving.value = true
  try {
    const { error } = await client
      .from('profiles')
      .update({
        full_name: editForm.value.full_name,
        phone: editForm.value.phone,
      })
      .eq('id', user.value?.id)

    if (error) throw error
    
    await fetchProfile()
    editMode.value = false
  } catch (e) {
    console.error('Error saving profile:', e)
  } finally {
    saving.value = false
  }
}

const handleLogout = async () => {
  await client.auth.signOut()
  router.push('/')
}

// Computed: Stats for this month
const monthlyStats = computed(() => {
  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)
  
  const thisMonthBookings = bookings.value.filter(b => {
    const bookingDate = new Date(b.created_at)
    return bookingDate >= monthStart && bookingDate <= monthEnd
  })
  
  return {
    classes_this_month: thisMonthBookings.length,
    classes_total: bookings.value.length,
    skills_learned: progress.value.length,
    total_skills: skills.value.length
  }
})

// Computed: Progress percentage
const progressPercentage = computed(() => {
  if (skills.value.length === 0) return 0
  return Math.round((progress.value.length / skills.value.length) * 100)
})

// Menu items based on role
const menuItems = computed(() => {
  const items = []

  // Reservations (use credits to book)
  items.push({
    icon: '🎫',
    label: language.value === 'es' ? 'Mis Reservas' : 'My Reservations',
    path: '/user/reservations',
    disabled: false,
    highlight: true,
  })

  // User dashboard items
  items.push({
    icon: '📈',
    label: language.value === 'es' ? 'Mi Progreso' : 'My Progress',
    path: '/user/progress',
    disabled: false,
  })
  
  items.push({
    icon: '📚',
    label: language.value === 'es' ? 'Tips & Trucos' : 'Tips & Tricks',
    path: '/user/tips',
    disabled: false,
  })
  
  items.push({
    icon: '📰',
    label: language.value === 'es' ? 'Noticias' : 'News',
    path: '/user/news',
    disabled: false,
  })

  // Add coach links
  if (profile.value?.role === 'coach' || profile.value?.role === 'admin') {
    items.push({
      icon: '📅',
      label: language.value === 'es' ? 'Mi Disponibilidad' : 'My Availability',
      path: '/coach/availability',
      disabled: false,
    })
    items.push({
      icon: '📋',
      label: language.value === 'es' ? 'Planeación de Clases' : 'Class Planning',
      path: '/coach/planning',
      disabled: false,
    })
    items.push({
      icon: '👨‍🎓',
      label: language.value === 'es' ? 'Mis Estudiantes' : 'My Students',
      path: '/coach/students',
      disabled: false,
    })
  }

  // Add admin links
  if (profile.value?.role === 'admin') {
    items.push({
      icon: '⚙️',
      label: language.value === 'es' ? 'Panel de Admin' : 'Admin Dashboard',
      path: '/admin',
      disabled: false,
    })
  }

  items.push({
    icon: '❓',
    label: language.value === 'es' ? 'Ayuda y Soporte' : 'Help & Support',
    path: '/support',
    disabled: true,
  })

  return items
})

const roleLabels: Record<string, { en: string; es: string }> = {
  admin: { en: 'Administrator', es: 'Administrador' },
  coach: { en: 'Coach', es: 'Coach' },
  customer: { en: 'Skater', es: 'Patinador' },
}

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-flame-600 text-white',
  coach: 'bg-gold-400 text-black',
  customer: 'bg-glass-blue text-white',
}

// Format booking date
const formatBookingDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const locale = language.value === 'es' ? es : undefined
  return format(date, 'dd MMM yyyy', { locale })
}
</script>

<template>
  <div class="min-h-screen bg-black">
    <!-- Header -->
      <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white px-4 pt-safe pb-24 rounded-b-3xl relative overflow-hidden">
        <!-- Background decoration -->
        <div class="absolute inset-0 opacity-10">
          <div class="absolute top-10 right-10 text-8xl transform rotate-12">🛹</div>
        </div>
        
        <div class="max-w-lg mx-auto relative z-10 pt-4">
          <div class="flex items-center justify-between mb-6">
            <h1 class="text-2xl font-bold">{{ language === 'es' ? 'Perfil' : 'Profile' }}</h1>
            <button
              v-if="!editMode && !loading"
              @click="editMode = true"
              class="text-white/80 hover:text-white"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <!-- Profile Card -->
      <div class="px-4 -mt-16 max-w-lg mx-auto pb-24 relative z-20">
        <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
          <!-- Loading State -->
          <div v-if="loading" class="animate-pulse">
            <div class="flex items-center gap-4 mb-4">
              <div class="w-20 h-20 rounded-full bg-gray-800"></div>
              <div class="space-y-2">
                <div class="h-5 bg-gray-800 rounded w-32"></div>
                <div class="h-4 bg-gray-800 rounded w-48"></div>
              </div>
            </div>
          </div>

          <!-- Profile Info -->
          <template v-else-if="profile && !editMode">
          <div class="flex items-center gap-4 mb-6">
            <div class="w-20 h-20 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-3xl ring-4 ring-gold-400/30">
              {{ profile.full_name?.charAt(0)?.toUpperCase() || '🛹' }}
            </div>
            <div>
              <h2 class="text-xl font-bold text-white">{{ profile.full_name }}</h2>
              <p class="text-gray-400">{{ profile.email }}</p>
              <span :class="['px-3 py-1 rounded-full text-xs font-bold mt-2 inline-block', roleBadgeColors[profile.role] || 'bg-gray-700 text-white']">
                {{ roleLabels[profile.role]?.[language] || profile.role }}
              </span>
            </div>
          </div>

          <!-- Quick Stats -->
          <div class="grid grid-cols-3 gap-3 mb-6">
            <div class="bg-gray-800 rounded-xl p-3 text-center">
              <p class="text-2xl font-bold text-gold-400">{{ monthlyStats.classes_this_month }}</p>
              <p class="text-xs text-gray-400">{{ language === 'es' ? 'Este mes' : 'This month' }}</p>
            </div>
            <div class="bg-gray-800 rounded-xl p-3 text-center">
              <p class="text-2xl font-bold text-glass-green">{{ monthlyStats.classes_total }}</p>
              <p class="text-xs text-gray-400">{{ language === 'es' ? 'Total clases' : 'Total classes' }}</p>
            </div>
            <div class="bg-gray-800 rounded-xl p-3 text-center">
              <p class="text-2xl font-bold text-glass-purple">{{ monthlyStats.skills_learned }}</p>
              <p class="text-xs text-gray-400">{{ language === 'es' ? 'Trucos' : 'Skills' }}</p>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="mb-6">
            <div class="flex justify-between text-sm mb-2">
              <span class="text-gray-400">{{ language === 'es' ? 'Progreso general' : 'Overall progress' }}</span>
              <span class="text-gold-400 font-bold">{{ progressPercentage }}%</span>
            </div>
            <div class="h-3 bg-gray-800 rounded-full overflow-hidden">
              <div 
                class="h-full bg-gradient-to-r from-gold-400 to-gold-600 rounded-full transition-all duration-500"
                :style="{ width: `${progressPercentage}%` }"
              ></div>
            </div>
          </div>

          <!-- Contact Info -->
          <div class="space-y-3 border-t border-gray-800 pt-4">
            <div class="flex items-center gap-3 text-gray-300">
              <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>{{ profile.email }}</span>
            </div>
            <div class="flex items-center gap-3 text-gray-300">
              <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span>{{ profile.phone || (language === 'es' ? 'Sin teléfono' : 'No phone added') }}</span>
            </div>
          </div>
        </template>

        <!-- Edit Form -->
        <template v-else-if="editMode">
          <form @submit.prevent="saveProfile" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Nombre completo' : 'Full Name' }}
              </label>
              <input
                v-model="editForm.full_name"
                type="text"
                required
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none"
                :placeholder="language === 'es' ? 'Tu nombre completo' : 'Your full name'"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Teléfono' : 'Phone' }}
              </label>
              <input
                v-model="editForm.phone"
                type="tel"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none"
                :placeholder="language === 'es' ? 'Tu número de teléfono' : 'Your phone number'"
              />
            </div>

            <div class="flex gap-3 pt-2">
              <button
                type="button"
                @click="editMode = false"
                class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl hover:bg-gray-700 transition-all"
              >
                {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
              </button>
              <button
                type="submit"
                :disabled="saving"
                class="flex-1 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold rounded-xl"
              >
                {{ saving ? (language === 'es' ? 'Guardando...' : 'Saving...') : (language === 'es' ? 'Guardar' : 'Save') }}
              </button>
            </div>
          </form>
        </template>
      </div>

      <!-- Tabs -->
      <div class="flex gap-2 mt-6 mb-4">
        <button
          @click="activeTab = 'overview'"
          class="flex-1 py-2 px-4 rounded-xl font-semibold transition-all text-sm"
          :class="activeTab === 'overview' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
        >
          {{ language === 'es' ? 'General' : 'Overview' }}
        </button>
        <button
          @click="activeTab = 'bookings'"
          class="flex-1 py-2 px-4 rounded-xl font-semibold transition-all text-sm"
          :class="activeTab === 'bookings' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
        >
          {{ language === 'es' ? 'Reservas' : 'Bookings' }}
        </button>
        <button
          @click="activeTab = 'progress'"
          class="flex-1 py-2 px-4 rounded-xl font-semibold transition-all text-sm"
          :class="activeTab === 'progress' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
        >
          {{ language === 'es' ? 'Progreso' : 'Progress' }}
        </button>
      </div>

      <!-- Tab Content: Overview -->
      <div v-if="activeTab === 'overview'" class="space-y-2">
        <NuxtLink
          v-for="item in menuItems"
          :key="item.path"
          :to="item.disabled ? '#' : item.path"
          class="rounded-xl p-4 flex items-center gap-4"
          :class="[
            item.disabled 
              ? 'bg-gray-900 border border-gray-800 opacity-50 cursor-not-allowed' 
              : item.highlight 
                ? 'bg-gradient-to-r from-gold-400/20 to-glass-orange/20 border-2 border-gold-400/50'
                : 'bg-gray-900 border border-gray-800'
          ]"
          @click.prevent="item.disabled && null"
        >
          <span class="text-2xl">{{ item.icon }}</span>
          <span class="font-medium text-white flex-1">{{ item.label }}</span>
          <span v-if="item.disabled" class="text-xs text-gray-500">{{ language === 'es' ? 'Próximamente' : 'Coming soon' }}</span>
          <span v-else-if="item.highlight" class="px-2 py-1 bg-gold-400 text-black text-xs font-bold rounded-full">
            {{ language === 'es' ? 'Usar créditos' : 'Use credits' }}
          </span>
          <svg v-else class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </NuxtLink>
      </div>

      <!-- Tab Content: Bookings -->
      <div v-else-if="activeTab === 'bookings'" class="space-y-3">
        <div v-if="loadingBookings" class="text-center py-8">
          <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
        </div>
        
        <div v-else-if="bookings.length === 0" class="text-center py-8">
          <p class="text-4xl mb-3">📅</p>
          <p class="text-gray-400">{{ language === 'es' ? 'No tienes reservas aún' : 'No bookings yet' }}</p>
          <NuxtLink to="/book" class="inline-block mt-4 px-6 py-2 bg-gold-400 text-black font-bold rounded-xl">
            {{ language === 'es' ? 'Reservar Clase' : 'Book a Class' }}
          </NuxtLink>
        </div>
        
        <div v-else v-for="booking in bookings" :key="booking.id" class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="flex items-start justify-between mb-2">
            <div>
              <h4 class="font-bold text-white">{{ booking.booking_data?.class_name || 'Class' }}</h4>
              <p class="text-sm text-gray-400">{{ formatBookingDate(booking.created_at) }}</p>
            </div>
            <span class="px-2 py-1 bg-glass-green/20 text-glass-green text-xs font-bold rounded-full">
              {{ language === 'es' ? 'Reservado' : 'Booked' }}
            </span>
          </div>
          <div class="flex items-center gap-4 text-sm text-gray-400">
            <span>🕐 {{ booking.booking_data?.session === 'early' ? '5:30 PM' : '7:00 PM' }}</span>
            <span v-if="booking.booking_data?.equipment?.length">
              🛡️ {{ booking.booking_data.equipment.length }} {{ language === 'es' ? 'equipos' : 'items' }}
            </span>
          </div>
        </div>
      </div>

      <!-- Tab Content: Progress -->
      <div v-else-if="activeTab === 'progress'" class="space-y-3">
        <div v-if="loadingProgress" class="text-center py-8">
          <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
        </div>
        
        <div v-else-if="progress.length === 0" class="text-center py-8">
          <p class="text-4xl mb-3">🎯</p>
          <p class="text-gray-400">{{ language === 'es' ? 'Aún no tienes trucos aprendidos' : 'No skills learned yet' }}</p>
          <p class="text-sm text-gray-500 mt-2">{{ language === 'es' ? 'Tus coaches marcarán tu progreso' : 'Your coaches will mark your progress' }}</p>
        </div>
        
        <div v-else v-for="item in progress" :key="item.id" class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-glass-green flex items-center justify-center">
              <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="flex-1">
              <h4 class="font-bold text-white">{{ language === 'es' ? item.skill?.name_es || item.skill?.name : item.skill?.name }}</h4>
              <p class="text-sm text-gray-400">{{ formatBookingDate(item.learned_at) }}</p>
            </div>
            <div class="flex gap-1">
              <span v-for="i in 5" :key="i" class="text-sm" :class="i <= item.proficiency ? 'text-gold-400' : 'text-gray-600'">★</span>
            </div>
          </div>
        </div>
        
        <NuxtLink 
          to="/user/progress" 
          class="block text-center py-3 text-gold-400 font-semibold"
        >
          {{ language === 'es' ? 'Ver todo mi progreso →' : 'View all my progress →' }}
        </NuxtLink>
      </div>

      <!-- Logout Button -->
      <button
        @click="handleLogout"
        class="w-full mt-6 p-4 text-flame-500 font-medium text-center"
      >
        {{ language === 'es' ? 'Cerrar Sesión' : 'Sign Out' }}
      </button>

      <!-- App Version -->
      <p class="text-center text-gray-600 text-xs mt-4 mb-8">
        NiikSkate Academy v1.1.0
      </p>
    </div>
  </div>
</template>
