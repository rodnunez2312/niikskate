<script setup lang="ts">
import MemberTopBar from '~/components/member/MemberTopBar.vue'
import MemberStaffSidebar from '~/components/member/MemberStaffSidebar.vue'

const { navItems, isActive, usesStaffSidebar, roleResolving } = useMemberNav()
const staffMenuOpen = ref(false)

function toggleStaffMenu() {
  staffMenuOpen.value = !staffMenuOpen.value
}

watch(usesStaffSidebar, (on) => {
  if (!import.meta.client) return
  document.documentElement.classList.toggle('niik-staff', on)
}, { immediate: true })

onBeforeUnmount(() => {
  document.documentElement.classList.remove('niik-staff')
})
</script>

<template>
  <div class="niik-app min-h-screen bg-charcoal text-cream" :class="usesStaffSidebar ? 'lg:flex' : ''">
    <MemberStaffSidebar
      v-if="usesStaffSidebar"
      :mobile-open="staffMenuOpen"
      @close="staffMenuOpen = false"
    />

    <div class="min-w-0 flex-1 flex flex-col min-h-screen" :class="usesStaffSidebar ? 'lg:pl-56' : ''">
      <button
        v-if="usesStaffSidebar"
        type="button"
        class="lg:hidden fixed top-3 left-3 z-40 w-10 h-10 rounded-full border border-charcoal-600 bg-charcoal text-cream"
        :aria-label="staffMenuOpen ? 'Close menu' : 'Open menu'"
        :aria-expanded="staffMenuOpen"
        @click="toggleStaffMenu"
      >
        <svg class="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>
      <MemberTopBar v-else-if="!roleResolving" />
      <MemberOfflineBanner />

      <main :class="usesStaffSidebar ? 'flex-1 pb-8 pt-14 lg:pt-0' : 'pb-20'">
        <slot />
      </main>

      <!-- Student bottom tabs only -->
      <nav
        v-if="navItems.length"
        class="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 pb-safe z-50"
      >
        <div class="flex items-center justify-around h-16 max-w-lg mx-auto">
          <NuxtLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="flex flex-col items-center justify-center w-full h-full touch-feedback text-center px-0.5"
            :class="isActive(item.path) ? 'text-acid' : 'text-cream/50 hover:text-cream'"
          >
            <MemberNavIcon :name="item.icon" class-name="w-6 h-6 mb-0.5" />
            <span class="text-[10px] font-medium leading-tight">{{ item.name }}</span>
          </NuxtLink>
        </div>
      </nav>
    </div>
  </div>
</template>
