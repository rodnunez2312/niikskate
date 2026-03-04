import type { CoachAvailability, CoachDateAvailability, DayOfWeek, TimeSlot } from '~/types'

export const useCoachAvailability = () => {
  const client = useSupabaseClient()
  const user = useSupabaseUser()
  
  const availability = ref<CoachAvailability[]>([])
  const dateOverrides = ref<CoachDateAvailability[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Days and time slots for the schedule
  const classDays: DayOfWeek[] = ['tuesday', 'thursday', 'saturday']
  const timeSlots: TimeSlot[] = ['early', 'late']

  // Fetch coach's availability for a specific month
  const fetchMonthlyAvailability = async (coachId: string, year: number, month: number) => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: fetchError } = await client
        .from('coach_availability')
        .select('*')
        .eq('coach_id', coachId)
        .eq('year', year)
        .eq('month', month)
      
      if (fetchError) throw fetchError
      availability.value = data as CoachAvailability[]
      return data as CoachAvailability[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch availability'
      console.error('Error fetching availability:', e)
      return []
    } finally {
      loading.value = false
    }
  }

  // Fetch date-specific overrides for a month
  const fetchDateOverrides = async (coachId: string, year: number, month: number) => {
    loading.value = true
    error.value = null
    
    const startDate = new Date(year, month - 1, 1)
    const endDate = new Date(year, month, 0) // Last day of month
    
    try {
      const { data, error: fetchError } = await client
        .from('coach_date_availability')
        .select('*')
        .eq('coach_id', coachId)
        .gte('date', startDate.toISOString().split('T')[0])
        .lte('date', endDate.toISOString().split('T')[0])
      
      if (fetchError) throw fetchError
      dateOverrides.value = data as CoachDateAvailability[]
      return data as CoachDateAvailability[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch date overrides'
      console.error('Error fetching date overrides:', e)
      return []
    } finally {
      loading.value = false
    }
  }

  // Set/update monthly availability for a day/slot combination
  const setAvailability = async (
    coachId: string,
    year: number,
    month: number,
    dayOfWeek: DayOfWeek,
    timeSlot: TimeSlot,
    isAvailable: boolean,
    maxStudents?: number,
    notes?: string
  ) => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: upsertError } = await client
        .from('coach_availability')
        .upsert({
          coach_id: coachId,
          year,
          month,
          day_of_week: dayOfWeek,
          time_slot: timeSlot,
          is_available: isAvailable,
          max_students: maxStudents,
          notes,
        }, {
          onConflict: 'coach_id,year,month,day_of_week,time_slot',
        })
        .select()
        .single()
      
      if (upsertError) throw upsertError
      
      // Update local state
      const index = availability.value.findIndex(
        a => a.day_of_week === dayOfWeek && a.time_slot === timeSlot
      )
      if (index !== -1) {
        availability.value[index] = data as CoachAvailability
      } else {
        availability.value.push(data as CoachAvailability)
      }
      
      return { success: true, data }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to set availability'
      error.value = errorMsg
      return { success: false, error: errorMsg }
    } finally {
      loading.value = false
    }
  }

  // Bulk set availability for all slots in a month
  const setBulkAvailability = async (
    coachId: string,
    year: number,
    month: number,
    availabilityMap: Record<string, boolean> // key: "dayOfWeek-timeSlot"
  ) => {
    loading.value = true
    error.value = null
    
    const records = Object.entries(availabilityMap).map(([key, isAvailable]) => {
      const [dayOfWeek, timeSlot] = key.split('-') as [DayOfWeek, TimeSlot]
      return {
        coach_id: coachId,
        year,
        month,
        day_of_week: dayOfWeek,
        time_slot: timeSlot,
        is_available: isAvailable,
      }
    })
    
    try {
      const { data, error: upsertError } = await client
        .from('coach_availability')
        .upsert(records, {
          onConflict: 'coach_id,year,month,day_of_week,time_slot',
        })
        .select()
      
      if (upsertError) throw upsertError
      
      availability.value = data as CoachAvailability[]
      return { success: true, data }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to set bulk availability'
      error.value = errorMsg
      return { success: false, error: errorMsg }
    } finally {
      loading.value = false
    }
  }

  // Set a date-specific override (e.g., vacation, sick day)
  const setDateOverride = async (
    coachId: string,
    date: string,
    timeSlot: TimeSlot,
    isAvailable: boolean,
    reason?: string
  ) => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: upsertError } = await client
        .from('coach_date_availability')
        .upsert({
          coach_id: coachId,
          date,
          time_slot: timeSlot,
          is_available: isAvailable,
          reason,
        }, {
          onConflict: 'coach_id,date,time_slot',
        })
        .select()
        .single()
      
      if (upsertError) throw upsertError
      
      // Update local state
      const index = dateOverrides.value.findIndex(
        o => o.date === date && o.time_slot === timeSlot
      )
      if (index !== -1) {
        dateOverrides.value[index] = data as CoachDateAvailability
      } else {
        dateOverrides.value.push(data as CoachDateAvailability)
      }
      
      return { success: true, data }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to set date override'
      error.value = errorMsg
      return { success: false, error: errorMsg }
    } finally {
      loading.value = false
    }
  }

  // Remove a date-specific override
  const removeDateOverride = async (coachId: string, date: string, timeSlot: TimeSlot) => {
    loading.value = true
    error.value = null
    
    try {
      const { error: deleteError } = await client
        .from('coach_date_availability')
        .delete()
        .eq('coach_id', coachId)
        .eq('date', date)
        .eq('time_slot', timeSlot)
      
      if (deleteError) throw deleteError
      
      // Update local state
      dateOverrides.value = dateOverrides.value.filter(
        o => !(o.date === date && o.time_slot === timeSlot)
      )
      
      return { success: true }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to remove date override'
      error.value = errorMsg
      return { success: false, error: errorMsg }
    } finally {
      loading.value = false
    }
  }

  // Check if coach is available for a specific day/slot in a month
  const isAvailableFor = (dayOfWeek: DayOfWeek, timeSlot: TimeSlot): boolean => {
    const record = availability.value.find(
      a => a.day_of_week === dayOfWeek && a.time_slot === timeSlot
    )
    return record?.is_available ?? false
  }

  // Check if there's a date override for a specific date/slot
  const hasDateOverride = (date: string, timeSlot: TimeSlot): CoachDateAvailability | null => {
    return dateOverrides.value.find(
      o => o.date === date && o.time_slot === timeSlot
    ) || null
  }

  // Get effective availability for a date (considering overrides)
  const getEffectiveAvailability = (date: string, dayOfWeek: DayOfWeek, timeSlot: TimeSlot): boolean => {
    const override = hasDateOverride(date, timeSlot)
    if (override) {
      return override.is_available
    }
    return isAvailableFor(dayOfWeek, timeSlot)
  }

  return {
    availability,
    dateOverrides,
    loading,
    error,
    classDays,
    timeSlots,
    fetchMonthlyAvailability,
    fetchDateOverrides,
    setAvailability,
    setBulkAvailability,
    setDateOverride,
    removeDateOverride,
    isAvailableFor,
    hasDateOverride,
    getEffectiveAvailability,
  }
}
