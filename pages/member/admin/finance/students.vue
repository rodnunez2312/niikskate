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
import { disciplineFromJoin, isTrainingDiscipline, skillLevelWithDiscipline, type TrainingDiscipline } from '~/utils/trainingDisciplines'
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
  buildCsv,
  PAYMENT_METHODS,
  type FinanceAttendanceMark,
  type FinanceAttendanceStatus,
  type FinanceEnrollmentRow,
  type FinanceStudentSummary,
} from '~/utils/finance'
import { CLASS_TOKENS, TOKEN_KINDS, emptyTokenCounts, tokenBalanceStatus, tokenLabel, type TokenBalanceStatus, type TokenKind } from '~/utils/classTokens'

definePageMeta({ middleware: ['auth', 'member'], layout: 'member' })

const client = useSupabaseClient()
const { language } = useI18n()
const es = computed(() => language.value === 'es')
const { selected: selectedSport, matchesSport } = useEnabledSports()
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
  sports: TrainingDiscipline[]
}

type UpcomingClass = {
  id: string
  title: string
  startDate: string
  startTime: string | null
}

const people = ref<PurchasePerson[]>([])
const futureBookings = ref<Record<string, number>>({})
const upcomingByStudent = ref<Record<string, UpcomingClass[]>>({})
const search = ref('')
const filter = ref<'all' | 'healthy' | 'low' | 'zero' | 'inactive' | 'pending'>('all')
const mobileFilters = [
  { id: 'all', es: 'Todos', en: 'All students' },
  { id: 'low', es: 'Saldo bajo', en: 'Low balance' },
  { id: 'zero', es: 'Sin tokens', en: 'No tokens' },
  { id: 'inactive', es: 'Inactivos', en: 'Inactive' },
] as const satisfies ReadonlyArray<{ id: typeof filter.value; es: string; en: string }>
const programFilter = ref('all')
const ageFilter = ref('all')
const sortBy = ref<'name' | 'remaining' | 'attendance'>('name')
const showInactive = ref(false)
const selectedKeys = ref<string[]>([])
const drawerKey = ref<string | null>(null)
const drawerTab = ref<'tokens' | 'attendance' | 'profile'>('tokens')
const periodFrom = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10))
const periodTo = ref(new Date().toISOString().slice(0, 10))
const purchaseKey = ref('')
const purchaseNotice = ref('')

