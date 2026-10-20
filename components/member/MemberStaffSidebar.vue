<script setup lang="ts">
const props = defineProps<{
  mobileOpen?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { staffDashboardItem, staffNavSections, isActive } = useMemberNav()
const route = useRoute()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()
const { fullName, isAdmin, isCoach } = useSiteProfile()
const accountOpen = ref(false)
const es = computed(() => language.value === 'es')

const SESSIONS_PATH = '/member/staff/sessions'
const { active: activeSession, clockLabel: activeClock, overtime: activeOvertime } = useActiveSession()
const showSessionPill = (path: string) => path === SESSIONS_PATH && Boolean(activeSession.value)

const initials = computed(() => {
  const parts = (fullName.value || user.value?.email || 'N').trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('') || 'N'
})

const roleLabel = computed(() => {
  if (isAdmin.value) return es.value ? 'Administrador' : 'Administrator'
  if (isCoach.value) return 'Coach'
  return ''
})

async function signOut() {
  accountOpen.value = false
  await client.auth.signOut()
  await navigateTo('/')
}

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
const sectionHasActive = (section: { items: Array<{ path: string; children?: Array<{ path: string }> }> }) =>
  section.items.some(item => isActive(item.path) || item.children?.some(child => isActive(child.path)))

watch(
  () => route.fullPath,
  () => {
    accountOpen.value = false
    if (props.mobileOpen) emit('close')
  },
)

function onDocPointer(event: Event) {
  const target = event.target as HTMLElement | null
  if (target?.closest('[data-account]')) return
  accountOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer)
})

function linkClass(active: boolean) {
  return active
    ? 'text-charcoal bg-acid font-semibold'
    : 'text-cream/70 hover:text-cream hover:bg-charcoal-800'
}
</script>

