<script setup lang="ts">
const router = useRouter()
const route = useRoute()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { t, language } = useI18n()

const email = ref('')
const password = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

// Redirect if already logged in → dashboard (coach/admin home), or custom ?redirect=
watch(user, async (newUser) => {
  if (newUser) {
    const explicitRedirect = route.query.redirect as string
    if (explicitRedirect) {
      router.push(explicitRedirect)
      return
    }
    const { data } = await client.from('profiles').select('role').eq('id', newUser.id).single()
    const role = data?.role
    if (role === 'coach' || role === 'admin') {
      router.push('/dashboard')
    } else {
      router.push('/')
    }
  }
}, { immediate: true })

const handleLogin = async () => {
  loading.value = true
  error.value = null

  try {
    const { error: authError } = await client.auth.signInWithPassword({
      email: email.value,
      password: password.value,
    })

    if (authError) throw authError

    const explicitRedirect = route.query.redirect as string
    if (explicitRedirect) {
      router.push(explicitRedirect)
      return
    }
    const { data } = await client.from('profiles').select('role').eq('id', user.value!.id).single()
    const role = data?.role
    if (role === 'coach' || role === 'admin') {
      router.push('/dashboard')
    } else {
      router.push('/')
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to sign in'
  } finally {
    loading.value = false
  }
}

const handleGoogleLogin = async () => {
  loading.value = true
  error.value = null

  try {
    const { error: authError } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (authError) throw authError
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to sign in with Google'
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex flex-col">
    <!-- Header -->
    <header class="pt-safe px-4 py-4 flex items-center justify-between">
      <button
        @click="router.back()"
        class="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center"
      >
        <svg class="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <LanguageCurrencyToggle class="text-gray-700" />
    </header>

    <!-- Content -->
    <div class="flex-1 flex flex-col justify-center px-4 pb-safe">
      <div class="max-w-sm mx-auto w-full">
        <!-- Logo -->
        <div class="text-center mb-8">
          <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-yellow-400 flex items-center justify-center text-3xl">
            🛹
          </div>
          <h1 class="text-2xl font-bold text-gray-900">{{ t('auth.welcomeBack') }}</h1>
          <p class="text-gray-500 mt-1">{{ t('auth.signInTo') }}</p>
        </div>

        <!-- Login Form -->
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="label">{{ t('auth.email') }}</label>
            <input
              v-model="email"
              type="email"
              required
              class="input"
              :placeholder="language === 'es' ? 'Ingresa tu correo' : 'Enter your email'"
              autocomplete="email"
            />
          </div>

          <div>
            <label class="label">{{ t('auth.password') }}</label>
            <input
              v-model="password"
              type="password"
              required
              class="input"
              :placeholder="language === 'es' ? 'Ingresa tu contraseña' : 'Enter your password'"
              autocomplete="current-password"
            />
          </div>

          <div class="flex justify-end">
            <NuxtLink to="/auth/forgot-password" class="text-sm text-yellow-600 hover:underline">
              {{ t('auth.forgotPassword') }}
            </NuxtLink>
          </div>

          <p v-if="error" class="text-red-600 text-sm">
            {{ error }}
          </p>

          <button
            type="submit"
            :disabled="loading"
            class="btn bg-yellow-400 text-gray-900 font-bold w-full py-3"
          >
            {{ loading ? t('auth.signingIn') : t('auth.signIn') }}
          </button>
        </form>

        <!-- Divider -->
        <div class="relative my-6">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-200"></div>
          </div>
          <div class="relative flex justify-center text-sm">
            <span class="px-4 bg-gray-50 text-gray-500">{{ t('auth.orContinueWith') }}</span>
          </div>
        </div>

        <!-- Social Login -->
        <button
          @click="handleGoogleLogin"
          :disabled="loading"
          class="btn-ghost w-full py-3 border border-gray-200"
        >
          <svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google
        </button>

        <!-- Sign Up Link -->
        <p class="text-center mt-6 text-gray-600">
          {{ t('auth.noAccount') }}
          <NuxtLink to="/auth/register" class="text-yellow-600 font-medium hover:underline">
            {{ t('auth.signUp') }}
          </NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
