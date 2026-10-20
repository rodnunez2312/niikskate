<script setup lang="ts">
import type { SkaterCareer } from '~/utils/skaterCareer'

const props = defineProps<{
  name: string
  career: SkaterCareer
  es: boolean
  clickable?: boolean
}>()

defineEmits<{ open: [] }>()

const SEGMENTS = 16
const filledSegments = computed(() => Math.round((props.career.levelPct / 100) * SEGMENTS))

const shownXp = ref(props.career.xp)
const xpDelta = ref<{ id: number; value: number } | null>(null)
let deltaTimer: ReturnType<typeof setTimeout> | null = null
let raf = 0

watch(
  () => props.career.xp,
  (next, prev) => {
    cancelAnimationFrame(raf)
    const from = shownXp.value
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 700)
      shownXp.value = Math.round(from + (next - from) * (1 - (1 - t) ** 3))
      if (t < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    if (prev != null && next > prev) {
      xpDelta.value = { id: Date.now(), value: next - prev }
      if (deltaTimer) clearTimeout(deltaTimer)
      deltaTimer = setTimeout(() => (xpDelta.value = null), 1600)
    }
  },
)

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  if (deltaTimer) clearTimeout(deltaTimer)
})
</script>

<template>
  <div class="flex items-stretch gap-3">
    <div
      class="flex-1 min-w-0 rounded-2xl border border-gray-800 bg-charcoal px-5 py-4"
      :class="clickable ? 'cursor-pointer hover:border-gray-600 transition-colors' : ''"
      :role="clickable ? 'button' : undefined"
      :tabindex="clickable ? 0 : undefined"
      @click="clickable && $emit('open')"
      @keydown.enter.prevent="clickable && $emit('open')"
    >
      <div class="flex items-start justify-between gap-2">
        <p class="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight truncate min-w-0 leading-none">
          {{ name }}
        </p>
        <slot name="badge" />
      </div>
      <p class="mt-1.5 text-xs font-bold tracking-[0.18em]" :style="{ color: career.rank.color }">
        {{ career.title }}
      </p>

      <div class="mt-3 flex items-center gap-3">
        <div class="flex gap-[3px] flex-1 max-w-md" aria-hidden="true">
          <span
            v-for="i in SEGMENTS"
            :key="i"
            class="h-2.5 flex-1 rounded-[2px] transition-colors duration-300"
            :class="i <= filledSegments ? 'bg-[#C9EF42]' : 'bg-gray-800'"
            :style="{ transitionDelay: `${i * 35}ms` }"
          />
        </div>
        <span class="relative text-xs font-bold text-white tabular-nums shrink-0">
          {{ shownXp }}<span v-if="career.nextLevelXp" class="text-gray-500"> / {{ career.nextLevelXp }}</span> XP
          <span
            v-if="xpDelta"
            :key="xpDelta.id"
            class="xp-float absolute right-0 -top-4 text-[11px] font-black text-[#C9EF42] whitespace-nowrap"
          >+{{ xpDelta.value }} XP</span>
        </span>
      </div>
      <p class="mt-1.5 text-[11px] text-gray-400">
        <template v-if="career.nextLevelXp">
          {{ es ? 'Próximo nivel:' : 'Next level:' }}
          <span class="font-bold text-[#C9EF42]">{{ career.xpToNext }} XP</span>
          <template v-if="career.nextGoal">
            {{ es ? 'para desbloquear' : 'to unlock' }}
            <span class="font-semibold text-white">{{ career.nextGoal.name }}</span>
          </template>
        </template>
        <template v-else>{{ es ? 'Nivel máximo alcanzado' : 'Max level reached' }}</template>
      </p>

      <slot />
    </div>

    <slot name="rank" />
  </div>
</template>

<style scoped>
.xp-float {
  animation: xp-float 1.6s ease-out both;
}
@keyframes xp-float {
  0% { opacity: 0; transform: translateY(6px) scale(0.8); }
  20% { opacity: 1; transform: translateY(0) scale(1.1); }
  70% { opacity: 1; transform: translateY(-4px) scale(1); }
  100% { opacity: 0; transform: translateY(-10px); }
}
@media (prefers-reduced-motion: reduce) {
  .xp-float { animation: none; }
}
</style>
