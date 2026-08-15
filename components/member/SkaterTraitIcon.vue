<script setup lang="ts">
import type { SkaterTraitIconId } from '~/utils/skaterProfileFields'

defineProps<{
  icon: SkaterTraitIconId
}>()
</script>

<template>
  <!-- Stance: foot position on board (view from above, nose →) -->
  <svg v-if="icon === 'stance_regular'" viewBox="0 0 32 32" fill="none" class="w-7 h-7" aria-hidden="true">
    <rect x="4" y="13" width="24" height="6" rx="3" class="stroke-current" stroke-width="1.5" />
    <circle cx="10" cy="16" r="2.5" class="fill-current opacity-90" />
    <circle cx="22" cy="16" r="2.2" class="fill-current opacity-45" />
    <path d="M28 16h2" class="stroke-current opacity-50" stroke-width="1.2" stroke-linecap="round" />
  </svg>
  <svg v-else-if="icon === 'stance_goofy'" viewBox="0 0 32 32" fill="none" class="w-7 h-7" aria-hidden="true">
    <rect x="4" y="13" width="24" height="6" rx="3" class="stroke-current" stroke-width="1.5" />
    <circle cx="22" cy="16" r="2.5" class="fill-current opacity-90" />
    <circle cx="10" cy="16" r="2.2" class="fill-current opacity-45" />
    <path d="M28 16h2" class="stroke-current opacity-50" stroke-width="1.2" stroke-linecap="round" />
  </svg>

  <!-- Style icons -->
  <svg v-else-if="icon === 'style_street'" viewBox="0 0 32 32" fill="none" class="w-7 h-7" aria-hidden="true">
    <path d="M6 24h14M8 20h10" class="stroke-current" stroke-width="1.5" stroke-linecap="round" />
    <path d="M22 8v16M22 8l6 4M22 24l6-4" class="stroke-current" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
  <svg v-else-if="icon === 'style_vert'" viewBox="0 0 32 32" fill="none" class="w-7 h-7" aria-hidden="true">
    <path d="M6 22c0-8 4-14 10-14s10 6 10 14" class="stroke-current" stroke-width="1.5" stroke-linecap="round" />
    <path d="M8 22h16" class="stroke-current" stroke-width="1.5" stroke-linecap="round" />
    <circle cx="16" cy="12" r="1.5" class="fill-current" />
  </svg>
  <svg v-else-if="icon === 'style_park'" viewBox="0 0 32 32" fill="none" class="w-7 h-7" aria-hidden="true">
    <path d="M5 22h10l4-8 4 8h4" class="stroke-current" stroke-width="1.5" stroke-linejoin="round" />
    <rect x="7" y="18" width="6" height="4" rx="0.5" class="stroke-current" stroke-width="1.2" />
  </svg>
  <svg v-else-if="icon === 'style_bowl'" viewBox="0 0 32 32" fill="none" class="w-7 h-7" aria-hidden="true">
    <ellipse cx="16" cy="18" rx="11" ry="6" class="stroke-current" stroke-width="1.5" />
    <path d="M5 18c0-6 5-10 11-10s11 4 11 10" class="stroke-current opacity-60" stroke-width="1.2" />
  </svg>
  <svg v-else-if="icon === 'style_all_around'" viewBox="0 0 32 32" fill="none" class="w-7 h-7" aria-hidden="true">
    <circle cx="16" cy="16" r="9" class="stroke-current" stroke-width="1.5" />
    <path d="M16 7v18M7 16h18" class="stroke-current opacity-50" stroke-width="1" />
    <circle cx="16" cy="16" r="2" class="fill-current" />
  </svg>

  <!-- Push -->
  <svg v-else-if="icon === 'push_clean'" viewBox="0 0 32 32" fill="none" class="w-7 h-7" aria-hidden="true">
    <rect x="6" y="14" width="18" height="5" rx="2.5" class="stroke-current" stroke-width="1.5" />
    <circle cx="20" cy="16.5" r="2" class="fill-current opacity-90" />
    <path d="M4 16.5h3M26 16.5l-3-2v4l3-2z" class="stroke-current" stroke-width="1.3" stroke-linejoin="round" />
  </svg>
  <svg v-else-if="icon === 'push_mongo'" viewBox="0 0 32 32" fill="none" class="w-7 h-7" aria-hidden="true">
    <rect x="8" y="14" width="18" height="5" rx="2.5" class="stroke-current" stroke-width="1.5" />
    <circle cx="12" cy="16.5" r="2" class="fill-current opacity-90" />
    <path d="M28 16.5l-3-2v4l3-2zM4 16.5h3" class="stroke-current" stroke-width="1.3" stroke-linejoin="round" />
  </svg>
</template>
