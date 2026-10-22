<script setup lang="ts">
import type { SkaterProgramMilestone } from '~/utils/skaterProgramProgress'

defineProps<{
  milestones: SkaterProgramMilestone[]
  xp: number
  es: boolean
}>()
</script>

<template>
  <!-- On lg the card takes the row height set by its neighbour (Logros) and scrolls inside if needed. -->
  <div class="relative bg-gray-900 border border-gray-800 rounded-xl">
    <div class="lg:absolute lg:inset-0 flex flex-col p-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider">Level map</h2>
        <span class="text-sm font-black text-[#C9EF42] tabular-nums">{{ xp }} XP</span>
      </div>
      <div class="mt-2 mb-2 h-px bg-gray-800" aria-hidden="true" />

      <ol class="flex-1 min-h-0 overflow-y-auto flex flex-col justify-between list-none m-0 p-0">
        <template v-for="(m, i) in milestones" :key="m.structure">
          <li
            class="flex items-center gap-3 rounded-lg px-2.5 py-1.5"
            :class="m.phase === 'active' ? 'bg-charcoal ring-1 ring-[#C9EF42]/50' : ''"
          >
            <span class="w-5 text-center text-sm shrink-0" aria-hidden="true">
              {{ m.phase === 'complete' ? '✅' : m.phase === 'active' ? '🎯' : '🔒' }}
            </span>
            <div class="flex-1 min-w-0 flex items-baseline gap-2">
              <span
                class="text-[10px] font-black tracking-[0.15em] shrink-0"
                :class="m.phase === 'locked' ? 'text-gray-600' : 'text-white'"
              >
                {{ es ? 'NIVEL' : 'LEVEL' }} {{ m.levelNum }}
              </span>
              <span
                class="text-xs truncate"
                :class="m.phase === 'locked' ? 'text-gray-600' : 'text-gray-300'"
              >
                {{ es ? m.shortLabelEs : m.shortLabelEn }}
              </span>
            </div>
            <span
              v-if="m.phase === 'active' && m.total"
              class="text-[10px] text-gray-500 tabular-nums shrink-0"
            >
              {{ m.learned }}/{{ m.total }}
            </span>
            <span
              class="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black tracking-wider"
              :class="
                m.phase === 'complete'
                  ? 'bg-[#22C55E]/15 text-[#22C55E]'
                  : m.phase === 'active'
                    ? 'bg-[#C9EF42] text-charcoal'
                    : 'bg-gray-800 text-gray-500'
              "
            >
              <span v-if="m.phase === 'complete'" class="w-1.5 h-1.5 rounded-full bg-[#22C55E]" aria-hidden="true" />
              {{
                m.phase === 'complete'
                  ? (es ? 'COMPLETADO' : 'COMPLETE')
                  : m.phase === 'active'
                    ? (es ? 'ACTIVO' : 'ACTIVE')
                    : (es ? 'BLOQUEADO' : 'LOCKED')
              }}
            </span>
          </li>
          <li
            v-if="i < milestones.length - 1"
            class="pl-[1.15rem] text-[10px] leading-none"
            :class="m.phase === 'complete' ? 'text-[#22C55E]' : 'text-gray-700'"
            aria-hidden="true"
          >
            ↓
          </li>
        </template>
      </ol>
    </div>
  </div>
</template>
