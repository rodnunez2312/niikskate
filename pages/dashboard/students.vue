<script setup lang="ts">
import { format, isToday, isTuesday, isThursday, isSaturday, addDays, formatDistanceToNow, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isBefore, isAfter, isSameDay } from 'date-fns'
import { es } from 'date-fns/locale'

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

// State
const activeTab = ref<'attendance' | 'students' | 'progress'>('attendance')
const loading = ref(true)
const students = ref<any[]>([])
const todayReservations = ref<any[]>([])
const selectedDate = ref(new Date())
const selectedSession = ref<'early' | 'late'>('early')
const searchQuery = ref('')
const attendanceMarked = ref<Record<string, boolean>>({})

// Guest registration
const showGuestModal = ref(false)
const guestForm = ref({
  full_name: '',
  email: '',
  phone: ''
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
const studentPayments = ref<any[]>([])

// Student calendar data
const studentReservations = ref<any[]>([])
const studentAttendance = ref<any[]>([])
const calendarMonth = ref(new Date())

onMounted(async () => {
  await Promise.all([fetchStudents(), fetchReservations(), fetchSkills(), fetchStudentCredits(), fetchAttendanceStats()])
})

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
      // Key includes time_slot to differentiate
      attendanceMarked.value[`${a.student_id}_${a.time_slot}`] = a.attended
    })
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

// Select student for progress view
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

