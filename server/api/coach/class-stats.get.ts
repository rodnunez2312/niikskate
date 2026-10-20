/** Lifetime class totals for the signed-in coach. Same rules as coach activity. */
import { requireStaff } from '~/server/utils/requireStaff'

export default defineEventHandler(async (event) => {
  const { staffId, adminClient } = await requireStaff(event)

  const { data: seats, error } = await adminClient
    .from('class_session_coaches')
    .select('calendar_event_id, delivered')
    .eq('coach_id', staffId)

  if (error) throw createError({ statusCode: 500, message: error.message })

  const givenIds = (seats || []).filter(s => s.delivered).map(s => s.calendar_event_id)
  const allIds = [...new Set((seats || []).map(s => s.calendar_event_id).filter(Boolean))]

  let cancelled = 0
  if (allIds.length) {
    const { data, error: outcomeErr } = await adminClient
      .from('school_calendar_events')
      .select('id')
      .in('id', allIds)
      .eq('session_outcome', 'cancelled')
    if (!outcomeErr) cancelled = data?.length || 0
  }

  let athletes = 0
  if (givenIds.length) {
    const { data: enrolments } = await adminClient
      .from('class_session_enrollments')
      .select('user_id, skater_profile_id, crew_member_id')
      .in('calendar_event_id', givenIds)
      .eq('status', 'confirmed')
    const keys = new Set<string>()
    for (const e of enrolments || []) {
      keys.add(
        e.crew_member_id
          ? `crew:${e.crew_member_id}`
          : e.skater_profile_id
            ? `profile:${e.skater_profile_id}`
            : `profile:${e.user_id}`,
      )
    }
    athletes = keys.size
  }

  let videos = 0
  const { data: sessionVideos, error: sessionVideoError } = await adminClient
    .from('session_videos')
    .select('id')
    .eq('owner_id', staffId)
  if (!sessionVideoError) videos += sessionVideos?.length || 0

  const { data: evaluationVideos, error: evaluationVideoError } = await adminClient
    .from('evaluation_videos')
    .select('id')
    .eq('coach_id', staffId)
  if (!evaluationVideoError) videos += evaluationVideos?.length || 0

  return { given: givenIds.length, cancelled, athletes, videos }
})