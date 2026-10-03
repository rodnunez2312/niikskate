<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()
const { skaterParticipants, loading: crewLoading } = useCrew()

function studentIdFor(person: { type: string; skaterProfileId: string | null }) {
  if (person.skaterProfileId) return person.skaterProfileId
  if (person.type === 'self') return user.value?.id ?? null
  return null
}

type ProgramPhase = {
  id: string
  name: string
  description: string | null
  color: string | null
  sortOrder: number
  learned: number
  total: number
  progressPct: number
}

type SkaterBoard = {
  key: string
  firstName: string
  studentId: string | null
  profile: any
  programName: string | null
  programDescription: string | null
  skillGroupName: string | null
  programPct: number
  programPhases: ProgramPhase[]
}

const loading = ref(true)
const boards = ref<SkaterBoard[]>([])

async function loadBoards() {
  const people = skaterParticipants.value
  loading.value = true
  try {
    const { data: groups } = await client
      .from('skill_groups')
      .select('id, name, description, color, sort_order')
      .eq('is_active', true)
      .order('sort_order')
    const groupRows = groups || []
    const groupIds = groupRows.map(group => group.id)
    const { data: areas } = groupIds.length
      ? await client.from('skill_areas').select('id, group_id').in('group_id', groupIds)
      : { data: [] }
    const areaRows = areas || []
    const areaIds = areaRows.map(area => area.id)
    const { data: areaSkills } = areaIds.length
      ? await client.from('area_skills').select('area_id, skill_id').in('area_id', areaIds)
      : { data: [] }
    const candidateSkillIds = [...new Set((areaSkills || []).map(row => row.skill_id).filter(Boolean))]
    const { data: skaterTricks } = candidateSkillIds.length
      ? await client
          .from('skills_library')
          .select('id')
          .in('id', candidateSkillIds)
          .eq('is_active', true)
          .eq('trick_type', 'Trick')
      : { data: [] }
    const skaterTrickIds = new Set((skaterTricks || []).map(row => row.id))
    const groupByArea = new Map(areaRows.map(area => [area.id, area.group_id]))
    const skillIdsByGroup = new Map<string, Set<string>>()
    for (const row of areaSkills || []) {
      const groupId = groupByArea.get(row.area_id)
      if (!groupId || !row.skill_id || !skaterTrickIds.has(row.skill_id)) continue
      if (!skillIdsByGroup.has(groupId)) skillIdsByGroup.set(groupId, new Set())
      skillIdsByGroup.get(groupId)!.add(row.skill_id)
    }

    boards.value = await Promise.all(people.map(async (person) => {
      const uid = studentIdFor(person)
      const emptyPhases = () => groupRows.map(group => ({
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        sortOrder: group.sort_order || 0,
        learned: 0,
        total: (skillIdsByGroup.get(group.id) || new Set()).size,
        progressPct: 0,
      }))
      if (!uid) {
        return {
          key: person.key,
          firstName: person.firstName,
          studentId: null,
          profile: null,
          programName: null,
          programDescription: null,
          skillGroupName: null,
          programPct: 0,
          programPhases: emptyPhases(),
        }
      }

      const [{ data: prof }, { data: progress }, { data: assignment }] = await Promise.all([
        client.from('profiles').select('*').eq('id', uid).maybeSingle(),
        client.from('student_progress').select('skill_id').eq('student_id', uid),
        client
          .from('program_students')
          .select('program_id, program:programs(name, description)')
          .eq('student_id', uid)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const learnedIds = new Set((progress || []).map(row => row.skill_id))
      const programPhases = groupRows.map(group => {
        const skillIds = [...(skillIdsByGroup.get(group.id) || new Set<string>())]
        const learned = skillIds.filter(id => learnedIds.has(id)).length
        return {
          id: group.id,
          name: group.name,
          description: group.description,
          color: group.color,
          sortOrder: group.sort_order || 0,
          learned,
          total: skillIds.length,
          progressPct: skillIds.length ? Math.round((learned / skillIds.length) * 100) : 0,
        }
      })
      const currentPhase = programPhases.find(phase => phase.id === prof?.skill_group_id)
      const assignedProgram = assignment?.program as unknown as {
        name?: string
        description?: string | null
      } | null
      return {
        key: person.key,
        firstName: person.firstName,
        studentId: uid,
        profile: prof,
        programName: assignedProgram?.name ?? currentPhase?.name ?? null,
        programDescription: assignedProgram?.description ?? currentPhase?.description ?? null,
        skillGroupName: currentPhase?.name ?? null,
        programPct: currentPhase?.progressPct ?? 0,
        programPhases,
      }
    }))
  } finally {
    loading.value = false
  }
}

watch(
  [() => skaterParticipants.value.map(person => `${person.key}:${studentIdFor(person) ?? ''}`).join('|'), crewLoading],
  ([, crewBusy]) => {
    if (crewBusy) return
    loadBoards()
  },
  { immediate: true },
)

function phaseStatus(board: SkaterBoard, phase: ProgramPhase, index: number) {
  const currentIndex = board.programPhases.findIndex(item => item.id === board.profile?.skill_group_id)
  if (phase.id === board.profile?.skill_group_id) {
    return {
      label: language.value === 'es' ? 'Fase actual' : 'Current phase',
      classes: 'border-gold-400/50 bg-gold-400/10 text-gold-300',
    }
  }
  if (phase.progressPct === 100 || (currentIndex >= 0 && index < currentIndex)) {
    return {
      label: language.value === 'es' ? 'Completada' : 'Completed',
      classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    }
  }
  return {
    label: language.value === 'es' ? 'Siguiente' : 'Upcoming',
    classes: 'border-gray-700 bg-gray-800 text-gray-500',
  }
}
</script>

<template>
  <div
    class="px-4 py-6 mx-auto space-y-6 pb-8"
    :class="boards.length > 1 ? 'max-w-lg lg:max-w-6xl' : 'max-w-lg lg:max-w-4xl'"
  >
    <div>
      <h1 class="text-xl font-bold text-white">
        {{ language === 'es' ? 'Programa de entrenamiento' : 'Training Program' }}
      </h1>
      <p class="text-sm text-gray-400 mt-1">
        {{ language === 'es' ? 'Tu programa, nivel y objetivos asignados por tu coach.' : 'Your program, level, and coach-assigned targets.' }}
      </p>
    </div>

    <div v-if="loading" class="flex justify-center py-16">
      <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
    </div>

    <div
      v-else
      class="grid grid-cols-1 gap-8"
      :class="boards.length > 1 ? 'lg:grid-cols-2 lg:gap-6' : ''"
    >
      <div v-for="board in boards" :key="board.key" class="space-y-6 min-w-0">
      <div class="rounded-xl border border-gold-400/30 bg-gold-400/5 p-4 space-y-3">
        <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gold-400">
          {{ language === 'es' ? 'Tu programa' : 'Your program' }}
          <span v-if="boards.length > 1 || board.firstName"> · {{ board.firstName }}</span>
        </p>
        <div>
          <p class="text-lg font-black text-white">
            {{ board.programName || (language === 'es' ? 'Sin programa asignado' : 'No program assigned') }}
          </p>
          <p v-if="board.programDescription" class="mt-1 text-xs text-gray-400">{{ board.programDescription }}</p>
        </div>
        <div v-if="board.skillGroupName" class="rounded-lg bg-gray-900/80 p-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs text-gray-400">{{ language === 'es' ? 'Fase actual' : 'Current phase' }}</span>
            <span class="text-xs font-bold text-white">{{ board.skillGroupName }}</span>
          </div>
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span>{{ language === 'es' ? 'Progreso de la fase' : 'Phase progress' }}</span>
            <span>{{ board.programPct }}%</span>
          </div>
          <div class="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div class="h-full bg-sky-500 rounded-full" :style="{ width: `${board.programPct}%` }" />
          </div>
        </div>
      </div>

      <section class="space-y-3">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-gold-400">
            {{ language === 'es' ? 'Fases del programa' : 'Program phases' }}
          </h2>
          <p class="mt-1 text-xs text-gray-500">
            {{
              language === 'es'
                ? 'Tu recorrido desde fundamentos hasta nivel avanzado.'
                : 'Your path from foundations through advanced skating.'
            }}
          </p>
        </div>

        <div v-if="board.programPhases.length" class="relative space-y-2">
          <div class="absolute bottom-7 left-[19px] top-7 w-px bg-gray-800" aria-hidden="true" />
          <article
            v-for="(phase, index) in board.programPhases"
            :key="phase.id"
            class="relative rounded-xl border p-3 pl-12"
            :class="phase.id === board.profile?.skill_group_id
              ? 'border-gold-400/50 bg-gold-400/5'
              : 'border-gray-800 bg-gray-900'"
          >
            <span
              class="absolute left-3 top-4 z-10 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-black"
              :style="{ backgroundColor: phase.color || '#6b7280' }"
              aria-hidden="true"
            />
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm font-bold text-white">{{ phase.name }}</p>
                <p v-if="phase.description" class="mt-0.5 text-xs text-gray-500">{{ phase.description }}</p>
              </div>
              <span
                class="shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide"
                :class="phaseStatus(board, phase, index).classes"
              >
                {{ phaseStatus(board, phase, index).label }}
              </span>
            </div>
            <div class="mt-3 flex items-center gap-2">
              <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
                <div
                  class="h-full rounded-full"
                  :style="{
                    width: `${phase.progressPct}%`,
                    backgroundColor: phase.color || '#6b7280',
                  }"
                />
              </div>
              <span class="w-9 text-right text-[10px] font-bold text-gray-500">
                {{ phase.progressPct }}%
              </span>
            </div>
            <p class="mt-1 text-[10px] text-gray-600">
              {{ phase.learned }}/{{ phase.total }}
              {{ language === 'es' ? 'habilidades' : 'skills' }}
            </p>
          </article>
        </div>
        <p v-else class="rounded-xl border border-gray-800 bg-gray-900 p-4 text-sm text-gray-500">
          {{ language === 'es' ? 'Las fases del programa aún no están disponibles.' : 'Program phases are not available yet.' }}
        </p>
      </section>

      </div>
    </div>
  </div>
</template>
