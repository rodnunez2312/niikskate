<script setup lang="ts">
/**
 * The family's own copy of the Finanzas → Alumnos row: classes paid for, how
 * many are left, attendance, past and upcoming sessions, payments, and the
 * coupons an admin assigned to them.
 *
 * Finance tables are admin-only under RLS, so everything arrives from
 * /api/member/account rather than from Supabase directly.
 */
definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

import type {
  MemberAccountCoupon,
  MemberAccountSkater,
} from '~/server/api/member/account.get'
import {
  daysSinceDate,
  formatMoneyMxn,
  paymentToneForDays,
  remainingToneFor,
  weekdaysLabel,
} from '~/utils/finance'

const client = useSupabaseClient()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const loading = ref(true)
const loadError = ref('')
const skaters = ref<MemberAccountSkater[]>([])
const coupons = ref<MemberAccountCoupon[]>([])
const historyOpen = ref<Set<string>>(new Set())
const copiedCode = ref('')

const toggleHistory = (key: string) => {
  const next = new Set(historyOpen.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  historyOpen.value = next
}

const toneText = (tone: string) =>
  tone === 'bad' ? 'text-red-400' : tone === 'warn' ? 'text-amber-400' : 'text-teal-400'

const remainingClass = (left: number) => toneText(remainingToneFor(left))

const paymentClass = (ymd: string | null) => toneText(paymentToneForDays(daysSinceDate(ymd)))

const attendancePct = (s: MemberAccountSkater) => {
  const seen = s.totals.attended + s.totals.absences
  if (!seen) return null
  return Math.round((s.totals.attended / seen) * 100)
}

const formatDate = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(es.value ? 'es-MX' : 'en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

const formatTime = (t: string | null) => (t ? t.slice(0, 5) : '')

/** Nothing to show yet reads better than a grid of zeros. */
const hasAnyData = (s: MemberAccountSkater) =>
  s.plans.length > 0 || s.upcoming.length > 0 || s.past.length > 0 || s.payments.length > 0

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    copiedCode.value = code
    setTimeout(() => {
      if (copiedCode.value === code) copiedCode.value = ''
    }, 2000)
  } catch {
    /* clipboard blocked — the code is on screen anyway */
  }
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const { data: sessionData } = await client.auth.getSession()
    const token = sessionData?.session?.access_token
    if (!token) throw new Error(es.value ? 'Sesión expirada' : 'Session expired')

    const res = await $fetch<{ skaters: MemberAccountSkater[]; coupons: MemberAccountCoupon[] }>(
      '/api/member/account',
      { headers: { Authorization: `Bearer ${token}` } },
    )
    skaters.value = res.skaters || []
    coupons.value = res.coupons || []
  } catch (e: any) {
    loadError.value = e?.data?.message || e?.message || 'Error'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="px-4 pt-safe pb-2 max-w-lg mx-auto">
      <h1 class="text-2xl font-bold text-white pt-4">
        {{ es ? 'Mi cuenta' : 'My account' }}
      </h1>
      <p class="text-xs text-gray-500 mt-1">
        {{
          es
            ? 'Clases pagadas, asistencia, próximas sesiones y pagos de tu familia.'
            : 'Classes paid, attendance, upcoming sessions and payments for your family.'
        }}
      </p>
    </header>

    <div class="px-4 max-w-lg mx-auto space-y-6 mt-3">
      <div v-if="loading" class="space-y-4">
        <div v-for="i in 2" :key="i" class="h-56 bg-gray-900 rounded-2xl animate-pulse" />
      </div>

      <p v-else-if="loadError" class="text-sm text-red-400">{{ loadError }}</p>

      <template v-else>
        <NuxtLink
          v-if="!skaters.length"
          to="/member/student/profile"
          class="block rounded-2xl border border-gray-800 bg-gray-900 px-4 py-6 text-center text-sm text-gray-400"
        >
          {{
            es
              ? 'Aún no hay patinadores en tu familia. Agrega uno en Familia.'
              : 'No skaters in your family yet. Add one under Family.'
          }}
        </NuxtLink>

        <section
          v-for="s in skaters"
          :key="s.key"
          class="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden"
        >
          <div class="px-4 py-3 border-b border-gray-800 flex items-baseline justify-between gap-2">
            <h2 class="font-black uppercase text-white truncate">{{ s.name }}</h2>
            <span v-if="s.kind === 'self'" class="text-[10px] font-bold uppercase text-gold-400 shrink-0">
              {{ es ? 'Tú' : 'You' }}
            </span>
            <span
              v-else-if="s.kind === 'family'"
              class="text-[10px] font-bold uppercase text-gold-400 shrink-0"
            >
              {{ es ? 'Familia' : 'Family' }}
            </span>
          </div>

          <p v-if="!hasAnyData(s)" class="px-4 py-6 text-sm text-gray-500">
            {{
              es
                ? 'Todavía no hay clases ni pagos registrados para este patinador.'
                : 'No classes or payments recorded for this skater yet.'
            }}
          </p>

          <template v-else>
            <div class="grid grid-cols-3 divide-x divide-gray-800 border-b border-gray-800">
              <div class="px-3 py-3 text-center">
                <p class="text-[10px] font-bold uppercase text-gray-500">
                  {{ es ? 'Quedan' : 'Left' }}
                </p>
                <p class="text-xl font-black" :class="remainingClass(s.totals.remaining)">
                  {{ s.totals.remaining }}
                </p>
                <p class="text-[10px] text-gray-600">
                  {{ es ? `de ${s.totals.sessionsPaid} pagadas` : `of ${s.totals.sessionsPaid} paid` }}
                </p>
              </div>
              <div class="px-3 py-3 text-center">
                <p class="text-[10px] font-bold uppercase text-gray-500">
                  {{ es ? 'Asistencia' : 'Attendance' }}
                </p>
                <p class="text-xl font-black text-white">
                  {{ attendancePct(s) != null ? `${attendancePct(s)}%` : '—' }}
                </p>
                <p class="text-[10px] text-gray-600">
                  {{ s.totals.attended }} / {{ s.totals.attended + s.totals.absences }}
                </p>
              </div>
              <div class="px-3 py-3 text-center">
                <p class="text-[10px] font-bold uppercase text-gray-500">
                  {{ es ? 'Pagado' : 'Paid' }}
                </p>
                <p class="text-xl font-black text-white">
                  {{ formatMoneyMxn(s.totals.amountPaidMxn) }}
                </p>
                <p class="text-[10px]" :class="paymentClass(s.totals.lastPaymentOn)">
                  {{ s.totals.lastPaymentOn ? formatDate(s.totals.lastPaymentOn) : (es ? 'sin pago' : 'no payment') }}
                </p>
              </div>
            </div>

            <div v-if="s.plans.length" class="px-4 py-3 border-b border-gray-800 space-y-2">
              <p class="text-[10px] font-bold uppercase text-gray-500">
                {{ es ? 'Clases compradas' : 'Purchased classes' }}
              </p>
              <div
                v-for="plan in s.plans"
                :key="plan.id"
                class="flex items-baseline justify-between gap-2 text-sm"
              >
                <span class="text-white truncate">
                  {{ plan.label }}
                  <span v-if="plan.attendWeekdays.length" class="text-[10px] text-gray-500 font-mono">
                    · {{ weekdaysLabel(plan.attendWeekdays) }}
                  </span>
                </span>
                <span class="text-gray-400 shrink-0 tabular-nums">
                  {{ plan.sessionsPaid }} {{ es ? 'ses.' : 'sess.' }} ·
                  {{ formatMoneyMxn(plan.amountPaidMxn) }}
                </span>
              </div>
            </div>

            <div v-if="s.upcoming.length" class="px-4 py-3 border-b border-gray-800 space-y-2">
              <p class="text-[10px] font-bold uppercase text-gray-500">
                {{ es ? 'Próximas clases' : 'Upcoming classes' }}
              </p>
              <div
                v-for="c in s.upcoming"
                :key="'up-' + c.id"
                class="flex items-baseline justify-between gap-2 text-sm"
              >
                <span class="text-white truncate">{{ c.title }}</span>
                <span class="text-teal-400 shrink-0 font-mono text-xs">
                  {{ formatDate(c.date) }} {{ formatTime(c.startTime) }}
                </span>
              </div>
            </div>

            <div v-if="s.past.length" class="px-4 py-3 border-b border-gray-800">
              <button
                type="button"
                class="w-full flex items-center justify-between text-[10px] font-bold uppercase text-gray-500"
                @click="toggleHistory(s.key)"
              >
                <span>{{ es ? 'Clases pasadas' : 'Past classes' }} ({{ s.past.length }})</span>
                <span>{{ historyOpen.has(s.key) ? '−' : '+' }}</span>
              </button>
              <div v-if="historyOpen.has(s.key)" class="mt-2 space-y-2">
                <div
                  v-for="c in s.past"
                  :key="'past-' + c.id"
                  class="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span class="text-gray-300 truncate">{{ c.title }}</span>
                  <span class="text-gray-500 shrink-0 font-mono text-xs">{{ formatDate(c.date) }}</span>
                </div>
              </div>
            </div>

            <div v-if="s.payments.length" class="px-4 py-3 space-y-2">
              <p class="text-[10px] font-bold uppercase text-gray-500">
                {{ es ? 'Pagos realizados' : 'Payments made' }}
              </p>
              <div
                v-for="p in s.payments"
                :key="p.id"
                class="flex items-baseline justify-between gap-2 text-sm"
              >
                <span class="text-gray-300 truncate">
                  {{ formatDate(p.paidOn) }}
                  <span v-if="p.method" class="text-[10px] text-gray-500">· {{ p.method }}</span>
                </span>
                <span class="text-white shrink-0 tabular-nums font-bold">
                  {{ formatMoneyMxn(p.amountMxn) }}
                </span>
              </div>
            </div>
          </template>
        </section>

        <section v-if="coupons.length" class="space-y-3">
          <h2 class="text-sm font-black uppercase text-gold-400">
            {{ es ? 'Tus cupones' : 'Your coupons' }}
          </h2>
          <article
            v-for="c in coupons"
            :key="c.id"
            class="rounded-2xl border border-gold-500/30 bg-gold-500/5 px-4 py-3 space-y-1"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-black uppercase text-white truncate">
                {{ es ? c.labelEs : (c.labelEn || c.labelEs) }}
              </p>
              <button
                type="button"
                class="shrink-0 rounded-lg border border-gold-500/50 px-2 py-1 font-mono text-xs font-bold text-gold-300 hover:bg-gold-500/10"
                @click="copyCode(c.code)"
              >
                {{ copiedCode === c.code ? (es ? '¡Copiado!' : 'Copied!') : c.code }}
              </button>
            </div>
            <p v-if="c.description" class="text-xs text-gray-400">{{ c.description }}</p>
            <p class="text-xs text-gray-500">
              {{ es ? 'Ahorras' : 'You save' }} {{ formatMoneyMxn(c.sampleDiscountMxn) }}
              {{ es ? 'en un paquete de' : 'on a' }} {{ formatMoneyMxn(1000) }}
              <span v-if="c.expiresOn"> · {{ es ? 'vence' : 'expires' }} {{ formatDate(c.expiresOn) }}</span>
            </p>
            <p v-if="c.forNames.length" class="text-[10px] text-gray-600">
              {{ es ? 'Para' : 'For' }}: {{ c.forNames.join(', ') }}
            </p>
          </article>
          <p class="text-[11px] text-gray-600">
            {{
              es
                ? 'Escribe el código al inscribirte en una clase para aplicar el descuento.'
                : 'Enter the code when you register for a class to apply the discount.'
            }}
          </p>
        </section>
      </template>
    </div>
  </div>
</template>
