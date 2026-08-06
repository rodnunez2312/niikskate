<script setup lang="ts">
import { format, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import type { CrewParticipant } from '~/composables/useCrew'
import {
  DEFAULT_SKATEPARK,
  DROP_IN_CLASS_PRICE_MXN,
  MONTHLY_PROGRAM_PRICE_MXN,
  PROGRAM_AGE_BANDS,
  SKATE_SKILL_LEVELS,
  TIME_SLOT_LABELS,
  audienceAgeRange,
  audienceCategoryLabel,
  parseAudienceCategories,
  type AudienceCategory,
  type BookableClassSession,
} from '~/types'
import { ineligibilityReason, isAgeEligibleForSession, sessionAgeBounds } from '~/utils/ageEligibility'

const route = useRoute()
const router = useRouter()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { language, formatPrice } = useI18n()
const { participants, refreshCrew } = useCrew()

const loading = ref(true)
const enrollingId = ref<string | null>(null)
const enrollError = ref('')
const enrollSuccess = ref('')
const sessions = ref<BookableClassSession[]>([])
const levelsOpen = ref(false)
const loadError = ref('')
/** Session ids with Details panel expanded */
const detailsOpen = ref<Set<string>>(new Set())

/** eventId → set of participant keys already enrolled */
const enrollmentsByEvent = ref<Map<string, Set<string>>>(new Map())

const skateparks = [DEFAULT_SKATEPARK]
const selectedSkatepark = ref(DEFAULT_SKATEPARK)
const selectedDays = ref<number[]>([])
/** Optional browse filter by age band — null = show all */
const selectedAgeBand = ref<AudienceCategory | null>(null)
/** Optional — highlight classes for these crew members */
const selectedSkaterKeys = ref<string[]>([])

const enrollModalSession = ref<BookableClassSession | null>(null)
const modalSelectedKeys = ref<string[]>([])

/** Official La Plancha practice days only (JS getDay). */
const dayOptions = computed(() => {
  const esLang = language.value === 'es'
  return [
    { v: 1, label: esLang ? 'Lunes' : 'Monday' },
    { v: 2, label: esLang ? 'Martes' : 'Tuesday' },
    { v: 4, label: esLang ? 'Jueves' : 'Thursday' },
    { v: 6, label: esLang ? 'Sábado' : 'Saturday' },
  ]
})

const rangesOverlap = (
  aMin: number | null,
  aMax: number | null,
  bMin: number | null,
  bMax: number | null,
) => {
  const loA = aMin ?? 0
  const hiA = aMax ?? 99
  const loB = bMin ?? 0
  const hiB = bMax ?? 99
  return loA <= hiB && loB <= hiA
}

const ageInBand = (age: number, bandId: AudienceCategory) => {
  const { minAge, maxAge } = audienceAgeRange(bandId)
  if (minAge != null && age < minAge) return false
  if (maxAge != null && age > maxAge) return false
  return true
}

const toggleDay = (d: number) => {
  const i = selectedDays.value.indexOf(d)
  if (i >= 0) selectedDays.value.splice(i, 1)
  else selectedDays.value.push(d)
  selectedDays.value = [...selectedDays.value]
}

const toggleAgeBand = (id: AudienceCategory) => {
  selectedAgeBand.value = selectedAgeBand.value === id ? null : id
}

const toggleSkaterFilter = (key: string) => {
  const i = selectedSkaterKeys.value.indexOf(key)
  if (i >= 0) selectedSkaterKeys.value.splice(i, 1)
  else selectedSkaterKeys.value.push(key)
  selectedSkaterKeys.value = [...selectedSkaterKeys.value]
}

const sessionDay = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  return getDay(new Date(y, m - 1, d))
}

const matchesSkatepark = (s: BookableClassSession) => {
  if (!selectedSkatepark.value) return true
  const park = s.skatepark || s.location
  if (!park) return selectedSkatepark.value === DEFAULT_SKATEPARK
  return park === selectedSkatepark.value
}

const participantEligible = (p: CrewParticipant, s: BookableClassSession) => {
  if (p.age == null) return false
  return isAgeEligibleForSession(p.age, s)
}

