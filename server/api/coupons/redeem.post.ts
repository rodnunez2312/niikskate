/**
 * Consume a coupon once the purchase has been recorded.
 *
 * The /book wizard writes its credit row client-side, so it calls this straight
 * after with the credit id. Enrollment redemptions go through
 * /api/classes/enroll instead, which redeems in the same request as the booking.
 */
import { getServiceClient, redeemCoupon, requireUser } from '~/server/utils/couponEngine'
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

  // A credit id must belong to the caller, otherwise a redemption could be
  // attached to someone else's purchase.
  const userCreditId = typeof body?.userCreditId === 'string' ? body.userCreditId : null
  if (userCreditId) {
    const { data: credit } = await supabase
      .from('user_credits')
      .select('id, user_id')
      .eq('id', userCreditId)
      .maybeSingle()
    if (!credit || credit.user_id !== userId) {
      throw createError({ statusCode: 403, message: 'That purchase does not belong to you' })
    }
  }

  const result = await redeemCoupon(
    supabase,
    {
      code,
      subtotalMxn,
      classKind: typeof body?.classKind === 'string' ? body.classKind : null,
      coachTier: typeof body?.coachTier === 'string' ? body.coachTier : null,
      userId,
      crewMemberId: typeof body?.crewMemberId === 'string' ? body.crewMemberId : null,
      skaterProfileId: typeof body?.skaterProfileId === 'string' ? body.skaterProfileId : null,
    },
    {
      context: body?.context === 'season_enroll' ? 'season_enroll' : 'book',
      userCreditId,
      calendarEventId: typeof body?.calendarEventId === 'string' ? body.calendarEventId : null,
    },
  )

  if (!result.ok) {
    return { redeemed: false as const, reason: result.reason }
  }

  const es = body?.language !== 'en'
  return {
    redeemed: true as const,
    code: result.coupon.code,
    label: couponLabel(result.coupon, es),
    discountMxn: result.discountMxn,
    finalMxn: result.finalMxn,
  }
})
