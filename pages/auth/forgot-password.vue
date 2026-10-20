<script setup lang="ts">
const client = useSupabaseClient()
const { language } = useI18n()

const email = ref('')
const loading = ref(false)
const sent = ref(false)
const error = ref('')

const handleReset = async () => {
  if (!email.value) {
    error.value = language.value === 'es' ? 'Ingresa tu email' : 'Enter your email'
    return
  }
  
  loading.value = true
  error.value = ''
  
  try {
    const { error: resetError } = await client.auth.resetPasswordForEmail(email.value, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    })
    
    if (resetError) throw resetError
    sent.value = true
  } catch (e: any) {
    error.value = e.message || 'Error sending reset email'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="public-site min-h-screen bg-charcoal text-cream flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <img src="/Niik_StainedGlass.png" alt="NiikSkate" class="h-28 w-auto mx-auto mb-3 object-contain" />
        <h1 class="font-display text-3xl font-black tracking-tight"><span class="text-acid">Niik</span>Skate</h1>
        <p class="text-cream/60 mt-2">{{ language === 'es' ? 'Recuperar contraseña' : 'Reset password' }}</p>
      </div>

      <!-- Success Message -->
      <div v-if="sent" class="bg-green-500/20 border border-green-500 rounded-xl p-6 text-center">
        <svg class="w-12 h-12 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <h2 class="text-cream font-bold mb-2">{{ language === 'es' ? '¡Email enviado!' : 'Email sent!' }}</h2>
        <p class="text-cream/60 text-sm">
          {{ language === 'es' 
            ? 'Revisa tu bandeja de entrada para restablecer tu contraseña.' 
            : 'Check your inbox to reset your password.' }}
        </p>
        <NuxtLink to="/auth/login" class="inline-block mt-4 text-acid font-semibold hover:text-acid-300">
          {{ language === 'es' ? 'Volver al Login' : 'Back to Login' }}
        </NuxtLink>
      </div>

      <!-- Reset Form -->
      <form v-else @submit.prevent="handleReset" class="space-y-4">
        <div>
          <label class="block text-cream/70 text-sm mb-2">Email</label>
          <input
            v-model="email"
            type="email"
            class="w-full px-4 py-3 bg-charcoal-800 border border-charcoal-600 rounded-xl text-cream placeholder-cream/40 focus:border-acid focus:outline-none"
            :placeholder="language === 'es' ? 'tu@email.com' : 'your@email.com'"
          />
        </div>

        <div v-if="error" class="text-red-500 text-sm text-center">{{ error }}</div>

        <button
          type="submit"
          :disabled="loading"
          class="btn-lime w-full disabled:opacity-50"
        >
          {{ loading 
            ? '...' 
            : (language === 'es' ? 'Enviar Link de Recuperación' : 'Send Reset Link') }}
        </button>

        <div class="text-center">
          <NuxtLink to="/auth/login" class="text-cream/60 hover:text-acid text-sm">
            {{ language === 'es' ? '← Volver al Login' : '← Back to Login' }}
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>
