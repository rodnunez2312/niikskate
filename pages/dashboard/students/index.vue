<script setup lang="ts">
import { format, isToday, isTuesday, isThursday, isSaturday, addDays, formatDistanceToNow, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, isAfter, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

// State
const activeTab = ref<'attendance' | 'students'>('students')
const loading = ref(true)
const students = ref<any[]>([])
const todayReservations = ref<any[]>([])
const selectedDate = ref(new Date())
const selectedSession = ref<'early' | 'late'>('early')
const searchQuery = ref('')
const attendanceMarked = ref<Record<string, boolean>>({})
const attendanceConfirmed = ref<{ early: boolean; late: boolean }>({ early: false, late: false })
const reportSentAt = ref<string | null>(null)

// Guest registration
const showGuestModal = ref(false)
const guestForm = ref({
  full_name: '',
  email: '',
  phone: '',
  session: 'early' as 'early' | 'late',
})
const savingGuest = ref(false)
const guestAdded = ref(false)

// Send invite modal
const showInviteModal = ref(false)
const invitePhone = ref('')
const sendingInvite = ref(false)
const inviteSent = ref(false)

// Roster for quick add
const rosterSearchQuery = ref('')
const addingStudent = ref<string | null>(null)
const studentCredits = ref<Record<string, any>>({})
const studentAttendanceStats = ref<Record<string, { total: number, attended: number }>>({})
const guestStudents = ref<any[]>([]) // Students added from roster today

// Skills for progress tracking
const skills = ref<any[]>([])
const selectedStudent = ref<any>(null)
const studentProgress = ref<any[]>([])

// Progress areas (first-level division of Progress tab)
export type ProgressAreaId = 'functional' | 'skate_iq' | 'street' | 'park'
const selectedProgressArea = ref<ProgressAreaId | null>(null)
const progressAreas: { id: ProgressAreaId; label: string; labelEs: string; icon: string; color: string }[] = [
  { id: 'functional', label: 'Functional / Strength training', labelEs: 'Funcional / Fuerza', icon: '💪', color: 'from-amber-500/20 to-orange-600/20 border-amber-500/40 hover:border-amber-400/60' },
  { id: 'skate_iq', label: 'Skate IQ (fundamentals)', labelEs: 'Skate IQ (fundamentos)', icon: '🧠', color: 'from-blue-500/20 to-indigo-600/20 border-blue-500/40 hover:border-blue-400/60' },
  { id: 'street', label: 'Street', labelEs: 'Street', icon: '🛹', color: 'from-emerald-500/20 to-teal-600/20 border-emerald-500/40 hover:border-emerald-400/60' },
  { id: 'park', label: 'Park', labelEs: 'Park', icon: '🏟️', color: 'from-rose-500/20 to-pink-600/20 border-rose-500/40 hover:border-rose-400/60' },
]
const studentPayments = ref<any[]>([])

// Student calendar data
const studentReservations = ref<any[]>([])
const studentAttendance = ref<any[]>([])
const calendarMonth = ref(new Date())

// Coach/admin: last evaluation date per student (student_id -> evaluation_date)
const lastEvaluationByStudent = ref<Record<string, string>>({})
const userRole = ref<string | null>(null)

onMounted(async () => {
  if (user.value) {
    const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
    userRole.value = data?.role ?? null
  }
  await Promise.all([fetchStudents(), fetchReservations(), fetchStudentCredits(), fetchAttendanceStats()])
  await fetchLastEvaluations()
})

const isCoachOrAdmin = computed(() => userRole.value === 'coach' || userRole.value === 'admin')

const fetchStudents = async () => {
  try {
    const { data } = await client
      .from('profiles')
      .select('*')
      .eq('role', 'customer')
      .eq('is_active', true)
      .order('full_name')
    
    students.value = data || []
  } catch (e) {
    console.error('Error fetching students:', e)
  }
}

// Fetch active credits for all students
const fetchStudentCredits = async () => {
  try {
    const { data } = await client
      .from('user_credits')
      .select('*')
      .gte('remaining_credits', 1)
      .gte('expiration_date', new Date().toISOString())
    
    studentCredits.value = {}
    data?.forEach(credit => {
      if (!studentCredits.value[credit.user_id] || credit.remaining_credits > studentCredits.value[credit.user_id].remaining_credits) {
        studentCredits.value[credit.user_id] = credit
      }
    })
  } catch (e) {
    console.error('Error fetching credits:', e)
  }
}

// Fetch attendance stats for all students
const fetchAttendanceStats = async () => {
  try {
    const { data } = await client
      .from('attendance')
      .select('student_id, attended')
    
    studentAttendanceStats.value = {}
    data?.forEach(record => {
      if (!studentAttendanceStats.value[record.student_id]) {
        studentAttendanceStats.value[record.student_id] = { total: 0, attended: 0 }
      }
      studentAttendanceStats.value[record.student_id].total++
      if (record.attended) {
        studentAttendanceStats.value[record.student_id].attended++
      }
    })
  } catch (e) {
    console.error('Error fetching attendance stats:', e)
  }
}

// Fetch latest evaluation date per student (for coach/admin)
const fetchLastEvaluations = async () => {
  try {
    const { data } = await client
      .from('student_evaluations')
      .select('student_id, evaluation_date')
      .order('evaluation_date', { ascending: false })
    const map: Record<string, string> = {}
    data?.forEach((row: { student_id: string; evaluation_date: string }) => {
      if (row.student_id && !(row.student_id in map)) {
        map[row.student_id] = row.evaluation_date
      }
    })
    lastEvaluationByStudent.value = map
  } catch (e) {
    console.warn('Could not fetch last evaluations:', e)
  }
}

// Check if student has active credit for today
const hasActiveCredit = (studentId: string) => {
  return !!studentCredits.value[studentId]
}

// Get student credit info
const getStudentCredit = (studentId: string) => {
  return studentCredits.value[studentId]
}

// Get attendance rate for a student
const getAttendanceRate = (studentId: string) => {
  const stats = studentAttendanceStats.value[studentId]
  if (!stats || stats.total === 0) return null
  return Math.round((stats.attended / stats.total) * 100)
}

// Reservations for both time slots
const earlyReservations = ref<any[]>([])
const lateReservations = ref<any[]>([])

const fetchReservations = async () => {
  loading.value = true
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    console.log('Fetching reservations for date:', dateStr)
    
    // Fetch BOTH time slots - using user_id to join profiles
    const { data: earlyData, error: earlyError } = await client
      .from('class_reservations')
      .select(`
        *,
        user:user_id(id, full_name, email, phone)
      `)
      .eq('reservation_date', dateStr)
      .eq('time_slot', 'early')
      .eq('status', 'active')
    
    console.log('Early reservations:', earlyData, 'Error:', earlyError)
    
    const { data: lateData, error: lateError } = await client
      .from('class_reservations')
      .select(`
        *,
        user:user_id(id, full_name, email, phone)
      `)
      .eq('reservation_date', dateStr)
      .eq('time_slot', 'late')
      .eq('status', 'active')
    
    console.log('Late reservations:', lateData, 'Error:', lateError)
    
    earlyReservations.value = earlyData || []
    lateReservations.value = lateData || []
    todayReservations.value = [...(earlyData || []), ...(lateData || [])]
    
    // Fetch existing attendance for BOTH slots
    const { data: attendanceData } = await client
      .from('attendance')
      .select('student_id, attended, time_slot')
      .eq('class_date', dateStr)
    
    attendanceMarked.value = {}
    attendanceData?.forEach(a => {
      attendanceMarked.value[`${a.student_id}_${a.time_slot}`] = a.attended
    })

    // Fetch whether each session is confirmed (locked) for this date
    try {
      const { data: confirmedData } = await client
        .from('attendance_confirmed')
        .select('time_slot')
        .eq('class_date', dateStr)
      const confirmed = { early: false, late: false }
      confirmedData?.forEach((row: { time_slot: string }) => {
        if (row.time_slot === 'early') confirmed.early = true
        if (row.time_slot === 'late') confirmed.late = true
      })
      attendanceConfirmed.value = confirmed
    } catch {
      attendanceConfirmed.value = { early: false, late: false }
    }

    // Fetch when report was sent for this date (timestamp for Confirmado)
    try {
      const { data: sentData } = await client
        .from('attendance_report_sent')
        .select('sent_at')
        .eq('class_date', dateStr)
        .single()
      reportSentAt.value = sentData?.sent_at ?? null
    } catch {
      reportSentAt.value = null
    }
  } catch (e) {
    console.error('Error fetching reservations:', e)
  } finally {
    loading.value = false
  }
}

