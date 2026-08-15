<script setup lang="ts">
import { SKATE_TRICK_TYPES, typeTagClass } from '~/utils/skateTrickTaxonomy'

const props = withDefaults(
  defineProps<{
    modelValue: string
    allowEmpty?: boolean
    size?: 'sm' | 'md'
  }>(),
  {
    allowEmpty: false,
    size: 'md',
  },
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

function pick(opt: string) {
  if (props.allowEmpty && props.modelValue === opt) {
    emit('update:modelValue', '')
    return
  }
  emit('update:modelValue', opt)
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="opt in SKATE_TRICK_TYPES"
      :key="opt"
      type="button"
      class="rounded-full border font-semibold transition-colors"
      :class="[
        size === 'sm' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
        modelValue === opt
          ? [typeTagClass(opt), 'border-transparent ring-1 ring-white/25']
          : 'border-gray-600 text-gray-400 bg-gray-800/60 hover:border-gray-500 hover:text-gray-200',
      ]"
      @click="pick(opt)"
    >
      {{ opt }}
    </button>
  </div>
</template>
