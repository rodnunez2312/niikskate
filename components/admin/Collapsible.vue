<script setup lang="ts">
/**
 * Minimal staff collapsible: muted label row, +/− on the right, hairline divider.
 * Use v-model:open to control it from the parent, or default-open for local state.
 */
const props = withDefaults(defineProps<{
  title?: string
  /** Small muted text after the title (a count, "opcional", …). */
  meta?: string | number | null
  defaultOpen?: boolean
  /** Drop the bottom divider (e.g. when the row sits inside its own bordered box). */
  bare?: boolean
}>(), {
  title: '',
  meta: null,
  defaultOpen: false,
  bare: false,
})

const open = defineModel<boolean>('open', { default: undefined })
const localOpen = ref(props.defaultOpen)
const isOpen = computed(() => open.value ?? localOpen.value)

function toggle() {
  const next = !isOpen.value
  localOpen.value = next
  open.value = next
}

const uid = useId()
</script>

<template>
  <div :class="bare ? '' : 'border-b border-gray-800'">
    <div class="flex items-center gap-3">
      <button
        type="button"
        class="min-w-0 flex-1 flex items-center justify-between gap-3 py-2.5 text-left text-xs text-gray-400 hover:text-white transition-colors rounded-sm focus:outline-none focus-visible:ring-1 focus-visible:ring-gray-600"
        :aria-expanded="isOpen"
        :aria-controls="`collapsible-${uid}`"
        @click="toggle"
      >
        <span class="min-w-0 truncate">
          <slot name="title">{{ title }}</slot>
          <span v-if="meta !== null && meta !== ''" class="text-gray-600"> · {{ meta }}</span>
        </span>
        <span class="shrink-0 text-base leading-none text-gray-500" aria-hidden="true">{{ isOpen ? '−' : '+' }}</span>
      </button>
      <slot name="actions" />
    </div>
    <div v-if="isOpen" :id="`collapsible-${uid}`" class="pb-3">
      <slot />
    </div>
  </div>
</template>
