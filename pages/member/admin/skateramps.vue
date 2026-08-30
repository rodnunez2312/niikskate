<script setup lang="ts">
import RampSketchPanel from '~/components/skateramps/RampSketchPanel.vue'
import { compressImageForUpload } from '~/utils/compressImageForUpload'
import {
  DEFAULT_RAMP_SKETCH,
  parseRampSketch,
  slugifyRampTitle,
  type RampSketch,
  type SkaterampStage,
} from '~/utils/skaterampSketch'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

type RampProjectRow = {
  id: string
  title: string
  slug: string | null
  description: string | null
  stage: SkaterampStage
  concept_notes: string | null
  build_notes: string | null
  sketch: Record<string, unknown>
  image_urls: string[]
  ai_suggestions: string | null
  product_id: string | null
  is_published: boolean
  updated_at: string
}

const STAGES: SkaterampStage[] = ['idea', 'concept', 'build', 'published']

const router = useRouter()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()
const { isAdmin, loading: profileLoading } = useSiteProfile()

const es = computed(() => language.value === 'es')
const loading = ref(true)
const saving = ref(false)
const aiLoading = ref(false)
const uploading = ref(false)
const errorMsg = ref('')
const projects = ref<RampProjectRow[]>([])
const selectedId = ref<string | null>(null)
const activeTab = ref<SkaterampStage>('idea')

const form = ref({
  title: '',
  description: '',
  concept_notes: '',
  build_notes: '',
  stage: 'idea' as SkaterampStage,
  sketch: { ...DEFAULT_RAMP_SKETCH } as RampSketch,
  image_urls: [] as string[],
  ai_suggestions: '',
  is_published: false,
  product_id: null as string | null,
})

const stageLabel = (s: SkaterampStage) => {
  const map: Record<SkaterampStage, { es: string; en: string }> = {
    idea: { es: 'Idea', en: 'Idea' },
    concept: { es: 'Concepto', en: 'Concept' },
    build: { es: 'Construcción', en: 'Build' },
    published: { es: 'Publicado', en: 'Published' },
  }
  return es.value ? map[s].es : map[s].en
}

const selectedProject = computed(() =>
  selectedId.value ? projects.value.find(p => p.id === selectedId.value) ?? null : null,
)

/** The profile role arrives after mount, so wait for it instead of bailing out. */
function whenProfileReady() {
  if (!profileLoading.value) return Promise.resolve()
  return new Promise<void>(resolve => {
    const stop = watch(profileLoading, still => {
      if (still) return
      stop()
      resolve()
    })
  })
}

async function ensureAdmin() {
  if (!user.value) {
    await router.push('/auth/login?redirect=/member/admin/skateramps')
    return false
  }
  await whenProfileReady()
  if (!isAdmin.value) {
    await router.push('/member/staff/dashboard')
    return false
  }
  return true
}

async function loadProjects() {
  loading.value = true
  errorMsg.value = ''
  try {
    const { data, error } = await client
      .from('skateramp_projects')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    projects.value = (data || []) as RampProjectRow[]
  } catch (e: unknown) {
    const err = e as { message?: string }
    errorMsg.value = err?.message?.includes('does not exist')
      ? es.value
        ? 'Ejecuta supabase/migrations/add_skateramp_projects.sql'
        : 'Run supabase/migrations/add_skateramp_projects.sql'
      : err?.message || String(e)
  } finally {
    loading.value = false
  }
}

function loadFormFromRow(row: RampProjectRow) {
  form.value = {
    title: row.title,
    description: row.description || '',
    concept_notes: row.concept_notes || '',
    build_notes: row.build_notes || '',
    stage: row.stage,
    sketch: parseRampSketch(row.sketch),
    image_urls: [...(row.image_urls || [])],
    ai_suggestions: row.ai_suggestions || '',
    is_published: row.is_published,
    product_id: row.product_id,
  }
  activeTab.value = row.stage === 'published' ? 'build' : row.stage
}

function selectProject(id: string) {
  selectedId.value = id
  const row = projects.value.find(p => p.id === id)
  if (row) loadFormFromRow(row)
}

function newProject() {
  selectedId.value = null
  activeTab.value = 'idea'
  form.value = {
    title: '',
    description: '',
    concept_notes: '',
    build_notes: '',
    stage: 'idea',
    sketch: { ...DEFAULT_RAMP_SKETCH },
    image_urls: [],
    ai_suggestions: '',
    is_published: false,
    product_id: null,
  }
}

