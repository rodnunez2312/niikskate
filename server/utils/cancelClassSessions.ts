import type { SupabaseClient } from '@supabase/supabase-js'
import { escapeHtml, sendMail } from '~/server/utils/sendMail'

type EnrollRow = {
  calendar_event_id: string
  user_id: string | null
  skater_profile_id: string | null
  crew_member_id: string | null
}

type ProfileRow = {
  id: string
  email: string | null
  full_name: string | null
  guardian_user_id: string | null
}

type EventRow = {
  id: string
  title: string
  start_date: string
  start_time: string | null
  skatepark: string | null
  location: string | null
  cancelled_at: string | null
}

function formatWhen(ev: EventRow): string {
  const time = ev.start_time ? ev.start_time.slice(0, 5) : ''
  return [ev.start_date, time].filter(Boolean).join(' · ')
}

export async function cancelClassSessions(
  adminClient: SupabaseClient,
  eventIds: string[],
  makeupNote: string,
  reason = 'weather',
  options: { notify?: boolean } = {},
) {
  const notify = options.notify !== false
  const { data: events, error: evErr } = await adminClient
    .from('school_calendar_events')
    .select('id, title, start_date, start_time, skatepark, location, cancelled_at')
    .in('id', eventIds)

  if (evErr) {
    throw createError({ statusCode: 500, message: evErr.message })
  }

  const rows = (events || []) as EventRow[]
  const pending = rows.filter(r => !r.cancelled_at)
  if (!pending.length) {
    return { cancelled: 0, emailed: 0, skipped: 0, already: rows.length, recipients: 0 }
  }

  const now = new Date().toISOString()
  const pendingIds = pending.map(r => r.id)
  let { error: upErr } = await adminClient
    .from('school_calendar_events')
    .update({
      cancelled_at: now,
      cancellation_reason: reason,
      makeup_note: makeupNote || null,
      is_bookable: false,
      session_outcome: 'cancelled',
    })
    .in('id', pendingIds)

  if (upErr && /session_outcome|schema cache/i.test(upErr.message)) {
    ;({ error: upErr } = await adminClient
      .from('school_calendar_events')
      .update({
        cancelled_at: now,
        cancellation_reason: reason,
        makeup_note: makeupNote || null,
        is_bookable: false,
      })
      .in('id', pendingIds))
  }

  if (upErr) {
    const missing = /cancelled_at|cancellation_reason|makeup_note|session_outcome|schema cache/i.test(upErr.message)
    throw createError({
      statusCode: missing ? 400 : 500,
      message: missing
        ? 'Run supabase/migrations/add_class_cancellations.sql in the Supabase SQL editor, then try again.'
        : upErr.message,
    })
  }

  await adminClient
    .from('class_session_coaches')
    .update({ delivered: false })
    .in('calendar_event_id', pendingIds)

  if (!notify) {
    return { cancelled: pendingIds.length, emailed: 0, skipped: 0, already: rows.length - pending.length, recipients: 0 }
  }

  const { data: enrollments, error: enErr } = await adminClient
    .from('class_session_enrollments')
    .select('calendar_event_id, user_id, skater_profile_id, crew_member_id')
    .in('calendar_event_id', pendingIds)
    .neq('status', 'cancelled')

  if (enErr) {
    throw createError({ statusCode: 500, message: enErr.message })
  }

  const enrolled = (enrollments || []) as EnrollRow[]
  const profileIds = new Set<string>()
  for (const row of enrolled) {
    if (row.user_id) profileIds.add(row.user_id)
    if (row.skater_profile_id) profileIds.add(row.skater_profile_id)
  }

  const profiles = new Map<string, ProfileRow>()
  if (profileIds.size) {
    const { data } = await adminClient
      .from('profiles')
      .select('id, email, full_name, guardian_user_id')
      .in('id', [...profileIds])
    for (const p of (data || []) as ProfileRow[]) profiles.set(p.id, p)
    const guardianIds = [...profiles.values()]
      .map(p => p.guardian_user_id)
      .filter((id): id is string => !!id && !profiles.has(id))
    if (guardianIds.length) {
      const { data: guardians } = await adminClient
        .from('profiles')
        .select('id, email, full_name, guardian_user_id')
        .in('id', guardianIds)
      for (const p of (guardians || []) as ProfileRow[]) profiles.set(p.id, p)
    }
  }

  const byEvent = new Map(pending.map(r => [r.id, r]))
  const byEmail = new Map<string, { name: string; events: EventRow[] }>()

  const addRecipient = (email: string | null | undefined, name: string | null | undefined, ev: EventRow) => {
    const to = email?.trim().toLowerCase()
    if (!to || !to.includes('@')) return
    const bucket = byEmail.get(to) || { name: name?.trim() || '', events: [] }
    if (!bucket.name && name?.trim()) bucket.name = name.trim()
    if (!bucket.events.some(existing => existing.id === ev.id)) bucket.events.push(ev)
    byEmail.set(to, bucket)
  }

  for (const row of enrolled) {
    const ev = byEvent.get(row.calendar_event_id)
    if (!ev) continue
    const booker = row.user_id ? profiles.get(row.user_id) : undefined
    const skater = row.skater_profile_id ? profiles.get(row.skater_profile_id) : undefined
    const guardian = skater?.guardian_user_id ? profiles.get(skater.guardian_user_id) : undefined
    addRecipient(booker?.email, booker?.full_name, ev)
    addRecipient(guardian?.email, guardian?.full_name, ev)
    addRecipient(skater?.email, skater?.full_name, ev)
  }

  const { data: coachSeats } = await adminClient
    .from('class_session_coaches')
    .select('calendar_event_id, coach_id')
    .in('calendar_event_id', pendingIds)
  const coachIds = [...new Set((coachSeats || []).map(row => row.coach_id).filter(Boolean))] as string[]
  const coachProfiles = new Map<string, ProfileRow>()
  if (coachIds.length) {
    const { data: coaches } = await adminClient
      .from('profiles')
      .select('id, email, full_name, guardian_user_id')
      .in('id', coachIds)
    for (const coach of (coaches || []) as ProfileRow[]) coachProfiles.set(coach.id, coach)
  }
  for (const seat of coachSeats || []) {
    const ev = byEvent.get(seat.calendar_event_id)
    const coach = coachProfiles.get(seat.coach_id)
    if (ev) addRecipient(coach?.email, coach?.full_name, ev)
  }

  const { data: admins } = await adminClient
    .from('profiles')
    .select('id, email, full_name, guardian_user_id')
    .eq('role', 'admin')
  for (const admin of (admins || []) as ProfileRow[]) {
    for (const ev of pending) addRecipient(admin.email, admin.full_name, ev)
  }

  const reasonLabel = reason === 'weather' || reason === 'clima'
    ? 'clima'
    : reason === 'asistencia'
      ? 'asistencia'
      : reason === 'coach'
        ? 'coach'
        : reason
  let emailed = 0
  let skipped = 0
  for (const [to, bucket] of byEmail) {
    const classes = bucket.events
      .map(ev => {
        const place = ev.skatepark || ev.location || ''
        return `<li><strong>${escapeHtml(ev.title)}</strong> — ${escapeHtml(formatWhen(ev))}${place ? ` · ${escapeHtml(place)}` : ''}</li>`
      })
      .join('')
    const greeting = bucket.name ? `Hola ${escapeHtml(bucket.name)},` : 'Hola,'
    const makeup = makeupNote
      ? `<p><strong>Cuándo se puede reponer:</strong> ${escapeHtml(makeupNote)}</p>`
      : ''
    const result = await sendMail({
      to,
      subject: 'Clase cancelada — Niik Skate',
      html: `
        <p>${greeting}</p>
        <p>La clase se canceló. Motivo: ${escapeHtml(reasonLabel)}.</p>
        <ul>${classes}</ul>
        ${makeup}
        <p>Cualquier duda, responde a este correo.</p>
        <p>Niik Skate</p>
      `,
    })
    if (result.sent) emailed += 1
    else skipped += 1
  }

  return {
    cancelled: pending.length,
    emailed,
    skipped,
    recipients: byEmail.size,
    already: rows.length - pending.length,
  }
}
