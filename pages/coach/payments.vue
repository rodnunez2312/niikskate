<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { CoachPayment } from '~/types'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language, currency } = useI18n()

// State
const isCoach = ref(false)
const loading = ref(true)
const payments = ref<CoachPayment[]>([])

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/coach/payments')
    return
  }

  const { data } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.value.id)
    .single()

  if (data?.role !== 'coach' && data?.role !== 'admin') {
    router.push('/')
    return
  }

  isCoach.value = true
  await loadPayments()
})

const loadPayments = async () => {
  loading.value = true
  try {
    const { data, error } = await client
      .from('coach_payments')
      .select('*')
      .eq('coach_id', user.value?.id)
      .order('period_end', { ascending: false })

    if (error) throw error
    payments.value = data || []
  } catch (e) {
    console.error('Error loading payments:', e)
  } finally {
    loading.value = false
  }
}

// Format date
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const locale = language.value === 'es' ? es : undefined
  return format(date, 'dd MMM yyyy', { locale })
}

// Format amount
const formatAmount = (amount: number, cur: string = 'MXN') => {
  return `$${amount.toFixed(2)} ${cur}`
}

// Stats
const stats = computed(() => {
  const paid = payments.value.filter(p => p.status === 'paid')
  const pending = payments.value.filter(p => p.status === 'pending')
  
  return {
    totalPaid: paid.reduce((sum, p) => sum + p.amount, 0),
    totalPending: pending.reduce((sum, p) => sum + p.amount, 0),
    paidCount: paid.length,
    pendingCount: pending.length,
  }
})
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center gap-3">
          <button @click="router.push('/coach')" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl font-bold text-white">
              {{ language === 'es' ? 'Mis Pagos' : 'My Payments' }}
            </h1>
            <p class="text-sm text-gray-400">{{ language === 'es' ? 'Historial de compensación' : 'Compensation history' }}</p>
          </div>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div v-if="isCoach" class="px-4 py-6 max-w-2xl mx-auto">
      <!-- Stats -->
      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="bg-gradient-to-br from-glass-green/20 to-glass-blue/20 border border-glass-green/30 rounded-2xl p-4">
          <p class="text-2xl font-bold text-glass-green">{{ formatAmount(stats.totalPaid) }}</p>
          <p class="text-sm text-gray-400">{{ language === 'es' ? 'Total Pagado' : 'Total Paid' }}</p>
        </div>
        <div class="bg-gradient-to-br from-gold-400/20 to-glass-orange/20 border border-gold-400/30 rounded-2xl p-4">
          <p class="text-2xl font-bold text-gold-400">{{ formatAmount(stats.totalPending) }}</p>
          <p class="text-sm text-gray-400">{{ language === 'es' ? 'Pendiente' : 'Pending' }}</p>
        </div>
      </div>

      <!-- Info -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
        <div class="flex items-start gap-3">
          <span class="text-2xl">ℹ️</span>
          <p class="text-sm text-gray-400">
            {{ language === 'es' 
              ? 'Los pagos son registrados por el administrador. Si tienes preguntas sobre tu compensación, contacta al admin.' 
              : 'Payments are recorded by the admin. If you have questions about your compensation, contact the admin.' 
            }}
          </p>
        </div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-12">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>

      <!-- Payments List -->
      <div v-else-if="payments.length === 0" class="text-center py-12">
        <p class="text-4xl mb-3">💰</p>
        <p class="text-gray-400">{{ language === 'es' ? 'No hay pagos registrados' : 'No payments recorded' }}</p>
      </div>

      <div v-else class="space-y-3">
        <h2 class="font-bold text-white mb-3">{{ language === 'es' ? 'Historial' : 'History' }}</h2>
        
        <div
          v-for="payment in payments"
          :key="payment.id"
          class="bg-gray-900 border border-gray-800 rounded-xl p-4"
        >
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="text-sm text-gray-400">
                {{ formatDate(payment.period_start) }} - {{ formatDate(payment.period_end) }}
              </p>
              <p class="text-xs text-gray-500">
                {{ payment.classes_taught }} {{ payment.classes_taught === 1 
                  ? (language === 'es' ? 'clase' : 'class') 
                  : (language === 'es' ? 'clases' : 'classes') 
                }}
              </p>
            </div>
            <div class="text-right">
              <p class="font-bold" :class="payment.status === 'paid' ? 'text-glass-green' : 'text-gold-400'">
                {{ formatAmount(payment.amount, payment.currency) }}
              </p>
              <span 
                class="px-2 py-0.5 rounded-full text-xs font-bold"
                :class="payment.status === 'paid' ? 'bg-glass-green/20 text-glass-green' : 'bg-gold-400/20 text-gold-400'"
              >
                {{ payment.status === 'paid' 
                  ? (language === 'es' ? 'Pagado' : 'Paid') 
                  : (language === 'es' ? 'Pendiente' : 'Pending') 
                }}
              </span>
            </div>
          </div>
          
          <div v-if="payment.paid_at" class="text-xs text-gray-500 mt-2">
            {{ language === 'es' ? 'Pagado el' : 'Paid on' }} {{ formatDate(payment.paid_at) }}
          </div>
          
          <p v-if="payment.notes" class="text-sm text-gray-400 mt-2 bg-gray-800/50 rounded-lg p-2">
            {{ payment.notes }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
