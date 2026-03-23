<script setup lang="ts">
import type { UserCredit } from '~/types'
import { CREDIT_TYPE_INFO, type CreditType } from '~/types'

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

const credits = ref<UserCredit[]>([])
const pendingRows = ref<UserCredit[]>([])
const skaterPendingConfirmCount = ref(0)
const loading = ref(true)

const totalRemaining = computed(() =>
  credits.value.reduce((sum, c) => sum + (c.remaining_credits || 0), 0)
)

/** Paid credits to spend + classes waiting for skater tap-to-confirm on calendar */
const displayAvailableTotal = computed(
  () => totalRemaining.value + skaterPendingConfirmCount.value
)

const pendingTotalClasses = computed(() =>
  pendingRows.value.reduce((sum, c) => sum + (c.total_credits || 0), 0)
)

const fetchCredits = async () => {
  if (!user.value?.id) {
    credits.value = []
    pendingRows.value = []
    skaterPendingConfirmCount.value = 0
    loading.value = false
    return
  }
  loading.value = true
  try {
    const nowIso = new Date().toISOString()

    const { data: active, error: e1 } = await client
      .from('user_credits')
      .select('*')
      .eq('user_id', user.value.id)
      .gt('remaining_credits', 0)
      .gte('expiration_date', nowIso)
      .or('payment_status.is.null,payment_status.eq.paid,payment_status.eq.approved')
      .order('expiration_date', { ascending: true })

    if (e1) throw e1
    credits.value = active || []

    const { data: pend, error: e2 } = await client
      .from('user_credits')
      .select('*')
      .eq('user_id', user.value.id)
      .eq('payment_status', 'pending')
      .gt('total_credits', 0)
      .eq('remaining_credits', 0)
      .order('created_at', { ascending: false })

    if (e2) throw e2
    pendingRows.value = pend || []

    const { count: skCount, error: e3 } = await client
      .from('class_reservations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.value.id)
      .eq('status', 'pending_skater_confirm')

    if (e3) throw e3
    skaterPendingConfirmCount.value = skCount ?? 0
  } catch (e) {
    console.error('SkaterCreditsBalance:', e)
  } finally {
    loading.value = false
  }
}

watch(
  () => user.value?.id,
  () => fetchCredits(),
  { immediate: true }
)

const labelFor = (c: UserCredit) => {
  const info = CREDIT_TYPE_INFO[c.credit_type as CreditType]
  if (!info) return c.credit_type
  return language.value === 'es' ? info.name_es : info.name
}
</script>

<template>
  <div class="bg-black/70 backdrop-blur-sm rounded-2xl p-4 border border-glass-green/40">
    <div class="mb-3">
      <h2 class="text-lg font-bold text-white">
        {{ language === 'es' ? 'Créditos' : 'Credits' }}
      </h2>
    </div>

    <div v-if="loading" class="h-14 bg-gray-800/80 rounded-xl animate-pulse"></div>
    <template v-else>
      <div v-if="pendingRows.length > 0" class="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30">
        <p class="text-amber-200 text-sm font-semibold">
          {{
            language === 'es'
              ? `${pendingTotalClasses} clase(s) pendiente(s) de confirmación de pago`
              : `${pendingTotalClasses} class(es) pending payment confirmation`
          }}
        </p>
        <p class="text-amber-200/80 text-xs mt-1">
          {{
            language === 'es'
              ? 'Un administrador activará tus créditos al recibir el pago.'
              : 'An admin will activate your credits after receiving payment.'
          }}
        </p>
      </div>

      <div class="flex items-baseline gap-2 mb-3">
        <span
          class="text-4xl font-black"
          :class="displayAvailableTotal > 0 ? 'text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.35)]' : 'text-glass-green'"
        >
          {{ displayAvailableTotal }}
        </span>
        <span class="text-gray-400 text-sm">
          {{
            language === 'es'
              ? displayAvailableTotal === 1
                ? 'clase disponible'
                : 'clases disponibles'
              : displayAvailableTotal === 1
                ? 'class available'
                : 'classes available'
          }}
        </span>
      </div>
      <p
        v-if="skaterPendingConfirmCount > 0"
        class="text-xs text-cyan-200/90 mb-3 -mt-1 leading-snug"
      >
        {{
          language === 'es'
            ? `Toca el día en «Mis clases» y confirma ${skaterPendingConfirmCount === 1 ? 'tu clase' : 'cada clase'} (mín. 24 h antes del horario).`
            : `Tap the day under “My classes” to confirm ${skaterPendingConfirmCount === 1 ? 'your class' : 'each class'} (at least 24 h before start).`
        }}
      </p>
      <ul v-if="credits.length > 0" class="space-y-2 text-sm text-gray-300 border-t border-gray-800 pt-3">
        <li v-for="c in credits" :key="c.id" class="flex justify-between gap-2">
          <span class="truncate">{{ labelFor(c) }}</span>
          <span class="text-gold-400 font-bold shrink-0">{{ c.remaining_credits }}</span>
        </li>
      </ul>
      <p
        v-else-if="pendingRows.length === 0 && skaterPendingConfirmCount === 0"
        class="text-gray-500 text-sm"
      >
        {{ language === 'es' ? 'Sin créditos activos. Compra un paquete abajo.' : 'No active credits. Buy a package below.' }}
      </p>
    </template>
  </div>
</template>
