<script setup lang="ts">
withDefaults(
  defineProps<{
    src: string
    /** Describe what is in the photo; pass '' only for purely decorative images. */
    alt: string
    /** Nuxt Image syntax: every value needs a breakpoint prefix, e.g. 'xs:100vw md:50vw'. */
    sizes?: string
    /** Above-the-fold images load eagerly with high fetch priority. */
    priority?: boolean
  }>(),
  {
    sizes: 'xs:100vw md:50vw',
    priority: false,
  },
)
</script>

<template>
  <NuxtImg
    :src="src"
    :alt="alt"
    :sizes="sizes"
    format="webp"
    quality="72"
    :loading="priority ? 'eager' : 'lazy'"
    :fetchpriority="priority ? 'high' : 'auto'"
    decoding="async"
  />
</template>
