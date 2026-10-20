/** Default covers until profiles.backup_coach_id is set. */
const DEFAULT_BACKUP_FIRST_NAME: Record<string, string> = {
  rodrigo: 'marco',
  marco: 'rodrigo',
  itza: 'marco',
}

export function defaultBackupFirstName(fullName: string | null | undefined): string | null {
  const first = (fullName || '').trim().split(/\s+/)[0]?.toLowerCase()
  if (!first) return null
  return DEFAULT_BACKUP_FIRST_NAME[first] ?? null
}

export function coachMatchesFirstName(fullName: string | null | undefined, first: string) {
  return (fullName || '').trim().split(/\s+/)[0]?.toLowerCase() === first
}
