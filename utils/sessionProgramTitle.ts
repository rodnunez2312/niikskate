/** Drop a leading "Temporada …:" so the card title is the class itself. */
export function sessionProgramTitle(title: string | null | undefined) {
  const text = (title || '').trim()
  const stripped = text
    .replace(/^Temporada\s+[^:]+:\s*/i, '')
    .replace(/\s+[·•]\s+Grupo de edad:\s*/i, ' para ')
    .replace(/\s+[·•]\s+Age group:\s*/i, ' for ')
    .trim()
  return stripped || text
}
