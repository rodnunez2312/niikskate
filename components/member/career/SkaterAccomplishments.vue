<script setup lang="ts">
import type { SkaterCareer } from '~/utils/skaterCareer'

const props = defineProps<{
  career: SkaterCareer
  es: boolean
}>()

const headline = computed(() => {
  const n = props.career.tricksCompleted
  if (n === 0) return props.es ? 'TU CARRERA EMPIEZA AQUÍ' : 'YOUR CAREER STARTS HERE'
  if (n === 1) return props.es ? 'PRIMER TRUCO CONSEGUIDO 🎉' : 'FIRST TRICK LANDED 🎉'
  return props.es ? 'ÚLTIMO TRUCO CONSEGUIDO 🎉' : 'LATEST TRICK LANDED 🎉'
})

const feed = computed(() => props.career.events.slice(0, 5))
</script>

<template>
  <div>
    <p class="text-[10px] font-bold tracking-[0.18em] text-[#C9EF42]">{{ headline }}</p>
    <p v-if="career.latestTrick" class="mt-1 text-xl font-black text-white leading-tight truncate">
      {{ career.latestTrick.name }}
    </p>
    <p v-if="career.nextGoal" class="mt-1 text-xs text-gray-400">
      {{ es ? 'Próximo objetivo:' : 'Next goal:' }}
      <span class="font-semibold text-white">{{ career.nextGoal.name }}</span>
    </p>

    <ul v-if="feed.length" class="mt-3 space-y-1">
      <li v-for="(ev, i) in feed" :key="`${ev.kind}-${ev.date}-${i}`" class="flex items-baseline gap-2 text-xs min-w-0">
        <span class="font-black text-[#C9EF42] tabular-nums shrink-0 w-12">+{{ ev.xp }} XP</span>
        <span class="text-gray-300 truncate">{{ ev.label }}</span>
      </li>
    </ul>
  </div>
</template>
