<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language, currency } = useI18n()

// State
const isAdmin = ref(false)
const loading = ref(true)
const payments = ref<any[]>([])
const coaches = ref<any[]>([])
const showAddModal = ref(false)

// Payment categories
const paymentCategories = [
  { id: 'coaches', name: 'Coaches', name_es: 'Coaches', icon: '👨‍🏫' },
  { id: 'rent', name: 'Rent', name_es: 'Renta', icon: '🏠' },
  { id: 'insumos', name: 'Supplies', name_es: 'Insumos', icon: '📦' },
  { id: 'other', name: 'Other', name_es: 'Otro', icon: '💰' },
]

// Form
const newPayment = ref({
  user_email: '',
  amount: '',
  method: 'cash' as 'cash' | 'card' | 'transfer',
  category: 'other' as 'coaches' | 'rent' | 'insumos' | 'other',
  coach_id: '' as string,
  notes: '',
})
const saving = ref(false)

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/admin/payments')
    return
  }

  const { data } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.value.id)
    .single()

  if (data?.role !== 'admin') {
    router.push('/')
    return
  }

  isAdmin.value = true
  await Promise.all([loadPayments(), loadCoaches()])
})

const loadCoaches = async () => {
  try {
    const { data } = await client
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'coach')
      .eq('is_active', true)
      .order('full_name')
    
    coaches.value = data || []
  } catch (e) {
    console.error('Error loading coaches:', e)
  }
}

