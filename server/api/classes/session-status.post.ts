/**
 * Admin, or the coach assigned to the class, marks it done or cancelled.
 * Done is what coach activity counts. Cancel emails enrolled families.
 */
import { requireStaff } from '~/server/utils/requireStaff'
import { cancelClassSessions } from '~/server/utils/cancelClassSessions'

export default defineEventHandler(async (event) => {
  const { staffId, role, adminClient } = await requireStaff(event)
  const body = await readBody(event)
  const fromList = Array.isArray(body?.eventIds)
    ? body.eventIds.filter((id: unknown) => typeof id === 'string' && id.trim())
    : []
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
  let eventIds = [...new Set(fromList.length ? fromList : eventId ? [eventId] : [])] as string[]
  const outcome = body?.outcome === 'done' || body?.outcome === 'cancelled' || body?.outcome === 'open'
    ? body.outcome
    : ''
  const makeupNote = typeof body?.makeupNote === 'string' ? body.makeupNote.trim() : ''
  const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''

  if (!eventIds.length || !outcome) {
    throw createError({ statusCode: 400, message: 'eventId and outcome are required' })
  }

  if (role === 'coach') {
    const { data: seats } = await adminClient
      .from('class_session_coaches')
      .select('calendar_event_id')
      .eq('coach_id', staffId)
      .in('calendar_event_id', eventIds)
    const allowed = new Set((seats || []).map(row => row.calendar_event_id))
    eventIds = eventIds.filter(id => allowed.has(id))
    if (!eventIds.length) {
      throw createError({ statusCode: 403, message: 'You are not assigned to this class' })
    }
  }

  if (outcome === 'open') {
    const { error } = await adminClient
      .from('school_calendar_events')
      .update({
        session_outcome: null,
        cancelled_at: null,
        cancellation_reason: null,
        makeup_note: null,
      })
      .in('id', eventIds)
    if (error && !/session_outcome|schema cache/i.test(error.message)) {
      throw createError({ statusCode: 500, message: error.message })
    }
    const clearDelivered = adminClient
      .from('class_session_coaches')
      .update({ delivered: false })
      .in('calendar_event_id', eventIds)
    const { error: delErr } = role === 'coach'
      ? await clearDelivered.eq('coach_id', staffId)
      : await clearDelivered
    if (delErr) throw createError({ statusCode: 500, message: delErr.message })
    return { outcome: 'open', count: eventIds.length }
  }

  if (outcome === 'cancelled') {
    if (eventIds.length !== 1) {
      throw createError({ statusCode: 400, message: 'Cancel one class at a time' })
    }
    const result = await cancelClassSessions(adminClient, eventIds, makeupNote, reason || 'clima')
    return { outcome: 'cancelled', ...result }
  }

  let { error } = await adminClient
    .from('school_calendar_events')
    .update({
      session_outcome: 'done',
      cancelled_at: null,
      cancellation_reason: null,
      makeup_note: null,
    })
    .in('id', eventIds)

  if (error && /session_outcome|schema cache/i.test(error.message)) {
    throw createError({
      statusCode: 400,
      message: 'Run supabase/migrations/add_class_cancellations.sql in the Supabase SQL editor, then try again.',
    })
  }
  if (error) throw createError({ statusCode: 500, message: error.message })

  const delivered = adminClient
    .from('class_session_coaches')
    .update({ delivered: true })
    .in('calendar_event_id', eventIds)
  const { error: delErr } = role === 'coach'
    ? await delivered.eq('coach_id', staffId)
    : await delivered
  if (delErr) throw createError({ statusCode: 500, message: delErr.message })

  return { outcome: 'done', count: eventIds.length }
})
