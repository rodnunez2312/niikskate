<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    options: Array<{ id: string; label: string }>
    selected: string[]
    placeholder: string
    /** id of the visible <label> that names this control. */
    labelledby?: string
    emptyText?: string
    /** Shows an X on each row that emits `remove`. */
    removable?: boolean
    removeLabel?: (label: string) => string
  }>(),
  { labelledby: undefined, emptyText: '', removable: false, removeLabel: (label: string) => `Remove ${label}` },
)

const emit = defineEmits<{ toggle: [id: string]; remove: [id: string] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

onClickOutside(root, () => {
  open.value = false
})

const summary = computed(() => {
  const labels = props.options.filter(o => props.selected.includes(o.id)).map(o => o.label)
  return labels.length ? labels.join(', ') : props.placeholder
})
</script>

<template>
  <div ref="root" class="relative" @keydown.esc="open = false">
    <button
      type="button"
      class="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-600 text-sm text-left flex items-center justify-between gap-2"
      :class="selected.length ? 'text-white' : 'text-gray-400'"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-labelledby="labelledby"
      @click="open = !open"
    >
      <span class="truncate">{{ summary }}</span>
      <svg class="w-4 h-4 shrink-0 text-gray-400 transition-transform" :class="open ? 'rotate-180' : ''" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
      </svg>
    </button>
    <div
      v-if="open"
      class="absolute z-30 mt-1 w-full rounded-xl border border-gray-700 bg-gray-900 shadow-xl"
    >
      <ul
        role="listbox"
        aria-multiselectable="true"
        class="max-h-60 overflow-y-auto py-1"
      >
        <li v-if="!options.length && emptyText" class="px-3 py-2 text-xs text-gray-500">{{ emptyText }}</li>
        <li
          v-for="option in options"
          :key="option.id"
          role="option"
          :aria-selected="selected.includes(option.id)"
          class="flex items-center hover:bg-gray-800"
        >
          <label class="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 text-sm text-gray-200 cursor-pointer">
            <input
              type="checkbox"
              class="rounded border-gray-600 bg-gray-800 text-teal-500 focus:ring-teal-500"
              :checked="selected.includes(option.id)"
              @change="emit('toggle', option.id)"
            />
            <span class="truncate">{{ option.label }}</span>
          </label>
          <button
            v-if="removable"
            type="button"
            class="mr-2 w-6 h-6 shrink-0 grid place-items-center rounded-full text-gray-500 hover:bg-red-500/20 hover:text-red-300"
            :aria-label="removeLabel(option.label)"
            :title="removeLabel(option.label)"
            @click="emit('remove', option.id)"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </li>
      </ul>
      <div v-if="$slots.footer" class="border-t border-gray-800 p-2">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
