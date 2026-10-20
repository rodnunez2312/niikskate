import { requireAdmin } from '~/server/utils/requireAdmin'

export default defineEventHandler(async (event) => {
  const { adminClient } = await requireAdmin(event)
  const body = await readBody(event)
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : []
  if (!ids.length) throw createError({ statusCode: 400, message: 'Missing alliance order' })
  for (let index = 0; index < ids.length; index += 1) {
    const { error } = await adminClient.from('alliances').update({ display_order: index }).eq('id', ids[index])
    if (error) throw createError({ statusCode: 400, message: error.message })
  }
  return { ok: true }
})
