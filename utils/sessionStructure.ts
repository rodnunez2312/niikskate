export type SessionBlockId = 'warmup' | 'drills' | 'focus' | 'free' | 'stretch'

export type SessionBlock = { id: SessionBlockId; minutes: number }

export type SessionLength = 60 | 90 | 120

export const SESSION_BLOCK_LABELS: Record<SessionBlockId, { es: string; en: string }> = {
  warmup: { es: 'Calentamiento', en: 'Warm-up' },
  drills: { es: 'Drills', en: 'Drills' },
  focus: { es: 'Enfoque técnico', en: 'Technical focus' },
  free: { es: 'Free skate', en: 'Free skate' },
  stretch: { es: 'Estiramiento', en: 'Stretch' },
}

/** Every class opens with a 15 min warm-up and closes with a 10 min stretch. */
export const FIXED_SESSION_BLOCKS: Partial<Record<SessionBlockId, number>> = {
  warmup: 15,
  stretch: 10,
}

export const SESSION_PRESETS: Record<SessionLength, SessionBlock[]> = {
  60: [
    { id: 'warmup', minutes: 15 },
    { id: 'drills', minutes: 10 },
    { id: 'focus', minutes: 15 },
    { id: 'free', minutes: 10 },
    { id: 'stretch', minutes: 10 },
  ],
  90: [
    { id: 'warmup', minutes: 15 },
    { id: 'drills', minutes: 20 },
    { id: 'focus', minutes: 25 },
    { id: 'free', minutes: 20 },
    { id: 'stretch', minutes: 10 },
  ],
  120: [
    { id: 'warmup', minutes: 15 },
    { id: 'drills', minutes: 30 },
    { id: 'focus', minutes: 30 },
    { id: 'free', minutes: 35 },
    { id: 'stretch', minutes: 10 },
  ],
}

export const DEFAULT_SESSION_LENGTH: SessionLength = 90

export function sessionPreset(length: SessionLength): SessionBlock[] {
  return SESSION_PRESETS[length].map(block => ({ ...block }))
}

export function sessionBlockLabel(id: SessionBlockId, es: boolean) {
  return es ? SESSION_BLOCK_LABELS[id].es : SESSION_BLOCK_LABELS[id].en
}
