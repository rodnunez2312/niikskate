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

export interface CoachActivityCoach {
  id: string
  name: string
  email: string
  title: string | null
  is_active: boolean
  is_head_coach: boolean
  programs: string[]
  /** Classes this coach ran in the period. */
  classes_given: number
  /** Skaters enrolled in those classes, deduplicated. */
  athletes_taught: number
  attendance_marked: number
  evaluations: number
  videos: number
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

export interface CoachActivityResponse {
  from: string
  to: string
  coaches: CoachActivityCoach[]
  totals: {
    classes_given: number
    videos: number
    athletes_with_progress: number
    coaches_contributing: number
    coaches_total: number
    evaluations: number
    class_plans: number
    attendance_marked: number
    tricks_marked: number
  }
  weekly: CoachActivityWeek[]
  /** Programs seen on the roster, for the page's filter. */
  programs: Array<{ id: string; name: string }>
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** Monday of the week containing `d`. */
function weekStart(d: Date): Date {
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = out.getUTCDay()
  out.setUTCDate(out.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  return out
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

  // --- Roster: coaches plus the one admin who also teaches -------------------
  const [{ data: coachRows }, { data: adminCoachRows }] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id, full_name, email, title, is_active, is_head_coach')
      .eq('role', 'coach'),
    adminClient
      .from('profiles')
      .select('id, full_name, email, title, is_active, is_head_coach')
      .eq('role', 'admin')
      .ilike('email', ADMIN_COACH_EMAIL),
  ])

  const roster = new Map<string, CoachActivityCoach>()
  for (const p of [...(coachRows || []), ...(adminCoachRows || [])]) {
    if (roster.has(p.id)) continue
    roster.set(p.id, {
      id: p.id,
      name: p.full_name || p.email,
      email: p.email,
      title: p.title ?? null,
      is_active: Boolean(p.is_active),
      is_head_coach: Boolean(p.is_head_coach),
      programs: [],
      classes_given: 0,
      athletes_taught: 0,
      attendance_marked: 0,
      evaluations: 0,
      videos: 0,
      class_plans: 0,
      tricks_marked: 0,
      athletes_with_progress: 0,
      classes_without_notes: 0,
      last_active: null,
    })
  }

  // --- Program assignments ---------------------------------------------------
  const { data: programLinks } = await adminClient
    .from('program_coaches')
    .select('coach_id, program_id, programs(id, name)')

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

  const coachIds = [...roster.keys()]
  if (coachIds.length === 0) {
    return {
      from,
      to,
      coaches: [],
      totals: {
        classes_given: 0,
        videos: 0,
        athletes_with_progress: 0,
        coaches_contributing: 0,
        coaches_total: 0,
        evaluations: 0,
        class_plans: 0,
        attendance_marked: 0,
        tricks_marked: 0,
      },
      weekly: [],
      programs: [...programs].map(([id, name]) => ({ id, name })),
    }
  }

  // --- Classes given ---------------------------------------------------------
  const { data: taught } = await adminClient
    .from('class_session_coaches')
    .select('coach_id, notes, created_at, calendar_event_id, school_calendar_events!inner(id, start_date)')
    .in('coach_id', coachIds)
    .eq('delivered', true)
    .gte('school_calendar_events.start_date', from)
    .lte('school_calendar_events.start_date', to)

  const weekly = new Map<string, number>()
  const eventIds = new Set<string>()
  for (const row of taught || []) {
    const coach = roster.get(row.coach_id)
    if (!coach) continue
    const session = row.school_calendar_events as unknown as { start_date: string } | null
    coach.classes_given += 1
    if (!row.notes?.trim()) coach.classes_without_notes += 1
    coach.last_active = laterOf(coach.last_active, session?.start_date)
    eventIds.add(row.calendar_event_id)
    if (session?.start_date) {
      const k = ymd(weekStart(new Date(`${session.start_date}T00:00:00Z`)))
      weekly.set(k, (weekly.get(k) || 0) + 1)
    }
  }

  // --- Skaters in those classes ---------------------------------------------
  if (eventIds.size > 0) {
    const { data: enrolments } = await adminClient
      .from('class_session_enrollments')
      .select('calendar_event_id, user_id, skater_profile_id, crew_member_id')
      .in('calendar_event_id', [...eventIds])
      .eq('status', 'confirmed')

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
  const [
    { data: evaluations },
    { data: videos },
    { data: plans },
    { data: progress },
    { data: attendance },
  ] = await Promise.all([
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
      .gte('created_at', `${from}T00:00:00Z`)
      .lte('created_at', `${to}T23:59:59Z`),
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
      .gte('learned_at', `${from}T00:00:00Z`)
      .lte('learned_at', `${to}T23:59:59Z`),
    adminClient
      .from('attendance')
      .select('marked_by, class_date')
      .in('marked_by', coachIds)
      .gte('class_date', from)
      .lte('class_date', to),
  ])

  for (const row of evaluations || []) {
    const c = roster.get(row.coach_id)
    if (!c) continue
    c.evaluations += 1
    c.last_active = laterOf(c.last_active, row.evaluation_date)
  }
  for (const row of videos || []) {
    const c = row.coach_id ? roster.get(row.coach_id) : null
    if (!c) continue
    c.videos += 1
    c.last_active = laterOf(c.last_active, String(row.created_at).slice(0, 10))
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
    c.classes_given + c.evaluations + c.videos + c.class_plans + c.tricks_marked + c.attendance_marked > 0

  const allProgressSkaters = new Set<string>()
  for (const set of progressSkaters.values()) for (const s of set) allProgressSkaters.add(s)

  const sum = (pick: (c: CoachActivityCoach) => number) =>
    coaches.reduce((n, c) => n + pick(c), 0)

  return {
    from,
    to,
    coaches,
    totals: {
      classes_given: sum(c => c.classes_given),
      videos: sum(c => c.videos),
      athletes_with_progress: allProgressSkaters.size,
      coaches_contributing: coaches.filter(didSomething).length,
      coaches_total: coaches.length,
      evaluations: sum(c => c.evaluations),
      class_plans: sum(c => c.class_plans),
      attendance_marked: sum(c => c.attendance_marked),
      tricks_marked: sum(c => c.tricks_marked),
    },
    weekly: [...weekly]
      .map(([week_start, classes]) => ({ week_start, classes }))
      .sort((a, b) => a.week_start.localeCompare(b.week_start)),
    programs: [...programs]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
  }
})
