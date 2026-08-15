<script setup lang="ts">
import { format, isToday, isTuesday, isThursday, isSaturday, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, isAfter } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  SKATE_TRICK_AREAS,
  SKATE_TRICK_STRUCTURES,
  SKATE_TRICK_TYPES,
  compareSkillsByManualId,
  skillStructure,
  trickBagStatusLabel,
  trickBagStatusFlowHint,
  trickBagStatusNextHint,
  nextTrickBagStatus,
  difficultyTagClass,
  areaTagClass,
  trickManualLabel,
  type SkaterTrickBagStatus,
} from '~/utils/skateTrickTaxonomy'
import { computeSkaterProgramMilestones } from '~/utils/skaterProgramProgress'
import { skaterRatingBubbleClass } from '~/utils/skaterRatingDots'
import { computeAgeFromDob } from '~/utils/ageEligibility'
import { normalizeSkillGroupDisplayName } from '~/utils/skillGroupLevels'
import {
  SKATER_PUSH_OPTIONS,
  SKATER_STANCE_OPTIONS,
  SKATER_STYLE_OPTIONS,
} from '~/utils/skaterProfileFields'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const route = useRoute()
const router = useRouter()
const client = useSupabaseClient()
const { language } = useI18n()

const studentId = computed(() => route.params.id as string)

// State
const student = ref<any | null>(null)
const lastEvaluation = ref<any | null>(null)
const evaluationCount = ref(0)
const loading = ref(true)
const skills = ref<any[]>([])
const studentProgress = ref<any[]>([])
const studentReservations = ref<any[]>([])
const studentAttendance = ref<any[]>([])
const calendarMonth = ref(new Date())

const skillFocusRows = ref<any[]>([])
const assignFilterStructure = ref('')
const assignFilterArea = ref('')
const assignFilterType = ref('')
const assigningSkillId = ref<string | null>(null)
const updatingFocusId = ref<string | null>(null)
const revertingSkillId = ref<string | null>(null)
const focusError = ref<string | null>(null)

const commentModalOpen = ref(false)
const commentFocusId = ref<string | null>(null)
const commentDraft = ref('')
const savingComment = ref(false)

const user = useSupabaseUser()

const assignedSkillGroup = ref<{ id: string; name: string; description: string | null } | null>(null)
const assignedProgramName = ref<string | null>(null)
const programSkillIds = ref<string[]>([])
const individualProgramPct = ref(0)
const groupAveragePct = ref(0)

// Circular ratings (0–10 dots) for Skater Profile: Fundamentals, Skate IQ, Street, Vert, etc.
const SKATER_RATING_ROWS = [
  { key: 'rating_fundamentals', label: 'Fundamentals', labelEs: 'Fundamentos' },
  { key: 'rating_skate_iq', label: 'Skate IQ', labelEs: 'Skate IQ' },
  { key: 'rating_street', label: 'Street', labelEs: 'Street' },
  { key: 'rating_vert', label: 'Vert', labelEs: 'Vert' },
  { key: 'rating_speed_ollie', label: 'Speed ollie', labelEs: 'Speed ollie' },
  { key: 'rating_fakie_switch', label: 'Fakie / Switch', labelEs: 'Fakie / Switch' },
  { key: 'rating_slps', label: 'Slaps', labelEs: 'Slaps' },
  { key: 'rating_rails', label: 'Rails', labelEs: 'Rails' },
]

const skillAttributeDots = computed(() =>
  SKATER_RATING_ROWS.map(({ key, label, labelEs }) => {
    const raw = student.value?.[key]
    // Support both number and string (e.g. from Table Editor)
    const num = typeof raw === 'number' ? raw : (typeof raw === 'string' ? parseInt(raw, 10) : NaN)
    const value = Number.isFinite(num) && num >= 0 && num <= 10 ? num : 0
    return { key, label, labelEs, filled: value, total: 10 }
  })
)

const studentEmail = computed(() => {
  const email = student.value?.email?.trim()
  return email || null
})

const studentAgeDisplay = computed(() => {
  const s = student.value
  if (!s) return null
  const age = computeAgeFromDob(s.date_of_birth, s.age)
  if (age == null) return null
  return language.value === 'es' ? `${age} años` : `${age} years old`
})

const showProfileEditModal = ref(false)
const profileEditDraft = ref({ full_name: '', phone: '', date_of_birth: '' })
const savingProfileModal = ref(false)
const profileModalError = ref<string | null>(null)

const profileEditAgePreview = computed(() => {
  const dob = profileEditDraft.value.date_of_birth?.trim()
  if (!dob) return null
  return computeAgeFromDob(dob)
})

const openProfileEditModal = () => {
  if (!canEditSkaterProfile.value || !student.value) return
  profileEditDraft.value = {
    full_name: student.value.full_name || '',
    phone: student.value.phone || '',
    date_of_birth: student.value.date_of_birth || '',
  }
  profileModalError.value = null
  showProfileEditModal.value = true
}

const closeProfileEditModal = () => {
  showProfileEditModal.value = false
  profileModalError.value = null
}

const saveProfileEditModal = async () => {
  if (!canEditSkaterProfile.value || !studentId.value) return
  const displayName = profileEditDraft.value.full_name.trim()
  if (!displayName) {
    profileModalError.value = language.value === 'es' ? 'El nombre es obligatorio.' : 'Name is required.'
    return
  }
  savingProfileModal.value = true
  profileModalError.value = null
  try {
    const nameParts = displayName.split(/\s+/).filter(Boolean)
    const dob = profileEditDraft.value.date_of_birth.trim() || null
    const age = dob ? computeAgeFromDob(dob) : null
    const payload = {
      full_name: displayName,
      first_name: nameParts[0] ?? null,
      last_name: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
      phone: profileEditDraft.value.phone.trim() || null,
      date_of_birth: dob,
      age,
      updated_at: new Date().toISOString(),
    }
    const { error } = await client.from('profiles').update(payload).eq('id', studentId.value)
    if (error) throw error
    if (student.value) Object.assign(student.value, payload)
    closeProfileEditModal()
  } catch (e: any) {
    profileModalError.value = e?.message || (language.value === 'es' ? 'No se pudo guardar' : 'Could not save')
  } finally {
    savingProfileModal.value = false
  }
}

const assignedProgramLabel = computed(() => {
  const name = assignedSkillGroup.value?.name
  return name ? normalizeSkillGroupDisplayName(name) : null
})

const assignedProgramId = computed(() => assignedSkillGroup.value?.id ?? null)

const canEditSkaterProfile = computed(() => userRole.value === 'admin' || userRole.value === 'coach')
const savingProfileField = ref<string | null>(null)
const profileSaveError = ref<string | null>(null)

const {
  uploadingAvatar,
  fileInputRef,
  onAvatarFileChange,
  openAvatarPicker,
  removeAvatar,
} = useSkaterAvatarUpload(student, { subjectUserId: studentId })

const skaterInitial = computed(() =>
  (student.value?.full_name || '?').trim().charAt(0).toUpperCase(),
)

const learnedSkillIds = computed(() => new Set(studentProgress.value.map(p => p.skill_id)))

const programMilestoneProgress = computed(() =>
  computeSkaterProgramMilestones(skills.value, learnedSkillIds.value),
)

const programTimelineFillWidth = computed(() => {
  const pct = programMilestoneProgress.value.totalPct
  // Track spans 10%–90% of container; fill proportional to overall progress.
  return `${Math.max(0, Math.min(80, (pct / 100) * 80))}%`
})

const milestoneNodeClass = (m: { phase: string }) => {
  if (m.phase === 'complete') {
    return 'bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.35)]'
  }
  if (m.phase === 'active') {
    return 'bg-amber-500/20 border-amber-400 text-amber-300 ring-2 ring-amber-400/25'
  }
  return 'bg-gray-800 border-gray-600 text-gray-500 opacity-70'
}

const milestoneStatusLabel = (
  m: { phase: string; learned: number },
  es: boolean,
) => {
  if (m.phase === 'complete') return es ? 'Hito' : 'Milestone'
  if (m.phase === 'active') return es ? 'En curso' : 'In progress'
  if (m.learned > 0) return es ? 'Extra' : 'Extra'
  return es ? 'Pendiente' : 'Upcoming'
}

