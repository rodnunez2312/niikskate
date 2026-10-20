export const ALLIANCE_STATUSES = ['draft', 'published', 'unpublished'] as const
export type AllianceStatus = (typeof ALLIANCE_STATUSES)[number]

export const PARTNER_TYPES = ['school', 'business', 'community', 'public', 'other'] as const
export type PartnerType = (typeof PARTNER_TYPES)[number]

export const ACTIVITY_TYPES = [
  'skate',
  'education',
  'art',
  'spaces',
  'community',
  'wellbeing',
  'equipment',
  'financial',
  'other',
] as const

/** The four board modules areas are grouped into. Custom activity types fall into "support". */
export const AREA_MODULES = [
  { id: 'sport', es: 'Skate y movimiento', en: 'Skate and movement', types: ['skate', 'wellbeing'] },
  { id: 'learning', es: 'Educación y arte', en: 'Education and art', types: ['education', 'art'] },
  { id: 'community', es: 'Espacios y comunidad', en: 'Spaces and community', types: ['spaces', 'community'] },
  { id: 'support', es: 'Apoyo y recursos', en: 'Support and resources', types: ['equipment', 'financial', 'other'] },
] as const

export type AreaModuleId = typeof AREA_MODULES[number]['id']

export function areaModuleFor(activityType: string): AreaModuleId {
  const hit = AREA_MODULES.find(module => (module.types as readonly string[]).includes(activityType))
  return hit?.id ?? 'support'
}

export type AllianceArea = {
  id?: string
  activity_type: string
  title: string
  title_en: string
  details: string
  details_en: string
  image_url: string
  image_alt: string
  display_order: number
}

export type AllianceRecord = {
  id: string
  name: string
  slug: string
  partner_type: PartnerType
  location_name: string
  formatted_address: string
  google_place_id: string
  latitude: number | null
  longitude: number | null
  google_maps_url: string
  objective: string
  objective_en: string
  short_description: string
  short_description_en: string
  logo_image_url: string
  cover_image_url: string
  external_website_url: string
  founding_partner: boolean
  internal_notes: string
  started_on: string
  status: AllianceStatus
  display_order: number
  published_at: string | null
  areas: AllianceArea[]
}

export function partnerTypeLabel(type: string, es: boolean): string {
  const labels: Record<string, { es: string; en: string }> = {
    school: { es: 'Escuela / Institución educativa', en: 'School / Educational institution' },
    business: { es: 'Empresa / Marca', en: 'Business / Brand' },
    community: { es: 'Organización comunitaria', en: 'Community organization' },
    public: { es: 'Institución pública', en: 'Public institution' },
    other: { es: 'Otro', en: 'Other' },
  }
  const hit = labels[type]
  if (!hit) return type
  return es ? hit.es : hit.en
}

export function activityTypeLabel(type: string, es: boolean): string {
  const labels: Record<string, { es: string; en: string }> = {
    skate: { es: 'Skateboarding y deportes', en: 'Skateboarding and sport' },
    education: { es: 'Educación y desarrollo juvenil', en: 'Education and youth development' },
    art: { es: 'Arte y serigrafía', en: 'Art and screen printing' },
    spaces: { es: 'Espacios e infraestructura', en: 'Spaces and infrastructure' },
    community: { es: 'Comunidad y eventos', en: 'Community and events' },
    wellbeing: { es: 'Bienestar y movimiento', en: 'Wellbeing and movement' },
    equipment: { es: 'Apoyo material y equipamiento', en: 'Materials and equipment' },
    financial: { es: 'Apoyo financiero', en: 'Financial support' },
    other: { es: 'Otro', en: 'Other' },
  }
  const hit = labels[type]
  if (!hit) return type
  return es ? hit.es : hit.en
}

export type AllianceNote = {
  id: string
  text: string
  created_at: string
  author: string
}

/** `internal_notes` holds a JSON list of notes; older plain-text notes become a single entry. */
export function parseAllianceNotes(raw: string): AllianceNote[] {
  const value = (raw || '').trim()
  if (!value) return []
  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value) as Partial<AllianceNote>[]
      if (Array.isArray(parsed)) {
        return parsed
          .filter(note => typeof note?.text === 'string' && note.text.trim())
          .map((note, index) => ({
            id: String(note.id || `note-${index}`),
            text: String(note.text),
            created_at: String(note.created_at || ''),
            author: String(note.author || ''),
          }))
      }
    } catch { /* plain text that happens to start with "[" */ }
  }
  return [{ id: 'legacy', text: value, created_at: '', author: '' }]
}

export function serializeAllianceNotes(notes: AllianceNote[]): string {
  return notes.length ? JSON.stringify(notes) : ''
}

export function statusLabel(status: string, es: boolean): string {
  if (status === 'published') return es ? 'Publicada' : 'Published'
  if (status === 'unpublished') return es ? 'No publicada' : 'Unpublished'
  return es ? 'Borrador' : 'Draft'
}

export function slugifyAllianceName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return slug
}

export function allianceText(es: boolean, primary: string, english: string): string {
  const en = english.trim()
  if (!es && en) return en
  return primary.trim()
}

