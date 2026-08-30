<script setup lang="ts">
/**
 * Custom ramp enquiry form behind the "Contactar" CTA on /skateramps.
 *
 * Photos are compressed in the browser and posted as base64 to
 * /api/skateramps/request, which uploads them with the service role — the
 * images bucket has no anon write policy and should not get one for a public
 * form.
 */
import { compressImageForUpload } from '~/utils/compressImageForUpload'
import {
  RAMP_BUILD_TYPE_OPTIONS,
  RAMP_REQUEST_MAX_PHOTOS,
  RAMP_SKILL_LEVEL_OPTIONS,
  RAMP_SURFACE_OPTIONS,
  RAMP_TIMELINE_OPTIONS,
} from '~/utils/skaterampRequests'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { language } = useI18n()
const user = useSupabaseUser()
const es = computed(() => language.value === 'es')

const RAMP_PHOTO_UPLOAD = {
  maxWidth: 1600,
  maxHeight: 1600,
  maxBytes: 400 * 1024,
  mimeType: 'image/jpeg' as const,
  quality: 0.82,
  minQuality: 0.5,
}

type Draft = {
  full_name: string
  email: string
  phone: string
  city: string
  ramp_type: string
  space_width_m: string
  space_length_m: string
  surface: string
  skill_level: string
  budget_mxn: string
  timeline: string
  message: string
  company: string
}

const emptyDraft = (): Draft => ({
  full_name: '',
  email: '',
  phone: '',
  city: '',
  ramp_type: '',
  space_width_m: '',
  space_length_m: '',
  surface: '',
  skill_level: '',
  budget_mxn: '',
  timeline: '',
  message: '',
  company: '',
})

const draft = ref<Draft>(emptyDraft())
const photos = ref<{ file: File; preview: string }[]>([])
const submitting = ref(false)
const photoBusy = ref(false)
const errorMessage = ref<string | null>(null)
const submitted = ref(false)

const remainingPhotoSlots = computed(() => RAMP_REQUEST_MAX_PHOTOS - photos.value.length)

const canSubmit = computed(
  () =>
    !submitting.value
    && !photoBusy.value
    && draft.value.full_name.trim().length > 1
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.value.email.trim())
    && draft.value.message.trim().length >= 10,
)

function releasePhotos() {
  photos.value.forEach(p => URL.revokeObjectURL(p.preview))
  photos.value = []
}

function resetForm() {
  draft.value = emptyDraft()
  releasePhotos()
  errorMessage.value = null
  submitted.value = false
}

function close() {
  emit('close')
}

async function addPhotos(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || []).slice(0, remainingPhotoSlots.value)
  input.value = ''
  if (!files.length) return

  photoBusy.value = true
  errorMessage.value = null
  try {
    for (const file of files) {
      const compressed = await compressImageForUpload(file, RAMP_PHOTO_UPLOAD)
      photos.value.push({ file: compressed, preview: URL.createObjectURL(compressed) })
    }
  } catch {
    errorMessage.value = es.value
      ? 'No pudimos procesar una de las fotos. Intenta con otra imagen.'
      : 'We could not process one of the photos. Try another image.'
  } finally {
    photoBusy.value = false
  }
}

function removePhoto(index: number) {
  const [removed] = photos.value.splice(index, 1)
  if (removed) URL.revokeObjectURL(removed.preview)
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

async function submit() {
  if (!canSubmit.value) return
  submitting.value = true
  errorMessage.value = null

  try {
    const encoded = await Promise.all(
      photos.value.map(async p => ({
        name: p.file.name,
        type: p.file.type,
        data: await fileToBase64(p.file),
      })),
    )

    await $fetch('/api/skateramps/request', {
      method: 'POST',
      body: {
        ...draft.value,
        space_width_m: draft.value.space_width_m || null,
        space_length_m: draft.value.space_length_m || null,
        budget_mxn: draft.value.budget_mxn || null,
        photos: encoded,
      },
    })

    releasePhotos()
    submitted.value = true
  } catch (e: any) {
    errorMessage.value
      = e?.data?.message
        || e?.message
        || (es.value ? 'No pudimos enviar tu solicitud.' : 'We could not send your request.')
  } finally {
    submitting.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) close()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      resetForm()
      // Prefill so signed-in members do not retype what we already know.
      draft.value.email = user.value?.email || ''
      draft.value.full_name = (user.value?.user_metadata?.full_name as string) || ''
    }
    if (import.meta.client) {
      document.body.classList.toggle('overflow-hidden', open)
    }
  },
)

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  releasePhotos()
  if (import.meta.client) document.body.classList.remove('overflow-hidden')
})

const fieldClass
  = 'w-full px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-600 focus:border-gold-400 focus:outline-none'
