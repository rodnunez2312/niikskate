<script setup lang="ts">
const { language } = useI18n()
const { isAdmin } = useSiteProfile()
const { info, loading, envLabel, builtAtLocal } = useAdminBuildInfo()

const es = computed(() => language.value === 'es')
const showDeveloperInfo = import.meta.dev
</script>

<template>
  <div
    v-if="showDeveloperInfo && isAdmin"
    class="rounded-lg border border-gray-800/80 bg-gray-900/60 px-2.5 py-1.5 text-[10px] leading-snug text-gray-500 font-mono"
    :title="info?.shaFull || undefined"
  >
    <template v-if="loading && !info">
      {{ es ? 'Versión…' : 'Version…' }}
    </template>
    <template v-else-if="info">
      <span class="text-gray-400">{{ es ? 'App' : 'App' }}</span>
      <span class="text-gray-600 mx-1">·</span>
      <span class="uppercase text-amber-200/80">{{ envLabel }}</span>
      <span v-if="info.branch" class="text-gray-600 mx-1">·</span>
      <span v-if="info.branch" class="text-gray-400">{{ info.branch }}</span>
      <span class="text-gray-600 mx-1">·</span>
      <span class="text-gold-400/90">{{ info.shaShort }}</span>
      <span v-if="info.message" class="text-gray-600 mx-1">·</span>
      <span v-if="info.message" class="text-gray-500 truncate inline-block max-w-[min(100%,14rem)] align-bottom">
        {{ info.message }}
      </span>
      <span v-if="builtAtLocal" class="block mt-0.5 text-gray-600">
        {{ es ? 'Build' : 'Build' }} {{ builtAtLocal }}
      </span>
    </template>
  </div>
</template>
