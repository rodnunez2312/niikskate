<script setup lang="ts">
import { addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { UserCredit } from '~/types'
import { CREDIT_TYPE_INFO, type CreditType } from '~/types'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

const isAdmin = ref(false)
const loading = ref(true)
const rows = ref<UserCredit[]>([])
const profilesById = ref<Record<string, { full_name: string | null; email: string | null }>>({})
const processingId = ref<string | null>(null)
const processingWorkflowId = ref<string | null>(null)
const loadError = ref<string | null>(null)

type PendingWorkflowReservation = {
  id: string
  user_id: string
  reservation_date: string
  time_slot: string | null
  status: string
  credit_id: string | null
}

const pendingWorkflowReservations = ref<PendingWorkflowReservation[]>([])
const workflowProfilesById = ref<Record<string, { full_name: string | null; email: string | null }>>({})

const loadPendingWorkflow = async () => {
  try {
    const { data, error } = await client
      .from('class_reservations')
      .select('id, user_id, reservation_date, time_slot, status, credit_id')
      .eq('workflow_status', 'requested')
      .neq('status', 'cancelled')
      .order('reservation_date', { ascending: true })

    if (error) throw error
    pendingWorkflowReservations.value = (data || []) as PendingWorkflowReservation[]

    const ids = [...new Set(pendingWorkflowReservations.value.map(r => r.user_id))]
    if (ids.length === 0) {
      workflowProfilesById.value = {}
      return
    }
    const { data: profs } = await client.from('profiles').select('id, full_name, email').in('id', ids)
    const map: Record<string, { full_name: string | null; email: string | null }> = {}
    profs?.forEach((p: any) => {
      map[p.id] = { full_name: p.full_name, email: p.email }
    })
    workflowProfilesById.value = map
  } catch (e) {
    console.error('loadPendingWorkflow:', e)
  }
}

const slotLabel = (slot: string | null) => {
  if (slot === 'late') return language.value === 'es' ? '7:00 (tarde)' : '7:00 (late)'
  if (slot === 'early') return language.value === 'es' ? '5:30 (temprana)' : '5:30 (early)'
  return slot || '—'
}

const workflowSkaterLabel = (userId: string) => {
  const p = workflowProfilesById.value[userId]
  if (!p) return userId.slice(0, 8) + '…'
  return p.full_name || p.email || userId
}

const confirmWorkflowSlot = async (row: PendingWorkflowReservation) => {
  processingWorkflowId.value = row.id
  try {
    const { error } = await client
      .from('class_reservations')
      .update({ workflow_status: 'admin_confirmed' })
      .eq('id', row.id)
    if (error) throw error
    await loadPendingWorkflow()
  } catch (e) {
    console.error('confirmWorkflowSlot:', e)
  } finally {
    processingWorkflowId.value = null
  }
}
onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/member/admin/scheduling/credits')
    return
  }
  const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if (data?.role !== 'admin') {
    router.push('/')
    return
  }
  isAdmin.value = true
  await Promise.all([loadPending(), loadRecentGuestBookings(), loadPendingWorkflow()])
})

const loadPending = async () => {
  loading.value = true
  loadError.value = null
  try {
    const { data, error } = await client
      .from('user_credits')
      .select('*')
      .eq('payment_status', 'pending')
      .eq('remaining_credits', 0)
      .gt('total_credits', 0)
      .order('created_at', { ascending: false })

    if (error) throw error
    rows.value = data || []

    const ids = [...new Set(rows.value.map(r => r.user_id))]
    if (ids.length === 0) {
      profilesById.value = {}
      return
    }
    const { data: profs } = await client.from('profiles').select('id, full_name, email').in('id', ids)
    const map: Record<string, { full_name: string | null; email: string | null }> = {}
    profs?.forEach((p: any) => {
      map[p.id] = { full_name: p.full_name, email: p.email }
    })
    profilesById.value = map
  } catch (e: any) {
    console.error('loadPending credits:', e)
    loadError.value = e?.message || e?.error_description || String(e)
  } finally {
    loading.value = false
  }
}

type GuestBookingRow = {
  id: string
  created_at: string
  linked_user_id: string | null
  booking_data: Record<string, unknown>
}

type CreditMatchRow = {
  id: string
  user_id: string
  guest_booking_id: string | null
  payment_status: string | null
  price_paid_mxn: number | null
  created_at: string
}

type GuestBookingWithCredit = GuestBookingRow & { matchedCredit?: CreditMatchRow }

const recentGuestBookings = ref<GuestBookingWithCredit[]>([])
const guestBookingProfiles = ref<Record<string, { full_name: string | null; email: string | null }>>({})

