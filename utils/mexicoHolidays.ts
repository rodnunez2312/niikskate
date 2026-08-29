/** Official Mexican federal rest days (LFT Art. 74) — observed dates. */
export type MexicoHoliday = {
  date: string
  title: { en: string; es: string }
}

/**
 * National mandatory rest days 2026–2027.
 * Constitution / Juárez / Revolution use Monday observance when applicable.
 */
export const MEXICO_NATIONAL_HOLIDAYS_2026_2027: MexicoHoliday[] = [
  // 2026
  { date: '2026-01-01', title: { en: "New Year's Day", es: 'Año Nuevo' } },
  { date: '2026-02-02', title: { en: 'Constitution Day', es: 'Día de la Constitución' } },
  { date: '2026-03-16', title: { en: "Benito Juárez's Birthday", es: 'Natalicio de Benito Juárez' } },
  { date: '2026-05-01', title: { en: 'Labor Day', es: 'Día del Trabajo' } },
  { date: '2026-09-16', title: { en: 'Independence Day', es: 'Día de la Independencia' } },
  { date: '2026-11-16', title: { en: 'Revolution Day', es: 'Día de la Revolución' } },
  { date: '2026-12-25', title: { en: 'Christmas Day', es: 'Navidad' } },
  // 2027
  { date: '2027-01-01', title: { en: "New Year's Day", es: 'Año Nuevo' } },
  { date: '2027-02-01', title: { en: 'Constitution Day', es: 'Día de la Constitución' } },
  { date: '2027-03-15', title: { en: "Benito Juárez's Birthday", es: 'Natalicio de Benito Juárez' } },
  { date: '2027-05-01', title: { en: 'Labor Day', es: 'Día del Trabajo' } },
  { date: '2027-09-16', title: { en: 'Independence Day', es: 'Día de la Independencia' } },
  { date: '2027-11-15', title: { en: 'Revolution Day', es: 'Día de la Revolución' } },
  { date: '2027-12-25', title: { en: 'Christmas Day', es: 'Navidad' } },
]

export const mexicoHolidayDateSet = new Set(
  MEXICO_NATIONAL_HOLIDAYS_2026_2027.map(h => h.date),
)

export function isMexicoNationalHoliday(dateStr: string): boolean {
  return mexicoHolidayDateSet.has(dateStr)
}

export function mexicoHolidayName(dateStr: string, spanish = true): string {
  const holiday = MEXICO_NATIONAL_HOLIDAYS_2026_2027.find(h => h.date === dateStr)
  if (!holiday) return ''
  return spanish ? holiday.title.es : holiday.title.en
}
