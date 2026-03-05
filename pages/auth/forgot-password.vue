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
  <div class="min-h-screen bg-black flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="text-center mb-8">
        <h1 class="text-3xl font-black text-gold-400">NiikSkate</h1>
        <p class="text-gray-400 mt-2">{{ language === 'es' ? 'Recuperar Contraseña' : 'Reset Password' }}</p>
      </div>

      <!-- Success Message -->
      <div v-if="sent" class="bg-green-500/20 border border-green-500 rounded-xl p-6 text-center">
        <svg class="w-12 h-12 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
        <h2 class="text-white font-bold mb-2">{{ language === 'es' ? '¡Email Enviado!' : 'Email Sent!' }}</h2>
        <p class="text-gray-400 text-sm">
          {{ language === 'es' 
            ? 'Revisa tu bandeja de entrada para restablecer tu contraseña.' 
            : 'Check your inbox to reset your password.' }}
        </p>
        <NuxtLink to="/auth/login" class="inline-block mt-4 text-gold-400 hover:underline">
          {{ language === 'es' ? 'Volver al Login' : 'Back to Login' }}
        </NuxtLink>
      </div>

      <!-- Reset Form -->
      <form v-else @submit.prevent="handleReset" class="space-y-4">
        <div>
          <label class="block text-gray-400 text-sm mb-2">Email</label>
          <input
            v-model="email"
            type="email"
            class="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:outline-none"
            :placeholder="language === 'es' ? 'tu@email.com' : 'your@email.com'"
          />
        </div>

        <div v-if="error" class="text-red-500 text-sm text-center">{{ error }}</div>

        <button
          type="submit"
          :disabled="loading"
          class="w-full py-3 bg-gold-400 text-black font-bold rounded-xl hover:bg-gold-300 transition-colors disabled:opacity-50"
        >
          {{ loading 
            ? '...' 
            : (language === 'es' ? 'Enviar Link de Recuperación' : 'Send Reset Link') }}
        </button>

        <div class="text-center">
          <NuxtLink to="/auth/login" class="text-gray-400 hover:text-gold-400 text-sm">
            {{ language === 'es' ? '← Volver al Login' : '← Back to Login' }}
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>
