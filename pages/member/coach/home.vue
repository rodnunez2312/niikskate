<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

import { format, addDays, startOfWeek } from 'date-fns'
import { es } from 'date-fns/locale'
import { isClassDay, slotsForDate } from '~/utils/classSchedule'
import type { TimeSlot } from '~/types'
import { TIME_SLOT_LABELS } from '~/types'

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

const loading = ref(true)
const profile = ref<any>(null)
const todayReservations = ref<any[]>([])
const stats = ref({ students: 0, today: 0, week: 0, pending: 0 })
const selectedSlot = ref<TimeSlot>('early')
const showEmergencyModal = ref(false)
const emergencyContacts = ref<any[]>([])

const firstName = computed(() => profile.value?.full_name?.split(' ')[0] || 'Coach')
const today = new Date()
const weekStart = startOfWeek(today, { weekStartsOn: 0 })
const todayStr = format(today, 'yyyy-MM-dd')

const todaySlots = computed(() => (isClassDay(today) ? slotsForDate(today) : []))

watch(todaySlots, slots => {
  if (slots.length && !slots.includes(selectedSlot.value)) selectedSlot.value = slots[0]
}, { immediate: true })

const slotReservations = computed(() =>
  todayReservations.value.filter(r => r.time_slot === selectedSlot.value),
)

