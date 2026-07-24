<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })
const { language } = useI18n()
</script>

<template>
  <div class="px-4 py-6 max-w-lg mx-auto">
    <MemberPlaceholder
      title-en="Teaching Videos"
      title-es="Videos de enseñanza"
      description-en="Trick videos are linked from the trick library. Browse skills to watch demos."
      description-es="Los videos de trucos están en la librería. Explora trucos para ver demos."
    />
    <div class="flex flex-col gap-2 mt-4">
      <NuxtLink to="/member/coach/library" class="text-center text-gold-400 text-sm font-semibold underline">
        {{ language === 'es' ? 'Ir a la librería de trucos →' : 'Go to trick library →' }}
      </NuxtLink>
      <NuxtLink to="/member/coach/knowledge-base" class="text-center text-gray-400 text-sm underline">
        {{ language === 'es' ? 'Tips y trucos →' : 'Tips & tricks →' }}
      </NuxtLink>
    </div>
  </div>
</template>