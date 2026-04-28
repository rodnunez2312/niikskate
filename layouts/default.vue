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
      name: t('nav.book'),
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
      name: t('nav.news'),
      path: '/news',
      icon: 'news',
    })
    items.push({
      name: t('nav.login'),
      path: '/auth/login',
      icon: 'login',
    })
  }
  
  return items
})

// Admin navigation (Tienda opens from Perfil → Pagos y tienda; same items as coach + profile)
const adminNavItems = computed(() => [
  {
    name: language.value === 'es' ? 'Inicio' : 'Home',
    path: '/dashboard',
    icon: 'star',
  },
  {
    name: language.value === 'es' ? 'Patinadores' : 'Skaters',
    path: '/dashboard/students',
    icon: 'students',
  },
  {
    name: language.value === 'es' ? 'Coaching' : 'Coaching',
    path: '/dashboard/planning',
    icon: 'coaching',
  },
  {
    name: 'Program',
    path: '/dashboard/skills',
    icon: 'skate-program',
  },
  {
    name: language.value === 'es' ? 'Perfil' : 'Profile',
    path: '/dashboard/profile',
    icon: 'user',
  },
])

// Coach navigation (NO Store access) — Inicio goes to dashboard (same as image)
const coachNavItems = computed(() => [
  {
    name: language.value === 'es' ? 'Inicio' : 'Home',
    path: '/dashboard',
    icon: 'star',
  },
  {
    name: language.value === 'es' ? 'Patinadores' : 'Skaters',
    path: '/dashboard/students',
    icon: 'students',
  },
  {
    name: language.value === 'es' ? 'Coaching' : 'Coaching',
    path: '/dashboard/planning',
    icon: 'coaching',
  },
  {
    name: 'Program',
    path: '/dashboard/skills',
    icon: 'skate-program',
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
          <!-- Home Icon (guest / customer) -->
          <svg v-if="item.icon === 'home'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>

          <!-- Star (coach / admin dashboard home) -->
          <svg v-else-if="item.icon === 'star'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.562.562 0 00.475-.345L11.48 3.5Z" />
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
          
          <!-- Skaters: skate helmet -->
          <svg v-else-if="item.icon === 'students'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 14.25c0-4.25 2.6-8 6-8.25 3.4.25 6 4 6 8.25V16a2 2 0 01-2 2H8a2 2 0 01-2-2v-1.75z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7.25 16.75c1.15-.85 2.75-1.25 4.75-1.25s3.6.4 4.75 1.25" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 9.75h4M12 7.75v4" />
          </svg>
          
          <!-- Store Admin Icon -->
          <svg v-else-if="item.icon === 'store'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
          </svg>
          
          <!-- Coaching: checklist -->
          <svg v-else-if="item.icon === 'coaching'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5.25H5.25A2.25 2.25 0 003 7.5v12.75A2.25 2.25 0 005.25 22.5h11.25a2.25 2.25 0 002.25-2.25V9.75L14.25 5.25H9z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.25 5.25v4.5H18.75M9 12.75l1.5 1.5L13.5 11M9 16.5h6M9 19.5h4.5" />
          </svg>
          
          <!-- Skills (groups / target) Icon -->
          <svg v-else-if="item.icon === 'skills'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
          </svg>

          <!-- Program: skateboard (deck + trucks + wheels) -->
          <svg v-else-if="item.icon === 'skate-program'" class="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.5 12.75c1.35 2.4 4.05 3.75 7.5 3.75s6.15-1.35 7.5-3.75" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5.25 11.25h13.5a.75.75 0 01.53 1.28l-1.06 1.06a.75.75 0 01-.53.22H6.11a.75.75 0 01-.53-.22l-1.06-1.06a.75.75 0 01.53-1.28z" />
            <circle cx="7.75" cy="16.25" r="1.35" fill="none" stroke="currentColor" stroke-width="1.5" />
            <circle cx="16.25" cy="16.25" r="1.35" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6.75 9.75L5.25 7.5M17.25 9.75l1.5-2.25" />
          </svg>
          
          <span class="text-xs font-medium">{{ item.name }}</span>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>
