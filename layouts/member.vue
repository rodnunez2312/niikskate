<script setup lang="ts">
import MemberTopBar from '~/components/member/MemberTopBar.vue'
import MemberStaffSidebar from '~/components/member/MemberStaffSidebar.vue'

const { navItems, isActive, usesStaffSidebar } = useMemberNav()
const route = useRoute()
const staffMenuOpen = ref(false)
const isCalendarPage = computed(() => route.path === '/member/admin/scheduling/calendar')

function toggleStaffMenu() {
  staffMenuOpen.value = !staffMenuOpen.value
}
</script>

<template>
  <div class="min-h-screen bg-black" :class="usesStaffSidebar ? 'lg:flex' : ''">
    <MemberStaffSidebar
      v-if="usesStaffSidebar"
      :mobile-open="staffMenuOpen"
      @close="staffMenuOpen = false"
    />

    <div class="min-w-0 flex-1 flex flex-col min-h-screen">
      <div
        v-if="isCalendarPage"
        class="h-12 shrink-0 border-b border-gray-800 bg-gray-950 px-4 flex items-center"
      >
        <NuxtLink
          to="/member/staff/dashboard"
          class="text-sm font-bold text-gray-300 hover:text-white"
        >
          ← Calendario
        </NuxtLink>
      </div>
      <MemberTopBar
        v-else
        :show-menu-button="usesStaffSidebar"
        :menu-open="staffMenuOpen"
        @toggle-menu="toggleStaffMenu"
      />

      <main :class="usesStaffSidebar ? 'flex-1 pb-8' : 'pb-20'">
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
            :class="isActive(item.path) ? 'text-gold-400' : 'text-gray-500 hover:text-gray-400'"
          >
            <MemberNavIcon :name="item.icon" class-name="w-6 h-6 mb-0.5" />
            <span class="text-[10px] font-medium leading-tight">{{ item.name }}</span>
          </NuxtLink>
        </div>
      </nav>
    </div>
  </div>
</template>
