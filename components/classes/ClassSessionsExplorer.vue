<script setup lang="ts">
import { format, getDay } from 'date-fns'
import { es } from 'date-fns/locale'
import type { CrewParticipant } from '~/composables/useCrew'
import {
  coachTierLabel,
  getClassPriceMxn,
  normalizeCoachTier,
  programPriceHint,
} from '~/utils/classPricing'
import {
  DEFAULT_SKATEPARK,
  PROGRAM_AGE_BANDS,
  PROGRAM_SKILL_TRACKS,
  SKATE_SKILL_LEVELS,
  TIME_SLOT_LABELS,
  audienceAgeRange,
  audienceCategoryLabel,
  multiClassPacksForSeriesLength,
  packPriceMxn as parentPackPriceMxn,
  parseAudienceCategories,
  skillTrackFromLevelId,
  isSingleClassPack,
  PARENT_SINGLE_CLASSES,
  type AudienceCategory,
  type BookableClassSession,
  type ParentClassPack,
  type ParentMultiClassPack,
  type ParentSingleClass,
  type ProgramSkillTrack,
} from '~/types'
import { ineligibilityReason, isAgeEligibleForSession, sessionAgeBounds } from '~/utils/ageEligibility'
import { classKindForPack } from '~/utils/coupons'
import type { AppliedCoupon } from '~/components/checkout/CouponField.vue'
import {
  applyMultiStudentDiscount,
  DEFAULT_PROGRAM_LOCATION,
  getProgramSeasonBySlug,
  isSummerCourseSeason,
  multiStudentDiscountRate,
  pickDefaultProgramSeason,
  isOpenProgramSeason,
  type ProgramSeason,
} from '~/utils/programSeasons'

const props = withDefaults(
  defineProps<{
    seasonSlug?: string
    season?: ProgramSeason | null
    registrationOpen?: boolean
  }>(),
  {
    seasonSlug: '',
    season: null,
    registrationOpen: true,
  },
)

const route = useRoute()
const router = useRouter()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { language, formatPrice } = useI18n()
const { participants, refreshCrew, activeKey } = useCrew()

const loading = ref(true)
const enrollingId = ref<string | null>(null)
const enrollError = ref('')
const enrollSuccess = ref('')
const sessions = ref<BookableClassSession[]>([])
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
/** Optional browse filter by skill track — null = show all */
const selectedSkillTrack = ref<ProgramSkillTrack | null>(null)
/** Crew members to show recommendations for — empty = every class */
const recommendKeys = ref<Set<string>>(new Set())

const enrollModalSession = ref<BookableClassSession | null>(null)
const selectedPack = ref<ParentClassPack>(8)
const selectedPackDays = ref<number[]>([])
const modalSelectedKeys = ref<string[]>([])

const { seasons: seasonCatalog } = useProgramSeasons()
const openSeasonCatalog = computed(() => seasonCatalog.value.filter(s => isOpenProgramSeason(s)))
const pickedSeasonSlug = ref('')
const allowSeasonSwitch = computed(() => !props.seasonSlug)

watch(
  openSeasonCatalog,
  (list) => {
    if (props.seasonSlug) return
    if (!pickedSeasonSlug.value || !list.some(s => s.slug === pickedSeasonSlug.value)) {
      pickedSeasonSlug.value = pickDefaultProgramSeason(list)?.slug || ''
    }
  },
  { immediate: true },
)

const activeSeasonSlug = computed(() => props.seasonSlug || pickedSeasonSlug.value)

const activeSeason = computed(() => {
  if (props.season) return props.season
  const slug = activeSeasonSlug.value
  if (!slug) return undefined
  return seasonCatalog.value.find(s => s.slug === slug) || getProgramSeasonBySlug(slug)
})

const pageTitle = computed(() => {
  if (activeSeason.value) {
    return language.value === 'es' ? activeSeason.value.name.es : activeSeason.value.name.en
  }
  return language.value === 'es' ? 'Clases grupales' : 'Group classes'
})

/**
 * The hero must stay on one line for every season, including admin-created ones
 * like "Curso de Verano 26", so the size follows the character count instead of
 * a fixed clamp that only fitted the short names.
 */
