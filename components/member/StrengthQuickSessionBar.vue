<script setup lang="ts">
/**
 * Header bar version of the strength session generator: controls only.
 * The generated session is rendered by the parent (kanban board), so this
 * component never lists the exercises itself.
 */
import {
  STRETCH_MINUTES_LOCKED,
  TRAINING_DURATIONS,
  TRAINING_PILLARS,
  formatDuration,
  levelLabel,
  pillarLabel,
  totalSessionMinutes,
  type StrengthExercise,
  type StrengthLevel,
  type TrainingPillar,
} from '~/utils/strengthTraining'
import {
  generateStrengthSession,
  type GeneratedSession,
  type SessionAudience,
} from '~/utils/strengthSessionGenerator'
import {
  copyStrengthSessionText,
  downloadStrengthSessionTxt,
  handoutFromGenerated,
  shareStrengthSessionTxt,
} from '~/utils/strengthSessionHandout'

const props = withDefaults(
  defineProps<{
    level?: StrengthLevel | ''
    audience?: string | null
  }>(),
  { level: '', audience: null },
)

const emit = defineEmits<{ 'update:session': [GeneratedSession | null] }>()

const { language } = useI18n()
const es = computed(() => language.value === 'es')

const { exercises, loading, error, loadExercises } = useStrengthLibrary()

const trainingMinutes = ref<number>(20)
const selectedPillars = ref<TrainingPillar[]>([])
const seed = ref(1)
const session = ref<GeneratedSession | null>(null)

const stretchOpen = ref(false)
const stretchRoot = ref<HTMLElement | null>(null)
const copied = ref(false)
const canShare = ref(false)

onMounted(() => {
  loadExercises()
  canShare.value = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  document.addEventListener('click', onDocClick)
})

onUnmounted(() => document.removeEventListener('click', onDocClick))

function onDocClick(e: MouseEvent) {
  if (!stretchOpen.value || !stretchRoot.value) return
  if (!stretchRoot.value.contains(e.target as Node)) stretchOpen.value = false
}

const effectiveLevel = computed<StrengthLevel>(() =>
  props.level === 'intermediate' || props.level === 'advanced' ? props.level : 'beginner',
)

const allPillarsSelected = computed(() => selectedPillars.value.length === 0)

/** The locked block is library data, so it is browsable before generating. */
const stretchExercises = computed((): StrengthExercise[] =>
  exercises.value
    .filter(ex => ex.training_phase === 'stretch' && ex.is_active !== false)
    .sort((a, b) => a.sort_order - b.sort_order),
)

const stretchSeconds = computed(() =>
  stretchExercises.value.reduce((n, ex) => n + (ex.est_seconds || 0), 0),
)

const exerciseCount = computed(
  () => session.value?.blocks.reduce((n, b) => n + b.exercises.length, 0) || 0,
)

function togglePillar(id: TrainingPillar) {
  const i = selectedPillars.value.indexOf(id)
  if (i >= 0) selectedPillars.value.splice(i, 1)
  else selectedPillars.value.push(id)
}

function generate(reseed = false) {
  if (reseed) seed.value += 1
  session.value = generateStrengthSession({
    exercises: exercises.value,
    level: effectiveLevel.value,
    trainingMinutes: trainingMinutes.value,
    pillars: selectedPillars.value,
    audience: (props.audience || null) as SessionAudience | null,
    seed: seed.value,
  })
  emit('update:session', session.value)
}

/** One tap on a duration builds the session — the fast path for a coach on the floor. */
async function pickDuration(minutes: number) {
  trainingMinutes.value = minutes
  if (!exercises.value.length) await loadExercises()
  if (exercises.value.length) generate(false)
}

/** Regenerate in place when the focus or level changes on an existing session. */
watch([selectedPillars, effectiveLevel], () => {
  if (session.value) generate(false)
}, { deep: true })

function clearSession() {
  session.value = null
  emit('update:session', null)
}

function downloadTxt() {
  if (session.value) downloadStrengthSessionTxt(handoutFromGenerated(session.value), es.value)
}

