<script setup lang="ts">
import { format, addDays } from 'date-fns'
import { es } from 'date-fns/locale'
import { isClassDay } from '~/utils/classSchedule'
import {
  SKATE_TRICK_AREAS,
  SKATE_TRICK_STRUCTURES,
  SKATE_TRICK_TYPES,
  SKATE_TRICK_PROGRAMS,
  categoryFromTrickMeta,
  difficultyFromStructure,
  difficultyTagClass,
  areaTagClass,
  trickManualLabel,
  compareSkillsByManualId,
} from '~/utils/skateTrickTaxonomy'
import { hasEmbeddableVideoPreview } from '~/utils/videoEmbed'
import ClassPlanTrickPickerSheet from '~/components/member/ClassPlanTrickPickerSheet.vue'
import {
  CLASS_PLAN_BEGINNER_AUDIENCES,
  CLASS_PLAN_TRICK_SECTIONS,
  allSectionSkillIds,
  difficultyForSkillTrack,
  emptyPlanSections,
  normalizePlanSections,
  sectionDef,
  type ClassPlanSection,
  type ClassPlanSectionId,
} from '~/utils/classPlanSections'
import { PROGRAM_SKILL_TRACKS, type ProgramSkillTrack } from '~/types'
import StrengthSessionBuilder from '~/components/member/StrengthSessionBuilder.vue'
import type { StrengthBlockSnapshot } from '~/utils/strengthSessionGenerator'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

// State
const activeTab = ref<'tips' | 'plan' | 'tricks'>('plan')
const loading = ref(true)
const saving = ref(false)
const skills = ref<any[]>([])
const { syncing, syncNiikLibrary: doSyncNiikLibrary } = useNiikLibrarySync()
const { syncing: syncingStrength, syncStrengthLibrary } = useStrengthLibrary()
const classPlans = ref<any[]>([])
const selectedDate = ref(new Date())
const selectedSession = ref<'early' | 'late'>('early')

// Plan form
const plan = ref({
  title: '',
  skill_track: '' as ProgramSkillTrack | '',
  audience_category: '' as string,
  plan_sections: emptyPlanSections() as ClassPlanSection[],
  strength_block: null as StrengthBlockSnapshot | null,
  warmup_notes: '',
  main_activity_notes: '',
  planned_skills: [] as string[],
})

const trickPickerOpen = ref(false)
const trickPickerSectionId = ref<ClassPlanSectionId>('drills')
const trickPickerSectionIds = ref<string[]>([])

const es = computed(() => language.value === 'es')

function sectionSkills(sectionId: ClassPlanSectionId) {
  const ids = plan.value.plan_sections.find(s => s.id === sectionId)?.skill_ids || []
  return skills.value.filter(s => ids.includes(s.id))
}

function openTrickPicker(sectionId: ClassPlanSectionId) {
  trickPickerSectionId.value = sectionId
  trickPickerSectionIds.value = [
    ...(plan.value.plan_sections.find(s => s.id === sectionId)?.skill_ids || []),
  ]
  trickPickerOpen.value = true
}

function applyTrickPicker(ids: string[]) {
  const slot = plan.value.plan_sections.find(s => s.id === trickPickerSectionId.value)
  if (slot) slot.skill_ids = [...ids]
  plan.value.planned_skills = allSectionSkillIds(plan.value.plan_sections)
}

function removeSectionSkill(sectionId: ClassPlanSectionId, skillId: string) {
  const slot = plan.value.plan_sections.find(s => s.id === sectionId)
  if (!slot) return
  slot.skill_ids = slot.skill_ids.filter(id => id !== skillId)
  plan.value.planned_skills = allSectionSkillIds(plan.value.plan_sections)
}

function selectSkillTrack(track: ProgramSkillTrack) {
  plan.value.skill_track = plan.value.skill_track === track ? '' : track
  if (plan.value.skill_track !== 'beginner') plan.value.audience_category = ''
}

function selectBeginnerAudience(id: string) {
  plan.value.audience_category = plan.value.audience_category === id ? '' : id
}

