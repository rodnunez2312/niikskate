/** Mint or void payment tokens when a package's class count changes. Admin only. */
import { requireStaff } from '~/server/utils/requireStaff'
import { mintPaymentTokens } from '~/server/utils/classTokens'

const migrationHint = 'Run supabase/migrations/add_skater_tokens.sql in the Supabase SQL editor, then try again.'

export default defineEventHandler(async (event) => {
  const { adminClient, role } = await requireStaff(event)
  if (role !== 'admin') throw createError({ statusCode: 403, message: 'Admin access required' })

  const body = await readBody(event)
  const enrollmentId = typeof body?.enrollmentId === 'string' ? body.enrollmentId.trim() : ''
  const previousSessionsPaid = Number(body?.previousSessionsPaid)
  if (!enrollmentId || !Number.isFinite(previousSessionsPaid)) {
    throw createError({ statusCode: 400, message: 'enrollmentId and previousSessionsPaid are required' })
  }

  try {
    const result = await mintPaymentTokens(adminClient, enrollmentId, previousSessionsPaid)
    return { ok: true, ...result }
  } catch (err: any) {
    const message = err?.statusMessage || err?.message || 'Could not mint tokens'
    if (/skater_tokens|schema cache/i.test(message)) {
      throw createError({ statusCode: 400, message: migrationHint })
    }
    throw err
  }
})
