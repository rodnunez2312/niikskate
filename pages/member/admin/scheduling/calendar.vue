<script setup lang="ts">
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
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
  PROGRAM_WEEKS,
  PROGRAM_AGE_BANDS,
  PROGRAM_SKILL_TRACKS,
  SUMMER_COURSE_WEEK_OPTIONS,
  SUMMER_COURSE_WEEKDAY_PRESET,
  TIME_SLOT_LABELS,
  mergedAudienceAgeRange,
  parseAudienceCategories,
  skillLevelIdFromTrack,
  skillTrackFromLevelId,
  type ProgramSkillTrack,
} from '~/types'
import { DEFAULT_PROGRAM_WEEKDAYS, PRACTICE_TIME_SLOTS, RECURRING_WEEKDAY_OPTIONS, SUMMER_COURSE_WEEKDAY_OPTIONS, slotsForWeekday, slotsForWeekdays } from '~/utils/classSchedule'
import { computeSummerCourseEndDate, generateProgramOccurrences, nearestProgramStartDate, syncProgramDateRange, computeProgramEndDate } from '~/utils/recurringProgram'
import { MEXICO_NATIONAL_HOLIDAYS_2026_2027 } from '~/utils/mexicoHolidays'
import { getProgramSeasonBySlug, isSummerCourseSeason, PROGRAM_SEASONS } from '~/utils/programSeasons'
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

const checkingAccess = ref(true)
const accessError = ref('')
const loading = ref(true)
const events = ref<SchoolCalendarRow[]>([])
const viewMonth = ref(new Date())
const selectedDate = ref<Date | null>(null)
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
  applyProgramPriceDefault()
}

const applySummerCoursePreset = () => {
  form.value.is_recurring = true
  form.value.recurring_weekdays = [...SUMMER_COURSE_WEEKDAY_PRESET]
  const opt = SUMMER_COURSE_WEEK_OPTIONS.find(o => o.weeks === form.value.summer_weeks)
    ?? SUMMER_COURSE_WEEK_OPTIONS[0]
  form.value.summer_weeks = opt.weeks
  form.value.recurring_class_count = opt.classes
  if (!form.value.recurring_slots.length) form.value.recurring_slots = ['early']
  applyProgramDateSync({ syncStart: true })
  applyProgramPriceDefault(true)
}

const applyStandardSeasonPreset = () => {
  form.value.recurring_weekdays = [...DEFAULT_PROGRAM_WEEKDAYS]
  form.value.recurring_class_count = PROGRAM_TOTAL_CLASSES
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
  const ages = form.value.audience_categories
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
  if (isClassSessionForm.value && (form.value.is_recurring || isSummerCourseForm.value) && !editingId.value) {
    return slotsForWeekdays(form.value.recurring_weekdays)
  }
  const wd = formStartWeekday.value
  if (wd == null) return ['early', 'late']
  return slotsForWeekday(wd)
})

const recurringPreview = computed(() => {
  if ((!form.value.is_recurring && !isSummerCourseForm.value) || !form.value.start_date || editingId.value) return []
  return generateProgramOccurrences({
    startDate: form.value.start_date,
    endDate: isSummerCourseForm.value ? form.value.end_date : null,
    weekdays: form.value.recurring_weekdays,
    slots: form.value.recurring_slots.length ? form.value.recurring_slots : ['early'],
    maxClasses: Math.max(1, Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES),
  })
})

const syncingProgramDates = ref(false)

