<script setup lang="ts">
const router = useRouter()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { t, language } = useI18n()

const fullName = ref('')
const email = ref('')
const phone = ref('')
const message = ref('')
const loading = ref(false)
const error = ref<string | null>(null)
const success = ref(false)

// Check if email already has a pending request
const existingRequest = ref<boolean>(false)

// Redirect if already logged in
watch(user, (newUser) => {
  if (newUser) {
    router.push('/')
  }
}, { immediate: true })

const handleRegister = async () => {
  if (!fullName.value || !email.value) {
    error.value = language.value === 'es' ? 'Por favor completa todos los campos requeridos' : 'Please fill in all required fields'
    return
  }

  loading.value = true
  error.value = null

  try {
    // Check if email already has a pending request
    const { data: existing } = await client
      .from('registration_requests')
      .select('id, status')
      .eq('email', email.value)
      .single()

    if (existing) {
      if (existing.status === 'pending') {
        existingRequest.value = true
        error.value = language.value === 'es' 
          ? 'Ya tienes una solicitud pendiente con este correo.' 
          : 'You already have a pending request with this email.'
        return
      } else if (existing.status === 'approved') {
        error.value = language.value === 'es' 
          ? 'Este correo ya ha sido aprobado. Intenta iniciar sesión.' 
          : 'This email has already been approved. Try signing in.'
        return
      }
    }

    // Create registration request
    const { error: insertError } = await client
      .from('registration_requests')
      .insert({
        email: email.value,
        full_name: fullName.value,
        phone: phone.value || null,
        message: message.value || null,
        status: 'pending',
      })

    if (insertError) throw insertError

    // Link any guest bookings to this email
    const localBookings = JSON.parse(localStorage.getItem('guest_bookings') || '[]')
    const matchingBookings = localBookings.filter((b: any) => b.email === email.value)
    if (matchingBookings.length > 0) {
      // Store the association for when they're approved
      localStorage.setItem('pending_booking_email', email.value)
    }

    success.value = true
  } catch (e) {
    console.error('Registration error:', e)
    error.value = e instanceof Error ? e.message : 'Failed to submit registration'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-black flex flex-col">
    <!-- Header -->
    <header class="pt-safe px-4 py-4 flex items-center justify-between">
      <button
        @click="router.back()"
        class="w-10 h-10 rounded-full bg-gray-900 border border-gray-800 flex items-center justify-center"
      >
        <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <LanguageCurrencyToggle />
    </header>

    <!-- Content -->
    <div class="flex-1 flex flex-col justify-center px-4 pb-safe">
      <div class="max-w-sm mx-auto w-full">
        <!-- Success State -->
        <div v-if="success" class="text-center">
          <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-glass-purple/20 border-2 border-glass-purple flex items-center justify-center">
            <svg class="w-10 h-10 text-glass-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 class="text-2xl font-bold text-white mb-2">
            {{ language === 'es' ? '¡Solicitud Enviada!' : 'Request Submitted!' }}
          </h2>
          <p class="text-gray-400 mb-6">
            {{ language === 'es' 
              ? 'Tu solicitud de registro está siendo revisada. Te notificaremos por correo cuando sea aprobada.' 
              : 'Your registration request is being reviewed. We\'ll notify you by email when approved.' 
            }}
          </p>
          
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
            <div class="flex items-center gap-3 text-left">
              <div class="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center shrink-0">
                <span class="text-xl">📧</span>
              </div>
              <div>
                <p class="text-sm text-gray-400">{{ language === 'es' ? 'Correo registrado' : 'Registered email' }}</p>
                <p class="font-semibold text-white">{{ email }}</p>
              </div>
            </div>
          </div>

          <NuxtLink to="/" class="inline-block px-8 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold rounded-xl">
            {{ language === 'es' ? 'Volver al Inicio' : 'Back to Home' }}
          </NuxtLink>
          
          <p class="text-sm text-gray-500 mt-4">
            {{ language === 'es' 
              ? '¿Ya fuiste aprobado?' 
              : 'Already approved?' 
            }}
            <NuxtLink to="/auth/login" class="text-gold-400 hover:underline">
              {{ language === 'es' ? 'Inicia sesión' : 'Sign in' }}
            </NuxtLink>
          </p>
        </div>

        <!-- Registration Form -->
        <template v-else>
          <!-- Logo -->
          <div class="text-center mb-8">
            <div class="w-20 h-20 mx-auto mb-4 rounded-3xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-4xl shadow-lg">
              🛹
            </div>
            <h1 class="text-2xl font-bold text-white">
              {{ language === 'es' ? 'Únete a NiikSkate' : 'Join NiikSkate' }}
            </h1>
            <p class="text-gray-400 mt-2">
              {{ language === 'es' 
                ? 'Solicita tu registro para acceder a todas las funciones' 
                : 'Request registration to access all features' 
              }}
            </p>
          </div>

          <!-- Info Box -->
          <div class="bg-glass-blue/10 border border-glass-blue/30 rounded-xl p-4 mb-6">
            <div class="flex items-start gap-3">
              <span class="text-xl">ℹ️</span>
              <p class="text-sm text-gray-300">
                {{ language === 'es' 
                  ? 'Las registraciones requieren aprobación de un administrador para mantener nuestra comunidad segura.' 
                  : 'Registrations require admin approval to keep our community safe.' 
                }}
              </p>
            </div>
          </div>

          <form @submit.prevent="handleRegister" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Nombre completo' : 'Full name' }}
                <span class="text-flame-500">*</span>
              </label>
              <input
                v-model="fullName"
                type="text"
                required
                class="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none"
                :placeholder="language === 'es' ? 'Tu nombre completo' : 'Your full name'"
                autocomplete="name"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Correo electrónico' : 'Email' }}
                <span class="text-flame-500">*</span>
              </label>
              <input
                v-model="email"
                type="email"
                required
                class="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none"
                :placeholder="language === 'es' ? 'Tu correo electrónico' : 'Your email'"
                autocomplete="email"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Teléfono' : 'Phone' }}
                <span class="text-gray-500 text-xs">({{ language === 'es' ? 'opcional' : 'optional' }})</span>
              </label>
              <input
                v-model="phone"
                type="tel"
                class="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none"
                :placeholder="language === 'es' ? 'Tu número de teléfono' : 'Your phone number'"
                autocomplete="tel"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? '¿Por qué quieres unirte?' : 'Why do you want to join?' }}
                <span class="text-gray-500 text-xs">({{ language === 'es' ? 'opcional' : 'optional' }})</span>
              </label>
              <textarea
                v-model="message"
                rows="3"
                class="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none resize-none"
                :placeholder="language === 'es' ? 'Cuéntanos sobre ti o tu hijo...' : 'Tell us about yourself or your child...'"
              ></textarea>
            </div>

            <p v-if="error" class="text-flame-500 text-sm bg-flame-500/10 border border-flame-500/30 rounded-xl p-3">
              {{ error }}
            </p>

            <button
              type="submit"
              :disabled="loading"
              class="w-full py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold rounded-xl transition-all disabled:opacity-50"
            >
              <span v-if="loading" class="flex items-center justify-center gap-2">
                <svg class="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {{ language === 'es' ? 'Enviando...' : 'Submitting...' }}
              </span>
              <span v-else>
                {{ language === 'es' ? 'Enviar Solicitud' : 'Submit Request' }}
              </span>
            </button>
          </form>

          <!-- Terms -->
          <p class="text-center text-xs text-gray-500 mt-4">
            {{ language === 'es' 
              ? 'Al enviar, aceptas nuestros Términos de Servicio y Política de Privacidad' 
              : 'By submitting, you agree to our Terms of Service and Privacy Policy' }}
          </p>

          <!-- Sign In Link -->
          <p class="text-center mt-6 text-gray-400">
            {{ language === 'es' ? '¿Ya tienes cuenta?' : 'Already have an account?' }}
            <NuxtLink to="/auth/login" class="text-gold-400 font-medium hover:underline ml-1">
              {{ language === 'es' ? 'Iniciar sesión' : 'Sign in' }}
            </NuxtLink>
          </p>
        </template>
      </div>
    </div>
  </div>
</template>
