<script setup lang="ts">
// News moved to home page for all users; keep route for old links.
await navigateTo('/', { replace: true })
</script>

<template>
  <div class="min-h-screen bg-black flex items-center justify-center">
    <p class="text-gray-400 text-sm">…</p>
  </div>
</template>
