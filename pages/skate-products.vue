<script setup lang="ts">
definePageMeta({ layout: 'public' })
await navigateTo('/skateshop', { replace: true })
</script>

<template>
  <div class="flex justify-center py-20 bg-black">
    <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
  </div>
</template>
