import { requireAdmin } from '~/server/utils/requireAdmin'
import { errorText, isMissingAllianceTable, listAlliances } from '~/server/utils/allianceRows'

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireAdmin(event)
  try {
    const alliances = await listAlliances(adminClient, false)
    return { alliances, missing: false }
  } catch (error: unknown) {
    const message = errorText(error)
    if (isMissingAllianceTable(message)) {
      throw createError({
        statusCode: 503,
        message: 'Falta la tabla de alianzas. Ejecuta supabase/migrations/add_alliances.sql en el editor SQL de Supabase.',
      })
    }
    throw createError({ statusCode: 500, message })
  }
})
