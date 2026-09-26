<script setup lang="ts">
import {
  format,
  addMonths,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  startOfDay,
  isBefore,
  isAfter,
  isSameDay,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { UserRole } from '~/types'
import { daySlotsFullyUnavailable, isClassDay, slotsForDate, slotsForDateStr } from '~/utils/classSchedule'
import {
  buildNiikSkaterEmail,
  DEFAULT_SKATER_PASSWORD,
  niikEmailLocalFromFullName,
} from '~/utils/skaterNiikEmail'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()
const esLang = computed(() => language.value === 'es')

type ProgramRow = { id: string; name: string }

type CoachUi = {
  id: string
  full_name: string
  first_name: string | null
  last_name: string | null
  email: string
  phone: string | null
  role: UserRole
  is_active: boolean
  title: string | null
  bio: string | null
  experience: string | null
  specialties: string[]
  certifications: string[]
  is_head_coach: boolean
  /** Program ids, with the primary one first. */
  program_ids: string[]
  primary_program_id: string | null
  availability: Record<string, boolean>
  accent: (typeof ACCENTS)[number]
}

/** Stable per-coach colour so the same face keeps the same avatar. */
const ACCENTS = [
  { ring: 'ring-flame-600/40', gradient: 'from-flame-600 to-glass-orange', emoji: '🧑‍🏫' },
  { ring: 'ring-glass-blue/40', gradient: 'from-glass-blue to-glass-purple', emoji: '👨‍🏫' },
  { ring: 'ring-glass-green/40', gradient: 'from-glass-green to-glass-blue', emoji: '👩‍🏫' },
  { ring: 'ring-glass-orange/40', gradient: 'from-glass-orange to-flame-600', emoji: '🛹' },
] as const

const isAdmin = ref(false)
const checkingRole = ref(true)
const loadingCoaches = ref(false)
const coaches = ref<CoachUi[]>([])
const programs = ref<ProgramRow[]>([])

const activeCount = computed(() => coaches.value.filter(c => c.is_active).length)
const headCoachCount = computed(() => coaches.value.filter(c => c.is_head_coach).length)
const unassignedCount = computed(() => coaches.value.filter(c => c.program_ids.length === 0).length)

const programNameById = computed(() => {
  const m = new Map<string, string>()
  for (const p of programs.value) m.set(p.id, p.name)
  return m
})

function programNames(coach: CoachUi): string[] {
  return coach.program_ids.map(id => programNameById.value.get(id) || '').filter(Boolean)
}

const adminAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error(esLang.value ? 'Sesión expirada' : 'Session expired')
  return { Authorization: `Bearer ${token}` }
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

const loadPrograms = async () => {
  const { data } = await client
    .from('programs')
    .select('id, name')
    .eq('is_active', true)
    .order('name')
  programs.value = (data || []) as ProgramRow[]
}

const loadCoachesFromDb = async () => {
  loadingCoaches.value = true
  try {
    const data = await fetchCoachDirectoryProfiles<{
      id: string
      full_name: string
      first_name: string | null
      last_name: string | null
      email: string
      phone: string | null
      is_active: boolean
      role: string
      title: string | null
      bio: string | null
      experience: string | null
      specialties: string[] | null
      certifications: string[] | null
      is_head_coach: boolean | null
    }>(client, {
      select:
        'id, full_name, first_name, last_name, email, phone, is_active, role, title, bio, experience, specialties, certifications, is_head_coach',
      activeOnly: false,
    })

    const { data: links } = await client
      .from('program_coaches')
      .select('coach_id, program_id, is_primary')

    const byCoach = new Map<string, { ids: string[]; primary: string | null }>()
    for (const l of links || []) {
      const entry = byCoach.get(l.coach_id) || { ids: [], primary: null }
      entry.ids.push(l.program_id)
      if (l.is_primary) entry.primary = l.program_id
      byCoach.set(l.coach_id, entry)
    }

    coaches.value = data.map((p, i) => {
      const link = byCoach.get(p.id)
      const ids = link?.ids ?? []
      const primary = link?.primary ?? null
      return {
        id: p.id,
        full_name: p.full_name,
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        phone: p.phone,
        role: p.role as UserRole,
        is_active: p.is_active,
        title: p.title,
        bio: p.bio,
        experience: p.experience,
        specialties: p.specialties ?? [],
        certifications: p.certifications ?? [],
        is_head_coach: Boolean(p.is_head_coach),
        program_ids: primary ? [primary, ...ids.filter(id => id !== primary)] : ids,
        primary_program_id: primary,
        availability: {},
        accent: ACCENTS[i % ACCENTS.length],
      }
    })
    await loadMonthOverrides()
  } catch (e) {
    console.error('loadCoachesFromDb:', e)
  } finally {
    loadingCoaches.value = false
  }
}

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/member/admin/scheduling/coaches')
    return
  }
  const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if (data?.role !== 'admin') {
    router.push('/')
    return
  }
  isAdmin.value = true
  checkingRole.value = false
  await Promise.all([loadPrograms(), loadCoachesFromDb()])
})

// ---------------------------------------------------------------------------
// Availability, used by the card counters and the edit drawer
// ---------------------------------------------------------------------------

/** `${coachId}|${yyyy-mm-dd}` → slot → is_available */
const monthOverrideByCoachDate = ref<Map<string, Record<string, boolean>>>(new Map())
const currentDate = ref(new Date())

function coachDateKey(coachId: string, dateStr: string) {
  return `${coachId}|${dateStr}`
}

const toDateKey = (date: Date) => format(date, 'yyyy-MM-dd')

