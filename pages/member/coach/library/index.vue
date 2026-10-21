<script setup lang="ts">
import {
  SKATE_TRICK_AREAS,
  SKATE_TRICK_STRUCTURES,
  areaTagClass,
  skillStructure,
} from '~/utils/skateTrickTaxonomy'
import {
  isPlanningSkillGroupName,
  normalizeSkillGroupDisplayName,
  publicProgramLevelCopy,
} from '~/utils/skillGroupLevels'
import { disciplineLabel, isTrainingDiscipline } from '~/utils/trainingDisciplines'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

type SkillChip = {
  id: string
  skillId: string
  name: string
  nameEs: string | null
  variant: string | null
}

type SubgroupDash = {
  id: string
  name: string
  skills: SkillChip[]
}

type AreaDash = {
  id: string
  groupId: string
  name: string
  skills: SkillChip[]
  subgroups: SubgroupDash[]
}

type LibrarySkill = {
  id: string
  name: string
  name_es: string | null
  category: string
  area?: string | null
  structure?: string | null
  categoria?: string | null
  difficulty?: string | null
}

type LevelRow = {
  id: string
  name: string
  description: string | null
  color: string | null
  sort_order: number
  is_active: boolean
  is_system?: boolean
  created_by: string | null
  program_id: string | null
  areas: AreaDash[]
  directSubgroups: SubgroupDash[]
  students_count: number
}

type ProgramRow = {
  id: string
  name: string
  discipline: string
  description: string | null
  is_active: boolean
  created_by: string | null
  sort_order: number
  is_favorite: boolean
  levels: LevelRow[]
}

const ORDER_KEY = 'niik-training-program-order'
const FAV_KEY = 'niik-training-program-favorites'

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

const userRole = ref<'coach' | 'admin' | null>(null)
const loading = ref(true)
const schemaMissing = ref(false)
type RosterStudent = { id: string; full_name: string | null; skill_group_id: string | null }

const programs = ref<ProgramRow[]>([])
const roster = ref<RosterStudent[]>([])
const rosterProgramId = ref<string | null>(null)
const rosterAddId = ref('')
const rosterLevelId = ref('')
const rosterSaving = ref(false)
const rosterError = ref('')
const expandedId = ref<string | null>(null)
const expandedLevelId = ref<string | null>(null)
const expandedAreaIds = ref<Set<string>>(new Set())
const areaModalOpen = ref(false)
const areaGroupId = ref<string | null>(null)
const areaEditingId = ref<string | null>(null)
const areaName = ref('')
const areaSaving = ref(false)
const areaError = ref('')
const subgroupModalOpen = ref(false)
const subgroupGroupId = ref<string | null>(null)
const subgroupAreaId = ref<string | null>(null)
const subgroupEditingId = ref<string | null>(null)
const subgroupName = ref('')
const subgroupSaving = ref(false)
const subgroupError = ref('')
const librarySkills = ref<LibrarySkill[]>([])
const addSkillOpen = ref(false)
const addSkillAreaId = ref<string | null>(null)
const addSkillSubgroupId = ref<string | null>(null)
const addSkillSearch = ref('')
const addSkillStructureFilter = ref('')
const addSkillAreaFilter = ref('')
const addSkillVariant = ref('')
const addSkillSaving = ref(false)
const selectedSkillIds = ref<Set<string>>(new Set())
const orderReady = ref(true)
const draggingId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)

const createModalOpen = ref(false)
const newName = ref('')
const newDescription = ref('')
const { selected: selectedSport, enabled: enabledSports, catalog: academySports } = useEnabledSports()
const sportChoices = computed(() => academySports.filter(sport => enabledSports.value.includes(sport.id)))
const newDiscipline = ref('skateboarding')
const createSaving = ref(false)

const levelModalOpen = ref(false)
const levelProgramId = ref<string | null>(null)
const newLevelName = ref('')
const newLevelDescription = ref('')
const newLevelColor = ref('#6366f1')
const levelSaving = ref(false)

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

