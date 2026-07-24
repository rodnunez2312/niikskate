<script setup lang="ts">
import { startOfDay, format } from 'date-fns'
import type { DayBookingState } from '~/components/profile/AttendanceMonthMini.vue'
import SkaterProfileCard from '~/components/home/SkaterProfileCard.vue'

const router = useRouter()
const client = useSupabaseClient()
const user = useSupabaseUser()
const { language } = useI18n()

interface Profile {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  phone?: string
  role: string
  bio?: string
  specialties?: string[]
}

const profile = ref<Profile | null>(null)
const loading = ref(true)
const saving = ref(false)
const editMode = ref(false)

/** Full calendar: attended (green) > admin_confirmed (blue) > requested (yellow) */
const calendarDayStates = ref<Map<string, DayBookingState>>(new Map())
const loadingAttendance = ref(false)

/** Quick summary (non-interactive) */
const summaryReserved = ref(0)
const summaryAttended = ref(0)
const summaryMissed = ref(0)

const editForm = ref({
  full_name: '',
  phone: '',
})

// Redirect guests to news page
watch(user, (newUser) => {
  if (!newUser) {
    router.push('/news')
  }
}, { immediate: true })

const loadProfilePageData = async () => {
  if (!user.value?.id) return
  await Promise.all([fetchProfile(), fetchCalendarDayStates()])
}

onMounted(() => {
  loadProfilePageData()
})

// Supabase user can hydrate after first paint; ensure fetches run once session exists
watch(
  () => user.value?.id,
  (id, prev) => {
    if (id && id !== prev) loadProfilePageData()
  },
  { immediate: false },
)

const fetchCalendarDayStates = async () => {
  if (!user.value?.id) return
  loadingAttendance.value = true
  try {
    const uid = user.value.id
    const [attAllRes, resvResFull] = await Promise.all([
      client.from('attendance').select('class_date, attended').eq('student_id', uid),
      client.from('class_reservations').select('reservation_date, workflow_status, status').eq('user_id', uid),
    ])

    if (attAllRes.error) throw attAllRes.error

    let rows = resvResFull.data
    if (resvResFull.error) {
      const fallback = await client.from('class_reservations').select('reservation_date, status').eq('user_id', uid)
      if (fallback.error) throw fallback.error
      rows = (fallback.data || []).map((r: { reservation_date: string; status: string }) => ({
        ...r,
        workflow_status: null as string | null,
      }))
    }

    const attByDate = new Map<string, boolean>()
    for (const a of attAllRes.data || []) {
      const d = a.class_date as string
      if (attByDate.get(d) === true) continue
      attByDate.set(d, a.attended === true)
    }

    const m = new Map<string, DayBookingState>()
    const todayStr = format(startOfDay(new Date()), 'yyyy-MM-dd')

    for (const r of rows || []) {
      const row = r as { reservation_date: string; status: string; workflow_status?: string | null }
      if (row.status === 'cancelled') continue
      const k = row.reservation_date
      let wf: 'admin_confirmed' | 'requested' = 'requested'
      if (row.workflow_status === 'admin_confirmed') wf = 'admin_confirmed'
      else if (!row.workflow_status && ['active', 'pending_skater_confirm'].includes(row.status)) {
        wf = 'admin_confirmed'
      }
      const cur = m.get(k)
      if (cur === 'attended') continue
      if (!cur) m.set(k, wf)
      else if (cur === 'requested' && wf === 'admin_confirmed') m.set(k, 'admin_confirmed')
    }

    for (const [d, went] of attByDate) {
      if (went) m.set(d, 'attended')
    }

    const missed = new Set<string>()
    const reservedDates = new Set<string>()
    for (const r of rows || []) {
      const row = r as { reservation_date: string; status: string }
      if (row.status === 'cancelled') continue
      const d = row.reservation_date
      reservedDates.add(d)
      const went = attByDate.get(d)
      if (went === true) continue
      if (went === false) {
        missed.add(d)
        continue
      }
      if (d < todayStr) missed.add(d)
    }

    calendarDayStates.value = m
    summaryReserved.value = reservedDates.size
    summaryAttended.value = [...attByDate].filter(([, went]) => went === true).length
    summaryMissed.value = missed.size
  } catch (e) {
    console.error('Error fetching calendar state:', e)
    calendarDayStates.value = new Map()
    summaryReserved.value = 0
    summaryAttended.value = 0
    summaryMissed.value = 0
  } finally {
    loadingAttendance.value = false
  }
}


const fetchProfile = async () => {
  loading.value = true
  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.value?.id)
      .single()

    if (error) throw error
    profile.value = data
    editForm.value = {
      full_name: data.full_name || '',
      phone: data.phone || '',
    }
  } catch (e) {
    console.error('Error fetching profile:', e)
  } finally {
    loading.value = false
  }
}

