<script setup lang="ts">
definePageMeta({ layout: 'public' })

import type { Product, ProductCategory } from '~/types'
import { CATEGORY_LABELS } from '~/types'

type ShopGroupId = 'skate_equip' | 'security_equip' | 'clothing' | 'accessories'

type ShopIcon = 'grid' | 'skate' | 'helmet' | 'shirt' | 'hat'

type ShopGroup = {
  id: ShopGroupId
  /** Short tile label (ALL CAPS in UI) */
  label: { en: string; es: string }
  title: { en: string; es: string }
  icon: ShopIcon
  dbCategories: ProductCategory[]
}

const route = useRoute()
const router = useRouter()
const { products, loading, fetchProducts } = useProducts()
const cartStore = useCartStore()
const { formatPrice, language } = useI18n()

const es = computed(() => language.value === 'es')

const shopGroups: ShopGroup[] = [
  {
    id: 'skate_equip',
    label: { en: 'Skate', es: 'Skate' },
    title: { en: 'Skate equip', es: 'Equipo de skate' },
    icon: 'skate',
    dbCategories: ['tablas', 'llantas', 'lijas', 'ramps'],
  },
  {
    id: 'security_equip',
    label: { en: 'Protective', es: 'Seguridad' },
    title: { en: 'Security equip', es: 'Equipo de seguridad' },
    icon: 'helmet',
    dbCategories: ['protecciones', 'cascos'],
  },
  {
    id: 'clothing',
    label: { en: 'Clothing', es: 'Ropa' },
    title: { en: 'Clothing', es: 'Ropa' },
    icon: 'shirt',
    dbCategories: ['merch'],
  },
  {
    id: 'accessories',
    label: { en: 'Accessories', es: 'Accesorios' },
    title: { en: 'Accessories', es: 'Accesorios' },
    icon: 'hat',
    dbCategories: ['hardware'],
  },
]

/** Single category filter — null means all products (unless brand picker / brand selected) */
const selectedFilter = ref<ShopGroupId | null>(null)
/** Brands picker mode + selected brand name */
const brandsMode = ref(false)
const selectedBrand = ref<string | null>(null)
const brandLogos = ref<Record<string, string>>({})

const showAllActive = computed(
  () => !brandsMode.value && !selectedBrand.value && selectedFilter.value === null,
)

function selectAll() {
  selectedFilter.value = null
  brandsMode.value = false
  selectedBrand.value = null
}

function openBrandsMode() {
  brandsMode.value = true
  selectedBrand.value = null
  selectedFilter.value = null
}

function selectBrand(name: string) {
  selectedBrand.value = name
  brandsMode.value = false
}

function clearBrand() {
  selectedBrand.value = null
  brandsMode.value = true
}

const searchQuery = ref('')
const searchOpen = ref(false)
const searchInput = ref<HTMLInputElement | null>(null)
const justAddedId = ref<string | null>(null)
const openDetails = ref<Record<string, boolean>>({})

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) {
    nextTick(() => searchInput.value?.focus())
  } else {
    searchQuery.value = ''
  }
}

function toggleDetails(productId: string) {
  openDetails.value = {
    ...openDetails.value,
    [productId]: !openDetails.value[productId],
  }
}

function isDetailsOpen(productId: string) {
  return Boolean(openDetails.value[productId])
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
  brandLogos.value = map
}

onMounted(async () => {
  await Promise.all([fetchProducts({ in_stock: false }), loadBrandLogos()])
  const raw = String(route.query.cat || '')
  if (raw === 'brands') {
    brandsMode.value = true
  } else if (raw.startsWith('brand:')) {
    selectedBrand.value = decodeURIComponent(raw.slice(6))
  } else if (raw && shopGroups.some(g => g.id === raw)) {
    selectedFilter.value = raw as ShopGroupId
  }
})

watch(
  [selectedFilter, brandsMode, selectedBrand],
  () => {
    const query = { ...route.query } as Record<string, string>
    if (brandsMode.value) query.cat = 'brands'
    else if (selectedBrand.value) query.cat = `brand:${encodeURIComponent(selectedBrand.value)}`
    else if (!selectedFilter.value) delete query.cat
    else query.cat = selectedFilter.value
    router.replace({ query })
  },
)

function isSelected(id: ShopGroupId) {
  return !brandsMode.value && !selectedBrand.value && selectedFilter.value === id
}

