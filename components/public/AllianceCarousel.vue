<script setup lang="ts">
import type { AllianceRecord } from '~/utils/alliances'

defineProps<{
  alliances: AllianceRecord[]
}>()

const { language } = useI18n()
const es = computed(() => language.value === 'es')
const scroller = ref<HTMLElement | null>(null)
const canPrev = ref(false)
const canNext = ref(false)

function updateEnds() {
  const el = scroller.value
  if (!el) return
  canPrev.value = el.scrollLeft > 8
  canNext.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 8
}

function scrollByCard(direction: number) {
  const el = scroller.value
  if (!el) return
  const card = el.querySelector('article')
  const amount = (card?.getBoundingClientRect().width || el.clientWidth * 0.8) + 16
  el.scrollBy({ left: direction * amount, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    scrollByCard(1)
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    scrollByCard(-1)
  }
}

onMounted(async () => {
  await nextTick()
  updateEnds()
  window.addEventListener('resize', updateEnds)
})
onBeforeUnmount(() => window.removeEventListener('resize', updateEnds))
</script>

<template>
  <div class="relative">
    <div class="mb-4 flex items-center justify-end gap-2">
      <button
        v-if="canPrev || canNext"
        type="button"
        class="w-10 h-10 rounded-full border border-cream-200 bg-cream text-charcoal disabled:opacity-30"
        :disabled="!canPrev"
        :aria-label="es ? 'Alianza anterior' : 'Previous partnership'"
        @click="scrollByCard(-1)"
      >
        ‹
      </button>
      <button
        v-if="canPrev || canNext"
        type="button"
        class="w-10 h-10 rounded-full border border-cream-200 bg-cream text-charcoal disabled:opacity-30"
        :disabled="!canNext"
        :aria-label="es ? 'Siguiente alianza' : 'Next partnership'"
        @click="scrollByCard(1)"
      >
        ›
      </button>
    </div>
    <div
      ref="scroller"
      class="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-px-5 pb-2 [scrollbar-width:thin] overscroll-x-contain"
      tabindex="0"
      role="region"
      :aria-label="es ? 'Alianzas' : 'Partnerships'"
      @scroll="updateEnds"
      @keydown="onKeydown"
    >
      <div
        v-for="alliance in alliances"
        :key="alliance.id"
        class="snap-start shrink-0 w-[85vw] sm:w-[22rem] lg:w-[26rem]"
      >
        <PublicAllianceCard :alliance="alliance" class="h-full" />
      </div>
    </div>
  </div>
</template>
