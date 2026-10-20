/**
 * Cancel one or more class sessions (weather, wet park) and email
 * each enrolled parent or student with when the class can be retaken.
 */
import { requireAdmin } from '~/server/utils/requireAdmin'
import { cancelClassSessions } from '~/server/utils/cancelClassSessions'

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireAdmin(event)
  const body = await readBody(event)
  const eventIds = Array.isArray(body?.eventIds)
    ? [...new Set(body.eventIds.filter((id: unknown) => typeof id === 'string' && id.trim()))] as string[]
    : []
  const makeupNote = typeof body?.makeupNote === 'string' ? body.makeupNote.trim() : ''
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'weather'

  if (!eventIds.length) {
    throw createError({ statusCode: 400, message: 'Pick at least one class' })
  }
  if (!makeupNote) {
    throw createError({ statusCode: 400, message: 'Say when the class can be retaken' })
  }

  return cancelClassSessions(adminClient, eventIds, makeupNote, reason)
})
