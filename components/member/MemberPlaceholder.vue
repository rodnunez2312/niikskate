<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    titleEn: string
    titleEs: string
    descriptionEn?: string
    descriptionEs?: string
  }>(),
  {
    descriptionEn: 'This section is coming soon as we roll out the new member platform.',
    descriptionEs: 'Esta sección llegará pronto con la nueva plataforma de miembros.',
  },
)

const { language } = useI18n()
</script>

<template>
  <div class="min-h-[50vh] flex flex-col items-center justify-center px-4 py-12 text-center">
    <p class="text-4xl mb-4">🛹</p>
    <h1 class="text-2xl font-bold text-white mb-3">
      {{ language === 'es' ? titleEs : titleEn }}
    </h1>
    <p class="text-gray-400 max-w-md mb-8">
      {{ language === 'es' ? descriptionEs : descriptionEn }}
    </p>
    <NuxtLink
      :to="'/member'"
      class="px-6 py-3 rounded-xl bg-gold-400 text-black font-bold text-sm"
    >
      {{ language === 'es' ? 'Ir a mi plataforma' : 'Go to my platform' }}
    </NuxtLink>
  </div>
</template>
