import type { SupabaseClient } from '@supabase/supabase-js'
import { attendanceConsumesToken, tokenKindForEvent, tokenKindForPackage, type AttendanceMark, type TokenKind } from '~/utils/classTokens'
import { computeSkaterCareer, type CareerSkill } from '~/utils/skaterCareer'

type Db = SupabaseClient
type OwnerKind = 'profile' | 'crew'

export type TokenCharge = 'balance' | 'due'
export type TokenRelease = 'returned' | 'voided' | 'none'


type TokenRow = {
  id: string
  kind: TokenKind
  status: string
  skater_id: string | null
  crew_member_id: string | null
}

function ownerFilter(query: any, kind: OwnerKind, skaterId: string) {
  return kind === 'crew' ? query.eq('crew_member_id', skaterId) : query.eq('skater_id', skaterId)
}

function ownerFields(kind: OwnerKind, skaterId: string) {
  return kind === 'crew'
    ? { skater_id: null, crew_member_id: skaterId }
    : { skater_id: skaterId, crew_member_id: null }
}

async function writeTokenTransaction(admin: Db, row: Record<string, unknown>) {
  const { error } = await admin.from('skater_token_transactions').insert(row)
  if (!error) return
  if (/skater_token_transactions|schema cache|does not exist/i.test(error.message)) return
  if (row.idempotency_key && /duplicate|unique/i.test(error.message)) return
  throw createError({ statusCode: 500, message: error.message })
}

async function spentForEvent(admin: Db, kind: OwnerKind, skaterId: string, eventId: string) {
  const query = admin
    .from('skater_tokens')
    .select('id, kind, status')
    .eq('calendar_event_id', eventId)
    .in('status', ['spent', 'owed'])
    .limit(1)
  const { data, error } = await ownerFilter(query, kind, skaterId)
  if (error) throw createError({ statusCode: 500, message: error.message })
  return (data?.[0] as { id: string; kind: TokenKind; status: string } | undefined) || null
}

export async function mintPaymentTokens(
  admin: Db,
  enrollmentId: string,
  previousSessionsPaid: number,
  meta?: { actorId?: string | null; idempotencyKey?: string | null; amountMxn?: number | null; paymentMethod?: string | null; couponCode?: string | null; skipLog?: boolean },
) {
  const { data: row, error } = await admin
    .from('finance_student_enrollments')
    .select('id, skater_id, crew_member_id, coach_tier, class_kind, sessions_paid')
    .eq('id', enrollmentId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, message: error.message })
  if (!row) throw createError({ statusCode: 404, message: 'Package not found' })
  if (!row.skater_id && !row.crew_member_id) return { minted: 0, voided: 0 }

  const next = Number(row.sessions_paid || 0)
  const previous = Math.max(0, Number(previousSessionsPaid) || 0)
  const ownerKind: OwnerKind = row.crew_member_id && !row.skater_id ? 'crew' : 'profile'
  const ownerId = ownerKind === 'crew' ? row.crew_member_id : row.skater_id
  const tokenKind = tokenKindForPackage(row.coach_tier, row.class_kind)

  if (previous <= 0) {
    const { count, error: countErr } = await admin
      .from('skater_tokens')
      .select('id', { count: 'exact', head: true })
      .eq('finance_enrollment_id', enrollmentId)
      .eq('source', 'payment')
      .neq('status', 'void')
    if (countErr) throw createError({ statusCode: 500, message: countErr.message })
    const need = next - Number(count || 0)
    if (need > 0) {
      await insertTokens(admin, ownerKind, ownerId, tokenKind, 'available', 'payment', enrollmentId, need)
      if (!meta?.skipLog) {
        await writeTokenTransaction(admin, {
        ...ownerFields(ownerKind, ownerId),
        kind: tokenKind,
        tx_type: 'purchase',
        quantity: need,
        amount_mxn: meta?.amountMxn ?? null,
        payment_method: meta?.paymentMethod ?? null,
        payment_status: 'paid',
        tokens_applied: true,
        finance_enrollment_id: enrollmentId,
        coupon_code: meta?.couponCode ?? null,
        reason: 'Package purchase',
        actor_id: meta?.actorId ?? null,
        idempotency_key: meta?.idempotencyKey ?? null,
      })
      }
    }
    return { minted: Math.max(0, need), voided: 0 }
  }

  const delta = next - previous
  if (delta > 0) {
    await insertTokens(admin, ownerKind, ownerId, tokenKind, 'available', 'payment', enrollmentId, delta)
    await writeTokenTransaction(admin, {
      ...ownerFields(ownerKind, ownerId),
      kind: tokenKind,
      tx_type: 'adjustment',
      quantity: delta,
      payment_status: 'paid',
      tokens_applied: true,
      finance_enrollment_id: enrollmentId,
      reason: 'Class count increased',
      actor_id: meta?.actorId ?? null,
    })
    return { minted: delta, voided: 0 }
  }
  if (delta < 0) {
    const voided = await voidAvailablePaymentTokens(admin, enrollmentId, -delta)
    return { minted: 0, voided }
  }
  return { minted: 0, voided: 0 }
}

