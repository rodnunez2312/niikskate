<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })
const { language } = useI18n()
</script>

<template>
  <div class="px-4 py-6 max-w-lg mx-auto space-y-3 min-h-[50vh]">
    <h1 class="text-xl font-bold text-white mb-4">
      {{ language === 'es' ? 'Horarios' : 'Scheduling' }}
    </h1>
    <p class="text-sm text-gray-400 -mt-2 mb-4">
      {{ language === 'es' ? 'Calendario, coaches, asistencia y créditos.' : 'Calendar, coaches, attendance, and credits.' }}
    </p>
    <NuxtLink to="/member/admin/scheduling/calendar" class="block rounded-xl bg-gray-900 border border-gray-800 p-4 text-white font-semibold">
      {{ language === 'es' ? 'Calendario escolar' : 'School calendar' }}
    </NuxtLink>
    <NuxtLink to="/member/admin/scheduling/coaches" class="block rounded-xl bg-gray-900 border border-gray-800 p-4 text-white font-semibold">
      {{ language === 'es' ? 'Coaches y disponibilidad' : 'Coaches & availability' }}
    </NuxtLink>
    <NuxtLink to="/member/admin/scheduling/attendance" class="block rounded-xl bg-gray-900 border border-gray-800 p-4 text-white font-semibold">
      {{ language === 'es' ? 'Asistencia' : 'Attendance' }}
    </NuxtLink>
    <NuxtLink to="/member/admin/scheduling/credits" class="block rounded-xl bg-gray-900 border border-gray-800 p-4 text-white font-semibold">
      {{ language === 'es' ? 'Créditos y reservas' : 'Credits & reservations' }}
    </NuxtLink>
  </div>
</template>
