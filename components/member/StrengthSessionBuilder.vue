<script setup lang="ts">
/**
 * Coach-facing strength session builder: pick duration + pillars, generate, save.
 * The 10-minute stretch block is appended by system rule and is not editable.
 */
import {
  STRETCH_MINUTES_LOCKED,
  TRAINING_DURATIONS,
  TRAINING_PILLARS,
  bodyAreaLabel,
  formatDuration,
  levelLabel,
  phaseLabel,
  pillarLabel,
  pillarTagClass,
  totalSessionMinutes,
  type StrengthLevel,
  type TrainingPillar,
} from '~/utils/strengthTraining'
import {
  generateStrengthSession,
  toSnapshot,
  type GeneratedSession,
  type SessionAudience,
  type StrengthBlockSnapshot,
} from '~/utils/strengthSessionGenerator'
import {
  copyStrengthSessionText,
  downloadStrengthSessionTxt,
  shareStrengthSessionTxt,
  type HandoutSession,
} from '~/utils/strengthSessionHandout'

const props = withDefaults(
  defineProps<{
    modelValue?: StrengthBlockSnapshot | Record<string, never> | null
    level?: StrengthLevel | ''
    audience?: string | null
    /** Hide the class-plan framing when used as a standalone session generator. */
    standalone?: boolean
  }>(),
  { modelValue: null, level: '', audience: null, standalone: false },
)

const emit = defineEmits<{ 'update:modelValue': [StrengthBlockSnapshot | null] }>()

const { language } = useI18n()
const es = computed(() => language.value === 'es')

const { exercises, loading, error, loadExercises } = useStrengthLibrary()

const trainingMinutes = ref<number>(20)
const selectedPillars = ref<TrainingPillar[]>([])
const seed = ref(1)
const session = ref<GeneratedSession | null>(null)
const expanded = ref<string | null>(null)
const stretchOpen = ref(false)

onMounted(() => loadExercises())

/** Level comes from the class plan; default to beginner until one is picked. */
const effectiveLevel = computed<StrengthLevel>(() =>
  props.level === 'intermediate' || props.level === 'advanced' ? props.level : 'beginner',
)

const allPillarsSelected = computed(() => selectedPillars.value.length === 0)

function togglePillar(id: TrainingPillar) {
  const i = selectedPillars.value.indexOf(id)
  if (i >= 0) selectedPillars.value.splice(i, 1)
  else selectedPillars.value.push(id)
}

function selectAllPillars() {
  selectedPillars.value = []
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
  emit('update:modelValue', toSnapshot(session.value))
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
  emit('update:modelValue', null)
}

/** Render freshly generated sessions and reopened saved ones through one shape. */
const view = computed(() => {
  if (session.value) {
    const s = session.value
    return {
      level: s.level,
      trainingMinutes: s.trainingMinutes,
      pillars: s.pillars,
      trainingSeconds: s.trainingSeconds,
      stretchSeconds: s.stretchSeconds,
      totalSeconds: s.totalSeconds,
      warnings: s.warnings,
      blocks: s.blocks.map(b => ({
        phase: b.phase,
        seconds: b.seconds,
        exercises: b.exercises.map(ex => ({
          slug: ex.slug,
          name: ex.name,
          level: ex.level,
          pillar: ex.pillar_primary,
          body_areas: ex.body_areas,
          motor_skill: ex.motor_skill_es || null,
          skate_application: ex.skate_application_es || null,
          equipment: ex.equipment_es || null,
          prescription: ex.prescription_es || null,
          coach_cue: ex.coach_cue_es || null,
          seconds: ex.est_seconds,
        })),
      })),
      stretch: s.stretch.map(ex => ({
        slug: ex.slug,
        name: ex.name,
        prescription: ex.prescription_es || null,
        coach_cue: ex.coach_cue_es || null,
        seconds: ex.est_seconds,
      })),
    }
  }

  const saved = props.modelValue as StrengthBlockSnapshot | null
  if (!saved?.blocks?.length) return null
  const trainingSeconds = saved.blocks.reduce(
    (n, b) => n + b.exercises.reduce((m, ex) => m + (ex.seconds || 0), 0),
    0,
  )
  const stretchSeconds = (saved.stretch || []).reduce((n, ex) => n + (ex.seconds || 0), 0)
  return {
    level: saved.level,
    trainingMinutes: saved.training_minutes,
    pillars: saved.pillars || [],
    trainingSeconds,
    stretchSeconds,
    totalSeconds: saved.total_seconds || trainingSeconds + stretchSeconds,
    warnings: [] as string[],
    blocks: saved.blocks.map(b => ({
      phase: b.phase,
      seconds: b.exercises.reduce((m, ex) => m + (ex.seconds || 0), 0),
      exercises: b.exercises,
    })),
    stretch: saved.stretch || [],
  }
})

