/**
 * Admin-only: create a new user with email/password and set profile (full_name, role).
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (Dashboard → Settings → API → service_role).
 */
import { requireAdmin } from '~/server/utils/requireAdmin'
import { computeAgeFromDob } from '~/utils/ageEligibility'

function normalizeDateOfBirth(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const trimmed = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const [y, m, d] = trimmed.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  if (dt > new Date()) return null
  return trimmed
}

export default defineEventHandler(async (event) => {
  const { adminClient: supabase } = await requireAdmin(event)

  const body = await readBody(event)
  const { email, password, full_name, role, phone, date_of_birth, customer_kind, guardian_user_id } = body || {}

  if (!email || typeof email !== 'string' || !email.trim()) {
    throw createError({
      statusCode: 400,
      message: 'Email is required',
    })
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw createError({
      statusCode: 400,
      message: 'Password is required (min 6 characters)',
    })
  }
  const validRoles = ['coach', 'customer']
  if (!role || !validRoles.includes(role)) {
    throw createError({
      statusCode: 400,
      message: 'Role must be coach or customer (new admins cannot be created)',
    })
  }

  const kind = customer_kind === 'guardian' ? 'guardian' : 'skater'
  const dob = normalizeDateOfBirth(date_of_birth)
  if (role === 'customer' && kind === 'skater' && !dob) {
    throw createError({
      statusCode: 400,
      message: 'Date of birth is required for skaters (YYYY-MM-DD)',
    })
  }

  let linkedGuardianId: string | null = null
  if (role === 'customer' && kind === 'skater' && guardian_user_id) {
    if (typeof guardian_user_id !== 'string') {
      throw createError({ statusCode: 400, message: 'Invalid guardian_user_id' })
    }
    const { data: guardian, error: gErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', guardian_user_id)
      .maybeSingle()
    if (gErr) throw createError({ statusCode: 500, message: gErr.message })
    if (!guardian || guardian.role !== 'customer') {
      throw createError({ statusCode: 400, message: 'Guardian must be a family account' })
    }
    linkedGuardianId = guardian_user_id
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password: password.trim(),
    email_confirm: true,
    user_metadata: { full_name: (full_name || '').trim() || email.split('@')[0] },
  })

  if (authError) {
    const code = authError.message?.includes('already registered') ? 409 : 400
    throw createError({
      statusCode: code,
      message: authError.message || 'Failed to create user',
    })
  }

  const userId = authData?.user?.id
  if (!userId) {
    throw createError({ statusCode: 500, message: 'User created but no id returned' })
  }

  // Set profile full_name and role (upsert in case trigger didn't create row yet)
  const displayName = (full_name || '').trim() || authData.user?.email?.split('@')[0] || 'User'
  const age = dob ? computeAgeFromDob(dob) : null
  const nameParts = displayName.split(/\s+/).filter(Boolean)
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: email.trim(),
        full_name: displayName,
        first_name: nameParts[0] ?? null,
        last_name: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
        role,
        phone: (phone || '').trim() || null,
        date_of_birth: dob,
        age,
        skill_group_id: null,
        guardian_user_id: linkedGuardianId,
        // Admin-created accounts are active immediately (Kanban + login).
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

  if (profileError) {
    console.error('Profile upsert after create user:', profileError)
  }

  return {
    ok: true,
    id: userId,
    email: authData.user?.email,
    message: 'User created successfully',
  }
})
