/**
 * Reserve or free a class seat. Tokens move when attendance is marked,
 * or come back if this seat already spent one.
 */
import { requireStaff } from '~/server/utils/requireStaff'
import { releaseClassToken, returnLegacyClass, spendClassToken } from '~/server/utils/classTokens'
import type { TokenKind } from '~/utils/classTokens'

type Seat = {
  id: string
  status: string
  user_id: string | null
  skater_profile_id: string | null
  crew_member_id: string | null
  spent_token_id: string | null
}

const migrationHint = 'Run supabase/migrations/add_skater_tokens.sql in the Supabase SQL editor, then try again.'

function missingTokenColumns(message: string) {
  return /spent_token_id|skater_tokens|schema cache/i.test(message)
}

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireStaff(event)
  const body = await readBody(event)
  const action = body?.action === 'remove' || body?.action === 'restore' || body?.action === 'add' ? body.action : ''
  const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
  const skaterId = typeof body?.skaterId === 'string' ? body.skaterId.trim() : ''
  const kind = body?.kind === 'crew' ? 'crew' : 'profile'

  if (!action || !eventId || !skaterId) {
    throw createError({ statusCode: 400, message: 'action, eventId and skaterId are required' })
  }

  const { data: sessionRow, error: sessionErr } = await adminClient
    .from('school_calendar_events')
    .select('id, start_date, event_type, coach_tier')
    .eq('id', eventId)
    .maybeSingle()
  if (sessionErr) throw createError({ statusCode: 500, message: sessionErr.message })
  if (!sessionRow) throw createError({ statusCode: 404, message: 'Class not found' })

  const { data: seatRows, error: seatErr } = await adminClient
    .from('class_session_enrollments')
    .select('id, status, user_id, skater_profile_id, crew_member_id, spent_token_id')
    .eq('calendar_event_id', eventId)
  if (seatErr) {
    throw createError({
      statusCode: missingTokenColumns(seatErr.message) ? 400 : 500,
      message: missingTokenColumns(seatErr.message) ? migrationHint : seatErr.message,
    })
  }

  const matches = ((seatRows || []) as Seat[]).filter(row => (
    kind === 'crew'
      ? row.crew_member_id === skaterId
      : row.skater_profile_id === skaterId || row.user_id === skaterId
  ))

  if (action === 'restore' || action === 'add') {
    const cancelled = matches.filter(row => row.status === 'cancelled')
    if (cancelled.length) {
      const { error: upErr } = await adminClient
        .from('class_session_enrollments')
        .update({ status: 'confirmed' })
        .in('id', cancelled.map(row => row.id))
      if (upErr) throw createError({ statusCode: 500, message: upErr.message })
      return { ok: true, restored: true, charged: null, tokenKind: null, returned: false }
    }
    if (action === 'restore') {
      return { ok: true, restored: false, charged: null, tokenKind: null, returned: false }
    }
    if (matches.some(row => row.status !== 'cancelled')) {
      return { ok: true, restored: false, charged: null, tokenKind: null, returned: false, already: true }
    }

    const { error: insErr } = await adminClient
      .from('class_session_enrollments')
      .insert({
        calendar_event_id: eventId,
        user_id: skaterId,
        skater_profile_id: kind === 'profile' ? skaterId : null,
        crew_member_id: kind === 'crew' ? skaterId : null,
        status: 'confirmed',
      })
    if (insErr) throw createError({ statusCode: 400, message: insErr.message })
    return { ok: true, restored: false, charged: null, tokenKind: null, returned: false }
  }

  const open = matches.filter(row => row.status !== 'cancelled')
  if (!open.length) {
    throw createError({ statusCode: 404, message: 'Skater is not enrolled in this class' })
  }

  const linked = open.find(row => row.spent_token_id)
  let release: { release: 'returned' | 'voided' | 'none'; tokenKind: TokenKind | null } = { release: 'none', tokenKind: null }
  if (linked?.spent_token_id) {
    release = await releaseClassToken(adminClient, linked.spent_token_id)
  } else {
    const legacyKind = await returnLegacyClass(
      adminClient,
      kind,
      skaterId,
      eventId,
      sessionRow.event_type,
      sessionRow.coach_tier,
    )
    if (legacyKind) release = { release: 'returned', tokenKind: legacyKind }
  }

  const { error: cancelErr } = await adminClient
    .from('class_session_enrollments')
    .update({ status: 'cancelled', spent_token_id: null })
    .in('id', open.map(row => row.id))
  if (cancelErr) {
    if (release.release === 'returned' || release.release === 'voided') {
      try {
        const again = await spendClassToken(
          adminClient,
          kind,
          skaterId,
          eventId,
          sessionRow.event_type,
          sessionRow.coach_tier,
        )
        await adminClient
          .from('class_session_enrollments')
          .update({ spent_token_id: again.tokenId })
          .in('id', open.map(row => row.id))
      } catch {
        // The seat is still confirmed. The error below tells staff the removal did not finish.
      }
    }
    throw createError({
      statusCode: missingTokenColumns(cancelErr.message) ? 400 : 500,
      message: missingTokenColumns(cancelErr.message) ? migrationHint : cancelErr.message,
    })
  }

  return {
    ok: true,
    restored: false,
    charged: null,
    tokenKind: release.tokenKind,
    returned: release.release === 'returned',
    voided: release.release === 'voided',
  }
})
