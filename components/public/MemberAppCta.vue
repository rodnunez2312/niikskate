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
  <div class="rounded-3xl bg-charcoal text-cream p-6 sm:p-8">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
      <div>
        <p class="t-eyebrow text-acid mb-2">
          {{ language === 'es' ? 'Plataforma de miembros' : 'Member platform' }}
        </p>
        <h2 class="font-display text-xl sm:text-2xl font-extrabold">
          {{
            language === 'es'
              ? 'Reserva clases, sigue tu progreso y más en la app'
              : 'Book classes, track progress, and more in the app'
          }}
        </h2>
        <p class="text-sm text-cream/75 mt-2 max-w-xl">
          {{
            language === 'es'
              ? 'Descarga NiikSkate en tu celular o abre la app si ya la tienes instalada.'
              : 'Download NiikSkate on your phone or open the app if you already have it.'
          }}
        </p>
      </div>
      <button type="button" class="btn-lime shrink-0" @click="enterMemberPlatform">
        {{ language === 'es' ? 'Abrir app' : 'Open app' }}
      </button>
    </div>
  </div>
</template>