const exerciseCount = computed(
  () => view.value?.blocks.reduce((n, b) => n + b.exercises.length, 0) || 0,
)

function toggleDetail(slug: string) {
  expanded.value = expanded.value === slug ? null : slug
}

// ---------------------------------------------------------------------------
// Plain-text handout: openable on any phone without logging into the app.
// ---------------------------------------------------------------------------

const canShare = ref(false)
const copied = ref(false)

onMounted(() => {
  canShare.value = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
})

const handout = computed((): HandoutSession | null => {
  const v = view.value
  if (!v) return null
  return {
    level: v.level,
    trainingMinutes: v.trainingMinutes,
    pillars: v.pillars,
    stretchSeconds: v.stretchSeconds,
    blocks: v.blocks,
    stretch: v.stretch,
  }
})

function downloadSessionTxt() {
  if (handout.value) downloadStrengthSessionTxt(handout.value, es.value)
}

async function shareSessionTxt() {
  if (handout.value) await shareStrengthSessionTxt(handout.value, es.value)
}

async function copySessionText() {
  if (!handout.value) return
  const ok = await copyStrengthSessionText(handout.value, es.value)
  if (!ok) {
    downloadStrengthSessionTxt(handout.value, es.value)
    return
  }
  copied.value = true
  setTimeout(() => { copied.value = false }, 1800)
}
</script>

