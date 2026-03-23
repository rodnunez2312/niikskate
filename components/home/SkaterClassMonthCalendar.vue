<script setup lang="ts">
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  isSameMonth,
  isToday,
  isBefore,
  startOfDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { ClassReservation } from '~/types'

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()
const { isClassDay } = useClasses()

const calendarMonth = ref(new Date())
const reservations = ref<ClassReservation[]>([])
/** Dates from latest linked guest_booking when class_reservations failed or RLS blocked (same shape for template). */
const guestOverlay = ref<ClassReservation[]>([])
const loading = ref(true)

const monthLabel = computed(() =>
  format(calendarMonth.value, 'LLLL yyyy', { locale: language.value === 'es' ? es : undefined })
)

const calendarCells = computed(() => {
  const start = startOfWeek(startOfMonth(calendarMonth.value), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(calendarMonth.value), { weekStartsOn: 0 })
  return eachDayOfInterval({ start, end })
})

const reservationsByDate = computed(() => {
  const map: Record<string, ClassReservation[]> = {}
  for (const r of reservations.value) {
    const d = r.reservation_date
    if (!map[d]) map[d] = []
    map[d].push(r)
  }
  for (const r of guestOverlay.value) {
    const d = r.reservation_date
    if (map[d]?.length) continue
    if (!map[d]) map[d] = []
    map[d].push(r)
  }
  return map
})

const fetchGuestOverlay = async () => {
  guestOverlay.value = []
  if (!user.value?.id) return
  try {
    const { data, error } = await client
      .from('guest_bookings')
      .select('booking_data, created_at')
      .eq('linked_user_id', user.value.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) throw error
    const row = data?.[0] as { booking_data?: Record<string, unknown>; created_at?: string } | undefined
    const bd = row?.booking_data
    if (!bd || typeof bd !== 'object') return
    if (row.created_at) {
      const ageMs = Date.now() - new Date(row.created_at).getTime()
      if (ageMs > 90 * 24 * 60 * 60 * 1000) return
    }

    const sessionRaw = bd.session
    const slot: 'early' | 'late' = sessionRaw === 'late' ? 'late' : 'early'
    const dates: string[] = []
    if (Array.isArray(bd.dates)) {
      for (const x of bd.dates) {
        if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) dates.push(x)
      }
    }
    if (typeof bd.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(bd.date)) {
      dates.push(bd.date)
    }
    const uid = user.value.id
    guestOverlay.value = dates.map((reservation_date, i) => ({
      id: `guest-overlay-${reservation_date}-${i}`,
      user_id: uid,
      reservation_date,
      time_slot: slot,
      status: 'pending_payment' as const,
      created_at: row?.created_at || '',
      updated_at: row?.created_at || '',
    })) as ClassReservation[]
  } catch (e) {
    console.error('SkaterClassMonthCalendar guest overlay:', e)
    guestOverlay.value = []
  }
}

const fetchMonth = async () => {
  if (!user.value?.id) {
    reservations.value = []
    guestOverlay.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const from = format(startOfMonth(calendarMonth.value), 'yyyy-MM-dd')
    const to = format(endOfMonth(calendarMonth.value), 'yyyy-MM-dd')
    const { data, error } = await client
      .from('class_reservations')
      .select('*')
      .eq('user_id', user.value.id)
      .or('status.eq.active,status.eq.pending_payment')
      .gte('reservation_date', from)
      .lte('reservation_date', to)
      .order('reservation_date')

    if (error) throw error
    reservations.value = data || []
    await fetchGuestOverlay()
  } catch (e) {
    console.error('SkaterClassMonthCalendar:', e)
    await fetchGuestOverlay()
  } finally {
    loading.value = false
  }
}

// Watch user id + month only — the full `user` ref identity changes often (token refresh) and would refetch in a tight loop.
watch(
  [() => user.value?.id ?? null, () => calendarMonth.value.getTime()],
  () => fetchMonth(),
  { immediate: true }
)

const slotShort = (slot: string) => (slot === 'early' ? '5:30' : '7:00')

