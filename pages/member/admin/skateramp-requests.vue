<script setup lang="ts">
/** Inbox for the custom ramp form on /skateramps. */
import {
  RAMP_BUILD_TYPE_OPTIONS,
  RAMP_REQUEST_STATUS_OPTIONS,
  RAMP_SKILL_LEVEL_OPTIONS,
  RAMP_SURFACE_OPTIONS,
  RAMP_TIMELINE_OPTIONS,
  rampOptionLabel,
  rampRequestStatusClass,
  rampSpaceLabel,
  type RampRequestStatus,
  type SkaterampRequest,
} from '~/utils/skaterampRequests'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const loading = ref(true)
const ready = ref(false)
const requests = ref<SkaterampRequest[]>([])
const errorMessage = ref<string | null>(null)
const busyId = ref<string | null>(null)
const expandedId = ref<string | null>(null)
const notesDraft = ref<Record<string, string>>({})
const activeTab = ref<RampRequestStatus | 'all'>('new')

const tabs = computed(() => [
  ...RAMP_REQUEST_STATUS_OPTIONS.map(o => ({ id: o.id as RampRequestStatus | 'all', label: es.value ? o.es : o.en })),
  { id: 'all' as const, label: es.value ? 'Todas' : 'All' },
])

const counts = computed(() => {
  const map: Record<string, number> = { all: requests.value.length }
  for (const option of RAMP_REQUEST_STATUS_OPTIONS) {
    map[option.id] = requests.value.filter(r => r.status === option.id).length
  }
  return map
})

const visibleRequests = computed(() =>
  activeTab.value === 'all'
    ? requests.value
    : requests.value.filter(r => r.status === activeTab.value),
)

/** Surfaced so a silent Resend misconfiguration does not go unnoticed. */
const undelivered = computed(() => requests.value.filter(r => !r.emailed_at))

/** The endpoint records why, so the banner can name the cause instead of guessing. */
const undeliveredReasons = computed(() =>
  [...new Set(undelivered.value.map(r => r.email_error).filter(Boolean))].join(' · '),
)

async function loadRequests() {
  loading.value = true
  errorMessage.value = null
  try {
    const { data, error } = await client
      .from('skateramp_requests')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    requests.value = (data ?? []) as SkaterampRequest[]
    notesDraft.value = Object.fromEntries(
      requests.value.map(r => [r.id, r.admin_notes || '']),
    )
  } catch (e: any) {
    // The table only exists after add_skateramp_requests.sql runs.
    errorMessage.value = e?.message || (es.value ? 'No se pudieron cargar las solicitudes' : 'Could not load requests')
    requests.value = []
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  if (!user.value) {
    await router.push('/auth/login?redirect=/member/admin/skateramp-requests')
    return
  }
  const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if ((data as { role?: string } | null)?.role !== 'admin') {
    await router.push('/member/staff/dashboard')
    return
  }
  ready.value = true
  await loadRequests()
})

async function setStatus(request: SkaterampRequest, status: RampRequestStatus) {
  if (request.status === status) return
  busyId.value = request.id
  const previous = request.status
  request.status = status
  try {
    const { error } = await client
      .from('skateramp_requests')
      .update({ status })
      .eq('id', request.id)
    if (error) throw error
  } catch (e: any) {
    request.status = previous
    errorMessage.value = e?.message || (es.value ? 'No se pudo actualizar' : 'Could not update')
  } finally {
    busyId.value = null
  }
}

async function saveNotes(request: SkaterampRequest) {
  const notes = (notesDraft.value[request.id] || '').trim() || null
  if (notes === request.admin_notes) return
  busyId.value = request.id
  try {
    const { error } = await client
      .from('skateramp_requests')
      .update({ admin_notes: notes })
      .eq('id', request.id)
    if (error) throw error
    request.admin_notes = notes
  } catch (e: any) {
    errorMessage.value = e?.message || (es.value ? 'No se pudieron guardar las notas' : 'Could not save notes')
  } finally {
    busyId.value = null
  }
}

