export const TOKEN_KINDS = ['group', 'individual', 'pro', 'free'] as const
export type TokenKind = (typeof TOKEN_KINDS)[number]

export const CLASS_TOKENS = [
  { id: 'group', es: 'Grupal', en: 'Group', color: '#22D3EE' },
  { id: 'individual', es: 'Individual', en: 'Individual', color: '#A855F7' },
  { id: 'pro', es: 'Pro', en: 'Pro', color: '#F59E0B' },
  { id: 'free', es: 'Libre', en: 'Free', color: '#F6C453' },
] as const satisfies ReadonlyArray<{ id: TokenKind; es: string; en: string; color: string }>

export type TokenCounts = Record<TokenKind, { available: number; owed: number }>

export function emptyTokenCounts(): TokenCounts {
  return {
    group: { available: 0, owed: 0 },
    individual: { available: 0, owed: 0 },
    pro: { available: 0, owed: 0 },
    free: { available: 0, owed: 0 },
  }
}

export function tokenLabel(kind: TokenKind, es: boolean): string {
  const row = CLASS_TOKENS.find(token => token.id === kind)
  return es ? row?.es || kind : row?.en || kind
}

export function tokenColor(kind: TokenKind): string {
  return CLASS_TOKENS.find(token => token.id === kind)?.color || '#C9EF42'
}

/** Paid package → the token color that package mints. Pro coach tiers share one token. */
export function tokenKindForPackage(coachTier: string | null | undefined, classKind: string | null | undefined): TokenKind {
  if (coachTier === 'pro_street' || coachTier === 'pro_bowl') return 'pro'
  if ((classKind || '').startsWith('individual')) return 'individual'
  return 'group'
}

/** Calendar class → the token color that class spends. A free token can still pay for it. */
export function tokenKindForEvent(eventType: string | null | undefined, coachTier: string | null | undefined): TokenKind {
  if (coachTier === 'pro_street' || coachTier === 'pro_bowl') return 'pro'
  if (eventType === 'class_individual' || eventType === 'individual') return 'individual'
  return 'group'
}

/** 1–2 tokens is low. Zero is empty, not an overdue payment. */
export const LOW_TOKEN_MAX = 2

export type TokenBalanceStatus = 'healthy' | 'low' | 'zero' | 'inactive'

export function tokenBalanceStatus(available: number, active: boolean): TokenBalanceStatus {
  if (!active) return 'inactive'
  if (available <= 0) return 'zero'
  if (available <= LOW_TOKEN_MAX) return 'low'
  return 'healthy'
}

export type AttendanceMark = 'present' | 'absent' | 'excused' | 'cancelled'

/** Present and absent spend one token. Excused and cancelled do not. */
export function attendanceConsumesToken(status: AttendanceMark): boolean {
  return status === 'present' || status === 'absent'
}

export function assertIdempotencyKey(key: string): string {
  const trimmed = key.trim()
  if (!trimmed) throw new Error('idempotency key is required')
  return trimmed
}
