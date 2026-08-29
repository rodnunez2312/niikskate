<script setup lang="ts">
/** Income ledger: capture what was collected and keep it editable like a sheet. */
import type { FinanceSheetColumn } from '~/components/member/FinanceSheet.vue'
import {
  FINANCE_COACH_TIERS,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  classKindLabel,
  coachTierSheetLabel,
  downloadCsv,
  effectivePriceMxn,
  formatMoneyMxn,
  incomeCategoryLabel,
  paymentsCsv,
  paymentsCsvName,
  sortPriceRows,
  summarizePayments,
  totalsByCategory,
  type FinancePaymentRow,
  type FinancePriceRow,
} from '~/utils/finance'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const client = useSupabaseClient()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const {
  payments,
  priceRows,
  loading,
  saving,
  error,
  loadPayments,
  loadPriceRows,
  addPayment,
  updatePayment,
  deletePayment,
} = useFinance()

const monthKey = ref(currentMonthKey())
const coaches = ref<Array<{ id: string; full_name: string }>>([])

async function reload() {
  await loadPayments(monthKeyRange(monthKey.value))
}

onMounted(async () => {
  await Promise.all([reload(), loadPriceRows()])
  try {
    coaches.value = await fetchCoachDirectoryProfiles(client, {
      select: 'id, full_name',
      activeOnly: true,
    })
  } catch (e) {
    console.error('load coaches failed', e)
  }
})

watch(monthKey, reload)

