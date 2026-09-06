<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

import type { Skill } from '~/types'
import { trickBagStatusLabel, type SkaterTrickBagStatus } from '~/utils/skateTrickTaxonomy'

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

type FocusRow = {
  id: string
  skill_id: string
  coach_note: string | null
  status?: SkaterTrickBagStatus
  skill?: Skill
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

const loading = ref(true)
const profile = ref<any>(null)
const programName = ref<string | null>(null)
const programDescription = ref<string | null>(null)
const skillGroupName = ref<string | null>(null)
const programPct = ref(0)
const programPhases = ref<ProgramPhase[]>([])
const skillFocus = ref<FocusRow[]>([])
const updatingFocusId = ref<string | null>(null)
const focusError = ref<string | null>(null)

onMounted(async () => {
  if (!user.value) return
  loading.value = true
  try {
    const uid = user.value.id
    const { data: prof } = await client.from('profiles').select('*').eq('id', uid).single()
    profile.value = prof

    const [{ data: groups }, { data: progress }] = await Promise.all([
      client
        .from('skill_groups')
        .select('id, name, description, color, sort_order')
        .eq('is_active', true)
        .order('sort_order'),
      client.from('student_progress').select('skill_id').eq('student_id', uid),
    ])

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

    const groupByArea = new Map(areaRows.map(area => [area.id, area.group_id]))
    const skillIdsByGroup = new Map<string, Set<string>>()
    for (const row of areaSkills || []) {
      const groupId = groupByArea.get(row.area_id)
      if (!groupId || !row.skill_id) continue
      if (!skillIdsByGroup.has(groupId)) skillIdsByGroup.set(groupId, new Set())
      skillIdsByGroup.get(groupId)!.add(row.skill_id)
    }
    const learnedIds = new Set((progress || []).map(row => row.skill_id))
    programPhases.value = groupRows.map(group => {
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

    const currentPhase = programPhases.value.find(phase => phase.id === prof?.skill_group_id)
    skillGroupName.value = currentPhase?.name ?? null
    programPct.value = currentPhase?.progressPct ?? 0

    const { data: assignment } = await client
      .from('program_students')
      .select('program_id, program:programs(name, description)')
      .eq('student_id', uid)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const assignedProgram = assignment?.program as unknown as {
      name?: string
      description?: string | null
    } | null
    programName.value = assignedProgram?.name ?? null
    programDescription.value = assignedProgram?.description ?? null

    const { data: focus } = await client
      .from('student_skill_focus')
      .select('id, skill_id, coach_note, status, skill:skills_library(*)')
      .eq('student_id', uid)
      .in('status', ['assigned', 'pending', 'done'])
      .order('created_at', { ascending: false })
    skillFocus.value = (focus || []) as typeof skillFocus.value
  } finally {
    loading.value = false
  }
})

function skillLabel(skill?: Skill) {
  if (!skill) return '—'
  return language.value === 'es' ? skill.name_es || skill.name : skill.name
}

const currentPhaseIndex = computed(() =>
  programPhases.value.findIndex(phase => phase.id === profile.value?.skill_group_id),
)

function phaseStatus(phase: ProgramPhase, index: number) {
  if (phase.id === profile.value?.skill_group_id) {
    return {
      label: language.value === 'es' ? 'Fase actual' : 'Current phase',
      classes: 'border-gold-400/50 bg-gold-400/10 text-gold-300',
    }
  }
  if (phase.progressPct === 100 || (currentPhaseIndex.value >= 0 && index < currentPhaseIndex.value)) {
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

/**
 * The skater owns their own bag once a coach has filled it: they move a trick to
 * "en progreso" and tick it off when they land it. Undoing stays with the coach.
 */
async function setFocusStatus(row: FocusRow, status: SkaterTrickBagStatus) {
  if (!user.value || updatingFocusId.value || row.status === status) return
  updatingFocusId.value = row.id
  focusError.value = null
  const previous = row.status
  const stamp = new Date().toISOString()
  row.status = status
  try {
    const { error } = await client
      .from('student_skill_focus')
      .update({ status, completed_at: status === 'done' ? stamp : null })
      .eq('id', row.id)
    if (error) throw error

    if (status === 'done') {
      const { error: progressError } = await client.from('student_progress').insert({
        student_id: user.value.id,
        skill_id: row.skill_id,
        proficiency: 3,
        learned_at: stamp,
        marked_by: user.value.id,
      })
      // 23505: already unlocked by a coach, nothing to do.
      if (progressError && progressError.code !== '23505') throw progressError
    }
  } catch (e: any) {
    row.status = previous
    focusError.value =
      e?.message || (language.value === 'es' ? 'No se pudo actualizar' : 'Could not update')
  } finally {
    updatingFocusId.value = null
  }
}
</script>

<template>
  <div class="px-4 py-6 max-w-lg mx-auto space-y-6 pb-8">
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

    <template v-else>
      <div class="rounded-xl border border-gold-400/30 bg-gold-400/5 p-4 space-y-3">
        <p class="text-[10px] font-black uppercase tracking-[0.18em] text-gold-400">
          {{ language === 'es' ? 'Tu programa' : 'Your program' }}
        </p>
        <div>
          <p class="text-lg font-black text-white">
            {{ programName || (language === 'es' ? 'Sin programa asignado' : 'No program assigned') }}
          </p>
          <p v-if="programDescription" class="mt-1 text-xs text-gray-400">{{ programDescription }}</p>
        </div>
        <div v-if="skillGroupName" class="rounded-lg bg-gray-900/80 p-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-xs text-gray-400">{{ language === 'es' ? 'Fase actual' : 'Current phase' }}</span>
            <span class="text-xs font-bold text-white">{{ skillGroupName }}</span>
          </div>
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span>{{ language === 'es' ? 'Progreso de la fase' : 'Phase progress' }}</span>
            <span>{{ programPct }}%</span>
          </div>
          <div class="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div class="h-full bg-sky-500 rounded-full" :style="{ width: `${programPct}%` }" />
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

        <div v-if="programPhases.length" class="relative space-y-2">
          <div class="absolute bottom-7 left-[19px] top-7 w-px bg-gray-800" aria-hidden="true" />
          <article
            v-for="(phase, index) in programPhases"
            :key="phase.id"
            class="relative rounded-xl border p-3 pl-12"
            :class="phase.id === profile?.skill_group_id
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
                :class="phaseStatus(phase, index).classes"
              >
                {{ phaseStatus(phase, index).label }}
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

      <MemberSkaterChallengesCard :student-id="user?.id ?? null" can-complete />

      <section class="space-y-3">
        <h2 class="text-sm font-bold text-gold-400 uppercase tracking-wide">
          {{ language === 'es' ? 'Bolsa de trucos' : 'Trick bag' }}
        </h2>
        <p class="text-xs text-gray-500 -mt-1">
          {{
            language === 'es'
              ? 'Cuando lo logres, márcalo como completado. Si te equivocas, pídele a tu coach que lo deshaga.'
              : 'Tick a trick off once you land it. Ask your coach if you need it undone.'
          }}
        </p>
        <p v-if="focusError" class="text-xs text-flame-500">{{ focusError }}</p>
        <ul v-if="skillFocus.length" class="space-y-2">
          <li
            v-for="f in skillFocus"
            :key="f.id"
            class="rounded-xl bg-gray-900 border border-amber-500/30 px-4 py-3 space-y-2"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-white font-medium text-sm">{{ skillLabel(f.skill) }}</p>
              <span
                v-if="f.status"
                class="text-xs px-2 py-0.5 rounded shrink-0"
                :class="f.status === 'done' ? 'bg-emerald-500/20 text-emerald-300' : f.status === 'pending' ? 'bg-amber-500/20 text-amber-300' : 'bg-sky-500/20 text-sky-300'"
              >
                {{ trickBagStatusLabel(f.status, language === 'es') }}
              </span>
            </div>
            <p v-if="f.coach_note" class="text-gray-400 text-xs">{{ f.coach_note }}</p>
            <div v-if="f.status !== 'done'" class="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                class="min-h-[44px] rounded-xl border text-xs font-bold disabled:opacity-50"
                :class="
                  f.status === 'pending'
                    ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                    : 'border-gray-700 text-gray-300'
                "
                :disabled="updatingFocusId === f.id"
                @click="setFocusStatus(f, 'pending')"
              >
                {{ language === 'es' ? 'Lo estoy intentando' : "I'm working on it" }}
              </button>
              <button
                type="button"
                class="min-h-[44px] rounded-xl bg-emerald-500 text-black text-xs font-black disabled:opacity-50"
                :disabled="updatingFocusId === f.id"
                @click="setFocusStatus(f, 'done')"
              >
                {{ language === 'es' ? '¡Ya lo logré!' : 'I landed it!' }}
              </button>
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-gray-500 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
          {{ language === 'es' ? 'Tu coach aún no ha asignado trucos.' : 'Your coach has not assigned tricks yet.' }}
        </p>
      </section>

      <div class="flex flex-col gap-2">
        <NuxtLink
          to="/member/student/progress"
          class="block text-center px-4 py-3 rounded-xl bg-gold-400 text-black font-bold text-sm"
        >
          {{ language === 'es' ? 'Ver árbol de habilidades' : 'View skill tree' }}
        </NuxtLink>
        <NuxtLink
          to="/member/student/classes"
          class="block text-center px-4 py-3 rounded-xl border border-gray-700 text-gray-200 font-semibold text-sm"
        >
          {{ language === 'es' ? 'Reservar clases' : 'Book classes' }}
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