const loadMonthOverrides = async () => {
  const ids = coaches.value.map(c => c.id)
  if (ids.length === 0) {
    monthOverrideByCoachDate.value = new Map()
    return
  }
  const { data, error } = await client
    .from('coach_date_availability')
    .select('coach_id, date, time_slot, is_available')
    .in('coach_id', ids)
    .gte('date', format(startOfMonth(currentDate.value), 'yyyy-MM-dd'))
    .lte('date', format(endOfMonth(addMonths(currentDate.value, 1)), 'yyyy-MM-dd'))

  if (error) {
    console.error('loadMonthOverrides:', error)
    return
  }
  const m = new Map<string, Record<string, boolean>>()
  for (const row of data || []) {
    const k = coachDateKey(row.coach_id as string, row.date as string)
    const cur = m.get(k) || {}
    cur[row.time_slot as string] = row.is_available as boolean
    m.set(k, cur)
  }
  monthOverrideByCoachDate.value = m
}

function isCoachShowingOnDate(coach: CoachUi, date: Date): boolean {
  if (!coach.is_active || !isClassDay(date)) return false
  const o = monthOverrideByCoachDate.value.get(coachDateKey(coach.id, format(date, 'yyyy-MM-dd')))
  return !daySlotsFullyUnavailable(o, slotsForDate(date))
}

/** Class days this coach is on, out of the class days left this month. */
function availabilitySummary(coach: CoachUi): { on: number; total: number } {
  const days = eachDayOfInterval({
    start: startOfMonth(currentDate.value),
    end: endOfMonth(currentDate.value),
  }).filter(isClassDay)
  return {
    on: days.filter(d => isCoachShowingOnDate(coach, d)).length,
    total: days.length,
  }
}

