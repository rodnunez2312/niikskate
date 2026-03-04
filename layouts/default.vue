<script setup lang="ts">
const user = useSupabaseUser()
const client = useSupabaseClient()
const route = useRoute()
const { t, language } = useI18n()

// Fetch user profile to check role
const userRole = ref<string | null>(null)

watch(user, async (newUser) => {
  if (newUser) {
    const { data } = await client
      .from('profiles')
      .select('role')
      .eq('id', newUser.id)
      .single()
    userRole.value = data?.role || 'customer'
  } else {
    userRole.value = null
  }
}, { immediate: true })

// Check if user is admin or coach
const isAdmin = computed(() => userRole.value === 'admin')
const isCoach = computed(() => userRole.value === 'coach')
const isAdminOrCoach = computed(() => isAdmin.value || isCoach.value)

// Customer navigation
const customerNavItems = computed(() => {
  const items = [
    {
      name: t('nav.home'),
      path: '/',
      icon: 'home',
    },
    {
      name: language.value === 'es' ? 'Reservar' : 'Book',
      path: '/book',
      icon: 'calendar',
    },
    {
      name: t('nav.shop'),
      path: '/shop',
      icon: 'shopping-bag',
    },
  ]
  
  // Show different items based on auth status
  if (user.value) {
    // Logged in: show Bookings and Profile
    items.push({
      name: t('nav.bookings'),
      path: '/bookings',
      icon: 'clipboard',
    })
    items.push({
      name: t('nav.profile'),
      path: '/profile',
      icon: 'user',
    })
  } else {
    // Guest: show News and Login
    items.push({
      name: language.value === 'es' ? 'Noticias' : 'News',
      path: '/news',
      icon: 'news',
    })
    items.push({
      name: language.value === 'es' ? 'Entrar' : 'Login',
      path: '/auth/login',
      icon: 'login',
    })
  }
  
  return items
})

// Admin navigation (includes Store + Evaluations - everything coach has plus Store)
const adminNavItems = computed(() => [
  {
    name: language.value === 'es' ? 'Inicio' : 'Home',
    path: '/dashboard',
    icon: 'home',
  },
  {
    name: language.value === 'es' ? 'Alumnos' : 'Students',
    path: '/dashboard/students',
    icon: 'students',
  },
  {
    name: language.value === 'es' ? 'Tienda' : 'Store',
    path: '/dashboard/store',
    icon: 'store',
  },
  {
    name: language.value === 'es' ? 'Evals' : 'Evals',
    path: '/coach/evaluations',
    icon: 'clipboard',
  },
  {
    name: language.value === 'es' ? 'Clases' : 'Classes',
    path: '/dashboard/planning',
    icon: 'planning',
  },
  {
    name: language.value === 'es' ? 'Perfil' : 'Profile',
    path: '/dashboard/profile',
    icon: 'user',
  },
])

// Coach navigation (NO Store access)
const coachNavItems = computed(() => [
  {
    name: language.value === 'es' ? 'Inicio' : 'Home',
    path: '/coach',
    icon: 'home',
  },
  {
    name: language.value === 'es' ? 'Asistencia' : 'Attendance',
    path: '/dashboard/students',
    icon: 'students',
  },
  {
    name: language.value === 'es' ? 'Evaluaciones' : 'Evaluations',
    path: '/coach/evaluations',
    icon: 'clipboard',
  },
  {
    name: language.value === 'es' ? 'Clases' : 'Classes',
    path: '/dashboard/planning',
    icon: 'planning',
  },
  {
    name: language.value === 'es' ? 'Perfil' : 'Profile',
    path: '/dashboard/profile',
    icon: 'user',
  },
])

const navItems = computed(() => {
  if (isAdmin.value) return adminNavItems.value
  if (isCoach.value) return coachNavItems.value
  return customerNavItems.value
})

const isActive = (path: string) => {
  if (path === '/' || path === '/dashboard' || path === '/coach') {
    return route.path === '/' || route.path === '/dashboard' || route.path === '/coach'
  }
  return route.path.startsWith(path)
}
</script>

<template>
  <div class="min-h-screen">
    <!-- Main content -->
    <main class="pb-20">
      <slot />
    </main>

    <!-- Bottom Navigation -->
    <nav class="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 pb-safe z-50">
      <div class="flex items-center justify-around h-16 max-w-lg mx-auto">
        <NuxtLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex flex-col items-center justify-center w-full h-full touch-feedback"
          :class="[
            isActive(item.path)
              ? 'text-gold-400'
              : 'text-gray-500 hover:text-gray-400'
          ]"
        >
          <!-- Home Icon -->
          <svg v-if="item.icon === 'home'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          
          <!-- Calendar Icon -->
          <svg v-else-if="item.icon === 'calendar'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          
          <!-- Shopping Bag Icon -->
          <svg v-else-if="item.icon === 'shopping-bag'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007ZM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
          </svg>
          
          <!-- Clipboard Icon -->
          <svg v-else-if="item.icon === 'clipboard'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
          </svg>
          
          <!-- User Icon -->
          <svg v-else-if="item.icon === 'user'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
          </svg>
          
          <!-- News Icon -->
          <svg v-else-if="item.icon === 'news'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 7.5h1.5m-1.5 3h1.5m-7.5 3h7.5m-7.5 3h7.5m3-9h3.375c.621 0 1.125.504 1.125 1.125V18a2.25 2.25 0 0 1-2.25 2.25M16.5 7.5V18a2.25 2.25 0 0 0 2.25 2.25M16.5 7.5V4.875c0-.621-.504-1.125-1.125-1.125H4.125C3.504 3.75 3 4.254 3 4.875V18a2.25 2.25 0 0 0 2.25 2.25h13.5M6 7.5h3v3H6v-3Z" />
          </svg>
          
          <!-- Login Icon -->
          <svg v-else-if="item.icon === 'login'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
          </svg>
          
          <!-- Students Icon -->
          <svg v-else-if="item.icon === 'students'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
          
          <!-- Store Admin Icon -->
          <svg v-else-if="item.icon === 'store'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
          </svg>
          
          <!-- Planning Icon -->
          <svg v-else-if="item.icon === 'planning'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
          </svg>
          
          <span class="text-xs font-medium">{{ item.name }}</span>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>
