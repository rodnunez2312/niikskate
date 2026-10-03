<script setup lang="ts">
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { es as esLocale } from 'date-fns/locale'
import { getDay } from 'date-fns'
import { PROGRAM_AGE_BANDS, TIME_SLOT_NAMES, type TimeSlot } from '~/types'
import { computeAgeFromDob, isAgeEligibleForSession, sessionAgeBounds } from '~/utils/ageEligibility'
import {
  couponCoversScope,
  couponDiscountSummary,
  couponLabel,
  couponRejectionMessage,
  type CouponRejection,
} from '~/utils/coupons'
import {
  mergeProgramSeasons,
  pickDefaultProgramSeason,
  type ProgramSeason,
} from '~/utils/programSeasons'
import {
  ATTEND_WEEKDAYS,
  FINANCE_COACH_TIERS,
  aggregateStudents,
  downloadCsv,
  effectivePriceMxn,
  enrollmentStudentKey,
  enrollmentsCsvName,
  formatDateEs,
  formatMoneyMxn,
  paymentToneForDays,
  remainingSessions,
  sortPriceRows,
  studentSummariesCsv,
  weekdaysLabel,
  type FinanceAttendanceMark,
  type FinanceAttendanceStatus,
  type FinanceEnrollmentRow,
  type FinanceStudentSummary,
} from '~/utils/finance'

definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

const client = useSupabaseClient()
const { language } = useI18n()
const es = computed(() => language.value === 'es')
const {
  enrollments, attendanceMarks, priceRows, loading, saving, error,
  loadEnrollments, loadAttendanceMarks, loadPriceRows,
  addEnrollment, updateEnrollment, deleteEnrollment,
  saveAttendanceMark, deleteAttendanceMark,
} = useFinance()
const { coupons, loadCoupons } = useCoupons()

type PurchasePerson = {
  key: string
  name: string
  kind: 'profile' | 'crew'
  /** Account that owns the booking (guardian, or the skater themselves). */
  userId: string
  skaterProfileId: string | null
  crewMemberId: string | null
  age: number | null
  programLevel: number | null
  programName: string | null
}

type UpcomingClass = {
  title: string
  startDate: string
  startTime: string | null
}

const people = ref<PurchasePerson[]>([])
const futureBookings = ref<Record<string, number>>({})
const upcomingByStudent = ref<Record<string, UpcomingClass[]>>({})
const search = ref('')
const filter = ref<'all' | 'with_classes' | 'out' | 'booked' | 'overdue'>('all')
const showInactive = ref(false)
const expanded = ref<string | null>(null)

async function loadFutureBookings() {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error: queryError } = await client
    .from('class_session_enrollments')
    .select('user_id, crew_member_id, skater_profile_id, school_calendar_events!inner(title, start_date, start_time)')
    .eq('status', 'confirmed')
    .gte('school_calendar_events.start_date', today)
  if (queryError) {
    console.error('Future class bookings could not be loaded', queryError)
    return
  }
  const counts: Record<string, number> = {}
  const upcoming: Record<string, UpcomingClass[]> = {}
  for (const row of (data || []) as Array<{
    user_id: string
    crew_member_id: string | null
    skater_profile_id: string | null
    school_calendar_events: { title: string; start_date: string; start_time: string | null } | Array<{ title: string; start_date: string; start_time: string | null }>
  }>) {
    const key = row.skater_profile_id
      ? `profile:${row.skater_profile_id}`
      : row.crew_member_id ? `crew:${row.crew_member_id}` : `profile:${row.user_id}`
    const event = Array.isArray(row.school_calendar_events) ? row.school_calendar_events[0] : row.school_calendar_events
    if (!event) continue
    counts[key] = (counts[key] ?? 0) + 1
    ;(upcoming[key] ||= []).push({
      title: event.title,
      startDate: event.start_date,
      startTime: event.start_time,
    })
  }
  for (const list of Object.values(upcoming)) {
    list.sort((a, b) => a.startDate.localeCompare(b.startDate) || (a.startTime || '').localeCompare(b.startTime || ''))
  }
  futureBookings.value = counts
  upcomingByStudent.value = upcoming
}

function upcomingFor(key: string) {
  return upcomingByStudent.value[key] || []
}

function personFor(key: string) {
  return people.value.find(person => person.key === key) ?? null
}

function ageGroupFor(key: string) {
  const age = personFor(key)?.age
  if (age == null) return '—'
  const band = [...PROGRAM_AGE_BANDS].reverse().find(row =>
    age >= row.minAge && (row.maxAge == null || age <= row.maxAge),
  )
  if (!band) return `${age}`
  return `${band.label[es.value ? 'es' : 'en']} · ${band.nickname[es.value ? 'es' : 'en']}`
}

function programFor(key: string) {
  return personFor(key)?.programName || '—'
}