const milestoneCountLabel = (m: {
  phase: string
  learned: number
  total: number
}) => {
  if (!m.total) return '—'
  if (m.phase === 'locked') {
    return m.learned > 0 ? `${m.learned}/${m.total}` : `0/${m.total}`
  }
  return `${m.learned}/${m.total}`
}

const milestoneCountClass = (m: { phase: string; learned: number }) => {
  if (m.phase === 'complete') return 'text-emerald-400'
  if (m.phase === 'active') return 'text-amber-400/90'
  if (m.learned > 0) return 'text-gray-500'
  return 'text-gray-600'
}

const saveSkaterProfileField = async (field: string, value: string | number | null) => {
  if (!canEditSkaterProfile.value || !studentId.value) return
  savingProfileField.value = field
  profileSaveError.value = null
  try {
    const { error } = await client
      .from('profiles')
      .update({ [field]: value })
      .eq('id', studentId.value)
    if (error) throw error
    if (student.value) student.value[field] = value
  } catch (e: any) {
    profileSaveError.value = e?.message || (language.value === 'es' ? 'No se pudo guardar' : 'Could not save')
    console.error(e)
  } finally {
    savingProfileField.value = null
  }
}

const setSkaterRating = async (key: string, value: number) => {
  if (!canEditSkaterProfile.value) return
  const current = student.value?.[key]
  const num = typeof current === 'number' ? current : parseInt(String(current ?? ''), 10)
  const next = Number.isFinite(num) && num === value ? Math.max(0, value - 1) : value
  await saveSkaterProfileField(key, next)
}

const setSkaterTrait = async (field: string, value: string | null) => {
  await saveSkaterProfileField(field, value)
}

// Achievements: trick slots = skills learned (challenge counts defined after unblockedTricks)
const trickSlotsEarned = computed(() => studentProgress.value.length)
const trickSlotsTotal = computed(() => Math.max(skills.value.length, 1))

const loadStudent = async () => {
  if (!studentId.value) return
  loading.value = true
  student.value = null
  try {
    const { data: profileData, error: profileError } = await client
      .from('profiles')
      .select('*')
      .eq('id', studentId.value)
      .single()
    if (profileError) {
      console.warn('Profile fetch error:', profileError)
    }
    student.value = profileData ?? null
    if (!student.value) {
      loading.value = false
      return
    }

    const id = studentId.value
    const [
      evalRes,
      countRes,
      skillsRes,
      progressRes,
      reservationsRes,
      attendanceRes,
    ] = await Promise.allSettled([
      client.from('student_evaluations').select('*').eq('student_id', id).order('evaluation_date', { ascending: false }).limit(1),
      client.from('student_evaluations').select('*', { count: 'exact', head: true }).eq('student_id', id),
      client.from('skills_library').select('*').eq('is_active', true).order('sort_order'),
      client.from('student_progress').select('*, skill:skills_library(*)').eq('student_id', id),
      client.from('class_reservations').select('*').eq('user_id', id).eq('status', 'active').order('reservation_date'),
      client.from('attendance').select('*').eq('student_id', id).order('class_date'),
    ])

    if (evalRes.status === 'fulfilled' && evalRes.value?.data?.[0]) lastEvaluation.value = evalRes.value.data[0]
    else lastEvaluation.value = null
    if (countRes.status === 'fulfilled' && countRes.value?.count != null) evaluationCount.value = countRes.value.count
    else evaluationCount.value = 0
    skills.value = skillsRes.status === 'fulfilled' ? (skillsRes.value?.data ?? []) : []
    studentProgress.value = progressRes.status === 'fulfilled' ? (progressRes.value?.data ?? []) : []
    studentReservations.value = reservationsRes.status === 'fulfilled' ? (reservationsRes.value?.data ?? []) : []
    studentAttendance.value = attendanceRes.status === 'fulfilled' ? (attendanceRes.value?.data ?? []) : []
    const { data: psRows } = await client.from('program_students').select('program_id').eq('student_id', id).limit(1)
    const pid = psRows?.[0]?.program_id as string | undefined
    if (pid) {
      const { data: pr } = await client.from('programs').select('name').eq('id', pid).maybeSingle()
      assignedProgramName.value = pr?.name ?? null
    } else {
      assignedProgramName.value = null
    }

    await loadProgramProgressForGroup()

    const { data: focusData } = await client
      .from('student_skill_focus')
      .select('*, skill:skills_library(*)')
      .eq('student_id', id)
      .in('status', ['assigned', 'pending', 'done'])
      .order('created_at', { ascending: false })
    skillFocusRows.value = focusData || []
  } catch (e) {
    console.error('Error loading student dashboard:', e)
  } finally {
    loading.value = false
  }
}

const assignTrickById = async (skillId: string) => {
  if (!studentId.value || assigningSkillId.value) return
  assigningSkillId.value = skillId
  focusError.value = null
  try {
    const { data, error } = await client
      .from('student_skill_focus')
      .insert({
        student_id: studentId.value,
        skill_id: skillId,
        assigned_by: user.value?.id ?? null,
        status: 'assigned',
      })
      .select('*')
      .single()
    if (error) {
      focusError.value =
        error.code === '23505'
          ? language.value === 'es'
            ? 'Ese truco ya está en la lista.'
            : 'That trick is already on the list.'
          : error.message
      return
    }
    if (data) {
      const skill = skills.value.find(s => s.id === skillId)
      skillFocusRows.value.unshift({ ...data, skill: skill ?? data.skill })
    }
  } catch (e: any) {
    focusError.value = e?.message || 'Error'
  } finally {
    assigningSkillId.value = null
  }
}

const cycleFocusStatus = async (focusId: string, current: string) => {
  const next = nextTrickBagStatus(current as SkaterTrickBagStatus)
  if (!next || updatingFocusId.value) return
  await updateSkillFocusStatus(focusId, next)
}

const updateFocusEta = async (focusId: string, targetDate: string) => {
  try {
    const { error } = await client
      .from('student_skill_focus')
      .update({ target_date: targetDate || null })
      .eq('id', focusId)
    if (error) throw error
    const row = skillFocusRows.value.find(f => f.id === focusId)
    if (row) row.target_date = targetDate || null
  } catch (e) {
    console.error(e)
  }
}

const openCommentModal = (focusRow: { id: string; coach_note?: string | null }) => {
  commentFocusId.value = focusRow.id
  commentDraft.value = focusRow.coach_note || ''
  commentModalOpen.value = true
}

const closeCommentModal = () => {
  commentModalOpen.value = false
  commentFocusId.value = null
  commentDraft.value = ''
}

const saveFocusComment = async () => {
  if (!commentFocusId.value) return
  savingComment.value = true
  try {
    const note = commentDraft.value.trim() || null
    const { error } = await client
      .from('student_skill_focus')
      .update({ coach_note: note })
      .eq('id', commentFocusId.value)
    if (error) throw error
    const row = skillFocusRows.value.find(f => f.id === commentFocusId.value)
    if (row) row.coach_note = note
    closeCommentModal()
  } catch (e) {
    console.error(e)
  } finally {
    savingComment.value = false
  }
}

const dismissSkillFocus = async (focusId: string) => {
  try {
    const { error } = await client
      .from('student_skill_focus')
      .update({ status: 'dismissed' })
      .eq('id', focusId)
    if (error) throw error
    skillFocusRows.value = skillFocusRows.value.filter(f => f.id !== focusId)
  } catch (e) {
    console.error(e)
  }
}

/** Undo mistaken completion — removes unlock and returns trick to Assign table. */
const undoCompletedTrick = async (skillId: string) => {
  if (!studentId.value || revertingSkillId.value) return
  const es = language.value === 'es'
  const skill = skills.value.find(s => s.id === skillId)
  const label = es ? skill?.name_es || skill?.name : skill?.name
  const msg = es
    ? `¿Quitar completado de «${label}»? El truco volverá a «Asignar truco».`
    : `Remove completed status for «${label}»? The trick will return to «Assign trick».`
  if (!confirm(msg)) return

  revertingSkillId.value = skillId
  focusError.value = null
  try {
    const { error: progErr } = await client
      .from('student_progress')
      .delete()
      .eq('student_id', studentId.value)
      .eq('skill_id', skillId)
    if (progErr) throw progErr
    studentProgress.value = studentProgress.value.filter(p => p.skill_id !== skillId)

    const focus = skillFocusRows.value.find(f => f.skill_id === skillId && f.status === 'done')
    if (focus) {
      const { error: focusErr } = await client
        .from('student_skill_focus')
        .delete()
        .eq('id', focus.id)
      if (focusErr) {
        const { error: dismissErr } = await client
          .from('student_skill_focus')
          .update({ status: 'dismissed', completed_at: null })
          .eq('id', focus.id)
        if (dismissErr) throw dismissErr
      }
      skillFocusRows.value = skillFocusRows.value.filter(f => f.id !== focus.id)
    }

    await loadProgramProgressForGroup()
  } catch (e: any) {
    focusError.value = e?.message || (es ? 'No se pudo deshacer' : 'Could not undo')
    console.error(e)
  } finally {
    revertingSkillId.value = null
  }
}

