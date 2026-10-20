/** Classes assigned to the signed-in coach on a given day. */
import { requireStaff } from '~/server/utils/requireStaff'

export default defineEventHandler(async (event) => {
  const { staffId, adminClient } = await requireStaff(event)
  const query = getQuery(event)
  const date = typeof query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
    ? query.date
    : new Date().toISOString().slice(0, 10)

  const { data: seats, error } = await adminClient
    .from('class_session_coaches')
    .select('calendar_event_id, delivered')
    .eq('coach_id', staffId)

  if (error) throw createError({ statusCode: 500, message: error.message })
  const ids = [...new Set((seats || []).map(s => s.calendar_event_id).filter(Boolean))]
  if (!ids.length) return { date, classes: [] }

  let rows: Array<Record<string, unknown>> | null = null
  const full = await adminClient
    .from('school_calendar_events')
    .select('id, title, start_date, start_time, skatepark, location, session_outcome')
    .in('id', ids)
    .eq('start_date', date)
    .order('start_time', { ascending: true })

  if (full.error && /session_outcome|schema cache/i.test(full.error.message)) {
    const fallback = await adminClient
      .from('school_calendar_events')
      .select('id, title, start_date, start_time, skatepark, location')
      .in('id', ids)
      .eq('start_date', date)
      .order('start_time', { ascending: true })
    if (fallback.error) throw createError({ statusCode: 500, message: fallback.error.message })
    rows = fallback.data
  } else if (full.error) {
    throw createError({ statusCode: 500, message: full.error.message })
  } else {
    rows = full.data
  }

  const delivered = new Map((seats || []).map(s => [s.calendar_event_id, s.delivered]))
  return {
    date,
    classes: (rows || []).map(row => ({
      id: row.id,
      title: row.title,
      start_time: row.start_time,
      skatepark: row.skatepark,
      location: row.location,
      session_outcome: (row.session_outcome as string | null) ?? null,
      delivered: Boolean(delivered.get(row.id as string)),
    })),
  }
})
