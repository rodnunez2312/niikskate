import { requireAdmin } from '~/server/utils/requireAdmin'
import { getAllianceBySlug, isMissingAllianceTable } from '~/server/utils/allianceRows'

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireAdmin(event)
  const slug = String(getQuery(event).slug || '').trim()
  if (!slug) throw createError({ statusCode: 400, message: 'Missing slug' })
  try {
    const alliance = await getAllianceBySlug(adminClient, slug, false)
    if (!alliance) throw createError({ statusCode: 404, message: 'Alliance not found' })
    return { alliance }
  } catch (error: unknown) {
    const known = error as { statusCode?: number; message?: string }
    if (known.statusCode) throw error
    const message = known.message || 'Could not load alliance'
    if (isMissingAllianceTable(message)) throw createError({ statusCode: 404, message: 'Alliance not found' })
    throw createError({ statusCode: 400, message })
  }
})