export function mapsHref(alliance: Pick<AllianceRecord, 'google_maps_url' | 'formatted_address' | 'location_name'>): string {
  if (alliance.google_maps_url.trim()) return alliance.google_maps_url.trim()
  const query = alliance.formatted_address.trim() || alliance.location_name.trim()
  if (!query) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

export function locationLine(alliance: Pick<AllianceRecord, 'location_name' | 'formatted_address'> & { name?: string }): string {
  const place = alliance.location_name.trim()
  const address = alliance.formatted_address.trim()
  if (place && place !== (alliance.name || '').trim()) return place
  return address || place
}

/** The public page already published this partnership. Kept as the fallback until the SQL migration is applied. */
export function foundingConkalAlliance(): AllianceRecord {
  return {
    id: 'static-conkal',
    name: 'Conkal School',
    slug: 'conkal-school',
    partner_type: 'school',
    location_name: 'Conkal School',
    formatted_address: 'Conkal, Yucatán',
    google_place_id: '',
    latitude: null,
    longitude: null,
    google_maps_url: 'https://www.google.com/maps/search/?api=1&query=Conkal%20School%20Yucat%C3%A1n',
    objective: 'Una colaboración propuesta para integrar deporte, educación, creatividad y desarrollo personal en un espacio compartido.',
    objective_en: 'A proposed collaboration to bring sport, education, creativity, and personal development into one shared place.',
    short_description: 'Una colaboración propuesta para integrar deporte, educación, creatividad y desarrollo personal en un espacio compartido.',
    short_description_en: 'A proposed collaboration to bring sport, education, creativity, and personal development into one shared place.',
    logo_image_url: '',
    cover_image_url: '',
    external_website_url: '',
    founding_partner: true,
    internal_notes: '',
    started_on: '',
    status: 'published',
    display_order: 0,
    published_at: null,
    areas: [
      {
        activity_type: 'skate',
        title: 'Skate y desarrollo juvenil',
        title_en: 'Skate & Youth Development',
        details: 'Un entorno de aprendizaje dedicado al coaching estructurado de Niik y a la programación escolar.',
        details_en: 'A dedicated learning environment supporting Niik’s structured coaching and school programming.',
        image_url: '/images/partners/skate-youth.jpg',
        image_alt: 'Jóvenes patinando en el espacio de aprendizaje de Conkal School',
        display_order: 0,
      },
      {
        activity_type: 'art',
        title: 'Arte y serigrafía',
        title_en: 'Art & Screen Printing',
        details: 'Talleres creativos que combinan diseño gráfico, impresión y la cultura del skate.',
        details_en: 'Potential creative workshops combining graphic design, printmaking, and skate culture.',
        image_url: '/images/partners/art-print.jpg',
        image_alt: 'Taller de serigrafía con diseños inspirados en el skate',
        display_order: 1,
      },
      {
        activity_type: 'spaces',
        title: 'Espacio familiar y comunitario',
        title_en: 'Family & Community Space',
        details: 'Un corredor escolar sombreado donde las familias pueden reunirse, con una posible colaboración de café.',
        details_en: 'A welcoming, shaded school corridor where families can gather, with a potential café collaboration.',
        image_url: '/images/partners/family-space.jpg',
        image_alt: 'Corredor escolar sombreado donde se reúnen las familias',
        display_order: 2,
      },
      {
        activity_type: 'community',
        title: 'Experiencias comunitarias',
        title_en: 'Community Experiences',
        details: 'Clínicas, muestras de estudiantes, eventos y participación de las familias.',
        details_en: 'Opportunities for clinics, student showcases, events, and family engagement.',
        image_url: '/images/partners/community.jpg',
        image_alt: 'Familias y estudiantes en un evento comunitario de Niik',
        display_order: 3,
      },
    ],
  }
}

export function emptyAlliance(): AllianceRecord {
  return {
    id: '',
    name: '',
    slug: '',
    partner_type: 'school',
    location_name: '',
    formatted_address: '',
    google_place_id: '',
    latitude: null,
    longitude: null,
    google_maps_url: '',
    objective: '',
    objective_en: '',
    short_description: '',
    short_description_en: '',
    logo_image_url: '',
    cover_image_url: '',
    external_website_url: '',
    founding_partner: false,
    internal_notes: '',
    started_on: '',
    status: 'draft',
    display_order: 0,
    published_at: null,
    areas: [],
  }
}

export function emptyArea(order: number): AllianceArea {
  return {
    activity_type: 'skate',
    title: '',
    title_en: '',
    details: '',
    details_en: '',
    image_url: '',
    image_alt: '',
    display_order: order,
  }
}

const URL_OK = /^(https?:\/\/|\/)/i

export function imageUrlOk(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  if (v.startsWith('data:') || v.startsWith('blob:')) return false
  return URL_OK.test(v)
}

/** Field errors that block publishing. Drafts may be incomplete. */
export function publishErrors(alliance: AllianceRecord, es = true): string[] {
  const errors: string[] = []
  if (!alliance.name.trim()) errors.push(es ? 'Falta el nombre de la alianza.' : 'Alliance name is required.')
  if (!PARTNER_TYPES.includes(alliance.partner_type)) errors.push(es ? 'Elige un tipo de aliado.' : 'Choose a partner type.')
  if (!locationLine(alliance)) errors.push(es ? 'Falta la ubicación.' : 'Location is required.')
  if (!alliance.objective.trim()) errors.push(es ? 'Falta el objetivo de la alianza.' : 'The partnership objective is required.')
  if (!imageUrlOk(alliance.logo_image_url) || !imageUrlOk(alliance.cover_image_url)) {
    errors.push(es ? 'Las imágenes deben ser archivos guardados, no vistas previas temporales.' : 'Images must be saved files, not temporary previews.')
  }
  alliance.areas.forEach((area, index) => {
    if (!area.title.trim()) errors.push(es ? `El área ${index + 1} necesita un título.` : `Area ${index + 1} needs a title.`)
    if (!area.details.trim()) errors.push(es ? `El área ${index + 1} necesita detalles.` : `Area ${index + 1} needs details.`)
    if (!imageUrlOk(area.image_url)) errors.push(es ? `La imagen del área ${index + 1} no está guardada.` : `Area ${index + 1} image is not saved.`)
  })
  return errors
}
