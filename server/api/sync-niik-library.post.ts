import { readFileSync } from 'fs'
import { join } from 'path'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const user = await serverSupabaseUser(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin' && profile?.role !== 'coach') {
    throw createError({ statusCode: 403, message: 'Only admin or coach can sync Niik Library' })
  }

  let niikLibrary: { tricks: Array<{ name: string; name_es?: string; description: string; description_es?: string; difficulty: string; category: string; sort_order: number }> }
  try {
    const path = join(process.cwd(), 'data', 'niik-trick-library.json')
    const raw = readFileSync(path, 'utf-8')
    niikLibrary = JSON.parse(raw)
  } catch (e) {
    throw createError({ statusCode: 500, message: 'Could not read Niik Library. Run: node scripts/parse-niik-library.mjs' })
  }

  const tricks = niikLibrary.tricks || []
  if (tricks.length === 0) {
    return { ok: true, inserted: 0, updated: 0, message: 'No tricks in library' }
  }

  const { data: existing } = await supabase.from('skills_library').select('id, name, name_es')
  const byName = new Map<string | null, string>()
  for (const s of existing || []) {
    if (s.name) byName.set(s.name.toLowerCase().trim(), s.id)
    if (s.name_es) byName.set(s.name_es.toLowerCase().trim(), s.id)
  }

  let inserted = 0
  let updated = 0

  for (const t of tricks) {
    const key = (t.name_es || t.name || '').toLowerCase().trim() || t.name.toLowerCase().trim()
    const existingId = byName.get(key) || byName.get(t.name.toLowerCase().trim())

    const row = {
      name: t.name || 'Unnamed',
      name_es: t.name_es || null,
      description: t.description || '',
      description_es: t.description_es || null,
      difficulty: t.difficulty || 'beginner',
      category: t.category || 'fundamentals',
      sort_order: t.sort_order ?? 0,
      is_active: true,
    }

    if (existingId) {
      const { error } = await supabase.from('skills_library').update(row).eq('id', existingId)
      if (!error) updated++
    } else {
      const { error } = await supabase.from('skills_library').insert(row)
      if (!error) inserted++
    }
  }

  return { ok: true, inserted, updated, total: tricks.length }
})