const sessionMatchesAgeBandFilter = (s: BookableClassSession) => {
  const bandId = selectedAgeBand.value
  if (!bandId) return true
  const cats = parseAudienceCategories(s)
  if (cats.includes(bandId)) return true
  const bounds = sessionAgeBounds(s)
  const band = audienceAgeRange(bandId)
  return rangesOverlap(bounds.minAge, bounds.maxAge, band.minAge, band.maxAge)
}

const sessionMatchesSkaterFilter = (s: BookableClassSession) => {
  if (!selectedSkaterKeys.value.length) return true
  return selectedSkaterKeys.value.some(key => {
    const p = participants.value.find(x => x.key === key)
    return p ? participantEligible(p, s) : false
  })
}

const filteredSessions = computed(() =>
  sessions.value.filter(s => {
    if (!matchesSkatepark(s)) return false
    if (selectedDays.value.length && !selectedDays.value.includes(sessionDay(s.start_date))) return false
    if (!sessionMatchesAgeBandFilter(s)) return false
    if (!sessionMatchesSkaterFilter(s)) return false
    return true
  }),
)

const crewInSelectedBands = computed(() => {
  const bandId = selectedAgeBand.value
  if (!bandId) return participants.value
  return participants.value.filter(p => p.age != null && ageInBand(p.age!, bandId))
})

const ageFilterError = computed(() => {
  const bandId = selectedAgeBand.value
  if (!user.value || !bandId) return null
  if (crewInSelectedBands.value.length === 0) {
    const band = PROGRAM_AGE_BANDS.find(b => b.id === bandId)
    const label = band ? (language.value === 'es' ? band.label.es : band.label.en) : bandId
    return language.value === 'es'
      ? `Ningún patinador de tu crew está en: ${label}. Agrega uno en Crew o quita el filtro.`
      : `None of your crew skaters are in: ${label}. Add one in Crew or clear the filter.`
  }
  return null
})

const audienceLabels = (s: BookableClassSession) => {
  const cats = parseAudienceCategories(s)
  if (!cats.length) return ''
  const lang = language.value === 'es' ? 'es' : 'en'
  return cats.map(id => audienceCategoryLabel(id, lang)).join(' · ')
}

const skillLabel = (id: string | null) => {
  if (!id) return language.value === 'es' ? 'Todos los niveles' : 'All levels'
  const row = SKATE_SKILL_LEVELS.find(l => l.id === id)
  if (!row) return id
  return language.value === 'es' ? row.title.es : row.title.en
}

const monthlyPrice = (s: BookableClassSession) =>
  s.price_mxn != null && s.price_mxn > 0 ? Number(s.price_mxn) : MONTHLY_PROGRAM_PRICE_MXN

const isDetailsOpen = (id: string) => detailsOpen.value.has(id)

const toggleDetails = (id: string) => {
  const next = new Set(detailsOpen.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  detailsOpen.value = next
}

const sessionDetailsText = (s: BookableClassSession) => {
  if (s.description?.trim()) return s.description.trim()
  const audience = audienceLabels(s)
  const ages =
    s.min_age != null || s.max_age != null
      ? `${s.min_age ?? '—'}–${s.max_age ?? '—'}`
      : null
  const slot = s.time_slot ? TIME_SLOT_LABELS[s.time_slot].display : null
  if (language.value === 'es') {
    const bits = [
      `Clase grupal NiikSkate en ${s.skatepark || selectedSkatepark.value}.`,
      audience ? `Audiencia: ${audience}.` : null,
      ages ? `Edades: ${ages}.` : null,
      `Nivel: ${skillLabel(s.skill_level)}.`,
      slot ? `Horario: ${slot}.` : null,
      `Programa mensual ${formatPrice(monthlyPrice(s))} · Clase individual ${formatPrice(DROP_IN_CLASS_PRICE_MXN)}.`,
      `Máx. ${s.maxCapacity || 6} patinadores por sesión.`,
    ]
    return bits.filter(Boolean).join(' ')
  }
  const bits = [
    `NiikSkate group class at ${s.skatepark || selectedSkatepark.value}.`,
    audience ? `Audience: ${audience}.` : null,
    ages ? `Ages: ${ages}.` : null,
    `Level: ${skillLabel(s.skill_level)}.`,
    slot ? `Time: ${slot}.` : null,
    `Monthly program ${formatPrice(monthlyPrice(s))} · Drop-in class ${formatPrice(DROP_IN_CLASS_PRICE_MXN)}.`,
    `Max ${s.maxCapacity || 6} skaters per session.`,
  ]
  return bits.filter(Boolean).join(' ')
}

const spotsLabel = (s: BookableClassSession) => {
  if (s.status === 'no_coaches') {
    return language.value === 'es' ? 'Sin coaches asignados' : 'No coaches scheduled'
  }
  if (s.status === 'full') return language.value === 'es' ? 'LLENO' : 'FULL'
  if (s.status === 'almost_full') {
    return language.value === 'es'
      ? `¡Casi lleno! ${s.spotsLeft} lugares`
      : `Almost full! ${s.spotsLeft} spots left`
  }
  return language.value === 'es'
    ? `${s.spotsLeft} LUGARES DISPONIBLES`
    : `${s.spotsLeft} SPOTS OPEN`
}

const spotsBarClass = (s: BookableClassSession) => {
  if (s.status === 'full' || s.status === 'no_coaches') return 'bg-gray-400'
  if (s.status === 'almost_full') return 'bg-amber-500'
  return 'bg-teal-600'
}

const spotsFillPct = (s: BookableClassSession) => {
  if (s.maxCapacity <= 0) return 0
  return Math.min(100, Math.round((s.enrolled / s.maxCapacity) * 100))
}

const formatSessionDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-').map(Number)
  const loc = language.value === 'es' ? es : undefined
  return format(new Date(y, m - 1, d), 'EEE d MMM yyyy', { locale: loc })
}

