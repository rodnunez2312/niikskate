<script setup lang="ts">
import type { TrainingDiscipline } from '~/utils/trainingDisciplines'

const { catalog, selected, select } = useEnabledSports()
const { language } = useI18n()
const es = computed(() => language.value === 'es')
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const current = computed(() => catalog.find(sport => sport.id === selected.value) ?? catalog[0])

function pick(id: TrainingDiscipline) {
  select(id)
  open.value = false
}

function onDocPointer(event: Event) {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', onDocPointer))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocPointer))
</script>

<template>
  <div ref="root" class="relative" @keydown.escape="open = false">
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-lg border border-charcoal-600 bg-charcoal-800 px-2.5 py-1.5 text-left transition-colors hover:border-acid"
      :class="open ? 'border-acid' : ''"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="es ? 'Deporte' : 'Sport'"
      @click="open = !open"
    >
      <MemberSportIcon :sport="current.id" class="h-5 w-5 shrink-0 text-acid" />
      <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-cream">{{ es ? current.es : current.en }}</span>
      <svg class="h-3.5 w-3.5 shrink-0 text-cream/50 transition-transform" :class="open ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 9l6 6 6-6" />
      </svg>
    </button>
    <ul
      v-if="open"
      class="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-lg border border-charcoal-600 bg-charcoal-800 py-1 shadow-xl"
      role="listbox"
    >
      <li v-for="sport in catalog" :key="sport.id">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-charcoal-700"
          :class="sport.id === selected ? 'text-acid font-semibold' : 'text-cream/75 hover:text-cream'"
          role="option"
          :aria-selected="sport.id === selected"
          @click="pick(sport.id)"
        >
          <MemberSportIcon :sport="sport.id" class="h-4 w-4 shrink-0" />
          <span class="flex-1">{{ es ? sport.es : sport.en }}</span>
          <span v-if="sport.id === selected" aria-hidden="true">✓</span>
        </button>
      </li>
    </ul>
  </div>
</template>
