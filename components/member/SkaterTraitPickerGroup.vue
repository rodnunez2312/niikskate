<script setup lang="ts">
import type { SkaterTraitOption } from '~/utils/skaterProfileFields'

const props = defineProps<{
  label: string
  options: readonly SkaterTraitOption[]
  modelValue: string | null | undefined
  editable?: boolean
  saving?: boolean
  es?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const selectedLabel = computed(() => {
  const hit = props.options.find(o => o.value === props.modelValue)
  if (!hit) return props.es ? 'Sin definir' : 'Not set'
  return props.es ? hit.labelEs : hit.labelEn
})

function pick(value: string) {
  if (!props.editable || props.saving) return
  emit('update:modelValue', props.modelValue === value ? null : value)
}
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-baseline justify-between gap-1">
      <p class="text-[10px] font-semibold uppercase tracking-wider text-amber-500/90">{{ label }}</p>
      <p class="text-[9px] text-gray-500 truncate max-w-[60%] text-right">{{ selectedLabel }}</p>
    </div>
    <div
      class="gap-1"
      :class="options.length >= 4 ? 'grid grid-cols-3' : 'flex flex-wrap justify-between'"
    >
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="flex flex-col items-center justify-center rounded-lg border transition-all min-w-[44px] px-1 py-1.5"
        :class="[
          modelValue === opt.value
            ? 'border-amber-400/70 bg-amber-500/15 text-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.15)]'
            : 'border-gray-700/80 bg-gray-800/50 text-gray-400',
          editable && !saving ? 'hover:border-gray-500 hover:text-gray-200 cursor-pointer' : 'cursor-default',
          saving ? 'opacity-50' : '',
        ]"
        :disabled="!editable || saving"
        :title="es ? opt.labelEs : opt.labelEn"
        @click="pick(opt.value)"
      >
        <SkaterTraitIcon :icon="opt.icon" />
        <span class="text-[8px] font-medium mt-0.5 leading-tight text-center max-w-[52px] truncate">
          {{ es ? opt.labelEs : opt.labelEn }}
        </span>
      </button>
    </div>
  </div>
</template>
