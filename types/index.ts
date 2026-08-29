// =====================================================
// USER TYPES
// =====================================================

export interface User {
  id: string
  email: string
  full_name: string
  /** Roster / display split (optional until backfilled). */
  first_name?: string | null
  last_name?: string | null
  date_of_birth?: string | null
  /** Years; may be null when unknown or prefer DOB-derived age in UI. */
  age?: number | null
  avatar_url?: string
  role: UserRole
  phone?: string
  bio?: string
  specialties?: string[]
  hourly_rate?: number
  is_active: boolean
  created_at: string
  updated_at: string
  /** Assigned skate program (skill_groups Level 1–5). */
  skill_group_id?: string | null
  /** Skater band: foundation | beginner | intermediate | advanced */
  skill_level?: string | null
  /** Parent/guardian when this profile is a skater with login. */
  guardian_user_id?: string | null
  /** Admin-set weekly preference: { start, end, days[] } — days 0–6 Sun–Sat. */
  skater_schedule?: { start?: string; end?: string; days?: number[]; season_slug?: string } | null
}

export type UserRole = 'admin' | 'coach' | 'customer'

// =====================================================
// CLASS TYPES
// =====================================================

export interface SkateClass {
  id: string
  class_type: ClassType
  name: string
  description: string
  max_capacity: number
  price: number
  duration_minutes: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export type ClassType = 'grouped_beginner' | 'grouped_intermediate' | 'individual'

export type TimeSlot = 'monday' | 'morning' | 'early' | 'late' | 'summer'

export type DayOfWeek = 'monday' | 'tuesday' | 'thursday' | 'saturday' | 'sunday'

export const TIME_SLOT_LABELS: Record<TimeSlot, { start: string; end: string; display: string }> = {
  monday: { start: '16:30', end: '18:00', display: '4:30 PM - 6:00 PM' },
  morning: { start: '07:00', end: '08:30', display: '7:00 AM - 8:30 AM' },
  early: { start: '17:30', end: '19:00', display: '5:30 PM - 7:00 PM' },
  late: { start: '19:00', end: '20:30', display: '7:00 PM - 8:30 PM' },
  summer: { start: '09:00', end: '13:00', display: '9:00 AM – 1:00 PM' },
}

/** Human name for each slot — 'early'/'late' are the evening Session 1 / Session 2. */
export const TIME_SLOT_NAMES: Record<TimeSlot, { en: string; es: string }> = {
  monday: { en: 'Monday afternoon', es: 'Lunes tarde' },
  morning: { en: 'Morning', es: 'Mañana' },
  early: { en: 'Session 1', es: 'Sesión 1' },
  late: { en: 'Session 2', es: 'Sesión 2' },
  summer: { en: 'Summer course', es: 'Curso de verano' },
}

/** Slots admins can pick when building a recurring program. */
export const PROGRAM_SESSION_SLOTS: TimeSlot[] = ['morning', 'early', 'late']

export type AudienceCategory =
  | 'tots_5_7'
  | 'kids_7_12'
  | 'teens_13_17'
  | 'adults_18_plus'
  /** @deprecated legacy — still accepted from DB */
  | 'tots_3_5'
  | 'principiantes_6_12'
  | 'principiantes_13_17'
  | 'intermedios_under_12'
  | 'intermedios_over_13'
  | 'everyone'

/** Age bands for class scheduling (pick one or more). */
export const PROGRAM_AGE_BANDS: Array<{
  id: Extract<AudienceCategory, 'tots_5_7' | 'kids_7_12' | 'teens_13_17' | 'adults_18_plus'>
  emoji: string
  label: { en: string; es: string }
  nickname: { en: string; es: string }
  minAge: number
  maxAge: number | null
}> = [
  {
    id: 'tots_5_7',
    emoji: '🛹',
    label: { en: '5–7', es: '5–7' },
    nickname: { en: 'tots', es: 'peques' },
    minAge: 5,
    maxAge: 7,
  },
  {
    id: 'kids_7_12',
    emoji: '🌱',
    label: { en: '7–12', es: '7–12' },
    nickname: { en: 'kids', es: 'niños' },
    minAge: 7,
    maxAge: 12,
  },
  {
    id: 'teens_13_17',
    emoji: '⚡',
    label: { en: '13–17', es: '13–17' },
    nickname: { en: 'teen kids', es: 'niños teens' },
    minAge: 13,
    maxAge: 17,
  },
  {
    id: 'adults_18_plus',
    emoji: '👊',
    label: { en: '18+', es: '18+' },
    nickname: { en: 'adults', es: 'adultos' },
    minAge: 18,
    maxAge: null,
  },
]

/** Skill track for class scheduling (not the fine-grained library levels). */
export type ProgramSkillTrack = 'beginner' | 'intermediate' | 'advanced'

export const PROGRAM_SKILL_TRACKS: Array<{
  id: ProgramSkillTrack
  skillLevelId: SkateSkillLevelId
  emoji: string
  label: { en: string; es: string }
  comingSoon?: boolean
}> = [
  {
    id: 'beginner',
    skillLevelId: 'beginner_1',
    emoji: '🌱',
    label: { en: 'Beginner', es: 'Principiante' },
  },
  {
    id: 'intermediate',
    skillLevelId: 'intermediate_3',
    emoji: '🚀',
    label: { en: 'Intermediate', es: 'Intermedio' },
  },
  {
    id: 'advanced',
    skillLevelId: 'advanced_5',
    emoji: '🏆',
    label: { en: 'Advanced', es: 'Avanzado' },
  },
]

export function skillTrackFromLevelId(id: string | null | undefined): ProgramSkillTrack {
  if (!id) return 'beginner'
  if (id.startsWith('advanced')) return 'advanced'
  if (id.startsWith('intermediate')) return 'intermediate'
  return 'beginner'
}

export function skillLevelIdFromTrack(track: ProgramSkillTrack): SkateSkillLevelId {
  return PROGRAM_SKILL_TRACKS.find(t => t.id === track)?.skillLevelId ?? 'beginner_1'
}

/** Public Skate Programs catalog (purpose-first, not live session prices). */
export const SKATE_PROGRAM_OFFERINGS: Array<{
  id: string
  emoji: string
  ageLabel: { en: string; es: string }
  title: { en: string; es: string }
  purpose: { en: string; es: string }
  skillTrack: ProgramSkillTrack
  comingSoon?: boolean
}> = [
  {
    id: 'skater_tots',
    emoji: '🛹',
    ageLabel: { en: 'Ages 5–7 (tots)', es: 'Edades 5–7 (peques)' },
    title: { en: 'Skater Tots', es: 'Skater Tots' },
    purpose: {
      en: 'Building balance through play',
      es: 'Construyendo equilibrio a través del juego',
    },
    skillTrack: 'beginner',
  },
  {
    id: 'foundations',
    emoji: '🌱',
    ageLabel: { en: 'Ages 7–12 (kids)', es: 'Edades 7–12 (niños)' },
    title: { en: 'Foundations', es: 'Fundamentos' },
    purpose: {
      en: 'Learn the fundamentals of skateboarding',
      es: 'Aprende los fundamentos del skate',
    },
    skillTrack: 'beginner',
  },
  {
    id: 'teen_foundations',
    emoji: '⚡',
    ageLabel: { en: 'Ages 13–17 (teen kids)', es: 'Edades 13–17 (niños teens)' },
    title: { en: 'Teen Foundations', es: 'Fundamentos Teen' },
    purpose: {
      en: 'Develop confidence and core skate skills',
      es: 'Desarrolla confianza y habilidades base',
    },
    skillTrack: 'beginner',
  },
  {
    id: 'adult_foundations',
    emoji: '👊',
    ageLabel: { en: 'Ages 18+ (adults)', es: 'Edades 18+ (adultos)' },
    title: { en: 'Adult Foundations', es: 'Fundamentos Adultos' },
    purpose: {
      en: "It's never too late to start skating",
      es: 'Nunca es tarde para empezar a patinar',
    },
    skillTrack: 'beginner',
  },
  {
    id: 'progression',
    emoji: '🚀',
    ageLabel: { en: 'Ages 7–17', es: 'Edades 7–17' },
    title: { en: 'Progression', es: 'Progresión' },
    purpose: {
      en: 'Intermediate skills and trick development',
      es: 'Habilidades intermedias y desarrollo de trucos',
    },
    skillTrack: 'intermediate',
  },
  {
    id: 'competition_team',
    emoji: '🏆',
    ageLabel: { en: 'By invitation', es: 'Por invitación' },
    title: { en: 'Competition Team', es: 'Equipo de Competencia' },
    purpose: {
      en: 'Structured training for contests and CONADE',
      es: 'Entrenamiento estructurado para competencias y CONADE',
    },
    skillTrack: 'advanced',
  },
]

/** Progresión (intermediate) is one program for kids and teens, ages 7–17. */
export const PROGRESSION_AGE = { minAge: 7, maxAge: 17 } as const
export const PROGRESSION_AUDIENCE_CATEGORIES: AudienceCategory[] = ['kids_7_12', 'teens_13_17']

export function isProgressionAudience(categories: AudienceCategory[]): boolean {
  const set = new Set(categories)
  return (
    set.has('kids_7_12')
    && set.has('teens_13_17')
    && !set.has('tots_5_7')
    && !set.has('adults_18_plus')
  )
}

/** Audience chips shown in admin UI (age bands only). */
export const AUDIENCE_CATEGORIES = PROGRAM_AGE_BANDS.map(b => ({
  id: b.id as AudienceCategory,
  label: b.label,
  minAge: b.minAge as number | null,
  maxAge: b.maxAge,
  emoji: b.emoji,
}))

const LEGACY_AUDIENCE_LABELS: Record<string, { en: string; es: string; minAge: number | null; maxAge: number | null }> = {
  tots_3_5: { en: 'Tots (3–5)', es: 'Tots (3–5)', minAge: 3, maxAge: 5 },
  principiantes_6_12: { en: 'Beginners (6–12)', es: 'Principiantes (6–12)', minAge: 6, maxAge: 12 },
  principiantes_13_17: { en: 'Beginners (13–17)', es: 'Principiantes (13–17)', minAge: 13, maxAge: 17 },
  intermedios_under_12: { en: 'Intermediate (under 12)', es: 'Intermedios (<12)', minAge: 6, maxAge: 11 },
  intermedios_over_13: { en: 'Intermediate (13+)', es: 'Intermedios (13+)', minAge: 13, maxAge: 17 },
  everyone: { en: 'Everyone', es: 'Todos', minAge: 3, maxAge: 99 },
}

export function audienceAgeRange(id: AudienceCategory | string | null | undefined) {
  const row = AUDIENCE_CATEGORIES.find(c => c.id === id)
  if (row) return { minAge: row.minAge, maxAge: row.maxAge }
  const legacy = id ? LEGACY_AUDIENCE_LABELS[id] : null
  return legacy
    ? { minAge: legacy.minAge, maxAge: legacy.maxAge }
    : { minAge: null, maxAge: null }
}

export function parseAudienceCategories(row: {
  audience_categories?: string[] | null
  audience_category?: string | null
}): AudienceCategory[] {
  if (row.audience_categories?.length) {
    return row.audience_categories.filter(Boolean) as AudienceCategory[]
  }
  if (row.audience_category) return [row.audience_category as AudienceCategory]
  return []
}

export function mergedAudienceAgeRange(categories: AudienceCategory[]): {
  minAge: number | null
  maxAge: number | null
} {
  if (!categories.length) return { minAge: null, maxAge: null }
  if (categories.includes('everyone')) return { minAge: 3, maxAge: 99 }

  let minAge: number | null = null
  let maxAge: number | null = null
  for (const id of categories) {
    const r = audienceAgeRange(id)
    if (r.minAge != null) minAge = minAge == null ? r.minAge : Math.min(minAge, r.minAge)
    if (r.maxAge != null) {
      maxAge = maxAge == null ? r.maxAge : Math.max(maxAge, r.maxAge)
    } else if (r.minAge != null && r.minAge >= 18) {
      maxAge = maxAge == null ? 99 : Math.max(maxAge, 99)
    }
  }
  return { minAge, maxAge }
}

export function audienceCategoryLabel(
  id: AudienceCategory | string,
  lang: 'en' | 'es',
): string {
  const row = AUDIENCE_CATEGORIES.find(c => c.id === id)
  if (row) return row.label[lang]
  const legacy = LEGACY_AUDIENCE_LABELS[id]
  return legacy ? legacy[lang] : String(id)
}

export function audienceCategoryEmoji(id: AudienceCategory | string): string {
  const row = PROGRAM_AGE_BANDS.find(c => c.id === id)
  return row?.emoji ?? '🛹'
}

export const DAY_LABELS: Record<DayOfWeek, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  thursday: 'Thursday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

export const DAY_LABELS_ES: Record<DayOfWeek, string> = {
  monday: 'Lunes',
  tuesday: 'Martes',
  thursday: 'Jueves',
  saturday: 'Sábado',
  sunday: 'Domingo',
}

export const DAY_SHORT_LABELS: Record<DayOfWeek, { en: string; es: string }> = {
  monday: { en: 'Mon', es: 'Lun' },
  tuesday: { en: 'Tue', es: 'Mar' },
  thursday: { en: 'Thu', es: 'Jue' },
  saturday: { en: 'Sat', es: 'Sáb' },
  sunday: { en: 'Sun', es: 'Dom' },
}

/** JS getDay() number for each schedulable weekday. */
export const DAY_OF_WEEK_NUMBERS: Record<DayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  thursday: 4,
  saturday: 6,
}

