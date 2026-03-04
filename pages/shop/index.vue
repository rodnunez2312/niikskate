<script setup lang="ts">
import type { ProductCategory } from '~/types'

const route = useRoute()
const { products, loading, fetchProducts } = useProducts()
const cartStore = useCartStore()
const { t, formatPrice, language } = useI18n()

const searchQuery = ref('')
const selectedCategory = ref<ProductCategory | undefined>(
  route.query.category as ProductCategory | undefined
)
const showFilters = ref(false)

// Category options with translations
const categories = computed(() => [
  { value: 'safety_equipment' as ProductCategory, icon: '🛡️', name: t('category.safety_equipment') },
  { value: 'skateboards' as ProductCategory, icon: '🛹', name: t('category.skateboards') },
  { value: 'hardware' as ProductCategory, icon: '🔧', name: t('category.hardware') },
  { value: 'merchandise' as ProductCategory, icon: '👕', name: t('category.merchandise') },
  { value: 'ramps' as ProductCategory, icon: '🏗️', name: t('category.ramps') },
])

// Load data
const loadData = async () => {
  await fetchProducts({
    category: selectedCategory.value,
    search: searchQuery.value || undefined,
    in_stock: selectedCategory.value !== 'ramps',
  })
}

onMounted(loadData)

// Watch for filter changes
let searchTimeout: ReturnType<typeof setTimeout>
watch(searchQuery, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(loadData, 300)
})

watch(selectedCategory, loadData)

watch(() => route.query.category, (newCategory) => {
  if (newCategory !== selectedCategory.value) {
    selectedCategory.value = newCategory as ProductCategory | undefined
  }
})

const clearFilters = () => {
  selectedCategory.value = undefined
  searchQuery.value = ''
}

// Convert USD prices to MXN (products in DB are in USD)
const getProductPrice = (product: typeof products.value[0]) => {
  const priceUSD = product.sale_price || product.price
  const priceMXN = priceUSD * 17.5 // Convert to MXN
  return formatPrice(priceMXN)
}

const addToCart = (product: typeof products.value[0]) => {
  if (product.requires_quote) {
    navigateTo(`/shop/${product.id}`)
    return
  }
  cartStore.addItem(product)
}

// Get category info
const getCategoryInfo = (category: ProductCategory) => {
  return categories.value.find(c => c.value === category)
}

