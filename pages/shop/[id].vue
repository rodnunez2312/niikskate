<script setup lang="ts">
import type { Product } from '~/types'
import { CATEGORY_LABELS } from '~/types'

const route = useRoute()
const router = useRouter()
const { fetchProductById } = useProducts()
const cartStore = useCartStore()

const productId = route.params.id as string
const product = ref<Product | null>(null)
const loading = ref(true)
const quantity = ref(1)
const selectedImage = ref(0)
const addedToCart = ref(false)

// Ramp quote form
const showQuoteForm = ref(false)
const quoteForm = ref({
  name: '',
  email: '',
  phone: '',
  description: '',
  location: '',
})
const submittingQuote = ref(false)

onMounted(async () => {
  try {
    product.value = await fetchProductById(productId)
  } finally {
    loading.value = false
  }
})

const formatPrice = (price: number) => `$${price.toFixed(2)}`

const incrementQuantity = () => {
  if (product.value && quantity.value < product.value.stock_quantity) {
    quantity.value++
  }
}

const decrementQuantity = () => {
  if (quantity.value > 1) {
    quantity.value--
  }
}

const addToCart = () => {
  if (product.value) {
    cartStore.addItem(product.value, quantity.value)
    addedToCart.value = true
    setTimeout(() => {
      addedToCart.value = false
    }, 2000)
  }
}

const buyNow = () => {
  if (product.value) {
    cartStore.addItem(product.value, quantity.value)
    router.push('/cart')
  }
}

const submitQuoteRequest = async () => {
  if (!product.value) return
  
  submittingQuote.value = true
  
  try {
    const client = useSupabaseClient()
    const user = useSupabaseUser()
    
    const { error } = await client
      .from('ramp_quotes')
      .insert({
        customer_id: user.value?.id,
        customer_name: quoteForm.value.name,
        customer_email: quoteForm.value.email,
        customer_phone: quoteForm.value.phone,
        ramp_type: product.value.name,
        description: quoteForm.value.description,
        location: quoteForm.value.location,
        status: 'pending',
      })
    
    if (error) throw error
    
    alert('Quote request submitted! We\'ll contact you soon.')
    showQuoteForm.value = false
    quoteForm.value = { name: '', email: '', phone: '', description: '', location: '' }
  } catch (e) {
    alert('Failed to submit quote request. Please try again.')
  } finally {
    submittingQuote.value = false
  }
}

const discount = computed(() => {
  if (product.value?.sale_price) {
    return Math.round((1 - product.value.sale_price / product.value.price) * 100)
  }
  return 0
})
</script>