const trickPickerMeta = computed(() => {
  const def = sectionDef(trickPickerSectionId.value)
  return {
    label: es.value ? def.label.es : def.label.en,
    defaultProgram: def.defaultProgram,
    difficulty: difficultyForSkillTrack(plan.value.skill_track),
  }
})

const totalPlannedTricks = computed(() =>
  plan.value.plan_sections.reduce((n, s) => n + s.skill_ids.length, 0),
)

/** Older plans stored `{}` before the strength block existed. */
function normalizeStrengthBlock(value: unknown): StrengthBlockSnapshot | null {
  const block = value as StrengthBlockSnapshot | null
  return block?.blocks?.length ? block : null
}

/** Plain-text mirror of the generated session, kept for the printable plan. */
function strengthBlockToNotes(block: StrengthBlockSnapshot | null): string {
  if (!block?.blocks?.length) return ''
  const lines = block.blocks.flatMap(b =>
    b.exercises.map(ex => `${ex.name}${ex.prescription ? ` — ${ex.prescription}` : ''}`),
  )
  return lines.join('\n')
}

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

/** Program coach picker: Rodrigo is included via coachDirectory; exclude admin-only ops (e.g. Marina Reyes). */
const PROGRAM_COACH_EXCLUDE_EMAILS = new Set(
  ADMIN_ONLY_EXCLUDE_FROM_PROGRAM_COACH_EMAILS.map((e) => e.trim().toLowerCase()),
)
function isEligibleProgramCoach(p: { email?: string | null }) {
  const e = (p.email || '').trim().toLowerCase()
  if (e && PROGRAM_COACH_EXCLUDE_EMAILS.has(e)) return false
  return true
}

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

// Admin: assign athletes to a program (program_students)
const showAssignAthletesModal = ref(false)
const assignAthletesProgramId = ref<string | null>(null)
const assignAthletesProgramName = ref('')
const assignAthleteSearch = ref('')
const assigningAthleteId = ref<string | null>(null)
const removingAthleteId = ref<string | null>(null)

const programNameByStudentId = computed(() => {
  const m: Record<string, string> = {}
  for (const p of programsList.value) {
    for (const s of p.students) {
      m[s.id] = p.name
    }
  }
  return m
})

const openAssignAthletesModal = (prog: { id: string; name: string }) => {
  assignAthletesProgramId.value = prog.id
  assignAthletesProgramName.value = prog.name
  assignAthleteSearch.value = ''
  showAssignAthletesModal.value = true
}
const closeAssignAthletesModal = () => {
  showAssignAthletesModal.value = false
  assignAthletesProgramId.value = null
  assignAthletesProgramName.value = ''
  assignAthleteSearch.value = ''
}

const assignModalStudents = computed(() => {
  const pid = assignAthletesProgramId.value
  if (!pid) return []
  const prog = programsList.value.find((p) => p.id === pid)
  const inThis = new Set((prog?.students || []).map((s) => s.id))
  const q = assignAthleteSearch.value.trim().toLowerCase()
  return allStudents.value
    .filter((s) => !inThis.has(s.id))
    .filter(
      (s) =>
        !q ||
        (s.full_name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q)
    )
})

const addStudentToProgram = async (studentId: string) => {
  if (userRole.value !== 'admin' || !assignAthletesProgramId.value) return
  assigningAthleteId.value = studentId
  try {
    await client.from('program_students').delete().eq('student_id', studentId)
    const { error } = await client.from('program_students').insert({
      program_id: assignAthletesProgramId.value,
      student_id: studentId,
    })
    if (error) throw error
    await fetchPrograms()
  } catch (e: any) {
    console.error('addStudentToProgram:', e)
    alert(e?.message || (language.value === 'es' ? 'No se pudo asignar' : 'Could not assign'))
  } finally {
    assigningAthleteId.value = null
  }
}

const removeStudentFromProgram = async (programId: string, studentId: string) => {
  if (userRole.value !== 'admin') return
  removingAthleteId.value = studentId
  try {
    const { error } = await client
      .from('program_students')
      .delete()
      .eq('program_id', programId)
      .eq('student_id', studentId)
    if (error) throw error
    await fetchPrograms()
  } catch (e: any) {
    console.error('removeStudentFromProgram:', e)
    alert(e?.message || (language.value === 'es' ? 'No se pudo quitar' : 'Could not remove'))
  } finally {
    removingAthleteId.value = null
  }
}

