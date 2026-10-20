<script setup lang="ts">
import { CONTACT_EMAIL } from '~/utils/contact'
import { localizeNiikMethodStages } from '~/utils/niikMethod'
import {
  DEFAULT_SESSION_LENGTH,
  SESSION_PRESETS,
  sessionBlockLabel,
  type SessionBlockId,
} from '~/utils/sessionStructure'

definePageMeta({ layout: 'public' })

const { language } = useI18n()

const es = computed(() => language.value === 'es')

/** Swap for real class photos (e.g. a coach guiding a skater on a ramp). */
const HERO_IMAGE = '/Niik_StainedGlass.png'
const STORY_IMAGE = '/Niik_StainedGlass.png'

const SCHOOLS_EMAIL = CONTACT_EMAIL

const stages = computed(() => localizeNiikMethodStages(es.value))

/** null while the carousel is closed. */
const activeStage = ref<number | null>(null)

function openStage(index: number) {
  activeStage.value = activeStage.value === index ? null : index
}

function shiftStage(delta: number) {
  if (activeStage.value === null) return
  const count = stages.value.length
  // The method is a cycle, so the last stage wraps back to the first.
  activeStage.value = (activeStage.value + delta + count) % count
}

function onCarouselKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight') shiftStage(1)
  else if (event.key === 'ArrowLeft') shiftStage(-1)
  else if (event.key === 'Escape') activeStage.value = null
  else return
  event.preventDefault()
}

let touchStartX = 0

function onTouchStart(event: TouchEvent) {
  touchStartX = event.touches[0]?.clientX ?? 0
}

function onTouchEnd(event: TouchEvent) {
  const dx = (event.changedTouches[0]?.clientX ?? 0) - touchStartX
  if (Math.abs(dx) > 40) shiftStage(dx < 0 ? 1 : -1)
}

/** Width of the filled progress line behind the stage buttons. */
const progressWidth = computed(() => {
  if (activeStage.value === null) return '0%'
  return `${(activeStage.value / (stages.value.length - 1)) * 80}%`
})

const SESSION_BLOCK_COPY: Record<SessionBlockId, { icon: string; es: string; en: string }> = {
  warmup: {
    icon: '🔥',
    es: 'Movilidad, equilibrio y activación para preparar cuerpo y mente.',
    en: 'Mobility, balance, and activation to get body and mind ready.',
  },
  drills: {
    icon: '🔁',
    es: 'Ejercicios y dinámicas que construyen la base técnica.',
    en: 'Exercises and games that build the technical base.',
  },
  focus: {
    icon: '🎯',
    es: 'Un reto adecuado al nivel de cada patinador, con guía del coach.',
    en: 'A challenge matched to each skater’s level, guided by the coach.',
  },
  free: {
    icon: '🛹',
    es: 'Tiempo para practicar, crear y aplicar lo aprendido a su ritmo.',
    en: 'Time to practice, create, and apply what they learned at their own pace.',
  },
  stretch: {
    icon: '🧘',
    es: 'Estiramiento y cierre: lo que funcionó y qué sigue.',
    en: 'Stretch and close-out: what worked and what comes next.',
  },
}

const sessionTimeline = computed(() => {
  let start = 0
  return SESSION_PRESETS[DEFAULT_SESSION_LENGTH].map((block) => {
    const range = `${start}–${start + block.minutes} min`
    start += block.minutes
    const copy = SESSION_BLOCK_COPY[block.id]
    return {
      icon: copy.icon,
      minutes: block.minutes,
      name: sessionBlockLabel(block.id, es.value),
      text: es.value ? copy.es : copy.en,
      range,
    }
  })
})

const beyondAreas = computed(() => [
  {
    icon: '🏫',
    title: es.value ? 'Alianzas escolares' : 'School partnerships',
    text: es.value
      ? 'Llevamos el método a escuelas, dentro del horario escolar o como actividad extracurricular, adaptado a cada grupo.'
      : 'We bring the method to schools, during the school day or as an after-school activity, adapted to each group.',
  },
  {
    icon: '🎨',
    title: es.value ? 'Creatividad y arte' : 'Creativity and arts',
    text: es.value
      ? 'Diseño de tablas, fotografía y video: el skate como una forma de expresión personal.'
      : 'Deck design, photography, and video: skateboarding as a form of self-expression.',
  },
  {
    icon: '🤝',
    title: es.value ? 'Comunidad' : 'Community',
    text: es.value
      ? 'Sesiones abiertas, eventos y un espacio donde cada patinador se siente parte de algo.'
      : 'Open sessions, events, and a space where every skater feels they belong.',
  },
  {
    icon: '🌱',
    title: es.value ? 'Desarrollo personal' : 'Personal development',
    text: es.value
      ? 'Enfrentar la incertidumbre, manejar la frustración y persistir: habilidades que se aplican en la escuela, en casa y en la vida.'
      : 'Facing uncertainty, managing frustration, and persisting: skills that carry into school, home, and life.',
  },
])

