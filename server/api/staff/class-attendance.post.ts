/** Check-in spends one matching token. Excused and cancelled return it. */
import { requireStaff } from '~/server/utils/requireStaff'
import { applyClassAttendance } from '~/server/utils/classTokens'
import type { AttendanceMark } from '~/utils/classTokens'

const MARKS = new Set<AttendanceMark>(['present', 'absent', 'excused', 'cancelled'])

export default defineEventHandler(async (event) => {
  const { adminClient, staffId } = await requireStaff(event)
  const body = await readBody(event)
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
  const skaterId = typeof body?.skaterId === 'string' ? body.skaterId.trim() : ''
  const kind = body?.kind === 'crew' ? 'crew' : 'profile'
  const status = MARKS.has(body?.status) ? body.status as AttendanceMark : null
  const override = body?.override === true
  if (!eventId || !skaterId || !status) {
    throw createError({ statusCode: 400, message: 'eventId, skaterId and status are required' })
  }

  const { data: sessionRow, error } = await adminClient
    .from('school_calendar_events')
    .select('id, event_type, coach_tier')
    .eq('id', eventId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, message: error.message })
  if (!sessionRow) throw createError({ statusCode: 404, message: 'Class not found' })

  return applyClassAttendance(adminClient, {
    kind,
    skaterId,
    eventId,
    eventType: sessionRow.event_type,
    coachTier: sessionRow.coach_tier,
    status,
    override,
    actorId: staffId,
  })
})
