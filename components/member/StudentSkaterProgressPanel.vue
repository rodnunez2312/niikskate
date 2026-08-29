<script setup lang="ts">
import type { Skill, StudentProgress, SkillCategory } from '~/types'
import { SKILL_CATEGORY_LABELS } from '~/types'
import type { CrewParticipant } from '~/composables/useCrew'
import { skaterRatingBubbleClass } from '~/utils/skaterRatingDots'

const props = defineProps<{
  participant: CrewParticipant
  /** profiles.id when progress exists in DB; null for crew-only skaters */
  studentId: string | null
}>()

const client = useSupabaseClient()
const { language } = useI18n()

const avatarUrl = ref<string | null>(props.participant.avatarUrl)

watch(
  () => props.participant.avatarUrl,
  url => {
    avatarUrl.value = url
  },
)

const avatarTarget = computed(() =>
  props.participant.type === 'self'
    ? ({ kind: 'self' as const })
    : ({ kind: 'crew' as const, crewMemberId: props.participant.crewMemberId! }),
)

const {
  uploadingAvatar,
  fileInputRef,
  onAvatarFileChange,
  openAvatarPicker,
  removeAvatar,
} = useParticipantAvatarUpload(avatarTarget, avatarUrl)

const loading = ref(true)
const skills = ref<Skill[]>([])
const progress = ref<StudentProgress[]>([])
const evaluationCount = ref(0)
const classesAttended = ref(0)

const statCategories = [
  { key: 'fundamentals', name: 'Balance', name_es: 'Balance' },
  { key: 'street', name: 'Street', name_es: 'Street' },
  { key: 'bowl', name: 'Bowl/Ramp', name_es: 'Bowl/Rampa' },
  { key: 'surf_skate', name: 'Flow', name_es: 'Flow' },
  { key: 'safety', name: 'Falls', name_es: 'Caídas' },
]

const getCategoryDots = (categoryKey: string) => {
  const categorySkills = skills.value.filter(s => s.category === categoryKey)
  const learnedInCategory = categorySkills.filter(s =>
    progress.value.some(p => p.skill_id === s.id),
  )
  if (categorySkills.length === 0) return 0
  return Math.round((learnedInCategory.length / categorySkills.length) * 10)
}

const stats = computed(() => {
  const total = skills.value.length
  const learned = progress.value.length
  const percentage = total > 0 ? Math.round((learned / total) * 100) : 0
  return { total, learned, percentage }
})

const recentUnlocks = computed(() =>
  [...progress.value]
    .sort((a, b) => new Date(b.learned_at || 0).getTime() - new Date(a.learned_at || 0).getTime())
    .slice(0, 5)
    .map(p => {
      const skill = skills.value.find(s => s.id === p.skill_id)
      return { ...p, skill }
    })
    .filter(r => r.skill),
)

const categoryBadges = computed(() => {
  const map: Record<string, { learned: number; total: number }> = {}
  for (const skill of skills.value) {
    if (!map[skill.category]) map[skill.category] = { learned: 0, total: 0 }
    map[skill.category].total++
    if (progress.value.some(p => p.skill_id === skill.id)) map[skill.category].learned++
  }
  return Object.entries(map)
    .filter(([, v]) => v.total > 0)
    .map(([key, v]) => {
      const labels = SKILL_CATEGORY_LABELS[key as SkillCategory]
      return {
        key,
        label: language.value === 'es' ? labels?.name_es || key : labels?.name || key,
        pct: Math.round((v.learned / v.total) * 100),
        learned: v.learned,
        total: v.total,
      }
    })
    .sort((a, b) => b.pct - a.pct)
})