/** Coaches may appear in several programs; RLS allows coach + admin to edit program_coaches */
const canManageProgramCoaches = computed(
  () => userRole.value === 'admin' || userRole.value === 'coach'
)

const showAssignCoachesModal = ref(false)
const assignCoachesProgramId = ref<string | null>(null)
const assignCoachesProgramName = ref('')
const assignCoachSearch = ref('')
const assigningCoachId = ref<string | null>(null)
const removingCoachId = ref<string | null>(null)

const programNamesByCoachId = computed(() => {
  const m: Record<string, string[]> = {}
  for (const p of programsList.value) {
    for (const c of p.coaches) {
      if (!m[c.id]) m[c.id] = []
      m[c.id].push(p.name)
    }
  }
  return m
})

const openAssignCoachesModal = (prog: { id: string; name: string }) => {
  assignCoachesProgramId.value = prog.id
  assignCoachesProgramName.value = prog.name
  assignCoachSearch.value = ''
  showAssignCoachesModal.value = true
}
const closeAssignCoachesModal = () => {
  showAssignCoachesModal.value = false
  assignCoachesProgramId.value = null
  assignCoachesProgramName.value = ''
  assignCoachSearch.value = ''
}

const assignModalCoaches = computed(() => {
  const pid = assignCoachesProgramId.value
  if (!pid) return []
  const prog = programsList.value.find((p) => p.id === pid)
  const inThis = new Set((prog?.coaches || []).map((c) => c.id))
  const q = assignCoachSearch.value.trim().toLowerCase()
  return allCoaches.value
    .filter((c) => !inThis.has(c.id))
    .filter(
      (c) =>
        !q ||
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
    )
})

const addCoachToProgram = async (coachId: string) => {
  if (!canManageProgramCoaches.value || !assignCoachesProgramId.value) return
  assigningCoachId.value = coachId
  try {
    const { error } = await client.from('program_coaches').insert({
      program_id: assignCoachesProgramId.value,
      coach_id: coachId,
    })
    if (error) throw error
    await fetchPrograms()
  } catch (e: any) {
    console.error('addCoachToProgram:', e)
    alert(e?.message || (language.value === 'es' ? 'No se pudo asignar' : 'Could not assign'))
  } finally {
    assigningCoachId.value = null
  }
}

