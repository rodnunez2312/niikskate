<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { User } from '~/types'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

// State
const isAdmin = ref(false)
const loading = ref(true)
const users = ref<User[]>([])
const selectedRole = ref<'all' | 'admin' | 'coach' | 'customer'>('all')
const searchQuery = ref('')

// Edit modal
const showEditModal = ref(false)
const editingUser = ref<User | null>(null)
const newRole = ref<'admin' | 'coach' | 'customer'>('customer')
const saving = ref(false)

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/admin/users')
    return
  }

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
  await loadUsers()
})

const loadUsers = async () => {
  loading.value = true
  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    users.value = data || []
  } catch (e) {
    console.error('Error loading users:', e)
  } finally {
    loading.value = false
  }
}

// Filter users
const filteredUsers = computed(() => {
  return users.value.filter(u => {
    if (selectedRole.value !== 'all' && u.role !== selectedRole.value) return false
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      return u.full_name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
    }
    return true
  })
})

// Counts
const counts = computed(() => ({
  all: users.value.length,
  admin: users.value.filter(u => u.role === 'admin').length,
  coach: users.value.filter(u => u.role === 'coach').length,
  customer: users.value.filter(u => u.role === 'customer').length,
}))

// Open edit modal
const openEditModal = (userToEdit: User) => {
  editingUser.value = userToEdit
  newRole.value = userToEdit.role as any
  showEditModal.value = true
}

// Save user role
const saveUserRole = async () => {
  if (!editingUser.value) return
  
  saving.value = true
  try {
    const { error } = await client
      .from('profiles')
      .update({ role: newRole.value })
      .eq('id', editingUser.value.id)

    if (error) throw error

    showEditModal.value = false
    editingUser.value = null
    await loadUsers()
  } catch (e) {
    console.error('Error updating user:', e)
  } finally {
    saving.value = false
  }
}

// Toggle user active status
const toggleUserStatus = async (userToToggle: User) => {
  try {
    const { error } = await client
      .from('profiles')
      .update({ is_active: !userToToggle.is_active })
      .eq('id', userToToggle.id)

    if (error) throw error
    await loadUsers()
  } catch (e) {
    console.error('Error toggling user status:', e)
  }
}

// Format date
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const locale = language.value === 'es' ? es : undefined
  return format(date, 'dd MMM yyyy', { locale })
}

