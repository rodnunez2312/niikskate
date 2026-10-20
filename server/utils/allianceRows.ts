import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ALLIANCE_STATUSES,
  PARTNER_TYPES,
  imageUrlOk,
  publishErrors,
  slugifyAllianceName,
  type AllianceArea,
  type AllianceRecord,
  type AllianceStatus,
  type PartnerType,
} from '~/utils/alliances'

type AreaRow = {
  id: string
  alliance_id: string
  activity_type: string | null
  title: string | null
  title_en: string | null
  details: string | null
  details_en: string | null
  image_url: string | null
  image_alt: string | null
  display_order: number | null
}

type AllianceRow = {
  id: string
  name: string
  slug: string
  partner_type: string | null
  location_name: string | null
  formatted_address: string | null
  google_place_id: string | null
  latitude: number | null
  longitude: number | null
  google_maps_url: string | null
  objective: string | null
  objective_en: string | null
  short_description: string | null
  short_description_en: string | null
  logo_image_url: string | null
  cover_image_url: string | null
  external_website_url: string | null
  founding_partner: boolean | null
  internal_notes: string | null
  started_on: string | null
  status: string | null
  display_order: number | null
  published_at: string | null
  alliance_areas?: AreaRow[] | null
}

function text(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function website(value: string): string {
  if (!value || /^https?:\/\//i.test(value)) return value
  return `https://${value}`
}

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message)
  return String(error)
}

export function isMissingAllianceTable(message: string): boolean {
  return /alliances|alliance_areas|does not exist|schema cache|relation/i.test(message)
}

function mapArea(row: AreaRow): AllianceArea {
  return {
    id: row.id,
    activity_type: row.activity_type || 'other',
    title: row.title || '',
    title_en: row.title_en || '',
    details: row.details || '',
    details_en: row.details_en || '',
    image_url: row.image_url || '',
    image_alt: row.image_alt || '',
    display_order: row.display_order ?? 0,
  }
}

export function mapAlliance(row: AllianceRow): AllianceRecord {
  const areas = (row.alliance_areas || [])
    .map(mapArea)
    .sort((a, b) => a.display_order - b.display_order)
  const partner = PARTNER_TYPES.includes(row.partner_type as PartnerType)
    ? (row.partner_type as PartnerType)
    : 'other'
  const status = ALLIANCE_STATUSES.includes(row.status as AllianceStatus)
    ? (row.status as AllianceStatus)
    : 'draft'
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    partner_type: partner,
    location_name: row.location_name || '',
    formatted_address: row.formatted_address || '',
    google_place_id: row.google_place_id || '',
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    google_maps_url: row.google_maps_url || '',
    objective: row.objective || '',
    objective_en: row.objective_en || '',
    short_description: row.short_description || '',
    short_description_en: row.short_description_en || '',
    logo_image_url: row.logo_image_url || '',
    cover_image_url: row.cover_image_url || '',
    external_website_url: row.external_website_url || '',
    founding_partner: Boolean(row.founding_partner),
    internal_notes: row.internal_notes || '',
    started_on: row.started_on || '',
    status,
    display_order: row.display_order ?? 0,
    published_at: row.published_at,
    areas,
  }
}

const SELECT = '*, alliance_areas(*)'

export async function listAlliances(client: SupabaseClient, publishedOnly: boolean): Promise<AllianceRecord[]> {
  let query = client.from('alliances').select(SELECT).order('display_order').order('name')
  if (publishedOnly) query = query.eq('status', 'published')
  const { data, error } = await query
  if (error) throw error
  return ((data || []) as AllianceRow[]).map(mapAlliance)
}

export async function getAllianceBySlug(client: SupabaseClient, slug: string, publishedOnly: boolean): Promise<AllianceRecord | null> {
  let query = client.from('alliances').select(SELECT).eq('slug', slug)
  if (publishedOnly) query = query.eq('status', 'published')
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data ? mapAlliance(data as AllianceRow) : null
}

function cleanAreas(raw: unknown): AllianceArea[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item, index) => {
    const row = item as Partial<AllianceArea>
    return {
      id: typeof row.id === 'string' && row.id ? row.id : undefined,
      activity_type: text(row.activity_type, 80) || 'other',
      title: text(row.title, 160),
      title_en: text(row.title_en, 160),
      details: text(row.details, 4000),
      details_en: text(row.details_en, 4000),
      image_url: text(row.image_url, 500),
      image_alt: text(row.image_alt, 200),
      display_order: index,
    }
  })
}

export function allianceFromBody(body: Record<string, unknown>, fallbackSlug = ''): AllianceRecord {
  const name = text(body.name, 160)
  const requested = text(body.slug, 80)
  const slug = slugifyAllianceName(requested || name) || fallbackSlug
  const partner = PARTNER_TYPES.includes(body.partner_type as PartnerType)
    ? (body.partner_type as PartnerType)
    : 'other'
  const status = ALLIANCE_STATUSES.includes(body.status as AllianceStatus)
    ? (body.status as AllianceStatus)
    : 'draft'
  const lat = body.latitude === '' || body.latitude === null || body.latitude === undefined ? NaN : Number(body.latitude)
  const lng = body.longitude === '' || body.longitude === null || body.longitude === undefined ? NaN : Number(body.longitude)
  return {
    id: text(body.id, 80),
    name,
    slug,
    partner_type: partner,
    location_name: text(body.location_name, 200),
    formatted_address: text(body.formatted_address, 300),
    google_place_id: text(body.google_place_id, 200),
    latitude: Number.isFinite(lat) ? lat : null,
    longitude: Number.isFinite(lng) ? lng : null,
    google_maps_url: text(body.google_maps_url, 500),
    objective: text(body.objective, 4000),
    objective_en: text(body.objective_en, 4000),
    short_description: text(body.short_description, 500),
    short_description_en: text(body.short_description_en, 500),
    logo_image_url: text(body.logo_image_url, 500),
    cover_image_url: text(body.cover_image_url, 500),
    external_website_url: website(text(body.external_website_url, 500)),
    founding_partner: Boolean(body.founding_partner),
    internal_notes: text(body.internal_notes, 20000),
    started_on: /^\d{4}-\d{2}-\d{2}$/.test(text(body.started_on, 10)) ? text(body.started_on, 10) : '',
    status,
    display_order: Number.isFinite(Number(body.display_order)) ? Number(body.display_order) : 0,
    published_at: null,
    areas: cleanAreas(body.areas),
  }
}

