<script setup lang="ts">
import type { Skill, StudentProgress } from '~/types'
import type { CrewParticipant } from '~/composables/useCrew'
import { skaterRatingBubbleClass } from '~/utils/skaterRatingDots'
import { computeSkaterProgramMilestones } from '~/utils/skaterProgramProgress'
import { normalizeSkillGroupDisplayName } from '~/utils/skillGroupLevels'
import {
  SKATER_PUSH_OPTIONS,
  SKATER_STANCE_OPTIONS,
  SKATER_STYLE_OPTIONS,
} from '~/utils/skaterProfileFields'
import {
  SKATE_TRICK_AREAS,
  compareSkillsByManualId,
  isCoachDrill,
  isSkaterTrick,
  trickBagStatusLabel,
  type SkaterTrickBagStatus,
} from '~/utils/skateTrickTaxonomy'

const props = defineProps<{
  participant: CrewParticipant
  /** profiles.id when progress exists in DB; null for crew-only skaters */
  studentId: string | null
}>()

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

const avatarUrl = ref<string | null>(props.participant.avatarUrl)

watch(
  () => props.participant.avatarUrl,
  url => {
    avatarUrl.value = url
  },
)

const avatarTarget = computed(() => {
  if (props.participant.type === 'self') return { kind: 'self' as const }
  if (props.participant.type === 'skater' && props.participant.skaterProfileId) {
    return { kind: 'skater' as const, skaterProfileId: props.participant.skaterProfileId }
  }
  if (props.participant.crewMemberId) return { kind: 'crew' as const, crewMemberId: props.participant.crewMemberId }
  return { kind: 'self' as const }
})

const canEditAvatar = computed(() => avatarTarget.value.kind !== 'self' || Boolean(user.value?.id))

const {
  uploadingAvatar,
  fileInputRef,
  onAvatarFileChange,
  openAvatarPicker,
  removeAvatar,
} = useParticipantAvatarUpload(avatarTarget, avatarUrl)

type FocusRow = {
  id: string
  skill_id: string
  coach_note: string | null
  status?: SkaterTrickBagStatus
  completed_at?: string | null
  skill?: Skill
}

const loading = ref(true)
const skills = ref<Skill[]>([])
const drills = ref<Skill[]>([])
const progress = ref<StudentProgress[]>([])
const skillFocus = ref<FocusRow[]>([])
const evaluationCount = ref(0)
const classesAttended = ref(0)
const updatingFocusId = ref<string | null>(null)
const focusError = ref<string | null>(null)
const uploadingFocusId = ref<string | null>(null)
const videoCount = ref(0)
type ProgressModule = 'tricks' | 'drills' | 'challenges'
const progressModule = ref<ProgressModule>('tricks')
const challengeCounts = ref({ completed: 0, total: 0 })

const trickLibrary = computed(() => skills.value.filter(isSkaterTrick))

const learnedSkillIds = computed(() => new Set(progress.value.map(p => p.skill_id)))

const tricksLearned = computed(
  () => trickLibrary.value.filter(s => learnedSkillIds.value.has(s.id)).length,
)
const drillsDone = computed(
  () => drills.value.filter(d => learnedSkillIds.value.has(d.id)).length,
)
const libraryTrickPct = computed(() =>
  trickLibrary.value.length ? Math.round((tricksLearned.value / trickLibrary.value.length) * 100) : 0,
)
const libraryDrillPct = computed(() =>
  drills.value.length ? Math.round((drillsDone.value / drills.value.length) * 100) : 0,
)

const programMilestoneProgress = computed(() =>
  computeSkaterProgramMilestones([...skills.value, ...drills.value], learnedSkillIds.value),
)
const programTimelineFillWidth = computed(() => {
  const pct = programMilestoneProgress.value.totalPct
  return `${Math.max(0, Math.min(80, (pct / 100) * 80))}%`
})
const milestoneNodeClass = (phase: string) => {
  if (phase === 'complete') return 'bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.35)]'
  if (phase === 'active') return 'bg-amber-500/20 border-amber-400 text-amber-300 ring-2 ring-amber-400/25'
  return 'bg-gray-800 border-gray-600 text-gray-500 opacity-70'
}
const milestoneStatusLabel = (phase: string, learned: number) => {
  if (phase === 'complete') return language.value === 'es' ? 'Hito' : 'Milestone'
  if (phase === 'active') return language.value === 'es' ? 'En curso' : 'In progress'
  if (learned > 0) return 'Extra'
  return language.value === 'es' ? 'Pendiente' : 'Upcoming'
}
const milestoneCountClass = (phase: string, learned: number) => {
  if (phase === 'complete') return 'text-emerald-400'
  if (phase === 'active') return 'text-amber-400/90'
  if (learned > 0) return 'text-gray-500'
  return 'text-gray-600'
}

const SKATER_RATING_ROWS = [
  { key: 'rating_fundamentals', label: 'Fundamentals', labelEs: 'Fundamentos' },
  { key: 'rating_skate_iq', label: 'Skate IQ', labelEs: 'Skate IQ' },
  { key: 'rating_street', label: 'Street', labelEs: 'Street' },
  { key: 'rating_vert', label: 'Vert', labelEs: 'Vert' },
  { key: 'rating_speed_ollie', label: 'Speed ollie', labelEs: 'Speed ollie' },
  { key: 'rating_fakie_switch', label: 'Fakie / Switch', labelEs: 'Fakie / Switch' },
  { key: 'rating_slps', label: 'Slaps', labelEs: 'Slaps' },
  { key: 'rating_rails', label: 'Rails', labelEs: 'Rails' },
] as const

