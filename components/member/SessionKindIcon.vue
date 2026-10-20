<script setup lang="ts">
const props = defineProps<{ kind: string; small?: boolean }>()

const individual = computed(() => props.kind === 'class_individual' || props.kind === 'individual')
const grouped = computed(() => props.kind === 'class_session' || props.kind === 'group')
const height = computed(() => (props.small ? 11 : 16))
</script>

<template>
  <span v-if="individual || grouped" class="inline-flex shrink-0 items-center" style="line-height:0">
    <svg
      v-if="individual"
      xmlns="http://www.w3.org/2000/svg"
      :width="height"
      :height="height"
      viewBox="0 0 24 24"
      aria-hidden="true"
      :style="`display:block;width:${height}px;height:${height}px;flex:none`"
    >
      <path fill="#7C3AED" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
    <svg
      v-else
      xmlns="http://www.w3.org/2000/svg"
      :width="height * 1.75"
      :height="height"
      viewBox="0 0 40 24"
      aria-hidden="true"
      :style="`display:block;width:${height * 1.75}px;height:${height}px;flex:none`"
    >
      <g transform="translate(16 0)">
        <path fill="#7C3AED" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </g>
      <path fill="#7C3AED" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  </span>
</template>
