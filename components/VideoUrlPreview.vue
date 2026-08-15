<script setup lang="ts">
import { parseVideoUrl, type ParsedVideoUrl } from '~/utils/videoEmbed'

const props = defineProps<{
  url: string
}>()

const parsed = computed<ParsedVideoUrl | null>(() => parseVideoUrl(props.url))

const INSTAGRAM_SCRIPT_ATTR = 'data-niik-instagram-embed'

function processInstagramEmbeds() {
  const w = window as Window & { instgrm?: { Embeds?: { process: () => void } } }
  w.instgrm?.Embeds?.process()
}

function ensureInstagramEmbedScript() {
  if (typeof document === 'undefined') return

  const existing = document.querySelector(`script[${INSTAGRAM_SCRIPT_ATTR}]`)
  if (existing) {
    nextTick(() => processInstagramEmbeds())
    return
  }

  const script = document.createElement('script')
  script.src = 'https://www.instagram.com/embed.js'
  script.async = true
  script.setAttribute(INSTAGRAM_SCRIPT_ATTR, '1')
  script.onload = () => processInstagramEmbeds()
  document.body.appendChild(script)
}

watch(
  () => parsed.value?.kind === 'instagram' ? parsed.value.canonicalUrl : null,
  (permalink) => {
    if (permalink) ensureInstagramEmbedScript()
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="parsed" class="space-y-2">
    <ClientOnly>
      <div
        v-if="parsed.kind === 'youtube' && parsed.embedUrl"
        class="rounded-xl overflow-hidden border border-gray-700 bg-black"
      >
        <iframe
          :src="parsed.embedUrl"
          :title="`YouTube video ${parsed.videoId || ''}`.trim()"
          class="w-full aspect-video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
          loading="lazy"
        />
      </div>

      <div
        v-else-if="parsed.kind === 'instagram'"
        class="rounded-xl overflow-hidden border border-gray-700 bg-gray-950 flex justify-center [&_.instagram-media]:!m-0 [&_.instagram-media]:!max-w-full"
      >
        <blockquote
          :key="parsed.canonicalUrl"
          class="instagram-media"
          :data-instgrm-permalink="parsed.canonicalUrl"
          data-instgrm-version="14"
          style="background:#FFF; border:0; margin:0 auto; max-width:540px; min-width:280px; width:100%;"
        />
      </div>

      <template #fallback>
        <div class="rounded-xl border border-gray-700 bg-gray-800/50 aspect-video animate-pulse" />
      </template>
    </ClientOnly>

    <a
      :href="parsed.canonicalUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-block text-sky-400 underline break-all text-sm"
    >
      {{ parsed.canonicalUrl }}
    </a>
  </div>
</template>
