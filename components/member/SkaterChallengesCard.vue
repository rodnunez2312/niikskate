<script setup lang="ts">
import {
  challengeStatusLabel,
  compareChallenges,
  isChallengeOverdue,
  type SkaterChallenge,
} from '~/utils/skaterChallenges'

const props = withDefaults(
  defineProps<{
    /** profiles.id of the skater; null for crew skaters without a login */
    studentId: string | null
    /** Coach/admin: create, edit due dates, reopen, delete */
    canManage?: boolean
    /** The skater themselves: mark a challenge as accomplished */
    canComplete?: boolean
  }>(),
  { canManage: false, canComplete: false },
)

const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const loading = ref(true)
const errorMessage = ref<string | null>(null)
const challenges = ref<SkaterChallenge[]>([])
const busyId = ref<string | null>(null)

const formOpen = ref(false)
const saving = ref(false)
const draft = ref({ title: '', description: '', due_date: '' })

const sorted = computed(() => [...challenges.value].sort(compareChallenges))
const completedCount = computed(() => challenges.value.filter(c => c.status === 'completed').length)
const totalCount = computed(() => challenges.value.length)
const progressPct = computed(() =>
  totalCount.value ? Math.round((completedCount.value / totalCount.value) * 100) : 0,
)

const loadChallenges = async () => {
  if (!props.studentId) {
    challenges.value = []
    loading.value = false
    return
  }
  loading.value = true
  errorMessage.value = null
  try {
    const { data, error } = await client
      .from('skater_challenges')
      .select('*')
      .eq('student_id', props.studentId)
      .order('created_at', { ascending: false })
    if (error) throw error
    challenges.value = (data ?? []) as SkaterChallenge[]
  } catch (e: any) {
    // The table only exists after add_skater_challenges.sql runs.
    errorMessage.value = e?.message || (es.value ? 'No se pudieron cargar los desafíos' : 'Could not load challenges')
    challenges.value = []
  } finally {
    loading.value = false
  }
}

const openForm = () => {
  draft.value = { title: '', description: '', due_date: '' }
  errorMessage.value = null
  formOpen.value = true
}

const closeForm = () => {
  formOpen.value = false
}

const createChallenge = async () => {
  const title = draft.value.title.trim()
  if (!title || !props.studentId) return
  saving.value = true
  errorMessage.value = null
  try {
    const { data, error } = await client
      .from('skater_challenges')
      .insert({
        student_id: props.studentId,
        title,
        description: draft.value.description.trim() || null,
        due_date: draft.value.due_date || null,
        created_by: user.value?.id ?? null,
      })
      .select('*')
      .single()
    if (error) throw error
    if (data) challenges.value.unshift(data as SkaterChallenge)
    closeForm()
  } catch (e: any) {
    errorMessage.value = e?.message || (es.value ? 'No se pudo crear' : 'Could not create')
  } finally {
    saving.value = false
  }
}

const setChallengeStatus = async (challenge: SkaterChallenge, completed: boolean) => {
  if (busyId.value) return
  busyId.value = challenge.id
  errorMessage.value = null
  const previous = { ...challenge }
  challenge.status = completed ? 'completed' : 'open'
  challenge.completed_at = completed ? new Date().toISOString() : null
  challenge.completed_by = completed ? user.value?.id ?? null : null
  try {
    const { error } = await client
      .from('skater_challenges')
      .update({
        status: challenge.status,
        completed_at: challenge.completed_at,
        completed_by: challenge.completed_by,
      })
      .eq('id', challenge.id)
    if (error) throw error
  } catch (e: any) {
    Object.assign(challenge, previous)
    errorMessage.value = e?.message || (es.value ? 'No se pudo actualizar' : 'Could not update')
  } finally {
    busyId.value = null
  }
}

const deleteChallenge = async (challenge: SkaterChallenge) => {
  const msg = es.value
    ? `¿Eliminar el desafío «${challenge.title}»?`
    : `Delete challenge «${challenge.title}»?`
  if (!confirm(msg)) return
  busyId.value = challenge.id
  try {
    const { error } = await client.from('skater_challenges').delete().eq('id', challenge.id)
    if (error) throw error
    challenges.value = challenges.value.filter(c => c.id !== challenge.id)
  } catch (e: any) {
    errorMessage.value = e?.message || (es.value ? 'No se pudo eliminar' : 'Could not delete')
  } finally {
    busyId.value = null
  }
}

const canToggle = (challenge: SkaterChallenge) => {
  if (props.canManage) return true
  // A skater can tick a challenge off but not un-tick it.
  return props.canComplete && challenge.status === 'open'
}

const dueLabel = (challenge: SkaterChallenge) => {
  if (!challenge.due_date) return null
  const [y, m, d] = challenge.due_date.split('-')
  return `${d}/${m}/${y}`
}

watch(() => props.studentId, loadChallenges, { immediate: true })
</script>

