<script setup lang="ts">
import type { SocialStorySlide } from '~/types'
import { onKeyStroke, useSwipe } from '@vueuse/core'

const props = defineProps<{
  slides: SocialStorySlide[]
  language: string
}>()

const viewerOpen = ref(false)
const viewerIndex = ref(0)
const overlayRef = ref<HTMLElement | null>(null)

const { direction } = useSwipe(overlayRef, { threshold: 48 })

watch(direction, (d) => {
  if (!viewerOpen.value || !d) return
  if (d === 'left') goNext()
  if (d === 'right') goPrev()
})

const current = computed(() => props.slides[viewerIndex.value])

function openViewer(i: number) {
  viewerIndex.value = i
  viewerOpen.value = true
}

function closeViewer() {
  viewerOpen.value = false
}

function goNext() {
  if (viewerIndex.value < props.slides.length - 1) viewerIndex.value++
  else closeViewer()
}

function goPrev() {
  if (viewerIndex.value > 0) viewerIndex.value--
}

function ringThumb(s: SocialStorySlide) {
  if (s.mediaType === 'video' && s.thumbnailUrl) return s.thumbnailUrl
  if (s.thumbnailUrl) return s.thumbnailUrl
  return s.mediaUrl
}

function ringGradientClass(source: SocialStorySlide['source']) {
  if (source === 'instagram') {
    return 'bg-gradient-to-tr from-fuchsia-500 via-pink-500 to-amber-400 p-[2.5px]'
  }
  if (source === 'facebook') {
    return 'bg-gradient-to-tr from-blue-600 to-sky-400 p-[2.5px]'
  }
  return 'bg-gradient-to-tr from-gold-400 via-amber-500 to-orange-600 p-[2.5px]'
}

function stripLabel(s: SocialStorySlide) {
  if (s.source !== 'news') {
    return s.title
  }
  const t = s.title
  return t.length > 14 ? `${t.slice(0, 12)}…` : t
}

onKeyStroke('Escape', () => {
  if (viewerOpen.value) closeViewer()
})

onKeyStroke('ArrowLeft', (e) => {
  if (!viewerOpen.value) return
  e.preventDefault()
  goPrev()
})

onKeyStroke('ArrowRight', (e) => {
  if (!viewerOpen.value) return
  e.preventDefault()
  goNext()
})
</script>

<template>
  <div v-if="slides.length > 0" class="mb-6">
    <h3 class="text-white font-bold mb-1 flex items-center gap-2">
      <span>⭕</span>
      {{ language === 'es' ? 'Última actividad' : 'Latest activity' }}
    </h3>
    <p class="text-xs text-gray-500 mb-3">
      {{
        language === 'es'
          ? 'Toca un círculo para verlo a pantalla completa (noticias con foto o video).'
          : 'Tap a circle for full screen — news posts with photos or videos.'
      }}
    </p>

    <div class="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
      <button
        v-for="(s, i) in slides"
        :key="s.id"
        type="button"
        class="flex flex-col items-center shrink-0 w-[76px] snap-start focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 rounded-xl"
        @click="openViewer(i)"
      >
        <div class="rounded-full" :class="ringGradientClass(s.source)">
          <div class="w-[68px] h-[68px] rounded-full bg-black p-[2px] overflow-hidden">
            <img
              v-if="s.mediaType === 'image' || s.thumbnailUrl"
              :src="ringThumb(s)"
              :alt="stripLabel(s)"
              class="w-full h-full object-cover rounded-full"
              loading="lazy"
            />
            <div
              v-else
              class="w-full h-full rounded-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center text-2xl"
            >
              ▶️
            </div>
          </div>
        </div>
        <span class="text-[10px] text-gray-400 mt-1.5 max-w-[72px] truncate text-center leading-tight">
          {{ stripLabel(s) }}
        </span>
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="viewerOpen && current"
        class="fixed inset-0 z-[110] bg-black flex flex-col"
      >
        <div ref="overlayRef" class="flex flex-col flex-1 min-h-0 touch-pan-y">
          <!-- Progress -->
          <div class="flex gap-0.5 px-3 pt-safe shrink-0">
            <div
              v-for="(_, i) in slides"
              :key="i"
              class="h-0.5 flex-1 rounded-full bg-white/20 overflow-hidden"
            >
              <div
                class="h-full bg-gold-400 transition-all duration-200"
                :style="{ width: i <= viewerIndex ? '100%' : '0%' }"
              />
            </div>
          </div>

          <div class="flex items-center justify-between px-2 py-2 shrink-0">
            <div class="min-w-0 pl-2">
              <p class="text-white font-bold text-sm truncate">{{ current.title }}</p>
              <p class="text-xs text-gray-400 truncate">
                {{
                  current.source === 'instagram'
                    ? 'Instagram'
                    : current.source === 'facebook'
                      ? 'Facebook'
                      : language === 'es'
                        ? 'Noticias NiikSkate'
                        : 'NiikSkate news'
                }}
              </p>
            </div>
            <button
              type="button"
              class="p-2 rounded-full bg-white/10 hover:bg-white/20 shrink-0"
              :aria-label="language === 'es' ? 'Cerrar' : 'Close'"
              @click="closeViewer"
            >
              <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="relative flex-1 flex items-center justify-center min-h-0 bg-black px-1">
            <button
              type="button"
              class="absolute inset-y-0 left-0 w-[18%] z-20 cursor-w-resize opacity-0"
              :aria-label="language === 'es' ? 'Anterior' : 'Previous'"
              @click="goPrev"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 w-[18%] z-20 cursor-e-resize opacity-0"
              :aria-label="language === 'es' ? 'Siguiente' : 'Next'"
              @click="goNext"
            />

            <video
              v-if="current.mediaType === 'video'"
              :key="current.id"
              :src="current.mediaUrl"
              class="max-h-[min(72vh,calc(100vh-8rem))] w-full object-contain"
              controls
              playsinline
            />
            <img
              v-else
              :key="current.id"
              :src="current.mediaUrl"
              :alt="current.title"
              class="max-h-[min(72vh,calc(100vh-8rem))] w-full object-contain"
            />
          </div>

          <div class="shrink-0 px-4 pb-safe pt-2 space-y-2 max-h-[28vh] overflow-y-auto">
            <p v-if="current.caption" class="text-sm text-gray-300 whitespace-pre-wrap">
              {{ current.caption }}
            </p>
            <a
              v-if="current.permalink"
              :href="current.permalink"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-2 text-gold-400 text-sm font-semibold hover:underline"
            >
              {{ language === 'es' ? 'Abrir enlace' : 'Open link' }}
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
