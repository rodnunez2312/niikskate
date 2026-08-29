<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

const client = useSupabaseClient()
const { language, formatPrice } = useI18n()

const loading = ref(true)
const stats = ref({
  totalCustomers: 0,
  activeCoaches: 0,
  pendingRegistrations: 0,
  totalBookings: 0,
  pendingBookings: 0,
  classesThisMonth: 0,
  paymentsThisMonth: 0,
})

onMounted(async () => {
  loading.value = true
  try {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const [
      customers,
      coaches,
      regs,
      bookings,
      pendingBookings,
      reservations,
      payments,
    ] = await Promise.all([
      client.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
      countActiveCoachDirectoryProfiles(client),
      client.from('registration_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      client.from('bookings').select('*', { count: 'exact', head: true }),
      client.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      client.from('class_reservations').select('*', { count: 'exact', head: true }).gte('reservation_date', monthStart.slice(0, 10)),
      client
        .from('finance_payments')
        .select('amount_mxn')
        .eq('status', 'paid')
        .gte('paid_on', monthStart.slice(0, 10)),
    ])

    stats.value.totalCustomers = customers.count || 0
    stats.value.activeCoaches = coaches
    stats.value.pendingRegistrations = regs.count || 0
    stats.value.totalBookings = bookings.count || 0
    stats.value.pendingBookings = pendingBookings.count || 0
    stats.value.classesThisMonth = reservations.count || 0
    stats.value.paymentsThisMonth = (payments.data || []).reduce(
      (s, p) => s + Number((p as { amount_mxn?: number }).amount_mxn || 0),
      0,
    )
  } finally {
    loading.value = false
  }
})

const cards = computed(() => [
  {
    label: language.value === 'es' ? 'Patinadores activos' : 'Active skaters',
    value: stats.value.totalCustomers,
    to: '/member/admin/academy/users?role=customer',
  },
  {
    label: language.value === 'es' ? 'Coaches activos' : 'Active coaches',
    value: stats.value.activeCoaches,
    to: '/member/admin/scheduling/coaches',
  },
  {
    label: language.value === 'es' ? 'Solicitudes pendientes' : 'Pending registrations',
    value: stats.value.pendingRegistrations,
    to: '/member/admin/academy/registrations',
  },
  {
    label: language.value === 'es' ? 'Reservas del mes' : 'Reservations this month',
    value: stats.value.classesThisMonth,
    to: '/member/admin/scheduling/attendance',
  },
  {
    label: language.value === 'es' ? 'Ingresos del mes' : 'Income this month',
    value: formatPrice(stats.value.paymentsThisMonth),
    to: '/member/admin/finance',
  },
])
</script>

<template>
  <div class="px-4 py-6 max-w-lg mx-auto space-y-6 pb-8">
    <div>
      <h1 class="text-xl font-bold text-white">
        {{ language === 'es' ? 'Reportes' : 'Reports' }}
      </h1>
      <p class="text-sm text-gray-400 mt-1">
        {{ language === 'es' ? 'Resumen rápido de la academia.' : 'Quick academy overview.' }}
      </p>
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
    </div>

    <div v-else class="grid grid-cols-2 gap-3">
      <NuxtLink
        v-for="card in cards"
        :key="card.label"
        :to="card.to"
        class="rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gold-400/40 transition-colors"
      >
        <p class="text-2xl font-black text-gold-400">{{ card.value }}</p>
        <p class="text-xs text-gray-400 mt-2 leading-snug">{{ card.label }}</p>
      </NuxtLink>
    </div>

    <NuxtLink
      to="/member/admin/academy/dashboard"
      class="block text-center text-gold-400 text-sm font-semibold underline"
    >
      {{ language === 'es' ? 'Panel admin completo →' : 'Full admin dashboard →' }}
    </NuxtLink>
  </div>
</template>
