<script setup lang="ts">
definePageMeta({ layout: 'public' })

const route = useRoute()
const seasonFromQuery = computed(() => {
  const q = route.query.temporada
  return typeof q === 'string' ? q.trim() : ''
})
</script>

<template>
  <ClassesClassSessionsExplorer :season-slug="seasonFromQuery || undefined" />
</template>