const fetchSkills = async () => {
  try {
    const { data } = await client
      .from('skills_library')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    
    skills.value = data || []
  } catch (e) {
    console.error('Error fetching skills:', e)
  }
}

const fetchStudentProgress = async (studentId: string) => {
  try {
    // Fetch progress
    const { data } = await client
      .from('student_progress')
      .select(`
        *,
        skill:skills_library(*)
      `)
      .eq('student_id', studentId)
    
    studentProgress.value = data || []
    
    // Fetch payments/credits for timeline
    const { data: credits } = await client
      .from('user_credits')
      .select('*')
      .eq('user_id', studentId)
      .order('purchase_date', { ascending: true })
    
    studentPayments.value = credits || []
    
    // Fetch reservations for calendar
    const { data: reservations } = await client
      .from('class_reservations')
      .select('*')
      .eq('user_id', studentId)
      .eq('status', 'active')
      .order('reservation_date')
    
    studentReservations.value = reservations || []
    
    // Fetch attendance history for calendar
    const { data: attendance } = await client
      .from('attendance')
      .select('*')
      .eq('student_id', studentId)
      .order('class_date')
    
    studentAttendance.value = attendance || []
  } catch (e) {
    console.error('Error fetching progress:', e)
  }
}

// Toggle attendance - now takes time_slot parameter
const toggleAttendance = async (studentId: string, timeSlot: 'early' | 'late', attended: boolean) => {
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    
    // Upsert attendance record
    const { error } = await client
      .from('attendance')
      .upsert({
        student_id: studentId,
        class_date: dateStr,
        time_slot: timeSlot,
        attended,
        marked_at: new Date().toISOString()
      }, {
        onConflict: 'student_id,class_date,time_slot'
      })
    
    if (!error) {
      attendanceMarked.value[`${studentId}_${timeSlot}`] = attended
    }
  } catch (e) {
    console.error('Error marking attendance:', e)
  }
}

// Check if attendance is marked for student + slot
const isAttendanceMarked = (studentId: string, timeSlot: 'early' | 'late') => {
  return attendanceMarked.value[`${studentId}_${timeSlot}`] || false
}

// Per-session present counts (for display in each card)
const earlyPresentCount = computed(() =>
  earlyReservations.value.filter((r: any) => isAttendanceMarked(r.user?.id, 'early')).length
)
const latePresentCount = computed(() =>
  lateReservations.value.filter((r: any) => isAttendanceMarked(r.user?.id, 'late')).length
)

// Confirm assistance for a session (locks attendance; toggle on)
const confirmingSlot = ref<'early' | 'late' | null>(null)
const confirmAttendance = async (timeSlot: 'early' | 'late') => {
  confirmingSlot.value = timeSlot
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    await client.from('attendance_confirmed').upsert(
      {
        class_date: dateStr,
        time_slot: timeSlot,
        confirmed_by: user.value?.id ?? null,
      },
      { onConflict: 'class_date,time_slot' }
    )
    attendanceConfirmed.value = { ...attendanceConfirmed.value, [timeSlot]: true }
  } catch (e) {
    console.error('Error confirming attendance:', e)
  } finally {
    confirmingSlot.value = null
  }
}

// Unconfirm a session (toggle off; makes it editable again)
const unconfirmAttendance = async (timeSlot: 'early' | 'late') => {
  confirmingSlot.value = timeSlot
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    await client.from('attendance_confirmed').delete().eq('class_date', dateStr).eq('time_slot', timeSlot)
    attendanceConfirmed.value = { ...attendanceConfirmed.value, [timeSlot]: false }
  } catch (e) {
    console.error('Error unconfirming attendance:', e)
  } finally {
    confirmingSlot.value = null
  }
}

// Clear all students from this session's assistance list for the selected date
const clearingSlot = ref<'early' | 'late' | null>(null)
const clearSession = async (timeSlot: 'early' | 'late') => {
  if (!confirm(language.value === 'es' ? '¿Quitar a todos los alumnos de esta sesión?' : 'Remove all students from this session?')) return
  clearingSlot.value = timeSlot
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    await client.from('class_reservations').delete().eq('reservation_date', dateStr).eq('time_slot', timeSlot)
    await fetchReservations()
  } catch (e) {
    console.error('Error clearing session:', e)
  } finally {
    clearingSlot.value = null
  }
}

