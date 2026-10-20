/**
 * Admin-only: what each coach actually did over a period.
 *
 * Every figure here is something the database recorded, not an estimate. Class
 * capacity elsewhere is derived from who was *available* for a slot, which is a
 * forecast; "classes given" below counts rows in class_session_coaches, which
 * is a record of who ran the class.
 */
import { requireAdmin } from '~/server/utils/requireAdmin'
import { ADMIN_COACH_EMAIL } from '~/composables/coachDirectory'
import { coachMatchesFirstName, defaultBackupFirstName } from '~/utils/coachBackups'
import {
  audienceCategoryLabel,
  isProgressionAudience,
  parseAudienceCategories,
  PROGRAM_AGE_BANDS,
  skillTrackFromLevelId,
  type ProgramSkillTrack,
} from '~/types'

export interface CoachActivityCoach {
  id: string
  name: string
  email: string
  avatar_url: string | null
  title: string | null
  is_active: boolean
  is_head_coach: boolean
  programs: string[]
  /** Classes this coach ran in the period. */
  classes_given: number
  /** Assigned classes marked cancelled in the period. */
  classes_cancelled: number
  /** Skaters enrolled in those classes, deduplicated. */
  athletes_taught: number
  attendance_marked: number
  evaluations: number
  /** Session library clips plus evaluation attachments. */
  videos: number
  session_videos: number
  evaluation_videos: number
  class_plans: number
  tricks_marked: number
  /** Distinct skaters this coach recorded any progress for. */
  athletes_with_progress: number
  /** Classes they ran without leaving a note. */
  classes_without_notes: number
  last_active: string | null
}

export interface CoachActivityWeek {
  /** Monday of the week, yyyy-mm-dd. */
  week_start: string
  classes: number
}

export interface CoachActivityClass {
  id: string
  date: string
  time: string
  title: string
  /** Short age band, such as 5-7 or 7-17. */
  age: string
  coaches: string
  /** Who is taking the class. A cover shows that coach, not the person they replaced. */
  pills: Array<{ id: string; initials: string; name: string }>
  /** Coaches who can mark this class, and who are paid when it is marked done. */
  coachIds: string[]
  /** Monday of the class week, yyyy-mm-dd. */
  weekStart: string
  /** done, cancelled, open (past, not marked), upcoming */
  status: 'done' | 'cancelled' | 'open' | 'upcoming'
  /** Assigned coach is off and nobody available is covering. */
  warning: string
}

