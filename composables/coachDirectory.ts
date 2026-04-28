import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sole admin account that also teaches (appears in coach scheduling, payments, etc.).
 * Other admins (e.g. Marina Reyes) are not included in coach directory queries.
 */
export const ADMIN_COACH_EMAIL = 'rodnunez23@gmail.com'

/** Admin-only accounts that must not be assignable as program coaches. */
export const ADMIN_ONLY_EXCLUDE_FROM_PROGRAM_COACH_EMAILS = ['marinarssanchez@gmail.com'] as const

export type FetchCoachDirectoryOptions = {
  select: string
  /** When true, only profiles with is_active = true */
  activeOnly?: boolean
}

function mergeCoachRows<T extends { id: string; full_name?: string | null }>(
  coaches: T[] | null,
  adminCoach: T | null,
): T[] {
  const byId = new Map<string, T>()
  for (const p of coaches || []) byId.set(p.id, p)
  if (adminCoach && !byId.has(adminCoach.id)) byId.set(adminCoach.id, adminCoach)
  return [...byId.values()].sort((a, b) =>
    String(a.full_name ?? '').localeCompare(String(b.full_name ?? ''), undefined, { sensitivity: 'base' }),
  )
}

/**
 * Every `role = coach` profile, plus the one admin (`ADMIN_COACH_EMAIL`) who also teaches.
 */
export async function fetchCoachDirectoryProfiles<T extends { id: string; full_name?: string | null }>(
  client: SupabaseClient,
  options: FetchCoachDirectoryOptions,
): Promise<T[]> {
  const { select, activeOnly } = options

  let q1 = client.from('profiles').select(select).eq('role', 'coach')
  if (activeOnly) q1 = q1.eq('is_active', true)

  const { data: coaches, error: e1 } = await q1.order('full_name')
  if (e1) throw e1

  let q2 = client
    .from('profiles')
    .select(select)
    .eq('role', 'admin')
    .ilike('email', ADMIN_COACH_EMAIL)
  if (activeOnly) q2 = q2.eq('is_active', true)

  const { data: adminCoach, error: e2 } = await q2.maybeSingle()
  if (e2) throw e2

  return mergeCoachRows(coaches as T[] | null, adminCoach as T | null)
}

/** Active coaches count: all active `coach` rows plus active admin at `ADMIN_COACH_EMAIL` if present. */
export async function countActiveCoachDirectoryProfiles(client: SupabaseClient): Promise<number> {
  const { count: coachCount, error: e1 } = await client
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'coach')
    .eq('is_active', true)
  if (e1) throw e1

  const { count: adminCoachCount, error: e2 } = await client
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'admin')
    .ilike('email', ADMIN_COACH_EMAIL)
    .eq('is_active', true)
  if (e2) throw e2

  return (coachCount || 0) + (adminCoachCount || 0)
}