// Save and send final roster (persists sent_at for this date)
const savingAndSending = ref(false)
const saveAndSendReport = async () => {
  if (reportSentAt.value) return
  savingAndSending.value = true
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    const { error } = await client.from('attendance_report_sent').upsert(
      {
        class_date: dateStr,
        sent_at: new Date().toISOString(),
        sent_by: user.value?.id ?? null,
      },
      { onConflict: 'class_date', ignoreDuplicates: true }
    )
    if (error) throw error
    const { data: sentData } = await client
      .from('attendance_report_sent')
      .select('sent_at')
      .eq('class_date', dateStr)
      .single()
    reportSentAt.value = sentData?.sent_at ?? null
  } catch (e) {
    console.error('Error saving/sending report:', e)
  } finally {
    savingAndSending.value = false
  }
}

const formatReportSentAt = (iso: string | null) => {
  if (!iso) return ''
  const locale = language.value === 'es' ? es : undefined
  return format(new Date(iso), 'd MMM yyyy, HH:mm', { locale })
}

const router = useRouter()

// Navigate to Student Dashboard (skater profile page)
const openStudentDashboard = (student: any) => {
  if (!student?.id) return
  navigateTo(`/dashboard/students/${student.id}`)
}

// Select student for progress view (used when loading progress data)
const selectStudent = async (student: any) => {
  selectedStudent.value = student
  await fetchStudentProgress(student.id)
}

// Check if skill is learned
const isSkillLearned = (skillId: string) => {
  return studentProgress.value.some(p => p.skill_id === skillId)
}

// Get skill proficiency
const getSkillProficiency = (skillId: string) => {
  const progress = studentProgress.value.find(p => p.skill_id === skillId)
  return progress?.proficiency || 0
}

// Toggle skill for student
const toggleSkill = async (skillId: string) => {
  if (!selectedStudent.value) return
  
  try {
    if (isSkillLearned(skillId)) {
      // Remove skill
      await client
        .from('student_progress')
        .delete()
        .eq('student_id', selectedStudent.value.id)
        .eq('skill_id', skillId)
    } else {
      // Add skill
      await client
        .from('student_progress')
        .insert({
          student_id: selectedStudent.value.id,
          skill_id: skillId,
          proficiency: 3,
          learned_at: new Date().toISOString()
        })
    }
    
    await fetchStudentProgress(selectedStudent.value.id)
  } catch (e) {
    console.error('Error toggling skill:', e)
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
  fetchReservations()
}

const nextDate = () => {
  let newDate = addDays(selectedDate.value, 1)
  while (!isClassDay(newDate)) {
    newDate = addDays(newDate, 1)
  }
  selectedDate.value = newDate
  fetchReservations()
}

// Filter students by search
const filteredStudents = computed(() => {
  if (!searchQuery.value) return students.value
  const query = searchQuery.value.toLowerCase()
  return students.value.filter(s => 
    s.full_name?.toLowerCase().includes(query) ||
    s.email?.toLowerCase().includes(query)
  )
})

// Group skills by category
const skillsByCategory = computed(() => {
  const grouped: Record<string, any[]> = {}
  skills.value.forEach(skill => {
    if (!grouped[skill.category]) {
      grouped[skill.category] = []
    }
    grouped[skill.category].push(skill)
  })
  return grouped
})

// Progress timeline combining payments and skill progress
const progressTimeline = computed(() => {
  const timeline: any[] = []
  
  // Add payments to timeline
  studentPayments.value.forEach(payment => {
    // Calculate progress at time of payment
    const paymentDate = new Date(payment.purchase_date)
    const skillsAtTime = studentProgress.value.filter(p => 
      new Date(p.learned_at || p.created_at) <= paymentDate
    ).length
    
    timeline.push({
      date: payment.purchase_date,
      type: 'payment',
      title: payment.credit_type?.replace(/_/g, ' ').toUpperCase() || 'Paquete',
      description: `${payment.total_credits} ${language.value === 'es' ? 'clases' : 'classes'}`,
      skills_count: skillsAtTime,
      progress_percentage: skills.value.length > 0 ? Math.round((skillsAtTime / skills.value.length) * 100) : 0
    })
  })
  
  // Add skill milestones (every 5 skills)
  const sortedProgress = [...studentProgress.value].sort((a, b) => 
    new Date(a.learned_at || a.created_at).getTime() - new Date(b.learned_at || b.created_at).getTime()
  )
  
  sortedProgress.forEach((progress, index) => {
    if ((index + 1) % 5 === 0) {
      timeline.push({
        date: progress.learned_at || progress.created_at,
        type: 'milestone',
        title: `${index + 1} ${language.value === 'es' ? 'trucos aprendidos' : 'tricks learned'}`,
        description: `${language.value === 'es' ? 'Último:' : 'Latest:'} ${progress.skill?.name || 'Unknown'}`,
        skills_count: index + 1,
        progress_percentage: skills.value.length > 0 ? Math.round(((index + 1) / skills.value.length) * 100) : 0
      })
    }
  })
  
  // Sort by date
  return timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

// Format timeline date
const formatTimelineDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const locale = language.value === 'es' ? es : undefined
  return format(date, 'd MMM yyyy', { locale })
}

// Calendar helpers
const calendarDays = computed(() => {
  const start = startOfMonth(calendarMonth.value)
  const end = endOfMonth(calendarMonth.value)
  const days = eachDayOfInterval({ start, end })
  
  // Add padding for start of week
  const startPadding = getDay(start)
  const paddedDays: (Date | null)[] = []
  for (let i = 0; i < startPadding; i++) {
    paddedDays.push(null)
  }
  
  return [...paddedDays, ...days]
})

const calendarMonthLabel = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  return format(calendarMonth.value, 'MMMM yyyy', { locale })
})

const dayLabels = computed(() => {
  return language.value === 'es' 
    ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
})

// Check if date has a reservation
const hasReservation = (date: Date) => {
  const dateStr = format(date, 'yyyy-MM-dd')
  return studentReservations.value.some(r => r.reservation_date === dateStr)
}

// Check if date has attendance record
const getAttendanceForDate = (date: Date) => {
  const dateStr = format(date, 'yyyy-MM-dd')
  return studentAttendance.value.find(a => a.class_date === dateStr)
}

// Get day status for calendar
const getDayStatus = (date: Date): 'attended' | 'missed' | 'upcoming' | 'reserved' | null => {
  const today = new Date()
  const dateStr = format(date, 'yyyy-MM-dd')
  
  // Check attendance first (for past dates)
  const attendance = getAttendanceForDate(date)
  if (attendance) {
    return attendance.attended ? 'attended' : 'missed'
  }
  
  // Check if has reservation
  const hasRes = hasReservation(date)
  if (hasRes) {
    if (isBefore(date, today) && !isToday(date)) {
      return 'missed' // Past reservation with no attendance = missed
    }
    return isToday(date) ? 'reserved' : 'upcoming'
  }
  
  return null
}