const labelClass = 'block text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1.5'
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto bg-black/80 backdrop-blur-sm p-0 sm:p-6"
        role="dialog"
        aria-modal="true"
        @click.self="close"
      >
        <div
          class="w-full sm:max-w-2xl bg-gradient-to-br from-gray-950 to-black border-y sm:border-2 border-gold-500/40 sm:rounded-2xl my-0 sm:my-8"
        >
          <header
            class="sticky top-0 z-10 flex items-start gap-4 px-5 sm:px-7 py-4 border-b border-white/10 bg-gray-950/95 backdrop-blur sm:rounded-t-2xl"
          >
            <div class="flex-1 min-w-0">
              <h2 class="text-lg sm:text-xl font-black uppercase text-white">
                {{ es ? 'Cotiza tu rampa' : 'Quote your ramp' }}
              </h2>
              <p class="text-xs text-gray-400 mt-0.5">
                {{
                  es
                    ? 'Cuéntanos qué quieres construir y te contactamos con diseño y precio.'
                    : 'Tell us what you want to build and we will follow up with design and pricing.'
                }}
              </p>
            </div>
            <button
              type="button"
              class="shrink-0 w-9 h-9 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
              :aria-label="es ? 'Cerrar' : 'Close'"
              @click="close"
            >
              ✕
            </button>
          </header>

          <div v-if="submitted" class="px-5 sm:px-7 py-12 text-center">
            <div class="text-5xl mb-4">🛠️</div>
            <h3 class="text-xl font-black uppercase text-white mb-2">
              {{ es ? '¡Solicitud enviada!' : 'Request sent!' }}
            </h3>
            <p class="text-sm text-gray-400 max-w-sm mx-auto">
              {{
                es
                  ? 'Ya la tenemos. El equipo de NiikSkate revisa tu idea y te escribe al correo que nos dejaste.'
                  : 'We have it. The NiikSkate team will review your idea and email you back.'
              }}
            </p>
            <button
              type="button"
              class="mt-7 px-6 py-3 rounded-xl font-black uppercase text-sm bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400 text-black"
              @click="close"
            >
              {{ es ? 'Listo' : 'Done' }}
            </button>
          </div>

          <form v-else class="px-5 sm:px-7 py-6 space-y-6" @submit.prevent="submit">
            <!-- Honeypot: hidden from people, irresistible to bots. -->
            <input
              v-model="draft.company"
              type="text"
              tabindex="-1"
              autocomplete="off"
              aria-hidden="true"
              class="hidden"
            />

            <section class="space-y-4">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-gold-400">
                {{ es ? 'Tus datos' : 'Your details' }}
              </h3>
              <div class="grid sm:grid-cols-2 gap-4">
                <div>
                  <label :class="labelClass" for="ramp-name">{{ es ? 'Nombre' : 'Name' }} *</label>
                  <input id="ramp-name" v-model="draft.full_name" type="text" required :class="fieldClass" />
                </div>
                <div>
                  <label :class="labelClass" for="ramp-email">{{ es ? 'Correo' : 'Email' }} *</label>
                  <input id="ramp-email" v-model="draft.email" type="email" required :class="fieldClass" />
                </div>
                <div>
                  <label :class="labelClass" for="ramp-phone">{{ es ? 'WhatsApp / teléfono' : 'WhatsApp / phone' }}</label>
                  <input id="ramp-phone" v-model="draft.phone" type="tel" :class="fieldClass" />
                </div>
                <div>
                  <label :class="labelClass" for="ramp-city">{{ es ? 'Ciudad' : 'City' }}</label>
                  <input
                    id="ramp-city"
                    v-model="draft.city"
                    type="text"
                    :class="fieldClass"
                    :placeholder="es ? 'Ej. Querétaro' : 'e.g. Querétaro'"
                  />
                </div>
              </div>
            </section>

            <section class="space-y-4">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-gold-400">
                {{ es ? 'La rampa' : 'The ramp' }}
              </h3>
              <div class="grid sm:grid-cols-2 gap-4">
                <div>
                  <label :class="labelClass" for="ramp-type">{{ es ? 'Qué quieres construir' : 'What to build' }}</label>
                  <select id="ramp-type" v-model="draft.ramp_type" :class="fieldClass">
                    <option value="">{{ es ? 'Selecciona…' : 'Select…' }}</option>
                    <option v-for="opt in RAMP_BUILD_TYPE_OPTIONS" :key="opt.id" :value="opt.id">
                      {{ es ? opt.es : opt.en }}
                    </option>
                  </select>
                </div>
                <div>
                  <label :class="labelClass" for="ramp-surface">{{ es ? 'Superficie del lugar' : 'Ground surface' }}</label>
                  <select id="ramp-surface" v-model="draft.surface" :class="fieldClass">
                    <option value="">{{ es ? 'Selecciona…' : 'Select…' }}</option>
                    <option v-for="opt in RAMP_SURFACE_OPTIONS" :key="opt.id" :value="opt.id">
                      {{ es ? opt.es : opt.en }}
                    </option>
                  </select>
                </div>
                <div>
                  <label :class="labelClass">{{ es ? 'Espacio disponible (metros)' : 'Available space (metres)' }}</label>
                  <div class="flex items-center gap-2">
                    <input
                      v-model="draft.space_width_m"
                      type="number"
                      min="0"
                      step="0.5"
                      :class="fieldClass"
                      :placeholder="es ? 'Ancho' : 'Width'"
                    />
                    <span class="text-gray-600">×</span>
                    <input
                      v-model="draft.space_length_m"
                      type="number"
                      min="0"
                      step="0.5"
                      :class="fieldClass"
                      :placeholder="es ? 'Largo' : 'Length'"
                    />
                  </div>
                </div>
                <div>
                  <label :class="labelClass" for="ramp-level">{{ es ? 'Nivel de quien patina' : 'Rider level' }}</label>
                  <select id="ramp-level" v-model="draft.skill_level" :class="fieldClass">
                    <option value="">{{ es ? 'Selecciona…' : 'Select…' }}</option>
                    <option v-for="opt in RAMP_SKILL_LEVEL_OPTIONS" :key="opt.id" :value="opt.id">
                      {{ es ? opt.es : opt.en }}
                    </option>
                  </select>
                </div>
                <div>
                  <label :class="labelClass" for="ramp-budget">{{ es ? 'Presupuesto aprox. (MXN)' : 'Approx. budget (MXN)' }}</label>
                  <input
                    id="ramp-budget"
                    v-model="draft.budget_mxn"
                    type="number"
                    min="0"
                    step="500"
                    :class="fieldClass"
                    placeholder="15000"
                  />
                </div>
                <div>
                  <label :class="labelClass" for="ramp-timeline">{{ es ? '¿Para cuándo?' : 'Timeline' }}</label>
                  <select id="ramp-timeline" v-model="draft.timeline" :class="fieldClass">
                    <option value="">{{ es ? 'Selecciona…' : 'Select…' }}</option>
                    <option v-for="opt in RAMP_TIMELINE_OPTIONS" :key="opt.id" :value="opt.id">
                      {{ es ? opt.es : opt.en }}
                    </option>
                  </select>
                </div>
              </div>

              <div>
                <label :class="labelClass" for="ramp-message">{{ es ? 'Cuéntanos tu idea' : 'Tell us your idea' }} *</label>
                <textarea
                  id="ramp-message"
                  v-model="draft.message"
                  rows="4"
                  required
                  :class="[fieldClass, 'resize-y']"
                  :placeholder="
                    es
                      ? 'Ej. quiero una mini ramp de 1.2 m de alto para el patio de la casa, la usan mis dos hijos…'
                      : 'e.g. I want a 1.2 m mini ramp for the backyard, my two kids will use it…'
                  "
                />
              </div>
            </section>

            <section class="space-y-3">
              <h3 class="text-xs font-black uppercase tracking-[0.2em] text-gold-400">
                {{ es ? 'Fotos de tu idea' : 'Photos of your idea' }}
              </h3>
              <p class="text-xs text-gray-500">
                {{
                  es
                    ? `Sube hasta ${RAMP_REQUEST_MAX_PHOTOS} fotos: el espacio donde iría, un boceto o una rampa que te guste.`
                    : `Upload up to ${RAMP_REQUEST_MAX_PHOTOS} photos: the space, a sketch, or a ramp you like.`
                }}
              </p>

              <div v-if="photos.length" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  v-for="(photo, index) in photos"
                  :key="photo.preview"
                  class="relative aspect-square rounded-xl overflow-hidden border border-gray-700"
                >
                  <img :src="photo.preview" alt="" class="w-full h-full object-cover" />
                  <button
                    type="button"
                    class="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/75 text-white text-xs hover:bg-red-600 transition-colors"
                    :aria-label="es ? 'Quitar foto' : 'Remove photo'"
                    @click="removePhoto(index)"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <label
                v-if="remainingPhotoSlots > 0"
                class="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-gray-700 text-sm text-gray-400 cursor-pointer hover:border-gold-500/60 hover:text-white transition-colors"
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  class="hidden"
                  :disabled="photoBusy"
                  @change="addPhotos"
                />
                <span v-if="photoBusy">{{ es ? 'Procesando…' : 'Processing…' }}</span>
                <span v-else>
                  {{ es ? '+ Agregar fotos' : '+ Add photos' }}
                  <span class="text-gray-600">({{ remainingPhotoSlots }})</span>
                </span>
              </label>
            </section>

            <p v-if="errorMessage" class="text-sm text-red-400">{{ errorMessage }}</p>

            <div class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2">
              <button
                type="button"
                class="px-5 py-3 rounded-xl text-sm font-semibold text-gray-400 hover:text-white transition-colors"
                @click="close"
              >
                {{ es ? 'Cancelar' : 'Cancel' }}
              </button>
              <button
                type="submit"
                class="px-6 py-3 rounded-xl font-black uppercase text-sm bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400 text-black disabled:opacity-40 disabled:cursor-not-allowed"
                :disabled="!canSubmit"
              >
                {{ submitting ? (es ? 'Enviando…' : 'Sending…') : (es ? 'Enviar solicitud' : 'Send request') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
