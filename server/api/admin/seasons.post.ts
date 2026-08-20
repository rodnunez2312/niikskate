import { requireAdmin } from '~/server/utils/requireAdmin'
import { loadHiddenSeasonSlugs, rowToProgramSeason, type ProgramSeasonRow } from '~/server/utils/programSeasonRows'
import {
  PROGRAM_SEASONS,
  findOverlappingRegularSeason,
  mergeProgramSeasons,
  slugifySeasonName,
  type ProgramSeasonStatus,
} from '~/utils/programSeasons'

const STATUSES: ProgramSeasonStatus[] = ['enrolling', 'soon', 'closed']

export default defineEventHandler(async (event) => {
  const { adminId, adminClient } = await requireAdmin(event)
  const body = await readBody(event)

  const nameEs = typeof body?.name_es === 'string' ? body.name_es.trim() : ''
  const nameEn = typeof body?.name_en === 'string' ? body.name_en.trim() : nameEs
  const startDate = typeof body?.start_date === 'string' ? body.start_date.trim() : ''
  const endDate = typeof body?.end_date === 'string' ? body.end_date.trim() : ''
  const status = STATUSES.includes(body?.status) ? (body.status as ProgramSeasonStatus) : 'enrolling'
  const icon = typeof body?.icon === 'string' && body.icon.trim() ? body.icon.trim().slice(0, 8) : '📅'

  if (!nameEs) {
    throw createError({ statusCode: 400, message: 'Season name is required' })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    throw createError({ statusCode: 400, message: 'Start and end dates are required' })
  }
  if (endDate < startDate) {
    throw createError({ statusCode: 400, message: 'End date cannot be before start date' })
  }

  let slug = slugifySeasonName(typeof body?.slug === 'string' && body.slug.trim() ? body.slug : nameEs)
  if (!slug) slug = `temporada-${startDate}`

  let existingRows: ProgramSeasonRow[] = []
  try {
    const { data } = await adminClient
      .from('program_seasons')
      .select('slug, name_es, name_en, start_date, end_date, status, icon')
    existingRows = (data || []) as ProgramSeasonRow[]
  } catch {
    existingRows = []
  }

  const hiddenSlugs = await loadHiddenSeasonSlugs(adminClient)
  const catalog = mergeProgramSeasons(existingRows.map(rowToProgramSeason), hiddenSlugs)
  const overlap = findOverlappingRegularSeason(
    { startDate, endDate, slug, name: { es: nameEs, en: nameEn } },
    catalog,
  )
  if (overlap) {
    throw createError({
      statusCode: 400,
      message: `Las temporadas no pueden cruzarse (excepto curso de verano). Se cruza con ${overlap.name.es} (${overlap.startDate} – ${overlap.endDate}).`,
    })
  }

  const hidden = new Set(hiddenSlugs)
  const taken = new Set([
    ...PROGRAM_SEASONS.map(s => s.slug).filter(s => !hidden.has(s)),
    ...existingRows.map(r => r.slug),
  ])
  if (taken.has(slug)) {
    let n = 2
    while (taken.has(`${slug}-${n}`)) n += 1
    slug = `${slug}-${n}`
  }

  const { data, error } = await adminClient
    .from('program_seasons')
    .insert({
      slug,
      name_es: nameEs,
      name_en: nameEn || nameEs,
      start_date: startDate,
      end_date: endDate,
      status,
      icon,
      created_by: adminId,
    })
    .select('slug, name_es, name_en, start_date, end_date, status, icon')
    .single()

  if (error) {
    const missing = /does not exist|schema cache|relation .*program_seasons/i.test(error.message)
    throw createError({
      statusCode: missing ? 503 : 400,
      message: missing
        ? 'Falta la tabla de temporadas. Ejecuta supabase/migrations/add_program_seasons_table.sql'
        : error.message,
    })
  }

  try {
    await adminClient.from('program_season_hidden').delete().eq('slug', slug)
  } catch {
    /* hidden table may be missing */
  }

  return rowToProgramSeason(data as ProgramSeasonRow)
})
