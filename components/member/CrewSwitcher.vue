<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    compact?: boolean
    showAdd?: boolean
    theme?: 'dark' | 'light'
  }>(),
  {
    compact: false,
    showAdd: true,
    theme: 'dark',
  },
)

const emit = defineEmits<{ add: [] }>()

const { language } = useI18n()
const {
  participants,
  activeKey,
  setActive,
  loading,
} = useCrew()

const pillClass = (active: boolean) => {
  if (props.theme === 'light') {
    return active
      ? 'bg-black text-white border-black'
      : 'bg-white text-black border-black hover:bg-gray-50'
  }
  return active
    ? 'bg-white text-black border-white'
    : 'bg-transparent text-white border-white/70 hover:border-white'
}
</script>

<template>
  <div v-if="participants.length" class="space-y-1">
    <p
      class="text-[10px] font-bold uppercase tracking-wider"
      :class="theme === 'light' ? 'text-gray-600' : 'text-gray-500'"
    >
      {{ language === 'es' ? 'Familia' : 'Family' }}:
    </p>
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-for="p in participants"
        :key="p.key"
        type="button"
        class="rounded-full border px-3 font-bold transition-colors disabled:opacity-50"
        :class="[
          compact ? 'py-1 text-xs' : 'py-1.5 text-sm',
          pillClass(activeKey === p.key),
        ]"
        :disabled="loading"
        @click="setActive(p.key)"
      >
        {{ p.firstName }}{{ p.isYou ? ` (${language === 'es' ? 'tú' : 'you'})` : '' }}
      </button>
      <button
        v-if="showAdd"
        type="button"
        class="flex items-center justify-center rounded-full border border-dashed font-bold transition-colors"
        :class="[
          compact ? 'h-7 w-7 text-sm' : 'h-8 w-8 text-base',
          theme === 'light'
            ? 'border-black text-black hover:bg-gray-100'
            : 'border-white/70 text-white hover:border-white',
        ]"
        :title="language === 'es' ? 'Agregar patinador a la familia' : 'Add skater to family'"
        @click="emit('add')"
      >
        +
      </button>
    </div>
  </div>
</template>
