<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

const loading = ref(true)
const approvals = ref<Array<{ year: number; month: number; approved_at: string | null }>>([])

const certificationTracks = computed(() => [
  {
    id: 'niik-l1',
    icon: '🎯',
    title: language.value === 'es' ? 'Coach Niik — Nivel 1' : 'Niik Coach — Level 1',
    desc: language.value === 'es' ? 'Fundamentos del Método Niik, seguridad y clase intro.' : 'Niik Method basics, safety, and intro classes.',
    status: 'active' as const,
  },
  {
    id: 'niik-l2',
    icon: '🛹',
    title: language.value === 'es' ? 'Coach Niik — Nivel 2' : 'Niik Coach — Level 2',
    desc: language.value === 'es' ? 'Planificación avanzada, evaluaciones y progresión por grupo.' : 'Advanced planning, evaluations, and group progression.',
    status: 'in_progress' as const,
  },
  {
    id: 'first-aid',
    icon: '🩹',
    title: language.value === 'es' ? 'Primeros auxilios' : 'First aid',
    desc: language.value === 'es' ? 'Certificación vigente recomendada para coaches en campo.' : 'Current certification recommended for on-field coaches.',
    status: 'pending' as const,
  },
  {
    id: 'safeguarding',
    icon: '🛡️',
    title: language.value === 'es' ? 'Protección infantil' : 'Safeguarding',
    desc: language.value === 'es' ? 'Políticas NiikSkate y conducta con menores.' : 'NiikSkate policies and working with minors.',
    status: 'pending' as const,
  },
])

const statusLabel = (status: string) => {
  if (language.value === 'es') {
    return status === 'active' ? 'Completo' : status === 'in_progress' ? 'En curso' : 'Pendiente'
  }
  return status === 'active' ? 'Complete' : status === 'in_progress' ? 'In progress' : 'Pending'
}

const statusClass = (status: string) => {
  if (status === 'active') return 'bg-green-500/20 text-green-400'
  if (status === 'in_progress') return 'bg-gold-400/20 text-gold-400'
  return 'bg-gray-700 text-gray-400'
}

onMounted(async () => {
  if (!user.value) return
  loading.value = true
  try {
    const { data } = await client
      .from('coach_monthly_approvals')
      .select('year, month, approved_at')
      .eq('coach_id', user.value.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(6)
    approvals.value = data || []
  } finally {
    loading.value = false
  }
})

function monthName(year: number, month: number) {
  return new Date(year, month - 1, 1).toLocaleDateString(language.value === 'es' ? 'es-MX' : 'en-US', {
    month: 'long',
    year: 'numeric',
  })
}
</script>

<template>
  <div class="px-4 py-6 max-w-lg mx-auto space-y-6 pb-8">
    <div>
      <h1 class="text-xl font-bold text-white">
        {{ language === 'es' ? 'Certificaciones' : 'Certifications' }}
      </h1>
      <p class="text-sm text-gray-400 mt-1">
        {{ language === 'es' ? 'Formación Niik y requisitos de coach.' : 'Niik training and coach requirements.' }}
      </p>
    </div>

    <ul class="space-y-3">
      <li
        v-for="track in certificationTracks"
        :key="track.id"
        class="rounded-xl border border-gray-800 bg-gray-900 p-4"
      >
        <div class="flex items-start gap-3">
          <span class="text-2xl">{{ track.icon }}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <p class="font-bold text-white text-sm">{{ track.title }}</p>
              <span class="text-xs font-bold px-2 py-0.5 rounded-full" :class="statusClass(track.status)">
                {{ statusLabel(track.status) }}
              </span>
            </div>
            <p class="text-xs text-gray-400 mt-1">{{ track.desc }}</p>
          </div>
        </div>
      </li>
    </ul>

    <section class="space-y-3">
      <h2 class="text-sm font-bold text-gold-400 uppercase tracking-wide">
        {{ language === 'es' ? 'Aprobaciones mensuales' : 'Monthly sign-offs' }}
      </h2>
      <div v-if="loading" class="flex justify-center py-6">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
      <ul v-else-if="approvals.length" class="space-y-2">
        <li
          v-for="a in approvals"
          :key="`${a.year}-${a.month}`"
          class="flex justify-between rounded-lg bg-gray-900 border border-gray-800 px-4 py-3 text-sm"
        >
          <span class="text-white">{{ monthName(a.year, a.month) }}</span>
          <span class="text-green-400 font-semibold">{{ language === 'es' ? 'Aprobado' : 'Approved' }}</span>
        </li>
      </ul>
      <p v-else class="text-sm text-gray-500">
        {{ language === 'es' ? 'Sin registros aún — contacta al admin de academia.' : 'No records yet — contact academy admin.' }}
      </p>
    </section>

    <div class="flex flex-col gap-2">
      <NuxtLink to="/member/coach/plans?tab=tips" class="text-center text-gold-400 text-sm font-semibold underline">
        {{ language === 'es' ? 'Base de conocimiento →' : 'Knowledge base →' }}
      </NuxtLink>
      <NuxtLink to="/member/coach/plans" class="text-center text-gray-400 text-sm underline">
        {{ language === 'es' ? 'Planes de clase →' : 'Lesson plans →' }}
      </NuxtLink>
    </div>
  </div>
</template>
