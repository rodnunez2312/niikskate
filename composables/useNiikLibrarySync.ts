/**
 * Client-side Niik Library sync.
 * Upserts exactly one DB row per Excel column A (manual_id).
 */

const NIIK_LIBRARY_URL = '/data/niik-trick-library.json'

export interface NiikTrick {
  name: string
  name_es?: string
  description: string
  description_es?: string
  comentarios?: string
  url?: string
  area?: string
  structure?: string
  trick_type?: string
  difficulty: string
  category: string
  categoria?: string
  program?: string
  sort_order: number
  manual_id?: number
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
  deactivated: number
  activeCount: number
  total: number
  message?: string
}

let lastSyncTime: string | null = null

function buildRow(t: NiikTrick) {
  const manualId = t.manual_id ?? (t.sort_order > 0 ? t.sort_order : null)
  if (manualId == null || manualId < 1) {
    throw new Error(`Trick "${t.name}" is missing Excel column A (# / manual_id). Re-run npm run niik:parse.`)
  }
  return {
    manual_id: manualId,
    name: t.name || 'Unnamed',
    name_es: t.name_es || null,
    description: t.comentarios || t.description || '',
    description_es: t.description_es || null,
    difficulty: t.difficulty || 'beginner',
    category: t.category || 'iniciacion',
    categoria: t.structure || t.categoria || null,
    area: t.area || null,
    structure: t.structure || null,
    trick_type: t.trick_type || null,
    video_url: t.url || null,
    sort_order: manualId,
    motor_skills: t.motor_skills || [],
    is_active: true,
    program: t.program || null,
    discipline: 'skateboarding',
  }
}

export function useNiikLibrarySync() {
  const client = useSupabaseClient()
  const syncing = ref(false)

  const syncNiikLibrary = async (options?: { force?: boolean }): Promise<SyncResult> => {
    syncing.value = true
    const result: SyncResult = {
      ok: false,
      inserted: 0,
      updated: 0,
      deactivated: 0,
      activeCount: 0,
      total: 0,
    }

    try {
      const url = `${NIIK_LIBRARY_URL}?v=${Date.now()}`
      const res = await $fetch<NiikLibraryJson>(url, {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      })
      const tricks = res?.tricks || []
      result.total = tricks.length

      if (tricks.length === 0) {
        result.ok = true
        return result
      }

      if (!options?.force && lastSyncTime === res.generatedAt) {
        result.ok = true
        return result
      }

      const manualIds = new Set<number>()
      const rows = tricks.map(t => {
        const row = buildRow(t)
        if (manualIds.has(row.manual_id)) {
          throw new Error(`Duplicate manual_id #${row.manual_id} in JSON. Each Excel row must have a unique #.`)
        }
        manualIds.add(row.manual_id)
        return row
      })

      const { data: beforeRows, error: beforeError } = await client
        .from('skills_library')
        .select('manual_id')
        .in('manual_id', [...manualIds])
      if (beforeError) {
        throw new Error(`Unable to read skills_library: ${beforeError.message}`)
      }
      const existingManualIds = new Set((beforeRows || []).map(r => Number(r.manual_id)))

      const chunkSize = 50
      let disciplineReady = true
      for (let i = 0; i < rows.length; i += chunkSize) {
        const source = rows.slice(i, i + chunkSize)
        const chunk = disciplineReady
          ? source
          : source.map(({ discipline: _discipline, ...rest }) => rest)
        let { error } = await client
          .from('skills_library')
          .upsert(chunk, { onConflict: 'manual_id' })
        if (error && disciplineReady && /discipline|schema cache/i.test(error.message || '')) {
          disciplineReady = false
          const plain = source.map(({ discipline: _discipline, ...rest }) => rest)
          ;({ error } = await client.from('skills_library').upsert(plain, { onConflict: 'manual_id' }))
        }
        if (error) {
          const msg = error.message || ''
          if (/discipline/i.test(msg)) {
            throw new Error(
              `Upsert failed: run supabase/migrations/add_skills_library_discipline.sql in Supabase SQL Editor, then sync again. (${msg})`,
            )
          }
          if (/row-level security|violates row/i.test(msg)) {
            throw new Error(
              `Upsert failed: run supabase/migrations/fix_skills_library_sync_rls_and_restore.sql in Supabase SQL Editor, then sync again. (${msg})`,
            )
          }
          if (/manual_id|unique|on conflict|column.*schema cache/i.test(msg)) {
            throw new Error(
              `Upsert failed: run supabase/migrations/add_skills_library_manual_id_unique.sql in Supabase SQL Editor, then sync again. (${msg})`,
            )
          }
          throw new Error(`Upsert failed: ${msg}`)
        }
      }

      result.inserted = rows.filter(r => !existingManualIds.has(r.manual_id)).length
      result.updated = rows.length - result.inserted

      // Retire only what left the sheet. Deactivating everything up front would
      // leave the library dark if the upsert above failed partway.
      // Only the skateboarding sheet retires skate rows. Other sports stay active.
      let stale = await client
        .from('skills_library')
        .update({ is_active: false })
        .eq('is_active', true)
        .eq('discipline', 'skateboarding')
        .not('manual_id', 'in', `(${[...manualIds].join(',')})`)
        .select('id')
      if (stale.error && /discipline|schema cache/i.test(stale.error.message || '')) {
        stale = await client
          .from('skills_library')
          .update({ is_active: false })
          .eq('is_active', true)
          .not('manual_id', 'in', `(${[...manualIds].join(',')})`)
          .select('id')
      }
      if (stale.error) {
        throw new Error(`Retiring removed tricks failed: ${stale.error.message}`)
      }
      result.deactivated = stale.data?.length ?? 0

      let counted = await client
        .from('skills_library')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)
        .eq('discipline', 'skateboarding')
      if (counted.error && /discipline|schema cache/i.test(counted.error.message || '')) {
        counted = await client
          .from('skills_library')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true)
      }
      const { count, error: countError } = counted
      if (countError) throw new Error(countError.message)
      result.activeCount = count ?? 0

      if (result.activeCount !== rows.length) {
        throw new Error(
          `Expected ${rows.length} active tricks after sync, got ${result.activeCount}. Check manual_id unique constraint and re-sync.`,
        )
      }

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
