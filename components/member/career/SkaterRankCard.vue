<script setup lang="ts">
import type { CareerRank } from '~/utils/skaterCareer'

const props = defineProps<{
  level: number
  rank: CareerRank
  avatarUrl?: string | null
  initial: string
  es: boolean
  editable?: boolean
  uploading?: boolean
}>()

defineEmits<{ pick: []; remove: [] }>()

const levelingUp = ref(false)
let pulseTimer: ReturnType<typeof setTimeout> | null = null

watch(
  () => props.level,
  (next, prev) => {
    if (prev == null || next <= prev) return
    levelingUp.value = false
    requestAnimationFrame(() => (levelingUp.value = true))
    if (pulseTimer) clearTimeout(pulseTimer)
    pulseTimer = setTimeout(() => (levelingUp.value = false), 1400)
  },
)

onBeforeUnmount(() => {
  if (pulseTimer) clearTimeout(pulseTimer)
})
</script>

<template>
  <div class="shrink-0 w-[112px] sm:w-[128px] rounded-2xl border border-gray-800 bg-charcoal px-3 py-3 flex flex-col items-center">
    <p class="text-[9px] font-bold tracking-[0.2em] text-gray-500">RANK CARD</p>
    <button
      type="button"
      class="relative mt-2 w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-gray-900 flex items-center justify-center disabled:opacity-80"
      :class="[editable ? 'cursor-pointer' : 'cursor-default', levelingUp ? 'rank-pulse' : '']"
      :style="{ border: `3px solid ${rank.color}`, boxShadow: `0 0 16px ${rank.glow}` }"
      :disabled="uploading || !editable"
      :aria-label="es ? 'Foto del patinador' : 'Skater photo'"
      @click="editable && $emit('pick')"
    >
      <img v-if="avatarUrl" :src="avatarUrl" alt="" class="w-full h-full object-cover" />
      <span v-else class="font-black text-3xl" :style="{ color: rank.color }">{{ initial }}</span>
      <div v-if="uploading" class="absolute inset-0 bg-black/55 flex items-center justify-center">
        <span class="w-6 h-6 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
      </div>
    </button>
    <p class="mt-2 text-sm font-black text-white leading-none">LEVEL {{ level }}</p>
    <p class="mt-1 text-[11px] font-bold uppercase tracking-[0.15em]" :style="{ color: rank.color }">
      {{ rank.label }}
    </p>
    <button
      v-if="editable && avatarUrl"
      type="button"
      class="mt-1.5 text-[10px] text-gray-500 hover:text-gray-300"
      :disabled="uploading"
      @click="$emit('remove')"
    >
      {{ es ? 'Quitar foto' : 'Remove photo' }}
    </button>
  </div>
</template>

<style scoped>
.rank-pulse {
  animation: rank-pulse 1.4s ease-out;
}
@keyframes rank-pulse {
  0% { transform: scale(1); }
  20% { transform: scale(1.12); filter: brightness(1.4); }
  45% { transform: scale(0.97); }
  70% { transform: scale(1.04); }
  100% { transform: scale(1); filter: none; }
}
@media (prefers-reduced-motion: reduce) {
  .rank-pulse { animation: none; }
}
</style>
