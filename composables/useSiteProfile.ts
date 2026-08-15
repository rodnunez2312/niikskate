/** Shared profile role for public + member shells. */
export function useSiteProfile() {
  const user = useSupabaseUser()
  const client = useSupabaseClient()

  const role = ref<'admin' | 'coach' | 'customer' | null>(null)
  const fullName = ref<string | null>(null)
  const loading = ref(false)

  const isAdmin = computed(() => role.value === 'admin')
  const isCoach = computed(() => role.value === 'coach')
  const isStudent = computed(() => role.value === 'customer')
  const isStaff = computed(() => isAdmin.value || isCoach.value)

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
        return
      }
      loading.value = true
      try {
        const { data } = await client
          .from('profiles')
          .select('role, full_name')
          .eq('id', id)
          .single()
        role.value = (data?.role as typeof role.value) ?? 'customer'
        fullName.value = data?.full_name?.trim() || null
      } finally {
        loading.value = false
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
    memberEntryPath,
  }
}
