<script setup lang="ts">
import type { CareerCelebration } from '~/composables/useSkaterCareer'

const props = defineProps<{ items: CareerCelebration[] }>()
const emit = defineEmits<{ dismiss: [id: number] }>()

const DURATION_MS = 3600
const timers = new Map<number, ReturnType<typeof setTimeout>>()

watch(
  () => props.items.map(i => i.id),
  ids => {
    ids.forEach((id, index) => {
      if (timers.has(id)) return
      timers.set(id, setTimeout(() => {
        timers.delete(id)
        emit('dismiss', id)
      }, DURATION_MS + index * 600))
    })
  },
  { immediate: true },
)

onBeforeUnmount(() => timers.forEach(t => clearTimeout(t)))

const ACCENT: Record<CareerCelebration['kind'], string> = {
  trick: '#C9EF42',
  phase: '#FACC15',
  level: '#A855F7',
}

const accentFor = (item: CareerCelebration) => item.rarity?.color || ACCENT[item.kind]

const { language } = useI18n()

const SPARKS = [0, 60, 120, 180, 240, 300]
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none w-[min(92vw,360px)]">
      <TransitionGroup name="career-toast">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="career-toast pointer-events-auto relative w-full rounded-2xl bg-charcoal px-5 py-3 text-center"
          :style="{ border: `2px solid ${accentFor(item)}`, boxShadow: `0 0 28px ${accentFor(item)}55` }"
          @click="emit('dismiss', item.id)"
        >
          <span
            v-for="deg in SPARKS"
            :key="deg"
            class="career-spark absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full"
            :style="{ background: accentFor(item), '--deg': `${deg}deg` }"
            aria-hidden="true"
          />
          <p class="text-[10px] font-black tracking-[0.2em]" :style="{ color: accentFor(item) }">{{ item.title }}</p>
          <p class="mt-0.5 text-xl font-black text-white uppercase leading-tight truncate">{{ item.subject }}</p>
          <p
            v-if="item.rarity"
            class="text-[10px] font-black tracking-[0.25em] uppercase"
            :style="{ color: item.rarity.color }"
          >
            ◆ {{ language === 'es' ? item.rarity.labelEs : item.rarity.labelEn }}
          </p>
          <p
            v-if="item.xp"
            class="career-xp mt-1 inline-block rounded-full px-3 py-0.5 text-sm font-black text-charcoal"
            :style="{ background: accentFor(item) }"
          >
            +{{ item.xp }} XP
          </p>
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.career-toast-enter-active {
  animation: career-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.career-toast-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.career-toast-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.96);
}
.career-xp {
  animation: career-xp-pop 0.5s 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.career-spark {
  opacity: 0;
  animation: career-spark 0.7s 0.1s ease-out both;
}
@keyframes career-pop {
  0% { opacity: 0; transform: translateY(-16px) scale(0.85); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes career-xp-pop {
  0% { opacity: 0; transform: scale(0.4); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes career-spark {
  0% { opacity: 1; transform: translate(-50%, -50%) rotate(var(--deg)) translateX(0); }
  100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--deg)) translateX(120px); }
}
@media (prefers-reduced-motion: reduce) {
  .career-toast-enter-active,
  .career-xp,
  .career-spark {
    animation: none;
  }
}
</style>
