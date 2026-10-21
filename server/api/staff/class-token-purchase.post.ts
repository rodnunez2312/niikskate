/** Record a token purchase. Pending and failed payments do not mint tokens. */
import { requireStaff } from '~/server/utils/requireStaff'
import { recordTokenPurchase } from '~/server/utils/classTokens'
import { assertIdempotencyKey } from '~/utils/classTokens'

export default defineEventHandler(async (event) => {
  const { adminClient, role, staffId } = await requireStaff(event)
  if (role !== 'admin') throw createError({ statusCode: 403, message: 'Admin access required' })
  const body = await readBody(event)
  const enrollmentId = typeof body?.enrollmentId === 'string' ? body.enrollmentId.trim() : ''
  const paymentStatus = body?.paymentStatus === 'pending' || body?.paymentStatus === 'failed' ? body.paymentStatus : 'paid'
  let idempotencyKey = ''
  try {
    idempotencyKey = assertIdempotencyKey(typeof body?.idempotencyKey === 'string' ? body.idempotencyKey : '')
  } catch {
    throw createError({ statusCode: 400, message: 'idempotencyKey is required' })
  }
  if (!enrollmentId) throw createError({ statusCode: 400, message: 'enrollmentId is required' })

  const result = await recordTokenPurchase(adminClient, {
    enrollmentId,
    paymentStatus,
    idempotencyKey,
    actorId: staffId,
    amountMxn: Number.isFinite(Number(body?.amountMxn)) ? Number(body.amountMxn) : null,
    paymentMethod: typeof body?.paymentMethod === 'string' ? body.paymentMethod : null,
    couponCode: typeof body?.couponCode === 'string' ? body.couponCode : null,
  })
  return { ok: true, ...result }
})
