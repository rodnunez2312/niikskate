<script setup lang="ts">
import { addDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { UserCredit } from '~/types'
import { CREDIT_TYPE_INFO, type CreditType } from '~/types'

definePageMeta({
  middleware: ['auth'],
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
const loadError = ref<string | null>(null)
const recentGuestBookings = ref<
  { id: string; created_at: string; linked_user_id: string | null; booking_data: Record<string, unknown> }[]
>([])

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/admin/credits')
    return
  }
  const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if (data?.role !== 'admin') {
    router.push('/')
    return
  }
  isAdmin.value = true
  await Promise.all([loadPending(), loadRecentGuestBookings()])
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

const loadRecentGuestBookings = async () => {
  try {
    const { data, error } = await client
      .from('guest_bookings')
      .select('id, created_at, linked_user_id, booking_data')
      .not('linked_user_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(15)

    if (error) throw error
    recentGuestBookings.value = (data || []) as typeof recentGuestBookings.value
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

const formatWhen = (iso: string) =>
  format(new Date(iso), 'dd MMM yyyy HH:mm', { locale: language.value === 'es' ? es : undefined })

const summarizeBookingJson = (bd: Record<string, unknown>) => {
  const s = JSON.stringify(bd)
  return s.length > 420 ? `${s.slice(0, 420)}…` : s
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
        .update({ status: 'active' })
        .eq('credit_id', c.id)
        .eq('status', 'pending_payment')
      if (actErr) throw actErr
    }

    await loadPending()
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
      .eq('status', 'pending_payment')

    if (cancelResErr) throw cancelResErr

    const { error } = await client
      .from('user_credits')
      .update({
        payment_status: 'rejected',
        remaining_credits: 0,
      })
      .eq('id', c.id)

    if (error) throw error
    await loadPending()
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
        <button type="button" class="p-2 -ml-2 text-gold-400" @click="router.push('/admin')">
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

      <div v-else-if="rows.length === 0" class="text-center py-8 text-gray-500 space-y-4">
        <p>{{ language === 'es' ? 'No hay filas en user_credits pendientes.' : 'No pending user_credits rows.' }}</p>
        <p class="text-xs text-gray-600 max-w-sm mx-auto">
          {{
            language === 'es'
              ? 'Si el patinador compró pero aquí no aparece nada, el INSERT a user_credits falló (RLS). Ejecuta guest_bookings_and_credits_rls_fix.sql en Supabase.'
              : 'If the skater checked out but nothing appears here, user_credits INSERT failed (RLS). Run guest_bookings_and_credits_rls_fix.sql in Supabase.'
          }}
        </p>
      </div>

      <div v-else class="space-y-4">
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
        <h2 class="text-sm font-bold text-gray-400 mb-3">
          {{ language === 'es' ? 'Compras recientes (guest_bookings)' : 'Recent checkouts (guest_bookings)' }}
        </h2>
        <p class="text-xs text-gray-600 mb-4">
          {{
            language === 'es'
              ? 'Referencia: si ves una compra aquí pero no arriba, faltan políticas RLS o enum pending_payment.'
              : 'Reference: if a checkout appears here but not above, fix RLS or pending_payment enum.'
          }}
        </p>
        <ul v-if="recentGuestBookings.length" class="space-y-3 text-xs text-gray-400">
          <li
            v-for="g in recentGuestBookings"
            :key="g.id"
            class="bg-gray-900/80 border border-gray-800 rounded-xl p-3 font-mono break-all"
          >
            <span class="text-gray-500">{{ g.created_at?.slice(0, 16) }}</span>
            · user {{ g.linked_user_id?.slice(0, 8) }}…
            <pre class="mt-2 text-[10px] text-gray-500 whitespace-pre-wrap">{{ summarizeBookingJson(g.booking_data) }}</pre>
          </li>
        </ul>
        <p v-else class="text-xs text-gray-600">{{ language === 'es' ? 'Sin filas enlazadas.' : 'No linked rows.' }}</p>
      </section>
    </div>
  </div>
</template>
