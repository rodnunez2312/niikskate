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
import { disciplineLabel, isTrainingDiscipline } from '~/utils/trainingDisciplines'
import { levelLabel, phaseLabel } from '~/utils/strengthTraining'
import { hasEmbeddableVideoPreview, parseVideoUrl } from '~/utils/videoEmbed'
import { TRICK_RARITIES, autoTrickRarity, isTrickRarityId, trickRarity } from '~/utils/skaterCareer'

function tableDifficultyClass(difficulty?: string | null) {
  if (difficulty === 'intermediate') return 'bg-lime-200 text-gray-900'
  if (difficulty === 'advanced') return 'bg-purple-100 text-purple-800'
  return 'bg-green-100 text-green-800'
}

function tableAreaClass(area?: string | null) {
  const name = (area || '').trim()
  if (name === 'Flatground') return 'bg-lime-200 text-gray-900'
  if (name === 'Street') return 'bg-orange-100 text-orange-800'
  if (name === 'Park' || name === 'Bowl') return 'bg-emerald-100 text-emerald-800'
  if (name === 'Mini Ramp') return 'bg-pink-100 text-pink-800'
  if (name === 'Vert') return 'bg-violet-100 text-violet-800'
  if (name === 'Warmup') return 'bg-slate-100 text-slate-700'
  return 'bg-gray-200 text-gray-700'
}

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
const { selected: selectedSport } = useEnabledSports()
const { exercises: strengthExercises, loadExercises } = useStrengthLibrary()

useHead({
  title: computed(() => (language.value === 'es' ? 'Bolsa de trucos' : 'Bag of Tricks')),
})
const { syncing, syncNiikLibrary } = useNiikLibrarySync()
const { syncing: syncingStrength, syncStrengthLibrary } = useStrengthLibrary()

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
const videoPopup = ref<{ name: string; url: string; kind: 'instagram' | 'youtube' | 'website' } | null>(null)
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

type SortKey = 'manual_id' | 'name' | 'structure' | 'area' | 'type' | 'program' | 'difficulty'
type SortRule = { key: SortKey; asc: boolean }
const sortRules = ref<SortRule[]>([{ key: 'manual_id', asc: true }])

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
  return trickVideoSources(skill)[0]?.url || null
}

function trickVideoSources(skill: any): Array<{ kind: 'instagram' | 'youtube' | 'website'; url: string }> {
  const raw = [skill?.video_url, trickDetailMeta(skill)?.url].filter(Boolean).join('\n')
  const seen = new Set<string>()
  const sources: Array<{ kind: 'instagram' | 'youtube' | 'website'; url: string }> = []
  for (const part of raw.split(/\s+/)) {
    const parsed = parseVideoUrl(part)
    if (!parsed || seen.has(parsed.canonicalUrl)) continue
    seen.add(parsed.canonicalUrl)
    sources.push({
      kind: parsed.kind === 'instagram' || parsed.kind === 'youtube' ? parsed.kind : 'website',
      url: parsed.canonicalUrl,
    })
  }
  return sources
}

function isDirectVideoFile(url: string) {
  return /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url)
}

function openVideoPopup(skill: any, url: string) {
  const parsed = parseVideoUrl(url)
  const kind = parsed?.kind === 'instagram' || parsed?.kind === 'youtube' ? parsed.kind : 'website'
  videoPopup.value = {
    name: (language.value === 'es' ? skill.name_es || skill.name : skill.name) || '',
    url,
    kind,
  }
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
  await Promise.all([loadExcelTrickLibrary(), fetchSkills(), loadExercises()])
  // Syncing is deliberately manual. Editing the Excel renumbers column A, and the
  // upsert keys on manual_id, so an unattended sync can silently re-point skaters'
  // progress at the wrong tricks. Press "Sincronizar Excel" once the # are re-keyed.
  if (pickMode.value) {
    try {
      const raw = sessionStorage.getItem(PLAN_PICK_KEY)
      if (raw) pickedIds.value = JSON.parse(raw)
    } catch { /* ignore */ }
  }
})

const savingRarityId = ref<string | null>(null)

async function setTrickRarity(skill: any, value: string) {
  const next = isTrickRarityId(value) ? value : null
  const prev = skill.rarity ?? null
  if (next === prev) return
  skill.rarity = next
  savingRarityId.value = skill.id
  try {
    const { error } = await client.from('skills_library').update({ rarity: next }).eq('id', skill.id)
    if (error) throw error
  } catch (e: any) {
    skill.rarity = prev
    alert(e?.message || (language.value === 'es' ? 'No se pudo guardar la rareza' : 'Could not save rarity'))
  } finally {
    savingRarityId.value = null
  }
}

// ---------------------------------------------------------------------------
// Drag-and-drop order. Saved through reorder_skills_library(), which logs one
// history entry per move.
// ---------------------------------------------------------------------------

const orderOf = (sk: any) => sk.sort_order ?? sk.manual_id ?? 999999

/** Only the library order view can be rearranged; a column sort is just a view. */
const canReorder = computed(() =>
  !pickMode.value
  && (userRole.value === 'admin' || userRole.value === 'coach')
  && sortRules.value.length === 1
  && sortRules.value[0].key === 'manual_id'
  && sortRules.value[0].asc,
)

const dragArmedId = ref<string | null>(null)
const dragId = ref<string | null>(null)
const dropTargetId = ref<string | null>(null)
const dropAfter = ref(false)
const savingOrder = ref(false)

