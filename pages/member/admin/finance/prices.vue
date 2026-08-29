<script setup lang="ts">
/** The class price sheet from the business Excel, editable per cell. */
import type { FinanceSheetColumn } from '~/components/member/FinanceSheet.vue'
import {
  FINANCE_CLASS_KINDS,
  FINANCE_COACH_TIERS,
  academyCutMxn,
  classKindLabel,
  coachPayMxn,
  downloadCsv,
  effectivePriceMxn,
  formatMoneyMxn,
  payPerSessionMxn,
  priceListCsv,
  priceListCsvName,
  suggestedFinalMxn,
  totalSoldMxn,
  type FinancePriceRow,
} from '~/utils/finance'
import type { ClassPackageKind, CoachPricingTier } from '~/utils/classPricing'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const { language } = useI18n()
const es = computed(() => language.value === 'es')

const {
  priceRows,
  loading,
  saving,
  error,
  loadPriceRows,
  updatePriceRow,
  addPriceRow,
  deletePriceRow,
} = useFinance()

onMounted(() => loadPriceRows({ force: true }))

const columns = computed((): FinanceSheetColumn[] => [
  {
    key: 'label_es',
    label: es.value ? 'Tipo de clase' : 'Class type',
    type: 'text',
    width: 'w-52',
    placeholder: es.value ? 'Nombre' : 'Name',
  },
  { key: 'list_mxn', label: es.value ? 'Precio' : 'Price', type: 'money', align: 'right', width: 'w-24' },
  {
    key: 'final_mxn',
    label: es.value ? 'Precio final' : 'Final price',
    type: 'money',
    align: 'right',
    width: 'w-28',
    highlight: true,
    placeholder: es.value ? 'lista' : 'list',
  },
  { key: 'sessions', label: es.value ? 'Sesiones' : 'Sessions', type: 'number', align: 'right', width: 'w-20' },
  { key: 'discount_pct', label: es.value ? 'Descuento %' : 'Discount %', type: 'pct', align: 'right', width: 'w-24' },
  { key: 'units_sold', label: es.value ? 'Vendidos' : 'Sold', type: 'number', align: 'right', width: 'w-20' },
  {
    key: 'total_sold',
    label: es.value ? 'Total vendido' : 'Total sold',
    type: 'computed',
    align: 'right',
    width: 'w-28',
    compute: row => formatMoneyMxn(totalSoldMxn(row as FinancePriceRow)),
  },
  {
    key: 'pay_per_session',
    label: es.value ? 'Pago x día' : 'Pay per day',
    type: 'computed',
    align: 'right',
    width: 'w-24',
    compute: row => formatMoneyMxn(payPerSessionMxn(row as FinancePriceRow), true),
  },
  { key: 'academy_pct', label: es.value ? '% Academia' : 'Academy %', type: 'pct', align: 'right', width: 'w-24' },
  {
    key: 'academy_cut',
    label: es.value ? 'Academia' : 'Academy',
    type: 'computed',
    align: 'right',
    width: 'w-28',
    highlight: true,
    compute: row => formatMoneyMxn(academyCutMxn(row as FinancePriceRow)),
  },
  {
    key: 'min_fee_mxn',
    label: es.value ? 'Cuota mínima' : 'Minimum fee',
    type: 'money',
    align: 'right',
    width: 'w-28',
    hideOnMobile: true,
  },
  {
    key: 'coach_pay',
    label: es.value ? 'Pago coach' : 'Coach pay',
    type: 'computed',
    align: 'right',
    width: 'w-28',
    compute: row => formatMoneyMxn(coachPayMxn(row as FinancePriceRow)),
  },
  {
    key: 'is_active',
    label: es.value ? 'Activo' : 'Active',
    type: 'checkbox',
    align: 'center',
    width: 'w-16',
    hideOnMobile: true,
  },
])

const groups = computed(() =>
  FINANCE_COACH_TIERS.map(tier => {
    const rows = priceRows.value
      .filter(r => r.coach_tier === tier.id)
      .sort((a, b) => a.sort_order - b.sort_order)
    return {
      tier,
      rows,
      totals: {
        label_es: es.value ? 'Total' : 'Total',
        total_sold: formatMoneyMxn(rows.reduce((s, r) => s + totalSoldMxn(r), 0)),
        academy_cut: formatMoneyMxn(rows.reduce((s, r) => s + academyCutMxn(r), 0)),
        coach_pay: formatMoneyMxn(rows.reduce((s, r) => s + coachPayMxn(r), 0)),
      } as Record<string, string>,
      /** Kinds not yet used by this tier, so a new row cannot collide. */
      availableKinds: FINANCE_CLASS_KINDS.filter(k => !rows.some(r => r.class_kind === k.id)),
    }
  }),
)

const totalActiveRows = computed(() => priceRows.value.filter(r => r.is_active).length)

async function onPatch(id: string, key: string, value: unknown) {
  const res = await updatePriceRow(id, { [key]: value } as Partial<FinancePriceRow>)
  if (!res.ok && res.message) alert(res.message)
}

async function onRemove(id: string) {
  const row = priceRows.value.find(r => r.id === id)
  if (!row) return
  const label = `${row.label_es}`
  if (!confirm(es.value ? `¿Eliminar "${label}"?` : `Delete "${label}"?`)) return
  const res = await deletePriceRow(id)
  if (!res.ok && res.message) alert(res.message)
}

