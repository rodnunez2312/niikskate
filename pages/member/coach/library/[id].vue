<script setup lang="ts">
import {
  SKATE_TRICK_STRUCTURES,
  areaTagClass,
  difficultyFromStructure,
  difficultyTagClass,
  skillStructure,
} from '~/utils/skateTrickTaxonomy'
import { isPlanningSkillGroupName } from '~/utils/skillGroupLevels'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

interface AreaSkill {
  id: string
  area_id: string
  skill_id: string
  variant: string | null
  sort_order: number
  skill: { id: string; name: string; name_es: string | null; category: string; difficulty?: string } | null
}

interface AreaWithSkills {
  id: string
  name: string
  subgroups_count: number
  skills_count: number
  skills: AreaSkill[]
}

const route = useRoute()
const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

const loading = ref(true)
const group = ref<{
  id: string
  name: string
  description: string | null
  color: string | null
  is_active: boolean
  areas_count: number
  subgroups_count: number
  skills_count: number
} | null>(null)
const areas = ref<AreaWithSkills[]>([])
const subgroups = ref<Array<{ id: string; name: string }>>([])
const expandedAreaIds = ref<Set<string>>(new Set())

const librarySkills = ref<Array<{
  id: string
  name: string
  name_es: string | null
  category: string
  area?: string | null
  structure?: string | null
  categoria?: string | null
  difficulty?: string | null
}>>([])
const addSkillAreaId = ref<string | null>(null)
const addSkillModalOpen = ref(false)
const addSkillSearch = ref('')
const addSkillStructureFilter = ref('')
const addSkillAreaFilter = ref('')
const addSkillVariant = ref('')
const addSkillSaving = ref(false)

const programLevels = ref<Array<{ id: string; name: string; sort_order: number }>>([])

type ProgramSkater = {
  id: string
  full_name: string
  email: string
  skill_level: string | null
}

const programSkaters = ref<ProgramSkater[]>([])
const skatersExpanded = ref(true)

const currentLevelIndex = computed(() =>
  programLevels.value.findIndex(g => g.id === (route.params.id as string)),
)

const prevProgramLevel = computed(() => {
  const i = currentLevelIndex.value
  return i > 0 ? programLevels.value[i - 1]! : null
})

const nextProgramLevel = computed(() => {
  const i = currentLevelIndex.value
  if (i < 0 || i >= programLevels.value.length - 1) return null
  return programLevels.value[i + 1]!
})

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
  await loadProgramLevels()
  await fetchGroup()
})

watch(
  () => route.params.id,
  async (id) => {
    if (id) await fetchGroup()
  },
)

async function loadProgramLevels() {
  const { data } = await client
    .from('skill_groups')
    .select('id, name, sort_order, is_active')
    .order('sort_order')
  programLevels.value = (data || []).filter(g => g.is_active !== false)
}

function goToAdjacentLevel(delta: -1 | 1) {
  const target = delta === -1 ? prevProgramLevel.value : nextProgramLevel.value
  if (!target) return
  expandedAreaIds.value = new Set()
  router.push(`/member/coach/library/${target.id}`)
  if (import.meta.client) window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function fetchGroup() {
  const id = route.params.id as string
  if (!id) return
  loading.value = true
  try {
    const { data: g, error: e1 } = await client.from('skill_groups').select('id, name, description, color, is_active').eq('id', id).single()
    if (e1 || !g) {
      router.push('/member/coach/library')
      return
    }
    const { data: areasData } = await client.from('skill_areas').select('id, name').eq('group_id', id).order('sort_order')
    const { data: subgroupsData } = await client.from('skill_subgroups').select('id, name').eq('group_id', id).order('sort_order')
    const areaIds = (areasData || []).map((a: { id: string }) => a.id)
    let areaSkillsList: Array<{ id: string; area_id: string; skill_id: string; variant: string | null; sort_order: number; skill: any }> = []
    if (areaIds.length > 0) {
      const { data: areaSkillsData } = await client
        .from('area_skills')
        .select('id, area_id, skill_id, variant, sort_order, skill:skills_library(id, name, name_es, category, difficulty)')
        .in('area_id', areaIds)
        .order('sort_order')
      areaSkillsList = areaSkillsData || []
    }
    const byArea = new Map<string, AreaSkill[]>()
    for (const a of areasData || []) {
      byArea.set(a.id, [])
    }
    for (const row of areaSkillsList) {
      const list = byArea.get(row.area_id) || []
      list.push({
        id: row.id,
        area_id: row.area_id,
        skill_id: row.skill_id,
        variant: row.variant ?? null,
        sort_order: row.sort_order ?? 0,
        skill: row.skill ?? null,
      })
      byArea.set(row.area_id, list)
    }
    areas.value = (areasData || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      subgroups_count: 0,
      skills_count: (byArea.get(a.id) || []).length,
      skills: (byArea.get(a.id) || []).sort((x: AreaSkill, y: AreaSkill) => x.sort_order - y.sort_order),
    }))
    subgroups.value = subgroupsData || []
    const { data: skaterData } = await client
      .from('profiles')
      .select('id, full_name, email, skill_level')
      .eq('role', 'customer')
      .eq('skill_group_id', id)
      .order('full_name')
    programSkaters.value = (skaterData || []) as ProgramSkater[]
    const totalSkills = areas.value.reduce((n, ar) => n + ar.skills_count, 0)
    group.value = {
      ...g,
      areas_count: areas.value.length,
      subgroups_count: subgroups.value.length,
      skills_count: totalSkills,
    }
  } catch (e) {
    console.error('Error fetching group:', e)
    router.push('/member/coach/library')
  } finally {
    loading.value = false
  }
}

