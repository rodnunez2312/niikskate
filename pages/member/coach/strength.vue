<script setup lang="ts">
/** Strength library board: the 5 pillars × body areas × training phases from Excel. */
import {
  BODY_AREAS,
  STRENGTH_LEVELS,
  TRAINING_PHASES,
  TRAINING_PHASE_ORDER,
  TRAINING_PILLARS,
  bodyAreaLabel,
  formatDuration,
  levelLabel,
  levelTagClass,
  phaseLabel,
  pillarLabel,
  pillarTagClass,
  priorityLabel,
  type BodyArea,
  type StrengthExercise,
  type StrengthLevel,
  type TrainingPhase,
  type TrainingPillar,
} from '~/utils/strengthTraining'
import type { GeneratedSession } from '~/utils/strengthSessionGenerator'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const { exercises, loading, error, loadExercises, syncing, syncStrengthLibrary } =
  useStrengthLibrary()

const userRole = ref<'admin' | 'coach' | 'customer' | null>(null)

const searchQuery = ref('')
const filterLevel = ref<StrengthLevel | ''>('')
const filterPillar = ref<TrainingPillar | ''>('')
const filterPhase = ref<TrainingPhase | ''>('')
const filterBodyArea = ref<BodyArea | ''>('')
const expandedId = ref<string | null>(null)

/** Which attribute becomes the vertical columns of the board. */
type KanbanMode = 'phase' | 'pillar' | 'body'
const kanbanMode = ref<KanbanMode>('phase')

/** The board shows either the whole library or the session built in the header. */
const session = ref<GeneratedSession | null>(null)
const boardSource = ref<'library' | 'session'>('library')

const KANBAN_MODES: Array<{ id: KanbanMode; es: string; en: string }> = [
  { id: 'phase', es: 'Por fase', en: 'By phase' },
  { id: 'pillar', es: 'Por pilar', en: 'By pillar' },
  { id: 'body', es: 'Por cuerpo', en: 'By body' },
]

/** One level control: the browse filter also sets what the generator builds. */
const generatorLevel = computed<StrengthLevel>(() => filterLevel.value || 'beginner')

onMounted(async () => {
  await loadExercises({ force: true })
  if (user.value) {
    const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
    userRole.value = (data?.role as typeof userRole.value) ?? null
  }
})

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  return exercises.value.filter(ex => {
    if (filterLevel.value && ex.level !== filterLevel.value) return false
    if (
      filterPillar.value
      && ex.pillar_primary !== filterPillar.value
      && ex.pillar_secondary !== filterPillar.value
    ) return false
    if (filterPhase.value && ex.training_phase !== filterPhase.value) return false
    if (filterBodyArea.value && !ex.body_areas?.includes(filterBodyArea.value)) return false
    if (!q) return true
    return (
      ex.name.toLowerCase().includes(q)
      || (ex.motor_skill_es || '').toLowerCase().includes(q)
      || (ex.skate_application_es || '').toLowerCase().includes(q)
    )
  })
})

interface KanbanColumn {
  id: string
  title: string
  color: string | null
  exercises: StrengthExercise[]
  seconds: number
}

const bySortOrder = (a: StrengthExercise, b: StrengthExercise) => a.sort_order - b.sort_order
const totalSeconds = (list: StrengthExercise[]) =>
  list.reduce((n, ex) => n + (ex.est_seconds || 0), 0)

