<script setup lang="ts">
definePageMeta({ layout: 'public' })
const { language } = useI18n()
</script>

<template>
  <div class="min-h-screen bg-black pb-12">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 class="text-3xl font-black text-white mb-2">
        {{ language === 'es' ? 'Comunidad' : 'Community' }}
      </h1>
      <p class="text-gray-400 mb-8">
        {{
          language === 'es'
            ? 'Noticias, eventos y lo que compartimos en redes.'
            : 'News, events, and what we share on social.'
        }}
      </p>
    </div>
    <HomeNewsSection variant="page" />
  </div>
</template>
