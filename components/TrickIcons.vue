<script setup lang="ts">
defineProps<{
  type: 'street' | 'bowl' | 'vert' | 'flatground' | 'fundamentals' | 'surf_skate' | 'safety'
  size?: number
}>()
</script>

<template>
  <!-- Street - Rail with stairs -->
  <svg v-if="type === 'street'" :width="size || 24" :height="size || 24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Stairs -->
    <rect x="8" y="36" width="10" height="6" fill="currentColor" opacity="0.8"/>
    <rect x="12" y="30" width="10" height="6" fill="currentColor" opacity="0.8"/>
    <rect x="16" y="24" width="10" height="6" fill="currentColor" opacity="0.8"/>
    <rect x="20" y="18" width="10" height="6" fill="currentColor" opacity="0.8"/>
    <!-- Rail -->
    <line x1="6" y1="38" x2="38" y2="14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <!-- Rail supports -->
    <line x1="12" y1="42" x2="12" y2="34" stroke="currentColor" stroke-width="2"/>
    <line x1="32" y1="22" x2="32" y2="14" stroke="currentColor" stroke-width="2"/>
  </svg>

  <!-- Bowl - Pool shape -->
  <svg v-else-if="type === 'bowl'" :width="size || 24" :height="size || 24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Bowl outline -->
    <path d="M6 14 C6 14 6 38 24 38 C42 38 42 14 42 14" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
    <!-- Pool coping -->
    <line x1="4" y1="14" x2="44" y2="14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <!-- Tile line -->
    <path d="M10 18 C10 18 10 34 24 34 C38 34 38 18 38 18" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2" opacity="0.6"/>
    <!-- Pool drain -->
    <circle cx="24" cy="32" r="2" fill="currentColor" opacity="0.6"/>
  </svg>

  <!-- Vert - Quarter pipe -->
  <svg v-else-if="type === 'vert'" :width="size || 24" :height="size || 24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Quarter pipe curve -->
    <path d="M8 42 L8 20 Q8 8 20 8 L42 8" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
    <!-- Coping -->
    <line x1="18" y1="6" x2="44" y2="6" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>
    <!-- Vert section indicator -->
    <line x1="8" y1="8" x2="8" y2="20" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2" opacity="0.5"/>
    <!-- Platform -->
    <rect x="38" y="4" width="6" height="8" fill="currentColor" opacity="0.3"/>
  </svg>

  <!-- Flatground - Flat with board -->
  <svg v-else-if="type === 'flatground'" :width="size || 24" :height="size || 24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Ground line -->
    <line x1="4" y1="38" x2="44" y2="38" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <!-- Skateboard deck (angled for ollie) -->
    <rect x="14" y="24" width="20" height="4" rx="2" fill="currentColor" transform="rotate(-15 24 26)"/>
    <!-- Wheels -->
    <circle cx="17" cy="32" r="3" fill="currentColor" opacity="0.8"/>
    <circle cx="31" cy="29" r="3" fill="currentColor" opacity="0.8"/>
    <!-- Motion lines -->
    <line x1="10" y1="20" x2="14" y2="22" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
    <line x1="8" y1="24" x2="12" y2="25" stroke="currentColor" stroke-width="1.5" opacity="0.5"/>
  </svg>

  <!-- Fundamentals - Basic skateboard -->
  <svg v-else-if="type === 'fundamentals'" :width="size || 24" :height="size || 24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Skateboard deck -->
    <rect x="8" y="20" width="32" height="6" rx="3" fill="currentColor"/>
    <!-- Trucks -->
    <rect x="12" y="26" width="8" height="3" fill="currentColor" opacity="0.7"/>
    <rect x="28" y="26" width="8" height="3" fill="currentColor" opacity="0.7"/>
    <!-- Wheels -->
    <circle cx="14" cy="32" r="4" fill="currentColor" opacity="0.8"/>
    <circle cx="34" cy="32" r="4" fill="currentColor" opacity="0.8"/>
    <!-- Balance indicator -->
    <path d="M24 12 L24 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M20 14 L24 10 L28 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>

  <!-- Surf Skate - Wave pattern -->
  <svg v-else-if="type === 'surf_skate'" :width="size || 24" :height="size || 24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Wave -->
    <path d="M4 28 Q12 20 20 28 Q28 36 36 28 Q44 20 44 24" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/>
    <!-- Surfboard/skateboard hybrid -->
    <ellipse cx="24" cy="20" rx="14" ry="4" fill="currentColor" transform="rotate(-10 24 20)"/>
    <!-- Carve lines -->
    <path d="M10 36 Q16 32 22 36" stroke="currentColor" stroke-width="1.5" opacity="0.5" fill="none"/>
    <path d="M26 36 Q32 32 38 36" stroke="currentColor" stroke-width="1.5" opacity="0.5" fill="none"/>
  </svg>

  <!-- Safety - Helmet -->
  <svg v-else-if="type === 'safety'" :width="size || 24" :height="size || 24" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <!-- Helmet dome -->
    <path d="M8 28 Q8 10 24 10 Q40 10 40 28" stroke="currentColor" stroke-width="3" fill="none"/>
    <!-- Helmet base -->
    <path d="M6 28 L42 28 Q44 32 42 34 L6 34 Q4 32 6 28" fill="currentColor" opacity="0.8"/>
    <!-- Vent holes -->
    <ellipse cx="16" cy="18" rx="2" ry="3" fill="currentColor" opacity="0.3"/>
    <ellipse cx="24" cy="16" rx="2" ry="3" fill="currentColor" opacity="0.3"/>
    <ellipse cx="32" cy="18" rx="2" ry="3" fill="currentColor" opacity="0.3"/>
    <!-- Chin strap -->
    <path d="M10 34 L10 40 Q10 42 12 42" stroke="currentColor" stroke-width="2" fill="none"/>
    <path d="M38 34 L38 40 Q38 42 36 42" stroke="currentColor" stroke-width="2" fill="none"/>
  </svg>
</template>
