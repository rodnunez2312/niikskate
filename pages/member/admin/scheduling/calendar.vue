<script setup lang="ts">
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isSameYear,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { getDay } from 'date-fns'
import type { AudienceCategory, SkateSkillLevelId, TimeSlot } from '~/types'
import { disciplineEmoji, disciplineLabel, isTrainingDiscipline, type TrainingDiscipline } from '~/utils/trainingDisciplines'
import { coachMatchesFirstName, defaultBackupFirstName } from '~/utils/coachBackups'
import {
  DEFAULT_SKATEPARK,
  EVENT_LOCATIONS,
  PROGRAM_MAX_CLASSES,
  PROGRAM_TOTAL_CLASSES,
  PROGRAM_WEEK_OPTIONS,
  PROGRAM_AGE_BANDS,
  PROGRAM_SKILL_TRACKS,
  SUMMER_COURSE_WEEK_OPTIONS,
  SUMMER_COURSE_WEEKDAY_PRESET,
  SUMMER_COURSE_SLOT,
  SUMMER_COURSE_SLOTS,
  TIME_SLOT_LABELS,
  mergedAudienceAgeRange,
  parseAudienceCategories,
  programClassCount,
  skillLevelIdFromTrack,
  skillTrackFromLevelId,
  SPOTS_PER_COACH,
  isProgressionAudience,
  type ProgramSkillTrack,
  type ProgramWeekCount,
} from '~/types'
import { ALL_WEEKDAY_OPTIONS, DEFAULT_PROGRAM_WEEKDAYS, PRACTICE_TIME_SLOTS, SUMMER_COURSE_WEEKDAY_OPTIONS, slotsForWeekday, slotsForWeekdays } from '~/utils/classSchedule'
import { horarioDisplay, horarioFromId, isTimeSlot, resolveHorario, type ProgramHorario } from '~/utils/programHorarios'
import { bookableOccurrences, computeSummerCourseEndDate, generateProgramOccurrences, nearestProgramStartDate, parseYmd, syncProgramDateRange, computeProgramEndDate } from '~/utils/recurringProgram'
import { MEXICO_NATIONAL_HOLIDAYS_2026_2027, mexicoHolidayName } from '~/utils/mexicoHolidays'
import { getProgramSeasonBySlug, isSummerCourseSeason, pickDefaultProgramSeason, resolveSeasonStatus, seasonStatusLabel, findOverlappingRegularSeason, seasonHighlightColor, stripedSeasonFill } from '~/utils/programSeasons'
import type { ProgramSeason } from '~/utils/programSeasons'
import {
  DEFAULT_COACH_TIER,
  getClassPriceMxn,
  getClassPriceRow,
  normalizeCoachTier,
  pricingGroupForDiscipline,
  proratePackagePriceMxn,
  resolveDefaultProgramPriceMxn,
  resolveProgramPackageKind,
  type ClassPackageKind,
  type CoachPricingTier,
} from '~/utils/classPricing'
import {
  classKindLabel,
  coachTierSheetLabel,
  effectivePriceMxn,
  formatMoneyMxn,
  FINANCE_CLASS_KINDS,
  FINANCE_COACH_TIERS,
  type FinancePriceRow,
} from '~/utils/finance'
import { useFinance } from '~/composables/useFinance'
import { fetchCoachDirectoryProfiles } from '~/composables/coachDirectory'
import { EVENT_TYPE_COLORS, SKILL_LEVEL_COLORS } from '~/utils/semanticColors'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

export type SchoolCalendarEventType =
  | 'event'
  | 'competition'
  | 'holiday'
  | 'school_closure'
  | 'school_open'
  | 'practice'
  | 'meeting'
  | 'camp'
  | 'show'
  | 'custom'
  | 'class_session'
  | 'birthday'
  | 'class_individual'

export interface SchoolCalendarRow {
  id: string
  title: string
  event_type: SchoolCalendarEventType
  start_date: string
  end_date: string | null
  all_day: boolean
  start_time: string | null
  end_time: string | null
  location: string | null
  description: string | null
  visible_to_parents: boolean
  is_bookable?: boolean
  time_slot?: TimeSlot | null
  skill_level?: string | null
  min_age?: number | null
  max_age?: number | null
  skatepark?: string | null
  price_mxn?: number | null
  coach_tier?: string | null
  audience_category?: string | null
  audience_categories?: string[] | null
  program_series_id?: string | null
  max_capacity_override?: number | null
  season_slug?: string | null
  discipline?: string | null
  cancelled_at?: string | null
  cancellation_reason?: string | null
  makeup_note?: string | null
  session_outcome?: 'done' | 'cancelled' | null
  created_at: string
}

type CreateMode = 'event' | 'program'

const EVENT_ONLY_TYPES: SchoolCalendarEventType[] = ['event', 'competition', 'birthday', 'meeting']
const PROGRAM_ONLY_TYPES: SchoolCalendarEventType[] = ['class_session', 'class_individual']

const router = useRouter()
const route = useRoute()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()
const { isAdmin: profileIsAdmin, loading: profileLoading } = useSiteProfile()
const { seasons: programSeasons, refresh: refreshSeasons, bySlug: seasonBySlug, removeSeason } = useProgramSeasons()
const addSeasonOpen = ref(false)

const checkingAccess = ref(true)
const accessError = ref('')
const loading = ref(true)
const events = ref<SchoolCalendarRow[]>([])
const viewMonth = ref(new Date())
const selectedDate = ref<Date>(new Date())
const filterType = ref<SchoolCalendarEventType | 'all'>('all')
const calendarView = ref<'today' | 'week' | 'month'>('week')
const addMenuOpen = ref(false)
/** The small + on the selected day cell. */
const dayAddMenuOpen = ref(false)
watch(selectedDate, () => { dayAddMenuOpen.value = false })
const closeDayAddMenu = () => { dayAddMenuOpen.value = false }
onMounted(() => window.addEventListener('click', closeDayAddMenu))
onBeforeUnmount(() => window.removeEventListener('click', closeDayAddMenu))
const enrollmentCounts = ref<Record<string, number>>({})
/** Coach names per time slot for the day Hoy is showing. */
const dayCoachNames = ref<Record<string, string[]>>({})

const modalOpen = ref(false)
const editingId = ref<string | null>(null)
const createMode = ref<CreateMode>('event')
const saving = ref(false)
const formError = ref('')
const formSnapshotJson = ref('')

const captureFormSnapshot = () => {
  formSnapshotJson.value = JSON.stringify(form.value)
}

const isFormDirty = () =>
  modalOpen.value && JSON.stringify(form.value) !== formSnapshotJson.value

const finalizeModalOpen = () => {
  nextTick(() => {
    if (isProgramForm.value && !editingId.value) {
      if (isSummerCourseSeason(form.value.season_slug)) applySummerCoursePreset()
      applyProgramTitle(true)
      if (!isSummerCourseSeason(form.value.season_slug)) applyProgramDateSync({ syncStart: true })
    }
    captureFormSnapshot()
  })
}

/** Delete confirmation when event belongs to a program series */
const deleteSeriesOpen = ref(false)
const deleteSeriesId = ref<string | null>(null)
const deleting = ref(false)

/** Editing one class of a program: apply changes to the whole series or just that class. */
const editScope = ref<'series' | 'single'>('series')
const editSeriesCount = ref(0)

/** Fields that describe the program itself; dates and times stay per class. */
const SERIES_SHARED_FIELDS = [
  'title',
  'event_type',
  'description',
  'location',
  'skatepark',
  'visible_to_parents',
  'is_bookable',
  'audience_category',
  'audience_categories',
  'skill_level',
  'min_age',
  'max_age',
  'price_mxn',
  'coach_tier',
  'max_capacity_override',
  'season_slug',
  'discipline',
] as const

const form = ref({
  title: '',
  event_type: 'event' as SchoolCalendarEventType,
  start_date: '',
  end_date: '',
  all_day: true,
  location: DEFAULT_SKATEPARK,
  description: '',
  visible_to_parents: true,
  is_bookable: false,
  time_slot: 'early' as TimeSlot,
  skill_level: 'beginner_1' as SkateSkillLevelId,
  min_age: 5,
  max_age: 12,
  skatepark: DEFAULT_SKATEPARK,
  price_mxn: '' as string | number,
  coach_tier: DEFAULT_COACH_TIER as CoachPricingTier,
  audience_categories: [] as AudienceCategory[],
  practice_time_slot: 'early' as TimeSlot,
  is_recurring: false,
  recurring_weekdays: [...DEFAULT_PROGRAM_WEEKDAYS] as number[],
  recurring_slots: ['early'] as string[],
  recurring_class_count: PROGRAM_TOTAL_CLASSES,
  program_weeks: 4 as ProgramWeekCount,
  summer_weeks: 1 as 1 | 2,
  skill_tracks: ['beginner'] as ProgramSkillTrack[],
  max_capacity_override: 6,
  season_slug: '',
  discipline: 'skateboarding',
})

const HIDDEN_EVENT_TYPES: SchoolCalendarEventType[] = ['school_closure', 'school_open', 'camp', 'show', 'practice', 'custom', 'holiday']

const selectableEventTypes = computed(() => {
  if (editingId.value) {
    // When editing, show types for the same family (event vs program)
    if (PROGRAM_ONLY_TYPES.includes(form.value.event_type)) return PROGRAM_ONLY_TYPES
    return EVENT_ONLY_TYPES
  }
  return createMode.value === 'program' ? PROGRAM_ONLY_TYPES : EVENT_ONLY_TYPES
})

const filterEventTypes = computed(() =>
  eventTypeOrder.filter(t => !HIDDEN_EVENT_TYPES.includes(t) || t === 'holiday' || t === 'practice'),
)

/** Level buttons share one row, so labels past 8 characters are abbreviated. */
const shortLabel = (label: string) => (label.length > 8 ? `${label.slice(0, 8)}.` : label)

const isAudienceSelected = (id: AudienceCategory) => form.value.audience_categories.includes(id)

const toggleAudience = (id: AudienceCategory) => {
  const cur = [...form.value.audience_categories]
  const i = cur.indexOf(id)
  if (i >= 0) {
    form.value.audience_categories = cur.filter(c => c !== id)
    return
  }
  form.value.audience_categories = [...cur, id]
}

const isSummerCourseForm = computed(() => isSummerCourseSeason(form.value.season_slug))

const formSeason = computed(() => {
  const slug = form.value.season_slug?.trim()
  if (!slug) return undefined
  return seasonBySlug(slug) || getProgramSeasonBySlug(slug)
})

const programOccurrenceEndDate = (): string | null => {
  const seasonEnd = formSeason.value?.endDate || null
  const formEnd = form.value.end_date || null
  const raw = isSummerCourseForm.value ? (formEnd || seasonEnd) : (seasonEnd || formEnd)
  if (seasonEnd && raw && raw > seasonEnd) return seasonEnd
  return raw
}

const programSlotsForGenerate = (): string[] => {
  if (isSummerCourseForm.value) return [...SUMMER_COURSE_SLOTS]
  const visible = new Set(programHorarios.value.map(h => h.id))
  const picked = form.value.recurring_slots.filter(s => visible.has(s))
  return picked.length ? picked : defaultHorarioIds()
}

/** Session 1 when it's still offered, otherwise the earliest remaining horario. */
const defaultHorarioIds = (): string[] => {
  const ids = programHorarios.value.map(h => h.id)
  if (ids.includes('early')) return ['early']
  return ids.length ? [ids[0]!] : ['early']
}

const formCoachTier = computed(() => normalizeCoachTier(form.value.coach_tier))

// ---------------------------------------------------------------------------
// Pricing — Finanzas → Precios is the only source of truth
// ---------------------------------------------------------------------------

const { priceRows: financePriceRows, loadPriceRows } = useFinance()

onMounted(() => {
  loadPriceRows()
})

/** Package the class count maps to: monthly_4, group_pack_5, … */
const autoPackageKind = computed(() =>
  resolveProgramPackageKind({
    eventType: form.value.event_type as 'class_session' | 'class_individual',
    isRecurring: form.value.is_recurring || isSummerCourseForm.value,
    isSummerCourse: isSummerCourseForm.value,
    summerWeeks: form.value.summer_weeks,
    classCount: Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES,
  }),
)

/** '' follows the class count; otherwise the admin picked the package to sell. */
const priceKindOverride = ref<ClassPackageKind | ''>('')

watch(modalOpen, open => {
  if (open) priceKindOverride.value = ''
})

const priceKindOptions = computed(() => {
  const individual = form.value.event_type === 'class_individual'
  return FINANCE_CLASS_KINDS.filter(k => k.id.startsWith('individual') === individual)
})

watch(priceKindOptions, opts => {
  if (priceKindOverride.value && !opts.some(o => o.id === priceKindOverride.value)) {
    priceKindOverride.value = ''
  }
})

const programPackageKind = computed(() => priceKindOverride.value || autoPackageKind.value)

const programPricingGroup = computed(() => pricingGroupForDiscipline(form.value.discipline))

const rowPricingGroup = (r: FinancePriceRow) => r.price_group || 'standard'

/** The sport's own sheet when Finanzas has one, else the shared skate/scooter/patinaje sheet. */
const programHasOwnPriceSheet = computed(
  () => financePriceRows.value.some(r => r.is_active && rowPricingGroup(r) === programPricingGroup.value),
)

const activePriceRows = computed(() => {
  const group = programHasOwnPriceSheet.value ? programPricingGroup.value : 'standard'
  return financePriceRows.value.filter(r => r.is_active && rowPricingGroup(r) === group)
})

/** The Finanzas row for this tier + package, when the sheet has one. */
const programPriceRow = computed(
  () =>
    activePriceRows.value.find(
      r => r.coach_tier === formCoachTier.value && r.class_kind === programPackageKind.value,
    ) ?? null,
)

/** Classes the price covers; only recurring non-summer programs pick their own count. */
const pricedClassCount = computed((): number | null => {
  if (isSummerCourseForm.value || !form.value.is_recurring) return null
  return Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES
})

const programPackageSessions = computed(
  () =>
    programPriceRow.value?.sessions
    ?? getClassPriceRow(formCoachTier.value, programPackageKind.value)?.sessions
    ?? 0,
)

const programPriceIsProrated = computed(
  () =>
    pricedClassCount.value != null
    && programPackageSessions.value > 0
    && pricedClassCount.value !== programPackageSessions.value,
)

/** Finanzas price; the built-in table only covers packages missing from the sheet. */
const programPriceMxn = computed(() => {
  const row = programPriceRow.value
  const packagePrice = row
    ? effectivePriceMxn(row)
    : isSummerCourseForm.value
      ? resolveDefaultProgramPriceMxn({
          eventType: form.value.event_type as 'class_session' | 'class_individual',
          isRecurring: true,
          isSummerCourse: true,
          summerWeeks: form.value.summer_weeks,
          coachTier: formCoachTier.value,
        })
      : getClassPriceMxn(formCoachTier.value, programPackageKind.value)
  if (!programPriceIsProrated.value) return packagePrice
  return proratePackagePriceMxn(packagePrice, programPackageSessions.value, pricedClassCount.value!)
})

const programPriceLabel = computed(() => {
  const es = language.value === 'es'
  const row = programPriceRow.value
  const pack = row ? (es ? row.label_es : row.label_en || row.label_es) : classKindLabel(programPackageKind.value, es)
  const count = programPriceIsProrated.value
    ? es
      ? `${pricedClassCount.value} clases a tarifa de ${pack}`
      : `${pricedClassCount.value} classes at the ${pack} rate`
    : pack
  return `${count} · ${coachTierSheetLabel(formCoachTier.value, es)} · ${disciplineLabel(form.value.discipline, es) || 'Skate'}`
})

/** An existing program keeps the price it was sold at until it is re-synced. */
const editedPriceIsStale = computed(
  () =>
    Boolean(editingId.value)
    && isProgramForm.value
    && Number(form.value.price_mxn) !== programPriceMxn.value,
)

const syncPriceFromFinance = () => {
  form.value.price_mxn = programPriceMxn.value
}

const isSkillTrackSelected = (track: ProgramSkillTrack) => form.value.skill_tracks.includes(track)

const skillTrackSelectedClass = (_track: ProgramSkillTrack) =>
  'bg-acid text-charcoal border-acid'

const toggleSkillTrack = (track: ProgramSkillTrack) => {
  const cur = [...form.value.skill_tracks]
  const i = cur.indexOf(track)
  if (i >= 0) {
    if (cur.length <= 1) return
    form.value.skill_tracks = cur.filter(t => t !== track)
  } else {
    form.value.skill_tracks = [...cur, track]
  }
  form.value.skill_level = skillLevelIdFromTrack(form.value.skill_tracks[0]!)
}

/** Ages come only from the chips the admin actually selected. */
const selectedAudienceAges = () => mergedAudienceAgeRange(form.value.audience_categories)

const applySummerCoursePreset = () => {
  form.value.is_recurring = true
  form.value.recurring_weekdays = [...SUMMER_COURSE_WEEKDAY_PRESET]
  const opt = SUMMER_COURSE_WEEK_OPTIONS.find(o => o.weeks === form.value.summer_weeks)
    ?? SUMMER_COURSE_WEEK_OPTIONS[0]
  form.value.summer_weeks = opt.weeks
  form.value.recurring_class_count = opt.classes
  form.value.recurring_slots = [...SUMMER_COURSE_SLOTS]
  form.value.time_slot = SUMMER_COURSE_SLOT
  applyProgramDateSync({ syncStart: true })
}

/** One class per selected training day, every week of the program. */
const programDaysPerWeek = computed(() => Math.max(1, form.value.recurring_weekdays.length))

const applyStandardSeasonPreset = () => {
  form.value.recurring_weekdays = [...DEFAULT_PROGRAM_WEEKDAYS]
  form.value.recurring_class_count = programClassCount(
    form.value.program_weeks || 4,
    DEFAULT_PROGRAM_WEEKDAYS.length,
  )
  applyProgramDateSync({ syncStart: true })
}

watch(
  () => form.value.season_slug,
  slug => {
    if (!isProgramForm.value || editingId.value) return
    if (isSummerCourseSeason(slug)) applySummerCoursePreset()
    else applyStandardSeasonPreset()
    applyProgramTitle(true)
  },
)

watch(
  () => [form.value.program_weeks, programDaysPerWeek.value] as const,
  ([weeks, daysPerWeek]) => {
    if (!isProgramForm.value || editingId.value || isSummerCourseForm.value) return
    form.value.recurring_class_count = programClassCount(weeks, daysPerWeek)
  },
)

watch(
  () => form.value.summer_weeks,
  weeks => {
    if (!isSummerCourseForm.value || editingId.value) return
    const opt = SUMMER_COURSE_WEEK_OPTIONS.find(o => o.weeks === weeks)
    if (opt) form.value.recurring_class_count = opt.classes
    applyProgramDateSync({ syncStart: false })
  },
)

const isProgramForm = computed(
  () => form.value.event_type === 'class_session' || form.value.event_type === 'class_individual',
)
/** @deprecated alias — group + individual programs share bookable UI */
const isClassSessionForm = computed(() => isProgramForm.value)
const isPracticeForm = computed(() => form.value.event_type === 'practice')
const isIndividualProgram = computed(() => form.value.event_type === 'class_individual')

// New programs always carry the Finanzas price for their shape.
watch(
  [programPriceMxn, isProgramForm],
  () => {
    if (!isProgramForm.value || editingId.value) return
    form.value.price_mxn = programPriceMxn.value
  },
  { immediate: true },
)

/** Age phrases for auto titles: "Skater Tots (5-7)" style. */
const PROGRAM_AGE_TITLE: Record<
  Extract<AudienceCategory, 'tots_5_7' | 'kids_7_12' | 'teens_13_17' | 'adults_18_plus'>,
  { en: string; es: string }
> = {
  tots_5_7: { en: '5-7', es: '5-7' },
  kids_7_12: { en: '7-12', es: '7-12' },
  teens_13_17: { en: '13-17', es: '13-17' },
  adults_18_plus: { en: '18+', es: '18+' },
}

const lastAutoProgramTitle = ref('')
const programTitleManual = ref(false)

const buildProgramTitle = (): string => {
  const es = language.value === 'es'
  const typePart =
    form.value.event_type === 'class_individual'
      ? es
        ? 'Individual'
        : 'Individual'
      : es
        ? 'Grupal'
        : 'Group'
  const skillLabels = form.value.skill_tracks.map((track) => {
    const row = PROGRAM_SKILL_TRACKS.find(t => t.id === track)
    return row ? (es ? row.label.es : row.label.en) : track
  })
  const skillPart = skillLabels.length
    ? skillLabels.join(es ? ' / ' : ' / ')
    : es
      ? 'Principiante'
      : 'Beginner'
  const ages = isProgressionAudience(form.value.audience_categories)
    ? ['7-17']
    : form.value.audience_categories
      .map(id => PROGRAM_AGE_TITLE[id as keyof typeof PROGRAM_AGE_TITLE])
      .filter(Boolean)
      .map(a => (es ? a.es : a.en))
  const sportWord: Record<string, string> = {
    skateboarding: 'Skate',
    scooter: 'Scooter',
    rollerblading: 'Patines',
    bmx: 'BMX',
    parkour: 'Parkour',
  }
  const sport = sportWord[form.value.discipline] || 'Skate'
  const body = ages.length === 0
    ? `${typePart} ${skillPart}`
    : `${typePart} ${skillPart} ${es ? 'para' : 'for'} ${ageList(ages, es)}`
  return `${sport} · ${body}`
}

function ageList(ages: string[], es: boolean) {
  if (ages.length === 1) return ages[0]
  return es
    ? `${ages.slice(0, -1).join(', ')} y ${ages[ages.length - 1]}`
    : ages.join(', ')
}

function pickProgramSport(id: string) {
  form.value.discipline = id
  programTitleManual.value = false
  applyProgramTitle(true)
}

const { enabled: enabledSports, catalog: academySports, matchesSport } = useEnabledSports()
const sportChoices = computed(() => academySports.filter(sport => enabledSports.value.includes(sport.id)))
watch(enabledSports, (ids) => {
  if (!ids.includes(form.value.discipline as TrainingDiscipline)) {
    pickProgramSport(ids[0] || 'skateboarding')
  }
})

const skateSpots = ref<{ id: string; name: string; city: string | null }[]>([])
const addingSpot = ref(false)
const newSpotName = ref('')
const newSpotCity = ref('')
const spotError = ref('')
const spotSaving = ref(false)

const locationOptions = computed(() => {
  const names = skateSpots.value.map(spot => spot.name)
  const current = form.value.location?.trim()
  if (current && !names.includes(current)) names.push(current)
  if (!names.length) return [...EVENT_LOCATIONS]
  return names
})

async function loadSkateSpots() {
  const { data, error } = await client
    .from('skate_spots')
    .select('id, name, city')
    .order('name')
  if (error) {
    skateSpots.value = []
    return
  }
  skateSpots.value = (data || []) as { id: string; name: string; city: string | null }[]
}