const loadPayments = async () => {
  loading.value = true
  try {
    const { data, error } = await client
      .from('payments')
      .select(`
        *,
        receiver:profiles!received_by(full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error
    payments.value = data || []
  } catch (e) {
    console.error('Error loading payments:', e)
  } finally {
    loading.value = false
  }
}

const addPayment = async () => {
  if (!newPayment.value.amount) return
  
  // Validate coach selection if category is coaches
  if (newPayment.value.category === 'coaches' && !newPayment.value.coach_id) {
    alert(language.value === 'es' ? 'Selecciona un coach' : 'Select a coach')
    return
  }
  
  saving.value = true
  try {
    // Build notes with category info
    let notesWithCategory = ''
    const categoryLabel = paymentCategories.find(c => c.id === newPayment.value.category)
    notesWithCategory = `[${categoryLabel?.icon} ${language.value === 'es' ? categoryLabel?.name_es : categoryLabel?.name}]`
    
    // Add coach name if coaches category
    if (newPayment.value.category === 'coaches' && newPayment.value.coach_id) {
      const selectedCoach = coaches.value.find(c => c.id === newPayment.value.coach_id)
      if (selectedCoach) {
        notesWithCategory += ` - ${selectedCoach.full_name}`
      }
    }
    
    if (newPayment.value.notes) {
      notesWithCategory += ` | ${newPayment.value.notes}`
    }

    const { error } = await client
      .from('payments')
      .insert({
        amount: parseFloat(newPayment.value.amount),
        payment_method: newPayment.value.method,
        notes: notesWithCategory,
        received_by: user.value?.id,
      })

    if (error) throw error

    showAddModal.value = false
    newPayment.value = { user_email: '', amount: '', method: 'cash', category: 'other', coach_id: '', notes: '' }
    await loadPayments()
  } catch (e) {
    console.error('Error adding payment:', e)
  } finally {
    saving.value = false
  }
}

// Format date
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const locale = language.value === 'es' ? es : undefined
  return format(date, 'dd MMM yyyy, HH:mm', { locale })
}

// Format amount
const formatAmount = (amount: number) => {
  return currency.value === 'USD' 
    ? `$${amount.toFixed(2)} USD`
    : `$${amount.toFixed(2)} MXN`
}

// Payment method labels
const methodLabels: Record<string, { icon: string; label: { en: string; es: string } }> = {
  cash: { icon: '💵', label: { en: 'Cash', es: 'Efectivo' } },
  card: { icon: '💳', label: { en: 'Card', es: 'Tarjeta' } },
  transfer: { icon: '🏦', label: { en: 'Transfer', es: 'Transferencia' } },
}

// Stats
const stats = computed(() => {
  const today = new Date()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  
  const thisMonth = payments.value.filter(p => new Date(p.created_at) >= startOfMonth)
  const totalThisMonth = thisMonth.reduce((sum, p) => sum + parseFloat(p.amount), 0)
  const totalAll = payments.value.reduce((sum, p) => sum + parseFloat(p.amount), 0)
  
  return {
    countThisMonth: thisMonth.length,
    totalThisMonth,
    totalAll,
  }
})
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button @click="router.push('/admin')" class="p-2 -ml-2 text-white">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 class="text-xl font-bold text-white">
                {{ language === 'es' ? 'Pagos' : 'Payments' }}
              </h1>
              <p class="text-sm text-gray-400">{{ language === 'es' ? 'Registro de pagos' : 'Payment records' }}</p>
            </div>
          </div>
          <button
            @click="showAddModal = true"
            class="px-4 py-2 bg-gold-400 text-black font-bold rounded-xl flex items-center gap-2"
          >
            <span>+</span>
            {{ language === 'es' ? 'Nuevo' : 'New' }}
          </button>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div v-if="isAdmin" class="px-4 py-6 max-w-2xl mx-auto">
      <!-- Stats -->
      <div class="grid grid-cols-2 gap-3 mb-6">
        <div class="bg-gradient-to-br from-gold-400/20 to-gold-500/20 border border-gold-400/30 rounded-2xl p-4">
          <p class="text-2xl font-bold text-gold-400">{{ formatAmount(stats.totalThisMonth) }}</p>
          <p class="text-sm text-gray-400">{{ language === 'es' ? 'Este mes' : 'This month' }}</p>
        </div>
        <div class="bg-gradient-to-br from-glass-green/20 to-glass-blue/20 border border-glass-green/30 rounded-2xl p-4">
          <p class="text-2xl font-bold text-glass-green">{{ stats.countThisMonth }}</p>
          <p class="text-sm text-gray-400">{{ language === 'es' ? 'Transacciones' : 'Transactions' }}</p>
        </div>
      </div>

      <!-- Payments List -->
      <h2 class="font-bold text-white mb-3">{{ language === 'es' ? 'Historial' : 'History' }}</h2>

      <div v-if="loading" class="text-center py-12">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>

      <div v-else-if="payments.length === 0" class="text-center py-12">
        <p class="text-4xl mb-3">💰</p>
        <p class="text-gray-400">{{ language === 'es' ? 'No hay pagos registrados' : 'No payments recorded' }}</p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="payment in payments"
          :key="payment.id"
          class="bg-gray-900 border border-gray-800 rounded-xl p-4"
        >
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-xl">{{ methodLabels[payment.payment_method]?.icon || '💵' }}</span>
              <span class="text-sm text-gray-400">
                {{ methodLabels[payment.payment_method]?.label[language] || payment.payment_method }}
              </span>
            </div>
            <p class="font-bold text-gold-400">{{ formatAmount(parseFloat(payment.amount)) }}</p>
          </div>
          <div class="flex items-center justify-between text-sm text-gray-500">
            <span>{{ formatDate(payment.created_at) }}</span>
            <span v-if="payment.receiver">{{ language === 'es' ? 'Por' : 'By' }}: {{ payment.receiver.full_name }}</span>
          </div>
          <p v-if="payment.notes" class="text-sm text-gray-400 mt-2 bg-gray-800/50 rounded-lg p-2">
            {{ payment.notes }}
          </p>
        </div>
      </div>
    </div>

    <!-- Add Payment Modal -->
    <Teleport to="body">
      <div v-if="showAddModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/80" @click="showAddModal = false"></div>
        <div class="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full">
          <h3 class="text-xl font-bold text-white mb-4">
            {{ language === 'es' ? 'Registrar Pago' : 'Record Payment' }}
          </h3>

          <form @submit.prevent="addPayment" class="space-y-4">
            <!-- Payment Category -->
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Categoría' : 'Category' }} *
              </label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="cat in paymentCategories"
                  :key="cat.id"
                  type="button"
                  @click="newPayment.category = cat.id; if (cat.id !== 'coaches') newPayment.coach_id = ''"
                  class="py-3 px-3 rounded-xl font-semibold transition-all flex items-center gap-2"
                  :class="newPayment.category === cat.id ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
                >
                  <span class="text-lg">{{ cat.icon }}</span>
                  <span class="text-sm">{{ language === 'es' ? cat.name_es : cat.name }}</span>
                </button>
              </div>
            </div>

            <!-- Coach Selection (only shown when category is 'coaches') -->
            <div v-if="newPayment.category === 'coaches'">
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Seleccionar Coach' : 'Select Coach' }} *
              </label>
              <select
                v-model="newPayment.coach_id"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none"
                required
              >
                <option value="">{{ language === 'es' ? '-- Seleccionar --' : '-- Select --' }}</option>
                <option v-for="coach in coaches" :key="coach.id" :value="coach.id">
                  {{ coach.full_name }} ({{ coach.email }})
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Monto' : 'Amount' }} *
              </label>
              <input
                v-model="newPayment.amount"
                type="number"
                step="0.01"
                required
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                :placeholder="currency === 'USD' ? '0.00 USD' : '0.00 MXN'"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Método de pago' : 'Payment method' }}
              </label>
              <div class="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  @click="newPayment.method = 'cash'"
                  class="py-3 rounded-xl font-semibold transition-all flex flex-col items-center gap-1"
                  :class="newPayment.method === 'cash' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
                >
                  <span class="text-xl">💵</span>
                  <span class="text-xs">{{ language === 'es' ? 'Efectivo' : 'Cash' }}</span>
                </button>
                <button
                  type="button"
                  @click="newPayment.method = 'card'"
                  class="py-3 rounded-xl font-semibold transition-all flex flex-col items-center gap-1"
                  :class="newPayment.method === 'card' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
                >
                  <span class="text-xl">💳</span>
                  <span class="text-xs">{{ language === 'es' ? 'Tarjeta' : 'Card' }}</span>
                </button>
                <button
                  type="button"
                  @click="newPayment.method = 'transfer'"
                  class="py-3 rounded-xl font-semibold transition-all flex flex-col items-center gap-1"
                  :class="newPayment.method === 'transfer' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
                >
                  <span class="text-xl">🏦</span>
                  <span class="text-xs">{{ language === 'es' ? 'Transfer' : 'Transfer' }}</span>
                </button>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Notas adicionales' : 'Additional Notes' }}
              </label>
              <textarea
                v-model="newPayment.notes"
                rows="2"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none resize-none"
                :placeholder="language === 'es' ? 'Descripción del pago...' : 'Payment description...'"
              ></textarea>
            </div>

            <div class="flex gap-3 pt-2">
              <button
                type="button"
                @click="showAddModal = false"
                class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl"
              >
                {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
              </button>
              <button
                type="submit"
                :disabled="saving || !newPayment.amount"
                class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50"
              >
                {{ saving ? '...' : (language === 'es' ? 'Guardar' : 'Save') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>