export interface SkateProgramCard {
  id: string
  programSeriesId: string | null
  title: string
  audienceLabel: string
  minAge: number | null
  maxAge: number | null
  skatepark: string
  priceMxn: number | null
  sessionCount: number
  nextSessionDate: string | null
  nextSessionId: string | null
  timeSlot: TimeSlot | null
  enrolled: number
  maxCapacity: number
  spotsLeft: number
  status: SessionAvailabilityStatus
}

export type SkateSkillLevelId =
  | 'beginner_1'
  | 'beginner_2'
  | 'intermediate_3'
  | 'intermediate_4'
  | 'advanced_5'
  | 'advanced_6'

export const SKATE_SKILL_LEVELS: Array<{
  id: SkateSkillLevelId
  title: { en: string; es: string }
  description: { en: string; es: string }
}> = [
  {
    id: 'beginner_1',
    title: { en: 'Beginner 1', es: 'Principiante 1' },
    description: {
      en: 'First-time skater, working on pushing, steering, balance, and coordination.',
      es: 'Primera vez en patineta: trabaja empuje, dirección, equilibrio y coordinación.',
    },
  },
  {
    id: 'beginner_2',
    title: { en: 'Beginner 2', es: 'Principiante 2' },
    description: {
      en: 'Can push, roll, and turn on flat ground, learning ramps at moderate speeds.',
      es: 'Empuja, rueda y gira en plano; aprende rampas a velocidad moderada.',
    },
  },
  {
    id: 'intermediate_3',
    title: { en: 'Intermediate 1', es: 'Intermedio 1' },
    description: {
      en: 'Can navigate a skatepark independently, working on ollie, drop-in, and manual.',
      es: 'Recorre el skatepark de forma independiente; trabaja ollie, drop-in y manual.',
    },
  },
  {
    id: 'intermediate_4',
    title: { en: 'Intermediate 2', es: 'Intermedio 2' },
    description: {
      en: 'Can drop in on a 4′ halfpipe or bowl, working on basic lip tricks, can ollie while rolling.',
      es: 'Hace drop-in en un halfpipe o bowl de 4′; trucos de coping básicos; ollie en movimiento.',
    },
  },
  {
    id: 'advanced_5',
    title: { en: 'Advanced 1', es: 'Avanzado 1' },
    description: {
      en: 'Riding halfpipes and bowls, ollieing over small obstacles, starting flip tricks, slides, and grinds.',
      es: 'Anda halfpipes y bowls; ollie sobre obstáculos pequeños; empieza flips, slides y grinds.',
    },
  },
  {
    id: 'advanced_6',
    title: { en: 'Advanced 2', es: 'Avanzado 2' },
    description: {
      en: 'Has mastered fundamentals across all terrain types, combining tricks into lines and combos, setting independent goals.',
      es: 'Dominó los fundamentos en todo tipo de terreno; combina trucos en líneas y combos; define metas propias.',
    },
  },
]

