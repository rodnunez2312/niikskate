/**
 * Everything a family sees about itself: classes taken and still to come,
 * attendance, what they paid, and the coupons an admin assigned to them.
 *
 * The finance tables are admin-only under RLS on purpose, so this runs with the
 * service role and hands back a narrow, per-skater shape instead of opening the
 * sheet up. Coupons are limited to the ones explicitly assigned to this family;
 * codes stay unguessable because nothing else is ever listed.
 */
import { getServiceSupabase, getSessionUserId } from '~/server/utils/bookableSessions'
import { computeCouponDiscount } from '~/utils/coupons'

export interface MemberAccountClass {
  id: string
  title: string
  date: string
  startTime: string | null
  endTime: string | null
  location: string | null
}

export interface MemberAccountPayment {
  id: string
  paidOn: string
  amountMxn: number
  method: string | null
  concept: string | null
}

export interface MemberAccountPlan {
  id: string
  label: string
  priceMxn: number
  packagesPaid: number
  amountPaidMxn: number
  sessionsPaid: number
  attended: number
  absences: number
  remaining: number
  lastPaymentOn: string | null
  attendWeekdays: number[]
}

export interface MemberAccountSkater {
  key: string
  name: string
  /** 'family' is the guardian's own row: they pay, they do not ride. */
  kind: 'self' | 'skater' | 'crew' | 'family'
  plans: MemberAccountPlan[]
  totals: {
    sessionsPaid: number
    attended: number
    absences: number
    remaining: number
    amountPaidMxn: number
    lastPaymentOn: string | null
  }
  upcoming: MemberAccountClass[]
  past: MemberAccountClass[]
  payments: MemberAccountPayment[]
}

export interface MemberAccountCoupon {
  id: string
  code: string
  labelEs: string
  labelEn: string | null
  description: string | null
  discountType: string
  discountValue: number
  /** What it takes off a $1,000 package, so the family sees the size of it. */
  sampleDiscountMxn: number
  expiresOn: string | null
  forNames: string[]
}

const num = (v: unknown) => Number(v) || 0