async function saveSkateSpot() {
  spotError.value = ''
  const name = newSpotName.value.trim()
  if (!name) {
    spotError.value = language.value === 'es' ? 'Escribe el nombre del lugar.' : 'Enter the place name.'
    return
  }
  spotSaving.value = true
  try {
    const { error } = await client.from('skate_spots').insert({
      name,
      city: newSpotCity.value.trim() || null,
      country: 'México',
      created_by: user.value?.id ?? null,
    })
    if (error) {
      spotError.value = /schema cache|does not exist/i.test(error.message)
        ? (language.value === 'es'
          ? 'Ejecuta supabase/migrations/add_skate_spots.sql en el editor SQL.'
          : 'Run supabase/migrations/add_skate_spots.sql in the SQL editor.')
        : error.message
      return
    }
    form.value.location = name
    form.value.skatepark = name
    newSpotName.value = ''
    newSpotCity.value = ''
    addingSpot.value = false
    await loadSkateSpots()
  } finally {
    spotSaving.value = false
  }
}

const applyProgramTitle = (force = false) => {
  if (!isProgramForm.value || editingId.value) return
  if (programTitleManual.value && !force) return
  const next = buildProgramTitle()
  lastAutoProgramTitle.value = next
  form.value.title = next
  programTitleManual.value = false
}

watch(
  () =>
    [
      form.value.event_type,
      form.value.discipline,
      form.value.skill_tracks.join(','),
      form.value.audience_categories.join(','),
      language.value,
    ] as const,
  () => {
    if (!isProgramForm.value || editingId.value) return
    if (
      programTitleManual.value
      && form.value.title.trim()
      && form.value.title !== lastAutoProgramTitle.value
    ) {
      return
    }
    applyProgramTitle(true)
  },
)

watch(
  () => form.value.title,
  val => {
    if (!isProgramForm.value || editingId.value) return
    const trimmed = val.trim()
    if (!trimmed || trimmed === lastAutoProgramTitle.value) {
      programTitleManual.value = false
      return
    }
    programTitleManual.value = true
  },
)

const editingEvent = computed(() =>
  editingId.value ? events.value.find(e => e.id === editingId.value) ?? null : null,
)

const editingSeriesId = computed(() => editingEvent.value?.program_series_id ?? null)

/** Series can span months, so ask the DB instead of counting the loaded window. */
const loadEditSeriesCount = async (seriesId: string | null) => {
  editSeriesCount.value = 0
  if (!seriesId) return
  const { count } = await client
    .from('school_calendar_events')
    .select('id', { count: 'exact', head: true })
    .eq('program_series_id', seriesId)
  editSeriesCount.value = count ?? 0
}

const formStartWeekday = computed(() => {
  if (!form.value.start_date) return null
  const [y, m, d] = form.value.start_date.split('-').map(Number)
  return getDay(new Date(y, m - 1, d))
})

/** Times of the class being edited, kept so a custom horario survives a re-save. */
const editingClassTimes = ref<{ id: string; slot: string; start: string; end: string } | null>(null)

const classSessionSlotOptions = computed((): TimeSlot[] => {
  if (isClassSessionForm.value && isSummerCourseForm.value && !editingId.value) {
    return [...SUMMER_COURSE_SLOTS]
  }
  if (isClassSessionForm.value && (form.value.is_recurring || isSummerCourseForm.value) && !editingId.value) {
    return slotsForWeekdays(form.value.recurring_weekdays)
  }
  const wd = formStartWeekday.value
  const forDay = wd == null ? (['early', 'late'] as TimeSlot[]) : slotsForWeekday(wd)
  const list: TimeSlot[] = forDay.length ? forDay : ['morning', 'early', 'late']
  const kept = editingClassTimes.value
  if (kept && kept.id === editingId.value && isTimeSlot(kept.slot) && !list.includes(kept.slot)) {
    return [kept.slot, ...list]
  }
  return list
})

const { horarios: programHorarios, addHorario, removeHorario } = useProgramHorarios()

const recurringSlotOptions = computed((): ProgramHorario[] =>
  isSummerCourseForm.value
    ? SUMMER_COURSE_SLOTS.map(s => horarioFromId(s)!).filter(Boolean)
    : programHorarios.value,
)

const addingHorario = ref(false)
const newHorarioStart = ref('16:00')
const newHorarioEnd = ref('17:30')
const horarioError = ref('')

const submitNewHorario = () => {
  const res = addHorario(newHorarioStart.value, newHorarioEnd.value)
  if ('error' in res) {
    const es = language.value === 'es'
    horarioError.value = res.error === 'duplicate'
      ? es ? 'Ese horario ya existe.' : 'That time already exists.'
      : es ? 'La hora de fin debe ser después del inicio.' : 'End time must be after the start.'
    return
  }
  horarioError.value = ''
  addingHorario.value = false
  if (!form.value.recurring_slots.includes(res.id)) {
    form.value.recurring_slots = [...form.value.recurring_slots, res.id]
  }
}

const confirmRemoveHorario = (h: ProgramHorario) => {
  const msg = language.value === 'es'
    ? `¿Eliminar el horario ${h.display}?`
    : `Delete the ${h.display} time?`
  if (!window.confirm(msg)) return
  removeHorario(h.id)
  form.value.recurring_slots = form.value.recurring_slots.filter(s => s !== h.id)
}

const confirmRemoveHorarioById = (id: string) => {
  const h = recurringSlotOptions.value.find(o => o.id === id)
  if (h) confirmRemoveHorario(h)
}

const clampClassCount = () => {
  const n = Math.round(Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES)
  form.value.recurring_class_count = Math.min(PROGRAM_MAX_CLASSES, Math.max(1, n))
}

const recurringPreview = computed(() => {
  if ((!form.value.is_recurring && !isSummerCourseForm.value) || !form.value.start_date || editingId.value) return []
  return generateProgramOccurrences({
    startDate: form.value.start_date,
    endDate: programOccurrenceEndDate(),
    weekdays: form.value.recurring_weekdays,
    slots: programSlotsForGenerate(),
    maxClasses: Math.max(1, Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES),
    allowListedSlots: true,
  })
})

/** Only these are sellable — holiday dates land on the calendar but stay closed. */
const previewBookable = computed(() => bookableOccurrences(recurringPreview.value))

/** Planned dates that collide with a MX national holiday, for the warning banner. */
const previewHolidayClashes = computed(() => {
  const seen = new Set<string>()
  const out: Array<{ date: string; label: string; holiday: string }> = []
  for (const occ of recurringPreview.value) {
    if (!occ.isHoliday || seen.has(occ.date)) continue
    seen.add(occ.date)
    out.push({
      date: occ.date,
      label: format(parseYmd(occ.date), 'd MMM', language.value === 'es' ? { locale: es } : undefined),
      holiday: mexicoHolidayName(occ.date, language.value === 'es'),
    })
  }
  return out
})

const programFitsSeason = computed(() => {
  if (editingId.value || !formSeason.value) return true
  const needed = Math.max(1, Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES)
  return previewBookable.value.length >= needed
})

const syncingProgramDates = ref(false)

const applyProgramDateSync = (opts?: { syncStart?: boolean }) => {
  if ((!form.value.is_recurring && !isSummerCourseForm.value) || editingId.value) return
  if (!form.value.recurring_weekdays.length) return
  syncingProgramDates.value = true
  try {
    const maxClasses = Math.max(1, Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES)
    const season = formSeason.value
    const seasonStart = season?.startDate || null
    const seasonEnd = season?.endDate || null
    const from = seasonStart ? parseYmd(seasonStart) : new Date()
    const slots = programSlotsForGenerate()

    if (isSummerCourseForm.value) {
      form.value.recurring_slots = [...SUMMER_COURSE_SLOTS]
      form.value.time_slot = SUMMER_COURSE_SLOT
      let startDate =
        opts?.syncStart === false && form.value.start_date
          ? form.value.start_date
          : nearestProgramStartDate(from, form.value.recurring_weekdays)
      if (seasonStart && startDate < seasonStart) {
        startDate = nearestProgramStartDate(parseYmd(seasonStart), form.value.recurring_weekdays)
      }
      if (seasonEnd && startDate > seasonEnd) startDate = seasonEnd
      form.value.start_date = startDate
      form.value.end_date = computeSummerCourseEndDate(startDate, maxClasses, seasonEnd)
      return
    }

    if (opts?.syncStart !== false) {
      const { startDate, endDate } = syncProgramDateRange({
        from,
        weekdays: form.value.recurring_weekdays,
        slots,
        maxClasses,
        endCap: seasonEnd,
        allowListedSlots: true,
      })
      form.value.start_date = startDate
      form.value.end_date = endDate
    } else if (form.value.start_date) {
      const startDate = seasonStart && form.value.start_date < seasonStart
        ? nearestProgramStartDate(parseYmd(seasonStart), form.value.recurring_weekdays)
        : form.value.start_date
      form.value.start_date = startDate
      form.value.end_date = computeProgramEndDate({
        startDate,
        weekdays: form.value.recurring_weekdays,
        slots,
        maxClasses,
        endCap: seasonEnd,
        allowListedSlots: true,
      })
    }
  } finally {
    nextTick(() => {
      syncingProgramDates.value = false
    })
  }
}

watch(
  () => form.value.recurring_weekdays,
  weekdays => {
    if (isSummerCourseForm.value) {
      form.value.recurring_slots = [...SUMMER_COURSE_SLOTS]
      form.value.time_slot = SUMMER_COURSE_SLOT
      return
    }
    if (form.value.recurring_slots.some(s => s === 'summer')) {
      form.value.recurring_slots = form.value.recurring_slots.filter(s => s !== 'summer')
    }
    if (!form.value.recurring_slots.length && programHorarios.value.length) {
      form.value.recurring_slots = [programHorarios.value[0]!.id]
    }
  },
  { deep: true },
)

watch(
  () =>
    [
      form.value.is_recurring,
      form.value.recurring_weekdays.join(','),
      form.value.recurring_slots.join(','),
      form.value.recurring_class_count,
    ] as const,
  () => {
    if (syncingProgramDates.value || editingId.value) return
    if (!form.value.is_recurring || isSummerCourseForm.value) return
    applyProgramDateSync({ syncStart: true })
  },
)

watch(
  () => form.value.start_date,
  () => {
    if (syncingProgramDates.value || editingId.value) return
    if (!form.value.is_recurring && !isSummerCourseForm.value) return
    applyProgramDateSync({ syncStart: false })
  },
)

const toggleRecurringWeekday = (v: number) => {
  if (isSummerCourseForm.value) return
  const cur = [...form.value.recurring_weekdays]
  const i = cur.indexOf(v)
  if (i >= 0) {
    // A program needs at least one training day.
    if (cur.length <= 1) return
    form.value.recurring_weekdays = cur.filter(d => d !== v)
  } else {
    form.value.recurring_weekdays = [...cur, v].sort((a, b) => a - b)
  }
}

const toggleRecurringSlot = (slot: string) => {
  if (isSummerCourseForm.value) {
    form.value.recurring_slots = [...SUMMER_COURSE_SLOTS]
    return
  }
  const cur = [...form.value.recurring_slots]
  const i = cur.indexOf(slot)
  if (i >= 0) form.value.recurring_slots = cur.filter(s => s !== slot)
  else form.value.recurring_slots = [...cur, slot]
}

const isRecurringWeekday = (v: number) => form.value.recurring_weekdays.includes(v)
const isRecurringSlot = (slot: string) => form.value.recurring_slots.includes(slot)

const recurringWeekdayOptions = computed(() => {
  if (isSummerCourseForm.value) return SUMMER_COURSE_WEEKDAY_OPTIONS
  return ALL_WEEKDAY_OPTIONS
})

watch(classSessionSlotOptions, slots => {
  if (!isClassSessionForm.value || !slots.length) return
  if (!slots.includes(form.value.time_slot)) {
    form.value.time_slot = slots[0]
  }
})

watch(
  () => form.value.audience_categories,
  cats => {
    if (!isClassSessionForm.value || !cats.length) return
    const range = mergedAudienceAgeRange(cats)
    if (range.minAge != null) form.value.min_age = range.minAge
    if (range.maxAge != null) form.value.max_age = range.maxAge
  },
  { deep: true },
)

watch(
  () => form.value.event_type,
  t => {
    if (t === 'class_session' || t === 'class_individual') {
      form.value.is_bookable = true
      form.value.visible_to_parents = true
      form.value.all_day = false
      if (!form.value.skatepark) form.value.skatepark = DEFAULT_SKATEPARK
      if (t === 'class_individual') form.value.max_capacity_override = 1
      else if (!form.value.max_capacity_override || form.value.max_capacity_override === 1) {
        form.value.max_capacity_override = 6
      }
    }
    if (t === 'practice') {
      form.value.all_day = false
      form.value.practice_time_slot = 'early'
    }
  },
)

const EVENT_META: Record<
  SchoolCalendarEventType,
  { dot: string; label: { en: string; es: string }; emoji: string }
> = {
  event: { dot: EVENT_TYPE_COLORS.event.dot, label: { en: 'Event', es: 'Evento' }, emoji: '📅' },
  competition: { dot: EVENT_TYPE_COLORS.competition.dot, label: { en: 'Competition', es: 'Competencia' }, emoji: '🏆' },
  holiday: { dot: EVENT_TYPE_COLORS.holiday.dot, label: { en: 'Holiday', es: 'Festivo' }, emoji: '✨' },
  school_closure: { dot: 'bg-red-500', label: { en: 'School closure', es: 'Cierre escolar' }, emoji: '🚫' },
  school_open: { dot: 'bg-emerald-600', label: { en: 'School open', es: 'Abierto' }, emoji: '✅' },
  practice: { dot: EVENT_TYPE_COLORS.practice.dot, label: { en: 'Practice', es: 'Práctica' }, emoji: '🏃' },
  meeting: { dot: EVENT_TYPE_COLORS.event.dot, label: { en: 'Meeting', es: 'Junta' }, emoji: '👥' },
  camp: { dot: EVENT_TYPE_COLORS.event.dot, label: { en: 'Camp', es: 'Campamento' }, emoji: '⛺' },
  show: { dot: EVENT_TYPE_COLORS.event.dot, label: { en: 'Show', es: 'Show' }, emoji: '🎭' },
  custom: { dot: EVENT_TYPE_COLORS.event.dot, label: { en: 'Custom', es: 'Personalizado' }, emoji: '🏷️' },
  class_session: { dot: SKILL_LEVEL_COLORS.beginner.dot, label: { en: 'Group class', es: 'Clase grupal' }, emoji: '🛹' },
  birthday: { dot: EVENT_TYPE_COLORS.event.dot, label: { en: 'Birthday', es: 'Cumpleaños' }, emoji: '🎂' },
  class_individual: { dot: SKILL_LEVEL_COLORS.beginner.dot, label: { en: 'Individual class', es: 'Clase individual' }, emoji: '👤' },
}

const eventTypeOrder = Object.keys(EVENT_META) as SchoolCalendarEventType[]

const tLabel = (type: SchoolCalendarEventType) =>
  language.value === 'es' ? EVENT_META[type].label.es : EVENT_META[type].label.en

const eventTypeSelectedClass = (type: SchoolCalendarEventType) => {
  if (type === 'class_session' || type === 'class_individual') return 'bg-acid text-charcoal border-acid'
  if (type === 'competition') return EVENT_TYPE_COLORS.competition.badge
  if (type === 'holiday') return EVENT_TYPE_COLORS.holiday.badge
  if (type === 'practice') return EVENT_TYPE_COLORS.practice.badge
  return EVENT_TYPE_COLORS.event.badge
}

const isProgramType = (type: SchoolCalendarEventType) => PROGRAM_ONLY_TYPES.includes(type)
const isQuickSession = (ev: SchoolCalendarRow) => ev.description === 'quick_session'

/** Map Postgres/PostgREST errors to the migration the admin still needs to run. */
const calendarDbErrorMessage = (msg: string) => {
  const es = language.value === 'es'
  const m = msg.toLowerCase()
  if (
    m.includes('audience_categor')
    || m.includes('tots_5_7')
    || m.includes('kids_7_12')
    || m.includes('teens_13_17')
    || m.includes('adults_18_plus')
    || (m.includes('check constraint') && m.includes('audience'))
  ) {
    return es
      ? 'Falta permitir las nuevas edades (5–7 / 7–12 / …). En Supabase SQL Editor ejecuta: supabase/migrations/add_program_age_skill_bands.sql'
      : 'New age bands not allowed yet. In Supabase SQL Editor run: supabase/migrations/add_program_age_skill_bands.sql'
  }
  if (m.includes('class_individual') || m.includes('birthday')) {
    return es
      ? 'Falta el tipo clase individual / cumpleaños. Ejecuta: supabase/migrations/add_birthday_and_class_individual.sql'
      : 'Missing individual/birthday event types. Run: supabase/migrations/add_birthday_and_class_individual.sql'
  }
  if (m.includes('discipline')) {
    return es
      ? 'Falta la columna del deporte. En Supabase SQL Editor ejecuta de nuevo: supabase/migrations/add_class_cancellations.sql'
      : 'Missing sport column. In Supabase SQL Editor run supabase/migrations/add_class_cancellations.sql again.'
  }
  if (m.includes('season_slug')) {
    return es
      ? 'Falta la columna temporada. En Supabase SQL Editor ejecuta: supabase/migrations/add_program_season_slug.sql'
      : 'Missing season_slug column. In Supabase SQL Editor run: supabase/migrations/add_program_season_slug.sql'
  }
  if (m.includes('summer') && (m.includes('time_slot') || m.includes('enum') || m.includes('check'))) {
    return es
      ? 'Falta el horario de verano (9:00–13:00). En Supabase SQL Editor ejecuta: supabase/migrations/add_summer_time_slot.sql'
      : 'Missing summer course slot (9:00 AM–1:00 PM). In Supabase SQL Editor run: supabase/migrations/add_summer_time_slot.sql'
  }
  if (
    m.includes('program_series_id')
    || m.includes('max_capacity_override')
    || m.includes('morning')
  ) {
    return es
      ? 'Falta soporte de series/horario mañana. Ejecuta: supabase/migrations/add_morning_slot_program_series.sql'
      : 'Missing series/morning slot support. Run: supabase/migrations/add_morning_slot_program_series.sql'
  }
  if (m.includes('schema cache') || /column .* does not exist/i.test(msg)) {
    return es
      ? 'Falta actualizar columnas del calendario. Ejecuta en orden: add_monday_slot_and_audience_categories.sql → add_program_age_skill_bands.sql → add_morning_slot_program_series.sql'
      : 'Calendar columns missing. Run in order: add_monday_slot_and_audience_categories.sql → add_program_age_skill_bands.sql → add_morning_slot_program_series.sql'
  }
  return msg
}

const waitForProfile = () =>
  new Promise<void>(resolve => {
    if (!profileLoading.value) {
      resolve()
      return
    }
    const stop = watch(profileLoading, loadingProfile => {
      if (!loadingProfile) {
        stop()
        resolve()
      }
    })
  })

const bootstrapPage = async () => {
  accessError.value = ''
  checkingAccess.value = true
  if (!user.value) {
    checkingAccess.value = false
    await router.push('/auth/login?redirect=/member/admin/scheduling/calendar')
    return
  }
  try {
    await waitForProfile()
    if (!profileIsAdmin.value) {
      await router.push('/member/staff/dashboard')
      return
    }
    await Promise.all([loadEvents(), loadCoachRoster(), loadSkateSpots()])
  } catch (e: unknown) {
    accessError.value = e instanceof Error ? e.message : String(e)
  } finally {
    checkingAccess.value = false
  }
}

onMounted(async () => {
  const qFilter = route.query.filter as string | undefined
  if (qFilter && qFilter !== 'all') {
    filterType.value = qFilter as SchoolCalendarEventType
  }
  await bootstrapPage()
})

watch(user, async u => {
  if (u && checkingAccess.value) await bootstrapPage()
})