const applyProgramDateSync = (opts?: { syncStart?: boolean }) => {
  if ((!form.value.is_recurring && !isSummerCourseForm.value) || editingId.value) return
  if (!form.value.recurring_weekdays.length) return
  syncingProgramDates.value = true
  try {
    const maxClasses = Math.max(1, Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES)

    if (isSummerCourseForm.value) {
      if (opts?.syncStart !== false) {
        const startDate = nearestProgramStartDate(new Date(), form.value.recurring_weekdays)
        form.value.start_date = startDate
        form.value.end_date = computeSummerCourseEndDate(startDate, maxClasses)
      } else if (form.value.start_date) {
        form.value.end_date = computeSummerCourseEndDate(form.value.start_date, maxClasses)
      }
      return
    }

    const slots = (form.value.recurring_slots.length
      ? form.value.recurring_slots
      : ['early']) as TimeSlot[]
    if (opts?.syncStart !== false) {
      const { startDate, endDate } = syncProgramDateRange({
        from: new Date(),
        weekdays: form.value.recurring_weekdays,
        slots,
        maxClasses,
      })
      form.value.start_date = startDate
      form.value.end_date = endDate
    } else if (form.value.start_date) {
      form.value.end_date = computeProgramEndDate({
        startDate: form.value.start_date,
        weekdays: form.value.recurring_weekdays,
        slots,
        maxClasses,
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

const eventsOnDay = (day: Date) => filteredEvents.value.filter(ev => overlapsDay(ev, day))

const monthLabel = computed(() => {
  const loc = language.value === 'es' ? es : undefined
  return format(viewMonth.value, 'MMMM yyyy', { locale: loc })
})

const weekdayLabels = computed(() =>
  language.value === 'es' ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
)

const querySeasonSlug = () => {
  const q = route.query.temporada
  return typeof q === 'string' ? q.trim() : ''
}

const activeQuerySeason = computed(() => {
  const slug = querySeasonSlug()
  return slug ? getProgramSeasonBySlug(slug) : undefined
})

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
  time_slot: 'early' as TimeSlot,
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
  recurring_slots: ['early'] as TimeSlot[],
  recurring_class_count: PROGRAM_TOTAL_CLASSES,
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
  const seasonFromQuery = mode === 'program' ? querySeasonSlug() : ''
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
    summer_weeks: 1 as 1 | 2,
    max_capacity_override: ev.max_capacity_override ?? (ev.event_type === 'class_individual' ? 1 : 6),
    season_slug: ev.season_slug ?? '',
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
    && (form.value.is_recurring || isSummerCourseForm.value)
    && !editingId.value
  ) {
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
      const slotTimes = TIME_SLOT_LABELS[slot]
      const capOverride = Number(form.value.max_capacity_override) || null
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
        min_age: Number(form.value.min_age) || null,
        max_age: Number(form.value.max_age) || null,
        skatepark: form.value.location || DEFAULT_SKATEPARK,
        price_mxn: priceNum,
        program_series_id: programSeriesId,
        max_capacity_override: capOverride,
        season_slug: form.value.season_slug.trim() || null,
        created_by: user.value!.id,
      }
    }

    if (isRecurringClass) {
      const occurrences = generateProgramOccurrences({
        startDate: form.value.start_date,
        endDate: isSummerCourseForm.value ? form.value.end_date : null,
        weekdays: form.value.recurring_weekdays,
        slots: form.value.recurring_slots,
        maxClasses: Math.max(1, Number(form.value.recurring_class_count) || PROGRAM_TOTAL_CLASSES),
      })
      if (!occurrences.length) {
        formError.value =
          language.value === 'es'
            ? 'No se generaron clases: revisa que el horario exista en los días elegidos (ej. 5:30–7 PM en Mar/Jue/Sáb/Dom; mañana solo fin de semana).'
            : 'No classes generated: check that the time slot is valid for selected days (e.g. 5:30–7 PM on Tue/Thu/Sat/Sun; morning weekends only).'
        saving.value = false
        return
      }
      const seriesId = crypto.randomUUID()
      const rows = occurrences.map(o => buildClassPayload(o.date, o.slot, seriesId))
      let { error: bulkErr } = await client.from('school_calendar_events').insert(rows)
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
      min_age: isClass ? Number(form.value.min_age) || null : null,
      max_age: isClass ? Number(form.value.max_age) || null : null,
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

const isSelectedDay = (day: Date) => selectedDate.value && isSameDay(day, selectedDate.value)
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-4xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
        </div>
      </div>
    </header>

    <div
      v-if="activeQuerySeason && profileIsAdmin"
      class="border-b border-teal-500/30 bg-teal-500/10 px-4 py-3"
    >
      <p class="max-w-4xl mx-auto text-sm text-teal-100">
        <span class="font-bold">{{ activeQuerySeason.icon }}
          {{ language === 'es' ? activeQuerySeason.name.es : activeQuerySeason.name.en }}
        </span>
        <span class="text-teal-200/80">
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

    <div v-else class="px-4 py-6 max-w-4xl mx-auto space-y-4">
      <div v-if="formError && !modalOpen" class="rounded-xl border border-red-500/40 bg-red-950/40 p-3 text-sm text-red-200">
        {{ formError }}
        <p class="text-xs text-red-300/80 mt-2">
          {{
            language === 'es'
              ? 'Si la tabla no existe, ejecuta add_school_calendar_events.sql en Supabase.'
              : 'If the table is missing, run add_school_calendar_events.sql in Supabase.'
          }}
        </p>
      </div>

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
          <button
            v-for="(day, idx) in monthRange.days"
            :key="idx"
            type="button"
            class="min-h-[88px] sm:min-h-[100px] border-b border-r border-gray-800 p-1.5 text-left align-top transition-colors hover:bg-gray-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60"
            :class="{
              'bg-gray-950/50': !isSameMonth(day, viewMonth),
              'ring-2 ring-inset ring-white': isSelectedDay(day),
            }"
            @click="openCreateForDay(day, 'event')"
          >
            <div
              class="text-xs font-semibold mb-1"
              :class="[
                isSameMonth(day, viewMonth) ? 'text-white' : 'text-gray-600',
                isToday(day) ? 'text-gold-400' : '',
              ]"
            >
              {{ format(day, 'd') }}
            </div>
            <div class="flex flex-col gap-0.5">
              <button
                v-for="ev in eventsOnDay(day).slice(0, 2)"
                :key="ev.id"
                type="button"
                class="w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight truncate bg-gray-800/90 text-gray-200 border border-gray-700 hover:border-gold-500/50"
                @click.stop="openEdit(ev, $event)"
              >
                <span
                  v-if="isProgramType(ev.event_type)"
                  class="inline-block mr-0.5 align-middle text-[11px] leading-none"
                  aria-hidden="true"
                >{{ EVENT_META[ev.event_type]?.emoji || '🛹' }}</span>
                <span
                  v-else
                  class="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                  :class="EVENT_META[ev.event_type]?.dot || 'bg-gray-500'"
                />
                {{ ev.title }}
              </button>
              <span
                v-if="eventsOnDay(day).length > 2"
                class="text-[10px] text-gray-500 pl-0.5"
              >
                +{{ eventsOnDay(day).length - 2 }}
              </span>
            </div>
          </button>
        </div>
      </div>

      <p class="text-xs text-gray-600 text-center">
        {{
          language === 'es'
            ? 'Usa “Añadir evento” o “Añadir programa”. Toca un chip para editar o borrar.'
            : 'Use “Add event” or “Add program”. Tap a chip to edit or delete.'
        }}
      </p>
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
                  <option v-for="s in PROGRAM_SEASONS" :key="s.slug" :value="s.slug">
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
                        ? 'border-teal-500 bg-teal-500/15 text-white'
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
                    ? `Programa de ${PROGRAM_WEEKS} semanas (${PROGRAM_TOTAL_CLASSES} clases)`
                    : `${PROGRAM_WEEKS}-week program (${PROGRAM_TOTAL_CLASSES} classes)`
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
                      class="px-3 py-1.5 rounded-full border text-xs font-bold transition-colors"
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
                </div>

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
                <p class="text-[10px] text-gray-500 -mt-1">
                  {{
                    isSummerCourseForm
                      ? language === 'es'
                        ? 'Fin = inicio + N días naturales (5 o 10 según duración). Días Lun–Vie.'
                        : 'End = start + N calendar days (5 or 10 by duration). Mon–Fri only.'
                      : language === 'es'
                        ? 'Inicio = primer día elegido más cercano · Fin = última de las N clases (omite festivos MX).'
                        : 'Start = nearest first selected weekday · End = last of N classes (skips MX holidays).'
                  }}
                </p>

                <div>
                  <p class="text-xs font-medium text-gray-400 mb-2">
                    {{ language === 'es' ? 'Horarios por día' : 'Session times' }}
                  </p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-for="slot in slotsForWeekdays(form.recurring_weekdays)"
                      :key="slot"
                      type="button"
                      class="px-3 py-1.5 rounded-full border text-xs font-bold transition-colors"
                      :class="
                        isRecurringSlot(slot)
                          ? 'border-cyan-400 bg-cyan-500/20 text-white'
                          : 'border-gray-600 text-gray-400'
                      "
                      @click="toggleRecurringSlot(slot)"
                    >
                      {{ TIME_SLOT_LABELS[slot].display }}
                    </button>
                  </div>
                  <p class="text-[10px] text-gray-500 mt-1">
                    {{
                      isSummerCourseForm
                        ? language === 'es'
                          ? 'Horarios disponibles según el día (Lun–Vie).'
                          : 'Available times depend on weekday (Mon–Fri).'
                        : language === 'es'
                          ? 'Mañana 7–8:30 solo Sáb · Tarde/noche Mar/Jue/Sáb · Lunes 4:30–6 PM'
                          : 'Morning 7–8:30 Sat only · Early/late Tue/Thu/Sat · Monday 4:30–6 PM'
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
                    <label class="block text-xs font-medium text-gray-400 mb-1">
                      {{ language === 'es' ? 'Número de clases' : 'Number of classes' }}
                    </label>
                    <input
                      v-model.number="form.recurring_class_count"
                      type="number"
                      min="1"
                      max="52"
                      class="w-full px-3 py-2 rounded-xl bg-gray-800 border border-gray-600 text-white text-sm"
                    />
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
  </div>
</template>
