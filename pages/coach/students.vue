<script setup lang="ts">
import type { Skill, StudentProgress } from '~/types'
import { SKILL_CATEGORY_LABELS } from '~/types'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

// State
const isCoach = ref(false)
const loading = ref(true)
const students = ref<any[]>([])
const skills = ref<Skill[]>([])
const selectedStudent = ref<any | null>(null)
const studentProgress = ref<StudentProgress[]>([])
const searchQuery = ref('')
const favoriteStudentIds = ref<Set<string>>(new Set())
const showFavoritesOnly = ref(false)

// Modal state
const showProgressModal = ref(false)
const savingProgress = ref(false)

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/coach/students')
    return
  }

  const { data } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.value.id)
    .single()

  if (data?.role !== 'coach' && data?.role !== 'admin') {
    router.push('/')
    return
  }

  isCoach.value = true
  await loadData()
})

const loadData = async () => {
  loading.value = true
  try {
    // Load students (all customers)
    const { data: studentsData } = await client
      .from('profiles')
      .select('*')
      .eq('role', 'customer')
      .eq('is_active', true)
      .order('full_name')

    students.value = studentsData || []

    // Load skills
    const { data: skillsData } = await client
      .from('skills_library')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    skills.value = skillsData || []

    // Load favorite students
    if (user.value) {
      const { data: favorites } = await client
        .from('coach_favorite_students')
        .select('student_id')
        .eq('coach_id', user.value.id)

      favoriteStudentIds.value = new Set((favorites || []).map(f => f.student_id))
    }
  } catch (e) {
    console.error('Error loading data:', e)
  } finally {
    loading.value = false
  }
}

// Check if student is favorite
const isFavorite = (studentId: string) => favoriteStudentIds.value.has(studentId)

// Toggle favorite status
const toggleFavorite = async (studentId: string, event: Event) => {
  event.stopPropagation()
  if (!user.value) return

  try {
    if (isFavorite(studentId)) {
      // Remove from favorites
      await client
        .from('coach_favorite_students')
        .delete()
        .eq('coach_id', user.value.id)
        .eq('student_id', studentId)
      
      favoriteStudentIds.value.delete(studentId)
    } else {
      // Add to favorites
      await client
        .from('coach_favorite_students')
        .insert({
          coach_id: user.value.id,
          student_id: studentId,
        })
      
      favoriteStudentIds.value.add(studentId)
    }
    // Force reactivity
    favoriteStudentIds.value = new Set(favoriteStudentIds.value)
  } catch (e) {
    console.error('Error toggling favorite:', e)
  }
}

// Filter students
const filteredStudents = computed(() => {
  let filtered = students.value
  
  // Filter by favorites if enabled
  if (showFavoritesOnly.value) {
    filtered = filtered.filter(s => favoriteStudentIds.value.has(s.id))
  }
  
  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(s => 
      s.full_name.toLowerCase().includes(query) || s.email.toLowerCase().includes(query)
    )
  }
  
  // Sort favorites first
  return filtered.sort((a, b) => {
    const aFav = favoriteStudentIds.value.has(a.id) ? 0 : 1
    const bFav = favoriteStudentIds.value.has(b.id) ? 0 : 1
    return aFav - bFav
  })
})

// Count favorites
const favoritesCount = computed(() => favoriteStudentIds.value.size)

// Select student and load their progress
const selectStudent = async (student: any) => {
  selectedStudent.value = student
  showProgressModal.value = true
  
  try {
    const { data } = await client
      .from('student_progress')
      .select('*')
      .eq('student_id', student.id)

    studentProgress.value = data || []
  } catch (e) {
    console.error('Error loading progress:', e)
  }
}

// Check if skill is learned
const isSkillLearned = (skillId: string): boolean => {
  return studentProgress.value.some(p => p.skill_id === skillId)
}

// Get proficiency
const getSkillProficiency = (skillId: string): number => {
  const p = studentProgress.value.find(p => p.skill_id === skillId)
  return p?.proficiency || 0
}

