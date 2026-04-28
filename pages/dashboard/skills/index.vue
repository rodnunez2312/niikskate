<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

const userRole = ref<'coach' | 'admin' | null>(null)
const loading = ref(true)
const groups = ref<Array<{
  id: string
  name: string
  description: string | null
  color: string | null
  sort_order: number
  is_active: boolean
  is_system?: boolean
  created_by: string | null
  areas_count: number
  subgroups_count: number
  skills_count: number
}>>([])

const stats = ref({
  assessmentGroups: 0,
  subgroups: 0,
  individualSkills: 0,
  activeGroups: 0,
})

const createGroupModalOpen = ref(false)
const newGroupName = ref('')
const newGroupDescription = ref('')
const newGroupColor = ref('#6366f1')
const showSuggestions = ref(false)
const createGroupSaving = ref(false)

const GROUP_COLORS = ['#6366f1', '#16a34a', '#2563eb', '#4f46e5', '#7c3aed', '#a855f7', '#db2777', '#dc2626', '#ea580c', '#ca8a04']

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/dashboard/skills')
    return
  }
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if (profile?.role !== 'coach' && profile?.role !== 'admin') {
    router.push('/')
    return
  }
  userRole.value = profile?.role ?? null
  await fetchGroups()
})

async function fetchGroups() {
  loading.value = true
  try {
    const { data: groupsData } = await client.from('skill_groups').select('id, name, description, color, sort_order, is_active, is_system, created_by').order('sort_order')
    if (!groupsData?.length) {
      groups.value = []
      stats.value = { assessmentGroups: 0, subgroups: 0, individualSkills: 0, activeGroups: 0 }
      return
    }
    const ids = groupsData.map((g: any) => g.id)
    const { data: areasData } = await client.from('skill_areas').select('group_id')
    const { data: subgroupsData } = await client.from('skill_subgroups').select('group_id')
    const { count: skillsCount } = await client.from('skills_library').select('*', { count: 'exact', head: true }).eq('is_active', true)
    const areasByGroup: Record<string, number> = {}
    const subgroupsByGroup: Record<string, number> = {}
    for (const a of areasData || []) areasByGroup[a.group_id] = (areasByGroup[a.group_id] || 0) + 1
    for (const s of subgroupsData || []) subgroupsByGroup[s.group_id] = (subgroupsByGroup[s.group_id] || 0) + 1
    groups.value = (groupsData || []).map((g: any) => ({
      ...g,
      areas_count: areasByGroup[g.id] || 0,
      subgroups_count: subgroupsByGroup[g.id] || 0,
      skills_count: 0,
    }))
    const active = groups.value.filter(g => g.is_active).length
    const totalSubgroups = (subgroupsData || []).length
    stats.value = {
      assessmentGroups: groups.value.length,
      subgroups: totalSubgroups,
      individualSkills: skillsCount || 0,
      activeGroups: active,
    }
  } catch (e) {
    console.error('Error fetching skill groups:', e)
  } finally {
    loading.value = false
  }
}

function openGroup(id: string) {
  router.push(`/dashboard/skills/${id}`)
}

function canDeleteGroup(group: { created_by: string | null; is_system?: boolean }) {
  if (group.is_system) return false
  if (userRole.value === 'admin') return true
  if (userRole.value === 'coach' && user.value?.id) return group.created_by === user.value.id
  return false
}

async function deleteGroup(id: string, e?: Event) {
  e?.stopPropagation()
  const msg = language.value === 'es'
    ? '¿Eliminar este grupo? Se borrarán sus áreas y skills asignados.'
    : 'Delete this group? Its areas and assigned skills will be removed.'
  if (!confirm(msg)) return
  try {
    const { error } = await client.from('skill_groups').delete().eq('id', id)
    if (error) throw error
    await fetchGroups()
  } catch (err) {
    console.error('Delete group failed:', err)
  }
}

function openCreateGroupModal() {
  newGroupName.value = ''
  newGroupDescription.value = ''
  newGroupColor.value = '#6366f1'
  showSuggestions.value = false
  createGroupModalOpen.value = true
}

