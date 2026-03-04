<script setup lang="ts">
import type { Skill, StudentProgress, SkillCategory, SkillDifficulty } from '~/types'
import { SKILL_CATEGORY_LABELS, SKILL_DIFFICULTY_LABELS } from '~/types'

const router = useRouter()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

// Data
const skills = ref<Skill[]>([])
const progress = ref<StudentProgress[]>([])
const loading = ref(true)
const profile = ref<any>(null)

// Filters
const selectedCategory = ref<SkillCategory | 'all'>('all')
const selectedDifficulty = ref<SkillDifficulty | 'all'>('all')

// Tony Hawk style stat categories
const statCategories = [
  { key: 'fundamentals', name: 'Balance', name_es: 'Balance', icon: '⚖️', maxDots: 10 },
  { key: 'street', name: 'Street', name_es: 'Street', icon: '🛤️', maxDots: 10 },
  { key: 'bowl', name: 'Bowl/Ramp', name_es: 'Bowl/Rampa', icon: '🥣', maxDots: 10 },
  { key: 'surf_skate', name: 'Flow', name_es: 'Flow', icon: '🌊', maxDots: 10 },
  { key: 'safety', name: 'Falls', name_es: 'Caídas', icon: '🛡️', maxDots: 10 },
  { key: 'speed', name: 'Speed', name_es: 'Velocidad', icon: '💨', maxDots: 10 },
  { key: 'air', name: 'Air', name_es: 'Aire', icon: '🚀', maxDots: 10 },
  { key: 'manuals', name: 'Manuals', name_es: 'Manuales', icon: '🎯', maxDots: 10 },
]

// Calculate dots for each stat category
const getCategoryDots = (categoryKey: string) => {
  const categorySkills = skills.value.filter(s => s.category === categoryKey)
  const learnedInCategory = categorySkills.filter(s => progress.value.some(p => p.skill_id === s.id))
  
  if (categorySkills.length === 0) return 0
  
  // Scale to 10 dots max
  const percentage = learnedInCategory.length / categorySkills.length
  return Math.round(percentage * 10)
}

// Get dot color based on position
const getDotColor = (index: number, total: number) => {
  // Colors from red (weak) to green (strong)
  if (index >= total) return 'bg-gray-700' // Empty dot
  
  const position = index / 10
  if (position < 0.3) return 'bg-red-500'
  if (position < 0.5) return 'bg-orange-500'
  if (position < 0.7) return 'bg-yellow-400'
  return 'bg-green-500'
}

// Redirect if not logged in
watch(user, (newUser) => {
  if (!newUser) {
    router.push('/auth/login')
  }
}, { immediate: true })

onMounted(async () => {
  if (user.value) {
    await fetchData()
  }
})

const fetchData = async () => {
  loading.value = true
  try {
    // Fetch profile
    const { data: profileData } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.value?.id)
      .single()
    
    profile.value = profileData

    // Fetch all active skills
    const { data: skillsData, error: skillsError } = await client
      .from('skills_library')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    if (skillsError) throw skillsError
    skills.value = skillsData || []

    // Fetch user's progress
    const { data: progressData, error: progressError } = await client
      .from('student_progress')
      .select('*')
      .eq('student_id', user.value?.id)

    if (progressError) throw progressError
    progress.value = progressData || []
  } catch (e) {
    console.error('Error fetching data:', e)
  } finally {
    loading.value = false
  }
}

// Check if skill is learned
const isSkillLearned = (skillId: string): boolean => {
  return progress.value.some(p => p.skill_id === skillId)
}

// Get proficiency for a skill
const getSkillProficiency = (skillId: string): number => {
  const p = progress.value.find(p => p.skill_id === skillId)
  return p?.proficiency || 0
}

// Filter skills
const filteredSkills = computed(() => {
  return skills.value.filter(skill => {
    if (selectedCategory.value !== 'all' && skill.category !== selectedCategory.value) return false
    if (selectedDifficulty.value !== 'all' && skill.difficulty !== selectedDifficulty.value) return false
    return true
  })
})

