export default defineNuxtRouteMiddleware(async (to, from) => {
  // Only run on client side to avoid SSR issues
  if (import.meta.server) return
  
  const user = useSupabaseUser()
  
  // If not logged in, redirect to login
  if (!user.value) {
    return navigateTo(`/auth/login?redirect=${to.fullPath}`)
  }
})
