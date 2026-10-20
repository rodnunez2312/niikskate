import { requireAdmin } from '~/server/utils/requireAdmin'
import { allianceFromBody, isMissingAllianceTable, saveAlliance } from '~/server/utils/allianceRows'

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()
  if (!id) throw createError({ statusCode: 400, message: 'Missing alliance id' })
  const body = await readBody(event)
  try {
    const alliance = await saveAlliance(adminClient, allianceFromBody({ ...body, id }, ''))
    return { alliance }
  } catch (error: unknown) {
    const known = error as { statusCode?: number; message?: string }
    if (known.statusCode) throw error
    const message = known.message || 'Could not save alliance'
    if (isMissingAllianceTable(message)) {
      throw createError({ statusCode: 503, message: 'Falta la tabla de alianzas. Ejecuta supabase/migrations/add_alliances.sql.' })
    }
    throw createError({ statusCode: 400, message })
  }
})
