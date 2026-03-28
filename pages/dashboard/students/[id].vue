<script setup lang="ts">
import { format, isToday, isTuesday, isThursday, isSaturday, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, isAfter } from 'date-fns'
import { es } from 'date-fns/locale'

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

const studentLocation = computed(() => {
  const s = student.value
  if (!s) return ''
  if (s.city) return s.city
  if (s.email) return s.email.replace(/.*@/, '').replace(/\.(com|local)$/, '') || '—'
  return '—'
})

const stanceDisplay = computed(() => student.value?.stance || '—')
const styleDisplay = computed(() => student.value?.skating_style || '—')
const pushStyleDisplay = computed(() => student.value?.push_style || '—')

// Achievements: challenges = evaluations count, trick slots = skills learned, boards/gear placeholders
const challengesCompleted = computed(() => evaluationCount.value)
const challengesTotal = 21
const trickSlotsEarned = computed(() => studentProgress.value.length)
const trickSlotsTotal = computed(() => Math.max(skills.value.length, 1))
const boardsEarned = 0
const boardsTotal = 9
const gearEarned = 0
const gearTotal = 2

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
  } catch (e) {
    console.error('Error loading student dashboard:', e)
  } finally {
    loading.value = false
  }
}

const goBack = () => router.push('/dashboard/students')

const goToEvaluations = () => navigateTo(`/coach/evaluations?student=${studentId.value}`)

const isSkillLearned = (skillId: string) =>
  studentProgress.value.some(p => p.skill_id === skillId)

const toggleSkill = async (skillId: string) => {
  if (!studentId.value) return
  try {
    if (isSkillLearned(skillId)) {
      await client
        .from('student_progress')
        .delete()
        .eq('student_id', studentId.value)
        .eq('skill_id', skillId)
    } else {
      await client
        .from('student_progress')
        .insert({
          student_id: studentId.value,
          skill_id: skillId,
          proficiency: 3,
          learned_at: new Date().toISOString()
        })
    }
    await loadStudent()
  } catch (e) {
    console.error('Error toggling skill:', e)
  }
}

const EXCLUDE_CATEGORY_FROM_PROFILE = 'excercise' // Do not show Excercise section on student profiles

const skillsByCategory = computed(() => {
  const grouped: Record<string, any[]> = {}
  skills.value.forEach(s => {
    const cat = (s.category || '').toLowerCase()
    if (cat === EXCLUDE_CATEGORY_FROM_PROFILE) return
    if (!grouped[s.category]) grouped[s.category] = []
    grouped[s.category].push(s)
  })
  return grouped
})

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

