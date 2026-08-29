<script setup lang="ts">
/**
 * Coupon management. Codes are only readable by staff, so this page is the only
 * place a code can be seen or created; families just type one at checkout.
 */
import {
  COUPON_DISCOUNT_TYPES,
  computeCouponDiscount,
  couponDiscountSummary,
  normalizeCouponCode,
  type CouponDiscountType,
  type CouponRow,
} from '~/utils/coupons'
import {
  FINANCE_CLASS_KINDS,
  FINANCE_COACH_TIERS,
  classKindLabel,
  coachTierSheetLabel,
  formatMoneyMxn,
} from '~/utils/finance'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const client = useSupabaseClient()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const {
  coupons,
  redemptions,
  allowLists,
  loading,
  saving,
  error,
  loadCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  loadAllowList,
  addToAllowList,
  removeFromAllowList,
  loadRedemptions,
} = useCoupons()

const expandedId = ref<string | null>(null)

onMounted(async () => {
  await Promise.all([loadCoupons({ force: true }), loadRedemptions({ force: true })])
})

// ---------------------------------------------------------------------------
// Allow-list picker
// ---------------------------------------------------------------------------

const skaters = ref<Array<{ id: string; full_name: string }>>([])
const crew = ref<Array<{ id: string; name: string }>>([])
const rosterLoaded = ref(false)
const allowSearch = ref('')

async function loadRoster() {
  if (rosterLoaded.value) return
  const [{ data: profiles }, { data: crewRows }] = await Promise.all([
    client.from('profiles').select('id, full_name').eq('role', 'customer').order('full_name'),
    client.from('crew_members').select('id, first_name, last_name').order('first_name'),
  ])
  skaters.value = (profiles as Array<{ id: string; full_name: string }>) || []
  crew.value = ((crewRows as Array<{ id: string; first_name: string; last_name: string }>) || [])
    .map(c => ({ id: c.id, name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() }))
  rosterLoaded.value = true
}

async function toggleExpand(coupon: CouponRow) {
  if (expandedId.value === coupon.id) {
    expandedId.value = null
    return
  }
  expandedId.value = coupon.id
  allowSearch.value = ''
  await Promise.all([loadRoster(), loadAllowList(coupon.id)])
}

const listedIds = computed(() => {
  const entries = expandedId.value ? allowLists.value[expandedId.value] || [] : []
  return new Set(entries.map(e => e.crew_member_id || e.skater_id))
})

/** Accounts and children in one list, so you add whoever the family books as. */
const allowCandidates = computed(() => {
  const q = allowSearch.value.trim().toLowerCase()
  const rows = [
    ...skaters.value.map(s => ({ id: s.id, name: s.full_name || '—', kind: 'profile' as const })),
    ...crew.value.map(c => ({ id: c.id, name: c.name || '—', kind: 'crew' as const })),
  ].filter(r => !listedIds.value.has(r.id))
  if (!q) return rows.slice(0, 8)
  return rows.filter(r => r.name.toLowerCase().includes(q)).slice(0, 20)
})

async function addCandidate(candidate: { id: string; kind: 'profile' | 'crew' }) {
  if (!expandedId.value) return
  const res = await addToAllowList(
    expandedId.value,
    candidate.kind === 'crew' ? { crewMemberId: candidate.id } : { skaterId: candidate.id },
  )
  if (!res.ok && res.message) alert(res.message)
  allowSearch.value = ''
}

async function removeEntry(couponId: string, entryId: string) {
  const res = await removeFromAllowList(couponId, entryId)
  if (!res.ok && res.message) alert(res.message)
}

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------

async function toggleActive(coupon: CouponRow) {
  const res = await updateCoupon(coupon.id, { is_active: !coupon.is_active })
  if (!res.ok && res.message) alert(res.message)
}

