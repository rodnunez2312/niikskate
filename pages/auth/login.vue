<script setup lang="ts">
const router = useRouter()
const route = useRoute()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { t, language } = useI18n()

const identifier = ref('')
const password = ref('')
const loading = ref(false)
const error = ref<string | null>(null)

const normalizePhone = (value: string) => value.replace(/\D/g, '')

const resolveEmailFromIdentifier = async (value: string) => {
  const raw = value.trim()
  if (raw.includes('@')) return raw

  const digits = normalizePhone(raw)
  if (!digits) return raw

  const { data, error: lookupError } = await client
    .from('profiles')
    .select('email, phone')
    .not('phone', 'is', null)

  if (lookupError) throw lookupError

  const match = (data || []).find((p: any) => {
    const pPhone = normalizePhone(p.phone || '')
    return pPhone === digits || (p.phone || '').trim() === raw
  })

  return match?.email || raw
}

const ensureProfileApproved = async (userId: string) => {
  const { data, error: profileError } = await client
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .single()

  if (profileError || !data) {
    await client.auth.signOut()
    throw new Error(language.value === 'es'
      ? 'No se encontró tu perfil. Contacta a un administrador.'
      : 'Your profile was not found. Please contact an admin.')
  }

  if (!data.is_active) {
    await client.auth.signOut()
    throw new Error(language.value === 'es'
      ? 'Tu acceso está pendiente de aprobación por un administrador.'
      : 'Your access is pending admin approval.')
  }

  return data.role
}

onMounted(() => {
  const reason = route.query.reason as string
  if (reason === 'pending_approval') {
    error.value = language.value === 'es'
      ? 'Tu acceso está pendiente de aprobación por un administrador.'
      : 'Your access is pending admin approval.'
  }
})

// Redirect if already logged in → dashboard (coach/admin home), or custom ?redirect=
watch(user, async (newUser) => {
  if (newUser) {
    try {
      const role = await ensureProfileApproved(newUser.id)
      const explicitRedirect = route.query.redirect as string
      if (explicitRedirect) {
        router.push(explicitRedirect)
        return
      }
      router.push('/member')
    } catch (e) {
      error.value = e instanceof Error ? e.message : (language.value === 'es' ? 'Error al iniciar sesión' : 'Sign-in error')
    }
  }
}, { immediate: true })

const handleLogin = async () => {
  loading.value = true
  error.value = null

  try {
    const email = await resolveEmailFromIdentifier(identifier.value)
    const { data: signInData, error: authError } = await client.auth.signInWithPassword({
      email,
      password: password.value,
    })

    if (authError) throw authError

    const signedInId = signInData.user?.id
    if (!signedInId) {
      throw new Error(language.value === 'es'
        ? 'No se pudo obtener la sesión. Vuelve a intentar.'
        : 'Could not load session. Try again.')
    }

    const role = await ensureProfileApproved(signedInId)
    const explicitRedirect = route.query.redirect as string
    if (explicitRedirect) {
      router.push(explicitRedirect)
      return
    }
    router.push('/member')
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e)
    const isNetwork =
      raw === 'Failed to fetch' ||
      raw.includes('NetworkError') ||
      raw.includes('Load failed')
    if (isNetwork) {
      error.value =
        language.value === 'es'
          ? 'Sin conexión al servidor de datos. Revisa tu red; en Vercel, confirma SUPABASE_URL y SUPABASE_KEY y redeploy; en Supabase, que el proyecto no esté pausado.'
          : 'Cannot reach the data server. Check your network; on Vercel set SUPABASE_URL and SUPABASE_KEY and redeploy; in Supabase, ensure the project is not paused.'
    } else {
      error.value = raw || (language.value === 'es' ? 'Error al iniciar sesión' : 'Failed to sign in')
    }
  } finally {
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
            <label class="label">{{ language === 'es' ? 'Correo o teléfono' : 'Email or phone' }}</label>
            <input
              v-model="identifier"
              type="text"
              required
              class="input"
              :placeholder="language === 'es' ? 'Ingresa correo o teléfono' : 'Enter email or phone'"
              autocomplete="username"
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
