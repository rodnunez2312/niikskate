<script setup lang="ts">
import type { SkaterCareer } from '~/utils/skaterCareer'

defineProps<{
  mission: SkaterCareer['mission']
  es: boolean
}>()
</script>

<template>
  <div class="rounded-2xl border border-gray-800 bg-charcoal px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-3">
    <div class="min-w-0">
      <p class="text-[10px] font-bold tracking-[0.18em] text-[#C9EF42]">
        {{ es ? 'MISIÓN DE ESTA SEMANA' : "THIS WEEK'S MISSION" }}
      </p>
      <ul class="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
        <li v-for="task in mission.tasks" :key="task.id" class="flex items-center gap-2 text-xs">
          <span
            class="w-4 h-4 rounded flex items-center justify-center shrink-0 border"
            :class="task.done ? 'bg-[#C9EF42] border-[#C9EF42] text-charcoal' : 'border-gray-600'"
            aria-hidden="true"
          >
            <svg v-if="task.done" class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <span :class="task.done ? 'text-gray-500 line-through' : 'text-white'">{{ task.label }}</span>
        </li>
      </ul>
    </div>
    <div class="ml-auto text-right shrink-0">
      <p class="text-[9px] font-bold tracking-[0.18em] text-gray-500">{{ es ? 'RECOMPENSA' : 'REWARD' }}</p>
      <p
        class="mt-0.5 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-black"
        :class="mission.complete ? 'bg-[#C9EF42] text-charcoal' : 'bg-gray-800 text-[#C9EF42]'"
      >
        +{{ mission.reward }} XP
        <span v-if="mission.complete" aria-hidden="true">✓</span>
      </p>
    </div>
  </div>
</template>