async function removeCoupon(coupon: CouponRow) {
  const question = es.value
    ? `¿Eliminar el cupón ${coupon.code}? El historial de usos se conserva.`
    : `Delete coupon ${coupon.code}? The redemption log is kept.`
  if (!confirm(question)) return
  const res = await deleteCoupon(coupon.id)
  if (!res.ok && res.message) alert(res.message)
}

const copied = ref('')

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    copied.value = code
    setTimeout(() => { copied.value = '' }, 1500)
  } catch {
    // Clipboard blocked; the code is on screen anyway.
  }
}

const usageLabel = (coupon: CouponRow) =>
  coupon.max_redemptions == null
    ? `${coupon.times_redeemed} ${es.value ? 'usos' : 'uses'}`
    : `${coupon.times_redeemed} / ${coupon.max_redemptions}`

const redemptionsFor = (couponId: string) => redemptions.value.filter(r => r.coupon_id === couponId)

const savedTotal = computed(() =>
  redemptions.value.reduce((sum, r) => sum + Number(r.discount_mxn || 0), 0),
)

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

const showForm = ref(false)
const formError = ref('')

const blankForm = () => ({
  code: '',
  label_es: '',
  label_en: '',
  description: '',
  discount_type: 'fixed_price' as CouponDiscountType,
  discount_value: '' as string | number,
  applies_to_class_kinds: [] as string[],
  applies_to_coach_tiers: [] as string[],
  restricted_to_skaters: true,
  max_redemptions: '' as string | number,
  max_per_skater: '' as string | number,
  starts_on: '',
  expires_on: '',
  notes: '',
})

const form = ref(blankForm())

const toggleIn = (list: string[], id: string) =>
  list.includes(id) ? list.filter(v => v !== id) : [...list, id]

const typeHint = computed(() => {
  const meta = COUPON_DISCOUNT_TYPES.find(t => t.id === form.value.discount_type)
  if (!meta) return ''
  return es.value ? meta.hintEs : meta.hintEn
})

/** Worked example against a $1,000 sale, so the effect is obvious before saving. */
const formPreview = computed(() => {
  const value = Number(form.value.discount_value)
  if (!Number.isFinite(value) || value <= 0) return ''
  const sample = 1000
  const { discountMxn, finalMxn } = computeCouponDiscount(
    { discount_type: form.value.discount_type, discount_value: value },
    sample,
  )
  if (discountMxn <= 0) {
    return es.value
      ? `Sobre ${formatMoneyMxn(sample)} no haría descuento.`
      : `On ${formatMoneyMxn(sample)} this would not discount anything.`
  }
  return es.value
    ? `Sobre ${formatMoneyMxn(sample)}: paga ${formatMoneyMxn(finalMxn)} (−${formatMoneyMxn(discountMxn)}).`
    : `On ${formatMoneyMxn(sample)}: pays ${formatMoneyMxn(finalMxn)} (−${formatMoneyMxn(discountMxn)}).`
})

