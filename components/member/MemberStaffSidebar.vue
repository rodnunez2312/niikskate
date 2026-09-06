<script setup lang="ts">
const props = defineProps<{
  mobileOpen?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { staffDashboardItem, staffNavSections, isActive } = useMemberNav()
const route = useRoute()

const STORAGE_KEY = 'niik-staff-sidebar-collapsed'

/**
 * Only the sections you closed are remembered, so anything added later shows up
 * open rather than hidden behind a chevron nobody knows to click.
 */
const collapsed = ref<Set<string>>(new Set())

const isSectionExpanded = (sectionId: string) => !collapsed.value.has(sectionId)

function toggleSection(sectionId: string) {
  const next = new Set(collapsed.value)
  if (next.has(sectionId)) next.delete(sectionId)
  else next.add(sectionId)
  collapsed.value = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
  } catch {
    /* private mode — the sidebar just forgets between visits */
  }
}

onMounted(() => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) collapsed.value = new Set(JSON.parse(raw) as string[])
  } catch {
    /* ignore malformed state */
  }
})

function itemKey(prefix: string, sectionId: string, item: { path: string; name: string }) {
  return prefix + sectionId + '-' + item.path + '-' + item.name
}

/** Marks a closed section that holds the page you are on. */
const sectionHasActive = (section: { items: Array<{ path: string }> }) =>
  section.items.some(item => isActive(item.path))

watch(
  () => route.fullPath,
  () => {
    if (props.mobileOpen) emit('close')
  },
)

function linkClass(active: boolean) {
  return active
    ? 'text-amber-400 bg-amber-500/10'
    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'
}
</script>

<template>
  <!-- Desktop sidebar -->
  <aside
    class="hidden lg:flex lg:flex-col lg:w-56 lg:shrink-0 lg:border-r lg:border-gray-800 lg:bg-gray-950 lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto"
  >
    <div class="px-4 pt-5 pb-3 border-b border-gray-800">
      <p class="text-xs font-black uppercase tracking-[0.2em] text-amber-500">NiikSkate</p>
    </div>
    <nav class="flex-1 px-2 py-3">
      <NuxtLink
        :to="staffDashboardItem.path"
        class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors mb-2"
        :class="linkClass(isActive(staffDashboardItem.path))"
      >
        <MemberNavIcon :name="staffDashboardItem.icon" class-name="w-4 h-4" />
        <span>{{ staffDashboardItem.name }}</span>
      </NuxtLink>

      <div v-for="section in staffNavSections" :key="section.id" class="mt-1.5">
        <button
          type="button"
          class="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[0.14em] hover:bg-gray-900 transition-colors"
          :class="
            !isSectionExpanded(section.id) && sectionHasActive(section)
              ? 'text-amber-500/80'
              : 'text-gray-500 hover:text-gray-300'
          "
          :aria-expanded="isSectionExpanded(section.id)"
          @click="toggleSection(section.id)"
        >
          <span>{{ section.title }}</span>
          <svg
            class="w-3 h-3 transition-transform shrink-0"
            :class="isSectionExpanded(section.id) ? 'rotate-90' : ''"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <ul
          v-show="isSectionExpanded(section.id)"
          class="ml-2.5 pl-2 border-l border-gray-800"
        >
          <li
            v-for="item in section.items"
            :key="itemKey('', section.id, item)"
          >
            <NuxtLink
              :to="item.path"
              class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors"
              :class="linkClass(isActive(item.path))"
            >
              <MemberNavIcon :name="item.icon" class-name="w-4 h-4 shrink-0" />
              <span class="truncate">{{ item.name }}</span>
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
        class="absolute left-0 top-0 bottom-0 w-[min(18rem,84vw)] bg-gray-950 border-r border-gray-800 overflow-y-auto shadow-2xl"
      >
        <div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-800">
          <p class="text-xs font-black uppercase tracking-[0.2em] text-amber-500">NiikSkate</p>
          <button
            type="button"
            class="p-1.5 text-gray-400 hover:text-white"
            aria-label="Close menu"
            @click="emit('close')"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav class="px-2 py-3">
          <NuxtLink
            :to="staffDashboardItem.path"
            class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors mb-2"
            :class="linkClass(isActive(staffDashboardItem.path))"
          >
            <MemberNavIcon :name="staffDashboardItem.icon" class-name="w-4 h-4" />
            <span>{{ staffDashboardItem.name }}</span>
          </NuxtLink>

          <div v-for="section in staffNavSections" :key="'m-' + section.id" class="mt-1.5">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-2 px-2.5 py-2 rounded-md text-[10px] font-bold uppercase tracking-[0.14em] hover:bg-gray-900"
              :class="
                !isSectionExpanded(section.id) && sectionHasActive(section)
                  ? 'text-amber-500/80'
                  : 'text-gray-500'
              "
              :aria-expanded="isSectionExpanded(section.id)"
              @click="toggleSection(section.id)"
            >
              <span>{{ section.title }}</span>
              <svg
                class="w-3 h-3 transition-transform shrink-0"
                :class="isSectionExpanded(section.id) ? 'rotate-90' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <ul
              v-show="isSectionExpanded(section.id)"
              class="ml-2.5 pl-2 border-l border-gray-800"
            >
              <li
                v-for="item in section.items"
                :key="itemKey('m-', section.id, item)"
              >
                <NuxtLink
                  :to="item.path"
                  class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors"
                  :class="linkClass(isActive(item.path))"
                >
                  <MemberNavIcon :name="item.icon" class-name="w-4 h-4 shrink-0" />
                  <span class="truncate">{{ item.name }}</span>
                </NuxtLink>
              </li>
            </ul>
          </div>
        </nav>
      </aside>
    </div>
  </Teleport>
</template>
