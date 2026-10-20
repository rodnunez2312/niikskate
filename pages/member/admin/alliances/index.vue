<script setup lang="ts">
import {
  PARTNER_TYPES,
  locationLine,
  partnerTypeLabel,
  statusLabel,
  type AllianceRecord,
  type AllianceStatus,
  type PartnerType,
} from '~/utils/alliances'

definePageMeta({ layout: 'member', middleware: ['auth', 'member'] })

const client = useSupabaseClient()
const alliances = ref<AllianceRecord[]>([])
const loading = ref(true)
const error = ref('')
const notice = ref('')
const query = ref('')
const typeFilter = ref<'all' | PartnerType>('all')
const statusFilter = ref<'all' | AllianceStatus>('all')
const pendingDelete = ref<AllianceRecord | null>(null)

async function authHeaders() {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sesión expirada.')
  return { Authorization: `Bearer ${token}` }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const response = await $fetch<{ alliances: AllianceRecord[] }>('/api/admin/alliances', {
      headers: await authHeaders(),
    })
    alliances.value = response.alliances
  } catch (err: unknown) {
    const known = err as { data?: { message?: string }; message?: string }
    error.value = known.data?.message || known.message || 'No se pudieron cargar las alianzas.'
  } finally {
    loading.value = false
  }
}

const canReorder = computed(() => !query.value.trim() && typeFilter.value === 'all' && statusFilter.value === 'all')

const visible = computed(() => {
  const q = query.value.trim().toLowerCase()
  return alliances.value.filter((alliance) => {
    if (typeFilter.value !== 'all' && alliance.partner_type !== typeFilter.value) return false
    if (statusFilter.value !== 'all' && alliance.status !== statusFilter.value) return false
    if (!q) return true
    return `${alliance.name} ${locationLine(alliance)}`.toLowerCase().includes(q)
  })
})

async function setStatus(alliance: AllianceRecord, status: AllianceStatus) {
  error.value = ''
  notice.value = ''
  try {
    const response = await $fetch<{ alliance: AllianceRecord }>(`/api/admin/alliances/${alliance.id}`, {
      method: 'PUT',
      headers: await authHeaders(),
      body: { ...alliance, status },
    })
    const index = alliances.value.findIndex(row => row.id === alliance.id)
    if (index >= 0) alliances.value[index] = response.alliance
    notice.value = status === 'published' ? 'Alianza publicada.' : 'Alianza retirada de la página pública.'
  } catch (err: unknown) {
    const known = err as { data?: { message?: string }; message?: string }
    error.value = known.data?.message || known.message || 'No se pudo actualizar el estado.'
  }
}

async function move(alliance: AllianceRecord, direction: -1 | 1) {
  const index = alliances.value.findIndex(row => row.id === alliance.id)
  const next = index + direction
  if (index < 0 || next < 0 || next >= alliances.value.length) return
  const copy = [...alliances.value]
  const [row] = copy.splice(index, 1)
  copy.splice(next, 0, row)
  alliances.value = copy
  try {
    await $fetch('/api/admin/alliances/reorder', {
      method: 'POST',
      headers: await authHeaders(),
      body: { ids: copy.map(item => item.id) },
    })
  } catch (err: unknown) {
    const known = err as { data?: { message?: string }; message?: string }
    error.value = known.data?.message || known.message || 'No se pudo guardar el orden.'
    await load()
  }
}