const updateSkillFocusStatus = async (focusId: string, status: SkaterTrickBagStatus) => {
  const row = skillFocusRows.value.find(f => f.id === focusId)
  if (!row) return

  updatingFocusId.value = focusId
  const prevStatus = row.status
  row.status = status
  if (status === 'done') row.completed_at = new Date().toISOString()

  try {
    const payload: Record<string, unknown> = { status }
    if (status === 'done') payload.completed_at = row.completed_at
    const { error } = await client
      .from('student_skill_focus')
      .update(payload)
      .eq('id', focusId)
    if (error) throw error

    if (status === 'done' && row.skill_id && studentId.value && !isSkillLearned(row.skill_id)) {
      const learnedAt = new Date().toISOString()
      const { error: progErr } = await client.from('student_progress').insert({
        student_id: studentId.value,
        skill_id: row.skill_id,
        proficiency: 3,
        learned_at: learnedAt,
      })
      if (!progErr) {
        const skill = row.skill || skills.value.find(s => s.id === row.skill_id)
        studentProgress.value.push({
          student_id: studentId.value,
          skill_id: row.skill_id,
          proficiency: 3,
          learned_at: learnedAt,
          skill,
        })
        await loadProgramProgressForGroup()
      }
    }
  } catch (e) {
    row.status = prevStatus
    if (status === 'done') row.completed_at = null
    console.error(e)
  } finally {
    updatingFocusId.value = null
  }
}

const focusBlockedSkillIds = computed(() =>
  skillFocusRows.value
    .filter(f => f.status === 'assigned' || f.status === 'pending' || f.status === 'done')
    .map(f => f.skill_id),
)

const activeTrickBag = computed(() =>
  [...skillFocusRows.value]
    .filter(f => f.status === 'assigned' || f.status === 'pending')
    .sort((a, b) => compareSkillsByManualId(a.skill || {}, b.skill || {})),
)

const unblockedTricks = computed(() =>
  [...studentProgress.value]
    .map(p => ({
      ...p,
      skill: p.skill || skills.value.find(s => s.id === p.skill_id),
    }))
    .filter(p => p.skill)
    .sort((a, b) => compareSkillsByManualId(a.skill, b.skill)),
)

const challengesCompleted = computed(() => unblockedTricks.value.length)
const challengesTotal = computed(() => Math.max(skills.value.length, 1))

const assignablePool = computed(() =>
  skills.value.filter(sk => !focusBlockedSkillIds.value.includes(sk.id)),
)

function matchesAssignFilters(sk: any): boolean {
  if (assignFilterStructure.value && skillStructure(sk) !== assignFilterStructure.value) return false
  if (assignFilterArea.value && sk.area !== assignFilterArea.value) return false
  if (assignFilterType.value && sk.trick_type !== assignFilterType.value) return false
  return true
}

const assignStructureOptions = computed(() => {
  const set = new Set<string>()
  for (const sk of assignablePool.value) {
    const structure = skillStructure(sk)
    if (structure) set.add(structure)
  }
  return [...set].sort(
    (a, b) =>
      SKATE_TRICK_STRUCTURES.indexOf(a as (typeof SKATE_TRICK_STRUCTURES)[number])
      - SKATE_TRICK_STRUCTURES.indexOf(b as (typeof SKATE_TRICK_STRUCTURES)[number]),
  )
})

const assignAreaOptions = computed(() => {
  const set = new Set<string>()
  for (const sk of assignablePool.value) {
    if (assignFilterStructure.value && skillStructure(sk) !== assignFilterStructure.value) continue
    if (sk.area) set.add(sk.area)
  }
  return [...set].sort(
    (a, b) =>
      SKATE_TRICK_AREAS.indexOf(a as (typeof SKATE_TRICK_AREAS)[number])
      - SKATE_TRICK_AREAS.indexOf(b as (typeof SKATE_TRICK_AREAS)[number]),
  )
})

const assignTypeOptions = computed(() => {
  const set = new Set<string>()
  for (const sk of assignablePool.value) {
    if (assignFilterStructure.value && skillStructure(sk) !== assignFilterStructure.value) continue
    if (assignFilterArea.value && sk.area !== assignFilterArea.value) continue
    if (sk.trick_type) set.add(sk.trick_type)
  }
  return [...set].sort(
    (a, b) =>
      SKATE_TRICK_TYPES.indexOf(a as (typeof SKATE_TRICK_TYPES)[number])
      - SKATE_TRICK_TYPES.indexOf(b as (typeof SKATE_TRICK_TYPES)[number]),
  )
})

const isSkillLearned = (skillId: string) =>
  studentProgress.value.some(p => p.skill_id === skillId)

const assignTrickTableRows = computed(() =>
  assignablePool.value
    .filter(sk => matchesAssignFilters(sk))
    .filter(sk => !isSkillLearned(sk.id))
    .sort(compareSkillsByManualId)
    .map(skill => ({ skill })),
)

const trickBagStatusClass = (status: string) => {
  if (status === 'assigned') return 'bg-sky-500/25 text-sky-300 border-sky-400/50 hover:bg-sky-500/35'
  if (status === 'pending') return 'bg-amber-500/25 text-amber-300 border-amber-400/50 hover:bg-amber-500/35'
  if (status === 'done') return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
  return 'bg-gray-700 text-gray-300 border-gray-600'
}

const goBack = () => router.push('/member/coach/students')

const goToEvaluations = () => navigateTo(`/member/coach/evaluations?student=${studentId.value}`)

const loadProgramProgressForGroup = async () => {
  assignedSkillGroup.value = null
  programSkillIds.value = []
  individualProgramPct.value = 0
  groupAveragePct.value = 0
  const gid = student.value?.skill_group_id as string | undefined
  const sid = studentId.value
  if (!gid || !sid) return

  const { data: grp } = await client.from('skill_groups').select('id,name,description').eq('id', gid).maybeSingle()
  if (grp) assignedSkillGroup.value = grp
  else assignedSkillGroup.value = null

  const { data: areas } = await client.from('skill_areas').select('id').eq('group_id', gid)
  const areaIds = (areas || []).map((a: { id: string }) => a.id)
  if (!areaIds.length) return

  const { data: areaSkills } = await client.from('area_skills').select('skill_id').in('area_id', areaIds)
  const ids = [...new Set((areaSkills || []).map((r: { skill_id: string }) => r.skill_id).filter(Boolean))]
  programSkillIds.value = ids
  if (!ids.length) return

  const learned = studentProgress.value.filter(p => ids.includes(p.skill_id)).length
  individualProgramPct.value = Math.round((learned / ids.length) * 100)

  const { data: peers } = await client
    .from('profiles')
    .select('id')
    .eq('role', 'customer')
    .eq('skill_group_id', gid)
    .neq('id', sid)

  const peerIds = (peers || []).map((p: { id: string }) => p.id)
  if (!peerIds.length) {
    groupAveragePct.value = individualProgramPct.value
    return
  }

  const { data: peerProg } = await client
    .from('student_progress')
    .select('student_id,skill_id')
    .in('student_id', peerIds)
    .in('skill_id', ids)

  const learnedByPeer: Record<string, number> = {}
  for (const row of peerProg || []) {
    const r = row as { student_id: string; skill_id: string }
    learnedByPeer[r.student_id] = (learnedByPeer[r.student_id] || 0) + 1
  }
  const pcts = peerIds.map((pid: string) => Math.round(((learnedByPeer[pid] || 0) / ids.length) * 100))
  groupAveragePct.value = Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)
}

type SkaterSchedule = { start?: string; end?: string; days?: number[] }

