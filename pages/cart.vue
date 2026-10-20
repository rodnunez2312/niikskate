<script setup lang="ts">
import { productImageUrl } from '~/utils/shopCatalog'

definePageMeta({ layout: 'public' })

const router = useRouter()
const user = useSupabaseUser()
const cartStore = useCartStore()
const { t, formatPrice, language } = useI18n()

// Prices in the catalog are stored in MXN (admin Skateshop form).
const getItemPrice = (item: typeof cartStore.items[0]) => {
  const priceMXN = item.product.sale_price || item.product.price
  return formatPrice(priceMXN)
}

const getSubtotal = computed(() => formatPrice(cartStore.subtotal))

const getTax = computed(() => formatPrice(cartStore.tax))

const getTotal = computed(() => formatPrice(cartStore.total))

const updateQuantity = (productId: string, newQuantity: number) => {
  cartStore.updateQuantity(productId, newQuantity)
}

const removeItem = (productId: string) => {
  cartStore.removeItem(productId)
}

function goToShop() {
  return navigateTo('/skateshop')
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
</script>

<template>
  <div class="min-h-screen bg-cream text-charcoal pb-32">
    <div class="max-w-2xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12">
      <!-- Title row -->
      <div class="flex items-center gap-4 mb-8">
        <button
          type="button"
          class="w-10 h-10 rounded-full border border-charcoal/15 bg-white flex items-center justify-center hover:bg-charcoal hover:text-acid transition-colors"
          :aria-label="language === 'es' ? 'Regresar' : 'Go back'"
          @click="router.back()"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 class="font-display text-3xl sm:text-4xl font-black uppercase tracking-tight">{{ t('cart.title') }}</h1>
        <span class="ml-auto rounded-full bg-charcoal px-3 py-1 text-xs font-bold text-acid">
          {{ cartStore.totalItems }} {{ cartStore.totalItems === 1 ? t('cart.item') : t('cart.items') }}
        </span>
      </div>

      <!-- Empty cart -->
      <div v-if="cartStore.items.length === 0" class="rounded-3xl border border-charcoal/10 bg-white text-center px-6 py-14">
        <div class="w-20 h-20 mx-auto mb-5 rounded-full bg-cream flex items-center justify-center" aria-hidden="true">
          <svg class="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
          </svg>
        </div>
        <h2 class="font-display text-xl font-black uppercase mb-2">{{ t('cart.empty') }}</h2>
        <p class="text-charcoal/60 mb-7">
          {{ t('cart.addItems') }}
        </p>
        <button type="button" class="btn-lime px-8" @click="goToShop">
          {{ t('cart.shopNow') }}
        </button>
      </div>

      <!-- Cart items -->
      <div v-else>
        <ul class="space-y-3 mb-6">
          <li
            v-for="item in cartStore.items"
            :key="item.product.id"
            class="rounded-2xl border border-charcoal/10 bg-white p-4"
          >
            <div class="flex gap-4">
              <NuxtLink
                :to="`/shop/${item.product.id}`"
                class="w-24 h-24 rounded-xl bg-cream-50 border border-charcoal/5 flex-shrink-0 overflow-hidden flex items-center justify-center p-1"
              >
                <img
                  v-if="productImageUrl(item.product)"
                  :src="productImageUrl(item.product)!"
                  :alt="item.product.name"
                  class="max-w-full max-h-full object-contain"
                />
                <span v-else class="text-[10px] font-bold uppercase text-charcoal/40 text-center px-1">{{ item.product.name }}</span>
              </NuxtLink>

              <div class="flex-1 min-w-0">
                <p v-if="item.product.brand" class="text-[11px] font-bold uppercase tracking-[0.16em] text-sage-700">
                  {{ item.product.brand }}
                </p>
                <NuxtLink :to="`/shop/${item.product.id}`" class="hover:underline underline-offset-4">
                  <h3 class="font-bold leading-snug line-clamp-2">
                    {{ item.product.name }}
                  </h3>
                </NuxtLink>

                <div class="flex items-center justify-between gap-3 mt-3">
                  <span class="font-black">
                    {{ getItemPrice(item) }}
                  </span>

                  <div class="flex items-center gap-1.5 rounded-full border border-charcoal/15 p-0.5">
                    <button
                      type="button"
                      class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-cream"
                      :aria-label="language === 'es' ? 'Quitar uno' : 'Remove one'"
                      @click="updateQuantity(item.product.id, item.quantity - 1)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M20 12H4" />
                      </svg>
                    </button>
                    <span class="w-6 text-center text-sm font-bold" aria-live="polite">{{ item.quantity }}</span>
                    <button
                      type="button"
                      class="w-8 h-8 rounded-full flex items-center justify-center hover:bg-cream disabled:opacity-30"
                      :aria-label="language === 'es' ? 'Agregar uno' : 'Add one'"
                      :disabled="item.quantity >= item.product.stock_quantity && !item.product.is_service"
                      @click="updateQuantity(item.product.id, item.quantity + 1)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                      </svg>
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  class="text-xs font-semibold text-charcoal/50 mt-2 hover:text-red-600 hover:underline"
                  @click="removeItem(item.product.id)"
                >
                  {{ t('cart.remove') }}
                </button>
              </div>
            </div>
          </li>
        </ul>

        <!-- Order summary -->
        <section class="rounded-2xl bg-charcoal text-cream p-5 mb-5">
          <h2 class="t-eyebrow text-acid text-[11px] mb-4">{{ t('cart.orderSummary') }}</h2>

          <dl class="space-y-2 mb-4 text-sm">
            <div class="flex justify-between text-cream/70">
              <dt>{{ t('cart.subtotal') }}</dt>
              <dd>{{ getSubtotal }}</dd>
            </div>
            <div class="flex justify-between text-cream/70">
              <dt>{{ t('cart.tax') }} ({{ (cartStore.taxRate * 100).toFixed(0) }}%)</dt>
              <dd>{{ getTax }}</dd>
            </div>
            <div class="flex justify-between text-cream/70">
              <dt>{{ t('cart.shipping') }}</dt>
              <dd class="text-acid">{{ t('cart.free') }}</dd>
            </div>
          </dl>

          <div class="border-t border-cream/15 pt-4 flex justify-between text-lg font-black">
            <span>{{ t('cart.total') }}</span>
            <span>{{ getTotal }}</span>
          </div>
        </section>

        <div class="flex items-center justify-between gap-4">
          <NuxtLink to="/skateshop" class="text-sm font-semibold underline underline-offset-4 hover:text-sage-700">
            {{ language === 'es' ? '← Seguir comprando' : '← Keep shopping' }}
          </NuxtLink>
          <button
            type="button"
            class="text-sm text-charcoal/50 hover:text-red-600"
            @click="cartStore.clearCart()"
          >
            {{ t('cart.clearCart') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Checkout bar -->
    <div
      v-if="cartStore.items.length > 0"
      class="fixed bottom-0 left-0 right-0 z-40 p-4 bg-cream/95 backdrop-blur border-t border-charcoal/10"
    >
      <div class="max-w-2xl mx-auto">
        <button type="button" class="btn-lime w-full py-4 text-base uppercase tracking-wide" @click="checkout">
          {{ t('cart.checkout') }} · {{ getTotal }}
        </button>
      </div>
    </div>
  </div>
</template>
