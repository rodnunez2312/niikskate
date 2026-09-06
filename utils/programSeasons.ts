export type ProgramSeasonStatus = 'enrolling' | 'soon' | 'closed'

export type ProgramSeason = {
  slug: string
  name: { es: string; en: string }
  dates: { es: string; en: string }
  /** Inclusive season window (for admin date hints). */
  startDate: string
  endDate: string
  status: ProgramSeasonStatus
  icon: string
}

export const PROGRAM_SEASONS: ProgramSeason[] = [
  {
    slug: 'transicion-i-26',
    name: { es: 'Transición I 26', en: 'Transition I 26' },
    dates: { es: 'Jul 1 – Ago 31, 2026', en: 'Jul 1 – Aug 31, 2026' },
    startDate: '2026-07-01',
    endDate: '2026-08-31',
    status: 'enrolling',
    icon: '⛅',
  },
  {
    slug: 'curso-verano-26',
    name: { es: 'Curso de Verano 26', en: 'Summer Course 26' },
    dates: { es: 'Ago 10 – Ago 21, 2026', en: 'Aug 10 – Aug 21, 2026' },
    startDate: '2026-08-10',
    endDate: '2026-08-21',
    status: 'enrolling',
    icon: '⛅',
  },
  {
    slug: 'transicion-ii-26',
    name: { es: 'Transición II 26', en: 'Transition II 26' },
    dates: { es: 'Sep 1 – Oct 31, 2026', en: 'Sep 1 – Oct 31, 2026' },
    startDate: '2026-09-01',
    endDate: '2026-10-31',
    status: 'soon',
    icon: '⛅',
  },
  {
    slug: 'fresco-i-26',
    name: { es: 'Fresco I 26', en: 'Cool I 26' },
    dates: { es: 'Nov 1 – Dic 31, 2026', en: 'Nov 1 – Dec 31, 2026' },
    startDate: '2026-11-01',
    endDate: '2026-12-31',
    status: 'soon',
    icon: '❄️',
  },
  {
    slug: 'fresco-ii-27',
    name: { es: 'Fresco II 27', en: 'Cool II 27' },
    dates: { es: 'Ene 1 – Feb 28, 2027', en: 'Jan 1 – Feb 28, 2027' },
    startDate: '2027-01-01',
    endDate: '2027-02-28',
    status: 'soon',
    icon: '❄️',
  },
  {
    slug: 'verano-i-27',
    name: { es: 'Verano I 27', en: 'Summer I 27' },
    dates: { es: 'Mar 1 – Abr 30, 2027', en: 'Mar 1 – Apr 30, 2027' },
    startDate: '2027-03-01',
    endDate: '2027-04-30',
    status: 'soon',
    icon: '☀️',
  },
  {
    slug: 'verano-ii-27',
    name: { es: 'Verano II 27', en: 'Summer II 27' },
    dates: { es: 'May 1 – Jun 30, 2027', en: 'May 1 – Jun 30, 2027' },
    startDate: '2027-05-01',
    endDate: '2027-06-30',
    status: 'soon',
    icon: '☀️',
  },
]

export const DEFAULT_PROGRAM_LOCATION = 'Skatepark La Plancha'