// Navigate calendar
const prevMonth = () => {
  const newDate = new Date(calendarMonth.value)
  newDate.setMonth(newDate.getMonth() - 1)
  calendarMonth.value = newDate
}

const nextMonth = () => {
  const newDate = new Date(calendarMonth.value)
  newDate.setMonth(newDate.getMonth() + 1)
  calendarMonth.value = newDate
}

// Calendar stats
const calendarStats = computed(() => {
  const attended = studentAttendance.value.filter(a => a.attended).length
  const missed = studentAttendance.value.filter(a => !a.attended).length
  const upcoming = studentReservations.value.filter(r => {
    const date = new Date(r.reservation_date)
    return isAfter(date, new Date()) || isToday(date)
  }).length
  
  return { attended, missed, upcoming }
})

// Selected slot for adding from roster
const addToSlot = ref<'early' | 'late'>('early')

// Get roster students not already reserved, sorted by those with credits first
const rosterStudents = computed(() => {
  const reservedIds = todayReservations.value.map(r => r.user?.id)
  let filtered = students.value.filter(s => !reservedIds.includes(s.id))
  
  if (rosterSearchQuery.value) {
    const query = rosterSearchQuery.value.toLowerCase()
    filtered = filtered.filter(s => 
      s.full_name?.toLowerCase().includes(query) ||
      s.email?.toLowerCase().includes(query)
    )
  }
  
  // Sort: students with credits first
  return filtered.sort((a, b) => {
    const aHasCredit = hasActiveCredit(a.id)
    const bHasCredit = hasActiveCredit(b.id)
    if (aHasCredit && !bHasCredit) return -1
    if (!aHasCredit && bHasCredit) return 1
    return a.full_name.localeCompare(b.full_name)
  })
})

// Students with active credits who could come today
const studentsWithCredits = computed(() => {
  return students.value.filter(s => hasActiveCredit(s.id))
})

// Check if student is already in a given time slot (so we can allow adding to one or both sessions)
const isStudentInSlot = (studentId: string, timeSlot: 'early' | 'late') => {
  const list = timeSlot === 'early' ? earlyReservations.value : lateReservations.value
  return list.some((r: any) => (r.user_id || r.user?.id) === studentId)
}

// Pending roster selection: which slots the user has selected (before OK) per student
const pendingRosterSlots = ref<Record<string, ('early' | 'late')[]>>({})

const isPendingSlot = (studentId: string, timeSlot: 'early' | 'late') =>
  (pendingRosterSlots.value[studentId] || []).includes(timeSlot)

const hasPendingSlots = (studentId: string) =>
  (pendingRosterSlots.value[studentId]?.length || 0) > 0

const togglePendingSlot = (studentId: string, timeSlot: 'early' | 'late') => {
  if (isStudentInSlot(studentId, timeSlot)) return
  const current = pendingRosterSlots.value[studentId] || []
  const next = current.includes(timeSlot)
    ? current.filter(s => s !== timeSlot)
    : [...current, timeSlot]
  pendingRosterSlots.value = { ...pendingRosterSlots.value, [studentId]: next }
}

// Confirm roster selection: create reservations for selected slots and move to attendance above
const confirmRosterSelection = async (student: any) => {
  const slots = pendingRosterSlots.value[student.id] || []
  if (slots.length === 0) return
  addingStudent.value = student.id
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    for (const timeSlot of slots) {
      if (isStudentInSlot(student.id, timeSlot)) continue
      await client.from('class_reservations').insert({
        user_id: student.id,
        reservation_date: dateStr,
        time_slot: timeSlot,
        status: 'active',
        notes: 'Added from roster (walk-in)'
      })
    }
    pendingRosterSlots.value = { ...pendingRosterSlots.value, [student.id]: [] }
    await fetchReservations()
  } catch (e) {
    console.error('Error adding student to class:', e)
  } finally {
    addingStudent.value = null
  }
}

// Add student from roster to today's class (single slot; used if we need it elsewhere)
const addStudentToClass = async (student: any, timeSlot: 'early' | 'late') => {
  if (isStudentInSlot(student.id, timeSlot)) return
  addingStudent.value = student.id
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    await client
      .from('class_reservations')
      .insert({
        user_id: student.id,
        reservation_date: dateStr,
        time_slot: timeSlot,
        status: 'active',
        notes: 'Added from roster (walk-in)'
      })
    await fetchReservations()
  } catch (e) {
    console.error('Error adding student to class:', e)
  } finally {
    addingStudent.value = null
  }
}

// Remove student from a session (delete reservation for that slot)
const removingReservationId = ref<string | null>(null)
const removeFromSession = async (reservationId: string) => {
  removingReservationId.value = reservationId
  try {
    await client.from('class_reservations').delete().eq('id', reservationId)
    await fetchReservations()
  } catch (e) {
    console.error('Error removing from session:', e)
  } finally {
    removingReservationId.value = null
  }
}

// Add guest to current class
const addGuest = async () => {
  if (!guestForm.value.full_name) return
  
  savingGuest.value = true
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    
    // Create a guest booking entry
    await client
      .from('guest_bookings')
      .insert({
        full_name: guestForm.value.full_name,
        email: guestForm.value.email || null,
        phone: guestForm.value.phone || null,
        booking_data: {
          date: dateStr,
          session: guestForm.value.session,
          class_type: 'guest',
          class_name: 'Guest Drop-in',
          is_guest: true
        }
      })
    
    guestAdded.value = true
    setTimeout(() => {
      showGuestModal.value = false
      guestAdded.value = false
      guestForm.value = { full_name: '', email: '', phone: '', session: 'early' }
    }, 1500)
    
    // Refresh reservations
    await fetchReservations()
  } catch (e) {
    console.error('Error adding guest:', e)
  } finally {
    savingGuest.value = false
  }
}

