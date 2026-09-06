<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const user = useSupabaseUser()
const router = useRouter()
const { language } = useI18n()
// A parent/tutor never skates, so their card is not part of Progreso.
const { skaterParticipants, refreshCrew, loading: crewLoading } = useCrew()

function studentIdFor(participant: { type: string; skaterProfileId: string | null }) {
  if (participant.type === 'self' && user.value?.id) return user.value.id
  // A linked skater has a real profile, so their coach ratings load here too.
  return participant.skaterProfileId
}

watch(
  () => user.value?.id,
  async id => {
    if (!id) router.push('/auth/login')
    else await refreshCrew()
  },
  { immediate: true },
)
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="px-4 pt-safe pb-2 max-w-lg mx-auto">
      <h1 class="text-2xl font-bold text-white pt-4">
        {{ language === 'es' ? 'Progreso' : 'Progress' }}
      </h1>
    </header>

    <div class="px-4 max-w-lg mx-auto space-y-10 mt-2">
      <div v-if="crewLoading" class="space-y-4">
        <div v-for="i in 2" :key="i" class="h-48 bg-gray-900 rounded-2xl animate-pulse" />
      </div>

      <template v-else>
        <MemberStudentSkaterProgressPanel
          v-for="p in skaterParticipants"
          :key="p.key"
          :participant="p"
          :student-id="studentIdFor(p)"
        />
        <NuxtLink
          v-if="!skaterParticipants.length"
          to="/member/student/profile"
          class="block rounded-2xl border border-gray-800 bg-gray-900 px-4 py-6 text-center text-sm text-gray-400"
        >
          {{
            language === 'es'
              ? 'Aún no hay patinadores en tu familia. Agrega uno en Familia.'
              : 'No skaters in your family yet. Add one under Family.'
          }}
        </NuxtLink>
      </template>
    </div>
  </div>
</template>