// Group skills by category
const skillsByCategory = computed(() => {
  const groups: Record<string, Skill[]> = {}
  for (const skill of filteredSkills.value) {
    if (!groups[skill.category]) {
      groups[skill.category] = []
    }
    groups[skill.category].push(skill)
  }
  return groups
})

// Stats
const stats = computed(() => {
  const total = skills.value.length
  const learned = progress.value.length
  const percentage = total > 0 ? Math.round((learned / total) * 100) : 0
  
  // By category
  const byCategory: Record<string, { total: number; learned: number }> = {}
  for (const skill of skills.value) {
    if (!byCategory[skill.category]) {
      byCategory[skill.category] = { total: 0, learned: 0 }
    }
    byCategory[skill.category].total++
    if (isSkillLearned(skill.id)) {
      byCategory[skill.category].learned++
    }
  }
  
  // By difficulty
  const byDifficulty: Record<string, { total: number; learned: number }> = {}
  for (const skill of skills.value) {
    if (!byDifficulty[skill.difficulty]) {
      byDifficulty[skill.difficulty] = { total: 0, learned: 0 }
    }
    byDifficulty[skill.difficulty].total++
    if (isSkillLearned(skill.id)) {
      byDifficulty[skill.difficulty].learned++
    }
  }
  
  return { total, learned, percentage, byCategory, byDifficulty }
})

// Categories for filter
const categories: Array<{ value: SkillCategory | 'all'; label: string; icon: string }> = [
  { value: 'all', label: 'All', icon: '📋' },
  { value: 'fundamentals', label: 'Fundamentals', icon: '📚' },
  { value: 'street', label: 'Street', icon: '🛤️' },
  { value: 'bowl', label: 'Bowl', icon: '🥣' },
  { value: 'surf_skate', label: 'Surf Skate', icon: '🌊' },
  { value: 'safety', label: 'Safety', icon: '🛡️' },
]

