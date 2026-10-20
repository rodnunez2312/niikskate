<script setup lang="ts">
import { CONTACT_EMAIL } from '~/utils/contact'
import { localizeNiikMethodStages } from '~/utils/niikMethod'

definePageMeta({ layout: 'public' })

const { language } = useI18n()
const es = computed(() => language.value === 'es')

/** Swap for real Niik photos (coaches, riders, the park) before launch. */
const HERO_IMAGE = '/Niik_StainedGlass.png'
const CLINIC_IMAGE = '/Niik_StainedGlass.png'

const siteSections = computed(() => [
  {
    to: '/niik-method',
    title: es.value ? 'El Método Niik' : 'The Niik Method',
    text: es.value ? 'Nuestro enfoque educativo' : 'Our educational approach',
    border: 'border-charcoal hover:bg-charcoal/5',
  },
  {
    to: '/skate-programs',
    title: es.value ? 'Programas' : 'Programs',
    text: es.value ? 'Clases, clínicas y camps' : 'Classes, clinics, and camps',
    border: 'border-acid-600 hover:bg-acid/20',
  },
  {
    to: '/alianzas',
    title: es.value ? 'Alianzas' : 'Partnerships',
    text: es.value ? 'Educación y comunidad' : 'Education and community',
    border: 'border-sage hover:bg-sage-100',
  },
  {
    to: '/#impacto',
    title: es.value ? 'Historias reales' : 'Real stories',
    text: es.value ? 'Progreso de nuestros riders' : 'Our riders’ progress',
    border: 'border-flame-500 hover:bg-flame-500/5',
  },
])

const methodStages = computed(() => localizeNiikMethodStages(es.value))

