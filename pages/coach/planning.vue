<script setup lang="ts">
import { format, addDays, startOfDay } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Skill, ClassPlan } from '~/types'
import { SKILL_CATEGORY_LABELS } from '~/types'

definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

// Import class planning data
import classData from '~/data/class-planning.json'

// State
const isCoach = ref(false)
const loading = ref(true)
const skills = ref<Skill[]>([])
const plans = ref<ClassPlan[]>([])

// Warmup exercises from JSON
const warmupExercises = computed(() => classData.warmup_exercises)
const selectedWarmupExercises = ref<number[]>([])

// Parks for class planning
const parks = computed(() => Object.entries(classData.park_plans).map(([key, value]: [string, any]) => ({
  id: key,
  name: value.name,
  type: value.type,
  obstacles: value.obstacles
})))
const selectedPark = ref<string | null>(null)

// Form state
const selectedDate = ref<string>(format(new Date(), 'yyyy-MM-dd'))
const selectedSession = ref<'early' | 'late'>('early')
const selectedSkills = ref<string[]>([])
const planTitle = ref('')
const warmupNotes = ref('')
const mainNotes = ref('')
const saving = ref(false)
const showSuccess = ref(false)
const { syncing, syncNiikLibrary: doSyncNiikLibrary } = useNiikLibrarySync()

// Warmup focus areas
const warmupFocusAreas = [
  { id: 'cardio', name: 'Cardio', name_es: 'Cardio', icon: '🏃' },
  { id: 'fisio', name: 'Physiotherapy', name_es: 'Fisio', icon: '🦵' },
  { id: 'strength', name: 'Strength', name_es: 'Fuerza', icon: '💪' },
  { id: 'aerials', name: 'Aerials', name_es: 'Aéreos', icon: '🌀' },
  { id: 'neck', name: 'Neck', name_es: 'Cuello', icon: '🦒' },
  { id: 'shoulders', name: 'Shoulders', name_es: 'Hombros', icon: '🤸' },
  { id: 'hips', name: 'Hips', name_es: 'Caderas', icon: '🦴' },
  { id: 'ankles', name: 'Ankles', name_es: 'Tobillos', icon: '🦶' },
  { id: 'core', name: 'Core', name_es: 'Core', icon: '🎯' },
  { id: 'balance', name: 'Balance', name_es: 'Balance', icon: '⚖️' },
  { id: 'agility', name: 'Agility', name_es: 'Agilidad', icon: '⚡' },
  { id: 'stretching', name: 'Stretching', name_es: 'Estiramiento', icon: '🧘' },
]
const selectedWarmupFocus = ref<string[]>([])

// Activity type filter - 5 categories matching Excel NEW CATEGORY column (ordered)
const skillCategoryFilter = ref<string>('')
const skillDifficultyFilter = ref<string>('')
const skillCategories: ActivityCategory[] = [
  'iniciacion',
  'street_piso',
  'street_obstaculos',
  'vert_bowl',
  'surf_skate'
]
import type { ActivityCategory } from '~/types'
import { ACTIVITY_CATEGORY_LABELS } from '~/types'
const activityLabels = ACTIVITY_CATEGORY_LABELS

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/coach/planning')
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
  
  // Background sync: update from source data without blocking UI
  autoSyncNiikLibrary().then(() => loadData())
})

const loadData = async () => {
  loading.value = true
  try {
    // Load skills first (fast)
    const { data: skillsData } = await client
      .from('skills_library')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    skills.value = skillsData || []
    
    // Debug: Log unique categories in database
    const uniqueCats = [...new Set(skills.value.map(s => s.category))]
    console.log('Categories in database:', uniqueCats)
    console.log('Expected filter categories:', skillCategories)

    // Load existing plans
    const { data: plansData } = await client
      .from('class_plans')
      .select('*')
      .eq('coach_id', user.value?.id)
      .order('plan_date', { ascending: false })

    plans.value = plansData || []
    
    // Load plan for selected date if exists
    loadPlanForDate()
  } catch (e) {
    console.error('Error loading data:', e)
  } finally {
    loading.value = false
  }
}

// Load plan for selected date
const loadPlanForDate = () => {
  const existing = plans.value.find(p => 
    p.plan_date === selectedDate.value && p.time_slot === selectedSession.value
  )
  
  if (existing) {
    planTitle.value = existing.title || ''
    selectedSkills.value = existing.planned_skills || []
    warmupNotes.value = existing.warmup_notes || ''
    mainNotes.value = existing.main_activity_notes || ''
  } else {
    resetForm()
  }
}

