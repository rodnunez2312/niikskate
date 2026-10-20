<script setup lang="ts">
/** Shared chrome for the Finanzas section: title, tab bar, and a slot for page actions. */

defineProps<{ subtitle?: string }>()

const route = useRoute()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const tabs = computed(() => [
  { path: '/member/admin/finance', emoji: '📊', label: es.value ? 'Resumen' : 'Overview' },
  { path: '/member/admin/finance/students', emoji: '🛹', label: es.value ? 'Alumnos' : 'Students' },
  { path: '/member/admin/finance/prices', emoji: '🏷️', label: es.value ? 'Precios' : 'Prices' },
  { path: '/member/admin/finance/coupons', emoji: '🎟️', label: es.value ? 'Cupones' : 'Coupons' },
  { path: '/member/admin/finance/income', emoji: '💰', label: es.value ? 'Ingresos' : 'Income' },
  { path: '/member/admin/finance/expenses', emoji: '🧾', label: es.value ? 'Gastos' : 'Expenses' },
])

const isActive = (path: string) =>
  path === '/member/admin/finance' ? route.path === path : route.path.startsWith(path)
</script>

<template>
  <header class="border-b border-gray-800 bg-gray-950">
    <div class="px-4 pt-5 max-w-7xl mx-auto">
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-2xl font-bold text-white truncate">
            {{ es ? 'Finanzas' : 'Finance' }}
          </h1>
          <p v-if="subtitle" class="text-sm text-gray-500 truncate">{{ subtitle }}</p>
        </div>
        <div class="shrink-0 flex items-center gap-2">
          <slot name="actions" />
        </div>
      </div>

      <nav class="flex gap-1 mt-3 -mx-1 px-1 overflow-x-auto pb-2">
        <NuxtLink
          v-for="tab in tabs"
          :key="tab.path"
          :to="tab.path"
          class="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5"
          :class="isActive(tab.path)
            ? 'bg-gold-400 text-black'
            : 'bg-gray-800 text-gray-400 hover:text-white'"
        >
          <span aria-hidden="true">{{ tab.emoji }}</span>
          {{ tab.label }}
        </NuxtLink>
      </nav>
    </div>
  </header>
</template>
