<script setup lang="ts">
import {
  compareSkillsByManualId,
  difficultyTagClass,
} from '~/utils/skateTrickTaxonomy'

type SkillRow = {
  id: string
  name?: string
  name_es?: string
  difficulty?: string
  program?: string
  area?: string
  manual_id?: number
  sort_order?: number
}

const props = defineProps<{
  open: boolean
  skills: SkillRow[]
  selectedIds: string[]
  sectionLabel: string
  difficultyFilter?: string
  defaultProgram?: string
}>()

const emit = defineEmits<{
  close: []
  confirm: [ids: string[]]
}>()

const { language } = useI18n()
const es = computed(() => language.value === 'es')

const searchQuery = ref('')
const localSelected = ref<string[]>([])
const programFilter = ref('')

watch(
  () => props.open,
  isOpen => {
    if (!isOpen) return
    localSelected.value = [...props.selectedIds]
    searchQuery.value = ''
    programFilter.value = props.defaultProgram || ''
  },
)

const filteredSkills = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return props.skills
    .filter(sk => {
      if (props.difficultyFilter && sk.difficulty !== props.difficultyFilter) return false
      if (programFilter.value && (sk.program || '').trim() !== programFilter.value) return false
      if (!q) return true
      const name = `${sk.name_es || ''} ${sk.name || ''}`.toLowerCase()
      const id = String(sk.manual_id ?? sk.sort_order ?? '')
      return name.includes(q) || id.includes(q)
    })
    .sort(compareSkillsByManualId)
})

function toggle(id: string) {
  const i = localSelected.value.indexOf(id)
  if (i >= 0) localSelected.value.splice(i, 1)
  else localSelected.value.push(id)
}

function confirm() {
  emit('confirm', [...localSelected.value])
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[80] flex flex-col justify-end lg:justify-center lg:items-center"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/70"
        aria-label="Close"
        @click="emit('close')"
      />

      <div
        class="relative w-full lg:max-w-lg max-h-[92vh] flex flex-col rounded-t-2xl lg:rounded-2xl bg-gray-950 border border-gray-800 shadow-2xl"
      >
        <div class="shrink-0 px-4 pt-4 pb-3 border-b border-gray-800">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs uppercase tracking-wide text-gold-400 font-bold">
                {{ es ? 'Bolsa de trucos' : 'Trick bag' }}
              </p>
              <h2 class="text-lg font-bold text-white truncate">{{ sectionLabel }}</h2>
              <p class="text-xs text-gray-500 mt-0.5">
                {{ localSelected.length }}
                {{ es ? 'seleccionados' : 'selected' }}
                ·
                {{ filteredSkills.length }}
                {{ es ? 'mostrados' : 'shown' }}
              </p>
            </div>
            <button
              type="button"
              class="p-2 rounded-lg bg-gray-800 text-gray-300"
              @click="emit('close')"
            >
              ✕
            </button>
          </div>

          <input
            v-model="searchQuery"
            type="search"
            :placeholder="es ? 'Buscar truco…' : 'Search trick…'"
            class="mt-3 w-full px-4 py-3 rounded-xl bg-gray-900 border border-gray-700 text-white placeholder-gray-500 text-sm"
            autofocus
          />

          <div v-if="defaultProgram" class="mt-2 flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              class="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border"
              :class="!programFilter ? 'border-gold-400 bg-gold-400/20 text-white' : 'border-gray-700 text-gray-400'"
              @click="programFilter = ''"
            >
              {{ es ? 'Todos' : 'All' }}
            </button>
            <button
              type="button"
              class="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border"
              :class="programFilter === defaultProgram ? 'border-gold-400 bg-gold-400/20 text-white' : 'border-gray-700 text-gray-400'"
              @click="programFilter = defaultProgram"
            >
              {{ defaultProgram }}
            </button>
          </div>
        </div>

        <ul class="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          <li v-if="!filteredSkills.length" class="py-10 text-center text-sm text-gray-500">
            {{ es ? 'Sin trucos con estos filtros' : 'No tricks match these filters' }}
          </li>
          <li v-for="sk in filteredSkills" :key="sk.id">
            <button
              type="button"
              class="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-colors"
              :class="localSelected.includes(sk.id)
                ? 'bg-gold-400/15 border border-gold-400/40'
                : 'bg-gray-900/80 border border-transparent hover:border-gray-700'"
              @click="toggle(sk.id)"
            >
              <span
                class="w-6 h-6 shrink-0 rounded-full border flex items-center justify-center text-xs"
                :class="localSelected.includes(sk.id) ? 'bg-gold-400 border-gold-400 text-black' : 'border-gray-600 text-transparent'"
              >
                ✓
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-white truncate">
                  {{ es ? (sk.name_es || sk.name) : (sk.name || sk.name_es) }}
                </p>
                <p class="text-[11px] text-gray-500 truncate">
                  {{ sk.area || '—' }}
                  <span v-if="sk.program"> · {{ sk.program }}</span>
                </p>
              </div>
              <span
                v-if="sk.difficulty"
                class="shrink-0 px-2 py-0.5 rounded text-[10px] font-bold"
                :class="difficultyTagClass(sk.difficulty)"
              >
                {{ sk.difficulty }}
              </span>
            </button>
          </li>
        </ul>

        <div class="shrink-0 p-4 border-t border-gray-800 bg-gray-950 pb-safe">
          <button
            type="button"
            class="w-full py-3.5 rounded-xl bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold text-sm"
            @click="confirm"
          >
            {{ es ? 'Listo' : 'Done' }}
            ({{ localSelected.length }})
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
