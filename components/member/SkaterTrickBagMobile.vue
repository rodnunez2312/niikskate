<script setup lang="ts">
import {
  trickBagStatusLabel,
  type SkaterTrickBagStatus,
} from '~/utils/skateTrickTaxonomy'

type FocusRow = {
  id: string
  skill_id: string
  status: SkaterTrickBagStatus
  coach_note?: string | null
  skill?: {
    name?: string
    name_es?: string
    area?: string
    trick_type?: string
    difficulty?: string
  } | null
}

type ProgressRow = {
  skill_id: string
  skill?: {
    name?: string
    name_es?: string
    area?: string
    trick_type?: string
  } | null
}

type AssignRow = {
  skill: {
    id: string
    name?: string
    name_es?: string
    area?: string
    trick_type?: string
  }
}

const props = defineProps<{
  skaterName: string
  activeTricks: FocusRow[]
  completedTricks: ProgressRow[]
  assignRows: AssignRow[]
  structureOptions: string[]
  areaOptions: string[]
  typeOptions: string[]
  filterStructure: string
  filterArea: string
  filterType: string
  updatingFocusId: string | null
  assigningSkillId: string | null
  revertingSkillId: string | null
  selectedSkillIds: string[]
  bulkBusy: boolean
}>()

const emit = defineEmits<{
  'update:filterStructure': [value: string]
  'update:filterArea': [value: string]
  'update:filterType': [value: string]
  'set-status': [focusId: string, status: SkaterTrickBagStatus]
  assign: [skillId: string]
  undo: [skillId: string]
  dismiss: [focusId: string]
  comment: [row: FocusRow]
  'toggle-select': [skillId: string]
  'clear-selection': []
  'bulk-add': [status: 'assigned' | 'done']
}>()

const { language } = useI18n()
const es = computed(() => language.value === 'es')

type ParkTab = 'active' | 'done' | 'assign'
const tab = ref<ParkTab>('active')
const assignSearch = ref('')

watch(
  () => props.assigningSkillId,
  (id, prev) => {
    if (prev && !id) tab.value = 'active'
  },
)

const trickName = (skill: { name?: string; name_es?: string } | null | undefined) =>
  es.value ? skill?.name_es || skill?.name || '—' : skill?.name || skill?.name_es || '—'

const filteredAssignRows = computed(() => {
  const q = assignSearch.value.trim().toLowerCase()
  if (!q) return props.assignRows
  return props.assignRows.filter(row => {
    const name = `${row.skill.name || ''} ${row.skill.name_es || ''} ${row.skill.area || ''} ${row.skill.trick_type || ''}`.toLowerCase()
    return name.includes(q)
  })
})

const selectedSet = computed(() => new Set(props.selectedSkillIds))

const allShownSelected = computed(
  () =>
    filteredAssignRows.value.length > 0
    && filteredAssignRows.value.every(row => selectedSet.value.has(row.skill.id)),
)

const toggleAllShown = () => {
  if (allShownSelected.value) {
    emit('clear-selection')
    return
  }
  for (const row of filteredAssignRows.value) {
    if (!selectedSet.value.has(row.skill.id)) emit('toggle-select', row.skill.id)
  }
}

const statusBtnClass = (current: string, target: SkaterTrickBagStatus) => {
  const on = current === target
  if (target === 'assigned') {
    return on
      ? 'bg-sky-500 text-white border-sky-300'
      : 'bg-gray-800 text-sky-200 border-gray-600'
  }
  if (target === 'pending') {
    return on
      ? 'bg-amber-500 text-black border-amber-300'
      : 'bg-gray-800 text-amber-200 border-gray-600'
  }
  return on
    ? 'bg-emerald-500 text-black border-emerald-300'
    : 'bg-gray-800 text-emerald-200 border-gray-600'
}
</script>

