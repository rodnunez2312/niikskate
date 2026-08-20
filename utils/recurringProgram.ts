import { addDays, format, getDay } from 'date-fns'
import type { TimeSlot } from '~/types'
import { slotsForWeekday } from '~/utils/classSchedule'
import { isMexicoNationalHoliday } from '~/utils/mexicoHolidays'

export function nextDateOnOrAfterWeekday(from: Date, weekday: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  let guard = 0
  while (getDay(d) !== weekday && guard < 8) {
    d.setDate(d.getDate() + 1)
    guard++
  }
  return d
}

export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Program start = next occurrence of the earliest selected weekday
 * (e.g. Tue+Thu → nearest Tuesday on/after `from`).
 */
export function nearestProgramStartDate(from: Date, weekdays: number[]): string {
  if (!weekdays.length) return format(from, 'yyyy-MM-dd')
  const primary = Math.min(...weekdays)
  return format(nextDateOnOrAfterWeekday(from, primary), 'yyyy-MM-dd')
}

/** Inclusive YYYY-MM-DD clamp (used so programs cannot leave a temporada). */
export function clampYmd(value: string, min?: string | null, max?: string | null): string {
  let v = value
  if (min && v < min) v = min
  if (max && v > max) v = max
  return v
}

export function generateProgramOccurrences(opts: {
  startDate: string
  endDate?: string | null
  weekdays: number[]
  slots: TimeSlot[]
  maxClasses: number
  /** Skip these YYYY-MM-DD dates (e.g. national holidays). */
  skipDates?: Set<string> | string[]
  /** Use the chosen slots on every selected weekday (summer 9–1, etc.). */
  allowListedSlots?: boolean
}): Array<{ date: string; slot: TimeSlot }> {
  const out: Array<{ date: string; slot: TimeSlot }> = []
  const [sy, sm, sd] = opts.startDate.split('-').map(Number)
  let current = new Date(sy, sm - 1, sd)

  let endLimit: Date
  if (opts.endDate?.trim()) {
    const [ey, em, ed] = opts.endDate.split('-').map(Number)
    endLimit = new Date(ey, em - 1, ed)
  } else {
    endLimit = addDays(current, 180)
  }

  const weekdays = new Set(opts.weekdays)
  const slots = opts.slots
  const skip = opts.skipDates
    ? opts.skipDates instanceof Set
      ? opts.skipDates
      : new Set(opts.skipDates)
    : null

  while (out.length < opts.maxClasses && current <= endLimit) {
    const dateStr = format(current, 'yyyy-MM-dd')
    const dow = getDay(current)
    const holiday =
      (skip?.has(dateStr) ?? false) || isMexicoNationalHoliday(dateStr)

    if (weekdays.has(dow) && !holiday) {
      const allowed = slotsForWeekday(dow)
      for (const slot of slots) {
        const listedOk = opts.allowListedSlots
        const summerOk = slot === 'summer' && dow >= 1 && dow <= 5
        if (!listedOk && !allowed.includes(slot) && !summerOk) continue
        out.push({ date: dateStr, slot })
        if (out.length >= opts.maxClasses) break
      }
    }
    current = addDays(current, 1)
  }

  return out
}

/** Last of N class days (Mon–Fri for summer), not start + N calendar days. */
export function computeSummerCourseEndDate(
  startDate: string,
  classDays: number,
  endCap?: string | null,
): string {
  const occ = generateProgramOccurrences({
    startDate,
    endDate: endCap || null,
    weekdays: [1, 2, 3, 4, 5],
    slots: ['summer'],
    maxClasses: Math.max(1, classDays),
    allowListedSlots: true,
  })
  return occ.length ? occ[occ.length - 1].date : startDate
}

/** Last class date for a program of `maxClasses` sessions on selected weekdays. */
export function computeProgramEndDate(opts: {
  startDate: string
  weekdays: number[]
  slots: TimeSlot[]
  maxClasses: number
  endCap?: string | null
  allowListedSlots?: boolean
}): string {
  const occ = generateProgramOccurrences({
    startDate: opts.startDate,
    endDate: opts.endCap || null,
    weekdays: opts.weekdays,
    slots: opts.slots,
    maxClasses: Math.max(1, opts.maxClasses),
    allowListedSlots: opts.allowListedSlots,
  })
  return occ.length ? occ[occ.length - 1].date : opts.startDate
}

/** Sync start (nearest primary weekday) + end (Nth class day), optionally capped. */
export function syncProgramDateRange(opts: {
  from?: Date
  weekdays: number[]
  slots: TimeSlot[]
  maxClasses: number
  endCap?: string | null
  allowListedSlots?: boolean
}): { startDate: string; endDate: string } {
  const from = opts.from ?? new Date()
  let startDate = nearestProgramStartDate(from, opts.weekdays)
  if (opts.endCap && startDate > opts.endCap) startDate = opts.endCap
  const endDate = computeProgramEndDate({
    startDate,
    weekdays: opts.weekdays,
    slots: opts.slots.length ? opts.slots : ['early'],
    maxClasses: opts.maxClasses,
    endCap: opts.endCap,
    allowListedSlots: opts.allowListedSlots,
  })
  return { startDate, endDate }
}