<template>
  <div class="page-container bg-white">
    <!-- Header -->
    <header class="fixed top-0 left-0 right-0 z-50 pt-safe">
      <div class="px-4 py-4 flex items-center justify-between">
        <button
          @click="router.back()"
          class="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center"
        >
          <svg class="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <NuxtLink
          to="/cart"
          class="w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm shadow-lg flex items-center justify-center relative"
        >
          <svg class="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    </header>

    <!-- Loading State -->
    <div v-if="loading" class="animate-pulse">
      <div class="aspect-square bg-gray-200"></div>
      <div class="p-4 space-y-4">
        <div class="h-8 bg-gray-200 rounded w-3/4"></div>
        <div class="h-4 bg-gray-200 rounded w-1/2"></div>
        <div class="h-20 bg-gray-200 rounded"></div>
      </div>
    </div>

    <!-- Product Not Found -->
    <div v-else-if="!product" class="flex flex-col items-center justify-center min-h-screen p-4">
      <div class="text-6xl mb-4">😕</div>
      <h2 class="text-xl font-bold text-gray-900 mb-2">Product not found</h2>
      <p class="text-gray-500 mb-4">This product may have been removed.</p>
      <NuxtLink to="/shop" class="btn bg-yellow-400 text-gray-900 font-bold">
        Browse Products
      </NuxtLink>
    </div>

    <!-- Product Details -->
    <div v-else>
      <!-- Image Gallery -->
      <div class="relative">
        <div class="aspect-square bg-gray-100">
          <img
            v-if="product.images?.[selectedImage]"
            :src="product.images[selectedImage]"
            :alt="product.name"
            class="w-full h-full object-cover"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-8xl">
            {{ CATEGORY_LABELS[product.category]?.icon || '🛹' }}
          </div>
        </div>

        <!-- Sale Badge -->
        <span v-if="product.sale_price" class="absolute top-20 left-4 badge bg-red-500 text-white text-sm px-3 py-1">
          {{ discount }}% OFF
        </span>

        <!-- Image Thumbnails -->
        <div v-if="product.images && product.images.length > 1" class="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
          <button
            v-for="(img, index) in product.images"
            :key="index"
            @click="selectedImage = index"
            class="w-14 h-14 rounded-lg overflow-hidden border-2 transition-all"
            :class="[
              selectedImage === index ? 'border-yellow-400' : 'border-white'
            ]"
          >
            <img :src="img" :alt="`${product.name} ${index + 1}`" class="w-full h-full object-cover" />
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="px-4 py-6">
        <!-- Category & Brand -->
        <div class="flex items-center gap-2 mb-2">
          <span class="badge bg-gray-100 text-gray-700">
            {{ CATEGORY_LABELS[product.category]?.icon }} {{ CATEGORY_LABELS[product.category]?.name }}
          </span>
          <span v-if="product.brand" class="text-sm text-yellow-600 font-medium">
            {{ product.brand }}
          </span>
        </div>

        <!-- Title -->
        <h1 class="text-2xl font-bold text-gray-900 mb-2">{{ product.name }}</h1>

        <!-- Price -->
        <div class="flex items-center gap-3 mb-4">
          <span v-if="product.requires_quote" class="text-2xl font-bold text-yellow-600">
            From {{ formatPrice(product.price) }}
          </span>
          <template v-else>
            <span class="text-3xl font-bold text-yellow-600">
              {{ formatPrice(product.sale_price || product.price) }}
            </span>
            <span v-if="product.sale_price" class="text-xl text-gray-400 line-through">
              {{ formatPrice(product.price) }}
            </span>
          </template>
        </div>

        <!-- Stock Status (for non-services) -->
        <div v-if="!product.is_service" class="flex items-center gap-2 mb-6">
          <span
            class="badge"
            :class="[
              product.stock_quantity > 10
                ? 'bg-green-100 text-green-800'
                : product.stock_quantity > 0
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
            ]"
          >
            {{ product.stock_quantity > 10 ? 'In Stock' : product.stock_quantity > 0 ? `Only ${product.stock_quantity} left` : 'Out of Stock' }}
          </span>
          <span class="text-xs text-gray-400">SKU: {{ product.sku }}</span>
        </div>

        <!-- Description -->
        <div class="mb-6">
          <h3 class="font-semibold text-gray-900 mb-2">Description</h3>
          <p class="text-gray-600 leading-relaxed">{{ product.description }}</p>
        </div>

        <!-- Specifications -->
        <div v-if="product.specifications && Object.keys(product.specifications).length > 0" class="mb-6">
          <h3 class="font-semibold text-gray-900 mb-2">Specifications</h3>
          <div class="space-y-2">
            <div
              v-for="(value, key) in product.specifications"
              :key="key"
              class="flex justify-between py-2 border-b border-gray-100"
            >
              <span class="text-gray-500 capitalize">{{ String(key).replace('_', ' ') }}</span>
              <span class="text-gray-900 font-medium">{{ value }}</span>
            </div>
          </div>
        </div>

        <!-- Quantity Selector (for purchasable items) -->
        <div v-if="product.stock_quantity > 0 && !product.requires_quote" class="mb-6">
          <label class="label">Quantity</label>
          <div class="flex items-center gap-4">
            <button
              @click="decrementQuantity"
              class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              :disabled="quantity <= 1"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
              </svg>
            </button>
            <span class="text-xl font-semibold w-12 text-center">{{ quantity }}</span>
            <button
              @click="incrementQuantity"
              class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
              :disabled="quantity >= product.stock_quantity"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Ramp Quote Info -->
        <div v-if="product.requires_quote" class="mb-6 p-4 bg-yellow-50 rounded-xl border border-yellow-200">
          <h3 class="font-semibold text-gray-900 mb-2">🏗️ Custom Build Service</h3>
          <p class="text-sm text-gray-600 mb-3">
            This is a custom build service. Price varies based on your specific requirements, 
            dimensions, and location. Request a free quote to get started!
          </p>
          <ul class="text-sm text-gray-600 space-y-1">
            <li>✓ Professional construction</li>
            <li>✓ Custom dimensions available</li>
            <li>✓ Delivery & installation included</li>
            <li>✓ Quality materials</li>
          </ul>
        </div>
      </div>

      <!-- Bottom Actions -->
      <div v-if="!product.requires_quote && product.stock_quantity > 0" class="fixed bottom-20 left-0 right-0 p-4 bg-white border-t border-gray-100">
        <div class="max-w-lg mx-auto flex gap-3">
          <button
            @click="addToCart"
            class="btn-outline flex-1 py-4 border-2 border-gray-900"
          >
            {{ addedToCart ? '✓ Added!' : 'Add to Cart' }}
          </button>
          <button
            @click="buyNow"
            class="btn bg-yellow-400 text-gray-900 font-bold flex-1 py-4"
          >
            Buy Now
          </button>
        </div>
      </div>

      <!-- Quote Request Button -->
      <div v-else-if="product.requires_quote" class="fixed bottom-20 left-0 right-0 p-4 bg-white border-t border-gray-100">
        <div class="max-w-lg mx-auto">
          <button
            @click="showQuoteForm = true"
            class="btn bg-yellow-400 text-gray-900 font-bold w-full py-4"
          >
            Request a Quote
          </button>
        </div>
      </div>

      <!-- Out of Stock Message -->
      <div v-else class="fixed bottom-20 left-0 right-0 p-4 bg-white border-t border-gray-100">
        <div class="max-w-lg mx-auto">
          <button disabled class="btn w-full py-4 bg-gray-300 text-gray-500 cursor-not-allowed">
            Out of Stock
          </button>
        </div>
      </div>

      <!-- Quote Request Modal -->
      <Teleport to="body">
        <Transition
          enter-active-class="transition-all duration-200"
          enter-from-class="opacity-0"
          enter-to-class="opacity-100"
          leave-active-class="transition-all duration-150"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0"
        >
          <div
            v-if="showQuoteForm"
            class="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
            @click.self="showQuoteForm = false"
          >
            <div class="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-safe max-h-[90vh] overflow-y-auto">
              <div class="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6"></div>
              
              <h3 class="text-xl font-bold text-gray-900 mb-2">Request a Quote</h3>
              <p class="text-gray-500 text-sm mb-4">
                Tell us about your project and we'll get back to you with a custom quote.
              </p>

              <form @submit.prevent="submitQuoteRequest" class="space-y-4">
                <div>
                  <label class="label">Your Name *</label>
                  <input
                    v-model="quoteForm.name"
                    type="text"
                    required
                    class="input"
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <label class="label">Email *</label>
                  <input
                    v-model="quoteForm.email"
                    type="email"
                    required
                    class="input"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label class="label">Phone</label>
                  <input
                    v-model="quoteForm.phone"
                    type="tel"
                    class="input"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label class="label">Project Description *</label>
                  <textarea
                    v-model="quoteForm.description"
                    required
                    rows="3"
                    class="input"
                    placeholder="Describe your project, dimensions, materials preference..."
                  ></textarea>
                </div>

                <div>
                  <label class="label">Installation Location</label>
                  <input
                    v-model="quoteForm.location"
                    type="text"
                    class="input"
                    placeholder="City, State or Address"
                  />
                </div>

                <div class="flex gap-3 pt-2">
                  <button
                    type="button"
                    @click="showQuoteForm = false"
                    class="btn-ghost flex-1 py-3"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    :disabled="submittingQuote"
                    class="btn bg-yellow-400 text-gray-900 font-bold flex-1 py-3"
                  >
                    {{ submittingQuote ? 'Submitting...' : 'Submit Request' }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </div>
</template>
