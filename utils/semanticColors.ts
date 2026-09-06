/**
 * Niik Skate semantic colors.
 *
 * These hues are reserved for meaning, never decoration:
 * green = beginner, blue = intermediate, purple = advanced,
 * orange = competition, pink = event, cyan = practice, yellow = holiday.
 */
export type SemanticSkillLevel = 'beginner' | 'intermediate' | 'advanced'
export type SemanticEventType = 'competition' | 'event' | 'practice' | 'holiday'

export const SKILL_LEVEL_COLORS = {
  beginner: {
    solid: '#22c55e',
    muted: 'rgba(34, 197, 94, 0.20)',
    dot: 'bg-green-500',
    badge: 'bg-green-500/20 text-green-300 border-green-500/30',
    selected: 'bg-green-500 text-white border-green-500',
  },
  intermediate: {
    solid: '#3b82f6',
    muted: 'rgba(59, 130, 246, 0.20)',
    dot: 'bg-blue-500',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    selected: 'bg-blue-500 text-white border-blue-500',
  },
  advanced: {
    solid: '#a855f7',
    muted: 'rgba(168, 85, 247, 0.20)',
    dot: 'bg-purple-500',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    selected: 'bg-purple-500 text-white border-purple-500',
  },
} as const

export const EVENT_TYPE_COLORS = {
  competition: {
    solid: '#f97316',
    dot: 'bg-orange-500',
    badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  },
  event: {
    solid: '#ec4899',
    dot: 'bg-pink-500',
    badge: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  },
  practice: {
    solid: '#06b6d4',
    dot: 'bg-cyan-500',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
  holiday: {
    solid: '#eab308',
    dot: 'bg-yellow-500',
    badge: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  },
} as const

export function skillColor(level: string | null | undefined) {
  if (level === 'intermediate') return SKILL_LEVEL_COLORS.intermediate
  if (level === 'advanced' || level === 'pro') return SKILL_LEVEL_COLORS.advanced
  return SKILL_LEVEL_COLORS.beginner
}

export function eventColor(type: string | null | undefined) {
  if (type === 'competition') return EVENT_TYPE_COLORS.competition
  if (type === 'practice') return EVENT_TYPE_COLORS.practice
  if (type === 'holiday') return EVENT_TYPE_COLORS.holiday
  return EVENT_TYPE_COLORS.event
}
