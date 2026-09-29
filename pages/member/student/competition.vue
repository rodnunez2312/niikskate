<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

import type { CompetitionEvent } from '~/composables/useCompetitionEvents'

import { isCompetitionPhase } from '~/utils/skillGroupLevels'

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()
const { fetchCompetitions, splitUpcomingPast } = useCompetitionEvents()
const { activeParticipant, guardianProfile, loading: crewLoading } = useCrew()

const competitionsOpen = computed(() => {
  const phase = activeParticipant.value?.skillGroupName || guardianProfile.value?.skillGroupName
  return !crewLoading.value && isCompetitionPhase(phase)
})

watch([competitionsOpen, crewLoading], () => {
  if (crewLoading.value || competitionsOpen.value) return
  navigateTo('/member/student/classes', { replace: true })
}, { immediate: true })

const loading = ref(true)
const events = ref<CompetitionEvent[]>([])
const upcoming = ref<CompetitionEvent[]>([])
const past = ref<CompetitionEvent[]>([])
const readiness = ref({ progressPct: 0, learned: 0, total: 0, lastEvalRating: null as number | null })

async function loadPage() {
  loading.value = true
  try {
    const { events: rows } = await fetchCompetitions({ includePast: true })
    events.value = rows
    const split = splitUpcomingPast(rows)
    upcoming.value = split.upcoming
    past.value = split.past

    if (user.value) {
      const uid = user.value.id
      const [skillsRes, progressRes, evalRes] = await Promise.all([
        client
          .from('skills_library')
          .select('id')
          .eq('is_active', true)
          .eq('trick_type', 'Trick'),
        client.from('student_progress').select('skill_id').eq('student_id', uid),
        client
          .from('student_evaluations')
          .select('overall_rating')
          .eq('student_id', uid)
          .order('evaluation_date', { ascending: false })
          .limit(1),
      ])
      const total = skillsRes.data?.length || 0
      const trickIds = new Set((skillsRes.data || []).map(row => row.id))
      const learned = (progressRes.data || []).filter(row => trickIds.has(row.skill_id)).length
      readiness.value = {
        total,
        learned,
        progressPct: total ? Math.round((learned / total) * 100) : 0,
        lastEvalRating: evalRes.data?.[0]?.overall_rating ?? null,
      }
    }
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (competitionsOpen.value) loadPage()
})
watch(competitionsOpen, open => {
  if (open) loadPage()
})
</script>

<template>
  <div v-if="competitionsOpen" class="px-4 py-6 max-w-lg mx-auto space-y-6 pb-8">
    <div>
      <h1 class="text-xl font-bold text-white">
        {{ language === 'es' ? 'Competencias' : 'Competitions' }}
      </h1>
      <p class="text-sm text-gray-400 mt-1">
        {{ language === 'es' ? 'Calendario de competencias y tu preparación.' : 'Competition calendar and your readiness.' }}
      </p>
    </div>

    <section class="rounded-xl border border-orange-500/30 bg-orange-500/5 p-4 space-y-3">
      <h2 class="text-sm font-bold text-orange-400 uppercase tracking-wide">
        {{ language === 'es' ? 'Tu preparación' : 'Your readiness' }}
      </h2>
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-lg bg-gray-900/80 p-3">
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Progreso técnico' : 'Skill progress' }}</p>
          <p class="text-lg font-bold text-white">{{ readiness.progressPct }}%</p>
          <p class="text-xs text-gray-500">{{ readiness.learned }}/{{ readiness.total }} {{ language === 'es' ? 'trucos' : 'tricks' }}</p>
        </div>
        <div class="rounded-lg bg-gray-900/80 p-3">
          <p class="text-xs text-gray-400">{{ language === 'es' ? 'Última evaluación' : 'Latest evaluation' }}</p>
          <p class="text-lg font-bold text-white">
            {{ readiness.lastEvalRating != null ? `${readiness.lastEvalRating}/5` : '—' }}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 pt-1">
        <NuxtLink to="/member/student/training-program" class="text-xs font-semibold text-gold-400 underline">
          {{ language === 'es' ? 'Ver programa' : 'View program' }}
        </NuxtLink>
        <NuxtLink to="/member/student/progress" class="text-xs font-semibold text-gray-400 underline">
          {{ language === 'es' ? 'Progreso' : 'Progress' }}
        </NuxtLink>
      </div>
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-bold text-white">
        {{ language === 'es' ? 'Calendario' : 'Calendar' }}
      </h2>
      <MemberCompetitionCalendar :events="events" :loading="loading" />
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-bold text-white">
        {{ language === 'es' ? 'Próximas competencias' : 'Upcoming competitions' }}
      </h2>
      <MemberCompetitionEventsList
        :events="upcoming"
        :loading="loading"
        :empty-message="language === 'es' ? 'Aún no hay competencias publicadas. Pregunta a tu coach.' : 'No published competitions yet. Ask your coach.'"
      />
    </section>

    <section class="space-y-3">
      <h2 class="text-sm font-bold text-gray-400">
        {{ language === 'es' ? 'Competencias pasadas' : 'Past competitions' }}
      </h2>
      <MemberCompetitionEventsList
        :events="past"
        :loading="loading"
        :empty-message="language === 'es' ? 'Aún no hay competencias pasadas.' : 'No past competitions yet.'"
      />
    </section>
  </div>
</template>
