// =====================================================
// USER TYPES
// =====================================================

export interface User {
  id: string
  email: string
  full_name: string
  avatar_url?: string
  role: UserRole
  phone?: string
  bio?: string
  specialties?: string[]
  hourly_rate?: number
  is_active: boolean
  created_at: string
  updated_at: string
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

export type TimeSlot = 'early' | 'late' // early = 5:30-7:00, late = 7:00-8:30

export type DayOfWeek = 'tuesday' | 'thursday' | 'saturday'

export const TIME_SLOT_LABELS: Record<TimeSlot, { start: string; end: string; display: string }> = {
  early: { start: '17:30', end: '19:00', display: '5:30 PM - 7:00 PM' },
  late: { start: '19:00', end: '20:30', display: '7:00 PM - 8:30 PM' },
}

export const DAY_LABELS: Record<DayOfWeek, string> = {
  tuesday: 'Tuesday',
  thursday: 'Thursday',
  saturday: 'Saturday',
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
  | 'iniciacion'              // Initiation (Exercises + Games)
  | 'street_piso'             // Street Flatground
  | 'street_obstaculos'       // Street Obstacles
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
  iniciacion: { name: 'Initiation', name_es: 'Iniciación', icon: '🎮', rampType: 'fundamentals' },
  street_piso: { name: 'Street Piso', name_es: 'Street Piso', icon: '⬜', rampType: 'flatground' },
  street_obstaculos: { name: 'Street', name_es: 'Street Obstáculos', icon: '🏗️', rampType: 'street' },
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

export interface ClassPlan {
  id: string
  coach_id: string
  coach?: User
  plan_date: string
  time_slot: TimeSlot
  title?: string
  planned_skills?: string[] // Array of skill IDs
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

export type CreditStatus = 'active' | 'used' | 'expired' | 'cancelled'

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
}> = {
  monthly_beginner: { 
    name: 'Monthly Beginners', 
    name_es: 'Mensual Principiantes', 
    total_credits: 8, 
    max_per_week: 2,
    saturdays_only: false 
  },
  monthly_intermediate: { 
    name: 'Monthly Intermediate', 
    name_es: 'Mensual Intermedios', 
    total_credits: 8, 
    max_per_week: 2,
    saturdays_only: false 
  },
  pkg_3: { 
    name: '3 Class Package', 
    name_es: 'Paquete 3 Clases', 
    total_credits: 3, 
    max_per_week: null,
    saturdays_only: false 
  },
  pkg_5: { 
    name: '5 Class Package', 
    name_es: 'Paquete 5 Clases', 
    total_credits: 5, 
    max_per_week: null,
    saturdays_only: false 
  },
  pkg_10: { 
    name: '10 Class Package', 
    name_es: 'Paquete 10 Clases', 
    total_credits: 10, 
    max_per_week: null,
    saturdays_only: false 
  },
  saturdays: { 
    name: 'Saturdays Only', 
    name_es: 'Solo Sábados', 
    total_credits: 4, 
    max_per_week: null,
    saturdays_only: true 
  },
  single_group: { 
    name: 'Single Group Class', 
    name_es: 'Clase Grupal', 
    total_credits: 1, 
    max_per_week: null,
    saturdays_only: false 
  },
  single_individual: { 
    name: 'Single Individual Class', 
    name_es: 'Clase Individual', 
    total_credits: 1, 
    max_per_week: null,
    saturdays_only: false 
  },
}
