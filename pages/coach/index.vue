<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
})

const { language } = useI18n()

// Coach home removed: Inicio now goes to dashboard. Redirect /coach to dashboard.
await navigateTo('/dashboard', { replace: true })
</script>

<template>
  <div class="min-h-screen bg-black flex items-center justify-center">
    <p class="text-gray-400">{{ language === 'es' ? 'Redirigiendo...' : 'Redirecting...' }}</p>
  </div>
</template>
