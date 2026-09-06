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

const MONTHS = {
  es: ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'],
  en: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
}

const compactDates = computed(() => {
  const formatDate = (ymd: string) => {
    const [, month, day] = ymd.split('-').map(Number)
    const months = es.value ? MONTHS.es : MONTHS.en
    return `${months[month - 1]} ${day}`
  }
  return `${formatDate(props.season.startDate)} — ${formatDate(props.season.endDate)}`
})

const statusBadge = computed(() => {
  if (props.past) return ''
  if (props.status.kind === 'soon') return es.value ? 'PRÓXIMA' : 'UPCOMING'
  if (props.status.kind === 'enroll') return es.value ? 'ACTIVA' : 'ACTIVE'
  return ''
})
</script>

<template>
  <div
    class="group relative border-b border-gray-800 last:border-b-0"
    :class="past ? 'opacity-45' : ''"
    :style="selected
      ? { backgroundColor: color.fillMuted, boxShadow: `inset 3px 0 0 ${color.solid}` }
      : {}"
  >
    <button
      type="button"
      class="w-full text-left px-3 py-3 pr-16 transition-colors"
      :class="selected ? '' : 'hover:bg-gray-900'"
      @click="$emit('toggle')"
    >
      <div class="flex items-center gap-2 min-w-0">
        <span
          class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
          :style="{ backgroundColor: color.solid }"
          aria-hidden="true"
        />
        <p
          class="min-w-0 flex-1 text-sm font-bold leading-snug truncate"
          :class="past ? 'text-gray-500' : 'text-white'"
        >
          {{ name }}
        </p>
        <span class="text-[10px] font-bold text-gray-400 whitespace-nowrap">
          {{ compactDates }}
        </span>
      </div>
      <div class="mt-1 pl-[18px] flex items-center justify-between gap-2">
        <span class="text-[10px] text-gray-500 font-semibold">Mérida</span>
        <span
          v-if="statusBadge"
          class="inline-flex items-center rounded-full border border-gray-700 px-2 py-0.5 text-[9px] font-black tracking-wide text-gray-300"
        >
          {{ statusBadge }}
        </span>
      </div>
      <span class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xl">›</span>
    </button>
    <button
      type="button"
      class="absolute top-1 right-1 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-950/50 disabled:opacity-40 opacity-0 group-hover:opacity-100 focus:opacity-100"
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
