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

export function getProgramSeasonBySlug(slug: string): ProgramSeason | undefined {
  return PROGRAM_SEASONS.find(s => s.slug === slug)
}

/** Curso de verano — intensive Mon–Fri block (5 or 10 days), not the 24-class season program. */
export function isSummerCourseSeason(slug: string | null | undefined): boolean {
  return Boolean(slug?.startsWith('curso-verano'))
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
