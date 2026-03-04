<script setup lang="ts">
import type { Product } from '~/types'

const user = useSupabaseUser()
const { fetchCoaches, coaches } = useClasses()
const { fetchFeaturedProducts } = useProducts()
const { t, formatPrice, language, currency } = useI18n()

// Fixed prices for home page display
const prices = computed(() => ({
  monthlyBeginner: { mxn: 600, usd: 35 },
  monthlyIntermediate: { mxn: 800, usd: 50 },
  groupClass: { mxn: 130, usd: 10 },
  individualClass: { mxn: 250, usd: 20 },
}))

// Helper to format price based on currency
const displayPrice = (priceObj: { mxn: number, usd: number }) => {
  return currency.value === 'USD' 
    ? `$${priceObj.usd} USD` 
    : `$${priceObj.mxn} MXN`
}

const featuredProducts = ref<Product[]>([])
const loading = ref(true)

onMounted(async () => {
  try {
    await fetchCoaches()
    featuredProducts.value = await fetchFeaturedProducts(4)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page-container min-h-screen relative">
    <!-- Skateboard Background - Centered -->
    <div class="fixed inset-0 z-0 pointer-events-none flex items-center justify-center bg-black">
      <img 
        src="/Niik_StainedGlass.png" 
        alt=""
        class="h-screen w-auto object-contain"
      />
    </div>

    <!-- Hero Header -->
    <header class="relative overflow-hidden px-4 pt-safe pb-4 z-10">
      <div class="max-w-lg mx-auto relative z-10">
        <!-- Top Bar -->
        <div class="flex items-center justify-between mb-4 pt-4">
          <LanguageCurrencyToggle />
          <NuxtLink
            :to="user ? '/profile' : '/auth/login'"
            class="w-10 h-10 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm border border-gold-400/30"
          >
            <svg class="w-5 h-5 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </NuxtLink>
        </div>

        <!-- Brand Banner -->
        <div class="text-center mb-4 bg-black/70 backdrop-blur-sm rounded-2xl py-4 px-4 border border-gold-400/30">
          <h1 class="text-2xl font-black tracking-tight text-white mb-1">
            <span class="text-gold-400">Niik</span><span class="text-white">Skate</span>
          </h1>
          <p class="text-gray-300 text-sm">
            {{ language === 'es' ? 'Academia de Skateboarding' : 'Skateboard Academy' }}
          </p>
          <p class="text-gold-400 text-xs mt-1 font-semibold">
            {{ language === 'es' ? 'Ahora en La Plancha, Yucatán' : 'Now in La Plancha, Yucatan' }}
          </p>
        </div>

        <!-- Main CTA - Book a Class -->
        <NuxtLink
          to="/book"
          class="block bg-gradient-to-r from-gold-400 to-gold-500 text-black rounded-2xl p-5 shadow-2xl shadow-gold-400/20 mb-3 border border-gold-300/50"
        >
          <div class="flex items-center gap-4">
            <div class="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center text-2xl">
              🛹
            </div>
            <div class="flex-1">
              <p class="text-lg font-bold">
                {{ language === 'es' ? 'Reservar Clase' : 'Book a Class' }}
              </p>
              <p class="text-black/70 text-sm">
                {{ language === 'es' ? 'Individual o paquetes' : 'Single or packages' }}
              </p>
            </div>
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </NuxtLink>

        <!-- Secondary CTA - Shop -->
        <NuxtLink
          to="/shop"
          class="block bg-black/60 backdrop-blur-sm rounded-xl p-4 border border-white/20"
        >
          <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-lg bg-glass-purple/30 flex items-center justify-center text-xl">
              🛒
            </div>
            <div class="flex-1">
              <p class="font-semibold text-white">{{ language === 'es' ? 'Tienda' : 'Shop' }}</p>
              <p class="text-sm text-gray-400">
                {{ language === 'es' ? 'Equipo y accesorios' : 'Gear & accessories' }}
              </p>
            </div>
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </NuxtLink>
      </div>
    </header>

    <!-- Content -->
    <div class="px-4 max-w-lg mx-auto pb-24 relative z-10">
      
      <!-- Class Schedules Section -->
      <section class="mb-6">
        <h2 class="text-lg font-bold text-white mb-3 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1 inline-block">
          {{ language === 'es' ? 'Horarios de Clases' : 'Class Schedules' }}
        </h2>
        
        <div class="space-y-3">
          <!-- Grouped Classes Schedule -->
          <div class="bg-black/70 backdrop-blur-sm rounded-2xl p-4 border border-glass-blue/40">
            <div class="flex items-start gap-3">
              <span class="text-2xl">👥</span>
              <div class="flex-1">
                <p class="font-bold text-white">{{ language === 'es' ? 'Clases Grupales' : 'Group Classes' }}</p>
                <div class="mt-2 space-y-1">
                  <div class="flex items-center gap-2 text-sm">
                    <span class="text-glass-blue">📅</span>
                    <span class="text-gray-200">{{ language === 'es' ? 'Martes, Jueves, Sábado' : 'Tuesday, Thursday, Saturday' }}</span>
                  </div>
                  <div class="flex items-center gap-2 text-sm">
                    <span class="text-glass-purple">🕐</span>
                    <span class="text-gray-200">5:30 PM - 7:00 PM</span>
                  </div>
                  <div class="flex items-center gap-2 text-sm">
                    <span class="text-glass-purple">🕖</span>
                    <span class="text-gray-200">7:00 PM - 8:30 PM</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Individual Classes Schedule -->
          <div class="bg-black/70 backdrop-blur-sm rounded-2xl p-4 border border-flame-600/40">
            <div class="flex items-start gap-3">
              <span class="text-2xl">🎯</span>
              <div class="flex-1">
                <p class="font-bold text-white">{{ language === 'es' ? 'Clases Individuales' : 'Individual Classes' }}</p>
                <div class="mt-2 space-y-1">
                  <div class="flex items-center gap-2 text-sm">
                    <span class="text-flame-600">📅</span>
                    <span class="text-gray-200">{{ language === 'es' ? 'Martes, Jueves, Sábado' : 'Tuesday, Thursday, Saturday' }}</span>
                  </div>
                  <div class="flex items-center gap-2 text-sm">
                    <span class="text-glass-orange">🕐</span>
                    <span class="text-gray-200">5:30 PM - 7:00 PM</span>
                  </div>
                  <div class="flex items-center gap-2 text-sm">
                    <span class="text-glass-orange">🕖</span>
                    <span class="text-gray-200">7:00 PM - 8:30 PM</span>
                  </div>
                  <div class="flex items-center gap-2 text-sm text-gray-300 mt-1">
                    <span>💡</span>
                    <span class="italic">{{ language === 'es' ? 'Otros horarios disponibles bajo consulta' : 'Other times available on request' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Pricing Section -->
      <section class="mb-8">
        <h2 class="text-lg font-bold text-white mb-3 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1 inline-block">
          {{ language === 'es' ? 'Precios y Programas' : 'Pricing & Programs' }}
        </h2>
        
        <div class="grid grid-cols-2 gap-3">
          <!-- Monthly Program - Beginners -->
          <NuxtLink 
            to="/book?class=monthly_beginner" 
            class="bg-black/70 backdrop-blur-sm rounded-2xl p-4 border border-gold-400/40 hover:border-gold-400 transition-all active:scale-95"
          >
            <p class="text-2xl mb-1">🏆</p>
            <p class="font-bold text-white text-sm">{{ language === 'es' ? 'Principiantes' : 'Beginners' }}</p>
            <p class="text-gold-400 font-bold text-lg">{{ displayPrice(prices.monthlyBeginner) }}</p>
            <p class="text-xs text-gray-300">{{ language === 'es' ? '8 clases grupales' : '8 group classes' }}</p>
            <p class="text-xs text-gray-400 mt-1">{{ language === 'es' ? 'Programa mensual' : 'Monthly program' }}</p>
          </NuxtLink>

          <!-- Monthly Program - Intermediate -->
          <NuxtLink 
            to="/book?class=monthly_intermediate" 
            class="bg-black/70 backdrop-blur-sm rounded-2xl p-4 border border-glass-purple/40 hover:border-glass-purple transition-all active:scale-95"
          >
            <p class="text-2xl mb-1">⭐</p>
            <p class="font-bold text-white text-sm">{{ language === 'es' ? 'Intermedios' : 'Intermediate' }}</p>
            <p class="text-gold-400 font-bold text-lg">{{ displayPrice(prices.monthlyIntermediate) }}</p>
            <p class="text-xs text-gray-300">{{ language === 'es' ? '8 clases grupales' : '8 group classes' }}</p>
            <p class="text-xs text-gray-400 mt-1">{{ language === 'es' ? 'Programa mensual' : 'Monthly program' }}</p>
          </NuxtLink>

          <!-- Single Group Class -->
          <NuxtLink 
            to="/book?class=grouped" 
            class="bg-black/70 backdrop-blur-sm rounded-2xl p-4 border border-glass-green/40 hover:border-glass-green transition-all active:scale-95"
          >
            <p class="text-2xl mb-1">👥</p>
            <p class="font-bold text-white text-sm">{{ language === 'es' ? 'Clase Grupal' : 'Group Class' }}</p>
            <p class="text-gold-400 font-bold text-lg">{{ displayPrice(prices.groupClass) }}</p>
            <p class="text-xs text-gray-300">{{ language === 'es' ? 'por clase' : 'per class' }}</p>
          </NuxtLink>

          <!-- Individual Class -->
          <NuxtLink 
            to="/book?class=individual" 
            class="bg-black/70 backdrop-blur-sm rounded-2xl p-4 border border-flame-600/40 hover:border-flame-600 transition-all active:scale-95"
          >
            <p class="text-2xl mb-1">🎯</p>
            <p class="font-bold text-white text-sm">{{ language === 'es' ? 'Clase Individual' : 'Individual Class' }}</p>
            <p class="text-gold-400 font-bold text-lg">{{ displayPrice(prices.individualClass) }}</p>
            <p class="text-xs text-gray-300">{{ language === 'es' ? 'por clase' : 'per class' }}</p>
          </NuxtLink>
        </div>

        <!-- Intermediate Program Details -->
        <div class="mt-4 bg-black/70 backdrop-blur-sm rounded-2xl p-4 border border-glass-purple/40">
          <div class="flex items-start gap-3">
            <span class="text-2xl">⭐</span>
            <div>
              <p class="font-bold text-white text-sm mb-1">
                {{ language === 'es' ? 'Programa Intermedios' : 'Intermediate Program' }}
              </p>
              <p class="text-xs text-gray-300 leading-relaxed">
                {{ language === 'es' 
                  ? 'Entrenamiento de fuerza y técnicas avanzadas en bowl, street y surf skate.'
                  : 'Strength training and advanced techniques in bowl, street, and surf skate.'
                }}
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Our Coaches -->
      <section class="mb-8">
        <h2 class="text-lg font-bold text-white mb-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1 inline-block">
          {{ language === 'es' ? 'Nuestros Coaches' : 'Our Coaches' }}
        </h2>

        <div v-if="loading" class="flex gap-4 overflow-x-auto pb-2">
          <div v-for="i in 3" :key="i" class="flex-shrink-0 w-28 animate-pulse">
            <div class="w-20 h-20 mx-auto rounded-full bg-gray-800 mb-2"></div>
            <div class="h-3 bg-gray-800 rounded w-16 mx-auto"></div>
          </div>
        </div>

        <div v-else class="grid grid-cols-3 gap-3 bg-black/60 backdrop-blur-sm rounded-2xl p-4">
          <!-- Coach Rod -->
          <div class="text-center">
            <div class="relative mx-auto w-16 h-16 mb-2">
              <div class="w-full h-full rounded-full bg-gradient-to-br from-flame-600 to-glass-orange flex items-center justify-center ring-2 ring-gold-400 shadow-lg">
                <span class="text-2xl">🧑‍🏫</span>
              </div>
            </div>
            <p class="font-bold text-white text-sm">Rod</p>
            <p class="text-xs text-gray-300">Vert & Street</p>
          </div>

          <!-- Coach Leo -->
          <div class="text-center">
            <div class="relative mx-auto w-16 h-16 mb-2">
              <div class="w-full h-full rounded-full bg-gradient-to-br from-glass-blue to-glass-purple flex items-center justify-center ring-2 ring-gold-400 shadow-lg">
                <span class="text-2xl">👨‍🏫</span>
              </div>
            </div>
            <p class="font-bold text-white text-sm">Leo</p>
            <p class="text-xs text-gray-300">Vert & Street</p>
          </div>

          <!-- Coach Itza -->
          <div class="text-center">
            <div class="relative mx-auto w-16 h-16 mb-2">
              <div class="w-full h-full rounded-full bg-gradient-to-br from-glass-green to-glass-blue flex items-center justify-center ring-2 ring-gold-400 shadow-lg">
                <span class="text-2xl">👩‍🏫</span>
              </div>
            </div>
            <p class="font-bold text-white text-sm">Itza</p>
            <p class="text-xs text-gray-300">{{ language === 'es' ? 'Fundamentos' : 'Fundamentals' }}</p>
          </div>
        </div>
      </section>

      <!-- Featured Products -->
      <section class="mb-8" v-if="featuredProducts.length > 0">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-bold text-white bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1">
            {{ language === 'es' ? 'Productos' : 'Products' }}
          </h2>
          <NuxtLink to="/shop" class="text-gold-400 text-sm font-medium bg-black/50 backdrop-blur-sm rounded-lg px-3 py-1">
            {{ language === 'es' ? 'Ver todo' : 'See all' }}
          </NuxtLink>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <NuxtLink
            v-for="product in featuredProducts.slice(0, 4)"
            :key="product.id"
            :to="`/shop/${product.id}`"
            class="bg-black/70 backdrop-blur-sm rounded-2xl overflow-hidden border border-gray-700"
          >
            <div class="aspect-square bg-gray-800/50 relative">
              <img
                v-if="product.images?.[0]"
                :src="product.images[0]"
                :alt="product.name"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-4xl bg-gradient-to-br from-glass-green/30 to-glass-blue/30">
                🛹
              </div>
            </div>
            <div class="p-3">
              <h3 class="font-medium text-white text-sm truncate">{{ product.name }}</h3>
              <p class="font-bold text-gold-400">
                {{ formatPrice((product.sale_price || product.price) * 17.5) }}
              </p>
            </div>
          </NuxtLink>
        </div>
      </section>

      <!-- Custom Ramps CTA -->
      <section class="mb-8">
        <NuxtLink 
          to="/shop?category=ramps" 
          class="block bg-black/70 backdrop-blur-sm rounded-2xl p-5 border border-flame-600/50"
        >
          <div class="flex items-center gap-4">
            <span class="text-4xl">🏗️</span>
            <div class="flex-1">
              <p class="font-bold text-white text-lg">
                {{ language === 'es' ? 'Rampas Personalizadas' : 'Custom Ramps' }}
              </p>
              <p class="text-sm text-gray-300">
                {{ language === 'es' ? '¡Cotiza gratis!' : 'Get a free quote!' }}
              </p>
            </div>
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </NuxtLink>
      </section>

    </div>
  </div>
</template>
