import { getDay } from 'date-fns'
import { createClient } from '@supabase/supabase-js'
import { getHeader } from 'h3'
import {
  countCoachesForSlot,
  countEnrollments,
  enrichSession,
  getServiceSupabase,
  resolveMaxCapacity,
} from '~/server/utils/bookableSessions'
import {
  computeAgeFromDob,
  ineligibilityReason,
  isAgeEligibleForSession,
} from '~/utils/ageEligibility'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseAnon = config.public.supabaseKey as string

  const authHeader = getHeader(event, 'authorization') || ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!accessToken) {
    throw createError({ statusCode: 401, message: 'Sign in to join a class' })
  }

  const sessionClient = createClient(supabaseUrl, supabaseAnon)
  const { data: userData, error: userErr } = await sessionClient.auth.getUser(accessToken)
  if (userErr || !userData?.user) {
    throw createError({ statusCode: 401, message: 'Invalid session' })
  }
  const userId = userData.user.id

  const body = await readBody(event)
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
  const childAge = typeof body?.childAge === 'number' ? body.childAge : Number(body?.childAge)
  const crewMemberId =
    typeof body?.crewMemberId === 'string' && body.crewMemberId.trim()
      ? body.crewMemberId.trim()
      : null
  const packRaw = body?.pack
  const packNum = Number(packRaw)
  const pack =
    packNum === 8 || packNum === 12 || packNum === 16 || packNum === 24
      ? (packNum as 8 | 12 | 16 | 24)
      : null
  const weekdays = Array.isArray(body?.weekdays)
    ? [...new Set(
        (body.weekdays as unknown[])
          .map(n => Number(n))
          .filter(n => n === 2 || n === 4 || n === 6),
      )]
    : []

  if (!eventId) {
    throw createError({ statusCode: 400, message: 'eventId is required' })
  }

  const supabase = getServiceSupabase()

  const { data: row, error: evErr } = await supabase
    .from('school_calendar_events')
    .select(
      'id, title, event_type, start_date, end_date, start_time, end_time, location, description, is_bookable, time_slot, audience_category, audience_categories, skill_level, min_age, max_age, skatepark, price_mxn, visible_to_parents, max_capacity_override, program_series_id',
    )
    .eq('id', eventId)
    .single()

  if (evErr || !row) {
    throw createError({ statusCode: 404, message: 'Class session not found' })
  }
  if (!row.is_bookable || !row.visible_to_parents) {
    throw createError({ statusCode: 400, message: 'This session is not open for booking' })
  }
  if (!row.time_slot) {
    throw createError({ statusCode: 400, message: 'Session has no time slot configured' })
  }
  if (row.start_date < new Date().toISOString().slice(0, 10)) {
    throw createError({ statusCode: 400, message: 'This session is in the past' })
  }

  let skaterAge: number | null = Number.isFinite(childAge) && childAge > 0 ? childAge : null

  if (crewMemberId) {
    const { data: crewRow, error: crewErr } = await supabase
      .from('crew_members')
      .select('id, guardian_user_id, date_of_birth, age, first_name')
      .eq('id', crewMemberId)
      .single()
    if (crewErr || !crewRow) {
      throw createError({ statusCode: 404, message: 'Crew member not found' })
    }
    if (crewRow.guardian_user_id !== userId) {
      throw createError({ statusCode: 403, message: 'Not your crew member' })
    }
    skaterAge = computeAgeFromDob(crewRow.date_of_birth, crewRow.age)
  } else {
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('date_of_birth, age')
      .eq('id', userId)
      .single()
    skaterAge = computeAgeFromDob(profileRow?.date_of_birth ?? null, profileRow?.age ?? skaterAge)
  }

  if (!isAgeEligibleForSession(skaterAge, row)) {
    const reason = ineligibilityReason(skaterAge, row, 'es')
    throw createError({
      statusCode: 400,
      message: reason || 'This skater is not eligible for this class',
    })
  }

  const ymdToWeekday = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number)
    return getDay(new Date(y, m - 1, d))
  }

  const enrollIntoSession = async (sessionRow: typeof row) => {
    if (!sessionRow.time_slot) return 'skip' as const
    if (sessionRow.start_date < new Date().toISOString().slice(0, 10)) return 'skip' as const

    let existingQuery = supabase
      .from('class_session_enrollments')
      .select('id, status')
      .eq('calendar_event_id', sessionRow.id)
      .eq('user_id', userId)
    existingQuery = crewMemberId
      ? existingQuery.eq('crew_member_id', crewMemberId)
      : existingQuery.is('crew_member_id', null)
    const { data: existing } = await existingQuery.maybeSingle()
    if (existing?.status === 'confirmed') return 'already' as const

    const coachCount = await countCoachesForSlot(supabase, sessionRow.start_date, sessionRow.time_slot)
    const enrolledCount = await countEnrollments(supabase, sessionRow.id)
    const maxCapacity = resolveMaxCapacity(coachCount, sessionRow.max_capacity_override)
    if (maxCapacity <= 0 || enrolledCount >= maxCapacity) return 'full' as const

    const payload = {
      calendar_event_id: sessionRow.id,
      user_id: userId,
      crew_member_id: crewMemberId,
      child_age: skaterAge,
      status: 'confirmed',
    }
    if (existing) {
      const { error: upErr } = await supabase
        .from('class_session_enrollments')
        .update({ status: 'confirmed', child_age: payload.child_age })
        .eq('id', existing.id)
      if (upErr) throw createError({ statusCode: 400, message: upErr.message })
    } else {
      const { error: insErr } = await supabase.from('class_session_enrollments').insert(payload)
      if (insErr) throw createError({ statusCode: 400, message: insErr.message })
    }
    return 'ok' as const
  }

  if (pack === 8 || pack === 12 || pack === 16 || pack === 24) {
    if ((pack === 8 || pack === 16) && weekdays.length !== 2) {
      throw createError({
        statusCode: 400,
        message: 'Elige 2 días por semana (martes, jueves o sábado).',
      })
    }
    const wantedDays = pack === 12 || pack === 24 ? [2, 4, 6] : weekdays
    let targets = [row]
    if (row.program_series_id) {
      const { data: seriesRows, error: seriesErr } = await supabase
        .from('school_calendar_events')
        .select(
          'id, title, event_type, start_date, end_date, start_time, end_time, location, description, is_bookable, time_slot, audience_category, audience_categories, skill_level, min_age, max_age, skatepark, price_mxn, visible_to_parents, max_capacity_override, program_series_id',
        )
        .eq('program_series_id', row.program_series_id)
        .eq('is_bookable', true)
        .eq('visible_to_parents', true)
      if (seriesErr) throw createError({ statusCode: 400, message: seriesErr.message })
      if (seriesRows?.length) targets = seriesRows as typeof row[]
    }
    targets = targets.filter(t => wantedDays.includes(ymdToWeekday(t.start_date)))
    if (!targets.length) {
      throw createError({ statusCode: 400, message: 'No matching classes for that package' })
    }

    let joined = 0
    let already = 0
    for (const t of targets) {
      const result = await enrollIntoSession(t)
      if (result === 'ok') joined += 1
      if (result === 'already') already += 1
    }
    if (!joined && !already) {
      throw createError({ statusCode: 409, message: 'Those classes are full' })
    }
    const updated = await enrichSession(supabase, row)
    return {
      ok: true,
      alreadyEnrolled: joined === 0 && already > 0,
      pack,
      enrolledCount: joined,
      session: updated,
    }
  }

  const enriched = await enrichSession(supabase, row)
  if (enriched.maxCapacity <= 0) {
    throw createError({ statusCode: 400, message: 'No coaches scheduled for this session yet' })
  }
  if (enriched.spotsLeft <= 0) {
    throw createError({ statusCode: 409, message: 'This class is full' })
  }

  const single = await enrollIntoSession(row)
  if (single === 'already') return { ok: true, alreadyEnrolled: true, session: enriched }
  if (single === 'full' || single === 'skip') {
    throw createError({ statusCode: 409, message: 'This class is full' })
  }
  const updated = await enrichSession(supabase, row)
  return { ok: true, alreadyEnrolled: false, session: updated }
})