const skaterScheduleDisplay = computed(() => {
  const raw = student.value?.skater_schedule as SkaterSchedule | null | undefined
  if (!raw || typeof raw !== 'object') return null
  const days = Array.isArray(raw.days) ? raw.days : []
  const dayLabels =
    language.value === 'es'
      ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayStr = days
    .filter((d: number) => d >= 0 && d <= 6)
    .sort((a: number, b: number) => a - b)
    .map((d: number) => dayLabels[d])
    .join(', ')
  return {
    start: raw.start || '—',
    end: raw.end || '—',
    days: dayStr || (language.value === 'es' ? 'Sin días' : 'No days'),
  }
})

const calendarDays = computed(() => {
  const start = startOfMonth(calendarMonth.value)
  const end = endOfMonth(calendarMonth.value)
  const days = eachDayOfInterval({ start, end })
  const startPadding = getDay(start)
  const padded: (Date | null)[] = []
  for (let i = 0; i < startPadding; i++) padded.push(null)
  return [...padded, ...days]
})

const calendarMonthLabel = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  return format(calendarMonth.value, 'MMMM yyyy', { locale })
})

const dayLabels = computed(() =>
  language.value === 'es' ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
)

const hasReservation = (date: Date) =>
  studentReservations.value.some(r => r.reservation_date === format(date, 'yyyy-MM-dd'))

const getAttendanceForDate = (date: Date) =>
  studentAttendance.value.find(a => a.class_date === format(date, 'yyyy-MM-dd'))

const getDayStatus = (date: Date): 'attended' | 'missed' | 'upcoming' | 'reserved' | null => {
  const today = new Date()
  const dateStr = format(date, 'yyyy-MM-dd')
  const attendance = getAttendanceForDate(date)
  if (attendance) return attendance.attended ? 'attended' : 'missed'
  if (hasReservation(date)) {
    if (isBefore(date, today) && !isToday(date)) return 'missed'
    return isToday(date) ? 'reserved' : 'upcoming'
  }
  return null
}

const prevMonth = () => {
  const d = new Date(calendarMonth.value)
  d.setMonth(d.getMonth() - 1)
  calendarMonth.value = d
}

const nextMonth = () => {
  const d = new Date(calendarMonth.value)
  d.setMonth(d.getMonth() + 1)
  calendarMonth.value = d
}

const calendarStats = computed(() => ({
  attended: studentAttendance.value.filter(a => a.attended).length,
  missed: studentAttendance.value.filter(a => !a.attended).length,
  upcoming: studentReservations.value.filter(r => {
    const date = new Date(r.reservation_date)
    return isAfter(date, new Date()) || isToday(date)
  }).length
}))

const userRole = ref<string | null>(null)
onMounted(async () => {
  if (user.value) {
    const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
    userRole.value = data?.role ?? null
  }
  await loadStudent()
})