export const DEFAULT_SKATEPARK = 'Skatepark La Plancha'

/** Standard La Plancha class pricing (MXN) — see utils/classPricing.ts for full coach tier table. */
export {
  DROP_IN_CLASS_PRICE_MXN,
  DROP_IN_INDIVIDUAL_PRICE_MXN,
  FULL_PROGRAM_PRICE_MXN,
  MONTHLY_PROGRAM_PRICE_MXN,
} from '~/utils/classPricing'

/** Default 4-week season program: Tue / Thu / Sat. Admins can also create 8-week programs. */
export const PROGRAM_WEEKS = 4
export const PROGRAM_WEEK_OPTIONS = [4, 8] as const
export type ProgramWeekCount = (typeof PROGRAM_WEEK_OPTIONS)[number]
export const PROGRAM_DAYS_PER_WEEK = 3
export const PROGRAM_TOTAL_CLASSES = PROGRAM_WEEKS * PROGRAM_DAYS_PER_WEEK
export const PROGRAM_CLASSES_PER_WEEK_INCLUDED = 2
export const PROGRAM_INCLUDED_CLASSES = PROGRAM_WEEKS * PROGRAM_CLASSES_PER_WEEK_INCLUDED
export const PROGRAM_PACK_4_MXN = 600
export const PROGRAM_PACK_8_MXN = 1000
export const PROGRAM_PACK_12_MXN = 1500
export const PROGRAM_PACK_16_MXN = 2000
export const PROGRAM_PACK_24_MXN = 3000

