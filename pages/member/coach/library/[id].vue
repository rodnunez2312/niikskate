<script setup lang="ts">
import {
  SKATE_TRICK_AREAS,
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
  area_id: string | null
  subgroup_id: string | null
  skill_id: string
  variant: string | null
  sort_order: number
  skill: { id: string; name: string; name_es: string | null; category: string; difficulty?: string } | null
}

interface ProgramSubgroup {
  id: string
  name: string
  area_id: string | null
  skills: AreaSkill[]
}

interface AreaWithSkills {
  id: string
  name: string
  subgroups_count: number
  skills_count: number
  skills: AreaSkill[]
  subgroups: ProgramSubgroup[]
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
const subgroups = ref<ProgramSubgroup[]>([])
const subgroupModalOpen = ref(false)
const subgroupModalAreaId = ref<string | null>(null)
const subgroupEditingId = ref<string | null>(null)
const subgroupName = ref('')
const subgroupSaving = ref(false)
const subgroupError = ref('')
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
const addSkillSubgroupId = ref<string | null>(null)
const addSkillModalOpen = ref(false)
const addSkillSearch = ref('')
const addSkillStructureFilter = ref('')
const addSkillAreaFilter = ref('')
const addSkillVariant = ref('')
const addSkillSaving = ref(false)
const selectedSkillIds = ref<Set<string>>(new Set())

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
    const sgFull = await client
      .from('skill_subgroups')
      .select('id, name, area_id, sort_order')
      .eq('group_id', id)
      .order('sort_order')
    const subgroupsData = sgFull.error
      ? ((await client.from('skill_subgroups').select('id, name, sort_order').eq('group_id', id).order('sort_order')).data || [])
          .map(row => ({ ...row, area_id: null as string | null }))
      : (sgFull.data || [])
    const areaIds = (areasData || []).map((a: { id: string }) => a.id)
    const skillWithPlace = 'id, area_id, skill_id, variant, sort_order, subgroup_id, skill:skills_library(id, name, name_es, category, difficulty)'
    const skillPlain = 'id, area_id, skill_id, variant, sort_order, skill:skills_library(id, name, name_es, category, difficulty)'
    let areaSkillsList: Array<{
      id: string
      area_id: string | null
      subgroup_id: string | null
      skill_id: string
      variant: string | null
      sort_order: number
      skill: any
    }> = []
    if (areaIds.length > 0) {
      const placed = await client.from('area_skills').select(skillWithPlace).in('area_id', areaIds).order('sort_order')
      if (placed.error) {
        const plain = await client.from('area_skills').select(skillPlain).in('area_id', areaIds).order('sort_order')
        areaSkillsList = (plain.data || []).map(row => ({ ...row, subgroup_id: null }))
      } else {
        areaSkillsList = placed.data || []
      }
    }
    const directIds = subgroupsData.filter(s => !s.area_id).map(s => s.id)
    if (directIds.length && !sgFull.error) {
      const extra = await client.from('area_skills').select(skillWithPlace).in('subgroup_id', directIds).order('sort_order')
      if (!extra.error && extra.data) {
        const seen = new Set(areaSkillsList.map(row => row.id))
        for (const row of extra.data) {
          if (!seen.has(row.id)) areaSkillsList.push(row)
        }
      }
    }
    const toSkill = (row: (typeof areaSkillsList)[number]): AreaSkill => ({
      id: row.id,
      area_id: row.area_id,
      subgroup_id: row.subgroup_id ?? null,
      skill_id: row.skill_id,
      variant: row.variant ?? null,
      sort_order: row.sort_order ?? 0,
      skill: row.skill ?? null,
    })
    const bySubgroup = new Map<string, AreaSkill[]>()
    const directByArea = new Map<string, AreaSkill[]>()
    for (const a of areasData || []) directByArea.set(a.id, [])
    for (const row of areaSkillsList) {
      const skill = toSkill(row)
      if (skill.subgroup_id) {
        const list = bySubgroup.get(skill.subgroup_id) || []
        list.push(skill)
        bySubgroup.set(skill.subgroup_id, list)
      } else if (skill.area_id) {
        const list = directByArea.get(skill.area_id) || []
        list.push(skill)
        directByArea.set(skill.area_id, list)
      }
    }
    const sortSkills = (list: AreaSkill[]) => list.sort((x, y) => x.sort_order - y.sort_order)
    const builtSubgroups: ProgramSubgroup[] = subgroupsData.map(s => ({
      id: s.id,
      name: s.name,
      area_id: s.area_id ?? null,
      skills: sortSkills(bySubgroup.get(s.id) || []),
    }))
    subgroups.value = builtSubgroups
    areas.value = (areasData || []).map((a: { id: string; name: string }) => {
      const nested = builtSubgroups.filter(s => s.area_id === a.id)
      const direct = sortSkills(directByArea.get(a.id) || [])
      const nestedCount = nested.reduce((n, s) => n + s.skills.length, 0)
      return {
        id: a.id,
        name: a.name,
        subgroups_count: nested.length,
        skills_count: direct.length + nestedCount,
        skills: direct,
        subgroups: nested,
      }
    })
    const { data: skaterData } = await client
      .from('profiles')
      .select('id, full_name, email, skill_level')
      .eq('role', 'customer')
      .eq('skill_group_id', id)
      .order('full_name')
    programSkaters.value = (skaterData || []) as ProgramSkater[]
    const areaSkills = areas.value.reduce((n, ar) => n + ar.skills_count, 0)
    const directSkills = builtSubgroups.filter(s => !s.area_id).reduce((n, s) => n + s.skills.length, 0)
    const totalSkills = areaSkills + directSkills
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

/** Program names match the library structure, e.g. "Level 2: Balance & Control". */
function structureForProgram(name: string | null | undefined): string {
  const raw = (name || '').trim()
  if (!raw) return ''
  const exact = SKATE_TRICK_STRUCTURES.find(s => s === raw)
  if (exact) return exact
  const level = raw.match(/level\s*(\d+)/i)
  if (!level) return ''
  return SKATE_TRICK_STRUCTURES.find(s => s.startsWith(`Level ${level[1]}:`)) || ''
}

const directSubgroups = computed(() => subgroups.value.filter(s => !s.area_id))

function destinationSkills(): AreaSkill[] {
  if (addSkillSubgroupId.value) {
    const sg = subgroups.value.find(s => s.id === addSkillSubgroupId.value)
    return sg?.skills || []
  }
  const area = areas.value.find(a => a.id === addSkillAreaId.value)
  return area?.skills || []
}

function openAddSkillModal(areaId: string | null, subgroupId: string | null = null) {
  const area = areas.value.find(a => a.id === areaId)
  const areaName = area?.name || ''
  addSkillAreaId.value = areaId
  addSkillSubgroupId.value = subgroupId
  addSkillSearch.value = ''
  addSkillStructureFilter.value = structureForProgram(group.value?.name)
  addSkillAreaFilter.value = (SKATE_TRICK_AREAS as readonly string[]).includes(areaName) ? areaName : ''
  addSkillVariant.value = ''
  selectedSkillIds.value = new Set()
  addSkillModalOpen.value = true
  loadLibrarySkills()
}

function closeAddSkillModal() {
  addSkillModalOpen.value = false
  addSkillAreaId.value = null
  addSkillSubgroupId.value = null
  addSkillSearch.value = ''
  addSkillStructureFilter.value = ''
  addSkillAreaFilter.value = ''
  addSkillVariant.value = ''
  selectedSkillIds.value = new Set()
}

function openSubgroupModal(areaId: string | null, existing?: ProgramSubgroup) {
  subgroupModalAreaId.value = areaId
  subgroupEditingId.value = existing?.id || null
  subgroupName.value = existing?.name || ''
  subgroupError.value = ''
  subgroupModalOpen.value = true
}

function closeSubgroupModal() {
  subgroupModalOpen.value = false
  subgroupEditingId.value = null
  subgroupName.value = ''
  subgroupError.value = ''
}

function schemaHint(error: { message?: string } | null) {
  const msg = error?.message || ''
  if (!/area_id|subgroup_id|schema cache/i.test(msg)) return msg
  return language.value === 'es'
    ? 'Falta la tabla de subgrupos. Ejecuta supabase/migrations/add_area_subgroups.sql en el SQL Editor de Supabase.'
    : 'Subgroup columns are missing. Run supabase/migrations/add_area_subgroups.sql in the Supabase SQL Editor.'
}

async function saveSubgroup() {
  const name = subgroupName.value.trim()
  if (!name || !group.value) return
  subgroupSaving.value = true
  subgroupError.value = ''
  try {
    if (subgroupEditingId.value) {
      const { error } = await client.from('skill_subgroups').update({ name }).eq('id', subgroupEditingId.value)
      if (error) throw error
    } else {
      const { error } = await client.from('skill_subgroups').insert({
        group_id: group.value.id,
        area_id: subgroupModalAreaId.value,
        name,
        sort_order: subgroups.value.length,
      })
      if (error) throw error
      if (subgroupModalAreaId.value) expandedAreaIds.value = new Set([...expandedAreaIds.value, subgroupModalAreaId.value])
    }
    await fetchGroup()
    closeSubgroupModal()
  } catch (e: any) {
    subgroupError.value = schemaHint(e) || 'Error'
  } finally {
    subgroupSaving.value = false
  }
}

async function deleteSubgroup(id: string) {
  const ok = confirm(language.value === 'es' ? '¿Eliminar este subgrupo y sus skills?' : 'Delete this subgroup and its skills?')
  if (!ok) return
  const { error } = await client.from('skill_subgroups').delete().eq('id', id)
  if (error) {
    subgroupError.value = schemaHint(error)
    return
  }
  await fetchGroup()
}

function skillPickKey(skillId: string) {
  return skillId + '|' + (addSkillVariant.value.trim() || '')
}

function isSkillAlreadyInArea(skillId: string) {
  return currentAreaAssignedSkillIds.value.has(skillPickKey(skillId))
}

function toggleSkillPick(skillId: string) {
  if (isSkillAlreadyInArea(skillId)) return
  const next = new Set(selectedSkillIds.value)
  if (next.has(skillId)) next.delete(skillId)
  else next.add(skillId)
  selectedSkillIds.value = next
}

function toggleVisibleSkillPicks() {
  const visible = filteredLibrarySkills.value.filter(s => !isSkillAlreadyInArea(s.id))
  const allPicked = visible.length > 0 && visible.every(s => selectedSkillIds.value.has(s.id))
  const next = new Set(selectedSkillIds.value)
  for (const skill of visible) {
    if (allPicked) next.delete(skill.id)
    else next.add(skill.id)
  }
  selectedSkillIds.value = next
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
  return new Set(destinationSkills().map((as) => as.skill_id + '|' + (as.variant ?? '')))
})

