<script setup lang="ts">
definePageMeta({
  middleware: ['auth'],
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()

const isAdmin = ref(false)
const loading = ref(true)
const programsList = ref<Array<{
  id: string
  name: string
  description?: string | null
  is_active: boolean
  coaches: Array<{ id: string; full_name: string }>
  students: Array<{ id: string; full_name: string }>
}>>([])

const DEFAULT_PROGRAM_NAMES = ['1 - Iniciacion', '2 - Street', '3 - Park', '4 - Advanced']

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/admin/programs')
    return
  }
  const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if (data?.role !== 'admin') {
    router.push('/')
    return
  }
  isAdmin.value = true
  await fetchPrograms()
})

const fetchPrograms = async () => {
  loading.value = true
  try {
    const { data: programs } = await client.from('programs').select('id, name, description, is_active').order('name')
    if (!programs?.length) {
      programsList.value = []
      return
    }
    const { data: pc } = await client.from('program_coaches').select('program_id, coach_id')
    const { data: ps } = await client.from('program_students').select('program_id, student_id')
    const coachIds = [...new Set((pc || []).map((r: any) => r.coach_id))]
    const studentIds = [...new Set((ps || []).map((r: any) => r.student_id))]
    const { data: coachProfiles } = await client.from('profiles').select('id, full_name').in('id', coachIds)
    const { data: studentProfiles } = await client.from('profiles').select('id, full_name').in('id', studentIds)
    const coachesById = Object.fromEntries((coachProfiles || []).map((p: any) => [p.id, p]))
    const studentsById = Object.fromEntries((studentProfiles || []).map((p: any) => [p.id, p]))
    programsList.value = (programs || []).map((prog: any) => ({
      ...prog,
      coaches: (pc || []).filter((r: any) => r.program_id === prog.id).map((r: any) => coachesById[r.coach_id]).filter(Boolean),
      students: (ps || []).filter((r: any) => r.program_id === prog.id).map((r: any) => studentsById[r.student_id]).filter(Boolean),
    }))
  } catch (e) {
    console.error('Error fetching programs:', e)
  } finally {
    loading.value = false
  }
}

const isDefaultProgram = (name: string) => DEFAULT_PROGRAM_NAMES.includes(name)

const deleteProgram = async (id: string, name: string) => {
  if (isDefaultProgram(name) && !confirm(language.value === 'es' ? 'Este es un programa por defecto. ¿Eliminar de todos modos?' : 'This is a default program. Delete anyway?')) return
  if (!confirm(language.value === 'es' ? '¿Eliminar este programa?' : 'Delete this program?')) return
  try {
    const { error } = await client.from('programs').delete().eq('id', id)
    if (error) throw error
    await fetchPrograms()
  } catch (e: any) {
    console.error('Delete program failed:', e)
    alert(e?.message || 'Failed to delete')
  }
}
</script>

<template>
  <div class="min-h-screen bg-black pb-8">
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-2xl mx-auto">
        <div class="flex items-center justify-between">
          <button @click="router.push('/admin')" class="p-2 -ml-2 text-white">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 class="text-xl font-bold text-white">
            {{ language === 'es' ? 'Programas' : 'Programs' }}
          </h1>
          <div class="w-10" />
        </div>
        <p class="text-sm text-gray-400 mt-1">
          {{ language === 'es' ? 'Solo admins pueden eliminar programas aquí.' : 'Only admins can delete programs here.' }}
        </p>
      </div>
    </header>

    <div class="px-4 py-6 max-w-2xl mx-auto">
      <div v-if="loading" class="py-12 text-center">
        <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="prog in programsList"
          :key="prog.id"
          class="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3"
        >
          <span class="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold">P</span>
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-white">{{ prog.name }}</p>
            <p class="text-xs text-gray-500">{{ prog.coaches.length }} {{ language === 'es' ? 'coaches' : 'coaches' }} · {{ prog.students.length }} {{ language === 'es' ? 'atletas' : 'athletes' }}</p>
          </div>
          <button
            type="button"
            @click="deleteProgram(prog.id, prog.name)"
            class="p-2 rounded-lg text-gray-400 hover:text-flame-500 hover:bg-gray-800 transition-colors"
            :title="language === 'es' ? 'Eliminar programa' : 'Delete program'"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