/** Latest of two YYYY-MM-DD dates, tolerating nulls. */
const laterDate = (a: string | null, b: string | null) => {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

export default defineEventHandler(async (event) => {
  const userId = await getSessionUserId(event)
  if (!userId) throw createError({ statusCode: 401, message: 'Sign in to see your account' })

  const supabase = getServiceSupabase()
  const today = new Date().toISOString().slice(0, 10)

  const { data: me } = await supabase
    .from('profiles')
    .select('id, full_name, first_name, customer_kind')
    .eq('id', userId)
    .maybeSingle()

  const [{ data: linkedRows }, { data: crewRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, first_name')
      .eq('guardian_user_id', userId)
      .neq('id', userId),
    supabase
      .from('crew_members')
      .select('id, first_name, last_name, full_name')
      .eq('guardian_user_id', userId)
      .order('sort_order'),
  ])

  const skaters: MemberAccountSkater[] = []
  const blank = () => ({
    plans: [] as MemberAccountPlan[],
    totals: {
      sessionsPaid: 0,
      attended: 0,
      absences: 0,
      remaining: 0,
      amountPaidMxn: 0,
      lastPaymentOn: null as string | null,
    },
    upcoming: [] as MemberAccountClass[],
    past: [] as MemberAccountClass[],
    payments: [] as MemberAccountPayment[],
  })

  // A guardian never skates, but packages and payments were often booked against
  // their account, so their row is kept and dropped later if it stays empty.
  const isGuardian = me?.customer_kind === 'guardian'
  if (me) {
    skaters.push({
      key: 'self',
      name: me.full_name || me.first_name || 'Yo',
      kind: isGuardian ? 'family' : 'self',
      ...blank(),
    })
  }
  for (const row of linkedRows || []) {
    skaters.push({
      key: row.id,
      name: row.full_name || row.first_name || 'Skater',
      kind: 'skater',
      ...blank(),
    })
  }
  for (const row of crewRows || []) {
    const name = row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ')
    skaters.push({ key: row.id, name: name || 'Skater', kind: 'crew', ...blank(), })
  }

  const byKey = new Map(skaters.map(s => [s.key, s]))
  const profileIds = [userId, ...(linkedRows || []).map(r => r.id)]
  const crewIds = (crewRows || []).map(r => r.id)

  /** Finance rows point at a profile or a crew member; 'self' covers the payer. */
  const keyForFinance = (skaterId: string | null, crewMemberId: string | null) => {
    if (crewMemberId && byKey.has(crewMemberId)) return crewMemberId
    if (!skaterId) return null
    if (skaterId === userId) return byKey.has('self') ? 'self' : null
    return byKey.has(skaterId) ? skaterId : null
  }

  // ---------------------------------------------------------------- finance
  const { data: enrollmentRows } = await supabase
    .from('finance_student_enrollments')
    .select(
      'id, skater_id, crew_member_id, plan_label, price_mxn, packages_paid, amount_paid_mxn, sessions_paid, attended, absences, remaining_sessions, last_payment_on, attend_weekdays, is_active',
    )
    .or(`skater_id.in.(${profileIds.join(',')}),crew_member_id.in.(${crewIds.join(',') || '00000000-0000-0000-0000-000000000000'})`)

  for (const row of enrollmentRows || []) {
    const target = byKey.get(keyForFinance(row.skater_id, row.crew_member_id) || '')
    if (!target) continue
    const sessions = num(row.sessions_paid)
    const attended = num(row.attended)
    const absences = num(row.absences)
    const remaining = row.remaining_sessions != null
      ? num(row.remaining_sessions)
      : sessions - attended - absences

    target.plans.push({
      id: row.id,
      label: row.plan_label || '—',
      priceMxn: num(row.price_mxn),
      packagesPaid: num(row.packages_paid),
      amountPaidMxn: num(row.amount_paid_mxn),
      sessionsPaid: sessions,
      attended,
      absences,
      remaining,
      lastPaymentOn: row.last_payment_on ?? null,
      attendWeekdays: Array.isArray(row.attend_weekdays) ? row.attend_weekdays : [],
    })

    target.totals.sessionsPaid += sessions
    target.totals.attended += attended
    target.totals.absences += absences
    target.totals.remaining += Math.max(0, remaining)
    target.totals.amountPaidMxn += num(row.amount_paid_mxn)
    target.totals.lastPaymentOn = laterDate(target.totals.lastPaymentOn, row.last_payment_on ?? null)
  }

  // --------------------------------------------------------------- payments
  const { data: paymentRows } = await supabase
    .from('finance_payments')
    .select('id, paid_on, amount_mxn, payment_method, category, skater_id, crew_member_id, status')
    .or(`skater_id.in.(${profileIds.join(',')}),crew_member_id.in.(${crewIds.join(',') || '00000000-0000-0000-0000-000000000000'})`)
    .order('paid_on', { ascending: false })

  for (const row of paymentRows || []) {
    if (row.status === 'refunded') continue
    const target = byKey.get(keyForFinance(row.skater_id, row.crew_member_id) || '')
    if (!target) continue
    target.payments.push({
      id: row.id,
      paidOn: row.paid_on,
      amountMxn: num(row.amount_mxn),
      method: row.payment_method ?? null,
      concept: row.category ?? null,
    })
  }

  // ---------------------------------------------------------------- classes
  const { data: classRows } = await supabase
    .from('class_session_enrollments')
    .select('calendar_event_id, crew_member_id, skater_profile_id, user_id, status')
    .or(`user_id.eq.${userId},skater_profile_id.in.(${profileIds.join(',')})`)
    .eq('status', 'confirmed')

  const eventIds = [...new Set((classRows || []).map(r => r.calendar_event_id))]
  const eventById = new Map<string, any>()
  if (eventIds.length) {
    const { data: eventRows } = await supabase
      .from('school_calendar_events')
      .select('id, title, start_date, start_time, end_time, location, skatepark')
      .in('id', eventIds)
    for (const e of eventRows || []) eventById.set(e.id, e)
  }

  for (const row of classRows || []) {
    const key = row.crew_member_id && byKey.has(row.crew_member_id)
      ? row.crew_member_id
      : row.skater_profile_id && byKey.has(row.skater_profile_id)
        ? row.skater_profile_id
        : byKey.has('self') ? 'self' : null
    const target = key ? byKey.get(key) : null
    const ev = eventById.get(row.calendar_event_id)
    if (!target || !ev) continue

    const entry: MemberAccountClass = {
      id: ev.id,
      title: ev.title,
      date: ev.start_date,
      startTime: ev.start_time ?? null,
      endTime: ev.end_time ?? null,
      location: ev.skatepark || ev.location || null,
    }
    if (ev.start_date >= today) target.upcoming.push(entry)
    else target.past.push(entry)
  }

  for (const s of skaters) {
    s.upcoming.sort((a, b) => a.date.localeCompare(b.date))
    s.past.sort((a, b) => b.date.localeCompare(a.date))
  }

  // ----------------------------------------------------------------- coupons
  const { data: allowRows } = await supabase
    .from('coupon_skaters')
    .select('coupon_id, skater_id, crew_member_id')
    .or(`skater_id.in.(${profileIds.join(',')}),crew_member_id.in.(${crewIds.join(',') || '00000000-0000-0000-0000-000000000000'})`)

  const namesByCoupon = new Map<string, Set<string>>()
  for (const row of allowRows || []) {
    const key = keyForFinance(row.skater_id, row.crew_member_id)
    const name = key ? byKey.get(key)?.name : null
    if (!namesByCoupon.has(row.coupon_id)) namesByCoupon.set(row.coupon_id, new Set())
    if (name) namesByCoupon.get(row.coupon_id)!.add(name)
  }

  const coupons: MemberAccountCoupon[] = []
  if (namesByCoupon.size) {
    const { data: couponRows } = await supabase
      .from('coupons')
      .select(
        'id, code, label_es, label_en, description, discount_type, discount_value, starts_on, expires_on, is_active, max_redemptions, times_redeemed',
      )
      .in('id', [...namesByCoupon.keys()])
      .eq('is_active', true)

    for (const c of couponRows || []) {
      if (c.starts_on && today < c.starts_on) continue
      if (c.expires_on && today > c.expires_on) continue
      if (c.max_redemptions != null && num(c.times_redeemed) >= num(c.max_redemptions)) continue
      coupons.push({
        id: c.id,
        code: c.code,
        labelEs: c.label_es,
        labelEn: c.label_en ?? null,
        description: c.description ?? null,
        discountType: c.discount_type,
        discountValue: num(c.discount_value),
        sampleDiscountMxn: computeCouponDiscount(c, 1000).discountMxn,
        expiresOn: c.expires_on ?? null,
        forNames: [...(namesByCoupon.get(c.id) || [])],
      })
    }
  }

  // An empty guardian row is just noise on a family that books per child.
  const visible = skaters.filter(
    s =>
      s.kind !== 'family'
      || s.plans.length > 0
      || s.upcoming.length > 0
      || s.past.length > 0
      || s.payments.length > 0,
  )

  return { skaters: visible, coupons }
})
