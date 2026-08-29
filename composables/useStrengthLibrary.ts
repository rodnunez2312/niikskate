/**
 * Strength library: read from Supabase, sync from the parsed Excel sheet.
 * Upserts on `slug` (Ejercicio + Nivel) so renaming in Excel adds a row rather
 * than silently rewriting an existing one.
 */

import type { StrengthExercise } from '~/utils/strengthTraining'

const STRENGTH_LIBRARY_URL = '/data/niik-strength-library.json'

interface StrengthLibraryJson {
  source?: string
  sourceFile?: string
  generatedAt?: string
  secondsPerRep?: number
  exercises: StrengthExercise[]
}

export interface StrengthSyncResult {
  ok: boolean
  upserted: number
  deactivated: number
  total: number
  message?: string
}

const MIGRATION_HINT =
  'run supabase/migrations/add_strength_exercises.sql in the Supabase SQL Editor, then sync again'

function isMissingTable(message: string): boolean {
  return /strength_exercises|does not exist|schema cache|relation/i.test(message)
}

export function useStrengthLibrary() {
  const client = useSupabaseClient()

  const exercises = useState<StrengthExercise[]>('strength-exercises', () => [])
  const loading = ref(false)
  const syncing = ref(false)
  const error = ref<string | null>(null)

  const loadExercises = async (options?: { force?: boolean }) => {
    if (exercises.value.length && !options?.force) return exercises.value
    loading.value = true
    error.value = null
    try {
      const { data, error: e } = await client
        .from('strength_exercises')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (e) throw new Error(e.message)
      exercises.value = (data || []) as unknown as StrengthExercise[]
    } catch (e: any) {
      const msg = e?.message || 'Failed to load strength exercises'
      error.value = isMissingTable(msg) ? `${msg} — ${MIGRATION_HINT}` : msg
      console.error('loadExercises:', e)
    } finally {
      loading.value = false
    }
    return exercises.value
  }

  const syncStrengthLibrary = async (): Promise<StrengthSyncResult> => {
    syncing.value = true
    const result: StrengthSyncResult = { ok: false, upserted: 0, deactivated: 0, total: 0 }

    try {
      const json = await $fetch<StrengthLibraryJson>(`${STRENGTH_LIBRARY_URL}?v=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      })
      const parsed = json?.exercises || []
      result.total = parsed.length
      if (!parsed.length) {
        throw new Error('No exercises in niik-strength-library.json. Run npm run niik:parse.')
      }

      const rows = parsed.map(ex => ({
        slug: ex.slug,
        name: ex.name,
        name_en: ex.name_en || null,
        level: ex.level,
        pillar_primary: ex.pillar_primary,
        pillar_secondary: ex.pillar_secondary || null,
        body_areas: ex.body_areas || [],
        motor_skill_es: ex.motor_skill_es || null,
        training_phase: ex.training_phase,
        skate_application_es: ex.skate_application_es || null,
        equipment_es: ex.equipment_es || null,
        prescription_es: ex.prescription_es || null,
        rest_es: ex.rest_es || null,
        coach_cue_es: ex.coach_cue_es || null,
        priority: ex.priority || 'primary',
        work_seconds: ex.work_seconds ?? 0,
        rest_seconds: ex.rest_seconds ?? 0,
        est_seconds: ex.est_seconds ?? 0,
        per_side: !!ex.per_side,
        reps: ex.reps ?? null,
        kid_safe: ex.kid_safe !== false,
        video_url: ex.video_url || null,
        sort_order: ex.sort_order ?? 0,
        is_active: true,
      }))

      const chunkSize = 50
      for (let i = 0; i < rows.length; i += chunkSize) {
        const { error: e } = await client
          .from('strength_exercises')
          .upsert(rows.slice(i, i + chunkSize), { onConflict: 'slug' })
        if (e) {
          throw new Error(
            isMissingTable(e.message) ? `Upsert failed: ${MIGRATION_HINT}. (${e.message})` : e.message,
          )
        }
      }
      result.upserted = rows.length

      // Retire rows dropped from the sheet instead of deleting them, so any plan
      // that referenced one keeps resolving.
      const slugs = new Set(rows.map(r => r.slug))
      const { data: existing, error: listError } = await client
        .from('strength_exercises')
        .select('slug')
        .eq('is_active', true)
      if (listError) throw new Error(listError.message)

      const stale = (existing || []).map(r => r.slug as string).filter(s => !slugs.has(s))
      if (stale.length) {
        const { error: e } = await client
          .from('strength_exercises')
          .update({ is_active: false })
          .in('slug', stale)
        if (e) throw new Error(e.message)
        result.deactivated = stale.length
      }

      await loadExercises({ force: true })
      result.ok = true
    } catch (e: any) {
      result.message = e?.data?.message || e?.message || 'Strength sync failed'
      console.error('syncStrengthLibrary:', e)
    } finally {
      syncing.value = false
    }
    return result
  }

  return { exercises, loading, syncing, error, loadExercises, syncStrengthLibrary }
}
