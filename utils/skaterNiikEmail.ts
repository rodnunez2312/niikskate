export const NIIK_SKATE_EMAIL_DOMAIN = '@niikskate.com'

/** Default initial password for new @niikskate.com skater accounts. */
export const DEFAULT_SKATER_PASSWORD = 'Niikskate2026'

/** ASCII slug for email local part (accents stripped, no spaces). */
export function slugForNiikEmailPart(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/** first.lastname from name parts; falls back to first or last only. */
export function niikEmailLocalFromNames(firstName: string, lastName?: string | null): string {
  const first = slugForNiikEmailPart(firstName)
  const last = slugForNiikEmailPart(lastName || '')
  if (first && last) return `${first}.${last}`
  return first || last
}

export function normalizeNiikEmailLocal(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/@niikskate\.com$/i, '')
    .replace(/@.*/, '')
    .replace(/[^a-z0-9._-]/g, '')
}

export function buildNiikSkaterEmail(localPart: string): string {
  const local = normalizeNiikEmailLocal(localPart)
  return local ? `${local}${NIIK_SKATE_EMAIL_DOMAIN}` : ''
}
