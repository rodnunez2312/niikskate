<script setup lang="ts">
import {
  SKATE_TRICK_AREAS,
  SKATE_TRICK_STRUCTURES,
  SKATE_TRICK_PROGRAMS,
  categoryFromTrickMeta,
  difficultyFromStructure,
  difficultyTagClass,
  areaTagClass,
  typeTagClass,
  trickManualLabel,
  skillStructure,
  compareSkillsByManualId,
  trickTaxonomySortIndex,
} from '~/utils/skateTrickTaxonomy'
import { hasEmbeddableVideoPreview } from '~/utils/videoEmbed'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const PLAN_PICK_KEY = 'niik-plan-pick-skills'

const route = useRoute()
const router = useRouter()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()
const { syncing, syncNiikLibrary } = useNiikLibrarySync()

const pickMode = computed(() => route.query.pick === 'plan')
const loading = ref(true)
const skills = ref<any[]>([])
const userRole = ref<'admin' | 'coach' | null>(null)

const searchQuery = ref('')
const filterStructure = ref('')
const filterArea = ref('')
const filterType = ref('')
const filterProgram = ref('')
const selectedDifficulty = ref('')

const pickedIds = ref<string[]>([])

const addTrickModalOpen = ref(false)
const addTrickSaving = ref(false)
const newTrick = ref({
  name: '',
  area: '',
  structure: '',
  tipo: '',
  program: '',
  comentarios: '',
  url: '',
  habilidadMotriz: '',
})

const HABILIDAD_MOTRIZ_OPTIONS = [
  'Coordinación, Balance, Agilidad',
  'Coordinación, Fuerza, Balance',
  'Balance, Coordinación, Fuerza en Piernas',
  'Coordinación, Balance',
]

const trickDetailSkill = ref<any | null>(null)
const detailEditing = ref(false)
const editSaving = ref(false)
const deletingTrick = ref(false)
const editForm = ref({
  name: '',
  area: '',
  structure: '',
  tipo: '',
  program: '',
  comentarios: '',
  url: '',
  habilidadMotriz: '',
})

type SortKey = 'manual_id' | 'name' | 'area' | 'type' | 'program' | 'difficulty'
const sortKey = ref<SortKey>('manual_id')
const sortAsc = ref(true)

const excelTricksByName = ref<Record<string, { comentarios?: string; url?: string; description?: string }>>({})

function normalizeTrickKey(value?: string | null) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function loadExcelTrickLibrary() {
  try {
    const data = await $fetch<{ tricks?: Array<{ name?: string; name_es?: string; comentarios?: string; url?: string; description?: string }> }>(
      '/data/niik-trick-library.json',
      { headers: { 'Cache-Control': 'no-cache' } },
    )
    const map: Record<string, { comentarios?: string; url?: string; description?: string }> = {}
    for (const trick of data?.tricks || []) {
      for (const key of [trick.name_es, trick.name].map(normalizeTrickKey).filter(Boolean)) {
        map[key] = { comentarios: trick.comentarios, url: trick.url, description: trick.description }
      }
    }
    excelTricksByName.value = map
  } catch (e) {
    console.error('Error loading trick library JSON:', e)
  }
}

function trickDetailMeta(skill: any) {
  const key = normalizeTrickKey(skill?.name_es || skill?.name)
  return key ? excelTricksByName.value[key] : undefined
}

function trickDetailComments(skill: any): string | null {
  const name = (skill?.name_es || skill?.name || '').trim()
  const meta = trickDetailMeta(skill)
  const candidates = [
    meta?.comentarios,
    skill?.description,
    meta?.description,
  ].map(v => (v || '').trim()).filter(Boolean)
  for (const text of candidates) {
    if (text !== name) return text
  }
  return null
}