export type ParentClassPack = 1 | 4 | 8 | 12 | 16 | 24
export type ParentMultiClassPack = 4 | 8 | 12 | 16 | 24

/** Total classes generated for a program: one per training day, every week. */
export function programClassCount(
  weeks: ProgramWeekCount,
  daysPerWeek: number = PROGRAM_DAYS_PER_WEEK,
): number {
  return weeks * Math.max(1, daysPerWeek)
}

export function packPriceMxn(pack: ParentMultiClassPack): number {
  if (pack === 4) return PROGRAM_PACK_4_MXN
  if (pack === 8) return PROGRAM_PACK_8_MXN
  if (pack === 12) return PROGRAM_PACK_12_MXN
  if (pack === 16) return PROGRAM_PACK_16_MXN
  return PROGRAM_PACK_24_MXN
}

/** 8-week series (≥16 sessions) uses 16/24 packs; 4-week uses 8/12; one day a week is a 4-pack. */
export function multiClassPacksForSeriesLength(sessionCount: number): ParentMultiClassPack[] {
  if (sessionCount >= 16) return [16, 24]
  if (sessionCount >= 8) return [8, 12]
  return [4]
}

/** Summer course (curso de verano): Mon–Fri, 9:00 AM – 1:00 PM, 5 or 10 class days. */
export const SUMMER_COURSE_SLOT: TimeSlot = 'summer'
export const SUMMER_COURSE_SLOTS: TimeSlot[] = [SUMMER_COURSE_SLOT]
export const SUMMER_COURSE_WEEKDAY_PRESET = [1, 2, 3, 4, 5] as const
export const SUMMER_COURSE_WEEK_OPTIONS = [
  { weeks: 1, classes: 5, label: { es: '1 sem (5 días)', en: '1 wk (5 days)' } },
  { weeks: 2, classes: 10, label: { es: '2 sem (10 días)', en: '2 wk (10 days)' } },
] as const

/** Venues available when creating calendar events (expand later). */
export const EVENT_LOCATIONS = [DEFAULT_SKATEPARK] as const

export type SessionAvailabilityStatus = 'open' | 'almost_full' | 'full' | 'no_coaches'