export function slugifySeasonName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function formatSeasonDateRange(startDate: string, endDate: string, es: boolean): string {
  const start = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  const loc = es ? 'es-MX' : 'en-US'
  const fmt = (d: Date) =>
    d.toLocaleDateString(loc, { month: 'short', day: 'numeric' }).replace('.', '')
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`
}

export function seasonFromDates(
  input: {
    slug: string
    nameEs: string
    nameEn?: string
    startDate: string
    endDate: string
    status?: ProgramSeasonStatus
    icon?: string
  },
): ProgramSeason {
  const nameEs = input.nameEs.trim()
  const nameEn = (input.nameEn || nameEs).trim()
  return {
    slug: input.slug,
    name: { es: nameEs, en: nameEn },
    dates: {
      es: formatSeasonDateRange(input.startDate, input.endDate, true),
      en: formatSeasonDateRange(input.startDate, input.endDate, false),
    },
    startDate: input.startDate,
    endDate: input.endDate,
    status: input.status || 'enrolling',
    icon: input.icon || '📅',
  }
}

export function mergeProgramSeasons(extra: ProgramSeason[] = [], hiddenSlugs: string[] = []): ProgramSeason[] {
  const hidden = new Set(hiddenSlugs.filter(Boolean))
  const bySlug = new Map<string, ProgramSeason>()
  for (const s of PROGRAM_SEASONS) {
    if (!hidden.has(s.slug)) bySlug.set(s.slug, s)
  }
  for (const s of extra) {
    if (!hidden.has(s.slug)) bySlug.set(s.slug, s)
  }
  return [...bySlug.values()].sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export function getProgramSeasonBySlug(
  slug: string,
  catalog: ProgramSeason[] = PROGRAM_SEASONS,
): ProgramSeason | undefined {
  return catalog.find(s => s.slug === slug)
}

/** Curso de verano — intensive Mon–Fri block (5 or 10 days), not the 24-class season program. */
export function isSummerCourseSeason(slug: string | null | undefined): boolean {
  return Boolean(slug?.startsWith('curso-verano'))
}

export function isOpenProgramSeason(
  season: ProgramSeason,
  today = new Date().toISOString().slice(0, 10),
): boolean {
  if (season.status === 'closed') return false
  if (season.endDate < today) return false
  return season.status === 'enrolling'
}

export function pickDefaultProgramSeason(
  seasons: ProgramSeason[],
  today = new Date().toISOString().slice(0, 10),
): ProgramSeason | undefined {
  const open = seasons.filter(s => isOpenProgramSeason(s, today))
  const pool = open.length ? open : seasons.filter(s => s.endDate >= today && s.status !== 'closed')
  if (!pool.length) return undefined
  const happening = pool.filter(s => today >= s.startDate && today <= s.endDate)
  const regular = happening.find(s => !isSummerCourseSeason(s.slug))
  if (regular) return regular
  if (happening[0]) return happening[0]
  return pool.find(s => s.startDate >= today) || pool[0]
}

export function isSummerCampSeason(season: {
  slug?: string | null
  name?: { es?: string; en?: string }
}): boolean {
  if (isSummerCourseSeason(season.slug)) return true
  const text = `${season.name?.es || ''} ${season.name?.en || ''}`.toLowerCase()
  return /curso de verano|summer course|summer camp/.test(text)
}

export function dateRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

export function findOverlappingRegularSeason(
  candidate: {
    startDate: string
    endDate: string
    slug?: string
    name?: { es?: string; en?: string }
  },
  catalog: ProgramSeason[],
): ProgramSeason | undefined {
  const candidateIsCamp = isSummerCampSeason(candidate)
  return catalog.find((other) => {
    if (candidate.slug && other.slug === candidate.slug) return false
    if (!dateRangesOverlap(candidate.startDate, candidate.endDate, other.startDate, other.endDate)) return false
    if (candidateIsCamp || isSummerCampSeason(other)) return false
    return true
  })
}

export type SeasonHighlightColor = {
  fill: string
  fillMuted: string
  solid: string
}

export const SEASON_HIGHLIGHT_PALETTE: SeasonHighlightColor[] = [
  // Seasons are structural filters, not semantic categories. Keep them neutral.
  { fill: 'rgba(100, 116, 139, 0.30)', fillMuted: 'rgba(100, 116, 139, 0.14)', solid: '#64748b' },
  { fill: 'rgba(107, 114, 128, 0.30)', fillMuted: 'rgba(107, 114, 128, 0.14)', solid: '#6b7280' },
  { fill: 'rgba(113, 113, 122, 0.30)', fillMuted: 'rgba(113, 113, 122, 0.14)', solid: '#71717a' },
]

export function seasonHighlightColor(index: number): SeasonHighlightColor {
  return SEASON_HIGHLIGHT_PALETTE[index % SEASON_HIGHLIGHT_PALETTE.length]
}

export function stripedSeasonFill(colors: string[]): string {
  if (!colors.length) return ''
  if (colors.length === 1) return colors[0]
  const band = 8
  const parts = colors.map((color, i) => `${color} ${i * band}px ${(i + 1) * band}px`)
  return `repeating-linear-gradient(135deg, ${parts.join(', ')})`
}

export function seasonStatusLabel(status: ProgramSeasonStatus, es: boolean): string {
  if (status === 'enrolling') return es ? 'Inscripciones' : 'Enrolling'
  if (status === 'closed') return es ? 'Cerrado' : 'Closed'
  return es ? 'Pronto' : 'Soon'
}

/** Discount when enrolling multiple crew members in one checkout (siblings / multi-student). */
export function multiStudentDiscountRate(studentCount: number): number {
  if (studentCount >= 3) return 0.15
  if (studentCount >= 2) return 0.1
  return 0
}

export function applyMultiStudentDiscount(baseMxn: number, studentCount: number): number {
  const rate = multiStudentDiscountRate(studentCount)
  return Math.round(baseMxn * (1 - rate))
}
