<script setup lang="ts">
const user = useSupabaseUser()
const { language } = useI18n()
const { openMemberApp } = useMemberApp()

function enterMemberPlatform() {
  // Visitors without an account start by registering; login is linked from there.
  openMemberApp(user.value ? '/member' : '/auth/register')
}
</script>

<template>
  <div class="rounded-2xl border border-gold-400/40 bg-gradient-to-br from-gold-400/15 to-black/80 p-5 sm:p-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <p class="text-gold-400 text-xs font-bold uppercase tracking-wider mb-1">
          {{ language === 'es' ? 'Plataforma de miembros' : 'Member platform' }}
        </p>
        <h2 class="text-lg sm:text-xl font-bold text-white">
          {{
            language === 'es'
              ? 'Reserva clases, sigue tu progreso y más en la app'
              : 'Book classes, track progress, and more in the app'
          }}
        </h2>
        <p class="text-sm text-gray-400 mt-2 max-w-xl">
          {{
            language === 'es'
              ? 'Descarga NiikSkate en tu celular o abre la app si ya la tienes instalada.'
              : 'Download NiikSkate on your phone or open the app if you already have it.'
          }}
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 px-5 py-3 rounded-xl bg-gold-400 text-black font-bold text-sm hover:bg-gold-300 transition-colors"
        @click="enterMemberPlatform"
      >
        {{ language === 'es' ? 'Abrir app' : 'Open app' }}
      </button>
    </div>
  </div>
</template>