const safetyPoints = computed(() => [
  {
    icon: '⛑️',
    title: es.value ? 'Equipo de protección obligatorio' : 'Safety gear required',
    text: es.value
      ? 'Casco y protecciones en cada sesión, sin excepciones.'
      : 'Helmet and pads at every session, no exceptions.',
  },
  {
    icon: '👥',
    title: es.value ? 'Grupos por edad y nivel' : 'Grouped by age and level',
    text: es.value
      ? 'Cupos limitados para que cada patinador reciba atención del coach.'
      : 'Limited spots so every skater gets real coach attention.',
  },
  {
    icon: '🪜',
    title: es.value ? 'Progresión paso a paso' : 'Step-by-step progression',
    text: es.value
      ? 'Cada reto se adapta al nivel; nadie se salta etapas.'
      : 'Every challenge fits the skater’s level; nobody skips steps.',
  },
  {
    icon: '🤸',
    title: es.value ? 'Aprender a caer' : 'Learning to fall',
    text: es.value
      ? 'Caídas controladas y reglas del skatepark desde el primer día.'
      : 'Controlled falls and skatepark rules from day one.',
  },
])

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
  <div class="bg-cream text-charcoal">
    <!-- Hero -->
    <section class="relative isolate min-h-[88vh] flex items-end overflow-hidden bg-charcoal text-cream">
      <PublicPhoto
        :src="HERO_IMAGE"
        alt=""
        priority
        sizes="xs:100vw sm:100vw md:100vw lg:100vw xl:100vw xxl:100vw"
        class="absolute inset-0 -z-10 w-full h-full object-cover object-center opacity-55"
      />
      <div class="absolute inset-0 -z-10 bg-gradient-to-t from-charcoal via-charcoal/60 to-charcoal/20" />

      <div class="w-full max-w-6xl mx-auto px-5 sm:px-6 pb-20 sm:pb-28 pt-32">
        <p class="font-display text-base sm:text-lg font-black tracking-tight mb-5 animate-[fadeUp_0.7s_ease-out_both]">
          <span class="text-acid">Niik</span>Skate
        </p>
        <h1 class="t-display max-w-4xl animate-[fadeUp_0.8s_ease-out_0.08s_both]">
          {{ es ? 'Más que skateboarding.' : 'More than skateboarding.' }}
          <span class="block text-acid mt-2">
            {{ es ? 'Habilidades para la vida.' : 'Skills for life.' }}
          </span>
        </h1>
        <p class="t-lead mt-6 text-cream/85 max-w-xl animate-[fadeUp_0.8s_ease-out_0.24s_both]">
          {{
            es
              ? 'Desarrollamos confianza, resiliencia y comunidad a través del skate.'
              : 'We build confidence, resilience, and community through skateboarding.'
          }}
        </p>
        <div class="mt-10 flex flex-wrap gap-3 animate-[fadeUp_0.8s_ease-out_0.32s_both]">
          <NuxtLink to="/skate-programs" class="btn-lime">
            {{ es ? 'Explorar programas' : 'Explore programs' }}
          </NuxtLink>
          <NuxtLink to="/alianzas" class="btn-outline-light">
            {{ es ? 'Alianzas educativas' : 'Educational partnerships' }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Site sections -->
    <section id="secciones" class="section-y">
      <div class="max-w-6xl mx-auto px-5 sm:px-6">
        <p class="t-h2 text-center max-w-3xl mx-auto">
          {{
            es
              ? 'Caer es parte del truco. Volver a intentarlo es lo que cuenta.'
              : 'Falling is part of the trick. Getting up is the Niik Method.'
          }}
        </p>

        <nav class="mt-14 sm:mt-16 max-w-4xl mx-auto" :aria-label="es ? 'Secciones del sitio' : 'Site sections'">
          <div class="grid sm:grid-cols-2 gap-4">
            <NuxtLink
              v-for="section in siteSections"
              :key="section.to"
              :to="section.to"
              class="card-lift group flex items-center justify-between gap-4 rounded-2xl border-2 bg-cream-50 px-6 py-5"
              :class="section.border"
            >
              <span class="min-w-0">
                <span class="block font-display text-xl font-extrabold">{{ section.title }}</span>
                <span class="block text-sm text-charcoal/70 mt-1">{{ section.text }}</span>
              </span>
              <span class="text-xl shrink-0 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true">→</span>
            </NuxtLink>
          </div>

          <NuxtLink
            to="/alianzas"
            class="card-lift mt-4 block rounded-2xl bg-charcoal text-cream px-6 py-6"
          >
            <span class="block t-eyebrow text-acid">
              {{ es ? 'Alianza educativa fundadora' : 'Founding educational partner' }}
            </span>
            <span class="block font-display text-xl font-extrabold mt-2">Conkal School × Niik Skate</span>
            <span class="block text-sm text-cream/75 mt-1">
              {{ es ? 'Una nueva oportunidad para unir skate, arte y educación.' : 'A new opportunity to bring together skateboarding, art, and education.' }}
            </span>
          </NuxtLink>
        </nav>
      </div>
    </section>

    <!-- The problem -->
    <section id="problema" class="section-y bg-cream-50 border-y border-cream-200">
      <div class="max-w-6xl mx-auto px-5 sm:px-6 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div>
          <p class="t-eyebrow text-flame-600 mb-4">
            {{ es ? 'El problema' : 'The problem' }}
          </p>
          <h2 class="t-h2">
            {{
              es
                ? 'Los jóvenes enfrentan más presión — y menos herramientas para levantarse.'
                : 'Young people face more pressure — and fewer tools to get back up.'
            }}
          </h2>
        </div>
        <div class="space-y-5 text-charcoal/80 t-lead">
          <p>
            {{
              es
                ? 'El skate enseña algo poderoso: caerse, adaptarse y volver a intentarlo. En NiikSkate, convertimos ese proceso en algo intencional.'
                : 'Skate teaches something powerful: falling, adapting, and trying again. At NiikSkate, we make that process intentional.'
            }}
          </p>
          <p>
            {{
              es
                ? 'Cada sesión desarrolla más que habilidades sobre la tabla: trabajamos resiliencia, manejo de la frustración, confianza y fortaleza mental a través de retos progresivos, herramientas mentales y experiencias reales de superación.'
                : 'Every session builds more than skills on the board: we work on resilience, handling frustration, confidence, and mental strength through progressive challenges, mental tools, and real experiences of getting back up.'
            }}
          </p>
          <p class="font-semibold text-charcoal">
            {{
              es
                ? 'No se trata de no caer. Se trata de aprender a levantarse.'
                : 'It is not about never falling. It is about learning to get back up.'
            }}
          </p>
        </div>
      </div>
    </section>

    <!-- Method progression -->
    <section id="metodo" class="section-y bg-charcoal text-cream">
      <div class="max-w-6xl mx-auto px-5 sm:px-6">
        <p class="t-eyebrow text-acid mb-4">{{ es ? 'El Método Niik' : 'The Niik Method' }}</p>
        <h2 class="t-h2 max-w-3xl">
          {{ es ? 'Cinco etapas. Un ciclo que se repite en cada truco.' : 'Five stages. A cycle that repeats with every trick.' }}
        </h2>

        <ol class="mt-14 grid gap-8 md:grid-cols-5 md:gap-4">
          <li
            v-for="(stage, i) in methodStages"
            :key="stage.name"
            class="relative pl-16 md:pl-0"
          >
            <span
              v-if="i < methodStages.length - 1"
              class="absolute left-[1.45rem] top-12 bottom-[-2rem] w-0.5 bg-acid/40 md:left-12 md:right-[-1rem] md:top-6 md:bottom-auto md:w-auto md:h-0.5"
              aria-hidden="true"
            />
            <span
              class="absolute left-0 top-0 md:static w-12 h-12 rounded-full bg-acid text-charcoal font-display font-black flex items-center justify-center tabular-nums"
              aria-hidden="true"
            >
              {{ String(i + 1).padStart(2, '0') }}
            </span>
            <h3 class="t-h3 md:mt-5">
              <span class="mr-1.5" aria-hidden="true">{{ stage.icon }}</span>{{ stage.name }}
            </h3>
            <p class="mt-2 text-sm text-cream/75 leading-relaxed">{{ stage.board }}</p>
            <p class="mt-2 text-sm text-acid leading-relaxed">→ {{ stage.life }}</p>
          </li>
        </ol>

        <div class="mt-14">
          <NuxtLink to="/niik-method" class="btn-outline-light">
            {{ es ? 'Conoce el Método Niik' : 'Explore the Niik Method' }} →
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Safety -->
    <section id="seguridad" class="section-y">
      <div class="max-w-6xl mx-auto px-5 sm:px-6">
        <p class="t-eyebrow text-sage-700 mb-4">{{ es ? 'Seguridad' : 'Safety' }}</p>
        <h2 class="t-h2 max-w-3xl">
          {{ es ? 'Retos reales, en un entorno cuidado.' : 'Real challenges, in a safe environment.' }}
        </h2>
        <div class="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <article
            v-for="point in safetyPoints"
            :key="point.title"
            class="card-lift rounded-2xl border border-cream-200 bg-cream-50 p-6"
          >
            <span class="text-3xl" aria-hidden="true">{{ point.icon }}</span>
            <h3 class="mt-4 font-display text-lg font-extrabold leading-tight">{{ point.title }}</h3>
            <p class="mt-2 text-sm text-charcoal/75 leading-relaxed">{{ point.text }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- Free clinics -->
    <section id="clinics" class="section-y bg-cream-50 border-y border-cream-200">
      <div class="max-w-6xl mx-auto px-5 sm:px-6 grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
        <div>
          <p class="t-eyebrow text-sage-700 mb-4">
            {{ es ? 'Clínicas gratis' : 'Free clinics' }}
          </p>
          <h2 class="t-h2 mb-6">
            {{ es ? 'Prueba el Método Niik sin costo.' : 'Try the Niik Method at no cost.' }}
          </h2>
          <div class="t-lead text-charcoal/80 mb-10 max-w-xl space-y-4">
            <p>
              {{
                es
                  ? 'Vive una sesión abierta, conoce a nuestros coaches, conecta con la comunidad y descubre una forma diferente de aprender skate.'
                  : 'Join an open session, meet our coaches, connect with the community, and discover a different way to learn skate.'
              }}
            </p>
            <p>
              {{
                es
                  ? 'Aquí no solo enseñamos a patinar. Enseñamos a caer, aprender y volver a intentarlo.'
                  : 'Here we do not only teach skating. We teach falling, learning, and trying again.'
              }}
            </p>
          </div>
          <NuxtLink to="/classes" class="btn-outline-dark">
            {{ es ? 'Ver clínicas' : 'View clinics' }}
          </NuxtLink>
        </div>
        <div class="relative aspect-[4/3] rounded-3xl overflow-hidden bg-charcoal">
          <PublicPhoto
            :src="CLINIC_IMAGE"
            alt=""
            sizes="xs:100vw lg:45vw"
            class="absolute inset-0 w-full h-full object-cover opacity-80"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-charcoal/85 to-transparent" />
          <p class="absolute bottom-5 left-5 right-5 text-sm font-semibold text-cream">
            {{ es ? 'Próximas clínicas en el calendario de clases.' : 'Upcoming clinics on the class calendar.' }}
          </p>
        </div>
      </div>
    </section>

    <!-- Summer camps -->
    <section id="camps" class="section-y bg-acid text-charcoal">
      <div class="max-w-6xl mx-auto px-5 sm:px-6">
        <p class="t-eyebrow mb-4">{{ es ? 'Verano' : 'Summer' }}</p>
        <h2 class="t-h2 max-w-3xl mb-6">
          {{ es ? '¡Inscríbete a los summer camps!' : 'Register for summer camps!' }}
        </h2>
        <p class="t-lead text-charcoal/80 max-w-2xl mb-10">
          {{
            es
              ? 'Skate, skills mentales y mucha diversión. Camps de una semana para todos los niveles — del primer día al rider con experiencia.'
              : 'Skateboarding, mental skills, and a whole lot of fun. Week-long camps for every level — from first-timers to experienced riders.'
          }}
        </p>
        <NuxtLink
          to="/skate-programs"
          class="inline-flex items-center justify-center px-6 py-3.5 rounded-full bg-charcoal text-cream font-bold hover:bg-charcoal-700 transition-colors"
        >
          {{ es ? 'Ver camps' : 'View camps' }}
        </NuxtLink>
      </div>
    </section>

    <!-- Impact + parent testimonials -->
    <section id="impacto" class="section-y bg-charcoal text-cream scroll-mt-20">
      <div class="max-w-6xl mx-auto px-5 sm:px-6">
        <p class="t-eyebrow text-acid mb-4">
          {{ es ? 'Reporte de impacto' : 'Student impact report' }}
        </p>
        <h2 class="t-h2 mb-12 max-w-2xl">
          {{
            es
              ? 'Lo que dicen los datos — y las familias.'
              : 'What the numbers say — and what families feel.'
          }}
        </h2>

        <dl class="grid grid-cols-2 lg:grid-cols-4 gap-8 mb-6">
          <div v-for="stat in impactStats" :key="stat.label" class="flex flex-col-reverse border-t border-charcoal-600 pt-5">
            <dt class="mt-2 text-sm text-cream/70 leading-snug">{{ stat.label }}</dt>
            <dd class="font-display text-5xl font-black text-acid">{{ stat.value }}</dd>
          </div>
        </dl>
        <p class="text-xs text-cream/60 mb-16">
          {{
            es
              ? '*Cifras ilustrativas — actualiza con tu encuesta real de alumnos.'
              : '*Illustrative figures — replace with your real student survey.'
          }}
        </p>

        <figure class="rounded-3xl border border-charcoal-600 bg-charcoal-800 px-6 sm:px-10 py-10 min-h-[240px] flex flex-col justify-center">
          <div class="flex items-center justify-between gap-3 mb-6">
            <p class="t-eyebrow text-cream/60">
              {{ es ? 'Padres nos cuentan' : 'Parents tell us' }}
            </p>
            <div class="flex gap-2">
              <button
                type="button"
                class="w-11 h-11 rounded-full border border-cream/25 text-cream hover:bg-cream hover:text-charcoal transition-colors"
                :aria-label="es ? 'Testimonio anterior' : 'Previous testimonial'"
                @click="prevQuote"
              >
                ←
              </button>
              <button
                type="button"
                class="w-11 h-11 rounded-full border border-cream/25 text-cream hover:bg-cream hover:text-charcoal transition-colors"
                :aria-label="es ? 'Siguiente testimonio' : 'Next testimonial'"
                @click="nextQuote"
              >
                →
              </button>
            </div>
          </div>
          <div aria-live="polite">
            <Transition name="quote-fade" mode="out-in">
              <blockquote :key="quoteIndex" class="font-display text-xl sm:text-3xl font-bold leading-snug">
                “{{ parentQuotes[quoteIndex]?.quote }}”
              </blockquote>
            </Transition>
          </div>
          <div class="mt-8 flex gap-2">
            <button
              v-for="(_, i) in parentQuotes"
              :key="i"
              type="button"
              class="h-2 rounded-full transition-all"
              :class="i === quoteIndex ? 'w-8 bg-acid' : 'w-3 bg-cream/25 hover:bg-cream/50'"
              :aria-label="(es ? 'Testimonio ' : 'Testimonial ') + (i + 1)"
              :aria-current="i === quoteIndex ? 'true' : undefined"
              @click="quoteIndex = i"
            />
          </div>
        </figure>
      </div>
    </section>

    <!-- Community — those who help -->
    <section id="comunidad" class="overflow-hidden">
      <div class="max-w-6xl mx-auto px-5 sm:px-6 pt-20 sm:pt-28 pb-10 text-center">
        <p class="t-eyebrow text-sage-700 mb-4">
          {{ es ? 'Comunidad' : 'Community' }}
        </p>
        <h2 class="t-h2 mb-4">
          {{ es ? 'Quienes nos ayudan' : 'Those who help us' }}
        </h2>
        <p class="text-charcoal/70 max-w-xl mx-auto">
          {{
            es
              ? 'Partners, familias y riders que empujan la misión.'
              : 'Partners, families, and riders who push the mission forward.'
          }}
        </p>
      </div>

      <div class="relative pb-16 sm:pb-20">
        <div class="flex gap-5 w-max animate-deck-marquee hover:[animation-play-state:paused] focus-within:[animation-play-state:paused]">
          <div
            v-for="(deck, i) in [...communityDecks, ...communityDecks]"
            :key="deck.id + '-' + i"
            class="group relative w-36 sm:w-44 aspect-[8/22] shrink-0 transition-transform duration-300 hover:-translate-y-1"
            :aria-hidden="i >= communityDecks.length ? 'true' : undefined"
          >
            <NuxtLink
              v-if="deck.url"
              :to="deck.url"
              class="absolute inset-0 z-10 rounded-[2rem]"
              :aria-label="deck.name"
              :tabindex="i >= communityDecks.length ? -1 : undefined"
            />
            <img
              src="/images/decks/blank-deck.svg"
              alt=""
              loading="lazy"
              decoding="async"
              class="absolute inset-0 w-full h-full object-contain drop-shadow-xl pointer-events-none"
            />
            <div
              class="absolute inset-[8%] rounded-[2rem] bg-gradient-to-b opacity-70 pointer-events-none"
              :class="deck.tone || 'from-white/10 to-black/50'"
            />
            <div class="absolute inset-0 flex flex-col items-center justify-center px-4 sm:px-5 pointer-events-none">
              <div
                class="w-[78%] aspect-square rounded-2xl bg-charcoal/60 border border-white/10 flex items-center justify-center p-2.5 sm:p-3 shadow-lg transition-transform duration-300 group-hover:scale-105"
              >
                <img
                  :src="deck.logo"
                  :alt="es ? `Logo de ${deck.name}` : `${deck.name} logo`"
                  loading="lazy"
                  decoding="async"
                  class="w-full h-full object-contain"
                />
              </div>
              <p class="mt-4 text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/90 text-center leading-tight">
                {{ deck.name }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="max-w-6xl mx-auto px-5 sm:px-6 pb-20 text-center">
        <NuxtLink to="/alianzas" class="link-underline decoration-acid-600 hover:text-sage-700">
          {{ es ? 'Ver alianzas →' : 'See partners →' }}
        </NuxtLink>
      </div>
    </section>

    <!-- Donate -->
    <section id="donar" class="section-y bg-cream-50 border-t border-cream-200">
      <div class="max-w-3xl mx-auto px-5 sm:px-6 text-center">
        <p class="t-eyebrow text-sage-700 mb-4">
          {{ es ? 'Donar' : 'Donate' }}
        </p>
        <h2 class="t-h2 mb-5">
          {{ es ? 'Ayúdanos a seguir.' : 'Help us keep rolling.' }}
        </h2>
        <p class="text-charcoal/75 mb-10 max-w-xl mx-auto">
          {{
            es
              ? 'Cada peso apoya clínicas, becas y el Método Niik — resiliencia y salud mental a través del skate.'
              : 'Every dollar supports clinics, scholarships, and the Niik Method — resilience and mental health through skate.'
          }}
        </p>

        <div class="flex flex-wrap justify-center gap-2 mb-4" role="group" :aria-label="es ? 'Monto de donación' : 'Donation amount'">
          <button
            v-for="amount in donateAmounts"
            :key="amount"
            type="button"
            class="min-w-[4.5rem] px-4 py-2.5 rounded-full text-sm font-bold border-2 transition-colors"
            :class="selectedDonate === amount && !customDonate
              ? 'bg-charcoal text-cream border-charcoal'
              : 'border-cream-300 text-charcoal hover:border-charcoal'"
            :aria-pressed="selectedDonate === amount && !customDonate"
            @click="selectDonate(amount)"
          >
            ${{ amount }}
          </button>
        </div>
        <div class="flex items-center justify-center gap-2 mb-8">
          <label for="donate-custom" class="text-charcoal/70 font-bold">$</label>
          <input
            id="donate-custom"
            v-model="customDonate"
            type="number"
            min="1"
            class="w-36 px-3 py-2.5 rounded-full bg-white border-2 border-cream-300 text-charcoal text-center font-semibold focus:border-charcoal"
            :placeholder="es ? 'Otro' : 'Other'"
            :aria-label="es ? 'Otro monto' : 'Other amount'"
          />
        </div>
        <a
          :href="`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(es ? 'Donación NiikSkate' : 'NiikSkate donation')}&body=${encodeURIComponent((es ? 'Quiero donar $' : 'I want to donate $') + donateTotal)}`"
          class="btn-lime px-8"
        >
          {{ es ? `Continuar — $${donateTotal}` : `Continue — $${donateTotal}` }}
        </a>
      </div>
    </section>

    <!-- Soft CTA before footer -->
    <section class="bg-charcoal text-cream border-b border-charcoal-700">
      <div class="max-w-6xl mx-auto px-5 sm:px-6 py-16 flex flex-col sm:flex-row items-center justify-between gap-6">
        <p class="font-display text-2xl sm:text-3xl font-black text-center sm:text-left">
          {{ es ? '¿Listo para subirte a la tabla?' : 'Ready to jump on the board?' }}
        </p>
        <div class="flex flex-wrap justify-center gap-3">
          <NuxtLink to="/skate-programs" class="btn-lime">
            {{ es ? 'Programas' : 'Programs' }}
          </NuxtLink>
          <NuxtLink to="/auth/login?redirect=/member" class="btn-outline-light">
            {{ es ? 'App de miembros' : 'Member app' }}
          </NuxtLink>
        </div>
      </div>
    </section>
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
