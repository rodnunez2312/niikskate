<script setup lang="ts">
const props = defineProps<{
  showMenuButton?: boolean
  menuOpen?: boolean
}>()

const emit = defineEmits<{
  'toggle-menu': []
}>()

const { language } = useI18n()
const { fullName, isAdmin, isCoach, isStudent } = useSiteProfile()
const client = useSupabaseClient()
const router = useRouter()

const roleLabel = computed(() => {
  if (isAdmin.value) return language.value === 'es' ? 'Administrador' : 'Administrator'
  if (isCoach.value) return language.value === 'es' ? 'Coach' : 'Coach'
  return language.value === 'es' ? 'Estudiante' : 'Student'
})

const greetingName = computed(() => {
  const n = fullName.value?.trim()
  if (!n) return language.value === 'es' ? 'Hola' : 'Hi'
  return n.split(' ')[0]?.toUpperCase() || n.toUpperCase()
})

async function signOut() {
  await client.auth.signOut()
  await navigateTo('/')
}

function goAddCrew() {
  router.push('/member/student/profile?add=1')
}

// Shared crew state — loads once for all member pages
useCrew()
</script>

<template>
  <header class="sticky top-0 z-40 bg-gray-950/95 backdrop-blur border-b border-gray-800">
    <div class="max-w-lg lg:max-w-none mx-auto px-4 py-3 space-y-2">
      <div class="h-10 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 shrink-0 min-w-0">
          <button
            v-if="showMenuButton"
            type="button"
            class="lg:hidden p-2 -ml-2 text-gray-400 hover:text-white"
            :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
            :aria-expanded="menuOpen"
            @click="emit('toggle-menu')"
          >
            <svg v-if="!menuOpen" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <NuxtLink to="/" class="text-sm font-semibold text-gray-400 hover:text-white shrink-0">
            ← {{ language === 'es' ? 'Sitio' : 'Website' }}
          </NuxtLink>
        </div>

        <div class="min-w-0 text-center">
          <p class="text-sm font-black text-white uppercase tracking-wide truncate">
            {{ language === 'es' ? 'Hola' : 'Hi' }} {{ greetingName }}
          </p>
          <p v-if="fullName" class="text-[10px] text-gray-500 truncate">{{ fullName }} · {{ roleLabel }}</p>
        </div>

        <button
          type="button"
          class="text-sm font-semibold text-gray-400 hover:text-white shrink-0"
          @click="signOut"
        >
          {{ language === 'es' ? 'Salir' : 'Sign out' }}
        </button>
      </div>

      <MemberCrewSwitcher v-if="isStudent" compact @add="goAddCrew" />
    </div>
  </header>
</template>