// Add student from roster to today's class
const addStudentToClass = async (student: any, timeSlot: 'early' | 'late') => {
  addingStudent.value = student.id
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    
    // Create a reservation for this student
    await client
      .from('class_reservations')
      .insert({
        user_id: student.id,
        reservation_date: dateStr,
        time_slot: timeSlot,
        status: 'active',
        notes: 'Added from roster (walk-in)'
      })
    
    // Refresh reservations
    await fetchReservations()
  } catch (e) {
    console.error('Error adding student to class:', e)
  } finally {
    addingStudent.value = null
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
          session: selectedSession.value,
          class_type: 'guest',
          class_name: 'Guest Drop-in',
          is_guest: true
        }
      })
    
    guestAdded.value = true
    setTimeout(() => {
      showGuestModal.value = false
      guestAdded.value = false
      guestForm.value = { full_name: '', email: '', phone: '' }
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
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4 pt-safe pb-4">
      <div class="max-w-lg mx-auto pt-4">
        <h1 class="text-2xl font-bold text-white mb-4">
          {{ language === 'es' ? 'Alumnos' : 'Students' }}
        </h1>
        
        <!-- Tabs -->
        <div class="flex gap-2">
          <button
            @click="activeTab = 'attendance'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'attendance' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Asistencia' : 'Attendance' }}
          </button>
          <button
            @click="activeTab = 'students'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'students' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Alumnos' : 'Students' }}
          </button>
          <button
            @click="activeTab = 'progress'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'progress' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Progreso' : 'Progress' }}
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

        <!-- Quick Actions -->
        <div class="flex gap-2 mb-4">
          <button
            @click="showGuestModal = true"
            class="flex-1 py-2 bg-glass-green text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm"
          >
            <span>➕</span>
            {{ language === 'es' ? 'Invitado' : 'Guest' }}
          </button>
          <button
            @click="showInviteModal = true"
            class="flex-1 py-2 bg-glass-blue text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm"
          >
            <span>📲</span>
            {{ language === 'es' ? 'Registro' : 'Invite' }}
          </button>
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
                    @click="toggleAttendance(res.user?.id, 'early', !isAttendanceMarked(res.user?.id, 'early'))"
                    class="w-7 h-7 rounded-md flex items-center justify-center transition-all shrink-0"
                    :class="isAttendanceMarked(res.user?.id, 'early') ? 'bg-glass-green text-white' : 'bg-gray-800 text-gray-500'"
                  >
                    <svg v-if="isAttendanceMarked(res.user?.id, 'early')" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span v-else class="text-sm">○</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- 7:00 PM - 8:30 PM Class -->
            <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div class="bg-glass-blue px-3 py-2 text-center">
                <span class="font-bold text-white text-sm">7:00 - 8:30</span>
                <span class="block text-white/70 text-xs">{{ lateReservations.length }} {{ language === 'es' ? 'alumnos' : 'students' }}</span>
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
                    @click="toggleAttendance(res.user?.id, 'late', !isAttendanceMarked(res.user?.id, 'late'))"
                    class="w-7 h-7 rounded-md flex items-center justify-center transition-all shrink-0"
                    :class="isAttendanceMarked(res.user?.id, 'late') ? 'bg-glass-green text-white' : 'bg-gray-800 text-gray-500'"
                  >
                    <svg v-if="isAttendanceMarked(res.user?.id, 'late')" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span v-else class="text-sm">○</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Summary -->
          <div class="mt-3 p-2 bg-gray-800 rounded-xl flex items-center justify-between text-sm">
            <span class="text-gray-400">
              {{ language === 'es' ? 'Total:' : 'Total:' }} 
              <span class="text-white font-bold">{{ todayReservations.length }}</span>
            </span>
            <span class="text-glass-green">
              {{ language === 'es' ? 'Presentes:' : 'Present:' }} 
              <span class="font-bold">{{ Object.values(attendanceMarked).filter(v => v).length }}</span>
            </span>
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
              <div class="flex items-center gap-1">
                <button
                  @click="addStudentToClass(student, 'early')"
                  :disabled="addingStudent === student.id"
                  class="px-2 py-1 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50 bg-gold-400 text-black hover:bg-gold-500"
                >
                  <span v-if="addingStudent === student.id" class="animate-spin">⏳</span>
                  <span v-else>+ 5:30</span>
                </button>
                <button
                  @click="addStudentToClass(student, 'late')"
                  :disabled="addingStudent === student.id"
                  class="px-2 py-1 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50 bg-glass-blue text-white hover:bg-glass-blue/80"
                >
                  <span v-if="addingStudent === student.id" class="animate-spin">⏳</span>
                  <span v-else>+ 7:00</span>
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
            class="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4"
          >
            <div class="relative">
              <div class="w-12 h-12 rounded-full bg-gradient-to-br from-glass-purple to-glass-blue flex items-center justify-center text-xl font-bold text-white">
                {{ student.full_name?.charAt(0)?.toUpperCase() || '?' }}
              </div>
              <!-- Credit badge -->
              <span 
                v-if="hasActiveCredit(student.id)"
                class="absolute -top-1 -right-1 w-5 h-5 bg-glass-green rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-gray-900"
              >
                {{ getStudentCredit(student.id)?.remaining_credits }}
              </span>
            </div>
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <p class="font-bold text-white">{{ student.full_name }}</p>
                <!-- Attendance badge -->
                <span 
                  v-if="getAttendanceRate(student.id) !== null"
                  class="px-1.5 py-0.5 text-xs rounded-full"
                  :class="getAttendanceRate(student.id) >= 80 
                    ? 'bg-glass-green/20 text-glass-green' 
                    : getAttendanceRate(student.id) >= 50 
                      ? 'bg-gold-400/20 text-gold-400' 
                      : 'bg-flame-600/20 text-flame-600'"
                >
                  📊 {{ getAttendanceRate(student.id) }}%
                </span>
              </div>
              <p class="text-sm text-gray-400">{{ student.email }}</p>
              <p v-if="student.phone" class="text-xs text-gray-500">{{ student.phone }}</p>
              <div class="flex items-center gap-3 mt-1">
                <p class="text-xs text-gold-400">
                  🗓️ {{ language === 'es' ? 'En Niik desde:' : 'At Niik since:' }} 
                  {{ formatStartDate(student.created_at) }}
                </p>
                <p v-if="hasActiveCredit(student.id)" class="text-xs text-glass-green">
                  💳 {{ getStudentCredit(student.id)?.remaining_credits }} {{ language === 'es' ? 'clases' : 'classes' }}
                </p>
              </div>
            </div>
            <button
              @click="selectStudent(student); activeTab = 'progress'"
              class="px-3 py-2 bg-gray-800 text-gold-400 text-sm font-semibold rounded-lg"
            >
              {{ language === 'es' ? 'Progreso' : 'Progress' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Progress Tab -->
      <div v-else-if="activeTab === 'progress'" class="py-4">
        <!-- Student Selector -->
        <div v-if="!selectedStudent" class="space-y-2">
          <p class="text-gray-400 mb-4">
            {{ language === 'es' ? 'Selecciona un alumno para ver/editar su progreso:' : 'Select a student to view/edit their progress:' }}
          </p>
          <div
            v-for="student in students"
            :key="student.id"
            @click="selectStudent(student)"
            class="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-gold-400/50"
          >
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-glass-green to-glass-blue flex items-center justify-center font-bold text-white">
              {{ student.full_name?.charAt(0)?.toUpperCase() || '?' }}
            </div>
            <div class="flex-1">
              <p class="font-semibold text-white">{{ student.full_name }}</p>
            </div>
            <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        <!-- Student Progress -->
        <div v-else>
          <div class="flex items-center gap-3 mb-4">
            <button @click="selectedStudent = null" class="p-2 bg-gray-800 rounded-lg">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h2 class="font-bold text-white">{{ selectedStudent.full_name }}</h2>
              <p class="text-sm text-gray-400">{{ studentProgress.length }} / {{ skills.length }} {{ language === 'es' ? 'trucos aprendidos' : 'skills learned' }}</p>
            </div>
          </div>

          <!-- Progress Bar -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
            <div class="flex justify-between text-sm mb-2">
              <span class="text-gray-400">{{ language === 'es' ? 'Progreso general' : 'Overall progress' }}</span>
              <span class="text-gold-400 font-bold">{{ skills.length > 0 ? Math.round((studentProgress.length / skills.length) * 100) : 0 }}%</span>
            </div>
            <div class="h-3 bg-gray-800 rounded-full overflow-hidden">
              <div 
                class="h-full bg-gradient-to-r from-gold-400 to-glass-green rounded-full transition-all"
                :style="{ width: skills.length > 0 ? `${(studentProgress.length / skills.length) * 100}%` : '0%' }"
              ></div>
            </div>
          </div>

          <!-- Attendance Calendar -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
            <h3 class="font-bold text-white mb-3 flex items-center gap-2">
              <span>📅</span>
              {{ language === 'es' ? 'Calendario de Asistencia' : 'Attendance Calendar' }}
            </h3>
            
            <!-- Calendar Stats -->
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
            
            <!-- Month Navigation -->
            <div class="flex items-center justify-between mb-3">
              <button @click="prevMonth" class="p-2 bg-gray-800 rounded-lg hover:bg-gray-700">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h4 class="font-semibold text-white capitalize">{{ calendarMonthLabel }}</h4>
              <button @click="nextMonth" class="p-2 bg-gray-800 rounded-lg hover:bg-gray-700">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            <!-- Day Labels -->
            <div class="grid grid-cols-7 gap-1 mb-1">
              <div v-for="day in dayLabels" :key="day" class="text-center text-[10px] text-gray-500 font-medium py-1">
                {{ day }}
              </div>
            </div>
            
            <!-- Calendar Grid -->
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
                <!-- Status indicator dot -->
                <span 
                  v-if="day && getDayStatus(day)"
                  class="absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px]"
                >
                  {{ getDayStatus(day) === 'attended' ? '✓' : getDayStatus(day) === 'missed' ? '✗' : getDayStatus(day) === 'upcoming' ? '○' : '●' }}
                </span>
              </div>
            </div>
            
            <!-- Legend -->
            <div class="flex items-center justify-center gap-4 mt-3 text-[10px]">
              <div class="flex items-center gap-1">
                <span class="w-3 h-3 bg-glass-green rounded"></span>
                <span class="text-gray-400">{{ language === 'es' ? 'Asistió' : 'Attended' }}</span>
              </div>
              <div class="flex items-center gap-1">
                <span class="w-3 h-3 bg-flame-600 rounded"></span>
                <span class="text-gray-400">{{ language === 'es' ? 'Faltó' : 'Missed' }}</span>
              </div>
              <div class="flex items-center gap-1">
                <span class="w-3 h-3 bg-glass-blue rounded"></span>
                <span class="text-gray-400">{{ language === 'es' ? 'Próxima' : 'Upcoming' }}</span>
              </div>
              <div class="flex items-center gap-1">
                <span class="w-3 h-3 bg-gold-400 rounded"></span>
                <span class="text-gray-400">{{ language === 'es' ? 'Hoy' : 'Today' }}</span>
              </div>
            </div>
          </div>
          
          <!-- Progress Timeline -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
            <h3 class="font-bold text-white mb-3 flex items-center gap-2">
              <span>📈</span>
              {{ language === 'es' ? 'Historial de Progreso' : 'Progress Timeline' }}
            </h3>
            
            <div v-if="progressTimeline.length === 0" class="text-center py-4">
              <p class="text-gray-500 text-sm">
                {{ language === 'es' ? 'Sin historial de pagos registrado' : 'No payment history recorded' }}
              </p>
            </div>
            
            <div v-else class="relative">
              <!-- Timeline Line -->
              <div class="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-700"></div>
              
              <!-- Timeline Items -->
              <div 
                v-for="(item, index) in progressTimeline" 
                :key="index"
                class="relative pl-10 pb-4 last:pb-0"
              >
                <!-- Timeline Dot -->
                <div 
                  class="absolute left-2.5 w-3 h-3 rounded-full border-2 border-gray-900"
                  :class="item.type === 'payment' ? 'bg-glass-green' : 'bg-gold-400'"
                ></div>
                
                <!-- Content -->
                <div class="bg-gray-800 rounded-lg p-3">
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-xs text-gray-500">
                      {{ formatTimelineDate(item.date) }}
                    </span>
                    <span 
                      class="px-2 py-0.5 text-xs rounded-full"
                      :class="item.type === 'payment' ? 'bg-glass-green/20 text-glass-green' : 'bg-gold-400/20 text-gold-400'"
                    >
                      {{ item.type === 'payment' 
                        ? (language === 'es' ? 'Pago' : 'Payment') 
                        : (language === 'es' ? 'Progreso' : 'Progress') 
                      }}
                    </span>
                  </div>
                  <p class="text-white text-sm font-semibold">{{ item.title }}</p>
                  <p v-if="item.description" class="text-gray-400 text-xs mt-1">{{ item.description }}</p>
                  <div v-if="item.skills_count" class="mt-2 flex items-center gap-2">
                    <div class="h-1.5 flex-1 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        class="h-full bg-gold-400 rounded-full"
                        :style="{ width: `${item.progress_percentage}%` }"
                      ></div>
                    </div>
                    <span class="text-xs text-gold-400 font-bold">{{ item.progress_percentage }}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Skills by Category -->
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
                <span class="px-2 py-0.5 rounded text-xs" :class="{
                  'bg-green-500/20 text-green-400': skill.difficulty === 'beginner',
                  'bg-yellow-500/20 text-yellow-400': skill.difficulty === 'intermediate',
                  'bg-red-500/20 text-red-400': skill.difficulty === 'advanced'
                }">
                  {{ skill.difficulty }}
                </span>
              </button>
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
