<script setup lang="ts">
import {
  PROGRAM_AGE_BANDS,
  PROGRAM_SKILL_TRACKS,
  SKATE_PROGRAM_OFFERINGS,
} from '~/types'

const { language } = useI18n()

const offerings = SKATE_PROGRAM_OFFERINGS

const skillLabel = (trackId: string) => {
  const row = PROGRAM_SKILL_TRACKS.find(t => t.id === trackId)
  if (!row) return trackId
  return language.value === 'es' ? row.label.es : row.label.en
}
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

    <!-- How we group classes -->
    <section class="max-w-4xl mx-auto grid sm:grid-cols-2 gap-4">
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
            <span>{{ language === 'es' ? band.label.es : band.label.en }}</span>
          </li>
        </ul>
      </div>
      <div class="rounded-2xl border border-gray-800 bg-gray-900/50 p-5">
        <h2 class="text-sm font-bold uppercase tracking-wide text-gold-400 mb-3">
          {{ language === 'es' ? 'Nivel' : 'Skill' }}
        </h2>
        <ul class="space-y-2">
          <li
            v-for="track in PROGRAM_SKILL_TRACKS"
            :key="track.id"
            class="flex items-center gap-3 text-sm text-gray-200"
          >
            <span class="text-xl w-8 text-center" aria-hidden="true">{{ track.emoji }}</span>
            <span>{{ language === 'es' ? track.label.es : track.label.en }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- Purpose-first program cards -->
    <section class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 max-w-5xl mx-auto">
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
            class="block w-full py-3 rounded-lg text-center font-black text-sm uppercase text-white tracking-wide
              bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400
              hover:from-teal-400 hover:via-cyan-400 hover:to-amber-300
              shadow-[0_4px_14px_rgba(20,184,166,0.35)]
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
        class="inline-flex items-center justify-center px-6 py-3 rounded-xl font-black uppercase text-sm
          bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400 text-white
          hover:scale-[1.02] transition-transform"
      >
        {{ language === 'es' ? 'Ir a clases' : 'Go to classes' }}
      </NuxtLink>
    </section>
  </div>
</template>