function closeCreateGroupModal() {
  createGroupModalOpen.value = false
  newGroupName.value = ''
  newGroupDescription.value = ''
  newGroupColor.value = '#6366f1'
}

async function createGroup() {
  const name = newGroupName.value.trim()
  if (!name) return
  createGroupSaving.value = true
  try {
    const maxOrder = groups.value.length ? Math.max(...groups.value.map(g => g.sort_order || 0)) : 0
    const { data: inserted, error } = await client
      .from('skill_groups')
      .insert({
        name,
        description: newGroupDescription.value.trim() || null,
        color: newGroupColor.value || null,
        sort_order: maxOrder + 1,
        is_active: true,
        created_by: user.value?.id ?? null,
      })
      .select('id')
      .single()
    if (error) throw error
    if (inserted?.id) {
      const areaNames = [['Flatground', 1], ['Street', 2], ['Park', 3], ['Bowl', 4], ['Mini Ramp', 5], ['Vert', 6]] as const
      await client.from('skill_areas').insert(
        areaNames.map(([name, sort_order]) => ({ group_id: inserted.id, name, sort_order }))
      )
    }
    await fetchGroups()
    closeCreateGroupModal()
  } catch (e) {
    console.error('Create group failed:', e)
  } finally {
    createGroupSaving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center justify-between">
          <button @click="router.push('/dashboard')" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="text-2xl" aria-hidden="true">🛹</span>
            Program
          </h1>
          <div class="w-10" />
        </div>
      </div>
    </header>

    <div class="px-4 py-6 max-w-2xl mx-auto">
      <!-- Summary cards -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <span class="text-2xl block mb-1">📁</span>
          <p class="text-2xl font-bold text-white">{{ stats.assessmentGroups }}</p>
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Grupos' : 'Assessment Groups' }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <span class="text-2xl block mb-1">📋</span>
          <p class="text-2xl font-bold text-white">{{ stats.subgroups }}</p>
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Subgrupos' : 'Subgroups' }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <span class="text-2xl block mb-1">🎯</span>
          <p class="text-2xl font-bold text-white">{{ stats.individualSkills }}</p>
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Skills' : 'Individual Skills' }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <span class="text-2xl block mb-1">🛡️</span>
          <p class="text-2xl font-bold text-white">{{ stats.activeGroups }}</p>
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Grupos activos' : 'Active Groups' }}</p>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 class="text-lg font-bold text-white">
            {{ language === 'es' ? 'Estructura de grupos' : 'Groups Structure' }}
          </h2>
          <p class="text-sm text-gray-400">
            {{ language === 'es' ? 'Configura los grupos, subgrupos y skills para el progreso del atleta.' : 'Configure the groups, subgroups, and skills used for athlete progress.' }}
          </p>
        </div>
        <button
          type="button"
          class="px-4 py-2.5 bg-black border border-gray-600 text-white rounded-xl font-semibold text-sm hover:bg-gray-800 shrink-0"
          @click="openCreateGroupModal"
        >
          + {{ language === 'es' ? 'Añadir grupo' : 'Add Group' }}
        </button>
      </div>

      <div v-if="loading" class="py-12 text-center">
        <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
      </div>

      <div v-else-if="!groups.length" class="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <p class="text-gray-400">{{ language === 'es' ? 'No hay grupos. Añade uno para empezar.' : 'No groups yet. Add one to get started.' }}</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="g in groups"
          :key="g.id"
          class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
        >
          <div
            class="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
            @click="openGroup(g.id)"
          >
            <div class="flex flex-col text-gray-500">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </div>
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
            <span
              class="w-4 h-4 rounded-full shrink-0"
              :style="{ backgroundColor: g.color || '#6b7280' }"
            />
            <div class="flex-1 min-w-0">
              <p class="font-bold text-white">{{ g.name }}</p>
              <p class="text-sm text-gray-500 truncate">{{ g.description || '—' }}</p>
            </div>
            <p class="text-xs text-gray-500 shrink-0">
              {{ g.areas_count }} {{ language === 'es' ? 'áreas' : 'areas' }}, {{ g.subgroups_count }} {{ language === 'es' ? 'subgrupos' : 'subgroups' }}, {{ g.skills_count }} {{ language === 'es' ? 'skills' : 'skills' }}
            </p>
            <button type="button" class="p-2 text-gray-500 hover:text-white" title="Copy" @click.stop>📋</button>
            <button type="button" class="p-2 text-gray-500 hover:text-amber-400" title="Edit" @click.stop>✏️</button>
            <button
              v-if="canDeleteGroup(g)"
              type="button"
              class="p-2 text-gray-500 hover:text-red-400"
              title="Delete"
              @click.stop="deleteGroup(g.id, $event)"
            >🗑️</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Create New Group modal -->
    <Teleport to="body">
      <div
        v-if="createGroupModalOpen"
        class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4"
        @click.self="closeCreateGroupModal"
      >
        <div
          class="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-xl"
          @click.stop
        >
          <div class="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-white">
              {{ language === 'es' ? 'Crear nuevo grupo' : 'Create New Group' }}
            </h3>
            <button type="button" class="p-2 text-gray-400 hover:text-white" @click="closeCreateGroupModal">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div class="p-4 space-y-4">
            <button
              type="button"
              class="flex items-center gap-2 w-full text-left text-blue-400 hover:text-blue-300 text-sm"
              @click="showSuggestions = !showSuggestions"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
              {{ language === 'es' ? 'Mostrar sugerencias' : 'Show suggestions' }}
              <svg class="w-4 h-4 ml-auto transition-transform" :class="showSuggestions ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
            <div v-if="showSuggestions" class="rounded-lg bg-gray-800/80 p-3 text-sm text-gray-400">
              {{ language === 'es' ? 'Ejemplos: Fundamentos, Equilibrio y control, Trucos básicos, Progresión, Intermedio, Avanzado.' : 'e.g. Skateboarding Basics, Balance & Control, Basic Tricks, Progression, Intermediate, Advanced.' }}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">{{ language === 'es' ? 'Nombre del grupo' : 'Group Name' }} *</label>
              <input
                v-model="newGroupName"
                type="text"
                :placeholder="language === 'es' ? 'ej. Fundamentos del skate' : 'e.g., Skateboarding Basics'"
                class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 text-sm"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">{{ language === 'es' ? 'Descripción' : 'Description' }}</label>
              <textarea
                v-model="newGroupDescription"
                rows="3"
                :placeholder="language === 'es' ? 'Breve descripción de este grupo' : 'Brief description of this group'"
                class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 text-sm resize-y min-h-[80px]"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">{{ language === 'es' ? 'Color' : 'Color' }}</label>
              <div class="flex items-center gap-3">
                <div
                  class="w-10 h-10 rounded-lg border-2 border-gray-600 shrink-0"
                  :style="{ backgroundColor: newGroupColor }"
                />
                <input
                  v-model="newGroupColor"
                  type="text"
                  class="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 text-sm font-mono"
                  placeholder="#6366f1"
                />
              </div>
              <div class="flex flex-wrap gap-2 mt-2">
                <button
                  v-for="c in GROUP_COLORS"
                  :key="c"
                  type="button"
                  class="w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110"
                  :class="newGroupColor === c ? 'border-white' : 'border-gray-600'"
                  :style="{ backgroundColor: c }"
                  @click="newGroupColor = c"
                />
              </div>
            </div>
          </div>
          <div class="p-4 border-t border-gray-700 flex justify-end gap-2">
            <button
              type="button"
              class="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm font-medium hover:bg-gray-600"
              @click="closeCreateGroupModal"
            >
              {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-700 flex items-center gap-1.5 disabled:opacity-50"
              :disabled="!newGroupName.trim() || createGroupSaving"
              @click="createGroup"
            >
              <span>+</span>
              {{ language === 'es' ? 'Crear grupo' : 'Create Group' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