// Toggle skill
const toggleSkill = async (skill: Skill) => {
  if (!selectedStudent.value) return
  
  savingProgress.value = true
  try {
    const existing = studentProgress.value.find(p => p.skill_id === skill.id)
    
    if (existing) {
      // Remove skill
      await client
        .from('student_progress')
        .delete()
        .eq('id', existing.id)
      
      studentProgress.value = studentProgress.value.filter(p => p.id !== existing.id)
    } else {
      // Add skill
      const { data, error } = await client
        .from('student_progress')
        .insert({
          student_id: selectedStudent.value.id,
          skill_id: skill.id,
          marked_by: user.value?.id,
          proficiency: 3, // Default to middle proficiency
        })
        .select()
        .single()

      if (error) throw error
      studentProgress.value.push(data)
    }
  } catch (e) {
    console.error('Error toggling skill:', e)
  } finally {
    savingProgress.value = false
  }
}

// Update proficiency
const updateProficiency = async (skill: Skill, proficiency: number) => {
  if (!selectedStudent.value) return
  
  try {
    const existing = studentProgress.value.find(p => p.skill_id === skill.id)
    
    if (existing) {
      await client
        .from('student_progress')
        .update({ proficiency })
        .eq('id', existing.id)
      
      existing.proficiency = proficiency
    }
  } catch (e) {
    console.error('Error updating proficiency:', e)
  }
}

// Group skills by category
const skillsByCategory = computed(() => {
  const groups: Record<string, Skill[]> = {}
  for (const skill of skills.value) {
    if (!groups[skill.category]) {
      groups[skill.category] = []
    }
    groups[skill.category].push(skill)
  }
  return groups
})

