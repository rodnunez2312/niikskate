<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { TimeSlot, User } from '~/types'
import { TIME_SLOT_LABELS } from '~/types'
import { computeAgeFromDob } from '~/utils/ageEligibility'
import {
  assignableSkillGroups,
  effectiveSkaterLevelId,
  isPlanningSkillGroupId,
  normalizeSkillGroupDisplayName,
} from '~/utils/skillGroupLevels'
import {
  normalizeSkaterSkillLevel,
  SKATER_KANBAN_SKILL_LEVELS,
  skaterSkillLevelLabel,
} from '~/utils/skaterSkillLevels'
import {
  buildNiikSkaterEmail,
  DEFAULT_SKATER_PASSWORD,
  niikEmailLocalFromNames,
  normalizeNiikEmailLocal,
  NIIK_SKATE_EMAIL_DOMAIN,
} from '~/utils/skaterNiikEmail'
import { getProgramSeasonBySlug } from '~/utils/programSeasons'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const router = useRouter()
const user = useSupabaseUser()
const client = useSupabaseClient()
const { language } = useI18n()
const { seasons: programSeasons } = useProgramSeasons()

// State
const isAdmin = ref(false)
const loading = ref(true)
const users = ref<User[]>([])
const searchQuery = ref('')

const skillGroupsList = ref<Array<{ id: string; name: string; color?: string | null; sort_order: number; is_active?: boolean | null }>>([])

const kanbanMode = ref<'program' | 'level'>('program')
const draggingCardKey = ref<string | null>(null)
const dragOverColumnId = ref<string | null>(null)
const dragOverDepth = ref<Record<string, number>>({})
const kanbanAssignError = ref('')
const movingStudentId = ref<string | null>(null)

const UNASSIGNED_COLUMN = '__unassigned__'

const expandedSkaterId = ref<string | null>(null)
const skaterDraft = ref({
  season_slug: '' as string,
  /** Matches academy group sessions only (see TIME_SLOT_LABELS). */
  timeSlot: 'early' as TimeSlot,
  days: [1, 2, 3, 4, 5] as number[],
  guardian_user_id: '' as string,
})
const savingSkaterId = ref<string | null>(null)
const skaterSaveMessage = ref('')

// Edit modal
const showEditModal = ref(false)
const editingUser = ref<User | null>(null)
const newRole = ref<'admin' | 'coach' | 'customer'>('customer')
const saving = ref(false)
const deletingUserId = ref<string | null>(null)

// Add modals
const showAddFamilyModal = ref(false)
const showAddSkaterModal = ref(false)
const addUserSaving = ref(false)
const addUserError = ref('')
const emailLocalManual = ref(false)
const familyEmailManual = ref(false)
const editingFamilyId = ref<string | null>(null)
const newFamilyForm = ref({
  first_name: '',
  last_name: '',
  emailLocal: '',
  full_name: '',
  phone: '',
  skater_ids: [] as string[],
})
const newSkaterForm = ref({
  emailLocal: '',
  full_name: '',
  first_name: '',
  last_name: '',
  date_of_birth: '',
  phone: '',
  guardian_user_id: '',
})

type CrewMemberAdminRow = {
  id: string
  guardian_user_id: string | null
  first_name: string
  last_name: string | null
  full_name: string | null
  date_of_birth: string | null
  age: number | null
}

const crewMembers = ref<CrewMemberAdminRow[]>([])

type AdminSkaterCard = {
  key: string
  kind: 'profile' | 'crew'
  id: string
  name: string
  guardianId: string | null
  user?: User
}

const isNiikSkaterEmail = (email: string) =>
  email.toLowerCase().endsWith(NIIK_SKATE_EMAIL_DOMAIN)

/**
 * Skater login profiles. The kind chosen at creation decides it; accounts made
 * before that was stored fall back to the shape of the row.
 */
const isSkaterProfile = (u: User) => {
  if (u.customer_kind === 'skater') return true
  if (u.customer_kind === 'guardian') return false
  return Boolean(u.guardian_user_id)
    || (isNiikSkaterEmail(u.email) && Boolean(u.date_of_birth))
}

/** Parent/guardian family account (may use @niikskate.com without DOB). */
const isFamilyAccount = (u: User) =>
  u.role === 'customer' && !isSkaterProfile(u)

const familyAccounts = computed(() =>
  filteredUsers.value.filter(isFamilyAccount),
)

const guardianOptions = computed(() =>
  users.value.filter(isFamilyAccount).sort((a, b) => a.full_name.localeCompare(b.full_name)),
)

const familySkaterPickerOptions = computed(() =>
  users.value
    .filter(isSkaterProfile)
    .sort((a, b) => a.full_name.localeCompare(b.full_name)),
)

const isEditingFamily = computed(() => Boolean(editingFamilyId.value))

const adminAuthHeaders = async (): Promise<Record<string, string>> => {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error(language.value === 'es' ? 'Sesión expirada' : 'Session expired')
  return { Authorization: `Bearer ${token}` }
}

/** Roles shown when editing — never offer admin except for existing admins (read-only). */
const editableRoleOptions = computed((): Array<'admin' | 'coach' | 'customer'> => {
  const r = editingUser.value?.role
  if (r === 'admin') return ['admin']
  if (r === 'coach') return ['coach', 'customer']
  return ['customer', 'coach']
})

const canEditRole = computed(() => editingUser.value?.role !== 'admin')

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/member/admin/academy/users')
    return
  }

  const { data } = await client
    .from('profiles')
    .select('role')
    .eq('id', user.value.id)
    .single()

  if (data?.role !== 'admin') {
    router.push('/')
    return
  }

  isAdmin.value = true
  await Promise.all([loadUsers(), loadSkaterMeta(), loadCrewMembers()])
})

const loadCrewMembers = async () => {
  try {
    const { data, error } = await client
      .from('crew_members')
      .select('id, guardian_user_id, first_name, last_name, full_name, date_of_birth, age')
      .order('sort_order')
    if (error) throw error
    crewMembers.value = (data || []) as CrewMemberAdminRow[]
  } catch (e) {
    console.error('loadCrewMembers:', e)
    crewMembers.value = []
  }
}

const loadSkaterMeta = async () => {
  try {
    const { data: sg, error } = await client
      .from('skill_groups')
      .select('id,name,color,sort_order,is_active')
      .order('sort_order')
    if (error) throw error
    skillGroupsList.value = ((sg || []) as typeof skillGroupsList.value).filter(
      g => g.is_active !== false,
    )
  } catch (e) {
    console.error('loadSkaterMeta:', e)
  }
}

const loadUsers = async () => {
  loading.value = true
  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('role', 'customer')
      .order('created_at', { ascending: false })

    if (error) throw error
    users.value = data || []
  } catch (e) {
    console.error('Error loading users:', e)
  } finally {
    loading.value = false
  }
}

// Filter users
const filteredUsers = computed(() => {
  return users.value.filter(u => {
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase()
      return u.full_name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
    }
    return true
  })
})

const familyNameFor = (guardianId: string | null | undefined) => {
  if (!guardianId) return null
  return users.value.find(u => u.id === guardianId)?.full_name ?? null
}

const seasonSlugFromSchedule = (sched: User['skater_schedule']): string => {
  if (!sched || typeof sched !== 'object') return ''
  return (sched as { season_slug?: string }).season_slug?.trim() || ''
}

