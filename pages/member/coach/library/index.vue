<script setup lang="ts">
import {
  isPlanningSkillGroupName,
  normalizeSkillGroupDisplayName,
} from '~/utils/skillGroupLevels'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

type ProgramRow = {
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
  students_count: number
}

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

const userRole = ref<'coach' | 'admin' | null>(null)
const loading = ref(true)
const programs = ref<ProgramRow[]>([])
const expandedId = ref<string | null>(null)

const stats = ref({
  programs: 0,
  subgroups: 0,
  individualSkills: 0,
  activePrograms: 0,
})

const createModalOpen = ref(false)
const newName = ref('')
const newDescription = ref('')
const newColor = ref('#6366f1')
const showSuggestions = ref(false)
const createSaving = ref(false)

const GROUP_COLORS = ['#6366f1', '#16a34a', '#2563eb', '#4f46e5', '#7c3aed', '#a855f7', '#db2777', '#dc2626', '#ea580c', '#ca8a04']

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/member/coach/library')
    return
  }
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if (profile?.role !== 'coach' && profile?.role !== 'admin') {
    router.push('/')
    return
  }
  userRole.value = profile?.role ?? null
  await fetchPrograms()
})

async function fetchPrograms() {
  loading.value = true
  try {
    const { data: groupsData } = await client
      .from('skill_groups')
      .select('id, name, description, color, sort_order, is_active, is_system, created_by')
      .order('sort_order')
    if (!groupsData?.length) {
      programs.value = []
      stats.value = { programs: 0, subgroups: 0, individualSkills: 0, activePrograms: 0 }
      return
    }
    const { data: areasData } = await client.from('skill_areas').select('group_id')
    const { data: subgroupsData } = await client.from('skill_subgroups').select('group_id')
    const { data: skaterRows } = await client
      .from('profiles')
      .select('skill_group_id')
      .eq('role', 'customer')
      .not('skill_group_id', 'is', null)
    const { count: skillsCount } = await client
      .from('skills_library')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    const areasByGroup: Record<string, number> = {}
    const subgroupsByGroup: Record<string, number> = {}
    const studentsByGroup: Record<string, number> = {}
    for (const a of areasData || []) areasByGroup[a.group_id] = (areasByGroup[a.group_id] || 0) + 1
    for (const s of subgroupsData || []) subgroupsByGroup[s.group_id] = (subgroupsByGroup[s.group_id] || 0) + 1
    for (const row of skaterRows || []) {
      const gid = (row as { skill_group_id: string | null }).skill_group_id
      if (gid) studentsByGroup[gid] = (studentsByGroup[gid] || 0) + 1
    }

    programs.value = (groupsData || []).filter((g: any) => g.is_active !== false).map((g: any) => ({
      ...g,
      areas_count: areasByGroup[g.id] || 0,
      subgroups_count: subgroupsByGroup[g.id] || 0,
      skills_count: 0,
      students_count: studentsByGroup[g.id] || 0,
    }))

    stats.value = {
      programs: programs.value.length,
      subgroups: (subgroupsData || []).length,
      individualSkills: skillsCount || 0,
      activePrograms: programs.value.filter(g => g.is_active).length,
    }
  } catch (e) {
    console.error('Error fetching programs:', e)
  } finally {
    loading.value = false
  }
}