function selectFilter(id: ShopGroupId) {
  brandsMode.value = false
  selectedBrand.value = null
  selectedFilter.value = id
}

function clearFilters() {
  selectedFilter.value = null
  brandsMode.value = false
  selectedBrand.value = null
  searchQuery.value = ''
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

function productSearchHaystack(product: Product): string {
  const group = groupForProduct(product)
  const cat = CATEGORY_LABELS[product.category as ProductCategory]
  const titleWords = (product.name || '').split(/\s+/).join(' ')
  return [
    titleWords,
      product.name,
      product.brand,
      product.size,
      product.sku,
      product.description,
    group?.label.en,
    group?.label.es,
    cat?.name,
    cat?.name_es,
  ]
    .filter(Boolean)
    .join(' ')
}

function productMatchesSearch(product: Product, rawQuery: string) {
  const tokens = normalizeSearchText(rawQuery)
    .split(/\s+/)
    .filter(Boolean)
  if (!tokens.length) return true

  const hay = normalizeSearchText(productSearchHaystack(product))
  const nameHay = normalizeSearchText(product.name || '')

  return tokens.every(token =>
    hay.includes(token)
    || nameHay.split(/\s+/).some(word => word.includes(token)),
  )
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

function groupForProduct(product: Product): ShopGroup | undefined {
  return shopGroups.find(g => g.dbCategories.includes(product.category))
}

/** Public URLs only — blob: previews from failed uploads must not reach the storefront */
function productImageUrl(product: Product): string | null {
  const url = product.images?.find(
    img => typeof img === 'string' && /^https?:\/\//i.test(img.trim()),
  )
  return url?.trim() || null
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

  return list
})

const showBrandPicker = computed(
  () => brandsMode.value && !searchQuery.value.trim(),
)

watch(searchQuery, (q) => {
  if (!q.trim()) return
  brandsMode.value = false
  selectedBrand.value = null
})

const brandsTileActive = computed(() => brandsMode.value || Boolean(selectedBrand.value))

const getProductPrice = (product: Product) => {
  const priceMXN = product.sale_price || product.price
  return formatPrice(priceMXN)
}

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
  <div class="min-h-screen bg-black text-white pb-28">
    <!-- Hero banner (placeholder image — replace when you have final art) -->
    <section class="relative border-b border-white/10 overflow-hidden">
      <div class="absolute inset-0">
        <img
          src="/Niik_StainedGlass.png"
          alt=""
          class="w-full h-full object-cover object-center opacity-45"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />
      </div>
      <div class="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <h1 class="text-4xl sm:text-5xl font-black tracking-tight mb-3">
          Skateshop
        </h1>
        <p class="text-gray-300 text-sm sm:text-base max-w-xl">
          {{
            es
              ? 'Filtra por categoría (una a la vez) y agrega al carrito.'
              : 'Filter by category (one at a time) and add to cart.'
          }}
        </p>
      </div>
    </section>

    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
      <!-- Filters + compact search (lupa top-right) -->
      <div class="relative">
        <div class="absolute top-0 right-0 z-10 flex items-center gap-2">
          <Transition name="search-slide">
            <input
              v-if="searchOpen"
              ref="searchInput"
              v-model="searchQuery"
              type="search"
              class="w-40 sm:w-56 px-3 py-1.5 rounded-full bg-white text-gray-900 text-sm border border-gray-300 placeholder-gray-400 focus:outline-none focus:border-gold-500"
              :placeholder="es ? 'Buscar…' : 'Search…'"
              @keydown.escape="toggleSearch"
            />
          </Transition>
          <button
            type="button"
            class="w-9 h-9 rounded-full border border-white/20 bg-black/60 text-white flex items-center justify-center hover:border-gold-400 hover:text-gold-400 transition-colors"
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
          <div
            class="grid grid-cols-3 gap-2 max-w-[15.5rem] mx-auto sm:max-w-none sm:flex sm:flex-nowrap sm:justify-center sm:gap-3"
          >
            <!-- ALL -->
            <button
              type="button"
              class="w-full sm:shrink-0 sm:w-24 aspect-square rounded-xl border bg-white flex flex-col items-center justify-center px-1 transition-colors"
              :class="showAllActive
                ? 'border-gold-500 text-gold-600'
                : 'border-gray-300 text-gray-900 hover:border-gray-500'"
              :aria-pressed="showAllActive"
              @click="selectAll"
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
              v-for="group in shopGroups"
              :key="group.id"
              type="button"
              class="w-full sm:shrink-0 sm:w-24 aspect-square rounded-xl border bg-white flex flex-col items-center justify-center px-1 transition-colors"
              :class="isSelected(group.id)
                ? 'border-gold-500 text-gold-600'
                : 'border-gray-300 text-gray-900 hover:border-gray-500'"
              :aria-pressed="isSelected(group.id)"
              @click="selectFilter(group.id)"
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

            <!-- Marcas -->
            <button
              type="button"
              class="w-full sm:shrink-0 sm:w-24 aspect-square rounded-xl border bg-white flex flex-col items-center justify-center px-1 transition-colors"
              :class="brandsTileActive
                ? 'border-gold-500 text-gold-600'
                : 'border-gray-300 text-gray-900 hover:border-gray-500'"
              :aria-pressed="brandsTileActive"
              @click="openBrandsMode"
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
        </div>
      </div>

      <!-- Brand selected bar -->
      <div
        v-if="selectedBrand"
        class="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-gray-950 px-4 py-3"
      >
        <p class="text-sm text-gray-300">
          <span class="text-gray-500">{{ es ? 'Marca' : 'Brand' }}:</span>
          <span class="font-black text-white uppercase ml-2">{{ selectedBrand }}</span>
        </p>
        <button
          type="button"
          class="text-xs font-bold text-gold-400 hover:text-gold-300"
          @click="clearBrand"
        >
          {{ es ? 'Cambiar marca' : 'Change brand' }}
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div v-for="i in 6" :key="i" class="rounded-2xl border border-white/10 overflow-hidden animate-pulse">
          <div class="aspect-[4/5] bg-gray-900" />
          <div class="p-4 space-y-2 bg-gray-950">
            <div class="h-4 bg-gray-800 rounded w-2/3" />
            <div class="h-3 bg-gray-800 rounded w-1/3" />
          </div>
        </div>
      </div>

      <!-- Brand logos (compact) -->
      <div v-else-if="showBrandPicker" class="space-y-4">
        <p class="text-center text-sm text-gray-400">
          {{ es ? 'Elige una marca para ver sus productos' : 'Pick a brand to see its products' }}
        </p>
        <div v-if="!brandCards.length" class="text-center py-16 border border-white/10 rounded-2xl">
          <p class="text-gray-400">
            {{ es ? 'Aún no hay marcas en el catálogo.' : 'No brands in the catalog yet.' }}
          </p>
        </div>
        <div v-else class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
          <button
            v-for="brand in brandCards"
            :key="brand.name"
            type="button"
            class="group text-left rounded-xl border border-white/10 bg-[#111] p-2.5 sm:p-3 transition-transform hover:-translate-y-0.5 hover:border-white/20"
            @click="selectBrand(brand.name)"
          >
            <div class="aspect-square rounded-lg bg-gray-900 flex items-center justify-center p-2 overflow-hidden">
              <img
                v-if="brand.image"
                :src="brand.image"
                :alt="brand.name"
                class="max-w-full max-h-full object-contain transition-transform duration-300 group-hover:scale-105"
              />
              <img
                v-else
                src="/niikskate-logo.png"
                alt=""
                class="w-8 h-8 sm:w-10 sm:h-10 object-contain opacity-50"
              />
            </div>
            <h3 class="mt-2 text-[10px] sm:text-xs font-black uppercase tracking-wide text-white text-center leading-tight truncate">
              {{ brand.name }}
            </h3>
            <p class="text-[9px] text-gray-500 text-center mt-0.5">
              {{ brand.count }} {{ es ? 'prod.' : 'items' }}
            </p>
          </button>
        </div>
      </div>

      <!-- Empty products -->
      <div
        v-else-if="filteredProducts.length === 0"
        class="text-center py-16 border border-white/10 rounded-2xl"
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
          class="mt-3 text-sm font-bold text-gold-400 underline underline-offset-4"
          @click="clearFilters"
        >
          {{ es ? 'Ver todos' : 'Show all' }}
        </button>
      </div>

      <!-- Products grid -->
      <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <article
          v-for="product in filteredProducts"
          :key="product.id"
          class="group rounded-2xl border border-white/10 bg-[#111] overflow-hidden flex flex-col"
        >
          <NuxtLink :to="`/shop/${product.id}`" class="relative aspect-square bg-gray-900 overflow-hidden block">
            <img
              v-if="productImageUrl(product)"
              :src="productImageUrl(product)!"
              :alt="product.name"
              class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center px-4"
            >
              <span class="text-sm font-semibold text-center text-gray-400 uppercase tracking-wide">{{ product.name }}</span>
            </div>
            <span
              v-if="product.stock_quantity === 0 && !product.is_service"
              class="absolute inset-0 bg-black/55 flex items-center justify-center text-sm font-bold"
            >
              {{ es ? 'Agotado' : 'Out of stock' }}
            </span>
          </NuxtLink>

          <div class="p-4 sm:p-5 flex flex-col flex-1">
            <h3 class="text-base sm:text-lg font-black uppercase tracking-wide text-white leading-snug mb-3">
              {{ product.name }}
            </h3>

            <p class="text-lg font-bold text-gold-400 mb-3">
              {{ product.requires_quote ? (es ? 'Cotizar' : 'Quote') : getProductPrice(product) }}
            </p>

            <!-- Collapsible details -->
            <button
              type="button"
              class="w-full flex items-center justify-between py-3 border-t border-white/10 text-left"
              :aria-expanded="isDetailsOpen(product.id)"
              @click="toggleDetails(product.id)"
            >
              <span class="text-sm font-medium text-white">{{ es ? 'Detalles' : 'Details' }}</span>
              <span class="text-lg text-white leading-none w-5 text-center">
                {{ isDetailsOpen(product.id) ? '−' : '+' }}
              </span>
            </button>
            <div
              v-show="isDetailsOpen(product.id)"
              class="pb-3 border-b border-white/10 text-sm text-gray-400 space-y-1"
            >
              <p v-if="product.brand">
                <span class="text-gray-500">{{ es ? 'Marca' : 'Brand' }}:</span> {{ product.brand }}
              </p>
              <p v-if="product.size">
                <span class="text-gray-500">{{ es ? 'Tamaño' : 'Size' }}:</span> {{ product.size }}
              </p>
              <p v-if="groupForProduct(product)">
                <span class="text-gray-500">{{ es ? 'Tipo' : 'Type' }}:</span>
                {{ es ? groupForProduct(product)?.title.es : groupForProduct(product)?.title.en }}
              </p>
              <p class="leading-relaxed">
                {{ product.description || (es ? 'Sin descripción adicional.' : 'No extra description.') }}
              </p>
            </div>

            <button
              v-if="product.requires_quote"
              type="button"
              class="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-black text-sm uppercase tracking-wide text-white transition-colors"
              style="background-color: #0d9488"
              @click="navigateTo(`/shop/${product.id}`)"
            >
              {{ es ? 'Pedir cotización' : 'Request quote' }}
            </button>
            <button
              v-else-if="product.stock_quantity > 0 || product.is_service"
              type="button"
              class="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl font-black text-sm uppercase tracking-wide text-white transition-opacity hover:opacity-90"
              :style="{ backgroundColor: justAddedId === product.id ? '#16a34a' : '#0d9488' }"
              @click="addToCart(product)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              {{
                justAddedId === product.id
                  ? (es ? 'Agregado' : 'Added')
                  : (es ? 'Agregar al carrito' : 'Add to cart')
              }}
            </button>
            <button
              v-else
              type="button"
              disabled
              class="mt-4 w-full px-4 py-3.5 rounded-xl bg-gray-800 text-gray-500 font-black text-sm uppercase cursor-not-allowed"
            >
              {{ es ? 'Agotado' : 'Out of stock' }}
            </button>
          </div>
        </article>
      </div>
    </div>

    <!-- Floating cart (bottom-right, Carry On style) -->
    <NuxtLink
      to="/cart"
      class="fixed bottom-5 right-5 z-50 inline-flex items-center gap-3 pl-4 pr-2 py-2.5 rounded-full shadow-2xl transition-transform hover:scale-[1.03] active:scale-95"
      style="background-color: #0d9488"
      :aria-label="es ? 'Ver carrito' : 'View cart'"
    >
      <svg class="w-5 h-5 text-white shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
      <span class="text-white text-sm font-black uppercase tracking-wide whitespace-nowrap">
        {{ cartLabel }}
      </span>
      <span class="w-7 h-7 rounded-full bg-black/80 text-white text-xs font-black flex items-center justify-center shrink-0">
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
</style>
