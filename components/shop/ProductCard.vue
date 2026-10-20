<script setup lang="ts">
import type { Product, ProductCategory } from '~/types'
import { CATEGORY_LABELS } from '~/types'
import { groupForProductCategory, productImageUrl } from '~/utils/shopCatalog'

const props = defineProps<{
  product: Product
  justAdded?: boolean
  /** Featured cards get a badge and skip the details drawer. */
  featured?: boolean
}>()

const emit = defineEmits<{ add: [product: Product] }>()

const { formatPrice, language } = useI18n()
const es = computed(() => language.value === 'es')

const detailsOpen = ref(false)

const image = computed(() => productImageUrl(props.product))
const group = computed(() => groupForProductCategory(props.product.category))
const soldOut = computed(() => props.product.stock_quantity === 0 && !props.product.is_service)
const onSale = computed(
  () => Boolean(props.product.sale_price) && Number(props.product.sale_price) < Number(props.product.price),
)
const price = computed(() => formatPrice(props.product.sale_price || props.product.price))

const CATEGORY_PILL: Record<ProductCategory, string> = {
  tablas: 'bg-sky-500/15 text-sky-900',
  llantas: 'bg-violet-500/15 text-violet-900',
  hardware: 'bg-amber-500/15 text-amber-950',
  lijas: 'bg-orange-500/15 text-orange-950',
  protecciones: 'bg-emerald-500/15 text-emerald-950',
  cascos: 'bg-rose-500/15 text-rose-950',
  merch: 'bg-fuchsia-500/15 text-fuchsia-950',
  ramps: 'bg-teal-500/15 text-teal-950',
}

const categoryLabel = computed(() => {
  const labels = CATEGORY_LABELS[props.product.category]
  if (!labels) return props.product.category
  if (props.product.category === 'merch') return es.value ? 'Para ponerse' : 'Wearables'
  return es.value ? labels.name_es : labels.name
})

const categoryPillClass = computed(
  () => CATEGORY_PILL[props.product.category] || 'bg-charcoal/10 text-charcoal',
)
</script>

<template>
  <article
    class="group card-lift h-full rounded-2xl border border-charcoal/10 bg-white overflow-hidden flex flex-col text-charcoal"
  >
    <NuxtLink :to="`/shop/${product.id}`" class="relative aspect-square bg-white overflow-hidden block">
      <img
        v-if="image"
        :src="image"
        :alt="product.name"
        loading="lazy"
        class="w-full h-full object-contain p-4 transition-transform duration-500 group-hover:scale-105"
      />
      <div v-else class="w-full h-full flex items-center justify-center px-4 bg-cream-50">
        <span class="text-sm font-semibold text-center text-charcoal/50 uppercase tracking-wide">{{ product.name }}</span>
      </div>
      <span
        v-if="featured"
        class="absolute top-3 left-3 rounded-full bg-acid px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-charcoal"
      >
        {{ es ? 'Destacado' : 'Featured' }}
      </span>
      <span
        v-else-if="onSale"
        class="absolute top-3 left-3 rounded-full bg-charcoal px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-acid"
      >
        {{ es ? 'Oferta' : 'Sale' }}
      </span>
      <span
        v-if="soldOut"
        class="absolute inset-0 bg-charcoal/60 flex items-center justify-center text-sm font-bold text-cream"
      >
        {{ es ? 'Agotado' : 'Out of stock' }}
      </span>
    </NuxtLink>

    <div class="p-4 sm:p-5 flex flex-col flex-1 border-t border-charcoal/10">
      <p v-if="product.brand" class="text-[11px] font-bold uppercase tracking-[0.16em] text-sage-700 mb-1">
        {{ product.brand }}
      </p>
      <h3 class="font-display text-base sm:text-lg font-black uppercase tracking-wide leading-snug line-clamp-2">
        <NuxtLink :to="`/shop/${product.id}`" class="hover:underline underline-offset-4">{{ product.name }}</NuxtLink>
      </h3>

      <p class="mt-2 flex items-baseline gap-2">
        <span class="text-lg font-black">
          {{ product.requires_quote ? (es ? 'Cotizar' : 'Quote') : price }}
        </span>
        <span v-if="onSale && !product.requires_quote" class="text-sm text-charcoal/40 line-through">
          {{ formatPrice(product.price) }}
        </span>
      </p>

      <div v-if="featured" class="mt-3 flex items-center border-t border-charcoal/10 py-2.5">
        <span
          class="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          :class="categoryPillClass"
        >
          {{ categoryLabel }}
        </span>
      </div>

      <template v-if="!featured">
        <button
          type="button"
          class="mt-3 w-full flex items-center justify-between py-2.5 border-t border-charcoal/10 text-left"
          :aria-expanded="detailsOpen"
          @click="detailsOpen = !detailsOpen"
        >
          <span class="flex items-center gap-2 min-w-0">
            <span class="text-sm font-semibold">{{ es ? 'Detalles' : 'Details' }}</span>
            <span
              class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              :class="categoryPillClass"
            >
              {{ categoryLabel }}
            </span>
          </span>
          <span class="text-lg leading-none w-5 text-center" aria-hidden="true">{{ detailsOpen ? '−' : '+' }}</span>
        </button>
        <div v-show="detailsOpen" class="pb-3 text-sm text-charcoal/70 space-y-1">
          <p v-if="product.size">
            <span class="text-charcoal/50">{{ es ? 'Tamaño' : 'Size' }}:</span> {{ product.size }}
          </p>
          <p v-if="group">
            <span class="text-charcoal/50">{{ es ? 'Tipo' : 'Type' }}:</span>
            {{ es ? group.title.es : group.title.en }}
          </p>
          <p class="leading-relaxed">
            {{ product.description || (es ? 'Sin descripción adicional.' : 'No extra description.') }}
          </p>
        </div>
      </template>

      <!-- mt-auto keeps every card's button on the same line, whatever the title length. -->
      <div class="mt-auto pt-4">
        <NuxtLink
          v-if="product.requires_quote"
          :to="`/shop/${product.id}`"
          class="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-full border-2 border-charcoal font-black text-sm uppercase tracking-wide hover:bg-charcoal hover:text-cream transition-colors"
        >
          {{ es ? 'Pedir cotización' : 'Request quote' }}
        </NuxtLink>
        <button
          v-else-if="!soldOut"
          type="button"
          class="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-full font-black text-sm uppercase tracking-wide transition-colors"
          :class="justAdded ? 'bg-charcoal text-acid' : 'bg-acid text-charcoal hover:bg-acid-300'"
          @click="emit('add', product)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path v-if="justAdded" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
          {{ justAdded ? (es ? 'Agregado' : 'Added') : (es ? 'Agregar al carrito' : 'Add to cart') }}
        </button>
        <button
          v-else
          type="button"
          disabled
          class="w-full px-4 py-3.5 rounded-full bg-cream-200 text-charcoal/40 font-black text-sm uppercase cursor-not-allowed"
        >
          {{ es ? 'Agotado' : 'Out of stock' }}
        </button>
      </div>
    </div>
  </article>
</template>
