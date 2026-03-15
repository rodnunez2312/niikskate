<script setup lang="ts">
import { format, addDays, isTuesday, isThursday, isSaturday } from 'date-fns'
import { es } from 'date-fns/locale'

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

// State
const activeTab = ref<'programs' | 'plan' | 'tricks'>('programs')
const loading = ref(true)
const saving = ref(false)
const skills = ref<any[]>([])
const { syncing, syncNiikLibrary: doSyncNiikLibrary } = useNiikLibrarySync()
const classPlans = ref<any[]>([])
const selectedDate = ref(new Date())
const selectedSession = ref<'early' | 'late'>('early')

// Plan form
const plan = ref({
  title: '',
  warmup_notes: '',
  main_activity_notes: '',
  planned_skills: [] as string[]
})

// Current user role (admin-only: sync from Excel)
const userRole = ref<'admin' | 'coach' | 'customer' | null>(null)

// Skill filters: search + difficulty + program (summary cards)
const searchQuery = ref('')
const selectedDifficulty = ref('')
const selectedProgram = ref<string>('') // 'Strength Training' | 'Iniciacion' | 'Street' | 'Park/Bowl' | ''

// Import for trick detail / legacy display
import type { ActivityCategory } from '~/types'
import { ACTIVITY_CATEGORY_LABELS } from '~/types'
const categoryLabels = ACTIVITY_CATEGORY_LABELS

interface ExcelTrickMeta {
  truco?: string
  categoria?: string
  dirigido?: string
  comentarios?: string
  url?: string
  new_category?: string
  habilidad_motriz_habilitada?: string[]
}

interface ExcelTrickLibrary {
  tricks: Array<ExcelTrickMeta & { name?: string; name_es?: string }>
}

const excelTricksByName = ref<Record<string, ExcelTrickMeta>>({})

// Programs (Programs Structure tab)
const programsList = ref<Array<{
  id: string
  name: string
  description?: string | null
  is_active: boolean
  schedule_start_time?: string | null
  schedule_end_time?: string | null
  schedule_days?: string[] | null
  coaches: Array<{ id: string; full_name: string; email?: string }>
  students: Array<{ id: string; full_name: string; email?: string }>
}>>([])
const programsLoading = ref(false)
const expandedProgramId = ref<string | null>(null)
const programStats = ref({ totalPrograms: 0, totalCoaches: 0, totalAthletes: 0, activePrograms: 0 })
const showCreateProgramModal = ref(false)
const newProgramName = ref('')
const newProgramDescription = ref('')
const newProgramColor = ref<string>('')
const newProgramIsDefault = ref(false)
const newProgramCopyFromProgram = ref(false)
const newProgramCopyFromProgramId = ref<string>('')
const creatingProgram = ref(false)

const PROGRAM_COLORS = [
  { value: '#111827', label: 'Black' },
  { value: '#2563eb', label: 'Blue' },
  { value: '#16a34a', label: 'Green' },
  { value: '#ea580c', label: 'Orange' },
  { value: '#7c3aed', label: 'Purple' },
  { value: '#0d9488', label: 'Teal' },
  { value: '#65a30d', label: 'Lime' },
  { value: '#db2777', label: 'Pink' },
]

// Edit Program modal
const showEditProgramModal = ref(false)
const editProgramId = ref<string | null>(null)
const editProgramName = ref('')
const editProgramDescription = ref('')
const editProgramColor = ref<string>('')
const editProgramIsDefault = ref(false)
const editProgramIsActive = ref(true)
const savingEditProgram = ref(false)

const openEditProgramModal = (prog: { id: string; name: string; description?: string | null; color?: string | null; is_default?: boolean; is_active?: boolean }) => {
  editProgramId.value = prog.id
  editProgramName.value = prog.name || ''
  editProgramDescription.value = prog.description || ''
  editProgramColor.value = prog.color || ''
  editProgramIsDefault.value = !!prog.is_default
  editProgramIsActive.value = prog.is_active !== false
  showEditProgramModal.value = true
}
const closeEditProgramModal = () => {
  showEditProgramModal.value = false
  editProgramId.value = null
  editProgramName.value = ''
  editProgramDescription.value = ''
  editProgramColor.value = ''
  editProgramIsDefault.value = false
  editProgramIsActive.value = true
}
const saveEditProgram = async () => {
  const id = editProgramId.value
  const name = editProgramName.value.trim()
  if (!id || !name) return
  savingEditProgram.value = true
  try {
    if (editProgramIsDefault.value) {
      await client.from('programs').update({ is_default: false }).neq('id', id)
    }
    const { error } = await client.from('programs').update({
      name,
      description: editProgramDescription.value.trim() || null,
      color: editProgramColor.value || null,
      is_default: editProgramIsDefault.value,
      is_active: editProgramIsActive.value,
    }).eq('id', id)
    if (error) throw error
    closeEditProgramModal()
    await fetchPrograms()
  } catch (e: any) {
    console.error('Update program failed:', e)
    alert(e?.message || 'Failed to save')
  } finally {
    savingEditProgram.value = false
  }
}

const allCoaches = ref<Array<{ id: string; full_name: string; email?: string }>>([])
const allStudents = ref<Array<{ id: string; full_name: string; email?: string }>>([])

