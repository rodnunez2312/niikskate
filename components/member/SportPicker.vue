<script setup lang="ts">
import type { SportProgramId } from '~/composables/useEnabledSports'
import type { SetupItem } from '~/composables/useSportSetup'

const { programs, allPrograms, selected, select, addProgram, removeProgram } = useEnabledSports()
const { itemsFor, ensure, refresh: refreshSetup } = useSportSetup()
const { isRead, setRead, toggleRead } = useWarningState()
const { language } = useI18n()
const es = computed(() => language.value === 'es')
const open = ref(false)
const manageOpen = ref(false)
const root = ref<HTMLElement | null>(null)
const tipEl = ref<HTMLElement | null>(null)

const current = computed(() => programs.value.find(program => program.id === selected.value) ?? programs.value[0])
const isAdded = (id: SportProgramId) => programs.value.some(program => program.id === id)
/** Unread required setup; read items stay listed until they are done. */
const unreadFor = (id: SportProgramId) => itemsFor(id).filter(item => !isRead(item.id))
const attentionFor = (id: SportProgramId) => unreadFor(id).length
const menuAttention = computed(() => programs.value.reduce((sum, program) => sum + attentionFor(program.id), 0))
const labelOf = (id: SportProgramId) => allPrograms.find(program => program.id === id)?.label || id

function closeAll() {
  open.value = false
  manageOpen.value = false
  hideTip(true)
}

watch(open, (isOpen) => {
  if (isOpen) refreshSetup()
})

function pick(id: SportProgramId) {
  select(id)
  closeAll()
}

/** Sports not in the menu yet; the add grid only offers these. */
const addable = computed(() => allPrograms.filter(program => !isAdded(program.id)))

// ---------------------------------------------------------------------------
// To-do popup. Teleported so the sidebar's scroll box never clips it.
// ---------------------------------------------------------------------------

const tip = ref<{ sport: SportProgramId; top: number; left: number } | null>(null)
let tipTimer: ReturnType<typeof setTimeout> | null = null

function showTip(sport: SportProgramId, event: MouseEvent) {
  if (!itemsFor(sport).length) return
  if (tipTimer) clearTimeout(tipTimer)
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const width = 256
  const fitsRight = box.right + 10 + width <= window.innerWidth
  tip.value = fitsRight
    ? { sport, top: box.top - 4, left: box.right + 10 }
    : { sport, top: box.bottom + 6, left: Math.max(8, window.innerWidth - width - 8) }
}

function hideTip(now = false) {
  if (tipTimer) clearTimeout(tipTimer)
  if (now) {
    tip.value = null
    return
  }
  tipTimer = setTimeout(() => { tip.value = null }, 180)
}

function keepTip() {
  if (tipTimer) clearTimeout(tipTimer)
}

async function goTo(sport: SportProgramId, item?: SetupItem) {
  const target = item || unreadFor(sport)[0] || itemsFor(sport)[0]
  if (!target) return
  if (isAdded(sport)) select(sport)
  else addProgram(sport)
  closeAll()
  await navigateTo(target.to)
}

function onDocPointer(event: Event) {
  const target = event.target as Node
  if (tipEl.value?.contains(target)) return
  if (root.value && !root.value.contains(target)) closeAll()
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointer)
  ensure()
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointer)
  if (tipTimer) clearTimeout(tipTimer)
})
</script>

