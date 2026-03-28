<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { User } from '~/types'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const route = useRoute()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

// State
const isAdmin = ref(false)
const loading = ref(true)
const users = ref<User[]>([])
const selectedRole = ref<'all' | 'admin' | 'coach' | 'customer'>('customer')
const searchQuery = ref('')

const skillGroups = ref<Array<{ id: string; name: string; sort_order: number }>>([])
const programsList = ref<Array<{ id: string; name: string }>>([])
const programByStudent = ref<Record<string, string>>({})

const expandedSkaterId = ref<string | null>(null)
const skaterDraft = ref({
  skill_group_id: '' as string,
  program_id: '' as string,
  start: '09:00',
  end: '17:00',
  days: [1, 2, 3, 4, 5] as number[],
})
const savingSkaterId = ref<string | null>(null)

// Edit modal
const showEditModal = ref(false)
const editingUser = ref<User | null>(null)
const newRole = ref<'admin' | 'coach' | 'customer'>('customer')
const saving = ref(false)

// Add user modal
const showAddModal = ref(false)
const addUserSaving = ref(false)
const addUserError = ref('')
const newUserForm = ref({
  email: '',
  password: '',
  full_name: '',
  phone: '',
  role: 'customer' as 'admin' | 'coach' | 'customer',
})

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
  // If opened from Patinadores card (?role=customer), filter to customers
  const roleFromQuery = route.query.role as string
  if (roleFromQuery && ['admin', 'coach', 'customer'].includes(roleFromQuery)) {
    selectedRole.value = roleFromQuery as any
  }
  await Promise.all([loadUsers(), loadSkaterMeta()])
})

const loadSkaterMeta = async () => {
  try {
    const [g, p, ps] = await Promise.all([
      client.from('skill_groups').select('id,name,sort_order').order('sort_order'),
      client.from('programs').select('id,name').eq('is_active', true).order('name'),
      client.from('program_students').select('student_id, program_id'),
    ])
    skillGroups.value = (g.data || []) as typeof skillGroups.value
    programsList.value = (p.data || []) as typeof programsList.value
    const map: Record<string, string> = {}
    for (const row of ps.data || []) {
      const r = row as { student_id: string; program_id: string }
      map[r.student_id] = r.program_id
    }
    programByStudent.value = map
  } catch (e) {
    console.error('loadSkaterMeta:', e)
  }
}

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

// Add user
const openAddModal = () => {
  newUserForm.value = { email: '', password: '', full_name: '', phone: '', role: 'customer' }
  addUserError.value = ''
  showAddModal.value = true
}

const closeAddModal = () => {
  showAddModal.value = false
  addUserError.value = ''
}

const submitAddUser = async () => {
  addUserError.value = ''
  if (!newUserForm.value.email?.trim()) {
    addUserError.value = language.value === 'es' ? 'El email es obligatorio' : 'Email is required'
    return
  }
  if (!newUserForm.value.password || newUserForm.value.password.length < 6) {
    addUserError.value = language.value === 'es' ? 'La contraseña debe tener al menos 6 caracteres' : 'Password must be at least 6 characters'
    return
  }

  addUserSaving.value = true
  try {
    await $fetch('/api/admin/create-user', {
      method: 'POST',
      body: {
        email: newUserForm.value.email.trim(),
        password: newUserForm.value.password,
        full_name: newUserForm.value.full_name.trim() || undefined,
        phone: newUserForm.value.phone.trim() || undefined,
        role: newUserForm.value.role,
      },
    })
    closeAddModal()
    await loadUsers()
  } catch (e: any) {
    const msg = e?.data?.message || e?.message || 'Error creating user'
    addUserError.value = msg
  } finally {
    addUserSaving.value = false
  }
}

// Format date
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const locale = language.value === 'es' ? es : undefined
  return format(date, 'dd MMM yyyy', { locale })
}

const weekdayToggles = computed(() => {
  const es = language.value === 'es'
  return [
    { v: 1, label: es ? 'L' : 'M' },
    { v: 2, label: es ? 'M' : 'T' },
    { v: 3, label: es ? 'X' : 'W' },
    { v: 4, label: es ? 'J' : 'Th' },
    { v: 5, label: es ? 'V' : 'F' },
    { v: 6, label: es ? 'S' : 'Sa' },
    { v: 0, label: es ? 'D' : 'Su' },
  ]
})

const toggleSkaterPanel = (u: User) => {
  if (u.role !== 'customer') return
  if (expandedSkaterId.value === u.id) {
    expandedSkaterId.value = null
    return
  }
  expandedSkaterId.value = u.id
  const sched = u.skater_schedule
  skaterDraft.value = {
    skill_group_id: u.skill_group_id || '',
    program_id: programByStudent.value[u.id] || '',
    start: sched?.start || '09:00',
    end: sched?.end || '17:00',
    days: Array.isArray(sched?.days) && sched!.days!.length ? [...sched!.days!] : [1, 2, 3, 4, 5],
  }
}

