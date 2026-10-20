import { getServiceSupabase } from '~/server/utils/bookableSessions'
import { foundingConkalAlliance } from '~/utils/alliances'
import { errorText, getAllianceBySlug, isMissingAllianceTable } from '~/server/utils/allianceRows'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  const slug = String(getRouterParam(event, 'slug') || '').trim()
  if (!slug) throw createError({ statusCode: 400, message: 'Missing slug' })
  try {
    const client = getServiceSupabase()
    const alliance = await getAllianceBySlug(client, slug, true)
    if (!alliance) throw createError({ statusCode: 404, message: 'Alliance not found' })
    return { alliance: { ...alliance, internal_notes: '' } }
  } catch (error: unknown) {
    const known = error as { statusCode?: number }
    if (known.statusCode) throw error
    const message = errorText(error)
    if (isMissingAllianceTable(message) && slug === 'conkal-school') return { alliance: foundingConkalAlliance() }
    if (isMissingAllianceTable(message)) throw createError({ statusCode: 404, message: 'Alliance not found' })
    throw createError({ statusCode: 500, message })
  }
})
