import { requireAdmin } from '~/server/utils/requireAdmin'
import { computeAgeFromDob } from '~/utils/ageEligibility'

function normalizeDateOfBirth(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null
  const trimmed = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null
  const [y, m, d] = trimmed.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  if (dt > new Date()) return null
  return trimmed
}

export default defineEventHandler(async (event) => {
  const { adminClient: supabase } = await requireAdmin(event)

  const body = await readBody(event)
  const { guardian_user_id, first_name, last_name, date_of_birth } = body || {}

  const first = typeof first_name === 'string' ? first_name.trim() : ''
  if (!first) {
    throw createError({ statusCode: 400, message: 'first_name is required' })
  }
  const dob = normalizeDateOfBirth(date_of_birth)
  if (!dob) {
    throw createError({ statusCode: 400, message: 'date_of_birth is required (YYYY-MM-DD)' })
  }

  let guardianId: string | null = null
  if (guardian_user_id && typeof guardian_user_id === 'string') {
    const { data: guardian, error: gErr } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', guardian_user_id)
      .maybeSingle()
    if (gErr) throw createError({ statusCode: 500, message: gErr.message })
    if (!guardian || guardian.role !== 'customer') {
      throw createError({ statusCode: 400, message: 'Guardian must be a customer profile' })
    }
    guardianId = guardian_user_id
  }

  const last = typeof last_name === 'string' ? last_name.trim() : ''
  const fullName = [first, last].filter(Boolean).join(' ')
  const age = computeAgeFromDob(dob)

  const countQuery = supabase
    .from('crew_members')
    .select('*', { count: 'exact', head: true })
  const { count } = guardianId
    ? await countQuery.eq('guardian_user_id', guardianId)
    : await countQuery.is('guardian_user_id', null)

  const { data, error } = await supabase
    .from('crew_members')
    .insert({
      guardian_user_id: guardianId,
      first_name: first,
      last_name: last || null,
      full_name: fullName,
      date_of_birth: dob,
      age,
      sort_order: count ?? 0,
    })
    .select('*')
    .single()

  if (error) throw createError({ statusCode: 400, message: error.message })

  return { ok: true, crew_member: data }
})