function toggleAreaExpanded(areaId: string) {
  const next = new Set(expandedAreaIds.value)
  if (next.has(areaId)) next.delete(areaId)
  else next.add(areaId)
  expandedAreaIds.value = next
}

function goBack() {
  router.push('/member/coach/library')
}

function openAddSkillModal(areaId: string) {
  addSkillAreaId.value = areaId
  addSkillSearch.value = ''
  addSkillStructureFilter.value = ''
  addSkillAreaFilter.value = ''
  addSkillVariant.value = ''
  addSkillModalOpen.value = true
  loadLibrarySkills()
}

function closeAddSkillModal() {
  addSkillModalOpen.value = false
  addSkillAreaId.value = null
  addSkillSearch.value = ''
  addSkillStructureFilter.value = ''
  addSkillAreaFilter.value = ''
  addSkillVariant.value = ''
}

async function loadLibrarySkills() {
  const { data } = await client
    .from('skills_library')
    .select('id, name, name_es, category, area, structure, categoria, difficulty')
    .eq('is_active', true)
    .order('sort_order')
  librarySkills.value = data || []
}

const filteredLibrarySkills = computed(() => {
  let list = librarySkills.value
  if (addSkillStructureFilter.value) {
    list = list.filter(sk => skillStructure(sk) === addSkillStructureFilter.value)
  }
  if (addSkillAreaFilter.value) {
    list = list.filter(sk => sk.area === addSkillAreaFilter.value)
  }
  const q = addSkillSearch.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(
    (s) =>
      (s.name || '').toLowerCase().includes(q) ||
      (s.name_es || '').toLowerCase().includes(q) ||
      skillStructure(s).toLowerCase().includes(q) ||
      (s.area || '').toLowerCase().includes(q) ||
      (s.category || '').toLowerCase().includes(q),
  )
})

const currentAreaAssignedSkillIds = computed(() => {
  if (!addSkillAreaId.value) return new Set<string>()
  const area = areas.value.find((a) => a.id === addSkillAreaId.value)
  if (!area) return new Set<string>()
  return new Set(area.skills.map((as) => as.skill_id + '|' + (as.variant ?? '')))
})

async function addSkillToArea(skillId: string) {
  const areaId = addSkillAreaId.value
  if (!areaId) return
  const key = skillId + '|' + (addSkillVariant.value.trim() || '')
  if (currentAreaAssignedSkillIds.value.has(key)) return
  addSkillSaving.value = true
  try {
    const variant = addSkillVariant.value.trim() || null
    const { error } = await client.from('area_skills').insert({
      area_id: areaId,
      skill_id: skillId,
      variant,
      sort_order: 0,
    })
    if (error) throw error
    await fetchGroup()
    closeAddSkillModal()
  } catch (e) {
    console.error('Add skill to area failed:', e)
  } finally {
    addSkillSaving.value = false
  }
}

async function removeSkillFromArea(areaSkillId: string) {
  try {
    const { error } = await client.from('area_skills').delete().eq('id', areaSkillId)
    if (error) throw error
    await fetchGroup()
  } catch (e) {
    console.error('Remove skill from area failed:', e)
  }
}

