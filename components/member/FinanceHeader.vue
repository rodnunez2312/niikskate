<script setup lang="ts">
/** Shared chrome for the Finanzas section: title, tab bar, and a slot for page actions. */

defineProps<{ subtitle?: string }>()

const route = useRoute()
const router = useRouter()
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
  <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
    <div class="px-4 pt-4 max-w-[1400px] mx-auto">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <button
            class="p-2 -ml-2 text-white shrink-0"
            :aria-label="es ? 'Volver' : 'Back'"
            @click="router.push('/member/staff/dashboard')"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div class="min-w-0">
            <h1 class="text-xl font-bold text-white flex items-center gap-2">
              <span class="text-2xl" aria-hidden="true">💵</span>
              {{ es ? 'Finanzas' : 'Finance' }}
            </h1>
            <p v-if="subtitle" class="text-xs text-gray-400 truncate">{{ subtitle }}</p>
          </div>
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