const milestones = computed(() => [
  {
    icon: '🛹',
    title: language.value === 'es' ? 'Trucos aprendidos' : 'Tricks learned',
    value: `${progress.value.length} / ${skills.value.length}`,
    done: progress.value.length > 0,
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
  {
    icon: '🏆',
    title: language.value === 'es' ? 'Progreso general' : 'Overall progress',
    value: skills.value.length ? `${stats.value.percentage}%` : '0%',
    done: progress.value.length >= 5,
  },
])

function skillName(skill: Skill) {
  return language.value === 'es' ? skill.name_es || skill.name : skill.name
}

async function loadData() {
  loading.value = true
  try {
    const skillsRes = await client.from('skills_library').select('*').eq('is_active', true)
    skills.value = skillsRes.data || []

    if (!props.studentId) {
      progress.value = []
      evaluationCount.value = 0
      classesAttended.value = 0
      return
    }

    const [progressRes, evalRes, attendanceRes] = await Promise.all([
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
    ])
    progress.value = progressRes.data || []
    evaluationCount.value = evalRes.count || 0
    classesAttended.value = attendanceRes.count || 0
  } finally {
    loading.value = false
  }
}

watch(() => props.studentId, loadData, { immediate: true })
</script>

<template>
  <section class="space-y-4">
    <!-- Profile + stats card -->
    <div
      class="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/50 shadow-xl"
    >
      <div class="flex gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700/50">
            <span class="text-gold-400 font-black text-lg uppercase tracking-wide truncate">
              {{ participant.displayName }}
            </span>
            <span
              v-if="participant.isYou"
              class="shrink-0 px-2 py-0.5 bg-glass-blue/30 text-glass-blue text-[10px] font-bold rounded uppercase"
            >
              {{ language === 'es' ? 'Tú' : 'You' }}
            </span>
          </div>

          <div v-if="participant.age != null" class="text-xs text-gray-500 mb-2">
            {{ language === 'es' ? 'Edad' : 'Age' }}: {{ participant.age }}
          </div>

          <div v-if="studentId" class="space-y-1.5">
            <div v-for="stat in statCategories" :key="stat.key" class="flex items-center gap-2">
              <span class="text-gray-400 text-[10px] font-bold uppercase w-16 truncate text-right">
                {{ language === 'es' ? stat.name_es : stat.name }}
              </span>
              <div class="flex gap-0.5">
                <span
                  v-for="i in 10"
                  :key="i"
                  class="w-2 h-2 rounded-full"
                  :class="skaterRatingBubbleClass(i - 1, getCategoryDots(stat.key))"
                />
              </div>
            </div>
          </div>
          <p v-else class="text-sm text-gray-500">
            {{
              language === 'es'
                ? 'El coach registrará el progreso cuando asista a clases.'
                : 'Coach will log progress when they attend classes.'
            }}
          </p>
        </div>

        <div class="shrink-0 flex flex-col items-center">
          <input
            ref="fileInputRef"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onAvatarFileChange"
          />
          <button
            type="button"
            class="relative w-16 h-16 rounded-xl overflow-hidden bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-2xl ring-2 ring-gold-400/30 transition-transform active:scale-[0.97] disabled:opacity-70"
            :disabled="uploadingAvatar"
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
              v-else
              class="absolute bottom-0.5 right-0.5 w-5 h-5 rounded-full bg-black/70 text-[10px] flex items-center justify-center"
            >
              📷
            </span>
          </button>
          <button
            v-if="avatarUrl"
            type="button"
            class="text-[9px] text-red-400/90 hover:text-red-300 mt-1 underline"
            :disabled="uploadingAvatar"
            @click="removeAvatar"
          >
            {{ language === 'es' ? 'Quitar' : 'Remove' }}
          </button>
        </div>
      </div>

      <div v-if="studentId" class="mt-3 pt-3 border-t border-gray-700/50">
        <div class="flex items-center justify-between mb-2">
          <span class="text-gray-400 text-xs font-bold uppercase">
            {{ language === 'es' ? 'Progreso total' : 'Total progress' }}
          </span>
          <span class="text-gold-400 font-black">{{ stats.percentage }}%</span>
        </div>
        <div class="h-2.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 rounded-full transition-all"
            :style="{ width: `${stats.percentage}%` }"
          />
        </div>
        <p class="text-[10px] text-gray-500 mt-1 text-center">
          {{ stats.learned }} / {{ stats.total }}
          {{ language === 'es' ? 'trucos' : 'tricks' }}
        </p>
      </div>
    </div>

    <MemberSkaterChallengesCard
      v-if="studentId"
      :student-id="studentId"
      :can-complete="participant.type === 'self'"
    />

    <!-- Achievements -->
    <div>
      <h2 class="text-sm font-bold text-gold-400 uppercase tracking-wide mb-3">
        {{ language === 'es' ? 'Logros' : 'Achievements' }}
      </h2>

      <div v-if="loading" class="flex justify-center py-8">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>

      <template v-else>
        <div class="grid grid-cols-2 gap-3">
          <div
            v-for="m in milestones"
            :key="m.title"
            class="rounded-xl border p-3"
            :class="m.done ? 'border-gold-400/40 bg-gold-400/10' : 'border-gray-800 bg-gray-900/50'"
          >
            <span class="text-xl">{{ m.icon }}</span>
            <p class="text-[10px] text-gray-400 mt-1.5 leading-tight">{{ m.title }}</p>
            <p class="text-base font-bold text-white mt-0.5">{{ m.value }}</p>
          </div>
        </div>

        <div v-if="recentUnlocks.length" class="mt-4 space-y-2">
          <h3 class="text-xs font-bold text-gray-400 uppercase">
            {{ language === 'es' ? 'Desbloqueados recientes' : 'Recent unlocks' }}
          </h3>
          <ul class="space-y-2">
            <li
              v-for="item in recentUnlocks"
              :key="item.id"
              class="flex items-center justify-between rounded-xl bg-gray-900 border border-gray-800 px-3 py-2.5"
            >
              <span class="text-white font-medium text-sm truncate">{{ skillName(item.skill!) }}</span>
              <span class="text-xs text-gray-500 shrink-0 ml-2">
                {{ item.learned_at ? new Date(item.learned_at).toLocaleDateString() : '—' }}
              </span>
            </li>
          </ul>
        </div>

        <div v-if="categoryBadges.length" class="mt-4 space-y-2">
          <h3 class="text-xs font-bold text-gray-400 uppercase">
            {{ language === 'es' ? 'Por categoría' : 'By category' }}
          </h3>
          <div
            v-for="cat in categoryBadges"
            :key="cat.key"
            class="rounded-xl bg-gray-900 border border-gray-800 p-3"
          >
            <div class="flex justify-between text-sm mb-1.5">
              <span class="text-white font-medium">{{ cat.label }}</span>
              <span class="text-gray-400">{{ cat.learned }}/{{ cat.total }}</span>
            </div>
            <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div class="h-full bg-gold-400 rounded-full" :style="{ width: `${cat.pct}%` }" />
            </div>
          </div>
        </div>

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
