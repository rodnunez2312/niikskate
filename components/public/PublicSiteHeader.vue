<script setup lang="ts">
const { items, isActive } = usePublicNav()
const user = useSupabaseUser()
const { language } = useI18n()
const route = useRoute()

const showCrew = computed(
  () =>
    Boolean(user.value)
    && (route.path.startsWith('/temporadas') || route.path.startsWith('/classes')),
)

const goAddFamilyMember = () => {
  void navigateTo('/member/student/profile')
}
</script>

<template>
  <header class="sticky top-0 z-50 bg-charcoal/95 backdrop-blur border-b border-charcoal-700">
    <div class="max-w-6xl mx-auto px-4 sm:px-6">
      <div class="flex items-center justify-between h-16 gap-4">
        <NuxtLink to="/" class="flex items-center gap-2 shrink-0 rounded-md" :aria-label="language === 'es' ? 'NiikSkate, inicio' : 'NiikSkate, home'">
          <span class="font-display text-xl font-black tracking-tight">
            <span class="text-acid">Niik</span><span class="text-cream">Skate</span>
          </span>
        </NuxtLink>

        <nav class="hidden md:flex items-center gap-1" :aria-label="language === 'es' ? 'Principal' : 'Main'">
          <NuxtLink
            v-for="item in items"
            :key="item.path"
            :to="item.path"
            class="px-3 py-2 rounded-full text-sm font-semibold transition-colors"
            :class="isActive(item.path) ? 'text-charcoal bg-acid' : 'text-cream/75 hover:text-cream hover:bg-charcoal-700'"
            :aria-current="isActive(item.path) ? 'page' : undefined"
          >
            {{ item.name }}
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-2 shrink-0">
          <LanguageCurrencyToggle class="hidden sm:flex" />
          <NuxtLink
            v-if="user"
            to="/member"
            class="inline-flex px-4 py-2 rounded-full bg-acid text-charcoal text-sm font-bold hover:bg-acid-300 transition-colors"
          >
            {{ language === 'es' ? 'Mi cuenta' : 'My account' }}
          </NuxtLink>
          <NuxtLink
            v-else
            to="/auth/login"
            class="px-4 py-2 rounded-full border border-cream/40 text-cream text-sm font-semibold hover:bg-cream hover:text-charcoal transition-colors"
          >
            {{ language === 'es' ? 'Entrar' : 'Sign in' }}
          </NuxtLink>
        </div>
      </div>

      <div v-if="showCrew" class="pb-3">
        <MemberCrewSwitcher compact show-add theme="dark" @add="goAddFamilyMember" />
      </div>

      <!-- Mobile nav -->
      <nav class="md:hidden flex gap-1.5 overflow-x-auto pb-3 pt-0.5 -mx-1 px-1 scrollbar-none" :aria-label="language === 'es' ? 'Principal' : 'Main'">
        <NuxtLink
          v-for="item in items"
          :key="'m-' + item.path"
          :to="item.path"
          class="shrink-0 px-3.5 py-2 rounded-full text-xs font-semibold border transition-colors"
          :class="isActive(item.path) ? 'border-acid bg-acid text-charcoal' : 'border-charcoal-600 text-cream/75'"
          :aria-current="isActive(item.path) ? 'page' : undefined"
        >
          {{ item.name }}
        </NuxtLink>
      </nav>
    </div>
  </header>
</template>
