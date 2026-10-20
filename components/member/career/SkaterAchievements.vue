<script setup lang="ts">
import type { CareerAchievement } from '~/utils/skaterCareer'

const props = defineProps<{
  achievements: CareerAchievement[]
  es: boolean
}>()

const unlockedCount = computed(() => props.achievements.filter(a => a.unlocked).length)
</script>

<template>
  <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 h-full">
    <div class="flex items-center justify-between gap-2 mb-3">
      <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider">{{ es ? 'Logros' : 'Achievements' }}</h2>
      <span class="text-xs font-bold text-white tabular-nums">{{ unlockedCount }}/{{ achievements.length }}</span>
    </div>
    <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-1.5">
      <li
        v-for="a in achievements"
        :key="a.id"
        class="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs"
        :class="a.unlocked ? 'bg-charcoal text-white' : 'text-gray-600'"
      >
        <span aria-hidden="true" :class="a.unlocked ? '' : 'grayscale opacity-60'">{{ a.unlocked ? '🏆' : '🔒' }}</span>
        <span class="truncate font-semibold">{{ a.label }}</span>
      </li>
    </ul>
  </div>
</template>
