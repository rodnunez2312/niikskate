<script setup lang="ts">
import { foundingConkalAlliance, type AllianceRecord } from '~/utils/alliances'

definePageMeta({ layout: 'public' })

const route = useRoute()
const slug = computed(() => String(route.params.slug || ''))
const preview = computed(() => route.query.preview === '1')
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const previewAlliance = ref<AllianceRecord | null>(null)
const previewState = ref<'loading' | 'ready' | 'denied'>('loading')

const { data, error } = await useAsyncData(
  () => `alliance-${slug.value}`,
  async () => {
    if (preview.value) return null
    return $fetch<{ alliance: AllianceRecord }>(`/api/alliances/${slug.value}`)
  },
  { watch: [slug, preview] },
)

const alliance = computed(() => preview.value ? previewAlliance.value : data.value?.alliance || null)

useHead(() => ({
  title: alliance.value ? `${alliance.value.name} · Niik` : 'Alianzas · Niik',
}))

onMounted(async () => {
  if (!preview.value) return
  const client = useSupabaseClient()
  const { data: session } = await client.auth.getSession()
  const token = session.session?.access_token
  if (!token) {
    previewState.value = 'denied'
    return
  }
  try {
    const response = await $fetch<{ alliance: AllianceRecord }>('/api/admin/alliances/by-slug', {
      query: { slug: slug.value },
      headers: { Authorization: `Bearer ${token}` },
    })
    previewAlliance.value = response.alliance
    previewState.value = 'ready'
  } catch {
    if (slug.value === 'conkal-school') {
      previewAlliance.value = foundingConkalAlliance()
      previewState.value = 'ready'
      return
    }
    previewState.value = 'denied'
  }
})
</script>

<template>
  <div class="bg-cream text-charcoal">
    <section class="bg-charcoal text-cream">
      <div class="max-w-5xl mx-auto px-5 sm:px-6 pt-16 pb-10">
        <NuxtLink to="/alianzas" class="text-sm font-bold text-acid link-underline">
          {{ es ? 'Alianzas' : 'Partnerships' }}
        </NuxtLink>
        <p v-if="preview" class="mt-4 inline-flex px-3 py-1 rounded-full bg-acid text-charcoal text-xs font-bold">
          {{ es ? 'Vista previa' : 'Preview' }}
        </p>
      </div>
    </section>

    <section class="section-y max-w-5xl mx-auto px-5 sm:px-6">
      <p v-if="preview && previewState === 'loading'" class="text-charcoal/60">
        {{ es ? 'Cargando vista previa…' : 'Loading preview…' }}
      </p>
      <PublicAllianceProfile v-else-if="alliance" :alliance="alliance" />
      <div v-else class="rounded-3xl border border-cream-200 bg-cream-50 p-8">
        <h1 class="t-h3">{{ es ? 'Alianza no disponible' : 'Partnership unavailable' }}</h1>
        <p class="mt-3 text-charcoal/70">
          {{ preview && previewState === 'denied'
            ? (es ? 'Esta vista previa es solo para administradores.' : 'This preview is for administrators.')
            : (es ? 'Esta alianza no está publicada.' : 'This partnership is not published.') }}
        </p>
        <p v-if="error" class="sr-only">{{ error }}</p>
      </div>
    </section>
  </div>
</template>