const pageTitleStyle = computed(() => {
  // A bold uppercase glyph advances ~0.76em at 0.12em tracking; 0.8 leaves margin.
  const em = Math.max(pageTitle.value.length, 1) * 0.8
  return { fontSize: `min(6.5rem, calc((min(64rem, 100vw) - 3rem) / ${em.toFixed(1)}))` }
})

const pageSubtitle = computed(() => {
  if (activeSeason.value) {
    const dates = language.value === 'es' ? activeSeason.value.dates.es : activeSeason.value.dates.en
    return `${dates} · ${DEFAULT_PROGRAM_LOCATION}`
  }
  return language.value === 'es'
    ? 'Martes, jueves y sábado. Clase suelta, 8/12 (4 sem) o 16/24 (8 sem).'
    : 'Tuesday, Thursday, and Saturday. Drop-in, 8/12 (4 wk) or 16/24 (8 wk).'
})

const canRegister = computed(() => {
  if (props.seasonSlug) return props.registrationOpen
  return activeSeason.value ? activeSeason.value.status === 'enrolling' : true
})

/** Official training days: Tuesday, Thursday, Saturday — or Mon–Fri for summer. */
const dayOptions = computed(() => {
  const esLang = language.value === 'es'
  if (activeSeason.value && isSummerCourseSeason(activeSeason.value.slug)) {
    return [
      { v: 1, label: esLang ? 'Lunes' : 'Monday' },
      { v: 2, label: esLang ? 'Martes' : 'Tuesday' },
      { v: 3, label: esLang ? 'Miércoles' : 'Wednesday' },
      { v: 4, label: esLang ? 'Jueves' : 'Thursday' },
      { v: 5, label: esLang ? 'Viernes' : 'Friday' },
    ]
  }
  return [
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

const toggleSkillTrack = (id: ProgramSkillTrack) => {
  selectedSkillTrack.value = selectedSkillTrack.value === id ? null : id
}

const selectSeason = (slug: string) => {
  pickedSeasonSlug.value = slug
}

/**
 * Purely a local "show me what fits these skaters" filter. It deliberately
 * leaves both the age/level buttons and the app-wide Familia switcher alone,
 * so picking a skater here cannot silently re-filter the rest of the page.
 */
function toggleRecommendSkater(key: string) {
  const next = new Set(recommendKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  recommendKeys.value = next
}

const isRecommendFor = (key: string) => recommendKeys.value.has(key)

const clearRecommendFilter = () => {
  recommendKeys.value = new Set()
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

const sessionMatchesLevelFilter = (s: BookableClassSession) => {
  if (!selectedSkillTrack.value) return true
  return skillTrackFromLevelId(s.skill_level) === selectedSkillTrack.value
}

/** A class is recommended when at least one picked skater is old enough for it. */
const sessionMatchesRecommendFilter = (s: BookableClassSession) => {
  if (!recommendKeys.value.size) return true
  return participants.value.some(
    p => recommendKeys.value.has(p.key) && participantEligible(p, s),
  )
}

const filteredSessions = computed(() =>
  sessions.value.filter(s => {
    if (!matchesSkatepark(s)) return false
    if (selectedDays.value.length && !selectedDays.value.includes(sessionDay(s.start_date))) return false
    if (!sessionMatchesAgeBandFilter(s)) return false
    if (!sessionMatchesLevelFilter(s)) return false
    if (!sessionMatchesRecommendFilter(s)) return false
    return true
  }),
)

const crewInSelectedBands = computed(() => {
  const bandId = selectedAgeBand.value
  if (!bandId) return participants.value
  return participants.value.filter(p => p.age != null && ageInBand(p.age!, bandId))
})

/**
 * Browsing an age band nobody in the crew fits is allowed on purpose — the
 * enrol modal is what enforces the age, so this only sets expectations.
 */
const ageFilterNotice = computed(() => {
  const bandId = selectedAgeBand.value
  if (!user.value || !bandId) return null
  if (crewInSelectedBands.value.length > 0) return null
  const band = PROGRAM_AGE_BANDS.find(b => b.id === bandId)
  const label = band ? (language.value === 'es' ? band.label.es : band.label.en) : bandId
  return language.value === 'es'
    ? `Puedes ver las clases de ${label}, pero para inscribirte necesitas un patinador de esa edad en Familia.`
    : `You can browse ${label} classes, but registering needs a skater that age under Family.`
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

const seriesSizeById = computed(() => {
  const map = new Map<string, number>()
  for (const s of sessions.value) {
    if (!s.program_series_id) continue
    map.set(s.program_series_id, (map.get(s.program_series_id) || 0) + 1)
  }
  return map
})

const sessionSeriesCount = (s: BookableClassSession) =>
  s.program_series_id ? (seriesSizeById.value.get(s.program_series_id) || 1) : 1

const sessionIsSummer = (s: BookableClassSession) => isSummerCourseSeason(s.season_slug)

const multiPacksForSession = (s: BookableClassSession): ParentMultiClassPack[] => {
  if (sessionIsSummer(s)) return []
  return multiClassPacksForSeriesLength(sessionSeriesCount(s))
}

const packPriceMxn = (pack: ParentMultiClassPack) => parentPackPriceMxn(pack)

const packLabel = (pack: ParentClassPack, esLang: boolean) => {
  if (pack === 'group_1') return esLang ? '1 clase grupal' : '1 group class'
  if (pack === 'individual_1') return esLang ? '1 clase personalizada' : '1 private class'
  if (pack === 4) return esLang ? '4 clases · 1/semana · 4 sem' : '4 classes · 1/week · 4 wk'
  if (pack === 8) return esLang ? '8 clases · 2/semana · 4 sem' : '8 classes · 2/week · 4 wk'
  if (pack === 12) return esLang ? '12 clases · 3/semana · 4 sem' : '12 classes · 3/week · 4 wk'
  if (pack === 16) return esLang ? '16 clases · 2/semana · 8 sem' : '16 classes · 2/week · 8 wk'
  return esLang ? '24 clases · 3/semana · 8 sem' : '24 classes · 3/week · 8 wk'
}

/** The coach picked when the program was created decides the price list. */
const sessionCoachTier = (s: BookableClassSession) => normalizeCoachTier(s.coach_tier)

const groupDropInPrice = (s: BookableClassSession) =>
  getClassPriceMxn(sessionCoachTier(s), 'group_session')

const individualDropInPrice = (s: BookableClassSession) =>
  getClassPriceMxn(sessionCoachTier(s), 'individual_session')

const selectedPackPrice = (s: BookableClassSession, pack: ParentClassPack) => {
  if (pack === 'group_1') return groupDropInPrice(s)
  if (pack === 'individual_1') return individualDropInPrice(s)
  return packPriceMxn(pack)
}

const singleClassSubtitle = (pack: ParentSingleClass, esLang: boolean) =>
  pack === 'group_1'
    ? (esLang ? 'Sesión suelta en grupo' : 'Drop-in with the group')
    : (esLang ? 'Uno a uno con el coach' : 'One-to-one with the coach')

const packNeedsTwoDays = (pack: ParentClassPack) => pack === 8 || pack === 16

const modalSubtotalMxn = computed(() => {
  const s = enrollModalSession.value
  if (!s || !modalSelectedKeys.value.length) return 0
  return selectedPackPrice(s, selectedPack.value) * modalSelectedKeys.value.length
})

const modalDiscountRate = computed(() => multiStudentDiscountRate(modalSelectedKeys.value.length))

/** After the sibling discount, before any coupon. */
const modalAfterSiblingMxn = computed(() =>
  applyMultiStudentDiscount(modalSubtotalMxn.value, modalSelectedKeys.value.length),
)

// ---------------------------------------------------------------------------
// Coupon codes
// ---------------------------------------------------------------------------

const appliedCoupon = ref<AppliedCoupon | null>(null)

const couponClassKind = computed(() => classKindForPack(selectedPack.value))

const couponCoachTier = computed(() =>
  enrollModalSession.value ? sessionCoachTier(enrollModalSession.value) : null,
)

/** Validate against the first selected skater, since allow-lists are per skater. */
const couponCrewMemberId = computed(() => {
  const key = modalSelectedKeys.value[0]
  if (!key) return null
  return participants.value.find(p => p.key === key)?.crewMemberId ?? null
})

const couponDiscountMxn = computed(() =>
  appliedCoupon.value
    ? Math.min(appliedCoupon.value.discountMxn, modalAfterSiblingMxn.value)
    : 0,
)

const modalTotalMxn = computed(() =>
  Math.max(0, modalAfterSiblingMxn.value - couponDiscountMxn.value),
)

const onCouponApplied = (coupon: AppliedCoupon | null) => {
  appliedCoupon.value = coupon
}

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
  const slot = s.time_slot ? TIME_SLOT_LABELS[s.time_slot]?.display : null
  if (language.value === 'es') {
    const bits = [
      `Clase grupal NiikSkate en ${s.skatepark || selectedSkatepark.value}.`,
      audience ? `Audiencia: ${audience}.` : null,
      ages ? `Edades: ${ages}.` : null,
      `Nivel: ${skillLabel(s.skill_level)}.`,
      slot ? `Horario: ${slot}.` : null,
      `Programa ${multiPacksForSession(s).map(p => `${p} clases ${formatPrice(packPriceMxn(p))}`).join(' · ') || 'curso de verano'} · Grupal ${formatPrice(groupDropInPrice(s))} · Individual ${formatPrice(individualDropInPrice(s))}.`,
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
    `${multiPacksForSession(s).map(p => `${p}-class pack ${formatPrice(packPriceMxn(p))}`).join(' · ') || 'summer course'} · Group ${formatPrice(groupDropInPrice(s))} · Individual ${formatPrice(individualDropInPrice(s))}.`,
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

/** Crew members old enough for this class who have not joined it yet. */
const joinableParticipants = (s: BookableClassSession) =>
  participants.value.filter(p => participantEligible(p, s) && !isEnrolled(s, p))

/**
 * Only close the card once nobody is left to add. Enrolling one sibling used
 * to lock the whole class, so a second skater could never be signed up.
 */
const familyFullyEnrolled = (s: BookableClassSession) =>
  anyEnrolled(s) && joinableParticipants(s).length === 0

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
      query: {
        skatepark: selectedSkatepark.value,
        ...(activeSeasonSlug.value ? { season: activeSeasonSlug.value } : {}),
      },
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
  if (!canRegister.value) {
    enrollError.value =
      language.value === 'es'
        ? 'Las inscripciones para esta temporada aún no están abiertas.'
        : 'Registration for this season is not open yet.'
    return
  }
  if (!user.value) {
    router.push(`/auth/login?redirect=${encodeURIComponent(route.fullPath)}`)
    return
  }
  if (s.status === 'full' || s.status === 'no_coaches') return
  enrollModalSession.value = s
  const packs = multiPacksForSession(s)
  selectedPack.value = sessionIsSummer(s) ? 'group_1' : (packs[0] || 8)
  selectedPackDays.value = []
  // Start from whoever the recommendation filter is showing, else the Familia
  // skater. Anyone already in the class is left out so nothing is booked twice.
  const joinable = joinableParticipants(s)
  const picked = recommendKeys.value.size
    ? joinable.filter(p => recommendKeys.value.has(p.key))
    : joinable.filter(p => p.key === activeKey.value)
  modalSelectedKeys.value = picked.map(p => p.key)
}

function closeEnrollModal() {
  enrollModalSession.value = null
  modalSelectedKeys.value = []
  selectedPackDays.value = []
  enrollError.value = ''
}

function choosePack(pack: ParentClassPack) {
  selectedPack.value = pack
  if (!packNeedsTwoDays(pack)) selectedPackDays.value = []
}

function togglePackDay(day: number) {
  if (!packNeedsTwoDays(selectedPack.value)) return
  const i = selectedPackDays.value.indexOf(day)
  if (i >= 0) selectedPackDays.value = selectedPackDays.value.filter(d => d !== day)
  else if (selectedPackDays.value.length < 2) {
    selectedPackDays.value = [...selectedPackDays.value, day].sort((a, b) => a - b)
  }
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
  if (packNeedsTwoDays(selectedPack.value) && selectedPackDays.value.length !== 2) {
    enrollError.value =
      language.value === 'es'
        ? 'Elige 2 días por semana (martes, jueves o sábado).'
        : 'Pick 2 days per week (Tuesday, Thursday, or Saturday).'
    return
  }

  enrollingId.value = s.id
  enrollError.value = ''
  try {
    const { data: authData } = await client.auth.getSession()
    const token = authData.session?.access_token
    if (!token) throw new Error(language.value === 'es' ? 'Sesión expirada' : 'Session expired')

    const names: string[] = []
    // The coupon covers the whole modal total, so it rides on the first request
    // only — otherwise a family of two would burn two redemptions.
    let couponPending = !!appliedCoupon.value
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
          pack: isSingleClassPack(selectedPack.value) ? null : selectedPack.value,
          weekdays: packNeedsTwoDays(selectedPack.value)
            ? selectedPackDays.value
            : selectedPack.value === 12 || selectedPack.value === 24
              ? [2, 4, 6]
              : [],
          ...(couponPending
            ? {
                couponCode: appliedCoupon.value!.code,
                couponSubtotalMxn: modalAfterSiblingMxn.value,
                couponClassKind: couponClassKind.value,
                couponCoachTier: couponCoachTier.value,
              }
            : {}),
        },
      })
      couponPending = false
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
watch(activeSeasonSlug, loadSessions)
onMounted(async () => {
  if (user.value) await refreshCrew()
  await loadSessions()
})
</script>

<template>
  <div class="min-h-screen bg-[#fff9f0] text-gray-900 pb-28">
    <header class="bg-[#fff9f0] pt-6 pb-4">
      <div class="max-w-5xl mx-auto px-4 text-center">
        <h1
          class="font-black uppercase tracking-[0.12em] leading-none text-black whitespace-nowrap"
          :style="pageTitleStyle"
        >
          {{ pageTitle }}
        </h1>
        <p class="text-sm text-gray-600 mt-4 font-mono">
          {{ pageSubtitle }}
        </p>
        <p v-if="activeSeasonSlug && !canRegister" class="text-sm text-gray-500 mt-1">
          {{ language === 'es' ? 'Pronto' : 'Coming soon' }}
        </p>
      </div>
    </header>

    <div class="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <p
        v-if="activeSeasonSlug && !canRegister"
        class="rounded-xl border-2 border-amber-500 bg-amber-50 text-amber-900 px-4 py-3 text-sm font-medium"
      >
        {{
          language === 'es'
            ? 'Esta temporada se publicará pronto. Las inscripciones aún no están abiertas.'
            : 'This season is coming soon. Registration is not open yet.'
        }}
      </p>

      <details class="rounded-xl border-2 border-teal-600/40 bg-white shadow-sm">
        <summary
          class="cursor-pointer list-none flex items-center justify-between gap-3 px-4 py-3 text-teal-700 font-bold text-sm sm:text-base"
        >
          <span>{{ language === 'es' ? 'Cómo funciona' : 'How this works' }}</span>
          <span class="text-teal-500 text-xs font-mono shrink-0" aria-hidden="true">▼</span>
        </summary>
        <div class="px-4 pb-4 pt-1 text-sm text-gray-600 leading-relaxed space-y-2 border-t border-teal-100">
          <p>
            {{
              language === 'es'
                ? programPriceHint('principiante', true)
                : programPriceHint('principiante', false)
            }}
          </p>
          <p>
            {{
              language === 'es'
                ? programPriceHint('pro_street', true)
                : programPriceHint('pro_street', false)
            }}
          </p>
          <p>
            {{
              language === 'es'
                ? 'Elige la clase que corresponda a la edad y nivel de tu patinador e inscríbelo. Los lugares se llenan rápido — conviene registrarse temprano.'
                : 'Pick the class that fits your skater’s age and level and complete registration. Spots fill quickly — register early.'
            }}
          </p>
          <p>
            {{
              language === 'es'
                ? 'Descuentos automáticos al inscribir a 2 patinadores (hermanos o varios estudiantes): 10% cada uno; con 3 o más, 15% cada uno.'
                : 'Automatic discounts when enrolling 2 skaters (siblings or multiple students): 10% each; with 3 or more, 15% each.'
            }}
          </p>
        </div>
      </details>

      <section v-if="allowSeasonSwitch && openSeasonCatalog.length" class="border-t border-gray-300 pt-4">
        <p class="text-sm font-mono text-gray-700 mb-2 flex items-center justify-center gap-2">
          <span>⛅</span>
          {{ language === 'es' ? 'Temporada' : 'Season' }}
        </p>
        <div class="flex flex-wrap justify-center gap-2">
          <button
            v-for="s in openSeasonCatalog"
            :key="s.slug"
            type="button"
            class="px-3 py-2 rounded-2xl border-2 text-left transition-colors"
            :class="
              activeSeasonSlug === s.slug
                ? 'border-black bg-teal-600 text-white'
                : 'border-gray-400 bg-white text-gray-800'
            "
            @click="selectSeason(s.slug)"
          >
            <span class="block text-sm font-bold leading-tight">
              {{ language === 'es' ? s.name.es : s.name.en }}
            </span>
            <span
              class="block text-[10px] font-mono font-normal mt-0.5 leading-tight"
              :class="activeSeasonSlug === s.slug ? 'text-white/80' : 'text-gray-500'"
            >
              {{ language === 'es' ? s.dates.es : s.dates.en }}
            </span>
          </button>
        </div>
      </section>

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
        <p class="text-sm font-mono text-gray-700 mb-2 flex items-center justify-center gap-2">
          <span>📅</span>
          {{ language === 'es' ? 'Filtrar por día' : 'Filter by Day(s)' }}
        </p>
        <div class="flex flex-wrap justify-center gap-2">
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

      <!-- Filter by age group + level -->
      <section class="border-t border-gray-300 pt-4">
        <div class="grid sm:grid-cols-2 gap-4 sm:gap-5 items-start">
          <div class="min-w-0">
            <p class="text-sm font-mono text-gray-700 mb-2 flex items-center gap-2">
              <span>👥</span>
              {{ language === 'es' ? 'Filtrar por grupo de edad' : 'Filter by age group' }}
            </p>
            <div class="flex flex-nowrap gap-1.5">
              <button
                v-for="band in PROGRAM_AGE_BANDS"
                :key="band.id"
                type="button"
                class="px-2 py-2 rounded-xl border-2 text-left text-[11px] font-bold transition-colors flex items-center gap-1 shrink min-w-0 whitespace-nowrap"
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
          </div>
          <div class="min-w-0">
            <p class="text-sm font-mono text-gray-700 mb-2 flex items-center gap-2">
              <span>🚀</span>
              {{ language === 'es' ? 'Filtrar por nivel' : 'Filter by level' }}
            </p>
            <div class="grid grid-cols-3 gap-1.5">
              <button
                v-for="track in PROGRAM_SKILL_TRACKS"
                :key="track.id"
                type="button"
                class="px-1.5 py-2 rounded-xl border-2 text-center text-[11px] font-bold transition-colors flex items-center justify-center gap-1 min-w-0 whitespace-nowrap"
                :class="
                  selectedSkillTrack === track.id
                    ? 'border-black bg-teal-600 text-white'
                    : 'border-gray-400 bg-white text-gray-800'
                "
                @click="toggleSkillTrack(track.id)"
              >
                <span class="shrink-0" aria-hidden="true">{{ track.emoji }}</span>
                <span class="truncate">{{ language === 'es' ? track.label.es : track.label.en }}</span>
              </button>
            </div>
          </div>
        </div>
        <p v-if="ageFilterNotice" class="mt-3 text-sm text-gray-700 bg-gray-100 border-2 border-gray-300 rounded-xl px-3 py-2">
          {{ ageFilterNotice }}
        </p>
      </section>

      <!-- Local recommendation filter; independent of the Familia switcher. -->
      <section v-if="user && participants.length" class="border-t border-gray-300 pt-4">
        <div class="flex items-baseline justify-between gap-3 mb-2">
          <p class="text-sm font-mono text-gray-700">
            {{ language === 'es' ? 'Recomendaciones para tu crew:' : 'Recommendations for your crew:' }}
          </p>
          <button
            v-if="recommendKeys.size"
            type="button"
            class="text-xs font-bold text-teal-700 underline shrink-0"
            @click="clearRecommendFilter"
          >
            {{ language === 'es' ? 'Ver todas' : 'Show all' }}
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="p in participants"
            :key="p.key"
            type="button"
            class="px-4 py-2 rounded-full border-2 text-sm font-black uppercase transition-colors"
            :aria-pressed="isRecommendFor(p.key)"
            :class="
              isRecommendFor(p.key)
                ? 'border-black bg-teal-600 text-white ring-2 ring-black ring-offset-1'
                : 'border-gray-400 bg-white text-gray-900'
            "
            @click="toggleRecommendSkater(p.key)"
          >
            {{ p.firstName }}{{ p.isYou ? ` (${language === 'es' ? 'tú' : 'you'})` : '' }}
            <span v-if="p.age != null" class="font-mono font-normal text-xs opacity-80">
              · {{ p.age }}
            </span>
          </button>
        </div>
      </section>

      <p v-if="loadError" class="text-sm text-red-600 font-medium">{{ loadError }}</p>
      <p v-if="enrollSuccess" class="text-sm text-teal-700 font-medium">{{ enrollSuccess }}</p>

      <div id="clases">
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
              <span
                v-for="pack in multiPacksForSession(s)"
                :key="s.id + '-p' + pack"
                class="text-[10px] font-bold bg-teal-700 text-white px-2 py-1 rounded text-right leading-tight"
              >
                {{ formatPrice(packPriceMxn(pack)) }}
                <span class="block font-mono font-normal opacity-90 normal-case">
                  {{ packLabel(pack, language === 'es') }}
                </span>
              </span>
              <span class="text-[10px] font-bold bg-black text-white px-2 py-1 rounded text-right leading-tight">
                {{ formatPrice(groupDropInPrice(s)) }}
                <span class="block font-mono font-normal opacity-90 normal-case">
                  {{ language === 'es' ? 'grupal · 1 sesión' : 'group · 1 session' }}
                </span>
              </span>
              <span class="text-[10px] font-bold bg-gray-800 text-white px-2 py-1 rounded text-right leading-tight">
                {{ formatPrice(individualDropInPrice(s)) }}
                <span class="block font-mono font-normal opacity-90 normal-case">
                  {{ language === 'es' ? 'individual · 1 sesión' : 'individual · 1 session' }}
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
              v-if="familyFullyEnrolled(s)"
              type="button"
              disabled
              class="w-full py-3 rounded-lg bg-teal-600 text-white font-bold text-sm"
            >
              ✓ {{ language === 'es' ? 'Inscrito en tu familia' : 'Enrolled in your family' }}
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
              :disabled="enrollingId === s.id || s.status === 'full' || s.status === 'no_coaches' || !canRegister"
              @click="openEnrollModal(s)"
            >
              {{
                enrollingId === s.id
                  ? '…'
                  : !user
                    ? (language === 'es' ? 'Iniciar sesión' : 'Sign in')
                    : anyEnrolled(s)
                      ? (language === 'es' ? 'Inscribir a otro' : 'Add another skater')
                      : (language === 'es' ? 'Inscribirse' : 'Register')
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
                <li v-for="pack in multiPacksForSession(s)" :key="'det-' + pack">
                  * {{ formatPrice(packPriceMxn(pack)) }} — {{ packLabel(pack, language === 'es') }}
                </li>
                <li>* {{ formatPrice(groupDropInPrice(s)) }} — {{ language === 'es' ? 'grupal · 1 sesión' : 'group · 1 session' }}</li>
                <li>* {{ formatPrice(individualDropInPrice(s)) }} — {{ language === 'es' ? 'individual · 1 sesión' : 'individual · 1 session' }}</li>
                <li>* {{ coachTierLabel(sessionCoachTier(s), language === 'es') }}</li>
                <li>* {{ s.skatepark || selectedSkatepark }}</li>
              </ul>
            </div>
          </div>
        </article>
      </div>
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
            {{ language === 'es' ? 'Paquete' : 'Package' }}
          </h3>
          <div class="grid grid-cols-2 gap-2 mb-4 mt-2">
            <button
              v-for="single in PARENT_SINGLE_CLASSES"
              :key="'modal-single-' + single"
              type="button"
              class="rounded-xl border-2 px-3 py-3 text-left transition-colors"
              :class="selectedPack === single ? 'border-black bg-white ring-2 ring-black' : 'border-gray-400 bg-white'"
              @click="choosePack(single)"
            >
              <p class="text-xs font-black uppercase">{{ packLabel(single, language === 'es') }}</p>
              <p class="text-[11px] font-mono text-gray-600">{{ singleClassSubtitle(single, language === 'es') }}</p>
              <p class="text-sm font-black mt-1">
                {{ formatPrice(selectedPackPrice(enrollModalSession, single)) }}
              </p>
            </button>
            <button
              v-for="pack in multiPacksForSession(enrollModalSession)"
              :key="'modal-pack-' + pack"
              type="button"
              class="rounded-xl border-2 px-3 py-3 text-left transition-colors"
              :class="selectedPack === pack ? 'border-black bg-white ring-2 ring-black' : 'border-gray-400 bg-white'"
              @click="choosePack(pack)"
            >
              <p class="text-xs font-black uppercase">{{ pack }} {{ language === 'es' ? 'clases' : 'classes' }}</p>
              <p class="text-[11px] font-mono text-gray-600">{{ packLabel(pack, language === 'es') }}</p>
              <p class="text-sm font-black mt-1">{{ formatPrice(packPriceMxn(pack)) }}</p>
            </button>
          </div>

          <div v-if="packNeedsTwoDays(selectedPack)" class="mb-4">
            <p class="text-xs font-black uppercase text-teal-700 tracking-wide mb-2">
              {{ language === 'es' ? 'Elige 2 días' : 'Pick 2 days' }}
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="d in dayOptions"
                :key="'pack-' + d.v"
                type="button"
                class="px-3 py-2 rounded-full border-2 text-sm font-bold transition-colors"
                :class="selectedPackDays.includes(d.v) ? 'border-black bg-black text-white' : 'border-gray-400 bg-white'"
                @click="togglePackDay(d.v)"
              >
                {{ d.label }}
              </button>
            </div>
          </div>

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
                ? `Ningún patinador de tu familia cumple la edad (${modalAgeRangeLabel(enrollModalSession)}).`
                : `None of your family skaters meet the age requirement (${modalAgeRangeLabel(enrollModalSession)}).`
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

          <div
            v-if="modalSelectedKeys.length && enrollModalSession"
            class="mb-4 rounded-xl border-2 border-teal-600/30 bg-teal-50 px-4 py-3 text-sm"
          >
            <p class="font-bold text-teal-800">
              {{ language === 'es' ? 'Programa (estimado)' : 'Program (estimate)' }}
            </p>
            <p v-if="modalDiscountRate > 0" class="text-gray-600 line-through mt-1">
              {{ formatPrice(modalSubtotalMxn) }}
            </p>
            <p class="text-lg font-black text-teal-900">
              {{ formatPrice(modalTotalMxn) }}
              <span v-if="modalSelectedKeys.length > 1" class="text-xs font-mono font-normal text-teal-700">
                · {{ Math.round(modalDiscountRate * 100) }}%
                {{ language === 'es' ? 'desc. multi-estudiante' : 'multi-student off' }}
              </span>
            </p>
            <p v-if="couponDiscountMxn > 0" class="text-xs font-bold text-teal-700 mt-1">
              🎟️ {{ appliedCoupon?.code }} · −{{ formatPrice(couponDiscountMxn) }}
            </p>

            <div v-if="user" class="mt-3 pt-3 border-t border-teal-600/20">
              <CheckoutCouponField
                variant="light"
                :subtotal-mxn="modalAfterSiblingMxn"
                :class-kind="couponClassKind"
                :coach-tier="couponCoachTier"
                :crew-member-id="couponCrewMemberId"
                @applied="onCouponApplied"
              />
            </div>
          </div>

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
