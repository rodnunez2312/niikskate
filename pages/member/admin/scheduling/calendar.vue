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
  MONTHLY_PROGRAM_PRICE_MXN,
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
import { computeSummerCourseEndDate, generateProgramOccurrences, nearestProgramStartDate, parseYmd, syncProgramDateRange, computeProgramEndDate } from '~/utils/recurringProgram'
import { MEXICO_NATIONAL_HOLIDAYS_2026_2027 } from '~/utils/mexicoHolidays'
import { getProgramSeasonBySlug, isSummerCourseSeason, seasonStatusLabel, findOverlappingRegularSeason, seasonHighlightColor, stripedSeasonFill } from '~/utils/programSeasons'
import {
  coachTierFromSkillTracks,
  coachTierLabel,
  resolveDefaultProgramPriceMxn,
} from '~/utils/classPricing'

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

const formCoachTier = computed(() => coachTierFromSkillTracks(form.value.skill_tracks))

const programPriceManual = ref(false)

const applyProgramPriceDefault = (force = false) => {
  if (!isProgramForm.value || editingId.value) return
  if (programPriceManual.value && !force) return
  form.value.price_mxn = resolveDefaultProgramPriceMxn({
    skillTracks: form.value.skill_tracks,
    eventType: form.value.event_type as 'class_session' | 'class_individual',
    isRecurring: form.value.is_recurring || isSummerCourseForm.value,
    isSummerCourse: isSummerCourseForm.value,
    summerWeeks: form.value.summer_weeks,
    classCount: form.value.recurring_class_count,
    coachTier: formCoachTier.value,
  })
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
  applyProgramPriceDefault()
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
  applyProgramPriceDefault(true)
}

const applyStandardSeasonPreset = () => {
  form.value.recurring_weekdays = [...DEFAULT_PROGRAM_WEEKDAYS]
  form.value.recurring_class_count = programClassCount(form.value.program_weeks || 4)
  applyProgramDateSync({ syncStart: true })
}

watch(
  () =>
    [
      form.value.skill_tracks.join(','),
      form.value.event_type,
      form.value.is_recurring,
      form.value.season_slug,
      form.value.summer_weeks,
      form.value.recurring_class_count,
    ] as const,
  () => {
    applyProgramPriceDefault()
  },
)

