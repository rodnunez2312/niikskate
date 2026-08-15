<script setup lang="ts">
import { getProgramSeasonBySlug, seasonStatusLabel } from '~/utils/programSeasons'

definePageMeta({ layout: 'public' })

const route = useRoute()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const slug = computed(() => String(route.params.slug || ''))
const season = computed(() => getProgramSeasonBySlug(slug.value))

if (!season.value) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Temporada no encontrada',
  })
}

useHead({
  title: () => (es.value ? season.value!.name.es : season.value!.name.en),
})
</script>

<template>
  <div v-if="season">
    <section class="bg-black text-white border-b border-white/10">
      <div class="max-w-3xl mx-auto px-4 py-8">
        <NuxtLink to="/#schedule" class="text-sm text-gold-400 hover:text-gold-300 font-bold">
          ← {{ es ? 'Temporadas' : 'Seasons' }}
        </NuxtLink>
        <p class="text-xs uppercase tracking-widest text-gold-400 mt-4 mb-1">
          {{ season.icon }} {{ es ? 'Temporada' : 'Season' }}
        </p>
        <h1 class="text-3xl font-black">
          {{ es ? season.name.es : season.name.en }}
        </h1>
        <p class="text-gray-300 mt-2">
          {{ es ? season.dates.es : season.dates.en }}
          · {{ seasonStatusLabel(season.status, es) }}
        </p>
        <p class="text-sm text-gray-400 mt-2">
          {{ es ? 'Mérida, Yucatán · Skatepark La Plancha' : 'Mérida, Yucatán · Skatepark La Plancha' }}
        </p>
      </div>
    </section>
    <ClassesClassSessionsExplorer
      :season-slug="season.slug"
      :registration-open="season.status === 'enrolling'"
    />
  </div>
</template>
