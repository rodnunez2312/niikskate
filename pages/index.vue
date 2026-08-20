<script setup lang="ts">
definePageMeta({ layout: 'public' })

import { seasonStatusLabel } from '~/utils/programSeasons'

const { language } = useI18n()
const es = computed(() => language.value === 'es')
const { isAdmin } = useSiteProfile()
const { seasons: seasonCatalog, refresh: refreshSeasons, removeSeason } = useProgramSeasons()
const router = useRouter()

const addSeasonOpen = ref(false)
const removingSeasonSlug = ref('')
const seasonRemoveError = ref('')

const seasons = computed(() =>
  seasonCatalog.value.map(s => ({
    slug: s.slug,
    icon: s.icon,
    name: es.value ? s.name.es : s.name.en,
    dates: es.value ? s.dates.es : s.dates.en,
    status: seasonStatusLabel(s.status, es.value),
    statusKey: s.status,
    href: `/temporadas/${s.slug}`,
  })),
)

const onSeasonCreated = async (season: { slug: string }) => {
  addSeasonOpen.value = false
  await refreshSeasons()
  await router.push(`/temporadas/${season.slug}`)
}

const confirmRemoveSeason = async (row: { slug: string; name: string }) => {
  const ok = window.confirm(
    es.value
      ? `¿Quitar “${row.name}”? También desaparecerá del calendario.`
      : `Remove “${row.name}”? It will also disappear from the calendar.`,
  )
  if (!ok) return
  removingSeasonSlug.value = row.slug
  seasonRemoveError.value = ''
  try {
    await removeSeason(row.slug)
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }; message?: string }
    seasonRemoveError.value = err?.data?.message || err?.message || 'Error'
  } finally {
    removingSeasonSlug.value = ''
  }
}

const donateAmounts = [100, 250, 500, 1000]
const selectedDonate = ref(250)
const customDonate = ref('')

const donateTotal = computed(() => {
  const custom = Number(customDonate.value)
  if (customDonate.value && !Number.isNaN(custom) && custom > 0) return custom
  return selectedDonate.value
})

function selectDonate(amount: number) {
  selectedDonate.value = amount
  customDonate.value = ''
}

const pillars = computed(() => [
  {
    n: '01',
    title: es.value ? 'Exposición' : 'Exposure',
    body: es.value
      ? 'El patinador sube a la tabla — a menudo por primera vez. Encuentra un reto real en un entorno seguro y apoyado.'
      : 'Kids step on a board — often for the first time. They face real challenge in a low-stakes, supportive space.',
  },
  {
    n: '02',
    title: es.value ? 'Habilidades mentales' : 'Mental skills',
    body: es.value
      ? 'Respiración, self-talk y reframing junto a ollies y drops. Aprenden a manejar miedo, frustración y fallo en tiempo real.'
      : 'Breathing, self-talk, and reframing alongside ollies and drops. They learn to manage fear, frustration, and failure in real time.',
  },
  {
    n: '03',
    title: es.value ? 'Competencia' : 'Competence',
    body: es.value
      ? 'Con repetición y coaching ganan skills reales. Aterrizar un truco después de 50 caídas cambia cómo ven el esfuerzo.'
      : 'Through repetition and coaching they earn real skills. Landing a trick after 50 falls rewires how they think about effort.',
  },
  {
    n: '04',
    title: es.value ? 'Confianza' : 'Confidence',
    body: es.value
      ? 'La competencia genera confianza. Empiezan a creer que pueden hacer cosas difíciles — porque lo demostraron.'
      : 'Competence breeds confidence. They start to believe they can do hard things — because they proved it.',
  },
  {
    n: '05',
    title: es.value ? 'Resiliencia' : 'Resilience',
    body: es.value
      ? 'Las skills mentales de la tabla se llevan a la escuela, amistades y la vida. Eso es el Método Niik.'
      : 'Mental skills from the board transfer to school, friendships, and life. That’s the Niik Method.',
  },
])

