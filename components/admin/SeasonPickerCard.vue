<script setup lang="ts">
/** One row of the season picker, used by both the active list and the archive. */
import type { ProgramSeason } from '~/utils/programSeasons'

const props = defineProps<{
  season: ProgramSeason
  selected: boolean
  past: boolean
  color: { solid: string; fillMuted: string }
  status: { kind: 'enroll' | 'soon' | 'done'; label: string }
  removing?: boolean
}>()

defineEmits<{ toggle: []; remove: [] }>()

const { language } = useI18n()
const es = computed(() => language.value === 'es')

const name = computed(() => (es.value ? props.season.name.es : props.season.name.en))
const dates = computed(() => (es.value ? props.season.dates.es : props.season.dates.en))
</script>

<template>
  <div
    class="relative border-b border-gray-800 last:border-b-0"
    :class="past ? 'opacity-45' : ''"
    :style="selected
      ? { backgroundColor: color.fillMuted, boxShadow: `inset 0 0 0 1px ${color.solid}` }
      : {}"
  >
    <button
      type="button"
      class="w-full text-left px-3 py-3 pr-10 transition-colors"
      :class="selected ? '' : 'hover:bg-gray-900'"
      @click="$emit('toggle')"
    >
      <p
        class="text-sm font-bold leading-snug flex items-center gap-2"
        :class="past ? 'text-gray-500' : 'text-white'"
      >
        <span
          class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          :style="{ backgroundColor: color.solid }"
          aria-hidden="true"
        />
        <span class="mr-0.5" aria-hidden="true">{{ season.icon }}</span>
        {{ name }}
      </p>
      <p class="text-[11px] text-gray-500 mt-0.5">{{ dates }}</p>
      <p class="mt-1.5 flex items-center justify-between gap-2">
        <span class="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Mérida</span>
        <span
          v-if="status.kind === 'enroll'"
          class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-teal-700 text-white text-[10px] font-bold"
        >
          {{ status.label }}
        </span>
        <span
          v-else
          class="text-[11px] font-semibold"
          :class="status.kind === 'done' ? 'text-gray-500' : 'text-gray-400'"
        >
          {{ status.label }}
        </span>
      </p>
    </button>
    <button
      type="button"
      class="absolute top-2 right-2 p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/50 disabled:opacity-40"
      :disabled="removing"
      :title="es ? 'Quitar temporada' : 'Remove season'"
      :aria-label="es ? 'Quitar temporada' : 'Remove season'"
      @click.stop="$emit('remove')"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  </div>
</template>
