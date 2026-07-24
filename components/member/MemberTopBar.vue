<script setup lang="ts">

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

    <div class="max-w-lg mx-auto px-4 py-3 space-y-2">

      <div class="h-10 flex items-center justify-between gap-3">

        <NuxtLink to="/" class="text-sm font-semibold text-gray-400 hover:text-white shrink-0">

          ← {{ language === 'es' ? 'Sitio' : 'Website' }}

        </NuxtLink>

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

