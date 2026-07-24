<script setup lang="ts">
const { items, isActive } = usePublicNav()
const user = useSupabaseUser()
const { language } = useI18n()
</script>

<template>
  <header class="sticky top-0 z-50 bg-black/95 backdrop-blur border-b border-gray-800">
    <div class="max-w-6xl mx-auto px-4 sm:px-6">
      <div class="flex items-center justify-between h-16 gap-4">
        <NuxtLink to="/" class="flex items-center gap-2 shrink-0">
          <span class="text-xl font-black tracking-tight">
            <span class="text-gold-400">Niik</span><span class="text-white">Skate</span>
          </span>
        </NuxtLink>

        <nav class="hidden md:flex items-center gap-1">
          <NuxtLink
            v-for="item in items"
            :key="item.path"
            :to="item.path"
            class="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            :class="isActive(item.path) ? 'text-gold-400 bg-gold-400/10' : 'text-gray-400 hover:text-white hover:bg-gray-800'"
          >
            {{ item.name }}
          </NuxtLink>
        </nav>

        <div class="flex items-center gap-2 shrink-0">
          <LanguageCurrencyToggle class="hidden sm:flex" />
          <NuxtLink
            v-if="user"
            to="/member"
            class="inline-flex px-3 py-2 rounded-lg bg-gold-400 text-black text-sm font-bold"
          >
            {{ language === 'es' ? 'Mi cuenta' : 'My account' }}
          </NuxtLink>
          <NuxtLink
            v-else
            to="/auth/login"
            class="px-3 py-2 rounded-lg border border-gray-600 text-gray-200 text-sm font-semibold hover:bg-gray-800"
          >
            {{ language === 'es' ? 'Entrar' : 'Sign in' }}
          </NuxtLink>
        </div>
      </div>

      <!-- Mobile nav -->
      <nav class="md:hidden flex gap-1 overflow-x-auto pb-3 -mx-1 px-1 scrollbar-none">
        <NuxtLink
          v-for="item in items"
          :key="'m-' + item.path"
          :to="item.path"
          class="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors"
          :class="isActive(item.path) ? 'border-gold-400 text-gold-400 bg-gold-400/10' : 'border-gray-700 text-gray-400'"
        >
          {{ item.name }}
        </NuxtLink>
      </nav>
    </div>
  </header>
</template>
