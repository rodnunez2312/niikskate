<script setup lang="ts">
import { coachPillClass, withCoachLabels } from '~/utils/coachInitials'

definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

type VideoRow = {
  id: string
  title: string
  storage_path: string
  public_url: string
  created_at: string
  owner_id?: string | null
  owner_name?: string
  owner_initials?: string
  calendar_event_id?: string | null
  athlete_name?: string
}

const route = useRoute()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()
const es = computed(() => language.value === 'es')
const sessionId = computed(() => String(route.query.session || ''))
const search = ref('')
const athlete = ref('all')
const fromDate = ref('')
const toDate = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const videos = ref<VideoRow[]>([])
const loading = ref(true)
const busy = ref('')
const error = ref('')
const notice = ref('')
const tableMissing = ref(false)
const recording = ref(false)
const previewUrl = ref('')
const liveVideo = ref<HTMLVideoElement | null>(null)
let recorder: MediaRecorder | null = null
let stream: MediaStream | null = null
let chunks: Blob[] = []

const MAX_BYTES = 200 * 1024 * 1024

async function load() {
  loading.value = true
  error.value = ''
  let { data, error: queryError } = await client
    .from('session_videos')
    .select('id, title, storage_path, public_url, created_at, owner_id, calendar_event_id, athlete_name')
    .order('created_at', { ascending: false })
  if (queryError && /column|schema cache/i.test(queryError.message)) {
    const fallback = await client
      .from('session_videos')
      .select('id, title, storage_path, public_url, created_at, owner_id')
      .order('created_at', { ascending: false })
    data = fallback.data
    queryError = fallback.error
  }
  if (queryError) {
    tableMissing.value = /session_videos|schema cache|does not exist/i.test(queryError.message)
    if (!tableMissing.value) error.value = queryError.message
    videos.value = []
  } else {
    tableMissing.value = false
    videos.value = await withCoachLabels(client, (data || []) as VideoRow[])
  }
  loading.value = false
}

async function storeFile(file: Blob, filename: string) {
  if (!user.value) throw new Error(es.value ? 'Sesión expirada.' : 'Session expired.')
  if (file.size > MAX_BYTES) throw new Error(es.value ? 'El video supera 200 MB.' : 'Video is over 200 MB.')
  const safe = filename.replace(/[^\w.\-]+/g, '_')
  const path = `session-videos/${user.value.id}/${Date.now()}-${safe}`
  const contentType = file.type || 'video/webm'
  const { error: uploadError } = await client.storage.from('images').upload(path, file, {
    contentType,
    upsert: false,
  })
  if (uploadError) throw uploadError
  const { data } = client.storage.from('images').getPublicUrl(path)
  const title = filename.replace(/\.[^.]+$/, '')
  let { error: insertError } = await client.from('session_videos').insert({
    owner_id: user.value.id,
    title,
    storage_path: path,
    public_url: data.publicUrl,
    calendar_event_id: sessionId.value || null,
    athlete_name: athlete.value === 'all' ? '' : athlete.value,
  })
  if (insertError && /column|schema cache/i.test(insertError.message)) {
    ;({ error: insertError } = await client.from('session_videos').insert({
      owner_id: user.value.id,
      title,
      storage_path: path,
      public_url: data.publicUrl,
    }))
  }
  if (insertError && !/session_videos|schema cache|does not exist/i.test(insertError.message)) throw insertError
  if (insertError) tableMissing.value = true
  return data.publicUrl
}

async function onUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('video/')) {
    error.value = es.value ? 'Elige un archivo de video.' : 'Choose a video file.'
    return
  }
  busy.value = 'upload'
  error.value = ''
  notice.value = ''
  try {
    await storeFile(file, file.name)
    notice.value = es.value ? 'Video guardado.' : 'Video saved.'
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : (es.value ? 'No se pudo subir el video.' : 'Could not upload the video.')
  } finally {
    busy.value = ''
  }
}

function attachPreview() {
  if (liveVideo.value && stream) {
    liveVideo.value.srcObject = stream
    void liveVideo.value.play().catch(() => {})
  }
}