const impactStats = computed(() => [
  {
    value: '92%',
    label: es.value ? 'Se sienten más resilientes' : 'Feel more resilient',
  },
  {
    value: '88%',
    label: es.value ? 'Más confianza en la tabla' : 'More confident on the board',
  },
  {
    value: '95%',
    label: es.value ? 'Sienten que pertenecen' : 'Felt they belonged',
  },
  {
    value: '90%',
    label: es.value ? 'Los coaches de verdad cuidan' : 'Coaches truly cared',
  },
])

const parentQuotes = computed(() => [
  {
    quote: es.value
      ? 'La paciencia y el ánimo de los coaches es increíble. Mi hijo ganó mucha confianza. No puedo agradecerles lo suficiente.'
      : 'The coaching staff’s patience and kindness is unbelievable. My son has grown so much confidence. We can’t thank you enough.',
  },
  {
    quote: es.value
      ? 'Es el primer deporte al que llega emocionado cada semana. Ya convenció a su hermano de unirse la próxima temporada.'
      : 'This was the first sport he’s ever been excited to go to every week. He talked his brother into joining next season.',
  },
  {
    quote: es.value
      ? 'Nuestra hija ahora dice “hay que ser resiliente” cuando algo se pone difícil. Tiene cinco años.'
      : 'Our daughter now says “you need to be resilient” when something gets hard. She’s five.',
  },
])

type Collaborator = {
  id: string
  name: string
  logo: string
  url?: string | null
  tone?: string
}

const { data: collaboratorsData } = await useFetch<{ collaborators: Collaborator[] }>(
  '/data/collaborators.json',
  { default: () => ({ collaborators: [] }) },
)

const communityDecks = computed(() => collaboratorsData.value?.collaborators || [])

const quoteIndex = ref(0)

function nextQuote() {
  quoteIndex.value = (quoteIndex.value + 1) % parentQuotes.value.length
}

function prevQuote() {
  quoteIndex.value = (quoteIndex.value - 1 + parentQuotes.value.length) % parentQuotes.value.length
}

watch(parentQuotes, () => {
  quoteIndex.value = 0
})
</script>