const kanbanColumns = computed((): KanbanColumn[] => {
  const pool = filtered.value

  if (kanbanMode.value === 'pillar') {
    return TRAINING_PILLARS.map(p => {
      const list = pool
        .filter(ex => ex.pillar_primary === p.id || ex.pillar_secondary === p.id)
        .sort(bySortOrder)
      return {
        id: p.id,
        title: `${p.emoji} ${es.value ? p.es : p.en}`,
        color: p.color,
        exercises: list,
        seconds: totalSeconds(list),
      }
    })
  }

  if (kanbanMode.value === 'body') {
    return BODY_AREAS.map(a => {
      const list = pool.filter(ex => ex.body_areas?.includes(a.id)).sort(bySortOrder)
      return {
        id: a.id,
        title: es.value ? a.es : a.en,
        color: null,
        exercises: list,
        seconds: totalSeconds(list),
      }
    })
  }

  const order: TrainingPhase[] = [...TRAINING_PHASE_ORDER, 'stretch']
  return order.map(phase => {
    const list = pool.filter(ex => ex.training_phase === phase).sort(bySortOrder)
    return {
      id: phase,
      title: `${phase === 'stretch' ? '🔒 ' : ''}${phaseLabel(phase, es.value)}`,
      color: null,
      exercises: list,
      seconds: totalSeconds(list),
    }
  })
})

/** Body areas and pillars are multi-valued, so one exercise can sit in several columns. */
const columnsOverlap = computed(() => kanbanMode.value !== 'phase')

/** A generated session becomes its own board: one column per training phase. */
const sessionColumns = computed((): KanbanColumn[] => {
  const s = session.value
  if (!s) return []
  const cols: KanbanColumn[] = s.blocks.map(b => ({
    id: `session-${b.phase}`,
    title: phaseLabel(b.phase, es.value),
    color: null,
    exercises: b.exercises,
    seconds: b.seconds,
  }))
  if (s.stretch.length) {
    cols.push({
      id: 'session-stretch',
      title: `🔒 ${es.value ? 'Estiramiento NIÏK' : 'NIÏK stretch'}`,
      color: null,
      exercises: s.stretch,
      seconds: s.stretchSeconds,
    })
  }
  return cols
})

const showingSession = computed(() => boardSource.value === 'session' && !!session.value)

const boardColumns = computed(() =>
  showingSession.value ? sessionColumns.value : kanbanColumns.value,
)

const sessionExerciseCount = computed(
  () => session.value?.blocks.reduce((n, b) => n + b.exercises.length, 0) || 0,
)

function onSessionGenerated(next: GeneratedSession | null) {
  session.value = next
  boardSource.value = next ? 'session' : 'library'
}

const levelCounts = computed(() =>
  STRENGTH_LEVELS.map(l => ({
    ...l,
    count: exercises.value.filter(ex => ex.level === l.id).length,
  })),
)

const pillarCounts = computed(() =>
  TRAINING_PILLARS.map(p => ({
    ...p,
    count: exercises.value.filter(ex => ex.pillar_primary === p.id).length,
  })),
)

const hasFilters = computed(
  () =>
    !!searchQuery.value
    || !!filterLevel.value
    || !!filterPillar.value
    || !!filterPhase.value
    || !!filterBodyArea.value,
)

function clearFilters() {
  searchQuery.value = ''
  filterLevel.value = ''
  filterPillar.value = ''
  filterPhase.value = ''
  filterBodyArea.value = ''
}