// Program Schedule modal (clock icon)
const showScheduleModal = ref(false)
const scheduleProgramId = ref<string | null>(null)
const scheduleProgramName = ref('')
const scheduleStartTime = ref('09:00')
const scheduleEndTime = ref('17:00')
const scheduleDays = ref<string[]>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])
const savingSchedule = ref(false)
const DAYS_OF_WEEK = [
  { value: 'monday', en: 'Monday', es: 'Lunes' },
  { value: 'tuesday', en: 'Tuesday', es: 'Martes' },
  { value: 'wednesday', en: 'Wednesday', es: 'Miércoles' },
  { value: 'thursday', en: 'Thursday', es: 'Jueves' },
  { value: 'friday', en: 'Friday', es: 'Viernes' },
  { value: 'saturday', en: 'Saturday', es: 'Sábado' },
  { value: 'sunday', en: 'Sunday', es: 'Domingo' },
]
function timeToDisplay(t: string | null | undefined) {
  if (!t) return '9:00 AM'
  const part = (t + '').slice(0, 5)
  const [h, m] = part.split(':').map(Number)
  const hour = Number.isFinite(h) ? h : 9
  const min = Number.isFinite(m) ? m : 0
  const h12 = hour % 12 || 12
  const ampm = hour < 12 ? 'AM' : 'PM'
  return `${h12}:${String(min).padStart(2, '0')} ${ampm}`
}
function displayToTime(display: string) {
  const match = (display + '').match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
  if (!match) return '09:00'
  let h = parseInt(match[1], 10)
  const m = parseInt(match[2], 10) || 0
  const ampm = (match[3] || '').toUpperCase()
  if (ampm === 'PM' && h !== 12) h += 12
  if (ampm === 'AM' && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
const openScheduleModal = (prog: { id: string; name: string; schedule_start_time?: string | null; schedule_end_time?: string | null; schedule_days?: string[] | null }) => {
  scheduleProgramId.value = prog.id
  scheduleProgramName.value = prog.name
  const start = prog.schedule_start_time
  const end = prog.schedule_end_time
  scheduleStartTime.value = start ? (start.length === 5 ? start : start.slice(0, 5)) : '09:00'
  scheduleEndTime.value = end ? (end.length === 5 ? end : end.slice(0, 5)) : '17:00'
  scheduleDays.value = Array.isArray(prog.schedule_days) && prog.schedule_days.length ? prog.schedule_days : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
  showScheduleModal.value = true
}
const closeScheduleModal = () => {
  showScheduleModal.value = false
  scheduleProgramId.value = null
  scheduleProgramName.value = ''
}
const toggleScheduleDay = (day: string) => {
  const i = scheduleDays.value.indexOf(day)
  if (i >= 0) scheduleDays.value = scheduleDays.value.filter((_, idx) => idx !== i)
  else scheduleDays.value = [...scheduleDays.value, day].sort((a, b) => DAYS_OF_WEEK.findIndex(d => d.value === a) - DAYS_OF_WEEK.findIndex(d => d.value === b))
}
const schedulePreviewText = computed(() => {
  const start = timeToDisplay(scheduleStartTime.value)
  const end = timeToDisplay(scheduleEndTime.value)
  const dayNames = scheduleDays.value.map(d => DAYS_OF_WEEK.find(x => x.value === d)).filter(Boolean) as { en: string; es: string }[]
  const daysStr = dayNames.map(d => language === 'es' ? d.es : d.en).join(', ') || (language === 'es' ? '—' : '—')
  return { start, end, daysStr }
})
const saveProgramSchedule = async () => {
  if (!scheduleProgramId.value) return
  savingSchedule.value = true
  try {
    const start = scheduleStartTime.value.length === 5 ? scheduleStartTime.value : scheduleStartTime.value.slice(0, 5)
    const end = scheduleEndTime.value.length === 5 ? scheduleEndTime.value : scheduleEndTime.value.slice(0, 5)
    const { error } = await client.from('programs').update({
      schedule_start_time: start,
      schedule_end_time: end,
      schedule_days: scheduleDays.value,
    }).eq('id', scheduleProgramId.value)
    if (error) throw error
    closeScheduleModal()
    await fetchPrograms()
  } catch (e: any) {
    console.error('Save schedule failed:', e)
    alert(e?.message || 'Failed to save schedule')
  } finally {
    savingSchedule.value = false
  }
}

const fetchPrograms = async () => {
  programsLoading.value = true
  try {
    const { data: programs } = await client.from('programs').select('id, name, description, is_active, color, is_default, schedule_start_time, schedule_end_time, schedule_days').order('name')
    if (!programs?.length) {
      programsList.value = []
      programStats.value = { totalPrograms: 0, totalCoaches: 0, totalAthletes: 0, activePrograms: 0 }
      return
    }
    const { data: pc } = await client.from('program_coaches').select('program_id, coach_id')
    const { data: ps } = await client.from('program_students').select('program_id, student_id')
    const coachIds = [...new Set((pc || []).map((r: any) => r.coach_id))]
    const studentIds = [...new Set((ps || []).map((r: any) => r.student_id))]
    const { data: coachProfiles } = await client.from('profiles').select('id, full_name, email').in('id', coachIds)
    const { data: studentProfiles } = await client.from('profiles').select('id, full_name, email').in('id', studentIds)
    const coachesById = Object.fromEntries((coachProfiles || []).map((p: any) => [p.id, p]))
    const studentsById = Object.fromEntries((studentProfiles || []).map((p: any) => [p.id, p]))
    programsList.value = (programs || []).map((prog: any) => ({
      ...prog,
      coaches: (pc || []).filter((r: any) => r.program_id === prog.id).map((r: any) => coachesById[r.coach_id]).filter(Boolean),
      students: (ps || []).filter((r: any) => r.program_id === prog.id).map((r: any) => studentsById[r.student_id]).filter(Boolean),
    }))
    const activePrograms = (programs || []).filter((p: any) => p.is_active).length
    programStats.value = {
      totalPrograms: programs.length,
      totalCoaches: coachIds.length,
      totalAthletes: studentIds.length,
      activePrograms,
    }
  } catch (e) {
    console.error('Error fetching programs:', e)
  } finally {
    programsLoading.value = false
  }
}

const fetchAllCoachesAndStudents = async () => {
  try {
    const { data: coaches } = await client.from('profiles').select('id, full_name, email').eq('role', 'coach').eq('is_active', true)
    const { data: students } = await client.from('profiles').select('id, full_name, email').eq('role', 'customer').eq('is_active', true)
    allCoaches.value = coaches || []
    allStudents.value = students || []
  } catch (e) {
    console.error('Error fetching coaches/students:', e)
  }
}

watch(activeTab, (tab) => {
  if (tab === 'programs') {
    fetchPrograms()
    fetchAllCoachesAndStudents()
  }
})

const closeCreateProgramModal = () => {
  showCreateProgramModal.value = false
  newProgramName.value = ''
  newProgramDescription.value = ''
  newProgramColor.value = ''
  newProgramIsDefault.value = false
  newProgramCopyFromProgram.value = false
  newProgramCopyFromProgramId.value = ''
}

const createProgram = async () => {
  const name = newProgramName.value.trim()
  if (!name) return
  creatingProgram.value = true
  try {
    const { data: inserted, error } = await client
      .from('programs')
      .insert({
        name,
        description: newProgramDescription.value.trim() || null,
        color: newProgramColor.value || null,
        is_default: newProgramIsDefault.value,
      })
      .select('id')
      .single()
    if (error) throw error
    const newId = inserted?.id
    if (newId && newProgramIsDefault.value) {
      await client.from('programs').update({ is_default: false }).neq('id', newId)
    }
    if (newId && newProgramCopyFromProgram.value && newProgramCopyFromProgramId.value) {
      const copyId = newProgramCopyFromProgramId.value
      const { data: coaches } = await client.from('program_coaches').select('coach_id').eq('program_id', copyId)
      const { data: students } = await client.from('program_students').select('student_id').eq('program_id', copyId)
      if (coaches?.length) {
        await client.from('program_coaches').insert(coaches.map((c: any) => ({ program_id: newId, coach_id: c.coach_id })))
      }
      if (students?.length) {
        await client.from('program_students').insert(students.map((s: any) => ({ program_id: newId, student_id: s.student_id })))
      }
    }
    closeCreateProgramModal()
    await fetchPrograms()
  } catch (e: any) {
    console.error('Create program failed:', e)
    alert(e?.message || 'Failed to create program')
  } finally {
    creatingProgram.value = false
  }
}

const toggleProgramExpanded = (id: string) => {
  expandedProgramId.value = expandedProgramId.value === id ? null : id
}

const initials = (name?: string) => {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return (name[0] || '?').toUpperCase()
}

onMounted(async () => {
  if (user.value) {
    const { data: profile } = await client.from('profiles').select('role').eq('id', user.value.id).single()
    userRole.value = profile?.role ?? null
  }
  // Load skills first (fast)
  await Promise.all([fetchSkills(), fetchClassPlans(), loadExcelTrickLibrary()])
  // Set date to next class day
  while (!isClassDay(selectedDate.value)) {
    selectedDate.value = addDays(selectedDate.value, 1)
  }
  await loadExistingPlan()
  // Load programs for default Programs tab
  await fetchPrograms()
  fetchAllCoachesAndStudents()
  // Only admins can sync from Excel; run auto-sync for admin only
  if (userRole.value === 'admin') {
    autoSyncNiikLibrary()
      .then(() => fetchSkills())
      .catch((e) => {
        console.error('Sync failed, loading current DB skills:', e)
        fetchSkills()
      })
  }
})

const normalizeTrickKey = (value?: string) => (value || '').toLowerCase().trim()

const loadExcelTrickLibrary = async () => {
  try {
    const data = await $fetch<ExcelTrickLibrary>('/data/niik-trick-library.json', {
      headers: { 'Cache-Control': 'no-cache' }
    })
    const map: Record<string, ExcelTrickMeta> = {}
    for (const trick of data?.tricks || []) {
      const keys = [trick.truco, trick.name_es, trick.name]
        .map(normalizeTrickKey)
        .filter(Boolean)
      for (const key of keys) map[key] = trick
    }
    excelTricksByName.value = map
  } catch (e) {
    console.error('Error loading Excel trick metadata:', e)
  }
}

const fetchSkills = async () => {
  loading.value = true
  try {
    const { data } = await client
      .from('skills_library')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('sort_order')
    
    skills.value = data || []
    
    const uniqueCats = [...new Set(skills.value.map(s => s.categoria).filter(Boolean))]
    console.log('Categorias in database:', uniqueCats)
  } catch (e) {
    console.error('Error fetching skills:', e)
  } finally {
    loading.value = false
  }
}

// Sync from JSON (force = true when user clicks button so we always use latest file)
const autoSyncNiikLibrary = async (force = false) => {
  if (force) console.log('Syncing from Excel/JSON (force)...')
  const res = await doSyncNiikLibrary(force ? { force: true } : undefined)
  if (res.ok) {
    console.log(`Niik Library synced: ${res.inserted} new, ${res.updated} updated, ${res.total} total`)
  } else if (res.message) {
    console.error('Niik Library sync failed:', res.message)
  }
  return res
}

// Force sync for debugging - reloads skills after sync
const forceSyncLibrary = async () => {
  console.log('Force syncing Niik Library...')
  const res = await doSyncNiikLibrary()
  if (res.ok) {
    await fetchSkills()
    alert(`Sync complete!\n${res.inserted} new, ${res.updated} updated.\n\nCheck console for category info.`)
  } else {
    alert('Sync failed: ' + res.message)
  }
}

const fetchClassPlans = async () => {
  try {
    const { data } = await client
      .from('class_plans')
      .select('*')
      .eq('coach_id', user.value?.id)
      .order('plan_date', { ascending: false })
      .limit(20)
    
    classPlans.value = data || []
  } catch (e) {
    console.error('Error fetching plans:', e)
  }
}

const loadExistingPlan = async () => {
  const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
  const existingPlan = classPlans.value.find(
    p => p.plan_date === dateStr && p.time_slot === selectedSession.value
  )
  
  if (existingPlan) {
    plan.value = {
      title: existingPlan.title || '',
      warmup_notes: existingPlan.warmup_notes || '',
      main_activity_notes: existingPlan.main_activity_notes || '',
      planned_skills: existingPlan.planned_skills || []
    }
  } else {
    plan.value = {
      title: '',
      warmup_notes: '',
      main_activity_notes: '',
      planned_skills: []
    }
  }
}

// Check if date is a class day
const isClassDay = (date: Date) => {
  return isTuesday(date) || isThursday(date) || isSaturday(date)
}

// Navigate dates
const prevDate = () => {
  let newDate = addDays(selectedDate.value, -1)
  while (!isClassDay(newDate)) {
    newDate = addDays(newDate, -1)
  }
  selectedDate.value = newDate
  loadExistingPlan()
}

const nextDate = () => {
  let newDate = addDays(selectedDate.value, 1)
  while (!isClassDay(newDate)) {
    newDate = addDays(newDate, 1)
  }
  selectedDate.value = newDate
  loadExistingPlan()
}

// Toggle skill selection
const toggleSkill = (skillId: string) => {
  const index = plan.value.planned_skills.indexOf(skillId)
  if (index >= 0) {
    plan.value.planned_skills.splice(index, 1)
  } else {
    plan.value.planned_skills.push(skillId)
  }
}

// Save plan
const savePlan = async () => {
  saving.value = true
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    
    const { error } = await client
      .from('class_plans')
      .upsert({
        coach_id: user.value?.id,
        plan_date: dateStr,
        time_slot: selectedSession.value,
        title: plan.value.title,
        warmup_notes: plan.value.warmup_notes,
        main_activity_notes: plan.value.main_activity_notes,
        planned_skills: plan.value.planned_skills
      }, {
        onConflict: 'coach_id,plan_date,time_slot'
      })
    
    if (error) throw error
    
    await fetchClassPlans()
    alert(language.value === 'es' ? '¡Plan guardado!' : 'Plan saved!')
  } catch (e) {
    console.error('Error saving plan:', e)
  } finally {
    saving.value = false
  }
}

// Program summary counts from Excel "Program" column: Strength Training, Iniciacion, Street, Park/Bowl only
const programSummary = computed(() => {
  const list = skills.value
  const prog = (s: any) => (s.program || '').trim()
  return {
    strengthTraining: list.filter(s => prog(s) === 'Strength Training').length,
    iniciacion: list.filter(s => prog(s) === 'Iniciacion').length,
    street: list.filter(s => prog(s) === 'Street').length,
    parkBowl: list.filter(s => prog(s) === 'Park/Bowl').length,
  }
})

// Filtered skills (by program card, search, and difficulty)
const filteredSkills = computed(() => {
  return skills.value.filter(skill => {
    const matchesProgram = !selectedProgram.value || (skill.program || '').trim() === selectedProgram.value
    const matchesSearch = !searchQuery.value ||
      skill.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      skill.name_es?.toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchesDifficulty = !selectedDifficulty.value || skill.difficulty === selectedDifficulty.value
    return matchesProgram && matchesSearch && matchesDifficulty
  })
})

// Get selected skills details
const selectedSkillsDetails = computed(() => {
  return skills.value.filter(s => plan.value.planned_skills.includes(s.id))
})

const getTrickMeta = (skill: any) => {
  return excelTricksByName.value[normalizeTrickKey(skill?.name_es || skill?.name)]
    || excelTricksByName.value[normalizeTrickKey(skill?.name)]
}

const trickDetailSkill = ref<any | null>(null)
const trickDetailMeta = computed(() => trickDetailSkill.value ? getTrickMeta(trickDetailSkill.value) : undefined)
const openTrickDetail = (skill: any) => { trickDetailSkill.value = skill }
const closeTrickDetail = () => { trickDetailSkill.value = null }

// Add trick modal (coaches and admins can add)
const addTrickModalOpen = ref(false)
const addTrickSaving = ref(false)
const newTrick = ref({
  name: '',
  categoria: '',
  tipo: '',
  program: '',
  comentarios: '',
  url: '',
  habilidadMotriz: '',
})
const HABILIDAD_MOTRIZ_OPTIONS = [
  'Fuerza en Piernas, Balance, Resistencia',
  'Coordinación, Fuerza, Balance',
  'Potencia, piernas y confianza',
  'Core y control del cuerpo',
  'Equilibrio y fuerza unilateral en piernas',
  'Fortalecimiento abdominal',
  'Fuerza de piernas y estabilidad',
  'Coordinación, Balance, Agilidad',
  'Coordinación, Agilidad',
  'Coordinación, Balance, Core',
  'Coordinación, Agilidad, Balance',
  'Velocidad, Coordinación, Resistencia',
  'Coordinación, Agilidad, Fuerza en Piernas',
  'Coordinación, piernas y confianza',
  'Balance, Coordinación, Fuerza en Piernas',
  'Fuerza, Coordinación, Agilidad',
  'Balance, Coordinación, Confianza',
  'Balance, Coordinación, Fuerza',
  'Coordinación, Balance',
]
const CATEGORIA_OPTIONS = ['0 - Warmup', '1 - Basics', '2 - Principiantes', '3 - Intermedios', '4 - Avanzados']
const TIPO_OPTIONS = ['Ejercicios', 'Drill', 'Truco']
const PROGRAM_OPTIONS = ['Strength Training', 'Iniciacion', 'Street', 'Park/Bowl']

function openAddTrickModal() {
  newTrick.value = { name: '', categoria: '', tipo: '', program: '', comentarios: '', url: '', habilidadMotriz: '' }
  addTrickModalOpen.value = true
}
function closeAddTrickModal() {
  addTrickModalOpen.value = false
}

function difficultyFromCategoria(cat: string) {
  if (!cat) return 'beginner'
  if (/0\s*-\s*Warmup|1\s*-\s*Basics/i.test(cat)) return 'beginner'
  if (/2\s*-\s*Principiantes/i.test(cat)) return 'beginner'
  if (/3\s*-\s*Intermedios/i.test(cat)) return 'intermediate'
  if (/4\s*-\s*Avanzados/i.test(cat)) return 'advanced'
  return 'beginner'
}
function categoryFromProgram(program: string, tipo: string) {
  const t = (tipo || '').toLowerCase()
  if (/ejercicio|funcional|drill/.test(t)) return program === 'Strength Training' ? 'excercise' : 'iniciacion'
  const p = (program || '').toLowerCase()
  if (p === 'strength training') return 'excercise'
  if (p === 'iniciacion') return 'iniciacion'
  if (p === 'street') return 'street'
  if (p === 'park/bowl') return 'vert_bowl'
  return 'iniciacion'
}

async function saveNewTrick() {
  const n = newTrick.value
  if (!n.name?.trim()) {
    alert(language.value === 'es' ? 'Escribe el nombre del truco.' : 'Enter the trick name.')
    return
  }
  addTrickSaving.value = true
  try {
    const motorSkills = n.habilidadMotriz
      ? n.habilidadMotriz.split(',').map((s: string) => s.trim()).filter(Boolean)
      : []
    const { error } = await client.from('skills_library').insert({
      name: n.name.trim(),
      name_es: n.name.trim(),
      description: n.comentarios?.trim() || n.name.trim(),
      difficulty: difficultyFromCategoria(n.categoria),
      category: categoryFromProgram(n.program, n.tipo),
      categoria: n.categoria || null,
      video_url: n.url?.trim() || null,
      program: n.program || null,
      motor_skills: motorSkills,
      sort_order: skills.value.length,
      is_active: true,
    })
    if (error) throw error
    await fetchSkills()
    closeAddTrickModal()
  } catch (e: any) {
    console.error(e)
    alert(e?.message || (language.value === 'es' ? 'Error al guardar' : 'Error saving'))
  } finally {
    addTrickSaving.value = false
  }
}

const buildBenefits = (skill: any, meta?: ExcelTrickMeta) => {
  const motorSkills = meta?.habilidad_motriz_habilitada?.length
    ? meta.habilidad_motriz_habilitada
    : (skill.motor_skills || [])
  const areaByCategory: Record<string, string> = {
    excercise: language.value === 'es' ? 'base física y control corporal' : 'physical foundation and body control',
    iniciacion: language.value === 'es' ? 'street piso y control base' : 'street flatground and board fundamentals',
    street: language.value === 'es' ? 'street obstáculos y transiciones' : 'street obstacles and transitions',
    vert_bowl: language.value === 'es' ? 'trucos de coping y líneas más rápidas' : 'coping tricks and faster transition lines',
    surf_skate: language.value === 'es' ? 'carving avanzado y flow' : 'advanced carving and flow'
  }
  const unlockedArea = areaByCategory[meta?.new_category || skill.category] || (language.value === 'es' ? 'variaciones más avanzadas' : 'more advanced variations')
  const skillName = language.value === 'es' ? (skill.name_es || skill.name) : skill.name
  const bodyFocus = motorSkills.length ? motorSkills.join(', ') : (language.value === 'es' ? 'balance y coordinación' : 'balance and coordination')

  return language.value === 'es'
    ? [
        `Desarrolla ${bodyFocus}.`,
        `Te ayuda a desbloquear ${unlockedArea}.`,
        `Mejora tu consistencia y confianza para repetir ${skillName} bajo presión.`
      ]
    : [
        `Builds ${bodyFocus}.`,
        `Helps unlock ${unlockedArea}.`,
        `Improves consistency and confidence to repeat ${skillName} under pressure.`
      ]
}

const difficultyStars = (difficulty?: string) => {
  if (difficulty === 'advanced') return '★★★'
  if (difficulty === 'intermediate') return '★★'
  return '★'
}

const categoryTagClass = (category?: string) => {
  const map: Record<string, string> = {
    excercise: 'bg-sky-500/20 text-sky-300',
    iniciacion: 'bg-teal-500/20 text-teal-300',
    street: 'bg-indigo-500/20 text-indigo-300',
    vert_bowl: 'bg-rose-500/20 text-rose-300',
    surf_skate: 'bg-cyan-500/20 text-cyan-300',
    fundamentals: 'bg-fuchsia-500/20 text-fuchsia-300',
    flatground: 'bg-blue-500/20 text-blue-300',
    bowl: 'bg-pink-500/20 text-pink-300',
    vert: 'bg-red-500/20 text-red-300',
    safety: 'bg-lime-500/20 text-lime-300'
  }
  return map[category || ''] || 'bg-purple-500/20 text-purple-300'
}

// Watch session changes
watch(selectedSession, () => loadExistingPlan())
watch(activeTab, () => {
  if (activeTab.value !== 'tricks') closeTrickDetail()
})
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4 pt-safe pb-4">
      <div class="max-w-lg mx-auto pt-4">
        <h1 class="text-2xl font-bold text-white mb-4">
          {{ language === 'es' ? 'Planeación de Clases' : 'Class Planning' }}
        </h1>
        
        <!-- Tabs: Programas | Sessions | Tricks -->
        <div class="flex gap-2">
          <button
            @click="activeTab = 'programs'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'programs' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Programas' : 'Programs' }}
          </button>
          <button
            @click="activeTab = 'plan'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'plan' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Sesiones' : 'Sessions' }}
          </button>
          <button
            @click="activeTab = 'tricks'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'tricks' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Trucos' : 'Tricks' }}
          </button>
        </div>
      </div>
    </header>

    <div class="px-4 max-w-lg mx-auto py-4">
      <!-- Programs Tab (first) -->
      <div v-if="activeTab === 'programs'">
        <!-- Stat cards -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <span class="text-2xl block mb-1">⚙️</span>
            <p class="text-2xl font-bold text-white">{{ programStats.totalPrograms }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Programas' : 'Total Programs' }}</p>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <span class="text-2xl block mb-1">👤</span>
            <p class="text-2xl font-bold text-white">{{ programStats.totalCoaches }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Coaches' : 'Total Coaches' }}</p>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <span class="text-2xl block mb-1">👥</span>
            <p class="text-2xl font-bold text-white">{{ programStats.totalAthletes }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Atletas' : 'Total Athletes' }}</p>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <span class="text-2xl block mb-1">👑</span>
            <p class="text-2xl font-bold text-white">{{ programStats.activePrograms }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Activos' : 'Active Programs' }}</p>
          </div>
        </div>

        <h2 class="text-lg font-bold text-white mb-1">
          {{ language === 'es' ? 'Estructura de Programas' : 'Programs Structure' }}
        </h2>
        <p class="text-sm text-gray-400 mb-4">
          {{ language === 'es' ? 'Configura los programas y la asignación de coaches y alumnos.' : 'Configure programs and coach/student assignments for your school.' }}
        </p>

        <div class="flex justify-end mb-4">
          <button
            @click="showCreateProgramModal = true"
            class="px-4 py-2.5 bg-black border border-gray-600 text-white rounded-xl font-semibold text-sm hover:bg-gray-800 transition-colors"
          >
            + {{ language === 'es' ? 'Crear Programa' : 'Create Program' }}
          </button>
        </div>

        <div v-if="programsLoading" class="py-8 text-center">
          <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
        </div>

        <div v-else-if="programsList.length === 0" class="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p class="text-gray-400">{{ language === 'es' ? 'No hay programas. Crea uno para empezar.' : 'No programs yet. Create one to get started.' }}</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="prog in programsList"
            :key="prog.id"
            class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden"
          >
            <!-- Program header (click to expand) -->
            <div
              role="button"
              tabindex="0"
              class="w-full flex items-center gap-3 p-4 text-left cursor-pointer hover:bg-gray-800/50 transition-colors"
              @click="toggleProgramExpanded(prog.id)"
              @keydown.enter.space.prevent="toggleProgramExpanded(prog.id)"
            >
              <span class="text-gray-400">
                <svg class="w-5 h-5 transition-transform" :class="{ 'rotate-180': expandedProgramId === prog.id }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
              <span class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 text-sm font-bold">P</span>
              <span class="flex-1 font-semibold text-white">{{ prog.name }}</span>
              <span v-if="prog.is_active" class="text-amber-400" title="Active">👑</span>
              <span class="text-xs text-gray-500">{{ prog.coaches.length }} {{ language === 'es' ? 'coaches' : 'coaches' }}</span>
              <span class="text-xs text-gray-500">{{ prog.students.length }} {{ language === 'es' ? 'atletas' : 'athletes' }}</span>
              <button
                type="button"
                class="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-gray-800 transition-colors"
                :title="language === 'es' ? 'Horario del programa' : 'Program schedule'"
                @click.stop="openScheduleModal(prog)"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <button
                type="button"
                class="p-1.5 rounded-lg text-gray-400 hover:text-amber-400 hover:bg-gray-800 transition-colors"
                :title="language === 'es' ? 'Editar programa' : 'Edit program'"
                @click.stop="openEditProgramModal(prog)"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            </div>

            <!-- Expanded content: Coaches and Athletes -->
            <div v-if="expandedProgramId === prog.id" class="border-t border-gray-800 px-4 pb-4 pt-2">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 class="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1">
                    <span>👤</span> {{ language === 'es' ? 'Coaches' : 'Coaches' }} ({{ prog.coaches.length }})
                  </h4>
                  <div v-if="prog.coaches.length === 0" class="text-sm text-gray-500">
                    {{ language === 'es' ? 'Sin coaches asignados' : 'No coaches assigned' }}
                  </div>
                  <div v-else class="space-y-2">
                    <div
                      v-for="c in prog.coaches"
                      :key="c.id"
                      class="flex items-center gap-3 p-2 rounded-lg bg-gray-800/80"
                    >
                      <div class="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-white text-sm font-bold">
                        {{ initials(c.full_name) }}
                      </div>
                      <div class="flex-1 min-w-0">
                        <p class="text-white text-sm font-medium truncate">{{ c.full_name }}</p>
                        <p class="text-xs text-gray-500">coach</p>
                      </div>
                      <NuxtLink :to="`/dashboard/students`" class="text-sm text-blue-400 hover:underline">
                        {{ language === 'es' ? 'Gestionar' : 'Manage' }}
                      </NuxtLink>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 class="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-1">
                    <span>👥</span> {{ language === 'es' ? 'Atletas' : 'Athletes' }} ({{ prog.students.length }})
                  </h4>
                  <div v-if="prog.students.length === 0" class="text-sm text-gray-500">
                    {{ language === 'es' ? 'Sin atletas asignados' : 'No athletes assigned' }}
                  </div>
                  <div v-else class="space-y-2">
                    <div
                      v-for="s in prog.students"
                      :key="s.id"
                      class="flex items-center gap-3 p-2 rounded-lg bg-gray-800/80"
                    >
                      <div class="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-white text-sm font-bold">
                        {{ initials(s.full_name) }}
                      </div>
                      <p class="flex-1 text-white text-sm font-medium truncate">{{ s.full_name }}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Create New Program Modal -->
        <Teleport to="body">
          <div
            v-if="showCreateProgramModal"
            class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            @click.self="closeCreateProgramModal"
          >
            <div class="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div class="flex items-center justify-between p-6 pb-4">
                <h3 class="text-lg font-bold text-white">
                  {{ language === 'es' ? 'Crear nuevo programa' : 'Create New Program' }}
                </h3>
                <button
                  type="button"
                  class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  aria-label="Close"
                  @click="closeCreateProgramModal"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div class="px-6 pb-6 space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1.5">
                    {{ language === 'es' ? 'Nombre del programa' : 'Program Name' }} *
                  </label>
                  <input
                    v-model="newProgramName"
                    type="text"
                    :placeholder="language === 'es' ? 'ej. Programa Elite, Después de clase' : 'e.g., Elite Program, After School'"
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1.5">
                    {{ language === 'es' ? 'Descripción' : 'Description' }}
                  </label>
                  <textarea
                    v-model="newProgramDescription"
                    rows="3"
                    :placeholder="language === 'es' ? 'Breve descripción del programa...' : 'Brief description of the program...'"
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-2">
                    {{ language === 'es' ? 'Color del programa' : 'Program Color' }}
                  </label>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="c in PROGRAM_COLORS"
                      :key="c.value"
                      type="button"
                      class="w-9 h-9 rounded-lg border-2 transition-all shrink-0"
                      :class="newProgramColor === c.value ? 'border-white scale-110' : 'border-gray-600 hover:border-gray-500'"
                      :style="{ backgroundColor: c.value }"
                      :title="c.label"
                      @click="newProgramColor = c.value"
                    />
                  </div>
                </div>
                <div class="space-y-3">
                  <label class="flex items-start gap-3 cursor-pointer">
                    <input
                      v-model="newProgramIsDefault"
                      type="checkbox"
                      class="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-gold-400 focus:ring-gold-400"
                    />
                    <span class="text-sm text-gray-300">
                      {{ language === 'es' ? 'Establecer como programa por defecto' : 'Set as default program' }}
                    </span>
                  </label>
                  <p class="text-xs text-gray-500 ml-7">
                    {{ language === 'es' ? 'Los nuevos atletas se asignarán automáticamente al programa por defecto.' : 'New athletes will be automatically assigned to the default program.' }}
                  </p>
                </div>
                <div class="space-y-3">
                  <label class="flex items-start gap-3 cursor-pointer">
                    <input
                      v-model="newProgramCopyFromProgram"
                      type="checkbox"
                      class="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-gold-400 focus:ring-gold-400"
                    />
                    <span class="text-sm text-gray-300">
                      {{ language === 'es' ? 'Copiar de un programa existente' : 'Copy curriculum from existing program' }}
                    </span>
                  </label>
                  <p class="text-xs text-gray-500 ml-7">
                    {{ language === 'es' ? 'Copia coaches y atletas asignados del programa seleccionado.' : 'Copies assigned coaches and athletes from the selected program.' }}
                  </p>
                  <select
                    v-if="newProgramCopyFromProgram"
                    v-model="newProgramCopyFromProgramId"
                    class="ml-7 w-full max-w-xs px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                  >
                    <option value="">{{ language === 'es' ? 'Seleccionar programa...' : 'Select program...' }}</option>
                    <option v-for="p in programsList" :key="p.id" :value="p.id">{{ p.name }}</option>
                  </select>
                </div>
                <div class="flex gap-3 pt-2">
                  <button
                    type="button"
                    @click="closeCreateProgramModal"
                    class="flex-1 py-2.5 bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-600 transition-colors"
                  >
                    {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
                  </button>
                  <button
                    type="button"
                    @click="createProgram"
                    :disabled="creatingProgram || !newProgramName.trim()"
                    class="flex-1 py-2.5 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    {{ creatingProgram ? (language === 'es' ? 'Creando...' : 'Creating...') : (language === 'es' ? 'Crear programa' : 'Create Program') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Teleport>

        <!-- Program Schedule Modal -->
        <Teleport to="body">
          <div
            v-if="showScheduleModal"
            class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            @click.self="closeScheduleModal"
          >
            <div class="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div class="flex items-center justify-between p-6 pb-2">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <h3 class="text-lg font-bold text-white">
                      {{ language === 'es' ? 'Horario del programa' : 'Program Schedule' }}
                    </h3>
                    <p class="text-sm text-gray-400">{{ scheduleProgramName }}</p>
                  </div>
                </div>
                <button
                  type="button"
                  class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
                  aria-label="Close"
                  @click="closeScheduleModal"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div class="px-6 pb-6 space-y-5">
                <div>
                  <h4 class="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                    <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {{ language === 'es' ? 'Horarios' : 'Schedule Times' }}
                  </h4>
                  <div class="grid grid-cols-2 gap-4">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">{{ language === 'es' ? 'Hora inicio' : 'Start Time' }}</label>
                      <input
                        v-model="scheduleStartTime"
                        type="time"
                        class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
                      />
                      <p class="text-xs text-gray-500 mt-1">{{ timeToDisplay(scheduleStartTime) }}</p>
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">{{ language === 'es' ? 'Hora fin' : 'End Time' }}</label>
                      <input
                        v-model="scheduleEndTime"
                        type="time"
                        class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
                      />
                      <p class="text-xs text-gray-500 mt-1">{{ timeToDisplay(scheduleEndTime) }}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 class="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                    <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {{ language === 'es' ? 'Días disponibles' : 'Available Days' }}
                  </h4>
                  <div class="flex flex-wrap gap-3">
                    <label
                      v-for="day in DAYS_OF_WEEK"
                      :key="day.value"
                      class="flex items-center gap-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        :checked="scheduleDays.includes(day.value)"
                        class="w-4 h-4 rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                        @change="toggleScheduleDay(day.value)"
                      />
                      <span class="text-sm text-gray-300">{{ language === 'es' ? day.es : day.en }}</span>
                    </label>
                  </div>
                </div>
                <div class="bg-gray-800/80 rounded-xl p-4">
                  <h4 class="text-sm font-semibold text-gray-300 mb-2">{{ language === 'es' ? 'Vista previa' : 'Schedule Preview' }}</h4>
                  <p class="text-sm text-gray-400">
                    <span class="font-medium text-white">{{ language === 'es' ? 'Horario:' : 'Times:' }}</span>
                    {{ schedulePreviewText.start }} - {{ schedulePreviewText.end }}
                  </p>
                  <p class="text-sm text-gray-400 mt-1">
                    <span class="font-medium text-white">{{ language === 'es' ? 'Días:' : 'Days:' }}</span>
                    {{ schedulePreviewText.daysStr }}
                  </p>
                </div>
                <div class="flex gap-3 pt-2">
                  <button
                    type="button"
                    @click="closeScheduleModal"
                    class="flex-1 py-2.5 bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-600"
                  >
                    {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
                  </button>
                  <button
                    type="button"
                    @click="saveProgramSchedule"
                    :disabled="savingSchedule"
                    class="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M9 7v10m0 0l2-2m-2 2L9 7" />
                    </svg>
                    {{ savingSchedule ? (language === 'es' ? 'Guardando...' : 'Saving...') : (language === 'es' ? 'Guardar horario' : 'Save Schedule') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Teleport>

        <!-- Edit Program Modal -->
        <Teleport to="body">
          <div
            v-if="showEditProgramModal"
            class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            @click.self="closeEditProgramModal"
          >
            <div class="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div class="flex items-center justify-between p-6 pb-4">
                <h3 class="text-lg font-bold text-white">
                  {{ language === 'es' ? 'Editar programa' : 'Edit Program' }}
                </h3>
                <button
                  type="button"
                  class="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                  aria-label="Close"
                  @click="closeEditProgramModal"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div class="px-6 pb-6 space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1.5">
                    {{ language === 'es' ? 'Nombre del programa' : 'Program Name' }} *
                  </label>
                  <input
                    v-model="editProgramName"
                    type="text"
                    :placeholder="language === 'es' ? 'ej. Programa Elite' : 'e.g., Elite Program'"
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1.5">
                    {{ language === 'es' ? 'Descripción' : 'Description' }}
                  </label>
                  <textarea
                    v-model="editProgramDescription"
                    rows="3"
                    :placeholder="language === 'es' ? 'Breve descripción del programa...' : 'Brief description of the program...'"
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-2">
                    {{ language === 'es' ? 'Color del programa' : 'Program Color' }}
                  </label>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="c in PROGRAM_COLORS"
                      :key="c.value"
                      type="button"
                      class="w-9 h-9 rounded-lg border-2 transition-all shrink-0"
                      :class="editProgramColor === c.value ? 'border-white scale-110' : 'border-gray-600 hover:border-gray-500'"
                      :style="{ backgroundColor: c.value }"
                      :title="c.label"
                      @click="editProgramColor = c.value"
                    />
                  </div>
                </div>
                <div class="space-y-3">
                  <label class="flex items-start gap-3 cursor-pointer">
                    <input
                      v-model="editProgramIsDefault"
                      type="checkbox"
                      class="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-gold-400 focus:ring-gold-400"
                    />
                    <span class="text-sm text-gray-300">
                      {{ language === 'es' ? 'Establecer como programa por defecto' : 'Set as default program' }}
                    </span>
                  </label>
                  <p class="text-xs text-gray-500 ml-7">
                    {{ language === 'es' ? 'Los nuevos atletas se asignarán automáticamente al programa por defecto.' : 'New athletes will be automatically assigned to the default program.' }}
                  </p>
                </div>
                <div class="space-y-3">
                  <label class="flex items-start gap-3 cursor-pointer">
                    <input
                      v-model="editProgramIsActive"
                      type="checkbox"
                      class="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-gold-400 focus:ring-gold-400"
                    />
                    <span class="text-sm text-gray-300">
                      {{ language === 'es' ? 'Programa activo' : 'Active program' }}
                    </span>
                  </label>
                  <p class="text-xs text-gray-500 ml-7">
                    {{ language === 'es' ? 'Los programas inactivos se ocultan en la mayoría de las vistas.' : 'Inactive programs are hidden from most views.' }}
                  </p>
                </div>
                <div class="flex gap-3 pt-2">
                  <button
                    type="button"
                    @click="closeEditProgramModal"
                    class="flex-1 py-2.5 bg-gray-700 text-white rounded-xl font-semibold hover:bg-gray-600 transition-colors"
                  >
                    {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
                  </button>
                  <button
                    type="button"
                    @click="saveEditProgram"
                    :disabled="savingEditProgram || !editProgramName.trim()"
                    class="flex-1 py-2.5 bg-gray-800 text-white rounded-xl font-semibold hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3M9 7v10m0 0l2-2m-2 2L9 7" />
                    </svg>
                    {{ savingEditProgram ? (language === 'es' ? 'Guardando...' : 'Saving...') : (language === 'es' ? 'Guardar cambios' : 'Save Changes') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Teleport>
      </div>

      <!-- Sessions Tab (formerly Planear) -->
      <div v-else-if="activeTab === 'plan'">
        <!-- Date Selector -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <div class="flex items-center justify-between mb-3">
            <button @click="prevDate" class="p-2 bg-gray-800 rounded-lg">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div class="text-center">
              <p class="font-bold text-white capitalize">
                {{ format(selectedDate, 'EEEE', { locale: language === 'es' ? es : undefined }) }}
              </p>
              <p class="text-sm text-gray-400">
                {{ format(selectedDate, 'd MMMM yyyy', { locale: language === 'es' ? es : undefined }) }}
              </p>
            </div>
            <button @click="nextDate" class="p-2 bg-gray-800 rounded-lg">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          
          <!-- Session Toggle -->
          <div class="grid grid-cols-2 gap-2">
            <button
              @click="selectedSession = 'early'"
              class="py-2 rounded-lg font-semibold text-sm transition-all"
              :class="selectedSession === 'early' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
            >
              5:30 PM - 7:00 PM
            </button>
            <button
              @click="selectedSession = 'late'"
              class="py-2 rounded-lg font-semibold text-sm transition-all"
              :class="selectedSession === 'late' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
            >
              7:00 PM - 8:30 PM
            </button>
          </div>
        </div>

        <!-- Plan Form -->
        <div class="space-y-4">
          <!-- Title -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <label class="block text-sm text-gray-400 mb-2">
              {{ language === 'es' ? 'Título de la Clase' : 'Class Title' }}
            </label>
            <input
              v-model="plan.title"
              type="text"
              :placeholder="language === 'es' ? 'Ej: Introducción al Ollie' : 'E.g., Intro to Ollie'"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
            />
          </div>

          <!-- Warmup -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <label class="block text-sm text-gray-400 mb-2">
              🔥 {{ language === 'es' ? 'Calentamiento' : 'Warmup' }}
            </label>
            <textarea
              v-model="plan.warmup_notes"
              rows="3"
              :placeholder="language === 'es' ? 'Ejercicios de calentamiento...' : 'Warmup exercises...'"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
            ></textarea>
          </div>

          <!-- Selected Tricks -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div class="flex items-center justify-between mb-3">
              <label class="text-sm text-gray-400">
                🛹 {{ language === 'es' ? 'Trucos Seleccionados' : 'Selected Tricks' }} ({{ plan.planned_skills.length }})
              </label>
              <button
                @click="activeTab = 'tricks'"
                class="text-gold-400 text-sm font-semibold"
              >
                {{ language === 'es' ? '+ Agregar' : '+ Add' }}
              </button>
            </div>
            
            <div v-if="selectedSkillsDetails.length === 0" class="text-center py-4 text-gray-500">
              {{ language === 'es' ? 'No hay trucos seleccionados' : 'No tricks selected' }}
            </div>
            
            <div v-else class="space-y-2">
              <div
                v-for="skill in selectedSkillsDetails"
                :key="skill.id"
                class="flex items-center gap-3 p-2 bg-gray-800 rounded-lg"
              >
                <span class="w-8 h-8 rounded-full bg-gold-400/20 flex items-center justify-center text-gold-400 text-sm">
                  🛹
                </span>
                <div class="flex-1">
                  <p class="text-white text-sm font-semibold">
                    {{ language === 'es' ? skill.name_es || skill.name : skill.name }}
                  </p>
                  <p class="text-xs text-gray-500">{{ skill.category }} • {{ difficultyStars(skill.difficulty) }}</p>
                  <div v-if="skill.motor_skills?.length" class="flex flex-wrap gap-1 mt-1">
                    <span 
                      v-for="tag in skill.motor_skills" 
                      :key="tag"
                      class="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>
                <button
                  @click="toggleSkill(skill.id)"
                  class="p-1 text-flame-500"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Main Activity -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <label class="block text-sm text-gray-400 mb-2">
              📝 {{ language === 'es' ? 'Actividad Principal / Notas' : 'Main Activity / Notes' }}
            </label>
            <textarea
              v-model="plan.main_activity_notes"
              rows="4"
              :placeholder="language === 'es' ? 'Notas para la clase...' : 'Class notes...'"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
            ></textarea>
          </div>

          <!-- Save Button -->
          <button
            @click="savePlan"
            :disabled="saving"
            class="w-full py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold rounded-xl"
          >
            {{ saving 
              ? (language === 'es' ? 'Guardando...' : 'Saving...') 
              : (language === 'es' ? 'Guardar Plan' : 'Save Plan') 
            }}
          </button>
        </div>
      </div>

      <!-- Tricks Tab -->
      <div v-else-if="activeTab === 'tricks'">
        <!-- Program summary cards: click to filter by program -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <button
            type="button"
            class="rounded-xl p-4 text-center transition-all border"
            :class="selectedProgram === 'Strength Training' ? 'bg-gold-400/20 border-gold-400' : 'bg-gray-900 border-gray-800 hover:border-gray-700'"
            @click="selectedProgram = selectedProgram === 'Strength Training' ? '' : 'Strength Training'"
          >
            <span class="text-2xl block mb-1">💪</span>
            <p class="text-2xl font-bold text-white">{{ programSummary.strengthTraining }}</p>
            <p class="text-xs" :class="selectedProgram === 'Strength Training' ? 'text-gold-400' : 'text-gray-400'">{{ language === 'es' ? 'Strength training' : 'Strength training' }}</p>
          </button>
          <button
            type="button"
            class="rounded-xl p-4 text-center transition-all border"
            :class="selectedProgram === 'Iniciacion' ? 'bg-gold-400/20 border-gold-400' : 'bg-gray-900 border-gray-800 hover:border-gray-700'"
            @click="selectedProgram = selectedProgram === 'Iniciacion' ? '' : 'Iniciacion'"
          >
            <span class="text-2xl block mb-1">🎮</span>
            <p class="text-2xl font-bold text-white">{{ programSummary.iniciacion }}</p>
            <p class="text-xs" :class="selectedProgram === 'Iniciacion' ? 'text-gold-400' : 'text-gray-400'">{{ language === 'es' ? 'Iniciación' : 'Iniciacion' }}</p>
          </button>
          <button
            type="button"
            class="rounded-xl p-4 text-center transition-all border"
            :class="selectedProgram === 'Street' ? 'bg-gold-400/20 border-gold-400' : 'bg-gray-900 border-gray-800 hover:border-gray-700'"
            @click="selectedProgram = selectedProgram === 'Street' ? '' : 'Street'"
          >
            <span class="text-2xl block mb-1">🛤️</span>
            <p class="text-2xl font-bold text-white">{{ programSummary.street }}</p>
            <p class="text-xs" :class="selectedProgram === 'Street' ? 'text-gold-400' : 'text-gray-400'">Street</p>
          </button>
          <button
            type="button"
            class="rounded-xl p-4 text-center transition-all border"
            :class="selectedProgram === 'Park/Bowl' ? 'bg-gold-400/20 border-gold-400' : 'bg-gray-900 border-gray-800 hover:border-gray-700'"
            @click="selectedProgram = selectedProgram === 'Park/Bowl' ? '' : 'Park/Bowl'"
          >
            <span class="text-2xl block mb-1">🥣</span>
            <p class="text-2xl font-bold text-white">{{ programSummary.parkBowl }}</p>
            <p class="text-xs" :class="selectedProgram === 'Park/Bowl' ? 'text-gold-400' : 'text-gray-400'">Park/Bowl</p>
          </button>
        </div>
        <!-- Search -->
        <div class="mb-4">
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="language === 'es' ? 'Buscar truco...' : 'Search trick...'"
            class="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500"
          />
        </div>

        <div class="mb-4 flex items-center justify-between gap-2 flex-wrap">
          <span v-if="userRole === 'admin'" class="text-xs text-gray-500">{{ skills.length }} {{ language === 'es' ? 'trucos cargados' : 'tricks loaded' }}</span>
          <div class="flex gap-2" :class="userRole !== 'admin' ? 'ml-auto' : ''">
            <button
              v-if="userRole === 'admin'"
              type="button"
              :disabled="syncing"
              class="text-xs px-3 py-1.5 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50"
              @click="autoSyncNiikLibrary(true).then(async () => { await fetchSkills() }).catch(async () => { await fetchSkills() })"
            >
              {{ syncing ? (language === 'es' ? 'Sincronizando...' : 'Syncing...') : (language === 'es' ? 'Sincronizar desde Excel' : 'Sync from Excel') }}
            </button>
            <button
              type="button"
              class="text-xs px-3 py-1.5 rounded-lg bg-gold-400 text-black hover:bg-gold-300 font-semibold"
              @click="openAddTrickModal()"
            >
              {{ language === 'es' ? '+ Añadir truco' : '+ Add trick' }}
            </button>
          </div>
        </div>

        <!-- Nivel de Dificultad -->
        <div class="mb-4">
          <p class="text-xs text-gray-500 mb-2">{{ language === 'es' ? 'Nivel de Dificultad' : 'Difficulty Level' }}</p>
          <div class="flex gap-2">
            <button
              @click="selectedDifficulty = ''"
              class="px-3 py-2 rounded-xl text-sm font-semibold"
              :class="!selectedDifficulty ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
            >
              {{ language === 'es' ? 'Todos' : 'All' }}
            </button>
            <button
              @click="selectedDifficulty = 'beginner'"
              class="flex-1 px-3 py-2 rounded-xl text-sm font-semibold"
              :class="selectedDifficulty === 'beginner' ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400'"
            >
              🌱 {{ language === 'es' ? 'Principiante' : 'Beginner' }}
            </button>
            <button
              @click="selectedDifficulty = 'intermediate'"
              class="flex-1 px-3 py-2 rounded-xl text-sm font-semibold"
              :class="selectedDifficulty === 'intermediate' ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-400'"
            >
              ⚡ {{ language === 'es' ? 'Intermedio' : 'Intermediate' }}
            </button>
            <button
              @click="selectedDifficulty = 'advanced'"
              class="flex-1 px-3 py-2 rounded-xl text-sm font-semibold"
              :class="selectedDifficulty === 'advanced' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400'"
            >
              🔥 {{ language === 'es' ? 'Avanzado' : 'Advanced' }}
            </button>
          </div>
        </div>

        <!-- Skills List -->
        <div v-if="loading" class="py-8 text-center">
          <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
        </div>

        <!-- Flat list of all filtered skills -->
        <div v-else class="space-y-2">
          <div
            v-if="filteredSkills.length === 0"
            class="rounded-xl bg-gray-900 border border-gray-800 p-6 text-center"
          >
            <p class="text-gray-400 mb-2">
              {{ skills.length === 0
                ? (language === 'es' ? 'No hay trucos. Ejecuta npm run niik:parse y abre esta pestaña de nuevo (o sincroniza desde la app).' : 'No tricks yet. Run npm run niik:parse and open this tab again (or sync from the app).')
                : (language === 'es' ? 'Ningún truco coincide con los filtros.' : 'No tricks match the current filters.')
              }}
            </p>
            <button
              v-if="skills.length > 0 && (searchQuery || selectedDifficulty || selectedProgram)"
              type="button"
              class="px-4 py-2 rounded-lg bg-gray-700 text-white text-sm hover:bg-gray-600"
              @click="searchQuery = ''; selectedDifficulty = ''; selectedProgram = ''"
            >
              {{ language === 'es' ? 'Limpiar filtros' : 'Clear filters' }}
            </button>
          </div>
          <div
            v-for="skill in filteredSkills"
            :key="skill.id"
            class="w-full p-2 rounded-xl transition-all border"
            :class="plan.planned_skills.includes(skill.id) 
              ? 'bg-gold-400/20 border-gold-400' 
              : 'bg-gray-900 border-gray-800 hover:border-gray-700'"
          >
            <div class="w-full flex items-start gap-3 text-left">
              <button
                @click="toggleSkill(skill.id)"
                class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                :class="plan.planned_skills.includes(skill.id) ? 'bg-gold-400 text-black' : 'bg-gray-800'"
              >
                <svg v-if="plan.planned_skills.includes(skill.id)" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </button>
              <div 
                class="flex-1"
              >
                <p :class="plan.planned_skills.includes(skill.id) ? 'text-white' : 'text-gray-300'">
                  {{ language === 'es' ? skill.name_es || skill.name : skill.name }}
                </p>
                <button
                  @click="openTrickDetail(skill)"
                  class="mt-1 px-2 py-0.5 rounded-md text-[11px] leading-tight font-semibold bg-gray-800 text-blue-300 hover:bg-gray-700"
                >
                  {{ language === 'es' ? 'Ver detalle' : 'View details' }}
                </button>
              </div>
              <div class="flex flex-col gap-1 items-end">
                <span v-if="skill.categoria" class="px-2 py-0.5 rounded text-xs bg-indigo-500/20 text-indigo-300">
                  {{ skill.categoria }}
                </span>
                <span class="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                  {{ difficultyStars(skill.difficulty) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Back to Plan Button -->
        <div v-if="plan.planned_skills.length > 0" class="fixed bottom-20 left-0 right-0 px-4">
          <div class="max-w-lg mx-auto">
            <button
              @click="activeTab = 'plan'"
              class="w-full py-3 bg-gold-400 text-black font-bold rounded-xl"
            >
              {{ language === 'es' ? `Volver al Plan (${plan.planned_skills.length} trucos)` : `Back to Plan (${plan.planned_skills.length} tricks)` }}
            </button>
          </div>
        </div>

        <!-- Add Trick Modal -->
        <div
          v-if="addTrickModalOpen"
          class="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3"
          @click="closeAddTrickModal"
        >
          <div
            class="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl p-4 max-h-[90vh] overflow-y-auto"
            @click.stop
          >
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-white font-semibold">{{ language === 'es' ? 'Añadir truco' : 'Add trick' }}</h3>
              <button type="button" @click="closeAddTrickModal" class="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 hover:text-white">×</button>
            </div>
            <form @submit.prevent="saveNewTrick" class="space-y-3 text-sm">
              <div>
                <label class="block text-gray-400 mb-1">{{ language === 'es' ? 'Truco' : 'Trick name' }} *</label>
                <input v-model="newTrick.name" type="text" required class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white" :placeholder="language === 'es' ? 'Nombre del truco' : 'Trick name'" />
              </div>
              <div>
                <label class="block text-gray-400 mb-1">Categoría</label>
                <select v-model="newTrick.categoria" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
                  <option value="">—</option>
                  <option v-for="opt in CATEGORIA_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 mb-1">Tipo</label>
                <select v-model="newTrick.tipo" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
                  <option value="">—</option>
                  <option v-for="opt in TIPO_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 mb-1">Program</label>
                <select v-model="newTrick.program" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
                  <option value="">—</option>
                  <option v-for="opt in PROGRAM_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 mb-1">{{ language === 'es' ? 'Comentarios' : 'Comments' }}</label>
                <textarea v-model="newTrick.comentarios" rows="2" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white" :placeholder="language === 'es' ? 'Comentarios' : 'Comments'"></textarea>
              </div>
              <div>
                <label class="block text-gray-400 mb-1">URL</label>
                <input v-model="newTrick.url" type="url" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white" placeholder="https://..." />
              </div>
              <div>
                <label class="block text-gray-400 mb-1">Habilidad motriz desarrollada</label>
                <select v-model="newTrick.habilidadMotriz" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
                  <option value="">—</option>
                  <option v-for="opt in HABILIDAD_MOTRIZ_OPTIONS" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <div class="flex gap-2 pt-2">
                <button type="button" @click="closeAddTrickModal" class="flex-1 py-2 rounded-xl bg-gray-700 text-gray-300">{{ language === 'es' ? 'Cancelar' : 'Cancel' }}</button>
                <button type="submit" :disabled="addTrickSaving" class="flex-1 py-2 rounded-xl bg-gold-400 text-black font-semibold disabled:opacity-50">
                  {{ addTrickSaving ? (language === 'es' ? 'Guardando...' : 'Saving...') : (language === 'es' ? 'Guardar' : 'Save') }}
                </button>
              </div>
            </form>
          </div>
        </div>

        <!-- Trick Detail Modal -->
        <div
          v-if="trickDetailSkill"
          class="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3"
          @click="closeTrickDetail"
        >
          <div
            class="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl p-4 max-h-[85vh] overflow-y-auto"
            @click.stop
          >
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-white font-semibold">
                {{ language === 'es' ? trickDetailSkill.name_es || trickDetailSkill.name : trickDetailSkill.name }}
              </h3>
              <button
                @click="closeTrickDetail"
                class="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 hover:text-white"
              >
                ×
              </button>
            </div>

            <div class="grid grid-cols-1 gap-2 text-sm">
              <p class="text-gray-300"><span class="text-gray-500">Truco:</span> {{ trickDetailMeta?.truco || (language === 'es' ? trickDetailSkill.name_es || trickDetailSkill.name : trickDetailSkill.name) }}</p>
              <p class="text-gray-300"><span class="text-gray-500">categoria:</span> {{ trickDetailMeta?.categoria || trickDetailSkill.difficulty || '-' }}</p>
              <p class="text-gray-300"><span class="text-gray-500">dirigido:</span> {{ trickDetailMeta?.dirigido || '-' }}</p>
              <p class="text-gray-300"><span class="text-gray-500">comentarios:</span> {{ trickDetailMeta?.comentarios || trickDetailSkill.description || '-' }}</p>
              <p class="text-gray-300">
                <span class="text-gray-500">url:</span>
                <a
                  v-if="trickDetailMeta?.url"
                  :href="trickDetailMeta.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-400 underline break-all ml-1"
                >
                  {{ trickDetailMeta.url }}
                </a>
                <span v-else>-</span>
              </p>
              <p class="text-gray-300"><span class="text-gray-500">{{ language === 'es' ? 'Categoría' : 'Category' }}:</span> {{ trickDetailMeta?.categoria || trickDetailSkill.categoria || trickDetailSkill.difficulty || '-' }}</p>
              <p class="text-gray-300">
                <span class="text-gray-500">habilidad motriz habilitada:</span>
                {{ (trickDetailMeta?.habilidad_motriz_habilitada?.length ? trickDetailMeta.habilidad_motriz_habilitada : trickDetailSkill.motor_skills || []).join(', ') || '-' }}
              </p>
            </div>

            <div class="pt-2 mt-3 border-t border-gray-800">
              <p class="text-xs uppercase tracking-wide text-gold-400 mb-1">
                {{ language === 'es' ? 'Beneficios y desbloqueos' : 'Benefits and unlocks' }}
              </p>
              <ul class="text-sm text-gray-300 space-y-1">
                <li v-for="benefit in buildBenefits(trickDetailSkill, trickDetailMeta)" :key="benefit">• {{ benefit }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
