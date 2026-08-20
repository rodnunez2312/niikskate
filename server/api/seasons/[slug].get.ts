import { getServiceSupabase } from '~/server/utils/bookableSessions'
import { loadVisibleProgramSeasons } from '~/server/utils/programSeasonRows'
import { getProgramSeasonBySlug, PROGRAM_SEASONS } from '~/utils/programSeasons'

export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') || '').trim()
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Missing season slug' })
  }

  try {
    const supabase = getServiceSupabase()
    const visible = await loadVisibleProgramSeasons(supabase)
    const found = getProgramSeasonBySlug(slug, visible)
    if (found) return found
    throw createError({ statusCode: 404, message: 'Temporada no encontrada' })
  } catch (e: unknown) {
    const err = e as { statusCode?: number }
    if (err?.statusCode === 404) throw e
  }

  const builtIn = getProgramSeasonBySlug(slug, PROGRAM_SEASONS)
  if (!builtIn) {
    throw createError({ statusCode: 404, message: 'Temporada no encontrada' })
  }
  return builtIn
})
