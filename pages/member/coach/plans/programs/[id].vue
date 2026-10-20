<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const route = useRoute()
const client = useSupabaseClient()
const { language } = useI18n()
const lang = computed(() => (language.value === 'es' ? 'es' : 'en') as 'en' | 'es')

const programId = computed(() => String(route.params.id || ''))

const loading = ref(true)
const program = ref<{ id: string; name: string; description?: string | null; color?: string | null; is_active?: boolean } | null>(null)
const coaches = ref<Array<{ id: string; full_name: string }>>([])
const students = ref<Array<{ id: string; full_name: string }>>([])

async function load() {
  const id = programId.value
  if (!id) return
  loading.value = true
  try {
    const { data: prog, error: e1 } = await client
      .from('programs')
      .select('id, name, description, color, is_active')
      .eq('id', id)
      .single()
    if (e1 || !prog) {
      program.value = null
      return
    }
    program.value = prog
    const { data: pc } = await client.from('program_coaches').select('coach_id').eq('program_id', id)
    const { data: ps } = await client.from('program_students').select('student_id').eq('program_id', id)
    const coachIds = (pc || []).map((r: any) => r.coach_id)
    const studentIds = (ps || []).map((r: any) => r.student_id)
    if (coachIds.length) {
      const { data: c } = await client.from('profiles').select('id, full_name').in('id', coachIds)
      coaches.value = (c || []) as any[]
    } else coaches.value = []
    if (studentIds.length) {
      const { data: s } = await client.from('profiles').select('id, full_name').in('id', studentIds)
      students.value = (s || []) as any[]
    } else students.value = []
  } catch (e) {
    console.error(e)
    program.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(programId, load)
</script>

<template>
  <div class="min-h-screen bg-gray-950 pb-24">
    <MemberStaffPageHeader
      :title="program?.name || (lang === 'es' ? 'Programa' : 'Program')"
      :subtitle="lang === 'es' ? 'Detalle del programa' : 'Program detail'"
    />

    <div v-if="loading" class="py-16 text-center text-gray-500">…</div>
    <div v-else-if="!program" class="px-4 py-12 text-center text-gray-500 text-sm max-w-md mx-auto">
      {{ lang === 'es' ? 'Programa no encontrado.' : 'Program not found.' }}
    </div>
    <div v-else class="px-4 max-w-2xl mx-auto py-6 space-y-6">
      <p v-if="program.description" class="text-sm text-gray-400 leading-relaxed">
        {{ program.description }}
      </p>

      <ProgramPedagogyBlock :language="lang" compact />

      <section v-if="coaches.length" class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <h2 class="text-sm font-bold text-white mb-2">
          {{ lang === 'es' ? 'Coaches' : 'Coaches' }}
        </h2>
        <ul class="text-sm text-gray-300 space-y-1">
          <li v-for="c in coaches" :key="c.id">• {{ c.full_name }}</li>
        </ul>
      </section>

      <section v-if="students.length" class="bg-gray-900 border border-gray-800 rounded-2xl p-4">
        <h2 class="text-sm font-bold text-white mb-2">
          {{ lang === 'es' ? 'Atletas' : 'Athletes' }} ({{ students.length }})
        </h2>
        <p class="text-xs text-gray-500 mb-2">
          {{ lang === 'es' ? 'Solo el admin modifica asignaciones en Planeación → Programas.' : 'Only admins change assignments in Planning → Programs.' }}
        </p>
        <ul class="text-sm text-gray-300 space-y-1 max-h-40 overflow-y-auto">
          <li v-for="s in students" :key="s.id" class="truncate">• {{ s.full_name }}</li>
        </ul>
      </section>
    </div>
  </div>
</template>