async function submitCoupon() {
  formError.value = ''
  const code = normalizeCouponCode(form.value.code)
  if (code.length < 3) {
    formError.value = es.value
      ? 'El código necesita al menos 3 caracteres.'
      : 'The code needs at least 3 characters.'
    return
  }
  if (!form.value.label_es.trim()) {
    formError.value = es.value ? 'Ponle un nombre al cupón.' : 'Give the coupon a name.'
    return
  }
  const value = Number(form.value.discount_value)
  if (!Number.isFinite(value) || value <= 0) {
    formError.value = es.value
      ? 'El valor del descuento debe ser mayor a 0.'
      : 'The discount value must be above 0.'
    return
  }

  const res = await createCoupon({
    code,
    label_es: form.value.label_es.trim(),
    label_en: form.value.label_en.trim() || null,
    description: form.value.description.trim() || null,
    discount_type: form.value.discount_type,
    discount_value: value,
    applies_to_class_kinds: form.value.applies_to_class_kinds,
    applies_to_coach_tiers: form.value.applies_to_coach_tiers,
    restricted_to_skaters: form.value.restricted_to_skaters,
    max_redemptions: form.value.max_redemptions === '' ? null : Number(form.value.max_redemptions),
    max_per_skater: form.value.max_per_skater === '' ? null : Number(form.value.max_per_skater),
    starts_on: form.value.starts_on || null,
    expires_on: form.value.expires_on || null,
    notes: form.value.notes.trim() || null,
    is_active: true,
  })

  if (!res.ok) {
    formError.value = res.message || (es.value ? 'No se pudo guardar.' : 'Could not save.')
    return
  }
  form.value = blankForm()
  showForm.value = false
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <MemberFinanceHeader
      :subtitle="es
        ? `Cupones · ${coupons.length} códigos · ${formatMoneyMxn(savedTotal)} descontados`
        : `Coupons · ${coupons.length} codes · ${formatMoneyMxn(savedTotal)} discounted`"
    >
      <template #actions>
        <button
          type="button"
          class="px-3 py-2 rounded-xl bg-gold-400 text-black text-xs font-bold"
          @click="showForm = true"
        >
          + {{ es ? 'Cupón' : 'Coupon' }}
        </button>
      </template>
    </MemberFinanceHeader>

    <div class="px-4 py-4 max-w-[1100px] mx-auto space-y-4">
      <p
        v-if="error"
        class="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3"
      >
        {{ error }}
      </p>

      <p v-if="loading && !coupons.length" class="text-xs text-gray-500">
        {{ es ? 'Cargando…' : 'Loading…' }}
      </p>

      <div
        v-else-if="!coupons.length"
        class="rounded-2xl border border-gray-800 bg-gray-900/40 p-6 text-center"
      >
        <p class="text-4xl mb-2">🎟️</p>
        <p class="text-sm text-gray-300 font-semibold">
          {{ es ? 'Todavía no hay cupones' : 'No coupons yet' }}
        </p>
        <p class="text-xs text-gray-500 mt-1">
          {{ es
            ? 'Corre add_coupons.sql y NIIKDAY1S aparecerá aquí listo para asignar alumnos.'
            : 'Run add_coupons.sql and NIIKDAY1S will show up here ready for skaters.' }}
        </p>
      </div>

      <article
        v-for="coupon in coupons"
        :key="coupon.id"
        class="rounded-2xl border bg-gray-900/50 overflow-hidden"
        :class="coupon.is_active ? 'border-gray-800' : 'border-gray-800/60 opacity-60'"
      >
        <div class="p-4 space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  class="font-mono text-base font-bold text-gold-300 tracking-wider hover:text-gold-200"
                  :title="es ? 'Copiar código' : 'Copy code'"
                  @click="copyCode(coupon.code)"
                >
                  {{ coupon.code }}
                </button>
                <span v-if="copied === coupon.code" class="text-[10px] text-glass-green">
                  {{ es ? 'copiado' : 'copied' }}
                </span>
                <span
                  v-if="coupon.restricted_to_skaters"
                  class="text-[10px] px-2 py-0.5 rounded-full bg-glass-blue/20 text-glass-blue border border-glass-blue/30"
                >
                  {{ es ? 'lista cerrada' : 'closed list' }}
                </span>
                <span
                  v-if="!coupon.is_active"
                  class="text-[10px] px-2 py-0.5 rounded-full bg-gray-800 text-gray-400"
                >
                  {{ es ? 'inactivo' : 'inactive' }}
                </span>
              </div>
              <p class="text-sm text-white font-semibold mt-1">
                {{ es ? coupon.label_es : coupon.label_en || coupon.label_es }}
              </p>
              <p v-if="coupon.description" class="text-xs text-gray-500 mt-0.5">
                {{ coupon.description }}
              </p>
            </div>

            <div class="shrink-0 text-right">
              <p class="text-sm font-bold text-glass-green">
                {{ couponDiscountSummary(coupon, es) }}
              </p>
              <p class="text-[10px] text-gray-500 tabular-nums">{{ usageLabel(coupon) }}</p>
            </div>
          </div>

          <div class="flex flex-wrap gap-1.5">
            <span
              v-if="!coupon.applies_to_class_kinds.length"
              class="text-[10px] px-2 py-1 rounded-lg bg-gray-950 border border-gray-800 text-gray-400"
            >
              {{ es ? 'Todos los paquetes' : 'All packages' }}
            </span>
            <span
              v-for="kind in coupon.applies_to_class_kinds"
              :key="kind"
              class="text-[10px] px-2 py-1 rounded-lg bg-gray-950 border border-gray-800 text-gray-300"
            >
              {{ classKindLabel(kind, es) }}
            </span>
            <span
              v-for="tier in coupon.applies_to_coach_tiers"
              :key="tier"
              class="text-[10px] px-2 py-1 rounded-lg bg-gray-950 border border-gray-800 text-gray-400"
            >
              {{ coachTierSheetLabel(tier, es) }}
            </span>
            <span
              v-if="coupon.expires_on"
              class="text-[10px] px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300"
            >
              {{ es ? 'vence' : 'expires' }} {{ coupon.expires_on }}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-200 text-[11px] font-bold"
              @click="toggleExpand(coupon)"
            >
              {{ expandedId === coupon.id
                ? (es ? 'Cerrar' : 'Close')
                : (es ? '👤 Alumnos' : '👤 Skaters') }}
              <span v-if="allowLists[coupon.id]?.length" class="text-gold-300">
                ({{ allowLists[coupon.id].length }})
              </span>
            </button>
            <button
              type="button"
              :disabled="saving"
              class="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-200 text-[11px] font-bold disabled:opacity-40"
              @click="toggleActive(coupon)"
            >
              {{ coupon.is_active
                ? (es ? 'Desactivar' : 'Deactivate')
                : (es ? 'Activar' : 'Activate') }}
            </button>
            <button
              type="button"
              :disabled="saving"
              class="px-3 py-1.5 rounded-lg border border-red-500/30 text-red-300 text-[11px] font-bold disabled:opacity-40"
              @click="removeCoupon(coupon)"
            >
              {{ es ? 'Eliminar' : 'Delete' }}
            </button>
          </div>
        </div>

        <div
          v-if="expandedId === coupon.id"
          class="border-t border-gray-800 bg-gray-950/60 p-4 space-y-4"
        >
          <div>
            <p class="text-xs font-bold text-gray-300 mb-2">
              {{ es ? 'Alumnos con acceso' : 'Skaters with access' }}
            </p>

            <p
              v-if="coupon.restricted_to_skaters && !allowLists[coupon.id]?.length"
              class="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 mb-2"
            >
              {{ es
                ? 'La lista está vacía, así que nadie puede usar el cupón todavía.'
                : 'The list is empty, so nobody can use this coupon yet.' }}
            </p>
            <p v-else-if="!coupon.restricted_to_skaters" class="text-[11px] text-gray-500 mb-2">
              {{ es
                ? 'Este cupón es abierto: cualquiera con el código puede usarlo.'
                : 'This coupon is open: anyone with the code can use it.' }}
            </p>

            <div v-if="allowLists[coupon.id]?.length" class="flex flex-wrap gap-1.5 mb-3">
              <span
                v-for="entry in allowLists[coupon.id]"
                :key="entry.id"
                class="inline-flex items-center gap-1.5 text-[11px] pl-2 pr-1 py-1 rounded-lg bg-gray-900 border border-gray-800 text-gray-200"
              >
                <span class="text-gray-500">{{ entry.kind === 'crew' ? '🧒' : '👤' }}</span>
                {{ entry.display_name }}
                <button
                  type="button"
                  class="w-5 h-5 rounded text-gray-500 hover:text-red-300"
                  @click="removeEntry(coupon.id, entry.id)"
                >
                  ✕
                </button>
              </span>
            </div>

            <input
              v-model="allowSearch"
              type="text"
              :placeholder="es ? 'Buscar alumno para agregar…' : 'Search a skater to add…'"
              class="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-800 text-white text-sm placeholder-gray-500"
            />
            <div v-if="allowCandidates.length" class="flex flex-wrap gap-1.5 mt-2">
              <button
                v-for="candidate in allowCandidates"
                :key="`${candidate.kind}-${candidate.id}`"
                type="button"
                :disabled="saving"
                class="text-[11px] px-2 py-1 rounded-lg bg-gray-900 border border-gray-800 text-gray-300 hover:border-gold-400/50 disabled:opacity-40"
                @click="addCandidate(candidate)"
              >
                + {{ candidate.kind === 'crew' ? '🧒' : '👤' }} {{ candidate.name }}
              </button>
            </div>
            <p v-else-if="allowSearch" class="text-[11px] text-gray-600 mt-2">
              {{ es ? 'Sin resultados.' : 'No matches.' }}
            </p>
          </div>

          <div v-if="redemptionsFor(coupon.id).length">
            <p class="text-xs font-bold text-gray-300 mb-2">
              {{ es ? 'Usos registrados' : 'Recorded uses' }}
            </p>
            <div class="rounded-xl border border-gray-800 divide-y divide-gray-800">
              <div
                v-for="r in redemptionsFor(coupon.id).slice(0, 10)"
                :key="r.id"
                class="px-3 py-2 flex items-center justify-between gap-3 text-[11px]"
              >
                <span class="text-gray-400">{{ r.created_at?.slice(0, 10) }}</span>
                <span class="text-gray-500 truncate">{{ classKindLabel(r.class_kind, es) }}</span>
                <span class="text-gray-300 tabular-nums shrink-0">
                  {{ formatMoneyMxn(r.original_mxn) }} →
                  <span class="text-glass-green font-bold">{{ formatMoneyMxn(r.final_mxn) }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>

    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div class="absolute inset-0 bg-black/80" @click="showForm = false" />
        <div
          class="relative bg-gray-900 border border-gray-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col"
        >
          <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
            <h3 class="text-lg font-bold text-white">{{ es ? 'Nuevo cupón' : 'New coupon' }}</h3>
            <button type="button" class="p-2 text-gray-400" @click="showForm = false">✕</button>
          </div>

          <form class="p-5 space-y-3 overflow-y-auto" @submit.prevent="submitCoupon">
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ es ? 'Código' : 'Code' }} *
              </label>
              <input
                v-model="form.code"
                type="text"
                required
                placeholder="NIIKDAY1S"
                class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono uppercase tracking-wider"
              />
              <p class="text-[10px] text-gray-500 mt-1">
                {{ es
                  ? 'Da igual si se escribe con mayúsculas o minúsculas.'
                  : 'Upper or lower case makes no difference when typed.' }}
              </p>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Nombre' : 'Name' }} *
                </label>
                <input
                  v-model="form.label_es"
                  type="text"
                  required
                  :placeholder="es ? 'Precio Day 1' : 'Day 1 price'"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Nombre en inglés' : 'English name' }}
                </label>
                <input
                  v-model="form.label_en"
                  type="text"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-2">
                {{ es ? 'Tipo de descuento' : 'Discount type' }}
              </label>
              <div class="grid grid-cols-3 gap-1.5">
                <button
                  v-for="t in COUPON_DISCOUNT_TYPES"
                  :key="t.id"
                  type="button"
                  class="py-2 rounded-xl text-[11px] font-bold border transition-all"
                  :class="form.discount_type === t.id
                    ? 'border-gold-400 bg-gold-400/20 text-gold-200'
                    : 'border-gray-700 bg-gray-800 text-gray-400'"
                  @click="form.discount_type = t.id"
                >
                  {{ es ? t.es : t.en }}
                </button>
              </div>
              <p class="text-[10px] text-gray-500 mt-1">{{ typeHint }}</p>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ form.discount_type === 'percent'
                  ? (es ? 'Porcentaje' : 'Percentage')
                  : (es ? 'Monto (MXN)' : 'Amount (MXN)') }} *
              </label>
              <input
                v-model="form.discount_value"
                type="number"
                min="0"
                :max="form.discount_type === 'percent' ? 100 : undefined"
                step="1"
                required
                inputmode="decimal"
                placeholder="800"
                class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-bold"
              />
              <p v-if="formPreview" class="text-[10px] text-glass-green mt-1">{{ formPreview }}</p>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-2">
                {{ es ? 'Aplica a estos paquetes' : 'Applies to these packages' }}
                <span class="text-gray-600">({{ es ? 'ninguno = todos' : 'none = all' }})</span>
              </label>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="kind in FINANCE_CLASS_KINDS"
                  :key="kind.id"
                  type="button"
                  class="text-[11px] px-2 py-1.5 rounded-lg border transition-all"
                  :class="form.applies_to_class_kinds.includes(kind.id)
                    ? 'border-gold-400 bg-gold-400/20 text-gold-200'
                    : 'border-gray-700 bg-gray-800 text-gray-400'"
                  @click="form.applies_to_class_kinds = toggleIn(form.applies_to_class_kinds, kind.id)"
                >
                  {{ es ? kind.es : kind.en }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-2">
                {{ es ? 'Aplica a estos coaches' : 'Applies to these coach tiers' }}
                <span class="text-gray-600">({{ es ? 'ninguno = todos' : 'none = all' }})</span>
              </label>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="tier in FINANCE_COACH_TIERS"
                  :key="tier.id"
                  type="button"
                  class="text-[11px] px-2 py-1.5 rounded-lg border transition-all"
                  :class="form.applies_to_coach_tiers.includes(tier.id)
                    ? 'border-gold-400 bg-gold-400/20 text-gold-200'
                    : 'border-gray-700 bg-gray-800 text-gray-400'"
                  @click="form.applies_to_coach_tiers = toggleIn(form.applies_to_coach_tiers, tier.id)"
                >
                  {{ es ? tier.es : tier.en }}
                </button>
              </div>
            </div>

            <label
              class="flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors"
              :class="form.restricted_to_skaters
                ? 'border-glass-blue/40 bg-glass-blue/10'
                : 'border-gray-700 bg-gray-800'"
            >
              <input
                v-model="form.restricted_to_skaters"
                type="checkbox"
                class="mt-0.5 rounded border-gray-600 text-glass-blue focus:ring-glass-blue bg-gray-900"
              />
              <span>
                <span class="block text-xs font-semibold text-white">
                  {{ es ? 'Solo para alumnos de mi lista' : 'Only for skaters on my list' }}
                </span>
                <span class="block text-[10px] text-gray-400 mt-0.5">
                  {{ es
                    ? 'Recomendado para precios heredados: aunque el código se filtre, nadie más lo puede usar.'
                    : 'Recommended for grandfathered pricing: even if the code leaks, nobody else can use it.' }}
                </span>
              </span>
            </label>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Usos totales máx.' : 'Max total uses' }}
                </label>
                <input
                  v-model="form.max_redemptions"
                  type="number"
                  min="1"
                  :placeholder="es ? 'sin límite' : 'unlimited'"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Usos por alumno' : 'Uses per skater' }}
                </label>
                <input
                  v-model="form.max_per_skater"
                  type="number"
                  min="1"
                  :placeholder="es ? 'sin límite' : 'unlimited'"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Empieza' : 'Starts' }}
                </label>
                <input
                  v-model="form.starts_on"
                  type="date"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Vence' : 'Expires' }}
                </label>
                <input
                  v-model="form.expires_on"
                  type="date"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ es ? 'Descripción para la familia' : 'Description shown to the family' }}
              </label>
              <textarea
                v-model="form.description"
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
                {{ saving ? '…' : (es ? 'Crear cupón' : 'Create coupon') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>