async function insertTokens(
  admin: Db,
  kind: OwnerKind,
  skaterId: string,
  tokenKind: TokenKind,
  status: 'available' | 'owed',
  source: 'payment' | 'attendance' | 'level',
  enrollmentId: string | null,
  count: number,
  eventId?: string | null,
) {
  if (count <= 0) return [] as TokenRow[]
  const now = new Date().toISOString()
  const rows = Array.from({ length: count }, () => ({
    ...ownerFields(kind, skaterId),
    kind: tokenKind,
    status,
    source,
    finance_enrollment_id: enrollmentId,
    calendar_event_id: eventId || null,
    spent_at: status === 'owed' ? now : null,
  }))
  const { data, error } = await admin.from('skater_tokens').insert(rows).select('id, kind, status, skater_id, crew_member_id')
  if (error) throw createError({ statusCode: 500, message: error.message })
  return (data || []) as TokenRow[]
}

async function voidAvailablePaymentTokens(admin: Db, enrollmentId: string, count: number) {
  const { data, error } = await admin
    .from('skater_tokens')
    .select('id')
    .eq('finance_enrollment_id', enrollmentId)
    .eq('source', 'payment')
    .eq('status', 'available')
    .order('created_at', { ascending: false })
    .limit(count)
  if (error) throw createError({ statusCode: 500, message: error.message })
  const ids = (data || []).map(row => row.id)
  if (!ids.length) return 0
  const { error: upErr } = await admin.from('skater_tokens').update({ status: 'void' }).in('id', ids)
  if (upErr) throw createError({ statusCode: 500, message: upErr.message })
  return ids.length
}

export async function spendClassToken(
  admin: Db,
  kind: OwnerKind,
  skaterId: string,
  eventId: string,
  eventType: string | null,
  coachTier: string | null,
  options?: { allowOwed?: boolean; actorId?: string | null; reason?: string },
): Promise<{ charged: TokenCharge | 'short'; tokenKind: TokenKind; tokenId: string }> {
  const required = tokenKindForEvent(eventType, coachTier)
  const already = await spentForEvent(admin, kind, skaterId, eventId)
  if (already) return { charged: 'balance', tokenKind: already.kind, tokenId: already.id }
  const match = await takeAvailable(admin, kind, skaterId, required, eventId)
    || await takeAvailable(admin, kind, skaterId, 'free', eventId)
  if (match) {
    await writeTokenTransaction(admin, {
      ...ownerFields(kind, skaterId),
      kind: match.kind,
      tx_type: 'deduction',
      quantity: -1,
      payment_status: 'paid',
      tokens_applied: true,
      calendar_event_id: eventId,
      reason: options?.reason || 'Class attendance',
      actor_id: options?.actorId ?? null,
    })
    await grantEarnedTokens(admin, kind, skaterId)
    return { charged: 'balance', tokenKind: match.kind, tokenId: match.id }
  }
  if (options?.allowOwed === false) return { charged: 'short', tokenKind: required, tokenId: '' }
  const owed = await insertTokens(admin, kind, skaterId, required, 'owed', 'payment', null, 1, eventId)
  const token = owed[0]
  if (!token) throw createError({ statusCode: 500, message: 'Could not record the class due' })
  await writeTokenTransaction(admin, {
    ...ownerFields(kind, skaterId),
    kind: required,
    tx_type: 'adjustment',
    quantity: -1,
    payment_status: 'pending',
    tokens_applied: true,
    calendar_event_id: eventId,
    reason: options?.reason || 'Override without tokens',
    actor_id: options?.actorId ?? null,
  })
  return { charged: 'due', tokenKind: required, tokenId: token.id }
}