<template>
  <div class="lg:hidden space-y-4">
    <div class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
      <p class="text-[11px] uppercase tracking-wide text-amber-300 font-bold">
        {{ es ? 'Vista parque' : 'Park view' }}
      </p>
      <p class="text-sm text-white font-semibold truncate">{{ skaterName }}</p>
      <p class="text-xs text-gray-400">
        {{
          es
            ? 'Toca un estado grande para actualizar. Pensado para usar en el celular en el park.'
            : 'Tap a large status to update. Built for phones at the park.'
        }}
      </p>
    </div>

    <div class="grid grid-cols-3 gap-1 p-1 rounded-xl bg-gray-800 border border-gray-700">
      <button
        type="button"
        class="py-3 rounded-lg text-xs font-bold"
        :class="tab === 'active' ? 'bg-amber-500 text-black' : 'text-gray-300'"
        @click="tab = 'active'"
      >
        {{ es ? 'Activos' : 'Active' }}
        <span class="block text-[10px] font-normal opacity-80">{{ activeTricks.length }}</span>
      </button>
      <button
        type="button"
        class="py-3 rounded-lg text-xs font-bold"
        :class="tab === 'done' ? 'bg-emerald-500 text-black' : 'text-gray-300'"
        @click="tab = 'done'"
      >
        {{ es ? 'Hechos' : 'Done' }}
        <span class="block text-[10px] font-normal opacity-80">{{ completedTricks.length }}</span>
      </button>
      <button
        type="button"
        class="py-3 rounded-lg text-xs font-bold"
        :class="tab === 'assign' ? 'bg-sky-500 text-white' : 'text-gray-300'"
        @click="tab = 'assign'"
      >
        {{ es ? 'Asignar' : 'Assign' }}
        <span class="block text-[10px] font-normal opacity-80">+</span>
      </button>
    </div>

    <div v-if="tab === 'active'" class="space-y-3">
      <p v-if="!activeTricks.length" class="text-center text-sm text-gray-500 py-8">
        {{ es ? 'Nada asignado. Ve a Asignar.' : 'Nothing assigned. Go to Assign.' }}
      </p>
      <article
        v-for="f in activeTricks"
        :key="f.id"
        class="rounded-2xl border border-gray-700 bg-gray-800/80 p-3 space-y-3"
      >
        <div>
          <p class="text-lg font-black text-white leading-tight">{{ trickName(f.skill) }}</p>
          <p class="text-xs text-gray-400 mt-1">
            {{ [f.skill?.area, f.skill?.trick_type].filter(Boolean).join(' · ') || '—' }}
          </p>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="st in (['assigned', 'pending', 'done'] as const)"
            :key="st"
            type="button"
            class="min-h-[52px] px-1 rounded-xl border-2 text-[11px] font-black leading-tight disabled:opacity-50"
            :class="statusBtnClass(f.status, st)"
            :disabled="updatingFocusId === f.id"
            @click="emit('set-status', f.id, st)"
          >
            {{ trickBagStatusLabel(st, es) }}
          </button>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="flex-1 min-h-[44px] rounded-xl border border-gray-600 text-sm font-semibold text-gray-200"
            @click="emit('comment', f)"
          >
            {{ f.coach_note ? (es ? 'Ver nota' : 'View note') : (es ? 'Nota' : 'Note') }}
          </button>
          <button
            type="button"
            class="min-h-[44px] px-4 rounded-xl border border-gray-700 text-sm text-gray-400"
            @click="emit('dismiss', f.id)"
          >
            {{ es ? 'Quitar' : 'Remove' }}
          </button>
        </div>
      </article>
    </div>

    <div v-else-if="tab === 'done'" class="space-y-3">
      <p v-if="!completedTricks.length" class="text-center text-sm text-gray-500 py-8">
        {{ es ? 'Aún no hay trucos completados.' : 'No completed tricks yet.' }}
      </p>
      <article
        v-for="row in completedTricks"
        :key="row.skill_id"
        class="rounded-2xl border border-emerald-500/30 bg-gray-800/80 p-3 space-y-3"
      >
        <div>
          <p class="text-lg font-black text-white leading-tight">{{ trickName(row.skill) }}</p>
          <p class="text-xs text-emerald-300 mt-1">{{ trickBagStatusLabel('done', es) }}</p>
        </div>
        <button
          type="button"
          class="w-full min-h-[48px] rounded-xl border border-red-400/40 text-red-200 font-semibold disabled:opacity-50"
          :disabled="revertingSkillId === row.skill_id"
          @click="emit('undo', row.skill_id)"
        >
          {{ es ? 'Deshacer completado' : 'Undo completed' }}
        </button>
      </article>
    </div>

    <div v-else class="space-y-3">
      <input
        v-model="assignSearch"
        type="search"
        class="w-full min-h-[48px] px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-base"
        :placeholder="es ? 'Buscar truco…' : 'Search trick…'"
      />
      <div class="grid grid-cols-1 gap-2">
        <select
          :value="filterStructure"
          class="min-h-[44px] px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
          @change="emit('update:filterStructure', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ es ? 'Programa: Todas' : 'Program: All' }}</option>
          <option v-for="opt in structureOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <select
          :value="filterArea"
          class="min-h-[44px] px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
          @change="emit('update:filterArea', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ es ? 'Área: Todas' : 'Area: All' }}</option>
          <option v-for="opt in areaOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>
        <select
          :value="filterType"
          class="min-h-[44px] px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
          @change="emit('update:filterType', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ es ? 'Tipo: Todos' : 'Type: All' }}</option>
          <option v-for="opt in typeOptions" :key="opt" :value="opt">{{ opt }}</option>
        </select>
      </div>
      <button
        v-if="filteredAssignRows.length"
        type="button"
        class="w-full min-h-[44px] rounded-xl border border-gray-600 text-sm font-semibold text-gray-200"
        @click="toggleAllShown"
      >
        {{
          allShownSelected
            ? (es ? 'Quitar selección' : 'Clear selection')
            : (es ? `Seleccionar los ${filteredAssignRows.length} visibles` : `Select all ${filteredAssignRows.length} shown`)
        }}
      </button>
      <p v-if="!filteredAssignRows.length" class="text-center text-sm text-gray-500 py-8">
        {{ es ? 'Sin trucos con estos filtros.' : 'No tricks match these filters.' }}
      </p>
      <article
        v-for="row in filteredAssignRows"
        :key="row.skill.id"
        class="flex items-center gap-3 rounded-2xl border p-3"
        :class="
          selectedSet.has(row.skill.id)
            ? 'border-sky-400 bg-sky-500/10'
            : 'border-gray-700 bg-gray-800/80'
        "
      >
        <input
          type="checkbox"
          class="w-6 h-6 shrink-0 accent-sky-500"
          :checked="selectedSet.has(row.skill.id)"
          :aria-label="es ? 'Seleccionar truco' : 'Select trick'"
          @change="emit('toggle-select', row.skill.id)"
        />
        <div class="min-w-0 flex-1">
          <p class="text-base font-bold text-white leading-tight">{{ trickName(row.skill) }}</p>
          <p class="text-xs text-gray-400 mt-0.5">
            {{ [row.skill.area, row.skill.trick_type].filter(Boolean).join(' · ') || '—' }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 min-h-[52px] min-w-[76px] px-3 rounded-xl bg-sky-500 text-white font-black text-sm disabled:opacity-40"
          :disabled="assigningSkillId === row.skill.id"
          @click="emit('assign', row.skill.id)"
        >
          + {{ es ? 'Asignar' : 'Assign' }}
        </button>
      </article>

      <!-- Bulk bar floats so it stays reachable while scrolling 296 tricks -->
      <div
        v-if="selectedSkillIds.length"
        class="sticky bottom-4 z-20 rounded-2xl border border-sky-400/60 bg-gray-950/95 backdrop-blur p-3 space-y-2 shadow-xl"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-bold text-sky-200">
            {{ es ? `${selectedSkillIds.length} seleccionados` : `${selectedSkillIds.length} selected` }}
          </span>
          <button
            type="button"
            class="text-xs text-gray-400"
            @click="emit('clear-selection')"
          >
            {{ es ? 'Limpiar' : 'Clear' }}
          </button>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="min-h-[48px] rounded-xl bg-sky-500 text-white font-black text-sm disabled:opacity-50"
            :disabled="bulkBusy"
            @click="emit('bulk-add', 'assigned')"
          >
            {{ es ? 'Asignar' : 'Assign' }}
          </button>
          <button
            type="button"
            class="min-h-[48px] rounded-xl bg-emerald-500 text-black font-black text-sm disabled:opacity-50"
            :disabled="bulkBusy"
            @click="emit('bulk-add', 'done')"
          >
            {{ es ? 'Ya los domina' : 'Already landed' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
