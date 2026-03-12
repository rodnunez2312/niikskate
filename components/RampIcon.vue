<script setup lang="ts">
defineProps<{
  type: 'fundamentals' | 'flatground' | 'street' | 'bowl' | 'vert' | 'surf_skate' | 'safety' | 'all'
  size?: number
}>()
</script>

<template>
  <div 
    class="rounded-full overflow-hidden bg-[#e8dcc8] flex items-center justify-center flex-shrink-0"
    :style="{
      width: `${size || 56}px`,
      height: `${size || 56}px`,
    }"
  >
    <!-- Street -->
    <svg v-if="type === 'street'" class="w-[82%] h-[82%] text-gray-900" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="36" width="10" height="6" fill="currentColor" opacity="0.8"/>
      <rect x="12" y="30" width="10" height="6" fill="currentColor" opacity="0.8"/>
      <rect x="16" y="24" width="10" height="6" fill="currentColor" opacity="0.8"/>
      <rect x="20" y="18" width="10" height="6" fill="currentColor" opacity="0.8"/>
      <line x1="6" y1="38" x2="38" y2="14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <line x1="12" y1="42" x2="12" y2="34" stroke="currentColor" stroke-width="2"/>
      <line x1="32" y1="22" x2="32" y2="14" stroke="currentColor" stroke-width="2"/>
    </svg>

    <!-- Bowl -->
    <svg v-else-if="type === 'bowl'" class="w-[82%] h-[82%] text-gray-900" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 14 C6 14 6 38 24 38 C42 38 42 14 42 14" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
      <line x1="4" y1="14" x2="44" y2="14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <path d="M10 18 C10 18 10 34 24 34 C38 34 38 18 38 18" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.6"/>
      <circle cx="24" cy="32" r="2" fill="currentColor" opacity="0.6"/>
    </svg>

    <!-- Vert -->
    <svg v-else-if="type === 'vert'" class="w-[82%] h-[82%] text-gray-900" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 42 L8 20 Q8 8 20 8 L42 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
      <line x1="18" y1="6" x2="44" y2="6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
      <line x1="8" y1="8" x2="8" y2="20" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2" opacity="0.5"/>
      <rect x="38" y="4" width="6" height="8" fill="currentColor" opacity="0.3"/>
    </svg>

    <!-- Flatground -->
    <svg v-else-if="type === 'flatground'" class="w-[82%] h-[82%] text-gray-900" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="4" y1="38" x2="44" y2="38" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <rect x="14" y="24" width="20" height="4" rx="2" fill="currentColor" transform="rotate(-15 24 26)"/>
      <circle cx="17" cy="32" r="3" fill="currentColor" opacity="0.8"/>
      <circle cx="31" cy="29" r="3" fill="currentColor" opacity="0.8"/>
      <line x1="10" y1="20" x2="14" y2="22" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
      <line x1="8" y1="24" x2="12" y2="25" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
    </svg>

    <!-- Fundamentals / all fallback -->
    <svg v-else class="w-[82%] h-[82%] text-gray-900" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="20" width="32" height="6" rx="3" fill="currentColor"/>
      <rect x="12" y="26" width="8" height="3" fill="currentColor" opacity="0.7"/>
      <rect x="28" y="26" width="8" height="3" fill="currentColor" opacity="0.7"/>
      <circle cx="14" cy="32" r="4" fill="currentColor" opacity="0.8"/>
      <circle cx="34" cy="32" r="4" fill="currentColor" opacity="0.8"/>
      <path d="M24 12 L24 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <path d="M20 14 L24 10 L28 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  </div>
</template>