async function addRow(tier: CoachPricingTier, kind: ClassPackageKind | undefined) {
  if (!kind) return
  const catalog = FINANCE_CLASS_KINDS.find(k => k.id === kind)
  const siblings = priceRows.value.filter(r => r.coach_tier === tier)
  const res = await addPriceRow({
    coach_tier: tier,
    class_kind: kind,
    label_es: catalog?.es ?? kind,
    label_en: catalog?.en ?? null,
    list_mxn: 0,
    sessions: kind.startsWith('monthly_') ? Number(kind.split('_')[1]) || 1 : 1,
    academy_pct: 0.2,
    units_sold: 0,
    sort_order: (siblings.at(-1)?.sort_order ?? 0) + 10,
    is_active: true,
  })
  if (!res.ok && res.message) alert(res.message)
}

/** Reapplies the sheet formula: discount the list price, round up to the nearest 100. */
async function recalcFinals(tier: CoachPricingTier) {
  const targets = priceRows.value.filter(
    r => r.coach_tier === tier && r.discount_pct != null && r.discount_pct > 0,
  )
  if (!targets.length) {
    alert(es.value ? 'Ninguna fila tiene descuento.' : 'No rows have a discount.')
    return
  }
  const preview = targets
    .map(r => `${r.label_es}: ${formatMoneyMxn(effectivePriceMxn(r))} → ${formatMoneyMxn(suggestedFinalMxn(Number(r.list_mxn), r.discount_pct))}`)
    .join('\n')
  if (!confirm(`${es.value ? 'Recalcular precio final' : 'Recalculate final price'}\n\n${preview}`)) return

  for (const row of targets) {
    const next = suggestedFinalMxn(Number(row.list_mxn), row.discount_pct)
    if (next != null && next !== row.final_mxn) await updatePriceRow(row.id, { final_mxn: next })
  }
}

function exportCsv() {
  downloadCsv(priceListCsvName(), priceListCsv(priceRows.value, es.value))
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <MemberFinanceHeader
      :subtitle="es
        ? `Lista de precios · ${totalActiveRows} paquetes activos`
        : `Price list · ${totalActiveRows} active packages`"
    >
      <template #actions>
        <button
          type="button"
          :disabled="!priceRows.length"
          class="px-3 py-2 rounded-xl border border-gray-700 text-gray-200 text-xs font-bold disabled:opacity-40"
          @click="exportCsv"
        >
          ⬇ CSV
        </button>
      </template>
    </MemberFinanceHeader>

    <div class="px-4 py-4 max-w-[1400px] mx-auto space-y-5">
      <p v-if="error" class="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
        {{ error }}
      </p>

      <div v-if="loading && !priceRows.length" class="py-12 text-center">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>

      <div
        v-else-if="!priceRows.length"
        class="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-300"
      >
        {{ es
          ? 'No hay precios cargados. Corre supabase/migrations/add_finance_module.sql — incluye la lista completa del Excel.'
          : 'No prices loaded. Run supabase/migrations/add_finance_module.sql — it seeds the full Excel list.' }}
      </div>

      <template v-else>
        <p class="text-[11px] text-gray-500 leading-snug">
          {{ es
            ? 'Edita cualquier celda y se guarda al salir del campo. Precio final vacío = se vende al precio de lista. Total vendido, Pago x día, Academia y Pago coach se calculan igual que en el Excel.'
            : 'Edit any cell; it saves when the field loses focus. An empty final price sells at list price. Total sold, pay per day, academy cut and coach pay are computed exactly as in the Excel.' }}
        </p>

        <section v-for="group in groups" :key="group.tier.id" class="space-y-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-bold text-white flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full" :style="{ backgroundColor: group.tier.color }" />
              {{ es ? group.tier.es : group.tier.en }}
              <span class="text-xs font-normal text-gray-500">
                {{ group.rows.length }} {{ es ? 'paquetes' : 'packages' }}
              </span>
            </h2>

            <div class="flex items-center gap-2">
              <button
                type="button"
                :disabled="saving"
                class="text-[11px] px-2.5 py-1.5 rounded-lg bg-gray-800 text-gray-300 disabled:opacity-40"
                @click="recalcFinals(group.tier.id)"
              >
                {{ es ? 'Recalcular finales' : 'Recalculate finals' }}
              </button>
              <select
                v-if="group.availableKinds.length"
                class="text-[11px] px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300"
                :value="''"
                @change="addRow(group.tier.id, ($event.target as HTMLSelectElement).value as ClassPackageKind)"
              >
                <option value="">{{ es ? '+ Añadir paquete' : '+ Add package' }}</option>
                <option v-for="k in group.availableKinds" :key="k.id" :value="k.id">
                  {{ classKindLabel(k.id, es) }}
                </option>
              </select>
            </div>
          </div>

          <MemberFinanceSheet
            :columns="columns"
            :rows="group.rows"
            title-key="label_es"
            deletable
            :totals="group.totals"
            :empty-text="es ? 'Sin paquetes para este coach.' : 'No packages for this coach.'"
            @patch="onPatch"
            @remove="onRemove"
          />
        </section>

        <p class="text-[11px] text-gray-600 leading-snug">
          {{ es
            ? 'Cuota mínima queda reservada: aún no se aplica ninguna lógica sobre ese campo.'
            : 'Minimum fee is reserved: no logic is applied to that field yet.' }}
        </p>
      </template>
    </div>
  </div>
</template>