const loadEvents = async () => {
  loading.value = true
  formError.value = ''
  try {
    const [{ data, error }, enrollments] = await Promise.all([
      client.from('school_calendar_events').select('*').order('start_date', { ascending: true }),
      client
        .from('class_session_enrollments')
        .select('calendar_event_id, status')
        .eq('status', 'confirmed'),
    ])
    if (error) throw error
    events.value = (data || []) as SchoolCalendarRow[]
    const counts: Record<string, number> = {}
    for (const row of enrollments.data || []) {
      const eventId = (row as { calendar_event_id?: string }).calendar_event_id
      if (eventId) counts[eventId] = (counts[eventId] || 0) + 1
    }
    enrollmentCounts.value = counts
    await Promise.all([ensureMexicoHolidays(), loadAssignments()])
    await applyBackupCovers(visibleDays.value)
  } catch (e: any) {
    console.error('loadEvents:', e)
    formError.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

/** Insert missing MX national holidays (2026–2027) into the school calendar. */
async function ensureMexicoHolidays() {
  if (!user.value) return
  try {
    const { data: existing } = await client
      .from('school_calendar_events')
      .select('start_date')
      .eq('event_type', 'holiday')
      .gte('start_date', '2026-01-01')
      .lte('start_date', '2027-12-31')

    const have = new Set((existing || []).map((r: { start_date: string }) => r.start_date))
    const missing = MEXICO_NATIONAL_HOLIDAYS_2026_2027.filter(h => !have.has(h.date))
    if (!missing.length) return

    const lang = language.value === 'es' ? 'es' : 'en'
    const rows = missing.map(h => ({
      title: h.title[lang],
      event_type: 'holiday' as const,
      start_date: h.date,
      end_date: null,
      all_day: true,
      visible_to_parents: true,
      description:
        language.value === 'es'
          ? 'Descanso obligatorio nacional (LFT Art. 74)'
          : 'National mandatory rest day (Mexican Federal Labor Law)',
      created_by: user.value!.id,
    }))
    const { error } = await client.from('school_calendar_events').insert(rows)
    if (error) {
      console.warn('ensureMexicoHolidays:', error.message)
      return
    }
    const { data } = await client.from('school_calendar_events').select('*').order('start_date', { ascending: true })
    events.value = (data || []) as SchoolCalendarRow[]
  } catch (e) {
    console.warn('ensureMexicoHolidays failed:', e)
  }
}

const filteredEvents = computed(() => {
  const inSport = events.value.filter(matchesSport)
  if (filterType.value === 'all') return inSport
  return inSport.filter(e => e.event_type === filterType.value)
})

const monthGrid = (month: Date) => {
  const start = startOfMonth(month)
  const end = endOfMonth(month)
  const gridStart = startOfWeek(start, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(end, { weekStartsOn: 1 })
  return { start, end, gridStart, gridEnd, days: eachDayOfInterval({ start: gridStart, end: gridEnd }) }
}

/** A season selection wider than this would make the page unusable to scroll. */
const MAX_VISIBLE_MONTHS = 4

/** Whole months between two dates, inclusive of both ends. */
const monthSpanBetween = (startYmd: string, endYmd: string) => {
  const from = startOfMonth(parseYmd(startYmd))
  const to = startOfMonth(parseYmd(endYmd))
  let span = 1
  let cursor = from
  while (cursor < to && span < MAX_VISIBLE_MONTHS) {
    cursor = addMonths(cursor, 1)
    span += 1
  }
  return span
}

const parseSelectedSeasonSlugs = (): string[] => {
  const multi = route.query.temporadas
  if (typeof multi === 'string' && multi.trim()) {
    return multi.split(',').map(s => s.trim()).filter(Boolean)
  }
  if (Array.isArray(multi)) {
    return multi.flatMap(v => (typeof v === 'string' ? v.split(',') : [])).map(s => s.trim()).filter(Boolean)
  }
  const single = route.query.temporada
  return typeof single === 'string' && single.trim() ? [single.trim()] : []
}

const selectedSeasonSlugs = computed(() => parseSelectedSeasonSlugs())

const selectedSeasons = computed(() =>
  selectedSeasonSlugs.value
    .map(slug => seasonBySlug(slug) || getProgramSeasonBySlug(slug))
    .filter((s): s is NonNullable<typeof s> => Boolean(s)),
)

/**
 * How many month grids to stack. A season that runs Jul 1 – Aug 31 shows both
 * months, so the whole run is visible without paging back and forth.
 */
const visibleMonthCount = computed(() => {
  if (!selectedSeasons.value.length) return 1
  const starts = selectedSeasons.value.map(s => s.startDate).sort()
  const ends = selectedSeasons.value.map(s => s.endDate).sort()
  return monthSpanBetween(starts[0], ends[ends.length - 1])
})

const visibleMonths = computed(() =>
  Array.from({ length: visibleMonthCount.value }, (_, i) =>
    addMonths(startOfMonth(viewMonth.value), i),
  ),
)

const monthLabelFor = (month: Date) =>
  format(month, 'MMMM yyyy', { locale: language.value === 'es' ? es : undefined })

const overlapsDay = (ev: SchoolCalendarRow, day: Date) => {
  const d = format(day, 'yyyy-MM-dd')
  const s = ev.start_date
  const e = ev.end_date || ev.start_date
  return s <= d && e >= d
}

const eventsOnDay = (day: Date) => {
  const list = filteredEvents.value.filter(ev => {
    if (!overlapsDay(ev, day)) return false
    if (selectedSeasonSlugs.value.length && isProgramType(ev.event_type) && !isEventInSelectedSeason(ev)) {
      return false
    }
    if (selectedSeasonSlugs.value.length && isQuickSession(ev) && !selectedSeasonSlugs.value.includes(ev.season_slug || '')) {
      return false
    }
    return true
  })

  const skillOrder: Record<ProgramSkillTrack, number> = {
    beginner: 0,
    intermediate: 1,
    advanced: 2,
  }

  return list.sort((a, b) => {
    // Special events (anything that is not a class) lead the day, all-day ones first.
    const aSpecial = isProgramType(a.event_type) ? 1 : 0
    const bSpecial = isProgramType(b.event_type) ? 1 : 0
    if (aSpecial !== bSpecial) return aSpecial - bSpecial

    const at = a.start_time || (aSpecial === 0 ? '00:00' : '99:99')
    const bt = b.start_time || (bSpecial === 0 ? '00:00' : '99:99')
    if (at !== bt) return at.localeCompare(bt)

    const aSkill = skillOrder[skillTrackFromLevelId(a.skill_level)] ?? 9
    const bSkill = skillOrder[skillTrackFromLevelId(b.skill_level)] ?? 9
    if (aSkill !== bSkill) return aSkill - bSkill

    return a.title.localeCompare(b.title)
  })
}

const eventStartKey = (ev: SchoolCalendarRow) => ev.start_time?.slice(0, 5) || ''

const eventTimeGroups = (day: Date) => {
  const groups: { key: string; label: string; special: boolean; events: SchoolCalendarRow[] }[] = []
  for (const ev of eventsOnDay(day)) {
    const quick = isQuickSession(ev)
    const special = quick || !isProgramType(ev.event_type)
    // Prefixed so a special event and classes at the same time get separate, uniquely keyed groups.
    const key = quick ? 'quick' : `${special ? 'special' : 'class'}-${eventStartKey(ev) || 'all-day'}`
    const label = quick
      ? (language.value === 'es' ? 'Sesión rápida' : 'Quick session')
      : agendaTime(ev)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.events.push(ev)
    else groups.push({ key, label, special, events: [ev] })
  }
  return groups
}

const eventAgeEmojis = (ev: SchoolCalendarRow) => {
  if (!isProgramType(ev.event_type)) return [] as string[]
  const cats = parseAudienceCategories(ev)
  const fromCats = PROGRAM_AGE_BANDS.filter(band => cats.includes(band.id))
  if (fromCats.length) return fromCats.map(band => band.emoji)
  const min = ev.min_age
  const max = ev.max_age ?? 99
  if (min == null) return []
  return PROGRAM_AGE_BANDS
    .filter(band => {
      const bandMax = band.maxAge ?? 99
      const classInside = min >= band.minAge && max <= bandMax
      const bandInside = band.minAge >= min && bandMax <= max
      return classInside || bandInside
    })
    .map(band => band.emoji)
}

/** Reads as a range while a multi-month season is stacked below. */
const monthLabel = computed(() => {
  if (calendarView.value === 'week') return monthLabelFor(selectedDate.value)
  const months = visibleMonths.value
  const first = monthLabelFor(months[0])
  if (months.length < 2) return first
  const loc = language.value === 'es' ? es : undefined
  const last = months[months.length - 1]
  const firstShort = isSameYear(months[0], last)
    ? format(months[0], 'MMMM', { locale: loc })
    : first
  return `${firstShort} – ${monthLabelFor(last)}`
})

const weekdayLabels = computed(() =>
  language.value === 'es' ? ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
)

const weekDays = computed(() => {
  const start = startOfWeek(selectedDate.value, { weekStartsOn: 1 })
  const end = endOfWeek(selectedDate.value, { weekStartsOn: 1 })
  return eachDayOfInterval({ start, end })
})

const displayedPeriods = computed(() =>
  calendarView.value === 'week' ? [startOfMonth(selectedDate.value)] : visibleMonths.value,
)

const displayedDays = (month: Date) =>
  calendarView.value === 'week' ? weekDays.value : monthGrid(month).days

const selectedDayEvents = computed(() => eventsOnDay(selectedDate.value))

const selectedDayHeading = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  const date = format(selectedDate.value, 'EEE d MMM', { locale }).toUpperCase()
  if (!isToday(selectedDate.value)) return date
  return `${language.value === 'es' ? 'HOY' : 'TODAY'} · ${date}`
})

/** "SÁBADO · 5 SEPTIEMBRE" — the day Hoy is showing, spelled out. */
const todayHeading = computed(() => {
  const locale = language.value === 'es' ? es : undefined
  return format(selectedDate.value, 'EEEE · d MMMM', { locale }).toUpperCase()
})

const todaySkatepark = computed(() => {
  const named = selectedDayEvents.value.find(ev => ev.skatepark || ev.location)
  return named?.skatepark || named?.location || 'Mérida'
})

/** Only classes get a Hoy card; holidays and meetings stay in the plain list. */
const todayClasses = computed(() =>
  selectedDayEvents.value.filter(ev => isProgramType(ev.event_type)),
)

const todayOtherEvents = computed(() =>
  selectedDayEvents.value.filter(ev => !isProgramType(ev.event_type)),
)

function setCalendarView(view: 'today' | 'week' | 'month') {
  calendarView.value = view
  // Hoy always means today, even after browsing to another week.
  if (view === 'today') goToday()
}

watch(
  selectedDate,
  async (day) => {
    loadDayCoaches(day)
  },
  { immediate: true },
)

const agendaTime = (ev: SchoolCalendarRow) => {
  if (!ev.start_time) return language.value === 'es' ? 'TODO EL DÍA' : 'ALL DAY'
  const [hours, minutes] = ev.start_time.slice(0, 5).split(':').map(Number)
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour = ((hours + 11) % 12) + 1
  return `${hour}:${String(minutes).padStart(2, '0')} ${suffix}`
}

/**
 * Who is coaching each slot on a given day. Mirrors the booking rule in
 * server/utils/bookableSessions: a roster set for that exact date replaces the
 * monthly recurring one for that slot rather than adding to it.
 */
async function loadDayCoaches(day: Date) {
  const ymd = format(day, 'yyyy-MM-dd')
  const dow = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][day.getDay()]

  const nameOf = (row: any) =>
    (row.profiles?.full_name || row.profiles?.first_name || '').trim()

  const bySlot: Record<string, string[]> = {}
  const datedSlots = new Set<string>()

  const { data: dated } = await client
    .from('coach_date_availability')
    .select('time_slot, profiles:coach_id(full_name, first_name)')
    .eq('date', ymd)
    .eq('is_available', true)

  for (const row of (dated as any[]) || []) {
    datedSlots.add(row.time_slot)
    const name = nameOf(row)
    if (name) (bySlot[row.time_slot] ||= []).push(name)
  }

  const { data: monthly } = await client
    .from('coach_availability')
    .select('time_slot, profiles:coach_id(full_name, first_name)')
    .eq('year', day.getFullYear())
    .eq('month', day.getMonth() + 1)
    .eq('day_of_week', dow)
    .eq('is_available', true)

  for (const row of (monthly as any[]) || []) {
    if (datedSlots.has(row.time_slot)) continue
    const name = nameOf(row)
    if (name) (bySlot[row.time_slot] ||= []).push(name)
  }

  dayCoachNames.value = bySlot
}

const coachesForEvent = (ev: SchoolCalendarRow) =>
  ev.time_slot ? (dayCoachNames.value[ev.time_slot] || []) : []

/**
 * Coach calendar: a day is available unless that class time was turned off.
 * Only explicit is_available = false counts. No row means the coach is on.
 */
/** Keys are coach|yyyy-mm-dd|slot, loaded for every visible day. */
const blockedCoachSlots = ref<Set<string>>(new Set())
const availabilityReady = ref(false)

const visibleDays = computed(() => {
  const seen = new Map<string, Date>()
  for (const month of visibleMonths.value) {
    for (const day of displayedDays(month)) seen.set(format(day, 'yyyy-MM-dd'), day)
  }
  seen.set(format(selectedDate.value, 'yyyy-MM-dd'), selectedDate.value)
  return [...seen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, day]) => day)
})

const visibleRangeKey = computed(() => {
  const days = visibleDays.value
  return `${format(days[0], 'yyyy-MM-dd')}|${format(days[days.length - 1], 'yyyy-MM-dd')}`
})

async function loadAvailabilityRange(from: string, to: string) {
  const { data: dated } = await client
    .from('coach_date_availability')
    .select('coach_id, date, time_slot, is_available')
    .gte('date', from)
    .lte('date', to)
    .eq('is_available', false)

  const blocked = new Set<string>()
  for (const row of (dated as { coach_id: string; date: string; time_slot: string }[]) || []) {
    blocked.add(`${row.coach_id}|${row.date}|${row.time_slot}`)
  }
  blockedCoachSlots.value = blocked
  availabilityReady.value = true
}

function isCoachBlocked(coachId: string, date: string, slot: string) {
  return blockedCoachSlots.value.has(`${coachId}|${date}|${slot}`)
}

const eventSlot = (ev: SchoolCalendarRow) => ev.time_slot || slotFromStartTime(ev.start_time)