type SkaterProfileBits = {
  email: string | null
  skill_group_id: string | null
  stance: string | null
  skating_style: string | null
  push_style: string | null
  rating_fundamentals: number | null
  rating_skate_iq: number | null
  rating_street: number | null
  rating_vert: number | null
  rating_speed_ollie: number | null
  rating_fakie_switch: number | null
  rating_slps: number | null
  rating_rails: number | null
}

const profileBits = ref<SkaterProfileBits | null>(null)
const assignedSkillGroup = ref<{ id: string; name: string } | null>(null)
const groupAveragePct = ref(0)
const emailCopied = ref(false)
let emailCopiedTimer: ReturnType<typeof setTimeout> | null = null

const assignedProgramLabel = computed(() => {
  const name = assignedSkillGroup.value?.name
  return name ? normalizeSkillGroupDisplayName(name) : null
})

const skillAttributeDots = computed(() =>
  SKATER_RATING_ROWS.map(({ key, label, labelEs }) => {
    const raw = profileBits.value?.[key]
    const num = typeof raw === 'number' ? raw : NaN
    const value = Number.isFinite(num) && num >= 0 && num <= 10 ? num : 0
    return { key, label, labelEs, filled: value }
  }),
)

const profileEmail = computed(() => profileBits.value?.email?.trim() || null)

async function copyProfileEmail() {
  const email = profileEmail.value
  if (!email) return
  try {
    await navigator.clipboard.writeText(email)
    emailCopied.value = true
    if (emailCopiedTimer) clearTimeout(emailCopiedTimer)
    emailCopiedTimer = setTimeout(() => {
      emailCopied.value = false
    }, 1600)
  } catch {
    emailCopied.value = false
  }
}

const milestones = computed(() => [
  {
    icon: '🛹',
    title: language.value === 'es' ? 'Trucos aprendidos' : 'Tricks learned',
    value: `${tricksLearned.value} / ${trickLibrary.value.length}`,
    done: tricksLearned.value > 0,
  },
  {
    icon: '🎯',
    title: language.value === 'es' ? 'Drills realizados' : 'Drills performed',
    value: `${drillsDone.value} / ${drills.value.length}`,
    done: drillsDone.value > 0,
  },
  {
    icon: '📋',
    title: language.value === 'es' ? 'Evaluaciones' : 'Evaluations',
    value: String(evaluationCount.value),
    done: evaluationCount.value > 0,
  },
  {
    icon: '✅',
    title: language.value === 'es' ? 'Clases asistidas' : 'Classes attended',
    value: String(classesAttended.value),
    done: classesAttended.value > 0,
  },
])

function skillName(skill: Skill) {
  return language.value === 'es' ? skill.name_es || skill.name : skill.name
}

async function loadData() {
  loading.value = true
  try {
    const libraryRes = await client.from('skills_library').select('*').eq('is_active', true)
    const library = (libraryRes.data || []) as Skill[]
    skills.value = library.filter(isSkaterTrick)
    drills.value = library.filter(isCoachDrill)

    if (!props.studentId) {
      progress.value = []
      skillFocus.value = []
      evaluationCount.value = 0
      classesAttended.value = 0
      profileBits.value = null
      assignedSkillGroup.value = null
      groupAveragePct.value = 0
      return
    }

    const [progressRes, evalRes, attendanceRes, focusRes, profileRes] = await Promise.all([
      client.from('student_progress').select('*').eq('student_id', props.studentId),
      client
        .from('student_evaluations')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', props.studentId),
      client
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', props.studentId)
        .eq('attended', true),
      client
        .from('student_skill_focus')
        .select('id, skill_id, coach_note, status, completed_at, skill:skills_library(*)')
        .eq('student_id', props.studentId)
        .in('status', ['assigned', 'pending', 'review', 'done', 'requested'])
        .order('created_at', { ascending: false }),
      client
        .from('profiles')
        .select('email, skill_group_id, stance, skating_style, push_style, rating_fundamentals, rating_skate_iq, rating_street, rating_vert, rating_speed_ollie, rating_fakie_switch, rating_slps, rating_rails')
        .eq('id', props.studentId)
        .maybeSingle(),
    ])
    progress.value = progressRes.data || []
    profileBits.value = (profileRes.data as SkaterProfileBits | null) || null
    assignedSkillGroup.value = null
    groupAveragePct.value = 0
    const groupId = profileBits.value?.skill_group_id
    if (groupId) {
      const { data: grp } = await client.from('skill_groups').select('id,name').eq('id', groupId).maybeSingle()
      if (grp) assignedSkillGroup.value = grp as { id: string; name: string }
      const { data: avg } = await client.rpc('skater_skill_group_average_pct', { p_student_id: props.studentId })
      const avgNum = typeof avg === 'number' ? avg : Number(avg)
      if (Number.isFinite(avgNum)) groupAveragePct.value = avgNum
    }
    skillFocus.value = (focusRes.data || []) as FocusRow[]
    const { count } = await client
      .from('trick_evidence_videos')
      .select('id', { count: 'exact', head: true })
      .eq('student_id', props.studentId)
    videoCount.value = count || 0
    evaluationCount.value = evalRes.count || 0
    classesAttended.value = attendanceRes.count || 0
  } finally {
    loading.value = false
  }
}