watch(studentId, () => loadStudent(), { immediate: false })
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Sticky back -->
    <header class="sticky top-0 z-40 bg-black/90 backdrop-blur border-b border-gray-800">
      <div class="px-4 py-3 max-w-lg lg:max-w-6xl xl:max-w-7xl mx-auto w-full flex items-center gap-3">
        <button
          @click="goBack"
          class="p-2 -ml-2 rounded-lg hover:bg-gray-800 transition-colors text-gray-300"
          aria-label="Back"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span class="text-sm text-gray-500">{{ language === 'es' ? 'Panel del patinador' : 'Skater dashboard' }}</span>
      </div>
    </header>

    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <div v-else-if="student" class="max-w-lg lg:max-w-6xl xl:max-w-7xl mx-auto w-full">
      <!-- Hero: name banner + profile photo -->
      <div class="relative px-4 pt-6 pb-4">
        <div class="flex items-stretch gap-3">
          <div
            class="flex-1 min-w-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-xl px-5 py-4 shadow-lg transition-shadow"
            :class="canEditSkaterProfile ? 'cursor-pointer hover:ring-2 hover:ring-white/25 active:scale-[0.995]' : ''"
            :role="canEditSkaterProfile ? 'button' : undefined"
            :tabindex="canEditSkaterProfile ? 0 : undefined"
            @click="canEditSkaterProfile ? openProfileEditModal() : undefined"
            @keydown.enter.prevent="canEditSkaterProfile ? openProfileEditModal() : undefined"
            @keydown.space.prevent="canEditSkaterProfile ? openProfileEditModal() : undefined"
          >
            <div class="flex items-start justify-between gap-2">
              <h1 class="text-xl font-black text-white uppercase tracking-tight truncate min-w-0">
                {{ student.full_name || (language === 'es' ? 'Alumno' : 'Student') }}
              </h1>
              <span
                v-if="canEditSkaterProfile"
                class="text-[9px] uppercase tracking-wide text-white/60 shrink-0 pt-0.5"
              >
                {{ language === 'es' ? 'Editar' : 'Edit' }}
              </span>
            </div>
            <p v-if="studentEmail" class="text-sm text-white/90 mt-0.5 truncate">{{ studentEmail }}</p>
            <p v-else class="text-sm text-white/60 mt-0.5 italic">
              {{ language === 'es' ? 'Sin email' : 'No email' }}
            </p>
            <p v-if="studentAgeDisplay" class="text-sm text-white/80 mt-0.5">{{ studentAgeDisplay }}</p>
            <p v-else class="text-sm text-white/60 mt-0.5 italic">
              {{ language === 'es' ? 'Sin edad' : 'No age' }}
            </p>
            <p class="text-sm mt-2 flex items-center gap-1.5 flex-wrap">
              <span class="text-white/75 shrink-0">
                {{ language === 'es' ? 'Programa asignado:' : 'Assigned program:' }}
              </span>
              <NuxtLink
                v-if="assignedProgramLabel && assignedProgramId"
                :to="`/member/coach/library/${assignedProgramId}`"
                class="font-semibold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white truncate"
                @click.stop
              >
                {{ assignedProgramLabel }}
              </NuxtLink>
              <span v-else class="text-white/70 italic">
                {{ language === 'es' ? 'Sin programa asignado' : 'No program assigned' }}
              </span>
            </p>
          </div>

          <div class="shrink-0 flex flex-col items-center justify-center">
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onAvatarFileChange"
            />
            <button
              type="button"
              class="relative w-[88px] h-[88px] sm:w-24 sm:h-24 rounded-xl overflow-hidden bg-gray-900 border-2 border-dashed border-white/30 flex items-center justify-center text-2xl transition-transform active:scale-[0.97] disabled:opacity-70"
              :class="canEditSkaterProfile ? 'hover:border-white/60 cursor-pointer' : 'cursor-default'"
              :disabled="uploadingAvatar || !canEditSkaterProfile"
              :aria-label="language === 'es' ? 'Foto del patinador' : 'Skater photo'"
              @click="canEditSkaterProfile ? openAvatarPicker() : undefined"
            >
              <img
                v-if="student.avatar_url"
                :src="student.avatar_url"
                alt=""
                class="w-full h-full object-cover"
              />
              <span v-else class="text-white/80 font-black text-3xl">{{ skaterInitial }}</span>
              <div
                v-if="uploadingAvatar"
                class="absolute inset-0 bg-black/55 flex items-center justify-center"
              >
                <svg class="w-7 h-7 animate-spin text-amber-300" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <span
                v-else-if="canEditSkaterProfile"
                class="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/70 text-xs flex items-center justify-center"
              >
                📷
              </span>
            </button>
            <button
              v-if="canEditSkaterProfile && student.avatar_url"
              type="button"
              class="text-[10px] text-red-300/90 hover:text-red-200 mt-1 underline"
              :disabled="uploadingAvatar"
              @click="removeAvatar"
            >
              {{ language === 'es' ? 'Quitar' : 'Remove' }}
            </button>
            <p
              v-else-if="canEditSkaterProfile"
              class="text-[10px] text-gray-500 mt-1 text-center max-w-[96px]"
            >
              {{ language === 'es' ? 'Subir foto' : 'Upload photo' }}
            </p>
          </div>
        </div>
      </div>

      <div class="px-4 space-y-6">
        <!-- Program progress + habilidades + postura/estilo/empuje (single compact card) -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="flex flex-col md:flex-row md:items-stretch gap-4 md:gap-0">
            <!-- Left: assigned program progress (50%) -->
            <div
              class="md:w-1/2 md:min-w-0 md:border-r border-gray-800 md:pr-5 pb-4 md:pb-0 border-b md:border-b-0"
            >
              <div class="flex items-center gap-2 mb-2">
                <span class="text-base" aria-hidden="true">📈</span>
                <h3 class="text-xs font-bold text-white uppercase tracking-wide leading-tight">
                  {{ language === 'es' ? 'Progreso en programa asignado' : 'Assigned program progress' }}
                </h3>
              </div>

              <template v-if="student.skill_group_id && assignedSkillGroup">
                <p class="text-[10px] text-gray-500 mb-3 leading-snug">
                  <span class="text-gray-300">{{ assignedProgramLabel || assignedSkillGroup.name }}</span>
                  ·
                  {{
                    language === 'es'
                      ? `${programSkillIds.length} skills`
                      : `${programSkillIds.length} skills`
                  }}
                </p>
                <div class="space-y-3">
                  <div class="space-y-1">
                    <div class="flex justify-between items-baseline gap-2">
                      <span class="text-[10px] text-gray-500">{{ language === 'es' ? 'Completados' : 'Completed' }}</span>
                      <span class="text-sm font-bold text-sky-400">{{ individualProgramPct }}%</span>
                    </div>
                    <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        class="h-full bg-sky-500 rounded-full transition-all"
                        :style="{ width: `${individualProgramPct}%` }"
                      />
                    </div>
                  </div>
                  <div class="space-y-1">
                    <div class="flex justify-between items-baseline gap-2">
                      <span class="text-[10px] text-gray-500 leading-tight">
                        {{ language === 'es' ? 'Promedio del grupo' : 'Group avg.' }}
                      </span>
                      <span class="text-sm font-bold text-indigo-300">{{ groupAveragePct }}%</span>
                    </div>
                    <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        class="h-full bg-indigo-500/90 rounded-full transition-all"
                        :style="{ width: `${groupAveragePct}%` }"
                      />
                    </div>
                  </div>
                </div>
                <p class="text-[9px] text-gray-600 mt-3 leading-snug">
                  {{
                    language === 'es'
                      ? 'Skills del programa marcados completados.'
                      : 'Assigned program skills marked completed.'
                  }}
                </p>
              </template>
              <p v-else class="text-[11px] text-gray-500 leading-snug">
                {{
                  language === 'es'
                    ? 'Sin programa asignado en Kanban. Arrastra al patinador a un nivel en Patinadores.'
                    : 'No program assigned in Kanban. Drag skater to a level in Skaters.'
                }}
              </p>
            </div>

            <!-- Right: habilidades + postura / estilo / empuje (50%) -->
            <div class="md:w-1/2 md:min-w-0 md:pl-5">
              <div class="flex items-center justify-between gap-2 mb-2">
                <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider">
                  {{ language === 'es' ? 'Habilidades' : 'Skill attributes' }}
                </h2>
                <span
                  v-if="canEditSkaterProfile"
                  class="text-[10px] uppercase tracking-wide text-amber-400/80"
                >
                  {{ language === 'es' ? 'Clic para editar' : 'Click to edit' }}
                </span>
              </div>

              <div class="space-y-1.5">
                <div
                  v-for="attr in skillAttributeDots"
                  :key="attr.key"
                  class="flex items-center justify-between gap-2"
                >
                  <span class="text-white text-xs font-medium w-[5rem] shrink-0 truncate">
                    {{ language === 'es' ? attr.labelEs : attr.label }}
                  </span>
                  <div class="flex gap-0.5 flex-1 justify-end">
                    <button
                      v-for="i in 10"
                      :key="i"
                      type="button"
                      class="w-2.5 h-2.5 rounded-full shrink-0 transition-all"
                      :class="[
                        skaterRatingBubbleClass(i - 1, attr.filled),
                        canEditSkaterProfile ? 'hover:scale-125 cursor-pointer' : 'cursor-default',
                        savingProfileField === attr.key ? 'opacity-50' : '',
                      ]"
                      :disabled="!canEditSkaterProfile || savingProfileField === attr.key"
                      :title="
                        canEditSkaterProfile
                          ? language === 'es'
                            ? `Nivel ${i}`
                            : `Level ${i}`
                          : undefined
                      "
                      @click="setSkaterRating(attr.key, i)"
                    />
                  </div>
                </div>
              </div>

              <div class="mt-3 pt-3 border-t border-gray-800">
                <p v-if="profileSaveError" class="text-[10px] text-red-400 mb-2">{{ profileSaveError }}</p>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <SkaterTraitPickerGroup
                    :label="language === 'es' ? 'Postura' : 'Stance'"
                    :options="SKATER_STANCE_OPTIONS"
                    :model-value="student.stance"
                    :editable="canEditSkaterProfile"
                    :saving="savingProfileField === 'stance'"
                    :es="language === 'es'"
                    @update:model-value="setSkaterTrait('stance', $event)"
                  />
                  <SkaterTraitPickerGroup
                    :label="language === 'es' ? 'Estilo' : 'Style'"
                    :options="SKATER_STYLE_OPTIONS"
                    :model-value="student.skating_style"
                    :editable="canEditSkaterProfile"
                    :saving="savingProfileField === 'skating_style'"
                    :es="language === 'es'"
                    @update:model-value="setSkaterTrait('skating_style', $event)"
                  />
                  <SkaterTraitPickerGroup
                    :label="language === 'es' ? 'Empuje' : 'Push'"
                    :options="SKATER_PUSH_OPTIONS"
                    :model-value="student.push_style"
                    :editable="canEditSkaterProfile"
                    :saving="savingProfileField === 'push_style'"
                    :es="language === 'es'"
                    @update:model-value="setSkaterTrait('push_style', $event)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Curriculum progress (completed tricks only — independent of Kanban assignment) -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="flex items-center justify-between gap-2 mb-1">
            <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              {{ language === 'es' ? 'Progreso del currículo' : 'Curriculum progress' }}
            </h2>
            <span class="text-lg font-bold text-amber-400">{{ programMilestoneProgress.totalPct }}%</span>
          </div>
          <p v-if="assignedProgramLabel" class="text-xs text-gray-400 mb-1">
            {{ language === 'es' ? 'Programa asignado (Kanban):' : 'Assigned program (Kanban):' }}
            <span class="text-gray-200 font-medium">{{ assignedProgramLabel }}</span>
          </p>
          <p class="text-xs text-gray-500 mb-5">
            {{
              language === 'es'
                ? `Avance por trucos completados · fase ${programMilestoneProgress.activeLevelNum} de 5`
                : `Based on completed tricks · phase ${programMilestoneProgress.activeLevelNum} of 5`
            }}
            <span class="block mt-0.5 text-gray-600">
              {{
                language === 'es'
                  ? 'El programa asignado no implica que ya completó ese nivel.'
                  : 'Assigned program does not mean that level is already completed.'
              }}
            </span>
          </p>

          <div class="relative px-1 pb-1 overflow-x-auto">
            <!-- Timeline track -->
            <div class="absolute left-[10%] right-[10%] top-[17px] h-0.5 bg-gray-700/80 rounded-full" aria-hidden="true" />
            <div
              class="absolute left-[10%] top-[17px] h-0.5 bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500 rounded-full transition-all duration-700 ease-out"
              :style="{ width: programTimelineFillWidth }"
              aria-hidden="true"
            />

            <ol class="relative flex justify-between items-start min-w-[280px] list-none m-0 p-0">
              <li
                v-for="m in programMilestoneProgress.milestones"
                :key="m.structure"
                class="flex flex-col items-center flex-1 min-w-0 z-10"
                :title="
                  (language === 'es' ? m.labelEs : m.labelEn)
                    + ' — '
                    + (language === 'es' ? m.descriptionEs : m.descriptionEn)
                "
              >
                <div
                  class="w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300"
                  :class="milestoneNodeClass(m)"
                >
                  <svg
                    v-if="m.phase === 'complete'"
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  <span v-else>{{ m.levelNum }}</span>
                </div>

                <p class="text-[10px] font-semibold text-gray-300 mt-2 text-center leading-tight px-0.5 max-w-[5rem]">
                  {{ language === 'es' ? m.shortLabelEs : m.shortLabelEn }}
                </p>
                <p
                  class="text-[10px] tabular-nums mt-0.5 font-medium"
                  :class="milestoneCountClass(m)"
                >
                  {{ milestoneCountLabel(m) }}
                </p>
                <p
                  class="text-[9px] uppercase tracking-wide mt-0.5"
                  :class="
                    m.phase === 'complete'
                      ? 'text-emerald-500/80'
                      : m.phase === 'active'
                        ? 'text-amber-500/70'
                        : m.learned > 0
                          ? 'text-gray-500'
                          : 'text-gray-600'
                  "
                >
                  {{ milestoneStatusLabel(m, language === 'es') }}
                </p>
              </li>
            </ol>
          </div>

          <p class="text-[11px] text-gray-500 mt-4 text-center">
            {{
              language === 'es'
                ? 'Solo cuenta trucos/ejercicios marcados completados. Orden: Fundamentos → … → Avanzado.'
                : 'Only marked completed tricks count. Order: Foundations → … → Advanced.'
            }}
          </p>
        </div>

        <!-- Progress & achievements (icon + label + bar + count) -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Desafíos completados' : 'Challenges completed' }}</p>
              <div class="h-2 bg-gray-800 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-amber-500/80 rounded-full transition-all" :style="{ width: `${(challengesCompleted / challengesTotal) * 100}%` }"></div>
              </div>
            </div>
            <span class="text-sm font-bold text-white shrink-0">{{ challengesCompleted }}/{{ challengesTotal }}</span>
          </div>
          <div
            v-if="unblockedTricks.length"
            class="ml-12 max-h-[360px] overflow-y-auto rounded-lg border border-gray-800/80 bg-gray-950/50 divide-y divide-gray-800/80"
          >
            <div
              v-for="row in unblockedTricks"
              :key="row.skill_id"
              class="flex items-center justify-between gap-2 px-3 py-2 text-xs"
            >
              <span class="text-gray-300 truncate">
                {{ language === 'es' ? row.skill?.name_es || row.skill?.name : row.skill?.name }}
              </span>
              <span class="text-gray-500 font-mono shrink-0">{{ trickManualLabel(row.skill) || '—' }}</span>
            </div>
          </div>
          <p v-else class="ml-12 text-xs text-gray-500">
            {{ language === 'es' ? 'Aún no hay desafíos completados.' : 'No completed challenges yet.' }}
          </p>
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Trucos aprendidos' : 'Trick slots earned' }}</p>
              <div class="h-2 bg-gray-800 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-amber-500/80 rounded-full transition-all" :style="{ width: `${Math.min(100, (trickSlotsEarned / trickSlotsTotal) * 100)}%` }"></div>
              </div>
            </div>
            <span class="text-sm font-bold text-white shrink-0">{{ trickSlotsEarned }}/{{ trickSlotsTotal }}</span>
          </div>
        </div>

        <!-- Trick bag (assigned / pending / done) -->
        <div class="bg-gray-900 border border-amber-500/30 rounded-xl p-4 lg:p-6 space-y-5 w-full min-w-0">
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-2">
              <span class="text-lg" aria-hidden="true">🎒</span>
              <h3 class="font-bold text-white text-lg">
                {{ language === 'es' ? 'Bolsa de trucos' : 'Trick bag' }}
              </h3>
            </div>
            <button
              type="button"
              class="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 hover:text-white"
              @click="goToEvaluations"
            >
              {{ language === 'es' ? 'Evaluar' : 'Evaluate' }}
            </button>
          </div>
          <p class="text-xs text-gray-500">
            {{
              language === 'es'
                ? 'Arriba: trucos completados. Abajo: asignados y en progreso. Usa + en la tabla para asignar; clic en el estado para avanzar (Asignado → En progreso → Completado).'
                : 'Top: completed tricks. Below: assigned and in progress. Use + in the table to assign; click status to advance (Assigned → In progress → Completed).'
            }}
          </p>

          <!-- Unlocked tricks / challenges -->
          <div class="space-y-2 min-w-0">
            <h4 class="text-sm font-semibold text-emerald-400">
              {{ language === 'es' ? 'Trucos / Desafíos desbloqueados' : 'Unlocked tricks / challenges' }}
              <span class="text-gray-500 font-normal">({{ unblockedTricks.length }})</span>
            </h4>
            <div class="overflow-x-auto rounded-lg border border-gray-800">
              <table class="w-full min-w-[640px] text-sm text-left">
                <thead class="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th class="px-3 py-2 font-medium w-12">#</th>
                    <th class="px-3 py-2 font-medium">{{ language === 'es' ? 'Truco' : 'Skill' }}</th>
                    <th class="px-3 py-2 font-medium">Program</th>
                    <th class="px-3 py-2 font-medium">Area</th>
                    <th class="px-3 py-2 font-medium">Type</th>
                    <th class="px-3 py-2 font-medium w-28">{{ language === 'es' ? 'Estado' : 'Status' }}</th>
                  </tr>
                </thead>
                <tbody v-if="unblockedTricks.length" class="divide-y divide-gray-800">
                  <tr
                    v-for="row in unblockedTricks"
                    :key="row.skill_id"
                    class="hover:bg-gray-800/40"
                  >
                    <td class="px-3 py-2 text-gray-500 font-mono text-xs">{{ trickManualLabel(row.skill) || '—' }}</td>
                    <td class="px-3 py-2 text-white font-medium max-w-[240px]">
                      <span class="block truncate">{{ language === 'es' ? row.skill?.name_es || row.skill?.name : row.skill?.name }}</span>
                      <div class="flex flex-wrap gap-1 mt-1">
                        <span v-if="row.skill?.area" class="px-1.5 py-0.5 rounded text-[10px]" :class="areaTagClass(row.skill.area)">{{ row.skill.area }}</span>
                        <span class="px-1.5 py-0.5 rounded text-[10px] capitalize" :class="difficultyTagClass(row.skill?.difficulty)">{{ row.skill?.difficulty }}</span>
                      </div>
                    </td>
                    <td class="px-3 py-2 text-gray-300 whitespace-nowrap">{{ skillStructure(row.skill) || '—' }}</td>
                    <td class="px-3 py-2 text-gray-300 whitespace-nowrap">{{ row.skill?.area || '—' }}</td>
                    <td class="px-3 py-2 text-gray-300 whitespace-nowrap">{{ row.skill?.trick_type || '—' }}</td>
                    <td class="px-3 py-2 whitespace-nowrap">
                      <div class="inline-flex items-center gap-1.5 flex-nowrap">
                        <span
                          class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold shrink-0"
                          :class="trickBagStatusClass('done')"
                        >
                          <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0" aria-hidden="true" />
                          {{ trickBagStatusLabel('done', language === 'es') }}
                        </span>
                        <button
                          type="button"
                          class="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-400/50 transition-colors disabled:opacity-40 shrink-0"
                          :disabled="revertingSkillId === row.skill_id"
                          :title="
                            language === 'es'
                              ? 'Quitar completado y volver a Asignar truco'
                              : 'Remove completed and return to Assign trick'
                          "
                          @click="undoCompletedTrick(row.skill_id)"
                        >
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
                <tbody v-else>
                  <tr>
                    <td colspan="6" class="px-3 py-6 text-center text-gray-500 text-sm">
                      {{ language === 'es' ? 'Aún no hay trucos desbloqueados.' : 'No unlocked tricks yet.' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Assigned + in progress -->
          <div class="space-y-3 min-w-0 border-t border-gray-800 pt-4">
            <h4 class="text-sm font-semibold text-amber-400">
              {{ language === 'es' ? 'Asignados y en progreso' : 'Assigned and in progress' }}
              <span class="text-gray-500 font-normal">({{ activeTrickBag.length }})</span>
            </h4>
            <div class="overflow-x-auto rounded-lg border border-gray-800">
              <table class="w-full min-w-[880px] text-sm text-left">
                <thead class="bg-gray-800/80 text-gray-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th class="px-3 py-2 font-medium w-12">#</th>
                    <th class="px-3 py-2 font-medium">{{ language === 'es' ? 'Truco' : 'Skill' }}</th>
                    <th class="px-3 py-2 font-medium">Program</th>
                    <th class="px-3 py-2 font-medium">Area</th>
                    <th class="px-3 py-2 font-medium">Type</th>
                    <th class="px-3 py-2 font-medium w-36">ETA</th>
                    <th
                      class="px-3 py-2 font-medium w-32 cursor-help"
                      :title="trickBagStatusFlowHint(language === 'es')"
                    >
                      {{ language === 'es' ? 'Estado' : 'Status' }}
                    </th>
                    <th class="px-3 py-2 font-medium w-24 text-right">{{ language === 'es' ? 'Notas' : 'Comments' }}</th>
                  </tr>
                </thead>
                <tbody v-if="activeTrickBag.length" class="divide-y divide-gray-800">
                  <tr
                    v-for="f in activeTrickBag"
                    :key="f.id"
                    class="hover:bg-gray-800/40"
                  >
                    <td class="px-3 py-2 text-gray-500 font-mono text-xs">{{ trickManualLabel(f.skill) || '—' }}</td>
                    <td class="px-3 py-2 text-white font-medium max-w-[200px]">
                      <span class="block truncate">{{ language === 'es' ? f.skill?.name_es || f.skill?.name : f.skill?.name }}</span>
                      <div class="flex flex-wrap gap-1 mt-1">
                        <span v-if="f.skill?.area" class="px-1.5 py-0.5 rounded text-[10px]" :class="areaTagClass(f.skill.area)">{{ f.skill.area }}</span>
                        <span class="px-1.5 py-0.5 rounded text-[10px] capitalize" :class="difficultyTagClass(f.skill?.difficulty)">{{ f.skill?.difficulty }}</span>
                      </div>
                    </td>
                    <td class="px-3 py-2 text-gray-300 whitespace-nowrap">{{ skillStructure(f.skill) || '—' }}</td>
                    <td class="px-3 py-2 text-gray-300 whitespace-nowrap">{{ f.skill?.area || '—' }}</td>
                    <td class="px-3 py-2 text-gray-300 whitespace-nowrap">{{ f.skill?.trick_type || '—' }}</td>
                    <td class="px-3 py-2">
                      <input
                        type="date"
                        :value="f.target_date || ''"
                        class="w-full min-w-[120px] px-2 py-1 rounded bg-gray-900 border border-gray-700 text-white text-xs"
                        @change="updateFocusEta(f.id, ($event.target as HTMLInputElement).value)"
                      />
                    </td>
                    <td class="px-3 py-2">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-semibold transition-colors disabled:opacity-50"
                        :class="trickBagStatusClass(f.status)"
                        :title="trickBagStatusNextHint(f.status, language === 'es')"
                        :disabled="updatingFocusId === f.id"
                        @click="cycleFocusStatus(f.id, f.status)"
                      >
                        <span
                          v-if="f.status === 'assigned'"
                          class="w-2 h-2 rounded-full bg-sky-400 shrink-0"
                          aria-hidden="true"
                        />
                        <span
                          v-else-if="f.status === 'pending'"
                          class="w-2 h-2 rounded-full bg-amber-400 shrink-0"
                          aria-hidden="true"
                        />
                        <span
                          v-else-if="f.status === 'done'"
                          class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                          aria-hidden="true"
                        />
                        {{ trickBagStatusLabel(f.status, language === 'es') }}
                      </button>
                    </td>
                    <td class="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        class="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors"
                        :class="f.coach_note ? 'border-amber-500/50 text-amber-300 bg-amber-500/10' : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'"
                        @click="openCommentModal(f)"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {{ f.coach_note ? (language === 'es' ? 'Ver' : 'View') : (language === 'es' ? 'Nota' : 'Note') }}
                      </button>
                      <button
                        type="button"
                        class="ml-1 text-xs text-gray-600 hover:text-flame-500"
                        :title="language === 'es' ? 'Quitar' : 'Remove'"
                        @click="dismissSkillFocus(f.id)"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                </tbody>
                <tbody v-else>
                  <tr>
                    <td colspan="8" class="px-3 py-6 text-center text-gray-500 text-sm">
                      {{ language === 'es' ? 'No hay trucos asignados ni en progreso.' : 'No assigned or in-progress tricks.' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Assign trick table -->
          <div class="space-y-3 min-w-0 border-t border-gray-800 pt-4">
            <div>
              <h4 class="text-sm font-semibold text-amber-400">
                {{ language === 'es' ? 'Asignar truco' : 'Assign trick' }}
              </h4>
              <p class="text-xs text-gray-500 mt-1">
                {{
                  language === 'es'
                    ? 'Filtra por Program, Area o Type (Todas = todos los trucos). Pulsa + para asignar.'
                    : 'Filter by Program, Area, or Type (All = every trick). Press + to assign.'
                }}
              </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div class="min-w-0">
                <label class="block text-xs text-gray-500 mb-1">Program</label>
                <select
                  v-model="assignFilterStructure"
                  class="w-full min-w-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
                >
                  <option value="">{{ language === 'es' ? 'Todas' : 'All' }}</option>
                  <option v-for="opt in assignStructureOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <div class="min-w-0">
                <label class="block text-xs text-gray-500 mb-1">Area</label>
                <select
                  v-model="assignFilterArea"
                  class="w-full min-w-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
                >
                  <option value="">{{ language === 'es' ? 'Todas' : 'All' }}</option>
                  <option v-for="opt in assignAreaOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
              <div class="min-w-0">
                <label class="block text-xs text-gray-500 mb-1">Type</label>
                <select
                  v-model="assignFilterType"
                  class="w-full min-w-0 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
                >
                  <option value="">{{ language === 'es' ? 'Todos' : 'All' }}</option>
                  <option v-for="opt in assignTypeOptions" :key="opt" :value="opt">{{ opt }}</option>
                </select>
              </div>
            </div>

            <div class="overflow-x-auto overflow-y-auto max-h-[440px] rounded-lg border border-gray-800">
              <table class="w-full min-w-[880px] text-sm text-left">
                <thead class="sticky top-0 z-10 bg-gray-800/95 backdrop-blur-sm text-gray-400 text-xs uppercase tracking-wide">
                  <tr>
                    <th class="px-3 py-2 font-medium w-12">#</th>
                    <th class="px-3 py-2 font-medium">{{ language === 'es' ? 'Truco' : 'Skill' }}</th>
                    <th class="px-3 py-2 font-medium">Program</th>
                    <th class="px-3 py-2 font-medium">Area</th>
                    <th class="px-3 py-2 font-medium">Type</th>
                    <th
                      class="px-3 py-2 font-medium w-32 cursor-help"
                      :title="trickBagStatusFlowHint(language === 'es')"
                    >
                      {{ language === 'es' ? 'Estado' : 'Status' }}
                    </th>
                  </tr>
                </thead>
                <tbody v-if="assignTrickTableRows.length" class="divide-y divide-gray-800">
                  <tr
                    v-for="row in assignTrickTableRows"
                    :key="row.skill.id"
                    class="hover:bg-gray-800/40"
                  >
                    <td class="px-3 py-2 text-gray-500 font-mono text-xs">{{ trickManualLabel(row.skill) || '—' }}</td>
                    <td class="px-3 py-2 text-white font-medium max-w-[200px]">
                      <span class="block truncate">{{ language === 'es' ? row.skill.name_es || row.skill.name : row.skill.name }}</span>
                    </td>
                    <td class="px-3 py-2 text-gray-300 whitespace-nowrap">{{ skillStructure(row.skill) || '—' }}</td>
                    <td class="px-3 py-2 text-gray-300 whitespace-nowrap">{{ row.skill.area || '—' }}</td>
                    <td class="px-3 py-2 text-gray-300 whitespace-nowrap">{{ row.skill.trick_type || '—' }}</td>
                    <td class="px-3 py-2">
                      <button
                        type="button"
                        class="inline-flex items-center justify-center w-8 h-8 rounded-full border border-sky-400/60 text-sky-400 hover:bg-sky-500/20 transition-colors disabled:opacity-40"
                        :disabled="assigningSkillId === row.skill.id"
                        :title="trickBagStatusNextHint(null, language === 'es')"
                        @click="assignTrickById(row.skill.id)"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                </tbody>
                <tbody v-else>
                  <tr>
                    <td colspan="6" class="px-3 py-8 text-center text-gray-500 text-sm">
                      {{
                        assignablePool.length === 0
                          ? (language === 'es' ? 'No hay trucos disponibles para asignar.' : 'No tricks available to assign.')
                          : (language === 'es' ? 'Sin trucos con estos filtros.' : 'No tricks match these filters.')
                      }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="focusError" class="text-sm text-flame-500">{{ focusError }}</p>
          </div>
        </div>

        <!-- Preferred schedule (set by admin) -->
        <div v-if="skaterScheduleDisplay" class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 class="font-bold text-white mb-3 flex items-center gap-2">
            <span>🗓️</span>
            {{ language === 'es' ? 'Horario preferido' : 'Preferred schedule' }}
          </h3>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p class="text-gray-500 text-xs">{{ language === 'es' ? 'Inicio' : 'Start' }}</p>
              <p class="text-white font-semibold">{{ skaterScheduleDisplay.start }}</p>
            </div>
            <div>
              <p class="text-gray-500 text-xs">{{ language === 'es' ? 'Fin' : 'End' }}</p>
              <p class="text-white font-semibold">{{ skaterScheduleDisplay.end }}</p>
            </div>
            <div class="col-span-2">
              <p class="text-gray-500 text-xs">{{ language === 'es' ? 'Días' : 'Days' }}</p>
              <p class="text-gray-300">{{ skaterScheduleDisplay.days }}</p>
            </div>
          </div>
        </div>

      <!-- Attendance calendar -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h3 class="font-bold text-white mb-3 flex items-center gap-2">
          <span>📅</span>
          {{ language === 'es' ? 'Calendario de Asistencia' : 'Attendance Calendar' }}
        </h3>
        <div class="grid grid-cols-3 gap-2 mb-4">
          <div class="bg-glass-green/20 rounded-lg p-2 text-center">
            <p class="text-xl font-bold text-glass-green">{{ calendarStats.attended }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Asistió' : 'Attended' }}</p>
          </div>
          <div class="bg-flame-600/20 rounded-lg p-2 text-center">
            <p class="text-xl font-bold text-flame-600">{{ calendarStats.missed }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Faltó' : 'Missed' }}</p>
          </div>
          <div class="bg-glass-blue/20 rounded-lg p-2 text-center">
            <p class="text-xl font-bold text-glass-blue">{{ calendarStats.upcoming }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Próximas' : 'Upcoming' }}</p>
          </div>
        </div>
        <div class="flex items-center justify-between mb-3">
          <button @click="prevMonth" class="p-2 bg-gray-800 rounded-lg hover:bg-gray-700">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h4 class="font-semibold text-white capitalize">{{ calendarMonthLabel }}</h4>
          <button @click="nextMonth" class="p-2 bg-gray-800 rounded-lg hover:bg-gray-700">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
        <div class="grid grid-cols-7 gap-1 mb-1">
          <div v-for="day in dayLabels" :key="day" class="text-center text-[10px] text-gray-500 font-medium py-1">{{ day }}</div>
        </div>
        <div class="grid grid-cols-7 gap-1">
          <div
            v-for="(day, index) in calendarDays"
            :key="index"
            class="aspect-square flex items-center justify-center rounded-lg text-xs relative"
            :class="{
              'bg-glass-green text-white font-bold': day && getDayStatus(day) === 'attended',
              'bg-flame-600 text-white font-bold': day && getDayStatus(day) === 'missed',
              'bg-glass-blue text-white font-bold': day && getDayStatus(day) === 'upcoming',
              'bg-gold-400 text-black font-bold ring-2 ring-gold-400/50': day && getDayStatus(day) === 'reserved',
              'bg-gray-800 text-gray-400': day && !getDayStatus(day),
              'ring-2 ring-white/30': day && isToday(day),
            }"
          >
            <span v-if="day">{{ format(day, 'd') }}</span>
            <span
              v-if="day && getDayStatus(day)"
              class="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px]"
            >
              {{ getDayStatus(day) === 'attended' ? '✓' : getDayStatus(day) === 'missed' ? '✗' : getDayStatus(day) === 'upcoming' ? '○' : '●' }}
            </span>
          </div>
        </div>
        <div class="flex items-center justify-center gap-4 mt-3 text-[10px]">
          <div class="flex items-center gap-1"><span class="w-3 h-3 bg-glass-green rounded" /><span class="text-gray-400">{{ language === 'es' ? 'Asistió' : 'Attended' }}</span></div>
          <div class="flex items-center gap-1"><span class="w-3 h-3 bg-flame-600 rounded" /><span class="text-gray-400">{{ language === 'es' ? 'Faltó' : 'Missed' }}</span></div>
          <div class="flex items-center gap-1"><span class="w-3 h-3 bg-glass-blue rounded" /><span class="text-gray-400">{{ language === 'es' ? 'Próxima' : 'Upcoming' }}</span></div>
          <div class="flex items-center gap-1"><span class="w-3 h-3 bg-gold-400 rounded" /><span class="text-gray-400">{{ language === 'es' ? 'Hoy' : 'Today' }}</span></div>
        </div>
      </div>

    </div>
    </div>

    <div v-else class="px-4 py-12 text-center">
      <p class="text-gray-400">{{ language === 'es' ? 'Alumno no encontrado' : 'Student not found' }}</p>
      <button @click="goBack" class="mt-4 text-gold-400 hover:underline">
        {{ language === 'es' ? 'Volver a patinadores' : 'Back to skaters' }}
      </button>
    </div>

    <!-- Trick comment modal -->
    <div
      v-if="commentModalOpen"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70"
      @click.self="closeCommentModal"
    >
      <div class="w-full max-w-md rounded-xl bg-gray-900 border border-gray-700 shadow-xl p-4 space-y-3">
        <div class="flex items-center justify-between gap-2">
          <h3 class="text-white font-semibold">
            {{ language === 'es' ? 'Comentario del truco' : 'Trick comment' }}
          </h3>
          <button
            type="button"
            class="text-gray-500 hover:text-white p-1"
            @click="closeCommentModal"
          >
            ×
          </button>
        </div>
        <textarea
          v-model="commentDraft"
          rows="4"
          class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm resize-y min-h-[96px]"
          :placeholder="language === 'es' ? 'Escribe una nota para este truco…' : 'Write a note for this trick…'"
        />
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white"
            @click="closeCommentModal"
          >
            {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-lg bg-amber-500 text-black text-sm font-bold disabled:opacity-50"
            :disabled="savingComment"
            @click="saveFocusComment"
          >
            {{ savingComment ? '…' : (language === 'es' ? 'Guardar' : 'Save') }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit skater profile (hero card) -->
  <Teleport to="body">
    <div
      v-if="showProfileEditModal"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
    >
      <div class="absolute inset-0 bg-black/80" @click="closeProfileEditModal" />
      <div class="relative bg-gray-900 border border-gray-800 rounded-t-2xl sm:rounded-2xl p-6 max-w-md w-full shadow-2xl">
        <h3 class="text-lg font-bold text-white mb-1">
          {{ language === 'es' ? 'Editar perfil del patinador' : 'Edit skater profile' }}
        </h3>
        <p v-if="studentEmail" class="text-xs text-gray-500 mb-4 truncate">{{ studentEmail }}</p>

        <form class="space-y-4" @submit.prevent="saveProfileEditModal">
          <div>
            <label class="block text-xs text-gray-500 mb-1">
              {{ language === 'es' ? 'Nombre completo' : 'Full name' }}
            </label>
            <input
              v-model="profileEditDraft.full_name"
              type="text"
              required
              class="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:border-amber-400 outline-none"
            />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">
              {{ language === 'es' ? 'Teléfono' : 'Phone' }}
            </label>
            <input
              v-model="profileEditDraft.phone"
              type="tel"
              class="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:border-amber-400 outline-none"
            />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">
              {{ language === 'es' ? 'Fecha de nacimiento' : 'Date of birth' }}
            </label>
            <input
              v-model="profileEditDraft.date_of_birth"
              type="date"
              class="w-full px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:border-amber-400 outline-none [color-scheme:dark]"
            />
            <p v-if="profileEditAgePreview != null" class="text-xs text-gray-500 mt-1">
              {{
                language === 'es'
                  ? `Edad: ${profileEditAgePreview} años`
                  : `Age: ${profileEditAgePreview} years old`
              }}
            </p>
          </div>

          <p v-if="profileModalError" class="text-xs text-red-400">{{ profileModalError }}</p>

          <div class="flex gap-3 pt-1">
            <button
              type="button"
              class="flex-1 py-2.5 rounded-xl bg-gray-800 text-white text-sm font-semibold"
              :disabled="savingProfileModal"
              @click="closeProfileEditModal"
            >
              {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
            </button>
            <button
              type="submit"
              class="flex-1 py-2.5 rounded-xl bg-amber-500 text-black text-sm font-bold disabled:opacity-50"
              :disabled="savingProfileModal"
            >
              {{ savingProfileModal ? '…' : (language === 'es' ? 'Guardar' : 'Save') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
