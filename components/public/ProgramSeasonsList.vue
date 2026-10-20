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
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <h2 class="t-eyebrow text-sage-700 text-center sm:text-left">
        {{ es ? 'Temporadas del programa' : 'Program seasons' }}
      </h2>
      <button
        v-if="isAdmin"
        type="button"
        class="self-center sm:self-auto px-4 py-2.5 rounded-full font-semibold text-sm border-2 border-charcoal hover:bg-charcoal hover:text-cream transition-colors"
        @click="addSeasonOpen = true"
      >
        + {{ es ? 'Añadir temporada' : 'Add season' }}
      </button>
    </div>
    <p v-if="isAdmin && seasonRemoveError" class="text-sm text-flame-600 mb-3" role="alert">{{ seasonRemoveError }}</p>
    <ul class="divide-y divide-cream-200 border-y border-cream-200">
      <li
        v-for="row in seasons"
        :key="row.slug"
        class="flex items-center gap-3 py-4"
      >
        <div class="min-w-0 flex-1">
          <NuxtLink :to="row.href" class="block font-bold hover:text-sage-700 transition-colors truncate rounded">
            <span class="mr-1.5" aria-hidden="true">{{ row.icon }}</span>{{ row.name }}
          </NuxtLink>
          <p class="text-sm text-charcoal/65 truncate">{{ row.dates }}</p>
        </div>
        <NuxtLink
          v-if="row.statusKey === 'enrolling'"
          :to="row.href"
          class="shrink-0 inline-flex items-center justify-center px-4 py-2 rounded-full bg-acid text-charcoal text-xs font-bold hover:bg-acid-300 transition-colors"
        >
          {{ es ? 'Inscribirse' : 'Register' }}
        </NuxtLink>
        <span v-else class="shrink-0 text-charcoal/60 text-xs font-semibold">{{ row.status }}</span>
        <button
          v-if="isAdmin"
          type="button"
          class="shrink-0 inline-flex p-2 rounded-lg text-charcoal/50 hover:text-flame-600 hover:bg-flame-500/10 disabled:opacity-40"
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
      <summary class="cursor-pointer text-center text-sm font-bold text-sage-700 hover:text-charcoal rounded">
        {{ es ? 'Cómo funciona' : 'How this works' }}
      </summary>
      <div class="mt-4 rounded-2xl border border-cream-200 bg-cream-50 p-5 text-sm text-charcoal/80 leading-relaxed space-y-3">
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
      <NuxtLink to="/classes" class="link-underline text-sm decoration-acid-600 hover:text-sage-700">
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