function trickDetailUrl(skill: any): string | null {
  const url = (skill?.video_url || trickDetailMeta(skill)?.url || '').trim()
  return url || null
}

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/member/coach/tricks')
    return
  }
  const { data: profile } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if (profile?.role !== 'coach' && profile?.role !== 'admin') {
    router.push('/')
    return
  }
  userRole.value = profile?.role ?? null
  await Promise.all([loadExcelTrickLibrary(), fetchSkills()])
  // Auto-sync once on load so DB matches NiikSkate_Ticks_Manual.xlsx (deactivates legacy tricks)
  if (userRole.value === 'admin' || userRole.value === 'coach') {
    await syncNiikLibrary({ force: true })
    await fetchSkills()
  }
  if (pickMode.value) {
    try {
      const raw = sessionStorage.getItem(PLAN_PICK_KEY)
      if (raw) pickedIds.value = JSON.parse(raw)
    } catch { /* ignore */ }
  }
})

async function fetchSkills() {
  loading.value = true
  try {
    const { data } = await client
      .from('skills_library')
      .select('*')
      .eq('is_active', true)
      .order('manual_id', { ascending: true, nullsFirst: false })
    skills.value = data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

const filterAreaOptions = computed(() => {
  const set = new Set<string>()
  for (const sk of skills.value) {
    if (filterStructure.value && skillStructure(sk) !== filterStructure.value) continue
    if (filterType.value && sk.trick_type !== filterType.value) continue
    if (sk.area) set.add(sk.area)
  }
  const fromData = [...set].sort(
    (a, b) => SKATE_TRICK_AREAS.indexOf(a as (typeof SKATE_TRICK_AREAS)[number])
      - SKATE_TRICK_AREAS.indexOf(b as (typeof SKATE_TRICK_AREAS)[number]),
  )
  return fromData.length ? fromData : [...SKATE_TRICK_AREAS]
})

watch(filterStructure, () => {
  if (filterArea.value && !filterAreaOptions.value.includes(filterArea.value)) {
    filterArea.value = ''
  }
})

function toggleSort(key: SortKey) {
  if (sortKey.value === key) sortAsc.value = !sortAsc.value
  else {
    sortKey.value = key
    sortAsc.value = key === 'manual_id' || key === 'name'
  }
}

function sortIndicator(key: SortKey): string {
  if (sortKey.value !== key) return ''
  return sortAsc.value ? ' ↑' : ' ↓'
}

function difficultySortIndex(d?: string | null): number {
  if (d === 'intermediate') return 1
  if (d === 'advanced') return 2
  return 0
}

function programSortIndex(p?: string | null): number {
  const i = SKATE_TRICK_PROGRAMS.indexOf((p || '') as (typeof SKATE_TRICK_PROGRAMS)[number])
  return i >= 0 ? i : 999
}

function compareSorted(a: any, b: any): number {
  const dir = sortAsc.value ? 1 : -1
  let c = 0
  switch (sortKey.value) {
    case 'manual_id':
      c = (a.manual_id ?? a.sort_order ?? 999999) - (b.manual_id ?? b.sort_order ?? 999999)
      break
    case 'name':
      c = (a.name_es || a.name || '').localeCompare(b.name_es || b.name || '', undefined, { sensitivity: 'base' })
      break
    case 'area':
      c = trickTaxonomySortIndex('area', a.area) - trickTaxonomySortIndex('area', b.area)
      break
    case 'type':
      c = trickTaxonomySortIndex('type', a.trick_type) - trickTaxonomySortIndex('type', b.trick_type)
      break
    case 'program':
      c = programSortIndex(a.program) - programSortIndex(b.program)
      break
    case 'difficulty':
      c = difficultySortIndex(a.difficulty) - difficultySortIndex(b.difficulty)
      break
  }
  if (c !== 0) return c * dir
  return compareSkillsByManualId(a, b) * dir
}

const filteredSkills = computed(() =>
  skills.value
    .filter(sk => {
      if (filterStructure.value && skillStructure(sk) !== filterStructure.value) return false
      if (filterArea.value && sk.area !== filterArea.value) return false
      if (filterType.value && sk.trick_type !== filterType.value) return false
      if (filterProgram.value && (sk.program || '').trim() !== filterProgram.value) return false
      if (selectedDifficulty.value && sk.difficulty !== selectedDifficulty.value) return false
      if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        const name = (sk.name_es || sk.name || '').toLowerCase()
        const id = String(sk.manual_id ?? sk.sort_order ?? '')
        if (!name.includes(q) && !id.includes(q)) return false
      }
      return true
    })
    .sort(compareSorted),
)

const stats = computed(() => ({
  total: skills.value.length,
  shown: filteredSkills.value.length,
}))

function clearFilters() {
  searchQuery.value = ''
  filterStructure.value = ''
  filterArea.value = ''
  filterType.value = ''
  filterProgram.value = ''
  selectedDifficulty.value = ''
}

function openAddTrickModal() {
  newTrick.value = { name: '', area: '', structure: '', tipo: '', program: '', comentarios: '', url: '', habilidadMotriz: '' }
  addTrickModalOpen.value = true
}

async function saveNewTrick() {
  const n = newTrick.value
  if (!n.name?.trim()) {
    alert(language.value === 'es' ? 'Escribe el nombre del truco.' : 'Enter the trick name.')
    return
  }
  if (!n.area || !n.structure || !n.tipo || !n.program) {
    alert(language.value === 'es' ? 'Completa Área, Estructura, Tipo y Programa.' : 'Fill Area, Structure, Type, and Program.')
    return
  }
  addTrickSaving.value = true
  try {
    const motorSkills = n.habilidadMotriz
      ? n.habilidadMotriz.split(',').map(s => s.trim()).filter(Boolean)
      : []
    const nextManualId =
      skills.value.reduce((max, s) => Math.max(max, s.manual_id ?? s.sort_order ?? 0), 0) + 1
    const { error } = await client.from('skills_library').upsert({
      manual_id: nextManualId,
      name: n.name.trim(),
      name_es: n.name.trim(),
      description: n.comentarios?.trim() || n.name.trim(),
      difficulty: difficultyFromStructure(n.structure),
      category: categoryFromTrickMeta(n.area, n.program, n.tipo),
      categoria: n.structure,
      area: n.area,
      structure: n.structure,
      trick_type: n.tipo,
      video_url: n.url?.trim() || null,
      program: n.program,
      motor_skills: motorSkills,
      sort_order: nextManualId,
      is_active: true,
    }, { onConflict: 'manual_id' })
    if (error) throw error
    addTrickModalOpen.value = false
    await fetchSkills()
  } catch (e: any) {
    alert(e?.message || 'Error')
  } finally {
    addTrickSaving.value = false
  }
}

async function deleteTrick(skill: any) {
  const name = (skill.name_es || skill.name || '').trim()
  if (!name || !skill.id) return

  const msg1 =
    language.value === 'es'
      ? `¿Eliminar permanentemente "${name}" de la base de datos?\n\nEsta acción no se puede deshacer.`
      : `Permanently delete "${name}" from the database?\n\nThis cannot be undone.`
  if (!confirm(msg1)) return

  const typed = prompt(
    language.value === 'es'
      ? `Para confirmar, escribe exactamente el nombre del truco:\n${name}`
      : `To confirm, type the trick name exactly:\n${name}`,
  )
  if (typed?.trim() !== name) {
    alert(language.value === 'es' ? 'Eliminación cancelada — el nombre no coincide.' : 'Deletion cancelled — name did not match.')
    return
  }

  deletingTrick.value = true
  try {
    const { error } = await client.from('skills_library').delete().eq('id', skill.id)
    if (error) throw error
    trickDetailSkill.value = null
    await fetchSkills()
  } catch (e: any) {
    alert(e?.message || (language.value === 'es' ? 'No se pudo eliminar.' : 'Could not delete.'))
  } finally {
    deletingTrick.value = false
  }
}

async function syncFromExcel() {
  const res = await syncNiikLibrary({ force: true })
  if (res.ok) {
    await fetchSkills()
    alert(language.value === 'es'
      ? `Listo: ${res.activeCount} trucos activos (Excel #1–#${res.total}).\n${res.inserted} nuevos, ${res.updated} actualizados.`
      : `Done: ${res.activeCount} active tricks (Excel #1–#${res.total}).\n${res.inserted} new, ${res.updated} updated.`)
  } else {
    alert(res.message || 'Sync failed')
  }
}

function togglePick(id: string) {
  const i = pickedIds.value.indexOf(id)
  if (i >= 0) pickedIds.value.splice(i, 1)
  else pickedIds.value.push(id)
}

function applyPickToPlan() {
  sessionStorage.setItem(PLAN_PICK_KEY, JSON.stringify(pickedIds.value))
  router.push('/member/coach/plans')
}

function openDetail(skill: any) {
  trickDetailSkill.value = skill
  detailEditing.value = false
  resetEditForm(skill)
}

function resetEditForm(skill: any) {
  editForm.value = {
    name: skill.name_es || skill.name || '',
    area: skill.area || '',
    structure: skillStructure(skill) || '',
    tipo: skill.trick_type || '',
    program: skill.program || '',
    comentarios: trickDetailComments(skill) || '',
    url: trickDetailUrl(skill) || '',
    habilidadMotriz: Array.isArray(skill.motor_skills) ? skill.motor_skills.join(', ') : '',
  }
}

function startDetailEdit() {
  if (trickDetailSkill.value) resetEditForm(trickDetailSkill.value)
  detailEditing.value = true
}

function cancelDetailEdit() {
  detailEditing.value = false
  if (trickDetailSkill.value) resetEditForm(trickDetailSkill.value)
}

async function saveDetailEdit() {
  const skill = trickDetailSkill.value
  const n = editForm.value
  if (!skill?.id) return
  if (!n.name?.trim()) {
    alert(language.value === 'es' ? 'Escribe el nombre del truco.' : 'Enter the trick name.')
    return
  }
  if (!n.area || !n.structure || !n.tipo || !n.program) {
    alert(language.value === 'es' ? 'Completa Área, Estructura, Tipo y Programa.' : 'Fill Area, Structure, Type, and Program.')
    return
  }
  editSaving.value = true
  try {
    const motorSkills = n.habilidadMotriz
      ? n.habilidadMotriz.split(',').map(s => s.trim()).filter(Boolean)
      : []
    const payload = {
      name: n.name.trim(),
      name_es: n.name.trim(),
      description: n.comentarios?.trim() || n.name.trim(),
      difficulty: difficultyFromStructure(n.structure),
      category: categoryFromTrickMeta(n.area, n.program, n.tipo),
      categoria: n.structure,
      area: n.area,
      structure: n.structure,
      trick_type: n.tipo,
      video_url: n.url?.trim() || null,
      program: n.program,
      motor_skills: motorSkills,
    }
    const { data, error } = await client.from('skills_library').update(payload).eq('id', skill.id).select('*').single()
    if (error) throw error
    trickDetailSkill.value = data
    detailEditing.value = false
    await fetchSkills()
    const updated = skills.value.find(s => s.id === skill.id)
    if (updated) trickDetailSkill.value = updated
  } catch (e: any) {
    alert(e?.message || 'Error')
  } finally {
    editSaving.value = false
  }
}

function closeDetail() {
  trickDetailSkill.value = null
  detailEditing.value = false
}
</script>

<template>
  <div class="min-h-screen bg-black pb-12">
    <div class="max-w-lg lg:max-w-7xl mx-auto w-full px-4 py-6 space-y-6">
      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold text-white flex items-center gap-2">
            <span aria-hidden="true">🛹</span>
            {{ language === 'es' ? 'Trucos' : 'Tricks' }}
          </h1>
          <p class="text-sm text-gray-400 mt-1">
            {{
              language === 'es'
                ? 'Biblioteca completa del manual Niik — filtra, añade y gestiona trucos.'
                : 'Full Niik manual library — filter, add, and manage tricks.'
            }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button
            v-if="userRole === 'admin' || userRole === 'coach'"
            type="button"
            :disabled="syncing"
            class="text-sm px-4 py-2 rounded-xl bg-gray-800 text-gray-200 hover:bg-gray-700 disabled:opacity-50"
            @click="syncFromExcel"
          >
            {{ syncing ? '…' : (language === 'es' ? 'Sincronizar Excel' : 'Sync Excel') }}
          </button>
        </div>
      </div>

      <!-- Pick mode banner -->
      <div
        v-if="pickMode"
        class="rounded-xl border border-gold-400/40 bg-gold-400/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      >
        <p class="text-sm text-gold-200">
          {{ language === 'es' ? 'Selecciona trucos para tu plan de clase.' : 'Select tricks for your class plan.' }}
          <span class="text-gold-400 font-bold">({{ pickedIds.length }})</span>
        </p>
        <button
          type="button"
          class="px-4 py-2 rounded-lg bg-gold-400 text-black text-sm font-bold"
          @click="applyPickToPlan"
        >
          {{ language === 'es' ? 'Volver al plan' : 'Back to plan' }}
        </button>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-xl bg-gray-900 border border-gray-800 p-4 text-center">
          <p class="text-2xl font-bold text-white">{{ stats.total }}</p>
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Total activos' : 'Active total' }}</p>
        </div>
        <div class="rounded-xl bg-gray-900 border border-gray-800 p-4 text-center">
          <p class="text-2xl font-bold text-amber-400">{{ stats.shown }}</p>
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Mostrando' : 'Showing' }}</p>
        </div>
      </div>

      <!-- Filters (Structure, Area, Type — each optional, combinable) -->
      <div class="rounded-xl bg-gray-900 border border-gray-800 p-4 space-y-3">
        <input
          v-model="searchQuery"
          type="search"
          :placeholder="language === 'es' ? 'Buscar por nombre o #…' : 'Search name or #…'"
          class="w-full px-4 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-500"
        />
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <select v-model="filterStructure" class="min-w-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm">
            <option value="">{{ language === 'es' ? 'Structure' : 'Structure' }}</option>
            <option v-for="opt in SKATE_TRICK_STRUCTURES" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <select
            v-model="filterArea"
            class="min-w-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
          >
            <option value="">Area</option>
            <option v-for="opt in filterAreaOptions" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <div class="min-w-0 px-1 py-1 rounded-lg bg-gray-800/80 border border-gray-700 flex items-center">
            <MemberTrickTypePicker v-model="filterType" allow-empty size="sm" />
          </div>
          <select v-model="filterProgram" class="min-w-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm">
            <option value="">Program</option>
            <option v-for="opt in SKATE_TRICK_PROGRAMS" :key="opt" :value="opt">{{ opt }}</option>
          </select>
          <select v-model="selectedDifficulty" class="min-w-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm">
            <option value="">{{ language === 'es' ? 'Dificultad' : 'Difficulty' }}</option>
            <option value="beginner">{{ language === 'es' ? 'Principiante' : 'Beginner' }}</option>
            <option value="intermediate">{{ language === 'es' ? 'Intermedio' : 'Intermediate' }}</option>
            <option value="advanced">{{ language === 'es' ? 'Avanzado' : 'Advanced' }}</option>
          </select>
        </div>
        <button type="button" class="text-xs text-gray-500 hover:text-gray-300" @click="clearFilters">
          {{ language === 'es' ? 'Limpiar filtros' : 'Clear filters' }}
        </button>
      </div>

      <!-- Table -->
      <div v-if="loading" class="flex justify-center py-16">
        <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
      <div v-else class="space-y-2">
        <div class="flex items-center justify-end">
          <button
            type="button"
            class="text-sm px-4 py-2 rounded-xl bg-gold-400 text-black font-bold hover:bg-gold-300"
            @click="openAddTrickModal"
          >
            {{ language === 'es' ? '+ Añadir truco' : '+ Add trick' }}
          </button>
        </div>
        <div class="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950/40">
        <table class="w-full min-w-[720px] text-sm text-left">
          <thead class="bg-gray-800/90 text-gray-400 text-xs uppercase tracking-wide">
            <tr>
              <th v-if="pickMode" class="px-3 py-3 w-10" />
              <th class="px-3 py-3 w-12">
                <button type="button" class="hover:text-white transition-colors" @click="toggleSort('manual_id')">
                  #{{ sortIndicator('manual_id') }}
                </button>
              </th>
              <th class="px-3 py-3">
                <button type="button" class="hover:text-white transition-colors" @click="toggleSort('name')">
                  {{ language === 'es' ? 'Habilidad' : 'Skill' }}{{ sortIndicator('name') }}
                </button>
              </th>
              <th class="px-3 py-3">
                <button type="button" class="hover:text-white transition-colors" @click="toggleSort('difficulty')">
                  {{ language === 'es' ? 'Nivel' : 'Level' }}{{ sortIndicator('difficulty') }}
                </button>
              </th>
              <th class="px-3 py-3">
                <button type="button" class="hover:text-white transition-colors" @click="toggleSort('area')">
                  Area{{ sortIndicator('area') }}
                </button>
              </th>
              <th class="px-3 py-3">
                <button type="button" class="hover:text-white transition-colors" @click="toggleSort('program')">
                  Program{{ sortIndicator('program') }}
                </button>
              </th>
              <th class="px-3 py-3">
                <button type="button" class="hover:text-white transition-colors" @click="toggleSort('type')">
                  Type{{ sortIndicator('type') }}
                </button>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800/80">
            <template v-if="filteredSkills.length">
              <tr
                v-for="(skill, rowIdx) in filteredSkills"
                :key="skill.id"
                class="hover:bg-gray-800/70 transition-colors cursor-pointer"
                :class="[
                  rowIdx % 2 === 0 ? 'bg-gray-900/55' : 'bg-gray-900/35',
                  pickMode && pickedIds.includes(skill.id) ? 'ring-1 ring-inset ring-gold-400/50' : '',
                ]"
                @click="openDetail(skill)"
              >
                <td v-if="pickMode" class="px-3 py-2" @click.stop>
                  <input
                    type="checkbox"
                    :checked="pickedIds.includes(skill.id)"
                    class="rounded border-gray-600"
                    @change="togglePick(skill.id)"
                  >
                </td>
                <td class="px-3 py-2 font-mono text-xs text-gray-500 whitespace-nowrap">
                  {{ trickManualLabel(skill) || '—' }}
                </td>
                <td class="px-3 py-2 text-white font-medium max-w-[220px]">
                  <span class="block truncate">{{ language === 'es' ? skill.name_es || skill.name : skill.name }}</span>
                </td>
                <td class="px-3 py-2">
                  <span class="px-2 py-0.5 rounded text-xs capitalize" :class="difficultyTagClass(skill.difficulty)">{{ skill.difficulty }}</span>
                </td>
                <td class="px-3 py-2 whitespace-nowrap">
                  <span v-if="skill.area" class="px-2 py-0.5 rounded text-xs" :class="areaTagClass(skill.area)">{{ skill.area }}</span>
                  <span v-else class="text-gray-500 text-xs">—</span>
                </td>
                <td class="px-3 py-2 text-gray-300 text-xs whitespace-nowrap">{{ skill.program || '—' }}</td>
                <td class="px-3 py-2 text-gray-300 text-xs whitespace-nowrap">
                  {{ skill.trick_type || '—' }}
                </td>
              </tr>
            </template>
            <tr v-else>
              <td :colspan="pickMode ? 7 : 6" class="px-4 py-12 text-center text-gray-500">
                {{ language === 'es' ? 'Sin trucos con estos filtros.' : 'No tricks match these filters.' }}
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </div>

    <!-- Add trick modal -->
    <div
      v-if="addTrickModalOpen"
      class="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3"
      @click="addTrickModalOpen = false"
    >
      <div class="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl p-4 max-h-[90vh] overflow-y-auto" @click.stop>
        <h3 class="text-white font-semibold mb-4">{{ language === 'es' ? 'Añadir truco' : 'Add trick' }}</h3>
        <form class="space-y-3 text-sm" @submit.prevent="saveNewTrick">
          <div>
            <label class="block text-gray-400 mb-1">{{ language === 'es' ? 'Truco' : 'Skill' }} *</label>
            <input v-model="newTrick.name" required class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white" />
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Structure *</label>
            <select v-model="newTrick.structure" required class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
              <option value="">—</option>
              <option v-for="opt in SKATE_TRICK_STRUCTURES" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Area *</label>
            <MemberTrickAreaPicker v-model="newTrick.area" />
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Type *</label>
            <MemberTrickTypePicker v-model="newTrick.tipo" />
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Program *</label>
            <select v-model="newTrick.program" required class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
              <option value="">—</option>
              <option v-for="opt in SKATE_TRICK_PROGRAMS" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div>
            <label class="block text-gray-400 mb-1">{{ language === 'es' ? 'Comentarios' : 'Comments' }}</label>
            <textarea v-model="newTrick.comentarios" rows="2" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white" />
          </div>
          <div>
            <label class="block text-gray-400 mb-1">URL</label>
            <input v-model="newTrick.url" type="url" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white" />
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Habilidad motriz</label>
            <select v-model="newTrick.habilidadMotriz" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
              <option value="">—</option>
              <option v-for="opt in HABILIDAD_MOTRIZ_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div class="flex gap-2 pt-2">
            <button type="button" class="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300" @click="addTrickModalOpen = false">
              {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
            </button>
            <button type="submit" :disabled="addTrickSaving" class="flex-1 py-2 rounded-xl bg-gold-400 text-black font-semibold disabled:opacity-50">
              {{ addTrickSaving ? '…' : (language === 'es' ? 'Guardar' : 'Save') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Detail / edit modal -->
    <div
      v-if="trickDetailSkill"
      class="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3"
      @click="closeDetail"
    >
      <div
        class="w-full bg-gray-900 border border-gray-700 rounded-2xl p-4 max-h-[85vh] overflow-y-auto"
        :class="!detailEditing && trickDetailUrl(trickDetailSkill) && hasEmbeddableVideoPreview(trickDetailUrl(trickDetailSkill)!) ? 'max-w-2xl' : 'max-w-lg'"
        @click.stop
      >
        <div class="flex justify-between items-start gap-2 mb-3">
          <div class="min-w-0 flex-1">
            <span v-if="trickManualLabel(trickDetailSkill)" class="text-xs font-mono text-gray-500">{{ trickManualLabel(trickDetailSkill) }}</span>
            <h3 v-if="!detailEditing" class="text-white font-semibold">{{ trickDetailSkill.name_es || trickDetailSkill.name }}</h3>
            <input
              v-else
              v-model="editForm.name"
              class="mt-1 w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white font-semibold"
            />
            <div v-if="!detailEditing" class="flex flex-wrap gap-1 mt-2">
              <span v-if="trickDetailSkill.area" class="px-2 py-0.5 rounded text-xs" :class="areaTagClass(trickDetailSkill.area)">{{ trickDetailSkill.area }}</span>
              <span v-if="trickDetailSkill.trick_type" class="px-2 py-0.5 rounded text-xs font-medium" :class="typeTagClass(trickDetailSkill.trick_type)">{{ trickDetailSkill.trick_type }}</span>
              <span class="px-2 py-0.5 rounded text-xs capitalize" :class="difficultyTagClass(trickDetailSkill.difficulty)">{{ trickDetailSkill.difficulty }}</span>
            </div>
          </div>
          <button type="button" class="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 shrink-0" @click="closeDetail">×</button>
        </div>

        <!-- View mode -->
        <dl v-if="!detailEditing" class="grid grid-cols-1 gap-2 text-sm">
          <div><dt class="text-gray-500">Structure</dt><dd class="text-gray-200">{{ skillStructure(trickDetailSkill) || '—' }}</dd></div>
          <div><dt class="text-gray-500">Area</dt><dd class="text-gray-200">
            <span v-if="trickDetailSkill.area" class="px-2 py-0.5 rounded text-xs inline-block" :class="areaTagClass(trickDetailSkill.area)">{{ trickDetailSkill.area }}</span>
            <span v-else>—</span>
          </dd></div>
          <div><dt class="text-gray-500">Type</dt><dd class="text-gray-200">
            <span v-if="trickDetailSkill.trick_type" class="px-2 py-0.5 rounded text-xs inline-block font-medium" :class="typeTagClass(trickDetailSkill.trick_type)">{{ trickDetailSkill.trick_type }}</span>
            <span v-else>—</span>
          </dd></div>
          <div><dt class="text-gray-500">Program</dt><dd class="text-gray-200">{{ trickDetailSkill.program || '—' }}</dd></div>
          <div>
            <dt class="text-gray-500">{{ language === 'es' ? 'Comentarios' : 'Comments' }}</dt>
            <dd class="text-gray-200 whitespace-pre-wrap">{{ trickDetailComments(trickDetailSkill) || '—' }}</dd>
          </div>
          <div>
            <dt class="text-gray-500 mb-1">URL</dt>
            <dd>
              <VideoUrlPreview
                v-if="trickDetailUrl(trickDetailSkill)"
                :url="trickDetailUrl(trickDetailSkill)!"
              />
              <span v-else class="text-gray-500">—</span>
            </dd>
          </div>
          <div v-if="trickDetailSkill.motor_skills?.length">
            <dt class="text-gray-500">Habilidad motriz</dt>
            <dd class="text-gray-200">{{ trickDetailSkill.motor_skills.join(', ') }}</dd>
          </div>
        </dl>

        <!-- Edit mode -->
        <form v-else class="space-y-3 text-sm" @submit.prevent="saveDetailEdit">
          <div>
            <label class="block text-gray-400 mb-1">Structure *</label>
            <select v-model="editForm.structure" required class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
              <option value="">—</option>
              <option v-for="opt in SKATE_TRICK_STRUCTURES" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Area *</label>
            <MemberTrickAreaPicker v-model="editForm.area" />
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Type *</label>
            <MemberTrickTypePicker v-model="editForm.tipo" />
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Program *</label>
            <select v-model="editForm.program" required class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
              <option value="">—</option>
              <option v-for="opt in SKATE_TRICK_PROGRAMS" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
          <div>
            <label class="block text-gray-400 mb-1">{{ language === 'es' ? 'Comentarios' : 'Comments' }}</label>
            <textarea v-model="editForm.comentarios" rows="3" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white" />
          </div>
          <div>
            <label class="block text-gray-400 mb-1">URL</label>
            <input v-model="editForm.url" type="url" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white" />
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Habilidad motriz</label>
            <select v-model="editForm.habilidadMotriz" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
              <option value="">—</option>
              <option v-for="opt in HABILIDAD_MOTRIZ_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
            </select>
          </div>
        </form>

        <div class="mt-4 pt-4 border-t border-gray-800 flex flex-wrap justify-between gap-2">
          <button
            v-if="!detailEditing"
            type="button"
            class="px-4 py-2 rounded-lg text-sm font-semibold bg-gold-400/15 text-gold-300 border border-gold-400/30 hover:bg-gold-400/25"
            @click="startDetailEdit"
          >
            {{ language === 'es' ? 'Editar truco' : 'Edit trick' }}
          </button>
          <div v-else class="flex gap-2">
            <button type="button" class="px-4 py-2 rounded-lg text-sm bg-gray-800 text-gray-300" @click="cancelDetailEdit">
              {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
            </button>
            <button
              type="button"
              :disabled="editSaving"
              class="px-4 py-2 rounded-lg text-sm font-semibold bg-gold-400 text-black disabled:opacity-50"
              @click="saveDetailEdit"
            >
              {{ editSaving ? '…' : (language === 'es' ? 'Guardar' : 'Save') }}
            </button>
          </div>
          <button
            v-if="!detailEditing"
            type="button"
            :disabled="deletingTrick"
            class="px-4 py-2 rounded-lg text-sm font-semibold bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 disabled:opacity-50 ml-auto"
            @click="deleteTrick(trickDetailSkill)"
          >
            {{ deletingTrick ? '…' : (language === 'es' ? 'Eliminar truco' : 'Delete trick') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Pick mode footer -->
    <div
      v-if="pickMode && pickedIds.length"
      class="fixed bottom-0 left-0 right-0 p-4 bg-gray-900/95 border-t border-gray-800 lg:pl-64"
    >
      <div class="max-w-7xl mx-auto">
        <button type="button" class="w-full py-3 rounded-xl bg-gold-400 text-black font-bold" @click="applyPickToPlan">
          {{ language === 'es' ? `Añadir ${pickedIds.length} al plan` : `Add ${pickedIds.length} to plan` }}
        </button>
      </div>
    </div>
  </div>
</template>