const toggleDraftDay = (d: number) => {
  const arr = skaterDraft.value.days
  const i = arr.indexOf(d)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(d)
  skaterDraft.value.days = [...arr].sort((a, b) => a - b)
}

const saveSkaterAssignments = async (u: User) => {
  savingSkaterId.value = u.id
  try {
    const schedule =
      skaterDraft.value.days.length > 0
        ? {
            start: skaterDraft.value.start || '09:00',
            end: skaterDraft.value.end || '17:00',
            days: [...skaterDraft.value.days].sort((a, b) => a - b),
          }
        : null

    const { error: upErr } = await client
      .from('profiles')
      .update({
        skill_group_id: skaterDraft.value.skill_group_id || null,
        skater_schedule: schedule,
      })
      .eq('id', u.id)

    if (upErr) throw upErr

    await client.from('program_students').delete().eq('student_id', u.id)
    if (skaterDraft.value.program_id) {
      const { error: insErr } = await client.from('program_students').insert({
        student_id: u.id,
        program_id: skaterDraft.value.program_id,
      })
      if (insErr) throw insErr
      programByStudent.value[u.id] = skaterDraft.value.program_id
    } else {
      delete programByStudent.value[u.id]
    }

    await loadUsers()
  } catch (e) {
    console.error('saveSkaterAssignments:', e)
  } finally {
    savingSkaterId.value = null
  }
}