/** How many live classes each coach holds per date and class time. More than one is a clash. */
const coachBookings = computed(() => {
  const counts = new Map<string, number>()
  for (const ev of events.value) {
    if (!isProgramType(ev.event_type) || ev.session_outcome === 'cancelled' || ev.cancelled_at) continue
    const slot = eventSlot(ev)
    if (!slot) continue
    for (const coach of assignedByEvent.value[ev.id] || []) {
      const key = `${coach.id}|${ev.start_date}|${slot}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  return counts
})

watch(
  visibleRangeKey,
  async (range) => {
    const [from, to] = range.split('|')
    await loadAvailabilityRange(from, to)
    await applyBackupCovers(visibleDays.value)
  },
  { immediate: true },
)

function slotFromStartTime(start: string | null | undefined) {
  const hhmm = start?.slice(0, 5)
  if (!hhmm) return ''
  const match = (Object.entries(TIME_SLOT_LABELS) as [string, { start: string }][])
    .find(([, label]) => label.start === hhmm)
  return match?.[0] || ''
}

function chipTitle(ev: SchoolCalendarRow) {
  const warning = classStaffWarning(ev)
  if (isBlockedProgram(ev)) return `${ev.title} — ${blockedProgramTitle(ev)}`
  return warning ? `${ev.title} — ${warning}` : ev.title
}

function classStaffWarning(ev: SchoolCalendarRow): string {
  if (!isProgramType(ev.event_type) || ev.session_outcome === 'cancelled' || ev.cancelled_at) return ''
  const assigned = assignedByEvent.value[ev.id] || []
  const es = language.value === 'es'
  if (!assigned.length) {
    return es ? 'Sin coach asignado' : 'No coach assigned'
  }
  const slot = eventSlot(ev)
  if (!slot) return ''
  const unavailable = availabilityReady.value
    ? assigned.filter(coach => isCoachBlocked(coach.id, ev.start_date, slot))
    : []
  if (unavailable.length) {
    const names = unavailable.map(coach => coach.name).join(', ')
    if (!es) return `${names} marked this time as unavailable`
    return unavailable.length === 1
      ? `${names} no está disponible en este horario`
      : `${names} no están disponibles en este horario`
  }
  const doubled = assigned.filter(coach => (coachBookings.value.get(`${coach.id}|${ev.start_date}|${slot}`) || 0) > 1)
  if (doubled.length) {
    const names = doubled.map(coach => coach.name).join(', ')
    return es ? `${names} tiene otra clase a esta hora` : `${names} has another class at this time`
  }
  return ''
}

// ---------------------------------------------------------------------------
// Coach assignment — who actually taught the class
// ---------------------------------------------------------------------------

/**
 * Availability says who *could* take a slot. Assignment records who did, which
 * is what "clases dadas" on the coach activity page counts.
 */
type CoachOption = { id: string; name: string }

const coachRoster = ref<CoachOption[]>([])
const assignedCoachIds = ref<string[]>([])
/** Set when the table is missing so the section can point at the migration. */
const coachAssignError = ref('')
const coachRosterError = ref('')

const loadCoachRoster = async () => {
  coachRosterError.value = ''
  try {
    const rows = await fetchCoachDirectoryProfiles<{
      id: string
      full_name: string | null
      first_name: string | null
      last_name: string | null
      email: string | null
    }>(client, {
      select: 'id, full_name, first_name, last_name, email',
      activeOnly: true,
    })
    coachRoster.value = rows.map(p => ({
      id: p.id,
      name:
        (p.full_name || `${p.first_name || ''} ${p.last_name || ''}`).trim()
        || p.email
        || 'Coach',
    }))
  } catch (error) {
    coachRoster.value = []
    coachRosterError.value = error instanceof Error ? error.message : String(error)
  }
}

const loadAssignedCoaches = async (eventId: string | null) => {
  assignedCoachIds.value = []
  coachAssignError.value = ''
  if (!eventId) return
  const { data, error } = await client
    .from('class_session_coaches')
    .select('coach_id')
    .eq('calendar_event_id', eventId)
  if (error) {
    coachAssignError.value = error.message
    return
  }
  assignedCoachIds.value = ((data as any[]) || []).map(r => r.coach_id)
}

const toggleAssignedCoach = (coachId: string) => {
  const i = assignedCoachIds.value.indexOf(coachId)
  if (i >= 0) assignedCoachIds.value.splice(i, 1)
  else assignedCoachIds.value.push(coachId)
}

/**
 * Replaces the assignment for the given events. Errors are swallowed into a
 * banner instead of thrown so a missing migration can't block saving a class.
 */
const syncCoachAssignments = async (eventIds: string[]) => {
  if (!eventIds.length) return
  const { data: existing } = await client
    .from('class_session_coaches')
    .select('calendar_event_id, coach_id, delivered')
    .in('calendar_event_id', eventIds)
  const keptDelivered = new Map(
    ((existing as { calendar_event_id: string; coach_id: string; delivered: boolean }[]) || [])
      .filter(row => row.delivered)
      .map(row => [`${row.calendar_event_id}:${row.coach_id}`, true]),
  )
  const { error: delErr } = await client
    .from('class_session_coaches')
    .delete()
    .in('calendar_event_id', eventIds)
  if (delErr) {
    coachAssignError.value = delErr.message
    return
  }
  if (!assignedCoachIds.value.length) return
  const rows = eventIds.flatMap(eventId => {
    const markedDone = events.value.find(ev => ev.id === eventId)?.session_outcome === 'done'
    return assignedCoachIds.value.map(coachId => ({
      calendar_event_id: eventId,
      coach_id: coachId,
      assigned_by: user.value?.id ?? null,
      delivered: markedDone || keptDelivered.has(`${eventId}:${coachId}`),
    }))
  })
  const { error } = await client.from('class_session_coaches').insert(rows)
  if (error) coachAssignError.value = error.message
}

type AssignedCoach = { id: string; name: string; coveringForId: string | null; coveringForName: string | null }
const assignedByEvent = ref<Record<string, AssignedCoach[]>>({})
/** Absent coach id → backup coach id. */
const backupByCoach = ref<Record<string, string>>({})
let coverSyncing = false

async function loadBackupMap() {
  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, backup_coach_id')
    .in('role', ['coach', 'admin'])
  const rows = (error ? [] : (data as { id: string; full_name: string | null; backup_coach_id: string | null }[]) || [])
  let people = rows
  if (error) {
    const fallback = await client.from('profiles').select('id, full_name').in('role', ['coach', 'admin'])
    people = ((fallback.data as { id: string; full_name: string | null }[]) || []).map(row => ({
      ...row,
      backup_coach_id: null,
    }))
  }
  const map: Record<string, string> = {}
  for (const person of people) {
    if (person.backup_coach_id && person.backup_coach_id !== person.id) {
      map[person.id] = person.backup_coach_id
      continue
    }
    const want = defaultBackupFirstName(person.full_name)
    if (!want) continue
    const backup = people.find(other => other.id !== person.id && coachMatchesFirstName(other.full_name, want))
    if (backup) map[person.id] = backup.id
  }
  backupByCoach.value = map
}

const loadAssignments = async () => {
  let { data, error } = await client
    .from('class_session_coaches')
    .select('calendar_event_id, coach_id, covering_for, profiles:coach_id(full_name, role)')
  let withCover = true
  if (error) {
    withCover = false
    const fallback = await client
      .from('class_session_coaches')
      .select('calendar_event_id, coach_id, profiles:coach_id(full_name, role)')
    data = fallback.data
    error = fallback.error
  }
  if (error) return
  const names = new Map<string, string>()
  for (const row of (data as any[]) || []) {
    names.set(row.coach_id, (row.profiles?.full_name || '').trim() || 'Coach')
  }
  if (withCover) {
    const coveredIds = [...new Set(((data as any[]) || []).map(row => row.covering_for).filter(Boolean))]
    const missing = coveredIds.filter(id => !names.has(id))
    if (missing.length) {
      const { data: covered } = await client.from('profiles').select('id, full_name').in('id', missing)
      for (const row of (covered as { id: string; full_name: string | null }[]) || []) {
        names.set(row.id, (row.full_name || '').trim() || 'Coach')
      }
    }
  }
  const map: Record<string, AssignedCoach[]> = {}
  for (const row of (data as any[]) || []) {
    const role = row.profiles?.role as string | null | undefined
    if (role && role !== 'coach' && role !== 'admin') continue
    const coveringForId = withCover ? (row.covering_for as string | null) : null
    const list = map[row.calendar_event_id] || []
    list.push({
      id: row.coach_id,
      name: names.get(row.coach_id) || 'Coach',
      coveringForId,
      coveringForName: coveringForId ? (names.get(coveringForId) || null) : null,
    })
    map[row.calendar_event_id] = list
  }
  assignedByEvent.value = map
}

/**
 * The assigned coach is off for this class time and their backup is on:
 * the backup takes the class. When the original coach is available again, they return.
 * A coach never ends up with two classes at the same date and class time.
 */
async function applyBackupCovers(days: Date[]) {
  if (coverSyncing || !availabilityReady.value) return
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const dayKeys = new Set(days.map(day => format(day, 'yyyy-MM-dd')).filter(key => key >= todayKey))
  if (!dayKeys.size) return
  if (!Object.keys(backupByCoach.value).length) await loadBackupMap()

  type CoverChange = { eventId: string; fromId: string; toId: string; coveringFor: string | null }
  const changes: CoverChange[] = []
  const busy = new Map(coachBookings.value)
  const isBusy = (coachId: string, date: string, slot: string) => (busy.get(`${coachId}|${date}|${slot}`) || 0) > 0
  const move = (fromId: string, toId: string, date: string, slot: string) => {
    const from = `${fromId}|${date}|${slot}`
    const to = `${toId}|${date}|${slot}`
    busy.set(from, Math.max(0, (busy.get(from) || 0) - 1))
    busy.set(to, (busy.get(to) || 0) + 1)
  }

  for (const ev of events.value) {
    if (!dayKeys.has(ev.start_date)) continue
    if (!isProgramType(ev.event_type) || ev.session_outcome === 'done' || ev.session_outcome === 'cancelled' || ev.cancelled_at) continue
    const slot = eventSlot(ev)
    if (!slot) continue
    const date = ev.start_date
    const assigned = assignedByEvent.value[ev.id] || []
    for (const coach of assigned) {
      const coachOff = isCoachBlocked(coach.id, date, slot)
      if (coach.coveringForId && !isCoachBlocked(coach.coveringForId, date, slot) && !isBusy(coach.coveringForId, date, slot)) {
        changes.push({ eventId: ev.id, fromId: coach.id, toId: coach.coveringForId, coveringFor: null })
        move(coach.id, coach.coveringForId, date, slot)
        continue
      }
      if (!coachOff || coach.coveringForId) continue
      const backupId = backupByCoach.value[coach.id]
      if (!backupId || backupId === coach.id) continue
      if (isCoachBlocked(backupId, date, slot)) continue
      if (assigned.some(other => other.id === backupId)) continue
      if (isBusy(backupId, date, slot)) continue
      changes.push({ eventId: ev.id, fromId: coach.id, toId: backupId, coveringFor: coach.id })
      move(coach.id, backupId, date, slot)
    }
  }

  if (!changes.length) return
  coverSyncing = true
  try {
    for (const change of changes) {
      const withCover = await client
        .from('class_session_coaches')
        .update({ coach_id: change.toId, covering_for: change.coveringFor })
        .eq('calendar_event_id', change.eventId)
        .eq('coach_id', change.fromId)
      if (withCover.error && /covering_for/i.test(withCover.error.message)) {
        await client
          .from('class_session_coaches')
          .update({ coach_id: change.toId })
          .eq('calendar_event_id', change.eventId)
          .eq('coach_id', change.fromId)
      }
    }
    await loadAssignments()
  } finally {
    coverSyncing = false
  }
}

const coachInitials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase() || '').join('')

const assignOpen = ref(false)
const assignEventId = ref<string | null>(null)
const assignDraftIds = ref<string[]>([])
const assignBusy = ref(false)

const openAssign = (ev: SchoolCalendarRow) => {
  assignEventId.value = ev.id
  assignDraftIds.value = (assignedByEvent.value[ev.id] || []).map(c => c.id)
  assignOpen.value = true
}

const toggleAssignDraft = (coachId: string) => {
  const i = assignDraftIds.value.indexOf(coachId)
  if (i >= 0) assignDraftIds.value.splice(i, 1)
  else assignDraftIds.value.push(coachId)
}

const saveAssign = async () => {
  const eventId = assignEventId.value
  if (!eventId) return
  assignBusy.value = true
  const previous = assignedCoachIds.value.slice()
  assignedCoachIds.value = assignDraftIds.value.slice()
  try {
    await syncCoachAssignments([eventId])
    if (!coachAssignError.value) {
      assignOpen.value = false
      await loadAssignments()
    }
  } finally {
    assignedCoachIds.value = previous
    assignBusy.value = false
  }
}

const markClassDone = async (ev: SchoolCalendarRow) => {
  await markClassesDone([ev.id])
}

const dayClassesToComplete = computed(() =>
  selectedDayEvents.value.filter(ev =>
    isProgramType(ev.event_type)
    && ev.session_outcome !== 'done'
    && ev.session_outcome !== 'cancelled'
    && !ev.cancelled_at,
  ),
)

const dayClassesToCancel = computed(() =>
  selectedDayEvents.value.filter(ev =>
    isProgramType(ev.event_type)
    && ev.session_outcome !== 'cancelled'
    && !ev.cancelled_at,
  ),
)

const doneConfirmOpen = ref(false)
const doneConfirmIds = ref<string[]>([])

const askMarkClassesDone = (eventIds: string[]) => {
  if (!eventIds.length) return
  doneConfirmIds.value = eventIds
  weatherError.value = ''
  doneConfirmOpen.value = true
}

const markClassesDone = async (eventIds: string[]) => {
  if (!eventIds.length) return
  weatherError.value = ''
  try {
    await $fetch('/api/classes/session-status', {
      method: 'POST',
      headers: await adminAuthHeaders(),
      body: { eventIds, outcome: 'done' },
    })
    doneConfirmOpen.value = false
    await loadEvents()
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? String((e as { data?: { message?: string } }).data?.message || '')
      : ''
    weatherResult.value = ''
    weatherError.value = msg || (e instanceof Error ? e.message : String(e))
  }
}

/** Same sizing rule as booking: an override wins, else six spots per coach. */
const capacityForEvent = (ev: SchoolCalendarRow) => {
  if (ev.max_capacity_override != null && ev.max_capacity_override > 0) {
    return ev.max_capacity_override
  }
  return coachesForEvent(ev).length * SPOTS_PER_COACH
}

const weatherOpen = ref(false)
const weatherEventIds = ref<string[]>([])
const weatherMakeup = ref('')
const weatherBusy = ref(false)
const weatherError = ref('')
const weatherResult = ref('')

const adminAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error(language.value === 'es' ? 'Sesión expirada' : 'Session expired')
  return { Authorization: `Bearer ${token}` }
}

const openWeatherCancel = (ids: string[]) => {
  weatherEventIds.value = ids.filter(id => {
    const ev = events.value.find(row => row.id === id)
    return ev && ev.session_outcome !== 'cancelled' && !ev.cancelled_at
  })
  weatherMakeup.value = ''
  weatherError.value = ''
  weatherResult.value = ''
  weatherOpen.value = weatherEventIds.value.length > 0
}

const confirmWeatherCancel = async () => {
  weatherError.value = ''
  weatherResult.value = ''
  if (!weatherMakeup.value.trim()) {
    weatherError.value = language.value === 'es'
      ? 'Escribe cuándo se puede reponer la clase.'
      : 'Say when the class can be retaken.'
    return
  }
  weatherBusy.value = true
  try {
    const res = await $fetch<{
      cancelled: number
      emailed: number
      skipped: number
      recipients: number
    }>('/api/admin/cancel-classes', {
      method: 'POST',
      headers: await adminAuthHeaders(),
      body: {
        eventIds: weatherEventIds.value,
        reason: 'weather',
        makeupNote: weatherMakeup.value.trim(),
      },
    })
    weatherOpen.value = false
    const es = language.value === 'es'
    weatherResult.value = es
      ? `Canceladas ${res.cancelled}. Avisos enviados: ${res.emailed}${res.skipped ? ` · sin correo: ${res.skipped}` : ''}.`
      : `Cancelled ${res.cancelled}. Emails sent: ${res.emailed}${res.skipped ? ` · not sent: ${res.skipped}` : ''}.`
    await loadEvents()
  } catch (e: unknown) {
    const msg = e && typeof e === 'object' && 'data' in e
      ? String((e as { data?: { message?: string } }).data?.message || '')
      : ''
    weatherError.value = msg || (e instanceof Error ? e.message : String(e))
  } finally {
    weatherBusy.value = false
  }
}

const agendaMeta = (ev: SchoolCalendarRow) => {
  const parts: string[] = []
  if (isProgramType(ev.event_type)) {
    const count = enrollmentCounts.value[ev.id] || 0
    parts.push(`${count} ${language.value === 'es' ? 'estudiantes' : 'students'}`)
  }
  parts.push(ev.location || ev.skatepark || 'Mérida')
  return parts.join(' · ')
}

const seasonColorFor = (slug: string) => {
  const idx = programSeasons.value.findIndex(s => s.slug === slug)
  return seasonHighlightColor(idx >= 0 ? idx : 0)
}

const isSeasonSelected = (slug: string) => selectedSeasonSlugs.value.includes(slug)

const querySeasonSlug = () => selectedSeasonSlugs.value[0] || ''

const seasonsCoveringDay = (day: Date) => {
  const ymd = format(day, 'yyyy-MM-dd')
  return selectedSeasons.value.filter(s => ymd >= s.startDate && ymd <= s.endDate)
}

/** `gridMonth` is the month the cell belongs to, since several months can stack. */
const daySeasonStyle = (day: Date, gridMonth: Date = viewMonth.value) => {
  const covering = seasonsCoveringDay(day)
  if (!covering.length) return {}
  const inMonth = isSameMonth(day, gridMonth)
  const fills = covering.map(s => inMonth ? seasonColorFor(s.slug).fill : seasonColorFor(s.slug).fillMuted)
  if (fills.length === 1) return { backgroundColor: fills[0] }
  return { backgroundImage: stripedSeasonFill(fills) }
}

const seasonSlugForProgramDay = (day: Date) => {
  const covering = seasonsCoveringDay(day)
  if (covering.length === 1) return covering[0].slug
  const regular = covering.find(s => !isSummerCourseSeason(s.slug))
  return regular?.slug || covering[0]?.slug || querySeasonSlug()
}

/** Tagged slug, or the unique selected temporada covering this program’s dates. */
const eventSeasonSlug = (ev: SchoolCalendarRow): string => {
  const tagged = ev.season_slug?.trim()
  if (tagged) return tagged
  if (!isProgramType(ev.event_type) || !selectedSeasons.value.length) return ''
  const covering = selectedSeasons.value.filter(
    s => s.startDate <= (ev.end_date || ev.start_date) && s.endDate >= ev.start_date,
  )
  return covering.length === 1 ? covering[0].slug : ''
}

const isEventInSelectedSeason = (ev: SchoolCalendarRow) => {
  if (!selectedSeasonSlugs.value.length || !isProgramType(ev.event_type)) return false
  const slug = eventSeasonSlug(ev)
  return Boolean(slug && selectedSeasonSlugs.value.includes(slug))
}

const eventChipHighlightStyle = (ev: SchoolCalendarRow, day?: Date) => {
  if (!isProgramType(ev.event_type)) return {}
  const seasonOn = selectedSeasonSlugs.value.length > 0
  if (seasonOn && !isEventInSelectedSeason(ev)) return {}
  const track = skillTrackFromLevelId(ev.skill_level)
  const skill = SKILL_CHIP_COLOR[track]
  const past = day ? isPastDay(day) : false
  const seasonSlug = eventSeasonSlug(ev)
  const seasonAccent = seasonOn && seasonSlug ? seasonColorFor(seasonSlug).solid : ''
  return {
    backgroundColor: past && !seasonOn ? skill.muted : skill.solid,
    borderColor: seasonAccent || skill.solid,
    color: '#fff',
    boxShadow: seasonAccent ? `inset 3px 0 0 ${seasonAccent}` : undefined,
  }
}

const SKILL_CHIP_COLOR = SKILL_LEVEL_COLORS

const SKILL_CHIP_SHORT: Record<ProgramSkillTrack, { es: string; en: string }> = {
  beginner: { es: 'Princ.', en: 'Beg.' },
  intermediate: { es: 'Inter.', en: 'Int.' },
  advanced: { es: 'Avanz.', en: 'Adv.' },
}

const formatChipClock = (t: string | null | undefined) => {
  if (!t) return ''
  const [hh, mm] = t.slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(hh)) return ''
  const h12 = ((hh + 11) % 12) + 1
  if (!mm) return String(h12)
  return `${h12}:${String(mm).padStart(2, '0')}`
}

const eventChipTime = (ev: SchoolCalendarRow) => {
  if (ev.start_time && ev.end_time) {
    const a = formatChipClock(ev.start_time)
    const b = formatChipClock(ev.end_time)
    if (a && b) return `${a}–${b}`
  }
  const slot = ev.time_slot
  if (slot === 'summer') return '9–1'
  if (slot === 'morning') return '7–8:30'
  if (slot === 'early') return '5:30–7'
  if (slot === 'late') return '7–8:30'
  if (slot === 'monday') return '4:30–6'
  return ''
}

const eventChipLabel = (ev: SchoolCalendarRow) => {
  if (!isProgramType(ev.event_type)) return ev.title
  const track = skillTrackFromLevelId(ev.skill_level)
  const short = SKILL_CHIP_SHORT[track]
  const skill = language.value === 'es' ? short.es : short.en
  const kind = ev.event_type === 'class_individual'
    ? (language.value === 'es' ? 'Ind.' : 'Ind.')
    : (language.value === 'es' ? 'Grupal' : 'Group')
  const ages =
    ev.min_age != null && ev.max_age != null
      ? `${ev.min_age}–${ev.max_age}`
      : ev.min_age != null
        ? `${ev.min_age}+`
        : ''
  return [kind, skill, ages].filter(Boolean).join(' ')
}

const eventChipEmoji = (ev: SchoolCalendarRow) => {
  if (!isProgramType(ev.event_type)) return EVENT_META[ev.event_type]?.emoji || '🏷️'
  const track = skillTrackFromLevelId(ev.skill_level)
  return PROGRAM_SKILL_TRACKS.find(t => t.id === track)?.emoji || EVENT_META[ev.event_type]?.emoji || '🛹'
}

/** Programs sitting on a holiday stay visible but closed for booking. */
const isBlockedProgram = (ev: SchoolCalendarRow) =>
  isProgramType(ev.event_type) && ev.is_bookable === false

const blockedProgramTitle = (ev: SchoolCalendarRow) => {
  const es = language.value === 'es'
  const holiday = mexicoHolidayName(ev.start_date, es)
  if (holiday) {
    return es ? `Festivo: ${holiday} — no reservable` : `Holiday: ${holiday} — not bookable`
  }
  return es ? 'Clase no reservable' : 'Class not bookable'
}

const isProgramChipTinted = (ev: SchoolCalendarRow) => {
  if (!isProgramType(ev.event_type)) return false
  if (!selectedSeasonSlugs.value.length) return true
  return isEventInSelectedSeason(ev)
}

const seasonSelectError = ref('')

const persistSelectedSeasons = (slugs: string[]) => {
  const query = { ...route.query } as Record<string, string | string[] | undefined>
  delete query.temporada
  if (slugs.length) query.temporadas = slugs.join(',')
  else delete query.temporadas
  router.replace({ query })
}

const onSeasonCreated = async (season: { slug: string }) => {
  addSeasonOpen.value = false
  await refreshSeasons()
  await router.push(`/temporadas/${season.slug}`)
}

const defaultForm = (ymd: string, mode: CreateMode, seasonSlug = '') => ({
  title: '',
  event_type: (mode === 'program' ? 'class_session' : 'event') as SchoolCalendarEventType,
  start_date: ymd,
  end_date: ymd,
  all_day: mode !== 'program',
  location: DEFAULT_SKATEPARK,
  description: '',
  visible_to_parents: true,
  is_bookable: mode === 'program',
  time_slot: (isSummerCourseSeason(seasonSlug) ? SUMMER_COURSE_SLOT : 'early') as TimeSlot,
  skill_level: 'beginner_1' as SkateSkillLevelId,
  min_age: 5,
  max_age: 12,
  skatepark: DEFAULT_SKATEPARK,
  price_mxn: mode === 'program'
    ? resolveDefaultProgramPriceMxn({
        eventType: 'class_session',
        isRecurring: true,
        isSummerCourse: isSummerCourseSeason(seasonSlug),
        summerWeeks: 1,
        classCount: isSummerCourseSeason(seasonSlug) ? 5 : PROGRAM_TOTAL_CLASSES,
        coachTier: DEFAULT_COACH_TIER,
      })
    : ('' as string | number),
  coach_tier: DEFAULT_COACH_TIER as CoachPricingTier,
  audience_categories: [] as AudienceCategory[],
  practice_time_slot: 'early' as TimeSlot,
  is_recurring: mode === 'program',
  recurring_weekdays: [...DEFAULT_PROGRAM_WEEKDAYS] as number[],
  recurring_slots: isSummerCourseSeason(seasonSlug) ? [...SUMMER_COURSE_SLOTS] as string[] : defaultHorarioIds(),
  recurring_class_count: isSummerCourseSeason(seasonSlug) ? 5 : PROGRAM_TOTAL_CLASSES,
  program_weeks: 4 as ProgramWeekCount,
  summer_weeks: 1 as 1 | 2,
  skill_tracks: ['beginner'] as ProgramSkillTrack[],
  max_capacity_override: mode === 'program' ? 6 : 6,
  season_slug: seasonSlug,
  discipline: 'skateboarding',
})

const openCreateForDay = (day: Date, mode: CreateMode = 'event') => {
  selectedDate.value = day
  editingId.value = null
  createMode.value = mode
  const ymd = format(day, 'yyyy-MM-dd')
  const activeSeason = mode === 'program' ? pickDefaultProgramSeason(programSeasons.value) : undefined
  const seasonFromQuery = mode === 'program'
    ? (isPastDay(day)
        ? (seasonSlugForProgramDay(day) || activeSeason?.slug || '')
        : (activeSeason?.slug || seasonSlugForProgramDay(day)))
    : ''
  form.value = defaultForm(ymd, mode, seasonFromQuery)
  // A class on a past day records a session that already happened, not a new program.
  if (mode === 'program' && isPastDay(day)) form.value.is_recurring = false
  if (mode === 'event' && filterType.value !== 'all' && EVENT_ONLY_TYPES.includes(filterType.value as SchoolCalendarEventType)) {
    form.value.event_type = filterType.value as SchoolCalendarEventType
  }
  programTitleManual.value = false
  lastAutoProgramTitle.value = ''
  assignedCoachIds.value = []
  coachAssignError.value = ''
  modalOpen.value = true
  formError.value = ''
  if (mode === 'program') {
    finalizeModalOpen()
  } else {
    captureFormSnapshot()
  }
}

const openAddEvent = () => {
  openCreateForDay(selectedDate.value || new Date(), 'event')
}

const openAddProgram = () => {
  openCreateForDay(selectedDate.value || new Date(), 'program')
}

/** The edited class's real times while its slot is unchanged; otherwise the slot's built-in times. */
const formClassTimes = (): { start: string; end: string } => {
  const kept = editingClassTimes.value
  if (kept && kept.id === editingId.value && kept.slot === form.value.time_slot) {
    return { start: kept.start, end: kept.end }
  }
  const t = TIME_SLOT_LABELS[form.value.time_slot]
  return { start: t.start, end: t.end }
}

const classSlotOptionLabel = (slot: TimeSlot) => {
  const kept = editingClassTimes.value
  if (kept && kept.id === editingId.value && kept.slot === slot) {
    return horarioDisplay(kept.start, kept.end)
  }
  return TIME_SLOT_LABELS[slot].display
}

const openEdit = (ev: SchoolCalendarRow, e?: Event) => {
  e?.stopPropagation?.()
  selectedDate.value = new Date(ev.start_date + 'T12:00:00')
  editingId.value = ev.id
  editingClassTimes.value =
    ev.time_slot && ev.start_time && ev.end_time
      ? { id: ev.id, slot: ev.time_slot, start: ev.start_time.slice(0, 5), end: ev.end_time.slice(0, 5) }
      : null
  createMode.value = PROGRAM_ONLY_TYPES.includes(ev.event_type) ? 'program' : 'event'
  form.value = {
    title: ev.title,
    event_type: ev.event_type,
    start_date: ev.start_date,
    end_date: ev.end_date || ev.start_date,
    all_day: ev.all_day,
    location: ev.location || ev.skatepark || DEFAULT_SKATEPARK,
    description: ev.description || '',
    visible_to_parents: ev.visible_to_parents,
    is_bookable: ev.is_bookable ?? PROGRAM_ONLY_TYPES.includes(ev.event_type),
    time_slot: (ev.time_slot as TimeSlot) || 'early',
    skill_level: (ev.skill_level as SkateSkillLevelId) || 'beginner_1',
    skill_tracks: [skillTrackFromLevelId(ev.skill_level)] as ProgramSkillTrack[],
    min_age: ev.min_age ?? 5,
    max_age: ev.max_age ?? 12,
    skatepark: ev.skatepark || DEFAULT_SKATEPARK,
    price_mxn: ev.price_mxn ?? '',
    coach_tier: normalizeCoachTier(ev.coach_tier),
    audience_categories: parseAudienceCategories(ev),
    practice_time_slot:
      ev.start_time === '19:00:00' || ev.start_time === '19:00'
        ? 'late'
        : 'early',
    is_recurring: false,
    recurring_weekdays: [...DEFAULT_PROGRAM_WEEKDAYS],
    recurring_slots: ['early'],
    recurring_class_count: PROGRAM_TOTAL_CLASSES,
    program_weeks: 4 as ProgramWeekCount,
    summer_weeks: 1 as 1 | 2,
    max_capacity_override: ev.max_capacity_override ?? (ev.event_type === 'class_individual' ? 1 : 6),
    season_slug: ev.season_slug ?? '',
    discipline: isTrainingDiscipline(ev.discipline) ? ev.discipline : 'skateboarding',
  }
  editScope.value = ev.program_series_id ? 'series' : 'single'
  void loadEditSeriesCount(ev.program_series_id ?? null)
  void loadAssignedCoaches(ev.id)
  modalOpen.value = true
  formError.value = ''
  captureFormSnapshot()
}

const closeModal = () => {
  modalOpen.value = false
  editingId.value = null
  deleteSeriesOpen.value = false
  deleteSeriesId.value = null
  editScope.value = 'series'
  editSeriesCount.value = 0
  formSnapshotJson.value = ''
}

const requestCloseModal = () => {
  if (isFormDirty()) {
    const msg =
      language.value === 'es'
        ? '¿Cerrar sin guardar? Se perderán los datos del formulario.'
        : 'Close without saving? Form data will be lost.'
    if (!confirm(msg)) return
  }
  closeModal()
}

const submitEvent = async () => {
  if (!user.value) return
  const title = form.value.title.trim()
  if (!title) {
    formError.value = language.value === 'es' ? 'El título es obligatorio' : 'Title is required'
    return
  }
  if (!form.value.start_date) {
    formError.value = language.value === 'es' ? 'La fecha de inicio es obligatoria' : 'Start date is required'
    return
  }
  const end = form.value.end_date?.trim() || form.value.start_date
  if (end < form.value.start_date) {
    formError.value = language.value === 'es' ? 'La fecha fin no puede ser antes del inicio' : 'End date cannot be before start'
    return
  }

  if (
    (form.value.event_type === 'class_session' || form.value.event_type === 'class_individual')
    && !form.value.is_recurring
    && !form.value.time_slot
  ) {
    formError.value = language.value === 'es' ? 'Elige horario (sesión)' : 'Choose a session time slot'
    return
  }
  if (
    (form.value.event_type === 'class_session' || form.value.event_type === 'class_individual')
    && !form.value.skill_tracks.length
  ) {
    formError.value =
      language.value === 'es'
        ? 'Elige al menos un nivel'
        : 'Choose at least one skill level'
    return
  }
  if (
    (form.value.event_type === 'class_session' || form.value.event_type === 'class_individual')
    && !form.value.audience_categories.length
  ) {
    formError.value =
      language.value === 'es'
        ? 'Elige al menos un grupo de edad'
        : 'Choose at least one age group'
    return
  }
  if (
    (form.value.event_type === 'class_session' || form.value.event_type === 'class_individual')
    && !form.value.season_slug?.trim()
  ) {
    formError.value =
      language.value === 'es'
        ? 'Elige la temporada del programa.'
        : 'Select the program season.'
    return
  }

  if (
    (form.value.event_type === 'class_session' || form.value.event_type === 'class_individual')
    && formSeason.value
  ) {
    const season = formSeason.value
    const start = form.value.start_date
    const end = form.value.end_date?.trim() || start
    if (start < season.startDate || start > season.endDate || end < season.startDate || end > season.endDate) {
      formError.value =
        language.value === 'es'
          ? `Las fechas deben quedar dentro de la temporada (${season.startDate} – ${season.endDate}).`
          : `Dates must stay inside the season (${season.startDate} – ${season.endDate}).`
      return
    }
  }

  if (
    (form.value.event_type === 'class_session' || form.value.event_type === 'class_individual')
    && (form.value.is_recurring || isSummerCourseForm.value)
    && !editingId.value
  ) {
    if (isSummerCourseForm.value) {
      form.value.recurring_slots = [...SUMMER_COURSE_SLOTS]
      form.value.time_slot = SUMMER_COURSE_SLOT
    }
    if (!form.value.recurring_weekdays.length) {
      formError.value =
        language.value === 'es' ? 'Elige al menos un día de la semana' : 'Choose at least one weekday'
      return
    }
    if (!form.value.recurring_slots.length) {
      formError.value =
        language.value === 'es' ? 'Elige al menos un horario' : 'Choose at least one session time'
      return
    }
  }

  saving.value = true
  formError.value = ''
  try {
    const priceRaw = form.value.price_mxn
    const priceNum =
      priceRaw === '' || priceRaw == null ? null : Number(priceRaw)

    const isClass =
      form.value.event_type === 'class_session'
      || form.value.event_type === 'class_individual'
    const isPractice = form.value.event_type === 'practice'
    const practiceSlot = form.value.practice_time_slot
    const practiceTimes = isPractice
      ? {
          start: `${TIME_SLOT_LABELS[practiceSlot].start}:00`,
          end: `${TIME_SLOT_LABELS[practiceSlot].end}:00`,
        }
      : null

    const isRecurringClass =
      isClass && (form.value.is_recurring || isSummerCourseForm.value) && !editingId.value

    const buildClassPayload = (
      dateStr: string,
      horarioId: string,
      programSeriesId: string | null,
      isHoliday = false,
    ) => {
      const horario = resolveHorario(horarioId) ?? resolveHorario('summer')!
      const slot = horario.timeSlot
      const slotTimes = { start: horario.start, end: horario.end }
      const capOverride = Number(form.value.max_capacity_override) || null
      const ages = selectedAudienceAges()
      const holidayNote = isHoliday
        ? language.value === 'es'
          ? `Festivo nacional (${mexicoHolidayName(dateStr, true)}) — clase no reservable.`
          : `National holiday (${mexicoHolidayName(dateStr, false)}) — class not bookable.`
        : ''
      const baseDescription = form.value.description.trim()
      return {
        title,
        event_type: form.value.event_type as 'class_session' | 'class_individual',
        start_date: dateStr,
        end_date: null,
        all_day: false,
        start_time: `${slotTimes.start}:00`,
        end_time: `${slotTimes.end}:00`,
        location: form.value.location || DEFAULT_SKATEPARK,
        description: [baseDescription, holidayNote].filter(Boolean).join(' · ') || null,
        visible_to_parents: form.value.visible_to_parents,
        is_bookable: !isHoliday,
        time_slot: slot,
        audience_category: form.value.audience_categories[0] ?? null,
        audience_categories: form.value.audience_categories.length
          ? form.value.audience_categories
          : null,
        skill_level: skillLevelIdFromTrack(form.value.skill_tracks[0]!),
        min_age: ages.minAge,
        max_age: ages.maxAge,
        skatepark: form.value.location || DEFAULT_SKATEPARK,
        price_mxn: priceNum,
        coach_tier: formCoachTier.value,
        program_series_id: programSeriesId,
        max_capacity_override: capOverride,
        season_slug: form.value.season_slug.trim() || null,
        discipline: isTrainingDiscipline(form.value.discipline) ? form.value.discipline : 'skateboarding',
        created_by: user.value!.id,
      }
    }

    if (isRecurringClass) {
      if (isSummerCourseForm.value) {
        form.value.recurring_slots = [...SUMMER_COURSE_SLOTS]
        form.value.time_slot = SUMMER_COURSE_SLOT
      }
      const occurrences = generateProgramOccurrences({
        startDate: form.value.start_date,
        endDate: programOccurrenceEndDate(),
        weekdays: form.value.recurring_weekdays,
        slots: programSlotsForGenerate(),
        maxClasses: Math.max(1, Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES),
        allowListedSlots: true,
      })
      if (!occurrences.length) {
        formError.value =
          language.value === 'es'
            ? 'No se generaron clases dentro de la temporada. Revisa fechas, días y horarios.'
            : 'No classes were generated inside the season. Check dates, days, and times.'
        saving.value = false
        return
      }
      const seriesId = crypto.randomUUID()
      const rows = occurrences.map(o => buildClassPayload(o.date, o.slot, seriesId, o.isHoliday))
      let { error: bulkErr } = await client.from('school_calendar_events').insert(rows)
      const bulkMsg = bulkErr?.message || ''
      if (bulkErr && /summer|time_slot|invalid input value for enum/i.test(bulkMsg)) {
        const fallbackRows = rows.map(r =>
          r.time_slot === 'summer'
            ? { ...r, time_slot: 'morning' as TimeSlot, start_time: '09:00:00', end_time: '13:00:00' }
            : r,
        )
        ;({ error: bulkErr } = await client.from('school_calendar_events').insert(fallbackRows))
        if (!bulkErr) {
          formError.value =
            language.value === 'es'
              ? 'Clases creadas 9:00–13:00. En Supabase SQL Editor ejecuta supabase/migrations/add_summer_time_slot.sql'
              : 'Classes created 9:00–13:00. In Supabase SQL Editor run supabase/migrations/add_summer_time_slot.sql'
        }
      }
      if (
        bulkErr?.message?.includes('program_series_id')
        || bulkErr?.message?.includes('max_capacity_override')
        || bulkErr?.message?.includes('morning')
        || bulkErr?.message?.includes('season_slug')
      ) {
        const legacyRows = rows.map(
          ({ program_series_id: _p, max_capacity_override: _m, season_slug: _s, ...rest }) => rest,
        )
        ;({ error: bulkErr } = await client.from('school_calendar_events').insert(legacyRows))
        if (!bulkErr) {
          formError.value =
            language.value === 'es'
              ? 'Clases creadas. Ejecuta add_morning_slot_program_series.sql para programas recurrentes completos.'
              : 'Classes created. Run add_morning_slot_program_series.sql for full recurring support.'
        }
      }
      if (bulkErr) throw bulkErr
      if (assignedCoachIds.value.length) {
        const { data: created } = await client
          .from('school_calendar_events')
          .select('id')
          .eq('program_series_id', seriesId)
        await syncCoachAssignments(((created as any[]) || []).map(r => r.id))
      }
      await loadEvents()
      closeModal()
      saving.value = false
      return
    }

    const basePayload = {
      title,
      event_type: form.value.event_type,
      start_date: form.value.start_date,
      end_date: end === form.value.start_date ? null : end,
      all_day: isClass || isPractice ? false : form.value.all_day,
      start_time: isClass
        ? `${formClassTimes().start}:00`
        : practiceTimes?.start ?? null,
      end_time: isClass
        ? `${formClassTimes().end}:00`
        : practiceTimes?.end ?? null,
      location: form.value.location || DEFAULT_SKATEPARK,
      description: form.value.description.trim() || null,
      visible_to_parents: form.value.visible_to_parents,
      is_bookable: isClass ? true : form.value.is_bookable,
      time_slot: isClass ? form.value.time_slot : null,
      audience_category: form.value.audience_categories[0] ?? null,
      skill_level: isClass ? form.value.skill_level : null,
      min_age: isClass ? selectedAudienceAges().minAge : null,
      max_age: isClass ? selectedAudienceAges().maxAge : null,
      skatepark: isClass ? form.value.location || DEFAULT_SKATEPARK : null,
      price_mxn: isClass ? priceNum : null,
      coach_tier: isClass ? formCoachTier.value : null,
      max_capacity_override: isClass ? Number(form.value.max_capacity_override) || null : null,
      // Editing one class must not detach it from its program series.
      program_series_id: editingSeriesId.value,
      season_slug: isClass ? form.value.season_slug.trim() || null : null,
      discipline: isClass
        ? (isTrainingDiscipline(form.value.discipline) ? form.value.discipline : 'skateboarding')
        : null,
    }

    const withAudienceArray = {
      ...basePayload,
      audience_categories: form.value.audience_categories.length ? form.value.audience_categories : null,
    }

    const savePayload = async (payload: Record<string, unknown>) => {
      if (editingId.value) {
        const rowResult = await client
          .from('school_calendar_events')
          .update(payload)
          .eq('id', editingId.value)
        if (rowResult.error || editScope.value !== 'series' || !editingSeriesId.value) {
          return rowResult
        }
        // Propagate program-level fields to the rest of the series, leaving each
        // class on its own date and time slot.
        const shared: Record<string, unknown> = {}
        for (const key of SERIES_SHARED_FIELDS) {
          if (key in payload) shared[key] = payload[key]
        }
        return client
          .from('school_calendar_events')
          .update(shared)
          .eq('program_series_id', editingSeriesId.value)
      }
      return client
        .from('school_calendar_events')
        .insert({ ...payload, created_by: user.value!.id })
        .select('id')
    }

    let { data: saved, error } = await savePayload(withAudienceArray)
    // Column missing → retry without array; check violations need age-band migration (don't strip).
    if (
      error
      && (error.message?.includes('schema cache')
        || /column .*audience_categories.* does not exist/i.test(error.message || ''))
    ) {
      const { audience_categories: _drop, ...legacyPayload } = withAudienceArray
      ;({ data: saved, error } = await savePayload(legacyPayload))
    }

    if (error) throw error

    if (isClass) {
      // A series edit spreads the roster across every class in the program; a
      // single edit or a one-off class only touches its own row.
      let targets: string[] = []
      if (editingId.value) {
        if (editScope.value === 'series' && editingSeriesId.value) {
          const { data: siblings } = await client
            .from('school_calendar_events')
            .select('id')
            .eq('program_series_id', editingSeriesId.value)
          targets = ((siblings as any[]) || []).map(r => r.id)
        } else {
          targets = [editingId.value]
        }
      } else {
        targets = ((saved as any[]) || []).map(r => r.id)
      }
      await syncCoachAssignments(targets)
    }

    await loadEvents()
    closeModal()
  } catch (e: any) {
    formError.value = calendarDbErrorMessage(e?.message || String(e))
  } finally {
    saving.value = false
  }
}

const requestDelete = () => {
  if (!editingId.value) return
  const ev = editingEvent.value
  if (ev?.program_series_id) {
    deleteSeriesId.value = ev.program_series_id
    deleteSeriesOpen.value = true
    return
  }
  void confirmAndDeleteOne()
}

const confirmAndDeleteOne = async () => {
  if (!editingId.value) return
  const ok = confirm(
    language.value === 'es' ? '¿Eliminar solo esta ocurrencia?' : 'Delete only this occurrence?',
  )
  if (!ok) return
  await performDelete({ series: false })
}

const performDelete = async (opts: { series: boolean }) => {
  if (!editingId.value) return
  deleting.value = true
  saving.value = true
  formError.value = ''
  try {
    if (opts.series && deleteSeriesId.value) {
      const { error } = await client
        .from('school_calendar_events')
        .delete()
        .eq('program_series_id', deleteSeriesId.value)
      if (error) throw error
    } else {
      const { error } = await client
        .from('school_calendar_events')
        .delete()
        .eq('id', editingId.value)
      if (error) throw error
    }
    deleteSeriesOpen.value = false
    deleteSeriesId.value = null
    await loadEvents()
    closeModal()
  } catch (e: any) {
    formError.value = e?.message || String(e)
  } finally {
    deleting.value = false
    saving.value = false
  }
}

const goToday = () => {
  viewMonth.value = new Date()
  selectedDate.value = new Date()
}

const goToPeriod = (direction: -1 | 1) => {
  if (calendarView.value === 'week') {
    selectedDate.value = addDays(selectedDate.value, direction * 7)
    viewMonth.value = startOfMonth(selectedDate.value)
    return
  }
  viewMonth.value = addMonths(viewMonth.value, direction)
}

const isSelectedDay = (day: Date) => isSameDay(day, selectedDate.value)

const isPastDay = (day: Date) => isBefore(startOfDay(day), startOfDay(new Date()))

const todayYmd = () => format(new Date(), 'yyyy-MM-dd')

const seasonIsPast = (startDate: string, endDate: string) => endDate < todayYmd()

const seasonIsCurrent = (startDate: string, endDate: string) => {
  const t = todayYmd()
  return t >= startDate && t <= endDate
}

/** Finished seasons move to the archive so the picker only shows live work. */
const currentSeasons = computed(() =>
  programSeasons.value.filter(s => !seasonIsPast(s.startDate, s.endDate)),
)

/** Add-class dropdown skips closed seasons. A class already on one still shows that season. */
const seasonChoicesForForm = computed(() => {
  const open = programSeasons.value.filter(s => resolveSeasonStatus(s) !== 'closed')
  const selected = form.value.season_slug
  if (!selected || open.some(s => s.slug === selected)) return open
  const current = programSeasons.value.find(s => s.slug === selected)
  return current ? [current, ...open] : open
})

const archivedSeasons = computed(() =>
  programSeasons.value
    .filter(s => seasonIsPast(s.startDate, s.endDate))
    .sort((a, b) => b.endDate.localeCompare(a.endDate)),
)

const showSeasonArchive = ref(false)

/** A selected archived season stays visible, otherwise it would vanish on reload. */
const archiveIsOpen = computed(
  () => showSeasonArchive.value || archivedSeasons.value.some(s => isSeasonSelected(s.slug)),
)

const isDayInHighlightedSeason = (day: Date) => seasonsCoveringDay(day).length > 0

const seasonMerida = (season: { startDate: string; endDate: string; status: string }) => {
  if (seasonIsPast(season.startDate, season.endDate)) {
    return { kind: 'done' as const, label: language.value === 'es' ? 'Completada' : 'Completed' }
  }
  // Same derivation the public season list uses, so the two cannot disagree.
  const status = resolveSeasonStatus(season as ProgramSeason)
  if (status === 'enrolling') {
    return { kind: 'enroll' as const, label: language.value === 'es' ? 'Inscribirse' : 'Register' }
  }
  return { kind: 'soon' as const, label: seasonStatusLabel(status, language.value === 'es') }
}

const toggleSeason = (slug: string) => {
  const season = seasonBySlug(slug) || getProgramSeasonBySlug(slug)
  if (!season) return
  seasonSelectError.value = ''
  const current = [...selectedSeasonSlugs.value]
  const idx = current.indexOf(slug)
  if (idx >= 0) {
    current.splice(idx, 1)
    persistSelectedSeasons(current)
    return
  }
  const overlap = findOverlappingRegularSeason(season, selectedSeasons.value)
  if (overlap) {
    seasonSelectError.value = language.value === 'es'
      ? `No se puede seleccionar: se cruza con ${overlap.name.es}. Solo el curso de verano puede coincidir con otra temporada.`
      : `Can't select: it overlaps ${overlap.name.en}. Only summer camp may overlap another season.`
    return
  }
  current.push(slug)
  persistSelectedSeasons(current)
}

/**
 * Anchor the stacked grids on the first month of the selection so the whole season
 * is visible, whether it was just tapped or restored from the URL on load.
 */
watch(
  () => [...selectedSeasons.value].map(s => s.startDate).sort()[0],
  (earliest) => {
    if (earliest) viewMonth.value = startOfMonth(parseYmd(earliest))
  },
  { immediate: true },
)

const removingSeasonSlug = ref('')

const confirmRemoveSeason = async (season: { slug: string; name: { es: string; en: string } }) => {
  const name = language.value === 'es' ? season.name.es : season.name.en
  const ok = window.confirm(
    language.value === 'es'
      ? `¿Quitar “${name}”? También desaparecerá de la página de inicio.`
      : `Remove “${name}”? It will also disappear from the home page.`,
  )
  if (!ok) return
  removingSeasonSlug.value = season.slug
  seasonSelectError.value = ''
  try {
    await removeSeason(season.slug)
    persistSelectedSeasons(selectedSeasonSlugs.value.filter(s => s !== season.slug))
  } catch (e: unknown) {
    const err = e as { data?: { message?: string }; message?: string }
    seasonSelectError.value = err?.data?.message || err?.message || 'Error'
  } finally {
    removingSeasonSlug.value = ''
  }
}

type ProgramSeriesSummary = {
  key: string
  seriesId: string | null
  representative: SchoolCalendarRow
  title: string
  seasonSlug: string
  startDate: string
  endDate: string
  classCount: number
  isPast: boolean
  isActive: boolean
}

const showPastPrograms = ref(false)
const deletingProgramKey = ref('')

const resolveEventSeasonSlug = (ev: SchoolCalendarRow): string => {
  const tagged = ev.season_slug?.trim()
  if (tagged) return tagged
  const end = ev.end_date || ev.start_date
  const covering = programSeasons.value.filter(
    s => s.startDate <= end && s.endDate >= ev.start_date,
  )
  if (covering.length === 1) return covering[0].slug
  const regular = covering.find(s => !isSummerCourseSeason(s.slug))
  return regular?.slug || covering[0]?.slug || ''
}

const programSeriesSummaries = computed((): ProgramSeriesSummary[] => {
  const groups = new Map<string, SchoolCalendarRow[]>()
  for (const ev of events.value) {
    if (!isProgramType(ev.event_type)) continue
    const key = ev.program_series_id || ev.id
    const list = groups.get(key) || []
    list.push(ev)
    groups.set(key, list)
  }

  const today = todayYmd()
  const summaries: ProgramSeriesSummary[] = []

  for (const [key, occs] of groups) {
    const sorted = [...occs].sort((a, b) => a.start_date.localeCompare(b.start_date))
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const startDate = first.start_date
    const endDate = last.start_date
    const seasonSlug = resolveEventSeasonSlug(first)
    const isPast = endDate < today
    const isActive = startDate <= today && endDate >= today

    summaries.push({
      key,
      seriesId: first.program_series_id ?? null,
      representative: first,
      title: first.title,
      seasonSlug,
      startDate,
      endDate,
      classCount: sorted.length,
      isPast,
      isActive,
    })
  }

  return summaries.sort((a, b) => a.startDate.localeCompare(b.startDate))
})

const filteredProgramSummaries = computed(() => {
  let list = programSeriesSummaries.value

  if (selectedSeasonSlugs.value.length) {
    list = list.filter(p => p.seasonSlug && selectedSeasonSlugs.value.includes(p.seasonSlug))
  }

  if (!showPastPrograms.value) {
    list = list.filter(p => !p.isPast)
  }

  return list
})

function programDiscipline(program: { title: string; representative: SchoolCalendarRow }) {
  if (isTrainingDiscipline(program.representative.discipline)) return program.representative.discipline
  const text = program.title.toLowerCase()
  if (text.includes('scooter')) return 'scooter'
  if (text.includes('bmx')) return 'bmx'
  if (text.includes('parkour')) return 'parkour'
  if (text.includes('patinaje') || text.includes('roller') || text.includes('inline')) return 'rollerblading'
  return 'skateboarding'
}

function eventSportEmoji(ev: SchoolCalendarRow) {
  if (!isProgramType(ev.event_type)) return ''
  return disciplineEmoji(isTrainingDiscipline(ev.discipline) ? ev.discipline : 'skateboarding')
}

const seasonProgramInfo = (slug: string, includePast = false) => {
  const list = programSeriesSummaries.value.filter(p => p.seasonSlug === slug && (includePast ? p.isPast : !p.isPast))
  const disciplines: string[] = []
  let active = 0
  for (const program of list) {
    if (program.isActive) active += 1
    const discipline = programDiscipline(program)
    if (!disciplines.includes(discipline)) disciplines.push(discipline)
  }
  return { active, scheduled: list.length, disciplines }
}

const programSidebarSeasonLabel = (slug: string) => {
  if (!slug) return ''
  const season = seasonBySlug(slug) || getProgramSeasonBySlug(slug)
  if (!season) return slug
  return language.value === 'es' ? season.name.es : season.name.en
}

/**
 * A season is the container; a program is one level/age offering inside it.
 * The sidebar used to print the season title as each program's own name, so the
 * two concepts read as duplicates. Rows are now identified by what actually
 * differs between them and the season is stated once, as a parent.
 */
const programIdentityLabel = (program: ProgramSeriesSummary) => {
  const ev = program.representative
  const track = PROGRAM_SKILL_TRACKS.find(
    t => t.id === skillTrackFromLevelId(ev.skill_level),
  )
  const level = track ? (language.value === 'es' ? track.label.es : track.label.en) : ''
  const ages =
    ev.min_age != null && ev.max_age != null
      ? `${ev.min_age}–${ev.max_age}`
      : ev.min_age != null
        ? `${ev.min_age}+`
        : ''
  return [level, ages].filter(Boolean).join(' ') || program.title
}

/** Format, time and length — what tells two same-level programs apart. */
const programMetaLabel = (program: ProgramSeriesSummary) => {
  const es = language.value === 'es'
  const ev = program.representative
  const kind = ev.event_type === 'class_individual'
    ? (es ? 'Individual' : 'Individual')
    : (es ? 'Grupal' : 'Group')
  const classes = `${program.classCount} ${
    es
      ? (program.classCount === 1 ? 'clase' : 'clases')
      : (program.classCount === 1 ? 'class' : 'classes')
  }`
  return [kind, eventChipTime(ev), classes].filter(Boolean).join(' · ')
}

const programSeasonGroups = computed(() => {
  const groups = new Map<string, {
    slug: string
    name: string
    startDate: string
    endDate: string
    programs: ProgramSeriesSummary[]
  }>()

  for (const program of filteredProgramSummaries.value) {
    const slug = program.seasonSlug || ''
    if (!groups.has(slug)) {
      const season = slug ? (seasonBySlug(slug) || getProgramSeasonBySlug(slug)) : null
      groups.set(slug, {
        slug,
        name: season
          ? (language.value === 'es' ? season.name.es : season.name.en)
          : (language.value === 'es' ? 'Sin temporada' : 'No season'),
        startDate: season?.startDate || '',
        endDate: season?.endDate || '',
        programs: [],
      })
    }
    groups.get(slug)!.programs.push(program)
  }

  // Undated groups sink to the bottom rather than jumping to the front.
  return [...groups.values()].sort((a, b) =>
    (a.startDate || '9999').localeCompare(b.startDate || '9999'),
  )
})

const programStatusBadge = (program: ProgramSeriesSummary) => {
  if (program.isPast) {
    return { kind: 'done' as const, label: language.value === 'es' ? 'Completado' : 'Completed' }
  }
  if (program.isActive) {
    return { kind: 'active' as const, label: language.value === 'es' ? 'Activo' : 'Active' }
  }
  return { kind: 'soon' as const, label: language.value === 'es' ? 'Próximo' : 'Upcoming' }
}

const formatProgramDateRange = (start: string, end: string) => {
  const loc = language.value === 'es' ? es : undefined
  const s = parseYmd(start)
  const e = parseYmd(end)
  if (start === end) return format(s, 'd MMM yyyy', { locale: loc })
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${format(s, 'd', { locale: loc })} – ${format(e, 'd MMM yyyy', { locale: loc })}`
  }
  return `${format(s, 'd MMM', { locale: loc })} – ${format(e, 'd MMM yyyy', { locale: loc })}`
}

const openEditProgram = (program: ProgramSeriesSummary) => {
  openEdit(program.representative)
}

const confirmDeleteProgram = async (program: ProgramSeriesSummary) => {
  const label = program.title
  const ok = window.confirm(
    language.value === 'es'
      ? program.classCount > 1
        ? `¿Eliminar el programa “${label}” y sus ${program.classCount} clases?`
        : `¿Eliminar el programa “${label}”?`
      : program.classCount > 1
        ? `Delete program “${label}” and all ${program.classCount} classes?`
        : `Delete program “${label}”?`,
  )
  if (!ok) return

  deletingProgramKey.value = program.key
  formError.value = ''
  try {
    if (program.seriesId) {
      const { error } = await client
        .from('school_calendar_events')
        .delete()
        .eq('program_series_id', program.seriesId)
      if (error) throw error
    } else {
      const { error } = await client
        .from('school_calendar_events')
        .delete()
        .eq('id', program.representative.id)
      if (error) throw error
    }
    await loadEvents()
  } catch (e: unknown) {
    const err = e as { message?: string }
    formError.value = err?.message || String(e)
  } finally {
    deletingProgramKey.value = ''
  }
}

const selectDay = (day: Date) => {
  selectedDate.value = day
  viewMonth.value = startOfMonth(day)
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <MemberStaffPageHeader
      :title="language === 'es' ? 'Calendario' : 'Calendar'"
      :subtitle="language === 'es' ? 'Eventos, clases y temporadas de Niik Skate' : 'Niik Skate events, classes, and seasons'"
    >
      <template #actions>
        <div class="relative">
          <button
            type="button"
            class="px-4 py-2.5 rounded-xl bg-acid text-charcoal font-semibold text-sm hover:bg-acid-300 transition-colors"
            :aria-expanded="addMenuOpen"
            @click="addMenuOpen = !addMenuOpen"
          >
            + {{ language === 'es' ? 'Añadir' : 'Add' }}
          </button>
          <div
            v-if="addMenuOpen"
            class="absolute right-0 top-full z-[80] mt-2 w-52 overflow-hidden rounded-xl border border-[#353535] bg-[#171717] shadow-2xl"
          >
            <button
              type="button"
              class="block w-full px-4 py-3 text-left text-sm font-semibold text-[#F5F5F5] hover:bg-[#262626]"
              @click="addMenuOpen = false; openAddProgram()"
            >
              {{ language === 'es' ? 'Clase / Programa' : 'Class / Program' }}
            </button>
            <button
              type="button"
              class="block w-full border-t border-[#353535] px-4 py-3 text-left text-sm text-[#F5F5F5] hover:bg-[#262626]"
              @click="addMenuOpen = false; openAddEvent()"
            >
              {{ language === 'es' ? 'Evento' : 'Event' }}
            </button>
            <button
              type="button"
              class="block w-full border-t border-[#353535] px-4 py-3 text-left text-sm text-[#F5F5F5] hover:bg-[#262626]"
              @click="addMenuOpen = false; addSeasonOpen = true"
            >
              {{ language === 'es' ? 'Temporada' : 'Season' }}
            </button>
          </div>
        </div>
      </template>
    </MemberStaffPageHeader>

    <div v-if="checkingAccess || profileLoading" class="flex justify-center py-16 px-4">
      <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
    </div>

    <div v-else-if="accessError" class="px-4 py-16 max-w-lg mx-auto text-center space-y-3">
      <p class="text-red-300 text-sm">{{ accessError }}</p>
      <button
        type="button"
        class="px-4 py-2 rounded-xl bg-gray-800 text-white text-sm font-semibold"
        @click="bootstrapPage"
      >
        {{ language === 'es' ? 'Reintentar' : 'Retry' }}
      </button>
    </div>

    <div v-else-if="!profileIsAdmin" class="px-4 py-16 max-w-lg mx-auto text-center text-sm text-gray-400">
      {{ language === 'es' ? 'Redirigiendo…' : 'Redirecting…' }}
    </div>

    <div v-else class="px-4 py-6 max-w-7xl mx-auto">
      <div v-if="formError && !modalOpen" class="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200 mb-4">
        {{ formError }}
        <p class="text-xs text-red-300/80 mt-2">
          {{
            language === 'es'
              ? 'Si la tabla no existe, ejecuta add_school_calendar_events.sql en Supabase.'
              : 'If the table is missing, run add_school_calendar_events.sql in Supabase.'
          }}
        </p>
      </div>

      <div class="flex flex-col gap-8">
        <aside class="order-2">
          <h2 class="text-[13px] font-bold uppercase tracking-[0.1em] text-gold-400 mb-3">
            {{ language === 'es' ? 'Temporadas' : 'Seasons' }}
          </h2>
          <p v-if="seasonSelectError" class="text-[11px] text-amber-300 mb-2">{{ seasonSelectError }}</p>
          <div class="rounded-2xl border border-gray-800 bg-gray-950 overflow-hidden">
            <p
              v-if="!currentSeasons.length"
              class="px-3 py-4 text-[11px] text-gray-500 text-center"
            >
              {{ language === 'es'
                ? 'No hay temporadas activas. Revisa el archivo o agrega una.'
                : 'No active seasons. Check the archive or add one.' }}
            </p>
            <AdminSeasonPickerCard
              v-for="season in currentSeasons"
              :key="season.slug"
              :season="season"
              :selected="isSeasonSelected(season.slug)"
              :past="false"
              :color="seasonColorFor(season.slug)"
              :status="seasonMerida(season)"
              :removing="removingSeasonSlug === season.slug"
              :active-programs="seasonProgramInfo(season.slug).active"
              :scheduled-programs="seasonProgramInfo(season.slug).scheduled"
              :disciplines="seasonProgramInfo(season.slug).disciplines"
              @toggle="toggleSeason(season.slug)"
              @remove="confirmRemoveSeason(season)"
            />
          </div>

          <!-- Archive: finished seasons, out of the way but still reachable -->
          <AdminCollapsible
            v-if="archivedSeasons.length"
            class="mt-3 px-1"
            :title="language === 'es' ? 'Archivo' : 'Archive'"
            :meta="archivedSeasons.length"
            :open="archiveIsOpen"
            @update:open="showSeasonArchive = $event"
          >
            <div class="rounded-2xl border border-gray-800 bg-gray-950 overflow-y-auto max-h-[50vh]">
              <AdminSeasonPickerCard
                v-for="season in archivedSeasons"
                :key="season.slug"
                :season="season"
                :selected="isSeasonSelected(season.slug)"
                :past="true"
                :color="seasonColorFor(season.slug)"
                :status="seasonMerida(season)"
                :removing="removingSeasonSlug === season.slug"
                :active-programs="seasonProgramInfo(season.slug, true).active"
                :scheduled-programs="seasonProgramInfo(season.slug, true).scheduled"
                :disciplines="seasonProgramInfo(season.slug, true).disciplines"
                @toggle="toggleSeason(season.slug)"
                @remove="confirmRemoveSeason(season)"
              />
            </div>
          </AdminCollapsible>
        </aside>

        <div class="order-1 min-w-0 flex-1 space-y-4">

      <!-- Toolbar -->
      <div class="flex flex-col gap-3 rounded-t-2xl border border-gray-800 bg-gray-950 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="p-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white"
            @click="goToPeriod(-1)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span class="text-white font-semibold capitalize min-w-[170px] text-center">{{ monthLabel }}</span>
          <button
            type="button"
            class="p-2 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white"
            @click="goToPeriod(1)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex rounded-xl border border-gray-700 bg-gray-900 p-0.5">
            <button
              v-for="view in (['today', 'week', 'month'] as const)"
              :key="view"
              type="button"
              class="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-[0.08em] transition-colors"
              :class="calendarView === view
                ? 'bg-teal-600 text-white'
                : 'text-gray-400 hover:text-gray-200'"
              :aria-pressed="calendarView === view"
              @click="setCalendarView(view)"
            >
              {{
                view === 'today'
                  ? (language === 'es' ? 'Hoy' : 'Today')
                  : view === 'week'
                    ? (language === 'es' ? 'Semana' : 'Week')
                    : (language === 'es' ? 'Mes' : 'Month')
              }}
            </button>
          </div>
          <select
            v-model="filterType"
            class="hidden md:block min-w-[160px] px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm"
          >
            <option value="all">{{ language === 'es' ? 'Todos los eventos' : 'All events' }}</option>
            <option v-for="t in filterEventTypes" :key="t" :value="t">{{ tLabel(t) }}</option>
          </select>
        </div>
      </div>

      <!-- Grid -->
      <div v-if="loading" class="flex justify-center py-16">
        <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
      <!-- Hoy: the running order for one day, ready to act on. -->
      <section
        v-else-if="calendarView === 'today'"
        class="bg-gray-950 border border-gray-800 rounded-b-2xl"
      >
        <div class="px-4 py-3 border-b border-gray-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-[13px] font-bold uppercase tracking-[0.1em] text-white">
              {{ todayHeading }}
            </p>
            <p class="text-[11px] uppercase tracking-wider text-gray-500 mt-0.5">
              {{ todaySkatepark }}
            </p>
          </div>
          <button
            v-if="todayClasses.some(ev => !ev.cancelled_at)"
            type="button"
            class="px-3 py-1.5 rounded-lg border border-sky-500/50 text-sky-200 hover:bg-sky-950/60 text-xs font-semibold"
            @click="openWeatherCancel(todayClasses.map(ev => ev.id))"
          >
            {{ language === 'es' ? 'Cancelar por clima' : 'Cancel for weather' }}
          </button>
        </div>

        <p
          v-if="weatherResult"
          class="px-4 py-2 text-xs text-emerald-300 border-b border-gray-800"
        >
          {{ weatherResult }}
        </p>

        <p
          v-if="!todayClasses.length && !todayOtherEvents.length"
          class="px-4 py-10 text-center text-sm text-gray-500"
        >
          {{ language === 'es' ? 'No hay clases hoy.' : 'No classes today.' }}
        </p>

        <article
          v-for="ev in todayClasses"
          :key="'today-' + ev.id"
          class="border-b border-gray-800 last:border-b-0 px-4 py-4"
        >
          <p class="inline-flex rounded-md border border-white/25 bg-black/30 px-2 py-0.5 text-sm font-semibold text-gold-300">
            {{ agendaTime(ev) }}
          </p>
          <div
            class="h-0.5 rounded-full my-2"
            :style="{ backgroundColor: SKILL_CHIP_COLOR[skillTrackFromLevelId(ev.skill_level)].solid }"
            aria-hidden="true"
          />
          <p class="text-base font-semibold text-white flex items-center gap-2">
            <MemberSessionKindIcon v-if="ev.event_type === 'class_session' || ev.event_type === 'class_individual'" :kind="ev.event_type" />
            <span class="leading-none" aria-hidden="true">{{ eventSportEmoji(ev) }}{{ eventAgeEmojis(ev).join('') || eventChipEmoji(ev) }}</span>
            <span class="truncate">{{ eventChipLabel(ev) }}</span>
          </p>
          <p v-if="ev.season_slug" class="text-xs text-gray-400 mt-0.5">
            {{ programSidebarSeasonLabel(ev.season_slug) }}
          </p>

          <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span class="text-gray-300">
              <span class="font-semibold">{{ enrollmentCounts[ev.id] || 0 }}</span>
              <span v-if="capacityForEvent(ev) > 0" class="text-gray-500">
                / {{ capacityForEvent(ev) }}
              </span>
              <span class="text-gray-500"> {{ language === 'es' ? 'estudiantes' : 'students' }}</span>
            </span>
            <span class="text-gray-500">
              {{ language === 'es' ? 'Coach' : 'Coach' }}:
              <span class="text-gray-300">
                {{ coachesForEvent(ev).length ? coachesForEvent(ev).join(', ') : '—' }}
              </span>
            </span>
          </div>

          <p
            v-if="ev.cancelled_at"
            class="mt-2 text-xs font-semibold text-sky-300"
          >
            {{ language === 'es' ? 'Cancelada por clima' : 'Cancelled for weather' }}
            <span v-if="ev.makeup_note" class="font-normal text-gray-400"> · {{ ev.makeup_note }}</span>
          </p>

          <div class="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-900 transition-colors text-xs font-semibold"
              @click="openEdit(ev, $event)"
            >
              {{ language === 'es' ? 'Ver clase' : 'View class' }}
            </button>
            <button
              v-if="!ev.cancelled_at"
              type="button"
              class="px-3 py-1.5 rounded-lg border border-sky-500/40 text-sky-200 hover:bg-sky-950/50 text-xs font-semibold"
              @click="openWeatherCancel([ev.id])"
            >
              {{ language === 'es' ? 'Cancelar por clima' : 'Cancel for weather' }}
            </button>
          </div>
        </article>

        <button
          v-for="ev in todayOtherEvents"
          :key="'today-other-' + ev.id"
          type="button"
          class="grid w-full grid-cols-[76px_12px_1fr] gap-3 border-b border-gray-800 px-4 py-3 text-left last:border-b-0 hover:bg-gray-900"
          @click="openEdit(ev, $event)"
        >
          <span class="text-[11px] font-medium text-gray-400 mt-0.5">{{ agendaTime(ev) }}</span>
          <span class="mt-1 h-2.5 w-2.5 rounded-full" :class="EVENT_META[ev.event_type]?.dot" />
          <span class="min-w-0">
            <span class="block truncate text-sm font-semibold text-white">{{ ev.title }}</span>
            <span class="block text-xs text-gray-500">{{ tLabel(ev.event_type) }}</span>
          </span>
        </button>
      </section>

      <template v-else>
      <div
        v-for="month in displayedPeriods"
        :key="month.toISOString()"
        class="bg-gray-950 border border-gray-800 rounded-b-2xl overflow-x-auto"
      >
        <div class="min-w-[760px]">
        <!-- Only worth naming each grid once a season stacks more than one month -->
        <p
          v-if="calendarView === 'month' && visibleMonths.length > 1"
          class="px-3 py-2 border-b border-gray-800 text-sm font-semibold text-white capitalize"
        >
          {{ monthLabelFor(month) }}
        </p>
        <div class="grid grid-cols-7 border-b border-gray-800">
          <div
            v-for="w in weekdayLabels"
            :key="w"
            class="py-2 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wide"
          >
            {{ w }}
          </div>
        </div>
        <div class="grid grid-cols-7 auto-rows-fr">
          <div
            v-for="(day, idx) in displayedDays(month)"
            :key="idx"
            role="button"
            tabindex="0"
            class="min-h-[240px] border-b border-r border-gray-800 p-2 text-left align-top transition-colors hover:bg-gray-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 cursor-pointer"
            :class="{
              'bg-gray-950/50': !isSameMonth(day, month) && !isDayInHighlightedSeason(day),
              'opacity-50': isPastDay(day) && !isDayInHighlightedSeason(day),
              'ring-2 ring-inset ring-white': isSelectedDay(day),
            }"
            :style="daySeasonStyle(day, month)"
            @click="selectDay(day)"
            @keydown.enter.prevent="selectDay(day)"
            @keydown.space.prevent="selectDay(day)"
          >
            <div class="relative mb-1 flex items-center justify-between gap-1">
              <span
                class="text-xs font-semibold"
                :class="[
                  isToday(day)
                    ? 'text-gold-400'
                    : isDayInHighlightedSeason(day)
                      ? 'text-white'
                      : isPastDay(day)
                        ? 'text-gray-500'
                        : isSameMonth(day, viewMonth)
                          ? 'text-white'
                          : 'text-gray-600',
                ]"
              >
                {{ format(day, 'd') }}
              </span>
              <button
                v-if="isSelectedDay(day)"
                type="button"
                class="flex h-4 w-4 items-center justify-center rounded-full bg-acid text-xs font-semibold leading-none text-charcoal hover:bg-acid-300"
                :aria-expanded="dayAddMenuOpen"
                :aria-label="language === 'es' ? 'Añadir en este día' : 'Add on this day'"
                @click.stop="dayAddMenuOpen = !dayAddMenuOpen"
                @keydown.enter.stop
                @keydown.space.stop
              >
                {{ dayAddMenuOpen ? '×' : '+' }}
              </button>
              <div
                v-if="isSelectedDay(day) && dayAddMenuOpen"
                class="absolute right-0 top-5 z-[80] min-w-[7rem] overflow-hidden rounded-md border border-[#2C2C2C] bg-[#171717] py-0.5 text-left shadow-xl"
                @click.stop
              >
                <button
                  type="button"
                  class="block w-full whitespace-nowrap px-2 py-1 text-left text-[11px] leading-tight text-[#E5E5E5] hover:bg-[#262626] hover:text-acid"
                  @click="dayAddMenuOpen = false; openCreateForDay(day, 'program')"
                >
                  {{ language === 'es' ? 'Clase / Programa' : 'Class / Program' }}
                </button>
                <button
                  type="button"
                  class="block w-full whitespace-nowrap px-2 py-1 text-left text-[11px] leading-tight text-[#E5E5E5] hover:bg-[#262626] hover:text-acid"
                  @click="dayAddMenuOpen = false; openCreateForDay(day, 'event')"
                >
                  {{ language === 'es' ? 'Evento' : 'Event' }}
                </button>
                <button
                  type="button"
                  class="block w-full whitespace-nowrap px-2 py-1 text-left text-[11px] leading-tight text-[#E5E5E5] hover:bg-[#262626] hover:text-acid"
                  @click="dayAddMenuOpen = false; addSeasonOpen = true"
                >
                  {{ language === 'es' ? 'Temporada' : 'Season' }}
                </button>
              </div>
            </div>
            <div
              class="flex flex-col gap-1 max-h-[12.5rem] overflow-y-auto overscroll-contain"
            >
              <div
                v-for="group in eventTimeGroups(day)"
                :key="group.key || 'all-day'"
                class="rounded-md border px-0.5 py-0.5"
                :class="group.special ? 'border-acid/50 bg-acid/10' : 'border-white/25 bg-black/20'"
              >
                <p
                  class="px-0.5 text-[9px] font-black leading-none tracking-wide"
                  :class="group.special ? 'text-acid' : 'text-gold-300'"
                >
                  <template v-if="group.special">★ </template>{{ group.label }}
                </p>
                <button
                  v-for="ev in group.events"
                  :key="ev.id"
                  type="button"
                  class="relative mt-0.5 w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight truncate border transition-colors shrink-0"
                  :class="[
                    isProgramChipTinted(ev)
                      ? 'text-white font-semibold border-transparent'
                      : isPastDay(day)
                        ? 'bg-gray-900/80 text-gray-500 border-gray-800'
                        : 'bg-gray-800/90 text-gray-200 border-gray-700 hover:border-gold-500/50',
                    classStaffWarning(ev) && !isPastDay(day) ? 'pr-5' : '',
                  ]"
                  :style="eventChipHighlightStyle(ev, day)"
                  :title="chipTitle(ev)"
                  @click.stop="openEdit(ev, $event)"
                >
                  <span
                    v-if="classStaffWarning(ev) && !isPastDay(day)"
                    class="absolute right-0.5 top-1/2 -translate-y-1/2 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#FACC15] text-[9px] font-black leading-none text-[#151515] shadow-[0_0_0_1.5px_#151515]"
                    :title="classStaffWarning(ev)"
                    role="img"
                    :aria-label="classStaffWarning(ev)"
                  >!</span>
                  <MemberSessionKindIcon
                    v-if="ev.event_type === 'class_session' || ev.event_type === 'class_individual'"
                    :kind="ev.event_type"
                    small
                    class="mr-0.5 align-middle"
                    :class="!isProgramChipTinted(ev) && isPastDay(day) ? 'grayscale' : ''"
                  />
                  <span
                    v-if="isBlockedProgram(ev)"
                    class="inline-block mr-0.5 align-middle text-[11px] leading-none"
                    :aria-label="blockedProgramTitle(ev)"
                  >🚫</span>
                  <span
                    v-else-if="eventAgeEmojis(ev).length"
                    class="inline-block mr-0.5 align-middle text-[11px] leading-none"
                    :class="!isProgramChipTinted(ev) && isPastDay(day) ? 'grayscale' : ''"
                    aria-hidden="true"
                  >{{ eventSportEmoji(ev) }}{{ eventAgeEmojis(ev).join('') }}</span>
                  <span
                    v-else-if="isProgramType(ev.event_type)"
                    class="inline-block mr-0.5 align-middle text-[11px] leading-none"
                    :class="!isProgramChipTinted(ev) && isPastDay(day) ? 'grayscale' : ''"
                    aria-hidden="true"
                  >{{ eventSportEmoji(ev) || eventChipEmoji(ev) }}</span>
                  <span
                    v-else
                    class="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                    :class="isPastDay(day) ? 'bg-gray-600' : (EVENT_META[ev.event_type]?.dot || 'bg-gray-500')"
                  />
                  <span :class="isBlockedProgram(ev) ? 'line-through opacity-80' : ''">{{ eventChipLabel(ev) }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
      </template>

      <section class="pt-3">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h2 class="text-[13px] font-bold uppercase tracking-[0.1em] text-gray-400">
            {{ selectedDayHeading }}
          </h2>
          <div class="flex items-center gap-2">
            <button
              v-if="dayClassesToComplete.length"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-950/40"
              @click="askMarkClassesDone(dayClassesToComplete.map(ev => ev.id))"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              {{ language === 'es' ? 'Todas hechas' : 'All done' }}
            </button>
            <button
              v-if="dayClassesToCancel.length"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 px-2 py-1 text-[11px] font-semibold text-sky-200 hover:bg-sky-950/40"
              @click="openWeatherCancel(dayClassesToCancel.map(ev => ev.id))"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
              {{ language === 'es' ? 'Todas canceladas' : 'Cancel all' }}
            </button>
          </div>
        </div>
        <p v-if="weatherError" class="mb-2 text-xs text-red-400">{{ weatherError }}</p>
        <div class="space-y-3">
          <p v-if="!selectedDayEvents.length" class="rounded-2xl border border-gray-800 bg-gray-950 px-4 py-6 text-sm text-gray-500">
            {{ language === 'es' ? 'No hay actividades este día.' : 'No activities on this day.' }}
          </p>
          <section
            v-for="group in eventTimeGroups(selectedDate)"
            :key="group.key || 'all-day'"
            class="overflow-hidden rounded-2xl border bg-gray-950"
            :class="group.special ? 'border-acid/50' : 'border-white/20'"
          >
            <p class="px-4 pt-3 text-sm font-bold" :class="group.special ? 'text-acid' : 'text-gold-300'">
              <template v-if="group.special">★ {{ language === 'es' ? 'Evento especial' : 'Special event' }} · </template>{{ group.label }}
            </p>
            <div
              v-for="ev in group.events"
              :key="ev.id"
              class="grid w-full grid-cols-[12px_minmax(0,1fr)_auto] gap-3 border-b border-gray-800 px-4 py-3 last:border-b-0 items-start"
              :class="classStaffWarning(ev) ? 'bg-amber-500/5' : ''"
            >
              <button type="button" class="col-span-2 grid grid-cols-[12px_minmax(0,1fr)] gap-3 text-left min-w-0" @click="openEdit(ev, $event)">
                <span
                  class="mt-1.5 h-2.5 w-2.5 rounded-full"
                  :class="!isProgramType(ev.event_type) ? EVENT_META[ev.event_type]?.dot : ''"
                  :style="isProgramType(ev.event_type)
                    ? { backgroundColor: SKILL_CHIP_COLOR[skillTrackFromLevelId(ev.skill_level)].solid }
                    : {}"
                />
                <span class="min-w-0">
                  <span class="block truncate text-sm font-semibold text-white">
                    <span class="mr-1" aria-hidden="true">{{ eventSportEmoji(ev) }}<span v-if="eventAgeEmojis(ev).length">{{ eventAgeEmojis(ev).join('') }}</span></span>{{ ev.title }}
                    <span
                      v-if="ev.session_outcome === 'done'"
                      class="ml-1 text-emerald-400"
                      aria-label="done"
                    >✓</span>
                    <span
                      v-else-if="ev.session_outcome === 'cancelled' || ev.cancelled_at"
                      class="ml-1 text-sky-300"
                      aria-label="cancelled"
                    >✕</span>
                  </span>
                  <span v-if="ev.season_slug" class="block truncate text-xs text-gray-400">
                    {{ programSidebarSeasonLabel(ev.season_slug) }}
                  </span>
                  <span class="block text-xs text-gray-500">
                    {{ agendaMeta(ev) }}
                    <template v-if="assignedByEvent[ev.id]?.length">
                      · {{ assignedByEvent[ev.id].map(c => coachInitials(c.name)).join(' ') }}
                      <template v-for="c in assignedByEvent[ev.id].filter(coach => coach.coveringForName)" :key="c.id">
                        · {{ language === 'es' ? 'cubre a' : 'covering' }} {{ coachInitials(c.coveringForName || '') }}
                      </template>
                    </template>
                  </span>
                  <span
                    v-if="classStaffWarning(ev)"
                    class="mt-1 flex items-center gap-1 text-[11px] font-semibold text-amber-300"
                  >
                    <svg class="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.518 11.59c.75 1.335-.213 2.986-1.742 2.986H3.48c-1.53 0-2.493-1.651-1.743-2.986l6.52-11.59zM11 14a1 1 0 11-2 0 1 1 0 012 0zm-1-7a1 1 0 00-1 1v3a1 1 0 002 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
                    </svg>
                    {{ classStaffWarning(ev) }}
                  </span>
                </span>
              </button>
              <div v-if="isProgramType(ev.event_type)" class="flex items-center gap-0.5">
                <button
                  type="button"
                  class="p-1.5 rounded-md text-gray-400 hover:text-white hover:bg-gray-800"
                  :aria-label="language === 'es' ? 'Asignar coach' : 'Assign coach'"
                  :title="language === 'es' ? 'Asignar coach' : 'Assign coach'"
                  @click="openAssign(ev)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7zM19 8v6m3-3h-6" />
                  </svg>
                </button>
                <button
                  v-if="ev.session_outcome !== 'done'"
                  type="button"
                  class="p-1.5 rounded-md text-gray-400 hover:text-emerald-300 hover:bg-gray-800"
                  :aria-label="language === 'es' ? 'Marcar hecha' : 'Mark done'"
                  :title="language === 'es' ? 'Marcar hecha' : 'Mark done'"
                  @click="markClassDone(ev)"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
                <button
                  v-if="ev.session_outcome !== 'cancelled' && !ev.cancelled_at"
                  type="button"
                  class="p-1.5 rounded-md text-gray-400 hover:text-sky-300 hover:bg-gray-800"
                  :aria-label="language === 'es' ? 'Cancelar por clima' : 'Cancel for weather'"
                  :title="language === 'es' ? 'Cancelar por clima' : 'Cancel for weather'"
                  @click="openWeatherCancel([ev.id])"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
        </div>

        <aside class="order-3">
          <h2 class="text-[13px] font-bold uppercase tracking-[0.1em] text-gold-400 mb-3">
            {{ language === 'es' ? 'Programas' : 'Programs' }}
          </h2>
          <p class="text-[11px] text-gray-500 mb-2">
            {{
              selectedSeasonSlugs.length
                ? language === 'es'
                  ? 'Programas de la(s) temporada(s) seleccionada(s).'
                  : 'Programs in the selected season(s).'
                : language === 'es'
                  ? 'Todos los programas activos y próximos.'
                  : 'All active and upcoming programs.'
            }}
          </p>
          <label class="flex items-center gap-2 text-[11px] text-gray-400 mb-2 cursor-pointer select-none">
            <input
              v-model="showPastPrograms"
              type="checkbox"
              class="rounded border-gray-600 text-teal-500 focus:ring-teal-500"
            />
            {{ language === 'es' ? 'Mostrar completados' : 'Show completed' }}
          </label>
          <div class="rounded-2xl border border-gray-800 bg-gray-950 overflow-y-auto max-h-[70vh]">
            <p
              v-if="!filteredProgramSummaries.length"
              class="px-3 py-6 text-center text-[11px] text-gray-500"
            >
              {{
                language === 'es'
                  ? selectedSeasonSlugs.length
                    ? 'No hay programas en esta temporada.'
                    : 'No hay programas activos o próximos.'
                  : selectedSeasonSlugs.length
                    ? 'No programs in this season.'
                    : 'No active or upcoming programs.'
              }}
            </p>
            <template v-for="group in programSeasonGroups" :key="'season-' + group.slug">
              <!-- The season is the container, stated once for the rows below. -->
              <div
                class="px-3 py-2.5 border-b border-gray-800 bg-gray-900/70"
                :style="group.slug
                  ? { boxShadow: `inset 3px 0 0 ${seasonColorFor(group.slug).solid}` }
                  : {}"
              >
                <p class="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">
                  {{ language === 'es' ? 'Temporada' : 'Season' }}
                </p>
                <p class="text-sm font-semibold text-white leading-snug mt-0.5">
                  {{ group.name }}
                </p>
                <p v-if="group.startDate" class="text-[11px] text-gray-500 mt-0.5">
                  {{ formatProgramDateRange(group.startDate, group.endDate) }}
                </p>
              </div>
              <p
                class="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600"
              >
                {{ language === 'es' ? 'Programas' : 'Programs' }} · {{ group.programs.length }}
              </p>

              <div
                v-for="program in group.programs"
                :key="program.key"
                class="relative border-b border-gray-800 last:border-b-0"
                :class="program.isPast ? 'opacity-45' : ''"
                :style="program.seasonSlug
                  ? { backgroundColor: seasonColorFor(program.seasonSlug).fillMuted }
                  : {}"
              >
              <button
                type="button"
                class="w-full text-left px-3 py-3 pr-[4.5rem] transition-colors hover:bg-gray-900/60"
                @click="openEditProgram(program)"
              >
                <p
                  class="text-base font-semibold leading-snug flex items-center gap-2"
                  :class="program.isPast ? 'text-gray-500' : 'text-white'"
                >
                  <span
                    class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    :style="{
                      backgroundColor: SKILL_CHIP_COLOR[skillTrackFromLevelId(program.representative.skill_level)].solid,
                    }"
                    aria-hidden="true"
                  />
                  <span class="text-base leading-none" aria-hidden="true">{{ eventSportEmoji(program.representative) }}{{ eventChipEmoji(program.representative) }}</span>
                  <span class="line-clamp-2">{{ programIdentityLabel(program) }}</span>
                </p>
                <p class="text-xs text-gray-400 mt-0.5">
                  {{ programMetaLabel(program) }}
                </p>
                <p class="mt-1.5 flex items-center justify-between gap-2">
                  <span class="text-[11px] text-gray-500 truncate">
                    {{ formatProgramDateRange(program.startDate, program.endDate) }}
                  </span>
                  <span
                    class="text-[11px] font-semibold shrink-0"
                    :class="{
                      'text-teal-400': programStatusBadge(program).kind === 'active',
                      'text-gray-400': programStatusBadge(program).kind === 'soon',
                      'text-gray-500': programStatusBadge(program).kind === 'done',
                    }"
                  >
                    {{ programStatusBadge(program).label }}
                  </span>
                </p>
              </button>
              <div class="absolute top-2 right-2 flex items-center gap-0.5">
                <button
                  type="button"
                  class="p-1.5 rounded-lg text-gray-500 hover:text-cyan-300 hover:bg-cyan-950/40"
                  :title="language === 'es' ? 'Editar programa' : 'Edit program'"
                  :aria-label="language === 'es' ? 'Editar programa' : 'Edit program'"
                  @click.stop="openEditProgram(program)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/50 disabled:opacity-40"
                  :disabled="deletingProgramKey === program.key"
                  :title="language === 'es' ? 'Eliminar programa' : 'Delete program'"
                  :aria-label="language === 'es' ? 'Eliminar programa' : 'Delete program'"
                  @click.stop="confirmDeleteProgram(program)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              </div>
            </template>
          </div>
        </aside>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="modalOpen"
        class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
        @click.self="requestCloseModal"
      >
        <div
          class="add-sheet border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto shadow-xl"
          @click.stop
        >
          <div class="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
            <h2 class="text-lg font-bold text-white">
              {{
                editingId
                  ? language === 'es'
                    ? isProgramForm
                      ? 'Editar programa / clase'
                      : 'Editar evento'
                    : isProgramForm
                      ? 'Edit program / class'
                      : 'Edit event'
                  : createMode === 'program'
                    ? language === 'es'
                      ? `Añadir programa de ${disciplineLabel(form.discipline, true) || 'skate'}`
                      : `Add ${disciplineLabel(form.discipline, false) || 'skate'} program`
                    : language === 'es'
                      ? 'Añadir evento'
                      : 'Add event'
              }}
            </h2>
            <button type="button" class="p-2 text-gray-400 hover:text-white rounded-lg" aria-label="Close" @click="requestCloseModal">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="p-4 space-y-4">
            <div v-if="formError" class="text-sm text-red-400">{{ formError }}</div>

            <div class="flex justify-end -mb-2">
              <label class="inline-flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                <input v-model="form.visible_to_parents" type="checkbox" class="rounded border-gray-600 accent-[#D0F43A]" />
                {{ language === 'es' ? 'Visible para familias / estudiantes' : 'Visible to parents / students' }}
              </label>
            </div>

            <div
              v-if="editingId && editingSeriesId"
              class="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-2"
            >
              <p class="text-xs font-semibold text-amber-300 uppercase tracking-wide">
                {{ language === 'es' ? 'Aplicar cambios a' : 'Apply changes to' }}
              </p>
              <div class="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  class="rounded-lg border px-2 py-2 text-center text-[11px] font-semibold transition-all"
                  :class="
                    editScope === 'series'
                      ? 'border-amber-400 bg-amber-500/20 text-white'
                      : 'border-gray-600 text-gray-400'
                  "
                  @click="editScope = 'series'"
                >
                  {{ language === 'es' ? 'Todo el programa' : 'Whole program' }}
                  <span class="block text-[10px] font-normal text-gray-400 mt-0.5">
                    {{
                      editSeriesCount
                        ? language === 'es'
                          ? `${editSeriesCount} clases`
                          : `${editSeriesCount} classes`
                        : language === 'es'
                          ? 'todas las clases'
                          : 'all classes'
                    }}
                  </span>
                </button>
                <button
                  type="button"
                  class="rounded-lg border px-2 py-2 text-center text-[11px] font-semibold transition-all"
                  :class="
                    editScope === 'single'
                      ? 'border-amber-400 bg-amber-500/20 text-white'
                      : 'border-gray-600 text-gray-400'
                  "
                  @click="editScope = 'single'"
                >
                  {{ language === 'es' ? 'Solo esta clase' : 'This class only' }}
                  <span class="block text-[10px] font-normal text-gray-400 mt-0.5">
                    {{ form.start_date }}
                  </span>
                </button>
              </div>
              <p class="text-[10px] text-gray-500 leading-snug">
                {{
                  language === 'es'
                    ? 'Nombre, precio, nivel, edades y cupo se aplican a todo el programa. La fecha y el horario siempre cambian solo en esta clase.'
                    : 'Name, price, level, ages and capacity apply to the whole program. Date and time slot always change only on this class.'
                }}
              </p>
            </div>

            <div v-if="isProgramForm">
              <label for="program-season" class="block text-xs font-medium text-gray-400 mb-1">
                {{ language === 'es' ? 'Temporada' : 'Season' }}
                <span class="text-red-400">*</span>
              </label>
              <select
                id="program-season"
                v-model="form.season_slug"
                class="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
              >
                <option value="">
                  {{ language === 'es' ? '— Elige temporada —' : '— Select season —' }}
                </option>
                <option v-for="s in seasonChoicesForForm" :key="s.slug" :value="s.slug">
                  {{ language === 'es' ? s.name.es : s.name.en }}
                  · {{ language === 'es' ? s.dates.es : s.dates.en }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Título' : 'Title' }} *</label>
              <input
                v-model="form.title"
                type="text"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-600 text-white placeholder-gray-500 text-sm"
                :placeholder="
                  isProgramForm
                    ? language === 'es'
                      ? 'Ej. Grupal Principiante para 5-7'
                      : 'e.g. Group Beginner for 5-7'
                    : language === 'es'
                      ? 'Nombre del evento'
                      : 'Enter event title'
                "
              />
              <p v-if="isProgramForm && !editingId" class="text-[10px] text-gray-500 mt-1">
                {{
                  language === 'es'
                    ? 'Se arma solo con tipo + nivel + edad. Puedes editarlo.'
                    : 'Auto-filled from type + skill + age. You can edit it.'
                }}
              </p>
            </div>

            <div>
              <div class="flex items-center justify-between gap-2 mb-1">
                <label for="event-location" class="text-xs font-medium text-gray-400">{{ language === 'es' ? 'Ubicación' : 'Location' }}</label>
                <button
                  type="button"
                  class="text-[11px] font-semibold text-gold-300 hover:text-gold-200"
                  @click="addingSpot = !addingSpot"
                >
                  {{ language === 'es' ? '+ Lugar' : '+ Place' }}
                </button>
              </div>
              <select
                id="event-location"
                v-model="form.location"
                class="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                @change="form.skatepark = form.location"
              >
                <option v-for="loc in locationOptions" :key="loc" :value="loc">{{ loc }}</option>
              </select>
              <div v-if="addingSpot" class="mt-2 space-y-2 rounded-xl border border-gray-700 p-3">
                <input
                  v-model="newSpotName"
                  type="text"
                  class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                  :placeholder="language === 'es' ? 'Nombre del lugar' : 'Place name'"
                />
                <input
                  v-model="newSpotCity"
                  type="text"
                  class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm"
                  :placeholder="language === 'es' ? 'Ciudad' : 'City'"
                />
                <p v-if="spotError" class="text-[11px] text-red-400">{{ spotError }}</p>
                <button
                  type="button"
                  class="px-3 py-1.5 rounded-lg bg-gold-400 text-black text-xs font-bold disabled:opacity-50"
                  :disabled="spotSaving"
                  @click="saveSkateSpot"
                >
                  {{ language === 'es' ? 'Guardar lugar' : 'Save place' }}
                </button>
              </div>
            </div>

            <AdminCollapsible
              :key="editingId || 'new'"
              :title="language === 'es' ? 'Descripción' : 'Description'"
              :meta="language === 'es' ? 'opcional' : 'optional'"
              :default-open="Boolean(form.description)"
            >
              <textarea
                v-model="form.description"
                rows="3"
                class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm resize-y min-h-[72px]"
                :aria-label="language === 'es' ? 'Descripción' : 'Description'"
              />
            </AdminCollapsible>

            <div v-if="!isProgramForm" class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Inicio' : 'Start date' }} *</label>
                <input v-model="form.start_date" type="date" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Fin' : 'End date' }}</label>
                <input v-model="form.end_date" type="date" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" />
              </div>
            </div>

            <div
              :class="(createMode === 'program' || isProgramForm) && sportChoices.length > 1
                ? 'grid sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-3 items-start'
                : ''"
            >
            <div v-if="(createMode === 'program' || isProgramForm) && sportChoices.length > 1">
              <label for="program-sport" class="block text-xs font-medium text-gray-400 mb-2">
                {{ language === 'es' ? 'Deporte' : 'Sport' }} *
              </label>
              <select
                id="program-sport"
                :value="form.discipline"
                class="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                @change="pickProgramSport(($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="sport in sportChoices"
                  :key="sport.id"
                  :value="sport.id"
                >
                  {{ disciplineEmoji(sport.id) }} {{ language === 'es' ? sport.es : sport.en }}
                </option>
              </select>
            </div>

            <div>
              <p class="text-xs font-medium text-gray-400 mb-2">
                {{
                  createMode === 'program' || isProgramForm
                    ? language === 'es'
                      ? 'Tipo de programa'
                      : 'Program type'
                    : language === 'es'
                      ? 'Tipo de evento'
                      : 'Event type'
                }}
                *
              </p>
              <div
                v-if="createMode === 'program' || isProgramForm"
                class="flex flex-wrap gap-1.5"
              >
                <button
                  v-for="t in selectableEventTypes"
                  :key="t"
                  type="button"
                  class="h-11 inline-flex items-center gap-1.5 rounded-xl border px-3 transition-all text-xs font-semibold"
                  :class="
                    form.event_type === t
                      ? eventTypeSelectedClass(t)
                      : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                  "
                  :aria-pressed="form.event_type === t"
                  @click="form.event_type = t"
                >
                  <MemberSessionKindIcon v-if="t === 'class_session' || t === 'class_individual'" :kind="t" />
                  <span v-else aria-hidden="true">{{ EVENT_META[t].emoji }}</span>
                  {{ tLabel(t) }}
                </button>
              </div>
              <div v-else class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  v-for="t in selectableEventTypes"
                  :key="t"
                  type="button"
                  class="rounded-xl border px-2 py-2 text-left transition-all text-[11px] sm:text-xs leading-tight"
                  :class="
                    form.event_type === t
                      ? eventTypeSelectedClass(t)
                      : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                  "
                  @click="form.event_type = t"
                >
                  <MemberSessionKindIcon v-if="t === 'class_session' || t === 'class_individual'" :kind="t" class="mb-0.5" />
                  <span v-else class="block mb-0.5">{{ EVENT_META[t].emoji }}</span>
                  {{ tLabel(t) }}
                </button>
              </div>
            </div>
            </div>

            <div v-if="isProgramForm" class="space-y-3">
              <div class="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)] gap-3 items-start">
                <div>
                  <p class="text-xs font-medium text-gray-400 mb-2">
                    {{ language === 'es' ? 'Nivel (puedes elegir varios)' : 'Level (select one or more)' }}
                    <span class="text-red-400">*</span>
                  </p>
                  <div class="grid grid-cols-3 gap-1.5">
                    <button
                      v-for="track in PROGRAM_SKILL_TRACKS"
                      :key="track.id"
                      type="button"
                      class="h-11 min-w-0 inline-flex items-center justify-center gap-1 rounded-xl border px-1.5 text-xs font-semibold transition-all"
                      :class="
                        isSkillTrackSelected(track.id)
                          ? skillTrackSelectedClass(track.id)
                          : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                      "
                      :aria-pressed="isSkillTrackSelected(track.id)"
                      :title="language === 'es' ? track.label.es : track.label.en"
                      :aria-label="language === 'es' ? track.label.es : track.label.en"
                      @click="toggleSkillTrack(track.id)"
                    >
                      <span aria-hidden="true">{{ track.emoji }}</span>
                      <span class="truncate" aria-hidden="true">{{ shortLabel(language === 'es' ? track.label.es : track.label.en) }}</span>
                    </button>
                  </div>
                </div>
                <div>
                  <p id="program-age-label" class="text-xs font-medium text-gray-400 mb-2">
                    {{ language === 'es' ? 'Edad' : 'Age' }}
                    <span class="text-red-400">*</span>
                  </p>
                  <AdminCheckboxDropdown
                    labelledby="program-age-label"
                    :options="PROGRAM_AGE_BANDS.map(band => ({ id: band.id, label: language === 'es' ? band.label.es : band.label.en }))"
                    :selected="form.audience_categories"
                    :placeholder="language === 'es' ? 'Elige edades' : 'Choose ages'"
                    @toggle="id => toggleAudience(id as AudienceCategory)"
                  />
                </div>
              </div>

              <div class="grid sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)] gap-3 items-start">
                <div>
                  <label for="program-coach-tier" class="block text-xs font-medium text-gray-400 mb-2">
                    {{ language === 'es' ? 'Coach / precios' : 'Coach / prices' }}
                    <span class="text-red-400">*</span>
                  </label>
                  <select
                    id="program-coach-tier"
                    :value="formCoachTier"
                    class="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                    @change="form.coach_tier = ($event.target as HTMLSelectElement).value as CoachPricingTier"
                  >
                    <option v-for="tier in FINANCE_COACH_TIERS" :key="tier.id" :value="tier.id">
                      {{ language === 'es' ? tier.es : tier.en }}
                    </option>
                  </select>
                </div>
                <div>
                  <p id="program-coaches-label" class="text-xs font-medium text-gray-400 mb-2">
                    {{ language === 'es' ? 'Coaches asignados' : 'Assigned coaches' }}
                  </p>
                  <AdminCheckboxDropdown
                    labelledby="program-coaches-label"
                    :options="coachRoster.map(c => ({ id: c.id, label: c.name }))"
                    :selected="assignedCoachIds"
                    :placeholder="language === 'es' ? 'Sin coaches asignados' : 'No coaches assigned'"
                    :empty-text="language === 'es' ? 'No hay coaches registrados todavía.' : 'No coaches registered yet.'"
                    @toggle="toggleAssignedCoach"
                  />
                </div>
              </div>

              <div class="space-y-1">
                <p class="text-[10px] text-amber-300/70">
                  {{
                    language === 'es'
                      ? 'Coach / precios define la lista de precios del programa (Finanzas → Precios).'
                      : 'Coach / prices sets which price list the program sells at (Finanzas → Precios).'
                  }}
                </p>
                <p v-if="coachRosterError" class="text-[10px] text-red-300">
                  {{ language === 'es' ? 'No se pudo cargar la lista:' : 'Could not load roster:' }}
                  {{ coachRosterError }}
                </p>
                <p class="text-[10px] text-gray-500">
                  {{
                    language === 'es'
                      ? 'Cuenta como clase dada cuando la clase se marca hecha.'
                      : 'Counts as a class given once the class is marked done.'
                  }}
                  <span v-if="editingId && editScope === 'series'">
                    {{ language === 'es' ? 'Se aplica a toda la serie.' : 'Applies to the whole series.' }}
                  </span>
                </p>
                <p v-if="coachAssignError" class="text-[10px] text-amber-300">
                  {{ language === 'es' ? 'No se guardaron los coaches:' : 'Coaches were not saved:' }}
                  {{ coachAssignError }}
                </p>
              </div>
            </div>

            <label v-if="!isClassSessionForm && !isPracticeForm" class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input v-model="form.all_day" type="checkbox" class="rounded border-gray-600 text-sky-500 focus:ring-sky-500" />
              {{ language === 'es' ? 'Todo el día' : 'All day event' }}
            </label>

            <div v-if="isPracticeForm" class="space-y-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
              <p class="text-xs font-semibold text-cyan-300 uppercase tracking-wide">
                {{ language === 'es' ? 'Horario de práctica' : 'Practice time' }}
              </p>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Horario' : 'Time slot' }} *</label>
                <select v-model="form.practice_time_slot" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm">
                  <option v-for="slot in PRACTICE_TIME_SLOTS" :key="slot" :value="slot">
                    {{ TIME_SLOT_LABELS[slot].display }}
                  </option>
                </select>
              </div>
            </div>

            <div v-if="isClassSessionForm" class="space-y-3 rounded-xl border border-gray-700 bg-gray-800/40 p-3">
              <p class="text-xs font-semibold text-gray-300 uppercase tracking-wide">
                {{ language === 'es' ? 'Sesión reservable' : 'Bookable session' }}
              </p>

              <label
                v-if="!editingId && !isSummerCourseForm"
                class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer"
              >
                <input
                  v-model="form.is_recurring"
                  type="checkbox"
                  class="rounded border-gray-600 text-cyan-500 focus:ring-cyan-500"
                />
                {{
                  language === 'es'
                    ? 'Programa recurrente · elige los días · las fechas siguen la temporada'
                    : 'Recurring program · pick the days · dates follow the season'
                }}
              </label>
              <p v-if="!editingId && isSummerCourseForm" class="text-sm text-cyan-200 font-medium">
                {{
                  language === 'es'
                    ? 'Curso de verano · Lun–Vie · 5 o 10 días de clase'
                    : 'Summer course · Mon–Fri · 5 or 10 class days'
                }}
              </p>

              <div
                v-if="(form.is_recurring || isSummerCourseForm) && !editingId"
                class="space-y-3 rounded-lg border border-cyan-500/20 bg-gray-900/40 p-3"
              >
                <div>
                  <p class="text-xs font-medium text-gray-400 mb-2">
                    {{ language === 'es' ? 'Días de la semana' : 'Days of the week' }}
                    <span v-if="isSummerCourseForm" class="text-cyan-300/80 font-normal">
                      · {{ language === 'es' ? 'Lun–Vie' : 'Mon–Fri' }}
                    </span>
                  </p>
                  <div class="grid gap-1.5" :class="recurringWeekdayOptions.length > 5 ? 'grid-cols-7' : 'grid-cols-5'">
                    <button
                      v-for="d in recurringWeekdayOptions"
                      :key="d.v"
                      type="button"
                      :aria-pressed="isRecurringWeekday(d.v)"
                      class="h-9 rounded-full border text-xs font-bold transition-colors disabled:opacity-60"
                      :class="
                        isRecurringWeekday(d.v)
                          ? 'border-cyan-400 bg-cyan-500/20 text-white'
                          : 'border-gray-600 text-gray-400'
                      "
                      :disabled="isSummerCourseForm"
                      @click="toggleRecurringWeekday(d.v)"
                    >
                      {{ language === 'es' ? d.es : d.en }}
                    </button>
                  </div>
                  <p v-if="!isSummerCourseForm" class="text-[10px] text-gray-500 mt-1">
                    {{
                      language === 'es'
                        ? `${programDaysPerWeek} día(s) por semana — elige solo sábado para un programa de 1 día.`
                        : `${programDaysPerWeek} day(s) per week — pick Saturday only for a one-day program.`
                    }}
                  </p>
                </div>

                <div v-if="isSummerCourseForm" class="space-y-2">
                  <p class="text-xs font-medium text-gray-400">
                    {{ language === 'es' ? 'Duración' : 'Duration' }}
                  </p>
                  <div class="grid grid-cols-2 gap-1.5">
                    <button
                      v-for="opt in SUMMER_COURSE_WEEK_OPTIONS"
                      :key="opt.weeks"
                      type="button"
                      class="rounded-lg border px-2 py-2 text-center text-[11px] font-semibold transition-all"
                      :class="
                        form.summer_weeks === opt.weeks
                          ? 'border-cyan-400 bg-cyan-500/20 text-white'
                          : 'border-gray-600 text-gray-400'
                      "
                      @click="form.summer_weeks = opt.weeks"
                    >
                      {{ language === 'es' ? opt.label.es : opt.label.en }}
                    </button>
                  </div>
                </div>
                <div v-else class="space-y-2">
                  <p class="text-xs font-medium text-gray-400">
                    {{ language === 'es' ? 'Duración del programa' : 'Program length' }}
                  </p>
                  <div class="grid grid-cols-2 gap-3">
                    <div>
                      <label for="program-weeks" class="block text-[11px] text-gray-500 mb-1">
                        {{ language === 'es' ? 'Semanas' : 'Weeks' }}
                      </label>
                      <select
                        id="program-weeks"
                        v-model.number="form.program_weeks"
                        class="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                      >
                        <option v-for="weeks in PROGRAM_WEEK_OPTIONS" :key="weeks" :value="weeks">
                          {{ language === 'es' ? `${weeks} ${weeks === 1 ? 'semana' : 'semanas'}` : `${weeks} ${weeks === 1 ? 'week' : 'weeks'}` }}
                        </option>
                      </select>
                    </div>
                    <div>
                      <label for="program-classes" class="block text-[11px] text-gray-500 mb-1">
                        {{ language === 'es' ? 'Clases' : 'Classes' }}
                      </label>
                      <input
                        id="program-classes"
                        v-model.number="form.recurring_class_count"
                        type="number"
                        min="1"
                        :max="PROGRAM_MAX_CLASSES"
                        step="1"
                        class="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                        @change="clampClassCount"
                      />
                    </div>
                  </div>
                  <p class="text-[10px] text-gray-500">
                    {{
                      language === 'es'
                        ? 'Al cambiar semanas o días se recalculan las clases; puedes ajustarlas después.'
                        : 'Changing weeks or days recalculates the classes; you can adjust them afterwards.'
                    }}
                  </p>
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Inicio' : 'Start date' }} *</label>
                    <input
                      v-model="form.start_date"
                      type="date"
                      :min="formSeason?.startDate || undefined"
                      :max="formSeason?.endDate || undefined"
                      class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                      :class="{ 'opacity-80': Boolean(formSeason) }"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Fin' : 'End date' }}</label>
                    <input
                      v-model="form.end_date"
                      type="date"
                      :min="formSeason?.startDate || form.start_date || undefined"
                      :max="formSeason?.endDate || undefined"
                      class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                      :class="{ 'opacity-80': Boolean(formSeason) }"
                    />
                  </div>
                </div>
                <p class="text-[10px] text-gray-500 -mt-1">
                  {{
                    isSummerCourseForm
                      ? language === 'es'
                        ? 'Inicio/fin = temporada de verano. Lun–Vie 9:00 AM – 1:00 PM. No se crean clases fuera de esas fechas.'
                        : 'Start/end = summer season. Mon–Fri 9:00 AM – 1:00 PM. Classes cannot be created outside that window.'
                      : language === 'es'
                        ? 'Inicio/fin siguen la temporada seleccionada. Las clases no pueden salir de ese rango.'
                        : 'Start/end follow the selected season. Classes cannot be created outside that window.'
                  }}
                </p>
                <p v-if="formSeason && !programFitsSeason" class="text-[11px] text-amber-400">
                  {{
                    language === 'es'
                      ? `Esta temporada solo alcanza ${previewBookable.length} clase(s) de ${form.recurring_class_count}. Acorta la duración o elige otra temporada.`
                      : `This season only fits ${previewBookable.length} of ${form.recurring_class_count} classes. Shorten the program or pick another season.`
                  }}
                </p>

                <div>
                  <div class="grid grid-cols-[1fr_6.5rem] gap-3 items-start">
                    <div>
                      <p id="program-horarios-label" class="text-xs font-medium text-gray-400 mb-1">
                        {{ language === 'es' ? 'Horarios por día' : 'Session times' }}
                      </p>
                      <AdminCheckboxDropdown
                        :options="recurringSlotOptions.map(h => ({ id: h.id, label: h.display }))"
                        :selected="form.recurring_slots"
                        :placeholder="language === 'es' ? 'Elige horarios' : 'Choose times'"
                        labelledby="program-horarios-label"
                        :empty-text="language === 'es' ? 'Sin horarios — agrega uno abajo.' : 'No times — add one below.'"
                        :removable="!isSummerCourseForm"
                        :remove-label="label => (language === 'es' ? `Eliminar horario ${label}` : `Delete ${label}`)"
                        @toggle="toggleRecurringSlot"
                        @remove="id => confirmRemoveHorarioById(id)"
                      >
                        <template v-if="!isSummerCourseForm" #footer>
                          <button
                            v-if="!addingHorario"
                            type="button"
                            class="w-full h-9 rounded-lg border border-dashed border-gray-600 text-xs font-bold text-gray-300 hover:border-cyan-400 hover:text-white"
                            @click="addingHorario = true; horarioError = ''"
                          >
                            {{ language === 'es' ? '+ Horario' : '+ Time' }}
                          </button>
                          <div v-else class="space-y-1.5">
                            <div class="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
                              <input
                                v-model="newHorarioStart"
                                type="time"
                                step="900"
                                :aria-label="language === 'es' ? 'Inicio' : 'Start'"
                                class="w-full h-9 px-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs"
                              />
                              <input
                                v-model="newHorarioEnd"
                                type="time"
                                step="900"
                                :aria-label="language === 'es' ? 'Fin' : 'End'"
                                class="w-full h-9 px-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-xs"
                              />
                              <button
                                type="button"
                                class="h-9 px-3 rounded-lg bg-cyan-600 text-white text-xs font-bold hover:bg-cyan-500"
                                @click="submitNewHorario"
                              >
                                {{ language === 'es' ? 'Agregar' : 'Add' }}
                              </button>
                            </div>
                            <p v-if="horarioError" class="text-[11px] text-red-400">{{ horarioError }}</p>
                          </div>
                        </template>
                      </AdminCheckboxDropdown>
                    </div>
                    <div>
                      <label for="program-capacity" class="block text-xs font-medium text-gray-400 mb-1">
                        {{ language === 'es' ? 'Cupo máximo' : 'Max students' }}
                      </label>
                      <input
                        id="program-capacity"
                        v-model.number="form.max_capacity_override"
                        type="number"
                        min="1"
                        max="99"
                        class="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                      />
                    </div>
                  </div>

                  <p class="text-[10px] text-gray-500 mt-1">
                    {{
                      isSummerCourseForm
                        ? language === 'es'
                          ? 'Curso de verano: 9:00 AM – 1:00 PM (Lun–Vie).'
                          : 'Summer course: 9:00 AM – 1:00 PM (Mon–Fri).'
                        : language === 'es'
                          ? 'Cada horario elegido se repite en todos los días seleccionados.'
                          : 'Each chosen time repeats on every selected day.'
                    }}
                  </p>
                  <p
                    v-if="previewBookable.length"
                    class="text-xs text-cyan-300/90 mt-2 font-medium"
                  >
                    {{
                      language === 'es'
                        ? `Se crearán ${previewBookable.length} clase(s) reservable(s): ${form.start_date} → ${form.end_date || previewBookable[previewBookable.length - 1]?.date}.`
                        : `${previewBookable.length} bookable class(es): ${form.start_date} → ${form.end_date || previewBookable[previewBookable.length - 1]?.date}.`
                    }}
                  </p>
                  <div
                    v-if="previewHolidayClashes.length"
                    class="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2"
                  >
                    <p class="text-[11px] font-bold text-amber-300">
                      {{
                        language === 'es'
                          ? `⚠️ ${previewHolidayClashes.length} clase(s) caen en festivo nacional`
                          : `⚠️ ${previewHolidayClashes.length} class(es) land on a national holiday`
                      }}
                    </p>
                    <ul class="mt-1 space-y-0.5">
                      <li
                        v-for="clash in previewHolidayClashes"
                        :key="clash.date"
                        class="text-[11px] text-amber-200/90"
                      >
                        {{ clash.label }} — {{ clash.holiday }}
                      </li>
                    </ul>
                    <p class="text-[10px] text-amber-200/70 mt-1">
                      {{
                        language === 'es'
                          ? 'Se agregan al calendario marcadas como no reservables y no cuentan para el total pagado.'
                          : 'They are added to the calendar as non-bookable and do not count toward the paid total.'
                      }}
                    </p>
                  </div>
                  <p
                    v-else-if="form.recurring_weekdays.length && form.recurring_slots.length"
                    class="text-xs text-amber-400 mt-2"
                  >
                    {{
                      language === 'es'
                        ? 'Esta combinación no produce clases — cambia días u horarios.'
                        : 'This combination yields no classes — adjust days or times.'
                    }}
                  </p>
                </div>
              </div>

              <div v-if="!form.is_recurring || editingId" class="space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Inicio' : 'Start date' }} *</label>
                    <input v-model="form.start_date" type="date" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Fin' : 'End date' }}</label>
                    <input v-model="form.end_date" type="date" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" />
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Horario' : 'Time slot' }} *</label>
                  <select v-model="form.time_slot" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm">
                    <option v-for="slot in classSessionSlotOptions" :key="slot" :value="slot">
                      {{ classSlotOptionLabel(slot) }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-400 mb-1">
                    {{ language === 'es' ? 'Cupo máximo' : 'Max students' }}
                  </label>
                  <input
                    v-model.number="form.max_capacity_override"
                    type="number"
                    min="1"
                    max="99"
                    class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                  />
                </div>
              </div>

            </div>

            <!-- Price is read-only: Finanzas → Precios owns it -->
            <div v-if="isClassSessionForm" class="rounded-xl border border-gray-700 bg-gray-800/60 p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">
                    {{ language === 'es' ? 'Precio · Finanzas' : 'Price · Finance' }}
                  </p>
                  <p class="text-lg font-semibold text-white leading-tight mt-0.5">
                    {{ formatMoneyMxn(Number(form.price_mxn) || 0) }}
                  </p>
                  <p class="text-[11px] text-gray-400">{{ programPriceLabel }}</p>
                </div>
                <NuxtLink
                  to="/member/admin/finance/prices"
                  class="shrink-0 px-2.5 py-1.5 rounded-lg border border-gray-600 text-[11px] font-semibold text-gray-300 hover:border-cyan-400/60 hover:text-cyan-300"
                >
                  {{ language === 'es' ? 'Editar precios' : 'Edit prices' }}
                </NuxtLink>
              </div>
              <div v-if="!isSummerCourseForm" class="mt-3">
                <label for="program-price-kind" class="block text-[11px] text-gray-500 mb-1">
                  {{ language === 'es' ? 'Tipo de clase' : 'Class type' }}
                </label>
                <select
                  id="program-price-kind"
                  v-model="priceKindOverride"
                  class="w-full h-11 px-3 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                >
                  <option value="">
                    {{ language === 'es' ? 'Automático' : 'Automatic' }} · {{ classKindLabel(autoPackageKind, language === 'es') }}
                  </option>
                  <option v-for="kind in priceKindOptions" :key="kind.id" :value="kind.id">
                    {{ language === 'es' ? kind.es : kind.en }}
                  </option>
                </select>
              </div>
              <p v-if="programPricingGroup !== 'standard' && !programHasOwnPriceSheet" class="text-[10px] text-amber-300/80 mt-2">
                {{ language === 'es'
                  ? `${disciplineLabel(form.discipline, true)} aún no tiene su tabla de precios; se usa la de skate / scooter / patinaje.`
                  : `${disciplineLabel(form.discipline, false)} has no price sheet yet; the skate / scooter / rollerblading one is used.` }}
              </p>
              <p v-if="!programPriceRow" class="text-[10px] text-amber-300/80 mt-1">
                {{ language === 'es'
                  ? 'Este paquete aún no está en Finanzas → Precios; se usa el precio base de la academia.'
                  : 'This package is not in Finance → Prices yet; the academy base price is used.' }}
              </p>
              <div v-if="editedPriceIsStale" class="mt-2 flex items-center gap-2 flex-wrap">
                <p class="text-[10px] text-amber-300/80">
                  {{ language === 'es'
                    ? `Finanzas marca ${formatMoneyMxn(programPriceMxn)} para este paquete.`
                    : `Finance lists ${formatMoneyMxn(programPriceMxn)} for this package.` }}
                </p>
                <button
                  type="button"
                  class="px-2 py-1 rounded-lg bg-cyan-600 text-white text-[10px] font-bold"
                  @click="syncPriceFromFinance"
                >
                  {{ language === 'es' ? 'Actualizar precio' : 'Update price' }}
                </button>
              </div>
            </div>
          </div>

          <div class="sticky bottom-0 flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-800 bg-gray-900/95">
            <button
              v-if="editingId"
              type="button"
              class="text-sm text-red-400 hover:text-red-300 disabled:opacity-50"
              :disabled="saving"
              @click="requestDelete"
            >
              {{ language === 'es' ? 'Eliminar' : 'Delete' }}
            </button>
            <span v-else />
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="px-4 py-2.5 rounded-xl border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800"
                :disabled="saving"
                @click="requestCloseModal"
              >
                {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
              </button>
              <button
                type="button"
                class="px-4 py-2.5 rounded-xl bg-acid text-charcoal text-sm font-semibold disabled:opacity-50 hover:bg-acid-300"
                :disabled="saving"
                @click="submitEvent"
              >
                {{ saving ? '…' : editingId ? (language === 'es' ? 'Guardar' : 'Save') : (language === 'es' ? 'Crear' : 'Create') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Delete series vs occurrence -->
    <Teleport to="body">
      <div
        v-if="deleteSeriesOpen"
        class="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/80 p-4"
        @click.self="deleteSeriesOpen = false"
      >
        <div
          class="w-full sm:max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-5 shadow-xl text-gray-100"
          @click.stop
        >
          <h3 class="text-lg font-bold text-white mb-2">
            {{ language === 'es' ? 'Esta clase es parte de una serie' : 'This class is part of a series' }}
          </h3>
          <p class="text-sm text-gray-400 mb-5">
            {{
              language === 'es'
                ? '¿Quieres borrar solo esta ocurrencia o todo el programa (todas las clases de la serie)?'
                : 'Delete only this occurrence, or the entire program (all classes in the series)?'
            }}
          </p>
          <div class="flex flex-col gap-2">
            <button
              type="button"
              class="w-full py-3 rounded-xl border border-gray-600 text-white font-semibold text-sm hover:bg-gray-800 disabled:opacity-50"
              :disabled="deleting"
              @click="performDelete({ series: false })"
            >
              {{ language === 'es' ? 'Solo esta ocurrencia' : 'This occurrence only' }}
            </button>
            <button
              type="button"
              class="w-full py-3 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-500 disabled:opacity-50"
              :disabled="deleting"
              @click="performDelete({ series: true })"
            >
              {{ language === 'es' ? 'Toda la serie / programa' : 'Entire series / program' }}
            </button>
            <button
              type="button"
              class="w-full py-2.5 text-sm text-gray-400 hover:text-white disabled:opacity-50"
              :disabled="deleting"
              @click="deleteSeriesOpen = false"
            >
              {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="assignOpen"
        class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-4"
        @click.self="assignOpen = false"
      >
        <div class="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-950 p-5">
          <h2 class="text-lg font-semibold text-white">
            {{ language === 'es' ? 'Asignar coach' : 'Assign coach' }}
          </h2>
          <p v-if="!coachRoster.length" class="mt-2 text-sm text-gray-500">
            {{ language === 'es' ? 'No hay coaches registrados.' : 'No coaches registered.' }}
          </p>
          <div v-else class="mt-3 flex flex-wrap gap-1.5">
            <button
              v-for="c in coachRoster"
              :key="c.id"
              type="button"
              class="rounded-full border px-2.5 py-1 text-[11px] font-medium"
              :class="assignDraftIds.includes(c.id)
                ? 'border-teal-500 bg-teal-500/15 text-teal-200'
                : 'border-gray-700 text-gray-400'"
              @click="toggleAssignDraft(c.id)"
            >
              {{ c.name }}
            </button>
          </div>
          <p v-if="coachAssignError" class="mt-2 text-sm text-red-400">{{ coachAssignError }}</p>
          <div class="mt-4 flex gap-2">
            <button
              type="button"
              class="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-300"
              :disabled="assignBusy"
              @click="assignOpen = false"
            >
              {{ language === 'es' ? 'Volver' : 'Back' }}
            </button>
            <button
              type="button"
              class="flex-1 py-2.5 rounded-xl bg-teal-600 text-sm font-semibold text-white disabled:opacity-50"
              :disabled="assignBusy"
              @click="saveAssign"
            >
              {{ language === 'es' ? 'Guardar' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="doneConfirmOpen"
        class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-4"
        @click.self="doneConfirmOpen = false"
      >
        <div class="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-950 p-5">
          <h2 class="text-lg font-semibold text-white">
            {{ language === 'es' ? 'Marcar todas hechas' : 'Mark all done' }}
          </h2>
          <p class="mt-2 text-sm text-gray-300">
            {{ language === 'es'
              ? `Se marcan ${doneConfirmIds.length} clase(s) de este día como hechas. Cuentan para los coaches asignados.`
              : `${doneConfirmIds.length} class(es) this day will be marked done. They count for the assigned coaches.` }}
          </p>
          <p v-if="weatherError" class="mt-2 text-sm text-red-400">{{ weatherError }}</p>
          <div class="mt-4 flex gap-2">
            <button
              type="button"
              class="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-300"
              @click="doneConfirmOpen = false"
            >
              {{ language === 'es' ? 'Volver' : 'Back' }}
            </button>
            <button
              type="button"
              class="flex-1 py-2.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white"
              @click="markClassesDone(doneConfirmIds)"
            >
              {{ language === 'es' ? 'Confirmar' : 'Confirm' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="weatherOpen"
        class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-4"
        @click.self="weatherOpen = false"
      >
        <div class="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-950 p-5">
          <h2 class="text-lg font-semibold text-white">
            {{ weatherEventIds.length > 1
              ? (language === 'es' ? 'Cancelar todas' : 'Cancel all')
              : (language === 'es' ? 'Cancelar por clima' : 'Cancel for weather') }}
          </h2>
          <p class="mt-1 text-sm text-gray-400">
            {{ language === 'es'
              ? `Se marcan ${weatherEventIds.length} clase(s) como canceladas porque el parque está mojado, y se avisa a los papás y estudiantes inscritos.`
              : `${weatherEventIds.length} class(es) will be marked cancelled because the park is wet, and enrolled parents and students will be emailed.` }}
          </p>
          <label class="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-400">
            {{ language === 'es' ? 'Cuándo se puede reponer' : 'When it can be retaken' }}
          </label>
          <textarea
            v-model="weatherMakeup"
            rows="3"
            class="mt-1 w-full rounded-xl border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white"
            :placeholder="language === 'es'
              ? 'Ej. el mismo horario el próximo sábado, o un crédito para otra clase de la temporada'
              : 'e.g. same time next Saturday, or a credit for another class this season'"
          />
          <p v-if="weatherError" class="mt-2 text-sm text-red-400">{{ weatherError }}</p>
          <div class="mt-4 flex gap-2">
            <button
              type="button"
              class="flex-1 py-2.5 rounded-xl border border-gray-700 text-sm text-gray-300"
              :disabled="weatherBusy"
              @click="weatherOpen = false"
            >
              {{ language === 'es' ? 'Volver' : 'Back' }}
            </button>
            <button
              type="button"
              class="flex-1 py-2.5 rounded-xl bg-sky-600 text-sm font-semibold text-white disabled:opacity-50"
              :disabled="weatherBusy"
              @click="confirmWeatherCancel"
            >
              {{ weatherBusy
                ? (language === 'es' ? 'Enviando…' : 'Sending…')
                : (language === 'es' ? 'Cancelar y avisar' : 'Cancel and notify') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <AdminSeasonCreateModal
      :open="addSeasonOpen"
      @close="addSeasonOpen = false"
      @created="onSeasonCreated"
    />
  </div>
</template>