const removeCoachFromProgram = async (programId: string, coachId: string) => {
  if (!canManageProgramCoaches.value) return
  removingCoachId.value = coachId
  try {
    const { error } = await client
      .from('program_coaches')
      .delete()
      .eq('program_id', programId)
      .eq('coach_id', coachId)
    if (error) throw error
    await fetchPrograms()
  } catch (e: any) {
    console.error('removeCoachFromProgram:', e)
    alert(e?.message || (language.value === 'es' ? 'No se pudo quitar' : 'Could not remove'))
  } finally {
    removingCoachId.value = null
  }
}

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
  const daysStr = dayNames.map(d => language.value === 'es' ? d.es : d.en).join(', ') || (language.value === 'es' ? '—' : '—')
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
    const coaches = await fetchCoachDirectoryProfiles(client, {
      select: 'id, full_name, email',
      activeOnly: true,
    })
    const { data: students } = await client.from('profiles').select('id, full_name, email').eq('role', 'customer').eq('is_active', true)
    allCoaches.value = coaches.filter(isEligibleProgramCoach)
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
      if (coaches?.length) {
        await client.from('program_coaches').insert(coaches.map((c: any) => ({ program_id: newId, coach_id: c.coach_id })))
      }
      // Copying athletes requires admin (RLS); coaches may still copy coaches only
      if (userRole.value === 'admin') {
        const { data: students } = await client.from('program_students').select('student_id').eq('program_id', copyId)
        if (students?.length) {
          await client.from('program_students').insert(students.map((s: any) => ({ program_id: newId, student_id: s.student_id })))
        }
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
  const tab = String(useRoute().query.tab || '')
  if (tab === 'tricks') {
    await navigateTo('/member/coach/tricks', { replace: true })
    return
  }
  if (tab === 'tips' || tab === 'plan') {
    activeTab.value = tab
  }
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
  // Restore tricks picked from /member/coach/tricks?pick=plan
  try {
    const raw = sessionStorage.getItem('niik-plan-pick-skills')
    if (raw) {
      const ids: string[] = JSON.parse(raw)
      if (ids.length) {
        const drills = plan.value.plan_sections.find(s => s.id === 'drills')
        if (drills) {
          drills.skill_ids = [...new Set([...drills.skill_ids, ...ids])]
        }
        plan.value.planned_skills = allSectionSkillIds(plan.value.plan_sections)
      }
      sessionStorage.removeItem('niik-plan-pick-skills')
    }
  } catch { /* ignore */ }
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

/** One workbook, two sheets: tricks and the strength library sync together. */
const syncLibrariesFromExcel = async () => {
  const lines: string[] = []
  const tricks = await autoSyncNiikLibrary(true)
  lines.push(
    tricks.ok
      ? `${language.value === 'es' ? 'Trucos' : 'Tricks'}: ${tricks.total}`
      : `${language.value === 'es' ? 'Trucos' : 'Tricks'}: ${tricks.message}`,
  )

  const strength = await syncStrengthLibrary()
  lines.push(
    strength.ok
      ? `${language.value === 'es' ? 'Fuerza' : 'Strength'}: ${strength.upserted}`
        + (strength.deactivated ? ` (-${strength.deactivated})` : '')
      : `${language.value === 'es' ? 'Fuerza' : 'Strength'}: ${strength.message}`,
  )

  await fetchSkills()
  alert(lines.join('\n'))
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
    const sections = normalizePlanSections(existingPlan.plan_sections, existingPlan.planned_skills)
    plan.value = {
      title: existingPlan.title || '',
      skill_track: existingPlan.skill_track || '',
      audience_category: existingPlan.audience_category || '',
      plan_sections: sections,
      strength_block: normalizeStrengthBlock(existingPlan.strength_block),
      warmup_notes: existingPlan.warmup_notes || '',
      main_activity_notes: existingPlan.main_activity_notes || '',
      planned_skills: allSectionSkillIds(sections),
    }
  } else {
    plan.value = {
      title: '',
      skill_track: '',
      audience_category: '',
      plan_sections: emptyPlanSections(),
      strength_block: null,
      warmup_notes: '',
      main_activity_notes: '',
      planned_skills: [],
    }
  }
}

// Check if date is a class day
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
        skill_track: plan.value.skill_track || null,
        audience_category:
          plan.value.skill_track === 'beginner' && plan.value.audience_category
            ? plan.value.audience_category
            : null,
        plan_sections: plan.value.plan_sections,
        strength_block: plan.value.strength_block ?? {},
        warmup_notes: strengthBlockToNotes(plan.value.strength_block),
        main_activity_notes: plan.value.main_activity_notes,
        planned_skills: allSectionSkillIds(plan.value.plan_sections),
      }, {
        onConflict: 'coach_id,plan_date,time_slot'
      })
    
    if (error) throw error
    
    await fetchClassPlans()
    alert(language.value === 'es' ? '¡Plan guardado!' : 'Plan saved!')
  } catch (e) {
    console.error('Error saving plan:', e)
    const msg = (e as { message?: string })?.message || String(e)
    const migration = msg.includes('strength_block')
      ? 'supabase/migrations/add_strength_exercises.sql'
      : msg.includes('plan_sections') || msg.includes('skill_track')
        ? 'supabase/migrations/add_class_plan_skill_and_sections.sql'
        : null
    alert(
      migration
        ? (language.value === 'es'
          ? `Ejecuta ${migration} en Supabase.`
          : `Run ${migration} in Supabase.`)
        : msg,
    )
  } finally {
    saving.value = false
  }
}

