<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

import type { CompetitionEvent } from '~/composables/useCompetitionEvents'

const { language } = useI18n()
const { fetchCompetitions, splitUpcomingPast } = useCompetitionEvents()
const { selected: selectedSport, matchesSport } = useEnabledSports()

const loading = ref(true)
const loadError = ref<string | null>(null)
const upcoming = ref<CompetitionEvent[]>([])
const past = ref<CompetitionEvent[]>([])
const showPast = ref(false)

async function loadCompetitions() {
  loading.value = true
  loadError.value = null
  try {
    const { events, error } = await fetchCompetitions({ includePast: true })
    if (error) throw error
    const split = splitUpcomingPast(events.filter(matchesSport))
    upcoming.value = split.upcoming
    past.value = split.past
  } catch (e: unknown) {
    loadError.value = e instanceof Error ? e.message : String(e)
    upcoming.value = []
    past.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadCompetitions)
onActivated(loadCompetitions)
watch(selectedSport, loadCompetitions)
</script>

<template>
  <MemberStaffPageHeader
    :title="language === 'es' ? 'Competencias' : 'Competitions'"
    :subtitle="language === 'es' ? 'Eventos de competencia en el calendario' : 'Competition events on the school calendar'"
  >
    <template #actions>
      <NuxtLink
        to="/member/admin/scheduling/calendar?filter=competition"
        class="px-4 py-2.5 rounded-xl bg-acid text-charcoal font-semibold text-sm"
      >
        + {{ language === 'es' ? 'Añadir' : 'Add' }}
      </NuxtLink>
    </template>
  </MemberStaffPageHeader>
  <div class="px-4 py-6 max-w-lg mx-auto space-y-6 pb-8">

    <p v-if="loadError" class="text-sm text-red-400 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
      {{ loadError }}
    </p>

    <section class="space-y-3">
      <h2 class="text-sm font-bold text-gold-400 uppercase tracking-wide">
        {{ language === 'es' ? 'Próximas' : 'Upcoming' }}
      </h2>
      <MemberCompetitionEventsList
        :events="upcoming"
        :loading="loading"
        show-visibility
        :empty-message="language === 'es' ? 'No hay competencias programadas. Al crear una, elige tipo «Competencia» en el calendario.' : 'No competitions scheduled. When creating one, choose type “Competition” in the calendar.'"
      />
    </section>

    <section v-if="past.length" class="space-y-3">
      <button
        type="button"
        class="text-sm font-semibold text-gray-400 hover:text-white"
        @click="showPast = !showPast"
      >
        {{ showPast ? (language === 'es' ? 'Ocultar pasadas' : 'Hide past') : (language === 'es' ? `Ver pasadas (${past.length})` : `View past (${past.length})`) }}
      </button>
      <MemberCompetitionEventsList v-if="showPast" :events="past" show-visibility />
    </section>

    <p class="text-xs text-gray-500 leading-relaxed">
      {{
        language === 'es'
          ? 'Al añadir desde aquí, el calendario ya filtra por competencia. Confirma que el tipo sea «Competencia» antes de guardar.'
          : 'Adding from here pre-filters the calendar. Confirm the type is “Competition” before saving.'
      }}
    </p>
  </div>
</template>
