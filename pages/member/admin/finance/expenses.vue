<script setup lang="ts">
/** Expense ledger. Recurring rows are what set the monthly floor in the overview. */
import type { FinanceSheetColumn } from '~/components/member/FinanceSheet.vue'
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  RECURRENCES,
  downloadCsv,
  expenseCategoryLabel,
  expensesCsv,
  expensesCsvName,
  formatMoneyMxn,
  monthlyAmount,
  monthlyFixedCostMxn,
  summarizeExpenses,
  totalsByCategory,
  type FinanceExpenseRow,
} from '~/utils/finance'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const client = useSupabaseClient()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const {
  expenses,
  loading,
  saving,
  error,
  loadExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
} = useFinance()

const monthKey = ref(currentMonthKey())
const coaches = ref<Array<{ id: string; full_name: string }>>([])

async function reload() {
  await loadExpenses(monthKeyRange(monthKey.value))
}

onMounted(async () => {
  await reload()
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

const oneOff = computed(() => expenses.value.filter(e => !e.is_recurring))
const recurring = computed(() => expenses.value.filter(e => e.is_recurring))

const totals = computed(() => summarizeExpenses(expenses.value))
const fixedMonthly = computed(() => monthlyFixedCostMxn(recurring.value))
const byCategory = computed(() =>
  totalsByCategory(
    expenses.value.map(e => ({ category: e.category, amount_mxn: Number(e.amount_mxn || 0) })),
  ),
)

const columns = computed((): FinanceSheetColumn[] => [
  { key: 'incurred_on', label: es.value ? 'Fecha' : 'Date', type: 'date', width: 'w-36' },
  {
    key: 'category',
    label: es.value ? 'Categoría' : 'Category',
    type: 'select',
    width: 'w-40',
    options: EXPENSE_CATEGORIES.map(c => ({
      value: c.id,
      label: `${c.emoji} ${es.value ? c.es : c.en}`,
    })),
  },
  {
    key: 'description',
    label: es.value ? 'Descripción' : 'Description',
    type: 'text',
    width: 'w-56',
    placeholder: es.value ? '¿Qué se pagó?' : 'What was paid?',
  },
  {
    key: 'amount_mxn',
    label: es.value ? 'Monto' : 'Amount',
    type: 'money',
    align: 'right',
    width: 'w-28',
    highlight: true,
  },
  {
    key: 'vendor',
    label: es.value ? 'Proveedor' : 'Vendor',
    type: 'text',
    width: 'w-40',
    hideOnMobile: true,
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
    ],
  },
  {
    key: 'is_recurring',
    label: es.value ? 'Fijo' : 'Fixed',
    type: 'checkbox',
    align: 'center',
    width: 'w-16',
  },
  {
    key: 'recurrence',
    label: es.value ? 'Frecuencia' : 'Frequency',
    type: 'select',
    width: 'w-32',
    options: [
      { value: '', label: '—' },
      ...RECURRENCES.map(r => ({ value: r.id, label: es.value ? r.es : r.en })),
    ],
  },
  {
    key: 'monthly',
    label: es.value ? 'Por mes' : 'Per month',
    type: 'computed',
    align: 'right',
    width: 'w-28',
    compute: row => {
      const monthly = monthlyAmount(row as FinanceExpenseRow)
      return monthly ? formatMoneyMxn(monthly) : '—'
    },
  },
  { key: 'notes', label: es.value ? 'Notas' : 'Notes', type: 'text', width: 'w-44', hideOnMobile: true },
])

const recurringTotals = computed(
  (): Record<string, string> => ({
    incurred_on: es.value ? 'Total fijo' : 'Fixed total',
    amount_mxn: formatMoneyMxn(recurring.value.reduce((s, r) => s + Number(r.amount_mxn || 0), 0)),
    monthly: formatMoneyMxn(fixedMonthly.value),
  }),
)

const oneOffTotals = computed(
  (): Record<string, string> => ({
    incurred_on: es.value ? 'Total mes' : 'Month total',
    amount_mxn: formatMoneyMxn(oneOff.value.reduce((s, r) => s + Number(r.amount_mxn || 0), 0)),
  }),
)

async function onPatch(id: string, key: string, value: unknown) {
  const patch: Record<string, unknown> = { [key]: value }
  // A row marked fixed needs a frequency for the monthly figure to mean anything.
  if (key === 'is_recurring') {
    const row = expenses.value.find(e => e.id === id)
    if (value === true && !row?.recurrence) patch.recurrence = 'monthly'
    if (value === false) patch.recurrence = null
  }
  const res = await updateExpense(id, patch as Partial<FinanceExpenseRow>)
  if (!res.ok && res.message) alert(res.message)
}

async function onRemove(id: string) {
  if (!confirm(es.value ? '¿Eliminar este gasto?' : 'Delete this expense?')) return
  const res = await deleteExpense(id)
  if (!res.ok && res.message) alert(res.message)
}

// ---------------------------------------------------------------------------
// Capture form
// ---------------------------------------------------------------------------

const showForm = ref(false)
const formError = ref('')

const blankForm = () => ({
  incurred_on: new Date().toISOString().slice(0, 10),
  category: 'rent',
  description: '',
  vendor: '',
  amount_mxn: '' as string | number,
  payment_method: 'cash',
  status: 'paid',
  is_recurring: false,
  recurrence: 'monthly',
  coach_id: '',
  reference: '',
  notes: '',
})

const form = ref(blankForm())

async function submitExpense() {
  formError.value = ''
  const amount = Number(form.value.amount_mxn)
  if (!amount || amount <= 0) {
    formError.value = es.value ? 'Captura un monto mayor a 0.' : 'Enter an amount greater than 0.'
    return
  }
  if (form.value.category === 'coaches' && !form.value.coach_id) {
    formError.value = es.value ? 'Selecciona el coach.' : 'Select the coach.'
    return
  }

  const res = await addExpense({
    incurred_on: form.value.incurred_on,
    category: form.value.category,
    description: form.value.description || null,
    vendor: form.value.vendor || null,
    amount_mxn: amount,
    payment_method: form.value.payment_method as FinanceExpenseRow['payment_method'],
    status: form.value.status as FinanceExpenseRow['status'],
    is_recurring: form.value.is_recurring,
    recurrence: form.value.is_recurring
      ? (form.value.recurrence as FinanceExpenseRow['recurrence'])
      : null,
    coach_id: form.value.coach_id || null,
    reference: form.value.reference || null,
    notes: form.value.notes || null,
  })

  if (!res.ok) {
    formError.value = res.message || (es.value ? 'No se pudo guardar.' : 'Could not save.')
    return
  }

  const key = form.value.incurred_on.slice(0, 7)
  form.value = blankForm()
  showForm.value = false
  if (key !== monthKey.value) monthKey.value = key
}

function exportCsv() {
  downloadCsv(expensesCsvName(), expensesCsv(expenses.value, es.value))
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <MemberFinanceHeader
      :subtitle="es
        ? `Gastos · fijo mensual ${formatMoneyMxn(fixedMonthly)}`
        : `Expenses · fixed monthly ${formatMoneyMxn(fixedMonthly)}`"
    >
      <template #actions>
        <button
          type="button"
          :disabled="!expenses.length"
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
          + {{ es ? 'Gasto' : 'Expense' }}
        </button>
      </template>
    </MemberFinanceHeader>

    <div class="px-4 py-4 max-w-[1400px] mx-auto space-y-4">
      <p v-if="error" class="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
        {{ error }}
      </p>

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

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <div class="rounded-xl border border-red-500/30 bg-red-500/10 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Gasto del mes' : 'Month spend' }}
          </p>
          <p class="text-xl font-bold text-red-300 tabular-nums">{{ formatMoneyMxn(totals.paid) }}</p>
        </div>
        <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Por pagar' : 'Unpaid' }}
          </p>
          <p class="text-xl font-bold text-amber-300 tabular-nums">{{ formatMoneyMxn(totals.pending) }}</p>
        </div>
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Costo fijo / mes' : 'Fixed cost / month' }}
          </p>
          <p class="text-xl font-bold text-white tabular-nums">{{ formatMoneyMxn(fixedMonthly) }}</p>
        </div>
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Movimientos' : 'Entries' }}
          </p>
          <p class="text-xl font-bold text-white tabular-nums">{{ totals.count }}</p>
        </div>
      </div>

      <div v-if="byCategory.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="c in byCategory"
          :key="c.category"
          class="text-[11px] px-2 py-1 rounded-lg bg-gray-900 border border-gray-800 text-gray-300"
        >
          {{ expenseCategoryLabel(c.category, es) }}
          <span class="text-white font-bold">{{ formatMoneyMxn(c.total) }}</span>
          <span class="text-gray-600">· {{ c.count }}</span>
        </span>
      </div>

      <!-- Fixed costs first: these drive the break-even number -->
      <section class="space-y-2">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-bold text-white">
            🔁 {{ es ? 'Costos fijos' : 'Fixed costs' }}
          </h2>
          <p class="text-[11px] text-gray-500">
            {{ es ? 'Se muestran en todos los meses' : 'Shown in every month' }}
          </p>
        </div>
        <MemberFinanceSheet
          :columns="columns"
          :rows="recurring"
          title-key="description"
          deletable
          :totals="recurringTotals"
          :empty-text="es
            ? 'Sin costos fijos. Marca la casilla Fijo en un gasto para incluirlo aquí.'
            : 'No fixed costs. Tick Fixed on an expense to include it here.'"
          @patch="onPatch"
          @remove="onRemove"
        />
      </section>

      <section class="space-y-2">
        <h2 class="text-sm font-bold text-white">
          🧾 {{ es ? 'Gastos del mes' : 'Month expenses' }}
        </h2>
        <MemberFinanceSheet
          :columns="columns"
          :rows="oneOff"
          title-key="description"
          deletable
          :totals="oneOffTotals"
          :empty-text="es ? 'Sin gastos este mes.' : 'No expenses this month.'"
          @patch="onPatch"
          @remove="onRemove"
        />
      </section>
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
              {{ es ? 'Registrar gasto' : 'Record expense' }}
            </h3>
            <button type="button" class="p-2 text-gray-400" @click="showForm = false">✕</button>
          </div>

          <form class="p-5 space-y-3 overflow-y-auto" @submit.prevent="submitExpense">
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-2">
                {{ es ? 'Categoría' : 'Category' }}
              </label>
              <div class="grid grid-cols-3 gap-1.5">
                <button
                  v-for="c in EXPENSE_CATEGORIES"
                  :key="c.id"
                  type="button"
                  class="py-2 px-1 rounded-xl text-[10px] font-semibold border transition-all"
                  :class="form.category === c.id
                    ? 'border-gold-400 bg-gold-400/20 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-400'"
                  @click="form.category = c.id"
                >
                  <span class="block text-base leading-none mb-0.5">{{ c.emoji }}</span>
                  {{ es ? c.es : c.en }}
                </button>
              </div>
            </div>

            <div v-if="form.category === 'coaches'">
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ es ? 'Coach' : 'Coach' }} *
              </label>
              <select
                v-model="form.coach_id"
                class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
              >
                <option value="">{{ es ? '— Seleccionar —' : '— Select —' }}</option>
                <option v-for="c in coaches" :key="c.id" :value="c.id">{{ c.full_name }}</option>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Fecha' : 'Date' }}
                </label>
                <input
                  v-model="form.incurred_on"
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
                {{ es ? 'Descripción' : 'Description' }}
              </label>
              <input
                v-model="form.description"
                type="text"
                :placeholder="es ? 'Renta del parque, grip, playeras…' : 'Park rent, grip, tees…'"
                class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
              />
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Proveedor' : 'Vendor' }}
                </label>
                <input
                  v-model="form.vendor"
                  type="text"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
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
                  <option value="pending">{{ es ? 'Por pagar' : 'Unpaid' }}</option>
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

            <div class="rounded-xl border border-gray-800 bg-gray-950/60 p-3 space-y-2">
              <label class="flex items-center gap-2">
                <input
                  v-model="form.is_recurring"
                  type="checkbox"
                  class="w-4 h-4 rounded border-gray-600 text-gold-400 focus:ring-gold-400 bg-gray-900"
                />
                <span class="text-sm text-white font-semibold">
                  {{ es ? 'Es un costo fijo' : 'This is a fixed cost' }}
                </span>
              </label>
              <p class="text-[10px] text-gray-500 leading-snug">
                {{ es
                  ? 'Los costos fijos definen tu ingreso mínimo viable y aparecen en todos los meses.'
                  : 'Fixed costs set your minimum viable income and appear in every month.' }}
              </p>
              <div v-if="form.is_recurring">
                <select
                  v-model="form.recurrence"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                >
                  <option v-for="r in RECURRENCES" :key="r.id" :value="r.id">
                    {{ es ? r.es : r.en }}
                  </option>
                </select>
              </div>
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
