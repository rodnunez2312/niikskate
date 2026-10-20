<script setup lang="ts">
definePageMeta({ layout: 'public' })

const client = useSupabaseClient()
const { language } = useI18n()

type Spot = {
  id: string
  name: string
  city: string | null
  region: string | null
  country: string | null
}

const spots = ref<Spot[]>([])
const loading = ref(true)
const loadError = ref('')

onMounted(async () => {
  const { data, error } = await client
    .from('skate_spots')
    .select('id, name, city, region, country')
    .order('name')
  loading.value = false
  if (error) {
    loadError.value = /schema cache|does not exist/i.test(error.message)
      ? ''
      : error.message
    return
  }
  spots.value = (data || []) as Spot[]
})

function placeLine(spot: Spot) {
  return [spot.city, spot.region, spot.country].filter(Boolean).join(' · ')
}
</script>

<template>
  <div class="min-h-screen bg-black pb-12">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <NuxtLink to="/" class="text-xs font-semibold text-gray-500 hover:text-white">
        {{ language === 'es' ? '← Inicio' : '← Home' }}
      </NuxtLink>
      <h1 class="mt-3 text-3xl font-black text-white">
        {{ language === 'es' ? 'Directorio de spots' : 'Skate spots directory' }}
      </h1>
      <p class="mt-2 text-sm text-gray-400">
        {{
          language === 'es'
            ? 'Lugares donde rodamos en México. Fotos, obstáculos y mapa se agregan en cada spot.'
            : 'Places we ride in Mexico. Photos, obstacles, and a map will live on each spot.'
        }}
      </p>

      <div v-if="loading" class="mt-8 flex justify-center">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
      <p v-else-if="loadError" class="mt-6 text-sm text-red-400">{{ loadError }}</p>
      <p v-else-if="!spots.length" class="mt-6 text-sm text-gray-500">
        {{
          language === 'es'
            ? 'Aún no hay lugares. Ejecuta add_skate_spots.sql y agrégalos desde el calendario.'
            : 'No places yet. Run add_skate_spots.sql and add them from the calendar.'
        }}
      </p>
      <ul v-else class="mt-6 divide-y divide-gray-800 rounded-2xl border border-gray-800 bg-gray-950">
        <li v-for="spot in spots" :key="spot.id" class="px-4 py-3">
          <p class="text-sm font-semibold text-white">{{ spot.name }}</p>
          <p v-if="placeLine(spot)" class="text-xs text-gray-500 mt-0.5">{{ placeLine(spot) }}</p>
        </li>
      </ul>
    </div>
  </div>
</template>