const saveProfile = async () => {
  saving.value = true
  try {
    const { error } = await client
      .from('profiles')
      .update({
        full_name: editForm.value.full_name,
        phone: editForm.value.phone,
      })
      .eq('id', user.value?.id)

    if (error) throw error
    
    await fetchProfile()
    editMode.value = false
  } catch (e) {
    console.error('Error saving profile:', e)
  } finally {
    saving.value = false
  }
}

const handleLogout = async () => {
  await client.auth.signOut()
  router.push('/')
}

// Accesos: coach/admin tools only (Tips & Help shortcuts removed per request)
const menuItems = computed(() => {
  const items: { icon: string; label: string; path: string; disabled: boolean }[] = []

  // Add coach links
  if (profile.value?.role === 'coach' || profile.value?.role === 'admin') {
    items.push({
      icon: '📅',
      label: language.value === 'es' ? 'Mi Disponibilidad' : 'My Availability',
      path: '/coach/availability',
      disabled: false,
    })
    items.push({
      icon: '📋',
      label: language.value === 'es' ? 'Planeación de Clases' : 'Class Planning',
      path: '/coach/planning',
      disabled: false,
    })
    items.push({
      icon: '👨‍🎓',
      label: language.value === 'es' ? 'Mis Estudiantes' : 'My Students',
      path: '/coach/students',
      disabled: false,
    })
  }

  // Add admin links
  if (profile.value?.role === 'admin') {
    items.push({
      icon: '⚙️',
      label: language.value === 'es' ? 'Panel de Admin' : 'Admin Dashboard',
      path: '/member/admin/academy/dashboard',
      disabled: false,
    })
  }

  return items
})

const roleLabels: Record<string, { en: string; es: string }> = {
  admin: { en: 'Administrator', es: 'Administrador' },
  coach: { en: 'Coach', es: 'Coach' },
  customer: { en: 'Skater', es: 'Patinador' },
}

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-flame-600 text-white',
  coach: 'bg-gold-400 text-black',
  customer: 'bg-glass-blue text-white',
}

</script>

