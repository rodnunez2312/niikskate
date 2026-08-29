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

const loading = ref(true)
const profile = ref<any>(null)
const programName = ref<string | null>(null)
const skillGroupName = ref<string | null>(null)
const programPct = ref(0)
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

    if (prof?.skill_group_id) {
      const { data: grp } = await client
        .from('skill_groups')
        .select('name')
        .eq('id', prof.skill_group_id)
        .maybeSingle()
      skillGroupName.value = grp?.name ?? null

      const { data: areas } = await client.from('skill_areas').select('id').eq('group_id', prof.skill_group_id)
      const areaIds = (areas || []).map(a => a.id)
      if (areaIds.length) {
        const { data: areaSkills } = await client.from('area_skills').select('skill_id').in('area_id', areaIds)
        const programSkillIds = [...new Set((areaSkills || []).map(r => r.skill_id).filter(Boolean))]
        const { data: progress } = await client.from('student_progress').select('skill_id').eq('student_id', uid)
        if (programSkillIds.length && progress) {
          const learned = new Set(progress.map(p => p.skill_id))
          const count = programSkillIds.filter(id => learned.has(id)).length
          programPct.value = Math.round((count / programSkillIds.length) * 100)
        }
      }
    }

    const { data: ps } = await client.from('program_students').select('program_id').eq('student_id', uid).limit(1)
    const pid = ps?.[0]?.program_id
    if (pid) {
      const { data: pr } = await client.from('programs').select('name').eq('id', pid).maybeSingle()
      programName.value = pr?.name ?? null
    }

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
      <div class="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div class="flex justify-between gap-2">
          <span class="text-sm text-gray-400">{{ language === 'es' ? 'Programa' : 'Program' }}</span>
          <span class="text-sm font-semibold text-white">{{ programName || (language === 'es' ? 'Sin asignar' : 'Not assigned') }}</span>
        </div>
        <div class="flex justify-between gap-2">
          <span class="text-sm text-gray-400">{{ language === 'es' ? 'Nivel / grupo' : 'Level / group' }}</span>
          <span class="text-sm font-semibold text-white">{{ skillGroupName || (language === 'es' ? 'Sin asignar' : 'Not assigned') }}</span>
        </div>
        <div v-if="skillGroupName" class="pt-2">
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span>{{ language === 'es' ? 'Progreso del nivel' : 'Level progress' }}</span>
            <span>{{ programPct }}%</span>
          </div>
          <div class="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div class="h-full bg-sky-500 rounded-full" :style="{ width: `${programPct}%` }" />
          </div>
        </div>
      </div>

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
