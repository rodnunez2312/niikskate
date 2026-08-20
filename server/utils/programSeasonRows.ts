import type { ProgramSeason, ProgramSeasonStatus } from '~/utils/programSeasons'
import { mergeProgramSeasons, seasonFromDates } from '~/utils/programSeasons'

export type ProgramSeasonRow = {
  slug: string
  name_es: string
  name_en: string
  start_date: string
  end_date: string
  status: ProgramSeasonStatus
  icon: string
}

export function rowToProgramSeason(row: ProgramSeasonRow): ProgramSeason {
  return seasonFromDates({
    slug: row.slug,
    nameEs: row.name_es,
    nameEn: row.name_en,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    icon: row.icon,
  })
}

type SeasonQueryClient = {
  from: (table: string) => any
}

export async function loadHiddenSeasonSlugs(client: SeasonQueryClient): Promise<string[]> {
  try {
    const { data, error } = await client.from('program_season_hidden').select('slug')
    if (error) return []
    return ((data || []) as { slug: string }[]).map(r => r.slug).filter(Boolean)
  } catch {
    return []
  }
}

export async function loadVisibleProgramSeasons(client: SeasonQueryClient): Promise<ProgramSeason[]> {
  let extra: ProgramSeason[] = []
  try {
    const { data, error } = await client
      .from('program_seasons')
      .select('slug, name_es, name_en, start_date, end_date, status, icon')
      .order('start_date', { ascending: true })
    if (!error) extra = ((data || []) as ProgramSeasonRow[]).map(rowToProgramSeason)
  } catch {
    extra = []
  }
  const hidden = await loadHiddenSeasonSlugs(client)
  return mergeProgramSeasons(extra, hidden)
}