const seasonLabelForSlug = (slug: string | null | undefined) => {
  if (!slug) return null
  const season = getProgramSeasonBySlug(slug)
  if (!season) return slug
  const es = language.value === 'es'
  return `${es ? season.name.es : season.name.en} · ${es ? season.dates.es : season.dates.en}`
}

const seasonLabelFor = (u: User) => seasonLabelForSlug(seasonSlugFromSchedule(u.skater_schedule))

const programNameFor = (u: User) => {
  const gid = effectiveSkaterLevelId(u.skill_group_id, skillGroupsList.value)
  if (!gid) return null
  const name = skillGroupsList.value.find(g => g.id === gid)?.name
  return name ? normalizeSkillGroupDisplayName(name) : null
}

const skillBandLabelFor = (u: User) =>
  skaterSkillLevelLabel(u.skill_level, language.value === 'es')

const assignablePrograms = computed(() => assignableSkillGroups(skillGroupsList.value))

const skaterProfileUsers = computed(() => filteredUsers.value.filter(isSkaterProfile))

type KanbanColumn = {
  id: string
  title: string
  color?: string | null
  students: User[]
  cards?: AdminSkaterCard[]
}

const adminSkaterCards = computed((): AdminSkaterCard[] => {
  const cards: AdminSkaterCard[] = []
  for (const u of filteredUsers.value.filter(isSkaterProfile)) {
    cards.push({
      key: `profile:${u.id}`,
      kind: 'profile',
      id: u.id,
      name: u.full_name,
      guardianId: u.guardian_user_id ?? null,
      user: u,
    })
  }
  const q = searchQuery.value.trim().toLowerCase()
  for (const c of crewMembers.value) {
    const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ')
    if (q && !name.toLowerCase().includes(q)) continue
    cards.push({
      key: `crew:${c.id}`,
      kind: 'crew',
      id: c.id,
      name,
      guardianId: c.guardian_user_id,
    })
  }
  return cards.sort((a, b) => a.name.localeCompare(b.name))
})

const skaterCount = computed(() => adminSkaterCards.value.length)

const inactiveSkaters = computed(() =>
  users.value.filter(u => isSkaterProfile(u) && !u.is_active),
)

const columnItemCount = (col: KanbanColumn) => col.students.length

const programKanbanColumns = computed((): KanbanColumn[] => {
  const pool = skaterProfileUsers.value
  const cols: KanbanColumn[] = [
    {
      id: UNASSIGNED_COLUMN,
      title: language.value === 'es' ? 'Sin programa' : 'No program',
      students: [] as User[],
    },
    ...assignablePrograms.value.map(g => ({
      id: g.id,
      title: normalizeSkillGroupDisplayName(g.name),
      color: g.color,
      students: [] as User[],
    })),
  ]
  for (const col of cols) {
    if (col.id === UNASSIGNED_COLUMN) {
      col.students = pool.filter(
        u => !effectiveSkaterLevelId(u.skill_group_id, skillGroupsList.value),
      )
    } else {
      col.students = pool.filter(
        u => effectiveSkaterLevelId(u.skill_group_id, skillGroupsList.value) === col.id,
      )
    }
  }
  return cols
})

const levelKanbanColumns = computed((): KanbanColumn[] => {
  const pool = skaterProfileUsers.value
  const es = language.value === 'es'
  const cols: KanbanColumn[] = [
    {
      id: UNASSIGNED_COLUMN,
      title: es ? 'Sin nivel' : 'No level',
      students: [] as User[],
    },
    ...SKATER_KANBAN_SKILL_LEVELS.map(l => ({
      id: l.id,
      title: es ? l.label.es : l.label.en,
      color: l.color,
      students: [] as User[],
    })),
  ]
  for (const col of cols) {
    if (col.id === UNASSIGNED_COLUMN) {
      col.students = pool.filter(u => !normalizeSkaterSkillLevel(u.skill_level))
    } else {
      col.students = pool.filter(u => normalizeSkaterSkillLevel(u.skill_level) === col.id)
    }
  }
  return cols
})

const activeKanbanColumns = computed(() =>
  kanbanMode.value === 'program' ? programKanbanColumns.value : levelKanbanColumns.value,
)