const parseGuestBooking = (bd: Record<string, unknown> | null | undefined) => {
  if (!bd || typeof bd !== 'object') {
    return {
      className: '—',
      date: '—',
      session: '—' as const,
      totalMxn: '—',
      payment: '—',
      phone: null as string | null,
    }
  }
  const className = typeof bd.class_name === 'string' ? bd.class_name : '—'
  const date =
    typeof bd.date === 'string'
      ? bd.date
      : Array.isArray(bd.dates) && bd.dates.length
        ? String(bd.dates[0])
        : '—'
  const session = bd.session === 'late' ? 'late' : bd.session === 'early' ? 'early' : '—'
  const totalMxn = bd.total_mxn ?? bd.total_usd ?? '—'
  const payment = typeof bd.payment_method === 'string' ? bd.payment_method : '—'
  const phone = typeof bd.contact_phone === 'string' ? bd.contact_phone : null
  return { className, date, session, totalMxn, payment, phone }
}

const MATCH_WINDOW_MS = 6 * 60 * 1000

const findCreditForGuest = (g: GuestBookingRow, credits: CreditMatchRow[]): CreditMatchRow | undefined => {
  const byFk = credits.find(c => c.guest_booking_id === g.id)
  if (byFk) return byFk
  const uid = g.linked_user_id
  if (!uid) return undefined
  const t0 = new Date(g.created_at).getTime()
  const parsed = parseGuestBooking(g.booking_data)
  const wantMxn =
    typeof parsed.totalMxn === 'number'
      ? parsed.totalMxn
      : typeof parsed.totalMxn === 'string' && parsed.totalMxn !== '—'
        ? Number(parsed.totalMxn)
        : null

  const candidates = credits.filter(c => {
    if (c.user_id !== uid) return false
    const dt = Math.abs(new Date(c.created_at).getTime() - t0)
    if (dt > MATCH_WINDOW_MS) return false
    if (wantMxn != null && !Number.isNaN(wantMxn) && c.price_paid_mxn != null) {
      return Math.abs(Number(c.price_paid_mxn) - wantMxn) < 0.02
    }
    return true
  })
  if (candidates.length === 0) return undefined
  candidates.sort(
    (a, b) =>
      Math.abs(new Date(a.created_at).getTime() - t0) - Math.abs(new Date(b.created_at).getTime() - t0),
  )
  return candidates[0]
}

type HistoryOutcome = 'no_credit' | 'pending' | 'paid' | 'rejected' | 'failed'

const historyOutcome = (g: GuestBookingWithCredit): HistoryOutcome => {
  const c = g.matchedCredit
  if (!c) return 'no_credit'
  const s = (c.payment_status || 'pending').toLowerCase()
  if (s === 'paid') return 'paid'
  if (s === 'rejected') return 'rejected'
  if (s === 'failed') return 'failed'
  if (s === 'pending') return 'pending'
  return 'pending'
}