// Role labels
const roleLabels: Record<string, { icon: string; color: string; label: { en: string; es: string } }> = {
  admin: { icon: '👑', color: 'bg-flame-600 text-white', label: { en: 'Admin', es: 'Admin' } },
  coach: { icon: '🎓', color: 'bg-gold-400 text-black', label: { en: 'Coach', es: 'Coach' } },
  customer: { icon: '🛹', color: 'bg-glass-blue text-white', label: { en: 'Skater', es: 'Patinador' } },
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center gap-3">
          <button @click="router.push('/admin')" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl font-bold text-white">
              {{ language === 'es' ? 'Usuarios' : 'Users' }}
            </h1>
            <p class="text-sm text-gray-400">{{ language === 'es' ? 'Gestionar usuarios y permisos' : 'Manage users and permissions' }}</p>
          </div>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div v-if="isAdmin" class="px-4 py-6 max-w-2xl mx-auto">
      <!-- Search -->
      <div class="relative mb-4">
        <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="language === 'es' ? 'Buscar usuarios...' : 'Search users...'"
          class="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
        />
      </div>

      <!-- Role Tabs -->
      <div class="flex gap-2 mb-6 overflow-x-auto pb-2">
        <button
          @click="selectedRole = 'all'"
          class="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-2"
          :class="selectedRole === 'all' ? 'bg-white text-black' : 'bg-gray-800 text-gray-400'"
        >
          {{ language === 'es' ? 'Todos' : 'All' }}
          <span class="px-1.5 py-0.5 rounded text-xs" :class="selectedRole === 'all' ? 'bg-black/20' : 'bg-gray-700'">
            {{ counts.all }}
          </span>
        </button>
        <button
          @click="selectedRole = 'admin'"
          class="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-2"
          :class="selectedRole === 'admin' ? 'bg-flame-600 text-white' : 'bg-gray-800 text-gray-400'"
        >
          👑 Admin
          <span class="px-1.5 py-0.5 rounded text-xs" :class="selectedRole === 'admin' ? 'bg-white/20' : 'bg-gray-700'">
            {{ counts.admin }}
          </span>
        </button>
        <button
          @click="selectedRole = 'coach'"
          class="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-2"
          :class="selectedRole === 'coach' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
        >
          🎓 Coach
          <span class="px-1.5 py-0.5 rounded text-xs" :class="selectedRole === 'coach' ? 'bg-black/20' : 'bg-gray-700'">
            {{ counts.coach }}
          </span>
        </button>
        <button
          @click="selectedRole = 'customer'"
          class="px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-2"
          :class="selectedRole === 'customer' ? 'bg-glass-blue text-white' : 'bg-gray-800 text-gray-400'"
        >
          🛹 {{ language === 'es' ? 'Patinadores' : 'Skaters' }}
          <span class="px-1.5 py-0.5 rounded text-xs" :class="selectedRole === 'customer' ? 'bg-white/20' : 'bg-gray-700'">
            {{ counts.customer }}
          </span>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-12">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>

      <!-- Users List -->
      <div v-else-if="filteredUsers.length === 0" class="text-center py-12">
        <p class="text-4xl mb-3">👥</p>
        <p class="text-gray-400">{{ language === 'es' ? 'No se encontraron usuarios' : 'No users found' }}</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="u in filteredUsers"
          :key="u.id"
          class="bg-gray-900 border border-gray-800 rounded-xl p-4"
          :class="{ 'opacity-50': !u.is_active }"
        >
          <div class="flex items-center gap-3">
            <!-- Avatar -->
            <div 
              class="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
              :class="u.role === 'admin' ? 'bg-flame-600' : u.role === 'coach' ? 'bg-gold-400' : 'bg-glass-blue'"
            >
              {{ u.full_name.charAt(0).toUpperCase() }}
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <p class="font-semibold text-white truncate">{{ u.full_name }}</p>
                <span :class="['px-2 py-0.5 rounded-full text-xs font-bold', roleLabels[u.role]?.color]">
                  {{ roleLabels[u.role]?.icon }} {{ roleLabels[u.role]?.label[language] }}
                </span>
              </div>
              <p class="text-sm text-gray-400 truncate">{{ u.email }}</p>
              <p class="text-xs text-gray-500">{{ language === 'es' ? 'Desde' : 'Since' }} {{ formatDate(u.created_at) }}</p>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2">
              <button
                @click="toggleUserStatus(u)"
                class="p-2 rounded-lg transition-all"
                :class="u.is_active ? 'bg-glass-green/20 text-glass-green' : 'bg-gray-800 text-gray-500'"
                :title="u.is_active ? 'Deactivate' : 'Activate'"
              >
                <svg v-if="u.is_active" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button
                @click="openEditModal(u)"
                class="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-all"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <Teleport to="body">
      <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/80" @click="showEditModal = false"></div>
        <div class="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full">
          <h3 class="text-xl font-bold text-white mb-2">
            {{ language === 'es' ? 'Editar Usuario' : 'Edit User' }}
          </h3>
          <p class="text-gray-400 mb-4">{{ editingUser?.full_name }} ({{ editingUser?.email }})</p>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-300 mb-2">
              {{ language === 'es' ? 'Rol' : 'Role' }}
            </label>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                @click="newRole = 'customer'"
                class="py-3 rounded-xl font-semibold transition-all flex flex-col items-center gap-1"
                :class="newRole === 'customer' ? 'bg-glass-blue text-white' : 'bg-gray-800 text-gray-400'"
              >
                <span class="text-xl">🛹</span>
                <span class="text-xs">{{ language === 'es' ? 'Patinador' : 'Skater' }}</span>
              </button>
              <button
                type="button"
                @click="newRole = 'coach'"
                class="py-3 rounded-xl font-semibold transition-all flex flex-col items-center gap-1"
                :class="newRole === 'coach' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
              >
                <span class="text-xl">🎓</span>
                <span class="text-xs">Coach</span>
              </button>
              <button
                type="button"
                @click="newRole = 'admin'"
                class="py-3 rounded-xl font-semibold transition-all flex flex-col items-center gap-1"
                :class="newRole === 'admin' ? 'bg-flame-600 text-white' : 'bg-gray-800 text-gray-400'"
              >
                <span class="text-xl">👑</span>
                <span class="text-xs">Admin</span>
              </button>
            </div>
          </div>

          <div class="flex gap-3">
            <button
              @click="showEditModal = false"
              class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl"
            >
              {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
            </button>
            <button
              @click="saveUserRole"
              :disabled="saving"
              class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50"
            >
              {{ saving ? '...' : (language === 'es' ? 'Guardar' : 'Save') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
