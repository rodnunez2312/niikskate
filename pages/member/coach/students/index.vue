<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

const loading = ref(true)
const students = ref<any[]>([])
const searchQuery = ref('')
const userRole = ref<string | null>(null)

onMounted(async () => {
  if (user.value) {
    const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
    userRole.value = data?.role ?? null
    if (data?.role === 'admin') {
      await navigateTo('/member/admin/academy/users', { replace: true })
      return
    }
  }
  await fetchStudents()
})

const fetchStudents = async () => {
  loading.value = true
  try {
    const { data } = await client
      .from('profiles')
      .select('id, full_name, created_at, skill_level, avatar_url')
      .eq('role', 'customer')
      .eq('is_active', true)
      .order('full_name')
    students.value = data || []
  } catch (e) {
    console.error('Error fetching students:', e)
  } finally {
    loading.value = false
  }
}

const filteredStudents = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return students.value
  return students.value.filter(s => s.full_name?.toLowerCase().includes(q))
})

const formatStartDate = (dateStr: string) => {
  if (!dateStr) return '—'
  const locale = language.value === 'es' ? es : undefined
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale })
}

const skillBadgeClass = (level: string | null | undefined) => {
  const l = (level || '').toLowerCase()
  if (l === 'beginner') return 'bg-green-500/20 text-green-300'
  if (l === 'intermediate') return 'bg-blue-500/20 text-blue-300'
  if (l === 'pro' || l === 'advanced') return 'bg-purple-500/20 text-purple-300'
  return 'bg-gray-700 text-gray-400'
}

const navigateToNewEvaluation = (studentId: string) => {
  navigateTo(`/member/coach/evaluations?student=${studentId}`)
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="bg-gray-900 border-b border-gray-800 px-4 py-4 sticky top-0 z-40">
      <div class="max-w-lg mx-auto">
        <h1 class="text-xl font-bold text-white">
          {{ language === 'es' ? 'Patinadores' : 'Skaters' }}
        </h1>
        <p class="text-xs text-gray-500 mt-0.5">
          {{ language === 'es' ? 'Perfil y evaluaciones' : 'Profile and evaluations' }}
        </p>
      </div>
    </header>

    <div class="px-4 py-4 max-w-lg mx-auto">
      <input
        v-model="searchQuery"
        type="text"
        :placeholder="language === 'es' ? 'Buscar alumno...' : 'Search student...'"
        class="w-full px-4 py-2.5 mb-4 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm placeholder-gray-500 focus:border-gold-400 outline-none"
      />

      <div v-if="loading" class="py-16 flex justify-center">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>

      <div v-else-if="!filteredStudents.length" class="text-center py-12 text-gray-500 text-sm">
        {{ language === 'es' ? 'No se encontraron patinadores' : 'No skaters found' }}
      </div>

      <div v-else class="space-y-1.5">
        <div
          v-for="student in filteredStudents"
          :key="student.id"
          class="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 flex items-center gap-2.5"
        >
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {{ student.full_name?.charAt(0)?.toUpperCase() || '?' }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-white truncate">{{ student.full_name }}</p>
            <p class="text-[10px] text-gray-500 truncate">
              {{ language === 'es' ? 'En Niik' : 'At Niik' }} {{ formatStartDate(student.created_at) }}
            </p>
          </div>
          <span
            v-if="student.skill_level"
            class="hidden sm:inline px-1.5 py-0.5 text-[10px] font-medium rounded capitalize shrink-0"
            :class="skillBadgeClass(student.skill_level)"
          >
            {{ student.skill_level }}
          </span>
          <div class="flex items-center gap-1 shrink-0">
            <button
              type="button"
              class="px-2 py-1 text-[11px] font-semibold rounded-md bg-gold-400/15 text-gold-400 hover:bg-gold-400/25"
              @click="navigateToNewEvaluation(student.id)"
            >
              {{ language === 'es' ? 'Evaluar' : 'Evaluate' }}
            </button>
            <NuxtLink
              :to="`/member/coach/students/${student.id}`"
              class="px-2 py-1 text-[11px] font-semibold rounded-md bg-gray-800 text-gray-300 hover:text-white"
            >
              {{ language === 'es' ? 'Perfil' : 'Profile' }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
