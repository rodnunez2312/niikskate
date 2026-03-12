<script setup lang="ts">
import { format, addDays, isTuesday, isThursday, isSaturday } from 'date-fns'
import { es } from 'date-fns/locale'

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

// State
const activeTab = ref<'plan' | 'tricks' | 'history'>('plan')
const loading = ref(true)
const saving = ref(false)
const skills = ref<any[]>([])
const { syncing, syncNiikLibrary: doSyncNiikLibrary } = useNiikLibrarySync()
const classPlans = ref<any[]>([])
const selectedDate = ref(new Date())
const selectedSession = ref<'early' | 'late'>('early')

// Plan form
const plan = ref({
  title: '',
  warmup_notes: '',
  main_activity_notes: '',
  planned_skills: [] as string[]
})

// Skill filters
const searchQuery = ref('')
const selectedCategory = ref('')
const selectedDifficulty = ref('')

// Activity type categories matching NEW CATEGORY column in Excel (ordered)
const categories: ActivityCategory[] = [
  'excercise',
  'iniciacion',
  'street_piso',
  'street_obstaculos',
  'vert_bowl'
]
const difficulties = ['beginner', 'intermediate', 'advanced']

// Import labels from types
import type { ActivityCategory } from '~/types'
import { ACTIVITY_CATEGORY_LABELS } from '~/types'
const categoryLabels = ACTIVITY_CATEGORY_LABELS

interface ExcelTrickMeta {
  truco?: string
  categoria?: string
  dirigido?: string
  comentarios?: string
  url?: string
  new_category?: string
  habilidad_motriz_habilitada?: string[]
}

interface ExcelTrickLibrary {
  tricks: Array<ExcelTrickMeta & { name?: string; name_es?: string }>
}

const excelTricksByName = ref<Record<string, ExcelTrickMeta>>({})

onMounted(async () => {
  // Load skills first (fast)
  await Promise.all([fetchSkills(), fetchClassPlans(), loadExcelTrickLibrary()])
  // Set date to next class day
  while (!isClassDay(selectedDate.value)) {
    selectedDate.value = addDays(selectedDate.value, 1)
  }
  await loadExistingPlan()
  
  // Background sync: update from source data without blocking UI
  autoSyncNiikLibrary().then(() => fetchSkills())
})

const normalizeTrickKey = (value?: string) => (value || '').toLowerCase().trim()

const loadExcelTrickLibrary = async () => {
  try {
    const data = await $fetch<ExcelTrickLibrary>('/data/niik-trick-library.json', {
      headers: { 'Cache-Control': 'no-cache' }
    })
    const map: Record<string, ExcelTrickMeta> = {}
    for (const trick of data?.tricks || []) {
      const keys = [trick.truco, trick.name_es, trick.name]
        .map(normalizeTrickKey)
        .filter(Boolean)
      for (const key of keys) map[key] = trick
    }
    excelTricksByName.value = map
  } catch (e) {
    console.error('Error loading Excel trick metadata:', e)
  }
}

const fetchSkills = async () => {
  loading.value = true
  try {
    const { data } = await client
      .from('skills_library')
      .select('*')
      .eq('is_active', true)
      .order('category')
      .order('sort_order')
    
    skills.value = data || []
    
    // Debug: Log unique categories in database
    const uniqueCats = [...new Set(skills.value.map(s => s.category))]
    console.log('Categories in database:', uniqueCats)
    console.log('Expected filter categories:', categories)
  } catch (e) {
    console.error('Error fetching skills:', e)
  } finally {
    loading.value = false
  }
}

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

// Force sync for debugging - reloads skills after sync
const forceSyncLibrary = async () => {
  console.log('Force syncing Niik Library...')
  const res = await doSyncNiikLibrary()
  if (res.ok) {
    await fetchSkills()
    alert(`Sync complete!\n${res.inserted} new, ${res.updated} updated.\n\nCheck console for category info.`)
  } else {
    alert('Sync failed: ' + res.message)
  }
}

const fetchClassPlans = async () => {
  try {
    const { data } = await client
      .from('class_plans')
      .select('*')
      .eq('coach_id', user.value?.id)
      .order('plan_date', { ascending: false })
      .limit(20)
    
    classPlans.value = data || []
  } catch (e) {
    console.error('Error fetching plans:', e)
  }
}

