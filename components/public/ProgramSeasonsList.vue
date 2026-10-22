<script setup lang="ts">
import { isPastSeason, resolveSeasonStatus, seasonStatusLabel } from '~/utils/programSeasons'

const { language } = useI18n()
const es = computed(() => language.value === 'es')
const { isAdmin } = useSiteProfile()
const { seasons: seasonCatalog, refresh: refreshSeasons, removeSeason } = useProgramSeasons()
const router = useRouter()

const addSeasonOpen = ref(false)
const removingSeasonSlug = ref('')
const seasonRemoveError = ref('')

const seasons = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return seasonCatalog.value
    // A finished season has nothing left to sell. Admins still reach it through
    // the archive in Calendario.
    .filter(s => !isPastSeason(s, today))
    .map((s) => {
      const status = resolveSeasonStatus(s, today)
      return {
        slug: s.slug,
        icon: s.icon,
        name: es.value ? s.name.es : s.name.en,
        dates: es.value ? s.dates.es : s.dates.en,
        status: seasonStatusLabel(status, es.value),
        statusKey: status,
        href: `/temporadas/${s.slug}`,
      }
    })
})

const onSeasonCreated = async (season: { slug: string }) => {
  addSeasonOpen.value = false
  await refreshSeasons()
  await router.push(`/temporadas/${season.slug}`)
}

const confirmRemoveSeason = async (row: { slug: string; name: string }) => {
  const ok = window.confirm(
    es.value
      ? `¿Quitar “${row.name}”? También desaparecerá del calendario.`
      : `Remove “${row.name}”? It will also disappear from the calendar.`,
  )
  if (!ok) return
  removingSeasonSlug.value = row.slug
  seasonRemoveError.value = ''
  try {
    await removeSeason(row.slug)
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }; message?: string }
    seasonRemoveError.value = err?.data?.message || err?.message || 'Error'
  } finally {
    removingSeasonSlug.value = ''
  }
}
</script>

<template>
  <section id="temporadas" class="scroll-mt-24">
    <div class="flex flex-col items-center gap-3 mb-6">
      <h2 class="t-eyebrow rounded-md bg-charcoal/25 px-3 py-1.5 text-acid ring-1 ring-white/15 backdrop-blur-md">
        {{ es ? 'Temporadas' : 'Seasons' }}
      </h2>
      <button
        v-if="isAdmin"
        type="button"
        class="px-4 py-2.5 rounded-full font-semibold text-sm bg-cream border-2 border-charcoal hover:bg-charcoal hover:text-cream transition-colors"
        @click="addSeasonOpen = true"
      >
        + {{ es ? 'Añadir temporada' : 'Add season' }}
      </button>
    </div>
    <p v-if="isAdmin && seasonRemoveError" class="text-sm text-flame-600 mb-3" role="alert">{{ seasonRemoveError }}</p>
    <ul class="flex flex-wrap justify-center gap-3 sm:gap-4">
      <li
        v-for="row in seasons"
        :key="row.slug"
        class="relative flex w-full flex-col rounded-2xl bg-charcoal/30 p-4 backdrop-blur-md sm:w-[calc(50%-0.5rem)] lg:w-[13rem]"
        :class="row.statusKey === 'enrolling' ? 'ring-2 ring-acid/70' : 'ring-1 ring-white/15'"
      >
        <span class="text-2xl leading-none" aria-hidden="true">{{ row.icon }}</span>
        <NuxtLink :to="row.href" class="mt-3 block font-bold text-cream hover:text-acid transition-colors truncate rounded">
          {{ row.name }}
        </NuxtLink>
        <p class="text-sm text-cream/75 truncate">{{ row.dates }}</p>
        <NuxtLink
          v-if="row.statusKey === 'enrolling'"
          :to="row.href"
          class="mt-4 inline-flex w-full items-center justify-center px-4 py-2 rounded-full bg-acid text-charcoal text-xs font-bold shadow hover:bg-acid-300 transition-colors"
        >
          {{ es ? 'Inscribirse' : 'Register' }}
        </NuxtLink>
        <span v-else class="mt-4 inline-flex w-full items-center justify-center rounded-full bg-white/10 px-4 py-2 text-cream/85 text-xs font-semibold">{{ row.status }}</span>
        <button
          v-if="isAdmin"
          type="button"
          class="absolute right-2 top-2 inline-flex p-2 rounded-lg text-cream/60 hover:text-flame-400 disabled:opacity-40"
          :disabled="removingSeasonSlug === row.slug"
          :title="es ? 'Quitar temporada' : 'Remove season'"
          :aria-label="es ? 'Quitar temporada' : 'Remove season'"
          @click="confirmRemoveSeason(row)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </li>
    </ul>
    <details class="mt-8 max-w-2xl mx-auto text-left">
      <summary class="mx-auto w-fit cursor-pointer rounded-md bg-charcoal/25 px-3 py-1.5 text-center text-sm font-bold text-acid ring-1 ring-white/15 backdrop-blur-md hover:text-cream">
        {{ es ? 'Cómo funciona' : 'How this works' }}
      </summary>
      <div class="mt-4 rounded-2xl bg-charcoal/25 p-5 text-sm text-cream/90 leading-relaxed space-y-3 ring-1 ring-white/15 backdrop-blur-md">
        <p>
          {{
            es
              ? 'Las clases grupales reúnen patinadores de edades y niveles compatibles para aprender en un ambiente seguro, dinámico y divertido.'
              : 'Group classes bring together skaters of compatible ages and levels to learn in a safe, active, and fun environment.'
          }}
        </p>
        <p>
          {{
            es
              ? 'El coach guía calentamiento, fundamentos, práctica de habilidades y retos adaptados al grupo. El equipo de seguridad es obligatorio y los cupos son limitados.'
              : 'The coach guides the warm-up, fundamentals, skill practice, and challenges adapted to the group. Safety gear is required and group sizes are limited.'
          }}
        </p>
      </div>
    </details>
    <div class="mt-6 text-center">
      <NuxtLink to="/classes" class="inline-block rounded-md bg-charcoal/25 px-3 py-1.5 link-underline text-sm font-semibold text-cream decoration-acid ring-1 ring-white/15 backdrop-blur-md hover:text-acid">
        {{ es ? 'Ver todas las clases publicadas →' : 'Browse all published classes →' }}
      </NuxtLink>
    </div>

    <AdminSeasonCreateModal
      :open="addSeasonOpen"
      @close="addSeasonOpen = false"
      @created="onSeasonCreated"
    />
  </section>
</template>
