export default defineNuxtRouteMiddleware(async to => {
  if (import.meta.server) return

  const user = useSupabaseUser()
  if (!user.value) {
    return navigateTo(`/auth/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }

  const client = useSupabaseClient()
  const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  const role = data?.role

  const studentOnly = to.path.startsWith('/member/student')
  const coachOnly = to.path.startsWith('/member/coach')
  const adminOnly = to.path.startsWith('/member/admin')

  if (studentOnly && role !== 'customer') {
    return navigateTo(role === 'admin' || role === 'coach' ? '/member/staff/dashboard' : '/member/coach/home')
  }
  if (coachOnly && role !== 'coach' && role !== 'admin') {
    return navigateTo('/member/student')
  }
  // Coaches may open competitions (Skate Program sidebar) but not other admin tools.
  const coachSharedAdmin =
    to.path === '/member/admin/competitions' || to.path.startsWith('/member/admin/competitions/')

  const staffShared = to.path.startsWith('/member/staff')
  if (staffShared && role !== 'admin' && role !== 'coach') {
    return navigateTo('/member/student')
  }

  if (adminOnly && role !== 'admin' && !(role === 'coach' && coachSharedAdmin)) {
    return navigateTo(role === 'coach' ? '/member/staff/dashboard' : '/member/student')
  }
})