const loadRecentGuestBookings = async () => {
  try {
    const { data, error } = await client
      .from('guest_bookings')
      .select('id, created_at, linked_user_id, booking_data')
      .not('linked_user_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(35)

    if (error) throw error
    const bookings = (data || []) as GuestBookingRow[]

    const ids = [...new Set(bookings.map(g => g.linked_user_id).filter(Boolean) as string[])]
    let credits: CreditMatchRow[] = []
    if (ids.length > 0) {
      const { data: credData, error: credErr } = await client
        .from('user_credits')
        .select('id, user_id, guest_booking_id, payment_status, price_paid_mxn, created_at')
        .in('user_id', ids)
        .order('created_at', { ascending: false })
        .limit(250)

      if (credErr) {
        console.error('loadRecentGuestBookings credits:', credErr)
      } else {
        credits = (credData || []) as CreditMatchRow[]
      }
    }

    const usedCreditIds = new Set<string>()
    const withCredit: GuestBookingWithCredit[] = bookings.map(g => {
      const pool = credits.filter(c => !usedCreditIds.has(c.id))
      const m = findCreditForGuest(g, pool)
      if (m) usedCreditIds.add(m.id)
      return { ...g, matchedCredit: m }
    })

    recentGuestBookings.value = withCredit

    if (ids.length === 0) {
      guestBookingProfiles.value = {}
      return
    }
    const { data: profs } = await client.from('profiles').select('id, full_name, email').in('id', ids)
    const map: Record<string, { full_name: string | null; email: string | null }> = {}
    profs?.forEach((p: any) => {
      map[p.id] = { full_name: p.full_name, email: p.email }
    })
    guestBookingProfiles.value = map
  } catch (e) {
    console.error('loadRecentGuestBookings:', e)
  }
}

const labelType = (c: UserCredit) => {
  const info = CREDIT_TYPE_INFO[c.credit_type as CreditType]
  if (!info) return c.credit_type
  return language.value === 'es' ? info.name_es : info.name
}

const skaterLabel = (userId: string) => {
  const p = profilesById.value[userId]
  if (!p) return userId.slice(0, 8) + '…'
  return p.full_name || p.email || userId
}

const outcomeStatusLabel = (o: HistoryOutcome) => {
  const es = language.value === 'es'
  switch (o) {
    case 'paid':
      return es ? 'Pago exitoso' : 'Payment successful'
    case 'rejected':
      return es ? 'Pago rechazado' : 'Payment rejected'
    case 'failed':
      return es ? 'Pago fallido' : 'Payment failed'
    case 'pending':
      return es ? 'Pendiente de confirmar' : 'Awaiting confirmation'
    default:
      return es ? 'Sin crédito en BD' : 'No credit row'
  }
}

const outcomeStatusClass = (o: HistoryOutcome) => {
  switch (o) {
    case 'paid':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
    case 'rejected':
    case 'failed':
      return 'bg-red-500/15 text-red-300 border-red-500/35'
    case 'pending':
      return 'bg-amber-500/15 text-amber-200 border-amber-500/35'
    default:
      return 'bg-gray-800 text-gray-400 border-gray-700'
  }
}

const formatWhen = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return format(d, 'dd MMM yyyy HH:mm', { locale: language.value === 'es' ? es : undefined })
}

const approveCredit = async (c: UserCredit) => {
  processingId.value = c.id
  try {
    const expiration = addDays(new Date(), 30)

    const { data: pendingRes, error: countErr } = await client
      .from('class_reservations')
      .select('id')
      .eq('credit_id', c.id)
      .eq('status', 'pending_payment')

    if (countErr) throw countErr
    const pendingCount = pendingRes?.length ?? 0
    const newRemaining = Math.max(0, c.total_credits - pendingCount)

    const { error } = await client
      .from('user_credits')
      .update({
        remaining_credits: newRemaining,
        payment_status: 'paid',
        expiration_date: expiration.toISOString(),
      })
      .eq('id', c.id)

    if (error) throw error

    if (pendingCount > 0) {
      const { error: actErr } = await client
        .from('class_reservations')
        .update({ status: 'pending_skater_confirm', workflow_status: 'admin_confirmed' })
        .eq('credit_id', c.id)
        .eq('status', 'pending_payment')
      if (actErr) throw actErr
    }

    await Promise.all([loadPending(), loadRecentGuestBookings(), loadPendingWorkflow()])
  } catch (e) {
    console.error('approve credit:', e)
  } finally {
    processingId.value = null
  }
}