const onCardDragStart = (cardKey: string, e: DragEvent) => {
  kanbanAssignError.value = ''
  draggingCardKey.value = cardKey
  e.dataTransfer?.setData('text/plain', cardKey)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

const onDragStart = (studentId: string, e: DragEvent) => {
  onCardDragStart(`profile:${studentId}`, e)
}

const clearDragOverState = () => {
  dragOverColumnId.value = null
  dragOverDepth.value = {}
}

const onDragEnd = () => {
  draggingCardKey.value = null
  clearDragOverState()
}

const onColumnDragEnter = (columnId: string) => {
  if (!draggingCardKey.value) return
  const next = (dragOverDepth.value[columnId] || 0) + 1
  dragOverDepth.value = { ...dragOverDepth.value, [columnId]: next }
  dragOverColumnId.value = columnId
}

const onColumnDragLeave = (columnId: string) => {
  const next = (dragOverDepth.value[columnId] || 0) - 1
  if (next <= 0) {
    const { [columnId]: _, ...rest } = dragOverDepth.value
    dragOverDepth.value = rest
    if (dragOverColumnId.value === columnId) {
      dragOverColumnId.value = Object.keys(rest).length
        ? Object.keys(rest)[Object.keys(rest).length - 1]
        : null
    }
  } else {
    dragOverDepth.value = { ...dragOverDepth.value, [columnId]: next }
  }
}

const onColumnDragOver = (e: DragEvent) => {
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

const onDropColumn = async (columnId: string, e: DragEvent) => {
  e.preventDefault()
  clearDragOverState()
  const cardKey = e.dataTransfer?.getData('text/plain') || draggingCardKey.value
  draggingCardKey.value = null
  if (!cardKey?.startsWith('profile:')) return
  const studentId = cardKey.slice('profile:'.length)

  if (kanbanMode.value === 'program') {
    await assignStudentToProgram(studentId, columnId)
  } else {
    await assignStudentToSkillBand(studentId, columnId)
  }
}

const isColumnDropTarget = (columnId: string) =>
  Boolean(draggingCardKey.value && dragOverColumnId.value === columnId)

const assignGuardianToProfile = async (profileId: string, guardianId: string) => {
  const gid = guardianId || null
  const u = users.value.find(x => x.id === profileId)
  if (!u || u.guardian_user_id === gid) return
  const { error } = await client
    .from('profiles')
    .update({ guardian_user_id: gid })
    .eq('id', profileId)
  if (error) throw error
  u.guardian_user_id = gid
}

const assignStudentToProgram = async (studentId: string, columnId: string) => {
  const u = users.value.find(x => x.id === studentId)
  if (!u) return
  const nextGroupId = columnId === UNASSIGNED_COLUMN ? null : columnId
  if (nextGroupId && isPlanningSkillGroupId(nextGroupId, skillGroupsList.value)) {
    kanbanAssignError.value =
      language.value === 'es'
        ? 'Strength Training es solo planificación — elige un nivel 1–5.'
        : 'Strength Training is planning-only — choose a Level 1–5 program.'
    return
  }
  if (u.skill_group_id === nextGroupId) return

  movingStudentId.value = studentId
  kanbanAssignError.value = ''
  try {
    const { error } = await client
      .from('profiles')
      .update({ skill_group_id: nextGroupId })
      .eq('id', studentId)
    if (error) throw error
    u.skill_group_id = nextGroupId
  } catch (e: any) {
    kanbanAssignError.value =
      e?.message ||
      (language.value === 'es' ? 'No se pudo asignar el programa' : 'Could not assign program')
    console.error('assignStudentToProgram:', e)
  } finally {
    movingStudentId.value = null
  }
}

const assignStudentToSkillBand = async (studentId: string, columnId: string) => {
  const u = users.value.find(x => x.id === studentId)
  if (!u) return
  const nextLevel = columnId === UNASSIGNED_COLUMN ? null : columnId
  if (nextLevel && !SKATER_KANBAN_SKILL_LEVELS.some(l => l.id === nextLevel)) return

  const current = normalizeSkaterSkillLevel(u.skill_level)
  if (current === nextLevel) return

  movingStudentId.value = studentId
  try {
    const { error } = await client
      .from('profiles')
      .update({ skill_level: nextLevel })
      .eq('id', studentId)
    if (error) throw error
    u.skill_level = nextLevel
  } catch (e) {
    console.error('assignStudentToSkillBand:', e)
  } finally {
    movingStudentId.value = null
  }
}

const skaterInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return (parts[0]?.[0] || '?').toUpperCase()
}

// Open edit modal
const openEditModal = (userToEdit: User) => {
  editingUser.value = userToEdit
  newRole.value = userToEdit.role as any
  showEditModal.value = true
}

// Save user role
const saveUserRole = async () => {
  if (!editingUser.value) return
  if (editingUser.value.role === 'admin') {
    showEditModal.value = false
    return
  }
  if (newRole.value === 'admin') {
    return
  }
  if (!editableRoleOptions.value.includes(newRole.value)) {
    return
  }

  saving.value = true
  try {
    const { error } = await client
      .from('profiles')
      .update({ role: newRole.value })
      .eq('id', editingUser.value.id)

    if (error) throw error

    showEditModal.value = false
    editingUser.value = null
    await loadUsers()
  } catch (e) {
    console.error('Error updating user:', e)
  } finally {
    saving.value = false
  }
}

// Toggle user active status
const togglingUserId = ref<string | null>(null)
const toggleUserStatus = async (userToToggle: User) => {
  togglingUserId.value = userToToggle.id
  try {
    const { error } = await client
      .from('profiles')
      .update({ is_active: !userToToggle.is_active })
      .eq('id', userToToggle.id)

    if (error) throw error
    await loadUsers()
  } catch (e) {
    console.error('Error toggling user status:', e)
  } finally {
    togglingUserId.value = null
  }
}

// Add skater — email helpers
function syncSkaterEmailFromNames() {
  if (emailLocalManual.value) return
  newSkaterForm.value.emailLocal = niikEmailLocalFromNames(
    newSkaterForm.value.first_name,
    newSkaterForm.value.last_name,
  )
}

watch(
  () => [newSkaterForm.value.first_name, newSkaterForm.value.last_name],
  () => syncSkaterEmailFromNames(),
)

const previewSkaterEmail = computed(() =>
  buildNiikSkaterEmail(newSkaterForm.value.emailLocal),
)

function syncFamilyEmailFromNames() {
  if (familyEmailManual.value) return
  newFamilyForm.value.emailLocal = niikEmailLocalFromNames(
    newFamilyForm.value.first_name,
    newFamilyForm.value.last_name,
  )
}

watch(
  () => [newFamilyForm.value.first_name, newFamilyForm.value.last_name],
  () => syncFamilyEmailFromNames(),
)

const previewFamilyEmail = computed(() =>
  buildNiikSkaterEmail(newFamilyForm.value.emailLocal),
)

const toggleFamilySkater = (skaterId: string) => {
  const ids = newFamilyForm.value.skater_ids
  const i = ids.indexOf(skaterId)
  if (i >= 0) newFamilyForm.value.skater_ids = ids.filter(id => id !== skaterId)
  else newFamilyForm.value.skater_ids = [...ids, skaterId]
}

const syncFamilySkaters = async (guardianId: string, selectedSkaterIds: string[]) => {
  const selected = new Set(selectedSkaterIds)
  const currentlyLinked = users.value
    .filter(u => u.guardian_user_id === guardianId)
    .map(u => u.id)

  for (const id of currentlyLinked) {
    if (selected.has(id)) continue
    const { error } = await client
      .from('profiles')
      .update({ guardian_user_id: null })
      .eq('id', id)
    if (error) throw error
    const u = users.value.find(x => x.id === id)
    if (u) u.guardian_user_id = null
  }

  for (const id of selectedSkaterIds) {
    if (currentlyLinked.includes(id)) continue
    const { error } = await client
      .from('profiles')
      .update({ guardian_user_id: guardianId })
      .eq('id', id)
    if (error) throw error
    const u = users.value.find(x => x.id === id)
    if (u) u.guardian_user_id = guardianId
  }
}

const openAddFamilyModal = () => {
  editingFamilyId.value = null
  familyEmailManual.value = false
  newFamilyForm.value = {
    first_name: '',
    last_name: '',
    emailLocal: '',
    full_name: '',
    phone: '',
    skater_ids: [],
  }
  addUserError.value = ''
  showAddFamilyModal.value = true
  nextTick(() => syncFamilyEmailFromNames())
}

const openEditFamilyModal = (family: User) => {
  editingFamilyId.value = family.id
  familyEmailManual.value = true
  const local = family.email.replace(/@niikskate\.com$/i, '')
  newFamilyForm.value = {
    first_name: family.first_name || family.full_name.split(/\s+/)[0] || '',
    last_name: family.last_name || family.full_name.split(/\s+/).slice(1).join(' ') || '',
    emailLocal: normalizeNiikEmailLocal(local),
    full_name: family.full_name || '',
    phone: family.phone || '',
    skater_ids: users.value
      .filter(u => u.guardian_user_id === family.id)
      .map(u => u.id),
  }
  addUserError.value = ''
  showAddFamilyModal.value = true
}

const openAddSkaterModal = () => {
  emailLocalManual.value = false
  newSkaterForm.value = {
    emailLocal: '',
    full_name: '',
    first_name: '',
    last_name: '',
    date_of_birth: '',
    phone: '',
    guardian_user_id: '',
  }
  addUserError.value = ''
  showAddSkaterModal.value = true
  nextTick(() => syncSkaterEmailFromNames())
}

const closeAddFamilyModal = () => {
  showAddFamilyModal.value = false
  editingFamilyId.value = null
  addUserError.value = ''
}

const closeAddSkaterModal = () => {
  showAddSkaterModal.value = false
  addUserError.value = ''
}

const submitAddFamily = async () => {
  addUserError.value = ''
  const first = newFamilyForm.value.first_name.trim()
  const last = newFamilyForm.value.last_name.trim()

  if (!first) {
    addUserError.value =
      language.value === 'es' ? 'El nombre del contacto es obligatorio' : 'Contact first name is required'
    return
  }
  // A family exists to hold skaters: the tutor alone has nobody to book for.
  if (!newFamilyForm.value.skater_ids.length) {
    addUserError.value = language.value === 'es'
      ? 'Elige al menos un patinador. Crea primero los patinadores con el botón Patinador y después la familia.'
      : 'Pick at least one skater. Create the skaters first with the Patinador button, then the family.'
    return
  }

  syncFamilyEmailFromNames()
  const emailLocal =
    normalizeNiikEmailLocal(newFamilyForm.value.emailLocal)
    || niikEmailLocalFromNames(first, last)
  const email = buildNiikSkaterEmail(emailLocal)
  if (!emailLocal || !email) {
    addUserError.value =
      language.value === 'es'
        ? 'No se pudo generar el correo. Añade apellido o edita el usuario.'
        : 'Could not build email. Add a last name or edit the username.'
    return
  }

  const displayName =
    newFamilyForm.value.full_name.trim()
    || [first, last].filter(Boolean).join(' ')

  addUserSaving.value = true
  try {
    let guardianId = editingFamilyId.value

    if (guardianId) {
      const { error: upErr } = await client
        .from('profiles')
        .update({
          full_name: displayName,
          first_name: first,
          last_name: last || null,
          phone: newFamilyForm.value.phone.trim() || null,
          // Families created before customer_kind existed are tagged here.
          customer_kind: 'guardian',
        })
        .eq('id', guardianId)
      if (upErr) throw upErr
      const fam = users.value.find(u => u.id === guardianId)
      if (fam) {
        fam.full_name = displayName
        fam.first_name = first
        fam.last_name = last || null
        fam.phone = newFamilyForm.value.phone.trim() || null
      }
    } else {
      const res = await $fetch<{ id: string }>('/api/admin/create-user', {
        method: 'POST',
        headers: await adminAuthHeaders(),
        body: {
          email,
          password: DEFAULT_SKATER_PASSWORD,
          full_name: displayName,
          phone: newFamilyForm.value.phone.trim() || undefined,
          role: 'customer',
          customer_kind: 'guardian',
        },
      })
      guardianId = res.id
    }

    if (guardianId) {
      await syncFamilySkaters(guardianId, newFamilyForm.value.skater_ids)
    }

    const wasEdit = Boolean(editingFamilyId.value)
    closeAddFamilyModal()
    await loadUsers()
    skaterSaveMessage.value =
      language.value === 'es'
        ? wasEdit ? 'Familia actualizada.' : `Familia creada · ${email}`
        : wasEdit ? 'Family updated.' : `Family created · ${email}`
    setTimeout(() => {
      skaterSaveMessage.value = ''
    }, 5000)
  } catch (e: any) {
    addUserError.value = e?.data?.message || e?.message || 'Error saving family'
  } finally {
    addUserSaving.value = false
  }
}

const submitAddSkater = async () => {
  addUserError.value = ''
  const first = newSkaterForm.value.first_name.trim()
  const last = newSkaterForm.value.last_name.trim()

  if (!first) {
    addUserError.value =
      language.value === 'es' ? 'El nombre es obligatorio' : 'First name is required'
    return
  }
  if (!newSkaterForm.value.date_of_birth?.trim()) {
    addUserError.value =
      language.value === 'es'
        ? 'La fecha de nacimiento es obligatoria'
        : 'Date of birth is required'
    return
  }

  syncSkaterEmailFromNames()
  const emailLocal =
    normalizeNiikEmailLocal(newSkaterForm.value.emailLocal) ||
    niikEmailLocalFromNames(first, last)
  const email = buildNiikSkaterEmail(emailLocal)
  if (!emailLocal || !email) {
    addUserError.value =
      language.value === 'es'
        ? 'No se pudo generar el correo. Añade apellido o edita el usuario.'
        : 'Could not build email. Add a last name or edit the username.'
    return
  }

  const fullName = [first, last].filter(Boolean).join(' ')

  addUserSaving.value = true
  try {
    await $fetch('/api/admin/create-user', {
      method: 'POST',
      headers: await adminAuthHeaders(),
      body: {
        email,
        password: DEFAULT_SKATER_PASSWORD,
        full_name: fullName,
        date_of_birth: newSkaterForm.value.date_of_birth.trim(),
        phone: newSkaterForm.value.phone.trim() || undefined,
        role: 'customer',
        customer_kind: 'skater',
        guardian_user_id: newSkaterForm.value.guardian_user_id || undefined,
      },
    })
    closeAddSkaterModal()
    await loadUsers()
  } catch (e: any) {
    const msg = e?.data?.message || e?.message || 'Error creating user'
    addUserError.value = msg
  } finally {
    addUserSaving.value = false
  }
}

const deleteSkater = async (u: User) => {
  if (u.role !== 'customer' || u.id === user.value?.id) return
  const msg =
    language.value === 'es'
      ? `¿Eliminar permanentemente a ${u.full_name}? Esta acción no se puede deshacer.`
      : `Permanently delete ${u.full_name}? This cannot be undone.`
  if (!confirm(msg)) return

  deletingUserId.value = u.id
  try {
    await $fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: await adminAuthHeaders(),
      body: { userId: u.id },
    })
    if (expandedSkaterId.value === u.id) expandedSkaterId.value = null
    await loadUsers()
    await loadSkaterMeta()
  } catch (e: any) {
    const errMsg = e?.data?.message || e?.message || 'Error deleting user'
    alert(errMsg)
  } finally {
    deletingUserId.value = null
  }
}

