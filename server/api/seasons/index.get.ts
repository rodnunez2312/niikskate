import { getServiceSupabase } from '~/server/utils/bookableSessions'
import { loadVisibleProgramSeasons } from '~/server/utils/programSeasonRows'
import { PROGRAM_SEASONS } from '~/utils/programSeasons'

export default defineEventHandler(async () => {
  try {
    const supabase = getServiceSupabase()
    return await loadVisibleProgramSeasons(supabase)
  } catch {
    return PROGRAM_SEASONS
  }
})
