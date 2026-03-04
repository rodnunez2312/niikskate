import type { SkateClass, ClassSchedule, ClassType, TimeSlot, DayOfWeek, User } from '~/types'
import { startOfMonth, endOfMonth, eachDayOfInterval, getDay, format, parseISO } from 'date-fns'

// Static coach data for demo
const DEMO_COACHES: User[] = [
  {
    id: 'coach-rod',
    email: 'rod@niikskate.com',
    full_name: 'Coach Rod',
    role: 'coach',
    avatar_url: null,
    phone: null,
    bio: 'Experto en Vert y Street tricks con más de 10 años de experiencia.',
    specialties: ['Vert', 'Street'],
    hourly_rate: 250,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'coach-leo',
    email: 'leo@niikskate.com',
    full_name: 'Coach Leo',
    role: 'coach',
    avatar_url: null,
    phone: null,
    bio: 'Especialista en Vert y Street, campeón regional.',
    specialties: ['Vert', 'Street'],
    hourly_rate: 250,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'coach-itza',
    email: 'itza@niikskate.com',
    full_name: 'Coach Itza',
    role: 'coach',
    avatar_url: null,
    phone: null,
    bio: 'Especialista en fundamentos y técnica básica para principiantes.',
    specialties: ['Fundamentos'],
    hourly_rate: 200,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

export const useClasses = () => {
  const client = useSupabaseClient()
  
  const classes = ref<SkateClass[]>([])
  const schedules = ref<ClassSchedule[]>([])
  const coaches = ref<User[]>(DEMO_COACHES)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Fetch all skate class types
  const fetchClasses = async () => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: fetchError } = await client
        .from('skate_classes')
        .select('*')
        .eq('is_active', true)
        .order('class_type')
      
      if (fetchError) throw fetchError
      classes.value = data as SkateClass[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch classes'
      console.error('Error fetching classes:', e)
    } finally {
      loading.value = false
    }
  }

  // Fetch all active coaches (with demo fallback)
  const fetchCoaches = async () => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: fetchError } = await client
        .from('profiles')
        .select('*')
        .eq('role', 'coach')
        .eq('is_active', true)
        .order('full_name')
      
      if (fetchError) throw fetchError
      // Use database coaches if available, otherwise keep demo coaches
      if (data && data.length > 0) {
        coaches.value = data as User[]
      } else {
        coaches.value = DEMO_COACHES
      }
    } catch (e) {
      // On error, use demo coaches
      coaches.value = DEMO_COACHES
      console.error('Error fetching coaches, using demo data:', e)
    } finally {
      loading.value = false
    }
  }
  
  // Get coaches available for a specific day (demo logic)
  const getCoachesForDay = (dayOfWeek: number): User[] => {
    // All coaches available on class days (Tue=2, Thu=4, Sat=6)
    if (dayOfWeek === 2 || dayOfWeek === 4 || dayOfWeek === 6) {
      return DEMO_COACHES
    }
    return []
  }

  // Fetch schedules for a specific month
  const fetchMonthSchedules = async (year: number, month: number) => {
    loading.value = true
    error.value = null
    
    const startDate = startOfMonth(new Date(year, month - 1))
    const endDate = endOfMonth(startDate)
    
    try {
      const { data, error: fetchError } = await client
        .from('class_schedules')
        .select(`
          *,
          skate_class:skate_classes(*),
          coach:profiles!coach_id(id, full_name, avatar_url, bio, specialties)
        `)
        .gte('date', format(startDate, 'yyyy-MM-dd'))
        .lte('date', format(endDate, 'yyyy-MM-dd'))
        .eq('is_cancelled', false)
        .order('date')
        .order('time_slot')
      
      if (fetchError) throw fetchError
      schedules.value = data as ClassSchedule[]
      return data as ClassSchedule[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch schedules'
      console.error('Error fetching schedules:', e)
      return []
    } finally {
      loading.value = false
    }
  }

  // Fetch schedules for a specific date
  const fetchDaySchedules = async (date: string) => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: fetchError } = await client
        .from('class_schedules')
        .select(`
          *,
          skate_class:skate_classes(*),
          coach:profiles!coach_id(id, full_name, avatar_url, bio, specialties)
        `)
        .eq('date', date)
        .eq('is_cancelled', false)
        .order('time_slot')
      
      if (fetchError) throw fetchError
      return data as ClassSchedule[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch day schedules'
      console.error('Error fetching day schedules:', e)
      return []
    } finally {
      loading.value = false
    }
  }

  // Get class days for a month (Tue, Thu, Sat only)
  const getClassDaysForMonth = (year: number, month: number) => {
    const startDate = startOfMonth(new Date(year, month - 1))
    const endDate = endOfMonth(startDate)
    const allDays = eachDayOfInterval({ start: startDate, end: endDate })
    
    // Filter to only Tuesday (2), Thursday (4), Saturday (6)
    return allDays.filter(day => {
      const dayNum = getDay(day)
      return dayNum === 2 || dayNum === 4 || dayNum === 6
    })
  }

  // Convert JS day number to our DayOfWeek type
  const getDayOfWeek = (date: Date): DayOfWeek | null => {
    const dayNum = getDay(date)
    switch (dayNum) {
      case 2: return 'tuesday'
      case 4: return 'thursday'
      case 6: return 'saturday'
      default: return null
    }
  }

  // Check if a date is a class day
  const isClassDay = (date: Date): boolean => {
    const dayNum = getDay(date)
    return dayNum === 2 || dayNum === 4 || dayNum === 6
  }

  // Get available coaches for a specific date and time slot
  const getAvailableCoaches = async (date: string, timeSlot: TimeSlot) => {
    const parsedDate = parseISO(date)
    const year = parsedDate.getFullYear()
    const month = parsedDate.getMonth() + 1
    const dayOfWeek = getDayOfWeek(parsedDate)
    
    if (!dayOfWeek) return []
    
    try {
      // Get coaches with availability for this month/day/slot
      const { data: availabilityData, error: availError } = await client
        .from('coach_availability')
        .select(`
          coach_id,
          coach:profiles!coach_id(id, full_name, avatar_url, bio, specialties, hourly_rate)
        `)
        .eq('year', year)
        .eq('month', month)
        .eq('day_of_week', dayOfWeek)
        .eq('time_slot', timeSlot)
        .eq('is_available', true)
      
      if (availError) throw availError
      
      // Check for date-specific overrides (unavailable)
      const { data: overrideData, error: overrideError } = await client
        .from('coach_date_availability')
        .select('coach_id')
        .eq('date', date)
        .eq('time_slot', timeSlot)
        .eq('is_available', false)
      
      if (overrideError) throw overrideError
      
      const unavailableCoachIds = new Set(overrideData?.map(o => o.coach_id) || [])
      
      // Filter out coaches who have date-specific unavailability
      const availableCoaches = availabilityData
        ?.filter(a => !unavailableCoachIds.has(a.coach_id))
        .map(a => a.coach) || []
      
      return availableCoaches as User[]
    } catch (e) {
      console.error('Error fetching available coaches:', e)
      return []
    }
  }

  // Create a class schedule
  const createSchedule = async (schedule: {
    class_id: string
    coach_id: string
    date: string
    time_slot: TimeSlot
    max_capacity: number
    price_override?: number
    notes?: string
  }) => {
    loading.value = true
    error.value = null
    
    const timeSlotTimes = {
      early: { start: '17:30:00', end: '19:00:00' },
      late: { start: '19:00:00', end: '20:30:00' },
    }
    
    try {
      const { data, error: insertError } = await client
        .from('class_schedules')
        .insert({
          ...schedule,
          start_time: timeSlotTimes[schedule.time_slot].start,
          end_time: timeSlotTimes[schedule.time_slot].end,
        })
        .select()
        .single()
      
      if (insertError) throw insertError
      return { success: true, data }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to create schedule'
      error.value = errorMsg
      return { success: false, error: errorMsg }
    } finally {
      loading.value = false
    }
  }

  return {
    classes,
    schedules,
    coaches,
    loading,
    error,
    fetchClasses,
    fetchCoaches,
    fetchMonthSchedules,
    fetchDaySchedules,
    getClassDaysForMonth,
    getDayOfWeek,
    isClassDay,
    getAvailableCoaches,
    getCoachesForDay,
    createSchedule,
    DEMO_COACHES,
  }
}