<template>
  <div ref="root" class="relative" @keydown.escape="closeAll">
    <button
      type="button"
      class="flex w-full items-center gap-2 rounded-lg border border-charcoal-600 bg-charcoal-800 px-2.5 py-1.5 text-left transition-colors hover:border-acid"
      :class="open ? 'border-acid' : ''"
      :aria-expanded="open"
      aria-haspopup="listbox"
      :aria-label="es ? 'Deporte' : 'Sport'"
      @click="open ? closeAll() : (open = true)"
    >
      <span class="relative shrink-0">
        <MemberSportIcon :sport="current.id" class="h-5 w-5 text-acid" />
        <span
          v-if="menuAttention"
          class="absolute -right-2 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-acid px-1 text-[8px] font-bold leading-none text-charcoal"
        >{{ menuAttention > 9 ? '9+' : menuAttention }}</span>
      </span>
      <span class="min-w-0 flex-1 truncate text-[13px] font-semibold text-cream">{{ current.label }}</span>
      <svg class="h-3.5 w-3.5 shrink-0 text-cream/50 transition-transform" :class="open ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 9l6 6 6-6" />
      </svg>
    </button>

    <div
      v-if="open"
      class="absolute left-0 right-0 top-full z-40 mt-1 rounded-lg border border-charcoal-600 bg-charcoal-800 shadow-xl"
    >
      <ul class="py-1" role="listbox">
        <li v-for="program in programs" :key="program.id">
          <div
            class="group flex w-full items-center gap-2 px-2.5 py-1.5 text-[13px] transition-colors hover:bg-charcoal-700"
            :class="program.id === selected ? 'text-acid font-semibold' : 'text-cream/75 hover:text-cream'"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2 text-left"
              role="option"
              :aria-selected="program.id === selected"
              @click="pick(program.id)"
            >
              <MemberSportIcon :sport="program.id" class="h-4 w-4 shrink-0" />
              <span class="flex-1 truncate">{{ program.label }}</span>
              <span v-if="program.id === selected" aria-hidden="true">✓</span>
            </button>
            <button
              v-if="itemsFor(program.id).length"
              type="button"
              class="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none"
              :class="attentionFor(program.id) ? 'bg-acid text-charcoal' : 'border border-charcoal-600 text-cream/50'"
              :aria-label="es ? `${itemsFor(program.id).length} requisitos pendientes` : `${itemsFor(program.id).length} setup steps left`"
              @mouseenter="showTip(program.id, $event)"
              @mouseleave="hideTip()"
              @focus="showTip(program.id, $event as unknown as MouseEvent)"
              @blur="hideTip()"
              @click.stop="goTo(program.id)"
            >{{ attentionFor(program.id) || itemsFor(program.id).length }}</button>
            <button
              v-if="programs.length > 1"
              type="button"
              class="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[12px] leading-none text-cream/40 opacity-0 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
              :title="es ? 'Quitar del menú' : 'Remove from the menu'"
              :aria-label="es ? `Quitar ${program.label} del menú` : `Remove ${program.label} from the menu`"
              @click.stop="removeProgram(program.id)"
            >×</button>
          </div>
        </li>
      </ul>

      <div class="flex items-center gap-2 border-t border-charcoal-700 px-2.5 py-2">
        <button
          type="button"
          class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-acid text-lg font-semibold leading-none text-charcoal transition-transform hover:scale-105"
          :aria-expanded="manageOpen"
          :aria-label="es ? 'Elegir deportes del menú' : 'Choose sports in the menu'"
          @click="manageOpen = !manageOpen; hideTip(true)"
        >
          {{ manageOpen ? '×' : '+' }}
        </button>
        <span class="text-[11px] text-cream/60">{{ es ? 'Programas deportivos' : 'Sports programs' }}</span>
      </div>

      <div v-if="manageOpen" class="px-2 pb-2">
        <p v-if="!addable.length" class="px-0.5 py-1 text-[11px] text-cream/50">
          {{ es ? 'Todos los deportes ya están en el menú.' : 'Every sport is already in the menu.' }}
        </p>
        <div v-else class="grid grid-cols-3 gap-x-1.5 gap-y-2">
          <button
            v-for="program in addable"
            :key="program.id"
            type="button"
            class="group flex flex-col items-center gap-1 text-center"
            :title="es ? 'Añadir al menú' : 'Add to the menu'"
            @click="addProgram(program.id)"
          >
            <span class="flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border border-charcoal-600 bg-charcoal-700 text-cream/75 transition-colors group-hover:border-acid group-hover:text-acid">
              <img v-if="program.image" :src="program.image" :alt="program.label" class="h-full w-full object-cover">
              <MemberSportIcon v-else :sport="program.id" class="h-5 w-5" />
            </span>
            <span class="text-[10px] font-medium leading-tight text-cream/75 group-hover:text-cream">{{ program.label }}</span>
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="tip"
        ref="tipEl"
        class="fixed z-[200] w-64 rounded-lg border border-charcoal-600 bg-charcoal-800 p-2 shadow-2xl"
        :style="{ top: `${tip.top}px`, left: `${tip.left}px` }"
        role="tooltip"
        @mouseenter="keepTip"
        @mouseleave="hideTip()"
      >
        <p class="px-1 text-[10px] font-semibold uppercase tracking-wide text-cream/50">
          {{ es ? `Requisitos mínimos · ${labelOf(tip.sport)}` : `Minimum setup · ${labelOf(tip.sport)}` }}
        </p>
        <p class="px-1 pb-1.5 text-[10px] text-cream/40">
          {{ es ? 'Se quedan aquí hasta completarlos.' : 'They stay here until done.' }}
        </p>
        <div
          v-for="item in itemsFor(tip.sport)"
          :key="item.id"
          class="flex items-center gap-1 rounded-md hover:bg-charcoal-700"
        >
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1.5 text-left text-[12px] hover:text-acid"
            :class="isRead(item.id) ? 'text-cream/45' : 'text-cream/90'"
            @click="goTo(tip.sport, item)"
          >
            <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="isRead(item.id) ? 'bg-charcoal-600' : 'bg-acid'" aria-hidden="true" />
            <span class="flex-1">{{ es ? item.es : item.en }}</span>
            <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            class="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] text-cream/50 hover:bg-charcoal-600 hover:text-acid"
            :title="isRead(item.id) ? (es ? 'Marcar como no leído' : 'Mark as unread') : (es ? 'Marcar como leído' : 'Mark as read')"
            :aria-label="isRead(item.id) ? (es ? 'Marcar como no leído' : 'Mark as unread') : (es ? 'Marcar como leído' : 'Mark as read')"
            @click="toggleRead(item.id)"
          >{{ isRead(item.id) ? '↺' : '✓' }}</button>
        </div>
        <button
          v-if="unreadFor(tip.sport).length > 1"
          type="button"
          class="mt-1 w-full border-t border-charcoal-700 px-1.5 pt-1.5 text-left text-[11px] text-cream/50 hover:text-acid"
          @click="setRead(unreadFor(tip.sport).map(item => item.id), true)"
        >
          {{ es ? 'Marcar todo como leído' : 'Mark all as read' }}
        </button>
      </div>
    </Teleport>
  </div>
</template>
