<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })
const { language } = useI18n()
</script>

<template>
  <div class="px-4 py-6 max-w-lg mx-auto space-y-3">
    <h1 class="text-xl font-bold text-white mb-4">
      {{ language === 'es' ? 'Gestión de academia' : 'Academy management' }}
    </h1>
    <NuxtLink to="/member/admin/academy/dashboard" class="block rounded-xl bg-gray-900 border border-gray-800 p-4 text-white font-semibold">
      {{ language === 'es' ? 'Panel admin' : 'Admin dashboard' }}
    </NuxtLink>
    <NuxtLink to="/member/admin/academy/users" class="block rounded-xl bg-gray-900 border border-gray-800 p-4 text-white font-semibold">
      {{ language === 'es' ? 'Patinadores' : 'Skaters' }}
    </NuxtLink>
    <NuxtLink to="/member/admin/academy/registrations" class="block rounded-xl bg-gray-900 border border-gray-800 p-4 text-white font-semibold">
      {{ language === 'es' ? 'Solicitudes de registro' : 'Registration requests' }}
    </NuxtLink>
    <NuxtLink to="/member/admin/academy/programs" class="block rounded-xl bg-gray-900 border border-gray-800 p-4 text-white font-semibold">
      {{ language === 'es' ? 'Programas' : 'Programs' }}
    </NuxtLink>
    <NuxtLink to="/member/admin/academy/news" class="block rounded-xl bg-gray-900 border border-gray-800 p-4 text-white font-semibold">
      {{ language === 'es' ? 'Noticias' : 'News' }}
    </NuxtLink>
  </div>
</template>