<template>
  <div class="min-h-screen bg-black">
    <!-- Header -->
      <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white px-4 pt-safe pb-24 rounded-b-3xl relative overflow-hidden">
        <!-- Background decoration -->
        <div class="absolute inset-0 opacity-10">
          <div class="absolute top-10 right-10 text-8xl transform rotate-12">🛹</div>
        </div>
        
        <div class="max-w-lg mx-auto relative z-10 pt-4">
          <div class="flex items-center justify-between mb-6">
            <h1 class="text-2xl font-bold">{{ language === 'es' ? 'Perfil' : 'Profile' }}</h1>
            <button
              v-if="!editMode && !loading && profile?.role && profile.role !== 'customer'"
              @click="editMode = true"
              class="text-white/80 hover:text-white"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div class="px-4 -mt-16 max-w-lg mx-auto pb-24 relative z-20">
        <!-- Tony Hawk–style skater card (progress / tap → full progress page) -->
        <SkaterProfileCard
          v-if="!loading && profile?.role === 'customer'"
          class="mb-4"
        />

        <!-- Reservations panel: summary + full calendar -->
        <template v-if="profile?.role === 'customer'">
          <div
            class="mb-4 rounded-2xl border border-gray-800 bg-gray-900/95 p-4 shadow-2xl backdrop-blur-sm ring-1 ring-white/5"
          >
            <div class="mb-4 grid grid-cols-3 gap-2">
              <div class="rounded-xl bg-gray-800/90 px-2 py-3 text-center ring-1 ring-gold-400/25">
                <p class="text-xl font-black text-gold-400 tabular-nums">{{ loadingAttendance ? '—' : summaryReserved }}</p>
                <span class="mt-1 block text-[9px] font-bold uppercase leading-tight text-gray-400">
                  {{ language === 'es' ? 'Reservadas' : 'Reserved' }}
                </span>
              </div>
              <div class="rounded-xl bg-gray-800/90 px-2 py-3 text-center ring-1 ring-glass-green/30">
                <p class="text-xl font-black text-glass-green tabular-nums">{{ loadingAttendance ? '—' : summaryAttended }}</p>
                <span class="mt-1 block text-[9px] font-bold uppercase leading-tight text-gray-400">
                  {{ language === 'es' ? 'Asistidas' : 'Attended' }}
                </span>
              </div>
              <div class="rounded-xl bg-gray-800/90 px-2 py-3 text-center ring-1 ring-rose-500/30">
                <p class="text-xl font-black text-rose-300 tabular-nums">{{ loadingAttendance ? '—' : summaryMissed }}</p>
                <span class="mt-1 block text-[9px] font-bold uppercase leading-tight text-gray-400">
                  {{ language === 'es' ? 'No asistió' : 'Not attended' }}
                </span>
              </div>
            </div>
            <div v-if="loadingAttendance" class="h-40 rounded-xl bg-gray-800 animate-pulse" />
            <ProfileAttendanceMonthMini
              v-else
              embedded
              :day-states="calendarDayStates"
              calendar-mode="reserved"
              class="mt-1"
            />
            <NuxtLink
              to="/bookings"
              class="mt-3 block text-center text-gold-400/90 text-xs font-semibold hover:text-gold-300 transition-colors"
            >
              {{ language === 'es' ? 'Toca para ver mis reservas →' : 'Tap to view my reservations →' }}
            </NuxtLink>
          </div>
        </template>

        <!-- Duplicate profile card: hidden for skaters (Tony Hawk card + summary above). Coach/admin keep full card. -->
        <div
          v-if="profile && (profile.role !== 'customer' || editMode)"
          class="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl"
        >
          <!-- Loading State -->
          <div v-if="loading" class="animate-pulse">
            <div class="flex items-center gap-4 mb-4">
              <div class="w-20 h-20 rounded-full bg-gray-800"></div>
              <div class="space-y-2">
                <div class="h-5 bg-gray-800 rounded w-32"></div>
                <div class="h-4 bg-gray-800 rounded w-48"></div>
              </div>
            </div>
          </div>

          <!-- Profile Info (staff only — skaters use SkaterProfileCard) -->
          <template v-else-if="profile && !editMode && profile.role !== 'customer'">
            <div class="flex items-center gap-4 mb-6">
              <div class="w-20 h-20 rounded-full bg-gradient-to-br from-gold-400 to-gold-600 flex items-center justify-center text-3xl ring-4 ring-gold-400/30">
                {{ profile.full_name?.charAt(0)?.toUpperCase() || '🛹' }}
              </div>
              <div>
                <h2 class="text-xl font-bold text-white">{{ profile.full_name }}</h2>
                <p class="text-gray-400">{{ profile.email }}</p>
                <span :class="['px-3 py-1 rounded-full text-xs font-bold mt-2 inline-block', roleBadgeColors[profile.role] || 'bg-gray-700 text-white']">
                  {{ roleLabels[profile.role]?.[language] || profile.role }}
                </span>
              </div>
            </div>

            <div class="space-y-3 border-t border-gray-800 pt-4">
              <div class="flex items-center gap-3 text-gray-300">
                <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span>{{ profile.email }}</span>
              </div>
              <div class="flex items-center gap-3 text-gray-300">
                <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>{{ profile.phone || (language === 'es' ? 'Sin teléfono' : 'No phone added') }}</span>
              </div>
            </div>
          </template>

        <!-- Edit Form (skaters: name/phone only in this card; staff: same) -->
        <template v-else-if="editMode">
          <form @submit.prevent="saveProfile" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Nombre completo' : 'Full Name' }}
              </label>
              <input
                v-model="editForm.full_name"
                type="text"
                required
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none"
                :placeholder="language === 'es' ? 'Tu nombre completo' : 'Your full name'"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                {{ language === 'es' ? 'Teléfono' : 'Phone' }}
              </label>
              <input
                v-model="editForm.phone"
                type="tel"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-gold-400 focus:ring-1 focus:ring-gold-400 outline-none"
                :placeholder="language === 'es' ? 'Tu número de teléfono' : 'Your phone number'"
              />
            </div>

            <div class="flex gap-3 pt-2">
              <button
                type="button"
                @click="editMode = false"
                class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl hover:bg-gray-700 transition-all"
              >
                {{ language === 'es' ? 'Cancelar' : 'Cancel' }}
              </button>
              <button
                type="submit"
                :disabled="saving"
                class="flex-1 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold rounded-xl"
              >
                {{ saving ? (language === 'es' ? 'Guardando...' : 'Saving...') : (language === 'es' ? 'Guardar' : 'Save') }}
              </button>
            </div>
          </form>
        </template>
      </div>

      <template v-if="menuItems.length > 0">
        <h2 class="text-sm font-bold text-gray-400 uppercase tracking-wide mt-6 mb-3 px-1">
          {{ language === 'es' ? 'Accesos' : 'Shortcuts' }}
        </h2>
        <div class="space-y-2">
          <NuxtLink
            v-for="item in menuItems"
            :key="item.path"
            :to="item.disabled ? '#' : item.path"
            class="rounded-xl p-4 flex items-center gap-4 bg-gray-900 border border-gray-800"
            :class="item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-700'"
            @click.prevent="item.disabled && null"
          >
            <span class="text-2xl">{{ item.icon }}</span>
            <span class="font-medium text-white flex-1">{{ item.label }}</span>
            <span v-if="item.disabled" class="text-xs text-gray-500">{{ language === 'es' ? 'Próximamente' : 'Coming soon' }}</span>
            <svg v-else class="w-5 h-5 text-gray-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </NuxtLink>
        </div>
      </template>

      <!-- Logout Button -->
      <button
        @click="handleLogout"
        class="w-full mt-6 p-4 text-flame-500 font-medium text-center"
      >
        {{ language === 'es' ? 'Cerrar Sesión' : 'Sign Out' }}
      </button>

      <!-- App Version -->
      <p class="text-center text-gray-600 text-xs mt-4 mb-8">
        NiikSkate Academy v1.1.0
      </p>
    </div>
  </div>
</template>
