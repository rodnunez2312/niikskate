import { requireAdmin } from '~/server/utils/requireAdmin'
import { PROGRAM_SEASONS } from '~/utils/programSeasons'

export default defineEventHandler(async (event) => {
  const { adminId, adminClient } = await requireAdmin(event)
  const slug = String(getRouterParam(event, 'slug') || '').trim()
  if (!slug) {
    throw createError({ statusCode: 400, message: 'Missing season slug' })
  }

  try {
    await adminClient
      .from('school_calendar_events')
      .update({ season_slug: null })
      .eq('season_slug', slug)
  } catch {
    /* column or table may be missing */
  }

  const { error: deleteErr } = await adminClient
    .from('program_seasons')
    .delete()
    .eq('slug', slug)

  if (deleteErr && !/does not exist|schema cache|relation .*program_seasons/i.test(deleteErr.message)) {
    throw createError({ statusCode: 400, message: deleteErr.message })
  }

  const { error: hideErr } = await adminClient
    .from('program_season_hidden')
    .upsert({ slug, hidden_by: adminId }, { onConflict: 'slug' })

  if (hideErr) {
    const missingHidden = /does not exist|schema cache|relation .*program_season_hidden/i.test(hideErr.message)
    const isBuiltIn = PROGRAM_SEASONS.some(s => s.slug === slug)
    if (missingHidden && isBuiltIn) {
      throw createError({
        statusCode: 503,
        message: 'Falta la tabla de temporadas ocultas. Ejecuta supabase/migrations/add_program_season_hidden.sql',
      })
    }
    if (!missingHidden) {
      throw createError({ statusCode: 400, message: hideErr.message })
    }
  }

  return { ok: true, slug }
})
