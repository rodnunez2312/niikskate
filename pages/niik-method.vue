<script setup lang="ts">

definePageMeta({ layout: 'public' })

const { language } = useI18n()



const pillars = computed(() => [

  {

    icon: '🎯',

    title: language.value === 'es' ? 'Progresión clara' : 'Clear progression',

    text: language.value === 'es'

      ? 'Niveles y grupos de habilidad para que cada patinador sepa qué sigue.'

      : 'Skill levels and groups so every skater knows what comes next.',

  },

  {

    icon: '🛡️',

    title: language.value === 'es' ? 'Seguridad primero' : 'Safety first',

    text: language.value === 'es'

      ? 'Casco, caídas controladas y reglas del skatepark desde el día uno.'

      : 'Helmets, controlled falls, and park rules from day one.',

  },

  {

    icon: '🎮',

    title: language.value === 'es' ? 'Aprender jugando' : 'Learn through play',

    text: language.value === 'es'

      ? 'Juegos, retos y sesiones de 90 minutos que mantienen la energía alta.'

      : 'Games, challenges, and 90-minute sessions that keep energy high.',

  },

  {

    icon: '📈',

    title: language.value === 'es' ? 'Seguimiento real' : 'Real tracking',

    text: language.value === 'es'

      ? 'Coaches documentan progreso, evaluaciones y objetivos en la app de miembros.'

      : 'Coaches log progress, evaluations, and goals in the member app.',

  },

])



const sessionFlow = computed(() =>

  language.value === 'es'

    ? ['Calentamiento', 'Juego / dinámica', 'Enfoque técnico', 'Práctica libre', 'Cierre']

    : ['Warm-up', 'Game / dynamic', 'Technical focus', 'Free practice', 'Close-out'],

)

</script>



<template>

  <div class="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">

    <p class="text-gold-400 text-sm font-bold uppercase tracking-widest mb-3">

      {{ language === 'es' ? 'El Método Niik' : 'The Niik Method' }}

    </p>

    <h1 class="text-3xl sm:text-4xl font-black text-white mb-6">

      {{

        language === 'es'

          ? 'Progresión estructurada, diversión y seguridad'

          : 'Structured progression, fun, and safety'

      }}

    </h1>

    <div class="space-y-4 text-gray-300 leading-relaxed">

      <p>

        {{

          language === 'es'

            ? 'El Método Niik organiza el aprendizaje en niveles claros — desde los primeros empujes hasta líneas en el skatepark — con sesiones de 90 minutos en Skatepark La Plancha.'

            : 'The Niik Method organizes learning into clear levels — from first pushes to skatepark lines — with 90-minute sessions at Skatepark La Plancha.'

        }}

      </p>

      <p>

        {{

          language === 'es'

            ? 'Cada patinador avanza a su ritmo. Los coaches usan la plataforma de miembros para planear clases, evaluar y asignar objetivos.'

            : 'Each skater progresses at their own pace. Coaches use the member platform to plan classes, evaluate, and assign goals.'

        }}

      </p>

    </div>



    <section class="mt-12 grid sm:grid-cols-2 gap-4">

      <article

        v-for="p in pillars"

        :key="p.title"

        class="rounded-2xl border border-gray-800 bg-gray-900/50 p-5"

      >

        <span class="text-3xl">{{ p.icon }}</span>

        <h2 class="text-lg font-bold text-white mt-3">{{ p.title }}</h2>

        <p class="text-sm text-gray-400 mt-2">{{ p.text }}</p>

      </article>

    </section>



    <section class="mt-12 rounded-2xl border border-gold-400/30 bg-gold-400/5 p-6">

      <h2 class="text-lg font-bold text-white mb-4">

        {{ language === 'es' ? 'Estructura de una clase (90 min)' : 'Class structure (90 min)' }}

      </h2>

      <ol class="flex flex-wrap gap-2">

        <li

          v-for="(step, i) in sessionFlow"

          :key="step"

          class="flex items-center gap-2 text-sm text-gray-300"

        >

          <span class="w-6 h-6 rounded-full bg-gold-400 text-black text-xs font-bold flex items-center justify-center">{{ i + 1 }}</span>

          {{ step }}

          <span v-if="i < sessionFlow.length - 1" class="text-gray-600 hidden sm:inline">→</span>

        </li>

      </ol>

    </section>



    <div class="mt-10 flex flex-wrap gap-3">

      <NuxtLink to="/skate-programs" class="px-6 py-3 rounded-xl bg-gold-400 text-black font-bold">

        {{ language === 'es' ? 'Ver programas' : 'View programs' }}

      </NuxtLink>

      <NuxtLink to="/classes" class="px-6 py-3 rounded-xl border border-gray-600 text-gray-200 font-semibold">

        {{ language === 'es' ? 'Clases disponibles' : 'Available classes' }}

      </NuxtLink>

      <NuxtLink to="/auth/login?redirect=/member" class="px-6 py-3 rounded-xl border border-gold-400/50 text-gold-400 font-semibold">

        {{ language === 'es' ? 'Entrar a mi cuenta' : 'Member sign in' }}

      </NuxtLink>

    </div>

  </div>

</template>