<template>
  <!-- Desktop sidebar -->
  <aside
    class="hidden lg:flex lg:flex-col lg:w-56 lg:shrink-0 lg:border-r lg:border-charcoal-700 lg:bg-charcoal lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:overflow-y-auto"
  >
    <div class="px-3 pt-4 pb-3 border-b border-charcoal-700">
      <p class="font-display text-lg font-black tracking-tight px-1 mb-3">
        <span class="text-acid">Niik</span><span class="text-cream">Skate</span>
      </p>
      <div data-account class="relative flex items-center gap-2">
        <button
          type="button"
          class="min-w-0 flex-1 flex items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-charcoal-800"
          :aria-expanded="accountOpen"
          @click="accountOpen = !accountOpen"
        >
          <span class="w-8 h-8 shrink-0 rounded-full bg-acid text-charcoal text-[11px] font-black grid place-items-center">
            {{ initials }}
          </span>
          <span class="min-w-0">
            <span class="block truncate text-[13px] font-semibold text-cream">{{ fullName || 'Niik' }}</span>
            <span class="block truncate text-[10px] text-cream/50">{{ roleLabel }}</span>
          </span>
        </button>
        <NuxtLink
          to="/"
          class="shrink-0 rounded-lg border border-charcoal-600 px-2 py-1 text-[11px] font-semibold text-cream/80 hover:border-acid hover:text-acid"
        >
          {{ es ? 'Sitio' : 'Site' }}
        </NuxtLink>
        <div
          v-if="accountOpen"
          class="absolute left-0 right-0 top-full z-40 mt-1 rounded-xl border border-charcoal-600 bg-charcoal-800 py-1 shadow-xl"
        >
          <div class="px-3 py-2 border-b border-charcoal-700">
            <p class="text-sm font-semibold text-cream truncate">{{ fullName }}</p>
            <p class="text-[11px] text-cream/50 truncate">{{ user?.email }}</p>
          </div>
          <NuxtLink
            to="/member/coach/profile"
            class="block px-3 py-2 text-sm text-cream/80 hover:bg-charcoal-700 hover:text-cream"
            @click="accountOpen = false"
          >
            {{ es ? 'Perfil' : 'Profile' }}
          </NuxtLink>
          <NuxtLink
            v-if="isAdmin"
            to="/member/admin/academy/registrations"
            class="block px-3 py-2 text-sm text-cream/80 hover:bg-charcoal-700 hover:text-cream"
            @click="accountOpen = false"
          >
            {{ es ? 'Aprobaciones' : 'Approvals' }}
          </NuxtLink>
          <button
            type="button"
            class="block w-full px-3 py-2 text-left text-sm text-cream/80 hover:bg-charcoal-700 hover:text-cream border-t border-charcoal-700"
            @click="signOut"
          >
            {{ es ? 'Salir' : 'Sign out' }}
          </button>
        </div>
      </div>
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
          class="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-[0.14em] hover:bg-charcoal-800 transition-colors"
          :class="
            !isSectionExpanded(section.id) && sectionHasActive(section)
              ? 'text-acid'
              : 'text-cream/50 hover:text-cream/80'
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
          class="ml-2.5 pl-2 border-l border-charcoal-700"
        >
          <li
            v-for="item in section.items"
            :key="itemKey('', section.id, item)"
          >
            <div class="group relative">
              <NuxtLink
                :to="item.path"
                class="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors"
                :class="[linkClass(isActive(item.path)), showSessionPill(item.path) ? 'pr-20' : '']"
              >
                <MemberNavIcon :name="item.icon" class-name="w-4 h-4 shrink-0" />
                <span class="truncate">{{ item.name }}</span>
              </NuxtLink>
              <NuxtLink
                v-if="showSessionPill(item.path)"
                to="/member/coach/plans"
                class="absolute right-1 top-[5px] inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[10px] tabular-nums bg-charcoal-900"
                :class="activeOvertime ? 'border-amber-400/60 text-amber-300' : 'border-acid/50 text-acid'"
                :title="es ? 'Volver a la sesión en curso' : 'Back to the running session'"
              >
                <span class="h-1.5 w-1.5 rounded-full animate-pulse" :class="activeOvertime ? 'bg-amber-300' : 'bg-acid'" aria-hidden="true" />
                {{ activeClock }}
              </NuxtLink>
              <ul
                v-if="item.children?.length"
                class="hidden group-hover:block mt-0.5 ml-6 space-y-0.5"
              >
                <li v-for="child in item.children" :key="child.path">
                  <NuxtLink
                    :to="child.path"
                    class="block rounded-md px-2.5 py-1.5 text-[12px] transition-colors"
                    :class="linkClass(isActive(child.path))"
                  >
                    {{ child.name }}
                  </NuxtLink>
                </li>
              </ul>
            </div>
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
        class="absolute left-0 top-0 bottom-0 w-[min(18rem,84vw)] bg-charcoal border-r border-charcoal-700 overflow-y-auto shadow-2xl"
      >
        <div class="px-3 pt-4 pb-3 border-b border-charcoal-700">
          <div class="flex items-center justify-between px-1 mb-3">
            <p class="font-display text-lg font-black tracking-tight">
              <span class="text-acid">Niik</span><span class="text-cream">Skate</span>
            </p>
            <button
              type="button"
              class="p-1.5 text-cream/50 hover:text-cream"
              aria-label="Close menu"
              @click="emit('close')"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div data-account class="relative flex items-center gap-2">
            <button
              type="button"
              class="min-w-0 flex-1 flex items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-charcoal-800"
              :aria-expanded="accountOpen"
              @click="accountOpen = !accountOpen"
            >
              <span class="w-8 h-8 shrink-0 rounded-full bg-acid text-charcoal text-[11px] font-black grid place-items-center">
                {{ initials }}
              </span>
              <span class="min-w-0">
                <span class="block truncate text-[13px] font-semibold text-cream">{{ fullName || 'Niik' }}</span>
                <span class="block truncate text-[10px] text-cream/50">{{ roleLabel }}</span>
              </span>
            </button>
            <NuxtLink
              to="/"
              class="shrink-0 rounded-lg border border-charcoal-600 px-2 py-1 text-[11px] font-semibold text-cream/80 hover:border-acid hover:text-acid"
            >
              {{ es ? 'Sitio' : 'Site' }}
            </NuxtLink>
            <div
              v-if="accountOpen"
              class="absolute left-0 right-0 top-full z-40 mt-1 rounded-xl border border-charcoal-600 bg-charcoal-800 py-1 shadow-xl"
            >
              <div class="px-3 py-2 border-b border-charcoal-700">
                <p class="text-sm font-semibold text-cream truncate">{{ fullName }}</p>
                <p class="text-[11px] text-cream/50 truncate">{{ user?.email }}</p>
              </div>
              <NuxtLink
                to="/member/coach/profile"
                class="block px-3 py-2 text-sm text-cream/80 hover:bg-charcoal-700 hover:text-cream"
                @click="accountOpen = false"
              >
                {{ es ? 'Perfil' : 'Profile' }}
              </NuxtLink>
              <NuxtLink
                v-if="isAdmin"
                to="/member/admin/academy/registrations"
                class="block px-3 py-2 text-sm text-cream/80 hover:bg-charcoal-700 hover:text-cream"
                @click="accountOpen = false"
              >
                {{ es ? 'Aprobaciones' : 'Approvals' }}
              </NuxtLink>
              <button
                type="button"
                class="block w-full px-3 py-2 text-left text-sm text-cream/80 hover:bg-charcoal-700 hover:text-cream border-t border-charcoal-700"
                @click="signOut"
              >
                {{ es ? 'Salir' : 'Sign out' }}
              </button>
            </div>
          </div>
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
              class="flex w-full items-center justify-between gap-2 px-2.5 py-2 rounded-md text-[10px] font-bold uppercase tracking-[0.14em] hover:bg-charcoal-800"
              :class="
                !isSectionExpanded(section.id) && sectionHasActive(section)
                  ? 'text-acid'
                  : 'text-cream/50'
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
              class="ml-2.5 pl-2 border-l border-charcoal-700"
            >
              <li
                v-for="item in section.items"
                :key="itemKey('m-', section.id, item)"
              >
                <div class="relative">
                  <NuxtLink
                    :to="item.path"
                    class="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-colors"
                    :class="[linkClass(isActive(item.path)), showSessionPill(item.path) ? 'pr-20' : '']"
                  >
                    <MemberNavIcon :name="item.icon" class-name="w-4 h-4 shrink-0" />
                    <span class="truncate">{{ item.name }}</span>
                  </NuxtLink>
                  <NuxtLink
                    v-if="showSessionPill(item.path)"
                    to="/member/coach/plans"
                    class="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[10px] tabular-nums bg-charcoal-900"
                    :class="activeOvertime ? 'border-amber-400/60 text-amber-300' : 'border-acid/50 text-acid'"
                  >
                    <span class="h-1.5 w-1.5 rounded-full animate-pulse" :class="activeOvertime ? 'bg-amber-300' : 'bg-acid'" aria-hidden="true" />
                    {{ activeClock }}
                  </NuxtLink>
                </div>
                <ul v-if="item.children?.length" class="ml-6 space-y-0.5">
                  <li v-for="child in item.children" :key="'m-' + child.path">
                    <NuxtLink
                      :to="child.path"
                      class="block rounded-md px-2.5 py-2 text-sm transition-colors"
                      :class="linkClass(isActive(child.path))"
                    >
                      {{ child.name }}
                    </NuxtLink>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </nav>
      </aside>
    </div>
  </Teleport>
</template>
