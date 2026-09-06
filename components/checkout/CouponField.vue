<script setup lang="ts">
/**
 * Coupon input shared by the /book wizard and the season enrollment modal.
 *
 * Validation is a server round-trip on purpose: the code list is not readable by
 * customers, so nothing here can reveal a code or which skaters are allow-listed.
 * The parent owns the money — this component only reports the discount it verified.
 */
import { couponRejectionMessage, type CouponRejection } from '~/utils/coupons'

const props = withDefaults(
  defineProps<{
    subtotalMxn: number
    classKind?: string | null
    coachTier?: string | null
    crewMemberId?: string | null
    /** Set when a guardian books a skater who has their own login. */
    skaterProfileId?: string | null
    disabled?: boolean
    /** The /book wizard is dark; the season modal is light. */
    variant?: 'dark' | 'light'
  }>(),
  { variant: 'dark' },
)

export interface AppliedCoupon {
  code: string
  label: string
  description: string | null
  discountMxn: number
  finalMxn: number
}

const emit = defineEmits<{ applied: [AppliedCoupon | null] }>()

const supabase = useSupabaseClient()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const open = ref(false)
const code = ref('')
const checking = ref(false)
const message = ref('')
const applied = ref<AppliedCoupon | null>(null)

/** Changing the package invalidates a verified discount, so drop it. */
watch(
  () => [
    props.subtotalMxn,
    props.classKind,
    props.coachTier,
    props.crewMemberId,
    props.skaterProfileId,
  ],
  () => {
    if (!applied.value) return
    applied.value = null
    message.value = es.value
      ? 'Vuelve a aplicar tu código: cambió el paquete.'
      : 'Re-apply your code: the package changed.'
    emit('applied', null)
  },
)

async function apply() {
  const typed = code.value.trim()
  if (!typed || checking.value) return

  checking.value = true
  message.value = ''
  try {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData?.session?.access_token
    if (!token) {
      message.value = couponRejectionMessage('needs_login', es.value)
      return
    }

    const res = await $fetch<
      | { valid: true; code: string; label: string; description: string | null; discountMxn: number; finalMxn: number }
      | { valid: false; reason: CouponRejection }
    >('/api/coupons/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        code: typed,
        subtotalMxn: props.subtotalMxn,
        classKind: props.classKind ?? null,
        coachTier: props.coachTier ?? null,
        crewMemberId: props.crewMemberId ?? null,
        skaterProfileId: props.skaterProfileId ?? null,
        language: language.value,
      },
    })

    if (!res.valid) {
      applied.value = null
      message.value = couponRejectionMessage(res.reason, es.value)
      emit('applied', null)
      return
    }

    applied.value = {
      code: res.code,
      label: res.label,
      description: res.description,
      discountMxn: res.discountMxn,
      finalMxn: res.finalMxn,
    }
    message.value = ''
    emit('applied', applied.value)
  } catch {
    message.value = couponRejectionMessage('server_error', es.value)
  } finally {
    checking.value = false
  }
}

function clear() {
  applied.value = null
  code.value = ''
  message.value = ''
  emit('applied', null)
}

const money = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

const light = computed(() => props.variant === 'light')

const ui = computed(() =>
  light.value
    ? {
        appliedBox: 'border-teal-600/40 bg-teal-100/70',
        appliedTitle: 'text-teal-800',
        appliedCode: 'text-teal-700',
        appliedBody: 'text-gray-700',
        appliedStrong: 'text-teal-900',
        appliedNote: 'text-gray-500',
        removeBtn: 'border-teal-700/30 text-teal-800',
        trigger: 'text-teal-800',
        label: 'text-gray-600',
        input: 'bg-white border-gray-300 text-gray-900 placeholder-gray-400',
        applyBtn: 'bg-teal-700 text-white',
        message: 'text-red-600',
      }
    : {
        appliedBox: 'border-glass-green/40 bg-glass-green/10',
        appliedTitle: 'text-glass-green',
        appliedCode: 'text-gray-300',
        appliedBody: 'text-gray-300',
        appliedStrong: 'text-white',
        appliedNote: 'text-gray-500',
        removeBtn: 'border-gray-700 text-gray-300',
        trigger: 'text-gold-300',
        label: 'text-gray-400',
        input: 'bg-gray-800 border-gray-700 text-white placeholder-gray-500',
        applyBtn: 'bg-gold-400 text-black',
        message: 'text-amber-300',
      },
)
</script>

<template>
  <div>
    <!-- Applied: keep it visible so the family can see why the total dropped -->
    <div
      v-if="applied"
      class="rounded-xl border p-3 flex items-start justify-between gap-3"
      :class="ui.appliedBox"
    >
      <div class="min-w-0">
        <p class="text-sm font-bold" :class="ui.appliedTitle">🎟️ {{ applied.label }}</p>
        <p class="text-[11px] font-mono mt-0.5" :class="ui.appliedCode">{{ applied.code }}</p>
        <p class="text-xs mt-1" :class="ui.appliedBody">
          {{ es ? 'Descuento' : 'Discount' }}
          <span class="font-bold" :class="ui.appliedTitle">−{{ money(applied.discountMxn) }}</span>
          · {{ es ? 'pagas' : 'you pay' }}
          <span class="font-bold" :class="ui.appliedStrong">{{ money(applied.finalMxn) }}</span>
        </p>
        <p v-if="applied.description" class="text-[11px] mt-1" :class="ui.appliedNote">
          {{ applied.description }}
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 text-[11px] px-2 py-1 rounded-lg border"
        :class="ui.removeBtn"
        @click="clear"
      >
        {{ es ? 'Quitar' : 'Remove' }}
      </button>
    </div>

    <template v-else>
      <button
        v-if="!open"
        type="button"
        :disabled="disabled"
        class="text-xs font-semibold underline underline-offset-2 disabled:opacity-40"
        :class="ui.trigger"
        @click="open = true"
      >
        🎟️ {{ es ? '¿Tienes un código de descuento?' : 'Have a discount code?' }}
      </button>

      <div v-else class="space-y-2">
        <label class="block text-xs font-medium" :class="ui.label">
          {{ es ? 'Código de descuento' : 'Discount code' }}
        </label>
        <div class="flex gap-2">
          <input
            v-model="code"
            type="text"
            autocapitalize="characters"
            :placeholder="es ? 'Escribe tu código' : 'Enter your code'"
            class="flex-1 min-w-0 px-3 py-2.5 border rounded-xl text-sm font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
            :class="ui.input"
            @keydown.enter.prevent="apply"
          />
          <button
            type="button"
            :disabled="checking || !code.trim() || disabled"
            class="shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold disabled:opacity-40"
            :class="ui.applyBtn"
            @click="apply"
          >
            {{ checking ? '…' : (es ? 'Aplicar' : 'Apply') }}
          </button>
        </div>
        <p v-if="message" class="text-[11px]" :class="ui.message">{{ message }}</p>
      </div>
    </template>
  </div>
</template>
