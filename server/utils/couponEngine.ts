/**
 * Server-side coupon validation and redemption.
 *
 * All coupon reads happen here with the service role. Customers have no SELECT
 * policy on `coupons`, so the only thing a family can do is test a code they were
 * given — they cannot list codes or discover which skaters are allow-listed.
 */
import { createClient } from '@supabase/supabase-js'
import { getHeader } from 'h3'
import type { H3Event } from 'h3'
import {
  computeCouponDiscount,
  couponCoversScope,
  normalizeCouponCode,
  type CouponRejection,
  type CouponRow,
} from '~/utils/coupons'

export interface CouponContext {
  code: string
  subtotalMxn: number
  classKind?: string | null
  coachTier?: string | null
  userId: string
  crewMemberId?: string | null
}

export type CouponCheck =
  | {
      ok: true
      coupon: CouponRow
      discountMxn: number
      finalMxn: number
      /** Only set once ownership was verified. */
      crewMemberId: string | null
    }
  | { ok: false; reason: CouponRejection }

export function getServiceClient() {
  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl as string
  const serviceKey = config.supabaseServiceKey as string
  if (!serviceKey || !supabaseUrl) {
    throw createError({ statusCode: 500, message: 'Server missing Supabase configuration' })
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Resolve the caller from the Bearer token. Coupons always require an account. */
export async function requireUser(event: H3Event) {
  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseAnon = config.public.supabaseKey as string

  const authHeader = getHeader(event, 'authorization') || ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!accessToken) {
    throw createError({ statusCode: 401, message: 'Sign in to use a coupon' })
  }

  const sessionClient = createClient(supabaseUrl, supabaseAnon)
  const { data, error } = await sessionClient.auth.getUser(accessToken)
  if (error || !data?.user) {
    throw createError({ statusCode: 401, message: 'Invalid session' })
  }
  return data.user.id
}

type ServiceClient = ReturnType<typeof getServiceClient>

/**
 * Check a code without consuming it. Safe to call on every keystroke of the
 * "apply" button; nothing is written.
 */
export async function checkCoupon(
  supabase: ServiceClient,
  input: CouponContext,
): Promise<CouponCheck> {
  const code = normalizeCouponCode(input.code)
  if (!code) return { ok: false, reason: 'not_found' }

  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code)
    .maybeSingle()

  if (error) return { ok: false, reason: 'server_error' }
  if (!data) return { ok: false, reason: 'not_found' }

  const coupon = data as unknown as CouponRow
  if (!coupon.is_active) return { ok: false, reason: 'inactive' }

  const today = new Date().toISOString().slice(0, 10)
  if (coupon.starts_on && today < coupon.starts_on) return { ok: false, reason: 'not_started' }
  if (coupon.expires_on && today > coupon.expires_on) return { ok: false, reason: 'expired' }

  if (coupon.max_redemptions != null && coupon.times_redeemed >= coupon.max_redemptions) {
    return { ok: false, reason: 'limit_reached' }
  }

  if (!couponCoversScope(coupon, input.classKind, input.coachTier)) {
    return { ok: false, reason: 'scope_class' }
  }

  // A crew member id is only trustworthy once we know it belongs to the caller;
  // otherwise anyone could claim another family's allow-listed child.
  let crewMemberId: string | null = null
  if (input.crewMemberId) {
    const { data: crewRow, error: crewErr } = await supabase
      .from('crew_members')
      .select('id, guardian_user_id')
      .eq('id', input.crewMemberId)
      .maybeSingle()
    if (crewErr) return { ok: false, reason: 'server_error' }
    if (!crewRow || crewRow.guardian_user_id !== input.userId) {
      return { ok: false, reason: 'not_allowed' }
    }
    crewMemberId = crewRow.id
  }

  // Restricted coupons: the guardian's profile authorizes their whole crew, or a
  // single child can be listed on its own.
  if (coupon.restricted_to_skaters) {
    const { data: allowRows, error: allowErr } = await supabase
      .from('coupon_skaters')
      .select('skater_id, crew_member_id')
      .eq('coupon_id', coupon.id)
    if (allowErr) return { ok: false, reason: 'server_error' }

    const allowed = (allowRows || []).some(
      row =>
        (row.skater_id && row.skater_id === input.userId)
        || (crewMemberId && row.crew_member_id === crewMemberId),
    )
    if (!allowed) return { ok: false, reason: 'not_allowed' }
  }

  if (coupon.max_per_skater != null) {
    const { count, error: countErr } = await supabase
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', coupon.id)
      .eq('user_id', input.userId)
    if (countErr) return { ok: false, reason: 'server_error' }
    if ((count ?? 0) >= coupon.max_per_skater) {
      return { ok: false, reason: 'skater_limit_reached' }
    }
  }

  const { discountMxn, finalMxn } = computeCouponDiscount(coupon, input.subtotalMxn)
  if (discountMxn <= 0) return { ok: false, reason: 'no_discount' }

  return { ok: true, coupon, discountMxn, finalMxn, crewMemberId }
}

export interface RedeemLinks {
  context: 'book' | 'season_enroll' | 'admin_income' | 'admin_enrollment'
  userCreditId?: string | null
  calendarEventId?: string | null
  financePaymentId?: string | null
  notes?: string | null
}

/**
 * Consume the coupon: claim a slot against `max_redemptions` first, then log the
 * redemption. The conditional UPDATE is what makes the limit safe when two
 * families submit at the same time.
 */
export async function redeemCoupon(
  supabase: ServiceClient,
  input: CouponContext,
  links: RedeemLinks,
): Promise<CouponCheck> {
  const check = await checkCoupon(supabase, input)
  if (!check.ok) return check

  const { coupon, discountMxn, finalMxn, crewMemberId } = check

  if (coupon.max_redemptions != null) {
    const { data: claimed, error: claimErr } = await supabase
      .from('coupons')
      .update({ times_redeemed: coupon.times_redeemed + 1 })
      .eq('id', coupon.id)
      .eq('times_redeemed', coupon.times_redeemed)
      .lt('times_redeemed', coupon.max_redemptions)
      .select('id')
      .maybeSingle()
    if (claimErr) return { ok: false, reason: 'server_error' }
    if (!claimed) return { ok: false, reason: 'limit_reached' }
  } else {
    const { error: bumpErr } = await supabase
      .from('coupons')
      .update({ times_redeemed: coupon.times_redeemed + 1 })
      .eq('id', coupon.id)
    if (bumpErr) return { ok: false, reason: 'server_error' }
  }

  const { error: logErr } = await supabase.from('coupon_redemptions').insert({
    coupon_id: coupon.id,
    code: coupon.code,
    user_id: input.userId,
    crew_member_id: crewMemberId,
    context: links.context,
    class_kind: input.classKind ?? null,
    coach_tier: input.coachTier ?? null,
    original_mxn: Math.max(0, Number(input.subtotalMxn) || 0),
    discount_mxn: discountMxn,
    final_mxn: finalMxn,
    user_credit_id: links.userCreditId ?? null,
    calendar_event_id: links.calendarEventId ?? null,
    finance_payment_id: links.financePaymentId ?? null,
    notes: links.notes ?? null,
  })
  if (logErr) return { ok: false, reason: 'server_error' }

  return check
}