function toggle(id: string) {
  expandedId.value = expandedId.value === id ? null : id
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(es.value ? 'es-MX' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatBudget(value: number | null) {
  if (!value) return null
  return `$${value.toLocaleString('es-MX')} MXN`
}

function whatsappLink(phone: string) {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}`
}

function detailRows(request: SkaterampRequest) {
  return [
    { label: es.value ? 'Tipo de rampa' : 'Ramp type', value: rampOptionLabel(RAMP_BUILD_TYPE_OPTIONS, request.ramp_type, es.value) },
    { label: es.value ? 'Espacio' : 'Space', value: rampSpaceLabel(request.space_width_m, request.space_length_m) || '—' },
    { label: es.value ? 'Superficie' : 'Surface', value: rampOptionLabel(RAMP_SURFACE_OPTIONS, request.surface, es.value) },
    { label: es.value ? 'Nivel' : 'Level', value: rampOptionLabel(RAMP_SKILL_LEVEL_OPTIONS, request.skill_level, es.value) },
    { label: es.value ? 'Presupuesto' : 'Budget', value: formatBudget(request.budget_mxn) || '—' },
    { label: es.value ? 'Cuándo' : 'Timeline', value: rampOptionLabel(RAMP_TIMELINE_OPTIONS, request.timeline, es.value) },
  ]
}
</script>

<template>
  <div v-if="ready" class="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-black uppercase text-white">
          {{ es ? 'Solicitudes de rampa' : 'Ramp requests' }}
        </h1>
        <p class="text-sm text-gray-400 mt-1">
          {{
            es
              ? 'Formulario “Rampa a tu medida” de la página pública de Skateramps.'
              : 'Custom ramp form from the public Skateramps page.'
          }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink
          to="/member/admin/skateramps"
          class="px-4 py-2 rounded-xl border border-gray-700 text-sm font-semibold text-gray-300 hover:border-gold-400 hover:text-white transition-colors"
        >
          {{ es ? 'Estudio de diseño' : 'Design studio' }}
        </NuxtLink>
        <button
          type="button"
          class="px-4 py-2 rounded-xl bg-gray-800 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
          @click="loadRequests"
        >
          {{ es ? 'Actualizar' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div
      v-if="undelivered.length"
      class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200 space-y-1"
    >
      <p>
        {{
          es
            ? `${undelivered.length} solicitud(es) no se enviaron por correo. Los datos siguen completos aquí.`
            : `${undelivered.length} request(s) were not emailed. The data is still complete here.`
        }}
      </p>
      <p v-if="undeliveredReasons" class="text-amber-300/80 font-mono break-words">
        {{ undeliveredReasons }}
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide border transition-colors"
        :class="
          activeTab === tab.id
            ? 'bg-gold-500 border-gold-500 text-black'
            : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
        "
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <span class="ml-1 opacity-70">{{ counts[tab.id] ?? 0 }}</span>
      </button>
    </div>

    <p v-if="errorMessage" class="text-sm text-red-400">{{ errorMessage }}</p>

    <div v-if="loading" class="flex justify-center py-16">
      <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
    </div>

    <p v-else-if="!visibleRequests.length" class="text-sm text-gray-500 py-12 text-center border border-dashed border-gray-800 rounded-2xl">
      {{ es ? 'Sin solicitudes en esta vista.' : 'No requests in this view.' }}
    </p>

    <ul v-else class="space-y-3">
      <li
        v-for="request in visibleRequests"
        :key="request.id"
        class="rounded-2xl border border-gray-800 bg-gray-950 overflow-hidden"
      >
        <button
          type="button"
          class="w-full flex flex-wrap items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-900/60 transition-colors"
          @click="toggle(request.id)"
        >
          <span
            class="px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide shrink-0"
            :class="rampRequestStatusClass(request.status)"
          >
            {{ rampOptionLabel(RAMP_REQUEST_STATUS_OPTIONS, request.status, es) }}
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-bold text-white truncate">
              {{ request.full_name }}
              <span v-if="request.city" class="font-normal text-gray-500">· {{ request.city }}</span>
            </p>
            <p class="text-xs text-gray-500 truncate">
              {{ rampOptionLabel(RAMP_BUILD_TYPE_OPTIONS, request.ramp_type, es) }} · {{ formatDate(request.created_at) }}
            </p>
          </div>
          <span v-if="request.image_urls?.length" class="text-xs text-gray-500 shrink-0">
            📷 {{ request.image_urls.length }}
          </span>
          <span class="text-gray-600 shrink-0">{{ expandedId === request.id ? '▴' : '▾' }}</span>
        </button>

        <div v-if="expandedId === request.id" class="border-t border-gray-800 px-4 py-4 space-y-5">
          <div class="flex flex-wrap gap-2">
            <a
              :href="`mailto:${request.email}`"
              class="px-3 py-1.5 rounded-lg bg-gray-800 text-xs font-semibold text-white hover:bg-gray-700 transition-colors"
            >
              ✉ {{ request.email }}
            </a>
            <a
              v-if="request.phone"
              :href="whatsappLink(request.phone)"
              target="_blank"
              rel="noopener"
              class="px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 transition-colors"
            >
              WhatsApp {{ request.phone }}
            </a>
          </div>

          <p v-if="request.email_error" class="text-[11px] text-amber-300/80 font-mono break-words">
            {{ es ? 'Sin correo:' : 'Not emailed:' }} {{ request.email_error }}
          </p>

          <dl class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div v-for="row in detailRows(request)" :key="row.label" class="min-w-0">
              <dt class="text-[10px] uppercase tracking-wide text-gray-600">{{ row.label }}</dt>
              <dd class="text-sm text-gray-200 truncate">{{ row.value }}</dd>
            </div>
          </dl>

          <div>
            <p class="text-[10px] uppercase tracking-wide text-gray-600 mb-1">{{ es ? 'Mensaje' : 'Message' }}</p>
            <p class="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{{ request.message }}</p>
          </div>

          <div v-if="request.image_urls?.length">
            <p class="text-[10px] uppercase tracking-wide text-gray-600 mb-2">{{ es ? 'Fotos' : 'Photos' }}</p>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <a
                v-for="url in request.image_urls"
                :key="url"
                :href="url"
                target="_blank"
                rel="noopener"
                class="aspect-square rounded-xl overflow-hidden border border-gray-700 hover:border-gold-400 transition-colors"
              >
                <img :src="url" alt="" class="w-full h-full object-cover" />
              </a>
            </div>
          </div>

          <div>
            <label class="block text-[10px] uppercase tracking-wide text-gray-600 mb-1">
              {{ es ? 'Notas internas' : 'Internal notes' }}
            </label>
            <textarea
              v-model="notesDraft[request.id]"
              rows="2"
              class="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm resize-y focus:border-gold-400 focus:outline-none"
              :placeholder="es ? 'Cotización enviada, materiales, seguimiento…' : 'Quote sent, materials, follow-up…'"
              @blur="saveNotes(request)"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span class="text-[10px] uppercase tracking-wide text-gray-600 mr-1">{{ es ? 'Estado' : 'Status' }}</span>
            <button
              v-for="option in RAMP_REQUEST_STATUS_OPTIONS"
              :key="option.id"
              type="button"
              class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-50"
              :class="
                request.status === option.id
                  ? rampRequestStatusClass(option.id)
                  : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'
              "
              :disabled="busyId === request.id"
              @click="setStatus(request, option.id)"
            >
              {{ es ? option.es : option.en }}
            </button>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