async function saveProject() {
  if (!form.value.title.trim()) {
    errorMsg.value = es.value ? 'El título es obligatorio' : 'Title is required'
    return
  }
  saving.value = true
  errorMsg.value = ''
  try {
    const slug = slugifyRampTitle(form.value.title)
    const payload = {
      title: form.value.title.trim(),
      slug,
      description: form.value.description.trim() || null,
      concept_notes: form.value.concept_notes.trim() || null,
      build_notes: form.value.build_notes.trim() || null,
      stage: form.value.stage,
      sketch: form.value.sketch,
      image_urls: form.value.image_urls,
      ai_suggestions: form.value.ai_suggestions.trim() || null,
      is_published: form.value.is_published,
      product_id: form.value.product_id,
      created_by: user.value!.id,
    }

    if (selectedId.value) {
      const { error } = await client
        .from('skateramp_projects')
        .update(payload)
        .eq('id', selectedId.value)
      if (error) throw error
    } else {
      const { data, error } = await client
        .from('skateramp_projects')
        .insert(payload)
        .select('*')
        .single()
      if (error) throw error
      selectedId.value = (data as RampProjectRow).id
    }
    await loadProjects()
    if (selectedId.value) {
      const row = projects.value.find(p => p.id === selectedId.value)
      if (row) loadFormFromRow(row)
    }
  } catch (e: unknown) {
    errorMsg.value = (e as { message?: string })?.message || String(e)
  } finally {
    saving.value = false
  }
}

async function deleteProject() {
  if (!selectedId.value) return
  const ok = confirm(es.value ? '¿Eliminar este proyecto de rampa?' : 'Delete this ramp project?')
  if (!ok) return
  const { error } = await client.from('skateramp_projects').delete().eq('id', selectedId.value)
  if (error) {
    errorMsg.value = error.message
    return
  }
  newProject()
  await loadProjects()
}

