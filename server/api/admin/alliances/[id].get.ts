import { requireAdmin } from '~/server/utils/requireAdmin'
import { isMissingAllianceTable, mapAlliance } from '~/server/utils/allianceRows'

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()
  if (!id) throw createError({ statusCode: 400, message: 'Missing alliance id' })
  try {
    const { data, error } = await adminClient.from('alliances').select('*, alliance_areas(*)').eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) throw createError({ statusCode: 404, message: 'Alliance not found' })
    return { alliance: mapAlliance(data) }
  } catch (error: unknown) {
    const known = error as { statusCode?: number; message?: string }
    if (known.statusCode) throw error
    const message = known.message || 'Could not load alliance'
    if (isMissingAllianceTable(message)) {
      throw createError({ statusCode: 503, message: 'Falta la tabla de alianzas. Ejecuta supabase/migrations/add_alliances.sql.' })
    }
    throw createError({ statusCode: 400, message })
  }
})