const schoolsMailto = computed(() =>
  `mailto:${SCHOOLS_EMAIL}?subject=${encodeURIComponent(es.value ? 'Método Niik para escuelas' : 'Niik Method for schools')}`,
)
</script>

<template>
  <div class="bg-cream text-charcoal">
    <!-- 01 — Opening -->
    <section class="relative isolate overflow-hidden min-h-[72vh] flex items-end bg-charcoal text-cream">
      <PublicPhoto
        :src="HERO_IMAGE"
        alt=""
        priority
        sizes="xs:100vw sm:100vw md:100vw lg:100vw xl:100vw xxl:100vw"
        class="absolute inset-0 -z-10 w-full h-full object-cover opacity-60"
      />
      <div class="absolute inset-0 -z-10 bg-gradient-to-t from-charcoal via-charcoal/70 to-charcoal/20" />
      <div class="max-w-6xl w-full mx-auto px-5 sm:px-6 pb-20 pt-32 sm:pb-28">
        <p class="t-eyebrow text-acid mb-4">
          {{ es ? 'El Método Niik' : 'The Niik Method' }}
        </p>
        <h1 class="t-display max-w-4xl">
          {{ es ? 'Aprender a caer.' : 'Learn to fall.' }}
          <span class="block text-acid">{{ es ? 'Aprender a crecer.' : 'Learn to grow.' }}</span>
        </h1>
        <p class="t-lead mt-6 text-cream/85 max-w-2xl">
          {{ es
            ? 'El skateboarding es mucho más que aprender trucos. Es una oportunidad para enfrentar retos, desarrollar habilidades, construir confianza y descubrir de lo que somos capaces.'
            : 'Skateboarding is much more than learning tricks. It is a chance to face challenges, build skills, gain confidence, and discover what we are capable of.' }}
        </p>
        <div class="mt-10 flex flex-wrap gap-3">
          <NuxtLink to="/skate-programs" class="btn-lime">
            {{ es ? 'Conoce los programas' : 'Explore the programs' }}
          </NuxtLink>
          <a href="#escuelas" class="btn-outline-light">
            {{ es ? 'Para escuelas' : 'For schools' }}
          </a>
        </div>
      </div>
    </section>

    <div class="max-w-6xl mx-auto px-5 sm:px-6">
      <section class="section-y grid md:grid-cols-2 gap-12 items-center">
        <div class="space-y-5 text-charcoal/80 t-lead">
          <p>
            {{ es
              ? 'El Método Niik transforma cada sesión en una experiencia de aprendizaje intencional, combinando progresión técnica, habilidades mentales, creatividad y comunidad.'
              : 'The Niik Method turns every session into an intentional learning experience, combining technical progression, mental skills, creativity, and community.' }}
          </p>
          <p>
            {{ es
              ? 'Cuando intentas un truco nuevo, vas a caer una y otra vez. Pero aprendes a levantarte, analizar qué salió mal e intentarlo de nuevo. Ese proceso es el mismo que usamos para enfrentar los retos de la vida.'
              : 'When you try a new trick, you are going to fall, over and over again. But you learn to get back up, analyze what went wrong, and try again. That same process is how we navigate life’s challenges.' }}
          </p>
          <p class="font-display text-2xl font-black text-charcoal leading-snug">
            {{ es
              ? 'Lo que comienza sobre una patineta puede acompañarte toda la vida.'
              : 'What starts on a skateboard can stay with you for life.' }}
          </p>
        </div>
        <PublicPhoto
          :src="STORY_IMAGE"
          alt=""
          sizes="xs:100vw md:50vw"
          class="w-full aspect-[4/3] object-cover rounded-3xl"
        />
      </section>
    </div>

    <!-- 02 — The five stages -->
    <section class="section-y bg-charcoal text-cream">
      <div class="max-w-6xl mx-auto px-5 sm:px-6">
        <p class="t-eyebrow text-acid">02</p>
        <h2 class="t-h2 mt-2">{{ es ? 'Las cinco etapas' : 'The five stages' }}</h2>
        <p class="t-lead text-cream/75 mt-4 max-w-2xl">
          {{ es
            ? 'Cada etapa tiene dos lados: lo que los alumnos practican sobre la tabla y lo que aprenden para la vida.'
            : 'Every stage has two sides: what students practice on the board and what they learn for life.' }}
        </p>

        <div class="mt-12 rounded-3xl border border-charcoal-600 bg-charcoal-800 p-5 sm:p-8">
          <p class="text-cream/75 text-center">
            {{ es ? 'Aprender sobre la tabla. Crecer fuera de ella.' : 'Learn on the board. Grow beyond it.' }}
          </p>

          <div class="relative mt-8">
            <div class="absolute left-[10%] right-[10%] top-[3.55rem] sm:top-[3.65rem] h-0.5 bg-charcoal-600" aria-hidden="true" />
            <div
              class="absolute left-[10%] top-[3.55rem] sm:top-[3.65rem] h-0.5 bg-acid transition-[width] duration-300"
              :style="{ width: progressWidth }"
              aria-hidden="true"
            />
            <div class="relative grid grid-cols-5 gap-1 sm:gap-2">
              <button
                v-for="(stage, i) in stages"
                :key="stage.name"
                type="button"
                class="flex flex-col items-center gap-2 rounded-2xl px-1 py-3 transition-colors"
                :class="activeStage === i ? 'bg-charcoal-700' : 'hover:bg-charcoal-700/60'"
                :aria-pressed="activeStage === i"
                aria-controls="method-stage-carousel"
                @click="openStage(i)"
              >
                <span
                  class="text-[11px] font-bold tabular-nums"
                  :class="activeStage !== null && i <= activeStage ? 'text-acid' : 'text-cream/60'"
                >
                  {{ String(i + 1).padStart(2, '0') }}
                </span>
                <span
                  class="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-lg transition-colors"
                  :class="activeStage !== null && i <= activeStage ? 'bg-acid' : 'bg-charcoal-600'"
                  aria-hidden="true"
                >
                  {{ stage.icon }}
                </span>
                <span class="text-[10px] sm:text-sm font-semibold text-cream text-center leading-tight break-words">
                  {{ stage.name }}
                </span>
              </button>
            </div>
          </div>

          <p class="text-cream/70 text-sm text-center mt-5">
            {{ es
              ? 'Un ciclo continuo de reto, aprendizaje, logro y crecimiento.'
              : 'A continuous cycle of challenge, learning, achievement, and growth.' }}
          </p>
          <p v-if="activeStage === null" class="text-xs text-cream/55 text-center mt-1">
            {{ es ? 'Toca una etapa para conocerla.' : 'Tap a stage to explore it.' }}
          </p>

          <div
            v-else
            id="method-stage-carousel"
            role="region"
            aria-roledescription="carousel"
            :aria-label="es ? 'Etapas del Método Niik' : 'Niik Method stages'"
            tabindex="0"
            class="mt-6 rounded-2xl bg-cream text-charcoal overflow-hidden"
            @keydown="onCarouselKeydown"
            @touchstart.passive="onTouchStart"
            @touchend="onTouchEnd"
          >
            <div
              class="flex transition-transform duration-300 ease-out"
              :style="{ transform: `translateX(-${activeStage * 100}%)` }"
              aria-live="polite"
            >
              <article
                v-for="(stage, i) in stages"
                :key="stage.name"
                class="w-full shrink-0 p-6 sm:p-8"
                aria-roledescription="slide"
                :aria-label="`${i + 1} / ${stages.length}`"
                :aria-hidden="activeStage !== i"
              >
                <div class="flex items-center gap-4">
                  <span class="w-14 h-14 rounded-full bg-acid flex items-center justify-center text-2xl" aria-hidden="true">
                    {{ stage.icon }}
                  </span>
                  <div>
                    <p class="text-xs font-bold text-sage-700 tabular-nums">
                      {{ es ? 'Etapa' : 'Stage' }} {{ String(i + 1).padStart(2, '0') }}
                    </p>
                    <h3 class="t-h3">{{ stage.name }}</h3>
                  </div>
                </div>
                <div class="mt-6 grid sm:grid-cols-2 gap-3">
                  <div class="rounded-2xl border border-cream-200 bg-cream-50 p-5">
                    <p class="t-eyebrow text-[11px] text-sage-700">
                      {{ es ? 'Lo que practican sobre la patineta' : 'What they practice on the board' }}
                    </p>
                    <p class="mt-2 text-lg font-semibold">{{ stage.board }}</p>
                  </div>
                  <div class="rounded-2xl border border-sage/40 bg-sage-100 p-5">
                    <p class="t-eyebrow text-[11px] text-sage-700">
                      {{ es ? 'Lo que aprenden para la vida' : 'What they learn for life' }}
                    </p>
                    <p class="mt-2 text-lg font-semibold">{{ stage.life }}</p>
                  </div>
                </div>
              </article>
            </div>

            <div class="flex items-center justify-between gap-3 px-6 pb-5">
              <button
                type="button"
                class="w-11 h-11 rounded-full border-2 border-charcoal/20 hover:bg-charcoal hover:text-cream transition-colors"
                :aria-label="es ? 'Etapa anterior' : 'Previous stage'"
                @click="shiftStage(-1)"
              >
                ‹
              </button>
              <div class="flex gap-1.5">
                <button
                  v-for="(stage, i) in stages"
                  :key="stage.name"
                  type="button"
                  class="h-2.5 rounded-full transition-all"
                  :class="activeStage === i ? 'w-7 bg-charcoal' : 'w-2.5 bg-charcoal/25 hover:bg-charcoal/50'"
                  :aria-label="stage.name"
                  :aria-current="activeStage === i ? 'true' : undefined"
                  @click="activeStage = i"
                />
              </div>
              <button
                type="button"
                class="w-11 h-11 rounded-full border-2 border-charcoal/20 hover:bg-charcoal hover:text-cream transition-colors"
                :aria-label="es ? 'Siguiente etapa' : 'Next stage'"
                @click="shiftStage(1)"
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <div class="max-w-6xl mx-auto px-5 sm:px-6">
      <!-- 03 — Inside a Niik session -->
      <section class="section-y">
        <p class="t-eyebrow text-sage-700">03</p>
        <h2 class="t-h2 mt-2">{{ es ? 'Dentro de una sesión Niik' : 'Inside a Niik session' }}</h2>
        <p class="t-lead text-charcoal/75 mt-4 max-w-2xl">
          {{ es ? 'Estructura de una clase (90 min).' : 'Class structure (90 min).' }}
        </p>

        <div class="mt-12 hidden md:flex h-2.5 rounded-full overflow-hidden gap-1" aria-hidden="true">
          <span
            v-for="(step, i) in sessionTimeline"
            :key="step.name"
            class="h-full"
            :class="i % 2 === 0 ? 'bg-charcoal' : 'bg-acid-600'"
            :style="{ flexGrow: step.minutes }"
          />
        </div>

        <ol class="mt-10 md:mt-6 relative border-l-2 border-cream-300 md:border-l-0 md:flex md:gap-5">
          <li
            v-for="(step, i) in sessionTimeline"
            :key="step.name"
            class="relative pl-9 pb-10 last:pb-0 md:pl-0 md:pb-0 md:min-w-0"
            :style="{ flexGrow: step.minutes, flexBasis: 0 }"
          >
            <span
              class="absolute -left-[1.15rem] top-0 md:static w-9 h-9 rounded-full bg-cream-50 border-2 border-charcoal flex items-center justify-center text-base"
              aria-hidden="true"
            >
              {{ step.icon }}
            </span>
            <p class="text-xs font-bold text-sage-700 tabular-nums md:mt-4">
              {{ String(i + 1).padStart(2, '0') }} · {{ step.range }}
            </p>
            <h3 class="font-display text-lg font-extrabold mt-1">{{ step.name }}</h3>
            <p class="text-sm text-charcoal/75 mt-1 leading-relaxed">{{ step.text }}</p>
          </li>
        </ol>
      </section>
    </div>

    <!-- 04 — Beyond the skatepark -->
    <section class="section-y bg-cream-50 border-t border-cream-200">
      <div class="max-w-6xl mx-auto px-5 sm:px-6">
        <p class="t-eyebrow text-sage-700">04</p>
        <h2 class="t-h2 mt-2">{{ es ? 'Más allá del skatepark' : 'Beyond the skatepark' }}</h2>
        <p class="t-lead text-charcoal/75 mt-4 max-w-2xl">
          {{ es
            ? 'El método no termina cuando bajamos de la tabla. Se extiende a la escuela, al arte, a la comunidad y al crecimiento personal.'
            : 'The method doesn’t end when we step off the board. It extends into school, the arts, community, and personal growth.' }}
        </p>

        <div class="mt-12 grid sm:grid-cols-2 gap-4">
          <article
            v-for="area in beyondAreas"
            :key="area.title"
            class="card-lift rounded-2xl border border-cream-200 bg-cream p-6"
          >
            <span class="text-3xl" aria-hidden="true">{{ area.icon }}</span>
            <h3 class="font-display text-xl font-extrabold mt-4">{{ area.title }}</h3>
            <p class="text-charcoal/75 mt-2 leading-relaxed">{{ area.text }}</p>
          </article>
        </div>

        <div
          id="escuelas"
          class="scroll-mt-24 mt-10 rounded-3xl bg-charcoal text-cream p-7 sm:p-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6"
        >
          <div>
            <h3 class="t-h3">{{ es ? 'Para escuelas' : 'For schools' }}</h3>
            <p class="text-cream/75 mt-2 max-w-xl">
              {{ es
                ? '¿Quieres llevar el Método Niik a tu escuela? Diseñamos un programa a la medida de tus alumnos.'
                : 'Want to bring the Niik Method to your school? We design a program around your students.' }}
            </p>
          </div>
          <a :href="schoolsMailto" class="btn-lime shrink-0">
            {{ es ? 'Contáctanos' : 'Contact us' }}
          </a>
        </div>
      </div>
    </section>
  </div>
</template>
