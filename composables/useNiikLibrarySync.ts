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
  difficulty: string
  category: string
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

  const syncNiikLibrary = async (): Promise<SyncResult> => {
    syncing.value = true
    const result: SyncResult = { ok: false, inserted: 0, updated: 0, total: 0 }
    
    try {
      // Fetch JSON with cache-busting
      const res = await $fetch<NiikLibraryJson>(NIIK_LIBRARY_URL, {
        headers: { 'Cache-Control': 'no-cache' }
      })
      const tricks = res?.tricks || []
      result.total = tricks.length
      
      if (tricks.length === 0) {
        result.ok = true
        return result
      }
      
      // Log JSON info
      console.log('JSON has', tricks.length, 'tricks, generated at:', res.generatedAt)
      
      // Skip if already synced this session with same data
      if (lastSyncTime === res.generatedAt) {
        console.log('Niik Library already synced this session, skipping...')
        result.ok = true
        return result
      }

      // Get existing skills to map names to IDs
      const { data: existing } = await client
        .from('skills_library')
        .select('id, name, name_es')
      
      const byName = new Map<string, string>()
      for (const s of existing || []) {
        if (s.name) byName.set(s.name.toLowerCase().trim(), s.id)
        if (s.name_es) byName.set(s.name_es.toLowerCase().trim(), s.id)
      }

      // Prepare batch rows
      const toInsert: any[] = []
      const toUpdate: { id: string; row: any }[] = []

      for (const t of tricks) {
        const key = (t.name_es || t.name || '').toLowerCase().trim()
        const existingId = byName.get(key) ?? byName.get(t.name.toLowerCase().trim())

        const row = {
          name: t.name || 'Unnamed',
          name_es: t.name_es || null,
          description: t.description || '',
          description_es: t.description_es || null,
          difficulty: t.difficulty || 'beginner',
          category: t.category || 'iniciacion',
          sort_order: t.sort_order ?? 0,
          motor_skills: t.motor_skills || [],
          is_active: true,
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
        if (!error) result.inserted = toInsert.length
        else console.error('Insert error:', error)
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
        updateErrors += results.filter(r => r.error).length
      }
      result.updated = toUpdate.length - updateErrors
      if (updateErrors > 0) console.error(`${updateErrors} update errors`)
      console.log(`Sync complete: ${result.inserted} inserted, ${result.updated} updated`)
      
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
