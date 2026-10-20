const PILL_COLORS = ['bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-orange-500']

export function coachInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('')
}

export function coachPillClass(id: string): string {
  let slot = 0
  for (const char of id) slot = (slot + char.charCodeAt(0)) % PILL_COLORS.length
  return PILL_COLORS[slot]
}

type NamedRow = { owner_id?: string | null }

export async function withCoachLabels<T extends NamedRow>(
  client: { from: (table: string) => { select: (columns: string) => { in: (column: string, values: string[]) => Promise<{ data: Array<{ id: string; full_name: string | null }> | null }> } } },
  rows: T[],
): Promise<Array<T & { owner_name: string; owner_initials: string }>> {
  const ids = [...new Set(rows.map(row => row.owner_id).filter((id): id is string => Boolean(id)))]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data } = await client.from('profiles').select('id, full_name').in('id', ids)
    for (const row of data || []) names.set(row.id, row.full_name || '')
  }
  return rows.map((row) => {
    const name = row.owner_id ? names.get(row.owner_id) || '' : ''
    return { ...row, owner_name: name, owner_initials: coachInitials(name) }
  })
}