async function setFocusStatus(row: FocusRow, status: 'assigned' | 'pending' | 'review') {
  if (!user.value || !props.studentId || updatingFocusId.value || row.status === status || row.status === 'done') return
  updatingFocusId.value = row.id
  focusError.value = null
  const previous = row.status
  row.status = status
  try {
    const { error } = await client
      .from('student_skill_focus')
      .update({ status, completed_at: null })
      .eq('id', row.id)
    if (error) throw error
  } catch (e: unknown) {
    row.status = previous
    const message = e instanceof Error ? e.message : ''
    focusError.value = message || (language.value === 'es' ? 'No se pudo actualizar' : 'Could not update')
  } finally {
    updatingFocusId.value = null
  }
}

async function uploadEvidence(row: FocusRow, event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !user.value || !props.studentId) return
  uploadingFocusId.value = row.id
  focusError.value = null
  try {
    const safe = file.name.replace(/[^\w.\-]+/g, '_')
    const path = `trick-evidence/${user.value.id}/${row.id}/${Date.now()}-${safe}`
    const { error: uploadError } = await client.storage.from('images').upload(path, file, {
      contentType: file.type || 'video/mp4',
      upsert: false,
    })
    if (uploadError) throw uploadError
    const { error } = await client.from('trick_evidence_videos').insert({
      focus_id: row.id,
      student_id: props.studentId,
      uploaded_by: user.value.id,
      storage_path: path,
    })
    if (error) throw error
    videoCount.value += 1
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : ''
    focusError.value = message || (language.value === 'es' ? 'No se pudo subir el video' : 'Could not upload the video')
  } finally {
    uploadingFocusId.value = null
  }
}

const trickFocus = computed(() => skillFocus.value.filter(row => isSkaterTrick(row.skill)))
const drillFocus = computed(() => skillFocus.value.filter(row => isCoachDrill(row.skill)))
const activeBag = computed(() => (progressModule.value === 'drills' ? drillFocus.value : trickFocus.value))
const openBag = computed(() => activeBag.value.filter(row => row.status !== 'done'))

const catalogQuery = ref('')
const catalogDifficulty = ref('')
const catalogArea = ref('')
const requestingSkillId = ref<string | null>(null)

const difficultyOptions = [
  { value: 'beginner', es: 'Principiante', en: 'Beginner' },
  { value: 'intermediate', es: 'Intermedio', en: 'Intermediate' },
  { value: 'advanced', es: 'Avanzado', en: 'Advanced' },
]

const completedBag = computed(() => {
  const pool = progressModule.value === 'drills' ? drills.value : trickLibrary.value
  const byId = new Map(pool.map(skill => [skill.id, skill]))
  const rows: { id: string; skill: Skill; at: string | null; note: string | null }[] = []
  const seen = new Set<string>()
  for (const item of progress.value) {
    const skill = byId.get(item.skill_id)
    if (!skill || seen.has(skill.id)) continue
    seen.add(skill.id)
    rows.push({ id: item.id, skill, at: item.learned_at, note: item.notes || null })
  }
  for (const row of activeBag.value) {
    if (row.status !== 'done' || !row.skill || seen.has(row.skill.id)) continue
    seen.add(row.skill.id)
    rows.push({ id: row.id, skill: row.skill, at: row.completed_at || null, note: row.coach_note })
  }
  return rows.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime())
})

const catalogHits = computed(() => {
  const q = catalogQuery.value.trim().toLowerCase()
  const taken = new Set<string>()
  for (const row of skillFocus.value) {
    if (row.status && row.status !== 'dismissed') taken.add(row.skill_id)
  }
  for (const item of progress.value) taken.add(item.skill_id)
  const pool = progressModule.value === 'drills' ? drills.value : trickLibrary.value
  return pool
    .filter(skill => {
      if (taken.has(skill.id)) return false
      if (catalogDifficulty.value && skill.difficulty !== catalogDifficulty.value) return false
      if (catalogArea.value && skill.area !== catalogArea.value) return false
      if (!q) return true
      const name = `${skill.name} ${skill.name_es || ''}`.toLowerCase()
      return name.includes(q)
    })
    .sort(compareSkillsByManualId)
})

function skillDetail(skill: Skill) {
  const level = language.value === 'es' ? skill.structure : skill.structure
  const bits = [skill.area, level, skill.difficulty].filter(Boolean)
  return bits.join(' · ')
}