watch(
  () => form.value.price_mxn,
  val => {
    if (!isProgramForm.value || editingId.value) return
    const expected = resolveDefaultProgramPriceMxn({
      skillTracks: form.value.skill_tracks,
      eventType: form.value.event_type as 'class_session' | 'class_individual',
      isRecurring: form.value.is_recurring || isSummerCourseForm.value,
      isSummerCourse: isSummerCourseForm.value,
      summerWeeks: form.value.summer_weeks,
      classCount: form.value.recurring_class_count,
      coachTier: formCoachTier.value,
    })
    programPriceManual.value = Number(val) !== expected
  },
)

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
  () => form.value.program_weeks,
  weeks => {
    if (!isProgramForm.value || editingId.value || isSummerCourseForm.value) return
    form.value.recurring_class_count = programClassCount(weeks)
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

const programFitsSeason = computed(() => {
  if (editingId.value || !formSeason.value) return true
  const needed = Math.max(1, Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES)
  return recurringPreview.value.length >= needed
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
  if (i >= 0) form.value.recurring_weekdays = cur.filter(d => d !== v)
  else form.value.recurring_weekdays = [...cur, v].sort((a, b) => a - b)
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

const monthRange = computed(() => {
  const start = startOfMonth(viewMonth.value)
  const end = endOfMonth(viewMonth.value)
  const gridStart = startOfWeek(start, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(end, { weekStartsOn: 0 })
  return { start, end, gridStart, gridEnd, days: eachDayOfInterval({ start: gridStart, end: gridEnd }) }
})

const overlapsDay = (ev: SchoolCalendarRow, day: Date) => {
  const d = format(day, 'yyyy-MM-dd')
  const s = ev.start_date
  const e = ev.end_date || ev.start_date
  return s <= d && e >= d
}

const eventsOnDay = (day: Date) =>
  filteredEvents.value.filter(ev => {
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

const monthLabel = computed(() => {
  const loc = language.value === 'es' ? es : undefined
  return format(viewMonth.value, 'MMMM yyyy', { locale: loc })
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

const daySeasonStyle = (day: Date) => {
  const covering = seasonsCoveringDay(day)
  if (!covering.length) return {}
  const inMonth = isSameMonth(day, viewMonth.value)
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
        skillTracks: ['beginner'],
        eventType: 'class_session',
        isRecurring: true,
        isSummerCourse: isSummerCourseSeason(seasonSlug),
        summerWeeks: 1,
        classCount: isSummerCourseSeason(seasonSlug) ? 5 : PROGRAM_TOTAL_CLASSES,
      })
    : ('' as string | number),
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
  programPriceManual.value = false
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
  modalOpen.value = true
  formError.value = ''
  captureFormSnapshot()
}

const closeModal = () => {
  modalOpen.value = false
  editingId.value = null
  deleteSeriesOpen.value = false
  deleteSeriesId.value = null
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
      return {
        title,
        event_type: form.value.event_type as 'class_session' | 'class_individual',
        start_date: dateStr,
        end_date: null,
        all_day: false,
        start_time: `${slotTimes.start}:00`,
        end_time: `${slotTimes.end}:00`,
        location: form.value.location || DEFAULT_SKATEPARK,
        description: form.value.description.trim() || null,
        visible_to_parents: form.value.visible_to_parents,
        is_bookable: true,
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
      const rows = occurrences.map(o => buildClassPayload(o.date, o.slot, seriesId))
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
      max_capacity_override: isClass ? Number(form.value.max_capacity_override) || null : null,
      program_series_id: null as string | null,
      season_slug: isClass ? form.value.season_slug.trim() || null : null,
    }

    const withAudienceArray = {
      ...basePayload,
      audience_categories: form.value.audience_categories.length ? form.value.audience_categories : null,
    }

    const savePayload = async (payload: Record<string, unknown>) => {
      if (editingId.value) {
        return client.from('school_calendar_events').update(payload).eq('id', editingId.value)
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
  if (seasonIsCurrent(season.startDate, season.endDate)) {
    viewMonth.value = new Date()
    return
  }
  viewMonth.value = new Date(`${season.startDate}T12:00:00`)
}

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
              {{ language === 'es' ? 'Calendario escolar' : 'School calendar' }}
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
            <div
              v-for="season in programSeasons"
              :key="season.slug"
              class="relative border-b border-gray-800 last:border-b-0"
              :class="seasonIsPast(season.startDate, season.endDate) ? 'opacity-45' : ''"
              :style="isSeasonSelected(season.slug)
                ? {
                    backgroundColor: seasonColorFor(season.slug).fillMuted,
                    boxShadow: `inset 0 0 0 1px ${seasonColorFor(season.slug).solid}`,
                  }
                : {}"
            >
              <button
                type="button"
                class="w-full text-left px-3 py-3 pr-10 transition-colors"
                :class="isSeasonSelected(season.slug) ? '' : 'hover:bg-gray-900'"
                @click="toggleSeason(season.slug)"
              >
                <p
                  class="text-sm font-bold leading-snug flex items-center gap-2"
                  :class="seasonIsPast(season.startDate, season.endDate) ? 'text-gray-500' : 'text-white'"
                >
                  <span
                    class="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                    :style="{ backgroundColor: seasonColorFor(season.slug).solid }"
                    aria-hidden="true"
                  />
                  <span class="mr-0.5" aria-hidden="true">{{ season.icon }}</span>
                  {{ language === 'es' ? season.name.es : season.name.en }}
                </p>
                <p class="text-[11px] text-gray-500 mt-0.5">
                  {{ language === 'es' ? season.dates.es : season.dates.en }}
                </p>
                <p class="mt-1.5 flex items-center justify-between gap-2">
                  <span class="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Mérida</span>
                  <span
                    v-if="seasonMerida(season).kind === 'enroll'"
                    class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full bg-teal-700 text-white text-[10px] font-bold"
                  >
                    {{ seasonMerida(season).label }}
                  </span>
                  <span
                    v-else
                    class="text-[11px] font-semibold"
                    :class="seasonMerida(season).kind === 'done' ? 'text-gray-500' : 'text-gray-400'"
                  >
                    {{ seasonMerida(season).label }}
                  </span>
                </p>
              </button>
              <button
                type="button"
                class="absolute top-2 right-2 p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-950/50 disabled:opacity-40"
                :disabled="removingSeasonSlug === season.slug"
                :title="language === 'es' ? 'Quitar temporada' : 'Remove season'"
                :aria-label="language === 'es' ? 'Quitar temporada' : 'Remove season'"
                @click.stop="confirmRemoveSeason(season)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
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
      <div v-else class="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
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
            v-for="(day, idx) in monthRange.days"
            :key="idx"
            role="button"
            tabindex="0"
            class="min-h-[88px] sm:min-h-[100px] border-b border-r border-gray-800 p-1.5 text-left align-top transition-colors hover:bg-gray-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60 cursor-pointer"
            :class="{
              'bg-gray-950/50': !isSameMonth(day, viewMonth) && !isDayInHighlightedSeason(day),
              'opacity-50': isPastDay(day) && !isDayInHighlightedSeason(day),
              'ring-2 ring-inset ring-white': isSelectedDay(day),
            }"
            :style="daySeasonStyle(day)"
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
            <div class="flex flex-col gap-0.5">
              <button
                v-for="ev in eventsOnDay(day).slice(0, 2)"
                :key="ev.id"
                type="button"
                class="w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight truncate border transition-colors"
                :class="isProgramChipTinted(ev)
                  ? 'text-white font-semibold border-transparent'
                  : isPastDay(day)
                    ? 'bg-gray-900/80 text-gray-500 border-gray-800'
                    : 'bg-gray-800/90 text-gray-200 border-gray-700 hover:border-gold-500/50'"
                :style="eventChipHighlightStyle(ev, day)"
                :title="ev.title"
                @click.stop="openEdit(ev, $event)"
              >
                <span
                  v-if="isProgramType(ev.event_type)"
                  class="inline-block mr-0.5 align-middle text-[11px] leading-none"
                  :class="!isProgramChipTinted(ev) && isPastDay(day) ? 'grayscale' : ''"
                  aria-hidden="true"
                >{{ eventChipEmoji(ev) }}</span>
                <span
                  v-else
                  class="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                  :class="isPastDay(day) ? 'bg-gray-600' : (EVENT_META[ev.event_type]?.dot || 'bg-gray-500')"
                />
                {{ eventChipLabel(ev) }}
              </button>
              <span
                v-if="eventsOnDay(day).length > 2"
                class="text-[10px] text-gray-500 pl-0.5"
              >
                +{{ eventsOnDay(day).length - 2 }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <p class="text-xs text-gray-600 text-center">
        {{
          language === 'es'
            ? 'Hoy queda seleccionado al abrir. Toca un día para marcarlo. Usa “Añadir evento” o “Añadir programa”. Toca un chip para editar.'
            : 'Today is selected when you open the calendar. Tap a day to select it. Use “Add event” or “Add program”. Tap a chip to edit.'
        }}
      </p>
        </div>
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
                <p class="text-[10px] text-amber-300/70">
                  {{ coachTierLabel(formCoachTier, language === 'es') }}
                  ·
                  {{
                    language === 'es'
                      ? 'Intermedio/Avanzado = Coach Pro (especialista)'
                      : 'Intermediate/Advanced = Pro coach (specialist)'
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
              <p class="text-xs font-semibold text-cyan-300 uppercase tracking-wide flex items-center gap-1.5">
                {{ language === 'es' ? 'Sesión reservable' : 'Bookable session' }}
                <AdminPricingHelpPopover :summer-course="isSummerCourseForm" />
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
                    ? 'Programa recurrente · Mar / Jue / Sáb · las fechas siguen la temporada'
                    : 'Recurring program · Tue / Thu / Sat · dates follow the season'
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
                          ? `${weeks} semanas · ${weeks === 4 ? '12 clases' : '24 clases'}`
                          : `${weeks} weeks · ${weeks === 4 ? '12 classes' : '24 classes'}`
                      }}
                      <span class="block text-[10px] font-normal text-gray-400 mt-0.5">
                        {{
                          weeks === 4
                            ? language === 'es'
                              ? 'Padres: 1 clase, 8 o 12'
                              : 'Parents: 1 class, 8 or 12'
                            : language === 'es'
                              ? 'Padres: 1 clase, 16 o 24'
                              : 'Parents: 1 class, 16 or 24'
                        }}
                      </span>
                    </button>
                  </div>
                </div>
                <div>
                  <p class="text-xs font-medium text-gray-400 mb-2">
                    {{ language === 'es' ? 'Días de la semana' : 'Days of the week' }}
                    <span v-if="isSummerCourseForm" class="text-cyan-300/80 font-normal">
                      · {{ language === 'es' ? 'Lun–Vie' : 'Mon–Fri' }}
                    </span>
                    <span v-else class="text-cyan-300/80 font-normal">
                      · {{ language === 'es' ? 'Mar / Jue / Sáb' : 'Tue / Thu / Sat' }}
                    </span>
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="d in recurringWeekdayOptions"
                      :key="d.v"
                      type="button"
                      class="px-3 py-1.5 rounded-full border text-xs font-bold transition-colors"
                      :class="
                        isRecurringWeekday(d.v)
                          ? 'border-cyan-400 bg-cyan-500/20 text-white'
                          : 'border-gray-600 text-gray-400'
                      "
                      :disabled="true"
                      @click="toggleRecurringWeekday(d.v)"
                    >
                      {{ language === 'es' ? d.es : d.en }}
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
                        ? 'Inicio/fin siguen la temporada seleccionada. Las clases no pueden salir de ese rango (omite festivos MX).'
                        : 'Start/end follow the selected season. Classes cannot be created outside that window (MX holidays skipped).'
                  }}
                </p>
                <p v-if="formSeason && !programFitsSeason" class="text-[11px] text-amber-400">
                  {{
                    language === 'es'
                      ? `Esta temporada solo alcanza ${recurringPreview.length} clase(s) de ${form.recurring_class_count}. Acorta la duración o elige otra temporada.`
                      : `This season only fits ${recurringPreview.length} of ${form.recurring_class_count} classes. Shorten the program or pick another season.`
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
                    v-if="recurringPreview.length"
                    class="text-xs text-cyan-300/90 mt-2 font-medium"
                  >
                    {{
                      isSummerCourseForm
                        ? language === 'es'
                          ? `Se crearán ${recurringPreview.length} clase(s): ${form.start_date} → ${form.end_date || recurringPreview[recurringPreview.length - 1]?.date}.`
                          : `${recurringPreview.length} class(es): ${form.start_date} → ${form.end_date || recurringPreview[recurringPreview.length - 1]?.date}.`
                        : language === 'es'
                          ? `Se crearán ${recurringPreview.length} clase(s): ${form.start_date} → ${form.end_date || recurringPreview[recurringPreview.length - 1]?.date}. Se omiten festivos nacionales.`
                          : `${recurringPreview.length} class(es): ${form.start_date} → ${form.end_date || recurringPreview[recurringPreview.length - 1]?.date}. National holidays are skipped.`
                    }}
                  </p>
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
                      <span class="text-gray-400 font-normal">
                        · {{
                          form.program_weeks === 8
                            ? language === 'es'
                              ? 'padres: 1 clase, 16 ($2,000) o 24 ($3,000)'
                              : 'parents: 1 class, 16 ($2,000) or 24 ($3,000)'
                            : language === 'es'
                              ? 'padres: 1 clase, 8 ($1,000) o 12 ($1,500)'
                              : 'parents: 1 class, 8 ($1,000) or 12 ($1,500)'
                        }}
                      </span>
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

              <div>
                <label class="flex items-center gap-1.5 text-xs font-medium text-gray-400 mb-1">
                  {{ language === 'es' ? 'Precio (MXN)' : 'Price (MXN)' }}
                  <AdminPricingHelpPopover :summer-course="isSummerCourseForm" />
                </label>
                <input v-model="form.price_mxn" type="number" min="0" step="1" class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm" :placeholder="String(form.price_mxn || MONTHLY_PROGRAM_PRICE_MXN)" />
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