async function startRecording() {
  error.value = ''
  notice.value = ''
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    error.value = es.value ? 'Este navegador no puede grabar video.' : 'This browser cannot record video.'
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  } catch {
    error.value = es.value
      ? 'Permite la cámara y el micrófono para grabar.'
      : 'Allow the camera and microphone to record.'
    return
  }
  chunks = []
  const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm')
      ? 'video/webm'
      : ''
  recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data)
  }
  recorder.onstop = () => {
    void finishRecording()
  }
  recorder.start()
  recording.value = true
  await nextTick()
  attachPreview()
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') recorder.stop()
  recording.value = false
}

async function finishRecording() {
  const blob = new Blob(chunks, { type: recorder?.mimeType || 'video/webm' })
  chunks = []
  stream?.getTracks().forEach(track => track.stop())
  stream = null
  recorder = null
  if (liveVideo.value) liveVideo.value.srcObject = null
  if (!blob.size) return
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(blob)
  busy.value = 'record'
  try {
    await storeFile(blob, `sesion-${new Date().toISOString().slice(0, 19)}.webm`)
    notice.value = es.value ? 'Grabación guardada.' : 'Recording saved.'
    URL.revokeObjectURL(previewUrl.value)
    previewUrl.value = ''
    await load()
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : (es.value ? 'No se pudo guardar la grabación.' : 'Could not save the recording.')
  } finally {
    busy.value = ''
  }
}

async function removeVideo(video: VideoRow) {
  error.value = ''
  const { error: deleteError } = await client.from('session_videos').delete().eq('id', video.id)
  if (deleteError && !tableMissing.value) {
    error.value = deleteError.message
    return
  }
  if (video.storage_path) await client.storage.from('images').remove([video.storage_path])
  videos.value = videos.value.filter(row => row.id !== video.id)
}

const athletes = computed(() => {
  const names = new Set(videos.value.map(video => video.athlete_name?.trim()).filter(Boolean) as string[])
  return [...names].sort()
})

const visibleVideos = computed(() => videos.value.filter((video) => {
  if (sessionId.value && video.calendar_event_id !== sessionId.value) return false
  if (athlete.value !== 'all' && video.athlete_name !== athlete.value) return false
  const day = video.created_at.slice(0, 10)
  if (fromDate.value && day < fromDate.value) return false
  if (toDate.value && day > toDate.value) return false
  const q = search.value.trim().toLowerCase()
  if (!q) return true
  return `${video.title} ${video.athlete_name || ''}`.toLowerCase().includes(q)
}))

function pickFile() {
  fileInput.value?.click()
}

onMounted(load)
onBeforeUnmount(() => {
  stream?.getTracks().forEach(track => track.stop())
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
})
</script>