async function shareTxt() {
  if (session.value) await shareStrengthSessionTxt(handoutFromGenerated(session.value), es.value)
}

async function copyText() {
  if (!session.value) return
  const handout = handoutFromGenerated(session.value)
  const ok = await copyStrengthSessionText(handout, es.value)
  if (!ok) {
    downloadStrengthSessionTxt(handout, es.value)
    return
  }
  copied.value = true
  setTimeout(() => { copied.value = false }, 1800)
}
</script>

<template>
  <div class="rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2.5">
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <!-- Durations: one tap builds the session -->
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-[10px] font-bold uppercase tracking-wide text-gray-500 shrink-0">
          ⚡ {{ es ? 'Sesión' : 'Session' }}
        </span>
        <div class="flex gap-1">
          <button
            v-for="d in TRAINING_DURATIONS"
            :key="d.minutes"
            type="button"
            class="px-2 py-1.5 rounded-lg border text-center transition-all disabled:opacity-40 leading-none"
            :class="trainingMinutes === d.minutes
              ? 'border-glass-green bg-glass-green/20 text-white'
              : 'border-gray-700 bg-gray-800 text-gray-400'"
            :disabled="loading || !exercises.length"
            :title="`${d.minutes} + ${STRETCH_MINUTES_LOCKED} = ${totalSessionMinutes(d.minutes)} min`"
            @click="pickDuration(d.minutes)"
          >
            <span class="block text-xs font-bold">{{ d.minutes }}</span>
            <span class="block text-[9px] opacity-70 mt-0.5">
              {{ totalSessionMinutes(d.minutes) }}
            </span>
          </button>
        </div>
      </div>

      <!-- Pillar focus -->
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-[10px] font-bold uppercase tracking-wide text-gray-500 shrink-0">
          {{ es ? 'Pilares' : 'Pillars' }}
        </span>
        <div class="flex flex-wrap gap-1">
          <button
            type="button"
            class="px-2 py-1 rounded-full text-[11px] font-bold border transition-all"
            :class="allPillarsSelected
              ? 'border-gold-400 bg-gold-500/20 text-gold-200'
              : 'border-gray-700 bg-gray-800 text-gray-400'"
            @click="selectedPillars = []"
          >
            {{ es ? 'Todos' : 'All' }}
          </button>
          <button
            v-for="p in TRAINING_PILLARS"
            :key="p.id"
            type="button"
            class="px-2 py-1 rounded-full text-[11px] font-bold border transition-all"
            :class="selectedPillars.includes(p.id)
              ? 'border-glass-green bg-glass-green/20 text-white'
              : 'border-gray-700 bg-gray-800 text-gray-400'"
            :title="pillarLabel(p.id, es)"
            @click="togglePillar(p.id)"
          >
            {{ p.emoji }}
            <span class="hidden xl:inline">{{ es ? p.es : p.en }}</span>
          </button>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-1.5 ml-auto">
        <button
          type="button"
          class="px-3 py-2 rounded-lg bg-glass-green text-white text-xs font-bold disabled:opacity-40"
          :disabled="loading || !exercises.length"
          @click="generate(false)"
        >
          {{ loading
            ? (es ? 'Cargando…' : 'Loading…')
            : (es ? 'Generar sesión' : 'Generate session') }}
        </button>
        <button
          v-if="session"
          type="button"
          class="px-2.5 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-300 text-xs font-semibold"
          :title="es ? 'Variar' : 'Vary'"
          @click="generate(true)"
        >
          🔄
        </button>
        <button
          v-if="session"
          type="button"
          class="px-2.5 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 text-xs"
          @click="clearSession"
        >
          {{ es ? 'Quitar' : 'Clear' }}
        </button>

        <!-- Locked stretch lives here so it stays reachable from the header -->
        <div ref="stretchRoot" class="relative">
          <button
            type="button"
            class="px-2.5 py-2 rounded-lg border text-xs font-semibold transition-colors"
            :class="stretchOpen
              ? 'border-teal-500 bg-teal-500/15 text-teal-200'
              : 'border-gray-700 bg-gray-800 text-gray-300'"
            :aria-expanded="stretchOpen"
            @click.stop="stretchOpen = !stretchOpen"
          >
            🔒 {{ es ? 'Estiramiento NIÏK' : 'NIÏK stretch' }}
            <span class="text-gray-500 font-normal">· {{ STRETCH_MINUTES_LOCKED }}m</span>
          </button>
          <div
            v-if="stretchOpen"
            class="absolute right-0 top-full mt-1 z-50 w-[min(calc(100vw-2rem),320px)] rounded-xl border border-gray-700 bg-gray-900 shadow-2xl p-3 max-h-[60vh] overflow-y-auto"
            @click.stop
          >
            <p class="text-xs font-bold text-white">
              🔒 {{ es ? 'Estiramiento NIÏK' : 'NIÏK stretch' }}
            </p>
            <p class="text-[11px] text-gray-500 mt-0.5">
              {{ formatDuration(stretchSeconds) }} ·
              {{ stretchExercises.length }}
              {{ es ? 'ejercicios · fijo en cada sesión' : 'exercises · locked into every session' }}
            </p>
            <div class="mt-2">
              <div
                v-for="ex in stretchExercises"
                :key="ex.slug"
                class="flex items-center justify-between gap-2 text-[12px] py-1.5 border-t border-gray-800"
              >
                <span class="text-gray-300 min-w-0 truncate">{{ ex.name }}</span>
                <span class="text-gray-500 shrink-0">{{ ex.prescription_es }}</span>
              </div>
            </div>
            <p v-if="!stretchExercises.length" class="text-[11px] text-gray-600 py-3 text-center">
              {{ es ? 'Sin ejercicios de estiramiento.' : 'No stretch exercises yet.' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Summary + handout for the coach's phone -->
    <div
      v-if="session"
      class="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 pt-2 border-t border-gray-800"
    >
      <p class="text-xs text-white font-bold">
        {{ formatDuration(session.totalSeconds) }}
        <span class="text-gray-500 font-normal">
          ({{ formatDuration(session.trainingSeconds) }} +
          {{ formatDuration(session.stretchSeconds) }})
        </span>
      </p>
      <p class="text-[11px] text-gray-500 min-w-0 truncate">
        {{ exerciseCount }} {{ es ? 'ejercicios' : 'exercises' }} ·
        {{ levelLabel(session.level, es) }} ·
        {{ session.pillars.length === TRAINING_PILLARS.length
          ? (es ? 'todos los pilares' : 'all pillars')
          : session.pillars.map(p => pillarLabel(p, es)).join(', ') }}
      </p>
      <div class="flex gap-1.5 ml-auto">
        <button
          type="button"
          class="px-2.5 py-1 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-[11px] font-bold"
          @click="downloadTxt"
        >
          ⬇ .txt
        </button>
        <button
          v-if="canShare"
          type="button"
          class="px-2.5 py-1 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-[11px] font-bold"
          @click="shareTxt"
        >
          📤 {{ es ? 'Enviar' : 'Share' }}
        </button>
        <button
          type="button"
          class="px-2.5 py-1 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-[11px] font-bold"
          @click="copyText"
        >
          {{ copied ? (es ? '✓ Copiado' : '✓ Copied') : (es ? '📋 Copiar' : '📋 Copy') }}
        </button>
      </div>
    </div>

    <p
      v-for="w in session?.warnings || []"
      :key="w"
      class="text-[11px] text-amber-300 bg-amber-500/10 rounded-lg px-2 py-1 mt-1.5"
    >
      ⚠️ {{ w }}
    </p>

    <p v-if="error" class="text-[11px] text-red-400 bg-red-500/10 rounded-lg px-2 py-1 mt-1.5">
      {{ error }}
    </p>
    <p v-else-if="!loading && !exercises.length" class="text-[11px] text-gray-500 mt-1.5">
      {{
        es
          ? 'Sin ejercicios. Un admin debe sincronizar la biblioteca de fuerza desde Excel.'
          : 'No exercises yet. An admin needs to sync the strength library from Excel.'
      }}
    </p>
  </div>
</template>
