<script setup lang="ts">
definePageMeta({ layout: 'public' })

import type { Product } from '~/types'
import ShopBrandCarousel from '~/components/shop/BrandCarousel.vue'
import ShopCategoryFilter from '~/components/shop/CategoryFilter.vue'
import ShopProductCard from '~/components/shop/ProductCard.vue'
import {
  SHOP_GROUPS,
  compareShopProducts,
  productMatchesSearch,
  sharableLogoMap,
  type ShopGroupId,
} from '~/utils/shopCatalog'

const route = useRoute()
const router = useRouter()
const { products, loading, fetchProducts } = useProducts()
const cartStore = useCartStore()
const { language } = useI18n()

const es = computed(() => language.value === 'es')
const shopGroups = SHOP_GROUPS

/** Single category filter — null means all products (unless a brand is selected) */
const selectedFilter = ref<ShopGroupId | null>(null)
/** Brands are browsed in the carousel; this holds the one being filtered by. */
const selectedBrand = ref<string | null>(null)
const brandLogos = ref<Record<string, string>>({})

const showAllActive = computed(
  () => !selectedBrand.value && selectedFilter.value === null,
)

function selectAll() {
  selectedFilter.value = null
  selectedBrand.value = null
}

function selectBrand(name: string) {
  selectedBrand.value = name
  selectedFilter.value = null
}

const searchQuery = ref('')
const searchOpen = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
const justAddedId = ref<string | null>(null)

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) {
    nextTick(() => searchInput.value?.focus())
  } else {
    searchQuery.value = ''
  }
}

const client = useSupabaseClient()

async function loadBrandLogos() {
  const map: Record<string, string> = {}
  try {
    const file = await $fetch<{ brands?: Record<string, { logo?: string }> }>('/data/shop-brands.json')
    for (const [name, meta] of Object.entries(file?.brands || {})) {
      if (meta?.logo) map[name] = meta.logo
    }
  } catch {
    /* optional file */
  }
  try {
    const { data } = await client.from('shop_brands').select('name, logo_url')
    for (const row of data || []) {
      if (row?.name && row?.logo_url) map[row.name] = row.logo_url
    }
  } catch {
    /* table may not exist yet */
  }
  if (import.meta.client) {
    try {
      const local = JSON.parse(localStorage.getItem('niik-shop-brand-logos') || '{}')
      Object.assign(map, local)
    } catch {
      /* ignore */
    }
  }
  // A blob: URL from a failed upload renders as a broken image everywhere else.
  brandLogos.value = sharableLogoMap(map)
}

onMounted(async () => {
  await Promise.all([fetchProducts({ in_stock: false }), loadBrandLogos()])
  const raw = String(route.query.cat || '')
  if (raw.startsWith('brand:')) {
    selectedBrand.value = decodeURIComponent(raw.slice(6))
  } else if (raw && shopGroups.some(g => g.id === raw)) {
    selectedFilter.value = raw as ShopGroupId
  }
})

watch(
  [selectedFilter, selectedBrand],
  () => {
    const query = { ...route.query } as Record<string, string>
    if (selectedBrand.value) query.cat = `brand:${encodeURIComponent(selectedBrand.value)}`
    else if (!selectedFilter.value) delete query.cat
    else query.cat = selectedFilter.value
    router.replace({ query })
  },
)

function selectFilter(id: ShopGroupId) {
  selectedBrand.value = null
  selectedFilter.value = id
}

function clearFilters() {
  selectedFilter.value = null
  selectedBrand.value = null
  searchQuery.value = ''
}

function productMatchesFilters(product: Product) {
  if (selectedBrand.value) {
    return (product.brand || '').trim().toLowerCase() === selectedBrand.value.trim().toLowerCase()
  }
  if (!selectedFilter.value) return true
  const group = shopGroups.find(g => g.id === selectedFilter.value)
  if (!group) return true
  return group.dbCategories.includes(product.category)
}

type BrandCard = {
  name: string
  count: number
  image: string | null
}

function logoForBrand(name: string): string | null {
  if (brandLogos.value[name]) return brandLogos.value[name]
  const key = Object.keys(brandLogos.value).find(
    k => k.trim().toLowerCase() === name.trim().toLowerCase(),
  )
  return key ? brandLogos.value[key] : null
}

