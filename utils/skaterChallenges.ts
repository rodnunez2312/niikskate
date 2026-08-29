/**
 * Desafíos: coach-set goals for one skater (table `skater_challenges`).
 *
 * Separate from the trick bag on purpose — a challenge is not a row in
 * skills_library and never counts toward student_progress.
 */

export type SkaterChallengeStatus = 'open' | 'completed'

export interface SkaterChallenge {
  id: string
  student_id: string
  title: string
  description: string | null
  status: SkaterChallengeStatus
  due_date: string | null
  created_by: string | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
}

export function challengeStatusLabel(status: SkaterChallengeStatus, es: boolean): string {
  if (status === 'completed') return es ? 'Completado' : 'Completed'
  return es ? 'En curso' : 'Open'
}

/** Open challenges first, then soonest due date, then newest. */
export function compareChallenges(a: SkaterChallenge, b: SkaterChallenge): number {
  if (a.status !== b.status) return a.status === 'open' ? -1 : 1
  const dueA = a.due_date || '9999-12-31'
  const dueB = b.due_date || '9999-12-31'
  if (dueA !== dueB) return dueA < dueB ? -1 : 1
  return (b.created_at || '').localeCompare(a.created_at || '')
}

/** Past due and still open — surfaced in red so it does not sit forgotten. */
export function isChallengeOverdue(challenge: SkaterChallenge, today = new Date()): boolean {
  if (challenge.status !== 'open' || !challenge.due_date) return false
  return challenge.due_date < today.toISOString().slice(0, 10)
}