function assertUrls(alliance: AllianceRecord) {
  const urls = [
    alliance.logo_image_url,
    alliance.cover_image_url,
    alliance.external_website_url,
    alliance.google_maps_url,
    ...alliance.areas.map(area => area.image_url),
  ]
  if (urls.some(url => !imageUrlOk(url))) {
    throw createError({ statusCode: 400, message: 'Image and link fields must be saved http(s) or site paths.' })
  }
}

async function uniqueSlug(client: SupabaseClient, slug: string, currentId: string): Promise<string> {
  let candidate = slug || 'alianza'
  for (let n = 2; n < 50; n += 1) {
    const { data } = await client.from('alliances').select('id').eq('slug', candidate).maybeSingle()
    if (!data || data.id === currentId) return candidate
    candidate = `${slug}-${n}`
  }
  return `${slug}-${Date.now()}`
}

export async function saveAlliance(client: SupabaseClient, alliance: AllianceRecord): Promise<AllianceRecord> {
  if (!alliance.name.trim()) {
    throw createError({ statusCode: 400, message: 'Alliance name is required.' })
  }
  if (!alliance.slug) {
    throw createError({ statusCode: 400, message: 'Could not build a URL slug from the name.' })
  }
  assertUrls(alliance)
  if (alliance.status === 'published') {
    const errors = publishErrors(alliance, true)
    if (errors.length) {
      throw createError({ statusCode: 400, message: errors[0] })
    }
  }

  const slug = await uniqueSlug(client, alliance.slug, alliance.id)
  const now = new Date().toISOString()
  const row = {
    name: alliance.name,
    slug,
    partner_type: alliance.partner_type,
    location_name: alliance.location_name,
    formatted_address: alliance.formatted_address,
    google_place_id: alliance.google_place_id,
    latitude: alliance.latitude,
    longitude: alliance.longitude,
    google_maps_url: alliance.google_maps_url,
    objective: alliance.objective,
    objective_en: alliance.objective_en,
    short_description: alliance.short_description,
    short_description_en: alliance.short_description_en,
    logo_image_url: alliance.logo_image_url,
    cover_image_url: alliance.cover_image_url,
    external_website_url: alliance.external_website_url,
    founding_partner: alliance.founding_partner,
    internal_notes: alliance.internal_notes,
    started_on: alliance.started_on || null,
    status: alliance.status,
    display_order: alliance.display_order,
    updated_at: now,
    published_at: alliance.status === 'published' ? now : null,
  }

  let id = alliance.id
  if (id) {
    const { error } = await client.from('alliances').update(row).eq('id', id)
    if (error) throw createError({ statusCode: 400, message: error.message })
  } else {
    const { data: last } = await client.from('alliances').select('display_order').order('display_order', { ascending: false }).limit(1).maybeSingle()
    row.display_order = (typeof last?.display_order === 'number' ? last.display_order : -1) + 1
    const { data, error } = await client.from('alliances').insert(row).select('id').single()
    if (error || !data) throw createError({ statusCode: 400, message: error?.message || 'Could not create alliance' })
    id = data.id as string
  }

  const kept = new Set(alliance.areas.map(area => area.id).filter((value): value is string => Boolean(value)))
  const { data: existingAreas } = await client.from('alliance_areas').select('id').eq('alliance_id', id)
  const drop = (existingAreas || []).map(row => row.id as string).filter(areaId => !kept.has(areaId))
  if (drop.length) {
    const { error } = await client.from('alliance_areas').delete().in('id', drop)
    if (error) throw createError({ statusCode: 400, message: error.message })
  }

  for (const area of alliance.areas) {
    const areaRow = {
      alliance_id: id,
      activity_type: area.activity_type,
      title: area.title,
      title_en: area.title_en,
      details: area.details,
      details_en: area.details_en,
      image_url: area.image_url,
      image_alt: area.image_alt,
      display_order: area.display_order,
      updated_at: now,
    }
    if (area.id) {
      const { error } = await client.from('alliance_areas').update(areaRow).eq('id', area.id).eq('alliance_id', id)
      if (error) throw createError({ statusCode: 400, message: error.message })
    } else {
      const { error } = await client.from('alliance_areas').insert(areaRow)
      if (error) throw createError({ statusCode: 400, message: error.message })
    }
  }

  const { data, error } = await client.from('alliances').select(SELECT).eq('id', id).single()
  if (error || !data) throw createError({ statusCode: 400, message: error?.message || 'Could not reload alliance' })
  return mapAlliance(data as AllianceRow)
}