const loadExistingPlan = async () => {
  const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
  const existingPlan = classPlans.value.find(
    p => p.plan_date === dateStr && p.time_slot === selectedSession.value
  )
  
  if (existingPlan) {
    plan.value = {
      title: existingPlan.title || '',
      warmup_notes: existingPlan.warmup_notes || '',
      main_activity_notes: existingPlan.main_activity_notes || '',
      planned_skills: existingPlan.planned_skills || []
    }
  } else {
    plan.value = {
      title: '',
      warmup_notes: '',
      main_activity_notes: '',
      planned_skills: []
    }
  }
}

// Check if date is a class day
const isClassDay = (date: Date) => {
  return isTuesday(date) || isThursday(date) || isSaturday(date)
}

// Navigate dates
const prevDate = () => {
  let newDate = addDays(selectedDate.value, -1)
  while (!isClassDay(newDate)) {
    newDate = addDays(newDate, -1)
  }
  selectedDate.value = newDate
  loadExistingPlan()
}

const nextDate = () => {
  let newDate = addDays(selectedDate.value, 1)
  while (!isClassDay(newDate)) {
    newDate = addDays(newDate, 1)
  }
  selectedDate.value = newDate
  loadExistingPlan()
}

// Toggle skill selection
const toggleSkill = (skillId: string) => {
  const index = plan.value.planned_skills.indexOf(skillId)
  if (index >= 0) {
    plan.value.planned_skills.splice(index, 1)
  } else {
    plan.value.planned_skills.push(skillId)
  }
}

// Save plan
const savePlan = async () => {
  saving.value = true
  try {
    const dateStr = format(selectedDate.value, 'yyyy-MM-dd')
    
    const { error } = await client
      .from('class_plans')
      .upsert({
        coach_id: user.value?.id,
        plan_date: dateStr,
        time_slot: selectedSession.value,
        title: plan.value.title,
        warmup_notes: plan.value.warmup_notes,
        main_activity_notes: plan.value.main_activity_notes,
        planned_skills: plan.value.planned_skills
      }, {
        onConflict: 'coach_id,plan_date,time_slot'
      })
    
    if (error) throw error
    
    await fetchClassPlans()
    alert(language.value === 'es' ? '¡Plan guardado!' : 'Plan saved!')
  } catch (e) {
    console.error('Error saving plan:', e)
  } finally {
    saving.value = false
  }
}

// Filtered skills
const filteredSkills = computed(() => {
  return skills.value.filter(skill => {
    const matchesSearch = !searchQuery.value || 
      skill.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      skill.name_es?.toLowerCase().includes(searchQuery.value.toLowerCase())
    const matchesCategory = !selectedCategory.value || skill.category === selectedCategory.value
    const matchesDifficulty = !selectedDifficulty.value || skill.difficulty === selectedDifficulty.value
    return matchesSearch && matchesCategory && matchesDifficulty
  })
})

// Get selected skills details
const selectedSkillsDetails = computed(() => {
  return skills.value.filter(s => plan.value.planned_skills.includes(s.id))
})

const getTrickMeta = (skill: any) => {
  return excelTricksByName.value[normalizeTrickKey(skill?.name_es || skill?.name)]
    || excelTricksByName.value[normalizeTrickKey(skill?.name)]
}

const trickDetailSkill = ref<any | null>(null)
const trickDetailMeta = computed(() => trickDetailSkill.value ? getTrickMeta(trickDetailSkill.value) : undefined)
const openTrickDetail = (skill: any) => { trickDetailSkill.value = skill }
const closeTrickDetail = () => { trickDetailSkill.value = null }

const buildBenefits = (skill: any, meta?: ExcelTrickMeta) => {
  const motorSkills = meta?.habilidad_motriz_habilitada?.length
    ? meta.habilidad_motriz_habilitada
    : (skill.motor_skills || [])
  const areaByCategory: Record<string, string> = {
    excercise: language.value === 'es' ? 'base física y control corporal' : 'physical foundation and body control',
    iniciacion: language.value === 'es' ? 'street piso y control base' : 'street flatground and board fundamentals',
    street_piso: language.value === 'es' ? 'street obstáculos y transiciones' : 'street obstacles and transitions',
    street_obstaculos: language.value === 'es' ? 'líneas técnicas en obstáculos' : 'technical obstacle lines',
    vert_bowl: language.value === 'es' ? 'trucos de coping y líneas más rápidas' : 'coping tricks and faster transition lines',
    surf_skate: language.value === 'es' ? 'carving avanzado y flow' : 'advanced carving and flow'
  }
  const unlockedArea = areaByCategory[meta?.new_category || skill.category] || (language.value === 'es' ? 'variaciones más avanzadas' : 'more advanced variations')
  const skillName = language.value === 'es' ? (skill.name_es || skill.name) : skill.name
  const bodyFocus = motorSkills.length ? motorSkills.join(', ') : (language.value === 'es' ? 'balance y coordinación' : 'balance and coordination')

  return language.value === 'es'
    ? [
        `Desarrolla ${bodyFocus}.`,
        `Te ayuda a desbloquear ${unlockedArea}.`,
        `Mejora tu consistencia y confianza para repetir ${skillName} bajo presión.`
      ]
    : [
        `Builds ${bodyFocus}.`,
        `Helps unlock ${unlockedArea}.`,
        `Improves consistency and confidence to repeat ${skillName} under pressure.`
      ]
}