async function runSync() {
  const res = await syncStrengthLibrary()
  alert(
    res.ok
      ? es.value
        ? `${res.upserted} ejercicios sincronizados.`
        : `${res.upserted} exercises synced.`
      : `${es.value ? 'Error' : 'Failed'}: ${res.message}`,
  )
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4 pt-safe pb-4">
      <div class="max-w-[1400px] mx-auto pt-4 space-y-3">
        <div>
          <h1 class="text-2xl lg:text-3xl font-bold text-white">
            💪 {{ es ? 'Entrenamiento de fuerza' : 'Strength training' }}
          </h1>
          <p class="text-xs text-gray-500 mt-1">
            {{ exercises.length }}
            {{ es ? 'ejercicios · 5 pilares · nivel' : 'exercises · 5 pillars · level' }}
            {{ levelLabel(generatorLevel, es) }}
          </p>
        </div>

        <MemberStrengthQuickSessionBar
          v-if="exercises.length"
          :level="generatorLevel"
          @update:session="onSessionGenerated"
        />
      </div>
    </header>

    <div class="px-4 max-w-[1400px] mx-auto py-4">
      <p v-if="error" class="text-xs text-red-300 bg-red-500/10 rounded-lg p-3 mb-4">{{ error }}</p>

      <div
        v-if="!loading && !exercises.length"
        class="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3"
      >
        <p class="text-sm text-gray-300">
          {{
            es
              ? 'La biblioteca está vacía. Sincroniza desde la hoja Strength_Training del Excel.'
              : 'The library is empty. Sync from the Strength_Training sheet in Excel.'
          }}
        </p>
        <button
          v-if="userRole === 'admin'"
          type="button"
          :disabled="syncing"
          class="w-full py-3 rounded-xl bg-glass-green text-white text-sm font-bold disabled:opacity-40"
          @click="runSync"
        >
          {{ syncing ? (es ? 'Sincronizando…' : 'Syncing…') : (es ? 'Sincronizar fuerza' : 'Sync strength') }}
        </button>
      </div>

      <template v-if="exercises.length">
        <!-- Filters across the top -->
        <div class="rounded-xl border border-gray-800 bg-gray-900/40 p-3 space-y-3 mb-4">
          <div class="grid grid-cols-5 gap-1.5">
            <button
              v-for="p in pillarCounts"
              :key="p.id"
              type="button"
              class="rounded-xl py-2.5 px-1 text-center border transition-all"
              :class="filterPillar === p.id
                ? 'border-gold-400 bg-gold-400/15'
                : 'border-gray-800 bg-gray-900'"
              @click="filterPillar = filterPillar === p.id ? '' : p.id"
            >
              <span class="block text-lg leading-none">{{ p.emoji }}</span>
              <span class="block text-sm font-bold text-white mt-0.5">{{ p.count }}</span>
              <span class="block text-[9px] text-gray-500 leading-tight truncate">
                {{ es ? p.es : p.en }}
              </span>
            </button>
          </div>

          <div class="flex flex-col sm:flex-row gap-2">
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="es ? 'Buscar ejercicio o habilidad…' : 'Search exercise or skill…'"
              class="sm:flex-1 min-w-0 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-white placeholder-gray-500 text-sm"
            />
            <div class="grid grid-cols-2 sm:flex gap-2">
              <select
                v-model="filterPhase"
                class="sm:w-36 px-3 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-white text-xs"
              >
                <option value="">{{ es ? 'Toda fase' : 'Any phase' }}</option>
                <option v-for="ph in TRAINING_PHASES" :key="ph.id" :value="ph.id">
                  {{ es ? ph.es : ph.en }}
                </option>
              </select>
              <select
                v-model="filterBodyArea"
                class="sm:w-40 px-3 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-white text-xs"
              >
                <option value="">{{ es ? 'Todo el cuerpo' : 'Any body area' }}</option>
                <option v-for="a in BODY_AREAS" :key="a.id" :value="a.id">
                  {{ es ? a.es : a.en }}
                </option>
              </select>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex gap-2 flex-1 sm:flex-none">
              <button
                v-for="l in levelCounts"
                :key="l.id"
                type="button"
                class="flex-1 sm:flex-none sm:px-4 py-2 rounded-xl text-xs font-bold border transition-all"
                :class="filterLevel === l.id
                  ? 'border-glass-green bg-glass-green/20 text-white'
                  : 'border-gray-800 bg-gray-900 text-gray-400'"
                @click="filterLevel = filterLevel === l.id ? '' : l.id"
              >
                {{ es ? l.es : l.en }} ({{ l.count }})
              </button>
            </div>
            <div class="flex items-center gap-2">
              <p class="text-xs text-gray-500">
                {{ filtered.length }} {{ es ? 'de' : 'of' }} {{ exercises.length }}
              </p>
              <button
                v-if="hasFilters"
                type="button"
                class="text-xs text-gray-400 px-2 py-1"
                @click="clearFilters"
              >
                {{ es ? 'Limpiar' : 'Clear' }}
              </button>
              <button
                v-if="userRole === 'admin'"
                type="button"
                :disabled="syncing"
                class="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 disabled:opacity-50"
                @click="runSync"
              >
                {{ syncing ? (es ? 'Sincronizando…' : 'Syncing…') : (es ? 'Sincronizar' : 'Sync') }}
              </button>
            </div>
          </div>
        </div>

        <!-- Board takes the full width; the generator lives in the header -->
        <div class="min-w-0">
          <!-- Board source + column order -->
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div class="flex flex-wrap items-center gap-2">
              <div
                v-if="session"
                class="flex rounded-xl border border-gray-800 overflow-hidden shrink-0"
              >
                <button
                  type="button"
                  class="px-4 py-2 text-xs font-semibold transition-colors"
                  :class="showingSession ? 'bg-glass-green text-white' : 'bg-gray-900 text-gray-400'"
                  @click="boardSource = 'session'"
                >
                  ⚡ {{ es ? 'Sesión' : 'Session' }} ({{ sessionExerciseCount }})
                </button>
                <button
                  type="button"
                  class="px-4 py-2 text-xs font-semibold transition-colors"
                  :class="!showingSession ? 'bg-gold-400 text-black' : 'bg-gray-900 text-gray-400'"
                  @click="boardSource = 'library'"
                >
                  📚 {{ es ? 'Biblioteca' : 'Library' }}
                </button>
              </div>
              <div
                v-if="!showingSession"
                class="flex rounded-xl border border-gray-800 overflow-hidden shrink-0"
              >
                <button
                  v-for="m in KANBAN_MODES"
                  :key="m.id"
                  type="button"
                  class="px-4 py-2 text-xs font-semibold transition-colors"
                  :class="kanbanMode === m.id ? 'bg-gold-400 text-black' : 'bg-gray-900 text-gray-400'"
                  @click="kanbanMode = m.id"
                >
                  {{ es ? m.es : m.en }}
                </button>
              </div>
            </div>
            <p v-if="showingSession && session" class="text-[10px] text-gray-500 leading-snug">
              {{
                es
                  ? `Sesión de ${formatDuration(session.totalSeconds)} en orden de fase. El estiramiento va al final y es fijo.`
                  : `${formatDuration(session.totalSeconds)} session in phase order. The stretch block is last and locked.`
              }}
            </p>
            <p v-else-if="columnsOverlap" class="text-[10px] text-gray-600 leading-snug">
              {{
                es
                  ? 'Un ejercicio puede aparecer en varias columnas.'
                  : 'An exercise can appear in more than one column.'
              }}
            </p>
          </div>

          <!-- Board -->
          <div class="overflow-x-auto pb-4 -mx-1 px-1">
            <div class="flex gap-3 min-w-min">
              <div
                v-for="col in boardColumns"
                :key="col.id"
                class="w-[260px] shrink-0 flex flex-col min-h-[20rem] max-h-[calc(100vh-14rem)] rounded-xl"
              >
                <div
                  class="rounded-t-xl px-3 py-2 border border-b-0 border-gray-800 bg-gray-900/90"
                  :style="col.color ? { borderTopColor: col.color, borderTopWidth: '3px' } : {}"
                >
                  <div class="flex items-start justify-between gap-2">
                    <p class="text-xs font-bold text-white truncate leading-tight">
                      {{ col.title }}
                    </p>
                    <span
                      class="shrink-0 min-w-[1.25rem] text-center text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
                      :class="col.exercises.length
                        ? 'bg-gold-400/20 text-gold-300'
                        : 'bg-gray-800 text-gray-500'"
                    >
                      {{ col.exercises.length }}
                    </span>
                  </div>
                  <p v-if="col.seconds" class="text-[10px] text-gray-500 mt-0.5 tabular-nums">
                    {{ formatDuration(col.seconds) }}
                  </p>
                </div>

                <div
                  class="flex-1 overflow-y-auto rounded-b-xl border border-gray-800 bg-gray-900/30 p-1.5 space-y-1.5"
                >
                  <button
                    v-for="ex in col.exercises"
                    :key="`${col.id}-${ex.slug}`"
                    type="button"
                    class="w-full text-left bg-gray-900 border border-gray-800 rounded-lg p-2.5 hover:border-gray-700 transition-colors"
                    @click="expandedId = expandedId === `${col.id}-${ex.slug}` ? null : `${col.id}-${ex.slug}`"
                  >
                    <p class="text-[13px] text-white font-medium leading-snug">{{ ex.name }}</p>
                    <p class="text-[10px] text-gray-500 mt-0.5">{{ ex.prescription_es }}</p>
                    <div class="flex flex-wrap gap-1 mt-1.5">
                      <span
                        class="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        :class="pillarTagClass(ex.pillar_primary)"
                      >
                        {{ pillarLabel(ex.pillar_primary, es) }}
                      </span>
                      <span
                        class="text-[9px] font-bold px-1.5 py-0.5 rounded"
                        :class="levelTagClass(ex.level)"
                      >
                        {{ levelLabel(ex.level, es) }}
                      </span>
                      <span
                        v-if="!showingSession && kanbanMode !== 'phase'"
                        class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-800 text-gray-400"
                      >
                        {{ phaseLabel(ex.training_phase, es) }}
                      </span>
                    </div>

                    <div
                      v-if="expandedId === `${col.id}-${ex.slug}`"
                      class="mt-2 pt-2 border-t border-gray-800 space-y-1"
                    >
                      <p v-if="ex.motor_skill_es" class="text-[10px] text-gray-300">
                        <span class="text-gray-600">{{ es ? 'Habilidad motriz' : 'Motor skill' }}:</span>
                        {{ ex.motor_skill_es }}
                      </p>
                      <p v-if="ex.skate_application_es" class="text-[10px] text-gray-300">
                        <span class="text-gray-600">{{ es ? 'Al skate' : 'Skate use' }}:</span>
                        {{ ex.skate_application_es }}
                      </p>
                      <p v-if="ex.body_areas?.length" class="text-[10px] text-gray-300">
                        <span class="text-gray-600">{{ es ? 'Cuerpo' : 'Body' }}:</span>
                        {{ ex.body_areas.map(a => bodyAreaLabel(a, es)).join(', ') }}
                      </p>
                      <p v-if="ex.pillar_secondary" class="text-[10px] text-gray-300">
                        <span class="text-gray-600">{{ es ? 'Pilar 2°' : '2nd pillar' }}:</span>
                        {{ pillarLabel(ex.pillar_secondary, es) }}
                      </p>
                      <p class="text-[10px] text-gray-300">
                        <span class="text-gray-600">{{ es ? 'Prioridad' : 'Priority' }}:</span>
                        {{ priorityLabel(ex.priority, es) }}
                        <span v-if="ex.rest_es" class="text-gray-600">
                          · {{ es ? 'descanso' : 'rest' }} {{ ex.rest_es }}
                        </span>
                      </p>
                      <p v-if="ex.equipment_es" class="text-[10px] text-gray-300">
                        <span class="text-gray-600">{{ es ? 'Equipo' : 'Equipment' }}:</span>
                        {{ ex.equipment_es }}
                      </p>
                      <p v-if="ex.coach_cue_es" class="text-[10px] text-teal-300">
                        💬 {{ ex.coach_cue_es }}
                      </p>
                    </div>
                  </button>

                  <p
                    v-if="!col.exercises.length"
                    class="text-[10px] text-gray-600 text-center py-4"
                  >
                    {{ es ? 'Vacío' : 'Empty' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