function onDragStart(skill: any, event: DragEvent) {
  dragId.value = skill.id
  event.dataTransfer?.setData('text/plain', skill.id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(skill: any, event: DragEvent) {
  if (!dragId.value || dragId.value === skill.id) return
  event.preventDefault()
  const row = event.currentTarget as HTMLElement
  const box = row.getBoundingClientRect()
  dropTargetId.value = skill.id
  dropAfter.value = event.clientY > box.top + box.height / 2
}

function onDragEnd() {
  dragId.value = null
  dropTargetId.value = null
  dragArmedId.value = null
}

async function onDrop(skill: any) {
  const movedId = dragId.value
  const after = dropAfter.value
  onDragEnd()
  if (!movedId || movedId === skill.id || savingOrder.value) return

  const ordered = [...sportSkills.value].sort((a, b) => orderOf(a) - orderOf(b))
  const from = ordered.findIndex(sk => sk.id === movedId)
  if (from < 0) return
  const [moved] = ordered.splice(from, 1)
  const targetIdx = ordered.findIndex(sk => sk.id === skill.id)
  ordered.splice(targetIdx + (after ? 1 : 0), 0, moved)

  const previous = new Map(skills.value.map(sk => [sk.id, sk.sort_order]))
  ordered.forEach((sk, i) => { sk.sort_order = i + 1 })
  savingOrder.value = true
  try {
    const { error } = await client.rpc('reorder_skills_library', {
      p_ids: ordered.map(sk => sk.id),
      p_moved: movedId,
    })
    if (error) throw error
  } catch (e: any) {
    for (const sk of skills.value) sk.sort_order = previous.get(sk.id)
    const missing = /reorder_skills_library|function/i.test(e?.message || '')
    alert(missing
      ? (language.value === 'es'
          ? 'Falta la migración. En Supabase SQL Editor ejecuta supabase/migrations/add_skills_library_history.sql'
          : 'Migration missing. Run supabase/migrations/add_skills_library_history.sql in the Supabase SQL Editor.')
      : (e?.message || (language.value === 'es' ? 'No se pudo guardar el orden.' : 'Could not save the order.')))
  } finally {
    savingOrder.value = false
  }
}

// ---------------------------------------------------------------------------
// Change history
// ---------------------------------------------------------------------------

type HistoryRow = {
  id: number
  skill_name: string | null
  action: 'insert' | 'update' | 'delete' | 'reorder'
  changes: Record<string, any>
  changed_by: string | null
  changed_at: string
  who: string
}

const historyOpen = ref(false)
const historyLoading = ref(false)
const historyError = ref('')
const historyRows = ref<HistoryRow[]>([])

const HISTORY_FIELD_LABELS: Record<string, { es: string; en: string }> = {
  name: { es: 'Nombre', en: 'Name' },
  name_es: { es: 'Nombre ES', en: 'Spanish name' },
  structure: { es: 'Structure', en: 'Structure' },
  categoria: { es: 'Structure', en: 'Structure' },
  area: { es: 'Area', en: 'Area' },
  trick_type: { es: 'Tipo', en: 'Type' },
  program: { es: 'Programa', en: 'Program' },
  difficulty: { es: 'Nivel', en: 'Level' },
  rarity: { es: 'Rareza', en: 'Rarity' },
  video_url: { es: 'Video', en: 'Video' },
  description: { es: 'Descripción', en: 'Description' },
  motor_skills: { es: 'Habilidad motriz', en: 'Motor skills' },
  is_active: { es: 'Activo', en: 'Active' },
  manual_id: { es: '# Excel', en: 'Excel #' },
}

function historyValue(value: unknown) {
  if (value == null || value === '') return '—'
  if (Array.isArray(value)) return value.join(', ') || '—'
  const text = String(value)
  return text.length > 40 ? `${text.slice(0, 40)}…` : text
}

function historySummary(row: HistoryRow) {
  const es = language.value === 'es'
  if (row.action === 'insert') return es ? 'Truco añadido' : 'Trick added'
  if (row.action === 'delete') return es ? 'Truco eliminado' : 'Trick deleted'
  if (row.action === 'reorder') {
    const move = row.changes?.sort_order || {}
    return es ? `Movido de #${move.from ?? '—'} a #${move.to ?? '—'}` : `Moved from #${move.from ?? '—'} to #${move.to ?? '—'}`
  }
  return Object.entries(row.changes || {})
    .filter(([key]) => key !== 'categoria' || !row.changes.structure)
    .map(([key, diff]) => {
      const label = HISTORY_FIELD_LABELS[key]
      return `${label ? (es ? label.es : label.en) : key}: ${historyValue(diff?.from)} → ${historyValue(diff?.to)}`
    })
    .join(' · ')
}

async function openHistory() {
  historyOpen.value = true
  historyLoading.value = true
  historyError.value = ''
  try {
    const { data, error } = await client
      .from('skills_library_changes')
      .select('id, skill_name, action, changes, changed_by, changed_at')
      .order('changed_at', { ascending: false })
      .limit(150)
    if (error) throw error
    const rows = (data || []) as Omit<HistoryRow, 'who'>[]
    const ids = [...new Set(rows.map(row => row.changed_by).filter(Boolean))] as string[]
    const names = new Map<string, string>()
    if (ids.length) {
      const { data: people } = await client.from('profiles').select('id, full_name').in('id', ids)
      for (const person of people || []) names.set(person.id, person.full_name || '')
    }
    historyRows.value = rows.map(row => ({
      ...row,
      who: (row.changed_by && names.get(row.changed_by)) || (language.value === 'es' ? 'Sistema' : 'System'),
    }))
  } catch (e: any) {
    historyError.value = /skills_library_changes|relation|schema cache/i.test(e?.message || '')
      ? (language.value === 'es'
          ? 'Falta la migración. En Supabase SQL Editor ejecuta supabase/migrations/add_skills_library_history.sql'
          : 'Migration missing. Run supabase/migrations/add_skills_library_history.sql in the Supabase SQL Editor.')
      : (e?.message || 'Error')
  } finally {
    historyLoading.value = false
  }
}

function historyDate(value: string) {
  return new Date(value).toLocaleString(language.value === 'es' ? 'es-MX' : 'en-US', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Backup: the library as it stands in the app, as an Excel file.
// ---------------------------------------------------------------------------

const backingUp = ref(false)

async function downloadBackup() {
  backingUp.value = true
  try {
    const { data, error } = await client
      .from('skills_library')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
    if (error) throw error
    const XLSX = await import('xlsx')
    const rows = (data || []).filter((sk: any) => skillSport(sk) === selectedSport.value).map((sk: any) => ({
      '#': sk.sort_order ?? '',
      'Excel #': sk.manual_id ?? '',
      Habilidad: sk.name_es || sk.name || '',
      Name: sk.name || '',
      Structure: skillStructure(sk) || '',
      Area: sk.area || '',
      Type: sk.trick_type || '',
      Program: sk.program || '',
      Difficulty: sk.difficulty || '',
      Rareza: sk.rarity || '',
      Video: sk.video_url || '',
      Comentarios: sk.description || '',
      'Habilidad motriz': Array.isArray(sk.motor_skills) ? sk.motor_skills.join(', ') : '',
      Activo: sk.is_active ? 'Sí' : 'No',
      id: sk.id,
    }))
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Skate_Manual')
    XLSX.writeFile(book, `niik-trick-library-${selectedSport.value}-${new Date().toISOString().slice(0, 10)}.xlsx`)
  } catch (e: any) {
    alert(e?.message || 'Error')
  } finally {
    backingUp.value = false
  }
}

const TRICK_TEMPLATE_COLUMNS = [
  '#',
  'Habilidad',
  'Name',
  'Structure',
  'Area',
  'Type',
  'Program',
  'Difficulty',
  'Rareza',
  'Video',
  'Comentarios',
  'Habilidad motriz',
] as const

const templateDownloading = ref(false)
const sportImporting = ref(false)
const sportImportInput = ref<HTMLInputElement | null>(null)

function cell(row: Record<string, unknown>, ...names: string[]) {
  const wanted = new Set(names.map(name => name.toLowerCase()))
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(key.trim().toLowerCase())) return String(value ?? '').trim()
  }
  return ''
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

async function downloadTrickTemplate() {
  templateDownloading.value = true
  try {
    const sample = ['', '', '', 'Level 1: Foundations', 'Flatground', 'Trick', 'Foundations', 'beginner', '', '', '', '']
    const csv = `\uFEFF${[TRICK_TEMPLATE_COLUMNS, sample].map(row => row.map(csvCell).join(',')).join('\n')}\n`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const sport = isTrainingDiscipline(selectedSport.value) ? selectedSport.value : 'sport'
    link.href = url
    link.download = `niik-tricks-${sport}-template.csv`
    link.click()
    URL.revokeObjectURL(url)
  } catch (e: any) {
    alert(e?.message || 'Error')
  } finally {
    templateDownloading.value = false
  }
}

const transferOpen = ref(false)
const transferChoice = ref<'ask' | 'import'>('ask')

function openTransfer() {
  transferChoice.value = 'ask'
  transferOpen.value = true
}

function chooseExport() {
  transferOpen.value = false
  downloadBackup()
}

function onSportImport(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) importSportTricks(file)
}

async function importSportTricks(file: File) {
  const sport = selectedSport.value
  if (!isTrainingDiscipline(sport)) {
    alert(language.value === 'es'
      ? 'Strength usa la biblioteca de fuerza, no la bolsa de trucos.'
      : 'Strength uses the strength library, not the trick bag.')
    return
  }
  sportImporting.value = true
  try {
    const XLSX = await import('xlsx')
    const book = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const sheet = book.Sheets[book.SheetNames[0]]
    const table = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    const incoming = table
      .map(row => ({
        name: cell(row, 'Habilidad', 'Skill', 'Name'),
        nameEn: cell(row, 'Name'),
        structure: cell(row, 'Structure', 'Estructura'),
        area: cell(row, 'Area', 'Área'),
        tipo: cell(row, 'Type', 'Tipo'),
        program: cell(row, 'Program', 'Programa'),
        difficulty: cell(row, 'Difficulty', 'Dificultad', 'Nivel').toLowerCase(),
        rarity: cell(row, 'Rareza', 'Rarity'),
        video: cell(row, 'Video', 'URL'),
        comments: cell(row, 'Comentarios', 'Comments'),
        motor: cell(row, 'Habilidad motriz', 'Motor'),
      }))
      .filter(row => row.name)
    if (!incoming.length) {
      alert(language.value === 'es' ? 'El archivo no tiene trucos. Llena la columna Habilidad.' : 'The file has no tricks. Fill the Habilidad column.')
      return
    }
    const { data: existing, error: readError } = await client
      .from('skills_library')
      .select('id, manual_id, name, name_es, discipline, area, structure, categoria, program')
    if (readError) throw readError
    const rows = existing || []
    let nextId = rows.reduce((max, row) => Math.max(max, Number(row.manual_id) || 0), 0) + 1
    const takenNames = new Set<string>()
    for (const row of rows) {
      if (skillSport(row) !== sport) continue
      const key = normalizeTrickKey(row.name_es || row.name)
      if (key) takenNames.add(key)
    }
    if (sport === 'skateboarding') {
      if (!Object.keys(excelTricksByName.value).length) await loadExcelTrickLibrary()
      for (const key of Object.keys(excelTricksByName.value)) takenNames.add(key)
    }
    const seen = new Set<string>()
    let skipped = 0
    const payload = []
    for (const row of incoming) {
      const key = normalizeTrickKey(row.name)
      if (!key || takenNames.has(key) || seen.has(key)) {
        skipped += 1
        continue
      }
      seen.add(key)
      const manualId = nextId++
      const structure = row.structure || 'Level 1: Foundations'
      const difficulty = ['beginner', 'intermediate', 'advanced'].includes(row.difficulty)
        ? row.difficulty
        : difficultyFromStructure(structure)
      payload.push({
        manual_id: manualId,
        name: row.nameEn || row.name,
        name_es: row.name,
        description: row.comments || row.name,
        difficulty,
        category: categoryFromTrickMeta(row.area, row.program, row.tipo),
        categoria: structure,
        area: row.area || null,
        structure,
        trick_type: row.tipo || 'Trick',
        program: row.program || null,
        video_url: row.video || null,
        rarity: row.rarity || null,
        motor_skills: row.motor ? row.motor.split(',').map(part => part.trim()).filter(Boolean) : [],
        sort_order: manualId,
        is_active: true,
        discipline: sport,
      })
    }
    if (!payload.length) {
      alert(language.value === 'es'
        ? `Ningún truco nuevo. ${skipped} ya están en ${sportLabel.value} y se dejaron igual.`
        : `No new tricks. ${skipped} already belong to ${sportLabel.value} and were left unchanged.`)
      return
    }
    const { error } = await client.from('skills_library').insert(payload)
    if (error) {
      const missing = /discipline|schema cache/i.test(error.message || '')
      throw new Error(missing
        ? (language.value === 'es'
          ? 'Falta la columna de deporte. En Supabase SQL Editor ejecuta supabase/migrations/add_skills_library_discipline.sql'
          : 'The sport column is missing. Run supabase/migrations/add_skills_library_discipline.sql in the Supabase SQL Editor.')
        : error.message)
    }
    await fetchSkills()
    transferOpen.value = false
    alert(language.value === 'es'
      ? `${payload.length} trucos nuevos se agregaron a ${sportLabel.value}.${skipped ? ` ${skipped} ya existían y no se tocaron.` : ''}`
      : `${payload.length} new tricks were added to ${sportLabel.value}.${skipped ? ` ${skipped} already existed and were left unchanged.` : ''}`)
  } catch (e: any) {
    alert(e?.message || 'Error')
  } finally {
    sportImporting.value = false
    if (sportImportInput.value) sportImportInput.value.value = ''
  }
}

async function fetchSkills() {
  loading.value = true
  try {
    const { data } = await client
      .from('skills_library')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true, nullsFirst: false })
    skills.value = data || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function isSharedTrainingSkill(skill: { discipline?: string | null; area?: string | null; structure?: string | null; categoria?: string | null; program?: string | null }) {
  if ((skill?.discipline || '').trim() === 'shared') return true
  const area = (skill?.area || '').trim().toLowerCase()
  const structure = skillStructure(skill).toLowerCase()
  const program = (skill?.program || '').trim().toLowerCase()
  return area === 'warmup' || structure.includes('warmup') || structure.includes('strength') || program === 'strength training'
}

function skillSport(skill: { discipline?: string | null; area?: string | null; structure?: string | null; categoria?: string | null; program?: string | null }) {
  if (isSharedTrainingSkill(skill)) return 'shared'
  return isTrainingDiscipline(skill.discipline) ? skill.discipline : 'skateboarding'
}

/** Skate tricks stay on skateboarding. Other sports see their own list plus shared warmup and strength. */
const sportSkills = computed(() => skills.value.filter(skill => {
  const sport = skillSport(skill)
  if (sport === 'shared') return selectedSport.value !== 'skateboarding'
  return sport === selectedSport.value
}))

const sharedTraining = computed(() => {
  if (selectedSport.value === 'skateboarding') return []
  return strengthExercises.value.filter(exercise =>
    exercise.is_active !== false
    && (exercise.training_phase === 'warmup' || exercise.training_phase === 'strength'),
  )
})

const sportLabel = computed(() => disciplineLabel(selectedSport.value, language.value === 'es') || selectedSport.value)

/** Only offer types the library actually uses — the manual has no Exercise rows. */
const filterTypeOptions = computed(() => {
  const set = new Set<string>()
  for (const sk of sportSkills.value) {
    const t = (sk.trick_type || '').trim()
    if (t) set.add(t)
  }
  return [...set]
})

const filterAreaOptions = computed(() => {
  const set = new Set<string>()
  for (const sk of sportSkills.value) {
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

function defaultSortAsc(key: SortKey) {
  return key === 'manual_id' || key === 'name'
}

function toggleSort(key: SortKey, event?: MouseEvent) {
  const multi = Boolean(event?.ctrlKey || event?.metaKey)
  if (multi) {
    const index = sortRules.value.findIndex(rule => rule.key === key)
    if (index >= 0) {
      const rule = sortRules.value[index]
      if (rule.asc) sortRules.value[index] = { key, asc: false }
      else {
        sortRules.value.splice(index, 1)
        if (!sortRules.value.length) sortRules.value = [{ key: 'manual_id', asc: true }]
      }
    } else {
      sortRules.value = [...sortRules.value, { key, asc: defaultSortAsc(key) }]
    }
    return
  }
  const only = sortRules.value.length === 1 ? sortRules.value[0] : null
  if (only?.key === key) sortRules.value = [{ key, asc: !only.asc }]
  else sortRules.value = [{ key, asc: defaultSortAsc(key) }]
}

function sortIndicator(key: SortKey): string {
  const index = sortRules.value.findIndex(rule => rule.key === key)
  if (index < 0) return ''
  const arrow = sortRules.value[index].asc ? '↑' : '↓'
  return sortRules.value.length > 1 ? ` ${index + 1}${arrow}` : ` ${arrow}`
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

function compareByKey(a: any, b: any, key: SortKey): number {
  switch (key) {
    case 'manual_id':
      return (a.sort_order ?? a.manual_id ?? 999999) - (b.sort_order ?? b.manual_id ?? 999999)
    case 'structure':
      return SKATE_TRICK_STRUCTURES.indexOf(skillStructure(a) as (typeof SKATE_TRICK_STRUCTURES)[number])
        - SKATE_TRICK_STRUCTURES.indexOf(skillStructure(b) as (typeof SKATE_TRICK_STRUCTURES)[number])
    case 'name':
      return (a.name_es || a.name || '').localeCompare(b.name_es || b.name || '', undefined, { sensitivity: 'base' })
    case 'area':
      return trickTaxonomySortIndex('area', a.area) - trickTaxonomySortIndex('area', b.area)
    case 'type':
      return trickTaxonomySortIndex('type', a.trick_type) - trickTaxonomySortIndex('type', b.trick_type)
    case 'program':
      return programSortIndex(a.program) - programSortIndex(b.program)
    case 'difficulty':
      return difficultySortIndex(a.difficulty) - difficultySortIndex(b.difficulty)
  }
}

function compareSorted(a: any, b: any): number {
  for (const rule of sortRules.value) {
    const diff = compareByKey(a, b, rule.key)
    if (diff !== 0) return diff * (rule.asc ? 1 : -1)
  }
  if (sortRules.value.some(rule => rule.key === 'manual_id')) return 0
  return compareSkillsByManualId(a, b)
}

const filteredSkills = computed(() =>
  sportSkills.value
    .filter(sk => {
      if (filterStructure.value && skillStructure(sk) !== filterStructure.value) return false
      if (filterArea.value && sk.area !== filterArea.value) return false
      if (filterType.value && sk.trick_type !== filterType.value) return false
      if (filterProgram.value && (sk.program || '').trim() !== filterProgram.value) return false
      if (selectedDifficulty.value && sk.difficulty !== selectedDifficulty.value) return false
      if (searchQuery.value) {
        const q = searchQuery.value.toLowerCase()
        const name = (sk.name_es || sk.name || '').toLowerCase()
        const id = String(sk.sort_order ?? sk.manual_id ?? '')
        if (!name.includes(q) && !id.includes(q)) return false
      }
      return true
    })
    .sort(compareSorted),
)

const stats = computed(() => ({
  total: sportSkills.value.length,
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

/** ?create=1 (from the sport picker's to-do list) opens the new-trick form. */
function openAddTrickFromLink() {
  if (route.query.create !== '1') return
  openAddTrickModal()
  router.replace({ query: { ...route.query, create: undefined } })
}
watch(() => route.query.create, openAddTrickFromLink)
onMounted(openAddTrickFromLink)

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
      skills.value.reduce((max, s) => Math.max(max, s.manual_id ?? 0), 0) + 1
    const nextSortOrder =
      skills.value.reduce((max, s) => Math.max(max, s.sort_order ?? s.manual_id ?? 0), 0) + 1
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
      sort_order: nextSortOrder,
      is_active: true,
      discipline: isTrainingDiscipline(selectedSport.value) ? selectedSport.value : 'skateboarding',
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

/** One workbook, two sheets: Skate_Manual (tricks) and Strength_Training. */
async function syncFromExcel() {
  const es = language.value === 'es'
  const ok = confirm(es
    ? 'La app es la fuente de la Bolsa de trucos. Importar el Excel reemplaza las ediciones y el orden hechos aquí con los del archivo. Descarga un respaldo antes si no estás seguro. ¿Continuar?'
    : 'The app is the source of the trick library. Importing the Excel replaces edits and order made here with the file. Download a backup first if unsure. Continue?')
  if (!ok) return
  const lines: string[] = []

  const res = await syncNiikLibrary({ force: true })
  if (res.ok) {
    await fetchSkills()
    lines.push(es
      ? `${res.activeCount} trucos activos (Excel #1–#${res.total}): ${res.inserted} nuevos, ${res.updated} actualizados.`
      : `${res.activeCount} active tricks (Excel #1–#${res.total}): ${res.inserted} new, ${res.updated} updated.`)
  } else {
    lines.push(`${es ? 'Trucos' : 'Tricks'}: ${res.message || 'sync failed'}`)
  }

  const strength = await syncStrengthLibrary()
  lines.push(strength.ok
    ? `${es ? 'Fuerza' : 'Strength'}: ${strength.upserted} ${es ? 'ejercicios' : 'exercises'}`
      + (strength.deactivated ? ` (-${strength.deactivated})` : '')
    : `${es ? 'Fuerza' : 'Strength'}: ${strength.message || 'sync failed'}`)

  alert(lines.join('\n'))
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
    <MemberStaffPageHeader
      :title="language === 'es' ? 'Bolsa de trucos' : 'Bag of Tricks'"
      :subtitle="sportLabel"
    >
      <template #actions>
        <template v-if="userRole === 'admin' || userRole === 'coach'">
          <button
            type="button"
            class="px-3 py-2 rounded-xl border border-gray-700 text-sm font-semibold text-gray-200"
            @click="openHistory"
          >
            {{ language === 'es' ? 'Historial' : 'History' }}
          </button>
          <button
            type="button"
            :disabled="backingUp || sportImporting"
            class="px-3 py-2 rounded-xl border border-gray-700 text-sm font-semibold text-gray-200 disabled:opacity-50"
            @click="openTransfer"
          >
            {{ backingUp || sportImporting ? '…' : (language === 'es' ? 'Importar / Exportar' : 'Import / Export') }}
          </button>
          <input
            ref="sportImportInput"
            type="file"
            accept=".csv,.xlsx,text/csv"
            class="hidden"
            @change="onSportImport"
          >
        </template>
        <button
          type="button"
          class="px-4 py-2.5 rounded-xl bg-acid text-charcoal text-sm font-semibold"
          @click="openAddTrickModal"
        >
          + {{ language === 'es' ? 'Añadir truco' : 'Add trick' }}
        </button>
      </template>
    </MemberStaffPageHeader>
    <Teleport to="body">
      <div v-if="transferOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/80" @click="transferOpen = false" />
        <div class="relative w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6">
          <h3 class="text-lg font-bold text-white">
            {{ language === 'es' ? '¿Qué quieres hacer?' : 'What do you want to do?' }}
          </h3>
          <p class="mt-1 text-sm text-gray-400">{{ sportLabel }}</p>

          <div v-if="transferChoice === 'ask'" class="mt-5 grid gap-3">
            <button
              type="button"
              class="rounded-xl border border-gray-700 px-4 py-3 text-left text-sm font-semibold text-white hover:border-acid"
              @click="chooseExport"
            >
              {{ language === 'es' ? 'Exportar' : 'Export' }}
              <span class="mt-1 block text-xs font-normal text-gray-400">
                {{ language === 'es' ? 'Descarga estos trucos en Excel.' : 'Download these tricks as Excel.' }}
              </span>
            </button>
            <button
              type="button"
              class="rounded-xl border border-gray-700 px-4 py-3 text-left text-sm font-semibold text-white hover:border-acid"
              @click="transferChoice = 'import'"
            >
              {{ language === 'es' ? 'Importar' : 'Import' }}
              <span class="mt-1 block text-xs font-normal text-gray-400">
                {{ language === 'es' ? 'Llena la plantilla CSV y se agregan los trucos.' : 'Fill the CSV template and the tricks are added.' }}
              </span>
            </button>
          </div>

          <div v-else class="mt-5 space-y-3">
            <p class="text-sm text-gray-300">
              {{ language === 'es'
                ? 'Descarga la plantilla, escribe un truco por fila en Habilidad y súbela. Los que ya existen se conservan; solo se agregan los nuevos al final.'
                : 'Download the template, write one trick per row in Habilidad, then upload it. Tricks that already exist stay as they are; only new ones are added at the end.' }}
            </p>
            <button
              type="button"
              :disabled="templateDownloading"
              class="w-full rounded-xl border border-gray-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              @click="downloadTrickTemplate"
            >
              {{ templateDownloading ? '…' : (language === 'es' ? 'Descargar plantilla CSV' : 'Download CSV template') }}
            </button>
            <button
              type="button"
              :disabled="sportImporting || !isTrainingDiscipline(selectedSport)"
              class="w-full rounded-xl bg-acid px-4 py-3 text-sm font-semibold text-charcoal disabled:opacity-50"
              @click="sportImportInput?.click()"
            >
              {{ sportImporting ? '…' : (language === 'es' ? 'Subir trucos' : 'Upload tricks') }}
            </button>
          </div>

          <button
            type="button"
            class="mt-4 w-full py-2 text-sm text-gray-400"
            @click="transferOpen = false"
          >
            {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
          </button>
        </div>
      </div>
    </Teleport>
    <div class="max-w-lg lg:max-w-7xl mx-auto w-full px-4 py-6 space-y-6">

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
          {{ language === 'es' ? 'Añadir al plan' : 'Add to plan' }}
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
            <MemberTrickTypePicker v-model="filterType" allow-empty size="sm" :options="filterTypeOptions" />
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
        <div class="overflow-x-auto rounded-xl border border-gray-200 bg-white text-gray-900 [color-scheme:light]">
        <table class="w-full min-w-[720px] text-sm text-left">
          <thead class="bg-gray-100 text-gray-900 text-[11px] uppercase tracking-wide">
            <tr>
              <th v-if="pickMode" class="px-2 py-1.5 w-10" />
              <th class="px-2 py-1.5 w-12">
                <button type="button" class="hover:text-gray-900 transition-colors" @click="toggleSort('manual_id', $event)">
                  #{{ sortIndicator('manual_id') }}
                </button>
              </th>
              <th class="px-2 py-1.5">
                <button type="button" class="hover:text-gray-900 transition-colors" @click="toggleSort('name', $event)">
                  {{ language === 'es' ? 'Habilidad' : 'Skill' }}{{ sortIndicator('name') }}
                </button>
              </th>
              <th class="px-2 py-1.5">
                <button type="button" class="hover:text-gray-900 transition-colors" @click="toggleSort('difficulty', $event)">
                  {{ language === 'es' ? 'Nivel' : 'Level' }}{{ sortIndicator('difficulty') }}
                </button>
              </th>
              <th class="px-2 py-1.5">
                <button type="button" class="hover:text-gray-900 transition-colors" @click="toggleSort('structure', $event)">
                  Structure{{ sortIndicator('structure') }}
                </button>
              </th>
              <th class="px-2 py-1.5">
                <button type="button" class="hover:text-gray-900 transition-colors" @click="toggleSort('area', $event)">
                  Area{{ sortIndicator('area') }}
                </button>
              </th>
              <th class="px-2 py-1.5">
                <button type="button" class="hover:text-gray-900 transition-colors" @click="toggleSort('program', $event)">
                  Program{{ sortIndicator('program') }}
                </button>
              </th>
              <th class="px-2 py-1.5">
                <button type="button" class="hover:text-gray-900 transition-colors" @click="toggleSort('type', $event)">
                  Type{{ sortIndicator('type') }}
                </button>
              </th>
              <th class="px-2 py-1.5">{{ language === 'es' ? 'Rareza' : 'Rarity' }}</th>
              <th class="px-2 py-1.5 text-center">Video</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="filteredSkills.length">
              <tr
                v-for="(skill, rowIdx) in filteredSkills"
                :key="skill.id"
                class="hover:bg-gray-200/70 transition-colors cursor-pointer"
                :class="[
                  rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-100',
                  pickMode && pickedIds.includes(skill.id) ? 'ring-1 ring-inset ring-gray-400' : '',
                  dragId === skill.id ? 'opacity-40' : '',
                  dropTargetId === skill.id ? (dropAfter ? 'shadow-[inset_0_-2px_0_#758A83]' : 'shadow-[inset_0_2px_0_#758A83]') : '',
                ]"
                :draggable="canReorder && dragArmedId === skill.id"
                @click="openDetail(skill)"
                @dragstart="onDragStart(skill, $event)"
                @dragover="onDragOver(skill, $event)"
                @drop.prevent="onDrop(skill)"
                @dragend="onDragEnd"
              >
                <td v-if="pickMode" class="px-2 py-1" @click.stop>
                  <input
                    type="checkbox"
                    :checked="pickedIds.includes(skill.id)"
                    class="rounded border-gray-600"
                    @change="togglePick(skill.id)"
                  >
                </td>
                <td class="px-2 py-1 font-mono text-xs text-gray-800 whitespace-nowrap">
                  <span class="inline-flex items-center gap-1">
                    <span
                      v-if="canReorder"
                      class="cursor-grab select-none px-0.5 text-gray-400 hover:text-gray-900 active:cursor-grabbing"
                      :title="language === 'es' ? 'Arrastra para reordenar' : 'Drag to reorder'"
                      @pointerdown="dragArmedId = skill.id"
                      @pointerup="dragArmedId = null"
                      @click.stop
                    >⋮⋮</span>
                    {{ trickManualLabel(skill) || '—' }}
                  </span>
                </td>
                <td class="px-2 py-1 text-gray-900 font-medium max-w-[220px]">
                  <span class="block truncate">{{ language === 'es' ? skill.name_es || skill.name : skill.name }}</span>
                </td>
                <td class="px-2 py-1">
                  <span class="px-2 py-0.5 rounded text-xs capitalize" :class="tableDifficultyClass(skill.difficulty)">{{ skill.difficulty }}</span>
                </td>
                <td class="px-2 py-1 text-gray-900 text-xs whitespace-nowrap">{{ skillStructure(skill) || '—' }}</td>
                <td class="px-2 py-1 whitespace-nowrap">
                  <span v-if="skill.area" class="px-2 py-0.5 rounded text-xs" :class="tableAreaClass(skill.area)">{{ skill.area }}</span>
                  <span v-else class="text-gray-500 text-xs">—</span>
                </td>
                <td class="px-2 py-1 text-gray-900 text-xs whitespace-nowrap">{{ skill.program || '—' }}</td>
                <td class="px-2 py-1 text-gray-900 text-xs whitespace-nowrap">
                  {{ skill.trick_type || '—' }}
                </td>
                <td class="px-2 py-1 whitespace-nowrap" @click.stop>
                  <select
                    v-if="(skill.trick_type || '').trim().toLowerCase() === 'trick'"
                    :value="skill.rarity || ''"
                    class="rounded-md border-0 py-0.5 pl-2 pr-7 text-xs font-semibold text-gray-900 disabled:opacity-50"
                    :style="{
                      backgroundColor: `${trickRarity(skill).color}55`,
                      boxShadow: `inset 0 0 0 1px ${trickRarity(skill).color}`,
                      backgroundImage: `url(&quot;data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%23111827' stroke-width='1.8'%3E%3Cpath d='M5 7.5 10 12.5 15 7.5'/%3E%3C/svg%3E&quot;)`,
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.4rem center',
                      backgroundSize: '0.75rem',
                    }"
                    :disabled="savingRarityId === skill.id"
                    :aria-label="language === 'es' ? 'Rareza' : 'Rarity'"
                    @change="setTrickRarity(skill, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">
                      ◆ Auto ({{ language === 'es' ? autoTrickRarity(skill).labelEs : autoTrickRarity(skill).labelEn }})
                    </option>
                    <option v-for="r in TRICK_RARITIES" :key="r.id" :value="r.id">
                      ◆ {{ language === 'es' ? r.labelEs : r.labelEn }}
                    </option>
                  </select>
                  <span v-else class="text-gray-500 text-xs">—</span>
                </td>
                <td class="px-2 py-1" @click.stop>
                  <div v-if="trickVideoSources(skill).length" class="flex items-center justify-center gap-1">
                    <button
                      v-for="(source, sourceIdx) in trickVideoSources(skill)"
                      :key="`${skill.id}-${sourceIdx}`"
                      type="button"
                      class="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0"
                      :class="source.kind === 'youtube' ? 'bg-[#FF0000] text-white' : source.kind === 'website' ? 'bg-charcoal-700 text-cream' : ''"
                      :aria-label="source.kind"
                      @click="openVideoPopup(skill, source.url)"
                    >
                      <svg v-if="source.kind === 'instagram'" viewBox="0 0 24 24" class="w-7 h-7" aria-hidden="true">
                        <defs>
                          <linearGradient :id="`ig-${skill.id}-${sourceIdx}`" x1="0" y1="1" x2="1" y2="0">
                            <stop offset="0%" stop-color="#f9ce34" />
                            <stop offset="45%" stop-color="#ee2a7b" />
                            <stop offset="100%" stop-color="#6228d7" />
                          </linearGradient>
                        </defs>
                        <rect x="1" y="1" width="22" height="22" rx="6" :fill="`url(#ig-${skill.id}-${sourceIdx})`" />
                        <circle cx="12" cy="12" r="4.2" fill="none" stroke="white" stroke-width="1.6" />
                        <circle cx="17.2" cy="6.8" r="1" fill="white" />
                      </svg>
                      <svg v-else-if="source.kind === 'youtube'" viewBox="0 0 24 24" class="w-4 h-4" aria-hidden="true">
                        <path fill="currentColor" d="M9.2 7.6v8.8l7.4-4.4-7.4-4.4z" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <ellipse cx="12" cy="12" rx="4" ry="9" />
                        <path d="M3 12h18M4.6 7.5h14.8M4.6 16.5h14.8" />
                      </svg>
                    </button>
                  </div>
                  <span v-else class="block text-center text-gray-600 text-xs">—</span>
                </td>
              </tr>
            </template>
            <tr v-else>
              <td :colspan="pickMode ? 10 : 9" class="px-4 py-12 text-center text-gray-500">
                <template v-if="selectedSport !== 'skateboarding' && !searchQuery && !filterStructure && !filterArea && !filterType && !filterProgram && !selectedDifficulty">
                  {{ language === 'es'
                    ? `Todavía no hay trucos de ${sportLabel}. Usa Importar / Exportar, descarga la plantilla CSV y súbela.`
                    : `No ${sportLabel} tricks yet. Use Import / Export, download the CSV template, and upload it.` }}
                </template>
                <template v-else>
                  {{ language === 'es' ? 'Sin trucos con estos filtros.' : 'No tricks match these filters.' }}
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
        <section v-if="sharedTraining.length" class="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div class="px-4 py-3 border-b border-gray-800">
            <h2 class="text-sm font-semibold text-white">
              {{ language === 'es' ? 'Calentamiento y fuerza' : 'Warm-up and strength' }}
            </h2>
            <p class="text-xs text-gray-500 mt-1">
              {{ language === 'es'
                ? 'Este material se comparte. Los trucos de skateboarding no entran en este deporte.'
                : 'This material is shared. Skateboarding tricks stay out of this sport.' }}
            </p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-sm text-left">
              <thead class="text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th class="px-4 py-2">{{ language === 'es' ? 'Ejercicio' : 'Exercise' }}</th>
                  <th class="px-4 py-2">{{ language === 'es' ? 'Fase' : 'Phase' }}</th>
                  <th class="px-4 py-2">{{ language === 'es' ? 'Nivel' : 'Level' }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="exercise in sharedTraining" :key="exercise.slug" class="border-t border-gray-800">
                  <td class="px-4 py-2 text-gray-100">{{ exercise.name }}</td>
                  <td class="px-4 py-2 text-gray-400">{{ phaseLabel(exercise.training_phase, language === 'es') }}</td>
                  <td class="px-4 py-2 text-gray-400">{{ levelLabel(exercise.level, language === 'es') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <p v-if="!pickMode && (userRole === 'admin' || userRole === 'coach')" class="text-xs text-gray-500">
          <template v-if="savingOrder">{{ language === 'es' ? 'Guardando orden…' : 'Saving order…' }}</template>
          <template v-else-if="canReorder">{{ language === 'es' ? 'Arrastra ⋮⋮ para cambiar el orden. Cada cambio queda en el Historial.' : 'Drag ⋮⋮ to change the order. Every change is kept in History.' }}</template>
          <template v-else>{{ language === 'es' ? 'Clic ordena por una columna. Mantén Ctrl y haz clic en otra para ordenar por varias. Ordena por # (ascendente) para arrastrar y reordenar.' : 'Click sorts by one column. Hold Ctrl and click another to sort by several. Sort by # (ascending) to drag and reorder.' }}</template>
        </p>
      </div>
    </div>

    <div
      v-if="historyOpen"
      class="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
      @click="historyOpen = false"
    >
      <div class="w-full max-w-2xl max-h-[80vh] flex flex-col bg-gray-900 border border-gray-700 rounded-2xl" @click.stop>
        <div class="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-800">
          <h3 class="text-white text-sm font-semibold">{{ language === 'es' ? 'Historial de la Bolsa de trucos' : 'Trick library history' }}</h3>
          <button type="button" class="w-7 h-7 rounded-lg bg-gray-800 text-gray-300 text-sm" @click="historyOpen = false">×</button>
        </div>
        <div class="overflow-y-auto px-4 py-2">
          <p v-if="historyLoading" class="py-8 text-center text-sm text-gray-400">…</p>
          <p v-else-if="historyError" class="py-8 text-center text-sm text-gray-400">{{ historyError }}</p>
          <p v-else-if="!historyRows.length" class="py-8 text-center text-sm text-gray-400">
            {{ language === 'es' ? 'Sin cambios todavía.' : 'No changes yet.' }}
          </p>
          <ul v-else class="divide-y divide-gray-800">
            <li v-for="row in historyRows" :key="row.id" class="py-2 text-xs">
              <div class="flex items-baseline justify-between gap-3">
                <span class="font-semibold text-gray-200 truncate">{{ row.skill_name || '—' }}</span>
                <span class="shrink-0 text-gray-500">{{ historyDate(row.changed_at) }} · {{ row.who }}</span>
              </div>
              <p class="mt-0.5 text-gray-400 break-words">{{ historySummary(row) }}</p>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div
      v-if="videoPopup"
      class="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4"
      @click="videoPopup = null"
    >
      <div
        class="w-full bg-gray-900 border border-gray-700 rounded-2xl p-3"
        :class="videoPopup.kind === 'instagram' ? 'max-w-md' : 'max-w-3xl'"
        @click.stop
      >
        <div class="flex items-start justify-between gap-2 mb-2">
          <h3 class="text-white text-sm font-semibold min-w-0 leading-snug">{{ videoPopup.name }}</h3>
          <button type="button" class="w-7 h-7 rounded-lg bg-gray-800 text-gray-300 shrink-0 text-sm" @click="videoPopup = null">×</button>
        </div>
        <video
          v-if="isDirectVideoFile(videoPopup.url)"
          :src="videoPopup.url"
          class="w-full rounded-xl bg-black aspect-video"
          controls
          autoplay
          playsinline
        />
        <VideoUrlPreview v-else :url="videoPopup.url" autoplay compact />
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
