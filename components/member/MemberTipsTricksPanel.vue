<script setup lang="ts">
import type { Skill, SkillCategory } from '~/types'
import { SKILL_CATEGORY_LABELS } from '~/types'

const client = useSupabaseClient()
const { language } = useI18n()

const skills = ref<Skill[]>([])
const loading = ref(true)
const selectedCategory = ref<SkillCategory | 'all'>('all')
const searchQuery = ref('')

onMounted(async () => {
  await fetchSkills()
})

async function fetchSkills() {
  loading.value = true
  try {
    const { data, error } = await client
      .from('skills_library')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    if (error) throw error
    skills.value = data || []
  } catch (e) {
    console.error('Error fetching skills:', e)
  } finally {
    loading.value = false
  }
}

const filteredSkills = computed(() => {
  return skills.value.filter(skill => {
    if (selectedCategory.value !== 'all' && skill.category !== selectedCategory.value) return false
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      const name = (language.value === 'es' ? skill.name_es || skill.name : skill.name).toLowerCase()
      const desc = (language.value === 'es' ? skill.description_es || skill.description : skill.description || '').toLowerCase()
      if (!name.includes(query) && !desc.includes(query)) return false
    }
    return true
  })
})

const skillsByCategory = computed(() => {
  const groups: Record<string, Skill[]> = {}
  for (const skill of filteredSkills.value) {
    if (!groups[skill.category]) groups[skill.category] = []
    groups[skill.category].push(skill)
  }
  return groups
})

const categories: Array<{ value: SkillCategory | 'all'; icon: string }> = [
  { value: 'all', icon: '📋' },
  { value: 'fundamentals', icon: '📚' },
  { value: 'street', icon: '🛤️' },
  { value: 'bowl', icon: '🥣' },
  { value: 'surf_skate', icon: '🌊' },
  { value: 'safety', icon: '🛡️' },
]

function difficultyBadge(difficulty: string) {
  switch (difficulty) {
    case 'beginner': return 'bg-green-500/20 text-green-400'
    case 'intermediate': return 'bg-yellow-500/20 text-yellow-400'
    case 'advanced': return 'bg-red-500/20 text-red-400'
    default: return 'bg-gray-700 text-gray-400'
  }
}

function difficultyLabel(difficulty: string) {
  const labels: Record<string, { en: string; es: string }> = {
    beginner: { en: 'Beginner', es: 'Principiante' },
    intermediate: { en: 'Intermediate', es: 'Intermedio' },
    advanced: { en: 'Advanced', es: 'Avanzado' },
  }
  return labels[difficulty]?.[language.value] || difficulty
}
</script>

<template>
  <div>
    <div class="relative mb-4">
      <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        v-model="searchQuery"
        type="text"
        :placeholder="language === 'es' ? 'Buscar trucos...' : 'Search tricks...'"
        class="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
      />
    </div>

    <div class="flex gap-2 mb-6 overflow-x-auto pb-2">
      <button
        v-for="cat in categories"
        :key="cat.value"
        type="button"
        class="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
        :class="selectedCategory === cat.value
          ? 'bg-gold-400 text-black'
          : 'bg-gray-900 text-gray-400 border border-gray-800'"
        @click="selectedCategory = cat.value"
      >
        <span>{{ cat.icon }}</span>
        <span>
          {{
            cat.value === 'all'
              ? (language === 'es' ? 'Todos' : 'All')
              : (language === 'es'
                ? SKILL_CATEGORY_LABELS[cat.value as SkillCategory]?.name_es
                : SKILL_CATEGORY_LABELS[cat.value as SkillCategory]?.name)
          }}
        </span>
      </button>
    </div>

    <div v-if="loading" class="space-y-4">
      <div v-for="i in 4" :key="i" class="bg-gray-900 rounded-xl p-4 animate-pulse">
        <div class="h-5 bg-gray-800 rounded w-1/3 mb-2" />
        <div class="h-4 bg-gray-800 rounded w-2/3" />
      </div>
    </div>

    <div v-else class="space-y-8">
      <div v-for="(categorySkills, category) in skillsByCategory" :key="category">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-2xl">{{ SKILL_CATEGORY_LABELS[category as SkillCategory]?.icon }}</span>
          <h2 class="text-xl font-bold text-white">
            {{
              language === 'es'
                ? SKILL_CATEGORY_LABELS[category as SkillCategory]?.name_es
                : SKILL_CATEGORY_LABELS[category as SkillCategory]?.name
            }}
          </h2>
        </div>

        <div class="space-y-3">
          <div
            v-for="skill in categorySkills"
            :key="skill.id"
            class="bg-gray-900 border border-gray-800 rounded-2xl p-5"
          >
            <div class="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 class="font-bold text-white text-lg">
                  {{ language === 'es' ? skill.name_es || skill.name : skill.name }}
                </h3>
                <span :class="['inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-1', difficultyBadge(skill.difficulty)]">
                  {{ difficultyLabel(skill.difficulty) }}
                </span>
              </div>
              <a
                v-if="skill.video_url"
                :href="skill.video_url"
                target="_blank"
                class="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold shrink-0"
              >
                Video
              </a>
            </div>
            <p class="text-gray-400 text-sm mb-4">
              {{ language === 'es' ? skill.description_es || skill.description : skill.description }}
            </p>
            <div v-if="skill.tips?.length" class="bg-gray-800/50 rounded-xl p-4">
              <h4 class="font-semibold text-gold-400 text-sm mb-2">
                {{ language === 'es' ? 'Consejos' : 'Tips' }}
              </h4>
              <ul class="space-y-2">
                <li
                  v-for="(tip, idx) in skill.tips"
                  :key="idx"
                  class="flex items-start gap-2 text-sm text-gray-300"
                >
                  <span class="text-gold-400 shrink-0">{{ idx + 1 }}.</span>
                  <span>{{ tip }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div v-if="Object.keys(skillsByCategory).length === 0" class="text-center py-12">
        <p class="text-gray-400">
          {{ language === 'es' ? 'No se encontraron trucos' : 'No tricks found' }}
        </p>
      </div>
    </div>
  </div>
</template>
