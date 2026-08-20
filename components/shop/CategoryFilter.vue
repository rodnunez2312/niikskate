<script setup lang="ts">
import { SHOP_GROUPS, type ShopGroupId } from '~/utils/shopCatalog'

const props = defineProps<{
  selectedFilter: ShopGroupId | null
  brandsActive: boolean
  showAllActive: boolean
}>()

const emit = defineEmits<{
  all: []
  filter: [id: ShopGroupId]
  brands: []
}>()

const { language } = useI18n()
const es = computed(() => language.value === 'es')

function isSelected(id: ShopGroupId) {
  return !props.brandsActive && props.selectedFilter === id
}

const tileClass = (active: boolean) =>
  active
    ? 'border-gold-500 text-gold-600'
    : 'border-gray-300 text-gray-900 hover:border-gray-500'
</script>

<template>
  <div
    class="grid grid-cols-3 gap-2 max-w-[15.5rem] mx-auto sm:max-w-none sm:flex sm:flex-nowrap sm:justify-center sm:gap-3"
  >
    <button
      type="button"
      class="w-full sm:shrink-0 sm:w-24 aspect-square rounded-xl border bg-white flex flex-col items-center justify-center px-1 transition-colors"
      :class="tileClass(showAllActive)"
      :aria-pressed="showAllActive"
      @click="emit('all')"
    >
      <svg class="w-5 h-5 sm:w-7 sm:h-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="3" y="3" width="7.5" height="7.5" rx="1" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1" />
      </svg>
      <span class="mt-1.5 mb-1 w-6 sm:w-8 border-t border-current opacity-40" />
      <span class="text-[8px] sm:text-[10px] font-bold uppercase tracking-wide leading-none">
        {{ es ? 'Todo' : 'All' }}
      </span>
    </button>

    <button
      v-for="group in SHOP_GROUPS"
      :key="group.id"
      type="button"
      class="w-full sm:shrink-0 sm:w-24 aspect-square rounded-xl border bg-white flex flex-col items-center justify-center px-1 transition-colors"
      :class="tileClass(isSelected(group.id))"
      :aria-pressed="isSelected(group.id)"
      @click="emit('filter', group.id)"
    >
      <svg
        v-if="group.icon === 'skate'"
        class="w-5 h-5 sm:w-7 sm:h-7"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M3.5 14.2c2.8-1.1 7.2-2.2 10.8-2.4 2.4-.1 4.6.2 6.2.8l.7-1.9c-2-.7-4.6-1.1-7.2-1-.9 0-1.9.1-2.8.2L9.8 7.2c-.3-.5-.9-.7-1.4-.5l-.9.4c-.5.2-.7.9-.4 1.4l1.2 2.3c-1.5.3-3 .8-4.5 1.4-.6.2-.9.9-.6 1.5.2.4.6.6 1 .6.1 0 .2 0 .3-.1zM7.2 16.8a1.35 1.35 0 110 2.7 1.35 1.35 0 010-2.7zm9.6-.2a1.35 1.35 0 110 2.7 1.35 1.35 0 010-2.7z" />
      </svg>
      <svg
        v-else-if="group.icon === 'helmet'"
        class="w-5 h-5 sm:w-7 sm:h-7"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 3.2c-4.6 0-8.3 3.5-8.3 8.1v.7c0 .4.1.8.3 1.1l1.1 1.8c.3.5.9.8 1.5.8h2.2v-1.6H7.1l-.8-1.3c-.1-.2-.1-.4-.1-.6v-.9c0-3.5 2.8-6.3 6.3-6.3s6.3 2.8 6.3 6.3v.9c0 .2 0 .4-.1.6l-.8 1.3h-1.7V15h2.2c.6 0 1.2-.3 1.5-.8l1.1-1.8c.2-.3.3-.7.3-1.1v-.7C20.3 6.7 16.6 3.2 12 3.2z" />
        <path d="M8.4 15.8h7.2v1.8c0 .7-.5 1.3-1.2 1.4l-2.3.3h-.2l-2.3-.3c-.7-.1-1.2-.7-1.2-1.4v-1.8z" />
      </svg>
      <svg
        v-else-if="group.icon === 'shirt'"
        class="w-5 h-5 sm:w-7 sm:h-7"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M8.2 4.5 12 7.2l3.8-2.7 3.5 2.2-2.2 3.1V19.5H6.9V9.8L4.7 6.7l3.5-2.2zm1.5 4.2V17.7h4.6V8.7L12 9.9l-2.3-1.2z" />
      </svg>
      <svg
        v-else
        class="w-5 h-5 sm:w-7 sm:h-7"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M12 5.2c-3.4 0-6.2 2.2-7.1 5.2H4c-.5 0-.9.4-.9.9v1.1c0 .5.4.9.9.9h16c.5 0 .9-.4.9-.9V11.3c0-.5-.4-.9-.9-.9h-.9C18.2 7.4 15.4 5.2 12 5.2zm0 1.8c2.3 0 4.2 1.3 5.1 3.2H6.9C7.8 8.3 9.7 7 12 7zM5.2 14.8h13.6c.4 0 .7.4.6.8-.4 1.5-2.5 2.6-6.6 2.6s-6.2-1.1-6.6-2.6c-.1-.4.2-.8.6-.8z" />
      </svg>

      <span class="mt-1.5 mb-1 w-6 sm:w-8 border-t border-current opacity-40" />
      <span class="text-[7px] sm:text-[10px] font-bold uppercase tracking-wide leading-tight text-center px-0.5">
        {{ es ? group.label.es : group.label.en }}
      </span>
    </button>

    <button
      type="button"
      class="w-full sm:shrink-0 sm:w-24 aspect-square rounded-xl border bg-white flex flex-col items-center justify-center px-1 transition-colors"
      :class="tileClass(brandsActive)"
      :aria-pressed="brandsActive"
      @click="emit('brands')"
    >
      <svg class="w-5 h-5 sm:w-7 sm:h-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4.5 6.5h9.2l1.8 2.2H19.5v9.8H4.5V6.5zm2 2v8h11v-5.8h-3.3l-1.8-2.2H6.5z" />
        <circle cx="9" cy="13.5" r="1.2" />
      </svg>
      <span class="mt-1.5 mb-1 w-6 sm:w-8 border-t border-current opacity-40" />
      <span class="text-[7px] sm:text-[10px] font-bold uppercase tracking-wide leading-tight text-center px-0.5">
        {{ es ? 'Marcas' : 'Brands' }}
      </span>
    </button>
  </div>
</template>