export interface CoachActivityResponse {
  from: string
  to: string
  coaches: CoachActivityCoach[]
  totals: {
    classes_given: number
    classes_in_period: number
    classes_cancelled: number
    videos: number
    session_videos: number
    evaluation_videos: number
    athletes_with_progress: number
    /** Skaters with a class bought or assigned in the period. */
    active_skaters: number
    coaches_contributing: number
    /** Coaches assigned to a class in the period. */
    coaches_total: number
    evaluations: number
    class_plans: number
    attendance_marked: number
    tricks_marked: number
  }
  /** Classes in the period, split by the three calendar levels. */
  classes_by_level: Array<{ id: ProgramSkillTrack; given: number; scheduled: number }>
  weekly: CoachActivityWeek[]
  /** Calendar classes from 7 days ago through 7 days ahead. */
  nearby: CoachActivityClass[]
  /** Programs seen on the roster, for the page's filter. */
  programs: Array<{ id: string; name: string }>
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** Coach activity dates are calendar days in Yucatán, not UTC. */
const mxDayStart = (day: string) => `${day}T00:00:00-06:00`
const mxDayEnd = (day: string) => `${day}T23:59:59.999-06:00`

/** Monday of the week containing `d`. */
function weekStart(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = out.getUTCDay()
  out.setUTCDate(out.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  return out
}

const SLOT_FROM_START: Record<string, string> = {
  '07:00': 'morning',
  '16:30': 'monday',
  '17:30': 'early',
  '19:00': 'late',
  '09:00': 'summer',
}

function sportOf(ev: { discipline?: string | null; title?: string | null }) {
  const id = typeof ev?.discipline === 'string' ? ev.discipline.trim() : ''
  if (id === 'skateboarding' || id === 'scooter' || id === 'rollerblading' || id === 'bmx' || id === 'parkour') return id
  const text = typeof ev?.title === 'string' ? ev.title.toLowerCase() : ''
  if (text.includes('scooter')) return 'scooter'
  if (text.includes('bmx')) return 'bmx'
  if (text.includes('parkour')) return 'parkour'
  if (text.includes('patinaje') || text.includes('roller') || text.includes('inline')) return 'rollerblading'
  return 'skateboarding'
}

function classAgeLabel(ev: { title?: string | null; audience_categories?: string[] | null; audience_category?: string | null }) {
  const cats = parseAudienceCategories(ev)
  if (cats.length) {
    if (isProgressionAudience(cats)) return '7-17'
    return cats.map((id) => {
      const band = PROGRAM_AGE_BANDS.find(row => row.id === id)
      if (band) return band.label.es.replaceAll('–', '-')
      const label = audienceCategoryLabel(id, 'es')
      const match = label.match(/\d+\s*[–-]\s*\d+|\d+\+/)
      return match ? match[0].replaceAll('–', '-').replace(/\s/g, '') : label
    }).join(' · ')
  }
  return (ev.title || '').match(/(?:grupo de edad|age group)\s*:\s*([^·]+)/i)?.[1]?.trim().replaceAll('–', '-') || ''
}

function classTimeLabel(start: string | null) {
  const hhmm = start?.slice(0, 5)
  if (!hhmm) return ''
  const [hours, minutes] = hhmm.split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour = ((hours + 11) % 12) + 1
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`
}

/** First and last name initials, e.g. "Marco Antonio Rodriguez" → MR. */
function initialsOf(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  const picked = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts
  return picked.map(part => part[0]?.toUpperCase() || '').join('')
}

/**
 * Calendar classes from the start of the loaded month through this Sunday.
 * The pill is the coach taking the class. A cover shows that coach only.
 */
function shiftYmd(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

async function loadNearbyClasses(
  adminClient: Awaited<ReturnType<typeof requireAdmin>>['adminClient'],
  coachIds: string[],
  assignedOnly: boolean,
  todayKey: string,
  historyMonths: number,
  sports: Set<string>,
): Promise<CoachActivityClass[]> {
  const thisMonday = (() => {
    const [y, m, d] = todayKey.split('-').map(Number)
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
    return shiftYmd(todayKey, dow === 0 ? -6 : 1 - dow)
  })()
  const [year, month] = todayKey.split('-').map(Number)
  const monthStart = new Date(Date.UTC(year, month - 1 - historyMonths, 1)).toISOString().slice(0, 10)
  const from = monthStart
  const to = shiftYmd(thisMonday, 6)

  const { data: events } = await adminClient
    .from('school_calendar_events')
    .select('id, title, start_date, start_time, time_slot, session_outcome, cancelled_at, discipline, audience_category, audience_categories')
    .in('event_type', ['class_session', 'class_individual'])
    .gte('start_date', from)
    .lte('start_date', to)
    .order('start_date', { ascending: true })
    .order('start_time', { ascending: true })

  const rows = (events || []) as Array<{
    id: string
    title: string
    start_date: string
    start_time: string | null
    time_slot: string | null
    session_outcome: string | null
    cancelled_at: string | null
    discipline?: string | null
    audience_category?: string | null
    audience_categories?: string[] | null
  }>
  const visible = sports.size ? rows.filter(row => sports.has(sportOf(row))) : rows
  if (!visible.length) return []

  const eventIds = visible.map(row => row.id)
  const dates = [...new Set(visible.map(row => row.start_date))]
  let assigned: Array<{ calendar_event_id: string; coach_id: string; covering_for: string | null }> | null = null
  const [withCover, withBackup, { data: blockedRows }] = await Promise.all([
    adminClient
      .from('class_session_coaches')
      .select('calendar_event_id, coach_id, covering_for')
      .in('calendar_event_id', eventIds),
    adminClient
      .from('profiles')
      .select('id, full_name, backup_coach_id')
      .in('role', ['coach', 'admin']),
    adminClient
      .from('coach_date_availability')
      .select('coach_id, date, time_slot')
      .in('date', dates)
      .eq('is_available', false),
  ])
  if (withCover.error) {
    const plain = await adminClient
      .from('class_session_coaches')
      .select('calendar_event_id, coach_id')
      .in('calendar_event_id', eventIds)
    assigned = ((plain.data || []) as Array<{ calendar_event_id: string; coach_id: string }>).map(row => ({
      ...row,
      covering_for: null,
    }))
  } else {
    assigned = (withCover.data || []) as NonNullable<typeof assigned>
  }

  let people: Array<{ id: string; full_name: string | null; backup_coach_id: string | null }> = []
  if (withBackup.error) {
    const plain = await adminClient.from('profiles').select('id, full_name').in('role', ['coach', 'admin'])
    people = ((plain.data || []) as Array<{ id: string; full_name: string | null }>).map(row => ({
      ...row,
      backup_coach_id: null,
    }))
  } else {
    people = (withBackup.data || []) as typeof people
  }

  const nameOf = new Map(people.map(person => [person.id, (person.full_name || '').trim() || 'Coach']))
  /** Assignments pointing at a non-staff profile are shown as the staff coach with the same first name. */
  const staffAlias = new Map<string, string>()
  const outsiders = [...new Set((assigned || []).map(row => row.coach_id))].filter(id => !nameOf.has(id))
  if (outsiders.length) {
    const { data: extra } = await adminClient
      .from('profiles')
      .select('id, full_name')
      .in('id', outsiders)
    for (const person of (extra || []) as Array<{ id: string; full_name: string | null }>) {
      const first = (person.full_name || '').trim().split(/\s+/)[0]?.toLowerCase()
      const match = first ? people.find(staff => coachMatchesFirstName(staff.full_name, first)) : undefined
      if (match) staffAlias.set(person.id, match.id)
    }
  }
  const backupOf = new Map<string, string>()
  for (const person of people) {
    if (person.backup_coach_id && person.backup_coach_id !== person.id) {
      backupOf.set(person.id, person.backup_coach_id)
      continue
    }
    const want = defaultBackupFirstName(person.full_name)
    if (!want) continue
    const backup = people.find(other => other.id !== person.id && coachMatchesFirstName(other.full_name, want))
    if (backup) backupOf.set(person.id, backup.id)
  }

  const blocked = new Set(
    ((blockedRows || []) as Array<{ coach_id: string; date: string; time_slot: string }>)
      .map(row => `${row.coach_id}|${row.date}|${row.time_slot}`),
  )

  const byEvent = new Map<string, Array<{ id: string; coveringFor: string | null }>>()
  for (const row of (assigned || []) as Array<{ calendar_event_id: string; coach_id: string; covering_for: string | null }>) {
    const list = byEvent.get(row.calendar_event_id) || []
    list.push({ id: row.coach_id, coveringFor: row.covering_for })
    byEvent.set(row.calendar_event_id, list)
  }

  const allowed = new Set(coachIds)
  const classes: CoachActivityClass[] = []
  for (const ev of visible) {
    const coaches = byEvent.get(ev.id) || []
    if (assignedOnly && !coaches.some(coach => allowed.has(coach.id))) continue
    const slot = ev.time_slot || SLOT_FROM_START[ev.start_time?.slice(0, 5) || ''] || ''
    const labels: string[] = []
    const pills: Array<{ id: string; initials: string; name: string }> = []
    const payCoachIds: string[] = []
    let warning = ''
    if (!coaches.length) {
      warning = 'Sin coach'
    }
    for (const coach of coaches) {
      const show = (id: string) => {
        const pillId = staffAlias.get(id) ?? id
        const name = nameOf.get(pillId) || ''
        const initials = name ? initialsOf(name) : '?'
        labels.push(initials)
        if (!pills.some(pill => pill.id === pillId)) pills.push({ id: pillId, initials, name: name || 'Sin coach del equipo' })
        payCoachIds.push(id)
      }
      if (coach.coveringFor) {
        show(coach.id)
        continue
      }
      const off = Boolean(slot) && blocked.has(`${coach.id}|${ev.start_date}|${slot}`)
      const backupId = backupOf.get(coach.id)
      const backupFree = Boolean(backupId) && !(slot && blocked.has(`${backupId}|${ev.start_date}|${slot}`))
      if (off && backupFree && backupId) {
        show(backupId)
      } else {
        show(coach.id)
        if (off) warning = warning || `${nameOf.get(coach.id) || 'Coach'} no está disponible`
      }
    }
    const cancelled = ev.session_outcome === 'cancelled' || Boolean(ev.cancelled_at)
    const status: CoachActivityClass['status'] = cancelled
      ? 'cancelled'
      : ev.session_outcome === 'done'
        ? 'done'
        : ev.start_date < todayKey
          ? 'open'
          : 'upcoming'
    classes.push({
      id: ev.id,
      date: ev.start_date,
      time: classTimeLabel(ev.start_time),
      title: ev.title,
      age: classAgeLabel(ev),
      coaches: labels.join(' · '),
      pills,
      coachIds: [...new Set(payCoachIds)],
      weekStart: ev.start_date < thisMonday
        ? shiftYmd(ev.start_date, (() => {
            const [y, m, d] = ev.start_date.split('-').map(Number)
            const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
            return dow === 0 ? -6 : 1 - dow
          })())
        : thisMonday,
      status,
      warning,
    })
  }
  return classes
}

/** Keep the newest of two nullable timestamps. */
function laterOf(a: string | null, b: string | null | undefined): string | null {
  if (!b) return a
  if (!a) return b
  return b > a ? b : a
}

export default defineEventHandler(async (event): Promise<CoachActivityResponse> => {
  const { adminClient } = await requireAdmin(event)

  const query = getQuery(event)
  const to = typeof query.to === 'string' && query.to ? query.to : ymd(new Date())
  const from =
    typeof query.from === 'string' && query.from
      ? query.from
      : ymd(new Date(Date.parse(to) - 27 * 86400000))
  const programFilter = typeof query.program === 'string' && query.program ? query.program : ''
  const sportFilter = typeof query.sport === 'string' && query.sport ? query.sport : ''
  const sportsRaw = typeof query.sports === 'string' ? query.sports : ''
  const sportSet = new Set(
    (sportsRaw ? sportsRaw.split(',') : sportFilter ? [sportFilter] : [])
      .map(id => id.trim())
      .filter(Boolean),
  )

  // --- Roster: coaches plus the one admin who also teaches -------------------
  const profileFields = 'id, full_name, email, title, is_active, is_head_coach, avatar_url, coach_discipline'
  const plainFields = 'id, full_name, email, title, is_active, is_head_coach, avatar_url'
  const [coachResult, adminResult, { data: programLinks }] = await Promise.all([
    adminClient.from('profiles').select(profileFields).eq('role', 'coach'),
    adminClient.from('profiles').select(profileFields).eq('role', 'admin').ilike('email', ADMIN_COACH_EMAIL),
    adminClient.from('program_coaches').select('coach_id, program_id, programs(id, name)'),
  ])
  const coachRows = coachResult.error
    ? (await adminClient.from('profiles').select(plainFields).eq('role', 'coach')).data
    : coachResult.data
  const adminCoachRows = adminResult.error
    ? (await adminClient.from('profiles').select(plainFields).eq('role', 'admin').ilike('email', ADMIN_COACH_EMAIL)).data
    : adminResult.data

  const roster = new Map<string, CoachActivityCoach>()
  for (const p of [...(coachRows || []), ...(adminCoachRows || [])]) {
    if (roster.has(p.id)) continue
    roster.set(p.id, {
      id: p.id,
      name: p.full_name || p.email,
      email: p.email,
      avatar_url: p.avatar_url || null,
      title: p.title ?? null,
      is_active: Boolean(p.is_active),
      is_head_coach: Boolean(p.is_head_coach),
      programs: [],
      classes_given: 0,
      classes_cancelled: 0,
      athletes_taught: 0,
      attendance_marked: 0,
      evaluations: 0,
      videos: 0,
      session_videos: 0,
      evaluation_videos: 0,
      class_plans: 0,
      tricks_marked: 0,
      athletes_with_progress: 0,
      classes_without_notes: 0,
      last_active: null,
    })
  }

  // --- Program assignments ---------------------------------------------------
  const programs = new Map<string, string>()
  for (const link of programLinks || []) {
    const program = link.programs as unknown as { id: string; name: string } | null
    if (!program) continue
    programs.set(program.id, program.name)
    roster.get(link.coach_id)?.programs.push(program.name)
  }

  // Narrowing to a program drops coaches who do not cover it, rather than
  // showing them with a row of zeros they cannot act on.
  if (programFilter) {
    const keep = new Set(
      (programLinks || []).filter(l => l.program_id === programFilter).map(l => l.coach_id),
    )
    for (const id of [...roster.keys()]) if (!keep.has(id)) roster.delete(id)
  }
  if (sportSet.size) {
    const covers = new Set(
      [...(coachRows || []), ...(adminCoachRows || [])]
        .filter(row => {
          const sports = Array.isArray(row.coach_discipline) && row.coach_discipline.length
            ? row.coach_discipline
            : ['skateboarding']
          return sports.some(id => sportSet.has(id))
        })
        .map(row => row.id),
    )
    for (const id of [...roster.keys()]) if (!covers.has(id)) roster.delete(id)
  }

  const coachIds = [...roster.keys()]
  if (coachIds.length === 0) {
    return {
      from,
      to,
      coaches: [],
      totals: {
        classes_given: 0,
        classes_in_period: 0,
        classes_cancelled: 0,
        videos: 0,
        session_videos: 0,
        evaluation_videos: 0,
        athletes_with_progress: 0,
        active_skaters: 0,
        coaches_contributing: 0,
        coaches_total: 0,
        evaluations: 0,
        class_plans: 0,
        attendance_marked: 0,
        tricks_marked: 0,
      },
      weekly: [],
      nearby: [],
      classes_by_level: [],
      programs: [...programs].map(([id, name]) => ({ id, name })),
    }
  }

  const historyMonths = Math.max(0, Number(query.historyMonths) || 0)
  const [
    { data: taught },
    { data: cancelledRows, error: cancelledErr },
    { data: evaluations },
    { data: videos },
    { data: plans },
    { data: progress },
    { data: attendance },
    { data: sessionVideos, error: sessionVideoError },
    nearby,
    { data: periodSeatRows },
    { data: classEvents },
    { data: reservations, error: reservationError },
    { data: purchases, error: purchaseError },
    { data: periodAssigned },
    { count: periodClassCount },
  ] = await Promise.all([
    adminClient
      .from('class_session_coaches')
      .select('coach_id, notes, created_at, calendar_event_id, school_calendar_events!inner(id, start_date, title, discipline, session_outcome)')
      .in('coach_id', coachIds)
      .eq('delivered', true)
      .gte('school_calendar_events.start_date', from)
      .lte('school_calendar_events.start_date', to),
    adminClient
      .from('class_session_coaches')
      .select('coach_id, school_calendar_events!inner(start_date, session_outcome, title, discipline)')
      .in('coach_id', coachIds)
      .eq('school_calendar_events.session_outcome', 'cancelled')
      .gte('school_calendar_events.start_date', from)
      .lte('school_calendar_events.start_date', to),
    adminClient
      .from('student_evaluations')
      .select('coach_id, evaluation_date')
      .in('coach_id', coachIds)
      .gte('evaluation_date', from)
      .lte('evaluation_date', to),
    adminClient
      .from('evaluation_videos')
      .select('coach_id, created_at')
      .in('coach_id', coachIds)
      .gte('created_at', mxDayStart(from))
      .lte('created_at', mxDayEnd(to)),
    adminClient
      .from('class_plans')
      .select('coach_id, plan_date')
      .in('coach_id', coachIds)
      .gte('plan_date', from)
      .lte('plan_date', to),
    adminClient
      .from('student_progress')
      .select('marked_by, student_id, learned_at')
      .in('marked_by', coachIds)
      .gte('learned_at', mxDayStart(from))
      .lte('learned_at', mxDayEnd(to)),
    adminClient
      .from('attendance')
      .select('marked_by, class_date')
      .in('marked_by', coachIds)
      .gte('class_date', from)
      .lte('class_date', to),
    adminClient
      .from('session_videos')
      .select('owner_id, created_at')
      .in('owner_id', coachIds)
      .gte('created_at', mxDayStart(from))
      .lte('created_at', mxDayEnd(to)),
    loadNearbyClasses(adminClient, coachIds, Boolean(programFilter || sportSet.size), to, historyMonths, sportSet),
    adminClient
      .from('class_session_coaches')
      .select('coach_id, calendar_event_id, school_calendar_events!inner(start_date, event_type)')
      .in('coach_id', coachIds)
      .gte('school_calendar_events.start_date', from)
      .lte('school_calendar_events.start_date', to)
      .in('school_calendar_events.event_type', ['class_session', 'class_individual']),
    adminClient
      .from('school_calendar_events')
      .select('id, title, skill_level, discipline, session_outcome, cancelled_at')
      .in('event_type', ['class_session', 'class_individual'])
      .gte('start_date', from)
      .lte('start_date', to),
    adminClient
      .from('class_reservations')
      .select('user_id, status')
      .gte('reservation_date', from)
      .lte('reservation_date', to),
    adminClient
      .from('finance_student_enrollments')
      .select('skater_id, started_on, last_payment_on')
      .eq('is_active', true),
    programFilter
      ? adminClient
        .from('class_session_coaches')
        .select('calendar_event_id, school_calendar_events!inner(start_date)')
        .in('coach_id', coachIds)
        .gte('school_calendar_events.start_date', from)
        .lte('school_calendar_events.start_date', to)
      : Promise.resolve({ data: [] as Array<{ calendar_event_id: string }> }),
    programFilter
      ? Promise.resolve({ count: 0 })
      : adminClient
        .from('school_calendar_events')
        .select('id', { count: 'exact', head: true })
        .in('event_type', ['class_session', 'class_individual'])
        .gte('start_date', from)
        .lte('start_date', to),
  ])

  // --- Classes given ---------------------------------------------------------
  const weekly = new Map<string, number>()
  const eventIds = new Set<string>()
  for (const row of taught || []) {
    const coach = roster.get(row.coach_id)
    if (!coach) continue
    const session = row.school_calendar_events as unknown as { start_date: string; title?: string | null; discipline?: string | null } | null
    if (sportSet.size && session && !sportSet.has(sportOf(session))) continue
    coach.classes_given += 1
    if (!row.notes?.trim()) coach.classes_without_notes += 1
    coach.last_active = laterOf(coach.last_active, session?.start_date)
    eventIds.add(row.calendar_event_id)
    if (session?.start_date) {
      const k = ymd(weekStart(new Date(`${session.start_date}T00:00:00Z`)))
      weekly.set(k, (weekly.get(k) || 0) + 1)
    }
  }

  if (!cancelledErr) {
    for (const row of cancelledRows || []) {
      const coach = roster.get(row.coach_id)
      const session = row.school_calendar_events as unknown as { title?: string | null; discipline?: string | null } | null
      if (sportSet.size && session && !sportSet.has(sportOf(session))) continue
      if (coach) coach.classes_cancelled += 1
    }
  }

  const coachesInPeriod = new Set<string>()
  const coachEventIds = new Set<string>()
  for (const row of periodSeatRows || []) {
    if (row.coach_id) coachesInPeriod.add(row.coach_id)
    if (row.calendar_event_id) coachEventIds.add(row.calendar_event_id)
  }

  const periodEventIds = programFilter
    ? [...coachEventIds]
    : ((classEvents || []) as Array<{ id: string }>).map(row => row.id)
  const seatSlices: string[][] = []
  for (let i = 0; i < periodEventIds.length; i += 200) seatSlices.push(periodEventIds.slice(i, i + 200))
  const [{ data: enrolments }, seatResults] = await Promise.all([
    eventIds.size > 0
      ? adminClient
        .from('class_session_enrollments')
        .select('calendar_event_id, user_id, skater_profile_id, crew_member_id')
        .in('calendar_event_id', [...eventIds])
        .eq('status', 'confirmed')
      : Promise.resolve({ data: [] as Array<{ calendar_event_id: string; user_id: string; skater_profile_id: string | null; crew_member_id: string | null }> }),
    Promise.all(seatSlices.map(slice =>
      adminClient
        .from('class_session_enrollments')
        .select('user_id, skater_profile_id')
        .in('calendar_event_id', slice)
        .neq('status', 'cancelled'),
    )),
  ])

  // --- Skaters in those classes ---------------------------------------------
  if (eventIds.size > 0) {
    // An enrolment names the skater in one of three ways: a child in the
    // parent's crew, a skater with their own login, or the account holder.
    const skaterKey = (e: {
      user_id: string
      skater_profile_id: string | null
      crew_member_id: string | null
    }) =>
      e.crew_member_id
        ? `crew:${e.crew_member_id}`
        : e.skater_profile_id
          ? `profile:${e.skater_profile_id}`
          : `profile:${e.user_id}`

    const skatersByEvent = new Map<string, Set<string>>()
    for (const e of enrolments || []) {
      const set = skatersByEvent.get(e.calendar_event_id) || new Set<string>()
      set.add(skaterKey(e))
      skatersByEvent.set(e.calendar_event_id, set)
    }

    const seenByCoach = new Map<string, Set<string>>()
    for (const row of taught || []) {
      if (!roster.has(row.coach_id)) continue
      const seen = seenByCoach.get(row.coach_id) || new Set<string>()
      for (const s of skatersByEvent.get(row.calendar_event_id) || []) seen.add(s)
      seenByCoach.set(row.coach_id, seen)
    }
    for (const [coachId, seen] of seenByCoach) {
      const coach = roster.get(coachId)
      if (coach) coach.athletes_taught = seen.size
    }
  }

  // --- Everything else the schema attributes to a coach ----------------------
  for (const row of evaluations || []) {
    const c = roster.get(row.coach_id)
    if (!c) continue
    c.evaluations += 1
    c.last_active = laterOf(c.last_active, row.evaluation_date)
  }
  for (const row of videos || []) {
    const c = row.coach_id ? roster.get(row.coach_id) : null
    if (!c) continue
    c.evaluation_videos += 1
    c.videos += 1
    c.last_active = laterOf(c.last_active, String(row.created_at).slice(0, 10))
  }
  if (!sessionVideoError) {
    for (const row of sessionVideos || []) {
      const c = row.owner_id ? roster.get(row.owner_id) : null
      if (!c) continue
      c.session_videos += 1
      c.videos += 1
      c.last_active = laterOf(c.last_active, String(row.created_at).slice(0, 10))
    }
  }
  for (const row of plans || []) {
    const c = roster.get(row.coach_id)
    if (!c) continue
    c.class_plans += 1
    c.last_active = laterOf(c.last_active, row.plan_date)
  }
  for (const row of attendance || []) {
    const c = row.marked_by ? roster.get(row.marked_by) : null
    if (!c) continue
    c.attendance_marked += 1
    c.last_active = laterOf(c.last_active, row.class_date)
  }

  const progressSkaters = new Map<string, Set<string>>()
  for (const row of progress || []) {
    const c = row.marked_by ? roster.get(row.marked_by) : null
    if (!c) continue
    c.tricks_marked += 1
    c.last_active = laterOf(c.last_active, String(row.learned_at).slice(0, 10))
    const set = progressSkaters.get(row.marked_by) || new Set<string>()
    if (row.student_id) set.add(row.student_id)
    progressSkaters.set(row.marked_by, set)
  }
  for (const [coachId, set] of progressSkaters) {
    const c = roster.get(coachId)
    if (c) c.athletes_with_progress = set.size
  }

  const coaches = [...roster.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const didSomething = (c: CoachActivityCoach) =>
    c.classes_given + c.classes_cancelled + c.evaluations + c.videos + c.class_plans + c.tricks_marked + c.attendance_marked > 0

  const allProgressSkaters = new Set<string>()
  for (const set of progressSkaters.values()) for (const s of set) allProgressSkaters.add(s)

  const periodSkaters = new Set<string>()
  for (const { data: seats } of seatResults) {
    for (const seat of seats || []) {
      const id = seat.skater_profile_id || seat.user_id
      if (id) periodSkaters.add(id)
    }
  }
  if (!reservationError) {
    for (const row of reservations || []) {
      if (!row.user_id) continue
      if (row.status === 'cancelled' || row.status === 'expired') continue
      periodSkaters.add(row.user_id)
    }
  }
  if (!purchaseError) {
    for (const row of purchases || []) {
      if (!row.skater_id) continue
      const started = row.started_on && row.started_on >= from && row.started_on <= to
      const paid = row.last_payment_on && row.last_payment_on >= from && row.last_payment_on <= to
      if (started || paid) periodSkaters.add(row.skater_id)
    }
  }
  let progressInPeriod = 0
  for (const id of allProgressSkaters) if (periodSkaters.has(id)) progressInPeriod += 1

  const levelOrder: ProgramSkillTrack[] = ['beginner', 'intermediate', 'advanced']
  const buckets = new Map<ProgramSkillTrack, { id: ProgramSkillTrack; given: number; scheduled: number }>(
    levelOrder.map(id => [id, { id, given: 0, scheduled: 0 }]),
  )
  const seen = new Set<string>()
  for (const ev of classEvents || []) {
    if (sportSet.size && !sportSet.has(sportOf(ev))) continue
    if (ev.cancelled_at || ev.session_outcome === 'cancelled') continue
    seen.add(ev.id)
    const title = (ev.title || '').toLowerCase()
    const levels: ProgramSkillTrack[] = []
    if (title.includes('principiante') || title.includes('beginner')) levels.push('beginner')
    if (title.includes('intermedio') || title.includes('intermediate')) levels.push('intermediate')
    if (title.includes('avanzado') || title.includes('advanced')) levels.push('advanced')
    const tracks = levels.length
      ? levels
      : (ev.skill_level ? [skillTrackFromLevelId(ev.skill_level)] : [])
    const done = ev.session_outcome === 'done'
    for (const track of tracks) {
      const bucket = buckets.get(track)
      if (!bucket) continue
      bucket.scheduled += 1
      if (done) bucket.given += 1
    }
  }
  const classesByLevel = levelOrder.map(id => buckets.get(id)!)

  const classesInPeriod = classEvents
    ? seen.size
    : programFilter
      ? new Set(((periodAssigned || []) as Array<{ calendar_event_id: string }>).map(row => row.calendar_event_id)).size
      : periodClassCount || 0
  const classesGiven = classEvents
    ? (classEvents || []).filter(ev => {
        if (sportSet.size && !sportSet.has(sportOf(ev))) return false
        if (ev.cancelled_at || ev.session_outcome === 'cancelled') return false
        return ev.session_outcome === 'done'
      }).length
    : coaches.reduce((n, c) => n + c.classes_given, 0)

  const sum = (pick: (c: CoachActivityCoach) => number) =>
    coaches.reduce((n, c) => n + pick(c), 0)

  return {
    from,
    to,
    coaches,
    totals: {
      classes_given: classesGiven,
      classes_in_period: classesInPeriod,
      classes_cancelled: sum(c => c.classes_cancelled),
      videos: sum(c => c.videos),
      session_videos: sum(c => c.session_videos),
      evaluation_videos: sum(c => c.evaluation_videos),
      athletes_with_progress: progressInPeriod,
      active_skaters: periodSkaters.size,
      coaches_contributing: coaches.filter(c => coachesInPeriod.has(c.id) && didSomething(c)).length,
      coaches_total: coachesInPeriod.size,
      evaluations: sum(c => c.evaluations),
      class_plans: sum(c => c.class_plans),
      attendance_marked: sum(c => c.attendance_marked),
      tricks_marked: sum(c => c.tricks_marked),
    },
    weekly: [...weekly]
      .map(([week_start, classes]) => ({ week_start, classes }))
      .sort((a, b) => a.week_start.localeCompare(b.week_start)),
    nearby,
    classes_by_level: classesByLevel,
    programs: [...programs]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  }
})
