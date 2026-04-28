<script setup lang="ts">
const { language } = useI18n()
</script>

<template>
  <NuxtLink
    to="/user/reservations"
    class="block bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/50 shadow-2xl hover:border-glass-blue/40 transition-colors"
  >
    <div class="flex items-center gap-3">
      <span class="text-3xl">🎫</span>
      <div class="flex-1 min-w-0">
        <p class="text-gold-400 font-black text-sm uppercase tracking-wide">
          {{ language === 'es' ? 'Mis reservas' : 'My reservations' }}
        </p>
        <p class="text-gray-400 text-xs mt-0.5">
          {{
            language === 'es'
              ? 'Ve tus clases agendadas y confirma asistencia.'
              : 'View scheduled classes and confirm attendance.'
          }}
        </p>
      </div>
    </div>
    <p class="text-center text-glass-blue text-xs font-semibold mt-3">
      {{ language === 'es' ? 'Toca para ver mis reservas →' : 'Tap to view my reservations →' }}
    </p>
  </NuxtLink>
</template>
