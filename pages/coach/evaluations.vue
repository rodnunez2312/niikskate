<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

// Page meta - auth check done manually in onMounted for better error handling

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

// State
const isCoach = ref(false)
const loading = ref(true)
const students = ref<any[]>([])
const evaluations = ref<any[]>([])
const selectedStudent = ref<any | null>(null)
const searchQuery = ref('')
const activeTab = ref<'new' | 'history'>('new')

// Modal state
const showEvaluationModal = ref(false)
const savingEvaluation = ref(false)

// Evaluation form
const evaluationForm = ref({
  balance_rating: 3,
  technique_rating: 3,
  consistency_rating: 3,
  creativity_rating: 3,
  safety_rating: 3,
  effort_rating: 3,
  overall_rating: 3,
  strengths: '',
  areas_to_improve: '',
  goals_for_next_period: '',
  notes: '',
  is_shared_with_parent: false,
})

// Rating categories
const ratingCategories = [
  { key: 'balance_rating', label: 'Balance', labelEs: 'Balance', icon: '⚖️' },
  { key: 'technique_rating', label: 'Technique', labelEs: 'Técnica', icon: '🎯' },
  { key: 'consistency_rating', label: 'Consistency', labelEs: 'Consistencia', icon: '📈' },
  { key: 'creativity_rating', label: 'Creativity', labelEs: 'Creatividad', icon: '✨' },
  { key: 'safety_rating', label: 'Safety', labelEs: 'Seguridad', icon: '🛡️' },
  { key: 'effort_rating', label: 'Effort', labelEs: 'Esfuerzo', icon: '💪' },
]

const checkAuthAndLoad = async () => {
  if (!user.value) {
    return
  }

  try {
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
  } catch (e) {
    console.error('Error loading evaluations page:', e)
    loading.value = false
    isCoach.value = true // Still show the page but with empty data
  }
}

// Watch for user changes (handles async auth loading)
watch(user, (newUser) => {
  if (newUser && !isCoach.value) {
    checkAuthAndLoad()
  }
}, { immediate: true })

onMounted(() => {
  // If user is already available, check auth
  if (user.value) {
    checkAuthAndLoad()
  } else {
    // Give it a moment for auth to load, then redirect if still no user
    setTimeout(() => {
      if (!user.value) {
        router.push('/auth/login?redirect=/coach/evaluations')
      }
    }, 2000)
  }
})

const loadData = async () => {
  loading.value = true
  try {
    // Load all students
    const { data: studentsData } = await client
      .from('profiles')
      .select('*')
      .eq('role', 'customer')
      .eq('is_active', true)
      .order('full_name')

    students.value = studentsData || []

    // Load recent evaluations by this coach (table might not exist yet)
    try {
      const { data: evalsData } = await client
        .from('student_evaluations')
        .select(`
          *,
          student:profiles!student_id(full_name, email)
        `)
        .eq('coach_id', user.value?.id)
        .order('evaluation_date', { ascending: false })
        .limit(20)

      evaluations.value = evalsData || []
    } catch (evalError) {
      console.warn('student_evaluations table may not exist yet:', evalError)
      evaluations.value = []
    }
  } catch (e) {
    console.error('Error loading data:', e)
  } finally {
    loading.value = false
  }
}

// Filter students
const filteredStudents = computed(() => {
  if (!searchQuery.value) return students.value
  const query = searchQuery.value.toLowerCase()
  return students.value.filter(s => 
    s.full_name.toLowerCase().includes(query) || s.email.toLowerCase().includes(query)
  )
})

// Select student for evaluation
const selectStudent = (student: any) => {
  selectedStudent.value = student
  resetForm()
  showEvaluationModal.value = true
}

// Reset form
const resetForm = () => {
  evaluationForm.value = {
    balance_rating: 3,
    technique_rating: 3,
    consistency_rating: 3,
    creativity_rating: 3,
    safety_rating: 3,
    effort_rating: 3,
    overall_rating: 3,
    strengths: '',
    areas_to_improve: '',
    goals_for_next_period: '',
    notes: '',
    is_shared_with_parent: false,
  }
}