// Reset form
const resetForm = () => {
  planTitle.value = ''
  selectedSkills.value = []
  warmupNotes.value = ''
  mainNotes.value = ''
}

// Toggle skill
const toggleSkill = (skillId: string) => {
  if (selectedSkills.value.includes(skillId)) {
    selectedSkills.value = selectedSkills.value.filter(id => id !== skillId)
  } else {
    selectedSkills.value.push(skillId)
  }
}

// Toggle warmup focus area
const toggleWarmupFocus = (focusId: string) => {
  if (selectedWarmupFocus.value.includes(focusId)) {
    selectedWarmupFocus.value = selectedWarmupFocus.value.filter(id => id !== focusId)
  } else {
    selectedWarmupFocus.value.push(focusId)
  }
}

// Toggle warmup exercise
const toggleWarmupExercise = (exerciseId: number) => {
  if (selectedWarmupExercises.value.includes(exerciseId)) {
    selectedWarmupExercises.value = selectedWarmupExercises.value.filter(id => id !== exerciseId)
  } else {
    selectedWarmupExercises.value.push(exerciseId)
  }
}

// Get selected park obstacles
const selectedParkObstacles = computed(() => {
  if (!selectedPark.value) return null
  const park = parks.value.find(p => p.id === selectedPark.value)
  return park?.obstacles || null
})

// Save plan
const savePlan = async () => {
  saving.value = true
  showSuccess.value = false
  
  try {
    const existing = plans.value.find(p => 
      p.plan_date === selectedDate.value && p.time_slot === selectedSession.value
    )
    
    const planData = {
      coach_id: user.value?.id,
      plan_date: selectedDate.value,
      time_slot: selectedSession.value,
      title: planTitle.value || null,
      planned_skills: selectedSkills.value,
      warmup_notes: warmupNotes.value || null,
      main_activity_notes: mainNotes.value || null,
    }
    
    if (existing) {
      await client
        .from('class_plans')
        .update(planData)
        .eq('id', existing.id)
    } else {
      await client
        .from('class_plans')
        .insert(planData)
    }
    
    await loadData()
    showSuccess.value = true
    setTimeout(() => showSuccess.value = false, 3000)
  } catch (e) {
    console.error('Error saving plan:', e)
  } finally {
    saving.value = false
  }
}

// Filtered skills (flat list)
const filteredSkills = computed(() => {
  return skills.value.filter(skill => {
    const matchesCategory = !skillCategoryFilter.value || skill.category === skillCategoryFilter.value
    const matchesDifficulty = !skillDifficultyFilter.value || skill.difficulty === skillDifficultyFilter.value
    return matchesCategory && matchesDifficulty
  })
})

// Get skill by id
const getSkillById = (id: string) => skills.value.find(s => s.id === id)

// Auto-sync tricks from Niik Library on page load (silent, no alerts)
const autoSyncNiikLibrary = async () => {
  console.log('Auto-syncing Niik Library from source data...')
  const res = await doSyncNiikLibrary()
  if (res.ok) {
    console.log(`Niik Library synced: ${res.inserted} new, ${res.updated} updated, ${res.total} total`)
  } else if (res.message) {
    console.error('Niik Library sync failed:', res.message)
  }
}

// Date options (next 14 days)
const dateOptions = computed(() => {
  const options = []
  const today = startOfDay(new Date())
  for (let i = 0; i < 14; i++) {
    const date = addDays(today, i)
    options.push({
      value: format(date, 'yyyy-MM-dd'),
      label: format(date, 'EEE d MMM', { locale: language.value === 'es' ? es : undefined }),
    })
  }
  return options
})

