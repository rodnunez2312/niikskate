<script setup lang="ts">
const { language } = useI18n()
const es = computed(() => language.value === 'es')
const { online, pending, failed } = useOfflineState()

const message = computed(() => {
  if (!online.value) {
    if (pending.value) {
      return es.value
        ? `Sin conexión · ${pending.value} ${pending.value === 1 ? 'cambio guardado' : 'cambios guardados'} en este teléfono, se envían al reconectar.`
        : `Offline · ${pending.value} ${pending.value === 1 ? 'change' : 'changes'} saved on this phone, sent when you reconnect.`
    }
    return es.value
      ? 'Sin conexión · ves lo último que se cargó. Tus cambios se guardan y se envían al reconectar.'
      : 'Offline · showing the last loaded data. Changes are saved and sent when you reconnect.'
  }
  if (pending.value) {
    return es.value
      ? `Enviando ${pending.value} ${pending.value === 1 ? 'cambio' : 'cambios'} hechos sin conexión…`
      : `Sending ${pending.value} offline ${pending.value === 1 ? 'change' : 'changes'}…`
  }
  return ''
})
</script>

<template>
  <div>
    <div
      v-if="message"
      class="sticky top-0 z-30 flex items-center gap-2 border-b px-4 py-2 text-xs"
      :class="online ? 'border-acid/30 bg-acid/10 text-acid' : 'border-charcoal-600 bg-charcoal-800 text-cream/80'"
      role="status"
    >
      <span class="h-2 w-2 shrink-0 rounded-full" :class="online ? 'bg-acid animate-pulse' : 'bg-cream/40'" />
      <span>{{ message }}</span>
    </div>
    <div
      v-if="failed.length"
      class="flex items-center gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300"
      role="alert"
    >
      <span class="flex-1">
        {{ es
          ? `${failed.length} ${failed.length === 1 ? 'cambio hecho sin conexión no se pudo guardar' : 'cambios hechos sin conexión no se pudieron guardar'} (el servidor lo rechazó). Revisa y vuelve a capturarlo.`
          : `${failed.length} offline ${failed.length === 1 ? 'change was' : 'changes were'} rejected by the server. Please check and enter again.` }}
      </span>
      <button type="button" class="underline" @click="failed = []">{{ es ? 'Cerrar' : 'Dismiss' }}</button>
    </div>
  </div>
</template>
