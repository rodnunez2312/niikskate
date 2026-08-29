<script setup lang="ts">
definePageMeta({ layout: 'public' })

import type { Product } from '~/types'
import { compareShopProducts, productImageUrl } from '~/utils/shopCatalog'

const { products, loading, fetchProducts } = useProducts()
const { language, formatPrice } = useI18n()
const client = useSupabaseClient()

const es = computed(() => language.value === 'es')

type RampProject = {
  id: string
  title: string
  slug: string | null
  description: string | null
  image_urls: string[] | null
  product_id: string | null
}

const rampProjects = ref<RampProject[]>([])
const projectsLoading = ref(true)

const rampProducts = computed(() =>
  [...products.value.filter(p => p.category === 'ramps' && p.is_active)].sort(compareShopProducts),
)

onMounted(async () => {
  await fetchProducts({ in_stock: false })
  projectsLoading.value = true
  try {
    const { data } = await client
      .from('skateramp_projects')
      .select('id, title, slug, description, image_urls, product_id')
      .eq('is_published', true)
      .order('updated_at', { ascending: false })
    rampProjects.value = (data || []) as RampProject[]
  } catch {
    rampProjects.value = []
  } finally {
    projectsLoading.value = false
  }
})

function projectImage(p: RampProject) {
  const urls = p.image_urls || []
  return urls[0] || null
}

function productForProject(p: RampProject): Product | undefined {
  if (!p.product_id) return undefined
  return rampProducts.value.find(pr => pr.id === p.product_id)
}

const featuredProjects = computed(() =>
  rampProjects.value.filter(p => !p.product_id || !productForProject(p)),
)
</script>

<template>
  <div class="min-h-screen bg-black text-white pb-28">
    <section class="relative border-b border-white/10 overflow-hidden">
      <div class="absolute inset-0">
        <img src="/Niik_StainedGlass.png" alt="" class="w-full h-full object-cover opacity-35" />
        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-black/50" />
      </div>
      <div class="relative max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <p class="text-gold-400 text-xs font-bold uppercase tracking-[0.2em] mb-2">NiikSkate</p>
        <h1 class="text-4xl sm:text-5xl font-black tracking-tight mb-3">
          Skateramps
        </h1>
        <p class="text-gray-300 text-sm sm:text-base max-w-2xl">
          {{
            es
              ? 'Rampas modulares y a medida para patio, escuela o skatepark. Cotiza tu proyecto o elige un modelo listo.'
              : 'Modular and custom ramps for backyards, schools, or skateparks. Request a quote or browse ready models.'
          }}
        </p>
        <div class="mt-6 flex flex-wrap gap-3">
          <NuxtLink
            to="/skateshop?cat=skate_equip"
            class="px-4 py-2 rounded-full border border-white/20 text-sm font-semibold hover:border-gold-400"
          >
            ← {{ es ? 'Volver al skateshop' : 'Back to skateshop' }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-12">
      <section v-if="loading || projectsLoading" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div v-for="i in 3" :key="i" class="aspect-[4/5] rounded-2xl bg-gray-900 animate-pulse" />
      </section>

      <section v-else class="space-y-8">
        <div v-if="rampProducts.length">
          <h2 class="text-xl font-black uppercase mb-4">
            {{ es ? 'Modelos en tienda' : 'Shop models' }}
          </h2>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <article
              v-for="product in rampProducts"
              :key="product.id"
              class="rounded-2xl border-2 border-white/10 bg-gray-950 overflow-hidden hover:border-gold-500/50 transition-colors"
            >
              <NuxtLink :to="`/shop/${product.id}`" class="block">
                <div class="aspect-[4/5] bg-gray-900 relative">
                  <img
                    v-if="productImageUrl(product)"
                    :src="productImageUrl(product)!"
                    :alt="product.name"
                    class="w-full h-full object-cover"
                  />
                  <div v-else class="w-full h-full flex items-center justify-center text-5xl">🏗️</div>
                </div>
                <div class="p-4">
                  <h3 class="font-black uppercase text-sm">{{ product.name }}</h3>
                  <p class="text-gold-400 text-sm mt-1">
                    {{ product.requires_quote
                      ? (es ? 'Cotización' : 'Quote')
                      : formatPrice(product.sale_price || product.price) }}
                  </p>
                </div>
              </NuxtLink>
            </article>
          </div>
        </div>

        <div v-if="featuredProjects.length">
          <h2 class="text-xl font-black uppercase mb-4">
            {{ es ? 'Proyectos Niik' : 'Niik projects' }}
          </h2>
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <article
              v-for="proj in featuredProjects"
              :key="proj.id"
              class="rounded-2xl border-2 border-cyan-500/30 bg-gray-950 overflow-hidden"
            >
              <div class="aspect-[4/5] bg-gray-900 relative">
                <img
                  v-if="projectImage(proj)"
                  :src="projectImage(proj)!"
                  :alt="proj.title"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center text-5xl">🛹</div>
              </div>
              <div class="p-4">
                <h3 class="font-black uppercase text-sm">{{ proj.title }}</h3>
                <p v-if="proj.description" class="text-gray-400 text-xs mt-2 line-clamp-3">{{ proj.description }}</p>
              </div>
            </article>
          </div>
        </div>

        <div
          v-if="!rampProducts.length && !featuredProjects.length"
          class="text-center py-16 border border-dashed border-gray-700 rounded-2xl"
        >
          <p class="text-gray-400 font-mono text-sm">
            {{ es ? 'Pronto publicaremos rampas. Mientras tanto, cuéntanos tu idea.' : 'Ramps coming soon. Tell us about your project meanwhile.' }}
          </p>
        </div>
      </section>

      <section class="rounded-2xl border-2 border-gold-500/40 bg-gradient-to-br from-gray-950 to-black p-8 text-center">
        <h2 class="text-2xl font-black uppercase mb-2">
          {{ es ? '¿Rampa a tu medida?' : 'Custom ramp?' }}
        </h2>
        <p class="text-gray-400 text-sm max-w-lg mx-auto mb-6">
          {{
            es
              ? 'Describe tu espacio, nivel y presupuesto. Te contactamos con diseño y cotización.'
              : 'Describe your space, skill level, and budget. We will follow up with design and pricing.'
          }}
        </p>
        <NuxtLink
          to="/community"
          class="inline-flex px-6 py-3 rounded-xl font-black uppercase text-sm bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400 text-black"
        >
          {{ es ? 'Contactar' : 'Contact us' }}
        </NuxtLink>
      </section>
    </div>
  </div>
</template>