// Save evaluation
const saveEvaluation = async () => {
  if (!selectedStudent.value || !user.value) return
  
  savingEvaluation.value = true
  try {
    const { error } = await client
      .from('student_evaluations')
      .insert({
        student_id: selectedStudent.value.id,
        coach_id: user.value.id,
        evaluation_date: new Date().toISOString().split('T')[0],
        ...evaluationForm.value,
      })

    if (error) throw error

    showEvaluationModal.value = false
    selectedStudent.value = null
    await loadData()
  } catch (e) {
    console.error('Error saving evaluation:', e)
    alert('Error saving evaluation')
  } finally {
    savingEvaluation.value = false
  }
}

// Format date
const formatDate = (dateStr: string) => {
  const locale = language.value === 'es' ? es : undefined
  return format(new Date(dateStr), 'd MMM yyyy', { locale })
}

// Get rating color
const getRatingColor = (rating: number) => {
  if (rating >= 4) return 'text-glass-green'
  if (rating >= 3) return 'text-gold-400'
  return 'text-flame-600'
}

// Calculate average rating for an evaluation
const getAverageRating = (evaluation: any) => {
  const ratings = [
    evaluation.balance_rating,
    evaluation.technique_rating,
    evaluation.consistency_rating,
    evaluation.creativity_rating,
    evaluation.safety_rating,
    evaluation.effort_rating,
  ].filter(r => r !== null)
  
  if (ratings.length === 0) return 0
  return (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-lg mx-auto">
        <div class="flex items-center gap-3 mb-4">
          <button @click="router.push('/coach')" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 class="text-xl font-bold text-white">
              {{ language === 'es' ? 'Evaluaciones' : 'Evaluations' }}
            </h1>
            <p class="text-sm text-gray-400">{{ language === 'es' ? 'Evaluar estudiantes' : 'Evaluate students' }}</p>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-2">
          <button
            @click="activeTab = 'new'"
            class="flex-1 py-2 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'new' 
              ? 'bg-gold-400 text-black' 
              : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Nueva Evaluación' : 'New Evaluation' }}
          </button>
          <button
            @click="activeTab = 'history'"
            class="flex-1 py-2 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'history' 
              ? 'bg-gold-400 text-black' 
              : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Historial' : 'History' }}
          </button>
        </div>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-12 h-12 border-4 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <!-- Content -->
    <div v-else-if="isCoach" class="px-4 py-6 max-w-lg mx-auto">
      <!-- New Evaluation Tab -->
      <div v-if="activeTab === 'new'">
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

        <!-- Students List -->
        <div v-if="filteredStudents.length === 0" class="text-center py-12">
          <p class="text-4xl mb-3">👨‍🎓</p>
          <p class="text-gray-400">{{ language === 'es' ? 'No se encontraron estudiantes' : 'No students found' }}</p>
        </div>

        <div v-else class="space-y-2">
          <button
            v-for="student in filteredStudents"
            :key="student.id"
            @click="selectStudent(student)"
            class="w-full bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3 hover:border-gold-400/50 transition-all text-left"
          >
            <div class="w-12 h-12 rounded-full bg-gradient-to-br from-glass-purple to-glass-blue flex items-center justify-center text-xl font-bold text-white">
              {{ student.full_name.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-white truncate">{{ student.full_name }}</p>
              <p class="text-sm text-gray-400 truncate">{{ student.email }}</p>
            </div>
            <div class="px-3 py-1 bg-gold-400/20 text-gold-400 rounded-full text-xs font-bold">
              {{ language === 'es' ? 'Evaluar' : 'Evaluate' }}
            </div>
          </button>
        </div>
      </div>

      <!-- History Tab -->
      <div v-else-if="activeTab === 'history'">
        <div v-if="evaluations.length === 0" class="text-center py-12">
          <p class="text-4xl mb-3">📋</p>
          <p class="text-gray-400">{{ language === 'es' ? 'No hay evaluaciones aún' : 'No evaluations yet' }}</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="evaluation in evaluations"
            :key="evaluation.id"
            class="bg-gray-900 border border-gray-800 rounded-xl p-4"
          >
            <div class="flex items-start justify-between mb-3">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-gradient-to-br from-glass-purple to-glass-blue flex items-center justify-center text-lg font-bold text-white">
                  {{ evaluation.student?.full_name?.charAt(0)?.toUpperCase() || '?' }}
                </div>
                <div>
                  <p class="font-semibold text-white">{{ evaluation.student?.full_name }}</p>
                  <p class="text-xs text-gray-400">{{ formatDate(evaluation.evaluation_date) }}</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-2xl font-bold" :class="getRatingColor(Number(getAverageRating(evaluation)))">
                  {{ getAverageRating(evaluation) }}
                </p>
                <p class="text-xs text-gray-500">{{ language === 'es' ? 'Promedio' : 'Average' }}</p>
              </div>
            </div>

            <!-- Mini ratings -->
            <div class="grid grid-cols-3 gap-2 mb-3">
              <div v-for="cat in ratingCategories.slice(0, 6)" :key="cat.key" class="text-center">
                <span class="text-lg">{{ cat.icon }}</span>
                <p class="text-xs text-gray-400">{{ evaluation[cat.key] || '-' }}/5</p>
              </div>
            </div>

            <!-- Notes preview -->
            <div v-if="evaluation.strengths || evaluation.areas_to_improve" class="pt-3 border-t border-gray-800">
              <p v-if="evaluation.strengths" class="text-xs text-gray-400 mb-1">
                <span class="text-glass-green">💪</span> {{ evaluation.strengths.substring(0, 100) }}...
              </p>
              <p v-if="evaluation.areas_to_improve" class="text-xs text-gray-400">
                <span class="text-gold-400">🎯</span> {{ evaluation.areas_to_improve.substring(0, 100) }}...
              </p>
            </div>

            <div v-if="evaluation.is_shared_with_parent" class="mt-2 flex items-center gap-1 text-xs text-glass-green">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              {{ language === 'es' ? 'Compartido con padres' : 'Shared with parents' }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Evaluation Modal -->
    <Teleport to="body">
      <div v-if="showEvaluationModal" class="fixed inset-0 z-50 bg-black overflow-y-auto">
        <!-- Modal Header -->
        <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
          <div class="px-4 py-4 max-w-lg mx-auto">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <button @click="showEvaluationModal = false; selectedStudent = null" class="p-2 -ml-2 text-white">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div>
                  <h2 class="text-lg font-bold text-white">{{ selectedStudent?.full_name }}</h2>
                  <p class="text-sm text-gray-400">{{ language === 'es' ? 'Nueva Evaluación' : 'New Evaluation' }}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <!-- Modal Content -->
        <div class="px-4 py-6 max-w-lg mx-auto pb-32">
          <!-- Rating Categories -->
          <div class="space-y-4 mb-6">
            <div
              v-for="cat in ratingCategories"
              :key="cat.key"
              class="bg-gray-900 border border-gray-800 rounded-xl p-4"
            >
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                  <span class="text-xl">{{ cat.icon }}</span>
                  <span class="font-semibold text-white">{{ language === 'es' ? cat.labelEs : cat.label }}</span>
                </div>
                <span class="text-lg font-bold" :class="getRatingColor(evaluationForm[cat.key as keyof typeof evaluationForm] as number)">
                  {{ evaluationForm[cat.key as keyof typeof evaluationForm] }}/5
                </span>
              </div>
              <div class="flex gap-2">
                <button
                  v-for="i in 5"
                  :key="i"
                  @click="(evaluationForm[cat.key as keyof typeof evaluationForm] as any) = i"
                  class="flex-1 py-3 rounded-lg font-bold transition-all"
                  :class="(evaluationForm[cat.key as keyof typeof evaluationForm] as number) >= i 
                    ? 'bg-gold-400 text-black' 
                    : 'bg-gray-800 text-gray-500'"
                >
                  {{ i }}
                </button>
              </div>
            </div>
          </div>

          <!-- Overall Rating -->
          <div class="bg-gradient-to-r from-gold-400/20 to-glass-orange/20 border border-gold-400/50 rounded-xl p-4 mb-6">
            <div class="flex items-center justify-between mb-3">
              <span class="font-bold text-white">{{ language === 'es' ? 'Calificación General' : 'Overall Rating' }}</span>
              <span class="text-2xl font-bold text-gold-400">{{ evaluationForm.overall_rating }}/5</span>
            </div>
            <div class="flex gap-2">
              <button
                v-for="i in 5"
                :key="i"
                @click="evaluationForm.overall_rating = i"
                class="flex-1 py-3 rounded-lg font-bold text-lg transition-all"
                :class="evaluationForm.overall_rating >= i 
                  ? 'bg-gold-400 text-black' 
                  : 'bg-gray-800 text-gray-500'"
              >
                ★
              </button>
            </div>
          </div>

          <!-- Text Fields -->
          <div class="space-y-4 mb-6">
            <div>
              <label class="block text-sm font-semibold text-white mb-2">
                💪 {{ language === 'es' ? 'Fortalezas' : 'Strengths' }}
              </label>
              <textarea
                v-model="evaluationForm.strengths"
                :placeholder="language === 'es' ? '¿En qué destaca este estudiante?' : 'What does this student excel at?'"
                rows="2"
                class="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none resize-none"
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-semibold text-white mb-2">
                🎯 {{ language === 'es' ? 'Áreas a Mejorar' : 'Areas to Improve' }}
              </label>
              <textarea
                v-model="evaluationForm.areas_to_improve"
                :placeholder="language === 'es' ? '¿En qué puede mejorar?' : 'What can be improved?'"
                rows="2"
                class="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none resize-none"
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-semibold text-white mb-2">
                🚀 {{ language === 'es' ? 'Metas para el Próximo Periodo' : 'Goals for Next Period' }}
              </label>
              <textarea
                v-model="evaluationForm.goals_for_next_period"
                :placeholder="language === 'es' ? '¿Cuáles son las metas?' : 'What are the goals?'"
                rows="2"
                class="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none resize-none"
              ></textarea>
            </div>

            <div>
              <label class="block text-sm font-semibold text-white mb-2">
                📝 {{ language === 'es' ? 'Notas Adicionales' : 'Additional Notes' }}
              </label>
              <textarea
                v-model="evaluationForm.notes"
                :placeholder="language === 'es' ? 'Cualquier otra observación...' : 'Any other observations...'"
                rows="2"
                class="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none resize-none"
              ></textarea>
            </div>
          </div>

          <!-- Share Toggle -->
          <div class="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
            <div>
              <p class="font-semibold text-white">{{ language === 'es' ? 'Compartir con Padres' : 'Share with Parents' }}</p>
              <p class="text-xs text-gray-400">{{ language === 'es' ? 'Permitir que los padres vean esta evaluación' : 'Allow parents to see this evaluation' }}</p>
            </div>
            <button
              @click="evaluationForm.is_shared_with_parent = !evaluationForm.is_shared_with_parent"
              class="w-14 h-8 rounded-full transition-all relative"
              :class="evaluationForm.is_shared_with_parent ? 'bg-glass-green' : 'bg-gray-700'"
            >
              <span 
                class="absolute top-1 w-6 h-6 bg-white rounded-full transition-all"
                :class="evaluationForm.is_shared_with_parent ? 'left-7' : 'left-1'"
              ></span>
            </button>
          </div>

          <!-- Save Button -->
          <button
            @click="saveEvaluation"
            :disabled="savingEvaluation"
            class="w-full py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold rounded-xl disabled:opacity-50"
          >
            {{ savingEvaluation 
              ? (language === 'es' ? 'Guardando...' : 'Saving...') 
              : (language === 'es' ? 'Guardar Evaluación' : 'Save Evaluation')
            }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