export interface BookableClassSession {
  id: string
  title: string
  start_date: string
  time_slot: TimeSlot | null
  audience_category?: string | null
  audience_categories?: string[] | null
  skill_level: string | null
  min_age: number | null
  max_age: number | null
  skatepark: string | null
  price_mxn: number | null
  location: string | null
  description: string | null
  coachCount: number
  enrolled: number
  maxCapacity: number
  spotsLeft: number
  status: SessionAvailabilityStatus
  isEnrolled?: boolean
  season_slug?: string | null
  program_series_id?: string | null
}

export interface CrewMember {
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

export const CLASS_TYPE_LABELS: Record<ClassType, { name: string; shortName: string; color: string }> = {
  grouped_beginner: { name: 'Grouped - Beginners', shortName: 'Beginner', color: 'bg-green-500' },
  grouped_intermediate: { name: 'Grouped - Intermediate', shortName: 'Intermediate', color: 'bg-yellow-500' },
  individual: { name: 'Individual', shortName: 'Individual', color: 'bg-purple-500' },
}

// =====================================================
// COACH AVAILABILITY TYPES
// =====================================================

export interface CoachAvailability {
  id: string
  coach_id: string
  coach?: User
  year: number
  month: number
  day_of_week: DayOfWeek
  time_slot: TimeSlot
  is_available: boolean
  max_students?: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface CoachDateAvailability {
  id: string
  coach_id: string
  coach?: User
  date: string
  time_slot: TimeSlot
  is_available: boolean
  reason?: string
  created_at: string
}

// =====================================================
// SCHEDULE & BOOKING TYPES
// =====================================================

export interface ClassSchedule {
  id: string
  class_id: string
  skate_class?: SkateClass
  coach_id?: string
  coach?: User
  date: string
  time_slot: TimeSlot
  start_time: string
  end_time: string
  max_capacity: number
  current_bookings: number
  price_override?: number
  is_cancelled: boolean
  cancellation_reason?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  user_id: string
  user?: User
  schedule_id: string
  schedule?: ClassSchedule
  status: BookingStatus
  amount_paid: number
  payment_status: PaymentStatus
  payment_method?: PaymentMethod
  booked_at: string
  confirmed_at?: string
  cancelled_at?: string
  cancellation_reason?: string
  notes?: string
  created_at: string
}

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show'

// =====================================================
// PRODUCT & INVENTORY TYPES
// =====================================================

export interface Product {
  id: string
  sku: string
  name: string
  description: string
  category: ProductCategory
  price: number
  cost?: number
  sale_price?: number
  stock_quantity: number
  min_stock_level: number
  max_stock_level: number
  images: string[]
  specifications?: Record<string, string>
  brand?: string
  size?: string
  /** Admin-only; not exposed on public storefront selects */
  proveedor?: string | null
  /** Admin-only internal notes */
  comentarios?: string | null
  is_featured: boolean
  is_active: boolean
  is_service: boolean
  requires_quote: boolean
  created_at: string
  updated_at: string
}

export type ProductCategory = 
  | 'tablas'        // Boards/Decks
  | 'llantas'       // Wheels
  | 'hardware'      // Trucks, bearings, etc.
  | 'lijas'         // Grip tape
  | 'protecciones'  // Protection gear (pads)
  | 'cascos'        // Helmets
  | 'merch'         // Merchandise
  | 'ramps'         // Custom ramps

export const CATEGORY_LABELS: Record<ProductCategory, { name: string; name_es: string; icon: string; description: string }> = {
  tablas: { name: 'Boards', name_es: 'Tablas', icon: '🛹', description: 'Complete boards and decks' },
  llantas: { name: 'Wheels', name_es: 'Llantas', icon: '⚙️', description: 'Skateboard wheels' },
  hardware: { name: 'Hardware', name_es: 'Hardware', icon: '🔧', description: 'Trucks, bearings, bolts' },
  lijas: { name: 'Grip Tape', name_es: 'Lijas', icon: '📋', description: 'Grip tape sheets' },
  protecciones: { name: 'Protection', name_es: 'Protecciones', icon: '🛡️', description: 'Knee pads, elbow pads' },
  cascos: { name: 'Helmets', name_es: 'Cascos', icon: '⛑️', description: 'Safety helmets' },
  merch: { name: 'Merchandise', name_es: 'Merch', icon: '👕', description: 'T-shirts, hoodies, stickers' },
  ramps: { name: 'Ramps', name_es: 'Rampas', icon: '🏗️', description: 'Custom ramp building' },
}

export interface InventoryTransaction {
  id: string
  product_id: string
  product?: Product
  transaction_type: InventoryTransactionType
  quantity: number
  unit_cost?: number
  total_cost?: number
  reference_id?: string
  reference_type?: string
  notes?: string
  performed_by?: string
  performer?: User
  created_at: string
}

export type InventoryTransactionType = 'purchase' | 'sale' | 'adjustment' | 'return' | 'damage' | 'transfer'

// =====================================================
// ORDER & SALES TYPES
// =====================================================

export interface Order {
  id: string
  order_number: string
  customer_id?: string
  customer?: User
  customer_name?: string
  customer_email?: string
  customer_phone?: string
  subtotal: number
  tax: number
  discount: number
  total: number
  amount_paid: number
  status: OrderStatus
  payment_status: PaymentStatus
  payment_method?: PaymentMethod
  is_pos_sale: boolean
  notes?: string
  items?: OrderItem[]
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id?: string
  product?: Product
  product_name: string
  quantity: number
  unit_price: number
  discount: number
  total: number
  notes?: string
  created_at: string
}

export type OrderStatus = 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled' | 'refunded'

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partial'

export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'other'

export interface Payment {
  id: string
  order_id?: string
  booking_id?: string
  amount: number
  payment_method: PaymentMethod
  reference_number?: string
  notes?: string
  received_by?: string
  receiver?: User
  created_at: string
}

// =====================================================
// RAMP QUOTE TYPES
// =====================================================

export interface RampQuote {
  id: string
  customer_id?: string
  customer?: User
  customer_name: string
  customer_email: string
  customer_phone?: string
  ramp_type: string
  dimensions?: {
    length?: number
    width?: number
    height?: number
    [key: string]: number | undefined
  }
  description: string
  location?: string
  estimated_cost?: number
  final_cost?: number
  status: RampQuoteStatus
  quoted_at?: string
  approved_at?: string
  completed_at?: string
  notes?: string
  images: string[]
  created_at: string
  updated_at: string
}

export type RampQuoteStatus = 'pending' | 'quoted' | 'approved' | 'in_progress' | 'completed' | 'cancelled'

// =====================================================
// CART TYPES
// =====================================================

export interface CartItem {
  product: Product
  quantity: number
}

export interface Cart {
  items: CartItem[]
  subtotal: number
  tax: number
  total: number
}

// =====================================================
// API RESPONSE TYPES
// =====================================================

export interface ApiResponse<T> {
  data: T | null
  error: string | null
  success: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

// =====================================================
// FILTER TYPES
// =====================================================

export interface ClassFilters {
  class_type?: ClassType
  coach_id?: string
  date?: string
  time_slot?: TimeSlot
}

export interface ProductFilters {
  category?: ProductCategory
  price_min?: number
  price_max?: number
  brand?: string
  in_stock?: boolean
  is_featured?: boolean
  search?: string
}

export interface OrderFilters {
  status?: OrderStatus
  payment_status?: PaymentStatus
  date_from?: string
  date_to?: string
  customer_id?: string
}

// =====================================================
// CALENDAR TYPES
// =====================================================

export interface CalendarDay {
  date: Date
  dayOfWeek: DayOfWeek | null
  isClassDay: boolean
  schedules: ClassSchedule[]
}

export interface MonthSchedule {
  year: number
  month: number
  days: CalendarDay[]
}

// =====================================================
// SKILLS & PROGRESS TYPES
// =====================================================

export type SkillDifficulty = 'beginner' | 'intermediate' | 'advanced'

// Obstacle-based categories (for ramps/locations)
export type SkillCategory = 'bowl' | 'street' | 'surf_skate' | 'fundamentals' | 'safety' | 'flatground' | 'vert'

// Activity type categories (for class planning)
export type ActivityCategory = 
  | 'excercise'              // Exercise / functional drills
  | 'iniciacion'              // Initiation (Exercises + Games)
  | 'street'                  // Street
  | 'vert_bowl'               // Bowl (Transition)
  | 'surf_skate'              // Surf Skate

export interface Skill {
  id: string
  name: string
  name_es?: string
  description: string
  description_es?: string
  difficulty: SkillDifficulty
  category: SkillCategory
  video_url?: string
  tips?: string[]
  prerequisites?: string[]
  motor_skills?: string[]  // Body parts / motor skills developed (Habilidad motriz desarrollada)
  manual_id?: number
  area?: string
  structure?: string
  trick_type?: string
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface StudentProgress {
  id: string
  student_id: string
  student?: User
  skill_id: string
  skill?: Skill
  learned_at: string
  marked_by?: string
  marker?: User
  proficiency: number // 1-5
  notes?: string
  created_at: string
}

export const SKILL_DIFFICULTY_LABELS: Record<SkillDifficulty, { name: string; color: string; icon: string }> = {
  beginner: { name: 'Beginner', color: 'bg-green-500', icon: '🌱' },
  intermediate: { name: 'Intermediate', color: 'bg-yellow-500', icon: '⚡' },
  advanced: { name: 'Advanced', color: 'bg-red-500', icon: '🔥' },
}

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, { name: string; name_es: string; icon: string }> = {
  fundamentals: { name: 'Fundamentals', name_es: 'Fundamentos', icon: '📚' },
  flatground: { name: 'Flatground', name_es: 'Piso', icon: '⬜' },
  street: { name: 'Street', name_es: 'Street', icon: '🛤️' },
  bowl: { name: 'Bowl', name_es: 'Bowl', icon: '🥣' },
  vert: { name: 'Vert', name_es: 'Vert', icon: '📐' },
  surf_skate: { name: 'Surf Skate', name_es: 'Surf Skate', icon: '🌊' },
  safety: { name: 'Safety', name_es: 'Seguridad', icon: '🛡️' },
}

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, { name: string; name_es: string; icon: string; rampType: SkillCategory | 'all' }> = {
  excercise: { name: 'Excercise', name_es: 'Excercise', icon: '💪', rampType: 'fundamentals' },
  iniciacion: { name: 'Initiation', name_es: 'Iniciación', icon: '🎮', rampType: 'fundamentals' },
  street: { name: 'Street', name_es: 'Street', icon: '🛤️', rampType: 'street' },
  vert_bowl: { name: 'Bowl', name_es: 'Bowl', icon: '🥣', rampType: 'bowl' },
  surf_skate: { name: 'Surf Skate', name_es: 'Surf Skate', icon: '🌊', rampType: 'surf_skate' },
}

// =====================================================
// GUEST BOOKING TYPES
// =====================================================

export interface GuestBooking {
  id: string
  email: string
  phone?: string
  full_name: string
  booking_data: {
    class_type: string
    class_name: string
    date: string
    session: string
    equipment: string[]
    total_mxn: number
    total_usd: number
  }
  linked_user_id?: string
  linked_at?: string
  created_at: string
}

// =====================================================
// REGISTRATION REQUEST TYPES
// =====================================================

export type RegistrationStatus = 'pending' | 'approved' | 'rejected'

export interface RegistrationRequest {
  id: string
  email: string
  full_name: string
  phone?: string
  message?: string
  status: RegistrationStatus
  reviewed_by?: string
  reviewer?: User
  reviewed_at?: string
  rejection_reason?: string
  created_at: string
  updated_at: string
}

// =====================================================
// ATTENDANCE TYPES
// =====================================================

export interface Attendance {
  id: string
  booking_id?: string
  booking?: Booking
  student_id: string
  student?: User
  class_date: string
  time_slot: TimeSlot
  attended: boolean
  marked_by?: string
  marker?: User
  marked_at?: string
  notes?: string
  created_at: string
}

// =====================================================
// CLASS PLANNING TYPES
// =====================================================

export interface ClassPlanSectionRow {
  id: 'games' | 'drills' | 'closure'
  skill_ids: string[]
}

export interface ClassPlan {
  id: string
  coach_id: string
  coach?: User
  plan_date: string
  time_slot: TimeSlot
  title?: string
  skill_track?: ProgramSkillTrack | null
  audience_category?: AudienceCategory | null
  plan_sections?: ClassPlanSectionRow[]
  planned_skills?: string[] // Array of skill IDs (flat union of plan_sections)
  skills?: Skill[] // Populated skills
  warmup_notes?: string
  main_activity_notes?: string
  cooldown_notes?: string
  equipment_needed?: string[]
  notes?: string
  created_at: string
  updated_at: string
}

// =====================================================
// COACH PAYMENT TYPES
// =====================================================

export type CoachPaymentStatus = 'pending' | 'paid'

export interface CoachPayment {
  id: string
  coach_id: string
  coach?: User
  period_start: string
  period_end: string
  classes_taught: number
  amount: number
  currency: string
  status: CoachPaymentStatus
  paid_at?: string
  paid_by?: string
  payer?: User
  payment_method?: PaymentMethod
  reference_number?: string
  notes?: string
  created_at: string
  updated_at: string
}

// =====================================================
// NEWS & EVENTS TYPES
// =====================================================

export type NewsEventType = 'news' | 'event' | 'announcement'

export interface NewsEvent {
  id: string
  title: string
  title_es?: string
  content: string
  content_es?: string
  event_type: NewsEventType
  event_date?: string
  event_location?: string
  image_url?: string
  is_featured: boolean
  is_published: boolean
  published_at?: string
  created_by?: string
  creator?: User
  created_at: string
  updated_at: string
}

/** Home news “Instagram-style” story strip (news + optional Meta API) */
export type SocialStorySource = 'news' | 'instagram' | 'facebook'

export interface SocialStorySlide {
  id: string
  source: SocialStorySource
  mediaType: 'image' | 'video'
  mediaUrl: string
  thumbnailUrl?: string | null
  title: string
  caption?: string | null
  permalink?: string | null
  at: number
}

/** Response from GET /api/social/meta-feed (Instagram + Facebook Graph when env is set) */
export interface MetaInstagramFeedItem {
  id: string
  mediaType: 'video' | 'image'
  mediaUrl: string
  thumbnailUrl: string | null
  permalink: string
  caption: string | null
  timestamp: string
}

export interface MetaFacebookFeedItem {
  id: string
  imageUrl: string
  permalink: string
  message: string | null
  createdTime: string
}

export interface MetaFeedResponse {
  instagram: MetaInstagramFeedItem[]
  facebook: MetaFacebookFeedItem[]
}

// =====================================================
// DASHBOARD STATS TYPES
// =====================================================

export interface AdminStats {
  total_users: number
  active_students: number
  pending_registrations: number
  total_bookings: number
  bookings_this_month: number
  revenue_this_month: number
  attendance_rate: number
}

export interface CoachStats {
  classes_this_week: number
  classes_this_month: number
  total_students: number
  pending_payments: number
}

export interface UserStats {
  classes_this_month: number
  classes_total: number
  skills_learned: number
  attendance_rate: number
}

// =====================================================
// USER CREDITS / TOKENS TYPES
// =====================================================

export type CreditType = 
  | 'monthly_beginner'     // 8 classes, max 2 per week
  | 'monthly_intermediate' // 8 classes, max 2 per week
  | 'pkg_3'                // 3 classes
  | 'pkg_5'                // 5 classes
  | 'pkg_10'               // 10 classes
  | 'saturdays'            // 4 classes (Saturdays only)
  | 'single_group'         // 1 group class
  | 'single_individual'    // 1 individual class
  | 'golden_monthly'       // Pro monthly (golden token)
  | 'golden_pkg_3'         // Pro package 3 (golden token)
  | 'golden_pkg_5'         // Pro package 5 (golden token)
  | 'golden_single'        // Pro single class (golden token)

export type CreditTokenTier = 'regular' | 'golden'

export type CreditStatus =
  | 'active'
  | 'pending_payment'
  | 'pending_skater_confirm'
  | 'used'
  | 'expired'
  | 'cancelled'

/** Admin pipeline for class_reservations (calendar colors on profile) */
export type ReservationWorkflow = 'requested' | 'admin_confirmed'

export interface UserCredit {
  id: string
  user_id: string
  user?: User
  credit_type: CreditType
  total_credits: number
  remaining_credits: number
  purchase_date: string
  expiration_date: string
  price_paid_mxn?: number
  price_paid_usd?: number
  payment_method?: string
  payment_status?: string
  guest_booking_id?: string | null
  notes?: string
  created_at: string
  updated_at: string
}

export interface ClassReservation {
  id: string
  user_id: string
  user?: User
  credit_id?: string
  credit?: UserCredit
  reservation_date: string
  time_slot: TimeSlot
  class_type?: ClassType
  status: CreditStatus
  workflow_status?: ReservationWorkflow
  equipment_rental?: string[]
  coach_id?: string
  coach?: User
  notes?: string
  created_at: string
  updated_at: string
}

// Credit type labels and limits
export const CREDIT_TYPE_INFO: Record<CreditType, { 
  name: string
  name_es: string
  total_credits: number
  max_per_week: number | null
  saturdays_only: boolean
  token_tier: CreditTokenTier
}> = {
  monthly_beginner: { 
    name: 'Monthly Beginners', 
    name_es: 'Mensual Principiantes', 
    total_credits: 8, 
    max_per_week: 2,
    saturdays_only: false,
    token_tier: 'regular',
  },
  monthly_intermediate: { 
    name: 'Monthly Intermediate', 
    name_es: 'Mensual Intermedios', 
    total_credits: 8, 
    max_per_week: 2,
    saturdays_only: false,
    token_tier: 'regular',
  },
  pkg_3: { 
    name: '3 Class Package', 
    name_es: 'Paquete 3 Clases', 
    total_credits: 3, 
    max_per_week: null,
    saturdays_only: false,
    token_tier: 'regular',
  },
  pkg_5: { 
    name: '5 Class Package', 
    name_es: 'Paquete 5 Clases', 
    total_credits: 5, 
    max_per_week: null,
    saturdays_only: false,
    token_tier: 'regular',
  },
  pkg_10: { 
    name: '10 Class Package', 
    name_es: 'Paquete 10 Clases', 
    total_credits: 10, 
    max_per_week: null,
    saturdays_only: false,
    token_tier: 'regular',
  },
  saturdays: { 
    name: 'Saturdays Only', 
    name_es: 'Solo Sábados', 
    total_credits: 4, 
    max_per_week: null,
    saturdays_only: true,
    token_tier: 'regular',
  },
  single_group: { 
    name: 'Single Group Class', 
    name_es: 'Clase Grupal', 
    total_credits: 1, 
    max_per_week: null,
    saturdays_only: false,
    token_tier: 'regular',
  },
  single_individual: { 
    name: 'Single Individual Class', 
    name_es: 'Clase Individual', 
    total_credits: 1, 
    max_per_week: null,
    saturdays_only: false,
    token_tier: 'regular',
  },
  golden_monthly: {
    name: 'Golden Monthly (Pro)',
    name_es: 'Golden Mensual (Pro)',
    total_credits: 8,
    max_per_week: 2,
    saturdays_only: false,
    token_tier: 'golden',
  },
  golden_pkg_3: {
    name: 'Golden Package 3 (Pro)',
    name_es: 'Golden Paquete 3 (Pro)',
    total_credits: 3,
    max_per_week: null,
    saturdays_only: false,
    token_tier: 'golden',
  },
  golden_pkg_5: {
    name: 'Golden Package 5 (Pro)',
    name_es: 'Golden Paquete 5 (Pro)',
    total_credits: 5,
    max_per_week: null,
    saturdays_only: false,
    token_tier: 'golden',
  },
  golden_single: {
    name: 'Golden Single Class (Pro)',
    name_es: 'Golden Clase Individual (Pro)',
    total_credits: 1,
    max_per_week: null,
    saturdays_only: false,
    token_tier: 'golden',
  },
}