async function takeAvailable(admin: Db, kind: OwnerKind, skaterId: string, tokenKind: TokenKind, eventId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const query = admin
      .from('skater_tokens')
      .select('id, kind')
      .eq('status', 'available')
      .eq('kind', tokenKind)
      .order('created_at', { ascending: true })
      .limit(1)
    const { data, error } = await ownerFilter(query, kind, skaterId)
    if (error) throw createError({ statusCode: 500, message: error.message })
    const row = data?.[0] as { id: string; kind: TokenKind } | undefined
    if (!row) return null
    const { data: updated, error: upErr } = await admin
      .from('skater_tokens')
      .update({ status: 'spent', spent_at: new Date().toISOString(), calendar_event_id: eventId })
      .eq('id', row.id)
      .eq('status', 'available')
      .select('id, kind')
    if (upErr) {
      if (/duplicate|unique/i.test(upErr.message)) return spentForEvent(admin, kind, skaterId, eventId)
      throw createError({ statusCode: 500, message: upErr.message })
    }
    const taken = updated?.[0] as { id: string; kind: TokenKind } | undefined
    if (taken) return taken
  }
  return null
}

export async function releaseClassToken(admin: Db, tokenId: string | null): Promise<{ release: TokenRelease; tokenKind: TokenKind | null }> {
  if (!tokenId) return { release: 'none', tokenKind: null }
  const { data, error } = await admin.from('skater_tokens').select('id, kind, status, skater_id, crew_member_id').eq('id', tokenId).maybeSingle()
  if (error) throw createError({ statusCode: 500, message: error.message })
  if (!data) return { release: 'none', tokenKind: null }
  if (data.status === 'owed') {
    const { error: upErr } = await admin.from('skater_tokens').update({ status: 'void', calendar_event_id: null }).eq('id', tokenId)
    if (upErr) throw createError({ statusCode: 500, message: upErr.message })
    return { release: 'voided', tokenKind: data.kind as TokenKind }
  }
  if (data.status === 'spent') {
    const { error: upErr } = await admin
      .from('skater_tokens')
      .update({ status: 'available', calendar_event_id: null, spent_at: null })
      .eq('id', tokenId)
    if (upErr) throw createError({ statusCode: 500, message: upErr.message })
    const ownerKind: OwnerKind = data.crew_member_id && !data.skater_id ? 'crew' : 'profile'
    const ownerId = ownerKind === 'crew' ? data.crew_member_id : data.skater_id
    if (ownerId) {
      await writeTokenTransaction(admin, {
        ...ownerFields(ownerKind, ownerId),
        kind: data.kind,
        tx_type: 'refund',
        quantity: 1,
        payment_status: 'paid',
        tokens_applied: true,
        reason: 'Class token returned',
      })
    }
    return { release: 'returned', tokenKind: data.kind as TokenKind }
  }
  return { release: 'none', tokenKind: data.kind as TokenKind }
}

/** A seat charged by the old class counter, before it had a token. */
export async function returnLegacyClass(
  admin: Db,
  kind: OwnerKind,
  skaterId: string,
  eventId: string,
  eventType: string | null,
  coachTier: string | null,
): Promise<TokenKind | null> {
  const packQuery = admin.from('finance_student_enrollments').select('id')
  const { data: packs, error: packErr } = kind === 'crew'
    ? await packQuery.eq('crew_member_id', skaterId)
    : await packQuery.eq('skater_id', skaterId)
  if (packErr) throw createError({ statusCode: 500, message: packErr.message })
  const packIds = (packs || []).map(row => row.id)
  if (!packIds.length) return null
  const { data: marks, error: markErr } = await admin
    .from('finance_enrollment_session_marks')
    .select('id, enrollment_id')
    .eq('calendar_event_id', eventId)
    .in('enrollment_id', packIds)
    .limit(1)
  if (markErr) throw createError({ statusCode: 500, message: markErr.message })
  const mark = marks?.[0]
  if (!mark) return null
  const tokenKind = tokenKindForEvent(eventType, coachTier)
  await insertTokens(admin, kind, skaterId, tokenKind, 'available', 'payment', mark.enrollment_id, 1)
  return tokenKind
}

