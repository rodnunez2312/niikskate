<script setup lang="ts">
import { compressImageForUpload } from '~/utils/compressImageForUpload'
import {
  ACTIVITY_TYPES,
  AREA_MODULES,
  PARTNER_TYPES,
  activityTypeLabel,
  areaModuleFor,
  type AreaModuleId,
  emptyAlliance,
  emptyArea,
  parseAllianceNotes,
  partnerTypeLabel,
  serializeAllianceNotes,
  type AllianceNote,
  publishErrors,
  type AllianceArea,
  type AllianceRecord,
  type AllianceStatus,
} from '~/utils/alliances'

definePageMeta({ layout: 'member', middleware: ['auth', 'member'] })

const route = useRoute()
const client = useSupabaseClient()
const isNew = computed(() => route.params.id === 'new')
const form = reactive<AllianceRecord>(emptyAlliance())
const loading = ref(!isNew.value)
const saving = ref(false)
const uploading = ref('')
const message = ref('')
const error = ref('')
const fieldErrors = ref<string[]>([])
const localPreview = ref<Record<string, string>>({})

const title = computed(() => isNew.value ? 'Nueva alianza' : form.name || 'Editar alianza')

async function authHeaders() {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesión expirada.')
  return { Authorization: `Bearer ${token}` }
}

function applyAlliance(alliance: AllianceRecord) {
  Object.assign(form, alliance)
  form.areas = alliance.areas.map(area => ({ ...area }))
  editingKey.value = ''
  notes.value = parseAllianceNotes(alliance.internal_notes)
}

const { fullName: myName } = useSiteProfile()
const notes = ref<AllianceNote[]>([])
const notesOpen = ref(false)
const addingNote = ref(false)
const newNote = ref('')
const newNoteInput = ref<HTMLTextAreaElement | null>(null)

watch(notes, (list) => { form.internal_notes = serializeAllianceNotes(list) }, { deep: true })

async function startNote() {
  notesOpen.value = true
  addingNote.value = true
  await nextTick()
  newNoteInput.value?.focus()
}

function cancelNote() {
  addingNote.value = false
  newNote.value = ''
}

function addNote() {
  const text = newNote.value.trim()
  if (!text) return
  notes.value.unshift({
    id: crypto.randomUUID(),
    text,
    created_at: new Date().toISOString(),
    author: myName.value || '',
  })
  cancelNote()
}

function removeNote(note: AllianceNote) {
  if (!window.confirm('¿Borrar esta nota?')) return
  notes.value = notes.value.filter(item => item.id !== note.id)
}