// Send registration invite via WhatsApp
const sendInvite = () => {
  if (!invitePhone.value) return
  
  sendingInvite.value = true
  
  // Format phone number (remove non-digits)
  const phone = invitePhone.value.replace(/\D/g, '')
  
  // Create WhatsApp message with registration link
  const message = encodeURIComponent(
    language.value === 'es'
      ? `¡Hola! 🛹 Te invitamos a registrarte en NiikSkate Academy. Regístrate aquí: ${window.location.origin}/auth/register`
      : `Hey! 🛹 You're invited to join NiikSkate Academy. Register here: ${window.location.origin}/auth/register`
  )
  
  // Open WhatsApp
  window.open(`https://wa.me/${phone}?text=${message}`, '_blank')
  
  inviteSent.value = true
  setTimeout(() => {
    showInviteModal.value = false
    inviteSent.value = false
    invitePhone.value = ''
    sendingInvite.value = false
  }, 1500)
}

// Format student start date
const formatStartDate = (dateStr: string) => {
  if (!dateStr) return language.value === 'es' ? 'Sin fecha' : 'No date'
  const date = new Date(dateStr)
  const locale = language.value === 'es' ? es : undefined
  return formatDistanceToNow(date, { addSuffix: true, locale })
}

// Last evaluation label for a student
const getLastEvaluationLabel = (studentId: string) => {
  const dateStr = lastEvaluationByStudent.value[studentId]
  if (!dateStr) return language.value === 'es' ? 'Nunca' : 'Never'
  const locale = language.value === 'es' ? es : undefined
  return format(new Date(dateStr), 'd MMM yyyy', { locale })
}

