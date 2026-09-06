<script setup lang="ts">
defineProps<{
  events: import('~/composables/useCompetitionEvents').CompetitionEvent[]
  loading?: boolean
  emptyMessage?: string
  showVisibility?: boolean
}>()

const { language } = useI18n()
const { formatEventDate, formatEventTime } = useCompetitionEvents()
</script>

<template>
  <div v-if="loading" class="flex justify-center py-12">
    <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
  </div>
  <p v-else-if="!events.length" class="text-sm text-gray-500 text-center py-8">
    {{ emptyMessage || (language === 'es' ? 'No hay competencias programadas.' : 'No competitions scheduled.') }}
  </p>
  <ul v-else class="space-y-3">
    <li
      v-for="ev in events"
      :key="ev.id"
      class="rounded-xl border border-gray-800 bg-gray-900 p-4"
    >
      <div class="flex items-start gap-3">
        <span class="text-2xl shrink-0" aria-hidden="true">🏆</span>
        <div class="min-w-0 flex-1">
          <p class="font-bold text-white">{{ ev.title }}</p>
          <p class="text-sm text-orange-400 mt-1">{{ formatEventDate(ev) }}</p>
          <p v-if="formatEventTime(ev)" class="text-xs text-gray-400 mt-0.5">{{ formatEventTime(ev) }}</p>
          <p v-if="ev.location" class="text-xs text-gray-400 mt-1">📍 {{ ev.location }}</p>
          <p v-if="ev.description" class="text-sm text-gray-400 mt-2 whitespace-pre-line">{{ ev.description }}</p>
          <p
            v-if="showVisibility && !ev.visible_to_parents"
            class="text-xs text-amber-400 mt-2"
          >
            {{ language === 'es' ? 'Solo staff (oculto a familias)' : 'Staff only (hidden from families)' }}
          </p>
        </div>
      </div>
    </li>
  </ul>
</template>
