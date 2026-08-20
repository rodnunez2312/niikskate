import type { ProgramSeason } from '~/utils/programSeasons'
import { getProgramSeasonBySlug, PROGRAM_SEASONS } from '~/utils/programSeasons'

export function useProgramSeasons() {
  const client = useSupabaseClient()
  const { data, pending, refresh } = useFetch<ProgramSeason[]>('/api/seasons', {
    default: () => [...PROGRAM_SEASONS],
  })

  const seasons = computed(() => (Array.isArray(data.value) ? data.value : PROGRAM_SEASONS))

  const bySlug = (slug: string) => getProgramSeasonBySlug(slug, seasons.value)

  const removeSeason = async (slug: string) => {
    const { data: sessionData } = await client.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('Session expired')
    await $fetch(`/api/admin/seasons/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    await refresh()
  }

  return { seasons, pending, refresh, bySlug, removeSeason }
}