const dayClasses = (date: Date) => {
  const key = format(date, 'yyyy-MM-dd')
  return reservationsByDate.value[key] || []
}

const isPastDay = (date: Date) => isBefore(startOfDay(date), startOfDay(new Date()))
</script>

<template>
  <div class="bg-black/70 backdrop-blur-sm rounded-2xl p-4 border border-glass-blue/40">
    <div class="flex items-center justify-between gap-2 mb-3">
      <h2 class="text-lg font-bold text-white">
        {{ language === 'es' ? 'Mis clases' : 'My classes' }}
      </h2>
      <NuxtLink to="/user/reservations" class="text-xs font-semibold text-glass-blue hover:text-glass-blue/80">
        {{ language === 'es' ? 'Gestionar' : 'Manage' }}
      </NuxtLink>
    </div>

    <div class="flex items-center justify-between mb-3">
      <button
        type="button"
        class="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
        :aria-label="language === 'es' ? 'Mes anterior' : 'Previous month'"
        @click="calendarMonth = addMonths(calendarMonth, -1)"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <span class="text-white font-semibold capitalize text-sm text-center flex-1 px-2">{{ monthLabel }}</span>
      <button
        type="button"
        class="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
        :aria-label="language === 'es' ? 'Mes siguiente' : 'Next month'"
        @click="calendarMonth = addMonths(calendarMonth, 1)"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <div class="grid grid-cols-7 gap-1 text-center text-[10px] text-gray-500 font-bold uppercase mb-1">
      <template v-if="language === 'es'">
        <span>D</span><span>L</span><span>M</span><span>X</span><span>J</span><span>V</span><span>S</span>
      </template>
      <template v-else>
        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
      </template>
    </div>

    <div v-if="loading" class="h-40 bg-gray-800/50 rounded-xl animate-pulse"></div>
    <div v-else class="grid grid-cols-7 gap-1">
      <div
        v-for="(date, idx) in calendarCells"
        :key="idx"
        class="min-h-[2.75rem] rounded-lg flex flex-col items-center justify-start pt-1 text-xs border border-transparent"
        :class="[
          !isSameMonth(date, calendarMonth) ? 'opacity-25' : '',
          isToday(date) ? 'ring-1 ring-gold-400 bg-gold-400/10' : '',
          isClassDay(date) && isSameMonth(date, calendarMonth) ? 'bg-gray-800/60' : '',
        ]"
      >
        <span
          class="font-semibold"
          :class="[
            isPastDay(date) ? 'text-gray-500' : 'text-gray-200',
            isToday(date) ? 'text-gold-400' : '',
          ]"
        >
          {{ format(date, 'd') }}
        </span>
        <div v-if="dayClasses(date).length" class="flex flex-wrap gap-0.5 justify-center mt-0.5 px-0.5 w-full">
          <span
            v-for="r in dayClasses(date)"
            :key="r.id"
            class="text-[8px] font-bold px-1 rounded leading-tight max-w-full truncate"
            :class="
              isPastDay(date)
                ? 'bg-gray-600/80 text-gray-300'
                : r.status === 'pending_payment'
                  ? 'bg-amber-500/35 text-amber-200 border border-amber-500/40'
                  : 'bg-glass-green/40 text-glass-green'
            "
            :title="
              r.status === 'pending_payment'
                ? (language === 'es' ? 'Pendiente de confirmación de pago' : 'Pending payment confirmation')
                : r.time_slot === 'early'
                  ? '5:30 PM – 7:00 PM'
                  : '7:00 PM – 8:30 PM'
            "
          >
            {{ slotShort(r.time_slot) }}
          </span>
        </div>
      </div>
    </div>

    <p class="text-[10px] text-gray-500 mt-3 text-center">
      {{
        language === 'es'
          ? 'Horarios: 5:30 (temprana) y 7:00 (tarde). Ámbar = pendiente de pago.'
          : 'Times: 5:30 (early) and 7:00 (late). Amber = payment pending.'
      }}
    </p>
  </div>
</template>
