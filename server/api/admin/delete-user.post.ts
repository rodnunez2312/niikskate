/**
 * Admin-only: permanently delete a skater (customer) account.
 */
import { requireAdmin } from '~/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const { adminId, adminClient } = await requireAdmin(event)

  const body = await readBody(event)
  const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
  if (!userId) {
    throw createError({ statusCode: 400, message: 'userId is required' })
  }

  if (userId === adminId) {
    throw createError({ statusCode: 400, message: 'You cannot delete your own account' })
  }

  const { data: target, error: targetErr } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .single()

  if (targetErr || !target) {
    throw createError({ statusCode: 404, message: 'User not found' })
  }

  if (target.role === 'admin') {
    throw createError({ statusCode: 403, message: 'Admin accounts cannot be deleted here' })
  }

  if (target.role !== 'customer') {
    throw createError({
      statusCode: 403,
      message: 'Only skater (customer) accounts can be deleted from this screen',
    })
  }

  const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId)
  if (deleteErr) {
    throw createError({
      statusCode: 400,
      message: deleteErr.message || 'Failed to delete user',
    })
  }

  return { ok: true, message: 'User deleted' }
})
