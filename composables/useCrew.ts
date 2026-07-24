import { computeAgeFromDob } from '~/utils/ageEligibility'

export type CrewMemberRow = {
  id: string
  guardian_user_id: string
  first_name: string
  last_name: string | null
  full_name: string | null
  date_of_birth: string | null
  age: number | null
  avatar_url: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export type CrewParticipant = {
  key: string
  type: 'self' | 'crew'
  crewMemberId: string | null
  firstName: string
  displayName: string
  dateOfBirth: string | null
  age: number | null
  avatarUrl: string | null
  isYou: boolean
}

export type CrewMemberInput = {
  first_name: string
  last_name?: string
  date_of_birth?: string | null
  age?: number | null
}

export type GuardianProfileRow = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  date_of_birth: string | null
  age: number | null
  avatar_url: string | null
  skill_level: string | null
  email: string | null
  phone: string | null
}

const STORAGE_KEY = 'niik-active-crew'

function buildFullName(first: string, last?: string | null) {
  return [first.trim(), last?.trim()].filter(Boolean).join(' ')
}

export function useCrew() {
  const client = useSupabaseClient()
  const user = useSupabaseUser()
  const { language } = useI18n()

  const loading = useState('crew-loading', () => false)
  const crewMembers = useState<CrewMemberRow[]>('crew-members', () => [])
  const guardianProfile = useState<GuardianProfileRow | null>('crew-guardian-profile', () => null)
  const activeKey = useState<string>('crew-active-key', () => 'self')
  const bootstrapped = useState('crew-bootstrapped', () => false)

  const participants = computed((): CrewParticipant[] => {
    const list: CrewParticipant[] = []
    if (guardianProfile.value) {
      const g = guardianProfile.value
      const first = g.first_name?.trim() || g.full_name?.split(' ')[0] || 'You'
      list.push({
        key: 'self',
        type: 'self',
        crewMemberId: null,
        firstName: first,
        displayName: g.full_name?.trim() || first,
        dateOfBirth: g.date_of_birth,
        age: computeAgeFromDob(g.date_of_birth, g.age),
        avatarUrl: g.avatar_url,
        isYou: true,
      })
    }
    for (const m of crewMembers.value) {
      const first =
        m.first_name?.trim()
        || m.full_name?.trim()?.split(/\s+/)[0]
        || 'Skater'
      list.push({
        key: m.id,
        type: 'crew',
        crewMemberId: m.id,
        firstName: first,
        displayName: m.full_name?.trim() || buildFullName(first, m.last_name),
        dateOfBirth: m.date_of_birth,
        age: computeAgeFromDob(m.date_of_birth, m.age),
        avatarUrl: m.avatar_url,
        isYou: false,
      })
    }
    return list
  })

  const activeParticipant = computed(() => {
    return participants.value.find(p => p.key === activeKey.value) ?? participants.value[0] ?? null
  })

  const activeAge = computed(() => activeParticipant.value?.age ?? null)
  const crewCount = computed(() => participants.value.length)

  function persistActiveKey(key: string) {
    activeKey.value = key
    if (import.meta.client) {
      try {
        localStorage.setItem(STORAGE_KEY, key)
      } catch {
        /* ignore */
      }
    }
  }

  function restoreActiveKey() {
    if (!import.meta.client) return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved && (saved === 'self' || crewMembers.value.some(m => m.id === saved))) {
        activeKey.value = saved
      }
    } catch {
      /* ignore */
    }
  }

  function setActive(key: string) {
    if (participants.value.some(p => p.key === key)) {
      persistActiveKey(key)
    }
  }

  async function loadGuardianProfile() {
    const uid = user.value?.id
    if (!uid) {
      guardianProfile.value = null
      return
    }
    const { data } = await client
      .from('profiles')
      .select(
        'id, first_name, last_name, full_name, date_of_birth, age, avatar_url, skill_level, email, phone',
      )
      .eq('id', uid)
      .single()
    guardianProfile.value = data ?? null
  }

  async function loadCrewMembers() {
    const uid = user.value?.id
    if (!uid) {
      crewMembers.value = []
      return
    }
    const { data, error } = await client
      .from('crew_members')
      .select('*')
      .eq('guardian_user_id', uid)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) {
      console.error('loadCrewMembers:', error)
      crewMembers.value = []
      return
    }
    crewMembers.value = (data || []) as CrewMemberRow[]
  }

  async function refreshCrew() {
    loading.value = true
    try {
      await Promise.all([loadGuardianProfile(), loadCrewMembers()])
      restoreActiveKey()
      if (!participants.value.some(p => p.key === activeKey.value)) {
        persistActiveKey('self')
      }
    } finally {
      loading.value = false
    }
  }

  async function addCrewMember(input: CrewMemberInput) {
    const uid = user.value?.id
    if (!uid) throw new Error(language.value === 'es' ? 'Inicia sesión' : 'Sign in required')
    const first = input.first_name.trim()
    if (!first) throw new Error(language.value === 'es' ? 'Nombre requerido' : 'First name required')

    const payload = {
      guardian_user_id: uid,
      first_name: first,
      last_name: input.last_name?.trim() || null,
      full_name: buildFullName(first, input.last_name),
      date_of_birth: input.date_of_birth || null,
      age: input.age ?? computeAgeFromDob(input.date_of_birth ?? null, input.age),
      sort_order: crewMembers.value.length,
    }

    const { data, error } = await client.from('crew_members').insert(payload).select('*').single()
    if (error) throw new Error(error.message)
    crewMembers.value = [...crewMembers.value, data as CrewMemberRow]
    persistActiveKey(data.id)
    return data as CrewMemberRow
  }

  async function updateCrewMember(id: string, input: Partial<CrewMemberInput>) {
    const existing = crewMembers.value.find(m => m.id === id)
    if (!existing) throw new Error('Not found')

    const first = input.first_name?.trim() ?? existing.first_name
    const last = input.last_name !== undefined ? input.last_name?.trim() || null : existing.last_name
    const dob = input.date_of_birth !== undefined ? input.date_of_birth : existing.date_of_birth
    const age =
      input.age !== undefined ? input.age : computeAgeFromDob(dob, existing.age)

    const payload = {
      first_name: first,
      last_name: last,
      full_name: buildFullName(first, last),
      date_of_birth: dob,
      age,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await client
      .from('crew_members')
      .update(payload)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    crewMembers.value = crewMembers.value.map(m => (m.id === id ? (data as CrewMemberRow) : m))
    return data as CrewMemberRow
  }

  async function deleteCrewMember(id: string) {
    const { error } = await client.from('crew_members').delete().eq('id', id)
    if (error) throw new Error(error.message)
    crewMembers.value = crewMembers.value.filter(m => m.id !== id)
    if (activeKey.value === id) persistActiveKey('self')
  }

  async function updateGuardianProfile(input: {
    first_name?: string
    last_name?: string
    date_of_birth?: string | null
    age?: number | null
    phone?: string | null
  }) {
    const uid = user.value?.id
    if (!uid) throw new Error(language.value === 'es' ? 'Inicia sesión' : 'Sign in required')

    const g = guardianProfile.value
    const first = input.first_name?.trim() ?? g?.first_name ?? ''
    const last = input.last_name !== undefined ? input.last_name?.trim() || null : g?.last_name ?? null
    const dob = input.date_of_birth !== undefined ? input.date_of_birth : g?.date_of_birth ?? null
    const age = input.age !== undefined ? input.age : computeAgeFromDob(dob, g?.age ?? null)

    const payload: Record<string, unknown> = {
      first_name: first || null,
      last_name: last,
      full_name: buildFullName(first || g?.full_name?.split(' ')[0] || 'Member', last),
      date_of_birth: dob,
      age,
    }
    if (input.phone !== undefined) payload.phone = input.phone

    const { data, error } = await client
      .from('profiles')
      .update(payload)
      .eq('id', uid)
      .select(
        'id, first_name, last_name, full_name, date_of_birth, age, avatar_url, skill_level, email, phone',
      )
      .single()
    if (error) throw new Error(error.message)
    guardianProfile.value = data
    return data
  }

  if (!bootstrapped.value) {
    bootstrapped.value = true
    watch(
      () => user.value?.id,
      id => {
        if (id) refreshCrew()
        else {
          crewMembers.value = []
          guardianProfile.value = null
          persistActiveKey('self')
        }
      },
      { immediate: true },
    )
  }

  return {
    loading,
    crewMembers,
    guardianProfile,
    participants,
    activeKey,
    activeParticipant,
    activeAge,
    crewCount,
    setActive,
    refreshCrew,
    addCrewMember,
    updateCrewMember,
    deleteCrewMember,
    updateGuardianProfile,
  }
}