const weekDays = computed(() =>
  esLang.value ? ['D', 'L', 'M', 'M', 'J', 'V', 'S'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
)

/** Sun-start column indices for class days (Mon, Tue, Thu, Sat). */
const CLASS_WEEKDAY_HEADER_INDICES = [1, 2, 4, 6]

function buildMonthCells(monthStart: Date): (Date | null)[] {
  const start = startOfMonth(monthStart)
  const days = eachDayOfInterval({ start, end: endOfMonth(monthStart) })
  return [...(Array(getDay(start)).fill(null) as null[]), ...days]
}

// ---------------------------------------------------------------------------
// Edit drawer
// ---------------------------------------------------------------------------

const editOpen = ref(false)
const editing = ref<CoachUi | null>(null)
const editTab = ref<'details' | 'availability'>('details')
const savingCoach = ref(false)
const editError = ref('')

type EditForm = {
  first_name: string
  last_name: string
  email: string
  phone: string
  title: string
  is_head_coach: boolean
  bio: string
  experience: string
  specialties: string[]
  certifications: string[]
  program_ids: string[]
  primary_program_id: string | null
}

const form = ref<EditForm>({
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  title: '',
  is_head_coach: false,
  bio: '',
  experience: '',
  specialties: [],
  certifications: [],
  program_ids: [],
  primary_program_id: null,
})

const specialtyDraft = ref('')
const certificationDraft = ref('')

/** Availability snapshot when the drawer opened, so save only writes real edits. */
const availabilitySnapshot = ref<Record<string, boolean>>({})
const availabilityToday = ref<Date | null>(null)

const modalFirstMonthStart = computed(() =>
  startOfMonth(availabilityToday.value ?? new Date()),
)
const modalSecondMonthStart = computed(() => addMonths(modalFirstMonthStart.value, 1))
const modalEditableEnd = computed(() =>
  endOfMonth(addMonths(startOfDay(availabilityToday.value ?? new Date()), 1)),
)
const modalMonthOneCells = computed(() => buildMonthCells(modalFirstMonthStart.value))
const modalMonthTwoCells = computed(() => buildMonthCells(modalSecondMonthStart.value))

const editableModalClassDays = computed(() => {
  if (!availabilityToday.value) return [] as Date[]
  return eachDayOfInterval({
    start: startOfDay(availabilityToday.value),
    end: modalEditableEnd.value,
  }).filter(isClassDay)
})

function modalMonthTitle(d: Date): string {
  return format(d, 'MMMM yyyy', { locale: esLang.value ? es : undefined })
}

const modalEditableRangeLabel = computed(() => {
  if (!availabilityToday.value) return ''
  const locale = esLang.value ? es : undefined
  return `${format(availabilityToday.value, 'd MMM', { locale })} – ${format(modalEditableEnd.value, 'd MMM yyyy', { locale })}`
})

function isModalToday(day: Date): boolean {
  return availabilityToday.value ? isSameDay(startOfDay(day), availabilityToday.value) : false
}

/** Today through the end of next month, on class days only. Earlier days are read-only. */
function isModalDateEditable(date: Date): boolean {
  if (!availabilityToday.value || !isClassDay(date)) return false
  const d0 = startOfDay(date)
  if (isBefore(d0, startOfDay(availabilityToday.value))) return false
  if (isAfter(d0, modalEditableEnd.value)) return false
  return true
}

function getDateAvailability(date: Date): boolean {
  if (!editing.value) return false
  return editing.value.availability[toDateKey(date)] ?? true
}

function toggleDateAvailability(date: Date) {
  if (!editing.value || !isModalDateEditable(date)) return
  const key = toDateKey(date)
  editing.value.availability[key] = !getDateAvailability(date)
}

/** Flip every editable class day at once; the one-by-one version was tedious. */
function setAllAvailability(value: boolean) {
  if (!editing.value) return
  for (const day of editableModalClassDays.value) {
    editing.value.availability[toDateKey(day)] = value
  }
}

const loadAvailabilityForCoach = async (coach: CoachUi) => {
  const rangeStart = startOfMonth(availabilityToday.value ?? new Date())
  const rangeEnd = endOfMonth(addMonths(availabilityToday.value ?? new Date(), 1))

  const { data, error } = await client
    .from('coach_date_availability')
    .select('date, time_slot, is_available')
    .eq('coach_id', coach.id)
    .gte('date', format(rangeStart, 'yyyy-MM-dd'))
    .lte('date', format(rangeEnd, 'yyyy-MM-dd'))

  if (error) {
    console.error('loadAvailabilityForCoach:', error)
    return
  }

  const byDate = new Map<string, Record<string, boolean>>()
  for (const row of data || []) {
    const cur = byDate.get(row.date as string) || {}
    cur[row.time_slot as string] = row.is_available as boolean
    byDate.set(row.date as string, cur)
  }

  const avail: Record<string, boolean> = {}
  for (const day of eachDayOfInterval({ start: rangeStart, end: rangeEnd })) {
    if (!isClassDay(day)) continue
    const key = toDateKey(day)
    avail[key] = !daySlotsFullyUnavailable(byDate.get(key), slotsForDate(day))
  }
  coach.availability = avail
  availabilitySnapshot.value = { ...avail }
}

const openEdit = async (coach: CoachUi, tab: 'details' | 'availability' = 'details') => {
  editing.value = coach
  editTab.value = tab
  editError.value = ''
  specialtyDraft.value = ''
  certificationDraft.value = ''
  availabilityToday.value = startOfDay(new Date())

  const [first, ...rest] = (coach.full_name || '').split(' ')
  form.value = {
    first_name: coach.first_name || first || '',
    last_name: coach.last_name || rest.join(' '),
    email: coach.email,
    phone: coach.phone || '',
    title: coach.title || '',
    is_head_coach: coach.is_head_coach,
    bio: coach.bio || '',
    experience: coach.experience || '',
    specialties: [...coach.specialties],
    certifications: [...coach.certifications],
    program_ids: [...coach.program_ids],
    primary_program_id: coach.primary_program_id,
  }

  editOpen.value = true
  await loadAvailabilityForCoach(coach)
}

const closeEdit = () => {
  editOpen.value = false
  editing.value = null
  availabilityToday.value = null
}

function addSpecialty() {
  const v = specialtyDraft.value.trim()
  if (!v || form.value.specialties.includes(v)) return
  form.value.specialties.push(v)
  specialtyDraft.value = ''
}

function addCertification() {
  const v = certificationDraft.value.trim()
  if (!v || form.value.certifications.includes(v)) return
  form.value.certifications.push(v)
  certificationDraft.value = ''
}

function toggleProgram(id: string) {
  const i = form.value.program_ids.indexOf(id)
  if (i >= 0) {
    form.value.program_ids.splice(i, 1)
    if (form.value.primary_program_id === id) form.value.primary_program_id = null
  } else {
    form.value.program_ids.push(id)
    // First program picked is the obvious primary.
    if (!form.value.primary_program_id) form.value.primary_program_id = id
  }
}

const saveCoach = async () => {
  if (!editing.value) return
  const coach = editing.value
  editError.value = ''

  if (!form.value.first_name.trim()) {
    editError.value = esLang.value ? 'El nombre es obligatorio.' : 'First name is required.'
    return
  }

  savingCoach.value = true
  try {
    const fullName = [form.value.first_name.trim(), form.value.last_name.trim()]
      .filter(Boolean)
      .join(' ')

    const { error: profileErr } = await client
      .from('profiles')
      .update({
        first_name: form.value.first_name.trim() || null,
        last_name: form.value.last_name.trim() || null,
        full_name: fullName,
        phone: form.value.phone.trim() || null,
        title: form.value.title.trim() || null,
        is_head_coach: form.value.is_head_coach,
        bio: form.value.bio.trim() || null,
        experience: form.value.experience.trim() || null,
        specialties: form.value.specialties,
        certifications: form.value.certifications,
      })
      .eq('id', coach.id)
    if (profileErr) throw profileErr

    // Replace the coach's program links rather than diffing: a handful of rows,
    // and it keeps the primary flag consistent in one write.
    const { error: delErr } = await client
      .from('program_coaches')
      .delete()
      .eq('coach_id', coach.id)
    if (delErr) throw delErr

    if (form.value.program_ids.length > 0) {
      const { error: insErr } = await client.from('program_coaches').insert(
        form.value.program_ids.map(program_id => ({
          program_id,
          coach_id: coach.id,
          is_primary: program_id === form.value.primary_program_id,
        })),
      )
      if (insErr) throw insErr
    }

    await saveAvailability(coach)

    await loadCoachesFromDb()
    closeEdit()
  } catch (e: any) {
    editError.value = e?.message || (esLang.value ? 'No se pudo guardar.' : 'Could not save.')
  } finally {
    savingCoach.value = false
  }
}

/** Only the days that changed: unavailable days get rows, available days lose them. */
const saveAvailability = async (coach: CoachUi) => {
  const initial = availabilitySnapshot.value
  const nowUnavailable: string[] = []
  const nowAvailable: string[] = []

  for (const day of editableModalClassDays.value) {
    const key = toDateKey(day)
    const now = coach.availability[key] ?? true
    if (now === (initial[key] ?? true)) continue
    ;(now ? nowAvailable : nowUnavailable).push(key)
  }

  if (nowUnavailable.length > 0) {
    const rows = nowUnavailable.flatMap(d =>
      slotsForDateStr(d).map(time_slot => ({
        coach_id: coach.id,
        date: d,
        time_slot,
        is_available: false,
      })),
    )
    const { error } = await client
      .from('coach_date_availability')
      .upsert(rows, { onConflict: 'coach_id,date,time_slot' })
    if (error) throw error
  }

  for (const d of nowAvailable) {
    const { error } = await client
      .from('coach_date_availability')
      .delete()
      .eq('coach_id', coach.id)
      .eq('date', d)
      .in('time_slot', slotsForDateStr(d))
    if (error) throw error
  }

  await loadMonthOverrides()
}

// ---------------------------------------------------------------------------
// Deactivate / delete
// ---------------------------------------------------------------------------

const toggleCoachStatus = async (coach: CoachUi) => {
  const next = !coach.is_active
  const { error } = await client.from('profiles').update({ is_active: next }).eq('id', coach.id)
  if (error) {
    console.error(error)
    alert(esLang.value ? 'No se pudo actualizar el estado.' : 'Could not update coach status.')
    return
  }
  coach.is_active = next
  await loadMonthOverrides()
}

const removeTarget = ref<CoachUi | null>(null)
const removeConfirmText = ref('')
const removing = ref(false)
const removeError = ref('')

const openRemove = (coach: CoachUi) => {
  removeTarget.value = coach
  removeConfirmText.value = ''
  removeError.value = ''
}

const closeRemove = () => {
  removeTarget.value = null
  removeError.value = ''
}

/** Typing the name is the last gate before the login and its history go. */
const removeConfirmed = computed(() => {
  const target = removeTarget.value
  if (!target) return false
  return removeConfirmText.value.trim().toLowerCase() === target.full_name.trim().toLowerCase()
})

const deactivateFromDialog = async () => {
  if (!removeTarget.value) return
  await toggleCoachStatus(removeTarget.value)
  closeRemove()
}

const deleteCoachForever = async () => {
  const target = removeTarget.value
  if (!target || !removeConfirmed.value) return
  removing.value = true
  removeError.value = ''
  try {
    await $fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: await adminAuthHeaders(),
      body: { userId: target.id },
    })
    closeRemove()
    await loadCoachesFromDb()
  } catch (e: any) {
    removeError.value = e?.data?.message || e?.message || 'Error'
  } finally {
    removing.value = false
  }
}

