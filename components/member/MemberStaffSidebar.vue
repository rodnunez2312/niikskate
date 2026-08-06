<script setup lang="ts">
const props = defineProps<{
  mobileOpen?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { staffNavSections, isActive } = useMemberNav()
const route = useRoute()

function itemKey(prefix: string, sectionId: string, item: { path: string; name: string }) {
  return prefix + sectionId + '-' + item.path + '-' + item.name
}

watch(
  () => route.fullPath,
  () => {
    if (props.mobileOpen) emit('close')
  },
)
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
    <nav class="flex-1 px-3 py-5 space-y-7">
      <div v-for="section in staffNavSections" :key="section.id">
        <p class="px-3 mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
          {{ section.title }}
        </p>
        <ul class="space-y-0.5">
          <li
            v-for="item in section.items"
            :key="itemKey('', section.id, item)"
          >
            <NuxtLink
              :to="item.path"
              class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
              :class="isActive(item.path)
                ? 'text-amber-400 bg-amber-500/10'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'"
            >
              <MemberNavIcon :name="item.icon" class-name="w-5 h-5" />
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
        <nav class="px-3 py-5 space-y-7">
          <div v-for="section in staffNavSections" :key="'m-' + section.id">
            <p class="px-3 mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-white">
              {{ section.title }}
            </p>
            <ul class="space-y-0.5">
              <li
                v-for="item in section.items"
                :key="itemKey('m-', section.id, item)"
              >
                <NuxtLink
                  :to="item.path"
                  class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
                  :class="isActive(item.path)
                    ? 'text-amber-400 bg-amber-500/10'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-900'"
                >
                  <MemberNavIcon :name="item.icon" class-name="w-5 h-5" />
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
