<script setup lang="ts">
const { language, currency, toggleLocale } = useI18n()
</script>

<template>
  <button
    @click="toggleLocale"
    class="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-800/80 hover:bg-gray-700 transition-all text-sm font-medium border border-gray-700 backdrop-blur-sm"
  >
    <!-- Flag -->
    <span class="text-lg">{{ language === 'es' ? '🇲🇽' : '🇺🇸' }}</span>
    
    <!-- Language & Currency -->
    <div class="flex items-center gap-1.5">
      <span class="text-white font-semibold">{{ language === 'es' ? 'ES' : 'EN' }}</span>
      <span class="text-gray-500">|</span>
      <span class="text-gold-400 font-semibold">{{ currency }}</span>
      <!-- Currency Symbol -->
      <span class="text-gold-400">{{ currency === 'MXN' ? '💲' : '$' }}</span>
    </div>
    
    <!-- Toggle indicator -->
    <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
    </svg>
  </button>
</template>