// Program summary counts from the Excel "Program" column. Strength is no longer a
// trick program; it lives in the Strength_Training sheet.
const programSummary = computed(() => {
  const list = skills.value
  const prog = (s: any) => (s.program || '').trim()
  return {
    iniciacion: list.filter(s => prog(s) === 'Iniciacion').length,
    street: list.filter(s => prog(s) === 'Street').length,
    parkBowl: list.filter(s => prog(s) === 'Park/Bowl').length,
  }
})

// Filtered skills (by program card, search, and difficulty) — ordered by Excel #
const filteredSkills = computed(() => {
  return skills.value
    .filter(skill => {
      const matchesProgram = !selectedProgram.value || (skill.program || '').trim() === selectedProgram.value
      const matchesSearch = !searchQuery.value ||
        skill.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
        skill.name_es?.toLowerCase().includes(searchQuery.value.toLowerCase())
      const matchesDifficulty = !selectedDifficulty.value || skill.difficulty === selectedDifficulty.value
      return matchesProgram && matchesSearch && matchesDifficulty
    })
    .sort(compareSkillsByManualId)
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
const trickDetailUrl = computed(() => {
  const skill = trickDetailSkill.value
  if (!skill) return null
  const url = (skill.video_url || trickDetailMeta.value?.url || '').trim()
  return url || null
})
const openTrickDetail = (skill: any) => { trickDetailSkill.value = skill }
const closeTrickDetail = () => { trickDetailSkill.value = null }

// Add trick modal (coaches and admins can add)
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
function openAddTrickModal() {
  newTrick.value = { name: '', area: '', structure: '', tipo: '', program: '', comentarios: '', url: '', habilidadMotriz: '' }
  addTrickModalOpen.value = true
}
function closeAddTrickModal() {
  addTrickModalOpen.value = false
}

async function saveNewTrick() {
  const n = newTrick.value
  if (!n.name?.trim()) {
    alert(language.value === 'es' ? 'Escribe el nombre del truco.' : 'Enter the trick name.')
    return
  }
  if (!n.area || !n.structure || !n.tipo || !n.program) {
    alert(language.value === 'es'
      ? 'Completa Área, Estructura, Tipo y Programa.'
      : 'Fill in Area, Structure, Type, and Program.')
    return
  }
  addTrickSaving.value = true
  try {
    const motorSkills = n.habilidadMotriz
      ? n.habilidadMotriz.split(',').map((s: string) => s.trim()).filter(Boolean)
      : []
    const nextManualId =
      skills.value.reduce((max, s) => Math.max(max, s.manual_id ?? s.sort_order ?? 0), 0) + 1
    const { error } = await client.from('skills_library').insert({
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
      manual_id: nextManualId,
      sort_order: nextManualId,
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

/** Opens Programs (skill structure + skater assignment). */
function goProgramResourceHub() {
  void navigateTo('/member/coach/library')
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4 pt-safe pb-4">
      <div class="max-w-lg mx-auto pt-4">
        <h1 class="text-2xl font-bold text-white mb-4">
          {{ language === 'es' ? 'Planeación de Clases' : 'Class Planning' }}
        </h1>
        
        <!-- Tabs: Tips | Sessions | Tricks -->
        <div class="flex gap-2">
          <button
            @click="activeTab = 'tips'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'tips' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Tips & Trucos' : 'Tips & Tricks' }}
          </button>
          <button
            @click="activeTab = 'plan'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'plan' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Sesiones' : 'Sessions' }}
          </button>
          <NuxtLink
            to="/member/coach/tricks"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all text-center bg-gray-800 text-gray-400 hover:text-white"
          >
            {{ language === 'es' ? 'Trucos' : 'Tricks' }}
          </NuxtLink>
        </div>
      </div>
    </header>

    <div class="px-4 max-w-lg mx-auto py-4">
      <!-- Tips & Tricks (former Knowledge base) -->
      <div v-if="activeTab === 'tips'">
        <MemberTipsTricksPanel />
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
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
            <div>
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

            <!-- Skill track -->
            <div>
              <p class="text-xs text-gray-500 mb-2">
                {{ language === 'es' ? 'Nivel de la clase' : 'Class level' }}
              </p>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="track in PROGRAM_SKILL_TRACKS"
                  :key="track.id"
                  type="button"
                  class="py-2.5 px-2 rounded-xl text-xs font-bold border transition-all"
                  :class="plan.skill_track === track.id
                    ? 'border-gold-400 bg-gold-400/20 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-400'"
                  @click="selectSkillTrack(track.id)"
                >
                  <span class="block text-base mb-0.5">{{ track.emoji }}</span>
                  {{ language === 'es' ? track.label.es : track.label.en }}
                </button>
              </div>
            </div>

            <!-- Beginner audience: tots / kids / adults -->
            <div v-if="plan.skill_track === 'beginner'">
              <p class="text-xs text-gray-500 mb-2">
                {{ language === 'es' ? 'Público principiante' : 'Beginner audience' }}
              </p>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="band in CLASS_PLAN_BEGINNER_AUDIENCES"
                  :key="band.id"
                  type="button"
                  class="py-2.5 px-2 rounded-xl text-xs font-bold border transition-all"
                  :class="plan.audience_category === band.id
                    ? 'border-teal-400 bg-teal-500/20 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-400'"
                  @click="selectBeginnerAudience(band.id)"
                >
                  <span class="block text-base mb-0.5">{{ band.emoji }}</span>
                  {{ language === 'es' ? band.nickname.es : band.nickname.en }}
                </button>
              </div>
            </div>
          </div>

          <!-- Strength: generated from the Excel Strength_Training library -->
          <StrengthSessionBuilder
            v-model="plan.strength_block"
            :level="plan.skill_track"
            :audience="plan.audience_category"
          />

          <!-- Class sections: pick tricks inline from bag -->
          <div class="space-y-3">
            <p class="text-xs text-gray-500 px-1">
              🛹
              {{ language === 'es' ? 'Secciones de la clase' : 'Class sections' }}
              ({{ totalPlannedTricks }})
            </p>

            <div
              v-for="section in CLASS_PLAN_TRICK_SECTIONS"
              :key="section.id"
              class="bg-gray-900 border border-gray-800 rounded-xl p-4"
            >
              <div class="flex items-center justify-between mb-3 gap-2">
                <label class="text-sm text-gray-300 font-semibold flex items-center gap-2 min-w-0">
                  <span>{{ section.emoji }}</span>
                  <span class="truncate">
                    {{ language === 'es' ? section.label.es : section.label.en }}
                  </span>
                  <span class="text-gray-500 font-normal">({{ sectionSkills(section.id).length }})</span>
                </label>
                <button
                  type="button"
                  class="shrink-0 text-gold-400 text-sm font-semibold px-2 py-1"
                  @click="openTrickPicker(section.id)"
                >
                  {{ language === 'es' ? '+ Trucos' : '+ Tricks' }}
                </button>
              </div>

              <div
                v-if="!sectionSkills(section.id).length"
                class="text-center py-3 text-gray-500 text-sm"
              >
                {{ language === 'es' ? 'Toca + Trucos para elegir de la bolsa' : 'Tap + Tricks to pick from the bag' }}
              </div>

              <div v-else class="space-y-2">
                <div
                  v-for="skill in sectionSkills(section.id)"
                  :key="skill.id"
                  class="flex items-center gap-3 p-2 bg-gray-800 rounded-lg"
                >
                  <span class="w-8 h-8 rounded-full bg-gold-400/20 flex items-center justify-center text-gold-400 text-sm shrink-0">
                    🛹
                  </span>
                  <div class="flex-1 min-w-0">
                    <p class="text-white text-sm font-semibold truncate">
                      {{ language === 'es' ? skill.name_es || skill.name : skill.name }}
                    </p>
                    <p class="text-xs text-gray-500 truncate">{{ skill.area }} · {{ difficultyStars(skill.difficulty) }}</p>
                  </div>
                  <button
                    type="button"
                    class="p-2 text-flame-500 shrink-0"
                    @click="removeSectionSkill(section.id, skill.id)"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <ClassPlanTrickPickerSheet
            :open="trickPickerOpen"
            :skills="skills"
            :selected-ids="trickPickerSectionIds"
            :section-label="trickPickerMeta.label"
            :difficulty-filter="trickPickerMeta.difficulty || undefined"
            :default-program="trickPickerMeta.defaultProgram"
            @close="trickPickerOpen = false"
            @confirm="applyTrickPicker"
          />

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
        <div class="grid grid-cols-3 gap-3 mb-6">
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
              :disabled="syncing || syncingStrength"
              class="text-xs px-3 py-1.5 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50"
              @click="syncLibrariesFromExcel"
            >
              {{ syncing || syncingStrength ? (language === 'es' ? 'Sincronizando...' : 'Syncing...') : (language === 'es' ? 'Sincronizar desde Excel' : 'Sync from Excel') }}
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
                class="flex-1 min-w-0"
              >
                <div class="flex items-center gap-2 flex-wrap">
                  <span v-if="trickManualLabel(skill)" class="text-xs font-mono text-gray-500 shrink-0">{{ trickManualLabel(skill) }}</span>
                  <p :class="plan.planned_skills.includes(skill.id) ? 'text-white' : 'text-gray-300'">
                    {{ language === 'es' ? skill.name_es || skill.name : skill.name }}
                  </p>
                </div>
                <button
                  @click="openTrickDetail(skill)"
                  class="mt-1 px-2 py-0.5 rounded-md text-[11px] leading-tight font-semibold bg-gray-800 text-blue-300 hover:bg-gray-700"
                >
                  {{ language === 'es' ? 'Ver detalle' : 'View details' }}
                </button>
              </div>
              <div class="flex flex-wrap gap-1 items-end justify-end max-w-[50%]">
                <span v-if="skill.area" class="px-2 py-0.5 rounded text-xs" :class="areaTagClass(skill.area)">
                  {{ skill.area }}
                </span>
                <span class="px-2 py-0.5 rounded text-xs capitalize" :class="difficultyTagClass(skill.difficulty)">
                  {{ skill.difficulty }}
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
                <label class="block text-gray-400 mb-1">Area *</label>
                <select v-model="newTrick.area" required class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
                  <option value="">—</option>
                  <option v-for="opt in SKATE_TRICK_AREAS" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 mb-1">{{ language === 'es' ? 'Estructura' : 'Structure' }} *</label>
                <select v-model="newTrick.structure" required class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
                  <option value="">—</option>
                  <option v-for="opt in SKATE_TRICK_STRUCTURES" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <div>
                <label class="block text-gray-400 mb-1">Type *</label>
                <select v-model="newTrick.tipo" required class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white">
                  <option value="">—</option>
                  <option v-for="opt in SKATE_TRICK_TYPES" :key="opt" :value="opt">{{ opt }}</option>
                </select>
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
            class="w-full bg-gray-900 border border-gray-700 rounded-2xl p-4 max-h-[85vh] overflow-y-auto"
            :class="trickDetailUrl && hasEmbeddableVideoPreview(trickDetailUrl) ? 'max-w-2xl' : 'max-w-lg'"
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
              <p class="text-gray-300"><span class="text-gray-500">Area:</span> {{ trickDetailSkill.area || trickDetailMeta?.area || '-' }}</p>
              <p class="text-gray-300"><span class="text-gray-500">{{ language === 'es' ? 'Estructura' : 'Structure' }}:</span> {{ trickDetailSkill.structure || trickDetailMeta?.structure || trickDetailSkill.categoria || '-' }}</p>
              <p class="text-gray-300"><span class="text-gray-500">Type:</span> {{ trickDetailSkill.trick_type || trickDetailMeta?.trick_type || '-' }}</p>
              <p class="text-gray-300"><span class="text-gray-500">Program:</span> {{ trickDetailSkill.program || trickDetailMeta?.program || '-' }}</p>
              <p class="text-gray-300"><span class="text-gray-500">comentarios:</span> {{ trickDetailMeta?.comentarios || trickDetailSkill.description || '-' }}</p>
              <div>
                <p class="text-gray-500 mb-1">url</p>
                <VideoUrlPreview v-if="trickDetailUrl" :url="trickDetailUrl" />
                <span v-else class="text-gray-300">-</span>
              </div>
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
