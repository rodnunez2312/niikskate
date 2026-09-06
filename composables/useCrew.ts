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

/**
 * A skater with their own login whose profile an admin linked to this guardian
 * (profiles.guardian_user_id). Unlike a crew member they own their account, so
 * the family screen shows them but does not let the parent edit or delete them.
 */
export type LinkedSkaterRow = {
  id: string
  first_name: string | null
  last_name: string | null
  full_name: string | null
  date_of_birth: string | null
  age: number | null
  avatar_url: string | null
  skill_level: string | null
}

export type CrewParticipant = {
  key: string
  type: 'self' | 'crew' | 'skater'
  crewMemberId: string | null
  /** Set only for 'skater': the profiles.id to book the class against. */
  skaterProfileId: string | null
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
  /** 'guardian' = books for the family and never skates. */
  customer_kind: string | null
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
  const linkedSkaters = useState<LinkedSkaterRow[]>('crew-linked-skaters', () => [])
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
        skaterProfileId: null,
        firstName: first,
        displayName: g.full_name?.trim() || first,
        dateOfBirth: g.date_of_birth,
        age: computeAgeFromDob(g.date_of_birth, g.age),
        avatarUrl: g.avatar_url,
        isYou: true,
      })
    }
    for (const s of linkedSkaters.value) {
      const first =
        s.first_name?.trim()
        || s.full_name?.trim()?.split(/\s+/)[0]
        || 'Skater'
      list.push({
        key: s.id,
        type: 'skater',
        crewMemberId: null,
        skaterProfileId: s.id,
        firstName: first,
        displayName: s.full_name?.trim() || buildFullName(first, s.last_name),
        dateOfBirth: s.date_of_birth,
        age: computeAgeFromDob(s.date_of_birth, s.age),
        avatarUrl: s.avatar_url,
        isYou: false,
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
        skaterProfileId: null,
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

  /** A parent/tutor account manages the family but never rides. */
  const isGuardianAccount = computed(
    () => guardianProfile.value?.customer_kind === 'guardian',
  )

  /**
   * Everyone the account can actually book a class or track progress for. The
   * guardian drops out of this list; they stay in `participants` because the
   * Familia screen still has to show who the tutor is.
   */
  const skaterParticipants = computed(() =>
    isGuardianAccount.value
      ? participants.value.filter(p => p.type !== 'self')
      : participants.value,
  )

  const activeParticipant = computed(() => {
    const pool = skaterParticipants.value
    return pool.find(p => p.key === activeKey.value) ?? pool[0] ?? null
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
      const known =
        saved === 'self'
        || crewMembers.value.some(m => m.id === saved)
        || linkedSkaters.value.some(s => s.id === saved)
      if (saved && known) {
        activeKey.value = saved
      }
    } catch {
      /* ignore */
    }
  }

  function setActive(key: string) {
    if (skaterParticipants.value.some(p => p.key === key)) {
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
        'id, first_name, last_name, full_name, date_of_birth, age, avatar_url, skill_level, email, phone, customer_kind',
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

  /** Skaters an admin attached to this guardian on the Familia screen. */
  async function loadLinkedSkaters() {
    const uid = user.value?.id
    if (!uid) {
      linkedSkaters.value = []
      return
    }
    const { data, error } = await client
      .from('profiles')
      .select('id, first_name, last_name, full_name, date_of_birth, age, avatar_url, skill_level')
      .eq('guardian_user_id', uid)
      // A profile pointing at itself would otherwise show up twice as "self".
      .neq('id', uid)
      .order('first_name', { ascending: true })
    if (error) {
      console.error('loadLinkedSkaters:', error)
      linkedSkaters.value = []
      return
    }
    linkedSkaters.value = (data || []) as LinkedSkaterRow[]
  }

  async function refreshCrew() {
    loading.value = true
    try {
      await Promise.all([loadGuardianProfile(), loadCrewMembers(), loadLinkedSkaters()])
      restoreActiveKey()
      // 'self' is not a valid choice on a guardian account, so land on a skater.
      if (!skaterParticipants.value.some(p => p.key === activeKey.value)) {
        persistActiveKey(skaterParticipants.value[0]?.key ?? 'self')
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
        'id, first_name, last_name, full_name, date_of_birth, age, avatar_url, skill_level, email, phone, customer_kind',
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
    linkedSkaters,
    guardianProfile,
    participants,
    skaterParticipants,
    isGuardianAccount,
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