onMounted(async () => {
  if (!user.value) return
  loading.value = true
  try {
    const { data: prof } = await client.from('profiles').select('*').eq('id', user.value.id).single()
    profile.value = prof

    const weekEnd = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const [todayRes, weekRes, students, pending] = await Promise.all([
      client
        .from('class_reservations')
        .select('*, user:profiles(full_name, email)')
        .eq('reservation_date', todayStr)
        .eq('status', 'active')
        .order('time_slot'),
      client
        .from('class_reservations')
        .select('id')
        .gte('reservation_date', format(weekStart, 'yyyy-MM-dd'))
        .lte('reservation_date', weekEnd)
        .eq('status', 'active'),
      client.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer').eq('is_active', true),
      client.from('registration_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ])

    todayReservations.value = todayRes.data || []
    stats.value = {
      students: students.count || 0,
      today: todayReservations.value.length,
      week: weekRes.data?.length || 0,
      pending: pending.count || 0,
    }
  } finally {
    loading.value = false
  }
})

async function openEmergency() {
  showEmergencyModal.value = true
  const { data } = await client
    .from('emergency_contacts')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  emergencyContacts.value = data || []
}

function slotLabel(slot: TimeSlot) {
  return TIME_SLOT_LABELS[slot]?.display || slot
}
</script>

<template>
  <div class="pb-8">
    <header class="bg-gradient-to-br from-flame-600/90 to-gold-500/80 px-4 py-6">
      <div class="max-w-lg mx-auto">
        <h1 class="text-2xl font-bold text-white">
          {{ language === 'es' ? `Hola, ${firstName}` : `Hello, ${firstName}` }}
        </h1>
        <p class="text-white/80 text-sm mt-1">
          {{ format(today, language === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d', { locale: language === 'es' ? es : undefined }) }}
        </p>
        <div v-if="!loading" class="grid grid-cols-4 gap-2 mt-4">
          <div v-for="(val, key) in { today: stats.today, week: stats.week, students: stats.students, pending: stats.pending }" :key="key" class="bg-white/20 rounded-xl p-2 text-center">
            <p class="text-xl font-bold text-white">{{ val }}</p>
            <p class="text-[10px] text-white/80 uppercase">
              {{ key === 'today' ? (language === 'es' ? 'Hoy' : 'Today') : key === 'week' ? (language === 'es' ? 'Semana' : 'Week') : key === 'students' ? (language === 'es' ? 'Alumnos' : 'Students') : (language === 'es' ? 'Solic.' : 'Req.') }}
            </p>
          </div>
        </div>
      </div>
    </header>

    <div class="px-4 max-w-lg mx-auto py-6 space-y-6">
      <div v-if="loading" class="flex justify-center py-12">
        <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>

      <template v-else>
        <section v-if="isClassDay(today)" class="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
          <h2 class="font-bold text-white text-sm">
            {{ language === 'es' ? 'Clases de hoy' : "Today's classes" }}
          </h2>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="slot in todaySlots"
              :key="slot"
              type="button"
              class="px-3 py-2 rounded-lg text-xs font-semibold border transition-colors"
              :class="selectedSlot === slot ? 'bg-gold-400 text-black border-gold-400' : 'border-gray-700 text-gray-400'"
              @click="selectedSlot = slot"
            >
              {{ slotLabel(slot) }}
            </button>
          </div>
          <ul v-if="slotReservations.length" class="space-y-2">
            <li v-for="res in slotReservations" :key="res.id" class="flex items-center gap-3 bg-gray-800 rounded-lg p-2">
              <div class="w-9 h-9 rounded-full bg-gold-400/20 flex items-center justify-center text-gold-400 font-bold text-sm">
                {{ res.user?.full_name?.charAt(0) || '?' }}
              </div>
              <p class="text-sm text-white font-medium">{{ res.user?.full_name || 'Student' }}</p>
            </li>
          </ul>
          <p v-else class="text-sm text-gray-500">{{ language === 'es' ? 'Sin reservas en este horario.' : 'No reservations in this slot.' }}</p>
        </section>
        <p v-else class="text-sm text-gray-500 text-center py-4">
          {{ language === 'es' ? 'Hoy no hay clases programadas.' : 'No class day today.' }}
        </p>

        <section>
          <h2 class="text-sm font-bold text-white mb-3">{{ language === 'es' ? 'Acciones rápidas' : 'Quick actions' }}</h2>
          <div class="grid grid-cols-2 gap-3">
            <NuxtLink to="/member/coach/plans" class="rounded-xl bg-gradient-to-br from-purple-600/80 to-blue-600/80 p-4">
              <span class="text-2xl">📋</span>
              <p class="font-bold text-white text-sm mt-1">{{ language === 'es' ? 'Planear clase' : 'Plan class' }}</p>
            </NuxtLink>
            <NuxtLink to="/member/coach/students" class="rounded-xl bg-gradient-to-br from-gold-400 to-orange-500 p-4">
              <span class="text-2xl">👥</span>
              <p class="font-bold text-black text-sm mt-1">{{ language === 'es' ? 'Alumnos' : 'Students' }}</p>
            </NuxtLink>
            <NuxtLink to="/member/coach/evaluations" class="rounded-xl bg-gradient-to-br from-green-600/80 to-teal-600/80 p-4">
              <span class="text-2xl">📝</span>
              <p class="font-bold text-white text-sm mt-1">{{ language === 'es' ? 'Evaluar' : 'Evaluate' }}</p>
            </NuxtLink>
            <NuxtLink to="/member/coach/plans?tab=tips" class="rounded-xl bg-gradient-to-br from-flame-600/80 to-orange-600/80 p-4">
              <span class="text-2xl">💡</span>
              <p class="font-bold text-white text-sm mt-1">{{ language === 'es' ? 'Conocimiento' : 'Knowledge' }}</p>
            </NuxtLink>
            <button type="button" class="col-span-2 rounded-xl bg-rose-700/80 p-4 text-left" @click="openEmergency">
              <span class="text-2xl">📞</span>
              <p class="font-bold text-white text-sm mt-1">{{ language === 'es' ? 'Emergencias' : 'Emergency' }}</p>
            </button>
          </div>
        </section>
      </template>
    </div>

    <Teleport to="body">
      <div v-if="showEmergencyModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" @click.self="showEmergencyModal = false">
        <div class="bg-gray-900 border border-gray-700 rounded-2xl max-w-md w-full max-h-[80vh] overflow-y-auto p-4">
          <h3 class="font-bold text-white mb-4">{{ language === 'es' ? 'Contactos de emergencia' : 'Emergency contacts' }}</h3>
          <ul class="space-y-3">
            <li v-for="c in emergencyContacts" :key="c.id" class="border-b border-gray-800 pb-3">
              <p class="font-semibold text-white">{{ c.name }}</p>
              <p class="text-sm text-gray-400">{{ c.role }}</p>
              <a :href="`tel:${c.phone}`" class="text-gold-400 text-sm">{{ c.phone }}</a>
            </li>
          </ul>
          <button type="button" class="mt-4 w-full py-2 rounded-lg bg-gray-800 text-white text-sm" @click="showEmergencyModal = false">
            {{ language === 'es' ? 'Cerrar' : 'Close' }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
