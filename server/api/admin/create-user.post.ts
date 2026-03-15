/**
 * Admin-only: create a new user with email/password and set profile (full_name, role).
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env (Dashboard → Settings → API → service_role).
 */
import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const serviceKey = config.supabaseServiceKey
  const supabaseUrl = config.public.supabaseUrl as string

  if (!serviceKey || !supabaseUrl) {
    throw createError({
      statusCode: 500,
      message: 'Server missing Supabase service role configuration',
    })
  }

  const body = await readBody(event)
  const { email, password, full_name, role, phone } = body || {}

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
  const validRoles = ['admin', 'coach', 'customer']
  if (!role || !validRoles.includes(role)) {
    throw createError({
      statusCode: 400,
      message: 'Role must be one of: admin, coach, customer',
    })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

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
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: email.trim(),
        full_name: displayName,
        role,
        phone: (phone || '').trim() || null,
        // New users are pending until admin explicitly activates access.
        is_active: false,
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