<template>
  <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
    <div>
      <label class="block text-sm text-gray-300 font-semibold">
        {{ standalone
          ? `⚡ ${es ? 'Sesión rápida' : 'Quick session'}`
          : `💪 ${es ? 'Entrenamiento de fuerza' : 'Strength training'}` }}
      </label>
      <p class="text-xs text-gray-600 mt-1">
        {{
          es
            ? `Nivel ${levelLabel(effectiveLevel, true)}. El estiramiento de ${STRETCH_MINUTES_LOCKED} min se agrega automáticamente.`
            : `${levelLabel(effectiveLevel, false)} level. The ${STRETCH_MINUTES_LOCKED} min stretch is added automatically.`
        }}
      </p>
      <p v-if="standalone" class="text-[11px] text-gray-600 mt-1">
        {{
          es
            ? 'Vista rápida. Para guardarla en una clase, úsala en Planeación de clases.'
            : 'Quick preview. To save it to a class, use it in Class planning.'
        }}
      </p>
    </div>

    <p v-if="error" class="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">{{ error }}</p>

    <!-- One tap per duration creates the session; total includes the locked stretch -->
    <div>
      <p class="text-xs text-gray-500 mb-2">
        {{ es ? 'Crear sesión — toca una duración' : 'Create session — tap a duration' }}
      </p>
      <div class="grid grid-cols-4 gap-1.5">
        <button
          v-for="d in TRAINING_DURATIONS"
          :key="d.minutes"
          type="button"
          class="py-2.5 px-1 rounded-xl border transition-all disabled:opacity-40"
          :class="trainingMinutes === d.minutes
            ? 'border-glass-green bg-glass-green/20 text-white'
            : 'border-gray-700 bg-gray-800 text-gray-400'"
          :disabled="loading || !exercises.length"
          @click="pickDuration(d.minutes)"
        >
          <span class="block text-sm font-bold leading-none">{{ d.minutes }}</span>
          <span class="block text-[10px] font-semibold mt-0.5">{{ es ? d.es : d.en }}</span>
          <span class="block text-[9px] opacity-60 leading-tight">
            +{{ STRETCH_MINUTES_LOCKED }} = {{ totalSessionMinutes(d.minutes) }}
          </span>
        </button>
      </div>
    </div>

    <!-- Pillars -->
    <div>
      <p class="text-xs text-gray-500 mb-2">{{ es ? 'Pilares' : 'Pillars' }}</p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
          :class="allPillarsSelected
            ? 'border-gold-400 bg-gold-500/20 text-gold-200'
            : 'border-gray-700 bg-gray-800 text-gray-400'"
          @click="selectAllPillars"
        >
          {{ es ? 'Todos' : 'All' }}
        </button>
        <button
          v-for="p in TRAINING_PILLARS"
          :key="p.id"
          type="button"
          class="px-3 py-1.5 rounded-full text-xs font-bold border transition-all"
          :class="selectedPillars.includes(p.id)
            ? 'border-glass-green bg-glass-green/20 text-white'
            : 'border-gray-700 bg-gray-800 text-gray-400'"
          @click="togglePillar(p.id)"
        >
          {{ p.emoji }} {{ es ? p.es : p.en }}
        </button>
      </div>
    </div>

    <div class="flex gap-2">
      <button
        type="button"
        class="flex-1 py-3 rounded-xl bg-glass-green text-white text-sm font-bold disabled:opacity-40"
        :disabled="loading || !exercises.length"
        @click="generate(false)"
      >
        {{ loading ? (es ? 'Cargando…' : 'Loading…') : (es ? 'Generar sesión' : 'Generate session') }}
      </button>
      <button
        v-if="view"
        type="button"
        class="px-4 py-3 rounded-xl border border-gray-700 bg-gray-800 text-gray-300 text-sm font-semibold"
        @click="generate(true)"
      >
        🔄 {{ es ? 'Variar' : 'Vary' }}
      </button>
    </div>

    <p v-if="!loading && !exercises.length" class="text-xs text-gray-500">
      {{
        es
          ? 'Sin ejercicios. Un admin debe sincronizar la biblioteca de fuerza desde Excel.'
          : 'No exercises yet. An admin needs to sync the strength library from Excel.'
      }}
    </p>

    <!-- Generated session -->
    <div v-if="view" class="space-y-3">
      <div class="flex items-center justify-between gap-2 bg-gray-800/60 rounded-xl px-3 py-2">
        <div class="min-w-0">
          <p class="text-sm text-white font-bold">
            {{ formatDuration(view.totalSeconds) }}
            <span class="text-gray-500 font-normal text-xs">
              ({{ formatDuration(view.trainingSeconds) }} + {{ formatDuration(view.stretchSeconds) }})
            </span>
          </p>
          <p class="text-[11px] text-gray-500">
            {{ exerciseCount }} {{ es ? 'ejercicios' : 'exercises' }} ·
            {{ view.pillars.length === TRAINING_PILLARS.length
              ? (es ? 'todos los pilares' : 'all pillars')
              : view.pillars.map(p => pillarLabel(p, es)).join(', ') }}
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 text-xs text-gray-500 px-2 py-1"
          @click="clearSession"
        >
          {{ es ? 'Quitar' : 'Clear' }}
        </button>
      </div>

      <!-- Handout for the coach's phone: no login needed -->
      <div class="flex gap-1.5">
        <button
          type="button"
          class="flex-1 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-[11px] font-bold"
          @click="downloadSessionTxt"
        >
          ⬇ .txt
        </button>
        <button
          v-if="canShare"
          type="button"
          class="flex-1 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-[11px] font-bold"
          @click="shareSessionTxt"
        >
          📤 {{ es ? 'Enviar' : 'Share' }}
        </button>
        <button
          type="button"
          class="flex-1 py-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-200 text-[11px] font-bold"
          @click="copySessionText"
        >
          {{ copied ? (es ? '✓ Copiado' : '✓ Copied') : (es ? '📋 Copiar' : '📋 Copy') }}
        </button>
      </div>

      <p
        v-for="w in view.warnings"
        :key="w"
        class="text-[11px] text-amber-300 bg-amber-500/10 rounded-lg px-2 py-1.5"
      >
        ⚠️ {{ w }}
      </p>

      <!-- Phase blocks -->
      <div v-for="block in view.blocks" :key="block.phase" class="space-y-1.5">
        <div class="flex items-center justify-between px-1">
          <p class="text-[11px] uppercase tracking-wide text-gray-500 font-bold">
            {{ phaseLabel(block.phase, es) }}
          </p>
          <p class="text-[11px] text-gray-600">{{ formatDuration(block.seconds) }}</p>
        </div>

        <button
          v-for="ex in block.exercises"
          :key="ex.slug"
          type="button"
          class="w-full text-left bg-gray-800 border border-gray-700 rounded-lg p-2.5"
          @click="toggleDetail(ex.slug)"
        >
          <div class="flex items-start gap-2">
            <div class="flex-1 min-w-0">
              <p class="text-sm text-white font-medium">{{ ex.name }}</p>
              <p class="text-[11px] text-gray-500">
                {{ ex.prescription }}
                <span v-if="ex.equipment"> · {{ ex.equipment }}</span>
              </p>
            </div>
            <span
              class="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded"
              :class="pillarTagClass(ex.pillar)"
            >
              {{ pillarLabel(ex.pillar, es) }}
            </span>
          </div>

          <div v-if="expanded === ex.slug" class="mt-2 pt-2 border-t border-gray-700 space-y-1">
            <p v-if="ex.motor_skill" class="text-[11px] text-gray-400">
              <span class="text-gray-600">{{ es ? 'Habilidad motriz' : 'Motor skill' }}:</span>
              {{ ex.motor_skill }}
            </p>
            <p v-if="ex.skate_application" class="text-[11px] text-gray-400">
              <span class="text-gray-600">{{ es ? 'Aplicación al skate' : 'Skate application' }}:</span>
              {{ ex.skate_application }}
            </p>
            <p v-if="ex.body_areas?.length" class="text-[11px] text-gray-400">
              <span class="text-gray-600">{{ es ? 'Cuerpo' : 'Body' }}:</span>
              {{ ex.body_areas.map(a => bodyAreaLabel(a, es)).join(', ') }}
            </p>
            <p v-if="ex.coach_cue" class="text-[11px] text-teal-300">💬 {{ ex.coach_cue }}</p>
          </div>
        </button>
      </div>

      <!-- Locked stretch -->
      <div class="bg-gray-800/40 border border-gray-700 rounded-xl overflow-hidden">
        <button
          type="button"
          class="w-full flex items-center justify-between gap-2 px-3 py-2.5"
          @click="stretchOpen = !stretchOpen"
        >
          <div class="text-left min-w-0">
            <p class="text-sm text-white font-semibold">
              🔒 {{ es ? 'Estiramiento NIÏK' : 'NIÏK stretch' }}
            </p>
            <p class="text-[11px] text-gray-500">
              {{ formatDuration(view.stretchSeconds) }} ·
              {{ view.stretch.length }} {{ es ? 'ejercicios · fijo' : 'exercises · locked' }}
            </p>
          </div>
          <span class="text-gray-500 text-xs">{{ stretchOpen ? '▲' : '▼' }}</span>
        </button>
        <div v-if="stretchOpen" class="px-3 pb-3 space-y-1">
          <div
            v-for="ex in view.stretch"
            :key="ex.slug"
            class="flex items-center justify-between gap-2 text-[12px] py-1 border-t border-gray-700/60"
          >
            <span class="text-gray-300 min-w-0 truncate">{{ ex.name }}</span>
            <span class="text-gray-500 shrink-0">{{ ex.prescription }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
