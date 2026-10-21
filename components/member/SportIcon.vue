<script setup lang="ts">
defineProps<{ sport: string }>()
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="sport === 'scooter'">
      <path d="M13 4h5" />
      <path d="M15.5 4l3 12.2" />
      <path d="M7.5 18h9" />
      <circle cx="5.5" cy="18" r="2" />
      <circle cx="18.5" cy="18" r="2" />
    </template>
    <template v-else-if="sport === 'rollerblading'">
      <path d="M6 3h5v6l5 2.4c1.8.9 3 2.1 3 3.6v.5H6z" />
      <path d="M8 6h3" />
      <circle cx="7.5" cy="18.5" r="1.5" />
      <circle cx="11" cy="18.5" r="1.5" />
      <circle cx="14.5" cy="18.5" r="1.5" />
      <circle cx="18" cy="18.5" r="1.5" />
    </template>
    <template v-else-if="sport === 'bmx'">
      <circle cx="5.5" cy="16.5" r="3.5" />
      <circle cx="18.5" cy="16.5" r="3.5" />
      <path d="M5.5 16.5 9 9h7l2.5 7.5" />
      <path d="M9 9l3.5 7.5L16 9" />
      <path d="M15 5.5h2.5l-1.5 3.5" />
      <path d="M8 7h2.5" />
    </template>
    <template v-else-if="sport === 'parkour'">
      <circle cx="14.5" cy="4" r="1.8" />
      <path d="M13.5 7 10 11l3.5 2.5-1.5 5.5" />
      <path d="M10 11 6 10.5" />
      <path d="M13.5 7l3.5 3 3-.5" />
      <path d="M13.5 13.5 18 15" />
      <path d="M2.5 20.5h9" />
    </template>
    <template v-else-if="sport === 'strength'">
      <path d="M7 8v8M17 8v8" />
      <path d="M4 10v4M20 10v4" />
      <path d="M7 12h10" />
      <path d="M4 12h3M17 12h3" />
    </template>
    <template v-else>
      <path d="M2.5 10.5c0 1.4 1.1 2.5 2.5 2.5h14c1.4 0 2.5-1.1 2.5-2.5" />
      <path d="M7 13v1.6M17 13v1.6" />
      <circle cx="7" cy="17" r="1.7" />
      <circle cx="17" cy="17" r="1.7" />
    </template>
  </svg>
</template>