// Format date
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const locale = language.value === 'es' ? es : undefined
  return format(date, 'dd MMM yyyy', { locale })
}

/** Map stored skater_schedule start/end to early | late; legacy values default to early. */
const scheduleToTimeSlot = (sched: User['skater_schedule']): TimeSlot => {
  if (!sched?.start || !sched?.end) return 'early'
  const norm = (t: string) => t.trim().slice(0, 5)
  const s = norm(sched.start)
  const e = norm(sched.end)
  if (s === TIME_SLOT_LABELS.late.start && e === TIME_SLOT_LABELS.late.end) return 'late'
  if (s === TIME_SLOT_LABELS.early.start && e === TIME_SLOT_LABELS.early.end) return 'early'
  return 'early'
}

const preferredSessionOptions = computed(() => {
  const es = language.value === 'es'
  return [
    {
      slot: 'early' as const,
      label: es ? '17:30 – 19:00 (5:30 – 7:00 PM)' : TIME_SLOT_LABELS.early.display,
    },
    {
      slot: 'late' as const,
      label: es ? '19:00 – 20:30 (7:00 – 8:30 PM)' : TIME_SLOT_LABELS.late.display,
    },
  ]
})

const weekdayToggles = computed(() => {
  const es = language.value === 'es'
  return [
    { v: 1, label: es ? 'L' : 'M' },
    { v: 2, label: es ? 'M' : 'T' },
    { v: 3, label: es ? 'X' : 'W' },
    { v: 4, label: es ? 'J' : 'Th' },
    { v: 5, label: es ? 'V' : 'F' },
    { v: 6, label: es ? 'S' : 'Sa' },
    { v: 0, label: es ? 'D' : 'Su' },
  ]
})

const toggleSkaterPanel = (u: User) => {
  if (u.role !== 'customer') return
  if (expandedSkaterId.value === u.id) {
    expandedSkaterId.value = null
    return
  }
  expandedSkaterId.value = u.id
  const sched = u.skater_schedule
  skaterDraft.value = {
    season_slug: seasonSlugFromSchedule(sched),
    timeSlot: scheduleToTimeSlot(sched),
    days: Array.isArray(sched?.days) && sched!.days!.length ? [...sched!.days!] : [1, 2, 3, 4, 5],
    guardian_user_id: u.guardian_user_id || '',
  }
}

const toggleDraftDay = (d: number) => {
  const arr = skaterDraft.value.days
  const i = arr.indexOf(d)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(d)
  skaterDraft.value.days = [...arr].sort((a, b) => a - b)
}