const enrollmentKeyFor = (p: CrewParticipant) => p.key

const isEnrolled = (s: BookableClassSession, p: CrewParticipant) => {
  return enrollmentsByEvent.value.get(s.id)?.has(enrollmentKeyFor(p)) ?? false
}

const anyEnrolled = (s: BookableClassSession) => {
  const set = enrollmentsByEvent.value.get(s.id)
  return set != null && set.size > 0
}

async function loadEnrollments() {
  enrollmentsByEvent.value = new Map()
  if (!user.value) return
  const { data } = await client
    .from('class_session_enrollments')
    .select('calendar_event_id, crew_member_id')
    .eq('user_id', user.value.id)
    .eq('status', 'confirmed')
  const map = new Map<string, Set<string>>()
  for (const row of data || []) {
    const key = row.crew_member_id ? String(row.crew_member_id) : 'self'
    if (!map.has(row.calendar_event_id)) map.set(row.calendar_event_id, new Set())
    map.get(row.calendar_event_id)!.add(key)
  }
  enrollmentsByEvent.value = map
}

const loadSessions = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await $fetch<{ sessions: BookableClassSession[] }>('/api/classes/sessions', {
      query: { skatepark: selectedSkatepark.value },
    })
    sessions.value = res.sessions || []
    await loadEnrollments()
  } catch (e: any) {
    console.error('loadSessions:', e)
    sessions.value = []
    const raw = e?.data?.message || e?.message || ''
    const tlsIssue =
      /fetch failed/i.test(raw)
      || /certificate/i.test(String(e?.cause?.message || ''))
    loadError.value = tlsIssue
      ? language.value === 'es'
        ? 'No se pudo conectar al servidor (red corporativa/VPN). Reinicia con start-app.bat o cierra sesión de VPN e intenta de nuevo.'
        : 'Could not reach the server (corporate network/VPN). Restart with start-app.bat or try without VPN.'
      : raw || (language.value === 'es' ? 'No se pudieron cargar las clases' : 'Could not load classes')
  } finally {
    loading.value = false
  }
}

const modalEligible = computed(() => {
  const s = enrollModalSession.value
  if (!s) return []
  return participants.value.filter(p => participantEligible(p, s))
})

const modalHidden = computed(() => {
  const s = enrollModalSession.value
  if (!s) return []
  return participants.value.filter(p => !participantEligible(p, s))
})

const modalAgeRangeLabel = (s: BookableClassSession) => {
  if (s.min_age != null || s.max_age != null) {
    return `${s.min_age ?? '—'}–${s.max_age ?? '—'}`
  }
  const cats = parseAudienceCategories(s)
  if (cats.length) return audienceLabels(s)
  return ''
}