async function grantEarnedTokens(admin: Db, kind: OwnerKind, skaterId: string) {
  const reward = await rewardRow(admin, kind, skaterId)
  if (kind !== 'profile') return
  let level: number
  try {
    level = await careerLevel(admin, skaterId)
  } catch {
    return
  }
  if (!reward.level_baselined) {
    const { error } = await admin
      .from('skater_token_rewards')
      .update({ level_baselined: true, last_rewarded_level: level })
      .eq('id', reward.id)
    if (error) throw createError({ statusCode: 500, message: error.message })
    return
  }
  const previous = Number(reward.last_rewarded_level || 1)
  if (level > previous) {
    const { data: claimed, error } = await admin
      .from('skater_token_rewards')
      .update({ last_rewarded_level: level })
      .eq('id', reward.id)
      .eq('last_rewarded_level', previous)
      .select('id')
    if (error) throw createError({ statusCode: 500, message: error.message })
    if (claimed?.length) await insertTokens(admin, kind, skaterId, 'free', 'available', 'level', null, level - previous)
  }
}

async function rewardRow(admin: Db, kind: OwnerKind, skaterId: string) {
  const query = admin
    .from('skater_token_rewards')
    .select('id, attendance_rewards_issued, level_baselined, last_rewarded_level')
  const { data, error } = await ownerFilter(query, kind, skaterId).maybeSingle()
  if (error) throw createError({ statusCode: 500, message: error.message })
  if (data) return data as {
    id: string
    attendance_rewards_issued: number
    level_baselined: boolean
    last_rewarded_level: number | null
  }
  const { data: created, error: insErr } = await admin
    .from('skater_token_rewards')
    .insert(ownerFields(kind, skaterId))
    .select('id, attendance_rewards_issued, level_baselined, last_rewarded_level')
    .single()
  if (insErr && /duplicate|unique/i.test(insErr.message)) {
    const again = await ownerFilter(
      admin.from('skater_token_rewards').select('id, attendance_rewards_issued, level_baselined, last_rewarded_level'),
      kind,
      skaterId,
    ).maybeSingle()
    if (again.data) {
      return again.data as {
        id: string
        attendance_rewards_issued: number
        level_baselined: boolean
        last_rewarded_level: number | null
      }
    }
  }
  if (insErr || !created) throw createError({ statusCode: 500, message: insErr?.message || 'Could not open token rewards' })
  return created as {
    id: string
    attendance_rewards_issued: number
    level_baselined: boolean
    last_rewarded_level: number | null
  }
}

async function careerLevel(admin: Db, skaterId: string) {
  const [skillsRes, progressRes, attendRes, videoRes, evalRes] = await Promise.all([
    admin.from('skills_library').select('id, name, name_es, area, structure, categoria, trick_type, manual_id, sort_order, difficulty, rarity').eq('is_active', true),
    admin.from('student_progress').select('skill_id, learned_at, created_at').eq('student_id', skaterId),
    admin.from('attendance').select('class_date, attended').eq('student_id', skaterId).eq('attended', true),
    admin.from('trick_evidence_videos').select('created_at').eq('student_id', skaterId),
    admin.from('student_evaluations').select('evaluation_date').eq('student_id', skaterId),
  ])
  const failure = skillsRes.error || progressRes.error || attendRes.error || videoRes.error || evalRes.error
  if (failure) throw new Error(failure.message)
  const skills = (skillsRes.data || []) as CareerSkill[]
  const career = computeSkaterCareer({
    skills,
    progress: progressRes.data || [],
    attendance: attendRes.data || [],
    videos: videoRes.data || [],
    evaluations: evalRes.data || [],
    es: false,
  })
  return career.level
}