// Watch for date/session changes
watch([selectedDate, selectedSession], () => {
  loadPlanForDate()
})
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
              {{ language === 'es' ? 'Planear Clase' : 'Plan Class' }}
            </h1>
            <p class="text-sm text-gray-400">{{ language === 'es' ? 'Selecciona trucos y notas' : 'Select tricks and notes' }}</p>
          </div>
        </div>
      </div>
    </header>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <!-- Content -->
    <div v-else-if="isCoach" class="px-4 py-6 max-w-2xl mx-auto space-y-6">
      <!-- Success Message -->
      <Transition name="fade">
        <div v-if="showSuccess" class="bg-glass-green/20 border border-glass-green/50 rounded-xl p-4 flex items-center gap-3">
          <span class="text-2xl">✅</span>
          <p class="text-glass-green font-semibold">{{ language === 'es' ? '¡Plan guardado!' : 'Plan saved!' }}</p>
        </div>
      </Transition>

      <!-- Date & Session Selection -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <h3 class="font-bold text-white mb-3">{{ language === 'es' ? 'Fecha y Sesión' : 'Date & Session' }}</h3>
        
        <div class="grid grid-cols-2 gap-3 mb-3">
          <select
            v-model="selectedDate"
            class="px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none"
          >
            <option v-for="opt in dateOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          
          <select
            v-model="selectedSession"
            class="px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none"
          >
            <option value="early">5:30 PM - 7:00 PM</option>
            <option value="late">7:00 PM - 8:30 PM</option>
          </select>
        </div>

        <input
          v-model="planTitle"
          type="text"
          :placeholder="language === 'es' ? 'Título del plan (opcional)' : 'Plan title (optional)'"
          class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
        />
      </div>

      <!-- Selected Skills Preview -->
      <div v-if="selectedSkills.length > 0" class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-white">{{ language === 'es' ? 'Trucos Seleccionados' : 'Selected Tricks' }}</h3>
          <span class="px-2 py-1 bg-gold-400/20 text-gold-400 text-sm font-bold rounded-full">
            {{ selectedSkills.length }}
          </span>
        </div>
        <div class="space-y-2">
          <div
            v-for="skillId in selectedSkills"
            :key="skillId"
            class="p-2 bg-gray-800 rounded-lg flex items-start gap-2"
          >
            <div class="flex-1">
              <div class="flex items-center gap-2">
                <span class="text-white text-sm font-semibold">
                  {{ language === 'es' ? getSkillById(skillId)?.name_es || getSkillById(skillId)?.name : getSkillById(skillId)?.name }}
                </span>
                <button @click="toggleSkill(skillId)" class="text-flame-500 hover:text-flame-400">×</button>
              </div>
              <div v-if="getSkillById(skillId)?.motor_skills?.length" class="flex flex-wrap gap-1 mt-1">
                <span 
                  v-for="tag in getSkillById(skillId)?.motor_skills" 
                  :key="tag"
                  class="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Skills Selection (Niik Library) - Auto-synced from source data -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-bold text-white">{{ language === 'es' ? 'Seleccionar Trucos' : 'Select Tricks' }}</h3>
        </div>

        <!-- Difficulty Filter -->
        <div class="mb-4">
          <p class="text-xs text-gray-500 mb-2">{{ language === 'es' ? 'Nivel de Dificultad' : 'Difficulty Level' }}</p>
          <div class="flex gap-2">
            <button
              @click="skillDifficultyFilter = ''"
              class="px-3 py-1.5 rounded-xl text-xs font-semibold"
              :class="!skillDifficultyFilter ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
            >
              {{ language === 'es' ? 'Todos' : 'All' }}
            </button>
            <button
              @click="skillDifficultyFilter = 'beginner'"
              class="flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold"
              :class="skillDifficultyFilter === 'beginner' ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400'"
            >
              🌱 {{ language === 'es' ? 'Principiante' : 'Beginner' }}
            </button>
            <button
              @click="skillDifficultyFilter = 'intermediate'"
              class="flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold"
              :class="skillDifficultyFilter === 'intermediate' ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-400'"
            >
              ⚡ {{ language === 'es' ? 'Intermedio' : 'Intermediate' }}
            </button>
            <button
              @click="skillDifficultyFilter = 'advanced'"
              class="flex-1 px-3 py-1.5 rounded-xl text-xs font-semibold"
              :class="skillDifficultyFilter === 'advanced' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400'"
            >
              🔥 {{ language === 'es' ? 'Avanzado' : 'Advanced' }}
            </button>
          </div>
        </div>

        <!-- Category Filter - Instagram Stories Style with Ramp Images -->
        <div class="mb-4">
          <p class="text-xs text-gray-500 mb-2">{{ language === 'es' ? 'Categoría' : 'Category' }}</p>
          <div class="flex gap-3 justify-center flex-wrap">
            <!-- Activity Type Icons with Ramp Images (click again to deselect) -->
            <button
              v-for="cat in skillCategories"
              :key="cat"
              @click="skillCategoryFilter = skillCategoryFilter === cat ? '' : cat"
              class="flex flex-col items-center gap-1 flex-shrink-0"
            >
              <div 
                class="p-0.5 rounded-full transition-all"
                :class="skillCategoryFilter === cat 
                  ? 'bg-gradient-to-br from-gold-400 via-flame-500 to-glass-purple' 
                  : 'bg-gray-700 hover:bg-gray-600'"
              >
                <RampIcon :type="activityLabels[cat]?.rampType || 'all'" :size="52" />
              </div>
              <span 
                class="text-[10px] font-semibold mt-0.5 max-w-20 text-center leading-tight" 
                :class="skillCategoryFilter === cat ? 'text-gold-400' : 'text-gray-400'"
              >
                {{ language === 'es' ? activityLabels[cat]?.name_es : activityLabels[cat]?.name }}
              </span>
            </button>
          </div>
        </div>

        <!-- Skills List (flat) -->
        <div class="space-y-2">
          <button
            v-for="skill in filteredSkills"
            :key="skill.id"
            @click="toggleSkill(skill.id)"
            class="w-full p-2 rounded-xl text-left transition-all"
            :class="selectedSkills.includes(skill.id) 
              ? 'bg-gold-400/20 border border-gold-400' 
              : 'bg-gray-800 border border-gray-700 hover:border-gray-600'"
          >
            <div class="flex items-center justify-between">
              <span :class="selectedSkills.includes(skill.id) ? 'text-gold-400 font-semibold' : 'text-gray-300'" class="text-sm">
                {{ language === 'es' ? skill.name_es || skill.name : skill.name }}
              </span>
              <div class="flex gap-1">
                <span v-if="skill.category" class="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-400">
                  {{ language === 'es' 
                    ? (activityLabels[skill.category as ActivityCategory]?.name_es || skill.category) 
                    : (activityLabels[skill.category as ActivityCategory]?.name || skill.category) }}
                </span>
                <span class="px-1.5 py-0.5 rounded text-[10px]" :class="{
                  'bg-green-500/20 text-green-400': skill.difficulty === 'beginner',
                  'bg-yellow-500/20 text-yellow-400': skill.difficulty === 'intermediate',
                  'bg-red-500/20 text-red-400': skill.difficulty === 'advanced'
                }">
                  {{ skill.difficulty }}
                </span>
              </div>
            </div>
            <div v-if="skill.motor_skills?.length" class="flex flex-wrap gap-1 mt-1">
              <span 
                v-for="tag in skill.motor_skills.slice(0, 3)" 
                :key="tag"
                class="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]"
              >
                {{ tag }}
              </span>
              <span v-if="skill.motor_skills.length > 3" class="text-[10px] text-gray-500">
                +{{ skill.motor_skills.length - 3 }}
              </span>
            </div>
          </button>
        </div>
      </div>

      <!-- Warmup Focus Areas -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <h3 class="font-bold text-white mb-3">{{ language === 'es' ? 'Calentamiento - Enfoque' : 'Warmup - Focus Area' }}</h3>
        
        <div class="grid grid-cols-4 gap-2 mb-3">
          <button
            v-for="focus in warmupFocusAreas"
            :key="focus.id"
            @click="toggleWarmupFocus(focus.id)"
            class="p-2 rounded-xl text-center transition-all border"
            :class="selectedWarmupFocus.includes(focus.id) 
              ? 'bg-gold-400/20 border-gold-400 text-gold-400' 
              : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'"
          >
            <span class="text-lg block">{{ focus.icon }}</span>
            <span class="text-xs">{{ language === 'es' ? focus.name_es : focus.name }}</span>
          </button>
        </div>
        
        <div v-if="selectedWarmupFocus.length > 0" class="flex flex-wrap gap-1 mb-2">
          <span 
            v-for="focusId in selectedWarmupFocus" 
            :key="focusId"
            class="px-2 py-1 bg-gold-400 text-black text-xs font-semibold rounded-full"
          >
            {{ warmupFocusAreas.find(f => f.id === focusId)?.icon }}
            {{ language === 'es' 
              ? warmupFocusAreas.find(f => f.id === focusId)?.name_es 
              : warmupFocusAreas.find(f => f.id === focusId)?.name 
            }}
          </span>
        </div>
      </div>

      <!-- Warmup Exercises -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <h3 class="font-bold text-white mb-3">{{ language === 'es' ? 'Ejercicios de Calentamiento' : 'Warmup Exercises' }}</h3>
        
        <div class="space-y-2 max-h-60 overflow-y-auto">
          <button
            v-for="exercise in warmupExercises"
            :key="exercise.id"
            @click="toggleWarmupExercise(exercise.id)"
            class="w-full p-3 rounded-lg flex items-center gap-3 transition-all text-left"
            :class="selectedWarmupExercises.includes(exercise.id) 
              ? 'bg-glass-green/20 border border-glass-green/50' 
              : 'bg-gray-800 border border-gray-700 hover:border-gray-600'"
          >
            <div 
              class="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
              :class="selectedWarmupExercises.includes(exercise.id) ? 'bg-glass-green' : 'bg-gray-700'"
            >
              <svg v-if="selectedWarmupExercises.includes(exercise.id)" class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
              <span v-else class="text-xs text-gray-400">{{ exercise.id }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate" :class="selectedWarmupExercises.includes(exercise.id) ? 'text-white' : 'text-gray-300'">
                {{ exercise.name }}
              </p>
              <p class="text-xs text-gray-500 truncate">{{ exercise.skills?.join(', ') }}</p>
            </div>
          </button>
        </div>
        
        <div v-if="selectedWarmupExercises.length > 0" class="mt-3 pt-3 border-t border-gray-700">
          <p class="text-sm text-gray-400 mb-2">
            {{ selectedWarmupExercises.length }} {{ language === 'es' ? 'ejercicios seleccionados' : 'exercises selected' }}
          </p>
          <div class="flex flex-wrap gap-1">
            <span 
              v-for="exId in selectedWarmupExercises" 
              :key="exId"
              class="px-2 py-1 bg-glass-green text-white text-xs font-semibold rounded-full"
            >
              {{ warmupExercises.find(e => e.id === exId)?.name }}
            </span>
          </div>
        </div>
      </div>

      <!-- Park-based Class Planning -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <h3 class="font-bold text-white mb-3">{{ language === 'es' ? 'Planificación por Parque' : 'Park-based Planning' }}</h3>
        
        <select
          v-model="selectedPark"
          class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none mb-3"
        >
          <option :value="null">{{ language === 'es' ? 'Seleccionar parque...' : 'Select park...' }}</option>
          <option v-for="park in parks" :key="park.id" :value="park.id">
            {{ park.name }} ({{ park.type }})
          </option>
        </select>
        
        <div v-if="selectedParkObstacles" class="space-y-3">
          <div 
            v-for="(classes, obstacle) in selectedParkObstacles" 
            :key="obstacle"
            class="bg-gray-800 rounded-lg p-3"
          >
            <h4 class="font-semibold text-gold-400 capitalize mb-2">{{ obstacle.replace(/_/g, ' ') }}</h4>
            <div v-for="(tricks, classKey) in classes" :key="classKey" class="mb-2 last:mb-0">
              <p class="text-xs text-gray-500 mb-1">{{ classKey.replace('_', ' ').toUpperCase() }}</p>
              <div class="flex flex-wrap gap-1">
                <span 
                  v-for="trick in tricks" 
                  :key="trick"
                  class="px-2 py-1 bg-gray-700 text-white text-xs rounded-full"
                >
                  {{ trick }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Notes -->
      <div class="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-4">
        <h3 class="font-bold text-white">{{ language === 'es' ? 'Notas' : 'Notes' }}</h3>
        
        <div>
          <label class="block text-sm text-gray-400 mb-1">{{ language === 'es' ? 'Calentamiento' : 'Warmup' }}</label>
          <textarea
            v-model="warmupNotes"
            rows="2"
            class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none resize-none"
            :placeholder="language === 'es' ? 'Notas de calentamiento...' : 'Warmup notes...'"
          ></textarea>
        </div>

        <div>
          <label class="block text-sm text-gray-400 mb-1">{{ language === 'es' ? 'Actividad Principal' : 'Main Activity' }}</label>
          <textarea
            v-model="mainNotes"
            rows="3"
            class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none resize-none"
            :placeholder="language === 'es' ? 'Notas de la actividad principal...' : 'Main activity notes...'"
          ></textarea>
        </div>
      </div>

      <!-- Save Button -->
      <button
        @click="savePlan"
        :disabled="saving"
        class="w-full py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold rounded-xl disabled:opacity-50"
      >
        {{ saving ? '...' : (language === 'es' ? 'Guardar Plan' : 'Save Plan') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