function shiftMonth(delta: number) {
  const [y, m] = monthKey.value.split('-').map(Number)
  const d = new Date(y, (m || 1) - 1 + delta, 1)
  monthKey.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const totals = computed(() => summarizePayments(payments.value))
const byCategory = computed(() =>
  totalsByCategory(
    payments.value
      .filter(p => p.status === 'paid')
      .map(p => ({ category: p.category, amount_mxn: Number(p.amount_mxn || 0) })),
  ),
)

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

const columns = computed((): FinanceSheetColumn[] => [
  { key: 'paid_on', label: es.value ? 'Fecha' : 'Date', type: 'date', width: 'w-36' },
  {
    key: 'amount_mxn',
    label: es.value ? 'Monto' : 'Amount',
    type: 'money',
    align: 'right',
    width: 'w-28',
    highlight: true,
  },
  {
    key: 'category',
    label: es.value ? 'Categoría' : 'Category',
    type: 'select',
    width: 'w-40',
    options: INCOME_CATEGORIES.map(c => ({
      value: c.id,
      label: `${c.emoji} ${es.value ? c.es : c.en}`,
    })),
  },
  {
    key: 'payment_method',
    label: es.value ? 'Método' : 'Method',
    type: 'select',
    width: 'w-32',
    options: PAYMENT_METHODS.map(m => ({
      value: m.id,
      label: `${m.emoji} ${es.value ? m.es : m.en}`,
    })),
  },
  {
    key: 'status',
    label: es.value ? 'Estatus' : 'Status',
    type: 'select',
    width: 'w-28',
    options: [
      { value: 'paid', label: es.value ? 'Pagado' : 'Paid' },
      { value: 'pending', label: es.value ? 'Pendiente' : 'Pending' },
      { value: 'refunded', label: es.value ? 'Reembolsado' : 'Refunded' },
    ],
  },
  {
    key: 'payer_name',
    label: es.value ? 'Pagado por' : 'Paid by',
    type: 'text',
    width: 'w-40',
    placeholder: es.value ? 'Nombre' : 'Name',
  },
  { key: 'academy_pct', label: es.value ? '% Acad.' : 'Acad. %', type: 'pct', align: 'right', width: 'w-20' },
  {
    key: 'academy_cut_mxn',
    label: es.value ? 'Academia' : 'Academy',
    type: 'computed',
    align: 'right',
    width: 'w-28',
    highlight: true,
    compute: row => formatMoneyMxn(Number((row as FinancePaymentRow).academy_cut_mxn ?? 0)),
  },
  {
    key: 'coach_pay_mxn',
    label: es.value ? 'Pago coach' : 'Coach pay',
    type: 'computed',
    align: 'right',
    width: 'w-28',
    compute: row => formatMoneyMxn(Number((row as FinancePaymentRow).coach_pay_mxn ?? 0)),
  },
  {
    key: 'package',
    label: es.value ? 'Paquete' : 'Package',
    type: 'computed',
    width: 'w-44',
    hideOnMobile: true,
    compute: row => {
      const r = row as FinancePaymentRow
      if (!r.class_kind) return '—'
      return `${coachTierSheetLabel(r.coach_tier, es.value)} · ${classKindLabel(r.class_kind, es.value)}`
    },
  },
  {
    key: 'reference',
    label: es.value ? 'Referencia' : 'Reference',
    type: 'text',
    width: 'w-32',
    hideOnMobile: true,
  },
  { key: 'notes', label: es.value ? 'Notas' : 'Notes', type: 'text', width: 'w-48', hideOnMobile: true },
])

const gridTotals = computed(
  (): Record<string, string> => ({
    paid_on: es.value ? 'Total' : 'Total',
    amount_mxn: formatMoneyMxn(totals.value.gross),
    academy_cut_mxn: formatMoneyMxn(totals.value.academyNet),
    coach_pay_mxn: formatMoneyMxn(totals.value.coachPayout),
  }),
)

async function onPatch(id: string, key: string, value: unknown) {
  const res = await updatePayment(id, { [key]: value } as Partial<FinancePaymentRow>)
  if (!res.ok && res.message) alert(res.message)
}

async function onRemove(id: string) {
  if (!confirm(es.value ? '¿Eliminar este ingreso?' : 'Delete this income row?')) return
  const res = await deletePayment(id)
  if (!res.ok && res.message) alert(res.message)
}

// ---------------------------------------------------------------------------
// Capture form
// ---------------------------------------------------------------------------

const showForm = ref(false)
const formError = ref('')

const blankForm = () => ({
  paid_on: new Date().toISOString().slice(0, 10),
  price_list_id: '',
  amount_mxn: '' as string | number,
  category: 'class_program',
  payment_method: 'cash',
  status: 'paid',
  payer_name: '',
  coach_id: '',
  reference: '',
  notes: '',
})

const form = ref(blankForm())

const priceOptions = computed(() => sortPriceRows(priceRows.value.filter(r => r.is_active)))

/** Selling a listed package fills in the price and the split it was sold under. */
function applyPriceRow(id: string) {
  const row = priceRows.value.find(r => r.id === id)
  if (!row) return
  form.value.amount_mxn = effectivePriceMxn(row)
  form.value.category = categoryForKind(row.class_kind)
}

function categoryForKind(kind: string | null): string {
  if (!kind) return 'other'
  if (kind.startsWith('monthly_')) return 'class_program'
  if (kind.startsWith('individual')) return 'individual'
  if (kind === 'group_session') return 'drop_in'
  return 'class_program'
}

async function submitPayment() {
  formError.value = ''
  const amount = Number(form.value.amount_mxn)
  if (!amount || amount <= 0) {
    formError.value = es.value ? 'Captura un monto mayor a 0.' : 'Enter an amount greater than 0.'
    return
  }

  const priceRow: FinancePriceRow | undefined = priceRows.value.find(
    r => r.id === form.value.price_list_id,
  )

  const res = await addPayment({
    paid_on: form.value.paid_on,
    amount_mxn: amount,
    category: form.value.category,
    payment_method: form.value.payment_method as FinancePaymentRow['payment_method'],
    status: form.value.status as FinancePaymentRow['status'],
    payer_name: form.value.payer_name || null,
    coach_id: form.value.coach_id || null,
    price_list_id: priceRow?.id ?? null,
    coach_tier: priceRow?.coach_tier ?? null,
    class_kind: priceRow?.class_kind ?? null,
    sessions: priceRow?.sessions ?? null,
    academy_pct: priceRow ? Number(priceRow.academy_pct) : 0,
    reference: form.value.reference || null,
    notes: form.value.notes || null,
  })

  if (!res.ok) {
    formError.value = res.message || (es.value ? 'No se pudo guardar.' : 'Could not save.')
    return
  }

  // Keep the month in view on the row that was just captured.
  const key = form.value.paid_on.slice(0, 7)
  form.value = blankForm()
  showForm.value = false
  if (key !== monthKey.value) monthKey.value = key
}

function exportCsv() {
  downloadCsv(paymentsCsvName(), paymentsCsv(payments.value, es.value))
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <MemberFinanceHeader
      :subtitle="es
        ? `Ingresos · ${payments.length} movimientos`
        : `Income · ${payments.length} entries`"
    >
      <template #actions>
        <button
          type="button"
          :disabled="!payments.length"
          class="px-3 py-2 rounded-xl border border-gray-700 text-gray-200 text-xs font-bold disabled:opacity-40"
          @click="exportCsv"
        >
          ⬇ CSV
        </button>
        <button
          type="button"
          class="px-3 py-2 rounded-xl bg-gold-400 text-black text-xs font-bold"
          @click="showForm = true"
        >
          + {{ es ? 'Ingreso' : 'Income' }}
        </button>
      </template>
    </MemberFinanceHeader>

    <div class="px-4 py-4 max-w-[1400px] mx-auto space-y-4">
      <p v-if="error" class="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
        {{ error }}
      </p>

      <!-- Month -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 text-gray-300"
          @click="shiftMonth(-1)"
        >
          ‹
        </button>
        <input
          v-model="monthKey"
          type="month"
          class="px-3 py-2 rounded-xl bg-gray-900 border border-gray-800 text-white text-sm"
        />
        <button
          type="button"
          class="w-9 h-9 rounded-xl bg-gray-900 border border-gray-800 text-gray-300"
          @click="shiftMonth(1)"
        >
          ›
        </button>
        <span v-if="loading" class="text-xs text-gray-500">{{ es ? 'Cargando…' : 'Loading…' }}</span>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div class="rounded-xl border border-gold-400/30 bg-gold-400/10 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Cobrado' : 'Collected' }}
          </p>
          <p class="text-xl font-bold text-gold-300 tabular-nums">{{ formatMoneyMxn(totals.gross) }}</p>
        </div>
        <div class="rounded-xl border border-glass-green/30 bg-glass-green/10 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Neto academia' : 'Academy net' }}
          </p>
          <p class="text-xl font-bold text-glass-green tabular-nums">{{ formatMoneyMxn(totals.academyNet) }}</p>
        </div>
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Pago a coaches' : 'Coach payout' }}
          </p>
          <p class="text-xl font-bold text-white tabular-nums">{{ formatMoneyMxn(totals.coachPayout) }}</p>
        </div>
        <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Pendiente' : 'Pending' }}
          </p>
          <p class="text-xl font-bold text-amber-300 tabular-nums">{{ formatMoneyMxn(totals.pending) }}</p>
        </div>
      </div>

      <div v-if="byCategory.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="c in byCategory"
          :key="c.category"
          class="text-[11px] px-2 py-1 rounded-lg bg-gray-900 border border-gray-800 text-gray-300"
        >
          {{ incomeCategoryLabel(c.category, es) }}
          <span class="text-white font-bold">{{ formatMoneyMxn(c.total) }}</span>
          <span class="text-gray-600">· {{ c.count }}</span>
        </span>
      </div>

      <MemberFinanceSheet
        :columns="columns"
        :rows="payments"
        title-key="payer_name"
        deletable
        :totals="gridTotals"
        :empty-text="es ? 'Sin ingresos este mes.' : 'No income this month.'"
        @patch="onPatch"
        @remove="onRemove"
      />

      <p class="text-[11px] text-gray-600 leading-snug">
        {{ es
          ? 'Neto academia y pago a coaches se calculan con el % Academia guardado en cada movimiento, no con el % actual de la lista de precios.'
          : 'Academy net and coach payout use the academy % stored on each entry, not the current price-list value.' }}
      </p>
    </div>

    <!-- Capture -->
    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div class="absolute inset-0 bg-black/80" @click="showForm = false" />
        <div
          class="relative bg-gray-900 border border-gray-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col"
        >
          <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
            <h3 class="text-lg font-bold text-white">
              {{ es ? 'Registrar ingreso' : 'Record income' }}
            </h3>
            <button type="button" class="p-2 text-gray-400" @click="showForm = false">✕</button>
          </div>

          <form class="p-5 space-y-3 overflow-y-auto" @submit.prevent="submitPayment">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Fecha' : 'Date' }}
                </label>
                <input
                  v-model="form.paid_on"
                  type="date"
                  required
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Monto (MXN)' : 'Amount (MXN)' }} *
                </label>
                <input
                  v-model="form.amount_mxn"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="decimal"
                  required
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-bold"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ es ? 'Paquete de la lista de precios' : 'Package from the price list' }}
              </label>
              <select
                v-model="form.price_list_id"
                class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                @change="applyPriceRow(form.price_list_id)"
              >
                <option value="">{{ es ? '— Sin paquete —' : '— No package —' }}</option>
                <optgroup
                  v-for="tier in FINANCE_COACH_TIERS"
                  :key="tier.id"
                  :label="es ? tier.es : tier.en"
                >
                  <option
                    v-for="row in priceOptions.filter(r => r.coach_tier === tier.id)"
                    :key="row.id"
                    :value="row.id"
                  >
                    {{ row.label_es }} — {{ formatMoneyMxn(effectivePriceMxn(row)) }}
                  </option>
                </optgroup>
              </select>
              <p class="text-[10px] text-gray-500 mt-1">
                {{ es
                  ? 'Al elegir un paquete se copia su precio y su % de academia al movimiento.'
                  : 'Picking a package copies its price and academy split onto the entry.' }}
              </p>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Categoría' : 'Category' }}
                </label>
                <select
                  v-model="form.category"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                >
                  <option v-for="c in INCOME_CATEGORIES" :key="c.id" :value="c.id">
                    {{ c.emoji }} {{ es ? c.es : c.en }}
                  </option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Estatus' : 'Status' }}
                </label>
                <select
                  v-model="form.status"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                >
                  <option value="paid">{{ es ? 'Pagado' : 'Paid' }}</option>
                  <option value="pending">{{ es ? 'Pendiente' : 'Pending' }}</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ es ? 'Método de pago' : 'Payment method' }}
              </label>
              <div class="grid grid-cols-4 gap-1.5">
                <button
                  v-for="m in PAYMENT_METHODS"
                  :key="m.id"
                  type="button"
                  class="py-2 rounded-xl text-[11px] font-semibold border transition-all"
                  :class="form.payment_method === m.id
                    ? 'border-gold-400 bg-gold-400/20 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-400'"
                  @click="form.payment_method = m.id"
                >
                  <span class="block text-base leading-none">{{ m.emoji }}</span>
                  {{ es ? m.es : m.en }}
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Pagado por' : 'Paid by' }}
                </label>
                <input
                  v-model="form.payer_name"
                  type="text"
                  :placeholder="es ? 'Familia / patinador' : 'Family / skater'"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Coach' : 'Coach' }}
                </label>
                <select
                  v-model="form.coach_id"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                >
                  <option value="">{{ es ? '— Ninguno —' : '— None —' }}</option>
                  <option v-for="c in coaches" :key="c.id" :value="c.id">{{ c.full_name }}</option>
                </select>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ es ? 'Referencia' : 'Reference' }}
              </label>
              <input
                v-model="form.reference"
                type="text"
                :placeholder="es ? 'Folio, transferencia…' : 'Receipt, transfer id…'"
                class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ es ? 'Notas' : 'Notes' }}
              </label>
              <textarea
                v-model="form.notes"
                rows="2"
                class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm resize-none"
              />
            </div>

            <p v-if="formError" class="text-xs text-red-300 bg-red-500/10 rounded-lg p-2">
              {{ formError }}
            </p>

            <div class="flex gap-3 pt-1">
              <button
                type="button"
                class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl"
                @click="showForm = false"
              >
                {{ es ? 'Cancelar' : 'Cancel' }}
              </button>
              <button
                type="submit"
                :disabled="saving"
                class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50"
              >
                {{ saving ? '…' : (es ? 'Guardar' : 'Save') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>
