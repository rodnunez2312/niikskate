import {
  mergedAudienceAgeRange,
  parseAudienceCategories,
  type AudienceCategory,
} from '~/types'

export type SessionAgeFields = {
  min_age?: number | null
  max_age?: number | null
  audience_category?: string | null
  audience_categories?: string[] | null
}

/** Age in full years from YYYY-MM-DD, or fallback when DOB is unknown. */
export function computeAgeFromDob(
  dateOfBirth: string | null | undefined,
  fallbackAge?: number | null,
): number | null {
  if (dateOfBirth) {
    const [y, m, d] = dateOfBirth.split('-').map(Number)
    if (!y || !m || !d) return fallbackAge ?? null
    const today = new Date()
    let age = today.getFullYear() - y
    const monthDiff = today.getMonth() + 1 - m
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < d)) age--
    return age >= 0 ? age : null
  }
  if (fallbackAge != null && Number.isFinite(fallbackAge) && fallbackAge >= 0) {
    return Math.round(fallbackAge)
  }
  return null
}

export function sessionAgeBounds(session: SessionAgeFields): {
  minAge: number | null
  maxAge: number | null
} {
  const categories = parseAudienceCategories(session) as AudienceCategory[]
  const merged = mergedAudienceAgeRange(categories)
  return {
    minAge: session.min_age ?? merged.minAge,
    maxAge: session.max_age ?? merged.maxAge,
  }
}

export function isAgeEligibleForSession(
  age: number | null | undefined,
  session: SessionAgeFields,
): boolean {
  if (age == null || !Number.isFinite(age)) return false
  const { minAge, maxAge } = sessionAgeBounds(session)
  if (minAge != null && age < minAge) return false
  if (maxAge != null && age > maxAge) return false
  return true
}

export function ineligibilityReason(
  age: number | null | undefined,
  session: SessionAgeFields,
  lang: 'en' | 'es' = 'es',
): string | null {
  if (age == null) {
    return lang === 'es'
      ? 'Agrega la fecha de nacimiento del patinador en tu crew.'
      : 'Add the skater’s date of birth in your crew.'
  }
  const { minAge, maxAge } = sessionAgeBounds(session)
  if (minAge != null && age < minAge) {
    return lang === 'es'
      ? `Edad mínima: ${minAge} años.`
      : `Minimum age: ${minAge}.`
  }
  if (maxAge != null && age > maxAge) {
    return lang === 'es'
      ? `Edad máxima: ${maxAge} años.`
      : `Maximum age: ${maxAge}.`
  }
  return null
}
