import {
  enrichSession,
  getServiceSupabase,
  type BookableSessionRow,
} from '~/server/utils/bookableSessions'
import {
  audienceCategoryLabel,
  parseAudienceCategories,
  type SkateProgramCard,
  type TimeSlot,
} from '~/types'

export default defineEventHandler(async () => {
  const today = new Date().toISOString().slice(0, 10)
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('school_calendar_events')
    .select(
      'id, title, event_type, start_date, is_bookable, time_slot, audience_category, audience_categories, skill_level, min_age, max_age, skatepark, price_mxn, location, program_series_id, max_capacity_override',
    )
    .eq('is_bookable', true)
    .eq('visible_to_parents', true)
    .eq('event_type', 'class_session')
    .gte('start_date', today)
    .order('start_date', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, message: error.message })
  }

  const rows = (data || []) as BookableSessionRow[]
  const enriched = await Promise.all(rows.map(row => enrichSession(supabase, row)))

  type Group = {
    key: string
    programSeriesId: string | null
    title: string
    rows: typeof enriched
  }

  const groups = new Map<string, Group>()
  for (const row of enriched) {
    const key = row.program_series_id || `single-${row.id}`
    const existing = groups.get(key)
    if (existing) {
      existing.rows.push(row)
    } else {
      groups.set(key, {
        key,
        programSeriesId: row.program_series_id ?? null,
        title: row.title,
        rows: [row],
      })
    }
  }

  const programs: SkateProgramCard[] = []

  for (const group of groups.values()) {
    const sorted = [...group.rows].sort((a, b) => a.start_date.localeCompare(b.start_date))
    const next = sorted[0]
    if (!next) continue

    const cats = parseAudienceCategories(next)
    const audienceLabel = cats.length
      ? cats.map(id => audienceCategoryLabel(id, 'en')).join(' · ')
      : next.title

    programs.push({
      id: group.key,
      programSeriesId: group.programSeriesId,
      title: group.title,
      audienceLabel,
      minAge: next.min_age,
      maxAge: next.max_age,
      skatepark: next.skatepark || next.location || 'Skatepark La Plancha',
      priceMxn: next.price_mxn != null ? Number(next.price_mxn) : null,
      sessionCount: sorted.length,
      nextSessionDate: next.start_date,
      nextSessionId: next.id,
      timeSlot: (next.time_slot as TimeSlot) || null,
      enrolled: next.enrolled,
      maxCapacity: next.maxCapacity,
      spotsLeft: next.spotsLeft,
      status: next.status,
    })
  }

  programs.sort((a, b) => (a.nextSessionDate || '').localeCompare(b.nextSessionDate || ''))

  return { programs }
})
