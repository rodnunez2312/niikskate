/**
 * Client-side Niik Library sync.
 * Works on web and mobile (Capacitor) by fetching the bundled JSON and upserting via Supabase.
 * No server API required, so static/mobile build works.
 * 
 * OPTIMIZED: Uses batch upsert for fast sync (~1 second instead of ~30 seconds)
 */

const NIIK_LIBRARY_URL = '/data/niik-trick-library.json'

export interface NiikTrick {
  name: string
  name_es?: string
  description: string
  description_es?: string
  comentarios?: string
  url?: string
  difficulty: string
  category: string
  categoria?: string // Excel Categoria: 1 - Basics, 2 - Principiantes, 3 - Intermedios, 4 - Avanzados
  program?: string
  sort_order: number
  motor_skills?: string[]
}

export interface NiikLibraryJson {
  source?: string
  sourceFile?: string
  generatedAt?: string
  tricks: NiikTrick[]
}

export interface SyncResult {
  ok: boolean
  inserted: number
  updated: number
  total: number
  message?: string
}

// Store last sync timestamp to avoid redundant syncs
let lastSyncTime: string | null = null

export function useNiikLibrarySync() {
  const client = useSupabaseClient()
  const syncing = ref(false)
  const normalizeSkillKey = (value?: string | null) =>
    (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()

  const syncNiikLibrary = async (options?: { force?: boolean }): Promise<SyncResult> => {
    syncing.value = true
    const result: SyncResult = { ok: false, inserted: 0, updated: 0, total: 0 }
    
    try {
      // Strong cache-bust so browser and dev server serve latest file after niik:parse
      const url = `${NIIK_LIBRARY_URL}?v=${Date.now()}`
      const res = await $fetch<NiikLibraryJson>(url, {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' }
      })
      const tricks = res?.tricks || []
      result.total = tricks.length
      
      if (tricks.length === 0) {
        result.ok = true
        return result
      }
      
      console.log('JSON has', tricks.length, 'tricks, generated at:', res.generatedAt)
      
      // When user clicks "Sincronizar desde Excel", force=true so we always run full sync
      if (!options?.force && lastSyncTime === res.generatedAt) {
        console.log('Niik Library already synced this session, skipping (use force to re-sync)')
        result.ok = true
        return result
      }

      // Get existing skills to map names to IDs
      const { data: existing, error: existingError } = await client
        .from('skills_library')
        .select('id, name, name_es')
      if (existingError) {
        throw new Error(`Unable to read skills_library: ${existingError.message}`)
      }
      
      const byName = new Map<string, string>()
      const niikNameSet = new Set<string>()
      for (const s of existing || []) {
        const n1 = normalizeSkillKey(s.name)
        const n2 = normalizeSkillKey(s.name_es)
        if (n1) byName.set(n1, s.id)
        if (n2) byName.set(n2, s.id)
      }

      // Prepare batch rows
      const toInsert: any[] = []
      const toUpdate: { id: string; row: any }[] = []

      for (const t of tricks) {
        const key = normalizeSkillKey(t.name_es || t.name || '')
        const keyAlt = normalizeSkillKey(t.name)
        if (key) niikNameSet.add(key)
        if (keyAlt) niikNameSet.add(keyAlt)
        const existingId = byName.get(key) ?? byName.get(keyAlt)

        const row = {
          name: t.name || 'Unnamed',
          name_es: t.name_es || null,
          description: t.comentarios || t.description || '',
          description_es: t.description_es || null,
          difficulty: t.difficulty || 'beginner',
          category: t.category || 'iniciacion',
          categoria: (t as any).categoria || null,
          video_url: t.url || null,
          sort_order: t.sort_order ?? 0,
          motor_skills: t.motor_skills || [],
          is_active: true,
          program: t.program || null,
        }

        if (existingId) {
          toUpdate.push({ id: existingId, row })
        } else {
          toInsert.push(row)
        }
      }

      // Batch insert new tricks (single call)
      if (toInsert.length > 0) {
        const { error } = await client.from('skills_library').insert(toInsert)
        if (error) {
          const msg = error.message || ''
          if (/categoria|column.*schema cache/i.test(msg)) {
            throw new Error(
              `Insert failed: skills_library is missing the 'categoria' column. ` +
              `In Supabase: SQL Editor → New query → run: ALTER TABLE skills_library ADD COLUMN IF NOT EXISTS categoria TEXT; ` +
              `Then try "Sincronizar desde Excel" again.`
            )
          }
          throw new Error(`Insert failed: ${msg}`)
        }
        result.inserted = toInsert.length
      }

      // Batch update existing tricks (chunks of 50 for safety)
      console.log(`Updating ${toUpdate.length} existing tricks with new categories...`)
      const chunkSize = 50
      let updateErrors = 0
      for (let i = 0; i < toUpdate.length; i += chunkSize) {
        const chunk = toUpdate.slice(i, i + chunkSize)
        const results = await Promise.all(
          chunk.map(({ id, row }) => 
            client.from('skills_library').update(row).eq('id', id)
          )
        )
        const errors = results.filter(r => r.error).map(r => r.error?.message).filter(Boolean) as string[]
        updateErrors += errors.length
        if (errors.length > 0) {
          const msg = errors[0] || ''
          if (/categoria|column.*schema cache/i.test(msg)) {
            throw new Error(
              `Update failed: skills_library is missing the 'categoria' column. ` +
              `In Supabase: SQL Editor → New query → run: ALTER TABLE skills_library ADD COLUMN IF NOT EXISTS categoria TEXT; ` +
              `Then try "Sincronizar desde Excel" again.`
            )
          }
          throw new Error(`Update failed: ${msg}`)
        }
      }
      result.updated = toUpdate.length - updateErrors
      console.log(`Sync complete: ${result.inserted} inserted, ${result.updated} updated`)

      // Enforce Niik-only active list: deactivate legacy/sample rows not present in Niik file
      const toDeactivate = (existing || [])
        .filter((s: any) => {
          const n1 = normalizeSkillKey(s.name)
          const n2 = normalizeSkillKey(s.name_es)
          return !niikNameSet.has(n1) && !niikNameSet.has(n2)
        })
        .map((s: any) => s.id)

      if (toDeactivate.length > 0) {
        const chunkSize = 100
        for (let i = 0; i < toDeactivate.length; i += chunkSize) {
          const chunk = toDeactivate.slice(i, i + chunkSize)
          const { error } = await client
            .from('skills_library')
            .update({ is_active: false })
            .in('id', chunk)
          if (error) {
            throw new Error(`Deactivate legacy skills failed: ${error.message}`)
          }
        }
        console.log(`Deactivated ${toDeactivate.length} legacy/non-Niik skills`)
      }
      
      // Remember this sync
      lastSyncTime = res.generatedAt || null
      result.ok = true
      
    } catch (e: any) {
      result.message = e?.data?.message || e?.message || 'Sync failed'
      console.error('Sync error:', e)
    } finally {
      syncing.value = false
    }
    return result
  }

  return { syncing, syncNiikLibrary }
}
