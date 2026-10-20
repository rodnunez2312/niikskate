import { requireAdmin } from '~/server/utils/requireAdmin'
import { isMissingAllianceTable } from '~/server/utils/allianceRows'

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireAdmin(event)
  const id = String(getRouterParam(event, 'id') || '').trim()
  if (!id) throw createError({ statusCode: 400, message: 'Missing alliance id' })
  const { data: existing } = await adminClient
    .from('alliances')
    .select('logo_image_url, cover_image_url, alliance_areas(image_url)')
    .eq('id', id)
    .maybeSingle()
  const { error } = await adminClient.from('alliances').delete().eq('id', id)
  if (error) {
    if (isMissingAllianceTable(error.message)) {
      throw createError({ statusCode: 503, message: 'Falta la tabla de alianzas. Ejecuta supabase/migrations/add_alliances.sql.' })
    }
    throw createError({ statusCode: 400, message: error.message })
  }
  const urls = [
    existing?.logo_image_url,
    existing?.cover_image_url,
    ...((existing?.alliance_areas || []) as { image_url?: string }[]).map(area => area.image_url),
  ]
  const paths = urls
    .map(url => {
      const value = String(url || '')
      const marker = '/images/'
      const at = value.indexOf(marker)
      if (at < 0) return ''
      const path = decodeURIComponent(value.slice(at + marker.length).split('?')[0])
      return path.startsWith('alliances/') ? path : ''
    })
    .filter(Boolean)
  if (paths.length) await adminClient.storage.from('images').remove(paths)
  return { ok: true }
})
