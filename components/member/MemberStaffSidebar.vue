<script setup lang="ts">
const props = defineProps<{
  mobileOpen?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { staffDashboardItem, staffNavSections, isActive } = useMemberNav()
const route = useRoute()

const expandedSections = ref<Record<string, boolean>>({})

function expandAllSections() {
  const next: Record<string, boolean> = {}
  for (const section of staffNavSections.value) {
    next[section.id] = true
  }
  expandedSections.value = next
}

function itemKey(prefix: string, sectionId: string, item: { path: string; name: string }) {
  return prefix + sectionId + '-' + item.path + '-' + item.name
}

function isSectionExpanded(sectionId: string) {
  return expandedSections.value[sectionId] ?? true
}

function toggleSection(sectionId: string) {
  expandedSections.value = {
    ...expandedSections.value,
    [sectionId]: !isSectionExpanded(sectionId),
  }
}

watch(
  () => route.fullPath,
  () => {
    if (props.mobileOpen) emit('close')
  },
)

watch(staffNavSections, expandAllSections, { immediate: true })

onMounted(expandAllSections)

function linkClass(active: boolean) {
  return active
    ? 'text-amber-400 bg-amber-500/10'
    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
}
</script>

<template>
  <!-- Desktop sidebar -->
  <aside
    class="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 lg:border-r lg:border-gray-800 lg:bg-gray-950 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto"
  >
    <div class="px-5 pt-6 pb-4 border-b border-gray-800">
      <p class="text-xs font-black uppercase tracking-[0.2em] text-amber-500">NiikSkate</p>
      <p class="mt-1 text-sm text-gray-400">Staff</p>
    </div>
    <nav class="flex-1 px-3 py-5 space-y-1">
      <NuxtLink
        :to="staffDashboardItem.path"
        class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-4"
        :class="linkClass(isActive(staffDashboardItem.path))"
      >
        <MemberNavIcon :name="staffDashboardItem.icon" class-name="w-5 h-5" />
        <span>{{ staffDashboardItem.name }}</span>
      </NuxtLink>

      <div v-for="section in staffNavSections" :key="section.id" class="pt-1">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-gray-200 hover:bg-gray-900 transition-colors"
          :aria-expanded="isSectionExpanded(section.id)"
          @click="toggleSection(section.id)"
        >
          <span>{{ section.title }}</span>
          <svg
            class="w-4 h-4 text-gray-500 transition-transform shrink-0"
            :class="isSectionExpanded(section.id) ? 'rotate-90' : ''"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <ul
          v-show="isSectionExpanded(section.id)"
          class="mt-0.5 ml-3 pl-3 border-l border-gray-800 space-y-0.5"
        >
          <li
            v-for="item in section.items"
            :key="itemKey('', section.id, item)"
          >
            <NuxtLink
              :to="item.path"
              class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="linkClass(isActive(item.path))"
            >
              <MemberNavIcon :name="item.icon" class-name="w-4 h-4" />
              <span>{{ item.name }}</span>
            </NuxtLink>
          </li>
        </ul>
      </div>
    </nav>
  </aside>

  <!-- Mobile drawer -->
  <Teleport to="body">
    <div
      v-if="mobileOpen"
      class="lg:hidden fixed inset-0 z-[60]"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/70"
        aria-label="Close menu"
        @click="emit('close')"
      />
      <aside
        class="absolute left-0 top-0 bottom-0 w-[min(20rem,88vw)] bg-gray-950 border-r border-gray-800 overflow-y-auto shadow-2xl"
      >
        <div class="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-800">
          <div>
            <p class="text-xs font-black uppercase tracking-[0.2em] text-amber-500">NiikSkate</p>
            <p class="mt-1 text-sm text-gray-400">Staff</p>
          </div>
          <button
            type="button"
            class="p-2 text-gray-400 hover:text-white"
            aria-label="Close menu"
            @click="emit('close')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav class="px-3 py-5 space-y-1">
          <NuxtLink
            :to="staffDashboardItem.path"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mb-4"
            :class="linkClass(isActive(staffDashboardItem.path))"
          >
            <MemberNavIcon :name="staffDashboardItem.icon" class-name="w-5 h-5" />
            <span>{{ staffDashboardItem.name }}</span>
          </NuxtLink>

          <div v-for="section in staffNavSections" :key="'m-' + section.id" class="pt-1">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-semibold text-gray-200 hover:bg-gray-900"
              :aria-expanded="isSectionExpanded(section.id)"
              @click="toggleSection(section.id)"
            >
              <span>{{ section.title }}</span>
              <svg
                class="w-4 h-4 text-gray-500 transition-transform shrink-0"
                :class="isSectionExpanded(section.id) ? 'rotate-90' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <ul
              v-show="isSectionExpanded(section.id)"
              class="mt-0.5 ml-3 pl-3 border-l border-gray-800 space-y-0.5"
            >
              <li
                v-for="item in section.items"
                :key="itemKey('m-', section.id, item)"
              >
                <NuxtLink
                  :to="item.path"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                  :class="linkClass(isActive(item.path))"
                >
                  <MemberNavIcon :name="item.icon" class-name="w-4 h-4" />
                  <span>{{ item.name }}</span>
                </NuxtLink>
              </li>
            </ul>
          </div>
        </nav>
      </aside>
    </div>
  </Teleport>
</template>
