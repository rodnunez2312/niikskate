<script setup lang="ts">
import {
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
import {
  DEFAULT_SKATEPARK,
  EVENT_LOCATIONS,
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
  PROGRESSION_AGE,
  PROGRESSION_AUDIENCE_CATEGORIES,
  isProgressionAudience,
  type ProgramSkillTrack,
  type ProgramWeekCount,
} from '~/types'
import { DEFAULT_PROGRAM_WEEKDAYS, PRACTICE_TIME_SLOTS, RECURRING_WEEKDAY_OPTIONS, SUMMER_COURSE_WEEKDAY_OPTIONS, slotsForWeekday, slotsForWeekdays } from '~/utils/classSchedule'
import { bookableOccurrences, computeSummerCourseEndDate, generateProgramOccurrences, nearestProgramStartDate, parseYmd, syncProgramDateRange, computeProgramEndDate } from '~/utils/recurringProgram'
import { MEXICO_NATIONAL_HOLIDAYS_2026_2027, mexicoHolidayName } from '~/utils/mexicoHolidays'
import { getProgramSeasonBySlug, isSummerCourseSeason, seasonStatusLabel, findOverlappingRegularSeason, seasonHighlightColor, stripedSeasonFill } from '~/utils/programSeasons'
import {
  DEFAULT_COACH_TIER,
  normalizeCoachTier,
  resolveDefaultProgramPriceMxn,
  resolveProgramPackageKind,
  type CoachPricingTier,
} from '~/utils/classPricing'
import {
  classKindLabel,
  coachTierSheetLabel,
  effectivePriceMxn,
  formatMoneyMxn,
  FINANCE_COACH_TIERS,
} from '~/utils/finance'
import { useFinance } from '~/composables/useFinance'

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
  recurring_slots: ['early'] as TimeSlot[],
  recurring_class_count: PROGRAM_TOTAL_CLASSES,
  program_weeks: 4 as ProgramWeekCount,
  summer_weeks: 1 as 1 | 2,
  skill_tracks: ['beginner'] as ProgramSkillTrack[],
  max_capacity_override: 6,
  season_slug: '',
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

const programSlotsForGenerate = (): TimeSlot[] => {
  if (isSummerCourseForm.value) return [...SUMMER_COURSE_SLOTS]
  return form.value.recurring_slots.length ? form.value.recurring_slots : ['early']
}

const formCoachTier = computed(() => normalizeCoachTier(form.value.coach_tier))

// ---------------------------------------------------------------------------
// Pricing — Finanzas → Precios is the only source of truth
// ---------------------------------------------------------------------------

const { priceRows: financePriceRows, loadPriceRows } = useFinance()

onMounted(() => {
  loadPriceRows()
})

/** Which package this program shape sells as: monthly_4, group_pack_5, … */
const programPackageKind = computed(() =>
  resolveProgramPackageKind({
    eventType: form.value.event_type as 'class_session' | 'class_individual',
    isRecurring: form.value.is_recurring || isSummerCourseForm.value,
    isSummerCourse: isSummerCourseForm.value,
    summerWeeks: form.value.summer_weeks,
    classCount: Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES,
  }),
)

/** The Finanzas row for this tier + package, when the sheet has one. */
const programPriceRow = computed(
  () =>
    financePriceRows.value.find(
      r =>
        r.is_active
        && r.coach_tier === formCoachTier.value
        && r.class_kind === programPackageKind.value,
    ) ?? null,
)

/** Finanzas price; the built-in table only covers packages missing from the sheet. */
const programPriceMxn = computed(() => {
  const row = programPriceRow.value
  if (row) return effectivePriceMxn(row)
  return resolveDefaultProgramPriceMxn({
    eventType: form.value.event_type as 'class_session' | 'class_individual',
    isRecurring: form.value.is_recurring || isSummerCourseForm.value,
    isSummerCourse: isSummerCourseForm.value,
    summerWeeks: form.value.summer_weeks,
    classCount: form.value.recurring_class_count,
    coachTier: formCoachTier.value,
  })
})

const programPriceLabel = computed(() => {
  const es = language.value === 'es'
  const row = programPriceRow.value
  const pack = row ? row.label_es : classKindLabel(programPackageKind.value, es)
  return `${pack} · ${coachTierSheetLabel(formCoachTier.value, es)}`
})

/** Splits the price the sheet's way: academy keeps its %, the coach gets the rest. */
const priceSplitHint = computed(() => {
  const price = Number(form.value.price_mxn) || 0
  const pct = programPriceRow.value?.academy_pct
  if (!price || pct == null) return ''
  const academy = price * Number(pct)
  return language.value === 'es'
    ? `Academia ${formatMoneyMxn(academy)} · Coach ${formatMoneyMxn(price - academy)}`
    : `Academy ${formatMoneyMxn(academy)} · Coach ${formatMoneyMxn(price - academy)}`
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
  applyProgressionAgesIfNeeded()
}

/** Intermediate (Progresión) covers ages 7–17: kids + teens bands. */
const applyProgressionAgesIfNeeded = () => {
  if (!isProgramForm.value) return
  if (!form.value.skill_tracks.includes('intermediate')) return
  const cats = new Set(form.value.audience_categories)
  for (const id of PROGRESSION_AUDIENCE_CATEGORIES) cats.add(id)
  form.value.audience_categories = [...cats]
}

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
  let base =
    ages.length === 0
      ? `${typePart} ${skillPart}`
      : ages.length === 1
        ? es
          ? `${typePart} ${skillPart} para ${ages[0]}`
          : `${typePart} ${skillPart} for ${ages[0]}`
        : es
          ? `${typePart} ${skillPart} para ${ages.slice(0, -1).join(', ')} y ${ages[ages.length - 1]}`
          : `${typePart} ${skillPart} for ${ages.join(', ')}`

  const slug = form.value.season_slug?.trim()
  if (!slug) return base
  const season = getProgramSeasonBySlug(slug)
  if (!season) return base
  const seasonLabel = es ? season.name.es : season.name.en
  const prefix = es ? `Temporada ${seasonLabel}` : `${seasonLabel} Season`
  return `${prefix}: ${base}`
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
      form.value.skill_tracks.join(','),
      form.value.audience_categories.join(','),
      form.value.season_slug,
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

const classSessionSlotOptions = computed((): TimeSlot[] => {
  if (isClassSessionForm.value && isSummerCourseForm.value && !editingId.value) {
    return [...SUMMER_COURSE_SLOTS]
  }
  if (isClassSessionForm.value && (form.value.is_recurring || isSummerCourseForm.value) && !editingId.value) {
    return slotsForWeekdays(form.value.recurring_weekdays)
  }
  const wd = formStartWeekday.value
  if (wd == null) return ['early', 'late']
  return slotsForWeekday(wd)
})

const recurringSlotOptions = computed((): TimeSlot[] =>
  isSummerCourseForm.value ? [...SUMMER_COURSE_SLOTS] : slotsForWeekdays(form.value.recurring_weekdays),
)

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
    const allowed = new Set(slotsForWeekdays(weekdays))
    form.value.recurring_slots = form.value.recurring_slots.filter(s => allowed.has(s))
    if (!form.value.recurring_slots.length && allowed.size) {
      form.value.recurring_slots = [slotsForWeekdays(weekdays)[0]]
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

const toggleRecurringSlot = (slot: TimeSlot) => {
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
const isRecurringSlot = (slot: TimeSlot) => form.value.recurring_slots.includes(slot)

const recurringWeekdayOptions = computed(() => {
  if (isSummerCourseForm.value) return SUMMER_COURSE_WEEKDAY_OPTIONS
  return RECURRING_WEEKDAY_OPTIONS
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
  event: { dot: 'bg-violet-500', label: { en: 'Event', es: 'Evento' }, emoji: '📅' },
  competition: { dot: 'bg-orange-500', label: { en: 'Competition', es: 'Competencia' }, emoji: '🏆' },
  holiday: { dot: 'bg-teal-500', label: { en: 'Holiday', es: 'Festivo' }, emoji: '✨' },
  school_closure: { dot: 'bg-red-500', label: { en: 'School closure', es: 'Cierre escolar' }, emoji: '🚫' },
  school_open: { dot: 'bg-emerald-600', label: { en: 'School open', es: 'Abierto' }, emoji: '✅' },
  practice: { dot: 'bg-sky-500', label: { en: 'Practice', es: 'Práctica' }, emoji: '🏃' },
  meeting: { dot: 'bg-indigo-500', label: { en: 'Meeting', es: 'Junta' }, emoji: '👥' },
  camp: { dot: 'bg-amber-500', label: { en: 'Camp', es: 'Campamento' }, emoji: '⛺' },
  show: { dot: 'bg-pink-500', label: { en: 'Show', es: 'Show' }, emoji: '🎭' },
  custom: { dot: 'bg-gray-500', label: { en: 'Custom', es: 'Personalizado' }, emoji: '🏷️' },
  class_session: { dot: 'bg-cyan-500', label: { en: 'Group class', es: 'Clase grupal' }, emoji: '🛹' },
  birthday: { dot: 'bg-pink-400', label: { en: 'Birthday', es: 'Cumpleaños' }, emoji: '🎂' },
  class_individual: { dot: 'bg-violet-500', label: { en: 'Individual class', es: 'Clase individual' }, emoji: '👤' },
}

const eventTypeOrder = Object.keys(EVENT_META) as SchoolCalendarEventType[]

const tLabel = (type: SchoolCalendarEventType) =>
  language.value === 'es' ? EVENT_META[type].label.es : EVENT_META[type].label.en

const isProgramType = (type: SchoolCalendarEventType) => PROGRAM_ONLY_TYPES.includes(type)

const legendEventTypes = computed(() => filterEventTypes.value.filter(t => !isProgramType(t)))
const legendProgramTypes = computed(() => filterEventTypes.value.filter(t => isProgramType(t)))

/** Map Postgres/PostgREST errors to the migration the admin still needs to run. */
const calendarDbErrorMessage = (msg: string) => {
  const es = language.value === 'es'
  const m = msg.toLowerCase()
  if (
    m.includes('audience_categor')
    || m.includes('tots_5_7')
    || m.includes('kids_7_12')
    || m.includes('teens_13_17')
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
    await loadEvents()
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
    const { data, error } = await client.from('school_calendar_events').select('*').order('start_date', { ascending: true })
    if (error) throw error
    events.value = (data || []) as SchoolCalendarRow[]
    await ensureMexicoHolidays()
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
  if (filterType.value === 'all') return events.value
  return events.value.filter(e => e.event_type === filterType.value)
})

const monthGrid = (month: Date) => {
  const start = startOfMonth(month)
  const end = endOfMonth(month)
  const gridStart = startOfWeek(start, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(end, { weekStartsOn: 0 })
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
    if (
      selectedSeasonSlugs.value.length
      && isProgramType(ev.event_type)
      && !isEventInSelectedSeason(ev)
    ) {
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
    const aProg = isProgramType(a.event_type) ? 0 : 1
    const bProg = isProgramType(b.event_type) ? 0 : 1
    if (aProg !== bProg) return aProg - bProg

    const aSkill = skillOrder[skillTrackFromLevelId(a.skill_level)] ?? 9
    const bSkill = skillOrder[skillTrackFromLevelId(b.skill_level)] ?? 9
    if (aSkill !== bSkill) return aSkill - bSkill

    const at = a.start_time || ''
    const bt = b.start_time || ''
    if (at !== bt) return at.localeCompare(bt)

    return a.title.localeCompare(b.title)
  })
}

/** Reads as a range while a multi-month season is stacked below. */
const monthLabel = computed(() => {
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
  language.value === 'es' ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
)

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

const seasonColorFor = (slug: string) => {
  const idx = programSeasons.value.findIndex(s => s.slug === slug)
  return seasonHighlightColor(idx >= 0 ? idx : 0)
}

const isSeasonSelected = (slug: string) => selectedSeasonSlugs.value.includes(slug)

const querySeasonSlug = () => selectedSeasonSlugs.value[0] || ''

const activeQuerySeason = computed(() => {
  if (selectedSeasons.value.length !== 1) return undefined
  return selectedSeasons.value[0]
})

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

const SKILL_CHIP_COLOR: Record<ProgramSkillTrack, { solid: string; muted: string }> = {
  beginner: { solid: '#059669', muted: 'rgba(5, 150, 105, 0.40)' },
  intermediate: { solid: '#7c3aed', muted: 'rgba(124, 58, 237, 0.40)' },
  advanced: { solid: '#d97706', muted: 'rgba(217, 119, 6, 0.40)' },
}

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
  const time = eventChipTime(ev)
  return [kind, skill, ages, time ? `· ${time}` : ''].filter(Boolean).join(' ')
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
  recurring_slots: isSummerCourseSeason(seasonSlug) ? [...SUMMER_COURSE_SLOTS] : (['early'] as TimeSlot[]),
  recurring_class_count: isSummerCourseSeason(seasonSlug) ? 5 : PROGRAM_TOTAL_CLASSES,
  program_weeks: 4 as ProgramWeekCount,
  summer_weeks: 1 as 1 | 2,
  skill_tracks: ['beginner'] as ProgramSkillTrack[],
  max_capacity_override: mode === 'program' ? 6 : 6,
  season_slug: seasonSlug,
})

const openCreateForDay = (day: Date, mode: CreateMode = 'event') => {
  selectedDate.value = day
  editingId.value = null
  createMode.value = mode
  const ymd = format(day, 'yyyy-MM-dd')
  const seasonFromQuery = mode === 'program' ? seasonSlugForProgramDay(day) : ''
  form.value = defaultForm(ymd, mode, seasonFromQuery)
  if (mode === 'event' && filterType.value !== 'all' && EVENT_ONLY_TYPES.includes(filterType.value as SchoolCalendarEventType)) {
    form.value.event_type = filterType.value as SchoolCalendarEventType
  }
  programTitleManual.value = false
  lastAutoProgramTitle.value = ''
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

const openEdit = (ev: SchoolCalendarRow, e?: Event) => {
  e?.stopPropagation?.()
  selectedDate.value = new Date(ev.start_date + 'T12:00:00')
  editingId.value = ev.id
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
  }
  applyProgressionAgesIfNeeded()
  if (
    form.value.skill_tracks.includes('intermediate')
    && !form.value.audience_categories.includes('adults_18_plus')
  ) {
    if (!form.value.audience_categories.includes('tots_5_7')) {
      form.value.min_age = PROGRESSION_AGE.minAge
    }
    form.value.max_age = Math.max(Number(form.value.max_age) || 0, PROGRESSION_AGE.maxAge)
  }
  editScope.value = ev.program_series_id ? 'series' : 'single'
  void loadEditSeriesCount(ev.program_series_id ?? null)
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
      slot: TimeSlot,
      programSeriesId: string | null,
      isHoliday = false,
    ) => {
      const slotTimes = TIME_SLOT_LABELS[slot] ?? TIME_SLOT_LABELS.summer
      const capOverride = Number(form.value.max_capacity_override) || null
      const progression = form.value.skill_tracks.includes('intermediate')
      const minAge = progression && !form.value.audience_categories.includes('tots_5_7')
        ? PROGRESSION_AGE.minAge
        : (Number(form.value.min_age) || null)
      const maxAge = progression && !form.value.audience_categories.includes('adults_18_plus')
        ? Math.max(Number(form.value.max_age) || 0, PROGRESSION_AGE.maxAge)
        : (Number(form.value.max_age) || null)
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
        min_age: minAge,
        max_age: maxAge,
        skatepark: form.value.location || DEFAULT_SKATEPARK,
        price_mxn: priceNum,
        coach_tier: formCoachTier.value,
        program_series_id: programSeriesId,
        max_capacity_override: capOverride,
        season_slug: form.value.season_slug.trim() || null,
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
        ? `${TIME_SLOT_LABELS[form.value.time_slot].start}:00`
        : practiceTimes?.start ?? null,
      end_time: isClass
        ? `${TIME_SLOT_LABELS[form.value.time_slot].end}:00`
        : practiceTimes?.end ?? null,
      location: form.value.location || DEFAULT_SKATEPARK,
      description: form.value.description.trim() || null,
      visible_to_parents: form.value.visible_to_parents,
      is_bookable: isClass ? true : form.value.is_bookable,
      time_slot: isClass ? form.value.time_slot : null,
      audience_category: form.value.audience_categories[0] ?? null,
      skill_level: isClass ? form.value.skill_level : null,
      min_age: isClass ? (form.value.skill_tracks.includes('intermediate') && !form.value.audience_categories.includes('tots_5_7')
        ? PROGRESSION_AGE.minAge
        : (Number(form.value.min_age) || null)) : null,
      max_age: isClass ? (form.value.skill_tracks.includes('intermediate') && !form.value.audience_categories.includes('adults_18_plus')
        ? Math.max(Number(form.value.max_age) || 0, PROGRESSION_AGE.maxAge)
        : (Number(form.value.max_age) || null)) : null,
      skatepark: isClass ? form.value.location || DEFAULT_SKATEPARK : null,
      price_mxn: isClass ? priceNum : null,
      coach_tier: isClass ? formCoachTier.value : null,
      max_capacity_override: isClass ? Number(form.value.max_capacity_override) || null : null,
      // Editing one class must not detach it from its program series.
      program_series_id: editingSeriesId.value,
      season_slug: isClass ? form.value.season_slug.trim() || null : null,
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
    }

    let { error } = await savePayload(withAudienceArray)
    // Column missing → retry without array; check violations need age-band migration (don't strip).
    if (
      error
      && (error.message?.includes('schema cache')
        || /column .*audience_categories.* does not exist/i.test(error.message || ''))
    ) {
      const { audience_categories: _drop, ...legacyPayload } = withAudienceArray
      ;({ error } = await savePayload(legacyPayload))
    }

    if (error) throw error
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

const highlightedSeasons = computed(() => selectedSeasons.value)

const isDayInHighlightedSeason = (day: Date) => seasonsCoveringDay(day).length > 0

const seasonMerida = (season: { startDate: string; endDate: string; status: string }) => {
  if (seasonIsPast(season.startDate, season.endDate)) {
    return { kind: 'done' as const, label: language.value === 'es' ? 'Completada' : 'Completed' }
  }
  if (season.status === 'enrolling') {
    return { kind: 'enroll' as const, label: language.value === 'es' ? 'Inscribirse' : 'Register' }
  }
  return {
    kind: 'soon' as const,
    label: seasonStatusLabel(season.status as 'enrolling' | 'soon' | 'closed', language.value === 'es'),
  }
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

const programSidebarSeasonLabel = (slug: string) => {
  if (!slug) return ''
  const season = seasonBySlug(slug) || getProgramSeasonBySlug(slug)
  if (!season) return slug
  return language.value === 'es' ? season.name.es : season.name.en
}

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
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-7xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3 min-w-0">
          <button type="button" class="p-2 -ml-2 text-gold-400 shrink-0" @click="router.push('/member/staff/dashboard')">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div class="min-w-0">
            <h1 class="text-xl font-bold text-white flex items-center gap-2">
              <span aria-hidden="true">📅</span>
              {{ language === 'es' ? 'Calendario' : 'Calendar' }}
            </h1>
            <p class="text-xs text-gray-500 truncate">
              {{
                language === 'es'
                  ? 'Eventos y programas de skate.'
                  : 'School events and skate programs.'
              }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            class="px-4 py-2.5 rounded-xl bg-white text-black font-semibold text-sm"
            @click="openAddEvent"
          >
            + {{ language === 'es' ? 'Añadir evento' : 'Add event' }}
          </button>
          <button
            type="button"
            class="px-4 py-2.5 rounded-xl font-semibold text-sm text-white
              bg-gradient-to-r from-teal-500 via-cyan-500 to-amber-400"
            @click="openAddProgram"
          >
            + {{ language === 'es' ? 'Añadir programa' : 'Add program' }}
          </button>
          <button
            type="button"
            class="px-4 py-2.5 rounded-full font-semibold text-sm text-white border border-cyan-400/60 bg-cyan-500/15 hover:bg-cyan-500/25"
            @click="addSeasonOpen = true"
          >
            + {{ language === 'es' ? 'Añadir temporada' : 'Add season' }}
          </button>
        </div>
      </div>
    </header>

    <div
      v-if="activeQuerySeason && profileIsAdmin"
      class="border-b px-4 py-3"
      :style="{
        borderColor: `${seasonColorFor(activeQuerySeason.slug).solid}55`,
        backgroundColor: seasonColorFor(activeQuerySeason.slug).fillMuted,
      }"
    >
      <p class="max-w-7xl mx-auto text-sm text-white">
        <span class="font-bold">{{ activeQuerySeason.icon }}
          {{ language === 'es' ? activeQuerySeason.name.es : activeQuerySeason.name.en }}
        </span>
        <span class="text-white/80">
          · {{
            language === 'es'
              ? 'Los programas nuevos se asignarán a esta temporada'
              : 'New programs will use this season'
          }}
        </span>
      </p>
    </div>

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

    <div v-else class="px-4 py-6 max-w-[90rem] mx-auto">
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

      <div class="lg:flex lg:gap-6 lg:items-start">
        <aside class="lg:w-72 lg:shrink-0 mb-6 lg:mb-0 lg:sticky lg:top-24">
          <h2 class="text-xs font-bold uppercase tracking-[0.22em] text-gold-400 mb-3">
            {{ language === 'es' ? 'Temporadas del programa' : 'Program seasons' }}
          </h2>
          <p class="text-[11px] text-gray-500 mb-2">
            {{
              language === 'es'
                ? 'Toca para seleccionar. Puedes elegir varias. El curso de verano puede coincidir con otra temporada.'
                : 'Tap to select. You can pick more than one. Summer camp may overlap another season.'
            }}
          </p>
          <p v-if="seasonSelectError" class="text-[11px] text-amber-300 mb-2">{{ seasonSelectError }}</p>
          <div class="rounded-2xl border border-gray-800 bg-gray-950 overflow-y-auto max-h-[70vh]">
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
              @toggle="toggleSeason(season.slug)"
              @remove="confirmRemoveSeason(season)"
            />
          </div>

          <!-- Archive: finished seasons, out of the way but still reachable -->
          <div v-if="archivedSeasons.length" class="mt-3">
            <button
              type="button"
              class="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-gray-800 bg-gray-950 text-gray-400 hover:text-gray-200 hover:border-gray-700 transition-colors"
              @click="showSeasonArchive = !archiveIsOpen"
            >
              <span class="text-[11px] font-bold uppercase tracking-wider">
                🗄️ {{ language === 'es' ? 'Archivo' : 'Archive' }}
                <span class="text-gray-600">({{ archivedSeasons.length }})</span>
              </span>
              <svg
                class="w-4 h-4 transition-transform"
                :class="archiveIsOpen ? 'rotate-180' : ''"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div
              v-if="archiveIsOpen"
              class="mt-2 rounded-2xl border border-gray-800 bg-gray-950 overflow-y-auto max-h-[50vh]"
            >
              <AdminSeasonPickerCard
                v-for="season in archivedSeasons"
                :key="season.slug"
                :season="season"
                :selected="isSeasonSelected(season.slug)"
                :past="true"
                :color="seasonColorFor(season.slug)"
                :status="seasonMerida(season)"
                :removing="removingSeasonSlug === season.slug"
                @toggle="toggleSeason(season.slug)"
                @remove="confirmRemoveSeason(season)"
              />
            </div>
          </div>
        </aside>

        <div class="min-w-0 flex-1 space-y-4">

      <!-- Toolbar -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
            @click="viewMonth = addMonths(viewMonth, -1)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span class="text-white font-semibold capitalize min-w-[140px] text-center">{{ monthLabel }}</span>
          <button
            type="button"
            class="p-2 rounded-lg bg-gray-800 text-white hover:bg-gray-700"
            @click="viewMonth = addMonths(viewMonth, 1)"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            type="button"
            class="ml-1 px-3 py-2 rounded-lg border border-gray-600 text-gray-300 text-sm font-medium hover:bg-gray-800"
            @click="goToday"
          >
            {{ language === 'es' ? 'Hoy' : 'Today' }}
          </button>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-gray-500 text-sm hidden sm:inline">{{ language === 'es' ? 'Filtrar' : 'Filter' }}</span>
          <select
            v-model="filterType"
            class="flex-1 sm:flex-none min-w-[160px] px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm"
          >
            <option value="all">{{ language === 'es' ? 'Todos los eventos' : 'All events' }}</option>
            <option v-for="t in filterEventTypes" :key="t" :value="t">{{ tLabel(t) }}</option>
          </select>
        </div>
      </div>

      <!-- Legend: events = dots · programs = icons -->
      <div class="space-y-2 text-xs text-gray-400">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold shrink-0">
            {{ language === 'es' ? 'Eventos' : 'Events' }}
          </span>
          <span
            v-for="t in legendEventTypes"
            :key="'leg-ev-' + t"
            class="inline-flex items-center gap-1.5"
          >
            <span class="w-2 h-2 rounded-full shrink-0" :class="EVENT_META[t].dot" />
            {{ tLabel(t) }}
          </span>
        </div>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span class="text-[10px] uppercase tracking-wide text-gray-500 font-semibold shrink-0">
            {{ language === 'es' ? 'Programas' : 'Programs' }}
          </span>
          <span
            v-for="t in legendProgramTypes"
            :key="'leg-pr-' + t"
            class="inline-flex items-center gap-1.5"
          >
            <span class="text-sm leading-none shrink-0" aria-hidden="true">{{ EVENT_META[t].emoji }}</span>
            {{ tLabel(t) }}
          </span>
          <span
            v-for="track in PROGRAM_SKILL_TRACKS"
            :key="'leg-sk-' + track.id"
            class="inline-flex items-center gap-1.5"
          >
            <span
              class="w-3 h-3 rounded-sm shrink-0"
              :style="{ backgroundColor: SKILL_CHIP_COLOR[track.id].solid }"
            />
            {{ track.emoji }}
            {{ language === 'es' ? track.label.es : track.label.en }}
          </span>
        </div>
        <div v-if="highlightedSeasons.length" class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span
            v-for="season in highlightedSeasons"
            :key="'leg-season-' + season.slug"
            class="inline-flex items-center gap-1.5"
          >
            <span
              class="w-3 h-3 rounded-sm shrink-0"
              :style="{ backgroundColor: seasonColorFor(season.slug).solid }"
            />
            {{ language === 'es' ? season.name.es : season.name.en }}
            <span class="text-gray-500">
              · {{ language === 'es' ? season.dates.es : season.dates.en }}
            </span>
          </span>
        </div>
      </div>

      <!-- Grid -->
      <div v-if="loading" class="flex justify-center py-16">
        <div class="w-10 h-10 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
      </div>
      <template v-else>
      <div
        v-for="month in visibleMonths"
        :key="month.toISOString()"
        class="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
      >
        <!-- Only worth naming each grid once a season stacks more than one month -->
        <p
          v-if="visibleMonths.length > 1"
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
            v-for="(day, idx) in monthGrid(month).days"
            :key="idx"
            role="button"
            tabindex="0"
            class="min-h-[100px] sm:min-h-[112px] border-b border-r border-gray-800 p-1.5 text-left align-top transition-colors hover:bg-gray-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 cursor-pointer"
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
            <div
              class="text-xs font-semibold mb-1"
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
            </div>
            <div
              class="flex flex-col gap-0.5 max-h-[4.75rem] sm:max-h-[5.75rem] overflow-y-auto overscroll-contain"
            >
              <button
                v-for="ev in eventsOnDay(day)"
                :key="ev.id"
                type="button"
                class="w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight truncate border transition-colors shrink-0"
                :class="isProgramChipTinted(ev)
                  ? 'text-white font-semibold border-transparent'
                  : isPastDay(day)
                    ? 'bg-gray-900/80 text-gray-500 border-gray-800'
                    : 'bg-gray-800/90 text-gray-200 border-gray-700 hover:border-gold-500/50'"
                :style="eventChipHighlightStyle(ev, day)"
                :title="isBlockedProgram(ev) ? `${ev.title} — ${blockedProgramTitle(ev)}` : ev.title"
                @click.stop="openEdit(ev, $event)"
              >
                <span
                  v-if="isBlockedProgram(ev)"
                  class="inline-block mr-0.5 align-middle text-[11px] leading-none"
                  :aria-label="blockedProgramTitle(ev)"
                >🚫</span>
                <span
                  v-else-if="isProgramType(ev.event_type)"
                  class="inline-block mr-0.5 align-middle text-[11px] leading-none"
                  :class="!isProgramChipTinted(ev) && isPastDay(day) ? 'grayscale' : ''"
                  aria-hidden="true"
                >{{ eventChipEmoji(ev) }}</span>
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
      </template>

      <p class="text-xs text-gray-600 text-center">
        {{
          language === 'es'
            ? 'Hoy queda seleccionado al abrir. Toca un día para marcarlo. Si hay varios programas el mismo día, desplázate dentro de la celda. Usa el panel Programas a la derecha para ver la serie completa.'
            : 'Today is selected when you open the calendar. Tap a day to select it. Scroll inside a day cell when several programs share that date. Use the Programs panel on the right for the full series list.'
        }}
      </p>
        </div>

        <aside class="lg:w-72 lg:shrink-0 mt-6 lg:mt-0 lg:sticky lg:top-24">
          <h2 class="text-xs font-bold uppercase tracking-[0.22em] text-gold-400 mb-3">
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
            <div
              v-for="program in filteredProgramSummaries"
              :key="program.key"
              class="relative border-b border-gray-800 last:border-b-0"
              :class="program.isPast ? 'opacity-45' : ''"
              :style="program.seasonSlug
                ? {
                    backgroundColor: seasonColorFor(program.seasonSlug).fillMuted,
                    boxShadow: `inset 3px 0 0 ${seasonColorFor(program.seasonSlug).solid}`,
                  }
                : {}"
            >
              <button
                type="button"
                class="w-full text-left px-3 py-3 pr-[4.5rem] transition-colors hover:bg-gray-900/60"
                @click="openEditProgram(program)"
              >
                <p
                  class="text-sm font-bold leading-snug flex items-center gap-2"
                  :class="program.isPast ? 'text-gray-500' : 'text-white'"
                >
                  <span
                    class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    :style="{
                      backgroundColor: SKILL_CHIP_COLOR[skillTrackFromLevelId(program.representative.skill_level)].solid,
                    }"
                    aria-hidden="true"
                  />
                  <span class="text-base leading-none" aria-hidden="true">{{ eventChipEmoji(program.representative) }}</span>
                  <span class="line-clamp-2">{{ program.title }}</span>
                </p>
                <p class="text-[11px] text-gray-500 mt-0.5">
                  {{ formatProgramDateRange(program.startDate, program.endDate) }}
                  · {{ program.classCount }}
                  {{ language === 'es' ? (program.classCount === 1 ? 'clase' : 'clases') : (program.classCount === 1 ? 'class' : 'classes') }}
                </p>
                <p v-if="program.seasonSlug && !selectedSeasonSlugs.length" class="text-[10px] text-gray-500 mt-0.5 truncate">
                  {{ programSidebarSeasonLabel(program.seasonSlug) }}
                </p>
                <p class="mt-1.5 flex items-center justify-between gap-2">
                  <span class="text-[10px] uppercase tracking-wider text-gray-500 font-semibold truncate">
                    {{ eventChipLabel(program.representative) }}
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
          class="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto shadow-xl"
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
                      ? 'Añadir programa de skate'
                      : 'Add skate program'
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

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Título' : 'Title' }} *</label>
              <input
                v-model="form.title"
                type="text"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-600 text-white placeholder-gray-500 text-sm"
                :placeholder="
                  isProgramForm
                    ? language === 'es'
                      ? 'Ej. Grupal Principiante para Skater Tots (5-7)'
                      : 'e.g. Group Beginner for Skater Tots (5-7)'
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
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  v-for="t in selectableEventTypes"
                  :key="t"
                  type="button"
                  class="rounded-xl border px-2 py-2 text-left transition-all text-[11px] sm:text-xs leading-tight"
                  :class="
                    form.event_type === t
                      ? 'border-sky-500 bg-sky-500/15 text-white'
                      : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                  "
                  @click="form.event_type = t"
                >
                  <span class="block mb-0.5">{{ EVENT_META[t].emoji }}</span>
                  {{ tLabel(t) }}
                </button>
              </div>
            </div>

            <div v-if="isProgramForm" class="space-y-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ language === 'es' ? 'Temporada' : 'Season' }}
                  <span class="text-red-400">*</span>
                </label>
                <select
                  v-model="form.season_slug"
                  class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                >
                  <option value="">
                    {{ language === 'es' ? '— Elige temporada —' : '— Select season —' }}
                  </option>
                  <option v-for="s in programSeasons" :key="s.slug" :value="s.slug">
                    {{ language === 'es' ? s.name.es : s.name.en }}
                    · {{ language === 'es' ? s.dates.es : s.dates.en }}
                  </option>
                </select>
              </div>
              <div class="space-y-2">
                <p class="text-xs font-medium text-gray-400">
                  {{ language === 'es' ? 'Edad (puedes elegir varias)' : 'Age (select one or more)' }}
                  <span class="text-red-400">*</span>
                </p>
                <div class="grid grid-cols-4 gap-1.5">
                  <button
                    v-for="band in PROGRAM_AGE_BANDS"
                    :key="band.id"
                    type="button"
                    class="rounded-lg border px-1 py-2 text-center text-[11px] font-semibold transition-all"
                    :class="
                      isAudienceSelected(band.id)
                        ? 'border-teal-400 bg-teal-500 text-black ring-2 ring-teal-300'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                    "
                    @click="toggleAudience(band.id)"
                  >
                    {{ language === 'es' ? band.label.es : band.label.en }}
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <p class="text-xs font-medium text-gray-400">
                  {{ language === 'es' ? 'Nivel (puedes elegir varios)' : 'Level (select one or more)' }}
                  <span class="text-red-400">*</span>
                </p>
                <div class="grid grid-cols-3 gap-1.5">
                  <button
                    v-for="track in PROGRAM_SKILL_TRACKS"
                    :key="track.id"
                    type="button"
                    class="rounded-lg border px-1.5 py-2 text-center text-[11px] font-semibold transition-all"
                    :class="
                      isSkillTrackSelected(track.id)
                        ? 'border-amber-500 bg-amber-500/15 text-white'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                    "
                    @click="toggleSkillTrack(track.id)"
                  >
                    <span class="block text-sm mb-0.5" aria-hidden="true">{{ track.emoji }}</span>
                    {{ language === 'es' ? track.label.es : track.label.en }}
                  </button>
                </div>
              </div>

              <div class="space-y-2">
                <p class="text-xs font-medium text-gray-400">
                  {{ language === 'es' ? 'Coach / precios' : 'Coach / prices' }}
                  <span class="text-red-400">*</span>
                </p>
                <div class="grid grid-cols-3 gap-1.5">
                  <button
                    v-for="tier in FINANCE_COACH_TIERS"
                    :key="tier.id"
                    type="button"
                    class="rounded-lg border px-1.5 py-2 text-center text-[11px] font-semibold transition-all"
                    :class="
                      formCoachTier === tier.id
                        ? 'border-amber-500 bg-amber-500/15 text-white'
                        : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'
                    "
                    @click="form.coach_tier = tier.id"
                  >
                    <span
                      class="block w-2 h-2 rounded-full mx-auto mb-1"
                      :style="{ backgroundColor: tier.color }"
                      aria-hidden="true"
                    />
                    {{ language === 'es' ? tier.es : tier.en }}
                  </button>
                </div>
                <p class="text-[10px] text-amber-300/70">
                  {{
                    language === 'es'
                      ? 'Define la lista de precios del programa (Finanzas → Precios).'
                      : 'Sets which price list the program sells at (Finanzas → Precios).'
                  }}
                </p>
              </div>
            </div>

            <label v-if="!isClassSessionForm && !isPracticeForm" class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input v-model="form.all_day" type="checkbox" class="rounded border-gray-600 text-sky-500 focus:ring-sky-500" />
              {{ language === 'es' ? 'Todo el día' : 'All day event' }}
            </label>

            <div v-if="isPracticeForm" class="space-y-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
              <p class="text-xs font-semibold text-sky-300 uppercase tracking-wide">
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

            <div v-if="isClassSessionForm" class="space-y-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
              <p class="text-xs font-semibold text-cyan-300 uppercase tracking-wide">
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
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="d in recurringWeekdayOptions"
                      :key="d.v"
                      type="button"
                      class="px-3 py-1.5 rounded-full border text-xs font-bold transition-colors disabled:opacity-60"
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
                  <div class="grid grid-cols-2 gap-1.5">
                    <button
                      v-for="weeks in PROGRAM_WEEK_OPTIONS"
                      :key="weeks"
                      type="button"
                      class="rounded-lg border px-2 py-2 text-center text-[11px] font-semibold transition-all"
                      :class="
                        form.program_weeks === weeks
                          ? 'border-cyan-400 bg-cyan-500/20 text-white'
                          : 'border-gray-600 text-gray-400'
                      "
                      @click="form.program_weeks = weeks"
                    >
                      {{
                        language === 'es'
                          ? `${weeks} semanas · ${weeks * programDaysPerWeek} clases`
                          : `${weeks} weeks · ${weeks * programDaysPerWeek} classes`
                      }}
                    </button>
                  </div>
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
                  <p class="text-xs font-medium text-gray-400 mb-2">
                    {{ language === 'es' ? 'Horarios por día' : 'Session times' }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="slot in recurringSlotOptions"
                      :key="slot"
                      type="button"
                      class="px-3 py-1.5 rounded-full border text-xs font-bold transition-colors"
                      :class="
                        isRecurringSlot(slot)
                          ? 'border-cyan-400 bg-cyan-500/20 text-white'
                          : 'border-gray-600 text-gray-400'
                      "
                      :disabled="isSummerCourseForm"
                      @click="toggleRecurringSlot(slot)"
                    >
                      {{ TIME_SLOT_LABELS[slot].display }}
                    </button>
                  </div>
                  <p class="text-[10px] text-gray-500 mt-1">
                    {{
                      isSummerCourseForm
                        ? language === 'es'
                          ? 'Curso de verano: 9:00 AM – 1:00 PM (Lun–Vie).'
                          : 'Summer course: 9:00 AM – 1:00 PM (Mon–Fri).'
                        : language === 'es'
                          ? 'Tarde/noche Mar/Jue/Sáb · Mañana 7–8:30 solo sábado.'
                          : 'Early/late Tue/Thu/Sat · Morning 7–8:30 Saturday only.'
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

                <div class="grid grid-cols-2 gap-3">
                  <div v-if="!isSummerCourseForm">
                    <p class="block text-xs font-medium text-gray-400 mb-1">
                      {{ language === 'es' ? 'Clases en el calendario' : 'Classes on the calendar' }}
                    </p>
                    <p class="px-3 py-2 rounded-xl bg-gray-800/80 border border-gray-700 text-sm text-white">
                      {{ form.recurring_class_count }}
                    </p>
                  </div>
                  <div :class="isSummerCourseForm ? 'col-span-2' : ''">
                    <label class="block text-xs font-medium text-gray-400 mb-1">
                      {{ language === 'es' ? 'Cupo máximo' : 'Max skaters' }}
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
                      {{ TIME_SLOT_LABELS[slot].display }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-400 mb-1">
                    {{ language === 'es' ? 'Cupo máximo' : 'Max skaters' }}
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
                  <p class="text-lg font-black text-white leading-tight mt-0.5">
                    {{ formatMoneyMxn(Number(form.price_mxn) || 0) }}
                  </p>
                  <p class="text-[11px] text-gray-400 truncate">{{ programPriceLabel }}</p>
                </div>
                <NuxtLink
                  to="/member/admin/finance/prices"
                  class="shrink-0 px-2.5 py-1.5 rounded-lg border border-gray-600 text-[11px] font-semibold text-gray-300 hover:border-cyan-400/60 hover:text-cyan-300"
                >
                  {{ language === 'es' ? 'Editar precios' : 'Edit prices' }}
                </NuxtLink>
              </div>
              <p v-if="priceSplitHint" class="text-[10px] text-amber-300/80 mt-2">
                {{ priceSplitHint }}
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

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Ubicación' : 'Location' }}</label>
              <select
                v-model="form.location"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
              >
                <option v-for="loc in EVENT_LOCATIONS" :key="loc" :value="loc">{{ loc }}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Descripción' : 'Description' }}</label>
              <textarea
                v-model="form.description"
                rows="3"
                class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm resize-y min-h-[72px]"
                :placeholder="language === 'es' ? 'Opcional' : 'Optional'"
              />
            </div>

            <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
              <input v-model="form.visible_to_parents" type="checkbox" class="rounded border-gray-600 text-sky-500 focus:ring-sky-500" />
              {{ language === 'es' ? 'Visible para familias / patinadores' : 'Visible to parents / skaters' }}
            </label>
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
                class="px-4 py-2.5 rounded-xl bg-white text-black text-sm font-semibold disabled:opacity-50"
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

    <AdminSeasonCreateModal
      :open="addSeasonOpen"
      @close="addSeasonOpen = false"
      @created="onSeasonCreated"
    />
  </div>
</template>
