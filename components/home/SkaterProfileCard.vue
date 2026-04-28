<script setup lang="ts">
import type { Skill, StudentProgress } from '~/types'

const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

const skills = ref<Skill[]>([])
const progress = ref<StudentProgress[]>([])
const profile = ref<{ full_name?: string; email?: string | null; avatar_url?: string | null } | null>(null)
const loading = ref(true)

const statCategories = [
  { key: 'fundamentals', name: 'Balance', name_es: 'Balance' },
  { key: 'street', name: 'Street', name_es: 'Street' },
  { key: 'bowl', name: 'Bowl/Ramp', name_es: 'Bowl/Rampa' },
  { key: 'surf_skate', name: 'Flow', name_es: 'Flow' },
  { key: 'safety', name: 'Falls', name_es: 'Caídas' },
  { key: 'speed', name: 'Speed', name_es: 'Velocidad' },
  { key: 'air', name: 'Air', name_es: 'Aire' },
  { key: 'manuals', name: 'Manuals', name_es: 'Manuales' },
]

const getCategoryDots = (categoryKey: string) => {
  const categorySkills = skills.value.filter(s => s.category === categoryKey)
  const learnedInCategory = categorySkills.filter(s => progress.value.some(p => p.skill_id === s.id))
  if (categorySkills.length === 0) return 0
  const percentage = learnedInCategory.length / categorySkills.length
  return Math.round(percentage * 10)
}

const getDotColor = (index: number, total: number) => {
  if (index >= total) return 'bg-gray-700'
  const position = index / 10
  if (position < 0.3) return 'bg-red-500'
  if (position < 0.5) return 'bg-orange-500'
  if (position < 0.7) return 'bg-yellow-400'
  return 'bg-green-500'
}

const stats = computed(() => {
  const total = skills.value.length
  const learned = progress.value.length
  const percentage = total > 0 ? Math.round((learned / total) * 100) : 0
  return { total, learned, percentage }
})

const displayEmail = computed(
  () => profile.value?.email || user.value?.email || '',
)

onMounted(async () => {
  if (!user.value?.id) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    const [{ data: profileData }, { data: skillsData }, { data: progressData }] = await Promise.all([
      client.from('profiles').select('full_name, email, avatar_url').eq('id', user.value.id).single(),
      client.from('skills_library').select('*').eq('is_active', true).order('sort_order'),
      client.from('student_progress').select('*').eq('student_id', user.value.id),
    ])
    profile.value = profileData
    skills.value = skillsData || []
    progress.value = progressData || []
  } catch (e) {
    console.error('SkaterProfileCard fetch error:', e)
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <NuxtLink
    to="/user/progress"
    class="block bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/50 shadow-2xl hover:border-gold-400/40 transition-colors"
  >
    <div v-if="loading" class="animate-pulse space-y-3">
      <div class="h-16 bg-gray-800 rounded-xl"></div>
      <div class="h-20 bg-gray-800 rounded-xl"></div>
    </div>
    <template v-else>
      <div class="flex gap-4">
        <div class="flex-1 min-w-0">
          <div class="mb-3 pb-2 border-b border-gray-700/50">
            <div class="flex items-center gap-2">
              <span class="text-gold-400 font-black text-lg uppercase tracking-wide truncate">
                {{ profile?.full_name || 'Skater' }}
              </span>
              <span class="px-2 py-0.5 bg-glass-blue/30 text-glass-blue text-[10px] font-bold rounded uppercase shrink-0">
                {{ language === 'es' ? 'Patinador' : 'Skater' }}
              </span>
            </div>
            <p v-if="displayEmail" class="text-white text-[11px] sm:text-xs mt-1.5 truncate leading-snug">
              {{ displayEmail }}
            </p>
          </div>
          <div class="space-y-1.5">
            <div
              v-for="stat in statCategories.slice(0, 5)"
              :key="stat.key"
              class="flex items-center gap-2"
            >
              <span class="text-gray-400 text-[10px] font-bold uppercase w-16 truncate text-right">
                {{ language === 'es' ? stat.name_es : stat.name }}
              </span>
              <div class="flex gap-0.5">
                <span
                  v-for="i in 10"
                  :key="i"
                  class="w-2.5 h-2.5 rounded-full transition-all"
                  :class="getDotColor(i - 1, getCategoryDots(stat.key))"
                ></span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-col items-center shrink-0">
          <div
            class="w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-4xl shadow-lg ring-2 ring-gold-400/30"
          >
            <img
              v-if="profile?.avatar_url"
              :src="profile.avatar_url"
              alt=""
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <span v-else class="text-white font-black">
              {{ profile?.full_name?.charAt(0)?.toUpperCase() || '🛹' }}
            </span>
          </div>
          <div class="mt-2 text-center">
            <p class="text-[10px] text-gray-500 uppercase">{{ language === 'es' ? 'Nivel' : 'Level' }}</p>
            <p class="text-gold-400 font-black text-sm">
              {{ stats.percentage >= 80 ? 'PRO' : stats.percentage >= 50 ? 'INTER' : 'ROOKIE' }}
            </p>
          </div>
        </div>
      </div>

      <div class="mt-3 pt-3 border-t border-gray-700/50">
        <div class="grid grid-cols-3 gap-2">
          <div v-for="stat in statCategories.slice(5, 8)" :key="stat.key" class="text-center">
            <p class="text-gray-500 text-[9px] font-bold uppercase mb-1">
              {{ language === 'es' ? stat.name_es : stat.name }}
            </p>
            <div class="flex justify-center gap-0.5">
              <span
                v-for="i in 10"
                :key="i"
                class="w-1.5 h-1.5 rounded-full"
                :class="getDotColor(i - 1, getCategoryDots(stat.key))"
              ></span>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-3 pt-3 border-t border-gray-700/50">
        <div class="flex items-center justify-between mb-2">
          <span class="text-gray-400 text-xs font-bold uppercase">
            {{ language === 'es' ? 'Progreso Total' : 'Total Progress' }}
          </span>
          <span class="text-gold-400 font-black">{{ stats.percentage }}%</span>
        </div>
        <div class="h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-red-500 via-yellow-400 to-green-500 rounded-full transition-all duration-700"
            :style="{ width: `${stats.percentage}%` }"
          ></div>
        </div>
        <p class="text-[10px] text-gray-500 mt-1 text-center">
          {{ stats.learned }} / {{ stats.total }}
          {{ language === 'es' ? 'trucos desbloqueados' : 'tricks unlocked' }}
        </p>
      </div>

      <p class="text-center text-gold-400/90 text-xs font-semibold mt-3">
        {{ language === 'es' ? 'Toca para ver mi progreso →' : 'Tap to view my progress →' }}
      </p>
    </template>
  </NuxtLink>
</template>