onMounted(async () => {
  await Promise.all([
    loadEnrollments({ force: true, includeInactive: true }),
    loadPriceRows(),
    loadCoupons(),
    loadFutureBookings(),
  ])
  await loadAttendanceMarks(enrollments.value.map(r => r.id))
  const [{ data: profileRows }, { data: crewRows }, { data: seasonRows }, { data: skillGroups }] = await Promise.all([
    client.from('profiles').select('id, full_name, guardian_user_id, date_of_birth, age, skill_group_id').eq('role', 'customer').order('full_name'),
    client.from('crew_members').select('id, first_name, last_name, guardian_user_id, date_of_birth, age').order('first_name'),
    client.from('program_seasons').select('slug, name_es, name_en, start_date, end_date, status, icon'),
    client.from('skill_groups').select('id, name'),
  ])
  const levelByGroup = new Map(
    ((skillGroups || []) as Array<{ id: string; name: string }>).map(group => [
      group.id,
      Number(group.name.match(/Level\s+(\d+)/i)?.[1]) || null,
    ]),
  )
  const nameByGroup = new Map(
    ((skillGroups || []) as Array<{ id: string; name: string }>).map(group => [group.id, group.name]),
  )
  people.value = [
    ...((profileRows || []) as Array<{ id: string; full_name: string; guardian_user_id: string | null; date_of_birth: string | null; age: number | null; skill_group_id: string | null }>).map(p => ({
      key: `profile:${p.id}`,
      name: p.full_name || '—',
      kind: 'profile' as const,
      userId: p.guardian_user_id || p.id,
      skaterProfileId: p.guardian_user_id ? p.id : null,
      crewMemberId: null,
      age: computeAgeFromDob(p.date_of_birth, p.age),
      programLevel: p.skill_group_id ? levelByGroup.get(p.skill_group_id) ?? null : null,
      programName: p.skill_group_id ? nameByGroup.get(p.skill_group_id) ?? null : null,
    })),
    ...((crewRows || []) as Array<{ id: string; first_name: string; last_name: string; guardian_user_id: string; date_of_birth: string | null; age: number | null }>).map(c => ({
      key: `crew:${c.id}`,
      name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '—',
      kind: 'crew' as const,
      userId: c.guardian_user_id,
      skaterProfileId: null,
      crewMemberId: c.id,
      age: computeAgeFromDob(c.date_of_birth, c.age),
      programLevel: null,
      programName: null,
    })),
  ]
  const extra = ((seasonRows || []) as Array<{
    slug: string
    name_es: string
    name_en: string | null
    start_date: string
    end_date: string
    status: ProgramSeason['status']
    icon: string | null
  }>).map(row => ({
    slug: row.slug,
    name: { es: row.name_es, en: row.name_en || row.name_es },
    dates: { es: '', en: '' },
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    icon: row.icon || '📅',
  }))
  seasonCatalog.value = mergeProgramSeasons(extra)
})

const summaries = computed(() => {
  const counted = showInactive.value ? enrollments.value : enrollments.value.filter(r => r.is_active)
  return aggregateStudents(counted, futureBookings.value).map(student => ({
    ...student,
    // Archived purchases stay visible as history without inflating current totals.
    enrollments: enrollments.value
      .filter(row => enrollmentStudentKey(row) === student.key)
      .sort((a, b) => (b.last_payment_on ?? '').localeCompare(a.last_payment_on ?? '')),
  }))
})
const filtered = computed(() => {
  const q = search.value.trim().toLocaleLowerCase()
  return summaries.value.filter(s => {
    if (q && !s.studentName.toLocaleLowerCase().includes(q)) return false
    if (filter.value === 'with_classes' && s.remaining <= 0) return false
    if (filter.value === 'out' && s.remaining > 0) return false
    if (filter.value === 'booked' && s.futureBookedClasses <= 0) return false
    if (filter.value === 'overdue') {
      if (paymentToneForDays(daysSince(s.lastPaymentOn)) !== 'bad') return false
    }
    return true
  })
})
const stats = computed(() => ({
  students: filtered.value.length,
  paid: filtered.value.reduce((n, s) => n + s.sessionsPaid, 0),
  remaining: filtered.value.reduce((n, s) => n + s.remaining, 0),
  booked: filtered.value.reduce((n, s) => n + s.futureBookedClasses, 0),
  collected: filtered.value.reduce((n, s) => n + s.amountPaidMxn, 0),
}))

function daysSince(date: string | null) {
  if (!date) return null
  return Math.floor((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86_400_000)
}
function studentMarks(student: FinanceStudentSummary) {
  const ids = new Set(student.enrollments.map(r => r.id))
  return attendanceMarks.value.filter(m => ids.has(m.enrollment_id))
}
async function setMark(student: FinanceStudentSummary, date: string, status: FinanceAttendanceStatus) {
  const existing = studentMarks(student).find(m => m.session_date === date)
  const enrollment = existing
    ? student.enrollments.find(r => r.id === existing.enrollment_id)
    : [...student.enrollments]
        .filter(r => r.is_active && remainingSessions(r) > 0)
        .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))[0]
  if (!enrollment) {
    alert(es.value ? 'Este alumno no tiene clases pagadas disponibles.' : 'This student has no paid classes available.')
    return
  }
  const res = await saveAttendanceMark({ enrollment_id: enrollment.id, session_date: date, status })
  if (!res.ok && res.message) alert(res.message)
}
async function clearMark(mark: FinanceAttendanceMark) {
  const res = await deleteAttendanceMark(mark.id)
  if (!res.ok && res.message) alert(res.message)
}
async function toggleActive(row: FinanceEnrollmentRow) {
  await updateEnrollment(row.id, { is_active: !row.is_active })
}
async function removePurchase(row: FinanceEnrollmentRow) {
  if (!confirm(es.value ? `¿Eliminar la compra de ${row.student_name}?` : `Delete ${row.student_name}'s purchase?`)) return
  await deleteEnrollment(row.id)
}
function exportCsv() {
  downloadCsv(enrollmentsCsvName(), studentSummariesCsv(filtered.value))
}

const showForm = ref(false)
const formError = ref('')
const blankForm = () => ({
  person_key: '', student_name: '', price_list_id: '', plan_label: '',
  price_mxn: '' as string | number, amount_paid_mxn: '' as string | number,
  sessions_paid: '' as string | number, last_payment_on: new Date().toISOString().slice(0, 10),
  attend_weekdays: [] as number[], notes: '',
  season_slug: '',
  program_key: '',
  coupon_id: '',
})
const form = ref(blankForm())
const priceOptions = computed(() => sortPriceRows(priceRows.value.filter(r => r.is_active)))
const couponValidation = ref<{ code: string; discountMxn: number; finalMxn: number } | null>(null)
const validatingCoupon = ref(false)

const selectedPriceRow = computed(() => priceRows.value.find(r => r.id === form.value.price_list_id) ?? null)
const availableCoupons = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return coupons.value.filter(coupon =>
    coupon.is_active
    && (!coupon.starts_on || coupon.starts_on <= today)
    && (!coupon.expires_on || coupon.expires_on >= today)
    && (coupon.max_redemptions == null || coupon.times_redeemed < coupon.max_redemptions)
    && couponCoversScope(coupon, selectedPriceRow.value?.class_kind, selectedPriceRow.value?.coach_tier),
  )
})

watch(() => form.value.price_mxn, value => {
  if (!couponValidation.value) return
  couponValidation.value = null
  form.value.coupon_id = ''
  form.value.amount_paid_mxn = Number(value) || 0
})