function skillDisplayName(skill: { name: string; name_es: string | null } | null) {
  if (!skill) return '—'
  return language.value === 'es' ? (skill.name_es || skill.name) : skill.name
}

function skillDifficultyLabel(skill: { difficulty?: string | null; structure?: string | null; categoria?: string | null }) {
  return skill.difficulty || difficultyFromStructure(skillStructure(skill))
}

function skaterBandLabel(level: string | null | undefined) {
  if (!level) return language.value === 'es' ? 'Sin nivel' : 'No level'
  return level
}

function skaterInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase() || '?'
  )
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center justify-between">
          <button @click="goBack" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="text-2xl" aria-hidden="true">🛹</span>
            {{ language === 'es' ? 'Programa' : 'Program' }}
          </h1>
          <div class="w-10" />
        </div>
      </div>
    </header>

    <div v-if="loading" class="py-12 text-center">
      <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
    </div>

    <template v-else-if="group">
      <div class="px-4 py-6 max-w-2xl mx-auto">
        <!-- Group header -->
        <div class="flex items-start gap-3 mb-6">
          <div class="flex flex-col shrink-0">
            <button
              type="button"
              class="p-0.5 rounded transition-colors"
              :class="prevProgramLevel ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-700 cursor-not-allowed'"
              :disabled="!prevProgramLevel"
              :title="prevProgramLevel?.name || (language === 'es' ? 'Primer nivel' : 'First level')"
              @click="goToAdjacentLevel(-1)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>
            </button>
            <button
              type="button"
              class="p-0.5 rounded transition-colors"
              :class="nextProgramLevel ? 'text-gray-400 hover:text-white hover:bg-gray-800' : 'text-gray-700 cursor-not-allowed'"
              :disabled="!nextProgramLevel"
              :title="nextProgramLevel?.name || (language === 'es' ? 'Último nivel' : 'Last level')"
              @click="goToAdjacentLevel(1)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
            </button>
          </div>
          <div class="flex-1 min-w-0">
            <h2 class="text-xl font-bold text-white">{{ group.name }}</h2>
            <p class="text-sm text-gray-400 mt-0.5">{{ group.description || '—' }}</p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span
              v-if="group.is_active"
              class="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center"
              title="Active"
            >
              <svg class="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
            </span>
            <p class="text-xs text-gray-500">
              <template v-if="!isPlanningSkillGroupName(group.name)">
                {{ programSkaters.length }} {{ language === 'es' ? 'patinadores' : 'skaters' }},
              </template>
              {{ group.areas_count }} {{ language === 'es' ? 'áreas' : 'areas' }}, {{ group.subgroups_count }} {{ language === 'es' ? 'subgrupos' : 'subgroups' }}, {{ group.skills_count }} {{ language === 'es' ? 'skills' : 'skills' }}
            </p>
            <button type="button" class="p-2 text-gray-500 hover:text-white" title="Copy">📋</button>
            <button type="button" class="p-2 text-gray-500 hover:text-amber-400" title="Edit">✏️</button>
            <button type="button" class="p-2 text-gray-500 hover:text-red-400" title="Delete">🗑️</button>
          </div>
        </div>

        <!-- Skaters assigned to this program (Kanban skill_group_id) -->
        <section
          v-if="!isPlanningSkillGroupName(group.name)"
          class="mb-8 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-800/50 transition-colors"
            @click="skatersExpanded = !skatersExpanded"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-lg" aria-hidden="true">👥</span>
              <h3 class="text-base font-bold text-white truncate">
                {{ language === 'es' ? 'Patinadores en este programa' : 'Skaters in this program' }}
              </h3>
              <span
                class="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full tabular-nums"
                :class="programSkaters.length ? 'bg-gold-400/20 text-gold-300' : 'bg-gray-800 text-gray-500'"
              >
                {{ programSkaters.length }}
              </span>
            </div>
            <svg
              class="w-5 h-5 text-gray-500 shrink-0 transition-transform"
              :class="skatersExpanded ? 'rotate-180' : ''"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div v-if="skatersExpanded" class="border-t border-gray-800 px-4 py-3">
            <p v-if="!programSkaters.length" class="text-sm text-gray-500 py-2">
              {{
                language === 'es'
                  ? 'Ningún patinador asignado. Asígnalos desde Patinadores → Kanban «Por programa».'
                  : 'No skaters assigned yet. Assign them from Skaters → Kanban «By program».'
              }}
            </p>
            <ul v-else class="space-y-2">
              <li v-for="skater in programSkaters" :key="skater.id">
                <NuxtLink
                  :to="`/member/coach/students/${skater.id}`"
                  class="flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-800/40 px-3 py-2 hover:border-gray-600 hover:bg-gray-800 transition-colors"
                >
                  <div class="w-9 h-9 rounded-full bg-glass-blue flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {{ skaterInitials(skater.full_name) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-white truncate">{{ skater.full_name }}</p>
                    <p class="text-xs text-gray-500 truncate capitalize">{{ skaterBandLabel(skater.skill_level) }}</p>
                  </div>
                  <svg class="w-4 h-4 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                </NuxtLink>
              </li>
            </ul>
          </div>
        </section>

        <!-- Areas -->
        <section class="mb-8">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h3 class="text-base font-bold text-white">{{ language === 'es' ? 'Áreas' : 'Areas' }}</h3>
            <div class="flex gap-2">
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 text-sm font-medium hover:bg-gray-700"
              >
                {{ language === 'es' ? 'Crear desde ubicaciones' : 'Create from Locations' }}
              </button>
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
              >
                + {{ language === 'es' ? 'Añadir área' : 'Add Area' }}
              </button>
            </div>
          </div>
          <div class="space-y-2">
            <div
              v-for="area in areas"
              :key="area.id"
              class="bg-gray-800/80 border border-gray-700 rounded-xl overflow-hidden"
            >
              <div
                class="flex items-center gap-3 p-4 cursor-pointer"
                @click="toggleAreaExpanded(area.id)"
              >
                <svg
                  class="w-5 h-5 text-gray-400 shrink-0 transition-transform"
                  :class="expandedAreaIds.has(area.id) ? 'rotate-90' : ''"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <span class="font-medium text-white flex-1">{{ area.name }}</span>
                <span class="text-sm text-gray-500">{{ area.subgroups_count }} {{ language === 'es' ? 'subgrupos' : 'subgroups' }}, {{ area.skills_count }} {{ language === 'es' ? 'skills' : 'skills' }}</span>
                <div class="flex items-center gap-1" @click.stop>
                  <button
                    type="button"
                    class="px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-500"
                    @click="openAddSkillModal(area.id)"
                  >
                    + {{ language === 'es' ? 'Skill' : 'Add Skill' }}
                  </button>
                  <button type="button" class="px-2 py-1 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600">+ {{ language === 'es' ? 'Subgrupo' : 'Subgroup' }}</button>
                  <button type="button" class="p-1.5 text-gray-500 hover:text-amber-400" title="Edit">✏️</button>
                  <button type="button" class="p-1.5 text-gray-500 hover:text-red-400" title="Delete">🗑️</button>
                </div>
              </div>
              <div v-if="expandedAreaIds.has(area.id)" class="border-t border-gray-700 px-4 pb-4 pt-3">
                <p class="text-sm text-gray-400 mb-3">
                  {{ language === 'es' ? 'Habilidades en' : 'Skills in' }} {{ area.name }}:
                </p>
                <div class="flex flex-wrap gap-2">
                  <template v-for="as in area.skills" :key="as.id">
                    <div
                      class="inline-flex items-center gap-1 rounded-lg bg-gray-700/80 border border-gray-600 px-2.5 py-1.5 text-sm"
                    >
                      <span class="text-white">{{ skillDisplayName(as.skill) }}</span>
                      <span
                        v-if="as.variant"
                        class="inline-flex items-center gap-0.5 rounded bg-green-500/20 text-green-300 px-1.5 py-0.5 text-xs"
                      >
                        {{ as.variant }}
                      </span>
                      <button
                        type="button"
                        class="ml-1 p-0.5 rounded text-gray-400 hover:text-white hover:bg-gray-600"
                        title="Remove"
                        @click="removeSkillFromArea(as.id)"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </template>
                  <span v-if="!area.skills.length" class="text-gray-500 italic text-sm">
                    {{ language === 'es' ? 'Ningún skill aún. Usa + Skill para añadir.' : 'No skills yet. Use + Add Skill to add.' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Add Skill modal -->
        <Teleport to="body">
          <div
            v-if="addSkillModalOpen"
            class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4"
            @click.self="closeAddSkillModal"
          >
            <div
              class="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl"
              @click.stop
            >
              <div class="p-4 border-b border-gray-700 flex items-center justify-between">
                <h3 class="text-lg font-semibold text-white">
                  {{ language === 'es' ? 'Añadir skill desde Niik Plan Clases' : 'Add skill from Niik Plan Clases' }}
                </h3>
                <button type="button" class="p-2 text-gray-400 hover:text-white" @click="closeAddSkillModal">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div class="p-4 space-y-3">
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Structure</label>
                  <select
                    v-model="addSkillStructureFilter"
                    class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                  >
                    <option value="">{{ language === 'es' ? 'Todas las estructuras' : 'All structures' }}</option>
                    <option v-for="opt in SKATE_TRICK_STRUCTURES" :key="opt" :value="opt">{{ opt }}</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs text-gray-400 mb-1">Area</label>
                  <MemberTrickAreaPicker v-model="addSkillAreaFilter" allow-empty size="sm" />
                </div>
                <input
                  v-model="addSkillSearch"
                  type="text"
                  :placeholder="language === 'es' ? 'Buscar por nombre, área o estructura...' : 'Search by name, area, or structure...'"
                  class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 text-sm"
                />
                <div>
                  <label class="block text-xs text-gray-400 mb-1">{{ language === 'es' ? 'Variante (opcional)' : 'Variant (optional)' }}</label>
                  <input
                    v-model="addSkillVariant"
                    type="text"
                    :placeholder="language === 'es' ? 'ej. stationary, rolling, low ramp' : 'e.g. stationary, rolling, low ramp'"
                    class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white placeholder-gray-500 text-sm"
                  />
                </div>
              </div>
              <div class="flex-1 overflow-y-auto px-4 pb-4">
                <div class="space-y-1">
                  <button
                    v-for="skill in filteredLibrarySkills"
                    :key="skill.id"
                    type="button"
                    class="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors"
                    :class="currentAreaAssignedSkillIds.has(skill.id + '|' + (addSkillVariant.trim() || '')) ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed' : 'bg-gray-800 hover:bg-gray-700 text-white'"
                    :disabled="currentAreaAssignedSkillIds.has(skill.id + '|' + (addSkillVariant.trim() || ''))"
                    @click="addSkillToArea(skill.id)"
                  >
                    <span class="min-w-0 truncate">{{ skillDisplayName(skill) }}</span>
                    <span class="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      <span
                        v-if="skill.area"
                        class="px-2 py-0.5 rounded text-[10px] font-medium"
                        :class="areaTagClass(skill.area)"
                      >
                        {{ skill.area }}
                      </span>
                      <span
                        v-if="skillDifficultyLabel(skill)"
                        class="px-2 py-0.5 rounded text-[10px] font-medium capitalize"
                        :class="difficultyTagClass(skillDifficultyLabel(skill))"
                      >
                        {{ skillDifficultyLabel(skill) }}
                      </span>
                    </span>
                  </button>
                </div>
                <p v-if="!filteredLibrarySkills.length" class="text-gray-500 text-sm py-4">
                  {{ language === 'es' ? 'No se encontraron skills.' : 'No skills found.' }}
                </p>
              </div>
            </div>
          </div>
        </Teleport>

        <!-- Direct Subgroups -->
        <section>
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <h3 class="text-base font-bold text-white">{{ language === 'es' ? 'Subgrupos directos' : 'Direct Subgroups' }}</h3>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 w-fit"
            >
              + {{ language === 'es' ? 'Añadir subgrupo' : 'Add Subgroup' }}
            </button>
          </div>
          <div v-if="!subgroups.length" class="py-6 px-4 bg-gray-800/50 border border-gray-700 rounded-xl text-center">
            <p class="text-gray-500 italic">{{ language === 'es' ? 'Aún no hay subgrupos directos' : 'No direct subgroups yet' }}</p>
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="sg in subgroups"
              :key="sg.id"
              class="flex items-center gap-3 p-4 bg-gray-800/80 border border-gray-700 rounded-xl"
            >
              <span class="font-medium text-white flex-1">{{ sg.name }}</span>
              <button type="button" class="p-1.5 text-gray-500 hover:text-amber-400">✏️</button>
              <button type="button" class="p-1.5 text-gray-500 hover:text-red-400">🗑️</button>
            </div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