async function confirmDelete() {
  const alliance = pendingDelete.value
  if (!alliance) return
  error.value = ''
  try {
    await $fetch(`/api/admin/alliances/${alliance.id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    alliances.value = alliances.value.filter(row => row.id !== alliance.id)
    notice.value = `${alliance.name} se eliminó.`
    pendingDelete.value = null
  } catch (err: unknown) {
    const known = err as { data?: { message?: string }; message?: string }
    error.value = known.data?.message || known.message || 'No se pudo eliminar la alianza.'
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <MemberStaffPageHeader title="Alianzas" subtitle="Gestiona las alianzas estratégicas de Niik Skate.">
      <template #actions>
        <NuxtLink to="/member/admin/alliances/new" class="px-4 py-2 rounded-xl bg-acid text-charcoal text-sm font-bold">
          + Añadir alianza
        </NuxtLink>
      </template>
      <div class="grid gap-3 md:grid-cols-[1fr_14rem_12rem]">
        <input
          v-model="query"
          type="search"
          placeholder="Buscar por nombre o ubicación"
          class="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm text-white"
        >
        <select v-model="typeFilter" class="px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm">
          <option value="all">Todos los tipos</option>
          <option v-for="type in PARTNER_TYPES" :key="type" :value="type">{{ partnerTypeLabel(type, true) }}</option>
        </select>
        <select v-model="statusFilter" class="px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm">
          <option value="all">Todos los estados</option>
          <option value="draft">Borrador</option>
          <option value="published">Publicada</option>
          <option value="unpublished">No publicada</option>
        </select>
      </div>
    </MemberStaffPageHeader>

    <div class="max-w-7xl mx-auto px-4 py-6 space-y-4">
      <p v-if="error" class="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{{ error }}</p>
      <p v-if="notice" class="rounded-xl border border-acid/40 bg-acid/10 px-4 py-3 text-sm text-acid">{{ notice }}</p>

      <p v-if="loading" class="text-sm text-gray-500">Cargando alianzas…</p>

      <div v-else-if="!alliances.length && !error" class="rounded-2xl border border-gray-800 bg-gray-900 px-6 py-12 text-center">
        <h2 class="text-lg font-bold">Todavía no hay alianzas</h2>
        <p class="mt-2 text-sm text-gray-500">Añade la primera alianza para publicarla en la página pública.</p>
        <NuxtLink to="/member/admin/alliances/new" class="inline-flex mt-5 px-4 py-2 rounded-xl bg-acid text-charcoal text-sm font-bold">
          + Añadir alianza
        </NuxtLink>
      </div>

      <div v-else class="space-y-3">
        <article
          v-for="alliance in visible"
          :key="alliance.id"
          class="flex flex-col gap-4 rounded-2xl border border-gray-800 bg-gray-900 p-4 sm:flex-row sm:items-center"
        >
          <div class="w-14 h-14 rounded-2xl bg-gray-800 border border-gray-700 overflow-hidden shrink-0 flex items-center justify-center">
            <img v-if="alliance.logo_image_url" :src="alliance.logo_image_url" :alt="alliance.name" class="w-full h-full object-contain">
            <span v-else class="text-xs font-bold text-gray-500">{{ alliance.name.slice(0, 2).toUpperCase() }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <h2 class="font-bold truncate">{{ alliance.name }}</h2>
            <p class="text-sm text-gray-500 truncate">{{ locationLine(alliance) || 'Sin ubicación' }}</p>
            <p class="mt-1 text-xs text-gray-400">
              {{ partnerTypeLabel(alliance.partner_type, true) }}
              <span v-if="alliance.founding_partner"> · Socio educativo fundador</span>
            </p>
          </div>
          <span class="text-xs font-bold uppercase tracking-wide text-acid">{{ statusLabel(alliance.status, true) }}</span>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="px-2 py-1 rounded-lg border border-gray-700 text-xs" :disabled="!canReorder || alliances.findIndex(row => row.id === alliance.id) === 0" @click="move(alliance, -1)">Subir</button>
            <button type="button" class="px-2 py-1 rounded-lg border border-gray-700 text-xs" :disabled="!canReorder || alliances.findIndex(row => row.id === alliance.id) === alliances.length - 1" @click="move(alliance, 1)">Bajar</button>
            <NuxtLink :to="`/member/admin/alliances/${alliance.id}`" class="px-2 py-1 rounded-lg border border-gray-700 text-xs">Editar</NuxtLink>
            <NuxtLink :to="`/alianzas/${alliance.slug}?preview=1`" class="px-2 py-1 rounded-lg border border-gray-700 text-xs" target="_blank">Vista previa</NuxtLink>
            <button
              v-if="alliance.status !== 'published'"
              type="button"
              class="px-2 py-1 rounded-lg bg-acid text-charcoal text-xs font-bold"
              @click="setStatus(alliance, 'published')"
            >
              Publicar
            </button>
            <button
              v-else
              type="button"
              class="px-2 py-1 rounded-lg border border-gray-700 text-xs"
              @click="setStatus(alliance, 'unpublished')"
            >
              Retirar
            </button>
            <button type="button" class="px-2 py-1 rounded-lg border border-red-500/40 text-xs text-red-200" @click="pendingDelete = alliance">
              Eliminar
            </button>
          </div>
        </article>
        <p v-if="alliances.length && !visible.length" class="text-sm text-gray-500">Ninguna alianza coincide con la búsqueda.</p>
      </div>
    </div>

    <div v-if="pendingDelete" class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" @click.self="pendingDelete = null">
      <div class="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6">
        <h2 class="text-lg font-bold">Eliminar alianza</h2>
        <p class="mt-2 text-sm text-gray-400">
          Se eliminará {{ pendingDelete.name }}, sus áreas de contribución y las imágenes subidas para esta alianza. Esta acción no se puede deshacer.
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="px-4 py-2 rounded-xl border border-gray-700 text-sm" @click="pendingDelete = null">Cancelar</button>
          <button type="button" class="px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-bold" @click="confirmDelete">Eliminar</button>
        </div>
      </div>
    </div>
  </div>
</template>