type SeasonClass = {
  id: string
  title: string
  start_date: string
  start_time: string | null
  time_slot: string | null
  skill_level: string | null
  season_slug: string | null
  program_series_id: string | null
  min_age: number | null
  max_age: number | null
  audience_category: string | null
  audience_categories: string[] | null
}

const seasonCatalog = ref<ProgramSeason[]>(mergeProgramSeasons())
const seasonClasses = ref<SeasonClass[]>([])
const classesLoading = ref(false)
const selectedClassIds = ref<string[]>([])
const calendarMonth = ref(startOfMonth(new Date()))

const sessionsNeeded = computed(() => Math.max(0, Number(form.value.sessions_paid) || 0))
const selectedSeason = computed(() =>
  seasonCatalog.value.find(s => s.slug === form.value.season_slug) ?? null,
)

const classesInSeason = computed(() => {
  const season = selectedSeason.value
  if (!season) return []
  return seasonClasses.value.filter(row => classBelongsToSeason(row, season))
})

const selectedSkater = computed(() => people.value.find(p => p.key === form.value.person_key) ?? null)

function classMatchesAge(age: number, row: SeasonClass) {
  // The title remains authoritative for older series whose copied age columns
  // were broad or empty.
  const range = row.title.match(/(?:para|ages?)\s*(\d+)\s*[-–]\s*(\d+)/i)
  if (range) return age >= Number(range[1]) && age <= Number(range[2])
  const plus = row.title.match(/(?:para|ages?)\s*(\d+)\s*\+/i)
  if (plus) return age >= Number(plus[1])
  const bounds = sessionAgeBounds(row)
  if (bounds.minAge != null || bounds.maxAge != null) {
    return isAgeEligibleForSession(age, row)
  }
  return true
}

function classMatchesProgram(level: number | null, row: SeasonClass) {
  if (level == null) return true
  const expected = ({
    1: 'beginner_1',
    2: 'beginner_2',
    3: 'intermediate_3',
    4: 'intermediate_4',
    5: 'advanced_5',
  } as Record<number, string>)[level]
  if (expected && row.skill_level && row.skill_level !== expected) return false

  const beginnerTitle = /principiante|beginner/i.test(row.title)
  const intermediateTitle = /intermedio|intermediate/i.test(row.title)
  const advancedTitle = /avanzado|advanced/i.test(row.title)
  if (level <= 2 && (intermediateTitle || advancedTitle)) return false
  if ((level === 3 || level === 4) && (beginnerTitle || advancedTitle)) return false
  if (level >= 5 && (beginnerTitle || intermediateTitle)) return false
  return true
}

const ageMatchedClasses = computed(() => {
  const skater = selectedSkater.value
  const age = skater?.age
  if (age == null) return []
  return classesInSeason.value.filter(row =>
    classMatchesAge(age, row) && classMatchesProgram(skater?.programLevel ?? null, row),
  )
})

function todayKey() {
  return format(new Date(), 'yyyy-MM-dd')
}

const upcomingClasses = computed(() => {
  const today = todayKey()
  return ageMatchedClasses.value.filter(row => row.start_date >= today)
})

const programOptions = computed(() => {
  const groups = new Map<string, { key: string; title: string; count: number; time: string }>()
  for (const row of upcomingClasses.value) {
    const key = row.program_series_id || `single:${row.id}`
    const existing = groups.get(key)
    if (existing) existing.count += 1
    else {
      const short = row.title.includes(': ') ? row.title.slice(row.title.indexOf(': ') + 2) : row.title
      groups.set(key, { key, title: short, count: 1, time: classTimeLabel(row) })
    }
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title))
})

const visibleClasses = computed(() => {
  const key = form.value.program_key
  if (!key) return upcomingClasses.value
  return upcomingClasses.value.filter(row => (row.program_series_id || `single:${row.id}`) === key)
})

const classesByDate = computed(() => {
  const map = new Map<string, SeasonClass[]>()
  for (const row of visibleClasses.value) {
    const list = map.get(row.start_date) || []
    list.push(row)
    map.set(row.start_date, list)
  }
  return map
})

const calendarDays = computed(() => {
  const start = startOfWeek(startOfMonth(calendarMonth.value), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(calendarMonth.value), { weekStartsOn: 1 })
  return eachDayOfInterval({ start, end })
})

const calendarLabel = computed(() =>
  format(calendarMonth.value, 'MMMM yyyy', { locale: es.value ? esLocale : undefined }),
)

function classBelongsToSeason(row: SeasonClass, season: ProgramSeason) {
  if (!row.season_slug || row.season_slug !== season.slug) return false
  return row.start_date >= season.startDate && row.start_date <= season.endDate
}

function classTimeLabel(row: SeasonClass) {
  const slot = row.time_slot as TimeSlot | null
  if (slot && TIME_SLOT_NAMES[slot]) return es.value ? TIME_SLOT_NAMES[slot].es : TIME_SLOT_NAMES[slot].en
  return row.start_time?.slice(0, 5) || ''
}

function isClassSelected(id: string) {
  return selectedClassIds.value.includes(id)
}

function toggleClass(id: string) {
  const season = selectedSeason.value
  const row = seasonClasses.value.find(c => c.id === id)
  if (!season || !row || !classBelongsToSeason(row, season) || row.start_date < todayKey()) {
    formError.value = es.value
      ? 'Esa clase ya pasó o no está en la temporada.'
      : 'That class has already passed, or it is not in the season.'
    return
  }
  formError.value = ''
  if (isClassSelected(id)) {
    selectedClassIds.value = selectedClassIds.value.filter(x => x !== id)
  } else {
    if (sessionsNeeded.value && selectedClassIds.value.length >= sessionsNeeded.value) {
      formError.value = es.value
        ? `Este paquete es de ${sessionsNeeded.value} clases. Quita una para cambiarla.`
        : `This package is ${sessionsNeeded.value} classes. Remove one to swap it.`
      return
    }
    selectedClassIds.value = [...selectedClassIds.value, id]
  }
  syncWeekdaysFromClasses()
}

