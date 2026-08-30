<script setup lang="ts">
/**
 * Auto-scrolling brand strip on the skateshop landing view.
 *
 * The track is only duplicated once the logos actually overflow, so a short
 * catalogue does not render every brand twice. Motion is driven by rAF rather
 * than a CSS marquee because the arrows and native touch scrolling have to
 * share the same scroll position.
 */

type BrandItem = { name: string; count: number; image: string | null }

const props = withDefaults(
  defineProps<{
    brands: BrandItem[]
    selected?: string | null
    /** Drift speed in px per second. */
    speed?: number
  }>(),
  { selected: null, speed: 30 },
)

const emit = defineEmits<{ select: [name: string]; clear: [] }>()

const { language } = useI18n()
const es = computed(() => language.value === 'es')

const scroller = ref<HTMLElement | null>(null)
const duplicated = ref(false)
const hovered = ref(false)

let frame = 0
let lastTs = 0
/** Sub-pixel remainder, so a browser that rounds scrollLeft still advances. */
let carry = 0
let holdUntil = 0
let observer: ResizeObserver | null = null

const items = computed(() =>
  duplicated.value ? [...props.brands, ...props.brands] : props.brands,
)

function measure() {
  const el = scroller.value
  if (!el) return
  const singleWidth = duplicated.value ? el.scrollWidth / 2 : el.scrollWidth
  duplicated.value = singleWidth > el.clientWidth + 8
}

function canAutoScroll() {
  return duplicated.value && !hovered.value && Date.now() >= holdUntil
}

function tick(ts: number) {
  frame = requestAnimationFrame(tick)
  const el = scroller.value
  if (!el) {
    lastTs = ts
    return
  }
  // Cap the delta so a backgrounded tab does not jump on return.
  const dt = lastTs ? Math.min(ts - lastTs, 100) : 0
  lastTs = ts
  if (!dt || !canAutoScroll()) return

  carry += (props.speed * dt) / 1000
  const step = Math.floor(carry)
  if (step < 1) return
  carry -= step

  const half = el.scrollWidth / 2
  const next = el.scrollLeft + step
  el.scrollLeft = next >= half ? next - half : next
}

function nudge(direction: 1 | -1) {
  const el = scroller.value
  if (!el) return
  holdUntil = Date.now() + 1200
  const amount = Math.max(180, el.clientWidth * 0.8)

  // Jump a full set ahead before scrolling past either edge so the smooth
  // animation never runs into the end of the track.
  if (duplicated.value) {
    const half = el.scrollWidth / 2
    if (direction < 0 && el.scrollLeft < amount) el.scrollLeft += half
    else if (direction > 0 && el.scrollLeft > half) el.scrollLeft -= half
  }

  el.scrollBy({ left: direction * amount, behavior: 'smooth' })
}

function holdOnTouch() {
  holdUntil = Date.now() + 3000
}

onMounted(async () => {
  await nextTick()
  measure()

  if (typeof ResizeObserver !== 'undefined' && scroller.value) {
    observer = new ResizeObserver(() => measure())
    observer.observe(scroller.value)
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduced) frame = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame)
  observer?.disconnect()
})

watch(
  () => props.brands.length,
  async () => {
    await nextTick()
    measure()
  },
)
</script>

<template>
  <section v-if="brands.length" class="space-y-2">
    <div class="flex items-center justify-between gap-3">
      <p class="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500">
        {{ es ? 'Nuestras marcas' : 'Our brands' }}
      </p>
      <button
        v-if="selected"
        type="button"
        class="text-[11px] font-bold uppercase tracking-wide text-gold-400 hover:text-gold-300"
        @click="emit('clear')"
      >
        {{ es ? 'Ver todas' : 'Show all' }}
      </button>
    </div>

    <div
      class="relative"
      @mouseenter="hovered = true"
      @mouseleave="hovered = false"
      @focusin="hovered = true"
      @focusout="hovered = false"
    >
      <div
        ref="scroller"
        class="brand-track flex gap-3 overflow-x-auto py-1"
        :class="duplicated ? 'px-9' : 'px-0'"
        @touchstart.passive="holdOnTouch"
      >
        <button
          v-for="(brand, index) in items"
          :key="`${brand.name}-${index}`"
          type="button"
          class="group shrink-0 w-[5.5rem] sm:w-24 rounded-xl border bg-[#111] p-2.5 transition-colors"
          :class="
            brand.name === selected
              ? 'border-gold-500'
              : 'border-white/10 hover:border-white/30'
          "
          :aria-pressed="brand.name === selected"
          @click="emit('select', brand.name)"
        >
          <div class="aspect-square rounded-lg bg-gray-900 flex items-center justify-center p-2 overflow-hidden">
            <img
              v-if="brand.image"
              :src="brand.image"
              :alt="brand.name"
              loading="lazy"
              class="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-105"
            />
            <img
              v-else
              src="/niikskate-logo.png"
              alt=""
              class="w-8 h-8 object-contain opacity-50"
            />
          </div>
          <p
            class="mt-2 text-[10px] font-black uppercase tracking-wide text-center leading-tight truncate"
            :class="brand.name === selected ? 'text-gold-400' : 'text-white'"
          >
            {{ brand.name }}
          </p>
        </button>
      </div>

      <template v-if="duplicated">
        <div class="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-black to-transparent" />
        <div class="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-black to-transparent" />

        <button
          type="button"
          class="absolute left-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-white/20 bg-black/80 text-white flex items-center justify-center hover:border-gold-400 hover:text-gold-400 transition-colors"
          :aria-label="es ? 'Marcas anteriores' : 'Previous brands'"
          @click="nudge(-1)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button
          type="button"
          class="absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full border border-white/20 bg-black/80 text-white flex items-center justify-center hover:border-gold-400 hover:text-gold-400 transition-colors"
          :aria-label="es ? 'Más marcas' : 'More brands'"
          @click="nudge(1)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </template>
    </div>
  </section>
</template>

<style scoped>
/* Native scrolling stays available; the bar itself would break the marquee look. */
.brand-track {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.brand-track::-webkit-scrollbar {
  display: none;
}
</style>
