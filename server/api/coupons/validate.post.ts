/**
 * Preview a coupon without consuming it, so the checkout can show the new total
 * before the family commits.
 */
import { checkCoupon, getServiceClient, requireUser } from '~/server/utils/couponEngine'
import { couponLabel } from '~/utils/coupons'

export default defineEventHandler(async (event) => {
  const userId = await requireUser(event)
  const body = await readBody(event)

  const code = typeof body?.code === 'string' ? body.code : ''
  const subtotalMxn = Number(body?.subtotalMxn)
  if (!code.trim()) {
    throw createError({ statusCode: 400, message: 'code is required' })
  }
  if (!Number.isFinite(subtotalMxn) || subtotalMxn < 0) {
    throw createError({ statusCode: 400, message: 'subtotalMxn must be a positive number' })
  }

  const supabase = getServiceClient()
  const result = await checkCoupon(supabase, {
    code,
    subtotalMxn,
    classKind: typeof body?.classKind === 'string' ? body.classKind : null,
    coachTier: typeof body?.coachTier === 'string' ? body.coachTier : null,
    userId,
    crewMemberId: typeof body?.crewMemberId === 'string' ? body.crewMemberId : null,
  })

  if (!result.ok) {
    // 200 with a reason: a wrong code is a normal outcome, not a request failure.
    return { valid: false as const, reason: result.reason }
  }

  const es = body?.language !== 'en'
  return {
    valid: true as const,
    couponId: result.coupon.id,
    code: result.coupon.code,
    label: couponLabel(result.coupon, es),
    description: result.coupon.description,
    discountType: result.coupon.discount_type,
    discountMxn: result.discountMxn,
    finalMxn: result.finalMxn,
  }
})
