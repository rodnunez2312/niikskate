type SiteRole = 'admin' | 'coach' | 'customer'

/** Shared profile role for public + member shells. */
export function useSiteProfile() {
  const user = useSupabaseUser()
  const client = useSupabaseClient()

  const role = useState<SiteRole | null>('site-profile-role', () => null)
  const fullName = useState<string | null>('site-profile-name', () => null)
  const fetching = useState('site-profile-fetching', () => false)
  /** User id the shared role belongs to (or is being fetched for). */
  const profileFor = useState<string | null>('site-profile-for', () => null)

  const isAdmin = computed(() => role.value === 'admin')
  const isCoach = computed(() => role.value === 'coach')
  const isStudent = computed(() => role.value === 'customer')
  const isStaff = computed(() => isAdmin.value || isCoach.value)
  /** Signed in but the role is not known yet — shells should not guess. */
  const roleResolving = computed(() => Boolean(user.value) && role.value === null)
  /** True until the signed-in user's role is known (also during SSR). */
  const loading = computed(() => fetching.value || roleResolving.value)

  const memberEntryPath = computed(() => {
    if (!user.value) return '/auth/login?redirect=/member'
    if (loading.value || role.value === null) return '/member'
    if (isAdmin.value) return '/member/staff/dashboard'
    if (isCoach.value) return '/member/staff/dashboard'
    if (isStudent.value) return '/member/student'
    return '/member'
  })

  watch(
    () => user.value?.id,
    async id => {
      if (!id) {
        role.value = null
        fullName.value = null
        profileFor.value = null
        return
      }
      // Fetched in the browser only: an un-awaited SSR fetch would hydrate as "already loading".
      if (import.meta.server || profileFor.value === id) return
      profileFor.value = id
      role.value = null
      fullName.value = null
      fetching.value = true
      try {
        const { data } = await client
          .from('profiles')
          .select('role, full_name')
          .eq('id', id)
          .single()
        if (profileFor.value !== id) return
        role.value = (data?.role as SiteRole | undefined) ?? 'customer'
        fullName.value = data?.full_name?.trim() || null
      } catch {
        if (profileFor.value !== id) return
        profileFor.value = null
        role.value = 'customer'
      } finally {
        if (profileFor.value === id || profileFor.value === null) fetching.value = false
      }
    },
    { immediate: true },
  )

  return {
    role,
    fullName,
    loading,
    isAdmin,
    isCoach,
    isStudent,
    isStaff,
    roleResolving,
    memberEntryPath,
  }
}
