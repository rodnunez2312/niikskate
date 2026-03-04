<script setup lang="ts">
const router = useRouter()
const user = useSupabaseUser()
const cartStore = useCartStore()
const { t, formatPrice, language } = useI18n()

// Convert USD prices to MXN for display
const getItemPrice = (item: typeof cartStore.items[0]) => {
  const priceUSD = item.product.sale_price || item.product.price
  const priceMXN = priceUSD * 17.5
  return formatPrice(priceMXN)
}

const getSubtotal = computed(() => {
  const subtotalMXN = cartStore.subtotal * 17.5
  return formatPrice(subtotalMXN)
})

const getTax = computed(() => {
  const taxMXN = cartStore.tax * 17.5
  return formatPrice(taxMXN)
})

const getTotal = computed(() => {
  const totalMXN = cartStore.total * 17.5
  return formatPrice(totalMXN)
})

const updateQuantity = (productId: string, newQuantity: number) => {
  cartStore.updateQuantity(productId, newQuantity)
}

const removeItem = (productId: string) => {
  cartStore.removeItem(productId)
}

const checkout = () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/cart')
    return
  }
  alert(language.value === 'es' 
    ? 'La función de pago estará disponible próximamente.' 
    : 'Checkout functionality will be available soon.')
}

const getCategoryIcon = (category: string) => {
  const icons: Record<string, string> = {
    safety_equipment: '🛡️',
    merchandise: '👕',
    skateboards: '🛹',
    hardware: '🔧',
    ramps: '🏗️',
  }
  return icons[category] || '🛹'
}
</script>

<template>
  <div class="page-container">
    <!-- Header -->
    <header class="bg-white border-b border-gray-100 sticky top-0 z-40 pt-safe">
      <div class="px-4 py-4 max-w-lg mx-auto">
        <div class="flex items-center gap-4">
          <button
            @click="router.back()"
            class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center"
          >
            <svg class="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 class="text-2xl font-bold text-gray-900">{{ t('cart.title') }}</h1>
          <span class="badge bg-yellow-400 text-gray-900 ml-auto font-bold">
            {{ cartStore.totalItems }} {{ cartStore.totalItems === 1 ? t('cart.item') : t('cart.items') }}
          </span>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div class="px-4 py-6 max-w-lg mx-auto">
      <!-- Empty Cart -->
      <div v-if="cartStore.items.length === 0" class="text-center py-12">
        <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center text-4xl">
          🛒
        </div>
        <h3 class="text-lg font-semibold text-gray-900 mb-2">{{ t('cart.empty') }}</h3>
        <p class="text-gray-500 mb-4">
          {{ t('cart.addItems') }}
        </p>
        <NuxtLink to="/shop" class="btn bg-yellow-400 text-gray-900 font-bold">
          {{ t('cart.shopNow') }}
        </NuxtLink>
      </div>

      <!-- Cart Items -->
      <div v-else>
        <div class="space-y-4 mb-6">
          <div
            v-for="item in cartStore.items"
            :key="item.product.id"
            class="card p-4"
          >
            <div class="flex gap-4">
              <!-- Product Image -->
              <NuxtLink :to="`/shop/${item.product.id}`" class="w-24 h-24 rounded-xl bg-gray-100 flex-shrink-0 overflow-hidden">
                <img
                  v-if="item.product.images?.[0]"
                  :src="item.product.images[0]"
                  :alt="item.product.name"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-3xl">
                  {{ getCategoryIcon(item.product.category) }}
                </div>
              </NuxtLink>

              <!-- Product Info -->
              <div class="flex-1 min-w-0">
                <NuxtLink :to="`/shop/${item.product.id}`">
                  <h3 class="font-semibold text-gray-900 truncate">
                    {{ item.product.name }}
                  </h3>
                </NuxtLink>
                <p class="text-sm text-gray-500">{{ item.product.brand }}</p>
                
                <div class="flex items-center justify-between mt-2">
                  <span class="font-bold text-yellow-600">
                    {{ getItemPrice(item) }}
                  </span>
                  
                  <!-- Quantity Controls -->
                  <div class="flex items-center gap-2">
                    <button
                      @click="updateQuantity(item.product.id, item.quantity - 1)"
                      class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                      </svg>
                    </button>
                    <span class="w-8 text-center font-medium">{{ item.quantity }}</span>
                    <button
                      @click="updateQuantity(item.product.id, item.quantity + 1)"
                      :disabled="item.quantity >= item.product.stock_quantity"
                      class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200 disabled:opacity-50"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </button>
                  </div>
                </div>

                <!-- Remove Button -->
                <button
                  @click="removeItem(item.product.id)"
                  class="text-sm text-red-500 mt-2 hover:underline"
                >
                  {{ t('cart.remove') }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Order Summary -->
        <div class="card p-4 mb-6">
          <h3 class="font-semibold text-gray-900 mb-4">{{ t('cart.orderSummary') }}</h3>
          
          <div class="space-y-2 mb-4">
            <div class="flex justify-between text-gray-600">
              <span>{{ t('cart.subtotal') }}</span>
              <span>{{ getSubtotal }}</span>
            </div>
            <div class="flex justify-between text-gray-600">
              <span>{{ t('cart.tax') }} ({{ (cartStore.taxRate * 100).toFixed(0) }}%)</span>
              <span>{{ getTax }}</span>
            </div>
            <div class="flex justify-between text-gray-600">
              <span>{{ t('cart.shipping') }}</span>
              <span class="text-green-600">{{ t('cart.free') }}</span>
            </div>
          </div>
          
          <div class="border-t border-gray-100 pt-4">
            <div class="flex justify-between text-lg font-bold">
              <span>{{ t('cart.total') }}</span>
              <span class="text-yellow-600">{{ getTotal }}</span>
            </div>
          </div>
        </div>

        <!-- Clear Cart -->
        <button
          @click="cartStore.clearCart()"
          class="text-sm text-gray-500 hover:text-red-500 mb-6"
        >
          {{ t('cart.clearCart') }}
        </button>
      </div>
    </div>

    <!-- Checkout Button -->
    <div v-if="cartStore.items.length > 0" class="fixed bottom-20 left-0 right-0 p-4 bg-white border-t border-gray-100">
      <div class="max-w-lg mx-auto">
        <button
          @click="checkout"
          class="btn bg-yellow-400 text-gray-900 font-bold w-full py-4 text-lg"
        >
          {{ t('cart.checkout') }} • {{ getTotal }}
        </button>
      </div>
    </div>
  </div>
</template>
