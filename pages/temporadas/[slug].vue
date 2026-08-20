<script setup lang="ts">
import type { ProgramSeason } from '~/utils/programSeasons'

definePageMeta({ layout: 'public' })

const route = useRoute()
const { language } = useI18n()
const { isAdmin } = useSiteProfile()
const es = computed(() => language.value === 'es')

const slug = computed(() => String(route.params.slug || ''))
const { data: season, error } = await useFetch<ProgramSeason>(() => `/api/seasons/${slug.value}`)

if (error.value || !season.value) {
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
      <div class="max-w-3xl mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-3">
        <NuxtLink to="/#schedule" class="text-sm text-gold-400 hover:text-gold-300 font-bold">
          ← {{ es ? 'Temporadas' : 'Seasons' }}
        </NuxtLink>
        <NuxtLink
          v-if="isAdmin"
          :to="`/member/admin/scheduling/calendar?temporada=${season.slug}`"
          class="px-4 py-2 rounded-full font-semibold text-sm text-white bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400"
        >
          + {{ es ? 'Añadir programa' : 'Add program' }}
        </NuxtLink>
      </div>
    </section>
    <ClassesClassSessionsExplorer
      :season-slug="season.slug"
      :season="season"
      :registration-open="season.status === 'enrolling'"
    />
  </div>
</template>
