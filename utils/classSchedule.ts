import { getDay } from 'date-fns'
import type { TimeSlot } from '~/types'

/** Official La Plancha days — JS getDay(): Mon=1, Tue=2, Thu=4, Sat=6 */
export const CLASS_WEEKDAY_NUMBERS = [1, 2, 4, 6] as const

export function isClassDay(date: Date): boolean {
  return (CLASS_WEEKDAY_NUMBERS as readonly number[]).includes(getDay(date))
}

export function jsDayToDayOfWeek(dayNum: number): string | null {
  const map: Record<number, string> = {
    1: 'monday',
    2: 'tuesday',
    4: 'thursday',
    6: 'saturday',
  }
  return map[dayNum] ?? null
}

/** Time slots offered on a given weekday. */
export function slotsForWeekday(dayNum: number): TimeSlot[] {
  if (dayNum === 1) return ['monday']
  if (dayNum === 6) return ['morning', 'early', 'late']
  if (dayNum === 2 || dayNum === 3 || dayNum === 4 || dayNum === 5) return ['early', 'late']
  return []
}

/** Slots valid for at least one of the given weekdays (recurring program picker). */
export function slotsForWeekdays(weekdays: number[]): TimeSlot[] {
  const set = new Set<TimeSlot>()
  for (const wd of weekdays) {
    for (const s of slotsForWeekday(wd)) set.add(s)
  }
  return [...set]
}

export function slotsForDate(date: Date): TimeSlot[] {
  return slotsForWeekday(getDay(date))
}

/** Practice events use evening group slots (not Monday afternoon). */
export const PRACTICE_TIME_SLOTS: TimeSlot[] = ['early', 'late']

export function slotsForDateStr(dateStr: string): TimeSlot[] {
  const [y, m, d] = dateStr.split('-').map(Number)
  return slotsForDate(new Date(y, m - 1, d))
}

export function daySlotsFullyUnavailable(
  overrides: Record<string, boolean> | undefined,
  slots: TimeSlot[],
): boolean {
  if (!slots.length) return true
  return slots.every(s => overrides?.[s] === false)
}

/** Official La Plancha practice days (JS getDay values). */
export const RECURRING_WEEKDAY_OPTIONS = [
  { v: 1, en: 'Mon', es: 'Lun' },
  { v: 2, en: 'Tue', es: 'Mar' },
  { v: 4, en: 'Thu', es: 'Jue' },
  { v: 6, en: 'Sat', es: 'Sáb' },
] as const

/** Summer course: Mon–Fri only (JS getDay values). */
export const SUMMER_COURSE_WEEKDAY_OPTIONS = [
  { v: 1, en: 'Mon', es: 'Lun' },
  { v: 2, en: 'Tue', es: 'Mar' },
  { v: 3, en: 'Wed', es: 'Mié' },
  { v: 4, en: 'Thu', es: 'Jue' },
  { v: 5, en: 'Fri', es: 'Vie' },
] as const

/** Default program days: Tuesday, Thursday, Saturday → 3 classes/week × 8 weeks = 24. */
export const DEFAULT_PROGRAM_WEEKDAYS = [2, 4, 6] as const