const saveSkaterAssignments = async (u: User) => {
  savingSkaterId.value = u.id
  skaterSaveMessage.value = ''
  try {
    const slot = TIME_SLOT_LABELS[skaterDraft.value.timeSlot]
    const schedule =
      skaterDraft.value.days.length > 0
        ? {
            start: slot.start,
            end: slot.end,
            days: [...skaterDraft.value.days].sort((a, b) => a - b),
            season_slug: skaterDraft.value.season_slug.trim() || null,
          }
        : skaterDraft.value.season_slug.trim()
          ? { season_slug: skaterDraft.value.season_slug.trim() }
          : null

    const { error: upErr } = await client
      .from('profiles')
      .update({
        skater_schedule: schedule,
        guardian_user_id: skaterDraft.value.guardian_user_id || null,
      })
      .eq('id', u.id)

    if (upErr) throw upErr
    u.guardian_user_id = skaterDraft.value.guardian_user_id || null
    u.skater_schedule = schedule

    await loadUsers()

    skaterSaveMessage.value =
      language.value === 'es'
        ? `Cambios guardados para ${u.full_name}.`
        : `Changes saved for ${u.full_name}.`
    expandedSkaterId.value = null
    setTimeout(() => {
      skaterSaveMessage.value = ''
    }, 4000)
  } catch (e) {
    console.error('saveSkaterAssignments:', e)
    alert(
      language.value === 'es'
        ? 'No se pudo guardar. Intenta de nuevo.'
        : 'Could not save. Please try again.',
    )
  } finally {
    savingSkaterId.value = null
  }
}

