<script setup lang="ts">
const { language, currency, toggleLocale } = useI18n()
</script>

<template>
  <button
    type="button"
    class="flex items-center gap-2 h-9 px-3.5 rounded-full border border-cream/30 bg-charcoal text-cream text-sm font-semibold transition-colors hover:border-acid hover:bg-charcoal-700"
    :aria-label="language === 'es' ? 'Cambiar a inglés / USD' : 'Switch to Spanish / MXN'"
    @click="toggleLocale"
  >
    <span class="text-base leading-none" aria-hidden="true">{{ language === 'es' ? '🇲🇽' : '🇺🇸' }}</span>

    <span class="flex items-center gap-1.5">
      <span>{{ language === 'es' ? 'ES' : 'EN' }}</span>
      <span class="text-cream/30" aria-hidden="true">|</span>
      <span class="text-acid">{{ currency }} $</span>
    </span>

    <svg class="w-3.5 h-3.5 text-cream/50" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
    </svg>
  </button>
</template>
