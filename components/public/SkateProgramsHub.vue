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
</script>

<template>
  <div class="space-y-12">
    <section class="text-center max-w-3xl mx-auto">
      <p class="text-gold-400 text-sm font-bold uppercase tracking-widest mb-3">
        {{ language === 'es' ? 'Programas de Skate' : 'Skate Programs' }}
      </p>
      <h1 class="text-3xl sm:text-4xl font-black text-white mb-4">
        {{
          language === 'es'
            ? 'Clases para cada edad y nivel'
            : 'Classes for every age and level'
        }}
      </h1>
      <p class="text-gray-400 text-base sm:text-lg leading-relaxed">
        {{
          language === 'es'
            ? 'Elige por edad y habilidad. Cada programa tiene un propósito claro — no solo un rango de edades.'
            : 'Choose by age and skill. Each program has a clear purpose — not just an age range.'
        }}
      </p>
    </section>

    <PublicMemberAppCta />

    <!-- How we group classes: age left, skill levels explained on the right -->
    <section class="max-w-6xl mx-auto grid lg:grid-cols-[16rem_minmax(0,1fr)] gap-4 items-start">
      <div class="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
        <h2 class="text-sm font-bold uppercase tracking-wide text-gold-400 mb-3">
          {{ language === 'es' ? 'Edad' : 'Age' }}
        </h2>
        <ul class="space-y-2">
          <li
            v-for="band in PROGRAM_AGE_BANDS"
            :key="band.id"
            class="flex items-center gap-3 text-sm text-gray-200"
          >
            <span class="text-xl w-8 text-center" aria-hidden="true">{{ band.emoji }}</span>
            <span>{{ language === 'es' ? band.label.es : band.label.en }}
              <span class="text-gray-400">
                ({{ language === 'es' ? band.nickname.es : band.nickname.en }})
              </span>
            </span>
          </li>
        </ul>
      </div>

      <div class="rounded-2xl border border-gray-800 bg-gray-900/50 p-5 overflow-hidden">
        <h2 class="text-sm font-bold uppercase tracking-wide text-gold-400 mb-4">
          {{ language === 'es' ? 'Nivel' : 'Skill' }}
        </h2>
        <div class="grid sm:grid-cols-3 gap-0 sm:divide-x sm:divide-gray-800">
          <div
            v-for="col in skillTrackColumns"
            :key="col.id"
            class="py-3 sm:py-0 sm:px-4 first:sm:pl-0 last:sm:pr-0"
          >
            <p class="flex items-center gap-2 text-sm font-bold text-white">
              <span class="text-xl leading-none" aria-hidden="true">{{ col.emoji }}</span>
              {{ col.label }}
            </p>
          </div>
        </div>

        <div
          class="mt-4 overflow-hidden border border-black bg-[#fff9f0] text-black"
          :class="levelsOpen ? 'rounded-2xl' : 'rounded-full'"
        >
          <button
            type="button"
            class="w-full flex items-center justify-between gap-3 px-5 py-2.5 text-left font-mono text-xs sm:text-sm font-bold tracking-tight"
            :aria-expanded="levelsOpen"
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
            class="border-t border-black grid sm:grid-cols-3 sm:divide-x sm:divide-black/20"
          >
            <div
              v-for="col in skillTrackColumns"
              :key="'detail-' + col.id"
              class="px-4 py-3 space-y-3 border-b border-black/15 last:border-b-0 sm:border-b-0"
            >
              <div
                v-for="level in col.levels"
                :key="level.id"
              >
                <p class="font-semibold text-sm text-gray-900">
                  {{ language === 'es' ? level.title.es : level.title.en }}
                </p>
                <p class="mt-0.5 text-xs leading-relaxed text-gray-600">
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
        class="relative flex flex-col rounded-2xl border-2 border-black bg-[#fff9f0] text-gray-900 shadow-lg overflow-hidden transition-transform hover:-translate-y-0.5"
      >
        <div class="p-5 flex-1 flex flex-col">
          <span class="text-4xl mb-3" aria-hidden="true">{{ p.emoji }}</span>
          <p class="text-xs font-mono font-bold uppercase tracking-wide mb-1 text-teal-700">
            {{ language === 'es' ? p.ageLabel.es : p.ageLabel.en }}
          </p>
          <h2 class="text-xl font-black uppercase leading-tight mb-2 text-gray-900">
            {{ language === 'es' ? p.title.es : p.title.en }}
          </h2>
          <p class="text-sm leading-relaxed flex-1 text-gray-700">
            {{ language === 'es' ? p.purpose.es : p.purpose.en }}
          </p>
          <p class="mt-4 text-[11px] font-mono uppercase tracking-wide text-gray-500">
            {{ skillLabel(p.skillTrack) }}
          </p>
        </div>

        <div class="p-3 border-t-2 border-black">
          <NuxtLink
            to="/classes"
            class="block w-full py-3 rounded-lg bg-white text-center font-black text-sm uppercase text-black tracking-wide
              hover:bg-gray-200 shadow-lg
              hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
          >
            {{ language === 'es' ? 'Ver clases' : 'Browse classes' }}
          </NuxtLink>
        </div>
      </article>
    </section>

    <section class="rounded-2xl border border-gray-800 bg-gray-900/40 p-6 max-w-4xl mx-auto text-center">
      <p class="text-gray-300 text-sm mb-4">
        {{
          language === 'es'
            ? '¿Listo para inscribirte? Revisa las clases publicadas, elige día y confirma tu patinador.'
            : 'Ready to join? Browse published classes, pick a day, and confirm your skater.'
        }}
      </p>
      <NuxtLink
        to="/classes"
        class="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-white font-black uppercase text-sm text-black
          hover:bg-gray-200
          hover:scale-[1.02] transition-transform"
      >
        {{ language === 'es' ? 'Ir a clases' : 'Go to classes' }}
      </NuxtLink>
    </section>
  </div>
</template>