function syncWeekdaysFromClasses() {
  const days = new Set<number>()
  for (const id of selectedClassIds.value) {
    const row = seasonClasses.value.find(c => c.id === id)
    if (!row) continue
    const [y, m, d] = row.start_date.split('-').map(Number)
    days.add(getDay(new Date(y, m - 1, d)))
  }
  form.value.attend_weekdays = [...days].sort((a, b) => a - b)
}

function assignNextClasses() {
  const needed = sessionsNeeded.value
  if (!needed || !selectedSeason.value) return
  const today = todayKey()
  const pay = form.value.last_payment_on || today
  const from = pay > today ? pay : today
  const upcoming = [...visibleClasses.value]
    .filter(row => row.start_date >= from)
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || (a.start_time || '').localeCompare(b.start_time || ''))
  selectedClassIds.value = upcoming.slice(0, needed).map(row => row.id)
  syncWeekdaysFromClasses()
  if (selectedClassIds.value.length < needed) {
    formError.value = es.value
      ? `Solo hay ${selectedClassIds.value.length} clases en esta temporada para este programa.`
      : `Only ${selectedClassIds.value.length} classes exist in this season for this program.`
  } else {
    formError.value = ''
  }
}

async function loadSeasonClasses(slug: string) {
  seasonClasses.value = []
  selectedClassIds.value = []
  if (!slug) return
  const season = seasonCatalog.value.find(s => s.slug === slug)
  if (!season) return
  classesLoading.value = true
  const seasonStart = startOfMonth(new Date(`${season.startDate}T12:00:00`))
  const seasonEnd = startOfMonth(new Date(`${season.endDate}T12:00:00`))
  const todayMonth = startOfMonth(new Date())
  calendarMonth.value = todayMonth < seasonStart ? seasonStart : todayMonth > seasonEnd ? seasonEnd : todayMonth
  const { data, error: queryError } = await client
    .from('school_calendar_events')
    .select('id, title, start_date, start_time, time_slot, skill_level, season_slug, program_series_id, event_type, min_age, max_age, audience_category, audience_categories')
    .in('event_type', ['class_session', 'class_individual'])
    .eq('season_slug', slug)
    .gte('start_date', season.startDate)
    .lte('start_date', season.endDate)
    .order('start_date', { ascending: true })
  classesLoading.value = false
  if (queryError) {
    formError.value = queryError.message
    return
  }
  seasonClasses.value = ((data || []) as SeasonClass[]).filter(row => classBelongsToSeason(row, season))
}

function shiftCalendar(delta: number) {
  const season = selectedSeason.value
  const next = addMonths(calendarMonth.value, delta)
  if (!season) {
    calendarMonth.value = next
    return
  }
  const monthKey = format(next, 'yyyy-MM')
  const todayMonth = todayKey().slice(0, 7)
  const startKey = season.startDate.slice(0, 7)
  const earliest = todayMonth > startKey ? todayMonth : startKey
  const endKey = season.endDate.slice(0, 7)
  if (monthKey < earliest || monthKey > endKey) return
  calendarMonth.value = next
}

function onSkaterPicked(key: string) {
  form.value.coupon_id = ''
  couponValidation.value = null
  form.value.amount_paid_mxn = Number(form.value.price_mxn) || 0
  const person = people.value.find(p => p.key === key)
  if (person) form.value.student_name = person.name
  if (form.value.program_key && !programOptions.value.some(p => p.key === form.value.program_key)) {
    form.value.program_key = ''
    selectedClassIds.value = []
  }
}

function openPurchaseForm(student?: FinanceStudentSummary) {
  formError.value = ''
  form.value = blankForm()
  couponValidation.value = null
  selectedClassIds.value = []
  seasonClasses.value = []
  if (student) {
    form.value.person_key = student.key
    onSkaterPicked(student.key)
  }
  const season = pickDefaultProgramSeason(seasonCatalog.value)
  showForm.value = true
  if (!season) return
  form.value.season_slug = season.slug
  void loadSeasonClasses(season.slug)
}
function applyPriceRow(id: string) {
  form.value.coupon_id = ''
  couponValidation.value = null
  const row = priceRows.value.find(r => r.id === id)
  if (!row) return
  const price = effectivePriceMxn(row)
  form.value.price_mxn = price
  form.value.amount_paid_mxn = price
  form.value.sessions_paid = row.sessions
  form.value.plan_label = `${row.sessions} ${es.value ? (row.sessions === 1 ? 'clase' : 'clases') : (row.sessions === 1 ? 'class' : 'classes')}`
}

