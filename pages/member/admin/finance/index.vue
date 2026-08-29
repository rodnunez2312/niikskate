<script setup lang="ts">
/**
 * Finance overview: month result plus the minimum viable income.
 *
 * The academy only keeps its share of each sale (% Academia), so break-even is
 * measured against that net figure rather than gross collections.
 */
import {
  FINANCE_COACH_TIERS,
  academyPerUnitMxn,
  coachTierSheetLabel,
  computeBreakEven,
  effectivePriceMxn,
  expenseCategoryLabel,
  formatMoneyMxn,
  formatPct,
  monthlyFixedCostMxn,
  sortPriceRows,
  summarizeEnrollments,
  summarizeExpenses,
  summarizePayments,
  totalsByCategory,
  unitsToTarget,
} from '~/utils/finance'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const { language } = useI18n()
const es = computed(() => language.value === 'es')

const {
  payments,
  expenses,
  priceRows,
  enrollments,
  settings,
  loading,
  saving,
  error,
  loadPayments,
  loadExpenses,
  loadPriceRows,
  loadEnrollments,
  loadSettings,
  saveSettings,
} = useFinance()

const monthKey = ref(currentMonthKey())

async function reload() {
  const range = monthKeyRange(monthKey.value)
  await Promise.all([loadPayments(range), loadExpenses(range)])
}

onMounted(async () => {
  await Promise.all([reload(), loadPriceRows(), loadEnrollments(), loadSettings()])
})

watch(monthKey, reload)

function shiftMonth(delta: number) {
  const [y, m] = monthKey.value.split('-').map(Number)
  const d = new Date(y, (m || 1) - 1 + delta, 1)
  monthKey.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const monthLabel = computed(() => {
  const [y, m] = monthKey.value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString(es.value ? 'es-MX' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })
})

const income = computed(() => summarizePayments(payments.value))
const spend = computed(() => summarizeExpenses(expenses.value.filter(e => !e.is_recurring)))
const fixedMonthly = computed(() => monthlyFixedCostMxn(expenses.value))

/** What the academy keeps, minus everything it pays out. */
const monthResult = computed(() => income.value.academyNet - spend.value.paid - fixedMonthly.value)

const breakEven = computed(() =>
  computeBreakEven({
    expenses: expenses.value,
    settings: settings.value,
    priceRows: priceRows.value,
  }),
)

const progressPct = computed(() => {
  const target = breakEven.value.minimumViableIncome
  if (target <= 0) return 0
  return Math.min(100, Math.round((income.value.academyNet / target) * 100))
})

const gapToTarget = computed(() =>
  Math.max(0, breakEven.value.minimumViableIncome - income.value.academyNet),
)

const students = computed(() => summarizeEnrollments(enrollments.value))

const expenseBreakdown = computed(() =>
  totalsByCategory(
    expenses.value.map(e => ({ category: e.category, amount_mxn: Number(e.amount_mxn || 0) })),
  ).slice(0, 6),
)

/** How many of each package would cover the whole monthly target on its own. */
const unitsNeeded = computed(() =>
  sortPriceRows(priceRows.value.filter(r => r.is_active && academyPerUnitMxn(r) > 0)).map(row => ({
    id: row.id,
    tier: coachTierSheetLabel(row.coach_tier, es.value),
    label: row.label_es,
    price: effectivePriceMxn(row),
    perUnit: academyPerUnitMxn(row),
    units: unitsToTarget(row, breakEven.value.minimumViableIncome),
  })),
)

const groupedUnits = computed(() =>
  FINANCE_COACH_TIERS.map(tier => ({
    tier,
    rows: unitsNeeded.value.filter(r => r.tier === (es.value ? tier.es : tier.en)),
  })).filter(g => g.rows.length),
)

// ---------------------------------------------------------------------------
// Break-even inputs
// ---------------------------------------------------------------------------

const draft = ref({
  owner_draw_mxn: 0,
  target_profit_mxn: 0,
  reserve_pct: 0,
  extra_fixed_cost_mxn: 0,
})

watch(
  settings,
  s => {
    if (!s) return
    draft.value = {
      owner_draw_mxn: Number(s.owner_draw_mxn || 0),
      target_profit_mxn: Number(s.target_profit_mxn || 0),
      reserve_pct: Math.round(Number(s.reserve_pct || 0) * 100),
      extra_fixed_cost_mxn: Number(s.extra_fixed_cost_mxn || 0),
    }
  },
  { immediate: true },
)

