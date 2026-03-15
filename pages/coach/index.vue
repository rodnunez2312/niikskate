<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
})

// Coach home removed: Inicio now goes to dashboard. Redirect /coach to dashboard.
await navigateTo('/dashboard', { replace: true })
</script>

<template>
  <div class="min-h-screen bg-black flex items-center justify-center">
    <p class="text-gray-400">{{ $i18n?.locale === 'es' ? 'Redirigiendo...' : 'Redirecting...' }}</p>
  </div>
</template>