async function applySelectedCoupon() {
  couponValidation.value = null
  const coupon = coupons.value.find(c => c.id === form.value.coupon_id)
  const person = selectedSkater.value
  const priceRow = selectedPriceRow.value
  if (!coupon) {
    form.value.amount_paid_mxn = Number(form.value.price_mxn) || 0
    return
  }
  if (!person || !priceRow) return
  validatingCoupon.value = true
  try {
    const { data: sessionData } = await client.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error(es.value ? 'Sesión inválida.' : 'Invalid session.')
    const response = await $fetch<
      | { valid: true; code: string; discountMxn: number; finalMxn: number }
      | { valid: false; reason: CouponRejection }
    >('/api/coupons/validate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        code: coupon.code,
        subtotalMxn: Number(form.value.price_mxn) || 0,
        classKind: priceRow.class_kind,
        coachTier: priceRow.coach_tier,
        targetUserId: person.userId,
        crewMemberId: person.crewMemberId,
        skaterProfileId: person.skaterProfileId,
        language: language.value,
      },
    })
    if (!response.valid) {
      formError.value = couponRejectionMessage(response.reason, es.value)
      form.value.coupon_id = ''
      return
    }
    couponValidation.value = response
    form.value.amount_paid_mxn = response.finalMxn
    formError.value = ''
  } catch (couponError) {
    formError.value = couponError instanceof Error ? couponError.message : (es.value ? 'No se pudo validar el cupón.' : 'Could not validate coupon.')
    form.value.coupon_id = ''
  } finally {
    validatingCoupon.value = false
  }
}
function toggleFormDay(day: number) {
  form.value.attend_weekdays = form.value.attend_weekdays.includes(day)
    ? form.value.attend_weekdays.filter(d => d !== day)
    : [...form.value.attend_weekdays, day].sort((a, b) => a - b)
}
async function submitPurchase() {
  formError.value = ''
  const person = people.value.find(p => p.key === form.value.person_key)
  if (!person) {
    formError.value = es.value
      ? 'Elige un patinador registrado para asignarle las clases.'
      : 'Choose a registered skater so the classes can be assigned.'
    return
  }
  if (!form.value.student_name.trim()) {
    formError.value = es.value ? 'Escribe el nombre del alumno.' : 'Enter the student name.'
    return
  }
  if (form.value.coupon_id && !couponValidation.value) {
    formError.value = es.value ? 'Espera a que termine la validación del cupón.' : 'Wait for coupon validation to finish.'
    return
  }
  const season = selectedSeason.value
  if (!season) {
    formError.value = es.value ? 'Elige la temporada.' : 'Choose the season.'
    return
  }
  const needed = sessionsNeeded.value
  if (!needed) {
    formError.value = es.value ? 'El paquete debe incluir al menos una clase.' : 'The package must include at least one class.'
    return
  }
  const chosen = selectedClassIds.value
    .map(id => seasonClasses.value.find(row => row.id === id))
    .filter((row): row is SeasonClass => Boolean(row))
  if (
    person.age == null
    || chosen.some(row =>
      !classMatchesAge(person.age as number, row)
      || !classMatchesProgram(person.programLevel, row),
    )
  ) {
    formError.value = es.value
      ? 'Elige un programa que corresponda a la edad y nivel del patinador.'
      : 'Choose a program that matches the skater’s age and level.'
    return
  }
  if (chosen.length !== needed || chosen.some(row => !classBelongsToSeason(row, season) || row.start_date < todayKey())) {
    formError.value = es.value
      ? `Asigna exactamente ${needed} clases que existan en ${season.name.es}.`
      : `Assign exactly ${needed} classes that exist in ${season.name.en}.`
    return
  }

  const priceRow = priceRows.value.find(r => r.id === form.value.price_list_id)
  const [kind, id] = form.value.person_key.split(':')
  const result = await addEnrollment({
    skater_id: kind === 'profile' ? id : null,
    crew_member_id: kind === 'crew' ? id : null,
    student_name: form.value.student_name.trim(),
    price_list_id: priceRow?.id ?? null,
    coach_tier: priceRow?.coach_tier ?? null,
    class_kind: priceRow?.class_kind ?? null,
    plan_label: form.value.plan_label || null,
    price_mxn: Number(form.value.price_mxn) || 0,
    packages_paid: 1,
    amount_paid_mxn: Number(form.value.amount_paid_mxn) || 0,
    sessions_paid: needed,
    last_payment_on: form.value.last_payment_on || null,
    season_slug: season.slug,
    attend_weekdays: form.value.attend_weekdays,
    attended: 0, absences: 0, notes: form.value.notes || null, is_active: true,
  })
  if (!result.ok || !result.id) {
    formError.value = result.message || (es.value ? 'No se pudo guardar.' : 'Could not save.')
    return
  }

  const rows = chosen.map(row => ({
    calendar_event_id: row.id,
    user_id: person.userId,
    crew_member_id: person.crewMemberId,
    skater_profile_id: person.skaterProfileId,
    status: 'confirmed',
  }))
  const { data: bookingRows, error: enrollError } = await client
    .from('class_session_enrollments')
    .insert(rows)
    .select('id')
  if (enrollError) {
    await deleteEnrollment(result.id)
    formError.value = es.value
      ? `No se pudieron asignar las clases de la temporada: ${enrollError.message}`
      : `Could not assign the season classes: ${enrollError.message}`
    return
  }

  if (couponValidation.value) {
    const { data: sessionData } = await client.auth.getSession()
    const token = sessionData.session?.access_token
    let redemption: { redeemed: boolean; reason?: CouponRejection }
    try {
      redemption = token
        ? await $fetch<{ redeemed: boolean; reason?: CouponRejection }>('/api/coupons/redeem', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: {
              code: couponValidation.value.code,
              subtotalMxn: Number(form.value.price_mxn) || 0,
              classKind: priceRow?.class_kind ?? null,
              coachTier: priceRow?.coach_tier ?? null,
              targetUserId: person.userId,
              crewMemberId: person.crewMemberId,
              skaterProfileId: person.skaterProfileId,
              context: 'admin_enrollment',
              language: language.value,
            },
          })
        : { redeemed: false, reason: 'needs_login' }
    } catch {
      redemption = { redeemed: false, reason: 'server_error' }
    }
    if (!redemption.redeemed) {
      const bookingIds = (bookingRows || []).map(row => row.id)
      if (bookingIds.length) await client.from('class_session_enrollments').delete().in('id', bookingIds)
      await deleteEnrollment(result.id)
      formError.value = couponRejectionMessage(redemption.reason || 'server_error', es.value)
      return
    }
  }

  await loadFutureBookings()
  selectedClassIds.value = []
  seasonClasses.value = []
  form.value = blankForm()
  couponValidation.value = null
  showForm.value = false
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <MemberFinanceHeader :subtitle="es ? `Alumnos · ${stats.students}` : `Students · ${stats.students}`">
      <template #actions>
        <button type="button" :disabled="!filtered.length" class="px-3 py-2 rounded-xl border border-gray-700 text-gray-200 text-xs font-bold disabled:opacity-40" @click="exportCsv">⬇ CSV</button>
        <button type="button" class="px-3 py-2 rounded-xl bg-gold-400 text-black text-xs font-bold" @click="openPurchaseForm()">+ {{ es ? 'Registrar compra' : 'Record purchase' }}</button>
      </template>
    </MemberFinanceHeader>

    <main class="px-4 py-4 max-w-[1400px] mx-auto space-y-4">
      <p v-if="error" class="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{{ error }}</p>
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <div v-for="item in [
          [es ? 'Alumnos' : 'Students', stats.students],
          [es ? 'Clases pagadas' : 'Classes paid', stats.paid],
          [es ? 'Clases restantes' : 'Classes left', stats.remaining],
          [es ? 'Clases activas' : 'Active classes', stats.booked],
          [es ? 'Cobrado' : 'Collected', formatMoneyMxn(stats.collected)],
        ]" :key="String(item[0])" class="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{{ item[0] }}</p>
          <p class="text-xl font-bold text-white tabular-nums">{{ item[1] }}</p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 items-center">
        <input v-model="search" :placeholder="es ? 'Buscar alumno…' : 'Search student…'" class="flex-1 min-w-[12rem] px-3 py-2 rounded-xl bg-gray-900 border border-gray-800 text-white text-sm" />
        <select v-model="filter" class="px-3 py-2 rounded-xl bg-gray-900 border border-gray-800 text-gray-300 text-xs">
          <option value="all">{{ es ? 'Todos' : 'All' }}</option>
          <option value="with_classes">{{ es ? 'Con clases' : 'With classes' }}</option>
          <option value="out">{{ es ? 'Sin clases' : 'Out of classes' }}</option>
          <option value="booked">{{ es ? 'Con próximas reservas' : 'Future bookings' }}</option>
          <option value="overdue">{{ es ? 'Pago atrasado' : 'Payment overdue' }}</option>
        </select>
        <label class="flex items-center gap-2 text-xs text-gray-400"><input v-model="showInactive" type="checkbox" />{{ es ? 'Ver inactivos' : 'Show inactive' }}</label>
        <span v-if="loading" class="text-xs text-gray-500">{{ es ? 'Cargando…' : 'Loading…' }}</span>
      </div>

      <div class="overflow-x-auto rounded-2xl border border-gray-800">
        <div class="hidden lg:grid lg:min-w-[1250px] grid-cols-[2fr_1fr_1.4fr_70px_repeat(5,1fr)_36px] gap-3 px-4 py-2 bg-gray-900 text-[10px] uppercase font-bold text-gray-500">
          <span>{{ es ? 'Alumno' : 'Student' }}</span><span>{{ es ? 'Grupo de edad' : 'Age group' }}</span><span>{{ es ? 'Programa asignado' : 'Assigned program' }}</span><span>{{ es ? 'Agregar' : 'Add' }}</span><span>{{ es ? 'Pagadas' : 'Paid' }}</span><span>{{ es ? 'Restantes' : 'Left' }}</span><span>{{ es ? 'Activas' : 'Active' }}</span><span>{{ es ? 'Asistió / faltó' : 'Attended / absent' }}</span><span>{{ es ? 'Último pago' : 'Last payment' }}</span><span />
        </div>
        <div v-if="!filtered.length" class="p-10 text-center text-sm text-gray-500">{{ es ? 'No hay alumnos con este filtro.' : 'No students match this filter.' }}</div>
        <article v-for="student in filtered" :key="student.key" class="lg:min-w-[1250px] border-t border-gray-800 first:border-t-0">
          <div class="w-full grid grid-cols-2 lg:grid-cols-[2fr_1fr_1.4fr_70px_repeat(5,1fr)_36px] gap-3 items-center px-4 py-4 text-left hover:bg-gray-900/60">
            <button type="button" class="col-span-2 lg:col-span-1 font-bold text-white text-left" @click="expanded = expanded === student.key ? null : student.key">{{ student.studentName }}</button>
            <span class="text-xs text-gray-300"><small class="lg:hidden text-gray-500 block">{{ es ? 'Grupo de edad' : 'Age group' }}</small>{{ ageGroupFor(student.key) }}</span>
            <span class="text-xs text-gray-300"><small class="lg:hidden text-gray-500 block">{{ es ? 'Programa asignado' : 'Assigned program' }}</small>{{ programFor(student.key) }}</span>
            <button type="button" class="h-9 w-9 rounded-full bg-gold-400 text-black text-xl font-black justify-self-start lg:justify-self-center" :aria-label="es ? `Agregar clases a ${student.studentName}` : `Add classes for ${student.studentName}`" @click="openPurchaseForm(student)">+</button>
            <span class="text-sm text-gray-300"><small class="lg:hidden text-gray-500 block">{{ es ? 'Pagadas' : 'Paid' }}</small>{{ student.sessionsPaid }}</span>
            <span class="text-sm font-bold" :class="student.remaining <= 0 ? 'text-red-300' : student.remaining <= 2 ? 'text-amber-300' : 'text-green-300'"><small class="lg:hidden text-gray-500 block">{{ es ? 'Restantes' : 'Left' }}</small>{{ student.remaining }}</span>
            <span class="text-sm text-cyan-300"><small class="lg:hidden text-gray-500 block">{{ es ? 'Activas' : 'Active' }}</small>{{ student.futureBookedClasses }}</span>
            <span class="text-sm text-gray-300"><small class="lg:hidden text-gray-500 block">{{ es ? 'Asistió / faltó' : 'Attended / absent' }}</small>{{ student.attended }} / {{ student.absences }}</span>
            <span class="text-sm text-gray-400"><small class="lg:hidden text-gray-500 block">{{ es ? 'Último pago' : 'Last payment' }}</small>{{ formatDateEs(student.lastPaymentOn) }}</span>
            <button type="button" class="hidden lg:block text-gray-500" @click="expanded = expanded === student.key ? null : student.key">{{ expanded === student.key ? '⌃' : '⌄' }}</button>
          </div>
          <div v-if="expanded === student.key" class="grid lg:grid-cols-2 gap-4 p-4 bg-gray-950 border-t border-gray-800">
            <div class="min-w-0">
              <h3 class="text-xs uppercase font-bold text-gray-400 mb-2">{{ es ? 'Próximas clases' : 'Upcoming classes' }}</h3>
              <div class="max-h-[5.75rem] overflow-y-auto pr-1">
                <div v-if="upcomingFor(student.key).length" class="grid grid-cols-2 gap-2">
                  <article
                    v-for="(cls, index) in upcomingFor(student.key)"
                    :key="`${cls.startDate}-${index}`"
                    class="rounded-xl border border-gray-800 bg-gray-900 px-2.5 py-2 min-w-0"
                  >
                    <p class="truncate text-xs font-semibold text-white">{{ cls.title }}</p>
                    <p class="text-[11px] text-cyan-300">{{ formatDateEs(cls.startDate) }}<span v-if="cls.startTime"> · {{ cls.startTime.slice(0, 5) }}</span></p>
                  </article>
                </div>
                <p v-else class="text-xs text-gray-500">{{ es ? 'Sin clases próximas.' : 'No upcoming classes.' }}</p>
              </div>
            </div>
            <div class="min-w-0">
              <h3 class="text-xs uppercase font-bold text-gray-400 mb-2">{{ es ? 'Historial de compras' : 'Purchase history' }}</h3>
              <div class="max-h-64 overflow-y-auto space-y-2 pr-1">
                <div v-for="row in student.enrollments" :key="row.id" class="rounded-xl border border-gray-800 bg-gray-900 p-3">
                  <div class="flex justify-between gap-3">
                    <div><p class="text-sm font-semibold text-white">{{ row.plan_label || (es ? 'Paquete' : 'Package') }}</p><p class="text-[11px] text-gray-500">{{ formatDateEs(row.last_payment_on) }} · {{ weekdaysLabel(row.attend_weekdays) }}</p></div>
                    <p class="text-sm font-bold text-gold-300">{{ formatMoneyMxn(row.amount_paid_mxn) }}</p>
                  </div>
                  <p class="mt-2 text-xs text-gray-400">{{ row.sessions_paid }} {{ es ? 'pagadas' : 'paid' }} · {{ remainingSessions(row) }} {{ es ? 'restantes' : 'left' }}</p>
                  <div class="mt-2 flex gap-2">
                    <button type="button" class="text-[11px] px-2 py-1 rounded bg-gray-800 text-gray-300" @click="toggleActive(row)">{{ row.is_active ? (es ? 'Archivar' : 'Archive') : (es ? 'Reactivar' : 'Reactivate') }}</button>
                    <button type="button" class="text-[11px] px-2 py-1 rounded bg-red-500/10 text-red-300" @click="removePurchase(row)">{{ es ? 'Eliminar' : 'Delete' }}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </article>
      </div>
      <p class="text-[11px] text-gray-600">{{ es ? 'Una falta consume una clase. Las clases activas son reservas confirmadas con fecha futura.' : 'An absence consumes one class. Active classes are confirmed future bookings.' }}</p>
    </main>

    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div class="absolute inset-0 bg-black/80" @click="showForm = false" />
        <div class="relative bg-gray-900 border border-gray-800 w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col">
          <header class="px-5 py-4 border-b border-gray-800 flex justify-between"><h3 class="text-lg font-bold text-white">{{ es ? 'Registrar compra' : 'Record purchase' }}</h3><button type="button" class="text-gray-400" @click="showForm = false">✕</button></header>
          <form class="p-5 space-y-3 overflow-y-auto" @submit.prevent="submitPurchase">
            <label class="block text-xs text-gray-400">{{ es ? 'Patinador registrado' : 'Registered skater' }} *<select v-model="form.person_key" required class="mt-1 w-full input-finance" @change="onSkaterPicked(form.person_key)"><option value="">{{ es ? '— Elige patinador —' : '— Choose skater —' }}</option><option v-for="p in people" :key="p.key" :value="p.key">{{ p.name }}</option></select></label>
            <label class="block text-xs text-gray-400">{{ es ? 'Alumno' : 'Student' }} *<input v-model="form.student_name" required class="mt-1 w-full input-finance" /></label>
            <label class="block text-xs text-gray-400">{{ es ? 'Paquete' : 'Package' }}<select v-model="form.price_list_id" class="mt-1 w-full input-finance" @change="applyPriceRow(form.price_list_id)"><option value="">—</option><optgroup v-for="tier in FINANCE_COACH_TIERS" :key="tier.id" :label="es ? tier.es : tier.en"><option v-for="row in priceOptions.filter(r => r.coach_tier === tier.id)" :key="row.id" :value="row.id">{{ row.label_es }} — {{ formatMoneyMxn(effectivePriceMxn(row)) }}</option></optgroup></select></label>
            <label class="block text-xs text-gray-400">{{ es ? 'Cupón (opcional)' : 'Coupon (optional)' }}
              <select v-model="form.coupon_id" class="mt-1 w-full input-finance" :disabled="!selectedSkater || !selectedPriceRow || validatingCoupon" @change="applySelectedCoupon">
                <option value="">{{ es ? '— Sin cupón —' : '— No coupon —' }}</option>
                <option v-for="coupon in availableCoupons" :key="coupon.id" :value="coupon.id">
                  {{ coupon.code }} · {{ couponLabel(coupon, es) }} · {{ couponDiscountSummary(coupon, es) }}
                </option>
              </select>
            </label>
            <p v-if="couponValidation" class="text-xs text-emerald-300">
              {{ es ? 'Cupón aplicado' : 'Coupon applied' }}: −{{ formatMoneyMxn(couponValidation.discountMxn) }} ·
              {{ es ? 'total' : 'total' }} {{ formatMoneyMxn(couponValidation.finalMxn) }}
            </p>
            <div class="grid grid-cols-2 gap-3"><label class="text-xs text-gray-400">{{ es ? 'Tipo' : 'Type' }}<input v-model="form.plan_label" class="mt-1 w-full input-finance" /></label><label class="text-xs text-gray-400">{{ es ? 'Fecha de pago' : 'Payment date' }}<input v-model="form.last_payment_on" type="date" class="mt-1 w-full input-finance" /></label></div>
            <div class="grid grid-cols-3 gap-3"><label class="text-xs text-gray-400">{{ es ? 'Precio' : 'Price' }}<input v-model="form.price_mxn" type="number" min="0" class="mt-1 w-full input-finance" /></label><label class="text-xs text-gray-400">{{ es ? 'Total pagado' : 'Total paid' }}<input v-model="form.amount_paid_mxn" type="number" min="0" :readonly="Boolean(couponValidation)" class="mt-1 w-full input-finance read-only:opacity-70" /></label><label class="text-xs text-gray-400">{{ es ? 'Clases' : 'Classes' }}<input v-model="form.sessions_paid" type="number" min="1" class="mt-1 w-full input-finance" /></label></div>

            <div class="rounded-2xl border border-gray-800 bg-gray-950/60 p-3 space-y-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-bold text-white">{{ es ? 'Clases de la temporada' : 'Season classes' }} *</p>
                  <p class="text-[11px] text-gray-500">{{ es ? 'Solo puedes asignar clases que ya existen en una temporada.' : 'You can only assign classes that already exist in a season.' }}</p>
                </div>
                <p class="text-sm font-bold tabular-nums" :class="selectedClassIds.length === sessionsNeeded && sessionsNeeded > 0 ? 'text-emerald-300' : 'text-amber-300'">
                  {{ selectedClassIds.length }}/{{ sessionsNeeded }}
                </p>
              </div>
              <div class="grid sm:grid-cols-2 gap-3">
                <label class="block text-xs text-gray-400">{{ es ? 'Temporada' : 'Season' }} *
                  <select v-model="form.season_slug" required class="mt-1 w-full input-finance" @change="form.program_key = ''; loadSeasonClasses(form.season_slug)">
                    <option value="">{{ es ? '— Elige temporada —' : '— Choose season —' }}</option>
                    <option v-for="season in seasonCatalog" :key="season.slug" :value="season.slug">
                      {{ es ? season.name.es : season.name.en }} · {{ season.startDate }} – {{ season.endDate }}
                    </option>
                  </select>
                </label>
                <label class="block text-xs text-gray-400">{{ es ? 'Programa' : 'Program' }}
                  <select v-model="form.program_key" class="mt-1 w-full input-finance" :disabled="!upcomingClasses.length">
                    <option value="">{{ es ? 'Programas de su edad y nivel' : 'Programs for their age and level' }}</option>
                    <option v-for="program in programOptions" :key="program.key" :value="program.key">{{ program.title }} · {{ program.time }} · {{ program.count }}</option>
                  </select>
                </label>
              </div>
              <button type="button" class="text-xs font-bold text-cyan-300 disabled:opacity-40" :disabled="!selectedSeason || !sessionsNeeded || !visibleClasses.length" @click="assignNextClasses">
                {{ es ? 'Asignar las próximas clases del programa' : 'Assign the next classes in this program' }}
              </button>
              <p v-if="classesLoading" class="text-xs text-gray-500">{{ es ? 'Cargando clases…' : 'Loading classes…' }}</p>
              <p v-else-if="selectedSeason && form.person_key && selectedSkater?.age == null" class="text-xs text-amber-300">
                {{ es ? 'Este patinador no tiene edad. Agrégala para ver solo sus programas.' : 'This skater has no age. Add it to see only their programs.' }}
              </p>
              <p v-else-if="selectedSeason && !form.person_key" class="text-xs text-gray-500">
                {{ es ? 'Elige al patinador para ver los programas de su edad.' : 'Choose the skater to see programs for their age.' }}
              </p>
              <p v-else-if="selectedSeason && !ageMatchedClasses.length" class="text-xs text-amber-300">
                {{ es ? 'No hay programas de esta temporada para la edad y nivel del patinador.' : 'No programs in this season match the skater’s age and level.' }}
              </p>
              <p v-else-if="selectedSeason && !upcomingClasses.length" class="text-xs text-amber-300">
                {{ es ? 'No quedan clases por venir en esta temporada. Las fechas que ya pasaron no se asignan.' : 'No upcoming classes left in this season. Dates that already passed are not assigned.' }}
              </p>
              <div v-else-if="selectedSeason">
                <div class="flex items-center justify-between mb-2">
                  <button type="button" class="px-2 py-1 text-xs text-gray-300" @click="shiftCalendar(-1)">‹</button>
                  <p class="text-xs font-bold uppercase tracking-wide text-gray-300">{{ calendarLabel }}</p>
                  <button type="button" class="px-2 py-1 text-xs text-gray-300" @click="shiftCalendar(1)">›</button>
                </div>
                <div class="grid grid-cols-7 gap-1 text-[10px] text-center text-gray-500 mb-1">
                  <span v-for="(label, index) in (es ? ['L','M','M','J','V','S','D'] : ['M','T','W','T','F','S','S'])" :key="index">{{ label }}</span>
                </div>
                <div class="grid grid-cols-7 gap-1">
                  <div
                    v-for="day in calendarDays"
                    :key="format(day, 'yyyy-MM-dd')"
                    class="min-h-[4.5rem] rounded-lg border p-1"
                    :class="isSameMonth(day, calendarMonth) ? 'border-gray-800 bg-gray-900' : 'border-transparent opacity-40'"
                  >
                    <p class="text-[10px] text-gray-500">{{ format(day, 'd') }}</p>
                    <button
                      v-for="row in classesByDate.get(format(day, 'yyyy-MM-dd')) || []"
                      :key="row.id"
                      type="button"
                      class="mt-1 w-full truncate rounded px-1 py-0.5 text-left text-[9px] font-semibold"
                      :class="isClassSelected(row.id) ? 'bg-gold-400 text-black' : 'bg-cyan-500/20 text-cyan-100'"
                      :title="row.title"
                      @click="toggleClass(row.id)"
                    >
                      {{ classTimeLabel(row) }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div><p class="text-xs text-gray-400 mb-2">{{ es ? 'Días habituales' : 'Usual days' }}</p><div class="flex gap-1"><button v-for="day in ATTEND_WEEKDAYS" :key="day.value" type="button" class="flex-1 h-10 rounded-lg border text-xs font-bold" :class="form.attend_weekdays.includes(day.value) ? 'border-cyan-500 bg-cyan-500/20 text-white' : 'border-gray-700 text-gray-500'" @click="toggleFormDay(day.value)">{{ day.initial }}</button></div></div>
            <label class="block text-xs text-gray-400">{{ es ? 'Notas' : 'Notes' }}<textarea v-model="form.notes" rows="2" class="mt-1 w-full input-finance" /></label>
            <p v-if="formError" class="text-xs text-red-300">{{ formError }}</p>
            <div class="flex gap-3"><button type="button" class="flex-1 py-3 bg-gray-800 text-white rounded-xl" @click="showForm = false">{{ es ? 'Cancelar' : 'Cancel' }}</button><button type="submit" :disabled="saving || selectedClassIds.length !== sessionsNeeded || !sessionsNeeded" class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50">{{ saving ? '…' : (es ? 'Guardar' : 'Save') }}</button></div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.input-finance { @apply px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm; }
</style>
