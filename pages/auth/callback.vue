<script setup lang="ts">
const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()

// Wait for auth to complete and redirect to dashboard for coach/admin, else home
watch(user, async (newUser) => {
  if (newUser) {
    const { data } = await client.from('profiles').select('role').eq('id', newUser.id).single()
    const role = data?.role
    if (role === 'coach' || role === 'admin') {
      router.push('/dashboard')
    } else {
      router.push('/')
    }
  }
}, { immediate: true })

onMounted(() => {
  // If no user after a timeout, redirect to login
  setTimeout(() => {
    if (!user.value) {
      router.push('/auth/login')
    }
  }, 5000)
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50">
    <div class="text-center">
      <div class="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-primary flex items-center justify-center animate-pulse">
        <svg class="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
      <p class="text-gray-600">Completing sign in...</p>
    </div>
  </div>
</template>