// ---------------------------------------------------------------------------
// Invite / add
// ---------------------------------------------------------------------------

const showAddCoachModal = ref(false)
const addCoachSaving = ref(false)
const addCoachError = ref('')
const newCoachForm = ref({
  email: '',
  password: DEFAULT_SKATER_PASSWORD,
  full_name: '',
  phone: '',
})
const coachEmailManual = ref(false)

const syncCoachEmailFromName = () => {
  if (coachEmailManual.value) return
  newCoachForm.value.email = buildNiikSkaterEmail(
    niikEmailLocalFromFullName(newCoachForm.value.full_name),
  )
}

watch(() => newCoachForm.value.full_name, () => syncCoachEmailFromName())

const openAddCoachModal = () => {
  coachEmailManual.value = false
  newCoachForm.value = { email: '', password: DEFAULT_SKATER_PASSWORD, full_name: '', phone: '' }
  addCoachError.value = ''
  showAddCoachModal.value = true
}

const closeAddCoachModal = () => {
  showAddCoachModal.value = false
  addCoachError.value = ''
}

const submitAddCoach = async () => {
  addCoachError.value = ''
  if (!newCoachForm.value.email?.trim()) {
    addCoachError.value = esLang.value ? 'El email es obligatorio' : 'Email is required'
    return
  }
  if (!newCoachForm.value.password || newCoachForm.value.password.length < 6) {
    addCoachError.value = esLang.value
      ? 'La contraseña debe tener al menos 6 caracteres'
      : 'Password must be at least 6 characters'
    return
  }

  addCoachSaving.value = true
  try {
    await $fetch('/api/admin/create-user', {
      method: 'POST',
      headers: await adminAuthHeaders(),
      body: {
        email: newCoachForm.value.email.trim(),
        password: newCoachForm.value.password,
        full_name: newCoachForm.value.full_name.trim() || undefined,
        phone: newCoachForm.value.phone.trim() || undefined,
        role: 'coach',
      },
    })
    closeAddCoachModal()
    await loadCoachesFromDb()
  } catch (e: any) {
    addCoachError.value = e?.data?.message || e?.message || 'Error creating coach'
  } finally {
    addCoachSaving.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-black">
    <div v-if="checkingRole" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p class="text-gray-400">{{ esLang ? 'Cargando...' : 'Loading...' }}</p>
      </div>
    </div>

    <div v-else-if="isAdmin" class="px-4 py-6 max-w-5xl mx-auto space-y-6 pb-16">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-2xl font-bold text-white">{{ esLang ? 'Coaches' : 'Coaches' }}</h1>
          <p class="text-sm text-gray-400 mt-0.5">
            {{ esLang ? 'Staff de coaching en Niik Skate' : 'Coaching staff at Niik Skate' }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <NuxtLink
            to="/member/admin/scheduling/coach-activity"
            class="px-3 py-2 rounded-xl border border-gray-700 text-gray-200 text-sm font-medium hover:border-teal-500/60 hover:text-white transition-colors flex items-center gap-2"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {{ esLang ? 'Actividad' : 'Activity' }}
          </NuxtLink>
          <button
            type="button"
            class="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 transition-colors text-white font-semibold text-sm flex items-center gap-2"
            @click="openAddCoachModal"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            {{ esLang ? 'Invitar coach' : 'Invite coach' }}
          </button>
        </div>
      </div>

      <!-- Counters -->
      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
          <p class="text-2xl font-bold text-white">{{ activeCount }}</p>
          <p class="text-[11px] uppercase tracking-wider text-gray-500 font-medium mt-0.5">
            {{ esLang ? 'Activos' : 'Active' }}
          </p>
        </div>
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
          <p class="text-2xl font-bold text-white">{{ headCoachCount }}</p>
          <p class="text-[11px] uppercase tracking-wider text-gray-500 font-medium mt-0.5">
            {{ esLang ? 'Head coaches' : 'Head coaches' }}
          </p>
        </div>
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-4 text-center">
          <p class="text-2xl font-bold" :class="unassignedCount > 0 ? 'text-amber-400' : 'text-white'">
            {{ unassignedCount }}
          </p>
          <p class="text-[11px] uppercase tracking-wider text-gray-500 font-medium mt-0.5">
            {{ esLang ? 'Sin programa' : 'No program' }}
          </p>
        </div>
      </div>

      <!-- Coach cards -->
      <section class="space-y-3">
        <h2 class="text-[13px] font-bold uppercase tracking-[0.1em] text-gray-400">
          {{ esLang ? 'Todos los coaches' : 'All coaches' }} ({{ coaches.length }})
        </h2>

        <p v-if="loadingCoaches" class="text-sm text-gray-500">{{ esLang ? 'Cargando…' : 'Loading…' }}</p>
        <p v-else-if="coaches.length === 0" class="text-sm text-gray-400">
          {{ esLang ? 'No hay coaches todavía.' : 'No coaches yet.' }}
        </p>

        <div class="grid gap-3 sm:grid-cols-2">
          <article
            v-for="coach in coaches"
            :key="coach.id"
            class="rounded-2xl border bg-gray-900 p-4 transition-colors"
            :class="coach.is_active ? 'border-gray-800 hover:border-gray-700' : 'border-gray-800/60 opacity-70'"
          >
            <div class="flex items-start gap-3">
              <div
                class="w-11 h-11 rounded-xl flex items-center justify-center ring-1 shrink-0"
                :class="[`bg-gradient-to-br ${coach.accent.gradient}`, coach.accent.ring]"
              >
                <span class="text-xl">{{ coach.accent.emoji }}</span>
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <h3 class="text-base font-semibold text-white truncate">{{ coach.full_name }}</h3>
                  <span
                    v-if="coach.is_head_coach"
                    class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-400 shrink-0"
                  >
                    ★ {{ esLang ? 'Head' : 'Head' }}
                  </span>
                  <span
                    v-if="coach.role === 'admin'"
                    class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gold-400/15 text-gold-400 shrink-0"
                  >
                    Admin
                  </span>
                </div>
                <p class="text-xs text-gray-400">{{ coach.title || (esLang ? 'Coach' : 'Coach') }}</p>
              </div>

              <div class="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  :title="esLang ? 'Editar' : 'Edit'"
                  :aria-label="esLang ? 'Editar coach' : 'Edit coach'"
                  class="p-1.5 rounded-lg text-gray-500 hover:text-teal-400 hover:bg-gray-800 transition-colors"
                  @click="openEdit(coach)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  type="button"
                  :title="esLang ? 'Horarios' : 'Schedule'"
                  :aria-label="esLang ? 'Editar horarios' : 'Edit schedule'"
                  class="p-1.5 rounded-lg text-gray-500 hover:text-teal-400 hover:bg-gray-800 transition-colors"
                  @click="openEdit(coach, 'availability')"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  type="button"
                  :title="esLang ? 'Quitar' : 'Remove'"
                  :aria-label="esLang ? 'Quitar coach' : 'Remove coach'"
                  class="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
                  @click="openRemove(coach)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Programs -->
            <div class="mt-3 flex flex-wrap gap-1.5">
              <span
                v-for="name in programNames(coach)"
                :key="name"
                class="px-2 py-0.5 rounded-full text-[11px] border border-teal-500/30 bg-teal-500/10 text-teal-300"
              >
                {{ name }}
              </span>
              <span
                v-if="programNames(coach).length === 0"
                class="px-2 py-0.5 rounded-full text-[11px] border border-gray-700 text-gray-500"
              >
                {{ esLang ? 'Sin programa asignado' : 'No program assigned' }}
              </span>
            </div>

            <!-- Stats -->
            <div class="mt-3 grid grid-cols-2 gap-2">
              <div class="rounded-lg bg-gray-800/60 px-3 py-2">
                <p class="text-lg font-semibold text-white leading-none">
                  {{ availabilitySummary(coach).on }}<span class="text-gray-500 text-sm">/{{ availabilitySummary(coach).total }}</span>
                </p>
                <p class="text-[10px] uppercase tracking-wider text-gray-500 font-medium mt-1">
                  {{ esLang ? 'Días disponibles' : 'Days available' }}
                </p>
              </div>
              <div class="rounded-lg bg-gray-800/60 px-3 py-2">
                <p class="text-lg font-semibold text-white leading-none">{{ coach.specialties.length }}</p>
                <p class="text-[10px] uppercase tracking-wider text-gray-500 font-medium mt-1">
                  {{ esLang ? 'Especialidades' : 'Specialties' }}
                </p>
              </div>
            </div>

            <p class="mt-3 text-xs text-gray-500 truncate flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {{ coach.email }}
            </p>

            <div class="mt-3 pt-3 border-t border-gray-800 flex items-center justify-between gap-2">
              <span
                class="px-2 py-0.5 rounded-full text-[11px] font-medium"
                :class="coach.is_active ? 'bg-glass-green/15 text-glass-green' : 'bg-gray-800 text-gray-500'"
              >
                {{ coach.is_active ? (esLang ? 'Activo' : 'Active') : (esLang ? 'Inactivo' : 'Inactive') }}
              </span>
              <button
                v-if="coach.role === 'coach'"
                type="button"
                class="text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors"
                :class="coach.is_active
                  ? 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
                  : 'border-glass-green/40 text-glass-green hover:bg-glass-green/10'"
                @click="toggleCoachStatus(coach)"
              >
                {{ coach.is_active ? (esLang ? 'Desactivar' : 'Deactivate') : (esLang ? 'Activar' : 'Activate') }}
              </button>
            </div>
          </article>
        </div>
      </section>
    </div>

    <!-- Edit drawer -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-200"
        leave-to-class="opacity-0"
      >
        <div
          v-if="editOpen && editing"
          class="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4"
        >
          <div class="bg-gray-900 w-full max-w-2xl rounded-t-3xl sm:rounded-2xl border border-gray-800 max-h-[92vh] flex flex-col">
            <!-- Drawer header -->
            <div class="px-5 py-4 border-b border-gray-800 flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                :class="`bg-gradient-to-br ${editing.accent.gradient}`"
              >
                <span class="text-lg">{{ editing.accent.emoji }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-base font-semibold text-white truncate">
                  {{ esLang ? 'Editar coach' : 'Edit coach' }}
                </h3>
                <p class="text-xs text-gray-400 truncate">{{ editing.full_name }}</p>
              </div>
              <button
                type="button"
                class="p-2 text-gray-500 hover:text-white"
                :aria-label="esLang ? 'Cerrar' : 'Close'"
                @click="closeEdit"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Tabs -->
            <div class="px-5 pt-3 flex gap-1 border-b border-gray-800">
              <button
                type="button"
                class="px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
                :class="editTab === 'details' ? 'border-teal-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'"
                @click="editTab = 'details'"
              >
                {{ esLang ? 'Datos' : 'Details' }}
              </button>
              <button
                type="button"
                class="px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
                :class="editTab === 'availability' ? 'border-teal-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'"
                @click="editTab = 'availability'"
              >
                {{ esLang ? 'Disponibilidad' : 'Availability' }}
              </button>
            </div>

            <div class="flex-1 overflow-y-auto px-5 py-4">
              <!-- Details -->
              <div v-show="editTab === 'details'" class="space-y-4">
                <div>
                  <p class="text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-2">
                    {{ esLang ? 'Programas asignados' : 'Program assignments' }}
                  </p>
                  <div class="flex flex-wrap gap-1.5">
                    <button
                      v-for="p in programs"
                      :key="p.id"
                      type="button"
                      class="px-2.5 py-1 rounded-full text-xs border transition-colors"
                      :class="form.program_ids.includes(p.id)
                        ? 'border-teal-500/50 bg-teal-500/15 text-teal-300'
                        : 'border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300'"
                      @click="toggleProgram(p.id)"
                    >
                      {{ p.name }}
                      <span v-if="form.primary_program_id === p.id" class="ml-1 text-teal-400">
                        ({{ esLang ? 'Principal' : 'Primary' }})
                      </span>
                    </button>
                    <p v-if="programs.length === 0" class="text-xs text-gray-500">
                      {{ esLang ? 'No hay programas activos.' : 'No active programs.' }}
                    </p>
                  </div>
                  <div v-if="form.program_ids.length > 1" class="mt-2">
                    <label class="block text-[11px] text-gray-500 mb-1">
                      {{ esLang ? 'Programa principal' : 'Primary program' }}
                    </label>
                    <select
                      v-model="form.primary_program_id"
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm outline-none focus:border-teal-500"
                    >
                      <option
                        v-for="id in form.program_ids"
                        :key="id"
                        :value="id"
                      >
                        {{ programNameById.get(id) }}
                      </option>
                    </select>
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-400 mb-1">
                      {{ esLang ? 'Nombre' : 'First name' }} *
                    </label>
                    <input
                      v-model="form.first_name"
                      type="text"
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-400 mb-1">
                      {{ esLang ? 'Apellido' : 'Last name' }}
                    </label>
                    <input
                      v-model="form.last_name"
                      type="text"
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-medium text-gray-400 mb-1">Email</label>
                  <input
                    :value="form.email"
                    type="email"
                    disabled
                    class="w-full px-3 py-2 bg-gray-800/50 border border-gray-800 rounded-lg text-gray-500 text-sm cursor-not-allowed"
                  />
                  <p class="mt-1 text-[11px] text-gray-600">
                    {{ esLang
                      ? 'El email es la cuenta de acceso y no se cambia desde aquí.'
                      : 'The email is the login and is not changed from here.' }}
                  </p>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-400 mb-1">
                      {{ esLang ? 'Teléfono' : 'Phone' }}
                    </label>
                    <input
                      v-model="form.phone"
                      type="tel"
                      :placeholder="esLang ? 'Opcional' : 'Optional'"
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-400 mb-1">
                      {{ esLang ? 'Título' : 'Title' }}
                    </label>
                    <input
                      v-model="form.title"
                      type="text"
                      :placeholder="esLang ? 'Coach' : 'Coach'"
                      class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500"
                    />
                  </div>
                </div>

                <label class="flex items-start gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 cursor-pointer">
                  <input v-model="form.is_head_coach" type="checkbox" class="mt-0.5 accent-amber-500" />
                  <span class="min-w-0">
                    <span class="block text-sm font-medium text-amber-300">
                      ★ {{ esLang ? 'Head Coach' : 'Head Coach' }}
                    </span>
                    <span class="block text-[11px] text-gray-500">
                      {{ esLang
                        ? 'Lidera los programas que tiene asignados.'
                        : 'Leads the programs they are assigned to.' }}
                    </span>
                  </span>
                </label>

                <div>
                  <label class="block text-xs font-medium text-gray-400 mb-1">Bio</label>
                  <textarea
                    v-model="form.bio"
                    rows="3"
                    :placeholder="esLang ? 'Cuéntanos sobre este coach…' : 'Tell us about this coach…'"
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500 resize-y"
                  />
                </div>

                <div>
                  <label class="block text-xs font-medium text-gray-400 mb-1">
                    {{ esLang ? 'Experiencia' : 'Experience' }}
                  </label>
                  <input
                    v-model="form.experience"
                    type="text"
                    :placeholder="esLang ? 'ej. 5 años, Intermedio, Experto' : 'e.g. 5 years, Beginner, Expert'"
                    class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label class="block text-xs font-medium text-gray-400 mb-1">
                    {{ esLang ? 'Especialidades' : 'Specialties' }}
                  </label>
                  <div class="flex gap-2">
                    <input
                      v-model="specialtyDraft"
                      type="text"
                      :placeholder="esLang ? 'Añade una especialidad…' : 'Add a specialty…'"
                      class="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500"
                      @keydown.enter.prevent="addSpecialty"
                    />
                    <button
                      type="button"
                      class="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 transition-colors text-white text-sm font-medium"
                      @click="addSpecialty"
                    >
                      {{ esLang ? 'Añadir' : 'Add' }}
                    </button>
                  </div>
                  <div v-if="form.specialties.length" class="flex flex-wrap gap-1.5 mt-2">
                    <span
                      v-for="(s, i) in form.specialties"
                      :key="s"
                      class="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-300 flex items-center gap-1"
                    >
                      {{ s }}
                      <button
                        type="button"
                        class="text-gray-500 hover:text-red-400"
                        :aria-label="esLang ? 'Quitar' : 'Remove'"
                        @click="form.specialties.splice(i, 1)"
                      >
                        ×
                      </button>
                    </span>
                  </div>
                </div>

                <div>
                  <label class="block text-xs font-medium text-gray-400 mb-1">
                    {{ esLang ? 'Certificaciones' : 'Certifications' }}
                  </label>
                  <div class="flex gap-2">
                    <input
                      v-model="certificationDraft"
                      type="text"
                      :placeholder="esLang ? 'Añade una certificación…' : 'Add a certification…'"
                      class="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500"
                      @keydown.enter.prevent="addCertification"
                    />
                    <button
                      type="button"
                      class="px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 transition-colors text-white text-sm font-medium"
                      @click="addCertification"
                    >
                      {{ esLang ? 'Añadir' : 'Add' }}
                    </button>
                  </div>
                  <div v-if="form.certifications.length" class="flex flex-wrap gap-1.5 mt-2">
                    <span
                      v-for="(c, i) in form.certifications"
                      :key="c"
                      class="px-2 py-0.5 rounded-full text-xs bg-gray-800 text-gray-300 flex items-center gap-1"
                    >
                      {{ c }}
                      <button
                        type="button"
                        class="text-gray-500 hover:text-red-400"
                        :aria-label="esLang ? 'Quitar' : 'Remove'"
                        @click="form.certifications.splice(i, 1)"
                      >
                        ×
                      </button>
                    </span>
                  </div>
                </div>
              </div>

              <!-- Availability -->
              <div v-show="editTab === 'availability'" class="space-y-4">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                  <p class="text-xs text-gray-400 max-w-sm">
                    {{ esLang
                      ? 'Toca un día para marcar si el coach está disponible. Editable desde hoy hasta el final del próximo mes, en días de clase.'
                      : 'Tap a day to mark whether the coach is available. Editable from today through the end of next month, on class days.' }}
                  </p>
                  <div class="flex gap-1.5 shrink-0">
                    <button
                      type="button"
                      class="px-2.5 py-1 rounded-lg border border-gray-700 text-xs text-gray-300 hover:border-glass-green/50 hover:text-glass-green transition-colors"
                      @click="setAllAvailability(true)"
                    >
                      {{ esLang ? 'Todos sí' : 'All yes' }}
                    </button>
                    <button
                      type="button"
                      class="px-2.5 py-1 rounded-lg border border-gray-700 text-xs text-gray-300 hover:border-red-500/50 hover:text-red-400 transition-colors"
                      @click="setAllAvailability(false)"
                    >
                      {{ esLang ? 'Todos no' : 'All no' }}
                    </button>
                  </div>
                </div>

                <p class="text-[11px] text-teal-400 font-medium">
                  {{ esLang ? 'Editable: ' : 'Editable: ' }}{{ modalEditableRangeLabel }}
                </p>

                <div class="grid sm:grid-cols-2 gap-4">
                  <div v-for="(monthStart, mi) in [modalFirstMonthStart, modalSecondMonthStart]" :key="mi">
                    <h4 class="text-xs font-semibold text-gray-300 capitalize mb-2">
                      {{ modalMonthTitle(monthStart) }}
                    </h4>
                    <div class="grid grid-cols-7 gap-1 mb-1">
                      <div
                        v-for="(wd, index) in weekDays"
                        :key="mi + '-' + index"
                        class="text-center text-[10px] font-medium py-0.5"
                        :class="CLASS_WEEKDAY_HEADER_INDICES.includes(index) ? 'text-teal-400' : 'text-gray-600'"
                      >
                        {{ wd }}
                      </div>
                    </div>
                    <div class="grid grid-cols-7 gap-1">
                      <template
                        v-for="(day, index) in mi === 0 ? modalMonthOneCells : modalMonthTwoCells"
                        :key="'m' + mi + '-' + index"
                      >
                        <div v-if="!day" class="aspect-square" />
                        <button
                          v-else-if="isClassDay(day) && isModalDateEditable(day)"
                          type="button"
                          class="aspect-square rounded-lg flex items-center justify-center text-[11px] font-medium transition-colors"
                          :class="[
                            getDateAvailability(day)
                              ? 'bg-glass-green/85 text-white hover:bg-glass-green'
                              : 'bg-gray-700 text-gray-400 hover:bg-gray-600',
                            isModalToday(day) ? 'ring-2 ring-teal-400 ring-offset-1 ring-offset-gray-900' : '',
                          ]"
                          @click="toggleDateAvailability(day)"
                        >
                          {{ format(day, 'd') }}
                        </button>
                        <div
                          v-else-if="isClassDay(day)"
                          class="aspect-square rounded-lg flex items-center justify-center text-[11px] bg-gray-800/70 text-gray-600 border border-gray-800"
                          :title="esLang ? 'Pasado (solo lectura)' : 'Past (read-only)'"
                        >
                          {{ format(day, 'd') }}
                        </div>
                        <div
                          v-else
                          class="aspect-square flex items-center justify-center text-[10px] text-gray-700"
                        >
                          {{ format(day, 'd') }}
                        </div>
                      </template>
                    </div>
                  </div>
                </div>

                <p class="text-[11px] text-gray-600">
                  {{ esLang
                    ? 'Lun 4:30–6:00; Mar/Jue/Sáb 5:30–7:00 y 7:00–8:30. El anillo turquesa es hoy.'
                    : 'Mon 4:30–6:00 PM; Tue/Thu/Sat 5:30–7:00 and 7:00–8:30 PM. Teal ring = today.' }}
                </p>
              </div>
            </div>

            <div class="px-5 py-4 border-t border-gray-800 space-y-2">
              <p v-if="editError" class="text-xs text-red-400">{{ editError }}</p>
              <div class="flex gap-2">
                <button
                  type="button"
                  class="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-300 text-sm font-medium hover:text-white hover:border-gray-600 transition-colors"
                  @click="closeEdit"
                >
                  {{ esLang ? 'Cancelar' : 'Cancel' }}
                </button>
                <button
                  type="button"
                  class="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 transition-colors text-white text-sm font-semibold disabled:opacity-50"
                  :disabled="savingCoach"
                  @click="saveCoach"
                >
                  {{ savingCoach ? (esLang ? 'Guardando…' : 'Saving…') : (esLang ? 'Guardar cambios' : 'Save changes') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Remove dialog -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-200"
        leave-to-class="opacity-0"
      >
        <div v-if="removeTarget" class="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div class="bg-gray-900 w-full max-w-md rounded-2xl border border-gray-800 overflow-hidden">
            <div class="px-5 py-4 border-b border-gray-800">
              <h3 class="text-base font-semibold text-white">
                {{ esLang ? 'Quitar coach' : 'Remove coach' }}
              </h3>
              <p class="text-xs text-gray-400 mt-0.5">{{ removeTarget.full_name }}</p>
            </div>

            <div class="p-5 space-y-4">
              <div class="rounded-xl border border-gray-800 bg-gray-800/40 p-3">
                <p class="text-sm font-medium text-white">
                  {{ esLang ? 'Desactivar' : 'Deactivate' }}
                </p>
                <p class="text-xs text-gray-400 mt-1">
                  {{ esLang
                    ? 'Sale de la programación y no puede entrar, pero se conserva su historial de clases y evaluaciones. Puedes reactivarlo cuando quieras.'
                    : 'Drops out of scheduling and cannot log in, but their class and evaluation history is kept. You can reactivate them any time.' }}
                </p>
                <button
                  type="button"
                  class="mt-3 w-full py-2 rounded-lg bg-teal-600 hover:bg-teal-500 transition-colors text-white text-sm font-semibold"
                  @click="deactivateFromDialog"
                >
                  {{ removeTarget.is_active
                    ? (esLang ? 'Desactivar coach' : 'Deactivate coach')
                    : (esLang ? 'Reactivar coach' : 'Reactivate coach') }}
                </button>
              </div>

              <div class="rounded-xl border border-red-500/25 bg-red-500/5 p-3">
                <p class="text-sm font-medium text-red-300">
                  {{ esLang ? 'Borrar definitivamente' : 'Delete permanently' }}
                </p>
                <p class="text-xs text-gray-400 mt-1">
                  {{ esLang
                    ? 'Borra la cuenta y su acceso. Las clases y evaluaciones que registró se quedan sin coach. No se puede deshacer.'
                    : 'Deletes the account and its login. Classes and evaluations they recorded are left without a coach. This cannot be undone.' }}
                </p>
                <label class="block text-[11px] text-gray-500 mt-3 mb-1">
                  {{ esLang ? 'Escribe' : 'Type' }}
                  <span class="text-gray-300 font-medium">{{ removeTarget.full_name }}</span>
                  {{ esLang ? 'para confirmar' : 'to confirm' }}
                </label>
                <input
                  v-model="removeConfirmText"
                  type="text"
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-red-500"
                  :placeholder="removeTarget.full_name"
                />
                <button
                  type="button"
                  class="mt-3 w-full py-2 rounded-lg bg-red-600 hover:bg-red-500 transition-colors text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-600"
                  :disabled="!removeConfirmed || removing"
                  @click="deleteCoachForever"
                >
                  {{ removing
                    ? (esLang ? 'Borrando…' : 'Deleting…')
                    : (esLang ? 'Borrar definitivamente' : 'Delete permanently') }}
                </button>
                <p v-if="removeError" class="mt-2 text-xs text-red-400">{{ removeError }}</p>
              </div>

              <button
                type="button"
                class="w-full py-2 rounded-lg border border-gray-700 text-gray-300 text-sm font-medium hover:text-white transition-colors"
                @click="closeRemove"
              >
                {{ esLang ? 'Cancelar' : 'Cancel' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Invite coach -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-200"
        leave-to-class="opacity-0"
      >
        <div v-if="showAddCoachModal" class="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div class="bg-gray-900 w-full max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden border border-gray-800">
            <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <h3 class="text-base font-semibold text-white">
                {{ esLang ? 'Nuevo coach' : 'New coach' }}
              </h3>
              <button
                type="button"
                class="p-2 text-gray-500 hover:text-white"
                :aria-label="esLang ? 'Cerrar' : 'Close'"
                @click="closeAddCoachModal"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form class="p-5 space-y-3" @submit.prevent="submitAddCoach">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ esLang ? 'Nombre completo' : 'Full name' }}
                </label>
                <input
                  v-model="newCoachForm.full_name"
                  type="text"
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500"
                  :placeholder="esLang ? 'Nombre y apellido' : 'First and last name'"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">Email *</label>
                <input
                  v-model="newCoachForm.email"
                  type="email"
                  required
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500"
                  placeholder="firstname.lastname@niikskate.com"
                  @input="coachEmailManual = true"
                />
                <button
                  v-if="coachEmailManual"
                  type="button"
                  class="mt-1 text-[11px] text-teal-400 hover:text-teal-300"
                  @click="coachEmailManual = false; syncCoachEmailFromName()"
                >
                  {{ esLang ? 'Regenerar desde el nombre' : 'Regenerate from name' }}
                </button>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ esLang ? 'Contraseña temporal *' : 'Temporary password *' }}
                </label>
                <input
                  v-model="newCoachForm.password"
                  type="text"
                  required
                  minlength="6"
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500 font-mono"
                  :placeholder="DEFAULT_SKATER_PASSWORD"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ esLang ? 'Teléfono' : 'Phone' }}
                </label>
                <input
                  v-model="newCoachForm.phone"
                  type="tel"
                  class="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-600 outline-none focus:border-teal-500"
                  :placeholder="esLang ? 'Opcional' : 'Optional'"
                />
              </div>
              <p class="text-[11px] text-gray-600">
                {{ esLang
                  ? 'Después de crearlo, edítalo para añadir programas, especialidades y disponibilidad.'
                  : 'After creating them, edit to add programs, specialties and availability.' }}
              </p>
              <p v-if="addCoachError" class="text-xs text-red-400">{{ addCoachError }}</p>
              <div class="flex gap-2 pt-1">
                <button
                  type="button"
                  class="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-300 text-sm font-medium hover:text-white transition-colors"
                  @click="closeAddCoachModal"
                >
                  {{ esLang ? 'Cancelar' : 'Cancel' }}
                </button>
                <button
                  type="submit"
                  class="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 transition-colors text-white text-sm font-semibold disabled:opacity-50"
                  :disabled="addCoachSaving"
                >
                  {{ addCoachSaving ? '…' : (esLang ? 'Crear coach' : 'Create coach') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
