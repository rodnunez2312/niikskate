import { assignableSkillGroups, normalizeSkillGroupDisplayName, type SkillGroupRow } from '~/utils/skillGroupLevels'
import { disciplineFromJoin, skillLevelWithDiscipline } from '~/utils/trainingDisciplines'

export type SkillGroupProgram = SkillGroupRow & {
  color?: string | null
  discipline?: string | null
  programName?: string | null
  programId?: string | null
}

type ProgramJoin = { id?: string | null; name?: string | null; discipline?: string | null } | null

/** @deprecated Skaters use Level 1–5; Strength Training is planning-only. */
export async function resolveDefaultSkaterSkillGroupId(
  _client: ReturnType<typeof useSupabaseClient>,
): Promise<string | null> {
  return null
}

function withDiscipline(row: SkillGroupProgram & { training_programs?: ProgramJoin }): SkillGroupProgram {
  const joined = row.training_programs
  const program = Array.isArray(joined) ? joined[0] : joined
  return {
    id: row.id,
    name: row.name,
    sort_order: row.sort_order,
    is_active: row.is_active,
    color: row.color ?? null,
    discipline: disciplineFromJoin(row) ?? row.discipline ?? null,
    programName: program?.name ?? row.programName ?? null,
    programId: (row as { program_id?: string | null }).program_id ?? program?.id ?? row.programId ?? null,
  }
}

/** Skill groups used as skater program phases (Level 1–5, etc.). */
export function useSkillGroupPrograms() {
  const client = useSupabaseClient()
  const { language } = useI18n()
  const programs = ref<SkillGroupProgram[]>([])
  const loading = ref(false)

  async function load(includeAssignedId?: string | null) {
    loading.value = true
    try {
      const joined = await client
        .from('skill_groups')
        .select('id, name, sort_order, is_active, color, program_id, training_programs(id, name, discipline)')
        .order('sort_order')
      const source = joined.error
        ? await client.from('skill_groups').select('id, name, sort_order, is_active, color').order('sort_order')
        : joined
      const rows = ((source.data || []) as Array<SkillGroupProgram & { training_programs?: ProgramJoin }>).map(withDiscipline)
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

  const assignable = computed(() => assignableSkillGroups(programs.value))

  function optionLabel(group: SkillGroupProgram) {
    return skillLevelWithDiscipline(
      normalizeSkillGroupDisplayName(group.name),
      group.discipline,
      language.value === 'es',
    )
  }

  return { programs, assignable, loading, load, optionLabel }
}