const difficultyStars = (difficulty?: string) => {
  if (difficulty === 'advanced') return '★★★'
  if (difficulty === 'intermediate') return '★★'
  return '★'
}

const categoryTagClass = (category?: string) => {
  const map: Record<string, string> = {
    excercise: 'bg-sky-500/20 text-sky-300',
    iniciacion: 'bg-teal-500/20 text-teal-300',
    street_piso: 'bg-indigo-500/20 text-indigo-300',
    street_obstaculos: 'bg-amber-500/20 text-amber-300',
    vert_bowl: 'bg-rose-500/20 text-rose-300',
    surf_skate: 'bg-cyan-500/20 text-cyan-300',
    fundamentals: 'bg-fuchsia-500/20 text-fuchsia-300',
    flatground: 'bg-blue-500/20 text-blue-300',
    street: 'bg-orange-500/20 text-orange-300',
    bowl: 'bg-pink-500/20 text-pink-300',
    vert: 'bg-red-500/20 text-red-300',
    safety: 'bg-lime-500/20 text-lime-300'
  }
  return map[category || ''] || 'bg-purple-500/20 text-purple-300'
}

// Watch session changes
watch(selectedSession, () => loadExistingPlan())
watch(activeTab, () => {
  if (activeTab.value !== 'tricks') closeTrickDetail()
})
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4 pt-safe pb-4">
      <div class="max-w-lg mx-auto pt-4">
        <h1 class="text-2xl font-bold text-white mb-4">
          {{ language === 'es' ? 'Planeación de Clases' : 'Class Planning' }}
        </h1>
        
        <!-- Tabs -->
        <div class="flex gap-2">
          <button
            @click="activeTab = 'plan'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'plan' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Planear' : 'Plan' }}
          </button>
          <button
            @click="activeTab = 'tricks'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'tricks' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Trucos' : 'Tricks' }}
          </button>
          <button
            @click="activeTab = 'history'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'history' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Historial' : 'History' }}
          </button>
        </div>
      </div>
    </header>

    <div class="px-4 max-w-lg mx-auto py-4">
      <!-- Plan Tab -->
      <div v-if="activeTab === 'plan'">
        <!-- Date Selector -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <div class="flex items-center justify-between mb-3">
            <button @click="prevDate" class="p-2 bg-gray-800 rounded-lg">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div class="text-center">
              <p class="font-bold text-white capitalize">
                {{ format(selectedDate, 'EEEE', { locale: language === 'es' ? es : undefined }) }}
              </p>
              <p class="text-sm text-gray-400">
                {{ format(selectedDate, 'd MMMM yyyy', { locale: language === 'es' ? es : undefined }) }}
              </p>
            </div>
            <button @click="nextDate" class="p-2 bg-gray-800 rounded-lg">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          
          <!-- Session Toggle -->
          <div class="grid grid-cols-2 gap-2">
            <button
              @click="selectedSession = 'early'"
              class="py-2 rounded-lg font-semibold text-sm transition-all"
              :class="selectedSession === 'early' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
            >
              5:30 PM - 7:00 PM
            </button>
            <button
              @click="selectedSession = 'late'"
              class="py-2 rounded-lg font-semibold text-sm transition-all"
              :class="selectedSession === 'late' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
            >
              7:00 PM - 8:30 PM
            </button>
          </div>
        </div>

        <!-- Plan Form -->
        <div class="space-y-4">
          <!-- Title -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <label class="block text-sm text-gray-400 mb-2">
              {{ language === 'es' ? 'Título de la Clase' : 'Class Title' }}
            </label>
            <input
              v-model="plan.title"
              type="text"
              :placeholder="language === 'es' ? 'Ej: Introducción al Ollie' : 'E.g., Intro to Ollie'"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
            />
          </div>

          <!-- Warmup -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <label class="block text-sm text-gray-400 mb-2">
              🔥 {{ language === 'es' ? 'Calentamiento' : 'Warmup' }}
            </label>
            <textarea
              v-model="plan.warmup_notes"
              rows="3"
              :placeholder="language === 'es' ? 'Ejercicios de calentamiento...' : 'Warmup exercises...'"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
            ></textarea>
          </div>

          <!-- Selected Tricks -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div class="flex items-center justify-between mb-3">
              <label class="text-sm text-gray-400">
                🛹 {{ language === 'es' ? 'Trucos Seleccionados' : 'Selected Tricks' }} ({{ plan.planned_skills.length }})
              </label>
              <button
                @click="activeTab = 'tricks'"
                class="text-gold-400 text-sm font-semibold"
              >
                {{ language === 'es' ? '+ Agregar' : '+ Add' }}
              </button>
            </div>
            
            <div v-if="selectedSkillsDetails.length === 0" class="text-center py-4 text-gray-500">
              {{ language === 'es' ? 'No hay trucos seleccionados' : 'No tricks selected' }}
            </div>
            
            <div v-else class="space-y-2">
              <div
                v-for="skill in selectedSkillsDetails"
                :key="skill.id"
                class="flex items-center gap-3 p-2 bg-gray-800 rounded-lg"
              >
                <span class="w-8 h-8 rounded-full bg-gold-400/20 flex items-center justify-center text-gold-400 text-sm">
                  🛹
                </span>
                <div class="flex-1">
                  <p class="text-white text-sm font-semibold">
                    {{ language === 'es' ? skill.name_es || skill.name : skill.name }}
                  </p>
                  <p class="text-xs text-gray-500">{{ skill.category }} • {{ difficultyStars(skill.difficulty) }}</p>
                  <div v-if="skill.motor_skills?.length" class="flex flex-wrap gap-1 mt-1">
                    <span 
                      v-for="tag in skill.motor_skills" 
                      :key="tag"
                      class="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px]"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>
                <button
                  @click="toggleSkill(skill.id)"
                  class="p-1 text-flame-500"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Main Activity -->
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <label class="block text-sm text-gray-400 mb-2">
              📝 {{ language === 'es' ? 'Actividad Principal / Notas' : 'Main Activity / Notes' }}
            </label>
            <textarea
              v-model="plan.main_activity_notes"
              rows="4"
              :placeholder="language === 'es' ? 'Notas para la clase...' : 'Class notes...'"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
            ></textarea>
          </div>

          <!-- Save Button -->
          <button
            @click="savePlan"
            :disabled="saving"
            class="w-full py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold rounded-xl"
          >
            {{ saving 
              ? (language === 'es' ? 'Guardando...' : 'Saving...') 
              : (language === 'es' ? 'Guardar Plan' : 'Save Plan') 
            }}
          </button>
        </div>
      </div>

      <!-- Tricks Tab -->
      <div v-else-if="activeTab === 'tricks'">
        <!-- Force Sync Button (for debugging) -->
        <div class="mb-4 flex items-center justify-between">
          <span class="text-xs text-gray-500">{{ skills.length }} tricks loaded</span>
          <button
            @click="forceSyncLibrary"
            :disabled="syncing"
            class="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
          >
            {{ syncing ? 'Syncing...' : 'Force Sync Categories' }}
          </button>
        </div>
        
        <!-- Search -->
        <div class="mb-4">
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="language === 'es' ? 'Buscar truco...' : 'Search trick...'"
            class="w-full px-4 py-3 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500"
          />
        </div>

        <!-- Difficulty Filter -->
        <div class="mb-4">
          <p class="text-xs text-gray-500 mb-2">{{ language === 'es' ? 'Nivel de Dificultad' : 'Difficulty Level' }}</p>
          <div class="flex gap-2">
            <button
              @click="selectedDifficulty = ''"
              class="px-3 py-2 rounded-xl text-sm font-semibold"
              :class="!selectedDifficulty ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
            >
              {{ language === 'es' ? 'Todos' : 'All' }}
            </button>
            <button
              @click="selectedDifficulty = 'beginner'"
              class="flex-1 px-3 py-2 rounded-xl text-sm font-semibold"
              :class="selectedDifficulty === 'beginner' ? 'bg-green-500 text-white' : 'bg-gray-800 text-gray-400'"
            >
              🌱 {{ language === 'es' ? 'Principiante' : 'Beginner' }}
            </button>
            <button
              @click="selectedDifficulty = 'intermediate'"
              class="flex-1 px-3 py-2 rounded-xl text-sm font-semibold"
              :class="selectedDifficulty === 'intermediate' ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-gray-400'"
            >
              ⚡ {{ language === 'es' ? 'Intermedio' : 'Intermediate' }}
            </button>
            <button
              @click="selectedDifficulty = 'advanced'"
              class="flex-1 px-3 py-2 rounded-xl text-sm font-semibold"
              :class="selectedDifficulty === 'advanced' ? 'bg-red-500 text-white' : 'bg-gray-800 text-gray-400'"
            >
              🔥 {{ language === 'es' ? 'Avanzado' : 'Advanced' }}
            </button>
          </div>
        </div>

        <!-- Category Filter - Instagram Stories Style with Ramp Images -->
        <div class="mb-6">
          <p class="text-xs text-gray-500 mb-3">{{ language === 'es' ? 'Categoría' : 'Category' }}</p>
          <div class="grid grid-cols-5 gap-2 w-full">
            <!-- Activity Type Icons with Ramp Images (click again to deselect) -->
            <button
              v-for="cat in categories"
              :key="cat"
              @click="selectedCategory = selectedCategory === cat ? '' : cat"
              class="flex flex-col items-center gap-1"
            >
              <div 
                class="p-0.5 rounded-full transition-all"
                :class="selectedCategory === cat 
                  ? 'bg-gradient-to-br from-gold-400 via-flame-500 to-glass-purple' 
                  : 'bg-gray-700 hover:bg-gray-600'"
              >
                <RampIcon :type="categoryLabels[cat]?.rampType || 'all'" :size="68" />
              </div>
              <span 
                class="text-[10px] font-semibold mt-0.5 w-full text-center leading-tight" 
                :class="selectedCategory === cat ? 'text-gold-400' : 'text-gray-400'"
              >
                {{ language === 'es' ? categoryLabels[cat]?.name_es : categoryLabels[cat]?.name }}
              </span>
            </button>
          </div>
        </div>

        <!-- Skills List -->
        <div v-if="loading" class="py-8 text-center">
          <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
        </div>

        <!-- Flat list of all filtered skills -->
        <div v-else class="space-y-2">
          <div
            v-for="skill in filteredSkills"
            :key="skill.id"
            class="w-full p-2 rounded-xl transition-all border"
            :class="plan.planned_skills.includes(skill.id) 
              ? 'bg-gold-400/20 border-gold-400' 
              : 'bg-gray-900 border-gray-800 hover:border-gray-700'"
          >
            <div class="w-full flex items-start gap-3 text-left">
              <button
                @click="toggleSkill(skill.id)"
                class="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                :class="plan.planned_skills.includes(skill.id) ? 'bg-gold-400 text-black' : 'bg-gray-800'"
              >
                <svg v-if="plan.planned_skills.includes(skill.id)" class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
              </button>
              <div 
                class="flex-1"
              >
                <p :class="plan.planned_skills.includes(skill.id) ? 'text-white' : 'text-gray-300'">
                  {{ language === 'es' ? skill.name_es || skill.name : skill.name }}
                </p>
                <button
                  @click="openTrickDetail(skill)"
                  class="mt-1 px-2 py-0.5 rounded-md text-[11px] leading-tight font-semibold bg-gray-800 text-blue-300 hover:bg-gray-700"
                >
                  {{ language === 'es' ? 'Ver detalle' : 'View details' }}
                </button>
              </div>
              <div class="flex flex-col gap-1 items-end">
                <span v-if="skill.category" class="px-2 py-0.5 rounded text-xs" :class="categoryTagClass(skill.category)">
                  {{ language === 'es' 
                    ? (categoryLabels[skill.category as ActivityCategory]?.name_es || skill.category) 
                    : (categoryLabels[skill.category as ActivityCategory]?.name || skill.category) }}
                </span>
                <span class="px-2 py-0.5 rounded text-xs bg-green-500/20 text-green-400">
                  {{ difficultyStars(skill.difficulty) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Back to Plan Button -->
        <div v-if="plan.planned_skills.length > 0" class="fixed bottom-20 left-0 right-0 px-4">
          <div class="max-w-lg mx-auto">
            <button
              @click="activeTab = 'plan'"
              class="w-full py-3 bg-gold-400 text-black font-bold rounded-xl"
            >
              {{ language === 'es' ? `Volver al Plan (${plan.planned_skills.length} trucos)` : `Back to Plan (${plan.planned_skills.length} tricks)` }}
            </button>
          </div>
        </div>

        <!-- Trick Detail Modal -->
        <div
          v-if="trickDetailSkill"
          class="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-3"
          @click="closeTrickDetail"
        >
          <div
            class="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl p-4 max-h-[85vh] overflow-y-auto"
            @click.stop
          >
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-white font-semibold">
                {{ language === 'es' ? trickDetailSkill.name_es || trickDetailSkill.name : trickDetailSkill.name }}
              </h3>
              <button
                @click="closeTrickDetail"
                class="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 hover:text-white"
              >
                ×
              </button>
            </div>

            <div class="grid grid-cols-1 gap-2 text-sm">
              <p class="text-gray-300"><span class="text-gray-500">Truco:</span> {{ trickDetailMeta?.truco || (language === 'es' ? trickDetailSkill.name_es || trickDetailSkill.name : trickDetailSkill.name) }}</p>
              <p class="text-gray-300"><span class="text-gray-500">categoria:</span> {{ trickDetailMeta?.categoria || trickDetailSkill.difficulty || '-' }}</p>
              <p class="text-gray-300"><span class="text-gray-500">dirigido:</span> {{ trickDetailMeta?.dirigido || '-' }}</p>
              <p class="text-gray-300"><span class="text-gray-500">comentarios:</span> {{ trickDetailMeta?.comentarios || trickDetailSkill.description || '-' }}</p>
              <p class="text-gray-300">
                <span class="text-gray-500">url:</span>
                <a
                  v-if="trickDetailMeta?.url"
                  :href="trickDetailMeta.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-blue-400 underline break-all ml-1"
                >
                  {{ trickDetailMeta.url }}
                </a>
                <span v-else>-</span>
              </p>
              <p class="text-gray-300"><span class="text-gray-500">new category:</span> {{ trickDetailMeta?.new_category || trickDetailSkill.category || '-' }}</p>
              <p class="text-gray-300">
                <span class="text-gray-500">habilidad motriz habilitada:</span>
                {{ (trickDetailMeta?.habilidad_motriz_habilitada?.length ? trickDetailMeta.habilidad_motriz_habilitada : trickDetailSkill.motor_skills || []).join(', ') || '-' }}
              </p>
            </div>

            <div class="pt-2 mt-3 border-t border-gray-800">
              <p class="text-xs uppercase tracking-wide text-gold-400 mb-1">
                {{ language === 'es' ? 'Beneficios y desbloqueos' : 'Benefits and unlocks' }}
              </p>
              <ul class="text-sm text-gray-300 space-y-1">
                <li v-for="benefit in buildBenefits(trickDetailSkill, trickDetailMeta)" :key="benefit">• {{ benefit }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- History Tab -->
      <div v-else-if="activeTab === 'history'">
        <div v-if="classPlans.length === 0" class="text-center py-8">
          <p class="text-4xl mb-2">📋</p>
          <p class="text-gray-500">{{ language === 'es' ? 'No hay planes guardados' : 'No saved plans' }}</p>
        </div>

        <div v-else class="space-y-3">
          <div
            v-for="p in classPlans"
            :key="p.id"
            class="bg-gray-900 border border-gray-800 rounded-xl p-4"
          >
            <div class="flex items-start justify-between mb-2">
              <div>
                <p class="font-bold text-white">{{ p.title || (language === 'es' ? 'Sin título' : 'Untitled') }}</p>
                <p class="text-sm text-gray-400 capitalize">
                  {{ format(new Date(p.plan_date), 'EEEE d MMM', { locale: language === 'es' ? es : undefined }) }}
                  • {{ p.time_slot === 'early' ? '5:30 PM' : '7:00 PM' }}
                </p>
              </div>
              <span class="px-2 py-1 bg-glass-green/20 text-glass-green text-xs rounded-full">
                {{ p.planned_skills?.length || 0 }} {{ language === 'es' ? 'trucos' : 'tricks' }}
              </span>
            </div>
            <p v-if="p.warmup_notes" class="text-sm text-gray-500 line-clamp-2">
              {{ p.warmup_notes }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