<template>
  <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
    <div class="flex items-center gap-3">
      <div class="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 shrink-0">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-gray-400">{{ es ? 'Desafíos completados' : 'Challenges completed' }}</p>
        <div class="h-2 bg-gray-800 rounded-full overflow-hidden mt-1">
          <div
            class="h-full bg-amber-500/80 rounded-full transition-all"
            :style="{ width: `${progressPct}%` }"
          />
        </div>
      </div>
      <span class="text-sm font-bold text-white shrink-0">{{ completedCount }}/{{ totalCount }}</span>
      <button
        v-if="canManage && studentId"
        type="button"
        class="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors"
        @click="formOpen ? closeForm() : openForm()"
      >
        {{ formOpen ? (es ? 'Cancelar' : 'Cancel') : (es ? '+ Desafío' : '+ Challenge') }}
      </button>
    </div>

    <p class="text-[11px] text-gray-500 leading-snug">
      {{
        es
          ? 'Retos que pone el coach fuera de la bolsa de trucos: no cuentan como trucos aprendidos.'
          : 'Coach-set goals outside the trick bag; they do not count as learned tricks.'
      }}
    </p>

    <form
      v-if="formOpen"
      class="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3"
      @submit.prevent="createChallenge"
    >
      <div>
        <label class="block text-xs text-gray-500 mb-1">{{ es ? 'Desafío' : 'Challenge' }}</label>
        <input
          v-model="draft.title"
          type="text"
          required
          maxlength="140"
          class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:border-amber-400 outline-none"
          :placeholder="es ? 'Ej. 10 ollies seguidos sin caer' : 'e.g. 10 ollies in a row'"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-500 mb-1">{{ es ? 'Detalle (opcional)' : 'Details (optional)' }}</label>
        <textarea
          v-model="draft.description"
          rows="2"
          class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm resize-y focus:border-amber-400 outline-none"
          :placeholder="es ? 'Cómo se logra, dónde practicarlo…' : 'How to get there, where to practise…'"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-500 mb-1">{{ es ? 'Fecha objetivo (opcional)' : 'Target date (optional)' }}</label>
        <input
          v-model="draft.due_date"
          type="date"
          class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm [color-scheme:dark] focus:border-amber-400 outline-none"
        />
      </div>
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="px-3 py-2 rounded-lg text-xs text-gray-400 hover:text-white"
          @click="closeForm"
        >
          {{ es ? 'Cancelar' : 'Cancel' }}
        </button>
        <button
          type="submit"
          class="px-4 py-2 rounded-lg bg-amber-500 text-black text-xs font-bold disabled:opacity-50"
          :disabled="saving || !draft.title.trim()"
        >
          {{ saving ? '…' : (es ? 'Crear desafío' : 'Create challenge') }}
        </button>
      </div>
    </form>

    <p v-if="errorMessage" class="text-xs text-red-400">{{ errorMessage }}</p>

    <div v-if="loading" class="flex justify-center py-6">
      <div class="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
    </div>

    <ul v-else-if="sorted.length" class="space-y-2">
      <li
        v-for="challenge in sorted"
        :key="challenge.id"
        class="flex items-start gap-3 rounded-lg border px-3 py-2.5"
        :class="
          challenge.status === 'completed'
            ? 'border-emerald-500/30 bg-emerald-500/5'
            : isChallengeOverdue(challenge)
              ? 'border-red-500/40 bg-red-500/5'
              : 'border-gray-800 bg-gray-950/50'
        "
      >
        <button
          type="button"
          class="mt-0.5 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors disabled:opacity-40"
          :class="
            challenge.status === 'completed'
              ? 'border-emerald-400 bg-emerald-500/25 text-emerald-300'
              : 'border-gray-600 text-transparent hover:border-amber-400'
          "
          :disabled="!canToggle(challenge) || busyId === challenge.id"
          :title="
            challenge.status === 'completed'
              ? (es ? 'Marcar como en curso' : 'Mark as open')
              : (es ? 'Marcar como completado' : 'Mark as completed')
          "
          @click="setChallengeStatus(challenge, challenge.status !== 'completed')"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
          </svg>
        </button>

        <div class="min-w-0 flex-1">
          <p
            class="text-sm font-medium leading-snug"
            :class="challenge.status === 'completed' ? 'text-gray-400 line-through' : 'text-white'"
          >
            {{ challenge.title }}
          </p>
          <p v-if="challenge.description" class="text-xs text-gray-500 mt-0.5 leading-snug">
            {{ challenge.description }}
          </p>
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            <span
              class="text-[10px] uppercase tracking-wide"
              :class="challenge.status === 'completed' ? 'text-emerald-400/80' : 'text-amber-400/80'"
            >
              {{ challengeStatusLabel(challenge.status, es) }}
            </span>
            <span
              v-if="dueLabel(challenge)"
              class="text-[10px]"
              :class="isChallengeOverdue(challenge) ? 'text-red-400' : 'text-gray-600'"
            >
              {{ es ? 'Meta' : 'Due' }}: {{ dueLabel(challenge) }}
            </span>
          </div>
        </div>

        <button
          v-if="canManage"
          type="button"
          class="shrink-0 text-gray-600 hover:text-red-400 transition-colors p-1"
          :disabled="busyId === challenge.id"
          :title="es ? 'Eliminar desafío' : 'Delete challenge'"
          @click="deleteChallenge(challenge)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </li>
    </ul>

    <p v-else class="text-xs text-gray-500">
      {{
        canManage
          ? (es ? 'Sin desafíos todavía. Crea uno con “+ Desafío”.' : 'No challenges yet. Create one with “+ Challenge”.')
          : (es ? 'Tu coach aún no te ha puesto un desafío.' : 'Your coach has not set a challenge yet.')
      }}
    </p>
  </div>
</template>