const scheduleSummary = (u: User) => {
  const s = u.skater_schedule
  if (!s || typeof s !== 'object' || !Array.isArray(s.days) || !s.days.length) return null
  const es = language.value === 'es'
  const labels = es ? ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const days = s.days
    .filter((n: number) => n >= 0 && n <= 6)
    .sort((a: number, b: number) => a - b)
    .map((n: number) => labels[n])
    .join(', ')
  return `${s.start || '—'}–${s.end || '—'} · ${days}`
}
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div class="px-4 py-4 max-w-[1400px] mx-auto">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <button @click="router.push('/member/admin/academy')" class="p-2 -ml-2 text-white flex-shrink-0">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div class="min-w-0">
              <h1 class="text-xl font-bold text-white flex items-center gap-2">
                <span class="text-2xl" aria-hidden="true">🛹</span>
                {{ language === 'es' ? 'Patinadores' : 'Skaters' }}
              </h1>
              <p class="text-sm text-gray-400">
                {{ language === 'es' ? 'Programas, niveles y horario' : 'Programs, levels and schedule' }}
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              @click="openAddFamilyModal"
              class="px-3 py-2 rounded-xl border border-gold-400/60 text-gold-400 font-semibold text-xs sm:text-sm flex items-center gap-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              {{ language === 'es' ? 'Familia' : 'Family' }}
            </button>
            <button
              type="button"
              @click="openAddSkaterModal"
              class="px-3 py-2 rounded-xl bg-gold-400 text-black font-semibold text-xs sm:text-sm flex items-center gap-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              {{ language === 'es' ? 'Patinador' : 'Skater' }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Content -->
    <div v-if="isAdmin" class="px-4 py-6 max-w-[1400px] mx-auto">
      <!-- Search + kanban mode -->
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <div class="relative flex-1">
          <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="language === 'es' ? 'Buscar patinadores...' : 'Search skaters...'"
            class="w-full pl-12 pr-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-white text-sm placeholder-gray-500 focus:border-gold-400 outline-none"
          />
        </div>
        <div class="flex rounded-xl border border-gray-800 overflow-hidden shrink-0">
          <button
            type="button"
            class="px-4 py-2 text-xs font-semibold transition-colors"
            :class="kanbanMode === 'program' ? 'bg-gold-400 text-black' : 'bg-gray-900 text-gray-400'"
            @click="kanbanMode = 'program'"
          >
            {{ language === 'es' ? 'Por programa' : 'By program' }}
          </button>
          <button
            type="button"
            class="px-4 py-2 text-xs font-semibold transition-colors border-l border-gray-800"
            :class="kanbanMode === 'level' ? 'bg-gold-400 text-black' : 'bg-gray-900 text-gray-400'"
            @click="kanbanMode = 'level'"
          >
            {{ language === 'es' ? 'Por nivel' : 'By level' }}
          </button>
        </div>
      </div>

      <p class="text-sm text-gray-400 mb-2">
        🛹 {{ skaterCount }} {{ language === 'es' ? 'patinadores' : 'skaters' }}
        <span class="text-gray-600">·</span>
        <span class="text-gray-500 text-xs">
          {{ language === 'es' ? 'Arrastra las tarjetas entre columnas' : 'Drag cards between columns' }}
        </span>
      </p>
      <p v-if="kanbanAssignError" class="text-sm text-red-400 mb-3">{{ kanbanAssignError }}</p>
      <p v-if="skaterSaveMessage" class="text-sm text-emerald-400 mb-3">{{ skaterSaveMessage }}</p>

      <div v-if="familyAccounts.length" class="mb-4 rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
        <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {{ language === 'es' ? 'Familias' : 'Families' }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="f in familyAccounts"
            :key="f.id"
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-700"
            @click="openEditFamilyModal(f)"
          >
            {{ f.full_name }}
            <span class="text-gray-500 ml-1">
              ({{ users.filter(u => u.guardian_user_id === f.id).length }})
            </span>
          </button>
        </div>
      </div>

      <div
        v-if="inactiveSkaters.length"
        class="mb-4 rounded-xl border border-gray-700 bg-gray-900/80 px-4 py-3"
      >
        <p class="text-sm text-gray-300">
          {{
            language === 'es'
              ? `${inactiveSkaters.length} patinador(es) inactivo(s) — no pueden iniciar sesión hasta activarlos.`
              : `${inactiveSkaters.length} inactive skater(s) — cannot log in until activated.`
          }}
        </p>
        <p class="text-xs text-gray-500 mt-1">
          {{
            language === 'es'
              ? 'En la tarjeta del Kanban: icono de reloj → Activar (botón verde).'
              : 'On their Kanban card: clock icon → Activate (green button).'
          }}
        </p>
        <p class="text-xs text-gray-400 mt-2 truncate">
          {{ inactiveSkaters.map(u => u.full_name).join(' · ') }}
        </p>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="text-center py-12">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
      </div>

      <div v-else-if="filteredUsers.length === 0 && crewMembers.length === 0" class="text-center py-12">
        <p class="text-4xl mb-3">👥</p>
        <p class="text-gray-400">{{ language === 'es' ? 'No hay familias ni patinadores' : 'No families or skaters yet' }}</p>
        <div class="flex justify-center gap-3 mt-4">
          <button type="button" class="px-4 py-2 rounded-xl border border-gold-400/60 text-gold-400 text-sm" @click="openAddFamilyModal">
            {{ language === 'es' ? 'Añadir familia' : 'Add family' }}
          </button>
          <button type="button" class="px-4 py-2 rounded-xl bg-gold-400 text-black text-sm font-semibold" @click="openAddSkaterModal">
            {{ language === 'es' ? 'Añadir patinador' : 'Add skater' }}
          </button>
        </div>
      </div>

      <!-- Kanban board -->
      <div v-else class="overflow-x-auto pb-4 -mx-1 px-1">
        <div class="flex gap-3 min-w-min">
          <div
            v-for="col in activeKanbanColumns"
            :key="col.id"
            class="w-[220px] shrink-0 flex flex-col max-h-[calc(100vh-220px)] rounded-xl transition-all duration-150"
            :class="
              isColumnDropTarget(col.id)
                ? 'ring-2 ring-gold-400/70 shadow-[0_0_20px_rgba(250,204,21,0.15)]'
                : ''
            "
            @dragenter.prevent="onColumnDragEnter(col.id)"
            @dragleave="onColumnDragLeave(col.id)"
            @dragover.prevent="onColumnDragOver"
            @drop.prevent="onDropColumn(col.id, $event)"
          >
            <div
              class="rounded-t-xl px-3 py-2 border border-b-0 border-gray-800 bg-gray-900/90 sticky top-0 transition-colors"
              :class="isColumnDropTarget(col.id) ? 'bg-gold-400/10 border-gold-400/40' : ''"
              :style="col.color ? { borderTopColor: col.color, borderTopWidth: '3px' } : {}"
            >
              <div class="flex items-start justify-between gap-2">
                <p class="text-xs font-bold text-white truncate leading-tight">{{ col.title }}</p>
                <span
                  class="shrink-0 min-w-[1.25rem] text-center text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
                  :class="
                    columnItemCount(col) > 0
                      ? 'bg-gold-400/20 text-gold-300'
                      : 'bg-gray-800 text-gray-500'
                  "
                >
                  {{ columnItemCount(col) }}
                </span>
              </div>
            </div>
            <div
              class="flex-1 overflow-y-auto rounded-b-xl border border-gray-800 p-2 space-y-1.5 min-h-[160px] transition-all duration-150"
              :class="
                isColumnDropTarget(col.id)
                  ? 'bg-gold-400/15 border-gold-400/50 border-dashed'
                  : draggingCardKey
                    ? 'bg-black/30 border-gray-700'
                    : 'bg-black/40'
              "
            >
              <div
                v-for="u in col.students"
                :key="u.id"
                draggable="true"
                class="rounded-lg border border-gray-800 bg-gray-900 px-2 py-1.5 cursor-grab active:cursor-grabbing hover:border-gray-600 transition-all"
                :class="{
                  'opacity-40': draggingCardKey === `profile:${u.id}`,
                  'ring-1 ring-gold-400/50': movingStudentId === u.id,
                  'opacity-60 border-amber-500/30': !u.is_active,
                }"
                @dragstart="onDragStart(u.id, $event)"
                @dragend="onDragEnd"
              >
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded-full bg-glass-blue flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                    {{ skaterInitials(u.full_name) }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-[11px] font-semibold text-white truncate leading-tight">{{ u.full_name }}</p>
                    <p v-if="seasonLabelFor(u)" class="text-[9px] text-gray-500 truncate">
                      {{ seasonLabelFor(u) }}
                    </p>
                    <p v-if="kanbanMode === 'program' && skillBandLabelFor(u)" class="text-[9px] text-gray-500 truncate">
                      {{ skillBandLabelFor(u) }}
                    </p>
                    <p v-else-if="kanbanMode === 'level' && programNameFor(u)" class="text-[9px] text-gray-500 truncate">
                      {{ programNameFor(u) }}
                    </p>
                    <p v-if="familyNameFor(u.guardian_user_id)" class="text-[9px] text-gray-600 truncate">
                      {{ familyNameFor(u.guardian_user_id) }}
                    </p>
                    <p v-if="!u.is_active" class="text-[9px] text-gray-500 uppercase tracking-wide mt-0.5">
                      {{ language === 'es' ? 'Inactivo' : 'Inactive' }}
                    </p>
                  </div>
                  <div class="flex flex-col gap-0.5 shrink-0">
                    <NuxtLink
                      :to="`/member/coach/students/${u.id}`"
                      class="p-1 rounded text-gold-400 hover:bg-gray-800"
                      :title="language === 'es' ? 'Perfil' : 'Profile'"
                      @click.stop
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </NuxtLink>
                    <button
                      type="button"
                      class="p-1 rounded text-gray-500 hover:text-white hover:bg-gray-800"
                      :title="language === 'es' ? 'Horario' : 'Schedule'"
                      @click.stop="toggleSkaterPanel(u)"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="p-1 rounded text-gray-600 hover:bg-red-950/50 hover:text-red-400 disabled:opacity-40"
                      :disabled="deletingUserId === u.id"
                      :title="language === 'es' ? `Eliminar ${u.full_name}` : `Delete ${u.full_name}`"
                      :aria-label="language === 'es' ? `Eliminar ${u.full_name}` : `Delete ${u.full_name}`"
                      @click.stop="deleteSkater(u)"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <p
                v-if="!col.students.length"
                class="text-[10px] text-center py-6 px-2 pointer-events-none"
                :class="isColumnDropTarget(col.id) ? 'text-gold-300 font-semibold' : 'text-gray-600'"
              >
                {{
                  isColumnDropTarget(col.id)
                    ? (language === 'es' ? 'Soltar aquí' : 'Drop here')
                    : (language === 'es' ? 'Arrastra aquí' : 'Drag here')
                }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Schedule panel (expanded skater) -->
      <Teleport to="body">
        <div v-if="expandedSkaterId" class="fixed inset-0 z-50">
          <div
            class="absolute inset-0 bg-black/60"
            aria-hidden="true"
            @click="expandedSkaterId = null"
          />
          <div
            class="fixed inset-x-0 bottom-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:left-auto sm:w-[360px]"
            @click.stop
          >
            <div
              v-for="u in users.filter(x => x.id === expandedSkaterId)"
              :key="u.id"
              class="relative bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 space-y-3"
            >
              <div class="flex items-center justify-between gap-2">
                <p class="text-sm font-semibold text-white truncate">{{ u.full_name }}</p>
                <button type="button" class="text-gray-500 hover:text-white p-1" @click="expandedSkaterId = null">×</button>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">{{ language === 'es' ? 'Familia' : 'Family' }}</label>
            <select
              v-model="skaterDraft.guardian_user_id"
              class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
            >
              <option value="">{{ language === 'es' ? '— Sin asignar —' : '— Unassigned —' }}</option>
              <option v-for="g in guardianOptions" :key="g.id" :value="g.id">{{ g.full_name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">{{ language === 'es' ? 'Temporada' : 'Season' }}</label>
            <select
              v-model="skaterDraft.season_slug"
              class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm"
            >
              <option value="">{{ language === 'es' ? '— Elige temporada —' : '— Select season —' }}</option>
              <option v-for="s in programSeasons" :key="s.slug" :value="s.slug">
                {{ language === 'es' ? s.name.es : s.name.en }}
                · {{ language === 'es' ? s.dates.es : s.dates.en }}
              </option>
            </select>
          </div>
          <div>
            <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {{ language === 'es' ? 'Horario preferido' : 'Schedule' }}
            </p>
            <select
              v-model="skaterDraft.timeSlot"
              class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm mb-2"
            >
              <option v-for="opt in preferredSessionOptions" :key="opt.slot" :value="opt.slot">
                {{ opt.label }}
              </option>
            </select>
            <div class="flex flex-wrap gap-1">
              <button
                v-for="d in weekdayToggles"
                :key="d.v"
                type="button"
                class="w-8 h-8 rounded-lg text-xs font-bold transition-colors"
                :class="skaterDraft.days.includes(d.v) ? 'bg-white text-black' : 'bg-gray-800 text-gray-500 border border-gray-700'"
                @click="toggleDraftDay(d.v)"
              >
                {{ d.label }}
              </button>
            </div>
          </div>
          <div class="space-y-2 pt-1 border-t border-gray-800">
            <div class="flex gap-2">
              <button
                type="button"
                class="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white"
                :disabled="u.is_active || togglingUserId === u.id"
                @click="toggleUserStatus(u)"
              >
                {{ togglingUserId === u.id && !u.is_active ? '…' : (language === 'es' ? 'Activar' : 'Activate') }}
              </button>
              <button
                type="button"
                class="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-red-700 hover:bg-red-600 text-white"
                :disabled="!u.is_active || togglingUserId === u.id"
                @click="toggleUserStatus(u)"
              >
                {{ togglingUserId === u.id && u.is_active ? '…' : (language === 'es' ? 'Desactivar' : 'Deactivate') }}
              </button>
            </div>
            <button
              type="button"
              class="text-xs text-gray-500 hover:text-white px-1 py-0.5"
              @click="openEditModal(u)"
            >
              {{ language === 'es' ? 'Editar rol' : 'Edit role' }}
            </button>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 py-2 rounded-xl bg-white text-black font-semibold text-sm disabled:opacity-50"
              :disabled="savingSkaterId === u.id"
              @click="saveSkaterAssignments(u)"
            >
              {{ savingSkaterId === u.id ? '…' : (language === 'es' ? 'Guardar' : 'Save') }}
            </button>
            <button
              v-if="u.id !== user?.id"
              type="button"
              class="p-2 rounded-xl bg-red-900/30 text-red-400"
              :disabled="deletingUserId === u.id"
              @click="deleteSkater(u)"
            >
              🗑
            </button>
          </div>
            </div>
          </div>
        </div>
      </Teleport>
    </div>

    <!-- Edit Modal -->
    <Teleport to="body">
      <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/80" @click="showEditModal = false"></div>
        <div class="relative bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md w-full">
          <h3 class="text-xl font-bold text-white mb-2">
            {{ language === 'es' ? 'Editar perfil' : 'Edit profile' }}
          </h3>
          <p class="text-gray-400 mb-4">{{ editingUser?.full_name }} ({{ editingUser?.email }})</p>

          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-300 mb-2">
              {{ language === 'es' ? 'Rol' : 'Role' }}
            </label>
            <p v-if="!canEditRole" class="text-sm text-gray-400">
              👑 {{ language === 'es' ? 'Los administradores existentes no pueden cambiar de rol aquí.' : 'Existing admins cannot change role here.' }}
            </p>
            <div v-else class="grid gap-2" :class="editableRoleOptions.length > 1 ? 'grid-cols-2' : 'grid-cols-1'">
              <button
                v-if="editableRoleOptions.includes('customer')"
                type="button"
                @click="newRole = 'customer'"
                class="py-3 rounded-xl font-semibold transition-all flex flex-col items-center gap-1"
                :class="newRole === 'customer' ? 'bg-glass-blue text-white' : 'bg-gray-800 text-gray-400'"
              >
                <span class="text-xl">🛹</span>
                <span class="text-xs">{{ language === 'es' ? 'Patinador' : 'Skater' }}</span>
              </button>
              <button
                v-if="editableRoleOptions.includes('coach')"
                type="button"
                @click="newRole = 'coach'"
                class="py-3 rounded-xl font-semibold transition-all flex flex-col items-center gap-1"
                :class="newRole === 'coach' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
              >
                <span class="text-xl">🎓</span>
                <span class="text-xs">Coach</span>
              </button>
            </div>
          </div>

          <div class="flex gap-3">
            <button
              @click="showEditModal = false"
              class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl"
            >
              {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
            </button>
            <button
              v-if="canEditRole"
              @click="saveUserRole"
              :disabled="saving"
              class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50"
            >
              {{ saving ? '...' : (language === 'es' ? 'Guardar' : 'Save') }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Add Family Modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="showAddFamilyModal" class="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div class="bg-gray-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden border border-gray-800 max-h-[90vh] flex flex-col">
            <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
              <h3 class="text-lg font-bold text-white">
                {{ isEditingFamily ? (language === 'es' ? 'Editar familia' : 'Edit family') : (language === 'es' ? 'Nueva familia' : 'Add family') }}
              </h3>
              <button type="button" @click="closeAddFamilyModal" class="p-2 text-gray-400 hover:text-white">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form @submit.prevent="submitAddFamily" class="p-6 space-y-4 overflow-y-auto">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-400 mb-1">
                    {{ language === 'es' ? 'Nombre contacto *' : 'Contact first name *' }}
                  </label>
                  <input
                    v-model="newFamilyForm.first_name"
                    type="text"
                    required
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-400 mb-1">
                    {{ language === 'es' ? 'Apellido' : 'Last name' }}
                  </label>
                  <input
                    v-model="newFamilyForm.last_name"
                    type="text"
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">
                  {{ language === 'es' ? 'Correo NiikSkate' : 'NiikSkate email' }}
                </label>
                <div
                  v-if="!isEditingFamily"
                  class="flex rounded-xl overflow-hidden border border-gray-700 focus-within:border-gold-400"
                >
                  <input
                    v-model="newFamilyForm.emailLocal"
                    type="text"
                    autocapitalize="none"
                    autocomplete="off"
                    class="flex-1 min-w-0 px-4 py-3 bg-gray-800 text-white placeholder-gray-500 outline-none"
                    :placeholder="language === 'es' ? 'nombre.apellido' : 'firstname.lastname'"
                    @input="familyEmailManual = true"
                  />
                  <span class="px-3 py-3 bg-gray-800/80 text-gray-400 text-sm border-l border-gray-700 shrink-0">
                    @niikskate.com
                  </span>
                </div>
                <p v-else class="px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-mono">
                  {{ previewFamilyEmail }}
                </p>
                <p v-if="previewFamilyEmail && !isEditingFamily" class="text-xs text-gray-500 mt-1">
                  {{ previewFamilyEmail }}
                  <button
                    v-if="familyEmailManual"
                    type="button"
                    class="ml-2 text-gold-400 hover:underline"
                    @click="familyEmailManual = false; syncFamilyEmailFromNames()"
                  >
                    {{ language === 'es' ? 'Regenerar' : 'Regenerate' }}
                  </button>
                </p>
              </div>

              <div v-if="!isEditingFamily">
                <label class="block text-sm font-medium text-gray-400 mb-1">
                  {{ language === 'es' ? 'Contraseña de inicio' : 'Initial password' }}
                </label>
                <p class="px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gold-400 font-mono text-sm">
                  {{ DEFAULT_SKATER_PASSWORD }}
                </p>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">
                  {{ language === 'es' ? 'Nombre de la familia' : 'Family display name' }}
                </label>
                <input
                  v-model="newFamilyForm.full_name"
                  type="text"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                  :placeholder="language === 'es' ? 'Ej. Familia García (opcional)' : 'e.g. Garcia Family (optional)'"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Teléfono' : 'Phone' }}</label>
                <input
                  v-model="newFamilyForm.phone"
                  type="tel"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 outline-none"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-400 mb-2">
                  {{ language === 'es' ? 'Patinadores en esta familia' : 'Skaters in this family' }}
                </label>
                <div
                  v-if="familySkaterPickerOptions.length"
                  class="max-h-[220px] overflow-y-auto rounded-xl border border-gray-700 divide-y divide-gray-800"
                >
                  <label
                    v-for="s in familySkaterPickerOptions"
                    :key="s.id"
                    class="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      class="rounded border-gray-600 text-gold-400 focus:ring-gold-400"
                      :checked="newFamilyForm.skater_ids.includes(s.id)"
                      @change="toggleFamilySkater(s.id)"
                    />
                    <span class="flex-1 min-w-0 text-sm text-white truncate">{{ s.full_name }}</span>
                    <span
                      v-if="s.guardian_user_id && s.guardian_user_id !== editingFamilyId"
                      class="text-[10px] text-amber-400/90 shrink-0"
                    >
                      {{ familyNameFor(s.guardian_user_id) }}
                    </span>
                  </label>
                </div>
                <p
                  v-else
                  class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                  {{
                    language === 'es'
                      ? 'Aún no hay patinadores registrados. Cierra esta ventana, crea los patinadores con el botón Patinador y vuelve a crear la familia.'
                      : 'No skaters registered yet. Close this window, create the skaters with the Patinador button, then create the family.'
                  }}
                </p>
                <p class="text-xs text-gray-500 mt-1">
                  {{
                    language === 'es'
                      ? 'Marca para asignar; desmarca para quitar de la familia. Se requiere al menos uno.'
                      : 'Check to assign; uncheck to remove from family. At least one is required.'
                  }}
                </p>
              </div>

              <p class="text-xs text-gray-500">
                {{
                  language === 'es'
                    ? 'Cuenta de padre/madre para gestionar patinadores. Correo @niikskate.com y contraseña predeterminada.'
                    : 'Parent account to manage skaters. @niikskate.com email and default password.'
                }}
              </p>
              <div v-if="addUserError" class="text-sm text-red-400">{{ addUserError }}</div>
              <div class="flex gap-3 pt-2">
                <button type="button" @click="closeAddFamilyModal" class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl">
                  {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
                </button>
                <button type="submit" :disabled="addUserSaving" class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50">
                  {{
                    addUserSaving
                      ? '...'
                      : isEditingFamily
                        ? (language === 'es' ? 'Guardar' : 'Save')
                        : (language === 'es' ? 'Crear familia' : 'Create family')
                  }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Add Skater Modal -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-200"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div v-if="showAddSkaterModal" class="fixed inset-0 bg-black/80 z-50 flex items-end sm:items-center justify-center p-4">
          <div class="bg-gray-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden border border-gray-800 max-h-[90vh] flex flex-col">
            <div class="px-6 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
              <h3 class="text-lg font-bold text-white">
                {{ language === 'es' ? 'Nuevo patinador' : 'Add skater' }}
              </h3>
              <button type="button" @click="closeAddSkaterModal" class="p-2 text-gray-400 hover:text-white">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form @submit.prevent="submitAddSkater" class="p-6 space-y-4 overflow-y-auto">
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-400 mb-1">
                    {{ language === 'es' ? 'Nombre *' : 'First name *' }}
                  </label>
                  <input
                    v-model="newSkaterForm.first_name"
                    type="text"
                    required
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-400 mb-1">
                    {{ language === 'es' ? 'Apellido' : 'Last name' }}
                  </label>
                  <input
                    v-model="newSkaterForm.last_name"
                    type="text"
                    class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none"
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">
                  {{ language === 'es' ? 'Familia (opcional)' : 'Family (optional)' }}
                </label>
                <select
                  v-model="newSkaterForm.guardian_user_id"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none"
                >
                  <option value="">
                    {{ language === 'es' ? '— Sin asignar —' : '— Unassigned —' }}
                  </option>
                  <option v-for="g in guardianOptions" :key="g.id" :value="g.id">{{ g.full_name }}</option>
                </select>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">
                  {{ language === 'es' ? 'Correo NiikSkate' : 'NiikSkate email' }}
                </label>
                <div class="flex rounded-xl overflow-hidden border border-gray-700 focus-within:border-gold-400">
                  <input
                    v-model="newSkaterForm.emailLocal"
                    type="text"
                    autocapitalize="none"
                    autocomplete="off"
                    class="flex-1 min-w-0 px-4 py-3 bg-gray-800 text-white placeholder-gray-500 outline-none"
                    :placeholder="language === 'es' ? 'nombre.apellido' : 'firstname.lastname'"
                    @input="emailLocalManual = true"
                  />
                  <span class="px-3 py-3 bg-gray-800/80 text-gray-400 text-sm border-l border-gray-700 shrink-0">
                    @niikskate.com
                  </span>
                </div>
                <p v-if="previewSkaterEmail" class="text-xs text-gray-500 mt-1">
                  {{ previewSkaterEmail }}
                  <button
                    v-if="emailLocalManual"
                    type="button"
                    class="ml-2 text-gold-400 hover:underline"
                    @click="emailLocalManual = false; syncSkaterEmailFromNames()"
                  >
                    {{ language === 'es' ? 'Regenerar' : 'Regenerate' }}
                  </button>
                </p>
                <p v-else class="text-xs text-gray-500 mt-1">
                  {{
                    language === 'es'
                      ? 'Se genera automáticamente como nombre.apellido'
                      : 'Auto-generated as firstname.lastname'
                  }}
                </p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">
                  {{ language === 'es' ? 'Contraseña de inicio' : 'Initial password' }}
                </label>
                <p class="px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-gold-400 font-mono text-sm">
                  {{ DEFAULT_SKATER_PASSWORD }}
                </p>
                <p class="text-xs text-gray-500 mt-1">
                  {{
                    language === 'es'
                      ? 'Contraseña predeterminada para todas las cuentas nuevas de patinador.'
                      : 'Default password for all new skater accounts.'
                  }}
                </p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">{{ language === 'es' ? 'Teléfono' : 'Phone' }}</label>
                <input
                  v-model="newSkaterForm.phone"
                  type="tel"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none"
                />
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1">
                  {{ language === 'es' ? 'Fecha de nacimiento *' : 'Date of birth *' }}
                </label>
                <input
                  v-model="newSkaterForm.date_of_birth"
                  type="date"
                  required
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-gold-400 outline-none [color-scheme:dark]"
                />
                <p
                  v-if="newSkaterForm.date_of_birth && computeAgeFromDob(newSkaterForm.date_of_birth) != null"
                  class="text-xs text-gray-500 mt-1"
                >
                  {{
                    language === 'es'
                      ? `Edad: ${computeAgeFromDob(newSkaterForm.date_of_birth)} años`
                      : `Age: ${computeAgeFromDob(newSkaterForm.date_of_birth)} years old`
                  }}
                </p>
              </div>

              <p class="text-xs text-gray-500">
                {{
                  language === 'es'
                    ? 'Correo nombre.apellido@niikskate.com generado automáticamente. Queda pendiente hasta activar.'
                    : 'Email auto-generated as firstname.lastname@niikskate.com. Pending until activated.'
                }}
              </p>
              <div v-if="addUserError" class="text-sm text-red-400">{{ addUserError }}</div>
              <div class="flex gap-3 pt-2">
                <button type="button" @click="closeAddSkaterModal" class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl">
                  {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
                </button>
                <button
                  type="submit"
                  :disabled="addUserSaving"
                  class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50"
                >
                  {{ addUserSaving ? '...' : (language === 'es' ? 'Crear patinador' : 'Create skater') }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
