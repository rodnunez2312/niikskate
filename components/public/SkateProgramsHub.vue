<script setup lang="ts">
import {
  PROGRAM_AGE_BANDS,
  PROGRAM_SKILL_TRACKS,
  SKATE_PROGRAM_OFFERINGS,
  SKATE_SKILL_LEVELS,
  skillTrackFromLevelId,
} from '~/types'

const { language } = useI18n()

const offerings = SKATE_PROGRAM_OFFERINGS

const skillLabel = (trackId: string) => {
  const row = PROGRAM_SKILL_TRACKS.find(t => t.id === trackId)
  if (!row) return trackId
  return language.value === 'es' ? row.label.es : row.label.en
}

const skillTrackColumns = computed(() =>
  PROGRAM_SKILL_TRACKS.map(track => ({
    id: track.id,
    emoji: track.emoji,
    label: language.value === 'es' ? track.label.es : track.label.en,
    levels: SKATE_SKILL_LEVELS.filter(level => skillTrackFromLevelId(level.id) === track.id),
  })),
)

const levelsOpen = ref(false)

function classesLink(offering: (typeof offerings)[number]) {
  const query: Record<string, string> = { nivel: offering.skillTrack }
  if (offering.audiences.length) query.edad = offering.audiences.join(',')
  return { path: '/classes', query }
}
</script>

<template>
  <div class="space-y-16 sm:space-y-20">
    <section class="text-center max-w-3xl mx-auto">
      <p class="t-eyebrow text-sage-700 mb-4">
        {{ language === 'es' ? 'Programas de Skate' : 'Skate Programs' }}
      </p>
      <h1 class="t-h2 mb-5">
        {{
          language === 'es'
            ? 'Clases para cada edad y nivel'
            : 'Classes for every age and level'
        }}
      </h1>
      <p class="t-lead text-charcoal/75">
        {{
          language === 'es'
            ? 'Elige por edad y habilidad. Cada programa tiene un propósito claro — no solo un rango de edades.'
            : 'Choose by age and skill. Each program has a clear purpose — not just an age range.'
        }}
      </p>
    </section>

    <PublicProgramSeasonsList class="max-w-3xl mx-auto" />

    <PublicMemberAppCta />

    <!-- How we group classes: age left, skill levels explained on the right -->
    <section class="max-w-6xl mx-auto grid lg:grid-cols-[16rem_minmax(0,1fr)] gap-4 items-start">
      <div class="rounded-3xl border border-cream-200 bg-cream-50 p-6">
        <h2 class="t-eyebrow text-sage-700 mb-4">
          {{ language === 'es' ? 'Edad' : 'Age' }}
        </h2>
        <ul class="space-y-3">
          <li
            v-for="band in PROGRAM_AGE_BANDS"
            :key="band.id"
            class="flex items-center gap-3 text-sm"
          >
            <span class="text-xl w-8 text-center" aria-hidden="true">{{ band.emoji }}</span>
            <span>{{ language === 'es' ? band.label.es : band.label.en }}
              <span class="text-charcoal/65">
                ({{ language === 'es' ? band.nickname.es : band.nickname.en }})
              </span>
            </span>
          </li>
        </ul>
      </div>

      <div class="rounded-3xl border border-cream-200 bg-cream-50 p-6 overflow-hidden">
        <h2 class="t-eyebrow text-sage-700 mb-4">
          {{ language === 'es' ? 'Nivel' : 'Skill' }}
        </h2>
        <div class="grid sm:grid-cols-3 gap-0 sm:divide-x sm:divide-cream-200">
          <div
            v-for="col in skillTrackColumns"
            :key="col.id"
            class="py-3 sm:py-0 sm:px-4 first:sm:pl-0 last:sm:pr-0"
          >
            <p class="flex items-center gap-2 text-sm font-bold">
              <span class="text-xl leading-none" aria-hidden="true">{{ col.emoji }}</span>
              {{ col.label }}
            </p>
          </div>
        </div>

        <div
          class="mt-5 overflow-hidden border-2 border-charcoal bg-cream"
          :class="levelsOpen ? 'rounded-2xl' : 'rounded-full'"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between gap-3 px-5 py-3 text-left text-sm font-bold hover:bg-acid/30 transition-colors"
            :class="levelsOpen ? 'rounded-t-2xl' : 'rounded-full'"
            :aria-expanded="levelsOpen"
            aria-controls="skill-levels-detail"
            @click="levelsOpen = !levelsOpen"
          >
            <span>
              {{
                language === 'es'
                  ? 'Conoce más sobre estos niveles'
                  : 'Learn more about these levels'
              }}
            </span>
            <span class="text-lg leading-none shrink-0 w-5 text-center" aria-hidden="true">
              {{ levelsOpen ? '−' : '+' }}
            </span>
          </button>
          <div
            v-if="levelsOpen"
            id="skill-levels-detail"
            class="border-t-2 border-charcoal grid sm:grid-cols-3 sm:divide-x sm:divide-cream-200"
          >
            <div
              v-for="col in skillTrackColumns"
              :key="'detail-' + col.id"
              class="px-4 py-4 space-y-3 border-b border-cream-200 last:border-b-0 sm:border-b-0"
            >
              <div
                v-for="level in col.levels"
                :key="level.id"
              >
                <p class="font-semibold text-sm">
                  {{ language === 'es' ? level.title.es : level.title.en }}
                </p>
                <p class="mt-0.5 text-xs leading-relaxed text-charcoal/70">
                  {{ language === 'es' ? level.description.es : level.description.en }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Purpose-first program cards -->
    <section class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-6xl mx-auto">
      <article
        v-for="p in offerings"
        :key="p.id"
        class="card-lift relative flex flex-col rounded-3xl border-2 border-charcoal bg-cream-50 overflow-hidden"
      >
        <div class="p-6 flex-1 flex flex-col">
          <span class="text-4xl mb-4" aria-hidden="true">{{ p.emoji }}</span>
          <p class="t-eyebrow text-[11px] text-sage-700 mb-1">
            {{ language === 'es' ? p.ageLabel.es : p.ageLabel.en }}
          </p>
          <h2 class="font-display text-2xl font-black uppercase leading-tight mb-3">
            {{ language === 'es' ? p.title.es : p.title.en }}
          </h2>
          <p class="text-sm leading-relaxed flex-1 text-charcoal/75">
            {{ language === 'es' ? p.purpose.es : p.purpose.en }}
          </p>
          <p class="mt-5 inline-flex self-start px-3 py-1 rounded-full bg-sage-100 text-[11px] font-bold uppercase tracking-wide text-sage-700">
            {{ skillLabel(p.skillTrack) }}
          </p>
        </div>

        <div class="p-4 border-t-2 border-charcoal">
          <NuxtLink
            :to="classesLink(p)"
            class="btn-lime w-full uppercase text-sm tracking-wide"
          >
            {{ language === 'es' ? 'Ver clases' : 'Browse classes' }}
          </NuxtLink>
        </div>
      </article>
    </section>

    <section class="rounded-3xl border border-cream-200 bg-cream-50 p-8 max-w-4xl mx-auto text-center">
      <p class="text-charcoal/75 mb-5">
        {{
          language === 'es'
            ? '¿Listo para inscribirte? Revisa las clases publicadas, elige día y confirma tu patinador.'
            : 'Ready to join? Browse published classes, pick a day, and confirm your skater.'
        }}
      </p>
      <NuxtLink to="/classes" class="btn-outline-dark">
        {{ language === 'es' ? 'Ir a clases' : 'Go to classes' }}
      </NuxtLink>
    </section>
  </div>
</template>