function formatUnlockDate(value: string | null) {
  if (!value) return language.value === 'es' ? 'Sin fecha' : 'No date'
  return new Date(value).toLocaleDateString(language.value === 'es' ? 'es-MX' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

async function requestSkill(skill: Skill) {
  if (!user.value || !props.studentId || requestingSkillId.value) return
  requestingSkillId.value = skill.id
  focusError.value = null
  try {
    const { data, error } = await client
      .from('student_skill_focus')
      .insert({
        student_id: props.studentId,
        skill_id: skill.id,
        assigned_by: user.value.id,
        status: 'requested',
      })
      .select('id, skill_id, coach_note, status, completed_at')
      .single()
    if (error) throw error
    if (data) {
      skillFocus.value.unshift({ ...(data as FocusRow), skill })
      catalogQuery.value = ''
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : ''
    const duplicate = message.includes('duplicate') || message.includes('23505')
    focusError.value = duplicate
      ? (language.value === 'es' ? 'Ese ya está en tu lista.' : 'That one is already on your list.')
      : message || (language.value === 'es' ? 'No se pudo asignar' : 'Could not assign')
  } finally {
    requestingSkillId.value = null
  }
}

watch(() => props.studentId, loadData, { immediate: true })
</script>

<template>
  <section class="space-y-4">
    <div class="flex items-stretch gap-3">
      <div class="flex-1 min-w-0 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 rounded-xl px-4 py-3 shadow-lg">
        <div class="flex items-center gap-2 min-w-0">
          <h2 class="text-lg font-black text-white uppercase tracking-tight truncate min-w-0">
            {{ participant.displayName }}
          </h2>
          <span
            v-if="participant.isYou"
            class="shrink-0 px-2 py-0.5 bg-black/25 text-white text-[10px] font-bold rounded uppercase"
          >
            {{ language === 'es' ? 'Tú' : 'You' }}
          </span>
        </div>
        <div v-if="profileEmail" class="mt-0.5 flex items-center gap-2 min-w-0">
          <p class="text-sm text-white/90 truncate">{{ profileEmail }}</p>
          <button
            type="button"
            class="shrink-0 rounded-full bg-black/25 px-2.5 py-0.5 text-[11px] font-bold text-white"
            @click="copyProfileEmail"
          >
            {{ emailCopied ? (language === 'es' ? 'Copiado' : 'Copied') : (language === 'es' ? 'Copiar' : 'Copy') }}
          </button>
        </div>
        <p v-if="participant.age != null" class="text-sm text-white/80 mt-0.5">
          {{ language === 'es' ? `${participant.age} años` : `${participant.age} years old` }}
        </p>
        <p v-if="studentId" class="text-sm text-white/90 mt-1">
          {{ language === 'es' ? 'Videos subidos' : 'Videos uploaded' }}: {{ videoCount }}
        </p>
        <p v-if="studentId" class="text-sm mt-1.5 flex items-center gap-1.5 flex-wrap">
          <span class="text-white/75 shrink-0">
            {{ language === 'es' ? 'Programa asignado:' : 'Assigned program:' }}
          </span>
          <span v-if="assignedProgramLabel" class="font-semibold text-white truncate">
            {{ assignedProgramLabel }}
          </span>
          <span v-else class="text-white/70 italic">
            {{ language === 'es' ? 'Sin programa asignado' : 'No program assigned' }}
          </span>
        </p>
        <p v-if="!studentId" class="text-sm text-white/80 mt-2">
          {{
            language === 'es'
              ? 'El coach registrará el progreso cuando asista a clases.'
              : 'Coach will log progress when they attend classes.'
          }}
        </p>
      </div>

      <div class="shrink-0 flex flex-col items-center justify-center">
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onAvatarFileChange"
        />
        <button
          type="button"
          class="relative w-32 h-32 rounded-xl overflow-hidden bg-gray-900 border-2 border-dashed border-white/30 flex items-center justify-center text-4xl transition-transform active:scale-[0.97] disabled:opacity-70"
          :disabled="uploadingAvatar || !canEditAvatar"
          :aria-label="language === 'es' ? 'Cambiar foto' : 'Change photo'"
          @click="openAvatarPicker"
        >
          <img
            v-if="avatarUrl"
            :src="avatarUrl"
            alt=""
            class="w-full h-full object-cover"
          />
          <span v-else class="text-white font-black">
            {{ participant.displayName.charAt(0)?.toUpperCase() || '🛹' }}
          </span>
          <div
            v-if="uploadingAvatar"
            class="absolute inset-0 bg-black/55 flex items-center justify-center"
          >
            <svg class="w-6 h-6 animate-spin text-gold-300" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
          <span
            v-else-if="canEditAvatar"
            class="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/70 text-xs flex items-center justify-center"
          >
            📷
          </span>
        </button>
        <button
          v-if="avatarUrl && canEditAvatar"
          type="button"
          class="text-[10px] text-red-300/90 hover:text-red-200 mt-1 underline"
          :disabled="uploadingAvatar"
          @click="removeAvatar"
        >
          {{ language === 'es' ? 'Quitar' : 'Remove' }}
        </button>
      </div>
    </div>

    <div v-if="studentId" class="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div class="flex flex-col md:flex-row md:items-stretch gap-4 md:gap-0">
        <div class="md:w-1/2 md:min-w-0 md:border-r border-gray-800 md:pr-5 pb-4 md:pb-0 border-b md:border-b-0">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-base" aria-hidden="true">📈</span>
            <h3 class="text-xs font-bold text-white uppercase tracking-wide leading-tight">
              {{ language === 'es' ? 'Progreso en programa asignado' : 'Assigned program progress' }}
            </h3>
          </div>
          <template v-if="assignedSkillGroup">
            <p class="text-[10px] text-gray-500 mb-3 leading-snug">
              <span class="text-gray-300">{{ assignedProgramLabel }}</span>
              ·
              {{
                language === 'es'
                  ? `${tricksLearned} trucos · ${drillsDone} drills`
                  : `${tricksLearned} tricks · ${drillsDone} drills`
              }}
            </p>
            <div class="space-y-3">
              <div class="space-y-1">
                <div class="flex justify-between items-baseline gap-2">
                  <span class="text-[10px] text-gray-500">{{ language === 'es' ? 'Trucos completados' : 'Completed tricks' }}</span>
                  <span class="text-sm font-bold text-gray-200">
                    {{ tricksLearned }}/{{ trickLibrary.length }} · {{ libraryTrickPct }}%
                  </span>
                </div>
                <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div class="h-full rounded-full bg-gray-200 transition-all" :style="{ width: `${libraryTrickPct}%` }" />
                </div>
              </div>
              <div class="space-y-1">
                <div class="flex justify-between items-baseline gap-2">
                  <span class="text-[10px] text-gray-500">{{ language === 'es' ? 'Drills realizados' : 'Completed drills' }}</span>
                  <span class="text-sm font-bold text-cyan-300">
                    {{ drillsDone }}/{{ drills.length }} · {{ libraryDrillPct }}%
                  </span>
                </div>
                <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div class="h-full rounded-full bg-cyan-500 transition-all" :style="{ width: `${libraryDrillPct}%` }" />
                </div>
              </div>
              <div class="space-y-1">
                <div class="flex justify-between items-baseline gap-2">
                  <span class="text-[10px] text-gray-500">{{ language === 'es' ? 'Promedio del grupo' : 'Group avg.' }}</span>
                  <span class="text-sm font-bold text-indigo-300">{{ groupAveragePct }}%</span>
                </div>
                <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div class="h-full bg-indigo-500/90 rounded-full transition-all" :style="{ width: `${groupAveragePct}%` }" />
                </div>
              </div>
            </div>
            <p class="text-[9px] text-gray-600 mt-3 leading-snug">
              {{
                language === 'es'
                  ? 'Cuenta cada truco y drill marcado como completado.'
                  : 'Counts every trick and drill marked completed.'
              }}
            </p>
          </template>
          <p v-else class="text-[11px] text-gray-500 leading-snug">
            {{
              language === 'es'
                ? 'Sin programa asignado todavía.'
                : 'No program assigned yet.'
            }}
          </p>
        </div>

        <div class="md:w-1/2 md:min-w-0 md:pl-5">
          <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
            {{ language === 'es' ? 'Habilidades' : 'Skill attributes' }}
          </h2>
          <div class="space-y-1.5">
            <div
              v-for="attr in skillAttributeDots"
              :key="attr.key"
              class="flex items-center justify-between gap-2"
            >
              <span class="text-white text-xs font-medium w-[5rem] shrink-0 truncate">
                {{ language === 'es' ? attr.labelEs : attr.label }}
              </span>
              <div class="flex gap-0.5 flex-1 justify-end">
                <span
                  v-for="i in 10"
                  :key="i"
                  class="w-2.5 h-2.5 rounded-full shrink-0"
                  :class="skaterRatingBubbleClass(i - 1, attr.filled)"
                />
              </div>
            </div>
          </div>
          <div class="mt-3 pt-3 border-t border-gray-800">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <SkaterTraitPickerGroup
                :label="language === 'es' ? 'Postura' : 'Stance'"
                :options="SKATER_STANCE_OPTIONS"
                :model-value="profileBits?.stance"
                :editable="false"
                :es="language === 'es'"
              />
              <SkaterTraitPickerGroup
                :label="language === 'es' ? 'Estilo' : 'Style'"
                :options="SKATER_STYLE_OPTIONS"
                :model-value="profileBits?.skating_style"
                :editable="false"
                :es="language === 'es'"
              />
              <SkaterTraitPickerGroup
                :label="language === 'es' ? 'Empuje' : 'Push'"
                :options="SKATER_PUSH_OPTIONS"
                :model-value="profileBits?.push_style"
                :editable="false"
                :es="language === 'es'"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Achievements -->
    <div>
      <h2 class="text-sm font-bold text-gold-400 uppercase tracking-wide mb-3">
        {{ language === 'es' ? 'Logros' : 'Achievements' }}
      </h2>

      <div v-if="loading" class="flex justify-center py-8">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>

      <template v-else>
        <div class="grid grid-cols-4 gap-2">
          <div
            v-for="m in milestones"
            :key="m.title"
            class="min-w-0 rounded-xl border px-2 py-2"
            :class="m.done ? 'border-gold-400/40 bg-gold-400/10' : 'border-gray-800 bg-gray-900/50'"
          >
            <div class="flex items-center gap-1">
              <span class="text-sm leading-none">{{ m.icon }}</span>
              <p class="text-[10px] text-gray-400 leading-tight">{{ m.title }}</p>
            </div>
            <p class="text-sm font-bold text-white mt-1 truncate">{{ m.value }}</p>
          </div>
        </div>

        <div v-if="studentId" class="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4">
          <div class="flex items-center justify-between gap-2 mb-1">
            <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              {{ language === 'es' ? 'Progreso del currículo' : 'Curriculum progress' }}
            </h3>
            <span class="text-lg font-bold text-amber-400">{{ programMilestoneProgress.totalPct }}%</span>
          </div>
          <p v-if="assignedProgramLabel" class="text-xs text-gray-400 mb-1">
            {{ language === 'es' ? 'Programa asignado:' : 'Assigned program:' }}
            <span class="text-gray-200 font-medium">{{ assignedProgramLabel }}</span>
          </p>
          <p class="text-xs text-gray-500 mb-5">
            {{
              language === 'es'
                ? `Avance por trucos completados · fase ${programMilestoneProgress.activeLevelNum} de 5`
                : `Based on completed tricks · phase ${programMilestoneProgress.activeLevelNum} of 5`
            }}
            <span class="block mt-0.5 text-gray-600">
              {{
                language === 'es'
                  ? 'El programa asignado no implica que ya completó ese nivel.'
                  : 'Assigned program does not mean that level is already completed.'
              }}
            </span>
          </p>
          <div class="relative px-1 pb-1 overflow-x-auto">
            <div class="absolute left-[10%] right-[10%] top-[17px] h-0.5 bg-gray-700/80 rounded-full" aria-hidden="true" />
            <div
              class="absolute left-[10%] top-[17px] h-0.5 bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500 rounded-full transition-all duration-700 ease-out"
              :style="{ width: programTimelineFillWidth }"
              aria-hidden="true"
            />
            <ol class="relative flex justify-between items-start min-w-[280px] list-none m-0 p-0">
              <li
                v-for="m in programMilestoneProgress.milestones"
                :key="m.structure"
                class="flex flex-col items-center flex-1 min-w-0 z-10"
                :title="(language === 'es' ? m.labelEs : m.labelEn) + ' — ' + (language === 'es' ? m.descriptionEs : m.descriptionEn)"
              >
                <div
                  class="w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all duration-300"
                  :class="milestoneNodeClass(m.phase)"
                >
                  <svg
                    v-if="m.phase === 'complete'"
                    class="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                  <span v-else>{{ m.levelNum }}</span>
                </div>
                <p class="text-[10px] font-semibold text-gray-300 mt-2 text-center leading-tight px-0.5 max-w-[5rem]">
                  {{ language === 'es' ? m.shortLabelEs : m.shortLabelEn }}
                </p>
                <p class="text-[10px] tabular-nums mt-0.5 font-medium" :class="milestoneCountClass(m.phase, m.learned)">
                  {{ m.total ? `${m.learned}/${m.total}` : '—' }}
                </p>
                <p
                  class="text-[9px] uppercase tracking-wide mt-0.5"
                  :class="
                    m.phase === 'complete'
                      ? 'text-emerald-500/80'
                      : m.phase === 'active'
                        ? 'text-amber-500/70'
                        : m.learned > 0
                          ? 'text-gray-500'
                          : 'text-gray-600'
                  "
                >
                  {{ milestoneStatusLabel(m.phase, m.learned) }}
                </p>
              </li>
            </ol>
          </div>
          <p class="text-[11px] text-gray-500 mt-4 text-center">
            {{
              language === 'es'
                ? 'Solo cuenta trucos y drills marcados como completados. Orden: Fundamentos → … → Avanzado.'
                : 'Only marked completed tricks and drills count. Order: Foundations → … → Advanced.'
            }}
          </p>
        </div>

        <div v-if="studentId" class="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            class="min-w-0 rounded-xl border bg-gray-900 p-3 text-left"
            :class="progressModule === 'tricks' ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-gray-800'"
            @click="progressModule = 'tricks'"
          >
            <p class="text-[11px] text-gray-400 leading-tight">{{ language === 'es' ? 'Trucos aprendidos' : 'Tricks learned' }}</p>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
              <div
                class="h-full rounded-full bg-amber-500/80"
                :style="{ width: `${trickLibrary.length ? Math.min(100, (tricksLearned / trickLibrary.length) * 100) : 0}%` }"
              />
            </div>
            <p class="mt-1 text-right text-sm font-bold text-white">{{ tricksLearned }}/{{ trickLibrary.length }}</p>
          </button>
          <button
            type="button"
            class="min-w-0 rounded-xl border bg-gray-900 p-3 text-left"
            :class="progressModule === 'drills' ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-gray-800'"
            @click="progressModule = 'drills'"
          >
            <p class="text-[11px] text-gray-400 leading-tight">{{ language === 'es' ? 'Drills completados' : 'Drills completed' }}</p>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
              <div
                class="h-full rounded-full bg-amber-500/80"
                :style="{ width: `${drills.length ? Math.min(100, (drillsDone / drills.length) * 100) : 0}%` }"
              />
            </div>
            <p class="mt-1 text-right text-sm font-bold text-white">{{ drillsDone }}/{{ drills.length }}</p>
          </button>
          <button
            type="button"
            class="min-w-0 rounded-xl border bg-gray-900 p-3 text-left"
            :class="progressModule === 'challenges' ? 'border-amber-400 ring-2 ring-amber-400/40' : 'border-gray-800'"
            @click="progressModule = 'challenges'"
          >
            <p class="text-[11px] text-gray-400 leading-tight">{{ language === 'es' ? 'Desafíos completados' : 'Challenges completed' }}</p>
            <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
              <div
                class="h-full rounded-full bg-amber-500/80"
                :style="{ width: `${challengeCounts.total ? Math.min(100, (challengeCounts.completed / challengeCounts.total) * 100) : 0}%` }"
              />
            </div>
            <p class="mt-1 text-right text-sm font-bold text-white">{{ challengeCounts.completed }}/{{ challengeCounts.total }}</p>
          </button>
        </div>

        <MemberSkaterChallengesCard
          v-if="studentId"
          v-show="progressModule === 'challenges'"
          class="mt-4"
          :student-id="studentId"
          :can-complete="participant.type === 'self' || participant.isYou"
          table-only
          @counts="challengeCounts = $event"
        />

        <section v-if="studentId && progressModule !== 'challenges'" class="mt-6 space-y-3">
          <h2 class="text-sm font-bold text-gold-400 uppercase tracking-wide">
            {{
              progressModule === 'drills'
                ? (language === 'es' ? 'Bolsa de drills' : 'Drill bag')
                : (language === 'es' ? 'Bolsa de trucos' : 'Trick bag')
            }}
          </h2>
          <p class="text-xs text-gray-500 -mt-1">
            {{
              language === 'es'
                ? 'Asignado es el inicio. Puedes pasarlo a en progreso o enviarlo al coach. El coach lo marca completado cuando te ve hacerlo. Un video cuenta en tu perfil.'
                : 'Assigned is the start. Move it to in progress or send it to your coach. The coach marks it completed after seeing it. A video counts on your profile.'
            }}
          </p>
          <p class="text-[11px] text-gray-400">
            {{ language === 'es' ? 'Videos subidos' : 'Videos uploaded' }}: {{ videoCount }}
          </p>
          <p v-if="focusError" class="text-xs text-red-400">{{ focusError }}</p>
          <div class="grid grid-cols-2 gap-3">
            <div class="min-w-0 space-y-2">
              <h3 class="text-xs font-bold text-gray-400 uppercase">
                {{ language === 'es' ? 'Asignados y en progreso' : 'Assigned and in progress' }}
                <span class="text-gray-600 font-normal">({{ openBag.length }})</span>
              </h3>
              <ul v-if="openBag.length" class="space-y-2">
                <li
                  v-for="f in openBag"
                  :key="f.id"
                  class="rounded-xl bg-gray-900 border border-amber-500/30 px-4 py-3 space-y-2"
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="min-w-0">
                      <p class="text-white font-medium text-sm truncate">{{ f.skill ? skillName(f.skill) : '—' }}</p>
                      <p v-if="f.skill" class="text-[10px] text-gray-500 truncate">{{ skillDetail(f.skill) }}</p>
                    </div>
                    <span
                      v-if="f.status"
                      class="text-xs px-2 py-0.5 rounded shrink-0"
                      :class="f.status === 'pending' ? 'bg-amber-500/20 text-amber-300' : f.status === 'review' ? 'bg-gold-400/20 text-gold-200' : f.status === 'requested' ? 'bg-violet-500/20 text-violet-200' : 'bg-sky-500/20 text-sky-300'"
                    >
                      {{ trickBagStatusLabel(f.status, language === 'es') }}
                    </span>
                  </div>
                  <p v-if="f.coach_note" class="text-gray-400 text-xs">{{ f.coach_note }}</p>
                  <p v-if="f.status === 'requested'" class="text-[11px] text-violet-200">
                    {{
                      language === 'es'
                        ? 'Tu coach tiene que confirmarlo antes de que puedas practicarlo.'
                        : 'Your coach has to confirm this before you can practice it.'
                    }}
                  </p>
                  <div v-if="f.status && f.status !== 'requested'" class="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  class="min-h-[44px] rounded-xl border text-[11px] font-bold disabled:opacity-50"
                  :class="
                    (f.status || 'assigned') === 'assigned'
                      ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                      : 'border-gray-700 text-gray-300'
                  "
                  :disabled="updatingFocusId === f.id"
                  @click="setFocusStatus(f, 'assigned')"
                >
                  {{ language === 'es' ? 'Asignado' : 'Assigned' }}
                </button>
                <button
                  type="button"
                  class="min-h-[44px] rounded-xl border text-[11px] font-bold disabled:opacity-50"
                  :class="
                    f.status === 'pending'
                      ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                      : 'border-gray-700 text-gray-300'
                  "
                  :disabled="updatingFocusId === f.id"
                  @click="setFocusStatus(f, 'pending')"
                >
                  {{ language === 'es' ? 'En progreso' : 'In progress' }}
                </button>
                <button
                  type="button"
                  class="min-h-[44px] rounded-xl border text-[11px] font-black disabled:opacity-50"
                  :class="
                    f.status === 'review'
                      ? 'border-gold-400 bg-gold-400 text-black'
                      : 'border-emerald-500 bg-emerald-500 text-black'
                  "
                  :disabled="updatingFocusId === f.id"
                  @click="setFocusStatus(f, 'review')"
                >
                  {{ f.status === 'review'
                    ? (language === 'es' ? 'En revisión' : 'In review')
                    : (language === 'es' ? 'Enviar al coach' : 'Send to coach') }}
                </button>
              </div>
              <p v-if="f.status === 'review'" class="text-[11px] text-gold-300">
                {{
                  progressModule === 'drills'
                    ? (language === 'es'
                      ? 'El coach lo confirma cuando te vea hacer el drill.'
                      : 'Your coach confirms it when they see you do the drill.')
                    : (language === 'es'
                      ? 'El coach lo confirma cuando te vea hacer el truco.'
                      : 'Your coach confirms it when they see you land the trick.')
                }}
              </p>
              <label
                v-if="f.status !== 'done' && f.status !== 'requested'"
                class="inline-flex items-center gap-2 text-[11px] font-bold text-gray-300 cursor-pointer"
              >
                <input
                  type="file"
                  accept="video/*"
                  class="hidden"
                  :disabled="uploadingFocusId === f.id"
                  @change="uploadEvidence(f, $event)"
                />
                <span class="rounded-lg border border-gray-600 px-2 py-1">
                  {{ uploadingFocusId === f.id
                    ? (language === 'es' ? 'Subiendo…' : 'Uploading…')
                    : (language === 'es' ? 'Subir video' : 'Upload video') }}
                </span>
              </label>
                </li>
              </ul>
              <p v-else class="text-sm text-gray-500 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                {{
                  progressModule === 'drills'
                    ? (language === 'es' ? 'Nada asignado todavía.' : 'Nothing assigned yet.')
                    : (language === 'es' ? 'Nada asignado todavía.' : 'Nothing assigned yet.')
                }}
              </p>
            </div>

            <div class="min-w-0 space-y-2">
              <h3 class="text-xs font-bold text-emerald-400 uppercase">
                {{ language === 'es' ? 'Completados' : 'Completed' }}
                <span class="text-gray-600 font-normal">({{ completedBag.length }})</span>
              </h3>
              <ul v-if="completedBag.length" class="space-y-2">
                <li
                  v-for="item in completedBag"
                  :key="item.id"
                  class="rounded-xl bg-gray-900 border border-emerald-500/30 px-4 py-3 space-y-1"
                >
                  <div class="flex items-start justify-between gap-2">
                    <p class="text-white font-medium text-sm">{{ skillName(item.skill) }}</p>
                    <span class="text-[10px] text-emerald-300 shrink-0">{{ formatUnlockDate(item.at) }}</span>
                  </div>
                  <p class="text-[10px] text-gray-500">{{ skillDetail(item.skill) }}</p>
                  <p v-if="item.skill.description || item.skill.description_es" class="text-xs text-gray-400 leading-snug">
                    {{ language === 'es' ? item.skill.description_es || item.skill.description : item.skill.description }}
                  </p>
                  <p v-if="item.note" class="text-[11px] text-gray-500">{{ item.note }}</p>
                </li>
              </ul>
              <p v-else class="text-sm text-gray-500 rounded-xl border border-gray-800 bg-gray-900/50 p-4">
                {{
                  progressModule === 'drills'
                    ? (language === 'es' ? 'Aún no hay drills completados.' : 'No completed drills yet.')
                    : (language === 'es' ? 'Aún no hay trucos completados.' : 'No completed tricks yet.')
                }}
              </p>
            </div>
          </div>

          <div class="pt-2 space-y-2">
            <h3 class="text-xs font-bold text-gray-400 uppercase">
              {{
                progressModule === 'drills'
                  ? (language === 'es' ? 'Asignar un drill' : 'Assign a drill')
                  : (language === 'es' ? 'Asignar un truco' : 'Assign a trick')
              }}
            </h3>
            <p class="text-[11px] text-gray-500">
              {{
                language === 'es'
                  ? 'Elige uno de la lista. Queda por confirmar: solo tu coach puede aceptarlo según tu nivel.'
                  : 'Pick one from the list. It stays awaiting confirmation: only your coach can allow it for your level.'
              }}
            </p>
            <div class="flex flex-col sm:flex-row gap-2">
              <input
                v-model="catalogQuery"
                type="search"
                class="h-8 flex-1 min-w-0 rounded-lg bg-gray-900 border border-gray-700 px-3 text-xs text-white placeholder:text-gray-500"
                :placeholder="progressModule === 'drills'
                  ? (language === 'es' ? 'Buscar drill…' : 'Search drills…')
                  : (language === 'es' ? 'Buscar truco…' : 'Search tricks…')"
              />
              <select v-model="catalogDifficulty" class="h-8 sm:w-36 rounded-lg bg-gray-900 border border-gray-700 px-2 text-xs text-white">
                <option value="">{{ language === 'es' ? 'Dificultad' : 'Difficulty' }}</option>
                <option v-for="opt in difficultyOptions" :key="opt.value" :value="opt.value">
                  {{ language === 'es' ? opt.es : opt.en }}
                </option>
              </select>
              <select v-model="catalogArea" class="h-8 sm:w-36 rounded-lg bg-gray-900 border border-gray-700 px-2 text-xs text-white">
                <option value="">{{ language === 'es' ? 'Área' : 'Area' }}</option>
                <option v-for="area in SKATE_TRICK_AREAS" :key="area" :value="area">{{ area }}</option>
              </select>
            </div>
            <ul v-if="catalogHits.length" class="max-h-80 overflow-y-auto space-y-1.5 pr-1">
              <li
                v-for="skill in catalogHits"
                :key="skill.id"
                class="flex items-center justify-between gap-2 rounded-lg border border-gray-800 bg-gray-900 px-3 py-2"
              >
                <div class="min-w-0">
                  <p class="text-sm text-white truncate">{{ skillName(skill) }}</p>
                  <p class="text-[10px] text-gray-500 truncate">{{ skillDetail(skill) }}</p>
                </div>
                <button
                  type="button"
                  class="shrink-0 rounded-lg bg-violet-500 px-2.5 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                  :disabled="requestingSkillId === skill.id"
                  @click="requestSkill(skill)"
                >
                  {{ language === 'es' ? 'Asignar' : 'Assign' }}
                </button>
              </li>
            </ul>
            <p v-else class="text-xs text-gray-500">
              {{ language === 'es' ? 'Nada disponible con esos filtros.' : 'Nothing available with those filters.' }}
            </p>
          </div>
        </section>

        <p
          v-if="studentId && !progress.length"
          class="text-center text-gray-500 text-sm py-4"
        >
          {{
            language === 'es'
              ? 'Aún no hay trucos registrados. ¡Sigue entrenando!'
              : 'No tricks logged yet. Keep skating!'
          }}
        </p>
      </template>
    </div>
  </section>
</template>
