<script setup lang="ts">
definePageMeta({ layout: 'public' })

const { language } = useI18n()
const user = useSupabaseUser()
</script>

<template>
  <div>
    <section class="relative overflow-hidden">
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
        <img src="/Niik_StainedGlass.png" alt="" class="h-[min(90vh,720px)] w-auto object-contain" />
      </div>
      <div class="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
        <h1 class="text-4xl sm:text-5xl lg:text-6xl font-black text-white mb-4">
          <span class="text-gold-400">Niik</span>Skate Academy
        </h1>
        <p class="text-lg sm:text-xl text-gray-300 max-w-2xl mx-auto mb-8">
          {{
            language === 'es'
              ? 'Aprende skate con coaches expertos. Método Niik, programas por edad y una comunidad que crece contigo.'
              : 'Learn to skate with expert coaches. The Niik Method, age-based programs, and a community that grows with you.'
          }}
        </p>
        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          <NuxtLink
            to="/skate-programs"
            class="px-8 py-4 rounded-2xl bg-gold-400 text-black font-bold text-lg hover:bg-gold-300 transition-colors"
          >
            {{ language === 'es' ? 'Ver programas' : 'Explore programs' }}
          </NuxtLink>
          <NuxtLink
            to="/classes"
            class="px-8 py-4 rounded-2xl border border-gray-600 text-white font-bold text-lg hover:bg-gray-900 transition-colors"
          >
            {{ language === 'es' ? 'Clases disponibles' : 'Available classes' }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <section class="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <NuxtLink
        to="/niik-method"
        class="group rounded-2xl border border-gray-800 bg-gray-900/50 p-6 hover:border-gold-400/50 transition-colors"
      >
        <span class="text-3xl">🎯</span>
        <h2 class="text-lg font-bold text-white mt-3 group-hover:text-gold-400">
          {{ language === 'es' ? 'El Método Niik' : 'The Niik Method' }}
        </h2>
        <p class="text-sm text-gray-400 mt-2">
          {{ language === 'es' ? 'Pedagogía y progresión por niveles' : 'Pedagogy and level-based progression' }}
        </p>
      </NuxtLink>
      <NuxtLink
        to="/skate-programs"
        class="group rounded-2xl border border-gray-800 bg-gray-900/50 p-6 hover:border-gold-400/50 transition-colors"
      >
        <span class="text-3xl">🛹</span>
        <h2 class="text-lg font-bold text-white mt-3 group-hover:text-gold-400">
          {{ language === 'es' ? 'Programas de Skate' : 'Skate Programs' }}
        </h2>
        <p class="text-sm text-gray-400 mt-2">
          {{ language === 'es' ? 'Tots, principiantes, intermedios y más' : 'Tots, beginners, intermediate, and more' }}
        </p>
      </NuxtLink>
      <NuxtLink
        to="/community"
        class="group rounded-2xl border border-gray-800 bg-gray-900/50 p-6 hover:border-gold-400/50 transition-colors"
      >
        <span class="text-3xl">✨</span>
        <h2 class="text-lg font-bold text-white mt-3 group-hover:text-gold-400">
          {{ language === 'es' ? 'Comunidad' : 'Community' }}
        </h2>
        <p class="text-sm text-gray-400 mt-2">
          {{ language === 'es' ? 'Noticias, eventos y redes sociales' : 'News, events, and social' }}
        </p>
      </NuxtLink>
      <NuxtLink
        :to="user ? '/member' : '/auth/login?redirect=/member'"
        class="group rounded-2xl border border-gold-400/30 bg-gold-400/5 p-6 hover:border-gold-400 transition-colors"
      >
        <span class="text-3xl">📱</span>
        <h2 class="text-lg font-bold text-white mt-3 group-hover:text-gold-400">
          {{ language === 'es' ? 'App de miembros' : 'Member app' }}
        </h2>
        <p class="text-sm text-gray-400 mt-2">
          {{ language === 'es' ? 'Clases, progreso y reservas' : 'Classes, progress, and bookings' }}
        </p>
      </NuxtLink>
    </section>

    <section class="max-w-6xl mx-auto px-4 sm:px-6 pb-16">
      <PublicMemberAppCta />
    </section>

    <section class="max-w-6xl mx-auto px-4 sm:px-6 pb-20">
      <HomeGuestClassAvailabilityCalendar />
    </section>
  </div>
</template>