<template>
  <div class="min-h-full bg-black text-white">
    <MemberStaffPageHeader
      :title="es ? 'Videos' : 'Videos'"
      :subtitle="es ? 'Videos de sesión' : 'Session videos'"
    >
      <template #actions>
        <button
          v-if="!recording"
          type="button"
          class="px-3 py-2 rounded-xl border border-gray-600 text-sm disabled:opacity-50"
          :disabled="busy !== ''"
          @click="startRecording"
        >
          {{ es ? 'Grabar' : 'Record' }}
        </button>
        <button
          v-else
          type="button"
          class="px-3 py-2 rounded-xl bg-red-500 text-white text-sm font-bold"
          @click="stopRecording"
        >
          {{ es ? 'Detener' : 'Stop' }}
        </button>
        <button type="button" class="px-3 py-2 rounded-xl bg-white text-black text-sm font-bold disabled:opacity-50" :disabled="busy !== ''" @click="pickFile">
          {{ busy === 'upload' ? (es ? 'Subiendo…' : 'Uploading…') : (es ? 'Subir video' : 'Upload video') }}
        </button>
        <input ref="fileInput" type="file" accept="video/*" class="hidden" @change="onUpload">
      </template>
    </MemberStaffPageHeader>

    <div class="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <div class="flex items-center justify-between gap-3">
        <p class="text-sm text-gray-400">
          {{ sessionId
            ? (es ? 'Videos de esta sesión' : 'Videos from this session')
            : (es ? 'Todos los videos de sesión' : 'All session videos') }}
        </p>
        <NuxtLink v-if="sessionId" to="/member/staff/videos" class="text-sm font-semibold underline underline-offset-2">
          {{ es ? 'Ver toda la biblioteca' : 'View the full library' }}
        </NuxtLink>
      </div>

      <div class="grid md:grid-cols-[1.4fr_1fr_auto_auto] gap-3 items-end">
        <label class="block">
          <span class="block text-xs text-gray-500 mb-1">{{ es ? 'Buscar' : 'Search' }}</span>
          <input v-model="search" type="search" class="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm" :placeholder="es ? 'Video o patinador' : 'Video or athlete'">
        </label>
        <label class="block">
          <span class="block text-xs text-gray-500 mb-1">{{ es ? 'Patinador' : 'Athlete' }}</span>
          <select v-model="athlete" class="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm">
            <option value="all">{{ es ? 'Todos' : 'All athletes' }}</option>
            <option v-for="name in athletes" :key="name" :value="name">{{ name }}</option>
          </select>
        </label>
        <label class="block">
          <span class="block text-xs text-gray-500 mb-1">{{ es ? 'Desde' : 'From' }}</span>
          <input v-model="fromDate" type="date" class="px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm">
        </label>
        <label class="block">
          <span class="block text-xs text-gray-500 mb-1">{{ es ? 'Hasta' : 'To' }}</span>
          <input v-model="toDate" type="date" class="px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm">
        </label>
      </div>
      <p v-if="tableMissing" class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        {{ es
          ? 'Falta la tabla de videos. Ejecuta supabase/migrations/add_session_videos.sql en el editor SQL de Supabase.'
          : 'The video table is missing. Run supabase/migrations/add_session_videos.sql in the Supabase SQL editor.' }}
      </p>
      <p v-if="error" class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{{ error }}</p>
      <p v-if="notice" class="rounded-xl border border-acid/40 bg-acid/10 px-4 py-3 text-sm text-acid">{{ notice }}</p>

      <div v-if="recording || previewUrl" class="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <p class="text-sm font-semibold mb-3">
          {{ recording ? (es ? 'Grabando…' : 'Recording…') : (es ? 'Vista previa' : 'Preview') }}
        </p>
        <video
          v-if="recording"
          ref="liveVideo"
          class="w-full max-h-[28rem] rounded-xl bg-black"
          muted
          playsinline
          autoplay
        />
        <video v-else :src="previewUrl" controls class="w-full max-h-[28rem] rounded-xl bg-black" />
      </div>

      <p v-if="loading" class="text-sm text-gray-500">{{ es ? 'Cargando…' : 'Loading…' }}</p>
      <div v-else-if="!visibleVideos.length" class="rounded-2xl border border-gray-800 bg-gray-900 px-6 py-10">
        <h2 class="text-lg font-bold">{{ es ? 'Tu biblioteca de videos' : 'Your video library' }}</h2>
        <p class="mt-2 text-sm text-gray-500">
          {{ es
            ? 'Sube un clip de entrenamiento o graba una demostración.'
            : 'Upload a training clip or record a coaching demonstration.' }}
        </p>
        <button type="button" class="mt-4 px-4 py-2 rounded-xl bg-white text-black text-sm font-bold" @click="pickFile">
          {{ es ? 'Añadir un video' : 'Add a video' }}
        </button>
      </div>
      <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <article v-for="video in visibleVideos" :key="video.id" class="rounded-2xl border border-gray-800 bg-gray-900 p-3">
          <video :src="video.public_url" controls preload="metadata" class="w-full aspect-video rounded-xl bg-black" />
          <div class="mt-3 flex items-start justify-between gap-2">
            <div class="min-w-0 flex items-center gap-2">
              <span
                v-if="video.owner_initials && video.owner_initials !== '?'"
                class="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
                :class="coachPillClass(video.owner_id || video.id)"
                :title="video.owner_name"
              >{{ video.owner_initials }}</span>
              <div class="min-w-0">
                <p class="text-sm font-semibold truncate">{{ video.title }}</p>
                <p class="text-xs text-gray-500">{{ video.created_at.slice(0, 10) }}</p>
              </div>
            </div>
            <button
              v-if="!video.owner_id || video.owner_id === user?.id"
              type="button"
              class="text-xs text-gray-400 hover:text-red-200"
              @click="removeVideo(video)"
            >
              {{ es ? 'Quitar' : 'Remove' }}
            </button>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
