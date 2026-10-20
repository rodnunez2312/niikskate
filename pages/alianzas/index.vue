<script setup lang="ts">
import { CONTACT_EMAIL } from '~/utils/contact'
import { foundingConkalAlliance, type AllianceRecord } from '~/utils/alliances'

definePageMeta({ layout: 'public' })

const { language } = useI18n()
const es = computed(() => language.value === 'es')

const ALLY_EMAIL = CONTACT_EMAIL

const allyAudiences = computed(() => [
  {
    title: es.value ? 'Escuelas' : 'Schools',
    text: es.value
      ? 'Lleva el Método Niik al horario escolar o como actividad extraescolar, adaptado a tu grupo.'
      : 'Bring the Niik Method into the school day or as an after-school activity, shaped around your students.',
  },
  {
    title: es.value ? 'Organizaciones comunitarias' : 'Community organizations',
    text: es.value
      ? 'Abre un espacio compartido para clínicas, eventos y programas con niñas, niños y jóvenes.'
      : 'Open a shared space for clinics, events, and programs with children and young people.',
  },
  {
    title: es.value ? 'Aliados y patrocinadores' : 'Supporters',
    text: es.value
      ? 'Suma recursos, un lugar o una habilidad para que más estudiantes puedan entrenar, crear y pertenecer.'
      : 'Contribute a place, a skill, or resources so more students can train, create, and belong.',
  },
])

const allyMailto = computed(() =>
  `mailto:${ALLY_EMAIL}?subject=${encodeURIComponent(es.value ? 'Quiero ser aliado Niik' : 'I want to become a Niik partner')}`,
)

const { data: alliancePayload } = await useAsyncData('public-alliances', async () => {
  try {
    return await $fetch<{ alliances: AllianceRecord[]; missing: boolean }>('/api/alliances')
  } catch {
    return { alliances: [] as AllianceRecord[], missing: true }
  }
})

const publishedAlliances = computed(() => {
  const rows = alliancePayload.value?.alliances || []
  if (rows.length) return rows
  if (alliancePayload.value?.missing) return [foundingConkalAlliance()]
  return []
})
</script>

<template>
  <div class="bg-cream text-charcoal">
    <section class="bg-charcoal text-cream">
      <div class="max-w-5xl mx-auto px-5 sm:px-6 pt-20 pb-20 sm:pt-28 sm:pb-24">
        <p class="t-eyebrow text-acid">
          {{ es ? 'Alianzas' : 'Strategic Partners' }}
        </p>
        <h1 class="t-display mt-4 max-w-4xl">
          {{ es ? 'Juntos construimos espacios para crecer.' : 'Together we build spaces to grow.' }}
        </h1>
        <p class="t-lead mt-6 text-cream/80 max-w-3xl">
          {{ es
            ? 'Niik trabaja con instituciones educativas y aliados estratégicos para conectar el skateboarding, el aprendizaje, el arte y la comunidad.'
            : 'Niik works with schools and strategic partners to connect skateboarding, learning, art, and community.' }}
        </p>
      </div>
    </section>

    <section class="section-y max-w-6xl mx-auto px-5 sm:px-6">
      <PublicAllianceCarousel v-if="publishedAlliances.length" :alliances="publishedAlliances" />
      <p v-else class="text-charcoal/60">
        {{ es ? 'Las alianzas publicadas aparecerán aquí.' : 'Published partnerships will appear here.' }}
      </p>
    </section>

    <section class="section-y bg-cream-50 border-t border-cream-200">
      <div class="max-w-5xl mx-auto px-5 sm:px-6">
        <h2 class="t-h2">
          {{ es ? 'Conviértete en aliado Niik' : 'Become a Niik partner' }}
        </h2>
        <p class="t-lead mt-4 text-charcoal/75 max-w-2xl">
          {{ es
            ? 'Escuelas, organizaciones comunitarias y personas que quieran apoyar pueden construir el siguiente espacio con nosotros.'
            : 'Schools, community organizations, and people who want to support the work can build the next space with us.' }}
        </p>
        <div class="mt-10 grid md:grid-cols-3 gap-4">
          <article
            v-for="item in allyAudiences"
            :key="item.title"
            class="card-lift rounded-2xl border border-cream-200 bg-cream p-6"
          >
            <h3 class="font-display text-lg font-extrabold">{{ item.title }}</h3>
            <p class="mt-2 text-sm text-charcoal/75 leading-relaxed">{{ item.text }}</p>
          </article>
        </div>
        <a :href="allyMailto" class="btn-lime mt-10">
          {{ es ? 'Escríbenos' : 'Write to us' }}
        </a>
      </div>
    </section>
  </div>
</template>
