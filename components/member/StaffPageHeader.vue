<script setup lang="ts">
defineProps<{
  title: string
  subtitle?: string
}>()
</script>

<template>
  <header class="border-b border-gray-800 bg-gray-950">
    <div class="px-4 py-5 max-w-7xl mx-auto flex items-center justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-bold text-white truncate">{{ title }}</h1>
        <p v-if="subtitle || $slots.subtitle" class="text-sm text-gray-500 truncate">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
      </div>
      <div v-if="$slots.actions" class="shrink-0 flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.default" class="px-4 pb-4 max-w-7xl mx-auto">
      <slot />
    </div>
  </header>
</template>
