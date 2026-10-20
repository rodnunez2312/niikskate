<script setup lang="ts">
import type { CareerStat } from '~/utils/skaterCareer'

defineProps<{
  stats: CareerStat[]
  es: boolean
}>()
</script>

<template>
  <ul class="space-y-2">
    <li v-for="stat in stats" :key="stat.key">
      <div class="flex items-center gap-2">
        <span class="w-16 shrink-0 text-[11px] font-black tracking-wider text-white uppercase">{{ stat.label }}</span>
        <div class="flex gap-[3px] flex-1" aria-hidden="true">
          <span
            v-for="i in 10"
            :key="i"
            class="h-2.5 flex-1 rounded-[2px]"
            :class="i <= Math.round(stat.value / 10) ? 'bg-[#C9EF42]' : 'bg-gray-800'"
          />
        </div>
        <span class="w-7 shrink-0 text-right text-xs font-bold text-white tabular-nums">{{ stat.value }}</span>
      </div>
      <p v-if="stat.unlocked || stat.next" class="mt-0.5 pl-[4.5rem] text-[10px] text-gray-500 truncate">
        <span v-if="stat.unlocked">✅ {{ stat.unlocked.name }}</span>
        <span v-if="stat.unlocked && stat.next"> · </span>
        <span v-if="stat.next">🔒 {{ stat.next.name }}</span>
      </p>
    </li>
  </ul>
</template>