function openEnrollModal(s: BookableClassSession) {
  enrollError.value = ''
  if (!user.value) {
    router.push(`/auth/login?redirect=${encodeURIComponent(route.fullPath)}`)
    return
  }
  if (s.status === 'full' || s.status === 'no_coaches') return
  enrollModalSession.value = s
  modalSelectedKeys.value = []
}

function closeEnrollModal() {
  enrollModalSession.value = null
  modalSelectedKeys.value = []
  enrollError.value = ''
}

function toggleModalSkater(key: string) {
  const i = modalSelectedKeys.value.indexOf(key)
  if (i >= 0) modalSelectedKeys.value.splice(i, 1)
  else modalSelectedKeys.value.push(key)
  modalSelectedKeys.value = [...modalSelectedKeys.value]
}

async function confirmEnroll() {
  const s = enrollModalSession.value
  if (!s || !modalSelectedKeys.value.length) {
    enrollError.value =
      language.value === 'es'
        ? 'Elige quién se inscribe.'
        : 'Choose who is registering.'
    return
  }

  enrollingId.value = s.id
  enrollError.value = ''
  try {
    const { data: authData } = await client.auth.getSession()
    const token = authData.session?.access_token
    if (!token) throw new Error(language.value === 'es' ? 'Sesión expirada' : 'Session expired')

    const names: string[] = []
    for (const key of modalSelectedKeys.value) {
      const p = participants.value.find(x => x.key === key)
      if (!p || p.age == null) continue
      if (isEnrolled(s, p)) continue

      await $fetch('/api/classes/enroll', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          eventId: s.id,
          childAge: p.age,
          crewMemberId: p.crewMemberId,
        },
      })
      names.push(p.firstName)
    }

    if (names.length) {
      enrollSuccess.value =
        language.value === 'es'
          ? `¡${names.join(', ')} inscrito(s) en ${s.title}!`
          : `${names.join(', ')} joined ${s.title}!`
    }
    closeEnrollModal()
    await loadSessions()
  } catch (e: any) {
    enrollError.value = e?.data?.message || e?.message || 'Error'
  } finally {
    enrollingId.value = null
  }
}

watch(selectedSkatepark, loadSessions)
onMounted(async () => {
  if (user.value) await refreshCrew()
  await loadSessions()
})
</script>

