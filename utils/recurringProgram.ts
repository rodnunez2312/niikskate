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

/**
 * Program start = next occurrence of the earliest selected weekday
 * (e.g. Tue+Thu → nearest Tuesday on/after `from`).
 */
export function nearestProgramStartDate(from: Date, weekdays: number[]): string {
  if (!weekdays.length) return format(from, 'yyyy-MM-dd')
  const primary = Math.min(...weekdays)
  return format(nextDateOnOrAfterWeekday(from, primary), 'yyyy-MM-dd')
}

export function generateProgramOccurrences(opts: {
  startDate: string
  endDate?: string | null
  weekdays: number[]
  slots: TimeSlot[]
  maxClasses: number
  /** Skip these YYYY-MM-DD dates (e.g. national holidays). */
  skipDates?: Set<string> | string[]
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
        if (!allowed.includes(slot)) continue
        out.push({ date: dateStr, slot })
        if (out.length >= opts.maxClasses) break
      }
    }
    current = addDays(current, 1)
  }

  return out
}

/** Last class date for a program of `maxClasses` sessions on selected weekdays. */
export function computeProgramEndDate(opts: {
  startDate: string
  weekdays: number[]
  slots: TimeSlot[]
  maxClasses: number
}): string {
  const occ = generateProgramOccurrences({
    ...opts,
    endDate: null,
    maxClasses: Math.max(1, opts.maxClasses),
  })
  return occ.length ? occ[occ.length - 1].date : opts.startDate
}

/** Sync start (nearest primary weekday) + end (Nth class day). */
export function syncProgramDateRange(opts: {
  from?: Date
  weekdays: number[]
  slots: TimeSlot[]
  maxClasses: number
}): { startDate: string; endDate: string } {
  const from = opts.from ?? new Date()
  const startDate = nearestProgramStartDate(from, opts.weekdays)
  const endDate = computeProgramEndDate({
    startDate,
    weekdays: opts.weekdays,
    slots: opts.slots.length ? opts.slots : ['early'],
    maxClasses: opts.maxClasses,
  })
  return { startDate, endDate }
}