// Difficulty colors
const difficultyColors: Record<SkillDifficulty, string> = {
  beginner: 'bg-green-500',
  intermediate: 'bg-yellow-500',
  advanced: 'bg-red-500',
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Tony Hawk Style Header -->
    <header class="bg-gradient-to-br from-gray-900 via-slate-800 to-gray-900 px-4 pt-safe pb-6 relative overflow-hidden">
      <!-- Background texture -->
      <div class="absolute inset-0 opacity-20">
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,215,0,0.1),transparent_50%)]"></div>
        <div class="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-gold-400/20 to-transparent"></div>
      </div>
      
      <div class="max-w-lg mx-auto pt-4 relative z-10">
        <!-- Back button and title -->
        <div class="flex items-center gap-4 mb-4">
          <button @click="router.back()" class="text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 class="text-2xl font-bold text-white">
            {{ language === 'es' ? 'Mi Progreso' : 'My Progress' }}
          </h1>
        </div>

        <!-- Tony Hawk Style Stats Card -->
        <div class="bg-gradient-to-br from-gray-800/90 to-gray-900/90 backdrop-blur-sm rounded-2xl p-4 border border-gray-700/50 shadow-2xl">
          <div class="flex gap-4">
            <!-- Stats Section (Left) -->
            <div class="flex-1">
              <!-- Player Name -->
              <div class="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700/50">
                <span class="text-gold-400 font-black text-lg uppercase tracking-wide">
                  {{ profile?.full_name || 'Skater' }}
                </span>
                <span class="px-2 py-0.5 bg-glass-blue/30 text-glass-blue text-[10px] font-bold rounded uppercase">
                  {{ language === 'es' ? 'Patinador' : 'Skater' }}
                </span>
              </div>

              <!-- Stats with Dots -->
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

            <!-- Avatar Section (Right) -->
            <div class="flex flex-col items-center">
              <div class="w-20 h-20 rounded-xl bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-4xl shadow-lg ring-2 ring-gold-400/30">
                {{ profile?.full_name?.charAt(0)?.toUpperCase() || '🛹' }}
              </div>
              <div class="mt-2 text-center">
                <p class="text-[10px] text-gray-500 uppercase">{{ language === 'es' ? 'Nivel' : 'Level' }}</p>
                <p class="text-gold-400 font-black text-sm">
                  {{ stats.percentage >= 80 ? 'PRO' : stats.percentage >= 50 ? 'INTER' : 'ROOKIE' }}
                </p>
              </div>
            </div>
          </div>

          <!-- Second Row of Stats -->
          <div class="mt-3 pt-3 border-t border-gray-700/50">
            <div class="grid grid-cols-3 gap-2">
              <div 
                v-for="stat in statCategories.slice(5, 8)" 
                :key="stat.key"
                class="text-center"
              >
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

          <!-- Overall Progress -->
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
              {{ stats.learned }} / {{ stats.total }} {{ language === 'es' ? 'trucos desbloqueados' : 'tricks unlocked' }}
            </p>
          </div>
        </div>
      </div>
    </header>

    <div class="px-4 max-w-lg mx-auto">
      <!-- Category Stats -->
      <div class="grid grid-cols-5 gap-2 mt-6 mb-6">
        <button
          v-for="cat in categories"
          :key="cat.value"
          @click="selectedCategory = cat.value"
          class="flex flex-col items-center p-2 rounded-xl transition-all"
          :class="selectedCategory === cat.value 
            ? 'bg-gold-400 text-black' 
            : 'bg-gray-900 text-gray-400 border border-gray-800'"
        >
          <span class="text-xl">{{ cat.icon }}</span>
          <span class="text-xs mt-1 truncate w-full text-center">
            {{ cat.value === 'all' 
              ? (language === 'es' ? 'Todo' : 'All')
              : (language === 'es' ? SKILL_CATEGORY_LABELS[cat.value as SkillCategory]?.name_es : cat.label)
            }}
          </span>
          <span v-if="cat.value !== 'all' && stats.byCategory[cat.value]" class="text-xs font-bold mt-1">
            {{ stats.byCategory[cat.value]?.learned || 0 }}/{{ stats.byCategory[cat.value]?.total || 0 }}
          </span>
        </button>
      </div>

      <!-- Difficulty Filter -->
      <div class="flex gap-2 mb-6">
        <button
          @click="selectedDifficulty = 'all'"
          class="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
          :class="selectedDifficulty === 'all' ? 'bg-white text-black' : 'bg-gray-800 text-gray-400'"
        >
          {{ language === 'es' ? 'Todos' : 'All' }}
        </button>
        <button
          @click="selectedDifficulty = 'beginner'"
          class="px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
          :class="selectedDifficulty === 'beginner' ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400'"
        >
          🌱 {{ language === 'es' ? 'Principiante' : 'Beginner' }}
        </button>
        <button
          @click="selectedDifficulty = 'intermediate'"
          class="px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
          :class="selectedDifficulty === 'intermediate' ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-400'"
        >
          ⚡ {{ language === 'es' ? 'Intermedio' : 'Intermediate' }}
        </button>
        <button
          @click="selectedDifficulty = 'advanced'"
          class="px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
          :class="selectedDifficulty === 'advanced' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400'"
        >
          🔥 {{ language === 'es' ? 'Avanzado' : 'Advanced' }}
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="space-y-4">
        <div v-for="i in 5" :key="i" class="bg-gray-900 rounded-xl p-4 animate-pulse">
          <div class="h-5 bg-gray-800 rounded w-1/3 mb-2"></div>
          <div class="h-4 bg-gray-800 rounded w-2/3"></div>
        </div>
      </div>

      <!-- Skills List -->
      <div v-else class="space-y-6">
        <div v-for="(categorySkills, category) in skillsByCategory" :key="category">
          <!-- Category Header -->
          <div class="flex items-center gap-2 mb-3">
            <span class="text-xl">{{ SKILL_CATEGORY_LABELS[category as SkillCategory]?.icon }}</span>
            <h2 class="font-bold text-white">
              {{ language === 'es' 
                ? SKILL_CATEGORY_LABELS[category as SkillCategory]?.name_es 
                : SKILL_CATEGORY_LABELS[category as SkillCategory]?.name 
              }}
            </h2>
            <span class="text-sm text-gray-500 ml-auto">
              {{ categorySkills.filter(s => isSkillLearned(s.id)).length }}/{{ categorySkills.length }}
            </span>
          </div>

          <!-- Skills in Category -->
          <div class="space-y-2">
            <div
              v-for="skill in categorySkills"
              :key="skill.id"
              class="bg-gray-900 border rounded-xl p-4 transition-all"
              :class="isSkillLearned(skill.id) 
                ? 'border-glass-green/50 bg-glass-green/10' 
                : 'border-gray-800'"
            >
              <div class="flex items-start gap-3">
                <!-- Checkbox/Status -->
                <div 
                  class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  :class="isSkillLearned(skill.id) ? 'bg-glass-green' : 'bg-gray-800'"
                >
                  <svg v-if="isSkillLearned(skill.id)" class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                  <span v-else class="text-gray-600 text-sm">{{ categorySkills.indexOf(skill) + 1 }}</span>
                </div>

                <!-- Skill Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <h3 class="font-bold text-white">
                      {{ language === 'es' ? skill.name_es || skill.name : skill.name }}
                    </h3>
                    <span 
                      class="w-2 h-2 rounded-full shrink-0"
                      :class="difficultyColors[skill.difficulty]"
                    ></span>
                  </div>
                  <p class="text-sm text-gray-400 line-clamp-2">
                    {{ language === 'es' ? skill.description_es || skill.description : skill.description }}
                  </p>
                  
                  <!-- Proficiency Stars (if learned) -->
                  <div v-if="isSkillLearned(skill.id)" class="flex items-center gap-1 mt-2">
                    <span 
                      v-for="i in 5" 
                      :key="i" 
                      class="text-sm"
                      :class="i <= getSkillProficiency(skill.id) ? 'text-gold-400' : 'text-gray-700'"
                    >★</span>
                    <span class="text-xs text-gray-500 ml-2">
                      {{ language === 'es' ? 'Nivel' : 'Level' }} {{ getSkillProficiency(skill.id) }}/5
                    </span>
                  </div>

                  <!-- Tips (collapsed) -->
                  <div v-if="skill.tips?.length" class="mt-2">
                    <details class="group">
                      <summary class="text-xs text-gold-400 cursor-pointer hover:text-gold-300">
                        💡 {{ language === 'es' ? 'Ver tips' : 'View tips' }}
                      </summary>
                      <ul class="mt-2 space-y-1 text-xs text-gray-400">
                        <li v-for="(tip, idx) in skill.tips" :key="idx" class="flex items-start gap-2">
                          <span class="text-gold-400">•</span>
                          <span>{{ tip }}</span>
                        </li>
                      </ul>
                    </details>
                  </div>
                </div>

                <!-- Video Link -->
                <a 
                  v-if="skill.video_url" 
                  :href="skill.video_url" 
                  target="_blank"
                  class="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shrink-0"
                >
                  <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="Object.keys(skillsByCategory).length === 0" class="text-center py-12">
          <p class="text-4xl mb-3">🔍</p>
          <p class="text-gray-400">{{ language === 'es' ? 'No se encontraron trucos' : 'No skills found' }}</p>
          <button 
            @click="selectedCategory = 'all'; selectedDifficulty = 'all'"
            class="mt-4 px-4 py-2 bg-gray-800 text-white rounded-xl"
          >
            {{ language === 'es' ? 'Limpiar filtros' : 'Clear filters' }}
          </button>
        </div>
      </div>

      <!-- Note for students -->
      <div class="mt-8 bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div class="flex items-start gap-3">
          <span class="text-2xl">💡</span>
          <div>
            <h4 class="font-bold text-white mb-1">
              {{ language === 'es' ? '¿Cómo funciona?' : 'How does it work?' }}
            </h4>
            <p class="text-sm text-gray-400">
              {{ language === 'es' 
                ? 'Tus coaches marcarán los trucos que aprendas durante tus clases. ¡Sigue practicando para desbloquear más!' 
                : 'Your coaches will mark the skills you learn during your classes. Keep practicing to unlock more!' 
              }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