function noteMeta(note: AllianceNote) {
  const when = note.created_at
    ? new Date(note.created_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Nota anterior'
  return note.author ? `${note.author} · ${when}` : when
}

async function load() {
  if (isNew.value) return
  loading.value = true
  error.value = ''
  try {
    const response = await $fetch<{ alliance: AllianceRecord }>(`/api/admin/alliances/${route.params.id}`, {
      headers: await authHeaders(),
    })
    applyAlliance(response.alliance)
  } catch (err: unknown) {
    const known = err as { data?: { message?: string }; message?: string }
    error.value = known.data?.message || known.message || 'No se pudo cargar la alianza.'
  } finally {
    loading.value = false
  }
}

function onPlace(place: { placeId: string; name: string; address: string; url: string; lat: number | null; lng: number | null }) {
  form.google_place_id = place.placeId
  form.google_maps_url = place.url
  form.latitude = place.lat
  form.longitude = place.lng
  if (place.name) form.location_name = place.name
  if (place.address) form.formatted_address = place.address
}

function clearPlaceSelection() {
  form.google_place_id = ''
  form.latitude = null
  form.longitude = null
  form.google_maps_url = ''
}

const areaKeys = new WeakMap<object, string>()

/** Stable per-card key; new areas have no id until saved. */
function areaKey(area: AllianceArea) {
  const raw = toRaw(area)
  let key = areaKeys.get(raw)
  if (!key) {
    key = area.id || crypto.randomUUID()
    areaKeys.set(raw, key)
  }
  return key
}

const areaBoard = computed(() =>
  AREA_MODULES.map(module => ({
    module,
    items: form.areas.filter(area => areaModuleFor(area.activity_type) === module.id),
  })),
)

const editingKey = ref('')
const editingArea = computed(() => form.areas.find(area => areaKey(area) === editingKey.value) ?? null)

function areaIncomplete(area: AllianceArea) {
  return !area.title.trim() || !area.details.trim()
}

/** Public order follows the board: module by module, top to bottom. */
function syncAreaOrder() {
  const rank = (area: AllianceArea) => AREA_MODULES.findIndex(module => module.id === areaModuleFor(area.activity_type))
  const sorted = form.areas
    .map((area, index) => ({ area, index }))
    .sort((a, b) => rank(a.area) - rank(b.area) || a.index - b.index)
    .map(entry => entry.area)
  form.areas.splice(0, form.areas.length, ...sorted)
  form.areas.forEach((area, order) => { area.display_order = order })
}

function addArea(moduleId: AreaModuleId) {
  const module = AREA_MODULES.find(item => item.id === moduleId)!
  const area = emptyArea(form.areas.length)
  area.activity_type = module.types[0]
  form.areas.push(area)
  syncAreaOrder()
  editingKey.value = areaKey(area)
}

function removeArea(area: AllianceArea) {
  if ((area.title.trim() || area.details.trim()) && !window.confirm(`¿Quitar el área "${area.title || 'sin título'}"?`)) return
  const key = `area-${areaKey(area)}`
  if (localPreview.value[key]) URL.revokeObjectURL(localPreview.value[key])
  if (editingKey.value === areaKey(area)) editingKey.value = ''
  form.areas.splice(form.areas.indexOf(area), 1)
  syncAreaOrder()
}

const dragKey = ref('')
const dropModule = ref<AreaModuleId | ''>('')

function onAreaDragStart(event: DragEvent, area: AllianceArea) {
  dragKey.value = areaKey(area)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', dragKey.value)
  }
}

function onAreaDragEnd() {
  dragKey.value = ''
  dropModule.value = ''
}

function dropArea(moduleId: AreaModuleId, before?: AllianceArea) {
  const key = dragKey.value
  onAreaDragEnd()
  if (!key || (before && areaKey(before) === key)) return
  const from = form.areas.findIndex(area => areaKey(area) === key)
  if (from < 0) return
  const [area] = form.areas.splice(from, 1)
  if (areaModuleFor(area.activity_type) !== moduleId) {
    area.activity_type = AREA_MODULES.find(item => item.id === moduleId)!.types[0]
  }
  const at = before ? form.areas.indexOf(before) : -1
  if (at >= 0) form.areas.splice(at, 0, area)
  else form.areas.push(area)
  syncAreaOrder()
}

const logoSrc = computed(() => previewSrc('logo', form.logo_image_url))
const coverSrc = computed(() => previewSrc('cover', form.cover_image_url))
const cardTitle = computed(() => (!isNew.value && form.name.trim()) || 'Aliado')

const lightbox = ref<{ src: string; alt: string } | null>(null)
const downloading = ref(false)

function openLightbox(src: string, alt: string) {
  lightbox.value = { src, alt }
}

function closeLightbox() {
  lightbox.value = null
}

function onLightboxKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && lightbox.value) {
    event.stopPropagation()
    closeLightbox()
  }
}

onMounted(() => window.addEventListener('keydown', onLightboxKey, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onLightboxKey, true))

function downloadName(src: string, alt: string) {
  const ext = src.split('?')[0]?.match(/\.(jpe?g|png|webp)$/i)?.[1] || 'jpg'
  const base = (alt || form.name || 'imagen')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  return `${base || 'imagen'}.${ext}`
}

/** Fetch as a blob so the browser saves the file instead of navigating to it. */
async function downloadLightbox() {
  if (!lightbox.value) return
  const { src, alt } = lightbox.value
  downloading.value = true
  try {
    const response = await fetch(src)
    if (!response.ok) throw new Error('download')
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = downloadName(src, alt)
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    window.open(src, '_blank', 'noopener')
  } finally {
    downloading.value = false
  }
}