const scheduleSummary = (u: User) => {
  const s = u.skater_schedule
  if (!s || typeof s !== 'object' || !Array.isArray(s.days) || !s.days.length) return null
  const es = language.value === 'es'
  const labels = es ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const days = s.days
    .filter((n: number) => n >= 0 && n <= 6)
    .sort((a: number, b: number) => a - b)
    .map((n: number) => labels[n])
    .join(', ')
  return `${s.start || '—'}–${s.end || '—'} · ${days}`
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
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <button @click="router.push('/admin')" class="p-2 -ml-2 text-white flex-shrink-0">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div class="min-w-0">
              <h1 class="text-xl font-bold text-white flex items-center gap-2">
                <span class="text-2xl" aria-hidden="true">🛹</span>
                {{ language === 'es' ? 'Patinadores' : 'Skaters' }}
              </h1>
              <p class="text-sm text-gray-400">
                {{ language === 'es' ? 'Roles, programa, nivel y horario' : 'Roles, program, level, and schedule' }}
              </p>
            </div>
          </div>
          <button
            @click="openAddModal"
            class="flex-shrink-0 px-4 py-2 rounded-xl bg-gold-400 text-black font-semibold text-sm flex items-center gap-2"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            {{ language === 'es' ? 'Añadir cuenta' : 'Add account' }}
          </button>
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
          :placeholder="language === 'es' ? 'Buscar patinadores...' : 'Search skaters...'"
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
        <p class="text-gray-400">{{ language === 'es' ? 'No se encontraron personas' : 'No people found' }}</p>
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
              <p v-if="u.role === 'customer' && scheduleSummary(u)" class="text-[11px] text-gray-600 mt-1 truncate">
                🗓️ {{ scheduleSummary(u) }}
              </p>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2">
              <button
                v-if="u.role === 'customer'"
                type="button"
                class="p-2 rounded-lg bg-gray-800 text-gold-400 hover:bg-gray-700 text-xs font-semibold px-3"
                @click="toggleSkaterPanel(u)"
              >
                {{ expandedSkaterId === u.id ? (language === 'es' ? 'Cerrar' : 'Close') : (language === 'es' ? 'Asignar' : 'Assign') }}
              </button>
              <NuxtLink
                v-if="u.role === 'customer'"
                :to="`/dashboard/students/${u.id}`"
                class="p-2 rounded-lg bg-gray-800 text-gold-400 hover:bg-gray-700 hover:text-gold-300 transition-all"
                :title="language === 'es' ? 'Ver perfil del patinador' : 'View skater profile'"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </NuxtLink>
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

          <!-- Skater: program level + program + schedule -->
          <div
            v-if="u.role === 'customer' && expandedSkaterId === u.id"
            class="border-t border-gray-800 px-4 py-4 space-y-4 bg-black/40"
          >
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {{ language === 'es' ? 'Programa de skate (nivel)' : 'Skate program (level)' }}
            </p>
            <div>
              <label class="block text-xs text-gray-500 mb-1">{{ language === 'es' ? 'Nivel / grupo' : 'Level / group' }}</label>
              <select
                v-model="skaterDraft.skill_group_id"
                class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
              >
                <option value="">{{ language === 'es' ? '— Sin asignar —' : '— Unassigned —' }}</option>
                <option v-for="g in skillGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">{{ language === 'es' ? 'Programa' : 'Program' }}</label>
              <select
                v-model="skaterDraft.program_id"
                class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
              >
                <option value="">{{ language === 'es' ? '— Ninguno —' : '— None —' }}</option>
                <option v-for="pr in programsList" :key="pr.id" :value="pr.id">{{ pr.name }}</option>
              </select>
            </div>
            <div>
              <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {{ language === 'es' ? 'Horario preferido' : 'Schedule' }}
              </p>
              <div class="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label class="block text-[10px] text-gray-500 mb-0.5">{{ language === 'es' ? 'Inicio' : 'Start' }}</label>
                  <input
                    v-model="skaterDraft.start"
                    type="time"
                    class="w-full px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-gray-500 mb-0.5">{{ language === 'es' ? 'Fin' : 'End' }}</label>
                  <input
                    v-model="skaterDraft.end"
                    type="time"
                    class="w-full px-2 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
                  />
                </div>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="d in weekdayToggles"
                  :key="d.v"
                  type="button"
                  class="w-9 h-9 rounded-lg text-xs font-bold transition-colors"
                  :class="
                    skaterDraft.days.includes(d.v)
                      ? 'bg-white text-black'
                      : 'bg-gray-800 text-gray-500 border border-gray-700'
                  "
                  @click="toggleDraftDay(d.v)"
                >
                  {{ d.label }}
                </button>
              </div>
            </div>
            <div class="flex items-center gap-3 pt-1">
              <button
                type="button"
                class="flex-1 py-2.5 rounded-xl bg-white text-black font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                :disabled="savingSkaterId === u.id"
                @click="saveSkaterAssignments(u)"
              >
                <span>✓</span>
                {{ language === 'es' ? 'Guardar' : 'Save' }}
              </button>
              <button
                type="button"
                class="text-sm text-gray-500 hover:text-gray-300"
                @click="expandedSkaterId = null"
              >
                {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
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
            {{ language === 'es' ? 'Editar perfil' : 'Edit profile' }}
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

    <!-- Add User Modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="showAddModal" class="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div class="bg-gray-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden border border-gray-800">
            <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 class="text-lg font-bold text-white">
                {{ language === 'es' ? 'Nuevo usuario' : 'Add user' }}
              </h3>
              <button @click="closeAddModal" class="p-2 text-gray-400 hover:text-white">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form @submit.prevent="submitAddUser" class="p-6 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">Email *</label>
                <input
                  v-model="newUserForm.email"
                  type="email"
                  required
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                  :placeholder="language === 'es' ? 'correo@ejemplo.com' : 'email@example.com'"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Contraseña temporal *' : 'Temporary password *' }}</label>
                <input
                  v-model="newUserForm.password"
                  type="password"
                  required
                  minlength="6"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                  :placeholder="language === 'es' ? 'Mín. 6 caracteres' : 'Min. 6 characters'"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Nombre completo' : 'Full name' }}</label>
                <input
                  v-model="newUserForm.full_name"
                  type="text"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                  :placeholder="language === 'es' ? 'Opcional' : 'Optional'"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Teléfono' : 'Phone' }}</label>
                <input
                  v-model="newUserForm.phone"
                  type="tel"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                  :placeholder="language === 'es' ? 'Opcional' : 'Optional'"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-2">{{ language === 'es' ? 'Rol' : 'Role' }}</label>
                <div class="flex gap-2">
                  <button
                    type="button"
                    @click="newUserForm.role = 'customer'"
                    class="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                    :class="newUserForm.role === 'customer' ? 'bg-glass-blue text-white' : 'bg-gray-800 text-gray-400'"
                  >
                    🛹 {{ language === 'es' ? 'Patinador' : 'Skater' }}
                  </button>
                  <button
                    type="button"
                    @click="newUserForm.role = 'coach'"
                    class="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                    :class="newUserForm.role === 'coach' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
                  >
                    🎓 Coach
                  </button>
                  <button
                    type="button"
                    @click="newUserForm.role = 'admin'"
                    class="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
                    :class="newUserForm.role === 'admin' ? 'bg-flame-600 text-white' : 'bg-gray-800 text-gray-400'"
                  >
                    👑 Admin
                  </button>
                </div>
              </div>
              <p class="text-xs text-gray-500">
                {{ language === 'es'
                  ? 'Los usuarios nuevos quedan pendientes y deben activarse por un admin para acceder.'
                  : 'New users remain pending and must be activated by an admin to access.' }}
              </p>
              <div v-if="addUserError" class="text-sm text-red-400">{{ addUserError }}</div>
              <div class="flex gap-3 pt-2">
                <button
                  type="button"
                  @click="closeAddModal"
                  class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl"
                >
                  {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
                </button>
                <button
                  type="submit"
                  :disabled="addUserSaving"
                  class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50"
                >
                  {{ addUserSaving ? '...' : (language === 'es' ? 'Crear usuario' : 'Create user') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
