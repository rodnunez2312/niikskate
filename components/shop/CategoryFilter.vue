<script setup lang="ts">
import { SHOP_GROUPS, type ShopGroupId } from '~/utils/shopCatalog'

const props = defineProps<{
  selectedFilter: ShopGroupId | null
  showAllActive: boolean
  /** Admin-only tile: shoppers pick brands from the carousel instead. */
  showBrands?: boolean
  brandsActive?: boolean
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

/**
 * Keyed by ShopGroup.icon. The artwork is on white, same as the tile, so it
 * reads as a drawing rather than a pasted photo. Unlike the old inline SVGs it
 * cannot take the gold tint when selected — the border and label carry that.
 */
const CATEGORY_ART: Record<string, string> = {
  skate: '/images/shop-categories/skate.jpg',
  helmet: '/images/shop-categories/safety.jpg',
  shirt: '/images/shop-categories/clothing.jpg',
  hat: '/images/shop-categories/accessories.jpg',
}
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
      <img
        :src="CATEGORY_ART[group.icon]"
        alt=""
        aria-hidden="true"
        class="h-7 sm:h-9 w-auto max-w-full object-contain"
      />

      <span class="mt-1.5 mb-1 w-6 sm:w-8 border-t border-current opacity-40" />
      <span class="text-[7px] sm:text-[10px] font-bold uppercase tracking-wide leading-tight text-center px-0.5">
        {{ es ? group.label.es : group.label.en }}
      </span>
    </button>

    <button
      v-if="showBrands"
      type="button"
      class="w-full sm:shrink-0 sm:w-24 aspect-square rounded-xl border bg-white flex flex-col items-center justify-center px-1 transition-colors"
      :class="tileClass(Boolean(brandsActive))"
      :aria-pressed="Boolean(brandsActive)"
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

    <!-- Last tile: leaves the shop for the ramp build service. -->
    <NuxtLink
      to="/skateramps"
      class="w-full sm:shrink-0 sm:w-24 aspect-square rounded-xl border bg-white flex flex-col items-center justify-center px-1 transition-colors border-gray-300 text-gray-900 hover:border-teal-500 hover:text-teal-700"
    >
      <img
        src="/images/shop-categories/ramps.jpg"
        alt=""
        aria-hidden="true"
        class="h-7 sm:h-9 w-auto max-w-full object-contain"
      />
      <span class="mt-1.5 mb-1 w-6 sm:w-8 border-t border-current opacity-40" />
      <span class="text-[7px] sm:text-[10px] font-bold uppercase tracking-wide leading-tight text-center px-0.5">
        {{ es ? 'Rampas' : 'Ramps' }}
      </span>
    </NuxtLink>
  </div>
</template>