function openProgram(id: string) {
  router.push(`/member/coach/library/${id}`)
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function canDeleteProgram(program: { name: string; created_by: string | null; is_system?: boolean }) {
  if (program.is_system || isPlanningSkillGroupName(program.name)) return false
  if (userRole.value === 'admin') return true
  if (userRole.value === 'coach' && user.value?.id) return program.created_by === user.value.id
  return false
}

async function deleteProgram(id: string, e?: Event) {
  e?.stopPropagation()
  const msg = language.value === 'es'
    ? '¿Eliminar este programa? Se borrarán sus áreas y skills asignados.'
    : 'Delete this program? Its areas and assigned skills will be removed.'
  if (!confirm(msg)) return
  try {
    const { error } = await client.from('skill_groups').delete().eq('id', id)
    if (error) throw error
    await fetchPrograms()
  } catch (err) {
    console.error('Delete program failed:', err)
  }
}

function openCreateModal() {
  newName.value = ''
  newDescription.value = ''
  newColor.value = '#6366f1'
  showSuggestions.value = false
  createModalOpen.value = true
}

function closeCreateModal() {
  createModalOpen.value = false
}

async function createProgram() {
  const name = newName.value.trim()
  if (!name) return
  createSaving.value = true
  try {
    const maxOrder = programs.value.length ? Math.max(...programs.value.map(g => g.sort_order || 0)) : 0
    const { data: inserted, error } = await client
      .from('skill_groups')
      .insert({
        name,
        description: newDescription.value.trim() || null,
        color: newColor.value || null,
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
        areaNames.map(([areaName, sort_order]) => ({ group_id: inserted.id, name: areaName, sort_order })),
      )
    }
    await fetchPrograms()
    closeCreateModal()
  } catch (e) {
    console.error('Create program failed:', e)
  } finally {
    createSaving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <h1 class="text-xl font-bold text-white flex items-center gap-2">
          <span class="text-2xl" aria-hidden="true">🛹</span>
          {{ language === 'es' ? 'Programas' : 'Programs' }}
        </h1>
      </div>
    </header>

    <div class="px-4 py-6 max-w-2xl mx-auto">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <span class="text-2xl block mb-1">📁</span>
          <p class="text-2xl font-bold text-white">{{ stats.programs }}</p>
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Programas' : 'Programs' }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <span class="text-2xl block mb-1">📋</span>
          <p class="text-2xl font-bold text-white">{{ stats.subgroups }}</p>
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Subgrupos' : 'Subgroups' }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <span class="text-2xl block mb-1">🎯</span>
          <p class="text-2xl font-bold text-white">{{ stats.individualSkills }}</p>
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Skills' : 'Skills' }}</p>
        </div>
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <span class="text-2xl block mb-1">🛡️</span>
          <p class="text-2xl font-bold text-white">{{ stats.activePrograms }}</p>
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Activos' : 'Active' }}</p>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h2 class="text-lg font-bold text-white">
            {{ language === 'es' ? 'Estructura de programas' : 'Programs structure' }}
          </h2>
          <p class="text-sm text-gray-400">
            {{
              language === 'es'
                ? 'Crea programas y configura skills por nivel.'
                : 'Create programs and configure skills by level.'
            }}
          </p>
        </div>
        <button
          type="button"
          class="px-4 py-2.5 bg-black border border-gray-600 text-white rounded-xl font-semibold text-sm hover:bg-gray-800 shrink-0"
          @click="openCreateModal"
        >
          + {{ language === 'es' ? 'Añadir programa' : 'Add program' }}
        </button>
      </div>

      <div v-if="loading" class="py-12 text-center">
        <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto" />
      </div>

      <div v-else-if="!programs.length" class="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <p class="text-gray-400">
          {{ language === 'es' ? 'No hay programas. Añade uno para empezar.' : 'No programs yet. Add one to get started.' }}
        </p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="p in programs"
          :key="p.id"
          class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
        >
          <div class="flex items-center gap-3 p-4">
            <button
              type="button"
              class="p-1 text-gray-500 hover:text-white"
              @click="toggleExpand(p.id)"
            >
              <svg
                class="w-4 h-4 transition-transform"
                :class="expandedId === p.id ? 'rotate-180' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              type="button"
              class="flex-1 min-w-0 flex items-center gap-3 text-left hover:opacity-90"
              @click="openProgram(p.id)"
            >
              <span
                class="w-4 h-4 rounded-full shrink-0"
                :style="{ backgroundColor: p.color || '#6b7280' }"
              />
              <div class="flex-1 min-w-0">
                <p class="font-bold text-white truncate flex items-center gap-2 flex-wrap">
                  <span>{{ normalizeSkillGroupDisplayName(p.name) }}</span>
                  <span
                    v-if="isPlanningSkillGroupName(p.name)"
                    class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-300"
                  >
                    {{ language === 'es' ? 'Planificación' : 'Planning' }}
                  </span>
                </p>
                <p class="text-sm text-gray-500 truncate">
                  {{ p.description || '—' }}
                </p>
                <p
                  v-if="!isPlanningSkillGroupName(p.name)"
                  class="text-xs mt-0.5 font-medium"
                  :class="p.students_count > 0 ? 'text-gold-400/90' : 'text-gray-600'"
                >
                  🛹 {{ p.students_count }}
                  {{ language === 'es' ? 'patinadores' : 'skaters' }}
                </p>
              </div>
            </button>
            <button
              v-if="canDeleteProgram(p)"
              type="button"
              class="p-2 text-gray-500 hover:text-red-400"
              @click="deleteProgram(p.id, $event)"
            >
              🗑️
            </button>
          </div>

          <div v-if="expandedId === p.id" class="border-t border-gray-800 px-4 py-3 bg-black/30">
            <p class="text-xs text-gray-500">
              <template v-if="!isPlanningSkillGroupName(p.name)">
                {{ p.students_count }} {{ language === 'es' ? 'patinadores asignados' : 'skaters assigned' }}
                ·
              </template>
              {{ p.areas_count }} {{ language === 'es' ? 'áreas' : 'areas' }},
              {{ p.subgroups_count }} {{ language === 'es' ? 'subgrupos' : 'subgroups' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Create program modal -->
    <Teleport to="body">
      <div
        v-if="createModalOpen"
        class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4"
        @click.self="closeCreateModal"
      >
        <div class="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-xl" @click.stop>
          <div class="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-white">
              {{ language === 'es' ? 'Crear nuevo programa' : 'Create new program' }}
            </h3>
            <button type="button" class="p-2 text-gray-400 hover:text-white" @click="closeCreateModal">✕</button>
          </div>
          <div class="p-4 space-y-4">
            <button
              type="button"
              class="flex items-center gap-2 w-full text-left text-blue-400 hover:text-blue-300 text-sm"
              @click="showSuggestions = !showSuggestions"
            >
              {{ language === 'es' ? 'Mostrar sugerencias' : 'Show suggestions' }}
            </button>
            <div v-if="showSuggestions" class="rounded-lg bg-gray-800/80 p-3 text-sm text-gray-400">
              {{
                language === 'es'
                  ? 'Ejemplos: Fundamentos, Equilibrio y control, Trucos básicos, Intermedio, Avanzado.'
                  : 'e.g. Foundations, Balance & Control, Basic Tricks, Intermediate, Advanced.'
              }}
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">
                {{ language === 'es' ? 'Nombre del programa' : 'Program name' }} *
              </label>
              <input
                v-model="newName"
                type="text"
                class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                :placeholder="language === 'es' ? 'ej. Fundamentos del skate' : 'e.g. Skateboarding Basics'"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">
                {{ language === 'es' ? 'Descripción' : 'Description' }}
              </label>
              <textarea
                v-model="newDescription"
                rows="3"
                class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm resize-y"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">
                {{ language === 'es' ? 'Color' : 'Color' }}
              </label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="c in GROUP_COLORS"
                  :key="c"
                  type="button"
                  class="w-8 h-8 rounded-lg border-2"
                  :class="newColor === c ? 'border-white' : 'border-gray-600'"
                  :style="{ backgroundColor: c }"
                  @click="newColor = c"
                />
              </div>
            </div>
          </div>
          <div class="p-4 border-t border-gray-700 flex justify-end gap-2">
            <button type="button" class="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm" @click="closeCreateModal">
              {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold disabled:opacity-50"
              :disabled="!newName.trim() || createSaving"
              @click="createProgram"
            >
              {{ language === 'es' ? 'Crear programa' : 'Create program' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