// Student progress count
const getStudentProgressCount = (student: any): number => {
  // For now, return 0 - would need to load this async
  return 0
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center gap-3">
          <button @click="router.push('/coach')" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl font-bold text-white">
              {{ language === 'es' ? 'Estudiantes' : 'Students' }}
            </h1>
            <p class="text-sm text-gray-400">{{ language === 'es' ? 'Marcar progreso' : 'Mark progress' }}</p>
          </div>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div v-if="isCoach" class="px-4 py-6 max-w-2xl mx-auto">
      <!-- Favorites Filter -->
      <div class="flex gap-2 mb-4">
        <button
          @click="showFavoritesOnly = false"
          class="flex-1 py-2 rounded-xl font-semibold text-sm transition-all"
          :class="!showFavoritesOnly 
            ? 'bg-gold-400 text-black' 
            : 'bg-gray-800 text-gray-400'"
        >
          {{ language === 'es' ? 'Todos' : 'All' }} ({{ students.length }})
        </button>
        <button
          @click="showFavoritesOnly = true"
          class="flex-1 py-2 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-1"
          :class="showFavoritesOnly 
            ? 'bg-gold-400 text-black' 
            : 'bg-gray-800 text-gray-400'"
        >
          ⭐ {{ language === 'es' ? 'Favoritos' : 'Favorites' }} ({{ favoritesCount }})
        </button>
      </div>

      <!-- Search -->
      <div class="relative mb-6">
        <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="language === 'es' ? 'Buscar estudiante...' : 'Search student...'"
          class="w-full pl-12 pr-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
        />
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-12">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>

      <!-- Students List -->
      <div v-else-if="filteredStudents.length === 0" class="text-center py-12">
        <p class="text-4xl mb-3">{{ showFavoritesOnly ? '⭐' : '👨‍🎓' }}</p>
        <p class="text-gray-400">
          {{ showFavoritesOnly 
            ? (language === 'es' ? 'No tienes favoritos aún' : 'No favorites yet')
            : (language === 'es' ? 'No se encontraron estudiantes' : 'No students found') 
          }}
        </p>
        <p v-if="showFavoritesOnly" class="text-xs text-gray-500 mt-2">
          {{ language === 'es' ? 'Toca la ⭐ junto a un estudiante para agregarlo' : 'Tap the ⭐ next to a student to add them' }}
        </p>
      </div>

      <div v-else class="space-y-2">
        <div
          v-for="student in filteredStudents"
          :key="student.id"
          class="bg-gray-900 border rounded-xl p-4 flex items-center gap-3 transition-all"
          :class="isFavorite(student.id) ? 'border-gold-400/50' : 'border-gray-800'"
        >
          <!-- Favorite Button -->
          <button
            @click="toggleFavorite(student.id, $event)"
            class="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0"
            :class="isFavorite(student.id) 
              ? 'bg-gold-400/20 text-gold-400' 
              : 'bg-gray-800 text-gray-500 hover:bg-gray-700'"
          >
            <span class="text-xl">{{ isFavorite(student.id) ? '⭐' : '☆' }}</span>
          </button>
          
          <!-- Student Info (clickable) -->
          <button
            @click="selectStudent(student)"
            class="flex-1 flex items-center gap-3 text-left"
          >
            <div class="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white"
              :class="isFavorite(student.id) 
                ? 'bg-gradient-to-br from-gold-400 to-glass-orange' 
                : 'bg-gradient-to-br from-glass-blue to-glass-purple'"
            >
              {{ student.full_name.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-white truncate">{{ student.full_name }}</p>
              <p class="text-sm text-gray-400 truncate">{{ student.email }}</p>
            </div>
          </button>
          
          <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>

    <!-- Progress Modal -->
    <Teleport to="body">
      <div v-if="showProgressModal" class="fixed inset-0 z-50 bg-black">
        <!-- Modal Header -->
        <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
          <div class="px-4 py-4 max-w-2xl mx-auto">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <button @click="showProgressModal = false; selectedStudent = null" class="p-2 -ml-2 text-white">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div>
                  <h2 class="text-lg font-bold text-white">{{ selectedStudent?.full_name }}</h2>
                  <p class="text-sm text-gray-400">{{ studentProgress.length }} {{ language === 'es' ? 'trucos aprendidos' : 'skills learned' }}</p>
                </div>
              </div>
              <div class="w-10 h-10 rounded-full bg-gradient-to-br from-glass-blue to-glass-purple flex items-center justify-center text-lg font-bold text-white">
                {{ selectedStudent?.full_name.charAt(0).toUpperCase() }}
              </div>
            </div>
          </div>
        </header>

        <!-- Skills List -->
        <div class="px-4 py-6 max-w-2xl mx-auto overflow-y-auto" style="max-height: calc(100vh - 80px);">
          <div v-for="(categorySkills, category) in skillsByCategory" :key="category" class="mb-6">
            <!-- Category Header -->
            <div class="flex items-center gap-2 mb-3 sticky top-0 bg-black py-2">
              <span class="text-xl">{{ SKILL_CATEGORY_LABELS[category as keyof typeof SKILL_CATEGORY_LABELS]?.icon }}</span>
              <h3 class="font-bold text-white">
                {{ language === 'es' 
                  ? SKILL_CATEGORY_LABELS[category as keyof typeof SKILL_CATEGORY_LABELS]?.name_es 
                  : SKILL_CATEGORY_LABELS[category as keyof typeof SKILL_CATEGORY_LABELS]?.name 
                }}
              </h3>
            </div>

            <!-- Skills -->
            <div class="space-y-2">
              <div
                v-for="skill in categorySkills"
                :key="skill.id"
                class="bg-gray-900 border rounded-xl p-4 transition-all"
                :class="isSkillLearned(skill.id) ? 'border-glass-green/50' : 'border-gray-800'"
              >
                <div class="flex items-center gap-3">
                  <!-- Toggle -->
                  <button
                    @click="toggleSkill(skill)"
                    :disabled="savingProgress"
                    class="w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0"
                    :class="isSkillLearned(skill.id) ? 'bg-glass-green text-white' : 'bg-gray-800 text-gray-400'"
                  >
                    <svg v-if="isSkillLearned(skill.id)" class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                    </svg>
                    <span v-else class="text-lg">○</span>
                  </button>

                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-white">
                      {{ language === 'es' ? skill.name_es || skill.name : skill.name }}
                    </p>
                    
                    <!-- Proficiency Stars (if learned) -->
                    <div v-if="isSkillLearned(skill.id)" class="flex items-center gap-1 mt-1">
                      <button
                        v-for="i in 5"
                        :key="i"
                        @click="updateProficiency(skill, i)"
                        class="text-lg transition-all hover:scale-110"
                        :class="i <= getSkillProficiency(skill.id) ? 'text-gold-400' : 'text-gray-700'"
                      >
                        ★
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