function readLocalIds(key: string) {
  if (!import.meta.client) return [] as string[]
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeLocalIds(key: string, ids: string[]) {
  if (import.meta.client) localStorage.setItem(key, JSON.stringify(ids))
}

async function fetchPrograms(quiet = false) {
  if (!quiet) loading.value = true
  schemaMissing.value = false
  try {
    const detailed = await client
      .from('training_programs')
      .select('id, name, discipline, description, is_active, created_by, sort_order, is_favorite')
      .order('sort_order')
    let programRows = detailed.data
    orderReady.value = !detailed.error
    if (detailed.error) {
      const msg = detailed.error.message || ''
      if (/sort_order|is_favorite/i.test(msg)) {
        const plain = await client
          .from('training_programs')
          .select('id, name, discipline, description, is_active, created_by')
          .order('created_at')
        if (plain.error) {
          schemaMissing.value = true
          programs.value = []
          return
        }
        programRows = plain.data
      } else {
        schemaMissing.value = true
        programs.value = []
        return
      }
    }

    const { data: groupsData } = await client
      .from('skill_groups')
      .select('id, name, description, color, sort_order, is_active, is_system, created_by, program_id')
      .order('sort_order')
    const { data: areasData } = await client.from('skill_areas').select('id, group_id, name, sort_order').order('sort_order')
    const subgroupsRes = await client.from('skill_subgroups').select('id, group_id, area_id, name').order('sort_order')
    const subgroupsData = subgroupsRes.error
      ? ((await client.from('skill_subgroups').select('id, group_id, name').order('sort_order')).data || [])
          .map(row => ({ ...row, area_id: null as string | null }))
      : (subgroupsRes.data || [])
    const skillsJoined = await client
      .from('area_skills')
      .select('id, area_id, subgroup_id, skill_id, variant, skill:skills_library(name, name_es)')
    const skillRows = skillsJoined.error
      ? ((await client.from('area_skills').select('id, area_id, skill_id, variant, skill:skills_library(name, name_es)')).data || [])
          .map(row => ({ ...row, subgroup_id: null as string | null }))
      : (skillsJoined.data || [])
    const { data: skaterRows } = await client
      .from('profiles')
      .select('id, full_name, skill_group_id')
      .eq('role', 'customer')
      .order('full_name')

    roster.value = ((skaterRows || []) as RosterStudent[]).map(row => ({
      id: row.id,
      full_name: row.full_name,
      skill_group_id: row.skill_group_id,
    }))
    const studentsByGroup: Record<string, number> = {}
    for (const row of roster.value) {
      if (row.skill_group_id) studentsByGroup[row.skill_group_id] = (studentsByGroup[row.skill_group_id] || 0) + 1
    }

    const toChip = (row: {
      id: string
      skill_id: string
      variant?: string | null
      skill?: { name?: string | null; name_es?: string | null } | { name?: string | null; name_es?: string | null }[] | null
    }): SkillChip => {
      const skill = Array.isArray(row.skill) ? row.skill[0] : row.skill
      return {
        id: row.id,
        skillId: row.skill_id,
        name: skill?.name || 'Skill',
        nameEs: skill?.name_es || null,
        variant: row.variant || null,
      }
    }
    const skillsByArea: Record<string, SkillChip[]> = {}
    const skillsBySubgroup: Record<string, SkillChip[]> = {}
    for (const row of skillRows || []) {
      const chip = toChip(row)
      if (row.subgroup_id) {
        if (!skillsBySubgroup[row.subgroup_id]) skillsBySubgroup[row.subgroup_id] = []
        skillsBySubgroup[row.subgroup_id].push(chip)
      } else if (row.area_id) {
        if (!skillsByArea[row.area_id]) skillsByArea[row.area_id] = []
        skillsByArea[row.area_id].push(chip)
      }
    }

    const subgroupsByArea: Record<string, SubgroupDash[]> = {}
    const directByGroup: Record<string, SubgroupDash[]> = {}
    for (const row of subgroupsData || []) {
      const areaId = (row as { area_id?: string | null }).area_id || null
      const dash: SubgroupDash = {
        id: row.id,
        name: (row as { name?: string }).name || 'Subgroup',
        skills: skillsBySubgroup[row.id] || [],
      }
      if (areaId) {
        if (!subgroupsByArea[areaId]) subgroupsByArea[areaId] = []
        subgroupsByArea[areaId].push(dash)
      } else {
        if (!directByGroup[row.group_id]) directByGroup[row.group_id] = []
        directByGroup[row.group_id].push(dash)
      }
    }

    const areasByGroup: Record<string, AreaDash[]> = {}
    for (const area of areasData || []) {
      if (!areasByGroup[area.group_id]) areasByGroup[area.group_id] = []
      areasByGroup[area.group_id].push({
        id: area.id,
        groupId: area.group_id,
        name: area.name,
        skills: skillsByArea[area.id] || [],
        subgroups: subgroupsByArea[area.id] || [],
      })
    }

    const levels: LevelRow[] = (groupsData || [])
      .filter((g: { is_active?: boolean }) => g.is_active !== false)
      .map((g: any) => ({
        ...g,
        areas: areasByGroup[g.id] || [],
        directSubgroups: directByGroup[g.id] || [],
        students_count: studentsByGroup[g.id] || 0,
      }))

    const favorites = new Set(readLocalIds(FAV_KEY))
    const savedOrder = readLocalIds(ORDER_KEY)
    let rows = ((programRows || []) as ProgramRow[])
      .filter(row => row.is_active !== false)
      .map(row => ({
        ...row,
        sort_order: Number(row.sort_order) || 0,
        is_favorite: orderReady.value ? Boolean(row.is_favorite) : favorites.has(row.id),
        levels: levels
          .filter(level => level.program_id === row.id)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
      }))

    if (!orderReady.value && savedOrder.length) {
      rows.sort((a, b) => {
        const ai = savedOrder.indexOf(a.id)
        const bi = savedOrder.indexOf(b.id)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      })
    } else {
      rows.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    }

    programs.value = rows
    const visible = rows.filter(row => programMatchesSport(row))
    if (!visible.some(row => row.id === expandedId.value)) {
      expandedId.value = visible[0]?.id || null
    }
  } catch (e) {
    console.error('Error fetching programs:', e)
  } finally {
    loading.value = false
  }
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id
  expandedLevelId.value = null
}

function toggleLevel(id: string) {
  expandedLevelId.value = expandedLevelId.value === id ? null : id
}

function canDeleteProgram(program: { created_by: string | null }) {
  if (userRole.value === 'admin') return true
  if (userRole.value === 'coach' && user.value?.id) return program.created_by === user.value.id
  return false
}

function canDeleteLevel(level: { name: string; created_by: string | null; is_system?: boolean }) {
  if (level.is_system || isPlanningSkillGroupName(level.name)) return false
  if (userRole.value === 'admin') return true
  if (userRole.value === 'coach' && user.value?.id) return level.created_by === user.value.id
  return false
}

async function deleteProgram(id: string, e?: Event) {
  e?.stopPropagation()
  const msg = language.value === 'es'
    ? '¿Eliminar este programa? Se borrarán sus niveles, áreas y skills asignados.'
    : 'Delete this program? Its levels, areas, and assigned skills will be removed.'
  if (!confirm(msg)) return
  try {
    const { error } = await client.from('training_programs').delete().eq('id', id)
    if (error) throw error
    await fetchPrograms()
  } catch (err) {
    console.error('Delete program failed:', err)
  }
}

async function deleteLevel(id: string, e?: Event) {
  e?.stopPropagation()
  const msg = language.value === 'es'
    ? '¿Eliminar este nivel? Se borrarán sus áreas y skills asignados.'
    : 'Delete this level? Its areas and assigned skills will be removed.'
  if (!confirm(msg)) return
  try {
    const { error } = await client.from('skill_groups').delete().eq('id', id)
    if (error) throw error
    await fetchPrograms()
  } catch (err) {
    console.error('Delete level failed:', err)
  }
}

function openCreateModal() {
  newName.value = ''
  newDescription.value = ''
  newDiscipline.value = enabledSports.value[0] || 'skateboarding'
  createModalOpen.value = true
}

/** ?create=1 (from the sport picker's to-do list) opens the new-program form. */
const route = useRoute()
function openCreateFromLink() {
  if (route.query.create !== '1') return
  openCreateModal()
  router.replace({ query: { ...route.query, create: undefined } })
}
watch(() => route.query.create, openCreateFromLink)
onMounted(openCreateFromLink)

function closeCreateModal() {
  createModalOpen.value = false
}

async function createProgram() {
  const name = newName.value.trim()
  if (!name) return
  createSaving.value = true
  try {
    const { error } = await client
      .from('training_programs')
      .insert({
        name,
        discipline: newDiscipline.value,
        description: newDescription.value.trim() || null,
        is_active: true,
        created_by: user.value?.id ?? null,
        ...(orderReady.value ? { sort_order: programs.value.length } : {}),
      })
    if (error) throw error
    await fetchPrograms()
    closeCreateModal()
  } catch (e) {
    console.error('Create program failed:', e)
  } finally {
    createSaving.value = false
  }
}

function openLevelModal(programId: string) {
  levelProgramId.value = programId
  newLevelName.value = ''
  newLevelDescription.value = ''
  newLevelColor.value = '#6366f1'
  levelModalOpen.value = true
}

function closeLevelModal() {
  levelModalOpen.value = false
  levelProgramId.value = null
}

async function createLevel() {
  const name = newLevelName.value.trim()
  const programId = levelProgramId.value
  if (!name || !programId) return
  levelSaving.value = true
  try {
    const siblings = programs.value.find(p => p.id === programId)?.levels || []
    const maxOrder = siblings.length ? Math.max(...siblings.map(g => g.sort_order || 0)) : 0
    const { error } = await client
      .from('skill_groups')
      .insert({
        name,
        description: newLevelDescription.value.trim() || null,
        color: newLevelColor.value || null,
        sort_order: maxOrder + 1,
        is_active: true,
        created_by: user.value?.id ?? null,
        program_id: programId,
      })
    if (error) throw error
    expandedId.value = programId
    closeLevelModal()
  } catch (e) {
    console.error('Create level failed:', e)
  } finally {
    levelSaving.value = false
  }
}

const rosterProgram = computed(() => programs.value.find(program => program.id === rosterProgramId.value) || null)

function assignableLevels(program: ProgramRow) {
  return program.levels.filter(level => !isPlanningSkillGroupName(level.name))
}

const rosterMembers = computed(() => {
  const program = rosterProgram.value
  if (!program) return [] as Array<RosterStudent & { levelName: string }>
  const ids = new Set(assignableLevels(program).map(level => level.id))
  return roster.value
    .filter(student => student.skill_group_id && ids.has(student.skill_group_id))
    .map(student => ({
      ...student,
      levelName: normalizeSkillGroupDisplayName(program.levels.find(level => level.id === student.skill_group_id)?.name),
    }))
})

const rosterCandidates = computed(() => {
  const program = rosterProgram.value
  if (!program) return []
  const ids = new Set(assignableLevels(program).map(level => level.id))
  return roster.value.filter(student => !student.skill_group_id || !ids.has(student.skill_group_id))
})

function openRoster(program: ProgramRow, event?: Event) {
  event?.stopPropagation()
  rosterProgramId.value = program.id
  rosterError.value = ''
  rosterAddId.value = ''
  rosterLevelId.value = assignableLevels(program)[0]?.id || ''
}

function closeRoster() {
  rosterProgramId.value = null
}

async function addRosterStudent() {
  if (!rosterAddId.value || !rosterLevelId.value) return
  rosterSaving.value = true
  rosterError.value = ''
  try {
    const { error } = await client.from('profiles').update({ skill_group_id: rosterLevelId.value }).eq('id', rosterAddId.value)
    if (error) throw error
    rosterAddId.value = ''
    await fetchPrograms(true)
  } catch (e: any) {
    rosterError.value = e?.message || 'Error'
  } finally {
    rosterSaving.value = false
  }
}

async function removeRosterStudent(id: string) {
  rosterSaving.value = true
  rosterError.value = ''
  try {
    const { error } = await client.from('profiles').update({ skill_group_id: null }).eq('id', id)
    if (error) throw error
    await fetchPrograms(true)
  } catch (e: any) {
    rosterError.value = e?.message || 'Error'
  } finally {
    rosterSaving.value = false
  }
}

function chipName(skill: SkillChip) {
  return language.value === 'es' ? (skill.nameEs || skill.name) : skill.name
}

function toggleArea(id: string) {
  const next = new Set(expandedAreaIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedAreaIds.value = next
}

function findArea(areaId: string | null) {
  if (!areaId) return null
  for (const program of programs.value) {
    for (const level of program.levels) {
      const area = level.areas.find(item => item.id === areaId)
      if (area) return area
    }
  }
  return null
}

function destinationSkills() {
  if (addSkillSubgroupId.value) {
    for (const program of programs.value) {
      for (const level of program.levels) {
        const direct = level.directSubgroups.find(group => group.id === addSkillSubgroupId.value)
        if (direct) return direct.skills
        for (const area of level.areas) {
          const nested = area.subgroups.find(group => group.id === addSkillSubgroupId.value)
          if (nested) return nested.skills
        }
      }
    }
    return []
  }
  return findArea(addSkillAreaId.value)?.skills || []
}

function isSkillAlreadyInArea(skillId: string) {
  const variant = addSkillVariant.value.trim()
  return destinationSkills().some(skill => skill.skillId === skillId && (skill.variant || '') === variant)
}

function structureForLevel(name: string) {
  const raw = name.trim()
  const exact = SKATE_TRICK_STRUCTURES.find(item => item === raw)
  if (exact) return exact
  const level = raw.match(/level\s*(\d+)/i)
  if (!level) return ''
  return SKATE_TRICK_STRUCTURES.find(item => item.startsWith(`Level ${level[1]}:`)) || ''
}

function openAreaEditor(groupId: string, area?: AreaDash) {
  areaGroupId.value = groupId
  areaEditingId.value = area?.id || null
  areaName.value = area?.name || ''
  areaError.value = ''
  areaModalOpen.value = true
}

function closeAreaEditor() {
  areaModalOpen.value = false
  areaEditingId.value = null
  areaName.value = ''
}

async function saveArea() {
  const name = areaName.value.trim()
  const groupId = areaGroupId.value
  if (!name || !groupId) return
  areaSaving.value = true
  areaError.value = ''
  try {
    if (areaEditingId.value) {
      const { error } = await client.from('skill_areas').update({ name }).eq('id', areaEditingId.value)
      if (error) throw error
    } else {
      const level = programs.value.flatMap(program => program.levels).find(item => item.id === groupId)
      const { error } = await client.from('skill_areas').insert({
        group_id: groupId,
        name,
        sort_order: (level?.areas.length || 0) + 1,
      })
      if (error) throw error
    }
    await fetchPrograms(true)
    closeAreaEditor()
  } catch (e: any) {
    areaError.value = e?.message || 'Error'
  } finally {
    areaSaving.value = false
  }
}

async function deleteArea(id: string) {
  const ok = confirm(language.value === 'es' ? '¿Eliminar esta área y sus skills?' : 'Delete this area and its skills?')
  if (!ok) return
  const { error } = await client.from('skill_areas').delete().eq('id', id)
  if (error) {
    window.alert(error.message)
    return
  }
  await fetchPrograms(true)
}

function openSubgroupEditor(groupId: string, areaId: string | null, existing?: SubgroupDash) {
  subgroupGroupId.value = groupId
  subgroupAreaId.value = areaId
  subgroupEditingId.value = existing?.id || null
  subgroupName.value = existing?.name || ''
  subgroupError.value = ''
  subgroupModalOpen.value = true
}

function closeSubgroupEditor() {
  subgroupModalOpen.value = false
  subgroupEditingId.value = null
  subgroupName.value = ''
}

async function saveSubgroup() {
  const name = subgroupName.value.trim()
  const groupId = subgroupGroupId.value
  if (!name || !groupId) return
  subgroupSaving.value = true
  subgroupError.value = ''
  try {
    if (subgroupEditingId.value) {
      const { error } = await client.from('skill_subgroups').update({ name }).eq('id', subgroupEditingId.value)
      if (error) throw error
    } else {
      const { error } = await client.from('skill_subgroups').insert({
        group_id: groupId,
        area_id: subgroupAreaId.value,
        name,
        sort_order: 0,
      })
      if (error) throw error
    }
    await fetchPrograms(true)
    closeSubgroupEditor()
  } catch (e: any) {
    const msg = e?.message || 'Error'
    subgroupError.value = /area_id|schema cache/i.test(msg)
      ? (language.value === 'es'
          ? 'Falta la columna de subgrupos. Ejecuta supabase/migrations/add_area_subgroups.sql en el editor SQL.'
          : 'Subgroup columns are missing. Run supabase/migrations/add_area_subgroups.sql in the SQL editor.')
      : msg
  } finally {
    subgroupSaving.value = false
  }
}

async function deleteSubgroup(id: string) {
  const ok = confirm(language.value === 'es' ? '¿Eliminar este subgrupo y sus skills?' : 'Delete this subgroup and its skills?')
  if (!ok) return
  const { error } = await client.from('skill_subgroups').delete().eq('id', id)
  if (error) {
    window.alert(error.message)
    return
  }
  await fetchPrograms(true)
}

async function loadLibrarySkills() {
  const { data } = await client
    .from('skills_library')
    .select('id, name, name_es, category, area, structure, categoria, difficulty')
    .eq('is_active', true)
    .order('sort_order')
  librarySkills.value = (data || []) as LibrarySkill[]
}

function openSkillPicker(levelName: string, areaId: string | null, subgroupId: string | null = null) {
  addSkillAreaId.value = areaId
  addSkillSubgroupId.value = subgroupId
  addSkillSearch.value = ''
  addSkillStructureFilter.value = structureForLevel(levelName)
  const areaName = findArea(areaId)?.name || ''
  addSkillAreaFilter.value = (SKATE_TRICK_AREAS as readonly string[]).includes(areaName) ? areaName : ''
  addSkillVariant.value = ''
  selectedSkillIds.value = new Set()
  addSkillOpen.value = true
  loadLibrarySkills()
}

function closeSkillPicker() {
  addSkillOpen.value = false
  selectedSkillIds.value = new Set()
}

function toggleSkillPick(skillId: string) {
  if (isSkillAlreadyInArea(skillId)) return
  const next = new Set(selectedSkillIds.value)
  if (next.has(skillId)) next.delete(skillId)
  else next.add(skillId)
  selectedSkillIds.value = next
}

const filteredLibrarySkills = computed(() => {
  let list = librarySkills.value
  if (addSkillStructureFilter.value) list = list.filter(skill => skillStructure(skill) === addSkillStructureFilter.value)
  if (addSkillAreaFilter.value) list = list.filter(skill => skill.area === addSkillAreaFilter.value)
  const query = addSkillSearch.value.trim().toLowerCase()
  if (!query) return list
  return list.filter(skill =>
    (skill.name || '').toLowerCase().includes(query)
    || (skill.name_es || '').toLowerCase().includes(query)
    || (skill.area || '').toLowerCase().includes(query)
    || skillStructure(skill).toLowerCase().includes(query),
  )
})

async function addSelectedSkills() {
  const ids = [...selectedSkillIds.value].filter(id => !isSkillAlreadyInArea(id))
  if ((!addSkillAreaId.value && !addSkillSubgroupId.value) || !ids.length) return
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
    await fetchPrograms(true)
    closeSkillPicker()
  } catch (e: any) {
    window.alert(e?.message || 'Error')
  } finally {
    addSkillSaving.value = false
  }
}

async function removeSkill(id: string) {
  const { error } = await client.from('area_skills').delete().eq('id', id)
  if (error) {
    window.alert(error.message)
    return
  }
  await fetchPrograms(true)
}

function studentsOn(program: ProgramRow) {
  return program.levels.reduce((sum, level) => sum + (isPlanningSkillGroupName(level.name) ? 0 : level.students_count), 0)
}

function areasOn(program: ProgramRow) {
  return program.levels.reduce((sum, level) => sum + level.areas.length, 0)
}

function skillTotal(area: AreaDash) {
  return area.skills.length + area.subgroups.reduce((sum, group) => sum + group.skills.length, 0)
}

function skillsOn(program: ProgramRow) {
  return program.levels.reduce(
    (sum, level) => sum + level.directSubgroups.reduce((n, group) => n + group.skills.length, 0) + level.areas.reduce((n, area) => n + skillTotal(area), 0),
    0,
  )
}

function subgroupsOn(program: ProgramRow) {
  return program.levels.reduce(
    (sum, level) => sum + level.directSubgroups.length + level.areas.reduce((n, area) => n + area.subgroups.length, 0),
    0,
  )
}

function programMatchesSport(program: { discipline?: string | null }) {
  return isTrainingDiscipline(selectedSport.value) && (program.discipline || 'skateboarding') === selectedSport.value
}

const visiblePrograms = computed(() => programs.value.filter(programMatchesSport))

watch(visiblePrograms, (rows) => {
  if (!rows.some(row => row.id === expandedId.value)) expandedId.value = rows[0]?.id || null
})

async function persistOrder() {
  const ids = programs.value.map(program => program.id)
  writeLocalIds(ORDER_KEY, ids)
  if (!orderReady.value) return
  await Promise.all(programs.value.map((program, index) =>
    client.from('training_programs').update({ sort_order: index }).eq('id', program.id),
  ))
}

function writeVisibleOrder(visible: ProgramRow[]) {
  const slots = programs.value
    .map((program, index) => (programMatchesSport(program) ? index : -1))
    .filter(index => index >= 0)
  const list = [...programs.value]
  slots.forEach((slot, index) => {
    const next = visible[index]
    if (next) list[slot] = next
  })
  programs.value = list
}

async function moveProgram(index: number, delta: number) {
  const visible = [...visiblePrograms.value]
  const next = index + delta
  if (next < 0 || next >= visible.length) return
  const [item] = visible.splice(index, 1)
  if (!item) return
  visible.splice(next, 0, item)
  writeVisibleOrder(visible)
  await persistOrder()
}

function onDragStart(id: string) {
  draggingId.value = id
}

function onDragOver(id: string) {
  if (draggingId.value && draggingId.value !== id) dragOverId.value = id
}

async function onDrop(targetId: string) {
  const fromId = draggingId.value
  draggingId.value = null
  dragOverId.value = null
  if (!fromId || fromId === targetId) return
  const visible = [...visiblePrograms.value]
  const from = visible.findIndex(program => program.id === fromId)
  const to = visible.findIndex(program => program.id === targetId)
  if (from < 0 || to < 0) return
  const [item] = visible.splice(from, 1)
  if (!item) return
  visible.splice(to, 0, item)
  writeVisibleOrder(visible)
  await persistOrder()
}

async function toggleFavorite(program: ProgramRow, event?: Event) {
  event?.stopPropagation()
  program.is_favorite = !program.is_favorite
  const favorites = programs.value.filter(row => row.is_favorite).map(row => row.id)
  writeLocalIds(FAV_KEY, favorites)
  if (!orderReady.value) return
  const { error } = await client.from('training_programs').update({ is_favorite: program.is_favorite }).eq('id', program.id)
  if (error) orderReady.value = false
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <MemberStaffPageHeader
      :title="language === 'es' ? 'Programas' : 'Programs'"
      :subtitle="language === 'es' ? 'Estudiantes, áreas, skills y subgrupos' : 'Students, areas, skills, and subgroups'"
    >
      <template #actions>
        <button
          type="button"
          class="px-4 py-2.5 rounded-xl bg-acid text-charcoal font-semibold text-sm hover:bg-acid-300"
          @click="openCreateModal"
        >
          + {{ language === 'es' ? 'Añadir programa' : 'Add program' }}
        </button>
      </template>
    </MemberStaffPageHeader>

    <div class="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div
        v-if="schemaMissing"
        class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      >
        {{
          language === 'es'
            ? 'Falta la tabla de programas. Ejecuta supabase/migrations/add_training_programs.sql en el editor SQL de Supabase.'
            : 'The programs table is missing. Run supabase/migrations/add_training_programs.sql in the Supabase SQL editor.'
        }}
      </div>
      <div
        v-else-if="!orderReady"
        class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
      >
        {{
          language === 'es'
            ? 'Para guardar el orden y los favoritos, vuelve a ejecutar supabase/migrations/add_training_programs.sql en el editor SQL. Hasta entonces se recuerdan en este navegador.'
            : 'To save order and favorites, run supabase/migrations/add_training_programs.sql again in the SQL editor. Until then they stay in this browser.'
        }}
      </div>

      <div v-if="loading" class="py-12 text-center">
        <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto" />
      </div>

      <div v-else-if="!visiblePrograms.length && !schemaMissing" class="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <p class="text-gray-400">
          {{ language === 'es' ? 'No hay programas. Añade uno para empezar.' : 'No programs yet. Add one to get started.' }}
        </p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="(p, index) in visiblePrograms"
          :key="p.id"
          class="bg-gray-900 border rounded-xl overflow-hidden"
          :class="dragOverId === p.id ? 'border-amber-400' : 'border-gray-800'"
          draggable="true"
          @dragstart="onDragStart(p.id)"
          @dragover.prevent="onDragOver(p.id)"
          @dragend="draggingId = null; dragOverId = null"
          @drop="onDrop(p.id)"
        >
          <div class="flex items-start gap-2 p-4">
            <button
              type="button"
              class="mt-1 p-1 text-gray-500 hover:text-white"
              :title="language === 'es' ? 'Arrastra para ordenar' : 'Drag to reorder'"
              @click="toggleExpand(p.id)"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 4a1 1 0 100-2 1 1 0 000 2zm6-1a1 1 0 11-2 0 1 1 0 012 0zM7 11a1 1 0 100-2 1 1 0 000 2zm6-1a1 1 0 11-2 0 1 1 0 012 0zM7 17a1 1 0 100-2 1 1 0 000 2zm6-1a1 1 0 11-2 0 1 1 0 012 0z" />
              </svg>
            </button>
            <button
              type="button"
              class="mt-0.5 p-1"
              :class="p.is_favorite ? 'text-amber-300' : 'text-gray-600 hover:text-amber-200'"
              :title="language === 'es' ? 'Marcar como importante' : 'Mark as important'"
              @click="toggleFavorite(p, $event)"
            >
              <svg class="w-5 h-5" :fill="p.is_favorite ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </button>
            <div class="flex-1 min-w-0">
              <button type="button" class="w-full text-left" @click="toggleExpand(p.id)">
                <p class="font-bold text-white flex items-center gap-2 flex-wrap">
                  <span>{{ p.name }}</span>
                  <span class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200">
                    {{ disciplineLabel(p.discipline, language === 'es') }}
                  </span>
                  <span class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                    {{ language === 'es' ? 'Activo' : 'Active' }}
                  </span>
                </p>
                <p v-if="p.description" class="text-sm text-gray-500 truncate">{{ p.description }}</p>
              </button>
              <div class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-black/40 border border-gray-800 px-3 py-2 text-left hover:border-gold-400/50"
                  @click="openRoster(p, $event)"
                >
                  <div class="text-lg font-bold text-gold-300">{{ studentsOn(p) }}</div>
                  <div class="text-[11px] text-gray-500">{{ language === 'es' ? 'Estudiantes' : 'Students' }}</div>
                </button>
                <div class="rounded-lg bg-black/40 border border-gray-800 px-3 py-2">
                  <div class="text-lg font-bold text-sky-300">{{ areasOn(p) }}</div>
                  <div class="text-[11px] text-gray-500">{{ language === 'es' ? 'Áreas' : 'Areas' }}</div>
                </div>
                <div class="rounded-lg bg-black/40 border border-gray-800 px-3 py-2">
                  <div class="text-lg font-bold text-emerald-300">{{ skillsOn(p) }}</div>
                  <div class="text-[11px] text-gray-500">Skills</div>
                </div>
                <div class="rounded-lg bg-black/40 border border-gray-800 px-3 py-2">
                  <div class="text-lg font-bold text-violet-300">{{ subgroupsOn(p) }}</div>
                  <div class="text-[11px] text-gray-500">{{ language === 'es' ? 'Subgrupos' : 'Subgroups' }}</div>
                </div>
              </div>
            </div>
            <div class="flex flex-col items-center gap-1">
              <button
                type="button"
                class="p-1 text-gray-500 hover:text-white disabled:opacity-30"
                :disabled="index === 0"
                :title="language === 'es' ? 'Subir' : 'Move up'"
                @click="moveProgram(index, -1)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" /></svg>
              </button>
              <button
                type="button"
                class="p-1 text-gray-500 hover:text-white disabled:opacity-30"
                :disabled="index === visiblePrograms.length - 1"
                :title="language === 'es' ? 'Bajar' : 'Move down'"
                @click="moveProgram(index, 1)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
              </button>
              <button
                v-if="canDeleteProgram(p)"
                type="button"
                class="p-1 text-gray-500 hover:text-red-400"
                @click="deleteProgram(p.id, $event)"
              >
                🗑️
              </button>
            </div>
          </div>

          <div v-if="expandedId === p.id" class="border-t border-gray-800 px-4 py-3 bg-black/30 space-y-3">
            <div v-if="!p.levels.length" class="text-xs text-gray-500">
              {{ language === 'es' ? 'Este programa aún no tiene niveles.' : 'This program has no levels yet.' }}
            </div>
            <div v-for="level in p.levels" :key="level.id" class="rounded-3xl border border-charcoal-600 bg-charcoal-800 text-cream">
              <div class="flex items-center gap-3 px-4 py-3">
                <button type="button" class="flex-1 min-w-0 flex items-center gap-3 text-left" @click="toggleLevel(level.id)">
                <span class="w-4 shrink-0 text-center text-base leading-none text-cream/50" aria-hidden="true">{{ expandedLevelId === level.id ? '−' : '+' }}</span>
                <span v-if="publicProgramLevelCopy(level.name, language === 'es')" class="text-xl leading-none shrink-0" aria-hidden="true">
                  {{ publicProgramLevelCopy(level.name, language === 'es')?.emoji }}
                </span>
                <span v-else class="w-3 h-3 rounded-full shrink-0 bg-acid" />
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-bold text-cream">
                    {{ publicProgramLevelCopy(level.name, language === 'es')?.title || normalizeSkillGroupDisplayName(level.name) }}
                    <span
                      v-if="isPlanningSkillGroupName(level.name)"
                      class="ml-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-cream/10 text-cream/70"
                    >
                      {{ language === 'es' ? 'Planificación' : 'Planning' }}
                    </span>
                    <span class="ml-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-acid text-charcoal">
                      {{ language === 'es' ? 'Activo' : 'Active' }}
                    </span>
                  </span>
                  <span v-if="publicProgramLevelCopy(level.name, language === 'es')" class="block text-xs leading-relaxed text-cream/70 mt-0.5">
                    {{ publicProgramLevelCopy(level.name, language === 'es')?.description }}
                  </span>
                  <span v-if="!isPlanningSkillGroupName(level.name)" class="block text-xs text-cream/50 mt-0.5">
                    {{ level.students_count }} {{ language === 'es' ? 'estudiantes' : 'students' }}
                    · {{ level.areas.length }} {{ language === 'es' ? 'áreas' : 'areas' }}
                  </span>
                </span>
                </button>
                <button
                  v-if="canDeleteLevel(level)"
                  type="button"
                  class="p-2 text-gray-500 hover:text-red-400"
                  @click="deleteLevel(level.id, $event)"
                >
                  🗑️
                </button>
              </div>
              <div v-if="expandedLevelId === level.id" class="border-t border-gray-800 divide-y divide-gray-800">
                <div v-for="area in level.areas" :key="area.id">
                  <div class="px-3 py-2 flex items-start gap-2">
                    <button type="button" class="flex-1 min-w-0 text-left" @click="toggleArea(area.id)">
                      <span class="text-sm text-white">{{ area.name }}</span>
                      <span class="block text-xs text-gray-400">
                        {{ skillTotal(area) }} skills · {{ area.subgroups.length }} {{ language === 'es' ? 'subgrupos' : 'subgroups' }}
                        · {{ language === 'es' ? 'activo' : 'active' }}
                      </span>
                    </button>
                    <button type="button" class="p-1.5 text-gray-500 hover:text-amber-300" @click="openAreaEditor(level.id, area)">✏️</button>
                    <button type="button" class="p-1.5 text-gray-500 hover:text-red-400" @click="deleteArea(area.id)">🗑️</button>
                  </div>
                  <div v-if="expandedAreaIds.has(area.id)" class="px-3 pb-3 space-y-2">
                    <div class="flex flex-wrap gap-2">
                      <button type="button" class="px-2 py-1 rounded text-xs font-semibold bg-blue-600 text-white" @click="openSkillPicker(level.name, area.id)">
                        + Skill
                      </button>
                      <button type="button" class="px-2 py-1 rounded text-xs font-semibold bg-gray-700 text-gray-200" @click="openSubgroupEditor(level.id, area.id)">
                        + {{ language === 'es' ? 'Subgrupo' : 'Subgroup' }}
                      </button>
                    </div>
                    <div class="flex flex-wrap gap-1.5">
                      <span
                        v-for="skill in area.skills"
                        :key="skill.id"
                        class="inline-flex items-center gap-1 rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-white"
                      >
                        {{ chipName(skill) }}
                        <span v-if="skill.variant" class="text-emerald-300">{{ skill.variant }}</span>
                        <button type="button" class="text-gray-400 hover:text-white" @click="removeSkill(skill.id)">×</button>
                      </span>
                      <span v-if="!area.skills.length" class="text-xs text-gray-600">
                        {{ language === 'es' ? 'Sin skills en el área.' : 'No skills on this area.' }}
                      </span>
                    </div>
                    <div v-for="sg in area.subgroups" :key="sg.id" class="rounded-lg border border-gray-700 bg-black/30 p-2">
                      <div class="flex items-center gap-2 mb-2">
                        <p class="text-sm font-semibold text-white flex-1">{{ sg.name }}</p>
                        <button type="button" class="px-2 py-1 rounded text-xs font-semibold bg-blue-600 text-white" @click="openSkillPicker(level.name, area.id, sg.id)">+ Skill</button>
                        <button type="button" class="text-gray-400 hover:text-amber-300" @click="openSubgroupEditor(level.id, area.id, sg)">✏️</button>
                        <button type="button" class="text-gray-400 hover:text-red-400" @click="deleteSubgroup(sg.id)">🗑️</button>
                      </div>
                      <div class="flex flex-wrap gap-1.5">
                        <span
                          v-for="skill in sg.skills"
                          :key="skill.id"
                          class="inline-flex items-center gap-1 rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 text-xs text-white"
                        >
                          {{ chipName(skill) }}
                          <button type="button" class="text-gray-400 hover:text-white" @click="removeSkill(skill.id)">×</button>
                        </span>
                        <span v-if="!sg.skills.length" class="text-xs text-gray-600">
                          {{ language === 'es' ? 'Sin skills.' : 'No skills.' }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div v-if="!level.areas.length" class="px-3 py-2 text-xs text-gray-600">
                  {{ language === 'es' ? 'Sin áreas todavía.' : 'No areas yet.' }}
                </div>
              </div>
              <div v-if="expandedLevelId === level.id && level.directSubgroups.length" class="border-t border-gray-800 px-3 py-2 space-y-2">
                <p class="text-[11px] uppercase tracking-wide text-gray-500">
                  {{ language === 'es' ? 'Subgrupos directos' : 'Direct subgroups' }}
                </p>
                <div v-for="sg in level.directSubgroups" :key="sg.id" class="rounded-lg border border-gray-800 p-2">
                  <div class="flex items-center gap-2 mb-2">
                    <p class="text-sm text-white flex-1">{{ sg.name }}</p>
                    <button type="button" class="px-2 py-1 rounded text-xs font-semibold bg-blue-600 text-white" @click="openSkillPicker(level.name, null, sg.id)">+ Skill</button>
                    <button type="button" class="text-gray-400 hover:text-amber-300" @click="openSubgroupEditor(level.id, null, sg)">✏️</button>
                    <button type="button" class="text-gray-400 hover:text-red-400" @click="deleteSubgroup(sg.id)">🗑️</button>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <span v-for="skill in sg.skills" :key="skill.id" class="inline-flex items-center gap-1 rounded-lg bg-gray-800 px-2 py-1 text-xs text-white">
                      {{ chipName(skill) }}
                      <button type="button" class="text-gray-400 hover:text-white" @click="removeSkill(skill.id)">×</button>
                    </span>
                  </div>
                </div>
              </div>
              <div v-if="expandedLevelId === level.id" class="border-t border-gray-800 px-3 py-2">
                <button type="button" class="text-xs font-semibold text-sky-300 hover:text-white" @click="openAreaEditor(level.id)">
                  + {{ language === 'es' ? 'Añadir área' : 'Add area' }}
                </button>
              </div>
            </div>
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg bg-gray-800 text-amber-200 text-xs font-semibold hover:bg-gray-700"
              @click="openLevelModal(p.id)"
            >
              + {{ language === 'es' ? 'Añadir nivel' : 'Add level' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="areaModalOpen" class="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 p-4" @click.self="closeAreaEditor">
        <form class="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl p-5" @submit.prevent="saveArea" @click.stop>
          <h3 class="text-lg font-semibold text-white mb-3">
            {{ areaEditingId ? (language === 'es' ? 'Editar área' : 'Edit area') : (language === 'es' ? 'Nueva área' : 'New area') }}
          </h3>
          <input v-model="areaName" type="text" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" :placeholder="language === 'es' ? 'ej. Flatground' : 'e.g. Flatground'" />
          <p v-if="areaError" class="mt-2 text-sm text-red-400">{{ areaError }}</p>
          <div class="mt-4 flex justify-end gap-2">
            <button type="button" class="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm" @click="closeAreaEditor">{{ language === 'es' ? 'Cancelar' : 'Cancel' }}</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40" :disabled="areaSaving || !areaName.trim()">{{ language === 'es' ? 'Guardar' : 'Save' }}</button>
          </div>
        </form>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="subgroupModalOpen" class="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 p-4" @click.self="closeSubgroupEditor">
        <form class="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl p-5" @submit.prevent="saveSubgroup" @click.stop>
          <h3 class="text-lg font-semibold text-white mb-3">
            {{ subgroupEditingId ? (language === 'es' ? 'Editar subgrupo' : 'Edit subgroup') : (language === 'es' ? 'Nuevo subgrupo' : 'New subgroup') }}
          </h3>
          <input v-model="subgroupName" type="text" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" />
          <p v-if="subgroupError" class="mt-2 text-sm text-red-400">{{ subgroupError }}</p>
          <div class="mt-4 flex justify-end gap-2">
            <button type="button" class="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm" @click="closeSubgroupEditor">{{ language === 'es' ? 'Cancelar' : 'Cancel' }}</button>
            <button type="submit" class="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40" :disabled="subgroupSaving || !subgroupName.trim()">{{ language === 'es' ? 'Guardar' : 'Save' }}</button>
          </div>
        </form>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="addSkillOpen" class="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/60 p-4" @click.self="closeSkillPicker">
        <div class="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col" @click.stop>
          <div class="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-white">{{ language === 'es' ? 'Añadir skill' : 'Add skill' }}</h3>
            <button type="button" class="p-2 text-gray-400 hover:text-white" @click="closeSkillPicker">✕</button>
          </div>
          <div class="p-4 space-y-2">
            <select v-model="addSkillStructureFilter" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm">
              <option value="">{{ language === 'es' ? 'Todas las estructuras' : 'All structures' }}</option>
              <option v-for="opt in SKATE_TRICK_STRUCTURES" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <select v-model="addSkillAreaFilter" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm">
              <option value="">{{ language === 'es' ? 'Todas las áreas' : 'All areas' }}</option>
              <option v-for="opt in SKATE_TRICK_AREAS" :key="opt" :value="opt">{{ opt }}</option>
            </select>
            <input v-model="addSkillSearch" type="text" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" :placeholder="language === 'es' ? 'Buscar skill' : 'Search skill'" />
            <input v-model="addSkillVariant" type="text" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" :placeholder="language === 'es' ? 'Variante opcional' : 'Optional variant'" />
          </div>
          <div class="flex-1 overflow-y-auto px-4 pb-2 space-y-1">
            <button
              v-for="skill in filteredLibrarySkills"
              :key="skill.id"
              type="button"
              class="w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm"
              :class="isSkillAlreadyInArea(skill.id) ? 'bg-gray-800/40 text-gray-500' : selectedSkillIds.has(skill.id) ? 'bg-blue-900/50 text-white' : 'bg-gray-800 text-white'"
              :disabled="isSkillAlreadyInArea(skill.id)"
              @click="toggleSkillPick(skill.id)"
            >
              <span class="truncate">{{ language === 'es' ? (skill.name_es || skill.name) : skill.name }}</span>
              <span v-if="skill.area" class="text-[10px] px-1.5 py-0.5 rounded" :class="areaTagClass(skill.area)">{{ skill.area }}</span>
            </button>
          </div>
          <div class="p-4 border-t border-gray-700">
            <button type="button" class="w-full py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-40" :disabled="!selectedSkillIds.size || addSkillSaving" @click="addSelectedSkills">
              {{ language === 'es' ? 'Añadir' : 'Add' }} {{ selectedSkillIds.size || '' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="rosterProgram"
        class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4"
        @click.self="closeRoster"
      >
        <div class="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-xl max-h-[85vh] flex flex-col" @click.stop>
          <div class="p-4 border-b border-gray-700 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-lg font-semibold text-white truncate">
                {{ rosterProgram.name }}
              </h3>
              <p class="text-xs text-gray-500">
                {{ rosterMembers.length }} {{ language === 'es' ? 'estudiantes' : 'students' }}
              </p>
            </div>
            <button type="button" class="p-2 text-gray-400 hover:text-white" @click="closeRoster">✕</button>
          </div>
          <div class="p-4 space-y-3 overflow-y-auto">
            <div class="flex flex-col sm:flex-row gap-2">
              <select v-model="rosterAddId" class="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm">
                <option value="">{{ language === 'es' ? 'Añadir estudiante…' : 'Add student…' }}</option>
                <option v-for="student in rosterCandidates" :key="student.id" :value="student.id">
                  {{ student.full_name || '—' }}
                </option>
              </select>
              <select v-model="rosterLevelId" class="sm:w-40 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm">
                <option v-for="level in assignableLevels(rosterProgram)" :key="level.id" :value="level.id">
                  {{ normalizeSkillGroupDisplayName(level.name) }}
                </option>
              </select>
              <button
                type="button"
                class="px-3 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold disabled:opacity-40"
                :disabled="!rosterAddId || !rosterLevelId || rosterSaving"
                @click="addRosterStudent"
              >
                {{ language === 'es' ? 'Añadir' : 'Add' }}
              </button>
            </div>
            <p v-if="rosterError" class="text-sm text-red-400">{{ rosterError }}</p>
            <p v-if="!rosterMembers.length" class="text-sm text-gray-500">
              {{ language === 'es' ? 'Nadie en este programa todavía.' : 'Nobody is in this program yet.' }}
            </p>
            <ul v-else class="space-y-2">
              <li
                v-for="student in rosterMembers"
                :key="student.id"
                class="flex items-center gap-3 rounded-lg border border-gray-800 px-3 py-2"
              >
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-white truncate">{{ student.full_name || '—' }}</p>
                  <p class="text-xs text-gray-500 truncate">{{ student.levelName }}</p>
                </div>
                <button
                  type="button"
                  class="text-xs font-semibold text-red-300 hover:text-red-200 disabled:opacity-40"
                  :disabled="rosterSaving"
                  @click="removeRosterStudent(student.id)"
                >
                  {{ language === 'es' ? 'Quitar' : 'Remove' }}
                </button>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Teleport>

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
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">
                {{ language === 'es' ? 'Nombre del programa' : 'Program name' }} *
              </label>
              <input
                v-model="newName"
                type="text"
                class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                :placeholder="language === 'es' ? 'ej. Scooter principiantes' : 'e.g. Beginner scooter'"
              />
            </div>
            <div v-if="sportChoices.length > 1">
              <label class="block text-sm font-medium text-gray-300 mb-1">
                {{ language === 'es' ? 'Disciplina' : 'Discipline' }} *
              </label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="sport in sportChoices"
                  :key="sport.id"
                  type="button"
                  class="px-3 py-1.5 rounded-lg text-xs font-semibold border"
                  :class="newDiscipline === sport.id ? 'bg-amber-500 text-black border-amber-400' : 'bg-gray-800 text-gray-300 border-gray-600'"
                  @click="newDiscipline = sport.id"
                >
                  {{ language === 'es' ? sport.es : sport.en }}
                </button>
              </div>
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

    <Teleport to="body">
      <div
        v-if="levelModalOpen"
        class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4"
        @click.self="closeLevelModal"
      >
        <div class="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md shadow-xl" @click.stop>
          <div class="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-white">
              {{ language === 'es' ? 'Añadir nivel' : 'Add level' }}
            </h3>
            <button type="button" class="p-2 text-gray-400 hover:text-white" @click="closeLevelModal">✕</button>
          </div>
          <div class="p-4 space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">
                {{ language === 'es' ? 'Nombre del nivel' : 'Level name' }} *
              </label>
              <input
                v-model="newLevelName"
                type="text"
                class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                :placeholder="language === 'es' ? 'ej. Nivel 1' : 'e.g. Level 1'"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-1">
                {{ language === 'es' ? 'Descripción' : 'Description' }}
              </label>
              <textarea
                v-model="newLevelDescription"
                rows="2"
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
                  :class="newLevelColor === c ? 'border-white' : 'border-gray-600'"
                  :style="{ backgroundColor: c }"
                  @click="newLevelColor = c"
                />
              </div>
            </div>
          </div>
          <div class="p-4 border-t border-gray-700 flex justify-end gap-2">
            <button type="button" class="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm" @click="closeLevelModal">
              {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-semibold disabled:opacity-50"
              :disabled="!newLevelName.trim() || levelSaving"
              @click="createLevel"
            >
              {{ language === 'es' ? 'Crear nivel' : 'Create level' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
