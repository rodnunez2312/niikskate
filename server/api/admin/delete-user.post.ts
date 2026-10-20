/**
 * Admin-only: permanently delete a skater (customer) or coach account.
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

  if (target.role !== 'customer' && target.role !== 'coach') {
    throw createError({
      statusCode: 403,
      message: 'Only skater and coach accounts can be deleted',
    })
  }

  // Keep students. A family login is the parent account; kids point at it and
  // must stay after the login and email are removed.
  const { error: kidsErr } = await adminClient
    .from('profiles')
    .update({ guardian_user_id: null })
    .eq('guardian_user_id', userId)
  if (kidsErr) {
    throw createError({ statusCode: 400, message: kidsErr.message })
  }

  const { error: crewErr } = await adminClient
    .from('crew_members')
    .update({ guardian_user_id: null })
    .eq('guardian_user_id', userId)
  if (crewErr && !/schema cache|does not exist/i.test(crewErr.message)) {
    throw createError({
      statusCode: 400,
      message: crewErr.message.includes('null')
        ? 'Run supabase/migrations/crew_members_optional_guardian.sql, then delete the family again.'
        : crewErr.message,
    })
  }

  const { data: seats } = await adminClient
    .from('class_session_enrollments')
    .select('id, skater_profile_id')
    .eq('user_id', userId)
  for (const seat of (seats || []) as { id: string; skater_profile_id: string | null }[]) {
    if (!seat.skater_profile_id || seat.skater_profile_id === userId) continue
    const { error: moveErr } = await adminClient
      .from('class_session_enrollments')
      .update({ user_id: seat.skater_profile_id })
      .eq('id', seat.id)
    if (moveErr && /duplicate|unique/i.test(moveErr.message)) {
      await adminClient.from('class_session_enrollments').delete().eq('id', seat.id)
    }
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
