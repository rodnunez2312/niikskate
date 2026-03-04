<script setup lang="ts">
const router = useRouter()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

// State
const loading = ref(true)
const profile = ref<any>(null)
const editMode = ref(false)
const saving = ref(false)

const editForm = ref({
  full_name: '',
  phone: '',
  bio: ''
})

onMounted(async () => {
  await fetchProfile()
})

const fetchProfile = async () => {
  loading.value = true
  try {
    const { data } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.value?.id)
      .single()
    
    profile.value = data
    editForm.value = {
      full_name: data?.full_name || '',
      phone: data?.phone || '',
      bio: data?.bio || ''
    }
  } catch (e) {
    console.error('Error fetching profile:', e)
  } finally {
    loading.value = false
  }
}

const saveProfile = async () => {
  saving.value = true
  try {
    await client
      .from('profiles')
      .update({
        full_name: editForm.value.full_name,
        phone: editForm.value.phone,
        bio: editForm.value.bio
      })
      .eq('id', user.value?.id)
    
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

const menuItems = computed(() => [
  {
    icon: '⚙️',
    label: language.value === 'es' ? 'Panel de Admin' : 'Admin Panel',
    path: '/admin',
    description: language.value === 'es' ? 'Gestión completa del sistema' : 'Full system management'
  },
  {
    icon: '👥',
    label: language.value === 'es' ? 'Gestión de Usuarios' : 'User Management',
    path: '/admin/users',
    description: language.value === 'es' ? 'Administrar usuarios y roles' : 'Manage users and roles'
  },
  {
    icon: '✅',
    label: language.value === 'es' ? 'Aprobaciones' : 'Approvals',
    path: '/admin/registrations',
    description: language.value === 'es' ? 'Solicitudes pendientes' : 'Pending requests'
  },
  {
    icon: '💰',
    label: language.value === 'es' ? 'Pagos' : 'Payments',
    path: '/admin/payments',
    description: language.value === 'es' ? 'Ver y registrar pagos' : 'View and record payments'
  },
  {
    icon: '📊',
    label: language.value === 'es' ? 'Reportes' : 'Reports',
    path: '/admin/reports',
    description: language.value === 'es' ? 'Reportes financieros' : 'Financial reports',
    disabled: true
  },
  {
    icon: '❓',
    label: language.value === 'es' ? 'Ayuda y Soporte' : 'Help & Support',
    path: '/support',
    description: language.value === 'es' ? 'Documentación y soporte' : 'Documentation and support',
    disabled: true
  },
])

const roleLabels: Record<string, { en: string; es: string }> = {
  admin: { en: 'Administrator', es: 'Administrador' },
  coach: { en: 'Coach', es: 'Coach' },
  customer: { en: 'Skater', es: 'Patinador' },
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gradient-to-br from-flame-600 via-glass-orange to-gold-500 px-4 pt-safe pb-24 relative overflow-hidden">
      <div class="absolute inset-0 opacity-10">
        <div class="absolute top-10 right-10 text-8xl transform rotate-12">🛹</div>
      </div>
      
      <div class="max-w-lg mx-auto relative z-10 pt-4">
        <div class="flex items-center justify-between mb-6">
          <h1 class="text-2xl font-bold text-white">{{ language === 'es' ? 'Mi Perfil' : 'My Profile' }}</h1>
          <button
            v-if="!editMode && !loading"
            @click="editMode = true"
            class="p-2 bg-white/20 rounded-lg"
          >
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>
      </div>
    </header>

    <!-- Profile Card -->
    <div class="px-4 -mt-16 max-w-lg mx-auto relative z-20">
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl">
        <!-- Loading -->
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
            <div class="w-20 h-20 rounded-full bg-gradient-to-br from-flame-600 to-gold-500 flex items-center justify-center text-3xl ring-4 ring-gold-400/30">
              {{ profile.full_name?.charAt(0)?.toUpperCase() || '🛹' }}
            </div>
            <div>
              <h2 class="text-xl font-bold text-white">{{ profile.full_name }}</h2>
              <p class="text-gray-400">{{ profile.email }}</p>
              <span class="px-3 py-1 bg-flame-600 text-white text-xs font-bold rounded-full mt-2 inline-block">
                {{ roleLabels[profile.role]?.[language] || profile.role }}
              </span>
            </div>
          </div>

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
              <span>{{ profile.phone || (language === 'es' ? 'Sin teléfono' : 'No phone') }}</span>
            </div>
            <div v-if="profile.bio" class="flex items-start gap-3 text-gray-300">
              <svg class="w-5 h-5 text-gray-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>{{ profile.bio }}</span>
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
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Teléfono' : 'Phone' }}
              </label>
              <input
                v-model="editForm.phone"
                type="tel"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Biografía' : 'Bio' }}
              </label>
              <textarea
                v-model="editForm.bio"
                rows="3"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
              ></textarea>
            </div>

            <div class="flex gap-3 pt-2">
              <button
                type="button"
                @click="editMode = false"
                class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl"
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

      <!-- Menu Items -->
      <div class="mt-6 space-y-2">
        <NuxtLink
          v-for="item in menuItems"
          :key="item.path"
          :to="item.disabled ? '#' : item.path"
          class="bg-gray-900/95 border border-gray-800 rounded-xl p-4 flex items-center gap-4 backdrop-blur-sm"
          :class="{ 'opacity-50 cursor-not-allowed': item.disabled }"
          @click.prevent="item.disabled && null"
        >
          <span class="text-2xl">{{ item.icon }}</span>
          <div class="flex-1">
            <p class="font-semibold text-white">{{ item.label }}</p>
            <p class="text-xs text-gray-500">{{ item.description }}</p>
          </div>
          <span v-if="item.disabled" class="text-xs text-gray-500">
            {{ language === 'es' ? 'Próximamente' : 'Soon' }}
          </span>
          <svg v-else class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </NuxtLink>
      </div>

      <!-- Switch to Customer View -->
      <NuxtLink
        to="/"
        class="block mt-6 p-4 bg-gray-900 border border-gray-800 rounded-xl text-center"
      >
        <p class="text-gold-400 font-semibold">
          {{ language === 'es' ? '🔄 Ver como Cliente' : '🔄 View as Customer' }}
        </p>
        <p class="text-xs text-gray-500">
          {{ language === 'es' ? 'Ver la app desde la perspectiva del cliente' : 'View the app from customer perspective' }}
        </p>
      </NuxtLink>

      <!-- Logout -->
      <button
        @click="handleLogout"
        class="w-full mt-4 p-4 text-flame-500 font-medium text-center"
      >
        {{ language === 'es' ? 'Cerrar Sesión' : 'Sign Out' }}
      </button>

      <!-- Version -->
      <p class="text-center text-gray-600 text-xs mt-4 mb-8">
        NiikSkate Academy v1.1.0 (Admin)
      </p>
    </div>
  </div>
</template>
