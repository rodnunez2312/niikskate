export type AdminBuildInfo = {
  shaShort: string
  shaFull: string
  message: string
  builtAt: string
  environment: string
  branch: string
}

/** Load deploy commit info (admin session only). */
export function useAdminBuildInfo() {
  const { isAdmin, loading: profileLoading } = useSiteProfile()
  const client = useSupabaseClient()

  const info = ref<AdminBuildInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function refresh() {
    if (!isAdmin.value) {
      info.value = null
      return
    }
    loading.value = true
    error.value = null
    try {
      const { data: sessionData } = await client.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        info.value = null
        return
      }
      info.value = await $fetch<AdminBuildInfo>('/api/admin/build-info', {
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch (e: unknown) {
      info.value = null
      error.value = e instanceof Error ? e.message : 'Could not load build info'
    } finally {
      loading.value = false
    }
  }

  watch(
    [isAdmin, profileLoading],
    () => {
      if (profileLoading.value) return
      if (isAdmin.value) refresh()
      else info.value = null
    },
    { immediate: true },
  )

  const envLabel = computed(() => {
    const env = info.value?.environment
    if (env === 'production') return 'prod'
    if (env === 'preview') return 'preview'
    if (env === 'development') return 'dev'
    return env || '—'
  })

  const builtAtLocal = computed(() => {
    if (!info.value?.builtAt) return ''
    try {
      return new Date(info.value.builtAt).toLocaleString()
    } catch {
      return info.value.builtAt
    }
  })

  return { info, loading, error, refresh, envLabel, builtAtLocal }
}
