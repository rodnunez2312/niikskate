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
import {
  DEFAULT_RAMP_CLIENT_OPTIONS,
  RAMP_CONSTRUCTION_TYPES,
  RAMP_COPING_SIZES,
  RAMP_MATERIAL_GROUPS,
  RAMP_SURFACING_OPTIONS,
  defaultRampPricing,
  emptyMaterialLine,
  estimateRampTakeoff,
  RAMP_WOOD_PROVIDERS,
  woodProviderCost,
  formatRampTemplateNotes,
  isRampConstructionType,
  parseRampClientOptions,
  parseRampPricing,
  rampMaterialCost,
  rampQuote,
  templatesForConstruction,
  type RampClientOptions,
  type RampConstructionType,
  type RampPricing,
} from '~/utils/skaterampCatalog'

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
  video_urls?: string[]
  construction_type?: RampConstructionType | null
  template_id?: string | null
  client_options?: Record<string, unknown> | RampClientOptions | null
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
const activeTab = ref<SkaterampStage>('build')

const form = ref({
  title: '',
  description: '',
  concept_notes: '',
  build_notes: '',
  stage: 'build' as SkaterampStage,
  sketch: { ...DEFAULT_RAMP_SKETCH } as RampSketch,
  image_urls: [] as string[],
  video_urls: [] as string[],
  construction_type: null as RampConstructionType | null,
  template_id: null as string | null,
  client_options: { ...DEFAULT_RAMP_CLIENT_OPTIONS } as RampClientOptions,
  pricing: defaultRampPricing() as RampPricing,
  ai_suggestions: '',
  is_published: false,
  product_id: null as string | null,
})

const constructionTemplates = computed(() =>
  templatesForConstruction(form.value.construction_type),
)

const quote = computed(() => rampQuote(form.value.pricing, form.value.client_options))

const takeoff = computed(() =>
  form.value.construction_type
    ? estimateRampTakeoff(form.value.sketch, form.value.construction_type)
    : null,
)

const finishLines = computed(() => [
  ...materialsIn('coping'),
  ...materialsIn('hardware'),
])

let skipEstimate = false

function applyCoatingFromSurface() {
  const line = form.value.pricing.materials.find(row => row.id === 'coating')
  if (!line) return
  const area = (Number(form.value.sketch.surfaceLengthFt) || 0) * (Number(form.value.sketch.surfaceWidthFt) || 0)
  line.qty = area > 0 ? Math.ceil(area / 50) : 0
}

function applyMaterialEstimate() {
  const next = takeoff.value
  if (!next) return
  form.value.sketch.surfaceLengthFt = next.surfaceLengthFt
  form.value.sketch.surfaceWidthFt = next.surfaceWidthFt
  for (const line of form.value.pricing.materials) {
    const qty = next.qtyById[line.id]
    if (qty != null) line.qty = qty
  }
  applyCoatingFromSurface()
}

function setWoodProvider(line: RampPricing['materials'][number], providerName: string) {
  line.provider = providerName
  line.unitCostMxn = woodProviderCost(line.id, providerName)
}

const dimUnit = ref<'cm' | 'in'>('cm')
const usesTransitionRadius = computed(() =>
  form.value.construction_type === 'quarters' || form.value.construction_type === 'mini_ramp',
)

function feetToUnit(ft: number) {
  const n = Number(ft) || 0
  const raw = dimUnit.value === 'cm' ? n * 30.48 : n * 12
  const places = dimUnit.value === 'cm' ? 10 : 100
  return Math.round(raw * places) / places
}

function areaFromSqFt(sqFt: number) {
  const n = Number(sqFt) || 0
  if (dimUnit.value === 'cm') return `${Math.round(n * 0.092903 * 100) / 100} m²`
  return `${Math.round(n * 144)} in²`
}

const platformAreaSqFt = computed(() =>
  (Number(form.value.sketch.platformDepthFt) || 0) * (Number(form.value.sketch.surfaceWidthFt) || Number(form.value.sketch.widthFt) || 0),
)

function setKickerRadius(raw: string) {
  const n = Number(raw)
  if (!raw.trim() || !Number.isFinite(n) || n <= 0) {
    if (form.value.sketch.kickerShape === 'radius') form.value.sketch.kickerShape = 'angle'
    return
  }
  form.value.sketch.kickerShape = 'radius'
  form.value.sketch.bankAngleDeg = 0
  form.value.sketch.transitionRadiusFt = dimUnit.value === 'cm' ? n / 30.48 : n / 12
}

function setKickerAngle(raw: string) {
  const deg = Number(raw)
  if (!raw.trim() || !Number.isFinite(deg) || deg <= 0 || deg >= 89) {
    form.value.sketch.bankAngleDeg = 0
    return
  }
  form.value.sketch.kickerShape = 'angle'
  form.value.sketch.bankAngleDeg = Math.round(deg * 10) / 10
  form.value.sketch.lengthFt = form.value.sketch.heightFt / Math.tan((deg * Math.PI) / 180)
}

function copingLine() {
  return form.value.pricing.materials.find(line => line.id === 'coping')
}

function setRailCoping(kind: 'round' | 'flat') {
  form.value.sketch.railCoping = kind
  const line = copingLine()
  if (!line) return
  if (kind === 'round') {
    line.name = 'Coping'
    line.sizeCm = line.sizeCm === 8 || line.sizeCm === 7 || line.sizeCm === 6 ? line.sizeCm : 8
  } else {
    line.sizeCm = null
    line.name = form.value.sketch.railFlatProfile === '2x4' ? 'Coping 2×4' : 'Coping 1×3'
  }
}

function setRailRoundSize(size: 8 | 7 | 6) {
  form.value.sketch.railCoping = 'round'
  const line = copingLine()
  if (!line) return
  line.name = 'Coping'
  line.sizeCm = size
}

function setRailFlatProfile(profile: '1x3' | '2x4') {
  form.value.sketch.railCoping = 'flat'
  form.value.sketch.railFlatProfile = profile
  const line = copingLine()
  if (!line) return
  line.sizeCm = null
  line.name = profile === '2x4' ? 'Coping 2×4' : 'Coping 1×3'
}