export async function applyClassAttendance(
  admin: Db,
  input: {
    kind: OwnerKind
    skaterId: string
    eventId: string
    eventType: string | null
    coachTier: string | null
    status: AttendanceMark
    override: boolean
    actorId: string | null
  },
) {
  const consumes = attendanceConsumesToken(input.status)
  const existing = await spentForEvent(admin, input.kind, input.skaterId, input.eventId)
  if (!consumes) {
    if (!existing) return { ok: true, charged: null, tokenKind: null, needsOverride: false }
    const released = await releaseClassToken(admin, existing.id)
    return { ok: true, charged: null, tokenKind: released.tokenKind, needsOverride: false, returned: released.release !== 'none' }
  }
  if (existing) {
    return { ok: true, charged: existing.status === 'owed' ? 'due' as const : 'balance' as const, tokenKind: existing.kind, needsOverride: false, already: true }
  }
  const charge = await spendClassToken(
    admin,
    input.kind,
    input.skaterId,
    input.eventId,
    input.eventType,
    input.coachTier,
    { allowOwed: input.override, actorId: input.actorId, reason: input.status === 'absent' ? 'Absence' : 'Present' },
  )
  if (charge.charged === 'short') {
    return { ok: true, charged: 'short' as const, tokenKind: charge.tokenKind, needsOverride: true }
  }
  return { ok: true, charged: charge.charged, tokenKind: charge.tokenKind, tokenId: charge.tokenId, needsOverride: false }
}

export async function recordTokenPurchase(
  admin: Db,
  input: {
    enrollmentId: string
    paymentStatus: 'paid' | 'pending' | 'failed'
    idempotencyKey: string
    actorId: string | null
    amountMxn: number | null
    paymentMethod: string | null
    couponCode: string | null
  },
) {
  const { data: existing, error: existingErr } = await admin
    .from('skater_token_transactions')
    .select('id, payment_status, tokens_applied')
    .eq('idempotency_key', input.idempotencyKey)
    .maybeSingle()
  if (existingErr) {
    if (/skater_token_transactions|schema cache|does not exist/i.test(existingErr.message)) {
      throw createError({ statusCode: 400, message: 'Run supabase/migrations/add_token_transactions.sql in the Supabase SQL editor, then try again.' })
    }
    throw createError({ statusCode: 500, message: existingErr.message })
  }
  if (existing?.tokens_applied || (existing && input.paymentStatus !== 'paid')) {
    return { duplicate: true, minted: 0, paymentStatus: existing.payment_status }
  }

  const { data: row, error } = await admin
    .from('finance_student_enrollments')
    .select('id, skater_id, crew_member_id, coach_tier, class_kind, sessions_paid')
    .eq('id', input.enrollmentId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, message: error.message })
  if (!row) throw createError({ statusCode: 404, message: 'Package not found' })
  const ownerKind: OwnerKind = row.crew_member_id && !row.skater_id ? 'crew' : 'profile'
  const ownerId = ownerKind === 'crew' ? row.crew_member_id : row.skater_id
  if (!ownerId) throw createError({ statusCode: 400, message: 'Package has no skater' })
  const tokenKind = tokenKindForPackage(row.coach_tier, row.class_kind)

  if (input.paymentStatus !== 'paid') {
    if (!existing) {
      await writeTokenTransaction(admin, {
        ...ownerFields(ownerKind, ownerId),
        kind: tokenKind,
        tx_type: 'purchase',
        quantity: Number(row.sessions_paid || 0),
        amount_mxn: input.amountMxn,
        payment_method: input.paymentMethod,
        payment_status: input.paymentStatus,
        tokens_applied: false,
        finance_enrollment_id: row.id,
        coupon_code: input.couponCode,
        reason: input.paymentStatus === 'failed' ? 'Payment failed' : 'Payment pending',
        actor_id: input.actorId,
        idempotency_key: input.idempotencyKey,
      })
    }
    return { duplicate: false, minted: 0, paymentStatus: input.paymentStatus }
  }

  const minted = await mintPaymentTokens(admin, row.id, 0, {
    actorId: input.actorId,
    idempotencyKey: existing ? null : input.idempotencyKey,
    amountMxn: input.amountMxn,
    paymentMethod: input.paymentMethod,
    couponCode: input.couponCode,
    skipLog: Boolean(existing),
  })
  if (existing) {
    await admin.from('skater_token_transactions').update({
      payment_status: 'paid',
      tokens_applied: true,
      reason: 'Payment received',
    }).eq('id', existing.id)
  }
  return { duplicate: Boolean(existing), minted: minted.minted, paymentStatus: 'paid' as const }
}