const navigateToNewEvaluation = (studentId: string) => {
  navigateTo(`/coach/evaluations?student=${studentId}`)
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4 pt-safe pb-4">
      <div class="max-w-lg mx-auto pt-4">
        <h1 class="text-2xl font-bold text-white mb-4">
          {{ language === 'es' ? 'Patinadores' : 'Skaters' }}
        </h1>
        
        <!-- Tabs: Skaters (main), Asistencia at the end -->
        <div class="flex gap-2">
          <button
            @click="activeTab = 'students'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'students' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Patinadores' : 'Skaters' }}
          </button>
          <button
            @click="activeTab = 'attendance'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'attendance' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Asistencia' : 'Attendance' }}
          </button>
        </div>
      </div>
    </header>

    <div class="px-4 max-w-lg mx-auto">
      <!-- Attendance Tab -->
      <div v-if="activeTab === 'attendance'" class="py-4">
        <!-- Date Selector -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <div class="flex items-center justify-between">
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
        </div>

        <!-- Loading -->
        <div v-if="loading" class="py-8 text-center">
          <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
        </div>

        <!-- Both Time Slots Side by Side -->
        <div v-else>
          <div class="grid grid-cols-2 gap-3">
            <!-- 5:30 PM - 7:00 PM Class -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div class="bg-gold-400 px-3 py-2 text-center">
                <span class="font-bold text-black text-sm">5:30 - 7:00</span>
                <span class="block text-black/70 text-xs">{{ earlyReservations.length }} {{ language === 'es' ? 'alumnos' : 'students' }}</span>
                <span class="block text-black/80 text-xs mt-0.5">
                  {{ language === 'es' ? 'Presentes:' : 'Present:' }} <strong>{{ earlyPresentCount }}</strong>
                </span>
              </div>
              <div class="p-2 border-b border-gray-800">
                <button
                  type="button"
                  @click="guestForm.session = 'early'; showGuestModal = true"
                  class="w-full py-2 rounded-lg bg-glass-green/20 text-glass-green font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-glass-green/30 transition-colors"
                >
                  <span>➕</span>
                  {{ language === 'es' ? 'Invitado' : 'Guest' }}
                </button>
              </div>
              
              <div v-if="earlyReservations.length === 0" class="p-3 text-center">
                <p class="text-gray-500 text-xs">{{ language === 'es' ? 'Sin reservas' : 'No reservations' }}</p>
              </div>
              
              <div v-else class="divide-y divide-gray-800 max-h-64 overflow-y-auto">
                <div
                  v-for="res in earlyReservations"
                  :key="res.id"
                  class="flex items-center gap-2 p-2"
                  :class="isAttendanceMarked(res.user?.id, 'early') ? 'bg-glass-green/10' : ''"
                >
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-gold-400 to-glass-orange flex items-center justify-center text-xs font-bold text-black shrink-0">
                    {{ res.user?.full_name?.charAt(0)?.toUpperCase() || '?' }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-white text-xs truncate">{{ res.user?.full_name || 'Unknown' }}</p>
                  </div>
                  <button
                    v-if="!attendanceConfirmed.early"
                    @click="toggleAttendance(res.user?.id, 'early', !isAttendanceMarked(res.user?.id, 'early'))"
                    class="w-7 h-7 rounded-md flex items-center justify-center transition-all shrink-0"
                    :class="isAttendanceMarked(res.user?.id, 'early') ? 'bg-glass-green text-white' : 'bg-gray-800 text-gray-500'"
                    :title="language === 'es' ? 'Presente' : 'Present'"
                  >
                    <svg v-if="isAttendanceMarked(res.user?.id, 'early')" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span v-else class="text-sm">○</span>
                  </button>
                  <div v-else class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-glass-green" :title="language === 'es' ? 'Asistencia confirmada' : 'Attendance confirmed'">
                    <svg v-if="isAttendanceMarked(res.user?.id, 'early')" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span v-else class="text-gray-500 text-xs">—</span>
                  </div>
                  <button
                    v-if="!attendanceConfirmed.early"
                    @click="removeFromSession(res.id)"
                    :disabled="removingReservationId === res.id"
                    class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-gray-400 hover:text-flame-500 hover:bg-flame-500/10 transition-all disabled:opacity-50"
                    :title="language === 'es' ? 'Quitar de esta sesión' : 'Remove from session'"
                  >
                    <svg v-if="removingReservationId === res.id" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="p-2 border-t border-gray-800 flex flex-col items-center gap-2">
                <div class="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    v-if="attendanceConfirmed.early"
                    type="button"
                    @click="unconfirmAttendance('early')"
                    :disabled="confirmingSlot === 'early'"
                    class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-colors"
                    :title="language === 'es' ? 'Clic para desconfirmar' : 'Click to unconfirm'"
                  >
                    {{ confirmingSlot === 'early' ? '...' : (language === 'es' ? 'Confirmado' : 'Confirmed') }}
                  </button>
                  <button
                    v-else
                    @click="confirmAttendance('early')"
                    :disabled="confirmingSlot === 'early' || earlyReservations.length === 0"
                    class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-glass-green text-black hover:bg-glass-green/90 disabled:opacity-50"
                  >
                    {{ confirmingSlot === 'early' ? '...' : (language === 'es' ? 'Confirmar' : 'Confirm') }}
                  </button>
                  <button
                    type="button"
                    @click="clearSession('early')"
                    :disabled="clearingSlot === 'early' || earlyReservations.length === 0"
                    class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 text-gray-300 hover:bg-flame-600/80 hover:text-white disabled:opacity-50 transition-colors"
                    :title="language === 'es' ? 'Quitar todos de esta sesión' : 'Clear all from this session'"
                  >
                    {{ clearingSlot === 'early' ? '...' : (language === 'es' ? 'Limpiar' : 'Clear') }}
                  </button>
                </div>
                <span v-if="reportSentAt && attendanceConfirmed.early" class="text-[10px] text-gray-500 whitespace-nowrap">
                  {{ language === 'es' ? 'Enviado:' : 'Sent:' }} {{ formatReportSentAt(reportSentAt) }}
                </span>
              </div>
            </div>

            <!-- 7:00 PM - 8:30 PM Class -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div class="bg-glass-blue px-3 py-2 text-center">
                <span class="font-bold text-white text-sm">7:00 - 8:30</span>
                <span class="block text-white/70 text-xs">{{ lateReservations.length }} {{ language === 'es' ? 'alumnos' : 'students' }}</span>
                <span class="block text-white/80 text-xs mt-0.5">
                  {{ language === 'es' ? 'Presentes:' : 'Present:' }} <strong>{{ latePresentCount }}</strong>
                </span>
              </div>
              <div class="p-2 border-b border-gray-800">
                <button
                  type="button"
                  @click="guestForm.session = 'late'; showGuestModal = true"
                  class="w-full py-2 rounded-lg bg-glass-blue/20 text-white font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-glass-blue/30 transition-colors"
                >
                  <span>➕</span>
                  {{ language === 'es' ? 'Invitado' : 'Guest' }}
                </button>
              </div>
              
              <div v-if="lateReservations.length === 0" class="p-3 text-center">
                <p class="text-gray-500 text-xs">{{ language === 'es' ? 'Sin reservas' : 'No reservations' }}</p>
              </div>
              
              <div v-else class="divide-y divide-gray-800 max-h-64 overflow-y-auto">
                <div
                  v-for="res in lateReservations"
                  :key="res.id"
                  class="flex items-center gap-2 p-2"
                  :class="isAttendanceMarked(res.user?.id, 'late') ? 'bg-glass-green/10' : ''"
                >
                  <div class="w-8 h-8 rounded-full bg-gradient-to-br from-glass-blue to-glass-purple flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {{ res.user?.full_name?.charAt(0)?.toUpperCase() || '?' }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-white text-xs truncate">{{ res.user?.full_name || 'Unknown' }}</p>
                  </div>
                  <button
                    v-if="!attendanceConfirmed.late"
                    @click="toggleAttendance(res.user?.id, 'late', !isAttendanceMarked(res.user?.id, 'late'))"
                    class="w-7 h-7 rounded-md flex items-center justify-center transition-all shrink-0"
                    :class="isAttendanceMarked(res.user?.id, 'late') ? 'bg-glass-green text-white' : 'bg-gray-800 text-gray-500'"
                    :title="language === 'es' ? 'Presente' : 'Present'"
                  >
                    <svg v-if="isAttendanceMarked(res.user?.id, 'late')" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span v-else class="text-sm">○</span>
                  </button>
                  <div v-else class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-glass-green" :title="language === 'es' ? 'Asistencia confirmada' : 'Attendance confirmed'">
                    <svg v-if="isAttendanceMarked(res.user?.id, 'late')" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span v-else class="text-gray-500 text-xs">—</span>
                  </div>
                  <button
                    v-if="!attendanceConfirmed.late"
                    @click="removeFromSession(res.id)"
                    :disabled="removingReservationId === res.id"
                    class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-gray-400 hover:text-flame-500 hover:bg-flame-500/10 transition-all disabled:opacity-50"
                    :title="language === 'es' ? 'Quitar de esta sesión' : 'Remove from session'"
                  >
                    <svg v-if="removingReservationId === res.id" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="p-2 border-t border-gray-800 flex flex-col items-center gap-2">
                <div class="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    v-if="attendanceConfirmed.late"
                    type="button"
                    @click="unconfirmAttendance('late')"
                    :disabled="confirmingSlot === 'late'"
                    class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-colors"
                    :title="language === 'es' ? 'Clic para desconfirmar' : 'Click to unconfirm'"
                  >
                    {{ confirmingSlot === 'late' ? '...' : (language === 'es' ? 'Confirmado' : 'Confirmed') }}
                  </button>
                  <button
                    v-else
                    @click="confirmAttendance('late')"
                    :disabled="confirmingSlot === 'late' || lateReservations.length === 0"
                    class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-glass-green text-black hover:bg-glass-green/90 disabled:opacity-50"
                  >
                    {{ confirmingSlot === 'late' ? '...' : (language === 'es' ? 'Confirmar' : 'Confirm') }}
                  </button>
                  <button
                    type="button"
                    @click="clearSession('late')"
                    :disabled="clearingSlot === 'late' || lateReservations.length === 0"
                    class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-700 text-gray-300 hover:bg-flame-600/80 hover:text-white disabled:opacity-50 transition-colors"
                    :title="language === 'es' ? 'Quitar todos de esta sesión' : 'Clear all from this session'"
                  >
                    {{ clearingSlot === 'late' ? '...' : (language === 'es' ? 'Limpiar' : 'Clear') }}
                  </button>
                </div>
                <span v-if="reportSentAt && attendanceConfirmed.late" class="text-[10px] text-gray-500 whitespace-nowrap">
                  {{ language === 'es' ? 'Enviado:' : 'Sent:' }} {{ formatReportSentAt(reportSentAt) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Send report (one button for both sessions; one submit per class date) -->
          <div class="mt-3">
            <button
              type="button"
              @click="saveAndSendReport"
              :disabled="savingAndSending || !!reportSentAt"
              class="w-full py-3 px-4 rounded-xl font-bold text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              :class="
                reportSentAt
                  ? 'bg-gray-800 text-gray-400'
                  : 'bg-glass-green text-black hover:bg-glass-green/90'
              "
            >
              {{
                savingAndSending
                  ? '...'
                  : reportSentAt
                    ? (language === 'es' ? 'Reporte enviado' : 'Report sent')
                    : (language === 'es' ? 'Enviar reporte' : 'Send report')
              }}
            </button>
          </div>

        </div>

        <!-- Roster Section -->
        <div class="mt-6">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-white flex items-center gap-2">
              <span>📋</span>
              {{ language === 'es' ? 'Roster' : 'Roster' }}
            </h3>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 bg-glass-green/20 text-glass-green text-xs rounded-full">
                {{ studentsWithCredits.length }} {{ language === 'es' ? 'con créditos' : 'with credits' }}
              </span>
            </div>
          </div>
          
          <!-- Roster Search -->
          <div class="relative mb-3">
            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              v-model="rosterSearchQuery"
              type="text"
              :placeholder="language === 'es' ? 'Buscar en roster...' : 'Search roster...'"
              class="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:border-gold-400 outline-none"
            />
          </div>

          <!-- Roster List -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl max-h-64 overflow-y-auto">
            <div v-if="rosterStudents.length === 0" class="p-4 text-center">
              <p class="text-gray-500 text-sm">
                {{ rosterSearchQuery 
                  ? (language === 'es' ? 'No se encontraron alumnos' : 'No students found')
                  : (language === 'es' ? 'Todos los alumnos ya están registrados' : 'All students are already registered')
                }}
              </p>
            </div>
            
            <div
              v-for="student in rosterStudents"
              :key="student.id"
              class="flex items-center gap-3 p-3 border-b border-gray-800 last:border-b-0 hover:bg-gray-800/50"
              :class="hasActiveCredit(student.id) ? 'bg-glass-green/5' : ''"
            >
              <div class="relative">
                <div class="w-9 h-9 rounded-full bg-gradient-to-br from-glass-purple to-glass-blue flex items-center justify-center text-sm font-bold text-white shrink-0">
                  {{ student.full_name?.charAt(0)?.toUpperCase() || '?' }}
                </div>
                <!-- Credit badge -->
                <span 
                  v-if="hasActiveCredit(student.id)"
                  class="absolute -top-1 -right-1 w-4 h-4 bg-glass-green rounded-full flex items-center justify-center text-[8px] font-bold text-white border border-gray-900"
                  :title="`${getStudentCredit(student.id)?.remaining_credits} credits`"
                >
                  {{ getStudentCredit(student.id)?.remaining_credits }}
                </span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5">
                  <p class="font-semibold text-white text-sm truncate">{{ student.full_name }}</p>
                  <!-- Attendance badge -->
                  <span 
                    v-if="getAttendanceRate(student.id) !== null"
                    class="px-1.5 py-0.5 text-[10px] rounded-full shrink-0"
                    :class="getAttendanceRate(student.id) >= 80 
                      ? 'bg-glass-green/20 text-glass-green' 
                      : getAttendanceRate(student.id) >= 50 
                        ? 'bg-gold-400/20 text-gold-400' 
                        : 'bg-flame-600/20 text-flame-600'"
                  >
                    📊 {{ getAttendanceRate(student.id) }}%
                  </span>
                </div>
                <p class="text-xs text-gray-500 truncate">
                  {{ hasActiveCredit(student.id) 
                    ? `💳 ${getStudentCredit(student.id)?.credit_type?.replace(/_/g, ' ')} • ${getStudentCredit(student.id)?.remaining_credits} ${language === 'es' ? 'restantes' : 'left'}`
                    : (student.phone || student.email)
                  }}
                </p>
              </div>
              <div class="flex items-center gap-1.5">
                <!-- Session toggles: select one or both, then confirm with OK -->
                <button
                  type="button"
                  @click="togglePendingSlot(student.id, 'early')"
                  :disabled="addingStudent === student.id || isStudentInSlot(student.id, 'early')"
                  class="px-2 py-1 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50 min-w-[52px]"
                  :class="isStudentInSlot(student.id, 'early')
                    ? 'bg-gold-400/40 text-gold-300 cursor-default'
                    : isPendingSlot(student.id, 'early')
                      ? 'bg-gold-400 text-black ring-2 ring-gold-400 ring-offset-1 ring-offset-gray-900'
                      : 'bg-gray-700 text-gray-400 hover:bg-gold-400/30 hover:text-gold-300'"
                  :title="isStudentInSlot(student.id, 'early') ? (language === 'es' ? 'Ya en 5:30' : 'Already in 5:30') : (language === 'es' ? 'Seleccionar 5:30' : 'Select 5:30')"
                >
                  <span v-if="addingStudent === student.id" class="animate-spin">⏳</span>
                  <span v-else>{{ isStudentInSlot(student.id, 'early') ? '✓ 5:30' : (isPendingSlot(student.id, 'early') ? '✓ 5:30' : '+ 5:30') }}</span>
                </button>
                <button
                  type="button"
                  @click="togglePendingSlot(student.id, 'late')"
                  :disabled="addingStudent === student.id || isStudentInSlot(student.id, 'late')"
                  class="px-2 py-1 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50 min-w-[52px]"
                  :class="isStudentInSlot(student.id, 'late')
                    ? 'bg-glass-blue/40 text-blue-300 cursor-default'
                    : isPendingSlot(student.id, 'late')
                      ? 'bg-glass-blue text-white ring-2 ring-glass-blue ring-offset-1 ring-offset-gray-900'
                      : 'bg-gray-700 text-gray-400 hover:bg-glass-blue/30 hover:text-blue-300'"
                  :title="isStudentInSlot(student.id, 'late') ? (language === 'es' ? 'Ya en 7:00' : 'Already in 7:00') : (language === 'es' ? 'Seleccionar 7:00' : 'Select 7:00')"
                >
                  <span v-if="addingStudent === student.id" class="animate-spin">⏳</span>
                  <span v-else>{{ isStudentInSlot(student.id, 'late') ? '✓ 7:00' : (isPendingSlot(student.id, 'late') ? '✓ 7:00' : '+ 7:00') }}</span>
                </button>
                <button
                  v-if="hasPendingSlots(student.id)"
                  type="button"
                  @click="confirmRosterSelection(student)"
                  :disabled="addingStudent === student.id"
                  class="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-glass-green text-black hover:bg-glass-green/90 disabled:opacity-50 shrink-0"
                  :title="language === 'es' ? 'Confirmar y enviar a asistencia' : 'Confirm and send to attendance'"
                >
                  {{ addingStudent === student.id ? '...' : (language === 'es' ? 'OK' : 'OK') }}
                </button>
              </div>
            </div>
          </div>
          
          <p class="text-xs text-gray-600 mt-2 text-center">
            💡 {{ language === 'es' 
              ? 'Alumnos con créditos activos aparecen primero' 
              : 'Students with active credits appear first' 
            }}
          </p>
        </div>
      </div>

      <!-- Students Tab -->
      <div v-else-if="activeTab === 'students'" class="py-4">
        <!-- Search -->
        <div class="mb-4">
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="language === 'es' ? 'Buscar alumno...' : 'Search student...'"
            class="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
          />
        </div>

        <!-- Students List -->
        <div class="space-y-2">
          <div
            v-for="student in filteredStudents"
            :key="student.id"
            @click="openStudentDashboard(student)"
            class="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-gold-400/50 transition-colors"
          >
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-glass-purple to-glass-blue flex items-center justify-center text-xl font-bold text-white shrink-0">
              {{ student.full_name?.charAt(0)?.toUpperCase() || '?' }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-bold text-white">{{ student.full_name }}</p>
              <p class="text-xs text-gold-400 mt-0.5">
                🗓️ {{ language === 'es' ? 'En Niik desde:' : 'At Niik since:' }} {{ formatStartDate(student.created_at) }}
              </p>
              <div class="mt-1.5">
                <span
                  class="inline-block px-2 py-0.5 text-xs font-medium rounded-full capitalize"
                  :class="{
                    'bg-emerald-500/20 text-emerald-400': (student.skill_level || '').toLowerCase() === 'beginner',
                    'bg-amber-500/20 text-amber-400': (student.skill_level || '').toLowerCase() === 'intermediate',
                    'bg-purple-500/20 text-purple-400': (student.skill_level || '').toLowerCase() === 'pro',
                    'bg-gray-700 text-gray-400': !student.skill_level
                  }"
                >
                  {{ student.skill_level || (language === 'es' ? '—' : '—') }}
                </span>
              </div>
            </div>
            <div class="flex flex-col gap-2 shrink-0" @click.stop>
              <button
                v-if="isCoachOrAdmin"
                type="button"
                @click="navigateToNewEvaluation(student.id)"
                class="px-3 py-2 bg-gold-400/20 text-gold-400 text-sm font-semibold rounded-lg hover:bg-gold-400/30 transition-colors"
              >
                {{ language === 'es' ? 'Evaluar' : 'Evaluate' }}
              </button>
              <NuxtLink
                :to="`/dashboard/students/${student.id}`"
                class="block w-full text-center px-3 py-2 bg-gray-800 text-gold-400 text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors"
              >
                {{ language === 'es' ? 'Perfil' : 'Profile' }}
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Guest Registration Modal -->
    <Teleport to="body">
      <div v-if="showGuestModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
        <div class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-bold text-white">
              {{ language === 'es' ? 'Agregar Invitado' : 'Add Guest' }}
            </h3>
            <button @click="showGuestModal = false" class="text-gray-400 hover:text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div v-if="guestAdded" class="text-center py-8">
            <span class="text-4xl">✅</span>
            <p class="text-glass-green font-semibold mt-2">
              {{ language === 'es' ? '¡Invitado agregado!' : 'Guest added!' }}
            </p>
          </div>
          
          <div v-else class="space-y-4">
            <div>
              <label class="block text-sm text-gray-400 mb-1">{{ language === 'es' ? 'Nombre *' : 'Name *' }}</label>
              <input
                v-model="guestForm.full_name"
                type="text"
                :placeholder="language === 'es' ? 'Nombre completo' : 'Full name'"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
              />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">{{ language === 'es' ? 'Email (opcional)' : 'Email (optional)' }}</label>
              <input
                v-model="guestForm.email"
                type="email"
                placeholder="email@example.com"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
              />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-1">{{ language === 'es' ? 'Teléfono (opcional)' : 'Phone (optional)' }}</label>
              <input
                v-model="guestForm.phone"
                type="tel"
                placeholder="+52 1234567890"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
              />
            </div>
            <div>
              <label class="block text-sm text-gray-400 mb-2">{{ language === 'es' ? 'Sesión' : 'Session' }}</label>
              <div class="flex gap-2">
                <button
                  type="button"
                  @click="guestForm.session = 'early'"
                  class="flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all"
                  :class="guestForm.session === 'early' ? 'bg-gold-400 text-black ring-2 ring-gold-400 ring-offset-2 ring-offset-gray-900' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'"
                >
                  {{ language === 'es' ? 'Sesión 1' : 'Session 1' }}<br>
                  <span class="text-xs font-normal opacity-90">5:30 - 7:00</span>
                </button>
                <button
                  type="button"
                  @click="guestForm.session = 'late'"
                  class="flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all"
                  :class="guestForm.session === 'late' ? 'bg-glass-blue text-white ring-2 ring-glass-blue ring-offset-2 ring-offset-gray-900' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'"
                >
                  {{ language === 'es' ? 'Sesión 2' : 'Session 2' }}<br>
                  <span class="text-xs font-normal opacity-90">7:00 - 8:30</span>
                </button>
              </div>
            </div>
            <button
              @click="addGuest"
              :disabled="!guestForm.full_name || savingGuest"
              class="w-full py-4 bg-glass-green text-white font-bold rounded-xl disabled:opacity-50"
            >
              {{ savingGuest ? '...' : (language === 'es' ? 'Agregar a la Clase' : 'Add to Class') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Send Invite Modal -->
    <Teleport to="body">
      <div v-if="showInviteModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80">
        <div class="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-bold text-white">
              {{ language === 'es' ? 'Enviar Registro' : 'Send Registration' }}
            </h3>
            <button @click="showInviteModal = false" class="text-gray-400 hover:text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div v-if="inviteSent" class="text-center py-8">
            <span class="text-4xl">📲</span>
            <p class="text-glass-green font-semibold mt-2">
              {{ language === 'es' ? '¡Abriendo WhatsApp!' : 'Opening WhatsApp!' }}
            </p>
          </div>
          
          <div v-else class="space-y-4">
            <p class="text-gray-400 text-sm">
              {{ language === 'es' 
                ? 'Ingresa el número de WhatsApp para enviar el link de registro:' 
                : 'Enter WhatsApp number to send registration link:' 
              }}
            </p>
            <div>
              <label class="block text-sm text-gray-400 mb-1">{{ language === 'es' ? 'Número de WhatsApp' : 'WhatsApp Number' }}</label>
              <input
                v-model="invitePhone"
                type="tel"
                placeholder="+52 1234567890"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none text-lg"
              />
            </div>
            <button
              @click="sendInvite"
              :disabled="!invitePhone || sendingInvite"
              class="w-full py-4 bg-glass-green text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span class="text-xl">📲</span>
              {{ sendingInvite ? '...' : (language === 'es' ? 'Enviar por WhatsApp' : 'Send via WhatsApp') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