const settingsDirty = computed(() => {
  const s = settings.value
  if (!s) return false
  return (
    Number(s.owner_draw_mxn || 0) !== Number(draft.value.owner_draw_mxn || 0)
    || Number(s.target_profit_mxn || 0) !== Number(draft.value.target_profit_mxn || 0)
    || Math.round(Number(s.reserve_pct || 0) * 100) !== Number(draft.value.reserve_pct || 0)
    || Number(s.extra_fixed_cost_mxn || 0) !== Number(draft.value.extra_fixed_cost_mxn || 0)
  )
})

async function persistSettings() {
  const res = await saveSettings({
    owner_draw_mxn: Number(draft.value.owner_draw_mxn || 0),
    target_profit_mxn: Number(draft.value.target_profit_mxn || 0),
    reserve_pct: Number(draft.value.reserve_pct || 0) / 100,
    extra_fixed_cost_mxn: Number(draft.value.extra_fixed_cost_mxn || 0),
  })
  if (!res.ok && res.message) alert(res.message)
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <MemberFinanceHeader :subtitle="monthLabel" />

    <div class="px-4 py-4 max-w-[1400px] mx-auto space-y-5">
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

      <!-- Month result -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <NuxtLink
          to="/member/admin/finance/income"
          class="rounded-xl border border-gold-400/30 bg-gold-400/10 p-3 hover:border-gold-400/60 transition-colors"
        >
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Cobrado' : 'Collected' }}
          </p>
          <p class="text-xl font-bold text-gold-300 tabular-nums">{{ formatMoneyMxn(income.gross) }}</p>
          <p class="text-[10px] text-gray-500">{{ income.count }} {{ es ? 'movimientos' : 'entries' }}</p>
        </NuxtLink>

        <div class="rounded-xl border border-glass-green/30 bg-glass-green/10 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Neto academia' : 'Academy net' }}
          </p>
          <p class="text-xl font-bold text-glass-green tabular-nums">
            {{ formatMoneyMxn(income.academyNet) }}
          </p>
          <p class="text-[10px] text-gray-500">
            {{ es ? 'coaches' : 'coaches' }} {{ formatMoneyMxn(income.coachPayout) }}
          </p>
        </div>

        <NuxtLink
          to="/member/admin/finance/expenses"
          class="rounded-xl border border-red-500/30 bg-red-500/10 p-3 hover:border-red-500/60 transition-colors"
        >
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Gastos' : 'Expenses' }}
          </p>
          <p class="text-xl font-bold text-red-300 tabular-nums">
            {{ formatMoneyMxn(spend.paid + fixedMonthly) }}
          </p>
          <p class="text-[10px] text-gray-500">
            {{ es ? 'fijo' : 'fixed' }} {{ formatMoneyMxn(fixedMonthly) }}
          </p>
        </NuxtLink>

        <div
          class="rounded-xl border p-3"
          :class="monthResult >= 0
            ? 'border-glass-green/40 bg-glass-green/10'
            : 'border-red-500/40 bg-red-500/10'"
        >
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Resultado' : 'Result' }}
          </p>
          <p
            class="text-xl font-bold tabular-nums"
            :class="monthResult >= 0 ? 'text-glass-green' : 'text-red-300'"
          >
            {{ formatMoneyMxn(monthResult) }}
          </p>
          <p class="text-[10px] text-gray-500">
            {{ es ? 'neto − gastos' : 'net − expenses' }}
          </p>
        </div>
      </div>

      <!-- Minimum viable income -->
      <section class="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 space-y-4">
        <div>
          <h2 class="text-base font-bold text-white">
            🎯 {{ es ? 'Ingreso mínimo viable' : 'Minimum viable income' }}
          </h2>
          <p class="text-[11px] text-gray-500 leading-snug mt-0.5">
            {{ es
              ? 'Lo que la academia necesita retener cada mes para cubrir costos fijos, tu sueldo y la utilidad objetivo.'
              : 'What the academy must keep each month to cover fixed costs, your draw and the target profit.' }}
          </p>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label class="block text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-1">
              {{ es ? 'Costo fijo (gastos)' : 'Fixed cost (expenses)' }}
            </label>
            <p class="px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-800 text-sm text-gray-300 tabular-nums">
              {{ formatMoneyMxn(monthlyFixedCostMxn(expenses)) }}
            </p>
          </div>
          <div>
            <label class="block text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-1">
              {{ es ? 'Otros fijos' : 'Other fixed' }}
            </label>
            <input
              v-model.number="draft.extra_fixed_cost_mxn"
              type="number"
              min="0"
              step="100"
              inputmode="decimal"
              class="w-full px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-800 text-white text-sm tabular-nums focus:border-gold-400 outline-none"
            />
          </div>
          <div>
            <label class="block text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-1">
              {{ es ? 'Tu sueldo' : 'Owner draw' }}
            </label>
            <input
              v-model.number="draft.owner_draw_mxn"
              type="number"
              min="0"
              step="500"
              inputmode="decimal"
              class="w-full px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-800 text-white text-sm tabular-nums focus:border-gold-400 outline-none"
            />
          </div>
          <div>
            <label class="block text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-1">
              {{ es ? 'Utilidad objetivo' : 'Target profit' }}
            </label>
            <input
              v-model.number="draft.target_profit_mxn"
              type="number"
              min="0"
              step="500"
              inputmode="decimal"
              class="w-full px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-800 text-white text-sm tabular-nums focus:border-gold-400 outline-none"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <div class="w-32">
            <label class="block text-[10px] uppercase tracking-wide text-gray-500 font-bold mb-1">
              {{ es ? 'Reserva %' : 'Reserve %' }}
            </label>
            <input
              v-model.number="draft.reserve_pct"
              type="number"
              min="0"
              max="90"
              step="1"
              inputmode="decimal"
              class="w-full px-3 py-2.5 rounded-xl bg-gray-950 border border-gray-800 text-white text-sm tabular-nums focus:border-gold-400 outline-none"
            />
          </div>
          <button
            type="button"
            :disabled="!settingsDirty || saving"
            class="px-4 py-2.5 rounded-xl bg-gold-400 text-black text-xs font-bold disabled:opacity-40"
            @click="persistSettings"
          >
            {{ saving ? '…' : (es ? 'Guardar supuestos' : 'Save assumptions') }}
          </button>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
          <div class="rounded-xl border border-gold-400/40 bg-gold-400/10 p-3">
            <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
              {{ es ? 'Ingreso mínimo viable' : 'Minimum viable income' }}
            </p>
            <p class="text-2xl font-bold text-gold-300 tabular-nums">
              {{ formatMoneyMxn(breakEven.minimumViableIncome) }}
            </p>
            <p class="text-[10px] text-gray-500">{{ es ? 'neto de academia / mes' : 'academy net / month' }}</p>
          </div>
          <div class="rounded-xl border border-gray-800 bg-gray-950 p-3">
            <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
              {{ es ? 'Ventas brutas necesarias' : 'Required gross sales' }}
            </p>
            <p class="text-2xl font-bold text-white tabular-nums">
              {{ formatMoneyMxn(breakEven.requiredGrossSales) }}
            </p>
            <p class="text-[10px] text-gray-500">
              {{ es ? 'con academia promedio' : 'at average academy share' }}
              {{ formatPct(breakEven.avgAcademyPct) }}
            </p>
          </div>
          <div class="rounded-xl border border-gray-800 bg-gray-950 p-3">
            <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
              {{ es ? 'Falta este mes' : 'Gap this month' }}
            </p>
            <p
              class="text-2xl font-bold tabular-nums"
              :class="gapToTarget > 0 ? 'text-amber-300' : 'text-glass-green'"
            >
              {{ gapToTarget > 0 ? formatMoneyMxn(gapToTarget) : (es ? 'Cubierto' : 'Covered') }}
            </p>
            <p class="text-[10px] text-gray-500">{{ progressPct }}% {{ es ? 'del objetivo' : 'of target' }}</p>
          </div>
        </div>

        <div class="h-2 rounded-full bg-gray-800 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="progressPct >= 100 ? 'bg-glass-green' : 'bg-gold-400'"
            :style="{ width: `${progressPct}%` }"
          />
        </div>
      </section>

      <!-- Units needed -->
      <section v-if="groupedUnits.length" class="space-y-2">
        <div>
          <h2 class="text-base font-bold text-white">
            📦 {{ es ? 'Cuántos paquetes cubren el mes' : 'Packages needed to cover the month' }}
          </h2>
          <p class="text-[11px] text-gray-500 leading-snug">
            {{ es
              ? 'Ventas necesarias si vendieras únicamente ese paquete, usando lo que la academia retiene por venta.'
              : 'Sales needed if you sold only that package, based on what the academy keeps per sale.' }}
          </p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div
            v-for="group in groupedUnits"
            :key="group.tier.id"
            class="rounded-xl border border-gray-800 bg-gray-900/40 overflow-hidden"
          >
            <div
              class="px-3 py-2 bg-gray-900 border-b border-gray-800"
              :style="{ borderTopColor: group.tier.color, borderTopWidth: '3px' }"
            >
              <p class="text-xs font-bold text-white">{{ es ? group.tier.es : group.tier.en }}</p>
            </div>
            <div class="divide-y divide-gray-800/60">
              <div
                v-for="row in group.rows"
                :key="row.id"
                class="px-3 py-2 flex items-center justify-between gap-2"
              >
                <div class="min-w-0">
                  <p class="text-xs text-white truncate">{{ row.label }}</p>
                  <p class="text-[10px] text-gray-500 tabular-nums">
                    {{ formatMoneyMxn(row.price) }} · {{ es ? 'academia' : 'academy' }}
                    {{ formatMoneyMxn(row.perUnit) }}
                  </p>
                </div>
                <p class="shrink-0 text-sm font-bold text-gold-300 tabular-nums">
                  {{ row.units ?? '—' }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Expense mix -->
      <section v-if="expenseBreakdown.length" class="space-y-2">
        <h2 class="text-base font-bold text-white">
          🧾 {{ es ? 'A dónde se va el dinero' : 'Where the money goes' }}
        </h2>
        <div class="rounded-xl border border-gray-800 bg-gray-900/40 divide-y divide-gray-800/60">
          <div
            v-for="c in expenseBreakdown"
            :key="c.category"
            class="px-3 py-2.5 flex items-center justify-between gap-3"
          >
            <p class="text-xs text-gray-300">{{ expenseCategoryLabel(c.category, es) }}</p>
            <div class="flex items-center gap-3">
              <span class="text-[10px] text-gray-600">{{ c.count }}</span>
              <p class="text-sm font-bold text-white tabular-nums">{{ formatMoneyMxn(c.total) }}</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Student tracker -->
      <section v-if="students.count" class="space-y-2">
        <h2 class="text-base font-bold text-white">
          🛹 {{ es ? 'Control de alumnos' : 'Student tracker' }}
        </h2>
        <NuxtLink
          to="/member/admin/finance/students"
          class="block rounded-xl border border-gray-800 bg-gray-900/40 p-3 hover:border-gray-700 transition-colors"
        >
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">
                {{ es ? 'Inscripciones' : 'Enrollments' }}
              </p>
              <p class="text-lg font-bold text-white tabular-nums">{{ students.count }}</p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">
                {{ es ? 'Clases restantes' : 'Classes left' }}
              </p>
              <p class="text-lg font-bold text-white tabular-nums">{{ students.remaining }}</p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">
                {{ es ? 'Sin clases' : 'Out of classes' }}
              </p>
              <p
                class="text-lg font-bold tabular-nums"
                :class="students.outOfClasses ? 'text-red-400' : 'text-glass-green'"
              >
                {{ students.outOfClasses }}
              </p>
            </div>
            <div>
              <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">
                {{ es ? 'Pago atrasado' : 'Overdue' }}
              </p>
              <p
                class="text-lg font-bold tabular-nums"
                :class="students.overdue ? 'text-amber-300' : 'text-glass-green'"
              >
                {{ students.overdue }}
              </p>
            </div>
          </div>
        </NuxtLink>
      </section>

      <NuxtLink
        to="/member/admin/finance/prices"
        class="block rounded-xl border border-gray-800 bg-gray-900/40 p-3 hover:border-gray-700 transition-colors"
      >
        <p class="text-sm text-white font-semibold">
          🏷️ {{ es ? 'Lista de precios' : 'Price list' }}
        </p>
        <p class="text-[11px] text-gray-500">
          {{ priceRows.length }}
          {{ es
            ? 'paquetes · edita precios, descuentos y el % de academia'
            : 'packages · edit prices, discounts and the academy share' }}
        </p>
      </NuxtLink>
    </div>
  </div>
</template>
