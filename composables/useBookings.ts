import type { Booking, BookingStatus, PaymentMethod } from '~/types'

export const useBookings = () => {
  const client = useSupabaseClient()
  const user = useSupabaseUser()
  
  const bookings = ref<Booking[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Fetch user's bookings
  const fetchUserBookings = async (status?: BookingStatus) => {
    if (!user.value) {
      error.value = 'User not authenticated'
      return
    }

    loading.value = true
    error.value = null
    
    try {
      let query = client
        .from('bookings')
        .select(`
          *,
          schedule:class_schedules(
            *,
            skate_class:skate_classes(*),
            coach:profiles!coach_id(id, full_name, avatar_url)
          )
        `)
        .eq('user_id', user.value.id)
        .order('booked_at', { ascending: false })
      
      if (status) {
        query = query.eq('status', status)
      }

      const { data, error: fetchError } = await query
      
      if (fetchError) throw fetchError
      bookings.value = data as Booking[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch bookings'
      console.error('Error fetching bookings:', e)
    } finally {
      loading.value = false
    }
  }

  // Create a new booking
  const createBooking = async (
    scheduleId: string,
    notes?: string,
    paymentMethod?: PaymentMethod
  ) => {
    if (!user.value) {
      return { success: false, error: 'User not authenticated' }
    }

    loading.value = true
    error.value = null
    
    try {
      // Check availability first
      const { data: availabilityData, error: availabilityError } = await client
        .rpc('check_class_availability', { schedule_uuid: scheduleId })
      
      if (availabilityError) throw availabilityError
      
      if (!availabilityData) {
        return { success: false, error: 'Class is fully booked' }
      }

      // Get schedule details for price
      const { data: scheduleData, error: scheduleError } = await client
        .from('class_schedules')
        .select(`
          price_override,
          skate_class:skate_classes(price)
        `)
        .eq('id', scheduleId)
        .single()
      
      if (scheduleError) throw scheduleError

      const price = scheduleData?.price_override || scheduleData?.skate_class?.price || 0

      // Create the booking
      const { data, error: insertError } = await client
        .from('bookings')
        .insert({
          user_id: user.value.id,
          schedule_id: scheduleId,
          status: 'pending',
          payment_status: 'pending',
          payment_method: paymentMethod,
          notes,
        })
        .select()
        .single()
      
      if (insertError) {
        if (insertError.code === '23505') {
          return { success: false, error: 'You have already booked this class' }
        }
        throw insertError
      }
      
      return { success: true, data, price }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to create booking'
      error.value = errorMessage
      console.error('Error creating booking:', e)
      return { success: false, error: errorMessage }
    } finally {
      loading.value = false
    }
  }

  // Confirm a booking (after payment)
  const confirmBooking = async (bookingId: string, amountPaid: number, paymentMethod: PaymentMethod) => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: updateError } = await client
        .from('bookings')
        .update({
          status: 'confirmed',
          payment_status: 'paid',
          payment_method: paymentMethod,
          amount_paid: amountPaid,
          confirmed_at: new Date().toISOString(),
        })
        .eq('id', bookingId)
        .select()
        .single()
      
      if (updateError) throw updateError
      
      return { success: true, data }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to confirm booking'
      error.value = errorMessage
      return { success: false, error: errorMessage }
    } finally {
      loading.value = false
    }
  }

  // Cancel a booking
  const cancelBooking = async (bookingId: string, reason?: string) => {
    if (!user.value) {
      return { success: false, error: 'User not authenticated' }
    }

    loading.value = true
    error.value = null
    
    try {
      const { data, error: updateError } = await client
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason,
        })
        .eq('id', bookingId)
        .eq('user_id', user.value.id)
        .select()
        .single()
      
      if (updateError) throw updateError
      
      // Update local state
      const index = bookings.value.findIndex(b => b.id === bookingId)
      if (index !== -1) {
        bookings.value[index] = data as Booking
      }
      
      return { success: true, data }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to cancel booking'
      error.value = errorMessage
      console.error('Error cancelling booking:', e)
      return { success: false, error: errorMessage }
    } finally {
      loading.value = false
    }
  }

  // Get upcoming bookings (confirmed only)
  const getUpcomingBookings = computed(() => {
    const now = new Date()
    return bookings.value.filter(b => {
      if (b.status !== 'confirmed' && b.status !== 'pending') return false
      const scheduleDate = new Date(b.schedule?.date || '')
      return scheduleDate >= now
    })
  })

  // Get past bookings
  const getPastBookings = computed(() => {
    const now = new Date()
    return bookings.value.filter(b => {
      const scheduleDate = new Date(b.schedule?.date || '')
      return scheduleDate < now || b.status === 'cancelled' || b.status === 'completed'
    })
  })

  // Fetch bookings for a schedule (admin/coach)
  const fetchScheduleBookings = async (scheduleId: string) => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: fetchError } = await client
        .from('bookings')
        .select(`
          *,
          user:profiles!user_id(id, full_name, email, phone, avatar_url)
        `)
        .eq('schedule_id', scheduleId)
        .order('booked_at')
      
      if (fetchError) throw fetchError
      return data as Booking[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch bookings'
      console.error('Error fetching schedule bookings:', e)
      return []
    } finally {
      loading.value = false
    }
  }

  // Update booking status (admin/coach)
  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    loading.value = true
    error.value = null
    
    try {
      const updates: Partial<Booking> = { status }
      
      if (status === 'confirmed') {
        updates.confirmed_at = new Date().toISOString()
      } else if (status === 'cancelled') {
        updates.cancelled_at = new Date().toISOString()
      }
      
      const { data, error: updateError } = await client
        .from('bookings')
        .update(updates)
        .eq('id', bookingId)
        .select()
        .single()
      
      if (updateError) throw updateError
      return { success: true, data }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to update booking'
      error.value = errorMessage
      return { success: false, error: errorMessage }
    } finally {
      loading.value = false
    }
  }

  return {
    bookings,
    loading,
    error,
    fetchUserBookings,
    createBooking,
    confirmBooking,
    cancelBooking,
    getUpcomingBookings,
    getPastBookings,
    fetchScheduleBookings,
    updateBookingStatus,
  }
}