function setDim(
  key: 'heightFt' | 'widthFt' | 'lengthFt' | 'transitionRadiusFt' | 'platformDepthFt' | 'surfaceLengthFt' | 'surfaceWidthFt' | 'flatLengthFt',
  raw: string,
) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return
  form.value.sketch[key] = dimUnit.value === 'cm' ? n / 30.48 : n / 12
}

watch(
  () => [
    form.value.construction_type,
    form.value.sketch.heightFt,
    form.value.sketch.widthFt,
    form.value.sketch.lengthFt,
    form.value.sketch.transitionRadiusFt,
    form.value.sketch.platformDepthFt,
    form.value.sketch.kickerShape,
    form.value.sketch.bankAngleDeg,
    form.value.sketch.flatLengthFt,
  ],
  () => {
    if (skipEstimate) return
    applyMaterialEstimate()
  },
)

watch(
  () => [form.value.sketch.surfaceLengthFt, form.value.sketch.surfaceWidthFt],
  () => {
    if (skipEstimate) return
    applyCoatingFromSurface()
  },
)

function lineTotal(line: RampPricing['materials'][number]) {
  return rampMaterialCost([line])
}

function materialsIn(group: RampPricing['materials'][number]['group']) {
  return form.value.pricing.materials.filter(line => line.group === group)
}

function addMaterialLine() {
  form.value.pricing.materials.push(emptyMaterialLine())
}

function removeMaterialLine(id: string) {
  const next = form.value.pricing.materials.filter(line => line.id !== id)
  form.value.pricing.materials = next.length ? next : [emptyMaterialLine()]
}

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
        ? 'Ejecuta supabase/migrations/add_skateramp_projects.sql y add_skateramp_catalog_media.sql'
        : 'Run supabase/migrations/add_skateramp_projects.sql and add_skateramp_catalog_media.sql'
      : err?.message || String(e)
  } finally {
    loading.value = false
  }
}

function loadFormFromRow(row: RampProjectRow) {
  skipEstimate = true
  form.value = {
    title: row.title,
    description: row.description || '',
    concept_notes: row.concept_notes || '',
    build_notes: row.build_notes || '',
    stage: row.stage,
    sketch: parseRampSketch(row.sketch),
    image_urls: [...(row.image_urls || [])],
    video_urls: [...(row.video_urls || [])],
    construction_type: isRampConstructionType(row.construction_type) ? row.construction_type : null,
    template_id: row.template_id || null,
    client_options: parseRampClientOptions(row.client_options),
    pricing: parseRampPricing(row.client_options),
    ai_suggestions: row.ai_suggestions || '',
    is_published: row.is_published,
    product_id: row.product_id,
  }
  activeTab.value = row.stage === 'published' ? 'build' : row.stage
  if (form.value.construction_type && !form.value.sketch.surfaceLengthFt) {
    const next = estimateRampTakeoff(form.value.sketch, form.value.construction_type)
    form.value.sketch.surfaceLengthFt = next.surfaceLengthFt
    form.value.sketch.surfaceWidthFt = next.surfaceWidthFt
  }
  nextTick(() => {
    skipEstimate = false
  })
}

function selectProject(id: string) {
  selectedId.value = id
  const row = projects.value.find(p => p.id === id)
  if (row) loadFormFromRow(row)
}