const rejectCredit = async (c: UserCredit) => {
  if (!confirm(language.value === 'es' ? '¿Rechazar esta compra?' : 'Reject this purchase?')) return
  processingId.value = c.id
  try {
    const { error: cancelResErr } = await client
      .from('class_reservations')
      .update({ status: 'cancelled' })
      .eq('credit_id', c.id)
      .in('status', ['pending_payment', 'pending_skater_confirm'])

    if (cancelResErr) throw cancelResErr

    const { error } = await client
      .from('user_credits')
      .update({
        payment_status: 'rejected',
        remaining_credits: 0,
      })
      .eq('id', c.id)

    if (error) throw error
    await Promise.all([loadPending(), loadRecentGuestBookings(), loadPendingWorkflow()])
  } catch (e) {
    console.error('reject credit:', e)
  } finally {
    processingId.value = null
  }
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40 pt-safe">
      <div class="px-4 py-4 max-w-lg mx-auto flex items-center gap-3">
        <button type="button" class="p-2 -ml-2 text-gold-400" @click="router.push('/member/admin/scheduling')">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 class="text-xl font-bold text-white">
            {{ language === 'es' ? 'Créditos por confirmar' : 'Credits to confirm' }}
          </h1>
          <p class="text-xs text-gray-500">
            {{ language === 'es' ? 'Pago presencial / transferencia' : 'Cash or transfer payments' }}
          </p>
        </div>
      </div>
    </header>

    <div class="px-4 py-6 max-w-lg mx-auto">
      <div v-if="loadError" class="mb-6 rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-red-200 text-sm">
        <p class="font-semibold">{{ language === 'es' ? 'Error al cargar créditos' : 'Error loading credits' }}</p>
        <p class="text-xs mt-2 font-mono break-all">{{ loadError }}</p>
      </div>

      <div v-if="loading" class="flex justify-center py-16">
        <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
      </div>

      <div v-else-if="rows.length > 0" class="space-y-4">
        <div
          v-for="c in rows"
          :key="c.id"
          class="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3"
        >
          <div class="flex justify-between gap-2">
            <div>
              <p class="font-bold text-white">{{ skaterLabel(c.user_id) }}</p>
              <p class="text-xs text-gray-500 truncate max-w-[220px]">
                {{ profilesById[c.user_id]?.email || '' }}
              </p>
            </div>
            <span class="text-gold-400 font-bold text-lg shrink-0">{{ c.total_credits }}</span>
          </div>
          <p class="text-sm text-gray-300">{{ labelType(c) }}</p>
          <div class="text-xs text-gray-500 space-y-1">
            <p>
              {{ language === 'es' ? 'Total MXN' : 'Total MXN' }}:
              <span class="text-gray-300">{{ c.price_paid_mxn ?? '—' }}</span>
            </p>
            <p>{{ formatWhen(c.created_at) }}</p>
          </div>
          <div class="flex gap-2 pt-2">
            <button
              type="button"
              class="flex-1 py-3 rounded-xl bg-glass-green text-white font-semibold text-sm disabled:opacity-50"
              :disabled="processingId === c.id"
              @click="approveCredit(c)"
            >
              {{ language === 'es' ? 'Confirmar pago' : 'Confirm payment' }}
            </button>
            <button
              type="button"
              class="flex-1 py-3 rounded-xl bg-gray-800 text-gray-300 font-semibold text-sm disabled:opacity-50"
              :disabled="processingId === c.id"
              @click="rejectCredit(c)"
            >
              {{ language === 'es' ? 'Rechazar' : 'Reject' }}
            </button>
          </div>
        </div>
      </div>

      <section v-if="!loading" class="mt-10 pt-8 border-t border-gray-800">
        <h2 class="text-sm font-bold text-gray-400 mb-2">
          {{ language === 'es' ? 'Cupos por confirmar (solicitud del patinador)' : 'Slots to confirm (skater request)' }}
        </h2>
        <p class="text-xs text-gray-600 mb-4">
          {{
            language === 'es'
              ? 'Amarillo en el calendario hasta que confirmes que el horario está disponible; luego azul hasta asistencia.'
              : 'Calendar stays yellow until you confirm the slot is available; then blue until attendance is marked.'
          }}
        </p>
        <ul v-if="pendingWorkflowReservations.length" class="space-y-3 mb-2">
          <li
            v-for="r in pendingWorkflowReservations"
            :key="r.id"
            class="bg-gray-900 border border-amber-500/25 rounded-2xl p-4 space-y-2"
          >
            <div class="flex justify-between gap-2">
              <div>
                <p class="font-bold text-white">{{ workflowSkaterLabel(r.user_id) }}</p>
                <p class="text-xs text-gray-500 truncate max-w-[220px]">
                  {{ workflowProfilesById[r.user_id]?.email || '' }}
                </p>
              </div>
              <span class="text-[10px] uppercase text-amber-400/90 shrink-0">{{ r.status }}</span>
            </div>
            <p class="text-sm text-gray-300">
              {{ r.reservation_date }}
              <span class="text-gray-500"> · </span>
              {{ slotLabel(r.time_slot) }}
            </p>
            <button
              type="button"
              class="w-full py-3 rounded-xl bg-sky-900/50 border border-sky-500/35 text-sky-100 font-semibold text-sm disabled:opacity-50"
              :disabled="processingWorkflowId === r.id"
              @click="confirmWorkflowSlot(r)"
            >
              {{ language === 'es' ? 'Confirmar cupo disponible' : 'Confirm slot available' }}
            </button>
          </li>
        </ul>
        <p v-else class="text-xs text-gray-600">
          {{ language === 'es' ? 'No hay solicitudes de cupo pendientes.' : 'No pending slot requests.' }}
        </p>
      </section>

      <section v-if="!loading" class="mt-10 pt-8 border-t border-gray-800">
        <h2 class="text-sm font-bold text-gray-400 mb-3">
          {{ language === 'es' ? 'Compras recientes (guest_bookings)' : 'Recent checkouts (guest_bookings)' }}
        </h2>
        <p class="text-xs text-gray-600 mb-4">
          {{
            language === 'es'
              ? 'Estado según user_credits: exitoso, pendiente, rechazado o fallido. Las rechazadas siguen apareciendo aquí.'
              : 'Status from user_credits: successful, pending, rejected, or failed. Rejected purchases stay in this list.'
          }}
        </p>
        <ul v-if="recentGuestBookings.length" class="space-y-3 text-sm text-gray-300">
          <li
            v-for="g in recentGuestBookings"
            :key="g.id"
            class="bg-gray-900/80 border border-gray-800 rounded-xl p-4 space-y-2"
          >
            <div class="flex justify-between gap-2 text-xs text-gray-500">
              <span>{{ formatWhen(g.created_at) }}</span>
              <span class="font-mono text-[10px] truncate max-w-[140px]" :title="g.linked_user_id || ''">
                {{ g.linked_user_id ? g.linked_user_id.slice(0, 8) + '…' : '—' }}
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border"
                :class="outcomeStatusClass(historyOutcome(g))"
              >
                {{ outcomeStatusLabel(historyOutcome(g)) }}
              </span>
              <span
                v-if="g.matchedCredit?.id"
                class="font-mono text-[10px] text-gray-600 truncate max-w-[200px]"
                :title="g.matchedCredit.id"
              >
                credit {{ g.matchedCredit.id.slice(0, 8) }}…
              </span>
            </div>
            <div class="flex gap-2">
              <div
                class="flex-1 py-2.5 rounded-xl text-center text-xs font-semibold border"
                :class="
                  historyOutcome(g) === 'paid'
                    ? 'bg-emerald-900/40 border-emerald-500/45 text-emerald-200'
                    : 'bg-gray-950/60 border-gray-800 text-gray-600'
                "
              >
                {{ language === 'es' ? 'Aceptado' : 'Accepted' }}
              </div>
              <div
                class="flex-1 py-2.5 rounded-xl text-center text-xs font-semibold border"
                :class="
                  historyOutcome(g) === 'rejected' || historyOutcome(g) === 'failed'
                    ? 'bg-red-900/40 border-red-500/45 text-red-200'
                    : 'bg-gray-950/60 border-gray-800 text-gray-600'
                "
              >
                {{ language === 'es' ? 'Rechazado' : 'Rejected' }}
              </div>
            </div>
            <p class="font-semibold text-white">
              {{
                guestBookingProfiles[g.linked_user_id || '']?.full_name ||
                  guestBookingProfiles[g.linked_user_id || '']?.email ||
                  (language === 'es' ? 'Usuario' : 'User')
              }}
            </p>
            <p v-if="guestBookingProfiles[g.linked_user_id || '']?.email" class="text-xs text-gray-500">
              {{ guestBookingProfiles[g.linked_user_id || ''].email }}
            </p>
            <dl class="grid grid-cols-2 gap-x-2 gap-y-1 text-xs border-t border-gray-800 pt-2 mt-2">
              <dt class="text-gray-500">{{ language === 'es' ? 'Clase' : 'Class' }}</dt>
              <dd>{{ parseGuestBooking(g.booking_data).className }}</dd>
              <dt class="text-gray-500">{{ language === 'es' ? 'Fecha' : 'Date' }}</dt>
              <dd>{{ parseGuestBooking(g.booking_data).date }}</dd>
              <dt class="text-gray-500">{{ language === 'es' ? 'Horario' : 'Slot' }}</dt>
              <dd>
                {{
                  parseGuestBooking(g.booking_data).session === 'late'
                    ? '7:00 (tarde)'
                    : parseGuestBooking(g.booking_data).session === 'early'
                      ? '5:30 (temprana)'
                      : '—'
                }}
              </dd>
              <dt class="text-gray-500">{{ language === 'es' ? 'Total' : 'Total' }}</dt>
              <dd>{{ parseGuestBooking(g.booking_data).totalMxn }} MXN</dd>
              <dt class="text-gray-500">{{ language === 'es' ? 'Pago' : 'Payment' }}</dt>
              <dd class="capitalize">{{ parseGuestBooking(g.booking_data).payment }}</dd>
              <template v-if="parseGuestBooking(g.booking_data).phone">
                <dt class="text-gray-500">{{ language === 'es' ? 'Tel' : 'Phone' }}</dt>
                <dd class="font-mono text-[11px]">{{ parseGuestBooking(g.booking_data).phone }}</dd>
              </template>
            </dl>
          </li>
        </ul>
        <p v-else class="text-xs text-gray-600">{{ language === 'es' ? 'Sin filas enlazadas.' : 'No linked rows.' }}</p>
      </section>
    </div>
  </div>
</template>
