/**
 * Custom ramp enquiries from the public /skateramps page.
 *
 * Shared by the form, the server validation and the admin inbox so the three
 * never drift apart. Keep the ids in sync with the CHECK constraints in
 * supabase/migrations/add_skateramp_requests.sql.
 */

export type RampRequestOption<T extends string> = { id: T; es: string; en: string }

/** Named "build" to stay clear of RAMP_TYPE_OPTIONS in skaterampSketch.ts, which is sketch geometry. */
export const RAMP_BUILD_TYPES = [
  'mini_ramp',
  'quarter_pipe',
  'funbox',
  'ledge_rail',
  'kicker',
  'bowl',
  'skatepark',
  'other',
] as const
export type RampBuildType = (typeof RAMP_BUILD_TYPES)[number]

export const RAMP_BUILD_TYPE_OPTIONS: RampRequestOption<RampBuildType>[] = [
  { id: 'mini_ramp', es: 'Mini ramp', en: 'Mini ramp' },
  { id: 'quarter_pipe', es: 'Quarter pipe', en: 'Quarter pipe' },
  { id: 'funbox', es: 'Funbox / cajón', en: 'Funbox' },
  { id: 'ledge_rail', es: 'Ledge o barandal', en: 'Ledge or rail' },
  { id: 'kicker', es: 'Kicker / rampa de salto', en: 'Kicker' },
  { id: 'bowl', es: 'Bowl', en: 'Bowl' },
  { id: 'skatepark', es: 'Skatepark completo', en: 'Full skatepark' },
  { id: 'other', es: 'Otro / no estoy seguro', en: 'Other / not sure' },
]

export const RAMP_SURFACES = ['concrete', 'asphalt', 'tile', 'dirt_grass', 'indoor', 'other'] as const
export type RampSurface = (typeof RAMP_SURFACES)[number]

export const RAMP_SURFACE_OPTIONS: RampRequestOption<RampSurface>[] = [
  { id: 'concrete', es: 'Concreto', en: 'Concrete' },
  { id: 'asphalt', es: 'Asfalto', en: 'Asphalt' },
  { id: 'tile', es: 'Piso / loseta', en: 'Tile' },
  { id: 'dirt_grass', es: 'Tierra o pasto', en: 'Dirt or grass' },
  { id: 'indoor', es: 'Interior (bodega, salón)', en: 'Indoor' },
  { id: 'other', es: 'Otro', en: 'Other' },
]

export const RAMP_SKILL_LEVELS = ['beginner', 'intermediate', 'advanced', 'mixed'] as const
export type RampSkillLevel = (typeof RAMP_SKILL_LEVELS)[number]

export const RAMP_SKILL_LEVEL_OPTIONS: RampRequestOption<RampSkillLevel>[] = [
  { id: 'beginner', es: 'Principiante', en: 'Beginner' },
  { id: 'intermediate', es: 'Intermedio', en: 'Intermediate' },
  { id: 'advanced', es: 'Avanzado', en: 'Advanced' },
  { id: 'mixed', es: 'Mixto (familia o escuela)', en: 'Mixed (family or school)' },
]

export const RAMP_TIMELINES = ['asap', 'one_three_months', 'later', 'exploring'] as const
export type RampTimeline = (typeof RAMP_TIMELINES)[number]

export const RAMP_TIMELINE_OPTIONS: RampRequestOption<RampTimeline>[] = [
  { id: 'asap', es: 'Lo antes posible', en: 'As soon as possible' },
  { id: 'one_three_months', es: 'En 1–3 meses', en: 'In 1–3 months' },
  { id: 'later', es: 'En más de 3 meses', en: 'In more than 3 months' },
  { id: 'exploring', es: 'Solo estoy explorando', en: 'Just exploring' },
]

export const RAMP_REQUEST_STATUSES = ['new', 'contacted', 'quoted', 'won', 'archived'] as const
export type RampRequestStatus = (typeof RAMP_REQUEST_STATUSES)[number]

export const RAMP_REQUEST_STATUS_OPTIONS: RampRequestOption<RampRequestStatus>[] = [
  { id: 'new', es: 'Nueva', en: 'New' },
  { id: 'contacted', es: 'Contactado', en: 'Contacted' },
  { id: 'quoted', es: 'Cotizado', en: 'Quoted' },
  { id: 'won', es: 'Cerrada', en: 'Won' },
  { id: 'archived', es: 'Archivada', en: 'Archived' },
]

export const RAMP_REQUEST_MAX_PHOTOS = 4

export interface SkaterampRequest {
  id: string
  full_name: string
  email: string
  phone: string | null
  city: string | null
  ramp_type: RampBuildType | null
  space_width_m: number | null
  space_length_m: number | null
  surface: RampSurface | null
  skill_level: RampSkillLevel | null
  budget_mxn: number | null
  timeline: RampTimeline | null
  message: string
  image_urls: string[]
  status: RampRequestStatus
  admin_notes: string | null
  emailed_at: string | null
  email_error: string | null
  created_at: string
}

export function rampOptionLabel<T extends string>(
  options: readonly RampRequestOption<T>[],
  id: string | null | undefined,
  es: boolean,
): string {
  if (!id) return '—'
  const match = options.find(o => o.id === id)
  if (!match) return id
  return es ? match.es : match.en
}

/** "6 × 4 m" when both sides are known, otherwise whichever one is. */
export function rampSpaceLabel(
  widthM: number | null | undefined,
  lengthM: number | null | undefined,
): string | null {
  if (widthM && lengthM) return `${widthM} × ${lengthM} m`
  if (widthM) return `${widthM} m`
  if (lengthM) return `${lengthM} m`
  return null
}

export function rampRequestStatusClass(status: RampRequestStatus): string {
  if (status === 'new') return 'bg-teal-500/20 text-teal-300 border-teal-400/40'
  if (status === 'contacted') return 'bg-sky-500/20 text-sky-300 border-sky-400/40'
  if (status === 'quoted') return 'bg-amber-500/20 text-amber-300 border-amber-400/40'
  if (status === 'won') return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
  return 'bg-gray-700/50 text-gray-400 border-gray-600'
}
