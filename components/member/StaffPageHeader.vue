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
      <div v-if="$slots.actions" class="staff-header-actions shrink-0 flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <div v-if="$slots.default" class="px-4 pb-4 max-w-7xl mx-auto">
      <slot />
    </div>
  </header>
</template>

<style scoped>
/* Match the yellow header button: text-sm with py-2.5, about 40px tall. */
.staff-header-actions :deep(a),
.staff-header-actions :deep(button) {
  box-sizing: border-box;
  height: 2.5rem;
  padding-top: 0;
  padding-bottom: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.staff-header-actions :deep(.absolute button) {
  height: auto;
  padding-top: 0.75rem;
  padding-bottom: 0.75rem;
  display: block;
  justify-content: flex-start;
}
.staff-header-actions :deep(button.h-9),
.staff-header-actions :deep(a.h-9) {
  width: 2.5rem;
  height: 2.5rem;
}
</style>