async function addSelectedSkills() {
  const areaId = addSkillAreaId.value
  const ids = [...selectedSkillIds.value].filter(id => !isSkillAlreadyInArea(id))
  if ((!areaId && !addSkillSubgroupId.value) || !ids.length) return
  addSkillSaving.value = true
  try {
    const variant = addSkillVariant.value.trim() || null
    const { error } = await client.from('area_skills').insert(
      ids.map(skill_id => ({
        area_id: addSkillAreaId.value,
        subgroup_id: addSkillSubgroupId.value,
        skill_id,
        variant,
        sort_order: 0,
      })),
    )
    if (error) throw error
    await fetchGroup()
    closeAddSkillModal()
  } catch (e: any) {
    console.error('Add skill to area failed:', e)
    window.alert(schemaHint(e) || e?.message || 'Error')
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
        <div class="mb-6 space-y-3">
          <div class="flex items-start gap-2">
            <div class="flex flex-col shrink-0 pt-1">
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
            <div class="min-w-0 flex-1">
              <div class="flex items-start gap-2">
                <h2 class="text-xl font-bold text-white leading-tight break-words">{{ group.name }}</h2>
                <span
                  v-if="group.is_active"
                  class="mt-1 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center shrink-0"
                  title="Active"
                >
                  <svg class="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
                </span>
              </div>
              <p class="text-sm text-gray-400 mt-1 leading-snug">{{ group.description || '—' }}</p>
            </div>
          </div>
          <div class="flex items-center justify-between gap-2 pl-6">
            <p class="text-xs text-gray-500 leading-snug min-w-0">
              <template v-if="!isPlanningSkillGroupName(group.name)">
                {{ programSkaters.length }} {{ language === 'es' ? 'patinadores' : 'skaters' }},
              </template>
              {{ group.areas_count }} {{ language === 'es' ? 'áreas' : 'areas' }},
              {{ group.subgroups_count }} {{ language === 'es' ? 'subgrupos' : 'subgroups' }},
              {{ group.skills_count }} {{ language === 'es' ? 'skills' : 'skills' }}
            </p>
            <div class="flex items-center shrink-0">
              <button type="button" class="p-2 text-gray-500 hover:text-white" title="Copy">📋</button>
              <button type="button" class="p-2 text-gray-500 hover:text-amber-400" title="Edit">✏️</button>
              <button type="button" class="p-2 text-gray-500 hover:text-red-400" title="Delete">🗑️</button>
            </div>
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
          <div class="flex flex-col gap-2 mb-3">
            <h3 class="text-base font-bold text-white">{{ language === 'es' ? 'Áreas' : 'Areas' }}</h3>
            <div class="flex flex-wrap gap-2">
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
                class="p-3 cursor-pointer"
                @click="toggleAreaExpanded(area.id)"
              >
                <div class="flex items-start gap-2">
                  <svg
                    class="w-5 h-5 text-gray-400 shrink-0 mt-0.5 transition-transform"
                    :class="expandedAreaIds.has(area.id) ? 'rotate-90' : ''"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-2">
                      <span class="font-medium text-white leading-tight break-words">{{ area.name }}</span>
                      <div class="flex items-center shrink-0" @click.stop>
                        <button type="button" class="p-1.5 text-gray-500 hover:text-amber-400" title="Edit">✏️</button>
                        <button type="button" class="p-1.5 text-gray-500 hover:text-red-400" title="Delete">🗑️</button>
                      </div>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">
                      {{ area.subgroups_count }} {{ language === 'es' ? 'subgrupos' : 'subgroups' }},
                      {{ area.skills_count }} {{ language === 'es' ? 'skills' : 'skills' }}
                    </p>
                    <div class="flex flex-wrap gap-1.5 mt-2" @click.stop>
                      <button
                        type="button"
                        class="px-2 py-1 rounded text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500"
                        @click="openAddSkillModal(area.id)"
                      >
                        + {{ language === 'es' ? 'Skill' : 'Skill' }}
                      </button>
                      <button
                        type="button"
                        class="px-2 py-1 rounded text-xs font-semibold bg-gray-700 text-gray-300 hover:bg-gray-600"
                        @click="openSubgroupModal(area.id)"
                      >
                        + {{ language === 'es' ? 'Subgrupo' : 'Subgroup' }}
                      </button>
                    </div>
                  </div>
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
                <div v-if="area.subgroups.length" class="mt-4 space-y-3">
                  <div
                    v-for="sg in area.subgroups"
                    :key="sg.id"
                    class="rounded-lg border border-gray-600 bg-gray-900/40 p-3"
                  >
                    <div class="flex items-center gap-2 mb-2">
                      <p class="text-sm font-semibold text-white flex-1">{{ sg.name }}</p>
                      <button
                        type="button"
                        class="px-2 py-1 rounded text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500"
                        @click="openAddSkillModal(area.id, sg.id)"
                      >
                        + {{ language === 'es' ? 'Skill' : 'Skill' }}
                      </button>
                      <button type="button" class="p-1 text-gray-400 hover:text-amber-400" @click="openSubgroupModal(area.id, sg)">✏️</button>
                      <button type="button" class="p-1 text-gray-400 hover:text-red-400" @click="deleteSubgroup(sg.id)">🗑️</button>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <div
                        v-for="as in sg.skills"
                        :key="as.id"
                        class="inline-flex items-center gap-1 rounded-lg bg-gray-700/80 border border-gray-600 px-2.5 py-1.5 text-sm"
                      >
                        <span class="text-white">{{ skillDisplayName(as.skill) }}</span>
                        <span v-if="as.variant" class="rounded bg-green-500/20 text-green-300 px-1.5 py-0.5 text-xs">{{ as.variant }}</span>
                        <button type="button" class="ml-1 text-gray-400 hover:text-white" @click="removeSkillFromArea(as.id)">×</button>
                      </div>
                      <span v-if="!sg.skills.length" class="text-xs text-gray-500 italic">
                        {{ language === 'es' ? 'Sin skills en este subgrupo.' : 'No skills in this subgroup yet.' }}
                      </span>
                    </div>
                  </div>
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
              <div class="flex-1 overflow-y-auto px-4 pb-2">
                <div class="flex items-center justify-between gap-2 mb-2">
                  <p class="text-xs text-gray-400">
                    {{ selectedSkillIds.size }}
                    {{ language === 'es' ? 'seleccionados' : 'selected' }}
                  </p>
                  <button
                    type="button"
                    class="text-xs font-semibold text-blue-300 hover:text-white"
                    @click="toggleVisibleSkillPicks"
                  >
                    {{ language === 'es' ? 'Seleccionar visibles' : 'Select visible' }}
                  </button>
                </div>
                <div class="space-y-1">
                  <button
                    v-for="skill in filteredLibrarySkills"
                    :key="skill.id"
                    type="button"
                    class="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors"
                    :class="
                      isSkillAlreadyInArea(skill.id)
                        ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                        : selectedSkillIds.has(skill.id)
                          ? 'bg-blue-900/50 text-white ring-2 ring-blue-400'
                          : 'bg-gray-800 hover:bg-gray-700 text-white'
                    "
                    :disabled="isSkillAlreadyInArea(skill.id)"
                    @click="toggleSkillPick(skill.id)"
                  >
                    <span class="flex min-w-0 items-center gap-2">
                      <span
                        class="w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[10px]"
                        :class="selectedSkillIds.has(skill.id) ? 'border-blue-300 bg-blue-500 text-white' : 'border-gray-500'"
                      >
                        {{ selectedSkillIds.has(skill.id) ? '✓' : '' }}
                      </span>
                      <span class="min-w-0 truncate">{{ skillDisplayName(skill) }}</span>
                    </span>
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
              <div class="p-4 border-t border-gray-700">
                <button
                  type="button"
                  class="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-40"
                  :disabled="!selectedSkillIds.size || addSkillSaving"
                  @click="addSelectedSkills"
                >
                  {{
                    addSkillSaving
                      ? '…'
                      : language === 'es'
                        ? `Añadir ${selectedSkillIds.size || ''}`.trim()
                        : `Add ${selectedSkillIds.size || ''}`.trim()
                  }}
                </button>
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
              @click="openSubgroupModal(null)"
            >
              + {{ language === 'es' ? 'Añadir subgrupo' : 'Add Subgroup' }}
            </button>
          </div>
          <div v-if="!directSubgroups.length" class="py-6 px-4 bg-gray-800/50 border border-gray-700 rounded-xl text-center">
            <p class="text-gray-500 italic">{{ language === 'es' ? 'Aún no hay subgrupos directos' : 'No direct subgroups yet' }}</p>
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="sg in directSubgroups"
              :key="sg.id"
              class="p-4 bg-gray-800/80 border border-gray-700 rounded-xl"
            >
              <div class="flex items-center gap-2">
                <span class="font-medium text-white flex-1">{{ sg.name }}</span>
                <button
                  type="button"
                  class="px-2 py-1 rounded text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500"
                  @click="openAddSkillModal(null, sg.id)"
                >
                  + {{ language === 'es' ? 'Skill' : 'Skill' }}
                </button>
                <button type="button" class="p-1.5 text-gray-500 hover:text-amber-400" @click="openSubgroupModal(null, sg)">✏️</button>
                <button type="button" class="p-1.5 text-gray-500 hover:text-red-400" @click="deleteSubgroup(sg.id)">🗑️</button>
              </div>
              <div class="flex flex-wrap gap-2 mt-3">
                <div
                  v-for="as in sg.skills"
                  :key="as.id"
                  class="inline-flex items-center gap-1 rounded-lg bg-gray-700/80 border border-gray-600 px-2.5 py-1.5 text-sm"
                >
                  <span class="text-white">{{ skillDisplayName(as.skill) }}</span>
                  <span v-if="as.variant" class="rounded bg-green-500/20 text-green-300 px-1.5 py-0.5 text-xs">{{ as.variant }}</span>
                  <button type="button" class="ml-1 text-gray-400 hover:text-white" @click="removeSkillFromArea(as.id)">×</button>
                </div>
                <span v-if="!sg.skills.length" class="text-xs text-gray-500 italic">
                  {{ language === 'es' ? 'Sin skills en este subgrupo.' : 'No skills in this subgroup yet.' }}
                </span>
              </div>
            </div>
          </div>
        </section>

        <Teleport to="body">
          <div
            v-if="subgroupModalOpen"
            class="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 p-4"
            @click.self="closeSubgroupModal"
          >
            <form
              class="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl p-5"
              @submit.prevent="saveSubgroup"
              @click.stop
            >
              <h3 class="text-lg font-semibold text-white mb-3">
                {{
                  subgroupEditingId
                    ? (language === 'es' ? 'Editar subgrupo' : 'Edit subgroup')
                    : (language === 'es' ? 'Nuevo subgrupo' : 'New subgroup')
                }}
              </h3>
              <label class="block text-xs text-gray-400 mb-1">
                {{ language === 'es' ? 'Nombre' : 'Name' }}
              </label>
              <input
                v-model="subgroupName"
                required
                class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                :placeholder="language === 'es' ? 'Ej. Nose stalls' : 'e.g. Nose stalls'"
              />
              <p v-if="subgroupError" class="mt-2 text-sm text-red-400">{{ subgroupError }}</p>
              <div class="flex gap-2 mt-4">
                <button type="button" class="flex-1 py-2 rounded-lg border border-gray-600 text-gray-200" @click="closeSubgroupModal">
                  {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
                </button>
                <button type="submit" class="flex-1 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-40" :disabled="subgroupSaving || !subgroupName.trim()">
                  {{ language === 'es' ? 'Guardar' : 'Save' }}
                </button>
              </div>
            </form>
          </div>
        </Teleport>
      </div>
    </template>
  </div>
</template>
