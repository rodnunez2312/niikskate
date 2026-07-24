import { createClient } from '@supabase/supabase-js'
import { getHeader } from 'h3'
import type { H3Event } from 'h3'

/** Verify Bearer session belongs to an admin; return service-role client + caller id. */
export async function requireAdmin(event: H3Event) {
  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseAnon = config.public.supabaseKey as string
  const serviceKey = config.supabaseServiceKey as string

  if (!serviceKey || !supabaseUrl || !supabaseAnon) {
    throw createError({ statusCode: 500, message: 'Server missing Supabase configuration' })
  }

  const authHeader = getHeader(event, 'authorization') || ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!accessToken) {
    throw createError({ statusCode: 401, message: 'Missing session' })
  }

  const sessionClient = createClient(supabaseUrl, supabaseAnon)
  const { data: userData, error: userErr } = await sessionClient.auth.getUser(accessToken)
  if (userErr || !userData?.user) {
    throw createError({ statusCode: 401, message: 'Invalid session' })
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: profile } = await adminClient
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .single()

  if (profile?.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Admin access required' })
  }

  return { adminId: userData.user.id, adminClient }
}