function newProject() {
  selectedId.value = null
  activeTab.value = 'build'
  form.value = {
    title: '',
    description: '',
    concept_notes: '',
    build_notes: '',
    stage: 'build',
    sketch: { ...DEFAULT_RAMP_SKETCH },
    image_urls: [],
    video_urls: [],
    construction_type: null,
    template_id: null,
    client_options: { ...DEFAULT_RAMP_CLIENT_OPTIONS },
    pricing: defaultRampPricing(),
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
      video_urls: form.value.video_urls,
      construction_type: form.value.construction_type,
      template_id: form.value.template_id,
      client_options: {
        ...form.value.client_options,
        pricing: form.value.pricing,
      },
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

const designSlots = [
  { kind: 'image' as const, index: 0, es: 'Foto 1', en: 'Photo 1' },
  { kind: 'image' as const, index: 1, es: 'Foto 2', en: 'Photo 2' },
  { kind: 'image' as const, index: 2, es: 'Foto 3', en: 'Photo 3' },
  { kind: 'video' as const, index: 0, es: 'Video', en: 'Video' },
]

function designSlotUrl(kind: 'image' | 'video', index: number) {
  return kind === 'video' ? form.value.video_urls[index] || '' : form.value.image_urls[index] || ''
}

/** The file is already in storage. Keep the public URL on the project so a refresh still finds it. */
async function persistDesignMedia() {
  if (!selectedId.value) {
    if (!form.value.title.trim()) return
    await saveProject()
    return
  }
  const { error } = await client
    .from('skateramp_projects')
    .update({
      image_urls: form.value.image_urls,
      video_urls: form.value.video_urls,
    })
    .eq('id', selectedId.value)
  if (error) {
    errorMsg.value = error.message
    return
  }
  const row = projects.value.find(project => project.id === selectedId.value)
  if (row) {
    row.image_urls = [...form.value.image_urls]
    row.video_urls = [...form.value.video_urls]
  }
}

async function uploadDesignSlot(kind: 'image' | 'video', index: number, files: FileList | null) {
  const file = files?.[0]
  if (!file) return
  if (kind === 'image' && !file.type.startsWith('image/')) return
  if (kind === 'video' && !file.type.startsWith('video/')) return
  uploading.value = true
  errorMsg.value = ''
  try {
    let uploadFile: File = file
    if (kind === 'image') {
      try {
        uploadFile = await compressImageForUpload(file)
      } catch {
        uploadFile = file
      }
    }
    const ext = uploadFile.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'jpg')
    const path = `skateramps/${selectedId.value || 'draft'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { error } = await client.storage.from('images').upload(path, uploadFile, {
      upsert: false,
      contentType: uploadFile.type,
    })
    if (error) throw error
    const { data } = client.storage.from('images').getPublicUrl(path)
    if (!data?.publicUrl) return
    if (kind === 'video') {
      form.value.video_urls = [data.publicUrl]
    } else {
      const next = [...form.value.image_urls]
      if (index < next.length) next[index] = data.publicUrl
      else next.push(data.publicUrl)
      form.value.image_urls = next.slice(0, 3)
    }
    await persistDesignMedia()
  } catch (e: unknown) {
    errorMsg.value = (e as { message?: string })?.message || String(e)
  } finally {
    uploading.value = false
  }
}

async function clearDesignSlot(kind: 'image' | 'video', index: number) {
  if (kind === 'video') form.value.video_urls = []
  else form.value.image_urls = form.value.image_urls.filter((_, i) => i !== index)
  await persistDesignMedia()
}

const carouselOpen = ref(false)
const carouselIndex = ref(0)

const carouselItems = computed(() => {
  const items: { kind: 'image' | 'video'; url: string }[] = []
  for (const url of form.value.image_urls) {
    if (url) items.push({ kind: 'image', url })
  }
  for (const url of form.value.video_urls) {
    if (url) items.push({ kind: 'video', url })
  }
  return items
})

function openDesignCarousel(kind: 'image' | 'video', index: number) {
  const url = designSlotUrl(kind, index)
  const at = carouselItems.value.findIndex(item => item.url === url)
  if (at < 0) return
  carouselIndex.value = at
  carouselOpen.value = true
}

function stepCarousel(delta: number) {
  const count = carouselItems.value.length
  if (count < 2) return
  carouselIndex.value = (carouselIndex.value + delta + count) % count
}

function onCarouselKey(event: KeyboardEvent) {
  if (!carouselOpen.value) return
  if (event.key === 'Escape') carouselOpen.value = false
  if (event.key === 'ArrowRight') stepCarousel(1)
  if (event.key === 'ArrowLeft') stepCarousel(-1)
}

let carouselTouchX = 0
function onCarouselTouchStart(event: TouchEvent) {
  carouselTouchX = event.changedTouches[0]?.clientX ?? 0
}
function onCarouselTouchEnd(event: TouchEvent) {
  const delta = (event.changedTouches[0]?.clientX ?? 0) - carouselTouchX
  if (Math.abs(delta) < 40) return
  stepCarousel(delta < 0 ? 1 : -1)
}

onMounted(() => {
  window.addEventListener('keydown', onCarouselKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onCarouselKey)
})

function setConstructionType(type: RampConstructionType) {
  form.value.construction_type = form.value.construction_type === type ? null : type
  if (!templatesForConstruction(form.value.construction_type).some(t => t.id === form.value.template_id)) {
    form.value.template_id = null
  }
}

function applyBuildTemplate(id: string) {
  const template = constructionTemplates.value.find(t => t.id === id)
  if (!template) return
  const notes = formatRampTemplateNotes(template)
  if (form.value.build_notes.trim() && form.value.build_notes.trim() !== notes) {
    const ok = confirm(
      es.value
        ? 'Esto reemplaza el plan de construcción con la plantilla. ¿Continuar?'
        : 'This replaces the build plan with the template. Continue?',
    )
    if (!ok) return
  }
  form.value.template_id = template.id
  form.value.build_notes = notes
  if (!form.value.title.trim()) form.value.title = es.value ? template.title.es : template.title.en
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
      price: quote.value.sellingPrice,
      stock_quantity: 0,
      images: form.value.image_urls,
      is_active: true,
      is_featured: false,
      is_service: true,
      requires_quote: true,
        specifications: {
          ...form.value.sketch,
          constructionType: form.value.construction_type,
          templateId: form.value.template_id,
          clientOptions: form.value.client_options,
          videos: form.value.video_urls,
        },
    }

    if (form.value.product_id) {
      const { error } = await client
        .from('products')
        .update({
          name: productPayload.name,
          description: productPayload.description,
          price: productPayload.price,
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
    <MemberStaffPageHeader
      title="Skateramps"
      :subtitle="es ? 'Idea, boceto, build y publicar en la tienda' : 'Idea, sketch, build, and publish to the shop'"
    >
      <template #actions>
        <NuxtLink
          to="/skateramps"
          target="_blank"
          class="px-3 py-2 rounded-xl border border-gray-700 text-gray-200 text-sm font-semibold"
        >
          {{ es ? 'Ver público' : 'Public page' }}
        </NuxtLink>
        <button
          type="button"
          class="px-4 py-2.5 rounded-xl bg-acid text-charcoal text-sm font-semibold"
          @click="newProject"
        >
          + {{ es ? 'Nueva rampa' : 'New ramp' }}
        </button>
      </template>
    </MemberStaffPageHeader>

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
            v-for="s in (['build', 'concept', 'idea'] as SkaterampStage[])"
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
          </div>

          <div v-show="activeTab === 'concept'" class="space-y-4">
            <RampSketchPanel v-model="form.sketch" />
            <div>
              <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Notas de concepto' : 'Concept notes' }}</label>
              <textarea v-model="form.concept_notes" rows="3" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" />
            </div>
          </div>

          <div v-show="activeTab === 'build'" class="space-y-4">
            <div>
              <p class="text-xs text-gray-400 mb-2">{{ es ? 'Tipo de construcción' : 'Construction type' }}</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="opt in RAMP_CONSTRUCTION_TYPES"
                  :key="opt.id"
                  type="button"
                  class="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                  :class="form.construction_type === opt.id
                    ? 'border-teal-400 bg-teal-500/20 text-white'
                    : 'border-gray-700 text-gray-400'"
                  @click="setConstructionType(opt.id)"
                >
                  {{ es ? opt.es : opt.en }}
                </button>
              </div>
            </div>

            <div v-if="form.construction_type" class="space-y-3">
              <div class="flex justify-end">
                <div class="inline-flex rounded-lg border border-gray-700 p-0.5">
                  <button
                    type="button"
                    class="px-3 py-1 rounded-md text-xs font-bold"
                    :class="dimUnit === 'cm' ? 'bg-white text-gray-900' : 'text-gray-400'"
                    @click="dimUnit = 'cm'"
                  >
                    cm
                  </button>
                  <button
                    type="button"
                    class="px-3 py-1 rounded-md text-xs font-bold"
                    :class="dimUnit === 'in' ? 'bg-white text-gray-900' : 'text-gray-400'"
                    @click="dimUnit = 'in'"
                  >
                    in
                  </button>
                </div>
              </div>
              <div v-if="form.construction_type !== 'kicker'" class="grid grid-cols-2 gap-3">
                <label class="block text-xs text-gray-400">
                  {{ es ? 'Alto' : 'Height' }} ({{ dimUnit }})
                  <input :value="feetToUnit(form.sketch.heightFt)" type="number" step="0.1" class="mt-1 w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" @change="setDim('heightFt', ($event.target as HTMLInputElement).value)" />
                </label>
                <label v-if="form.construction_type !== 'rails'" class="block text-xs text-gray-400">
                  {{ es ? 'Ancho' : 'Width' }} ({{ dimUnit }})
                  <input :value="feetToUnit(form.sketch.widthFt)" type="number" step="0.1" class="mt-1 w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" @change="setDim('widthFt', ($event.target as HTMLInputElement).value)" />
                </label>
                <label class="block text-xs text-gray-400">
                  {{ es ? 'Largo' : 'Length' }} ({{ dimUnit }})
                  <input :value="feetToUnit(form.sketch.lengthFt)" type="number" step="0.1" class="mt-1 w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" @change="setDim('lengthFt', ($event.target as HTMLInputElement).value)" />
                </label>
                <label v-if="usesTransitionRadius" class="block text-xs text-gray-400">
                  {{ es ? 'Radio usado en la transición' : 'Radius used on the transition' }} ({{ dimUnit }})
                  <input :value="feetToUnit(form.sketch.transitionRadiusFt)" type="number" step="0.1" class="mt-1 w-full px-3 py-2 rounded-lg bg-gray-800 border border-teal-700 text-white text-sm" @change="setDim('transitionRadiusFt', ($event.target as HTMLInputElement).value)" />
                </label>
                <label v-if="form.construction_type === 'mini_ramp'" class="col-span-2 block text-xs text-gray-400">
                  {{ es ? 'Largo de flatground' : 'Flatground length' }} ({{ dimUnit }})
                  <input :value="feetToUnit(form.sketch.flatLengthFt)" type="number" min="0" step="0.1" class="mt-1 w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm" @change="setDim('flatLengthFt', ($event.target as HTMLInputElement).value)" />
                </label>
              </div>
              <div v-if="form.construction_type === 'rails'" class="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 space-y-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-[10px] font-bold uppercase tracking-wide text-amber-300">
                    {{ es ? 'Coping' : 'Coping' }}
                  </p>
                  <div class="inline-flex rounded-lg border border-amber-400/30 p-0.5">
                    <button
                      type="button"
                      class="px-2.5 py-1 rounded-md text-[11px] font-bold"
                      :class="form.sketch.railCoping === 'round' ? 'bg-amber-300 text-gray-950' : 'text-amber-100/70'"
                      @click="setRailCoping('round')"
                    >
                      {{ es ? 'Redondo' : 'Round' }}
                    </button>
                    <button
                      type="button"
                      class="px-2.5 py-1 rounded-md text-[11px] font-bold"
                      :class="form.sketch.railCoping === 'flat' ? 'bg-amber-300 text-gray-950' : 'text-amber-100/70'"
                      @click="setRailCoping('flat')"
                    >
                      {{ es ? 'Plano' : 'Flat' }}
                    </button>
                  </div>
                </div>
                <div v-if="form.sketch.railCoping === 'round'" class="grid grid-cols-3 gap-1.5">
                  <button
                    v-for="size in RAMP_COPING_SIZES"
                    :key="size"
                    type="button"
                    class="py-2 rounded-lg text-xs font-bold border"
                    :class="copingLine()?.sizeCm === size ? 'border-amber-300 bg-amber-300/20 text-white' : 'border-amber-400/30 text-amber-100/70'"
                    @click="setRailRoundSize(size)"
                  >
                    {{ size }} cm
                  </button>
                </div>
                <div v-else class="grid grid-cols-2 gap-1.5">
                  <button
                    v-for="profile in (['1x3', '2x4'] as const)"
                    :key="profile"
                    type="button"
                    class="py-2 rounded-lg text-xs font-bold border"
                    :class="form.sketch.railFlatProfile === profile ? 'border-amber-300 bg-amber-300/20 text-white' : 'border-amber-400/30 text-amber-100/70'"
                    @click="setRailFlatProfile(profile)"
                  >
                    {{ profile }}
                  </button>
                </div>
              </div>
              <div v-if="form.construction_type === 'kicker'" class="rounded-xl border border-lime-400/40 bg-lime-400/10 p-3 space-y-3">
                <p class="text-[10px] font-bold uppercase tracking-wide text-lime-300">
                  {{ es ? 'Lados · 2 piezas' : 'Sides · 2 pieces' }}
                </p>
                <div class="grid grid-cols-3 gap-2 items-stretch">
                  <label class="h-full flex flex-col text-xs text-lime-100/80">
                    {{ es ? 'Alto' : 'Height' }} ({{ dimUnit }})
                    <input :value="feetToUnit(form.sketch.heightFt)" type="number" step="0.1" class="mt-auto w-full px-2 py-2 rounded-lg bg-gray-950/50 border border-lime-400/30 text-white text-sm" @change="setDim('heightFt', ($event.target as HTMLInputElement).value)" />
                  </label>
                  <label class="h-full flex flex-col text-xs text-lime-100/80">
                    {{ es ? 'Ancho' : 'Width' }} ({{ dimUnit }})
                    <input :value="feetToUnit(form.sketch.widthFt)" type="number" step="0.1" class="mt-auto w-full px-2 py-2 rounded-lg bg-gray-950/50 border border-lime-400/30 text-white text-sm" @change="setDim('widthFt', ($event.target as HTMLInputElement).value)" />
                  </label>
                  <label class="h-full flex flex-col text-xs text-lime-100/80">
                    {{ es ? 'Largo' : 'Length' }} ({{ dimUnit }})
                    <input :value="feetToUnit(form.sketch.lengthFt)" type="number" step="0.1" class="mt-auto w-full px-2 py-2 rounded-lg bg-gray-950/50 border border-lime-400/30 text-white text-sm" @change="setDim('lengthFt', ($event.target as HTMLInputElement).value)" />
                  </label>
                </div>
                <div class="grid grid-cols-2 gap-2 items-stretch">
                  <label class="h-full flex flex-col text-xs text-lime-100/80">
                    {{ es ? 'Radio' : 'Radius' }} ({{ dimUnit }})
                    <input
                      :value="form.sketch.kickerShape === 'radius' ? feetToUnit(form.sketch.transitionRadiusFt) : ''"
                      type="number"
                      step="0.1"
                      class="mt-auto w-full px-2 py-2 rounded-lg bg-gray-950/50 border border-lime-400/30 text-white text-sm"
                      @change="setKickerRadius(($event.target as HTMLInputElement).value)"
                    />
                  </label>
                  <label class="h-full flex flex-col text-xs text-lime-100/80">
                    {{ es ? 'Ángulo' : 'Angle' }} (°)
                    <input
                      :value="form.sketch.kickerShape === 'angle' && form.sketch.bankAngleDeg > 0 ? form.sketch.bankAngleDeg : ''"
                      type="number"
                      min="1"
                      max="80"
                      step="0.5"
                      class="mt-auto w-full px-2 py-2 rounded-lg bg-gray-950/50 border border-lime-400/30 text-white text-sm"
                      @change="setKickerAngle(($event.target as HTMLInputElement).value)"
                    />
                  </label>
                </div>
                <div>
                  <p class="text-[10px] uppercase tracking-wide text-lime-200/70">{{ es ? 'Área de los 2 lados' : 'Area of the 2 sides' }}</p>
                  <p class="text-lg font-bold text-white">{{ areaFromSqFt(takeoff?.sideSqFt || 0) }}</p>
                  <p class="text-[10px] text-lime-200/60">
                    {{ form.sketch.kickerShape === 'radius'
                      ? (es ? 'Transición curva. Cada lado sigue el radio.' : 'Curved transition. Each side follows the radius.')
                      : (es ? 'Banco recto. Cada lado es un triángulo con este ángulo.' : 'Straight bank. Each side is a triangle at this angle.') }}
                  </p>
                </div>
              </div>
              <div v-if="form.construction_type !== 'rails'" class="rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-3">
                <p class="text-[10px] font-bold uppercase tracking-wide text-cyan-300 mb-2">
                  {{ es ? 'Superficie' : 'Surface' }}
                </p>
                <div class="grid grid-cols-3 gap-2 items-stretch">
                  <label class="h-full flex flex-col text-xs text-cyan-100/80">
                    {{ es ? 'Largo' : 'Length' }} ({{ dimUnit }})
                    <input :value="feetToUnit(form.sketch.surfaceLengthFt)" type="number" step="0.1" class="mt-auto w-full px-2 py-2 rounded-lg bg-gray-950/50 border border-cyan-400/30 text-white text-sm" @change="setDim('surfaceLengthFt', ($event.target as HTMLInputElement).value)" />
                  </label>
                  <label class="h-full flex flex-col text-xs text-cyan-100/80">
                    {{ es ? 'Ancho' : 'Width' }} ({{ dimUnit }})
                    <input :value="feetToUnit(form.sketch.surfaceWidthFt)" type="number" step="0.1" class="mt-auto w-full px-2 py-2 rounded-lg bg-gray-950/50 border border-cyan-400/30 text-white text-sm" @change="setDim('surfaceWidthFt', ($event.target as HTMLInputElement).value)" />
                  </label>
                  <div class="h-full flex flex-col rounded-lg border border-fuchsia-400/40 bg-fuchsia-400/10 px-2 py-1.5">
                    <p class="text-[10px] font-bold uppercase tracking-wide text-fuchsia-300 leading-tight">
                      {{ es ? 'Plataforma superior' : 'Top platform' }}
                    </p>
                    <label class="mt-auto pt-1 text-[10px] text-fuchsia-100/80">
                      {{ es ? 'Largo' : 'Length' }} ({{ dimUnit }})
                      <input :value="feetToUnit(form.sketch.platformDepthFt)" type="number" step="0.1" class="mt-0.5 w-full px-2 py-1.5 rounded-lg bg-gray-950/50 border border-fuchsia-400/30 text-white text-sm" @change="setDim('platformDepthFt', ($event.target as HTMLInputElement).value)" />
                    </label>
                    <p class="pt-1 text-[10px] text-fuchsia-200/80">
                      {{ es ? 'Área' : 'Area' }}
                      <span class="block text-sm font-bold text-white">{{ areaFromSqFt(platformAreaSqFt) }}</span>
                    </p>
                  </div>
                </div>
              </div>
              <p v-if="usesTransitionRadius" class="text-[10px] text-gray-500">
                {{ es
                  ? `El largo de superficie usa el radio de transición de ${feetToUnit(form.sketch.transitionRadiusFt)} ${dimUnit}.`
                  : `Surface length uses the transition radius of ${feetToUnit(form.sketch.transitionRadiusFt)} ${dimUnit}.` }}
              </p>
            </div>

            <div v-if="constructionTemplates.length">
              <p class="text-xs text-gray-400 mb-2">{{ es ? 'Plantilla' : 'Template' }}</p>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="template in constructionTemplates"
                  :key="template.id"
                  type="button"
                  class="px-3 py-1.5 rounded-full text-xs font-bold border transition-colors"
                  :class="form.template_id === template.id
                    ? 'border-gold-400 bg-gold-400/20 text-white'
                    : 'border-gray-700 text-gray-400'"
                  @click="applyBuildTemplate(template.id)"
                >
                  {{ es ? template.title.es : template.title.en }}
                </button>
              </div>
            </div>

            <div class="grid md:grid-cols-[minmax(0,1fr)_11rem] gap-3 items-stretch">
              <div class="flex flex-col min-h-[11rem]">
                <label class="block text-xs text-gray-400 mb-1 shrink-0">{{ es ? 'Plan de construcción' : 'Build plan' }}</label>
                <textarea v-model="form.build_notes" class="flex-1 min-h-0 w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm font-mono leading-relaxed resize-y" :placeholder="es ? 'Elige una plantilla o escribe el plan…' : 'Pick a template or write the plan…'" />
              </div>

            <div class="rounded-xl border border-gray-800 bg-gray-950/60 p-2 flex flex-col min-h-0">
              <p class="text-xs font-bold uppercase tracking-wide text-gray-400 shrink-0">
                {{ es ? 'Imágenes del diseño' : 'Design images' }}
              </p>
              <p class="text-[10px] text-gray-500 shrink-0 mb-1.5">
                {{ es ? '3 fotos y 1 video.' : '3 photos and 1 video.' }}
              </p>
              <div class="flex-1 grid grid-cols-2 grid-rows-2 gap-1.5 min-h-0">
                <div
                  v-for="slot in designSlots"
                  :key="slot.kind + slot.index"
                  class="relative min-h-[3.25rem] h-full rounded-lg border border-dashed border-gray-600 bg-gray-900 overflow-hidden"
                >
                  <button
                    v-if="designSlotUrl(slot.kind, slot.index)"
                    type="button"
                    class="absolute inset-0"
                    :aria-label="es ? 'Ver diseño' : 'View design'"
                    @click="openDesignCarousel(slot.kind, slot.index)"
                  >
                    <img
                      v-if="slot.kind === 'image'"
                      :src="designSlotUrl(slot.kind, slot.index)"
                      alt=""
                      class="absolute inset-0 w-full h-full object-cover"
                    />
                    <video
                      v-else
                      :src="designSlotUrl(slot.kind, slot.index)"
                      class="absolute inset-0 w-full h-full object-cover pointer-events-none"
                      muted
                      playsinline
                    />
                    <span
                      v-if="slot.kind === 'video'"
                      class="absolute bottom-1 left-1 text-[10px] bg-black/70 text-white px-1 rounded"
                    >▶</span>
                  </button>
                  <label
                    v-else
                    class="absolute inset-0 flex items-center justify-center cursor-pointer"
                  >
                    <span class="text-[10px] font-bold text-gray-500 text-center px-1">
                      {{ es ? slot.es : slot.en }}
                    </span>
                    <input
                      type="file"
                      class="hidden"
                      :accept="slot.kind === 'video' ? 'video/*' : 'image/*'"
                      @change="uploadDesignSlot(slot.kind, slot.index, ($event.target as HTMLInputElement).files)"
                    />
                  </label>
                  <button
                    v-if="designSlotUrl(slot.kind, slot.index)"
                    type="button"
                    class="absolute top-0 right-0 z-10 bg-black/70 text-red-400 text-xs px-1"
                    @click.stop="clearDesignSlot(slot.kind, slot.index)"
                  >
                    ×
                  </button>
                </div>
              </div>
              <p v-if="uploading" class="text-xs text-gray-500">{{ es ? 'Subiendo…' : 'Uploading…' }}</p>
            </div>
            </div>

            <div class="grid lg:grid-cols-2 gap-3">
              <div class="rounded-xl border border-gold-400/40 bg-gray-950/60 p-3 space-y-3">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <p class="text-xs font-bold uppercase tracking-wide text-gold-400">
                      {{ es ? 'Materiales' : 'Materials' }}
                    </p>
                    <p class="text-[10px] text-gray-500 mt-1">
                      <template v-if="takeoff">
                        {{ es ? 'Superficie' : 'Surface' }} {{ dimUnit === 'cm' ? Math.round(takeoff.ridingSqFt * 0.092903 * 100) / 100 : Math.round(takeoff.ridingSqFt * 144) }} {{ dimUnit === 'cm' ? 'm²' : 'in²' }}
                        · {{ es ? 'lados' : 'sides' }} {{ dimUnit === 'cm' ? Math.round(takeoff.sideSqFt * 0.092903 * 100) / 100 : Math.round(takeoff.sideSqFt * 144) }} {{ dimUnit === 'cm' ? 'm²' : 'in²' }}
                        · {{ es ? 'volumen' : 'volume' }} {{ dimUnit === 'cm' ? Math.round(takeoff.volumeCuFt * 0.0283168 * 100) / 100 : Math.round(takeoff.volumeCuFt * 1728) }} {{ dimUnit === 'cm' ? 'm³' : 'in³' }}
                      </template>
                      <template v-else>
                        {{ es ? 'Elige un tipo de construcción para calcular cantidades desde las medidas.' : 'Pick a construction type to calculate quantities from the dimensions.' }}
                      </template>
                    </p>
                  </div>
                  <button
                    type="button"
                    class="shrink-0 px-2 py-1 rounded-lg border border-gray-600 text-[11px] font-bold text-white"
                    @click="addMaterialLine"
                  >
                    + {{ es ? 'Material' : 'Material' }}
                  </button>
                </div>
                <div v-for="group in RAMP_MATERIAL_GROUPS.filter(g => g.id === 'wood')" :key="group.id" class="space-y-1.5">
                  <p class="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    {{ es ? group.es : group.en }}
                  </p>
                  <div class="grid grid-cols-3 gap-1.5 items-stretch">
                    <div
                      v-for="line in materialsIn(group.id)"
                      :key="line.id"
                      class="h-full flex flex-col rounded-lg border border-gray-800 px-2 py-1.5"
                    >
                      <p class="text-[11px] font-bold text-white leading-tight">{{ line.name }}</p>
                      <label class="mt-auto pt-1 text-[9px] text-gray-500">
                        {{ es ? 'Cant.' : 'Qty' }}
                        <span class="text-gray-600">{{ line.unit }}</span>
                        <input v-model.number="line.qty" type="number" min="0" step="1" class="mt-0.5 w-full px-1.5 py-1 rounded bg-gray-800 border border-gray-700 text-white text-xs" />
                      </label>
                      <label class="pt-1 text-[9px] text-gray-500">
                        {{ es ? 'Costo' : 'Cost' }}
                        <select
                          class="mt-0.5 w-full px-1 py-1 rounded bg-gray-800 border border-gray-700 text-white text-[10px]"
                          :value="line.provider || RAMP_WOOD_PROVIDERS[0].name"
                          @change="setWoodProvider(line, ($event.target as HTMLSelectElement).value)"
                        >
                          <option v-for="provider in RAMP_WOOD_PROVIDERS" :key="provider.id" :value="provider.name">
                            {{ provider.name }} · ${{ provider.costs[line.id] }}
                          </option>
                        </select>
                      </label>
                      <p class="text-[10px] text-right text-gray-300 pt-1">${{ Math.round(lineTotal(line)).toLocaleString('es-MX') }}</p>
                    </div>
                  </div>
                </div>
                <div class="grid grid-cols-4 gap-1.5 items-stretch">
                  <div
                    v-for="line in finishLines"
                    :key="line.id"
                    class="h-full flex flex-col rounded-lg border border-gray-800 px-2 py-1.5"
                  >
                    <div class="flex items-start justify-between gap-1">
                      <p class="text-[11px] font-bold text-white leading-tight">{{ line.name }}</p>
                      <p class="text-[10px] text-gray-300 shrink-0">${{ Math.round(lineTotal(line)).toLocaleString('es-MX') }}</p>
                    </div>
                    <div class="min-h-[1.7rem] mt-1">
                      <div v-if="line.id === 'coping' && form.construction_type === 'rails' && form.sketch.railCoping === 'flat'" class="flex gap-0.5">
                        <button
                          v-for="profile in (['1x3', '2x4'] as const)"
                          :key="profile"
                          type="button"
                          class="flex-1 py-0.5 rounded text-[10px] font-bold border"
                          :class="form.sketch.railFlatProfile === profile ? 'border-white bg-white/10 text-white' : 'border-gray-700 text-gray-400'"
                          @click="setRailFlatProfile(profile)"
                        >
                          {{ profile }}
                        </button>
                      </div>
                      <div v-else-if="line.id === 'coping'" class="flex gap-0.5">
                        <button
                          v-for="size in RAMP_COPING_SIZES"
                          :key="size"
                          type="button"
                          class="flex-1 py-0.5 rounded text-[10px] font-bold border"
                          :class="line.sizeCm === size ? 'border-white bg-white/10 text-white' : 'border-gray-700 text-gray-400'"
                          @click="form.construction_type === 'rails' ? setRailRoundSize(size) : line.sizeCm = size"
                        >
                          {{ size }}
                        </button>
                      </div>
                      <p v-else-if="line.id === 'metal-plate'" class="text-[9px] text-gray-500 truncate">
                        {{ dimUnit === 'cm' ? (takeoff?.sheetMetalHeightCm || 30) : Math.round(((takeoff?.sheetMetalHeightCm || 30) / 2.54) * 10) / 10 }} {{ dimUnit }} × {{ feetToUnit(form.sketch.widthFt) }} {{ dimUnit }}
                      </p>
                      <p v-else-if="line.id === 'coating'" class="text-[9px] text-gray-500 truncate">
                        {{ feetToUnit(form.sketch.surfaceLengthFt) }} × {{ feetToUnit(form.sketch.surfaceWidthFt) }} {{ dimUnit }}
                      </p>
                      <p v-else class="text-[9px] text-gray-500 truncate">{{ line.provider || (es ? 'Proveedor' : 'Provider') }}</p>
                    </div>
                    <label class="mt-auto pt-1 text-[9px] text-gray-500">
                      {{ es ? 'Cant.' : 'Qty' }}
                      <span class="text-gray-600">{{ line.unit }}</span>
                      <input v-model.number="line.qty" type="number" min="0" step="1" class="mt-0.5 w-full px-1.5 py-1 rounded bg-gray-800 border border-gray-700 text-white text-xs" />
                    </label>
                    <label class="pt-1 text-[9px] text-gray-500">
                      {{ es ? 'Costo' : 'Cost' }}
                      <input v-model.number="line.unitCostMxn" type="number" min="0" step="1" class="mt-0.5 w-full px-1.5 py-1 rounded bg-gray-800 border border-gray-700 text-white text-xs" />
                    </label>
                  </div>
                </div>
              </div>

              <div class="rounded-xl border border-gray-800 bg-gray-950/60 p-3 space-y-3">
                <p class="text-xs font-bold uppercase tracking-wide text-gray-400">
                  {{ es ? 'Opciones para el cliente' : 'Client options' }}
                </p>
                <div>
                  <p class="text-[11px] text-gray-500 mb-1.5">{{ es ? 'Superficie' : 'Surfacing' }}</p>
                  <div class="space-y-2">
                    <div v-for="opt in RAMP_SURFACING_OPTIONS" :key="opt.id" class="flex items-center gap-2">
                      <button
                        type="button"
                        class="px-3 py-1.5 rounded-lg text-xs font-bold border shrink-0"
                        :class="form.client_options.surfacing === opt.id
                          ? 'border-white bg-white/10 text-white'
                          : 'border-gray-700 text-gray-400'"
                        @click="form.client_options.surfacing = form.client_options.surfacing === opt.id ? null : opt.id"
                      >
                        {{ es ? opt.es : opt.en }}
                      </button>
                      <label class="flex-1 text-[10px] text-gray-500">
                        {{ es ? 'Precio MXN' : 'Price MXN' }}
                        <input
                          v-model.number="form.pricing.optionPrices[opt.id]"
                          type="number"
                          min="0"
                          step="1"
                          class="mt-1 w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs"
                        />
                      </label>
                    </div>
                  </div>
                </div>
                <div>
                  <p class="text-[11px] text-gray-500 mb-1.5">{{ es ? 'Ruedas caster' : 'Caster wheels' }}</p>
                  <div class="flex flex-wrap items-end gap-2">
                    <button
                      type="button"
                      class="px-3 py-1.5 rounded-lg text-xs font-bold border"
                      :class="form.client_options.casterWheels === false ? 'border-white bg-white/10 text-white' : 'border-gray-700 text-gray-400'"
                      @click="form.client_options.casterWheels = false"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      class="px-3 py-1.5 rounded-lg text-xs font-bold border"
                      :class="form.client_options.casterWheels === true ? 'border-white bg-white/10 text-white' : 'border-gray-700 text-gray-400'"
                      @click="form.client_options.casterWheels = true"
                    >
                      {{ es ? 'Sí' : 'Yes' }}
                    </button>
                    <label class="text-[10px] text-gray-500 min-w-[7rem] flex-1">
                      {{ es ? 'Precio si sí' : 'Price if yes' }}
                      <input
                        v-model.number="form.pricing.optionPrices.casterWheels"
                        type="number"
                        min="0"
                        step="1"
                        class="mt-1 w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs"
                      />
                    </label>
                  </div>
                </div>
                <div>
                  <p class="text-[11px] text-gray-500 mb-1.5">{{ es ? 'Recubrimiento resistente al clima' : 'Weather resistant coating' }}</p>
                  <div class="flex flex-wrap items-end gap-2">
                    <button
                      type="button"
                      class="px-3 py-1.5 rounded-lg text-xs font-bold border"
                      :class="form.client_options.weatherCoating === false ? 'border-white bg-white/10 text-white' : 'border-gray-700 text-gray-400'"
                      @click="form.client_options.weatherCoating = false"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      class="px-3 py-1.5 rounded-lg text-xs font-bold border"
                      :class="form.client_options.weatherCoating === true ? 'border-white bg-white/10 text-white' : 'border-gray-700 text-gray-400'"
                      @click="form.client_options.weatherCoating = true"
                    >
                      {{ es ? 'Sí' : 'Yes' }}
                    </button>
                    <label class="text-[10px] text-gray-500 min-w-[7rem] flex-1">
                      {{ es ? 'Precio si sí' : 'Price if yes' }}
                      <input
                        v-model.number="form.pricing.optionPrices.weatherCoating"
                        type="number"
                        min="0"
                        step="1"
                        class="mt-1 w-full px-2 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-white text-xs"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="rounded-xl border border-teal-500/40 bg-teal-950/20 p-3 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label class="text-[10px] text-gray-400">
                {{ es ? 'Margen sobre materiales %' : 'Margin on materials %' }}
                <input
                  v-model.number="form.pricing.marginPct"
                  type="number"
                  min="0"
                  step="1"
                  class="mt-1 w-full px-2 py-1.5 rounded-lg bg-gray-900 border border-gray-700 text-white text-sm"
                />
              </label>
              <div>
                <p class="text-[10px] text-gray-500">{{ es ? 'Costo materiales' : 'Material cost' }}</p>
                <p class="text-sm font-bold text-white">${{ Math.round(quote.materialCost).toLocaleString('es-MX') }}</p>
              </div>
              <div>
                <p class="text-[10px] text-gray-500">{{ es ? 'Opciones elegidas' : 'Selected options' }}</p>
                <p class="text-sm font-bold text-white">${{ Math.round(quote.optionsPrice).toLocaleString('es-MX') }}</p>
              </div>
              <div>
                <p class="text-[10px] text-teal-300">{{ es ? 'Precio de venta' : 'Selling price' }}</p>
                <p class="text-lg font-black text-white">${{ quote.sellingPrice.toLocaleString('es-MX') }} MXN</p>
              </div>
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
              class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 transition-colors text-white font-semibold text-sm disabled:opacity-50"
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

  <Teleport to="body">
    <div
      v-if="carouselOpen && carouselItems.length"
      class="fixed inset-0 z-[80] bg-black/95 flex flex-col"
      @touchstart.passive="onCarouselTouchStart"
      @touchend.passive="onCarouselTouchEnd"
    >
      <div class="flex items-center justify-between px-4 py-3 text-white">
        <p class="text-sm text-gray-300">{{ carouselIndex + 1 }} / {{ carouselItems.length }}</p>
        <button
          type="button"
          class="px-3 py-1 rounded-lg border border-gray-600 text-sm"
          @click="carouselOpen = false"
        >
          {{ es ? 'Cerrar' : 'Close' }}
        </button>
      </div>
      <div class="relative flex-1 min-h-0 overflow-hidden">
        <div
          class="flex h-full transition-transform duration-300 ease-out"
          :style="{ transform: `translateX(-${carouselIndex * 100}%)` }"
        >
          <div
            v-for="(item, index) in carouselItems"
            :key="item.url"
            class="w-full shrink-0 h-full flex items-center justify-center px-14"
          >
            <img
              v-if="item.kind === 'image'"
              :src="item.url"
              alt=""
              class="max-h-full max-w-full object-contain"
            />
            <video
              v-else
              :src="item.url"
              class="max-h-full max-w-full"
              controls
              playsinline
              :autoplay="index === carouselIndex"
            />
          </div>
        </div>
        <button
          v-if="carouselItems.length > 1"
          type="button"
          class="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white text-2xl"
          :aria-label="es ? 'Anterior' : 'Previous'"
          @click="stepCarousel(-1)"
        >
          ‹
        </button>
        <button
          v-if="carouselItems.length > 1"
          type="button"
          class="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 text-white text-2xl"
          :aria-label="es ? 'Siguiente' : 'Next'"
          @click="stepCarousel(1)"
        >
          ›
        </button>
      </div>
      <div class="flex justify-center gap-1.5 py-4">
        <button
          v-for="(item, index) in carouselItems"
          :key="`${item.url}-dot`"
          type="button"
          class="h-1.5 rounded-full transition-all"
          :class="index === carouselIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/40'"
          @click="carouselIndex = index"
        />
      </div>
    </div>
  </Teleport>
</template>
