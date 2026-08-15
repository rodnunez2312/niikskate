import {
  enrichSession,
  getServiceSupabase,
  getSessionUserId,
  type BookableSessionRow,
} from '~/server/utils/bookableSessions'
import { getProgramSeasonBySlug } from '~/utils/programSeasons'
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const skatepark = typeof query.skatepark === 'string' ? query.skatepark.trim() : ''
  const seasonSlug = typeof query.season === 'string' ? query.season.trim() : ''
  const crewMemberId =
    typeof query.crewMemberId === 'string' && query.crewMemberId.trim()
      ? query.crewMemberId.trim()
      : null
  const today = new Date().toISOString().slice(0, 10)

  const supabase = getServiceSupabase()
  let q = supabase
    .from('school_calendar_events')
    .select(
      'id, title, event_type, start_date, end_date, start_time, end_time, location, description, is_bookable, time_slot, audience_category, audience_categories, skill_level, min_age, max_age, skatepark, price_mxn, program_series_id, max_capacity_override, season_slug',
    )
    .eq('event_type', 'class_session')
    .eq('is_bookable', true)
    .eq('visible_to_parents', true)
    .gte('start_date', today)
    .not('time_slot', 'is', null)
    .order('start_date', { ascending: true })

  const { data, error } = await q
  if (error) {
    const msg = error.message || 'Database error'
    if (/fetch failed|certificate/i.test(msg)) {
      throw createError({
        statusCode: 503,
        message:
          'Supabase unreachable from server (corporate VPN/proxy TLS). Restart dev with start-app.bat.',
      })
    }
    throw createError({ statusCode: 500, message: msg })
  }

  let rows = (data || []) as BookableSessionRow[]
  if (seasonSlug) {
    const season = getProgramSeasonBySlug(seasonSlug)
    rows = rows.filter(r => {
      if (r.season_slug) return r.season_slug === seasonSlug
      if (season) {
        return r.start_date >= season.startDate && r.start_date <= season.endDate
      }
      return false
    })
  }
  if (skatepark) {
    rows = rows.filter(
      r =>
        !r.skatepark
        || r.skatepark === skatepark
        || r.location === skatepark,
    )
  }
  const sessions = await Promise.all(rows.map(row => enrichSession(supabase, row)))

  const userId = await getSessionUserId(event)
  let myEnrollments: string[] = []
  if (userId) {
    let enrQuery = supabase
      .from('class_session_enrollments')
      .select('calendar_event_id')
      .eq('user_id', userId)
      .eq('status', 'confirmed')

    enrQuery = crewMemberId
      ? enrQuery.eq('crew_member_id', crewMemberId)
      : enrQuery.is('crew_member_id', null)

    const { data: enr } = await enrQuery
    myEnrollments = (enr || []).map((e: { calendar_event_id: string }) => e.calendar_event_id)
  }

  return {
    sessions: sessions.map(s => ({
      ...s,
      isEnrolled: myEnrollments.includes(s.id),
    })),
  }
})