const brandCards = computed((): BrandCard[] => {
  const map = new Map<string, number>()
  for (const p of products.value) {
    const name = (p.brand || '').trim()
    if (!name) continue
    map.set(name, (map.get(name) || 0) + 1)
  }
  return [...map.entries()]
    .map(([name, count]) => ({
      name,
      count,
      image: logoForBrand(name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

const filteredProducts = computed(() => {
  const q = searchQuery.value.trim()
  const hasSearch = Boolean(q)

  let list = products.value.filter(product => {
    if (hasSearch) return true
    return productMatchesFilters(product)
  })

  if (hasSearch) {
    list = list.filter(p => productMatchesSearch(p, q))
  }

  return [...list].sort(compareShopProducts)
})

/**
 * The strip belongs to the shop landing view only: picking a category means the
 * visitor has narrowed down, so the products get the full page. Selecting a
 * brand keeps it around so they can hop between brands.
 */
const showBrandCarousel = computed(
  () =>
    !loading.value
    && selectedFilter.value === null
    && !searchQuery.value.trim()
    && brandCards.value.length > 0,
)

watch(searchQuery, (q) => {
  if (!q.trim()) return
  selectedBrand.value = null
})

const FEATURED_FALLBACK = 4

const isBuyable = (p: Product) => p.stock_quantity > 0 || p.is_service || p.requires_quote

/**
 * Every admin-marked "Destacado" product. Until some are marked, sale items
 * and then the top of the catalogue fill a short row so it is never empty.
 */
const featuredProducts = computed(() => {
  const buyable = products.value.filter(isBuyable).sort(compareShopProducts)
  const marked = buyable.filter(p => p.is_featured)
  if (marked.length) return marked
  const onSale = buyable.filter(p => p.sale_price && Number(p.sale_price) < Number(p.price))
  return (onSale.length ? onSale : buyable).slice(0, FEATURED_FALLBACK)
})

const featuredCarousel = computed(() => featuredProducts.value.length > 2)
const featuredTrack = ref<HTMLElement | null>(null)
const featuredAtStart = ref(true)
const featuredAtEnd = ref(false)

function updateFeaturedEnds() {
  const el = featuredTrack.value
  if (!el) return
  featuredAtStart.value = el.scrollLeft <= 4
  featuredAtEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4
}

function scrollFeatured(direction: 1 | -1) {
  const el = featuredTrack.value
  if (!el) return
  const card = el.querySelector('article')
  const gap = 12
  const amount = card ? card.getBoundingClientRect().width + gap : el.clientWidth * 0.5
  el.scrollBy({ left: direction * amount, behavior: 'smooth' })
}

watch(featuredProducts, async () => {
  await nextTick()
  updateFeaturedEnds()
})

const showFeatured = computed(
  () => !loading.value && showAllActive.value && !searchQuery.value.trim() && featuredProducts.value.length > 0,
)

const addToCart = (product: Product) => {
  if (product.requires_quote) {
    navigateTo(`/shop/${product.id}`)
    return
  }
  const ok = cartStore.addItem(product)
  if (ok) justAddedId.value = product.id
}

const cartLabel = computed(() => {
  const n = cartStore.totalItems
  if (es.value) return n === 1 ? '1 ARTÍCULO' : `${n} ARTÍCULOS`
  return n === 1 ? '1 ITEM' : `${n} ITEMS`
})
</script>

<template>
  <div class="min-h-screen bg-cream text-charcoal pb-28">
    <!-- Hero banner (placeholder image — replace when you have final art) -->
    <section class="relative bg-charcoal text-cream overflow-hidden">
      <div class="absolute inset-0">
        <img
          src="/Niik_StainedGlass.png"
          alt=""
          class="w-full h-full object-cover object-center opacity-35"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/75 to-charcoal/40" />
      </div>
      <div
        class="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20 flex flex-col md:flex-row md:items-end md:justify-between gap-8"
      >
        <div>
          <p class="t-eyebrow text-acid mb-3">NiikSkate</p>
          <h1 class="t-display mb-3">Skateshop</h1>
          <p class="t-lead text-cream/75 max-w-xl">
            {{
              es
                ? 'Tablas, protección y ropa que usamos en clase. Elige una categoría y agrega al carrito.'
                : 'Boards, protection and apparel we ride in class. Pick a category and add to cart.'
            }}
          </p>
        </div>

        <div
          class="shrink-0 md:max-w-xs w-full md:w-auto rounded-2xl border border-cream/20 bg-charcoal/70 backdrop-blur-sm p-5 md:text-right"
        >
          <p class="t-eyebrow text-acid text-[11px]">
            {{ es ? 'También construimos' : 'We also build' }}
          </p>
          <p class="font-display text-lg font-black uppercase leading-tight mt-1">
            {{ es ? 'Rampas a tu medida' : 'Custom ramps' }}
          </p>
          <p class="text-cream/60 text-xs mt-1.5 leading-snug">
            {{
              es
                ? 'Mándanos fotos de tu idea y te cotizamos el diseño.'
                : 'Send photos of your idea and we will quote the design.'
            }}
          </p>
          <NuxtLink to="/skateramps" class="btn-outline-light mt-4 text-xs uppercase px-5 py-2.5">
            {{ es ? 'Ver skateramps' : 'See skateramps' }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-8">
      <!-- Filters + compact search (lupa top-right) -->
      <div class="relative">
        <div class="absolute top-0 right-0 z-10 flex items-center gap-2">
          <Transition name="search-slide">
            <input
              v-if="searchOpen"
              ref="searchInput"
              v-model="searchQuery"
              type="search"
              class="w-40 sm:w-56 px-3 py-1.5 rounded-full bg-white text-charcoal text-sm border border-charcoal/20 placeholder-charcoal/40 focus:outline-none focus:border-charcoal"
              :placeholder="es ? 'Buscar…' : 'Search…'"
              @keydown.escape="toggleSearch"
            />
          </Transition>
          <button
            type="button"
            class="w-9 h-9 rounded-full border border-charcoal/20 bg-white text-charcoal flex items-center justify-center hover:border-charcoal hover:bg-charcoal hover:text-acid transition-colors"
            :aria-label="es ? 'Buscar' : 'Search'"
            :aria-expanded="searchOpen"
            @click="toggleSearch"
          >
            <svg v-if="!searchOpen" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="pt-1 pr-11 sm:pr-0">
          <ShopCategoryFilter
            :selected-filter="selectedFilter"
            :show-all-active="showAllActive"
            @all="selectAll"
            @filter="selectFilter"
          />
        </div>
      </div>

      <ShopBrandCarousel
        v-if="showBrandCarousel"
        :brands="brandCards"
        :selected="selectedBrand"
        @select="selectBrand"
        @clear="selectAll"
      />

      <!-- Brand selected bar: only when the carousel is not already showing the choice -->
      <div
        v-if="selectedBrand && !showBrandCarousel"
        class="flex items-center justify-between gap-3 rounded-xl border border-charcoal/10 bg-white px-4 py-3"
      >
        <p class="text-sm text-charcoal/70">
          <span class="text-charcoal/50">{{ es ? 'Marca' : 'Brand' }}:</span>
          <span class="font-black text-charcoal uppercase ml-2">{{ selectedBrand }}</span>
        </p>
        <button
          type="button"
          class="text-xs font-bold text-charcoal underline underline-offset-4 hover:text-sage-700"
          @click="selectAll"
        >
          {{ es ? 'Ver todo' : 'Show all' }}
        </button>
      </div>

      <!-- Featured products -->
      <section v-if="showFeatured" aria-labelledby="featured-heading" class="rounded-3xl bg-charcoal text-cream p-5 sm:p-8">
        <p class="t-eyebrow text-acid text-[11px] mb-2">{{ es ? 'Selección Niik' : 'Niik picks' }}</p>
        <h2 id="featured-heading" class="font-display text-2xl sm:text-3xl font-black uppercase tracking-tight mb-5">
          {{ es ? 'Productos destacados' : 'Featured products' }}
        </h2>
        <div class="relative">
          <div
            ref="featuredTrack"
            class="gap-3 sm:gap-5"
            :class="featuredCarousel ? 'featured-track flex overflow-x-auto snap-x snap-mandatory' : 'grid grid-cols-2'"
            @scroll.passive="updateFeaturedEnds"
          >
            <ShopProductCard
              v-for="product in featuredProducts"
              :key="`featured-${product.id}`"
              :product="product"
              featured
              :just-added="justAddedId === product.id"
              class="min-w-0"
              :class="featuredCarousel ? 'shrink-0 snap-start w-[calc(50%-0.375rem)] sm:w-[calc(50%-0.625rem)] lg:w-[calc(25%-0.9375rem)]' : ''"
              @add="addToCart"
            />
          </div>
          <template v-if="featuredCarousel">
            <button
              type="button"
              class="absolute left-0 top-1/2 z-10 -translate-y-1/2 w-9 h-9 rounded-full border border-charcoal/20 bg-white text-charcoal flex items-center justify-center shadow-lg transition-colors hover:bg-charcoal hover:text-acid disabled:opacity-40"
              :disabled="featuredAtStart"
              :aria-label="es ? 'Destacados anteriores' : 'Previous featured'"
              @click="scrollFeatured(-1)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              class="absolute right-0 top-1/2 z-10 -translate-y-1/2 w-9 h-9 rounded-full border border-charcoal/20 bg-white text-charcoal flex items-center justify-center shadow-lg transition-colors hover:bg-charcoal hover:text-acid disabled:opacity-40"
              :disabled="featuredAtEnd"
              :aria-label="es ? 'Más destacados' : 'More featured'"
              @click="scrollFeatured(1)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </template>
        </div>
      </section>

      <h2 v-if="!loading && filteredProducts.length" class="font-display text-xl sm:text-2xl font-black uppercase tracking-tight">
        {{
          showAllActive && !searchQuery.trim()
            ? (es ? 'Todos los productos' : 'All products')
            : (es ? `${filteredProducts.length} productos` : `${filteredProducts.length} products`)
        }}
      </h2>

      <!-- Loading -->
      <div v-if="loading" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div v-for="i in 6" :key="i" class="rounded-2xl border border-charcoal/10 bg-white overflow-hidden animate-pulse">
          <div class="aspect-square bg-cream-200" />
          <div class="p-4 space-y-2">
            <div class="h-4 bg-cream-200 rounded w-2/3" />
            <div class="h-3 bg-cream-200 rounded w-1/3" />
          </div>
        </div>
      </div>

      <!-- Empty products -->
      <div
        v-else-if="filteredProducts.length === 0"
        class="text-center py-16 border border-charcoal/10 bg-white rounded-2xl"
      >
        <p class="text-lg font-bold mb-2">
          {{
            searchQuery.trim()
              ? (es ? 'Ningún producto coincide con tu búsqueda' : 'No products match your search')
              : (es ? 'No hay productos con estos filtros' : 'No products match these filters')
          }}
        </p>
        <button
          type="button"
          class="mt-3 text-sm font-bold text-charcoal underline underline-offset-4 hover:text-sage-700"
          @click="clearFilters"
        >
          {{ es ? 'Ver todos' : 'Show all' }}
        </button>
      </div>

      <!-- Products grid -->
      <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <ShopProductCard
          v-for="product in filteredProducts"
          :key="product.id"
          :product="product"
          :just-added="justAddedId === product.id"
          @add="addToCart"
        />
      </div>
    </div>

    <!-- Floating cart (bottom-right, Carry On style) -->
    <NuxtLink
      to="/cart"
      class="fixed bottom-5 right-5 z-50 inline-flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-full bg-acid text-charcoal shadow-2xl transition-transform hover:scale-[1.03] active:scale-95 motion-reduce:transform-none"
      :aria-label="es ? 'Ver carrito' : 'View cart'"
    >
      <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
      <span class="text-sm font-black uppercase tracking-wide whitespace-nowrap">
        {{ cartLabel }}
      </span>
      <span class="w-7 h-7 rounded-full bg-charcoal text-acid text-xs font-black flex items-center justify-center shrink-0">
        {{ cartStore.totalItems }}
      </span>
    </NuxtLink>
  </div>
</template>

<style scoped>
.search-slide-enter-active,
.search-slide-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease, width 0.2s ease;
}
.search-slide-enter-from,
.search-slide-leave-to {
  opacity: 0;
  transform: translateX(8px);
}
.featured-track {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.featured-track::-webkit-scrollbar {
  display: none;
}
</style>