async function uploadImages(files: FileList | null) {
  if (!files?.length) return
  uploading.value = true
  errorMsg.value = ''
  try {
    for (const file of Array.from(files)) {
      let uploadFile: File
      try {
        uploadFile = await compressImageForUpload(file)
      } catch {
        uploadFile = file
      }
      const ext = uploadFile.name.split('.').pop() || 'jpg'
      const path = `skateramps/${selectedId.value || 'draft'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await client.storage.from('images').upload(path, uploadFile, {
        upsert: false,
        contentType: uploadFile.type,
      })
      if (error) throw error
      const { data } = client.storage.from('images').getPublicUrl(path)
      if (data?.publicUrl) form.value.image_urls.push(data.publicUrl)
    }
  } catch (e: unknown) {
    errorMsg.value = (e as { message?: string })?.message || String(e)
  } finally {
    uploading.value = false
  }
}

function removeImage(url: string) {
  form.value.image_urls = form.value.image_urls.filter(u => u !== url)
}

async function requestAiSuggestions() {
  aiLoading.value = true
  errorMsg.value = ''
  try {
    const session = await client.auth.getSession()
    const token = session.data.session?.access_token
    if (!token) throw new Error(es.value ? 'Inicia sesión de nuevo' : 'Please sign in again')

    const res = await $fetch<{ suggestions: string; source: string }>(
      '/api/admin/skateramps/ai-suggest',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          title: form.value.title,
          description: form.value.description,
          conceptNotes: form.value.concept_notes,
          buildNotes: form.value.build_notes,
          stage: form.value.stage,
          sketch: form.value.sketch,
          imageUrls: form.value.image_urls,
        },
      },
    )
    form.value.ai_suggestions = res.suggestions
    if (activeTab.value === 'idea') activeTab.value = 'concept'
  } catch (e: unknown) {
    errorMsg.value = (e as { message?: string })?.message || String(e)
  } finally {
    aiLoading.value = false
  }
}

async function publishToShop() {
  if (!selectedId.value) {
    await saveProject()
    if (!selectedId.value) return
  }
  saving.value = true
  errorMsg.value = ''
  try {
    const sku = `RAMP-${slugifyRampTitle(form.value.title).toUpperCase().slice(0, 12)}-${Date.now().toString(36).slice(-4)}`
    const productPayload = {
      sku,
      name: form.value.title.trim(),
      description: form.value.description.trim() || form.value.concept_notes.trim() || 'Rampa NiikSkate',
      category: 'ramps' as const,
      price: 0,
      stock_quantity: 0,
      images: form.value.image_urls,
      is_active: true,
      is_featured: false,
      is_service: true,
      requires_quote: true,
      specifications: form.value.sketch,
    }

    if (form.value.product_id) {
      const { error } = await client
        .from('products')
        .update({
          name: productPayload.name,
          description: productPayload.description,
          images: productPayload.images,
          specifications: productPayload.specifications,
        })
        .eq('id', form.value.product_id)
      if (error) throw error
    } else {
      const { data, error } = await client
        .from('products')
        .insert(productPayload)
        .select('id')
        .single()
      if (error) throw error
      form.value.product_id = (data as { id: string }).id
    }

    form.value.stage = 'published'
    form.value.is_published = true
    await saveProject()
  } catch (e: unknown) {
    errorMsg.value = (e as { message?: string })?.message || String(e)
  } finally {
    saving.value = false
  }
}

watch(activeTab, tab => {
  if (tab !== 'published') form.value.stage = tab
})

onMounted(async () => {
  if (await ensureAdmin()) await loadProjects()
})

watch(user, async u => {
  if (u && (await ensureAdmin())) await loadProjects()
})
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="border-b border-gray-800 bg-gray-900 px-4 py-4">
      <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-white flex items-center gap-2">
            <span aria-hidden="true">🏗️</span>
            Skateramps
          </h1>
          <p class="text-xs text-gray-500">
            {{ es ? 'Idea → boceto → build → publicar en skateshop' : 'Idea → sketch → build → publish to shop' }}
          </p>
        </div>
        <div class="flex gap-2">
          <NuxtLink
            to="/member/admin/skate-products"
            class="px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm"
          >
            {{ es ? 'Catálogo' : 'Catalog' }}
          </NuxtLink>
          <NuxtLink
            to="/skateramps"
            target="_blank"
            class="px-3 py-2 rounded-lg border border-teal-600/50 text-teal-300 text-sm"
          >
            {{ es ? 'Ver público' : 'Public page' }}
          </NuxtLink>
          <button
            type="button"
            class="px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold"
            @click="newProject"
          >
            + {{ es ? 'Nueva rampa' : 'New ramp' }}
          </button>
        </div>
      </div>
    </header>

    <div v-if="errorMsg" class="max-w-7xl mx-auto px-4 pt-4">
      <p class="text-sm text-red-400">{{ errorMsg }}</p>
    </div>

    <div v-if="loading" class="flex justify-center py-20">
      <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
    </div>

    <div v-else class="max-w-7xl mx-auto px-4 py-6 lg:flex lg:gap-6">
      <aside class="lg:w-64 shrink-0 mb-6 lg:mb-0">
        <h2 class="text-xs font-bold uppercase tracking-wide text-gold-400 mb-2">
          {{ es ? 'Proyectos' : 'Projects' }}
        </h2>
        <div class="rounded-xl border border-gray-800 bg-gray-950 max-h-[70vh] overflow-y-auto">
          <p v-if="!projects.length" class="p-4 text-xs text-gray-500 text-center">
            {{ es ? 'Sin proyectos aún' : 'No projects yet' }}
          </p>
          <button
            v-for="p in projects"
            :key="p.id"
            type="button"
            class="w-full text-left px-3 py-3 border-b border-gray-800 last:border-0 hover:bg-gray-900"
            :class="selectedId === p.id ? 'bg-gray-900 ring-1 ring-inset ring-teal-500/50' : ''"
            @click="selectProject(p.id)"
          >
            <p class="text-sm font-bold text-white truncate">{{ p.title }}</p>
            <p class="text-[10px] text-gray-500 mt-0.5">{{ stageLabel(p.stage) }}</p>
          </button>
        </div>
      </aside>

      <main class="flex-1 min-w-0 space-y-4">
        <div class="flex flex-wrap gap-2">
          <button
            v-for="s in STAGES.filter(x => x !== 'published')"
            :key="s"
            type="button"
            class="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
            :class="activeTab === s ? 'border-teal-400 bg-teal-500/20 text-white' : 'border-gray-700 text-gray-400'"
            @click="activeTab = s"
          >
            {{ stageLabel(s) }}
          </button>
        </div>

        <div class="rounded-2xl border border-gray-800 bg-gray-900/50 p-4 space-y-4">
          <div>
            <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Título' : 'Title' }} *</label>
            <input v-model="form.title" type="text" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" />
          </div>

          <div v-show="activeTab === 'idea'" class="space-y-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Descripción / brief' : 'Description / brief' }}</label>
              <textarea v-model="form.description" rows="4" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" :placeholder="es ? 'Espacio disponible, nivel del skater, presupuesto…' : 'Available space, skater level, budget…'" />
            </div>
            <div>
              <label class="block text-xs text-gray-400 mb-2">{{ es ? 'Fotos de referencia' : 'Reference photos' }}</label>
              <input type="file" accept="image/*" multiple class="text-xs text-gray-400" @change="uploadImages(($event.target as HTMLInputElement).files)" />
              <div class="flex flex-wrap gap-2 mt-2">
                <div v-for="url in form.image_urls" :key="url" class="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-700">
                  <img :src="url" alt="" class="w-full h-full object-cover" />
                  <button type="button" class="absolute top-0 right-0 bg-black/70 text-red-400 text-xs px-1" @click="removeImage(url)">×</button>
                </div>
              </div>
              <p v-if="uploading" class="text-xs text-gray-500 mt-1">{{ es ? 'Subiendo…' : 'Uploading…' }}</p>
            </div>
          </div>

          <div v-show="activeTab === 'concept'" class="space-y-4">
            <RampSketchPanel v-model="form.sketch" />
            <div>
              <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Notas de concepto' : 'Concept notes' }}</label>
              <textarea v-model="form.concept_notes" rows="3" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" />
            </div>
          </div>

          <div v-show="activeTab === 'build'" class="space-y-3">
            <div>
              <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Plan de construcción' : 'Build plan' }}</label>
              <textarea v-model="form.build_notes" rows="6" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" :placeholder="es ? 'Materiales, herrajes, modular, tiempos…' : 'Materials, hardware, modular sections, timeline…'" />
            </div>
            <label class="flex items-center gap-2 text-sm text-gray-300">
              <input v-model="form.is_published" type="checkbox" class="rounded border-gray-600 text-teal-500" />
              {{ es ? 'Visible en /skateramps (sin producto)' : 'Visible on /skateramps (without shop product)' }}
            </label>
          </div>

          <div class="rounded-xl border border-violet-500/30 bg-violet-950/20 p-4">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 class="text-sm font-bold text-violet-200">
                {{ es ? 'Sugerencias IA' : 'AI suggestions' }}
              </h3>
              <button
                type="button"
                class="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-bold disabled:opacity-50"
                :disabled="aiLoading"
                @click="requestAiSuggestions"
              >
                {{ aiLoading ? '…' : (es ? 'Generar ideas' : 'Generate ideas') }}
              </button>
            </div>
            <p class="text-[10px] text-gray-500 mb-2">
              {{ es ? 'Usa OPENAI_API_KEY en Vercel para analizar fotos + descripción. Sin key: sugerencias locales.' : 'Set OPENAI_API_KEY on Vercel for photo + text analysis. Without key: local tips.' }}
            </p>
            <textarea
              v-model="form.ai_suggestions"
              rows="8"
              class="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-200 text-xs font-mono"
              :placeholder="es ? 'Las sugerencias aparecerán aquí…' : 'Suggestions will appear here…'"
            />
          </div>

          <div class="flex flex-wrap gap-2 pt-2 border-t border-gray-800">
            <button
              type="button"
              class="px-4 py-2 rounded-xl bg-white text-black font-semibold text-sm disabled:opacity-50"
              :disabled="saving"
              @click="saveProject"
            >
              {{ saving ? '…' : (es ? 'Guardar' : 'Save') }}
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-black font-semibold text-sm disabled:opacity-50"
              :disabled="saving"
              @click="publishToShop"
            >
              {{ es ? 'Publicar en skateshop' : 'Publish to shop' }}
            </button>
            <button
              v-if="selectedId"
              type="button"
              class="px-4 py-2 rounded-xl border border-red-500/50 text-red-400 text-sm ml-auto"
              @click="deleteProject"
            >
              {{ es ? 'Eliminar' : 'Delete' }}
            </button>
          </div>

          <p v-if="form.product_id" class="text-xs text-teal-400">
            {{ es ? 'Producto vinculado:' : 'Linked product:' }}
            <NuxtLink :to="`/shop/${form.product_id}`" class="underline" target="_blank">/shop/{{ form.product_id }}</NuxtLink>
          </p>
        </div>
      </main>
    </div>
  </div>
</template>