async function loadFutureBookings() {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error: queryError } = await client
    .from('class_session_enrollments')
    .select('user_id, crew_member_id, skater_profile_id, school_calendar_events!inner(id, title, start_date, start_time)')
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
    school_calendar_events: { id: string; title: string; start_date: string; start_time: string | null } | Array<{ id: string; title: string; start_date: string; start_time: string | null }>
  }>) {
    const key = row.skater_profile_id
      ? `profile:${row.skater_profile_id}`
      : row.crew_member_id ? `crew:${row.crew_member_id}` : `profile:${row.user_id}`
    const event = Array.isArray(row.school_calendar_events) ? row.school_calendar_events[0] : row.school_calendar_events
    if (!event) continue
    counts[key] = (counts[key] ?? 0) + 1
    ;(upcoming[key] ||= []).push({
      id: event.id,
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

function sportsOf(row: { sports?: string[] | null }): TrainingDiscipline[] {
  const list = (row.sports || []).filter(isTrainingDiscipline)
  return list.length ? list : ['skateboarding']
}

function personInSport(key: string) {
  const person = people.value.find(row => row.key === key)
  if (!person || !isTrainingDiscipline(selectedSport.value)) return false
  return person.sports.includes(selectedSport.value)
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
    loadWallet(),
    loadTransactions(),
  ])
  await loadAttendanceMarks(enrollments.value.map(r => r.id))
  let [{ data: profileRows, error: profileError }, { data: crewRows, error: crewError }, { data: seasonRows }] = await Promise.all([
    client.from('profiles').select('id, full_name, guardian_user_id, date_of_birth, age, skill_group_id, sports').eq('role', 'customer').order('full_name'),
    client.from('crew_members').select('id, first_name, last_name, guardian_user_id, date_of_birth, age, sports').order('first_name'),
    client.from('program_seasons').select('slug, name_es, name_en, start_date, end_date, status, icon'),
  ])
  if (profileError && /sports/i.test(profileError.message)) {
    const fallback = await client.from('profiles').select('id, full_name, guardian_user_id, date_of_birth, age, skill_group_id').eq('role', 'customer').order('full_name')
    profileRows = fallback.data
  }
  if (crewError && /sports/i.test(crewError.message)) {
    const fallback = await client.from('crew_members').select('id, first_name, last_name, guardian_user_id, date_of_birth, age').order('first_name')
    crewRows = fallback.data
  }
  const skillGroupsJoined = await client.from('skill_groups').select('id, name, training_programs(discipline)')
  const skillGroups = skillGroupsJoined.error
    ? (await client.from('skill_groups').select('id, name')).data
    : skillGroupsJoined.data
  const levelByGroup = new Map(
    ((skillGroups || []) as Array<{ id: string; name: string }>).map(group => [
      group.id,
      Number(group.name.match(/Level\s+(\d+)/i)?.[1]) || null,
    ]),
  )
  const nameByGroup = new Map(
    ((skillGroups || []) as Array<{ id: string; name: string; training_programs?: { discipline?: string | null } | { discipline?: string | null }[] | null }>).map(group => [
      group.id,
      skillLevelWithDiscipline(group.name, disciplineFromJoin(group), language.value === 'es'),
    ]),
  )
  people.value = [
    ...((profileRows || []) as Array<{ id: string; full_name: string; guardian_user_id: string | null; date_of_birth: string | null; age: number | null; skill_group_id: string | null; sports?: string[] | null }>).map(p => ({
      key: `profile:${p.id}`,
      name: p.full_name || '—',
      kind: 'profile' as const,
      userId: p.guardian_user_id || p.id,
      skaterProfileId: p.guardian_user_id ? p.id : null,
      crewMemberId: null,
      age: computeAgeFromDob(p.date_of_birth, p.age),
      programLevel: p.skill_group_id ? levelByGroup.get(p.skill_group_id) ?? null : null,
      programName: p.skill_group_id ? nameByGroup.get(p.skill_group_id) ?? null : null,
      sports: sportsOf(p),
    })),
    ...((crewRows || []) as Array<{ id: string; first_name: string; last_name: string; guardian_user_id: string; date_of_birth: string | null; age: number | null; sports?: string[] | null }>).map(c => ({
      key: `crew:${c.id}`,
      name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() || '—',
      kind: 'crew' as const,
      userId: c.guardian_user_id,
      skaterProfileId: null,
      crewMemberId: c.id,
      age: computeAgeFromDob(c.date_of_birth, c.age),
      programLevel: null,
      programName: null,
      sports: sportsOf(c),
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

type WalletToken = {
  id: string
  skater_id: string | null
  crew_member_id: string | null
  kind: TokenKind
  status: string
  source: string | null
  spent_at: string | null
  created_at: string | null
  finance_enrollment_id: string | null
}
const walletTokens = ref<WalletToken[]>([])
const tokensReady = ref(false)
const tokenHint = ref('')

function tokenOwnerKey(row: { skater_id: string | null; crew_member_id: string | null }) {
  if (row.skater_id) return `profile:${row.skater_id}`
  if (row.crew_member_id) return `crew:${row.crew_member_id}`
  return ''
}

function countsFor(key: string) {
  const counts = emptyTokenCounts()
  for (const token of walletTokens.value) {
    if (tokenOwnerKey(token) !== key || !TOKEN_KINDS.includes(token.kind)) continue
    if (token.status === 'available') counts[token.kind].available += 1
    if (token.status === 'owed') counts[token.kind].owed += 1
  }
  return counts
}

function packageTokensLeft(enrollmentId: string) {
  return walletTokens.value.filter(token => token.finance_enrollment_id === enrollmentId && token.status === 'available').length
}

async function loadWallet() {
  const { data, error: queryError } = await client
    .from('skater_tokens')
    .select('id, skater_id, crew_member_id, kind, status, source, spent_at, created_at, finance_enrollment_id')
    .limit(5000)
  if (queryError) {
    tokensReady.value = false
    walletTokens.value = []
    tokenHint.value = /skater_tokens|schema cache|does not exist/i.test(queryError.message)
      ? (es.value
        ? 'Falta la tabla de tokens. Corre add_skater_tokens.sql en el editor SQL de Supabase.'
        : 'The token table is missing. Run add_skater_tokens.sql in the Supabase SQL editor.')
      : queryError.message
    return
  }
  walletTokens.value = (data || []) as WalletToken[]
  tokensReady.value = true
  tokenHint.value = ''
}

const summaries = computed(() => {
  const counted = showInactive.value ? enrollments.value : enrollments.value.filter(r => r.is_active)
  return aggregateStudents(counted, futureBookings.value).map(student => {
    const wallet = countsFor(student.key)
    const classesLeft = tokensReady.value
      ? TOKEN_KINDS.reduce((sum, kind) => sum + wallet[kind].available, 0)
      : student.remaining
    const owned = walletTokens.value.filter(token => tokenOwnerKey(token) === student.key)
    const purchased = tokensReady.value
      ? owned.filter(token => token.source === 'payment' && token.status !== 'void').length
      : student.sessionsPaid
    const consumed = tokensReady.value
      ? owned.filter(token => token.status === 'spent').length
      : student.attended
    const lastAttendance = owned
      .map(token => token.spent_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop()?.slice(0, 10) || null
    const active = student.enrollments.some(row => row.is_active)
    return {
      ...student,
      wallet,
      classesLeft,
      purchased,
      consumed,
      lastAttendance,
      balanceStatus: tokenBalanceStatus(classesLeft, active) as TokenBalanceStatus,
      active,
      // Archived purchases stay visible as history without inflating current totals.
      enrollments: enrollments.value
        .filter(row => enrollmentStudentKey(row) === student.key)
        .sort((a, b) => (b.last_payment_on ?? '').localeCompare(a.last_payment_on ?? '')),
    }
  })
})
type TokenTx = {
  id: string
  skater_id: string | null
  crew_member_id: string | null
  kind: TokenKind
  tx_type: string
  quantity: number
  amount_mxn: number | null
  payment_method: string | null
  payment_status: string
  reason: string | null
  created_at: string
  coupon_code: string | null
}
const tokenTransactions = ref<TokenTx[]>([])

async function loadTransactions() {
  const { data, error: queryError } = await client
    .from('skater_token_transactions')
    .select('id, skater_id, crew_member_id, kind, tx_type, quantity, amount_mxn, payment_method, payment_status, reason, created_at, coupon_code')
    .order('created_at', { ascending: false })
    .limit(500)
  if (queryError) {
    tokenTransactions.value = []
    if (/skater_token_transactions|schema cache|does not exist/i.test(queryError.message)) {
      tokenHint.value = es.value
        ? 'Falta el historial de tokens. Corre add_token_transactions.sql en el editor SQL de Supabase.'
        : 'The token history table is missing. Run add_token_transactions.sql in the Supabase SQL editor.'
    }
    return
  }
  tokenTransactions.value = (data || []) as TokenTx[]
}

const pendingKeys = computed(() => {
  const keys = new Set<string>()
  for (const tx of tokenTransactions.value) {
    if (tx.payment_status !== 'pending' && tx.payment_status !== 'failed') continue
    const key = tokenOwnerKey(tx)
    if (key) keys.add(key)
  }
  return keys
})

const filtered = computed(() => {
  const q = search.value.trim().toLocaleLowerCase()
  const rows = summaries.value.filter(s => {
    if (!personInSport(s.key)) return false
    if (q && !s.studentName.toLocaleLowerCase().includes(q)) return false
    if (programFilter.value !== 'all' && programFor(s.key) !== programFilter.value) return false
    if (ageFilter.value !== 'all' && ageGroupFor(s.key) !== ageFilter.value) return false
    if (filter.value === 'healthy' && s.balanceStatus !== 'healthy') return false
    if (filter.value === 'low' && s.balanceStatus !== 'low') return false
    if (filter.value === 'zero' && s.balanceStatus !== 'zero') return false
    if (filter.value === 'inactive' && s.balanceStatus !== 'inactive') return false
    if (filter.value === 'pending' && !pendingKeys.value.has(s.key)) return false
    return true
  })
  return [...rows].sort((a, b) => {
    if (sortBy.value === 'remaining') return a.classesLeft - b.classesLeft || a.studentName.localeCompare(b.studentName)
    if (sortBy.value === 'attendance') return (a.lastAttendance || '').localeCompare(b.lastAttendance || '') || a.studentName.localeCompare(b.studentName)
    return a.studentName.localeCompare(b.studentName)
  })
})
const periodConsumed = computed(() => walletTokens.value.filter(token => {
  if (token.status !== 'spent' || !token.spent_at) return false
  const owner = tokenOwnerKey(token)
  if (!owner || !personInSport(owner)) return false
  const day = token.spent_at.slice(0, 10)
  return day >= periodFrom.value && day <= periodTo.value
}).length)
const periodRevenue = computed(() => enrollments.value.reduce((sum, row) => {
  if (!personInSport(enrollmentStudentKey(row))) return sum
  const day = row.last_payment_on || ''
  if (!day || day < periodFrom.value || day > periodTo.value) return sum
  return sum + Number(row.amount_paid_mxn || 0)
}, 0))
const kpis = computed(() => ({
  students: filtered.value.length,
  available: filtered.value.reduce((n, s) => n + s.classesLeft, 0),
  low: filtered.value.filter(s => s.balanceStatus === 'low').length,
  zero: filtered.value.filter(s => s.balanceStatus === 'zero').length,
  consumed: periodConsumed.value,
  revenue: periodRevenue.value,
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
  await loadWallet()
}
function exportCsv() {
  const rows = selectedKeys.value.length
    ? filtered.value.filter(student => selectedKeys.value.includes(student.key))
    : filtered.value
  downloadCsv(enrollmentsCsvName(), buildCsv(
    ['Alumno', 'Programa', 'Grupo', 'Disponibles', 'Comprados', 'Consumidos', 'Ultima asistencia', 'Estado'],
    rows.map(student => [
      student.studentName,
      programFor(student.key),
      ageGroupFor(student.key),
      student.classesLeft,
      student.purchased,
      student.consumed,
      student.lastAttendance || '',
      student.balanceStatus,
    ]),
  ))
}

const programChoices = computed(() => [...new Set(summaries.value.map(student => programFor(student.key)).filter(name => name && name !== '—'))].sort())
const ageChoices = computed(() => [...new Set(summaries.value.map(student => ageGroupFor(student.key)).filter(name => name && name !== '—'))].sort())
const drawerStudent = computed(() => summaries.value.find(student => student.key === drawerKey.value) || null)

function statusStyle(status: TokenBalanceStatus) {
  if (status === 'healthy') return { color: '#171717', background: '#C9EF42' }
  if (status === 'low') return { color: '#171717', background: '#F59E0B' }
  if (status === 'zero') return { color: '#FFFFFF', background: '#DC2626' }
  return { color: '#A3A3A3', background: '#262626', border: '1px solid #404040' }
}
function statusText(status: TokenBalanceStatus) {
  const labels = {
    healthy: ['Saludable', 'Healthy'],
    low: ['Bajo', 'Low'],
    zero: ['Sin tokens', 'No tokens'],
    inactive: ['Inactivo', 'Inactive'],
  } as const
  return es.value ? labels[status][0] : labels[status][1]
}
function toggleKey(key: string) {
  selectedKeys.value = selectedKeys.value.includes(key)
    ? selectedKeys.value.filter(item => item !== key)
    : [...selectedKeys.value, key]
}
function txsFor(key: string) {
  return tokenTransactions.value.filter(tx => tokenOwnerKey(tx) === key)
}

type PurchaseBatch = {
  at: string
  hasTime: boolean
  quantity: number
  kind: string | null
  amount: number | null
}

function purchaseBatches(student: FinanceStudentSummary): PurchaseBatch[] {
  const purchases = txsFor(student.key)
    .filter(tx => tx.tx_type === 'purchase' && tx.quantity > 0 && tx.payment_status === 'paid')
    .map(tx => ({
      at: tx.created_at,
      hasTime: true,
      quantity: tx.quantity,
      kind: tx.kind,
      amount: tx.amount_mxn,
    }))
  if (purchases.length) return purchases.sort((a, b) => b.at.localeCompare(a.at))

  const groups = new Map<string, PurchaseBatch>()
  for (const token of walletTokens.value) {
    if (tokenOwnerKey(token) !== student.key || token.source !== 'payment' || token.status === 'void') continue
    const enrollment = token.finance_enrollment_id
      ? student.enrollments.find(row => row.id === token.finance_enrollment_id)
      : undefined
    const at = enrollment?.last_payment_on || token.created_at || ''
    if (!at) continue
    const bucket = token.finance_enrollment_id || at.slice(0, 16)
    const current = groups.get(bucket)
    if (current) current.quantity += 1
    else groups.set(bucket, {
      at,
      hasTime: !enrollment?.last_payment_on && Boolean(token.created_at),
      quantity: 1,
      kind: token.kind,
      amount: enrollment ? Number(enrollment.amount_paid_mxn || 0) : null,
    })
  }
  if (groups.size) return [...groups.values()].sort((a, b) => b.at.localeCompare(a.at))

  return student.enrollments
    .filter(row => (row.last_payment_on || row.created_at) && Number(row.sessions_paid || 0) > 0)
    .map(row => ({
      at: row.last_payment_on || row.created_at || '',
      hasTime: !row.last_payment_on && Boolean(row.created_at),
      quantity: Number(row.sessions_paid || 0),
      kind: row.plan_label,
      amount: Number(row.amount_paid_mxn || 0),
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
}

function formatWhen(at: string, hasTime: boolean) {
  if (!hasTime) return formatDateEs(at)
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return formatDateEs(at)
  return new Intl.DateTimeFormat(es.value ? 'es-MX' : 'en-GB', {
    timeZone: 'America/Merida',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function txTypeLabel(type: string) {
  const labels: Record<string, [string, string]> = {
    purchase: ['Compra', 'Purchase'],
    deduction: ['Uso', 'Used'],
    refund: ['Devolución', 'Refund'],
    adjustment: ['Ajuste', 'Adjustment'],
  }
  const pair = labels[type]
  return pair ? (es.value ? pair[0] : pair[1]) : type
}

function barColor(status: TokenBalanceStatus) {
  if (status === 'low') return '#F59E0B'
  if (status === 'zero') return '#DC2626'
  if (status === 'inactive') return '#525252'
  return '#C9EF42'
}

function usedShare(student: { consumed: number; purchased: number }) {
  if (!student.purchased) return 0
  return Math.min(100, Math.round((student.consumed / student.purchased) * 100))
}
async function archiveSelected() {
  const chosen = filtered.value.filter(student => selectedKeys.value.includes(student.key))
  for (const student of chosen) {
    for (const row of student.enrollments.filter(item => item.is_active)) {
      await updateEnrollment(row.id, { is_active: false })
    }
  }
  selectedKeys.value = []
}
async function markClassAttendance(studentKey: string, eventId: string, status: 'present' | 'absent' | 'excused' | 'cancelled', override = false) {
  const person = personFor(studentKey)
  if (!person) return
  const { data: sessionData } = await client.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return
  const skaterId = person.skaterProfileId || person.crewMemberId || person.userId
  const result = await $fetch<{ needsOverride?: boolean; charged?: string | null; tokenKind?: TokenKind | null }>('/api/staff/class-attendance', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { eventId, skaterId, kind: person.crewMemberId ? 'crew' : 'profile', status, override },
  })
  if (result.needsOverride && !override) {
    const ok = window.confirm(es.value
      ? 'No hay token de ese color. ¿Registrar la clase como deuda?'
      : 'No token of that color is available. Record the class as owed?')
    if (!ok) return
    await markClassAttendance(studentKey, eventId, status, true)
    return
  }
  await Promise.all([loadWallet(), loadTransactions()])
  purchaseNotice.value = result.charged === 'short'
    ? ''
    : (es.value ? 'Asistencia guardada.' : 'Attendance saved.')
}

const showForm = ref(false)
const formError = ref('')
const formTier = ref<(typeof FINANCE_COACH_TIERS)[number]['id']>('principiante')
const packageCustom = ref(false)
const discountMxn = ref(0)
const historyOpen = ref(false)
const blankForm = () => ({
  person_key: '', student_name: '', price_list_id: '', plan_label: '',
  price_mxn: '' as string | number, amount_paid_mxn: '' as string | number,
  sessions_paid: '' as string | number, last_payment_on: new Date().toISOString().slice(0, 10),
  attend_weekdays: [] as number[], notes: '',
  season_slug: '',
  program_key: '',
  coupon_id: '',
  payment_status: 'paid' as 'paid' | 'pending' | 'failed',
  payment_method: 'cash',
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
  discipline?: string | null
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
    .select('id, title, start_date, start_time, time_slot, skill_level, season_slug, program_series_id, event_type, discipline, min_age, max_age, audience_category, audience_categories')
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
  seasonClasses.value = ((data || []) as SeasonClass[]).filter(row => matchesSport(row) && classBelongsToSeason(row, season))
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

const tierPackages = computed(() => priceOptions.value.filter(row => row.coach_tier === formTier.value))
const purchaseStudent = computed(() => summaries.value.find(student => student.key === form.value.person_key) || null)
const currentTokens = computed(() => purchaseStudent.value?.classesLeft ?? 0)
const summarySubtotal = computed(() => Math.max(0, Number(form.value.price_mxn) || 0))
const summaryDiscount = computed(() => {
  if (couponValidation.value) return Math.max(0, couponValidation.value.discountMxn)
  return Math.min(summarySubtotal.value, Math.max(0, Number(discountMxn.value) || 0))
})
const summaryTotal = computed(() => Math.max(0, summarySubtotal.value - summaryDiscount.value))
const balanceAfter = computed(() => currentTokens.value + (form.value.payment_status === 'paid' ? sessionsNeeded.value : 0))
const purchaseIssues = computed(() => {
  const issues: string[] = []
  if (!form.value.person_key) issues.push(es.value ? 'Elige un alumno.' : 'Choose a student.')
  if (!sessionsNeeded.value) issues.push(es.value ? 'Elige un paquete con al menos 1 token.' : 'Choose a package with at least 1 token.')
  if (Number(discountMxn.value) > summarySubtotal.value) issues.push(es.value ? 'El descuento no puede ser mayor al precio.' : 'The discount cannot be higher than the price.')
  if (form.value.payment_status === 'paid' && selectedClassIds.value.length !== sessionsNeeded.value) {
    issues.push(es.value ? `Asigna ${sessionsNeeded.value} clases de la temporada.` : `Assign ${sessionsNeeded.value} season classes.`)
  }
  return issues
})

function syncDiscount() {
  if (couponValidation.value) {
    discountMxn.value = couponValidation.value.discountMxn
    form.value.amount_paid_mxn = couponValidation.value.finalMxn
    return
  }
  form.value.amount_paid_mxn = summaryTotal.value
}

function selectPackage(id: string) {
  packageCustom.value = false
  form.value.price_list_id = id
  discountMxn.value = 0
  applyPriceRow(id)
}

function selectCustomPackage() {
  packageCustom.value = true
  form.value.price_list_id = ''
  form.value.coupon_id = ''
  couponValidation.value = null
  discountMxn.value = 0
  form.value.plan_label = es.value ? 'Personalizado' : 'Custom'
  if (!Number(form.value.sessions_paid)) form.value.sessions_paid = 1
  syncDiscount()
}

function openPurchaseForm(student?: FinanceStudentSummary) {
  formError.value = ''
  form.value = blankForm()
  purchaseKey.value = crypto.randomUUID()
  couponValidation.value = null
  packageCustom.value = false
  discountMxn.value = 0
  historyOpen.value = false
  formTier.value = 'principiante'
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
    syncDiscount()
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
    discountMxn.value = response.discountMxn
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
  syncDiscount()
  if (purchaseIssues.value.length) {
    formError.value = purchaseIssues.value[0]
    return
  }
  if (form.value.coupon_id && !couponValidation.value) {
    formError.value = es.value ? 'Espera a que termine la validación del cupón.' : 'Wait for coupon validation to finish.'
    return
  }
  const paidNow = form.value.payment_status === 'paid'
  const season = selectedSeason.value
  if (paidNow && !season) {
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
  if (paidNow && (
    person.age == null
    || chosen.some(row =>
      !classMatchesAge(person.age as number, row)
      || !classMatchesProgram(person.programLevel, row),
    )
  )) {
    formError.value = es.value
      ? 'Elige un programa que corresponda a la edad y nivel del patinador.'
      : 'Choose a program that matches the skater’s age and level.'
    return
  }
  if (paidNow && season && (chosen.length !== needed || chosen.some(row => !classBelongsToSeason(row, season) || row.start_date < todayKey()))) {
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
    amount_paid_mxn: paidNow ? (Number(form.value.amount_paid_mxn) || 0) : 0,
    sessions_paid: needed,
    last_payment_on: form.value.last_payment_on || null,
    season_slug: season?.slug || null,
    attend_weekdays: form.value.attend_weekdays,
    attended: 0, absences: 0, notes: form.value.notes || null, is_active: true,
  })
  if (!result.ok || !result.id) {
    formError.value = result.message || (es.value ? 'No se pudo guardar.' : 'Could not save.')
    return
  }

  const { data: sessionData } = await client.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) {
    await deleteEnrollment(result.id)
    formError.value = es.value ? 'Sesión expirada.' : 'Session expired.'
    return
  }
  try {
    await $fetch('/api/staff/class-token-purchase', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        enrollmentId: result.id,
        paymentStatus: form.value.payment_status,
        idempotencyKey: purchaseKey.value,
        amountMxn: Number(form.value.amount_paid_mxn) || Number(form.value.price_mxn) || 0,
        paymentMethod: form.value.payment_method,
        couponCode: couponValidation.value?.code || null,
      },
    })
  } catch (purchaseError: any) {
    await deleteEnrollment(result.id)
    formError.value = purchaseError?.data?.message || purchaseError?.message || (es.value ? 'No se acreditaron los tokens.' : 'Tokens were not credited.')
    return
  }
  if (!paidNow) {
    purchaseNotice.value = form.value.payment_status === 'failed'
      ? (es.value ? 'El pago falló. No se acreditaron tokens.' : 'Payment failed. No tokens were credited.')
      : (es.value ? 'Pago pendiente. Los tokens se acreditan cuando el pago se confirme.' : 'Payment is pending. Tokens are credited when it is confirmed.')
    await Promise.all([loadWallet(), loadTransactions()])
    showForm.value = false
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
  await Promise.all([loadWallet(), loadTransactions()])
  selectedClassIds.value = []
  seasonClasses.value = []
  form.value = blankForm()
  couponValidation.value = null
  showForm.value = false
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <MemberFinanceHeader :subtitle="es ? `Alumnos · ${kpis.students}` : `Students · ${kpis.students}`">
      <template #actions>
        <button type="button" :disabled="!selectedKeys.length" class="px-3 py-2 rounded-xl border border-gray-700 text-gray-200 text-xs font-bold disabled:opacity-40" @click="archiveSelected">{{ es ? 'Archivar' : 'Archive' }}</button>
        <button type="button" :disabled="!filtered.length" class="px-3 py-2 rounded-xl border border-gray-700 text-gray-200 text-xs font-bold disabled:opacity-40" @click="exportCsv">CSV</button>
        <button type="button" class="px-3 py-2 rounded-xl bg-acid text-charcoal text-xs font-bold" @click="openPurchaseForm()">+ {{ es ? 'Agregar tokens' : 'Add tokens' }}</button>
      </template>
    </MemberFinanceHeader>

    <main class="px-4 py-4 max-w-[1400px] mx-auto space-y-4">
      <div class="grid grid-cols-2 lg:grid-cols-6 gap-2">
        <button type="button" class="rounded-2xl border border-white/10 bg-[#141414] p-3 text-left" @click="filter = 'all'">
          <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{{ es ? 'Alumnos' : 'Students' }}</p>
          <p class="text-xl font-bold text-white tabular-nums">{{ kpis.students }}</p>
        </button>
        <button type="button" class="rounded-2xl border border-white/10 bg-[#141414] p-3 text-left" @click="filter = 'all'">
          <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{{ es ? 'Tokens disponibles' : 'Available tokens' }}</p>
          <p class="text-xl font-bold tabular-nums" style="color:#C9EF42">{{ kpis.available }}</p>
        </button>
        <button type="button" class="rounded-2xl border border-white/10 bg-[#141414] p-3 text-left" @click="filter = 'low'">
          <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{{ es ? 'Saldo bajo' : 'Low balance' }}</p>
          <p class="text-xl font-bold tabular-nums" style="color:#F59E0B">{{ kpis.low }}</p>
        </button>
        <button type="button" class="rounded-2xl border border-white/10 bg-[#141414] p-3 text-left" @click="filter = 'zero'">
          <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{{ es ? 'Sin tokens' : 'Zero tokens' }}</p>
          <p class="text-xl font-bold tabular-nums" style="color:#F87171">{{ kpis.zero }}</p>
        </button>
        <div class="rounded-2xl border border-white/10 bg-[#141414] p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{{ es ? 'Consumidos' : 'Consumed' }}</p>
          <p class="text-xl font-bold text-white tabular-nums">{{ kpis.consumed }}</p>
        </div>
        <div class="rounded-2xl border border-white/10 bg-[#141414] p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{{ es ? 'Cobrado' : 'Collected' }}</p>
          <p class="text-xl font-bold text-white tabular-nums">{{ formatMoneyMxn(kpis.revenue) }}</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 items-center">
        <label class="text-[10px] uppercase text-gray-500 font-bold">{{ es ? 'Periodo' : 'Period' }}
          <input v-model="periodFrom" type="date" class="mt-1 block px-2 py-1.5 rounded-lg bg-[#141414] border border-white/10 text-white text-xs" />
        </label>
        <label class="text-[10px] uppercase text-gray-500 font-bold">{{ es ? 'Hasta' : 'To' }}
          <input v-model="periodTo" type="date" class="mt-1 block px-2 py-1.5 rounded-lg bg-[#141414] border border-white/10 text-white text-xs" />
        </label>
      </div>
      <p v-if="purchaseNotice" class="text-xs rounded-lg border border-white/10 bg-[#141414] text-gray-200 p-3">{{ purchaseNotice }}</p>
      <p v-if="tokenTransactions.some(tx => tx.payment_status === 'pending' || tx.payment_status === 'failed')" class="text-xs rounded-lg border border-white/10 bg-[#141414] text-gray-300 p-3">
        {{ es ? 'Hay pagos pendientes o fallidos. Un saldo en cero no significa pago atrasado.' : 'Some payments are pending or failed. A zero balance is not an overdue payment.' }}
      </p>

      <p v-if="error" class="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{{ error }}</p>
      <p v-if="tokenHint" class="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">{{ tokenHint }}</p>
      <div class="flex flex-wrap gap-2 items-center">
        <input v-model="search" :placeholder="es ? 'Buscar alumno…' : 'Search student…'" class="flex-1 min-w-[12rem] px-3 py-2 rounded-xl bg-[#141414] border border-white/10 text-white text-sm" />
        <select v-model="filter" class="hidden lg:block px-3 py-2 rounded-xl bg-[#141414] border border-white/10 text-gray-300 text-xs">
          <option value="all">{{ es ? 'Todos' : 'All' }}</option>
          <option value="healthy">{{ es ? 'Saldo saludable' : 'Healthy balance' }}</option>
          <option value="low">{{ es ? 'Saldo bajo' : 'Low balance' }}</option>
          <option value="zero">{{ es ? 'Sin tokens' : 'Zero tokens' }}</option>
          <option value="inactive">{{ es ? 'Inactivos' : 'Inactive' }}</option>
          <option value="pending">{{ es ? 'Pago pendiente o fallido' : 'Pending or failed payment' }}</option>
        </select>
        <select v-model="programFilter" class="px-3 py-2 rounded-xl bg-[#141414] border border-white/10 text-gray-300 text-xs">
          <option value="all">{{ es ? 'Programa' : 'Program' }}</option>
          <option v-for="name in programChoices" :key="name" :value="name">{{ name }}</option>
        </select>
        <select v-model="ageFilter" class="px-3 py-2 rounded-xl bg-[#141414] border border-white/10 text-gray-300 text-xs">
          <option value="all">{{ es ? 'Grupo' : 'Group' }}</option>
          <option v-for="name in ageChoices" :key="name" :value="name">{{ name }}</option>
        </select>
        <select v-model="sortBy" class="px-3 py-2 rounded-xl bg-[#141414] border border-white/10 text-gray-300 text-xs">
          <option value="name">{{ es ? 'Nombre' : 'Name' }}</option>
          <option value="remaining">{{ es ? 'Tokens restantes' : 'Tokens left' }}</option>
          <option value="attendance">{{ es ? 'Última asistencia' : 'Last attendance' }}</option>
        </select>
        <label class="flex items-center gap-2 text-xs text-gray-400"><input v-model="showInactive" type="checkbox" />{{ es ? 'Ver inactivos' : 'Show inactive' }}</label>
        <span v-if="loading" class="text-xs text-gray-500">{{ es ? 'Cargando…' : 'Loading…' }}</span>
      </div>

      <div class="lg:hidden flex gap-2 overflow-x-auto pb-1">
        <button v-for="chip in mobileFilters" :key="chip.id" type="button" class="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold" :class="filter === chip.id ? 'bg-acid text-charcoal' : 'bg-[#1c1c1c] text-gray-300'" @click="filter = chip.id">
          {{ es ? chip.es : chip.en }}
        </button>
      </div>

      <div class="lg:hidden space-y-3">
        <p v-if="!filtered.length" class="rounded-2xl border border-white/10 bg-[#101010] p-10 text-center text-sm text-gray-500">{{ loading ? (es ? 'Cargando…' : 'Loading…') : (es ? 'No hay alumnos con este filtro.' : 'No students match this filter.') }}</p>
        <article v-for="student in filtered" :key="`card-${student.key}`" class="rounded-2xl border border-white/10 bg-[#141414] p-4">
          <div class="flex items-start gap-3">
            <input type="checkbox" class="mt-3" :checked="selectedKeys.includes(student.key)" @change="toggleKey(student.key)" />
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#262626] text-sm font-bold text-white">{{ student.studentName.trim().charAt(0).toUpperCase() }}</span>
            <button type="button" class="min-w-0 flex-1 text-left" @click="drawerKey = student.key; drawerTab = 'tokens'">
              <span class="block truncate text-sm font-bold text-white">{{ student.studentName }}</span>
              <span class="block truncate text-xs text-gray-400">{{ programFor(student.key) }} · {{ ageGroupFor(student.key) }}</span>
            </button>
            <div class="text-right">
              <p class="text-2xl font-bold tabular-nums leading-none" :style="{ color: barColor(student.balanceStatus) }">{{ student.classesLeft }}</p>
              <p class="mt-1 text-[10px] uppercase tracking-wide text-gray-500">{{ es ? 'tokens' : 'tokens left' }}</p>
            </div>
          </div>
          <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-[#2a2a2a]">
            <div class="h-full rounded-full" :style="{ width: `${usedShare(student)}%`, background: barColor(student.balanceStatus) }" />
          </div>
          <div class="mt-2 flex items-center justify-between gap-2">
            <p class="text-[11px] text-gray-400">
              {{ student.consumed }} {{ es ? 'usados' : 'used' }} · {{ student.purchased }} {{ es ? 'comprados' : 'purchased' }}
            </p>
            <span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold" :style="statusStyle(student.balanceStatus)">{{ statusText(student.balanceStatus) }}</span>
          </div>
          <div class="mt-3 flex justify-end gap-2">
            <button type="button" class="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-gray-200" @click="drawerKey = student.key; drawerTab = 'tokens'">{{ es ? 'Ver historial' : 'View history' }}</button>
            <button type="button" class="rounded-full bg-acid px-3 py-1.5 text-xs font-bold text-charcoal" @click="openPurchaseForm(student)">+ {{ es ? 'Tokens' : 'Add tokens' }}</button>
          </div>
        </article>
      </div>

      <div class="hidden lg:block overflow-x-auto rounded-2xl border border-white/10 bg-[#101010]">
        <div class="grid min-w-[1100px] grid-cols-[28px_1.6fr_1.3fr_1.2fr_0.7fr_0.7fr_0.9fr_0.8fr_auto] gap-3 px-3 py-2 text-[10px] uppercase font-bold text-gray-500">
          <span />
          <span>{{ es ? 'Alumno' : 'Student' }}</span>
          <span>{{ es ? 'Programa' : 'Program' }}</span>
          <span>{{ es ? 'Disponibles' : 'Available' }}</span>
          <span>{{ es ? 'Comprados' : 'Purchased' }}</span>
          <span>{{ es ? 'Consumidos' : 'Consumed' }}</span>
          <span>{{ es ? 'Última asistencia' : 'Last attendance' }}</span>
          <span>{{ es ? 'Estado' : 'Status' }}</span>
          <span />
        </div>
        <div v-if="!filtered.length" class="p-10 text-center text-sm text-gray-500">{{ loading ? (es ? 'Cargando…' : 'Loading…') : (es ? 'No hay alumnos con este filtro.' : 'No students match this filter.') }}</div>
        <article
          v-for="student in filtered"
          :key="student.key"
          class="min-w-[1100px] border-t border-white/10"
        >
          <div class="grid w-full grid-cols-[28px_1.6fr_1.3fr_1.2fr_0.7fr_0.7fr_0.9fr_0.8fr_auto] items-center gap-2 px-3 py-2">
            <input type="checkbox" class="justify-self-center" :checked="selectedKeys.includes(student.key)" @change="toggleKey(student.key)" />
            <button type="button" class="col-span-1 text-left" @click="drawerKey = student.key; drawerTab = 'tokens'">
              <span class="block text-sm font-bold text-white">{{ student.studentName }}</span>
            </button>
            <span class="text-xs text-gray-300">{{ programFor(student.key) }} · {{ ageGroupFor(student.key) }}</span>
            <div>
              <p class="text-sm font-bold text-white tabular-nums">{{ student.classesLeft }}</p>
              <div v-if="tokensReady" class="mt-1 flex flex-wrap gap-1">
                <span v-for="token in CLASS_TOKENS" :key="`${student.key}-${token.id}`" class="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none" :style="{ background: token.color, color: '#171717' }">{{ student.wallet[token.id].available }}</span>
                <span v-for="token in CLASS_TOKENS.filter(item => student.wallet[item.id].owed > 0)" :key="`${student.key}-${token.id}-owed`" class="inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none" :style="{ color: token.color, border: `1px solid ${token.color}` }">{{ student.wallet[token.id].owed }}</span>
              </div>
            </div>
            <span class="text-sm text-gray-200 tabular-nums">
              {{ student.purchased }}
              <span v-if="purchaseBatches(student)[0]" class="mt-0.5 block text-[10px] font-normal text-gray-500">{{ formatWhen(purchaseBatches(student)[0].at, purchaseBatches(student)[0].hasTime) }}</span>
            </span>
            <span class="text-sm text-gray-200 tabular-nums">{{ student.consumed }}</span>
            <span class="text-xs text-gray-400">{{ student.lastAttendance ? formatDateEs(student.lastAttendance) : '—' }}</span>
            <span class="inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-bold" :style="statusStyle(student.balanceStatus)">{{ statusText(student.balanceStatus) }}</span>
            <button type="button" class="h-7 rounded-full bg-acid px-2 text-[11px] font-black text-charcoal" @click="openPurchaseForm(student)">+</button>
          </div>
        </article>
      </div>
      <p class="text-[11px] text-gray-500">{{ es ? 'Presente y falta usan 1 token del color de la clase. Un saldo en cero no es un pago atrasado.' : 'Present and absent use 1 token of that class color. A zero balance is not an overdue payment.' }}</p>
    </main>

    <Teleport to="body">
      <div v-if="drawerStudent" class="fixed inset-0 z-40 flex justify-end">
        <button type="button" class="absolute inset-0 bg-black/60" @click="drawerKey = null" />
        <aside class="relative h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#101010] p-5 text-white">
          <header class="flex items-start justify-between gap-3">
            <div>
              <h2 class="text-lg font-bold">{{ drawerStudent.studentName }}</h2>
              <p class="text-xs text-gray-400">{{ programFor(drawerStudent.key) }} · {{ ageGroupFor(drawerStudent.key) }}</p>
            </div>
            <button type="button" class="text-gray-400" @click="drawerKey = null">✕</button>
          </header>
          <div class="mt-4 grid grid-cols-3 gap-2 text-center">
            <div class="rounded-xl border border-white/10 p-2"><p class="text-[10px] uppercase text-gray-500">{{ es ? 'Disponibles' : 'Available' }}</p><p class="text-lg font-bold" style="color:#C9EF42">{{ drawerStudent.classesLeft }}</p></div>
            <div class="rounded-xl border border-white/10 p-2"><p class="text-[10px] uppercase text-gray-500">{{ es ? 'Comprados' : 'Purchased' }}</p><p class="text-lg font-bold">{{ drawerStudent.purchased }}</p></div>
            <div class="rounded-xl border border-white/10 p-2"><p class="text-[10px] uppercase text-gray-500">{{ es ? 'Consumidos' : 'Consumed' }}</p><p class="text-lg font-bold">{{ drawerStudent.consumed }}</p></div>
          </div>
          <div class="mt-4 rounded-xl border border-white/10 bg-[#141414] p-3">
            <p class="text-[10px] uppercase tracking-wide text-gray-500 font-bold">{{ es ? 'Última compra' : 'Last purchase' }}</p>
            <template v-if="purchaseBatches(drawerStudent).length">
              <p class="mt-1 text-sm font-bold text-white">
                {{ purchaseBatches(drawerStudent)[0].quantity }} {{ es ? 'tokens' : 'tokens' }}
                · {{ formatWhen(purchaseBatches(drawerStudent)[0].at, purchaseBatches(drawerStudent)[0].hasTime) }}
              </p>
              <p class="mt-1 text-[11px] text-gray-400">
                <span v-if="purchaseBatches(drawerStudent)[0].kind">{{ tokenLabel(purchaseBatches(drawerStudent)[0].kind as TokenKind, es) }}</span>
                <span v-if="purchaseBatches(drawerStudent)[0].amount"> · {{ formatMoneyMxn(purchaseBatches(drawerStudent)[0].amount) }}</span>
              </p>
              <ul v-if="purchaseBatches(drawerStudent).length > 1" class="mt-3 space-y-1 border-t border-white/10 pt-2">
                <li v-for="(batch, index) in purchaseBatches(drawerStudent).slice(1)" :key="`${batch.at}-${index}`" class="flex justify-between gap-3 text-[11px] text-gray-400">
                  <span>{{ batch.quantity }} {{ es ? 'tokens' : 'tokens' }}<span v-if="batch.kind"> · {{ tokenLabel(batch.kind as TokenKind, es) }}</span></span>
                  <span>{{ formatWhen(batch.at, batch.hasTime) }}</span>
                </li>
              </ul>
            </template>
            <p v-else class="mt-1 text-xs text-gray-400">{{ es ? 'Estos tokens no tienen fecha de compra registrada.' : 'These tokens have no recorded purchase date.' }}</p>
          </div>
          <p class="mt-3"><span class="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold" :style="statusStyle(drawerStudent.balanceStatus)">{{ statusText(drawerStudent.balanceStatus) }}</span></p>
          <div class="mt-4 flex gap-2 text-xs">
            <button type="button" class="rounded-full px-3 py-1" :class="drawerTab === 'tokens' ? 'bg-acid text-charcoal' : 'border border-white/10 text-gray-300'" @click="drawerTab = 'tokens'">{{ es ? 'Tokens' : 'Tokens' }}</button>
            <button type="button" class="rounded-full px-3 py-1" :class="drawerTab === 'attendance' ? 'bg-acid text-charcoal' : 'border border-white/10 text-gray-300'" @click="drawerTab = 'attendance'">{{ es ? 'Asistencia' : 'Attendance' }}</button>
            <button type="button" class="rounded-full px-3 py-1" :class="drawerTab === 'profile' ? 'bg-acid text-charcoal' : 'border border-white/10 text-gray-300'" @click="drawerTab = 'profile'">{{ es ? 'Perfil' : 'Profile' }}</button>
          </div>
          <div v-if="drawerTab === 'tokens'" class="mt-4 space-y-2">
            <p v-if="!txsFor(drawerStudent.key).length" class="text-xs text-gray-500">{{ es ? 'Sin movimientos todavía.' : 'No transactions yet.' }}</p>
            <article v-for="tx in txsFor(drawerStudent.key)" :key="tx.id" class="rounded-xl border border-white/10 p-3">
              <div class="flex justify-between gap-2 text-sm">
                <span class="font-bold">{{ txTypeLabel(tx.tx_type) }} · {{ tx.quantity > 0 ? '+' : '' }}{{ tx.quantity }}</span>
                <span class="text-xs text-gray-400">{{ formatDateEs(tx.created_at.slice(0, 10)) }}</span>
              </div>
              <p class="mt-1 text-[11px] text-gray-400">{{ tokenLabel(tx.kind, es) }} · {{ tx.payment_status }}<span v-if="tx.payment_method"> · {{ tx.payment_method }}</span><span v-if="tx.coupon_code"> · {{ tx.coupon_code }}</span></p>
              <p v-if="tx.reason" class="text-[11px] text-gray-500">{{ tx.reason }}</p>
            </article>
          </div>
          <div v-else-if="drawerTab === 'attendance'" class="mt-4 space-y-2">
            <p v-if="!upcomingFor(drawerStudent.key).length" class="text-xs text-gray-500">{{ es ? 'Sin clases próximas.' : 'No upcoming classes.' }}</p>
            <article v-for="cls in upcomingFor(drawerStudent.key)" :key="cls.id" class="rounded-xl border border-white/10 p-3">
              <p class="text-sm font-semibold">{{ cls.title }}</p>
              <p class="text-[11px] text-gray-400">{{ formatDateEs(cls.startDate) }}<span v-if="cls.startTime"> · {{ cls.startTime.slice(0, 5) }}</span></p>
              <div class="mt-2 flex flex-wrap gap-1">
                <button type="button" class="rounded-full bg-acid px-2 py-1 text-[10px] font-bold text-charcoal" @click="markClassAttendance(drawerStudent.key, cls.id, 'present')">{{ es ? 'Presente' : 'Present' }}</button>
                <button type="button" class="rounded-full border border-white/20 px-2 py-1 text-[10px]" @click="markClassAttendance(drawerStudent.key, cls.id, 'absent')">{{ es ? 'Falta' : 'Absent' }}</button>
                <button type="button" class="rounded-full border border-white/20 px-2 py-1 text-[10px]" @click="markClassAttendance(drawerStudent.key, cls.id, 'excused')">{{ es ? 'Justificada' : 'Excused' }}</button>
                <button type="button" class="rounded-full border border-white/20 px-2 py-1 text-[10px]" @click="markClassAttendance(drawerStudent.key, cls.id, 'cancelled')">{{ es ? 'Cancelada' : 'Cancelled' }}</button>
              </div>
            </article>
          </div>
          <div v-else class="mt-4 space-y-3 text-sm">
            <p><span class="text-gray-500">{{ es ? 'Estado' : 'Status' }}</span><br>{{ drawerStudent.active ? (es ? 'Activo' : 'Active') : (es ? 'Inactivo' : 'Inactive') }}</p>
            <p><span class="text-gray-500">{{ es ? 'Tutor' : 'Guardian' }}</span><br>{{ personFor(drawerStudent.key)?.userId || '—' }}</p>
            <div v-for="row in drawerStudent.enrollments" :key="row.id" class="rounded-xl border border-white/10 p-3">
              <p class="font-semibold">{{ row.plan_label || (es ? 'Paquete' : 'Package') }}</p>
              <p class="text-[11px] text-gray-400">{{ formatDateEs(row.last_payment_on) }} · {{ row.sessions_paid }} {{ es ? 'clases' : 'classes' }}</p>
              <p v-if="row.notes" class="mt-1 text-xs text-gray-300">{{ row.notes }}</p>
              <button type="button" class="mt-2 text-[11px] text-gray-300" @click="toggleActive(row)">{{ row.is_active ? (es ? 'Archivar' : 'Archive') : (es ? 'Reactivar' : 'Reactivate') }}</button>
            </div>
          </div>
        </aside>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div class="absolute inset-0 bg-black/80" @click="showForm = false" />
        <div class="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-3xl border border-white/10 bg-[#101010] sm:rounded-3xl">
          <header class="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <h3 class="text-lg font-bold text-white">{{ es ? 'Agregar tokens' : 'Add Tokens' }}</h3>
              <p class="text-xs text-gray-400">{{ es ? 'Acredita clases prepagadas a un alumno.' : 'Credit prepaid classes to a student.' }}</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="rounded-full bg-emerald-900/80 px-2 py-1 text-[10px] font-bold text-emerald-300">NiikSkate Admin</span>
              <button type="button" class="text-gray-400" @click="showForm = false">✕</button>
            </div>
          </header>
          <form class="space-y-5 overflow-y-auto p-5" @submit.prevent="submitPurchase">
            <div class="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#171717] px-3 py-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#262626] text-sm font-bold text-white">{{ (form.student_name || '?').trim().charAt(0).toUpperCase() }}</span>
              <div class="min-w-0 flex-1">
                <select v-model="form.person_key" required class="w-full bg-transparent text-sm font-bold text-white outline-none" @change="onSkaterPicked(form.person_key)">
                  <option value="">{{ es ? 'Elige alumno' : 'Choose student' }}</option>
                  <option v-for="p in people" :key="p.key" :value="p.key">{{ p.name }}</option>
                </select>
                <p class="truncate text-[11px] text-gray-400">{{ purchaseStudent ? `${programFor(purchaseStudent.key)} · ${ageGroupFor(purchaseStudent.key)}` : (es ? 'Skate · paquete' : 'Skate · package') }}</p>
              </div>
              <div class="text-right">
                <p class="text-lg font-bold tabular-nums text-white">{{ currentTokens }}</p>
                <p class="text-[10px] uppercase tracking-wide text-gray-500">{{ es ? 'Tokens actuales' : 'Current tokens' }}</p>
              </div>
            </div>

            <section>
              <p class="text-sm font-bold text-white">1. {{ es ? 'Elige el paquete' : 'Select token package' }}</p>
              <div class="mt-2 flex gap-2 overflow-x-auto">
                <button v-for="tier in FINANCE_COACH_TIERS" :key="tier.id" type="button" class="shrink-0 rounded-full px-3 py-1 text-[11px] font-bold" :class="formTier === tier.id ? 'bg-acid text-charcoal' : 'border border-white/10 text-gray-300'" @click="formTier = tier.id">{{ es ? tier.es : tier.en }}</button>
              </div>
              <div class="mt-3 grid grid-cols-2 gap-2">
                <button
                  v-for="row in tierPackages"
                  :key="row.id"
                  type="button"
                  class="rounded-2xl border px-3 py-3 text-left"
                  :class="form.price_list_id === row.id && !packageCustom ? 'border-acid bg-[#14210a]' : 'border-white/10 bg-[#171717]'"
                  @click="selectPackage(row.id)"
                >
                  <span class="flex items-start justify-between gap-2">
                    <span class="text-sm font-semibold text-white">{{ es ? row.label_es : (row.label_en || row.label_es) }}</span>
                    <span class="mt-0.5 h-4 w-4 shrink-0 rounded-full border" :class="form.price_list_id === row.id && !packageCustom ? 'border-acid bg-acid' : 'border-gray-600'" />
                  </span>
                  <span class="mt-2 block text-base font-bold text-white">{{ formatMoneyMxn(effectivePriceMxn(row)) }}</span>
                  <span class="block text-[11px] text-gray-400">{{ row.sessions }} {{ row.sessions === 1 ? 'token' : 'tokens' }}</span>
                </button>
                <button type="button" class="rounded-2xl border px-3 py-3 text-left" :class="packageCustom ? 'border-acid bg-[#14210a]' : 'border-white/10 bg-[#171717]'" @click="selectCustomPackage">
                  <span class="flex items-start justify-between gap-2">
                    <span class="text-sm font-semibold text-white">{{ es ? 'Cantidad libre' : 'Custom amount' }}</span>
                    <span class="mt-0.5 h-4 w-4 shrink-0 rounded-full border" :class="packageCustom ? 'border-acid bg-acid' : 'border-gray-600'" />
                  </span>
                  <span class="mt-2 block text-base font-bold text-white">{{ es ? 'Flexible' : 'Flexible' }}</span>
                  <span class="block text-[11px] text-gray-400">{{ es ? 'Precio manual' : 'Manual pricing' }}</span>
                </button>
              </div>
              <div v-if="packageCustom" class="mt-3 grid grid-cols-2 gap-2">
                <label class="text-[11px] text-gray-400">{{ es ? 'Tokens' : 'Tokens' }}<input v-model="form.sessions_paid" type="number" min="1" class="mt-1 w-full input-finance" @input="form.plan_label = es ? 'Personalizado' : 'Custom'" /></label>
                <label class="text-[11px] text-gray-400">{{ es ? 'Precio MXN' : 'Price MXN' }}<input v-model="form.price_mxn" type="number" min="0" class="mt-1 w-full input-finance" @input="syncDiscount" /></label>
              </div>
              <p class="mt-2 text-[11px] text-gray-500">{{ es ? 'Los precios salen de Precios. El paquete libre usa el monto que escribas.' : 'Package prices come from Prices. Custom amount uses the price you enter.' }}</p>
            </section>

            <section class="space-y-3">
              <p class="text-sm font-bold text-white">2. {{ es ? 'Pago' : 'Payment details' }}</p>
              <div>
                <p class="text-[11px] text-gray-400">{{ es ? 'Método de pago' : 'Payment method' }}</p>
                <label v-for="method in PAYMENT_METHODS" :key="method.id" class="mt-2 flex items-center gap-2 text-sm text-gray-200">
                  <input v-model="form.payment_method" type="radio" name="pay-method" :value="method.id" class="accent-[#C9EF42]" />
                  <span>{{ method.emoji }} {{ es ? method.es : method.en }}</span>
                </label>
              </div>
              <div>
                <p class="text-[11px] text-gray-400">{{ es ? 'Estado del pago' : 'Payment status' }}</p>
                <div class="mt-2 flex flex-wrap gap-4 text-sm text-gray-200">
                  <label class="flex items-center gap-2"><input v-model="form.payment_status" type="radio" value="paid" class="accent-[#C9EF42]" />{{ es ? 'Pagado' : 'Paid' }}</label>
                  <label class="flex items-center gap-2"><input v-model="form.payment_status" type="radio" value="pending" class="accent-[#C9EF42]" />{{ es ? 'Pendiente' : 'Pending' }}</label>
                  <label class="flex items-center gap-2"><input v-model="form.payment_status" type="radio" value="failed" class="accent-[#C9EF42]" />{{ es ? 'Fallido' : 'Failed' }}</label>
                </div>
                <p class="mt-1 text-[11px] text-gray-500">{{ es ? 'Solo Pagado acredita tokens.' : 'Only Paid credits tokens.' }}</p>
              </div>
              <label class="block text-[11px] text-gray-400">{{ es ? 'Descuento (MXN)' : 'Discount (MXN)' }}
                <input v-model.number="discountMxn" type="number" min="0" :max="summarySubtotal" class="mt-1 w-full input-finance" :readonly="Boolean(couponValidation)" @input="syncDiscount" />
              </label>
              <label class="block text-[11px] text-gray-400">{{ es ? 'Cupón' : 'Coupon' }}
                <select v-model="form.coupon_id" class="mt-1 w-full input-finance" :disabled="packageCustom || !selectedSkater || !selectedPriceRow || validatingCoupon" @change="applySelectedCoupon">
                  <option value="">{{ es ? '— Sin cupón —' : '— No coupon —' }}</option>
                  <option v-for="coupon in availableCoupons" :key="coupon.id" :value="coupon.id">{{ coupon.code }} · {{ couponDiscountSummary(coupon, es) }}</option>
                </select>
              </label>
              <label class="block text-[11px] text-gray-400">{{ es ? 'Fecha de pago' : 'Payment date' }}
                <input v-model="form.last_payment_on" type="date" class="mt-1 w-full input-finance" />
              </label>
              <label class="block text-[11px] text-gray-400">{{ es ? 'Nota interna (opcional)' : 'Internal note (optional)' }}
                <textarea v-model="form.notes" rows="2" class="mt-1 w-full input-finance" :placeholder="es ? 'Notas de pago, promoción o motivo…' : 'Payment notes, promotion, or reason…'" />
              </label>
            </section>

            <section class="rounded-2xl border border-white/10 bg-[#171717] p-4">
              <p class="text-sm font-bold text-white">3. {{ es ? 'Resumen de compra' : 'Purchase summary' }}</p>
              <dl class="mt-3 space-y-2 text-sm">
                <div class="flex justify-between gap-3"><dt class="text-gray-400">{{ es ? 'Paquete' : 'Package' }}</dt><dd class="text-right text-white">{{ form.plan_label || '—' }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-gray-400">Tokens</dt><dd class="text-white">{{ sessionsNeeded || 0 }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-gray-400">{{ es ? 'Subtotal' : 'Subtotal' }}</dt><dd class="text-white">{{ formatMoneyMxn(summarySubtotal) }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-gray-400">{{ es ? 'Descuento' : 'Discount' }}</dt><dd class="text-white">−{{ formatMoneyMxn(summaryDiscount) }}</dd></div>
                <div class="flex justify-between gap-3 border-t border-white/10 pt-2 text-base font-bold"><dt>{{ es ? 'Total' : 'Total' }}</dt><dd style="color:#C9EF42">{{ formatMoneyMxn(summaryTotal) }}</dd></div>
                <div class="flex justify-between gap-3 text-xs"><dt class="text-gray-500">{{ es ? 'Saldo después' : 'Balance after transaction' }}</dt><dd class="font-bold text-white">{{ balanceAfter }} {{ es ? 'tokens' : 'tokens' }}</dd></div>
              </dl>
            </section>

            <div v-if="form.payment_status === 'paid'" class="rounded-2xl border border-white/10 bg-[#0c0c0c] p-3 space-y-3">
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
                      :class="isClassSelected(row.id) ? 'bg-acid text-charcoal' : 'bg-white/10 text-gray-100'"
                      :title="row.title"
                      @click="toggleClass(row.id)"
                    >
                      {{ classTimeLabel(row) }}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div><p class="text-xs text-gray-400 mb-2">{{ es ? 'Días habituales' : 'Usual days' }}</p><div class="flex gap-1"><button v-for="day in ATTEND_WEEKDAYS" :key="day.value" type="button" class="flex-1 h-10 rounded-lg border text-xs font-bold" :class="form.attend_weekdays.includes(day.value) ? 'border-acid bg-acid/20 text-white' : 'border-white/10 text-gray-500'" @click="toggleFormDay(day.value)">{{ day.initial }}</button></div></div>
            <p v-if="formError" class="text-xs text-red-300">{{ formError }}</p>
            <p v-else-if="purchaseIssues.length" class="text-xs text-amber-200">{{ purchaseIssues[0] }}</p>
            <div class="flex gap-2">
              <button type="button" class="rounded-full border border-white/15 px-4 py-3 text-sm font-semibold text-gray-200" @click="historyOpen = !historyOpen">{{ es ? 'Historial' : 'History' }}</button>
              <button type="submit" :disabled="saving || purchaseIssues.length > 0" class="flex-1 rounded-full bg-white py-3 text-sm font-bold text-black disabled:opacity-40">{{ saving ? '…' : (es ? 'Acreditar tokens' : 'Add tokens') }}</button>
            </div>
            <div v-if="historyOpen" class="space-y-2 rounded-2xl border border-white/10 p-3">
              <p class="text-xs font-bold text-white">{{ es ? 'Historial de este alumno' : 'This student’s history' }}</p>
              <p v-if="!form.person_key || !txsFor(form.person_key).length" class="text-[11px] text-gray-500">{{ es ? 'Sin compras registradas todavía.' : 'No recorded purchases yet.' }}</p>
              <article v-for="tx in txsFor(form.person_key).slice(0, 6)" :key="tx.id" class="flex justify-between gap-2 text-[11px] text-gray-300">
                <span>{{ txTypeLabel(tx.tx_type) }} · {{ tx.quantity > 0 ? '+' : '' }}{{ tx.quantity }} {{ tokenLabel(tx.kind, es) }}</span>
                <span class="text-gray-500">{{ formatWhen(tx.created_at, true) }}</span>
              </article>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.input-finance { @apply px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm; }
</style>
