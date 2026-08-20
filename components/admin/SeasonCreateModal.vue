<script setup lang="ts">
import type { ProgramSeason, ProgramSeasonStatus } from '~/utils/programSeasons'
import { findOverlappingRegularSeason } from '~/utils/programSeasons'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  created: [season: ProgramSeason]
}>()

const { language } = useI18n()
const client = useSupabaseClient()
const { seasons: existingSeasons } = useProgramSeasons()
const es = computed(() => language.value === 'es')

const saving = ref(false)
const formError = ref('')
const form = ref({
  name_es: '',
  name_en: '',
  start_date: '',
  end_date: '',
  status: 'enrolling' as ProgramSeasonStatus,
  icon: '📅',
})

const icons = ['📅', '⛅', '☀️', '❄️', '🍁', '🌸']

watch(
  () => props.open,
  open => {
    if (!open) return
    formError.value = ''
    form.value = {
      name_es: '',
      name_en: '',
      start_date: '',
      end_date: '',
      status: 'enrolling',
      icon: '📅',
    }
  },
)

const submit = async () => {
  formError.value = ''
  if (!form.value.name_es.trim()) {
    formError.value = es.value ? 'El título es obligatorio (ej. Fall1)' : 'Title is required (e.g. Fall1)'
    return
  }
  if (!form.value.start_date || !form.value.end_date) {
    formError.value = es.value ? 'Elige fechas de inicio y fin' : 'Choose start and end dates'
    return
  }
  if (form.value.end_date < form.value.start_date) {
    formError.value = es.value ? 'La fecha fin no puede ser antes del inicio' : 'End date cannot be before start date'
    return
  }
  const overlap = findOverlappingRegularSeason(
    {
      startDate: form.value.start_date,
      endDate: form.value.end_date,
      name: { es: form.value.name_es.trim(), en: (form.value.name_en.trim() || form.value.name_es.trim()) },
    },
    existingSeasons.value,
  )
  if (overlap) {
    formError.value = es.value
      ? `Las temporadas no pueden cruzarse (excepto curso de verano). Se cruza con ${overlap.name.es}.`
      : `Seasons can't overlap (except summer camp). It overlaps ${overlap.name.en}.`
    return
  }
  saving.value = true
  try {
    const { data } = await client.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error(es.value ? 'Sesión expirada' : 'Session expired')
    const season = await $fetch<ProgramSeason>('/api/admin/seasons', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        name_es: form.value.name_es.trim(),
        name_en: form.value.name_en.trim() || form.value.name_es.trim(),
        start_date: form.value.start_date,
        end_date: form.value.end_date,
        status: form.value.status,
        icon: form.value.icon,
      },
    })
    emit('created', season)
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }; message?: string }
    formError.value = err?.data?.message || err?.message || 'Error'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-[80] bg-black/70 flex items-end sm:items-center justify-center p-4"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-700 p-5 space-y-4">
        <div class="flex items-start justify-between gap-3">
          <h2 class="text-lg font-bold text-white">
            {{ es ? 'Nueva temporada' : 'New season' }}
          </h2>
          <button type="button" class="p-1 text-gray-400 hover:text-white" @click="emit('close')">×</button>
        </div>

        <p v-if="formError" class="text-sm text-red-300">{{ formError }}</p>

        <label class="block">
          <span class="block text-xs text-gray-400 mb-1">{{ es ? 'Título' : 'Title' }} *</span>
          <input
            v-model="form.name_es"
            type="text"
            maxlength="60"
            class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
            :placeholder="es ? 'Ej. Fall1' : 'e.g. Fall1'"
          />
        </label>

        <label class="block">
          <span class="block text-xs text-gray-400 mb-1">{{ es ? 'Título (EN, opcional)' : 'English title (optional)' }}</span>
          <input
            v-model="form.name_en"
            type="text"
            maxlength="60"
            class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
          />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="block text-xs text-gray-400 mb-1">{{ es ? 'Inicio' : 'Start' }} *</span>
            <input
              v-model="form.start_date"
              type="date"
              class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
            />
          </label>
          <label class="block">
            <span class="block text-xs text-gray-400 mb-1">{{ es ? 'Fin' : 'End' }} *</span>
            <input
              v-model="form.end_date"
              type="date"
              class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
            />
          </label>
        </div>

        <div>
          <p class="text-xs text-gray-400 mb-1">{{ es ? 'Inscripciones' : 'Registration' }}</p>
          <div class="grid grid-cols-3 gap-1.5">
            <button
              v-for="opt in ([
                { id: 'enrolling', es: 'Abiertas', en: 'Open' },
                { id: 'soon', es: 'Pronto', en: 'Soon' },
                { id: 'closed', es: 'Cerrado', en: 'Closed' },
              ] as const)"
              :key="opt.id"
              type="button"
              class="rounded-lg border px-2 py-2 text-[11px] font-semibold"
              :class="
                form.status === opt.id
                  ? 'border-cyan-400 bg-cyan-500/20 text-white'
                  : 'border-gray-600 text-gray-400'
              "
              @click="form.status = opt.id"
            >
              {{ es ? opt.es : opt.en }}
            </button>
          </div>
        </div>

        <div>
          <p class="text-xs text-gray-400 mb-1">{{ es ? 'Ícono' : 'Icon' }}</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="ic in icons"
              :key="ic"
              type="button"
              class="w-9 h-9 rounded-lg border text-lg"
              :class="form.icon === ic ? 'border-cyan-400 bg-cyan-500/20' : 'border-gray-600'"
              @click="form.icon = ic"
            >
              {{ ic }}
            </button>
          </div>
        </div>

        <div class="flex gap-2 pt-1">
          <button
            type="button"
            class="flex-1 px-4 py-2.5 rounded-xl bg-gray-800 text-white text-sm font-semibold"
            @click="emit('close')"
          >
            {{ es ? 'Cancelar' : 'Cancel' }}
          </button>
          <button
            type="button"
            class="flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400 disabled:opacity-50"
            :disabled="saving"
            @click="submit"
          >
            {{ saving ? (es ? 'Creando…' : 'Creating…') : (es ? 'Crear página' : 'Create page') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