<template>
  <div class="bg-black text-white">
    <!-- Section 1: Hero video / image -->
    <section class="relative min-h-[88vh] flex items-end overflow-hidden">
      <div class="absolute inset-0">
        <img
          src="/Niik_StainedGlass.png"
          alt=""
          class="absolute inset-0 w-full h-full object-cover object-center scale-105 opacity-55"
        />
        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
        <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.65)_100%)]" />
      </div>

      <div class="relative w-full max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-24 pt-28">
        <p class="text-[11px] sm:text-xs font-bold uppercase tracking-[0.28em] text-gold-400 mb-4 animate-[fadeUp_0.7s_ease-out_both]">
          {{ es ? 'Academia de skate' : 'Skate academy' }}
        </p>
        <h1 class="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[0.95] mb-5 animate-[fadeUp_0.8s_ease-out_0.08s_both]">
          <span class="text-gold-400">Niik</span>Skate
        </h1>
        <p class="text-xl sm:text-2xl lg:text-3xl font-semibold text-white/90 max-w-2xl leading-snug animate-[fadeUp_0.8s_ease-out_0.16s_both]">
          {{
            es
              ? 'Resiliencia + Progresion + Diversion'
              : 'Resilience + Progression + Fun'
          }}
        </p>
        <p class="mt-4 text-base sm:text-lg text-gray-300 max-w-xl animate-[fadeUp_0.8s_ease-out_0.24s_both]">
          {{
            es
              ? 'Enseñamos skills de vida a través del desarrollo y la exposición al skateboarding.'
              : 'Teaching life skills through the development and exposure of skateboarding.'
          }}
        </p>
        <div class="mt-8 flex flex-wrap gap-3 animate-[fadeUp_0.8s_ease-out_0.32s_both]">
          <a
            href="#schedule"
            class="px-6 py-3 rounded-xl bg-gold-400 text-black font-bold hover:bg-gold-300 transition-colors"
          >
            {{ es ? 'Ver temporada' : 'See the season' }}
          </a>
          <NuxtLink
            to="/classes"
            class="px-6 py-3 rounded-xl border border-white/25 text-white font-bold hover:bg-white/5 transition-colors"
          >
            {{ es ? 'Clases' : 'Classes' }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Section 2: Motivational line + season schedule -->
    <section id="schedule" class="border-t border-white/10">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <p class="text-2xl sm:text-3xl lg:text-4xl font-black text-center max-w-3xl mx-auto leading-tight text-white">
          {{
            es
              ? 'Caer es parte del truco. Volver a intentarlo es lo que cuenta.'
              : 'Falling is part of the trick. Getting up is the Niik Method.'
          }}
        </p>

        <div class="mt-14">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <h2 class="text-xs font-bold uppercase tracking-[0.22em] text-gold-400 text-center sm:text-left">
              {{ es ? 'Temporadas del programa' : 'Program seasons' }}
            </h2>
            <button
              v-if="isAdmin"
              type="button"
              class="self-center sm:self-auto px-4 py-2.5 rounded-full font-semibold text-sm text-white bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400"
              @click="addSeasonOpen = true"
            >
              + {{ es ? 'Añadir temporada' : 'Add season' }}
            </button>
          </div>
          <p v-if="isAdmin && seasonRemoveError" class="text-sm text-red-300 mb-3">{{ seasonRemoveError }}</p>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[560px] text-left border-collapse">
              <thead>
                <tr class="border-b border-white/15 text-xs uppercase tracking-wider text-gray-500">
                  <th class="py-3 pr-4 font-semibold">{{ es ? 'Temporada' : 'Season' }}</th>
                  <th class="py-3 pr-4 font-semibold">{{ es ? 'Fechas' : 'Dates' }}</th>
                  <th class="py-3 font-semibold">Mérida</th>
                  <th v-if="isAdmin" class="py-3 w-12" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in seasons"
                  :key="row.slug"
                  class="border-b border-white/10 text-sm sm:text-base"
                >
                  <td class="py-4 pr-4 font-bold text-white">
                    <NuxtLink :to="`/temporadas/${row.slug}`" class="hover:text-gold-300 transition-colors">
                      <span class="mr-1.5" aria-hidden="true">{{ row.icon }}</span>
                      {{ row.name }}
                    </NuxtLink>
                  </td>
                  <td class="py-4 pr-4 text-gray-300">{{ row.dates }}</td>
                  <td class="py-4 font-semibold">
                    <NuxtLink
                      v-if="row.statusKey === 'enrolling'"
                      :to="row.href"
                      class="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-teal-700 text-white text-xs font-bold hover:bg-teal-600"
                    >
                      {{ es ? 'Inscribirse' : 'Register' }}
                    </NuxtLink>
                    <span v-else class="text-gray-400 text-sm">{{ row.status }}</span>
                  </td>
                  <td v-if="isAdmin" class="py-4 pl-2 text-right">
                    <button
                      type="button"
                      class="inline-flex p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/50 disabled:opacity-40"
                      :disabled="removingSeasonSlug === row.slug"
                      :title="es ? 'Quitar temporada' : 'Remove season'"
                      :aria-label="es ? 'Quitar temporada' : 'Remove season'"
                      @click="confirmRemoveSeason(row)"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <details class="mt-8 max-w-2xl mx-auto text-left">
            <summary class="cursor-pointer text-center text-sm font-bold text-gold-400 hover:text-gold-300">
              {{ es ? 'Cómo funciona' : 'How this works' }}
            </summary>
            <div class="mt-4 rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-gray-300 leading-relaxed space-y-3">
              <p>
                {{
                  es
                    ? 'Cada temporada puede ser de 4 semanas (8 clases $1,000 o 12 clases $1,500) o 8 semanas (16 clases $2,000 o 24 clases $3,000). También hay clase suelta. Entrenamos martes, jueves y sábado en Skatepark La Plancha, Mérida.'
                    : 'Each season can run 4 weeks (8 classes $1,000 or 12 classes $1,500) or 8 weeks (16 classes $2,000 or 24 classes $3,000). Single classes are also available. We train Tuesday, Thursday, and Saturday at Skatepark La Plancha, Mérida.'
                }}
              </p>
              <p>
                {{
                  es
                    ? 'Cuando abren inscripciones, elige la temporada, revisa las clases disponibles (edad y nivel) e inscribe a tu patinador. Los lugares se llenan rápido — conviene registrarse temprano.'
                    : 'When registration opens, pick a season, review available classes (age and level), and enroll your skater. Spots fill quickly — register early.'
                }}
              </p>
              <p>
                {{
                  es
                    ? 'Descuentos automáticos al inscribir a 2 patinadores (hermanos o varios estudiantes): 10% cada uno; con 3 o más, 15% cada uno.'
                    : 'Automatic discounts when enrolling 2 skaters (siblings or multiple students): 10% each; with 3 or more, 15% each.'
                }}
              </p>
            </div>
          </details>
          <div class="mt-6 text-center">
            <NuxtLink to="/classes" class="inline-flex text-sm font-bold text-gray-400 hover:text-gold-300 underline underline-offset-4">
              {{ es ? 'Ver todas las clases publicadas →' : 'Browse all published classes →' }}
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <!-- Section 3: The problem -->
    <section id="problema" class="relative border-t border-white/10 overflow-hidden">
      <div class="absolute inset-0 bg-gradient-to-br from-flame-600/15 via-transparent to-gold-500/10 pointer-events-none" />
      <div class="relative max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.22em] text-flame-500 mb-4">
            {{ es ? 'El problema' : 'The problem' }}
          </p>
          <h2 class="text-3xl sm:text-4xl lg:text-5xl font-black leading-tight mb-6">
            {{
              es
                ? 'Los jóvenes enfrentan más presión — y menos herramientas para levantarse.'
                : 'Young people face more pressure — and fewer tools to get back up.'
            }}
          </h2>
        </div>
        <div class="space-y-4 text-gray-300 text-base sm:text-lg leading-relaxed">
          <p>
            {{
              es
                ? 'Ansiedad, miedo al fallo y la cultura del “todo o nada” llegan temprano. El skate ya enseña caída y reintento — nosotros lo hacemos intencional.'
                : 'Anxiety, fear of failure, and all-or-nothing culture show up early. Skate already teaches falling and trying again — we make that intentional.'
            }}
          </p>
          <p>
            {{
              es
                ? 'NiikSkate convierte cada sesión en práctica de resiliencia: exposición, skills mentales, competencia, confianza.'
                : 'NiikSkate turns every session into resilience practice: exposure, mental skills, competence, confidence.'
            }}
          </p>
        </div>
      </div>
    </section>

    <!-- Section 4: Donate -->
    <section id="donar" class="border-t border-white/10 bg-gradient-to-b from-gray-950 to-black">
      <div class="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-20 text-center">
        <p class="text-xs font-bold uppercase tracking-[0.22em] text-gold-400 mb-4">
          {{ es ? 'Donar' : 'Donate' }}
        </p>
        <h2 class="text-3xl sm:text-4xl font-black mb-4">
          {{ es ? 'Ayúdanos a seguir.' : 'Help us keep rolling.' }}
        </h2>
        <p class="text-gray-300 mb-8 max-w-xl mx-auto">
          {{
            es
              ? 'Cada peso apoya clínicas, becas y el Método Niik — resiliencia y salud mental a través del skate.'
              : 'Every dollar supports clinics, scholarships, and the Niik Method — resilience and mental health through skate.'
          }}
        </p>

        <div class="flex flex-wrap justify-center gap-2 mb-4">
          <button
            v-for="amount in donateAmounts"
            :key="amount"
            type="button"
            class="min-w-[4.5rem] px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors"
            :class="selectedDonate === amount && !customDonate
              ? 'bg-gold-400 text-black border-gold-400'
              : 'border-white/20 text-white hover:border-gold-400/60'"
            @click="selectDonate(amount)"
          >
            ${{ amount }}
          </button>
        </div>
        <div class="flex items-center justify-center gap-2 mb-6">
          <span class="text-gray-400 font-bold">$</span>
          <input
            v-model="customDonate"
            type="number"
            min="1"
            class="w-36 px-3 py-2.5 rounded-xl bg-gray-900 border border-white/15 text-white text-center font-semibold focus:outline-none focus:border-gold-400"
            :placeholder="es ? 'Otro' : 'Other'"
          />
        </div>
        <a
          :href="`mailto:hola@niikskate.com?subject=${encodeURIComponent(es ? 'Donación NiikSkate' : 'NiikSkate donation')}&body=${encodeURIComponent((es ? 'Quiero donar $' : 'I want to donate $') + donateTotal)}`"
          class="inline-flex px-8 py-3.5 rounded-xl bg-gold-400 text-black font-bold hover:bg-gold-300 transition-colors"
        >
          {{ es ? `Continuar — $${donateTotal}` : `Continue — $${donateTotal}` }}
        </a>
      </div>
    </section>

    <!-- Section 5: Free clinics -->
    <section id="clinics" class="border-t border-white/10">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
        <div>
          <p class="text-xs font-bold uppercase tracking-[0.22em] text-gold-400 mb-4">
            {{ es ? 'Clínicas gratis' : 'Free clinics' }}
          </p>
          <h2 class="text-3xl sm:text-4xl font-black mb-4 leading-tight">
            {{
              es
                ? 'Prueba el Método Niik sin costo.'
                : 'Try the Niik Method at no cost.'
            }}
          </h2>
          <p class="text-gray-300 text-lg mb-8 max-w-xl">
            {{
              es
                ? 'Sesiones abiertas para conocer coaches, la comunidad y cómo enseñamos a caer — y levantarse.'
                : 'Open sessions to meet coaches, the community, and how we teach falling — and getting back up.'
            }}
          </p>
          <NuxtLink
            to="/classes"
            class="inline-flex px-6 py-3 rounded-xl border border-gold-400 text-gold-400 font-bold hover:bg-gold-400 hover:text-black transition-colors"
          >
            {{ es ? 'Ver clínicas' : 'View clinics' }}
          </NuxtLink>
        </div>
        <div class="relative aspect-[4/3] rounded-2xl overflow-hidden border border-white/10">
          <img src="/Niik_StainedGlass.png" alt="" class="absolute inset-0 w-full h-full object-cover opacity-70" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <p class="absolute bottom-5 left-5 right-5 text-sm font-semibold text-white/90">
            {{ es ? 'Próximas clínicas en el calendario de clases.' : 'Upcoming clinics on the class calendar.' }}
          </p>
        </div>
      </div>
    </section>

    <!-- Section 6: Summer camps -->
    <section id="camps" class="border-t border-white/10 bg-gray-950/80">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
        <p class="text-xs font-bold uppercase tracking-[0.22em] text-gold-400 mb-3">
          {{ es ? 'Verano' : 'Summer' }}
        </p>
        <h2 class="text-3xl sm:text-5xl font-black mb-4 max-w-3xl leading-tight">
          {{ es ? '¡Inscríbete a los summer camps!' : 'Register for summer camps!' }}
        </h2>
        <p class="text-gray-300 text-lg max-w-2xl mb-8">
          {{
            es
              ? 'Skate, skills mentales y mucha diversión. Camps de una semana para todos los niveles — del primer día al rider con experiencia.'
              : 'Skateboarding, mental skills, and a whole lot of fun. Week-long camps for every level — from first-timers to experienced riders.'
          }}
        </p>
        <NuxtLink
          to="/skate-programs"
          class="inline-flex px-7 py-3.5 rounded-xl bg-white text-black font-bold hover:bg-gold-300 transition-colors"
        >
          {{ es ? 'Ver camps' : 'View camps' }}
        </NuxtLink>
      </div>
    </section>

    <!-- Section 7: How Niik teaches — pillars -->
    <section id="metodo" class="border-t border-white/10">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <h2 class="text-3xl sm:text-4xl lg:text-5xl font-black max-w-4xl leading-tight mb-12 sm:mb-16">
          {{
            es
              ? 'CÓMO Niik Skate enseña resiliencia a través del SKATEBOARDING'
              : 'HOW Niik Skate teaches resilience through SKATEBOARDING'
          }}
        </h2>

        <ol class="space-y-10 sm:space-y-12">
          <li
            v-for="pillar in pillars"
            :key="pillar.n"
            class="grid sm:grid-cols-[5rem_1fr] gap-4 sm:gap-8 border-t border-white/10 pt-8"
          >
            <span class="text-3xl sm:text-4xl font-black text-gold-400/90 tabular-nums">{{ pillar.n }}</span>
            <div>
              <h3 class="text-xl sm:text-2xl font-black text-white mb-2">{{ pillar.title }}</h3>
              <p class="text-gray-300 text-base sm:text-lg leading-relaxed max-w-2xl">{{ pillar.body }}</p>
            </div>
          </li>
        </ol>

        <div class="mt-12">
          <NuxtLink to="/niik-method" class="text-sm font-bold text-gold-400 hover:text-gold-300 underline underline-offset-4">
            {{ es ? 'Conoce el Método Niik →' : 'Explore the Niik Method →' }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Section 8: Impact + parent interviews -->
    <section id="impacto" class="border-t border-white/10 bg-gradient-to-b from-black to-gray-950">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <p class="text-xs font-bold uppercase tracking-[0.22em] text-gold-400 mb-4">
          {{ es ? 'Reporte de impacto' : 'Student impact report' }}
        </p>
        <h2 class="text-3xl sm:text-4xl font-black mb-10 max-w-2xl">
          {{
            es
              ? 'Lo que dicen los datos — y las familias.'
              : 'What the numbers say — and what families feel.'
          }}
        </h2>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mb-16">
          <div v-for="stat in impactStats" :key="stat.label">
            <p class="text-4xl sm:text-5xl font-black text-gold-400 mb-2">{{ stat.value }}</p>
            <p class="text-sm text-gray-400 leading-snug">{{ stat.label }}</p>
          </div>
        </div>
        <p class="text-xs text-gray-500 mb-14">
          {{
            es
              ? '*Cifras ilustrativas — actualiza con tu encuesta real de alumnos.'
              : '*Illustrative figures — replace with your real student survey.'
          }}
        </p>

        <div class="border border-white/10 rounded-2xl bg-black/50 px-6 sm:px-10 py-10 min-h-[220px] flex flex-col justify-center">
          <div class="flex items-center justify-between gap-3 mb-6">
            <p class="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
              {{ es ? 'Padres nos cuentan' : 'Parents tell us' }}
            </p>
            <div class="flex gap-2">
              <button
                type="button"
                class="w-9 h-9 rounded-lg border border-white/15 text-white hover:border-gold-400/50"
                :aria-label="es ? 'Anterior' : 'Previous'"
                @click="prevQuote"
              >
                ←
              </button>
              <button
                type="button"
                class="w-9 h-9 rounded-lg border border-white/15 text-white hover:border-gold-400/50"
                :aria-label="es ? 'Siguiente' : 'Next'"
                @click="nextQuote"
              >
                →
              </button>
            </div>
          </div>
          <Transition name="quote-fade" mode="out-in">
            <blockquote :key="quoteIndex" class="text-xl sm:text-2xl font-medium text-white leading-relaxed">
              “{{ parentQuotes[quoteIndex]?.quote }}”
            </blockquote>
          </Transition>
          <div class="mt-8 flex gap-2">
            <button
              v-for="(_, i) in parentQuotes"
              :key="i"
              type="button"
              class="h-1.5 rounded-full transition-all"
              :class="i === quoteIndex ? 'w-8 bg-gold-400' : 'w-3 bg-white/20 hover:bg-white/40'"
              :aria-label="'Quote ' + (i + 1)"
              @click="quoteIndex = i"
            />
          </div>
        </div>
      </div>
    </section>

    <!-- Section 9: Community — those who help -->
    <section id="comunidad" class="border-t border-white/10 overflow-hidden">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-8 text-center">
        <p class="text-xs font-bold uppercase tracking-[0.22em] text-gold-400 mb-3">
          {{ es ? 'Comunidad' : 'Community' }}
        </p>
        <h2 class="text-3xl sm:text-4xl font-black mb-3">
          {{ es ? 'QUIENES NOS AYUDAN @ Niik Skate' : 'THOSE WHO HELP US @ Niik Skate' }}
        </h2>
        <p class="text-gray-400 max-w-xl mx-auto mb-10">
          {{
            es
              ? 'Partners, familias y riders que empujan la misión.'
              : 'Partners, families, and riders who push the mission forward.'
          }}
        </p>
      </div>

      <div class="relative pb-16 sm:pb-20">
        <div class="flex gap-5 w-max animate-deck-marquee hover:[animation-play-state:paused]">
          <div
            v-for="(deck, i) in [...communityDecks, ...communityDecks]"
            :key="deck.id + '-' + i"
            class="group relative w-36 sm:w-44 aspect-[8/22] shrink-0 transition-transform duration-300 hover:-translate-y-1"
          >
            <NuxtLink
              v-if="deck.url"
              :to="deck.url"
              class="absolute inset-0 z-10"
              :aria-label="deck.name"
            />
            <!-- Deck base -->
            <img
              src="/images/decks/blank-deck.svg"
              alt=""
              class="absolute inset-0 w-full h-full object-contain drop-shadow-2xl pointer-events-none"
            />
            <!-- Soft brand tint over wood -->
            <div
              class="absolute inset-[8%] rounded-[2rem] bg-gradient-to-b opacity-70 pointer-events-none"
              :class="deck.tone || 'from-white/10 to-black/50'"
            />
            <!-- Collaborator logo on top of deck -->
            <div class="absolute inset-0 flex flex-col items-center justify-center px-4 sm:px-5 pointer-events-none">
              <div
                class="w-[78%] aspect-square rounded-2xl bg-black/55 border border-white/10 backdrop-blur-[2px] flex items-center justify-center p-2.5 sm:p-3 shadow-lg transition-transform duration-300 group-hover:scale-105"
              >
                <img
                  :src="deck.logo"
                  :alt="deck.name"
                  class="w-full h-full object-contain"
                />
              </div>
              <p class="mt-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/85 text-center leading-tight">
                {{ deck.name }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="max-w-6xl mx-auto px-4 sm:px-6 pb-16 text-center">
        <NuxtLink to="/community" class="text-sm font-bold text-gold-400 hover:text-gold-300 underline underline-offset-4">
          {{ es ? 'Ver comunidad →' : 'See the community →' }}
        </NuxtLink>
      </div>
    </section>

    <!-- Soft CTA before footer -->
    <section class="border-t border-white/10">
      <div class="max-w-6xl mx-auto px-4 sm:px-6 py-14 flex flex-col sm:flex-row items-center justify-between gap-6">
        <p class="text-xl sm:text-2xl font-black text-center sm:text-left">
          {{ es ? '¿Listo para subirte a la tabla?' : 'Ready to jump on the board?' }}
        </p>
        <div class="flex flex-wrap justify-center gap-3">
          <NuxtLink to="/skate-programs" class="px-6 py-3 rounded-xl bg-gold-400 text-black font-bold hover:bg-gold-300">
            {{ es ? 'Programas' : 'Programs' }}
          </NuxtLink>
          <NuxtLink
            to="/auth/login?redirect=/member"
            class="px-6 py-3 rounded-xl border border-white/20 font-bold hover:bg-white/5"
          >
            {{ es ? 'App de miembros' : 'Member app' }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <AdminSeasonCreateModal
      :open="addSeasonOpen"
      @close="addSeasonOpen = false"
      @created="onSeasonCreated"
    />
  </div>
</template>

<style scoped>
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes deck-marquee {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}

.animate-deck-marquee {
  animation: deck-marquee 42s linear infinite;
}

.quote-fade-enter-active,
.quote-fade-leave-active {
  transition: opacity 0.45s ease, transform 0.45s ease;
}
.quote-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.quote-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