function onEditorType(area: AllianceArea, value: string) {
  setType(area, value)
  syncAreaOrder()
}

function typeChoice(area: AllianceArea) {
  return (ACTIVITY_TYPES as readonly string[]).includes(area.activity_type) ? area.activity_type : 'other'
}

function setType(area: AllianceArea, value: string) {
  area.activity_type = value
}

function previewSrc(key: string, url: string) {
  return localPreview.value[key] || url
}

async function uploadImage(file: File, kind: 'logo' | 'cover' | 'area') {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  if (!allowed.includes(file.type)) throw new Error('Usa PNG, JPEG o WebP.')
  if (file.size > 8 * 1024 * 1024) throw new Error('La imagen supera 8 MB.')
  let body: Blob = file
  let contentType = file.type
  let ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  if (kind !== 'logo') {
    body = await compressImageForUpload(file, { maxWidth: 1600, maxHeight: 1600, maxBytes: 700 * 1024 })
    contentType = body.type || 'image/jpeg'
    ext = contentType === 'image/webp' ? 'webp' : 'jpg'
  }
  const path = `alliances/${crypto.randomUUID()}.${ext}`
  const { error: uploadError } = await client.storage.from('images').upload(path, body, { contentType, upsert: false })
  if (uploadError) throw uploadError
  const { data } = client.storage.from('images').getPublicUrl(path)
  if (!data.publicUrl) throw new Error('No se obtuvo la URL de la imagen.')
  return data.publicUrl
}

async function onImage(event: Event, kind: 'logo' | 'cover' | 'area', area?: AllianceArea) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const key = kind === 'area' ? `area-${areaKey(area!)}` : kind
  error.value = ''
  uploading.value = key
  const blobUrl = URL.createObjectURL(file)
  localPreview.value[key] = blobUrl
  try {
    const url = await uploadImage(file, kind)
    if (kind === 'logo') form.logo_image_url = url
    else if (kind === 'cover') form.cover_image_url = url
    else if (area) area.image_url = url
    URL.revokeObjectURL(blobUrl)
    delete localPreview.value[key]
  } catch (err: unknown) {
    URL.revokeObjectURL(blobUrl)
    delete localPreview.value[key]
    error.value = err instanceof Error ? err.message : 'No se pudo subir la imagen.'
  } finally {
    uploading.value = ''
  }
}

function clearImage(kind: 'logo' | 'cover', area?: AllianceArea) {
  if (kind === 'logo') form.logo_image_url = ''
  if (kind === 'cover') form.cover_image_url = ''
  if (area) area.image_url = ''
}