<template>
  <div class="min-h-screen bg-[#fff9f0] text-gray-900 pb-28">
    <header class="border-b-2 border-black bg-[#fff9f0] sticky top-0 z-30">
      <div class="max-w-3xl mx-auto px-4 py-4">
        <h1 class="text-2xl font-black uppercase tracking-tight">
          {{ language === 'es' ? 'Clases grupales' : 'Group classes' }}
        </h1>
        <p class="text-sm text-gray-600 mt-1 font-mono">
          {{
            language === 'es'
              ? 'Todos los programas publicados. Usa filtros solo si lo necesitas.'
              : 'All published programs. Use filters only when you need to.'
          }}
        </p>
      </div>
    </header>

    <div class="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <!-- Skatepark -->
      <section>
        <p class="text-xs font-bold uppercase tracking-wider mb-2">
          {{ language === 'es' ? 'Skatepark' : 'Skatepark' }}
        </p>
        <button
          type="button"
          class="w-full border-2 border-black rounded-lg py-4 px-4 text-left font-black uppercase transition-all"
          :class="selectedSkatepark ? 'bg-black text-white' : 'bg-white'"
        >
          {{ selectedSkatepark }}
        </button>
      </section>

      <!-- Filter by day -->
      <section class="border-t border-gray-300 pt-4">
        <p class="text-sm font-mono text-gray-700 mb-2 flex items-center gap-2">
          <span>📅</span>
          {{ language === 'es' ? 'Filtrar por día' : 'Filter by Day(s)' }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="d in dayOptions"
            :key="d.v"
            type="button"
            class="px-3 py-2 rounded-full border-2 text-sm font-bold transition-colors"
            :class="selectedDays.includes(d.v) ? 'border-black bg-black text-white' : 'border-gray-400 bg-white'"
            @click="toggleDay(d.v)"
          >
            {{ d.label }}
          </button>
        </div>
      </section>

      <!-- Filter by age group (optional) -->
      <section class="border-t border-gray-300 pt-4">
        <p class="text-sm font-mono text-gray-700 mb-2 flex items-center gap-2">
          <span>👥</span>
          {{ language === 'es' ? 'Filtrar por grupo de edad' : 'Filter by age group' }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="band in PROGRAM_AGE_BANDS"
            :key="band.id"
            type="button"
            class="px-3 py-2 rounded-xl border-2 text-left text-xs font-bold transition-colors flex items-center gap-2"
            :class="
              selectedAgeBand === band.id
                ? 'border-black bg-teal-600 text-white'
                : 'border-gray-400 bg-white text-gray-800'
            "
            @click="toggleAgeBand(band.id)"
          >
            <span aria-hidden="true">{{ band.emoji }}</span>
            <span>{{ language === 'es' ? band.label.es : band.label.en }}</span>
          </button>
        </div>
        <p v-if="ageFilterError" class="mt-3 text-sm text-red-700 bg-red-50 border-2 border-red-300 rounded-xl px-3 py-2">
          {{ ageFilterError }}
        </p>
      </section>

      <!-- Student recommendations (optional filter) -->
      <section v-if="user && participants.length" class="border-t border-gray-300 pt-4">
        <p class="text-sm font-mono text-gray-700 mb-2">
          {{ language === 'es' ? 'Recomendaciones por patinador' : 'Student class recommendations' }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in participants"
            :key="p.key"
            type="button"
            class="px-4 py-2 rounded-full border-2 text-sm font-black uppercase transition-colors"
            :class="
              selectedSkaterKeys.includes(p.key)
                ? 'border-black bg-white ring-2 ring-black ring-offset-1'
                : 'border-gray-400 bg-white'
            "
            @click="toggleSkaterFilter(p.key)"
          >
            {{ p.firstName }}{{ p.isYou ? ` (${language === 'es' ? 'tú' : 'you'})` : '' }}
          </button>
        </div>
      </section>

      <p v-if="loadError" class="text-sm text-red-600 font-medium">{{ loadError }}</p>
      <p v-if="enrollSuccess" class="text-sm text-teal-700 font-medium">{{ enrollSuccess }}</p>

      <div v-if="loading" class="h-40 bg-white border-2 border-black rounded-xl animate-pulse" />

      <p v-else-if="sessions.length === 0" class="text-center text-gray-600 py-12 font-mono text-sm">
        {{
          language === 'es'
            ? 'No hay clases publicadas aún.'
            : 'No published classes yet.'
        }}
      </p>

      <p v-else-if="filteredSessions.length === 0" class="text-center text-gray-600 py-12 font-mono text-sm">
        {{
          language === 'es'
            ? 'Ninguna clase coincide con tus filtros. Quítalos para ver todo.'
            : 'No classes match your filters. Clear filters to see everything.'
        }}
      </p>

      <div v-if="!loading && filteredSessions.length > 0" class="grid gap-4 sm:grid-cols-2">
        <article
          v-for="s in filteredSessions"
          :key="s.id"
          class="border-[3px] border-black rounded-xl bg-white flex flex-col overflow-hidden"
        >
          <div class="flex items-start justify-between gap-2 p-3 border-b-2 border-black">
            <span class="text-[10px] font-bold uppercase bg-gray-100 px-2 py-1 rounded">
              {{ skillLabel(s.skill_level) }}
            </span>
            <div class="flex flex-col items-end gap-1 shrink-0">
              <span class="text-[10px] font-bold bg-teal-600 text-white px-2 py-1 rounded text-right leading-tight">
                {{ formatPrice(monthlyPrice(s)) }}
                <span class="block font-mono font-normal opacity-90 normal-case">
                  {{ language === 'es' ? 'programa mensual' : 'monthly program' }}
                </span>
              </span>
              <span class="text-[10px] font-bold bg-black text-white px-2 py-1 rounded text-right leading-tight">
                {{ formatPrice(DROP_IN_CLASS_PRICE_MXN) }}
                <span class="block font-mono font-normal opacity-90 normal-case">
                  {{ language === 'es' ? 'clase individual' : 'individual class' }}
                </span>
              </span>
            </div>
          </div>

          <div class="p-4 flex-1 flex flex-col">
            <h2 class="text-xl font-black uppercase leading-tight">{{ s.title }}</h2>
            <p v-if="audienceLabels(s) || s.min_age != null" class="text-sm font-bold mt-1 text-gray-700 font-mono">
              <template v-if="audienceLabels(s)">{{ audienceLabels(s) }}</template>
              <template v-else-if="s.min_age != null || s.max_age != null">
                {{ language === 'es' ? 'Edades' : 'Ages' }} {{ s.min_age ?? '—' }}–{{ s.max_age ?? '—' }}
              </template>
            </p>

            <ul class="mt-3 space-y-2 text-sm font-mono">
              <li class="flex items-start gap-2">
                <span>📍</span>
                <span>{{ s.skatepark || selectedSkatepark }}</span>
              </li>
              <li class="flex items-start gap-2">
                <span>📅</span>
                <span>
                  {{ formatSessionDate(s.start_date) }}
                  <template v-if="s.time_slot">
                    · {{ TIME_SLOT_LABELS[s.time_slot].display }}
                  </template>
                </span>
              </li>
            </ul>

            <div class="mt-4">
              <div class="h-3 bg-gray-200 rounded-full overflow-hidden border-2 border-black">
                <div
                  class="h-full transition-all"
                  :class="spotsBarClass(s)"
                  :style="{ width: `${spotsFillPct(s)}%` }"
                />
              </div>
              <p
                class="text-center text-xs font-black uppercase mt-2 tracking-wide text-teal-700"
                :class="{
                  'text-amber-700': s.status === 'almost_full',
                  'text-red-600': s.status === 'full',
                  'text-gray-500': s.status === 'no_coaches',
                }"
              >
                {{ spotsLabel(s) }}
              </p>
            </div>
          </div>

          <div class="p-3 border-t-2 border-black">
            <button
              v-if="anyEnrolled(s)"
              type="button"
              disabled
              class="w-full py-3 rounded-lg bg-teal-600 text-white font-bold text-sm"
            >
              ✓ {{ language === 'es' ? 'Inscrito en tu crew' : 'Enrolled in your crew' }}
            </button>
            <button
              v-else
              type="button"
              class="w-full py-3 rounded-lg font-black text-sm uppercase text-white tracking-wide
                bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400
                hover:from-teal-400 hover:via-cyan-400 hover:to-amber-300
                shadow-[0_4px_14px_rgba(20,184,166,0.45)]
                hover:shadow-[0_6px_20px_rgba(20,184,166,0.55)]
                hover:scale-[1.02] active:scale-[0.98]
                transition-all duration-200 disabled:opacity-40 disabled:hover:scale-100 disabled:shadow-none"
              :disabled="enrollingId === s.id || s.status === 'full' || s.status === 'no_coaches'"
              @click="openEnrollModal(s)"
            >
              {{
                enrollingId === s.id
                  ? '…'
                  : user
                    ? language === 'es'
                      ? 'Inscribirse'
                      : 'Register'
                    : language === 'es'
                      ? 'Iniciar sesión'
                      : 'Sign in'
              }}
            </button>
          </div>

          <div class="border-t-2 border-black">
            <button
              type="button"
              class="relative w-full py-3 bg-black text-white font-mono text-sm tracking-wide hover:bg-gray-900 transition-colors"
              :aria-expanded="isDetailsOpen(s.id)"
              @click="toggleDetails(s.id)"
            >
              <span>{{ language === 'es' ? 'Detalles' : 'Details' }}</span>
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-lg leading-none" aria-hidden="true">
                {{ isDetailsOpen(s.id) ? '−' : '+' }}
              </span>
            </button>
            <div
              v-if="isDetailsOpen(s.id)"
              class="bg-black text-white px-4 pb-4 pt-1 border-t border-white/20"
            >
              <button
                type="button"
                class="text-[10px] font-mono uppercase tracking-widest text-gray-400 mb-3 hover:text-white"
                @click="toggleDetails(s.id)"
              >
                {{ language === 'es' ? '— Ocultar descripción' : '— Hide description' }}
              </button>
              <p class="text-sm font-mono leading-relaxed whitespace-pre-wrap text-gray-100">
                {{ sessionDetailsText(s) }}
              </p>
              <ul class="mt-3 space-y-1 text-xs font-mono text-gray-300">
                <li>* {{ formatPrice(monthlyPrice(s)) }} — {{ language === 'es' ? 'programa mensual' : 'monthly program' }}</li>
                <li>* {{ formatPrice(DROP_IN_CLASS_PRICE_MXN) }} — {{ language === 'es' ? 'clase individual' : 'individual / drop-in class' }}</li>
                <li>* {{ s.skatepark || selectedSkatepark }}</li>
              </ul>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- Enroll modal: confirm skater(s) -->
    <Teleport to="body">
      <div
        v-if="enrollModalSession"
        class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
        @click.self="closeEnrollModal"
      >
        <div
          class="w-full sm:max-w-md bg-[#fff9f0] text-gray-900 border-[3px] border-black rounded-t-2xl sm:rounded-2xl p-5 shadow-xl max-h-[90vh] overflow-y-auto"
          @click.stop
        >
          <div class="mb-4">
            <div class="h-3 bg-gray-200 rounded-full overflow-hidden border-2 border-black mb-2">
              <div
                class="h-full bg-teal-600 transition-all"
                :class="spotsBarClass(enrollModalSession)"
                :style="{ width: `${spotsFillPct(enrollModalSession)}%` }"
              />
            </div>
            <p class="text-center text-xs font-black uppercase text-teal-700 tracking-wide">
              {{ spotsLabel(enrollModalSession) }}
            </p>
          </div>

          <button
            type="button"
            class="w-full py-3 mb-4 rounded-xl border-2 border-black font-mono text-gray-600 hover:bg-gray-100"
            @click="closeEnrollModal"
          >
            × {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
          </button>

          <h3 class="text-sm font-black uppercase text-teal-700 tracking-wide">
            {{ language === 'es' ? '¿Quién se inscribe?' : "Who's registering?" }}
          </h3>
          <p class="text-xs text-teal-600 font-mono mb-3">
            {{ language === 'es' ? 'Elige uno o varios' : 'Select one, select multiple' }}
          </p>

          <p
            v-if="modalHidden.length && enrollModalSession"
            class="text-xs text-gray-600 bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 mb-3 font-mono"
          >
            {{
              language === 'es'
                ? `Algunos patinadores no aparecen — esta clase requiere edades ${modalAgeRangeLabel(enrollModalSession)}.`
                : `Some students are hidden — this class requires ages ${modalAgeRangeLabel(enrollModalSession)}.`
            }}
          </p>

          <p
            v-if="modalEligible.length === 0"
            class="text-sm text-red-700 bg-red-50 border-2 border-red-300 rounded-xl px-3 py-2 mb-3"
          >
            {{
              language === 'es'
                ? `Ningún patinador de tu crew cumple la edad (${modalAgeRangeLabel(enrollModalSession)}).`
                : `None of your students meet the age requirement (${modalAgeRangeLabel(enrollModalSession)}).`
            }}
          </p>

          <div v-else class="space-y-2 mb-4">
            <button
              v-for="p in modalEligible"
              :key="p.key"
              type="button"
              class="w-full py-3 px-4 rounded-xl border-2 text-left font-black uppercase transition-colors text-gray-900"
              :class="
                modalSelectedKeys.includes(p.key)
                  ? 'border-black bg-white ring-2 ring-black'
                  : 'border-gray-400 bg-white'
              "
              :disabled="isEnrolled(enrollModalSession!, p)"
              @click="toggleModalSkater(p.key)"
            >
              {{ p.displayName || p.firstName }}{{ p.isYou ? ` (${language === 'es' ? 'tú' : 'you'})` : '' }}
              <span v-if="p.age != null" class="text-xs font-mono font-normal text-gray-500 ml-1 normal-case">
                · {{ p.age }} {{ language === 'es' ? 'años' : 'yrs' }}
              </span>
              <span v-if="isEnrolled(enrollModalSession!, p)" class="text-xs text-teal-600 block font-mono">
                {{ language === 'es' ? 'Ya inscrito' : 'Already enrolled' }}
              </span>
            </button>
          </div>

          <p v-if="enrollError" class="text-sm text-red-600 mb-3">{{ enrollError }}</p>

          <button
            type="button"
            class="w-full py-3 rounded-xl bg-black text-white font-black uppercase disabled:opacity-40"
            :disabled="enrollingId != null || !modalEligible.length"
            @click="confirmEnroll"
          >
            {{
              enrollingId
                ? '…'
                : language === 'es'
                  ? 'Confirmar inscripción'
                  : 'Confirm registration'
            }}
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
