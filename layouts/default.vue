<script setup lang="ts">
const { navItems, isActive } = useMemberNav()
</script>

<template>
  <div class="min-h-screen bg-black">
    <main class="pb-20">
      <slot />
    </main>

    <nav v-if="navItems.length" class="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 pb-safe z-50">
      <div class="flex items-center justify-around h-16 max-w-lg mx-auto">
        <NuxtLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex flex-col items-center justify-center w-full h-full touch-feedback text-center px-0.5"
          :class="isActive(item.path) ? 'text-gold-400' : 'text-gray-500 hover:text-gray-400'"
        >
          <span class="text-[10px] font-medium leading-tight">{{ item.name }}</span>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>