async function save(status: AllianceStatus) {
  message.value = ''
  error.value = ''
  form.status = status
  syncAreaOrder()
  fieldErrors.value = status === 'published' ? publishErrors(form, true) : []
  if (fieldErrors.value.length) return
  saving.value = true
  try {
    const response = await $fetch<{ alliance: AllianceRecord }>(
      isNew.value ? '/api/admin/alliances' : `/api/admin/alliances/${form.id}`,
      {
        method: isNew.value ? 'POST' : 'PUT',
        headers: await authHeaders(),
        body: { ...form, areas: form.areas },
      },
    )
    applyAlliance(response.alliance)
    message.value = status === 'published' ? 'Alianza publicada.' : 'Cambios guardados.'
    if (isNew.value) await navigateTo(`/member/admin/alliances/${response.alliance.id}`)
  } catch (err: unknown) {
    const known = err as { data?: { message?: string }; message?: string }
    error.value = known.data?.message || known.message || 'No se pudo guardar la alianza.'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <MemberStaffPageHeader :title="title" subtitle="Gestiona las alianzas estratégicas de Niik Skate.">
      <template #actions>
        <NuxtLink to="/member/admin/alliances" class="px-3 py-2 rounded-xl border border-gray-700 text-sm">Lista</NuxtLink>
        <NuxtLink
          v-if="form.slug"
          :to="`/alianzas/${form.slug}?preview=1`"
          target="_blank"
          class="px-3 py-2 rounded-xl border border-gray-700 text-sm"
        >
          Vista previa
        </NuxtLink>
        <button type="button" class="px-3 py-2 rounded-xl border border-gray-700 text-sm" :disabled="saving" @click="save(form.status)">
          Guardar
        </button>
        <button type="button" class="px-3 py-2 rounded-xl bg-acid text-charcoal text-sm font-bold" :disabled="saving" @click="save('published')">
          Publicar
        </button>
      </template>
    </MemberStaffPageHeader>

    <div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <p v-if="loading" class="text-sm text-gray-500">Cargando…</p>
      <p v-if="error" class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{{ error }}</p>
      <p v-if="message" class="rounded-xl border border-acid/40 bg-acid/10 px-4 py-3 text-sm text-acid">{{ message }}</p>
      <ul v-if="fieldErrors.length" class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 list-disc pl-8">
        <li v-for="item in fieldErrors" :key="item">{{ item }}</li>
      </ul>

      <form v-if="!loading" class="space-y-6" @submit.prevent="save(form.status)">
        <section class="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
          <!-- Cover banner -->
          <div class="relative h-40 sm:h-52 bg-gradient-to-br from-gray-800 via-gray-900 to-black">
            <button
              v-if="coverSrc"
              type="button"
              class="absolute inset-0 w-full h-full cursor-zoom-in"
              aria-label="Ver portada"
              @click="openLightbox(coverSrc, form.name ? `Portada de ${form.name}` : 'Portada')"
            >
              <img :src="coverSrc" alt="" class="w-full h-full object-cover">
            </button>
            <div class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30" />

            <h2 class="pointer-events-none absolute left-5 right-5 top-4 sm:top-auto sm:bottom-3 sm:left-[8.75rem] sm:right-48 font-display text-2xl sm:text-3xl font-black uppercase tracking-tight text-white truncate drop-shadow">
              {{ cardTitle }}
            </h2>

            <div class="absolute bottom-3 right-3 flex items-center gap-2">
              <button
                v-if="form.cover_image_url"
                type="button"
                class="w-8 h-8 rounded-lg bg-black/60 text-white text-base leading-none hover:bg-red-600"
                aria-label="Quitar portada"
                @click="clearImage('cover')"
              >
                ×
              </button>
              <label class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-charcoal text-xs font-bold shadow cursor-pointer hover:bg-cream">
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" />
                  <path fill-rule="evenodd" d="M9.344 3.071a49.52 49.52 0 015.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 01-3 3h-15a3 3 0 01-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 001.11-.71l.822-1.315a2.942 2.942 0 012.332-1.39zM6.75 12.75a5.25 5.25 0 1110.5 0 5.25 5.25 0 01-10.5 0z" clip-rule="evenodd" />
                </svg>
                {{ form.cover_image_url ? 'Editar portada' : 'Agregar portada' }}
                <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" :disabled="uploading === 'cover'" @change="onImage($event, 'cover')">
              </label>
            </div>

            <span v-if="uploading === 'cover'" class="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span class="w-6 h-6 border-2 border-acid border-t-transparent rounded-full animate-spin" />
            </span>
          </div>

          <div class="px-5 pb-5 space-y-4">
          <div class="flex flex-col sm:flex-row gap-4">
            <!-- Logo, overlapping the cover -->
            <div class="group/logo relative -mt-12 w-24 h-24 shrink-0 rounded-2xl border-4 border-gray-900 bg-gray-800 overflow-hidden z-10">
              <button
                v-if="logoSrc"
                type="button"
                class="w-full h-full flex items-center justify-center bg-white cursor-zoom-in"
                aria-label="Ver logo"
                @click="openLightbox(logoSrc, form.name ? `Logo de ${form.name}` : 'Logo')"
              >
                <img :src="logoSrc" :alt="form.name ? `Logo de ${form.name}` : 'Logo'" class="max-w-full max-h-full object-contain p-1.5">
              </button>
              <label v-else class="w-full h-full flex flex-col items-center justify-center gap-0.5 cursor-pointer text-gray-400 hover:text-acid">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                <span class="text-[10px] font-semibold">Logo</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" :disabled="uploading === 'logo'" @change="onImage($event, 'logo')">
              </label>

              <div v-if="logoSrc" class="absolute top-1 right-1 flex gap-1 opacity-0 group-hover/logo:opacity-100 focus-within:opacity-100 transition-opacity">
                <label class="w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center cursor-pointer hover:bg-black" title="Cambiar logo">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.25" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.86 4.49l2.65 2.65M4.5 19.5l3.82-.85L19.5 7.47a1.88 1.88 0 00-2.65-2.65L5.67 16l-.85 3.82z" />
                  </svg>
                  <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" :disabled="uploading === 'logo'" @change="onImage($event, 'logo')">
                </label>
                <button
                  type="button"
                  class="w-6 h-6 rounded-full bg-black/70 text-white text-sm leading-none flex items-center justify-center hover:bg-red-600"
                  aria-label="Quitar logo"
                  @click="clearImage('logo')"
                >
                  ×
                </button>
              </div>

              <span v-if="uploading === 'logo'" class="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span class="w-5 h-5 border-2 border-acid border-t-transparent rounded-full animate-spin" />
              </span>
            </div>

            <div class="min-w-0 flex-1 grid sm:grid-cols-2 gap-4 sm:pt-4">
              <label class="block">
                <span class="block text-xs text-gray-400 mb-1">Nombre de la alianza</span>
                <input v-model="form.name" required class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm">
              </label>
              <label class="block">
                <span class="block text-xs text-gray-400 mb-1">Tipo de aliado</span>
                <select v-model="form.partner_type" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm">
                  <option v-for="type in PARTNER_TYPES" :key="type" :value="type">{{ partnerTypeLabel(type, true) }}</option>
                </select>
              </label>
            </div>
          </div>
          <AdminPlaceSearch
            :location-name="form.location_name"
            :formatted-address="form.formatted_address"
            :verified="Boolean(form.google_place_id)"
            @update:location-name="form.location_name = $event"
            @update:formatted-address="form.formatted_address = $event"
            @place="onPlace"
            @clear="clearPlaceSelection"
          />
          <label class="block">
            <span class="block text-xs text-gray-400 mb-1">Objetivo de la alianza</span>
            <textarea v-model="form.objective" rows="5" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm" />
          </label>
          <AdminCollapsible title="Introducción corta para la tarjeta">
            <textarea v-model="form.short_description" rows="3" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm" />
          </AdminCollapsible>
          <div class="grid sm:grid-cols-2 gap-4">
            <label class="block">
              <span class="block text-xs text-gray-400 mb-1">Sitio web</span>
              <input v-model="form.external_website_url" type="url" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm" placeholder="https://">
            </label>
            <label class="block">
              <span class="block text-xs text-gray-400 mb-1">Inicio de la alianza</span>
              <input v-model="form.started_on" type="date" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm">
            </label>
          </div>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="form.founding_partner" type="checkbox" class="accent-acid">
            Socio educativo fundador
          </label>
          <AdminCollapsible v-model:open="notesOpen" title="Notas internas" :meta="notes.length || null">
            <template #actions>
              <button
                type="button"
                class="shrink-0 text-xs text-gray-500 hover:text-white"
                @click="startNote"
              >
                Agregar nota
              </button>
            </template>

            <div class="space-y-2">
              <div v-if="addingNote" class="rounded-xl border border-gray-700 bg-gray-800 p-2">
                <textarea
                  ref="newNoteInput"
                  v-model="newNote"
                  rows="3"
                  placeholder="Escribe una nota…"
                  class="w-full px-2 py-1.5 bg-transparent text-sm text-white focus:outline-none resize-y"
                  @keydown.ctrl.enter.prevent="addNote"
                  @keydown.meta.enter.prevent="addNote"
                  @keydown.esc.prevent="cancelNote"
                />
                <div class="flex items-center justify-end gap-2 pt-1">
                  <button type="button" class="px-3 py-1.5 text-xs text-gray-400 hover:text-white" @click="cancelNote">Cancelar</button>
                  <button type="button" class="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs font-semibold hover:bg-white/15 disabled:opacity-40" :disabled="!newNote.trim()" @click="addNote">Guardar nota</button>
                </div>
              </div>

              <ul v-if="notes.length" class="divide-y divide-gray-800">
                <li v-for="note in notes" :key="note.id" class="group/note py-2">
                  <div class="flex items-start gap-2">
                    <p class="min-w-0 flex-1 text-sm text-gray-100 whitespace-pre-line break-words">{{ note.text }}</p>
                    <button
                      type="button"
                      class="w-6 h-6 shrink-0 rounded-full text-gray-500 hover:text-red-300 hover:bg-red-500/10 opacity-60 group-hover/note:opacity-100"
                      aria-label="Borrar nota"
                      @click="removeNote(note)"
                    >
                      ×
                    </button>
                  </div>
                  <p class="mt-1 text-[10px] text-gray-500">{{ noteMeta(note) }}</p>
                </li>
              </ul>
              <p v-else-if="!addingNote" class="text-xs text-gray-600 py-1">Sin notas. Usa + para agregar una.</p>
              <p v-if="notes.length || addingNote" class="text-[10px] text-gray-600">Solo staff · las notas se guardan al presionar Guardar.</p>
            </div>
          </AdminCollapsible>
          <AdminCollapsible title="Texto en inglés">
            <div class="space-y-3">
              <textarea v-model="form.objective_en" rows="3" placeholder="Objetivo en inglés" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-white" />
              <textarea v-model="form.short_description_en" rows="2" placeholder="Introducción en inglés" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm text-white" />
            </div>
          </AdminCollapsible>
          </div>
        </section>

        <section class="space-y-3">
          <div class="flex items-baseline justify-between gap-3">
            <h2 class="font-bold">Áreas de contribución</h2>
            <p class="text-xs text-gray-500">Arrastra las tarjetas entre módulos · toca la miniatura para subir imagen</p>
          </div>

          <div class="grid sm:grid-cols-2 gap-3">
            <div
              v-for="column in areaBoard"
              :key="column.module.id"
              class="rounded-2xl border bg-gray-900 p-3 flex flex-col min-h-[9rem] transition-colors"
              :class="dropModule === column.module.id ? 'border-acid/70 bg-acid/5' : 'border-gray-800'"
              @dragover.prevent="dropModule = column.module.id"
              @dragleave.self="dropModule = ''"
              @drop.prevent="dropArea(column.module.id)"
            >
              <div class="flex items-center justify-between gap-2 mb-2">
                <p class="text-xs font-black uppercase tracking-wide text-gray-300 truncate">
                  {{ column.module.es }}
                  <span class="ml-1 font-semibold text-gray-500">{{ column.items.length }}</span>
                </p>
                <button
                  type="button"
                  class="w-7 h-7 shrink-0 rounded-full bg-acid text-charcoal text-base font-black leading-none flex items-center justify-center hover:brightness-95"
                  :aria-label="`Añadir área en ${column.module.es}`"
                  @click="addArea(column.module.id)"
                >
                  +
                </button>
              </div>

              <ul class="space-y-2 flex-1">
                <li
                  v-for="area in column.items"
                  :key="areaKey(area)"
                  draggable="true"
                  class="group flex items-center gap-2.5 rounded-xl border bg-gray-800 p-2 cursor-grab active:cursor-grabbing"
                  :class="[
                    dragKey === areaKey(area) ? 'opacity-40' : '',
                    editingKey === areaKey(area) ? 'border-acid' : areaIncomplete(area) ? 'border-amber-500/40' : 'border-gray-700 hover:border-gray-500',
                  ]"
                  @dragstart="onAreaDragStart($event, area)"
                  @dragend="onAreaDragEnd"
                  @dragover.prevent
                  @drop.prevent.stop="dropArea(column.module.id, area)"
                >
                  <label
                    class="relative w-10 h-10 shrink-0 rounded-lg border border-gray-700 bg-gray-900 overflow-hidden flex items-center justify-center cursor-pointer hover:border-acid"
                    :title="area.image_url ? 'Cambiar imagen' : 'Subir imagen'"
                  >
                    <img
                      v-if="previewSrc(`area-${areaKey(area)}`, area.image_url)"
                      :src="previewSrc(`area-${areaKey(area)}`, area.image_url)"
                      :alt="area.image_alt || area.title"
                      class="w-full h-full object-cover"
                    >
                    <svg v-else class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" stroke-width="1.75" viewBox="0 0 24 24" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.16-5.16a2.25 2.25 0 013.18 0l5.16 5.16m-1.5-1.5l1.41-1.41a2.25 2.25 0 013.18 0l2.91 2.91M3.75 19.5h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
                    </svg>
                    <span v-if="uploading === `area-${areaKey(area)}`" class="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span class="w-4 h-4 border-2 border-acid border-t-transparent rounded-full animate-spin" />
                    </span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" @change="onImage($event, 'area', area)">
                  </label>
                  <button type="button" class="min-w-0 flex-1 text-left" @click="editingKey = areaKey(area)">
                    <span class="block text-sm font-semibold truncate" :class="area.title ? 'text-white' : 'text-gray-500 italic'">
                      {{ area.title || 'Sin título' }}
                    </span>
                    <span class="block text-[11px] text-gray-500 truncate">{{ activityTypeLabel(area.activity_type, true) }}</span>
                  </button>
                  <button
                    type="button"
                    class="w-6 h-6 shrink-0 rounded-full text-gray-500 hover:text-red-300 hover:bg-red-500/10 opacity-60 group-hover:opacity-100"
                    aria-label="Quitar área"
                    @click="removeArea(area)"
                  >
                    ×
                  </button>
                </li>
              </ul>
              <p v-if="!column.items.length" class="text-xs text-gray-600 text-center py-3">Sin áreas · usa + o arrastra aquí</p>
            </div>
          </div>
        </section>

        <Teleport to="body">
          <div
            v-if="editingArea"
            class="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
            @click.self="editingKey = ''"
          >
            <div class="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-gray-800 bg-gray-900 text-white p-5 space-y-3">
              <div class="flex items-center justify-between gap-2">
                <p class="font-bold">Editar área</p>
                <button type="button" class="w-8 h-8 rounded-full text-gray-400 hover:text-white hover:bg-gray-800" aria-label="Cerrar" @click="editingKey = ''">×</button>
              </div>

              <div class="flex gap-3">
                <button
                  v-if="previewSrc(`area-${areaKey(editingArea)}`, editingArea.image_url)"
                  type="button"
                  class="group/img relative w-24 h-24 shrink-0 rounded-xl border border-gray-700 bg-gray-800 overflow-hidden cursor-zoom-in hover:border-acid"
                  aria-label="Ver imagen completa"
                  @click="openLightbox(previewSrc(`area-${areaKey(editingArea)}`, editingArea.image_url), editingArea.image_alt || editingArea.title)"
                >
                  <img
                    :src="previewSrc(`area-${areaKey(editingArea)}`, editingArea.image_url)"
                    :alt="editingArea.image_alt || editingArea.title"
                    class="w-full h-full object-cover"
                  >
                  <span class="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center" aria-hidden="true">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                  </span>
                  <span v-if="uploading === `area-${areaKey(editingArea)}`" class="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span class="w-5 h-5 border-2 border-acid border-t-transparent rounded-full animate-spin" />
                  </span>
                </button>
                <label
                  v-else
                  class="relative w-24 h-24 shrink-0 rounded-xl border border-dashed border-gray-600 bg-gray-800 flex items-center justify-center cursor-pointer hover:border-acid"
                >
                  <span class="text-[11px] text-gray-500 text-center px-2">Subir imagen</span>
                  <span v-if="uploading === `area-${areaKey(editingArea)}`" class="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl">
                    <span class="w-5 h-5 border-2 border-acid border-t-transparent rounded-full animate-spin" />
                  </span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" @change="onImage($event, 'area', editingArea)">
                </label>
                <div class="min-w-0 flex-1 space-y-2">
                  <label class="block">
                    <span class="block text-xs text-gray-400 mb-1">Texto alternativo</span>
                    <input v-model="editingArea.image_alt" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm">
                  </label>
                  <div v-if="editingArea.image_url" class="flex items-center gap-3 text-xs">
                    <label class="cursor-pointer text-gray-300 hover:text-white">
                      Cambiar imagen
                      <input type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" @change="onImage($event, 'area', editingArea)">
                    </label>
                    <button type="button" class="text-gray-400 hover:text-white" @click="editingArea.image_url = ''">Quitar imagen</button>
                  </div>
                </div>
              </div>

              <label class="block">
                <span class="block text-xs text-gray-400 mb-1">Tipo de actividad</span>
                <select :value="typeChoice(editingArea)" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm" @change="onEditorType(editingArea, ($event.target as HTMLSelectElement).value)">
                  <option v-for="type in ACTIVITY_TYPES" :key="type" :value="type">{{ activityTypeLabel(type, true) }}</option>
                </select>
              </label>
              <label v-if="typeChoice(editingArea) === 'other'" class="block">
                <span class="block text-xs text-gray-400 mb-1">Tipo personalizado</span>
                <input
                  :value="editingArea.activity_type === 'other' ? '' : editingArea.activity_type"
                  class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm"
                  @input="editingArea.activity_type = ($event.target as HTMLInputElement).value || 'other'"
                >
              </label>
              <label class="block">
                <span class="block text-xs text-gray-400 mb-1">Título</span>
                <input v-model="editingArea.title" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm">
              </label>
              <label class="block">
                <span class="block text-xs text-gray-400 mb-1">Detalles</span>
                <textarea v-model="editingArea.details" rows="3" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm" />
              </label>
              <AdminCollapsible :key="editingKey" title="Texto en inglés" :default-open="Boolean(editingArea.title_en || editingArea.details_en)">
                <div class="space-y-2">
                  <input v-model="editingArea.title_en" placeholder="Título en inglés" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm">
                  <textarea v-model="editingArea.details_en" rows="3" placeholder="Detalles en inglés" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-700 text-sm" />
                </div>
              </AdminCollapsible>

              <div class="flex items-center justify-between pt-2">
                <button type="button" class="text-xs text-red-300 hover:text-red-200" @click="removeArea(editingArea)">Quitar área</button>
                <button type="button" class="px-4 py-2 rounded-xl bg-acid text-charcoal text-sm font-bold" @click="editingKey = ''">Listo</button>
              </div>
            </div>
          </div>

          <div
            v-if="lightbox"
            class="fixed inset-0 z-[70] bg-black/95 flex flex-col"
            role="dialog"
            aria-modal="true"
            :aria-label="lightbox.alt || 'Imagen'"
            @click.self="closeLightbox"
          >
            <div class="flex items-center justify-end gap-2 p-3 sm:p-4">
              <button
                type="button"
                class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-acid text-charcoal text-sm font-bold disabled:opacity-60"
                :disabled="downloading"
                @click="downloadLightbox"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {{ downloading ? 'Descargando…' : 'Descargar' }}
              </button>
              <button
                type="button"
                class="w-10 h-10 rounded-full border border-white/20 text-white text-xl hover:bg-white/10"
                aria-label="Cerrar"
                @click="closeLightbox"
              >
                ×
              </button>
            </div>
            <div class="flex-1 min-h-0 flex items-center justify-center px-3 pb-3 sm:px-8 sm:pb-8" @click.self="closeLightbox">
              <img :src="lightbox.src" :alt="lightbox.alt" class="max-w-full max-h-full object-contain rounded-lg">
            </div>
            <p v-if="lightbox.alt" class="px-4 pb-4 text-center text-xs text-white/60">{{ lightbox.alt }}</p>
          </div>
        </Teleport>

        <div v-if="form.status === 'published'" class="flex justify-end">
          <button type="button" class="px-3 py-2 rounded-xl border border-gray-700 text-sm" :disabled="saving" @click="save('unpublished')">
            Retirar de la página pública
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
