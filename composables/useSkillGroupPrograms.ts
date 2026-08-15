/** Active skate program levels (`skill_groups`) — same list as coach library Programas. */
export type SkillGroupProgram = {
  id: string
  name: string
  sort_order: number
  is_active?: boolean | null
}

export { assignableSkillGroups } from '~/utils/skillGroupLevels'

/** @deprecated Skaters use Level 1–5; Strength Training is planning-only. */
export async function resolveDefaultSkaterSkillGroupId(
  client: ReturnType<typeof useSupabaseClient>,
): Promise<string | null> {
  return null
}

export function useSkillGroupPrograms() {
  const client = useSupabaseClient()

  const programs = ref<SkillGroupProgram[]>([])
  const loading = ref(false)

  async function load(includeAssignedId?: string | null) {
    loading.value = true
    try {
      const { data, error } = await client
        .from('skill_groups')
        .select('id, name, sort_order, is_active')
        .order('sort_order')
      if (error) throw error

      const rows = (data || []) as SkillGroupProgram[]
      let active = rows.filter(g => g.is_active !== false)

      if (includeAssignedId && !active.some(g => g.id === includeAssignedId)) {
        const assigned = rows.find(g => g.id === includeAssignedId)
        if (assigned) active = [...active, assigned]
      }

      programs.value = active
    } catch (e) {
      console.error('useSkillGroupPrograms.load:', e)
      programs.value = []
    } finally {
      loading.value = false
    }
  }

  return { programs, loading, load }
}