// Group products by category
const groupedProducts = computed(() => {
  if (selectedCategory.value) {
    return { [selectedCategory.value]: products.value }
  }
  
  const grouped: Record<string, typeof products.value> = {}
  for (const product of products.value) {
    if (!grouped[product.category]) {
      grouped[product.category] = []
    }
    grouped[product.category].push(product)
  }
  return grouped
})
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <header class="bg-white border-b border-gray-100 sticky top-0 z-40 pt-safe">
      <div class="px-4 py-4 max-w-lg mx-auto">
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-bold text-gray-900">{{ t('shop.title') }}</h1>
          <div class="flex items-center gap-2">
            <button
              @click="showFilters = !showFilters"
              class="p-2 rounded-lg hover:bg-gray-100"
              :class="{ 'text-yellow-600': selectedCategory }"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
            </button>
            <NuxtLink to="/cart" class="p-2 rounded-lg hover:bg-gray-100 relative">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              <span
                v-if="cartStore.totalItems > 0"
                class="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 text-gray-900 text-xs rounded-full flex items-center justify-center font-bold"
              >
                {{ cartStore.totalItems }}
              </span>
            </NuxtLink>
          </div>
        </div>

        <!-- Search -->
        <div class="relative">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('shop.search')"
            class="input pl-10"
          />
        </div>
      </div>

      <!-- Category Tabs -->
      <div class="px-4 pb-3 overflow-x-auto">
        <div class="flex gap-2 max-w-lg mx-auto">
          <button
            @click="selectedCategory = undefined"
            class="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap"
            :class="[
              !selectedCategory
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            ]"
          >
            {{ t('shop.all') }}
          </button>
          <button
            v-for="cat in categories"
            :key="cat.value"
            @click="selectedCategory = cat.value"
            class="flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap"
            :class="[
              selectedCategory === cat.value
                ? 'bg-yellow-400 text-gray-900'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            ]"
          >
            {{ cat.icon }} {{ cat.name }}
          </button>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div class="px-4 py-6 max-w-lg mx-auto">
      <!-- Loading State -->
      <div v-if="loading" class="grid grid-cols-2 gap-4">
        <div v-for="i in 6" :key="i" class="card animate-pulse">
          <div class="aspect-square bg-gray-200"></div>
          <div class="p-3 space-y-2">
            <div class="h-4 bg-gray-200 rounded w-3/4"></div>
            <div class="h-3 bg-gray-200 rounded w-1/2"></div>
            <div class="h-4 bg-gray-200 rounded w-1/3"></div>
          </div>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else-if="products.length === 0" class="text-center py-12">
        <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center text-4xl">
          🛹
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ t('shop.noProducts') }}</h3>
        <p class="text-gray-500 mb-4">
          {{ t('shop.adjustFilters') }}
        </p>
        <button @click="clearFilters" class="btn-outline">
          {{ t('shop.clearFilters') }}
        </button>
      </div>

      <!-- Products by Category -->
      <div v-else class="space-y-8">
        <div v-for="(categoryProducts, category) in groupedProducts" :key="category">
          <!-- Category Header -->
          <div v-if="!selectedCategory" class="flex items-center gap-2 mb-3">
            <span class="text-xl">{{ getCategoryInfo(category as ProductCategory)?.icon }}</span>
            <h2 class="text-lg font-bold text-gray-900">
              {{ getCategoryInfo(category as ProductCategory)?.name }}
            </h2>
          </div>

          <!-- Products Grid -->
          <div class="grid grid-cols-2 gap-4">
            <NuxtLink
              v-for="product in categoryProducts"
              :key="product.id"
              :to="`/shop/${product.id}`"
              class="card-hover overflow-hidden group"
            >
              <div class="aspect-square bg-gray-100 relative overflow-hidden">
                <img
                  v-if="product.images?.[0]"
                  :src="product.images[0]"
                  :alt="product.name"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-4xl">
                  {{ getCategoryInfo(product.category)?.icon || '🛹' }}
                </div>
                
                <!-- Sale Badge -->
                <span v-if="product.sale_price" class="absolute top-2 left-2 badge bg-red-500 text-white text-xs">
                  {{ t('shop.sale') }}
                </span>
                
                <!-- Quote Badge for Ramps -->
                <span v-if="product.requires_quote" class="absolute top-2 left-2 badge bg-yellow-400 text-gray-900 text-xs">
                  {{ t('shop.quote') }}
                </span>
                
                <!-- Out of Stock -->
                <div
                  v-if="product.stock_quantity === 0 && !product.is_service"
                  class="absolute inset-0 bg-black/50 flex items-center justify-center"
                >
                  <span class="badge bg-gray-900 text-white">{{ t('shop.outOfStock') }}</span>
                </div>
                
                <!-- Quick Add Button -->
                <button
                  v-if="product.stock_quantity > 0 && !product.requires_quote"
                  @click.prevent="addToCart(product)"
                  class="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-yellow-400 text-gray-900 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                >
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </button>
              </div>
              
              <div class="p-3">
                <h3 class="font-medium text-gray-900 text-sm truncate">
                  {{ product.name }}
                </h3>
                <p class="text-xs text-gray-500 truncate">{{ product.brand }}</p>
                <div class="mt-2 flex items-center gap-2">
                  <span v-if="product.requires_quote" class="font-bold text-yellow-600 text-sm">
                    {{ t('shop.from') }} {{ getProductPrice(product) }}
                  </span>
                  <span v-else class="font-bold text-yellow-600">
                    {{ getProductPrice(product) }}
                  </span>
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
