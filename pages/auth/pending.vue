<script setup lang="ts">
const router = useRouter()
const client = useSupabaseClient()
const { language } = useI18n()

const email = ref('')
const status = ref<'pending' | 'approved' | 'rejected' | 'not_found' | null>(null)
const loading = ref(false)
const rejectionReason = ref<string | null>(null)

const checkStatus = async () => {
  if (!email.value) return
  
  loading.value = true
  status.value = null
  rejectionReason.value = null
  
  try {
    const { data, error } = await client
      .from('registration_requests')
      .select('status, rejection_reason')
      .eq('email', email.value)
      .single()

    if (error || !data) {
      status.value = 'not_found'
      return
    }

    status.value = data.status
    rejectionReason.value = data.rejection_reason
    
    // If approved, redirect to login
    if (data.status === 'approved') {
      setTimeout(() => {
        router.push('/auth/login')
      }, 3000)
    }
  } catch (e) {
    console.error('Error checking status:', e)
    status.value = 'not_found'
  } finally {
    loading.value = false
  }
}

// Check on mount if email was stored
onMounted(() => {
  const storedEmail = localStorage.getItem('pending_registration_email')
  if (storedEmail) {
    email.value = storedEmail
    checkStatus()
  }
})
</script>

<template>
  <div class="min-h-screen bg-black flex flex-col">
    <!-- Header -->
    <header class="pt-safe px-4 py-4 flex items-center justify-between">
      <button
        @click="router.push('/')"
        class="w-10 h-10 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center"
      >
        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    </header>

    <!-- Content -->
    <div class="flex-1 flex flex-col justify-center px-4 pb-safe">
      <div class="max-w-sm mx-auto w-full">
        <!-- Logo -->
        <div class="text-center mb-8">
          <div class="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-glass-purple to-glass-blue flex items-center justify-center text-4xl shadow-lg">
            ⏳
          </div>
          <h1 class="text-2xl font-bold text-white">
            {{ language === 'es' ? 'Estado de Registro' : 'Registration Status' }}
          </h1>
          <p class="text-gray-400 mt-2">
            {{ language === 'es' ? 'Verifica el estado de tu solicitud' : 'Check the status of your request' }}
          </p>
        </div>

        <!-- Email Input -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-300 mb-2">
            {{ language === 'es' ? 'Tu correo electrónico' : 'Your email' }}
          </label>
          <div class="flex gap-2">
            <input
              v-model="email"
              type="email"
              class="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none"
              :placeholder="language === 'es' ? 'correo@ejemplo.com' : 'email@example.com'"
              @keyup.enter="checkStatus"
            />
            <button
              @click="checkStatus"
              :disabled="loading || !email"
              class="px-6 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50"
            >
              <span v-if="loading">
                <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </span>
              <span v-else>{{ language === 'es' ? 'Verificar' : 'Check' }}</span>
            </button>
          </div>
        </div>

        <!-- Status Display -->
        <div v-if="status" class="space-y-4">
          <!-- Pending -->
          <div v-if="status === 'pending'" class="bg-glass-purple/10 border border-glass-purple/30 rounded-2xl p-6 text-center">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-glass-purple/20 flex items-center justify-center">
              <span class="text-3xl">⏳</span>
            </div>
            <h3 class="text-xl font-bold text-white mb-2">
              {{ language === 'es' ? 'Pendiente de Aprobación' : 'Pending Approval' }}
            </h3>
            <p class="text-gray-400">
              {{ language === 'es' 
                ? 'Tu solicitud está siendo revisada por un administrador. Te notificaremos por correo cuando sea aprobada.' 
                : 'Your request is being reviewed by an admin. We\'ll notify you by email when approved.' 
              }}
            </p>
          </div>

          <!-- Approved -->
          <div v-else-if="status === 'approved'" class="bg-glass-green/10 border border-glass-green/30 rounded-2xl p-6 text-center">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-glass-green/20 flex items-center justify-center">
              <svg class="w-8 h-8 text-glass-green" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </div>
            <h3 class="text-xl font-bold text-white mb-2">
              {{ language === 'es' ? '¡Aprobado!' : 'Approved!' }}
            </h3>
            <p class="text-gray-400 mb-4">
              {{ language === 'es' 
                ? 'Tu registro ha sido aprobado. Revisa tu correo para completar la configuración de tu cuenta.' 
                : 'Your registration has been approved. Check your email to complete your account setup.' 
              }}
            </p>
            <NuxtLink to="/auth/login" class="inline-block px-6 py-3 bg-glass-green text-white font-bold rounded-xl">
              {{ language === 'es' ? 'Iniciar Sesión' : 'Sign In' }}
            </NuxtLink>
          </div>

          <!-- Rejected -->
          <div v-else-if="status === 'rejected'" class="bg-flame-600/10 border border-flame-600/30 rounded-2xl p-6 text-center">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-flame-600/20 flex items-center justify-center">
              <svg class="w-8 h-8 text-flame-500" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </div>
            <h3 class="text-xl font-bold text-white mb-2">
              {{ language === 'es' ? 'Solicitud Rechazada' : 'Request Rejected' }}
            </h3>
            <p class="text-gray-400 mb-2">
              {{ language === 'es' 
                ? 'Lo sentimos, tu solicitud no fue aprobada.' 
                : 'Sorry, your request was not approved.' 
              }}
            </p>
            <p v-if="rejectionReason" class="text-sm text-flame-400 bg-flame-600/10 rounded-lg p-3">
              {{ language === 'es' ? 'Razón: ' : 'Reason: ' }}{{ rejectionReason }}
            </p>
          </div>

          <!-- Not Found -->
          <div v-else-if="status === 'not_found'" class="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 text-center">
            <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
              <span class="text-3xl">🔍</span>
            </div>
            <h3 class="text-xl font-bold text-white mb-2">
              {{ language === 'es' ? 'No Encontrado' : 'Not Found' }}
            </h3>
            <p class="text-gray-400 mb-4">
              {{ language === 'es' 
                ? 'No encontramos una solicitud con ese correo.' 
                : 'We couldn\'t find a request with that email.' 
              }}
            </p>
            <NuxtLink to="/auth/register" class="inline-block px-6 py-3 bg-gold-400 text-black font-bold rounded-xl">
              {{ language === 'es' ? 'Registrarme' : 'Register' }}
            </NuxtLink>
          </div>
        </div>

        <!-- Help Text -->
        <div class="mt-8 text-center">
          <p class="text-gray-500 text-sm">
            {{ language === 'es' ? '¿Necesitas ayuda?' : 'Need help?' }}
            <a href="mailto:support@niikskate.com" class="text-gold-400 hover:underline ml-1">
              support@niikskate.com
            </a>
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
