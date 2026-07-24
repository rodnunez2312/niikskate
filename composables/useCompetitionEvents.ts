import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export type CompetitionEvent = {
  id: string
  title: string
  event_type: string
  start_date: string
  end_date: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  location: string | null
  description: string | null
  visible_to_parents: boolean
}

function eventEndYmd(row: CompetitionEvent) {
  const raw = row.end_date || row.start_date
  return raw.slice(0, 10)
}

function todayYmd() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function useCompetitionEvents() {
  const client = useSupabaseClient()
  const { language } = useI18n()

  async function fetchCompetitions(options?: { includePast?: boolean }) {
    const { data, error } = await client
      .from('school_calendar_events')
      .select('*')
      .eq('event_type', 'competition')
      .order('start_date', { ascending: true })

    let events = (data || []) as CompetitionEvent[]

    if (!options?.includePast) {
      const today = todayYmd()
      events = events.filter(e => eventEndYmd(e) >= today)
    }

    return { events, error }
  }

  function splitUpcomingPast(events: CompetitionEvent[]) {
    const today = todayYmd()
    const upcoming = events.filter(e => eventEndYmd(e) >= today)
    const past = events.filter(e => eventEndYmd(e) < today).reverse()
    return { upcoming, past }
  }

  function formatEventDate(row: CompetitionEvent) {
    const locale = language.value === 'es' ? es : undefined
    const start = parseISO(row.start_date)
    if (row.end_date && row.end_date !== row.start_date) {
      return `${format(start, 'd MMM', { locale })} – ${format(parseISO(row.end_date), 'd MMM yyyy', { locale })}`
    }
    return format(start, language.value === 'es' ? "d 'de' MMMM yyyy" : 'MMMM d, yyyy', { locale })
  }

  function formatEventTime(row: CompetitionEvent) {
    if (row.all_day || !row.start_time) return null
    const start = row.start_time.slice(0, 5)
    const end = row.end_time?.slice(0, 5)
    return end ? `${start} – ${end}` : start
  }

  function isUpcoming(row: CompetitionEvent) {
    return eventEndYmd(row) >= todayYmd()
  }

  return {
    fetchCompetitions,
    splitUpcomingPast,
    formatEventDate,
    formatEventTime,
    isUpcoming,
  }
}
