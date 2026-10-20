import { TIME_SLOT_LABELS, type TimeSlot } from '~/types'

/**
 * A class time an admin can pick for a recurring program. Built-ins reuse the
 * TimeSlot keys; custom ones encode their times in the id (`custom-1600-1730`).
 */
export type ProgramHorario = {
  id: string
  start: string
  end: string
  display: string
  builtIn: boolean
}

export const BUILT_IN_HORARIO_SLOTS: TimeSlot[] = ['morning', 'monday', 'early', 'late']

const CUSTOM_ID = /^custom-(\d{2})(\d{2})-(\d{2})(\d{2})$/

export function formatClock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

export const horarioDisplay = (start: string, end: string) =>
  `${formatClock12(start)} - ${formatClock12(end)}`

export const customHorarioId = (start: string, end: string) =>
  `custom-${start.replace(':', '')}-${end.replace(':', '')}`

export const isTimeSlot = (id: string): id is TimeSlot => id in TIME_SLOT_LABELS

/**
 * `school_calendar_events.time_slot` only accepts the built-in enum, so a custom
 * horario is stored under the closest one; its real times go in start_time/end_time.
 */
export function timeSlotForTimes(start: string, end: string): TimeSlot {
  const exact = BUILT_IN_HORARIO_SLOTS.find(
    s => TIME_SLOT_LABELS[s].start === start && TIME_SLOT_LABELS[s].end === end,
  )
  if (exact) return exact
  if (start < '12:00') return 'morning'
  if (start >= '19:00') return 'late'
  return 'early'
}

export function resolveHorario(id: string): { start: string; end: string; timeSlot: TimeSlot } | null {
  if (isTimeSlot(id)) {
    const t = TIME_SLOT_LABELS[id]
    return { start: t.start, end: t.end, timeSlot: id }
  }
  const m = CUSTOM_ID.exec(id)
  if (!m) return null
  const start = `${m[1]}:${m[2]}`
  const end = `${m[3]}:${m[4]}`
  return { start, end, timeSlot: timeSlotForTimes(start, end) }
}

/** What parents see for a class: its saved times first, the slot's defaults as a fallback. */
export function classTimeDisplay(s: {
  time_slot?: string | null
  start_time?: string | null
  end_time?: string | null
}): string | null {
  if (s.start_time && s.end_time) return horarioDisplay(s.start_time.slice(0, 5), s.end_time.slice(0, 5))
  if (s.time_slot && isTimeSlot(s.time_slot)) return TIME_SLOT_LABELS[s.time_slot].display
  return null
}

export function horarioFromId(id: string): ProgramHorario | null {
  const r = resolveHorario(id)
  if (!r) return null
  return {
    id,
    start: r.start,
    end: r.end,
    display: isTimeSlot(id) ? TIME_SLOT_LABELS[id].display : horarioDisplay(r.start, r.end),
    builtIn: isTimeSlot(id),
  }
}
