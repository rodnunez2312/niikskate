import { createClient } from '@supabase/supabase-js'
import { getHeader } from 'h3'
import type { H3Event } from 'h3'

export const SPOTS_PER_COACH = 6

export type BookableSessionRow = {
  id: string
  title: string
  event_type: string
  start_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  location: string | null
  description: string | null
  is_bookable: boolean
  time_slot: 'monday' | 'morning' | 'early' | 'late' | null
  audience_category: string | null
  audience_categories: string[] | null
  skill_level: string | null
  min_age: number | null
  max_age: number | null
  skatepark: string | null
  price_mxn: number | null
  program_series_id?: string | null
  max_capacity_override?: number | null
  season_slug?: string | null
}

const jsDayToPgDow = (dayNum: number): string | null => {
  const map: Record<number, string> = {
    0: 'sunday',
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
  }
  return map[dayNum] ?? null
}

export function getServiceSupabase() {
  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl as string
  const serviceKey = config.supabaseServiceKey as string
  if (!serviceKey || !supabaseUrl) {
    throw createError({ statusCode: 500, message: 'Server missing Supabase configuration' })
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function countCoachesForSlot(
  supabase: ReturnType<typeof getServiceSupabase>,
  dateStr: string,
  slot: 'monday' | 'morning' | 'early' | 'late',
): Promise<number> {
  const { count: dateCount, error: dateErr } = await supabase
    .from('coach_date_availability')
    .select('coach_id', { count: 'exact', head: true })
    .eq('date', dateStr)
    .eq('time_slot', slot)
    .eq('is_available', true)

  if (!dateErr && (dateCount ?? 0) > 0) return dateCount ?? 0

  const [y, m, d] = dateStr.split('-').map(Number)
  const dow = jsDayToPgDow(new Date(y, m - 1, d).getDay())
  if (!dow) return 0

  const { count: monthCount, error: monthErr } = await supabase
    .from('coach_availability')
    .select('coach_id', { count: 'exact', head: true })
    .eq('year', y)
    .eq('month', m)
    .eq('day_of_week', dow)
    .eq('time_slot', slot)
    .eq('is_available', true)

  if (monthErr) return 0
  return monthCount ?? 0
}

export async function countEnrollments(
  supabase: ReturnType<typeof getServiceSupabase>,
  eventId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('class_session_enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('calendar_event_id', eventId)
    .eq('status', 'confirmed')

  if (error) return 0
  return count ?? 0
}

export function capacityFromCoaches(coachCount: number): number {
  if (coachCount <= 0) return 0
  return coachCount * SPOTS_PER_COACH
}

export type SessionAvailability = 'open' | 'almost_full' | 'full' | 'no_coaches'

export function availabilityStatus(spotsLeft: number, maxCapacity: number): SessionAvailability {
  if (maxCapacity <= 0) return 'no_coaches'
  if (spotsLeft <= 0) return 'full'
  if (spotsLeft <= 2 || spotsLeft / maxCapacity <= 0.25) return 'almost_full'
  return 'open'
}

export function resolveMaxCapacity(
  coachCount: number,
  override: number | null | undefined,
): number {
  if (override != null && override > 0) return override
  return capacityFromCoaches(coachCount)
}

export async function enrichSession(
  supabase: ReturnType<typeof getServiceSupabase>,
  row: BookableSessionRow,
) {
  const slot = row.time_slot
  const coachCount = slot ? await countCoachesForSlot(supabase, row.start_date, slot) : 0
  const enrolled = await countEnrollments(supabase, row.id)
  const maxCapacity = resolveMaxCapacity(coachCount, row.max_capacity_override)
  const spotsLeft = Math.max(0, maxCapacity - enrolled)
  const status = maxCapacity <= 0 ? 'no_coaches' : availabilityStatus(spotsLeft, maxCapacity)

  return {
    ...row,
    coachCount,
    enrolled,
    maxCapacity,
    spotsLeft,
    status,
  }
}

export async function getSessionUserId(event: H3Event): Promise<string | null> {
  const config = useRuntimeConfig()
  const supabaseUrl = config.public.supabaseUrl as string
  const supabaseAnon = config.public.supabaseKey as string
  const authHeader = getHeader(event, 'authorization') || ''
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!accessToken) return null

  const sessionClient = createClient(supabaseUrl, supabaseAnon)
  const { data } = await sessionClient.auth.getUser(accessToken)
  return data.user?.id ?? null
}