const user = useSupabaseUser()
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
      <div class="px-4 py-3 max-w-lg mx-auto flex items-center gap-3">
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

    <div v-else-if="student" class="max-w-lg mx-auto">
      <!-- Hero: name banner + location (Tony Hawk–style) -->
      <div class="relative px-4 pt-6 pb-4">
        <div class="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-xl px-5 py-4 shadow-lg">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 flex-1">
              <h1 class="text-xl font-black text-white uppercase tracking-tight truncate">
                {{ student.full_name || (language === 'es' ? 'Alumno' : 'Student') }}
              </h1>
              <p class="text-sm text-white/90 mt-0.5 truncate">{{ studentLocation }}</p>
            </div>
          </div>
        </div>
      </div>

      <div class="px-4 space-y-6">
        <!-- Skill attributes: 10-dot progression per attribute -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            {{ language === 'es' ? 'Habilidades' : 'Skill attributes' }}
          </h2>
          <div class="space-y-3">
            <div
              v-for="attr in skillAttributeDots"
              :key="attr.key"
              class="flex items-center justify-between gap-3"
            >
              <span class="text-white text-sm font-medium w-28 shrink-0">
                {{ language === 'es' ? attr.labelEs : attr.label }}
              </span>
              <div class="flex gap-0.5 flex-1 justify-end">
                <span
                  v-for="i in 10"
                  :key="i"
                  class="w-2 h-2 rounded-full shrink-0 transition-colors"
                  :class="i <= attr.filled
                    ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                    : 'bg-gray-700'"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Stance, Style, Push (skater details) -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="grid grid-cols-1 gap-2 text-sm">
            <div class="flex justify-between text-gray-300">
              <span class="text-gray-500">{{ language === 'es' ? 'Postura' : 'Stance' }}</span>
              <span class="font-medium capitalize">{{ stanceDisplay }}</span>
            </div>
            <div class="flex justify-between text-gray-300">
              <span class="text-gray-500">{{ language === 'es' ? 'Estilo' : 'Style' }}</span>
              <span class="font-medium capitalize">{{ styleDisplay }}</span>
            </div>
            <div class="flex justify-between text-gray-300">
              <span class="text-gray-500">{{ language === 'es' ? 'Empuje' : 'Push style' }}</span>
              <span class="font-medium capitalize">{{ pushStyleDisplay }}</span>
            </div>
          </div>
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
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6z" /></svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Tablas exclusivas' : 'Exclusive boards earned' }}</p>
              <div class="h-2 bg-gray-800 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-amber-500/80 rounded-full transition-all" :style="{ width: `${(boardsEarned / boardsTotal) * 100}%` }"></div>
              </div>
            </div>
            <span class="text-sm font-bold text-white shrink-0">{{ boardsEarned }}/{{ boardsTotal }}</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" /></svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Equipo exclusivo' : 'Exclusive gear earned' }}</p>
              <div class="h-2 bg-gray-800 rounded-full overflow-hidden mt-1">
                <div class="h-full bg-amber-500/80 rounded-full transition-all" :style="{ width: `${(gearEarned / gearTotal) * 100}%` }"></div>
              </div>
            </div>
            <span class="text-sm font-bold text-white shrink-0">{{ gearEarned }}/{{ gearTotal }}</span>
          </div>
        </div>

        <!-- Overall progress bar (compact) -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="flex justify-between text-sm mb-2">
            <span class="text-gray-400">{{ language === 'es' ? 'Progreso general' : 'Overall progress' }}</span>
            <span class="text-amber-400 font-bold">{{ skills.length > 0 ? Math.round((studentProgress.length / skills.length) * 100) : 0 }}%</span>
          </div>
          <div class="h-3 bg-gray-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all"
              :style="{ width: skills.length > 0 ? `${(studentProgress.length / skills.length) * 100}%` : '0%' }"
            ></div>
          </div>
        </div>

        <!-- Program / level progress vs group average -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <div class="flex items-center gap-2">
            <span class="text-lg" aria-hidden="true">📈</span>
            <h3 class="font-bold text-white">
              {{ language === 'es' ? 'Progreso del programa (nivel)' : 'Program progress (level)' }}
            </h3>
          </div>
          <p v-if="assignedProgramName" class="text-xs text-gray-500">
            {{ language === 'es' ? 'Programa asignado:' : 'Assigned program:' }}
            <span class="text-gray-300">{{ assignedProgramName }}</span>
          </p>
          <p v-if="!student.skill_group_id" class="text-sm text-gray-500">
            {{
              language === 'es'
                ? 'Sin nivel asignado. Un admin puede asignarte un grupo en Gestión de patinadores.'
                : 'No level assigned yet. An admin can assign a program group in Skater management.'
            }}
          </p>
          <template v-else>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-2">
                <div class="flex justify-between items-baseline gap-2">
                  <span class="text-xs text-gray-500">{{ language === 'es' ? 'Progreso individual' : 'Individual progress' }}</span>
                  <span class="text-lg font-bold text-sky-400">{{ individualProgramPct }}%</span>
                </div>
                <div class="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-sky-500 rounded-full transition-all"
                    :style="{ width: `${individualProgramPct}%` }"
                  />
                </div>
              </div>
              <div class="space-y-2">
                <div class="flex justify-between items-baseline gap-2">
                  <span class="text-xs text-gray-500 leading-tight">
                    {{
                      language === 'es' ? 'Promedio del grupo' : 'Group average'
                    }}
                    <span v-if="assignedSkillGroup?.name" class="block text-[10px] text-gray-600 mt-0.5">
                      ({{ assignedSkillGroup.name }})
                    </span>
                  </span>
                  <span class="text-lg font-bold text-indigo-300">{{ groupAveragePct }}%</span>
                </div>
                <div class="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-indigo-500/90 rounded-full transition-all"
                    :style="{ width: `${groupAveragePct}%` }"
                  />
                </div>
              </div>
            </div>
            <p class="text-[11px] text-gray-600">
              {{
                language === 'es'
                  ? `Basado en ${programSkillIds.length} skills del nivel en el programa.`
                  : `Based on ${programSkillIds.length} skills in this level track.`
              }}
            </p>
          </template>
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

      <!-- Skills by category -->
      <div v-for="(categorySkills, category) in skillsByCategory" :key="category" class="mb-4">
        <h3 class="font-bold text-white mb-2 capitalize flex items-center gap-2">
          <span>{{ category }}</span>
          <span class="text-sm text-gray-500">({{ categorySkills.filter(s => isSkillLearned(s.id)).length }}/{{ categorySkills.length }})</span>
        </h3>
        <div class="space-y-1">
          <button
            v-for="skill in categorySkills"
            :key="skill.id"
            @click="toggleSkill(skill.id)"
            class="w-full p-3 rounded-lg flex items-center gap-3 transition-all"
            :class="isSkillLearned(skill.id) ? 'bg-glass-green/20 border border-glass-green/50' : 'bg-gray-900 border border-gray-800'"
          >
            <div
              class="w-6 h-6 rounded-full flex items-center justify-center"
              :class="isSkillLearned(skill.id) ? 'bg-glass-green' : 'bg-gray-800'"
            >
              <svg v-if="isSkillLearned(skill.id)" class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </div>
            <span class="flex-1 text-left" :class="isSkillLearned(skill.id) ? 'text-white' : 'text-gray-400'">
              {{ language === 'es' ? skill.name_es || skill.name : skill.name }}
            </span>
            <span
              class="px-2 py-0.5 rounded text-xs"
              :class="{
                'bg-green-500/20 text-green-400': skill.difficulty === 'beginner',
                'bg-yellow-500/20 text-yellow-400': skill.difficulty === 'intermediate',
                'bg-red-500/20 text-red-400': skill.difficulty === 'advanced'
              }"
            >
              {{ skill.difficulty }}
            </span>
          </button>
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
  </div>
</template>
