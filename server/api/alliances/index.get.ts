import { getServiceSupabase } from '~/server/utils/bookableSessions'
import { errorText, isMissingAllianceTable, listAlliances } from '~/server/utils/allianceRows'

export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    const client = getServiceSupabase()
    const alliances = await listAlliances(client, true)
    return { alliances: alliances.map(alliance => ({ ...alliance, internal_notes: '' })), missing: false }
  } catch (error: unknown) {
    const message = errorText(error)
    if (isMissingAllianceTable(message)) return { alliances: [], missing: true }
    throw createError({ statusCode: 500, message })
  }
})
