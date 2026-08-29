/**
 * Admin data access for coupons, their skater allow-lists and the redemption log.
 *
 * Customers never touch this composable: they have no read policy on `coupons`
 * and go through /api/coupons/* instead.
 */
import { normalizeCouponCode, type CouponRedemptionRow, type CouponRow, type CouponSkaterRow } from '~/utils/coupons'

const MIGRATION_HINT =
  'run supabase/migrations/add_coupons.sql in the Supabase SQL Editor, then reload'

function friendlyError(message: string): string {
  if (/coupon(s|_skaters|_redemptions)|does not exist|schema cache/i.test(message)) {
    return `${message} — ${MIGRATION_HINT}`
  }
  if (/duplicate key|already exists/i.test(message)) {
    return 'That code already exists. Pick a different one.'
  }
  if (/row-level security/i.test(message)) {
    return `${message} — only admins can create coupons; confirm your profile role is "admin".`
  }
  return message
}

type MutationResult = { ok: boolean; message?: string }

/** One allow-list entry joined to whichever name it points at. */
export interface CouponSkaterEntry extends CouponSkaterRow {
  display_name: string
  kind: 'profile' | 'crew'
}

export function useCoupons() {
  const client = useSupabaseClient()
  const user = useSupabaseUser()

  const coupons = useState<CouponRow[]>('coupons-list', () => [])
  const redemptions = useState<CouponRedemptionRow[]>('coupon-redemptions', () => [])
  const allowLists = useState<Record<string, CouponSkaterEntry[]>>('coupon-allow-lists', () => ({}))

  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  const fail = (e: unknown, context: string): MutationResult => {
    const raw = e instanceof Error ? e.message : String(e)
    const message = friendlyError(raw)
    error.value = message
    console.error(`[useCoupons] ${context}:`, raw)
    return { ok: false, message }
  }

  const loadCoupons = async (opts?: { force?: boolean }) => {
    if (coupons.value.length && !opts?.force) return coupons.value
    loading.value = true
    error.value = null
    try {
      const { data, error: e } = await client
        .from('coupons')
        .select('*')
        .order('created_at', { ascending: false })
      if (e) throw new Error(e.message)
      coupons.value = (data || []) as unknown as CouponRow[]
    } catch (e) {
      fail(e, 'loadCoupons failed')
    } finally {
      loading.value = false
    }
    return coupons.value
  }

  const createCoupon = async (row: Partial<CouponRow>): Promise<MutationResult> => {
    saving.value = true
    error.value = null
    try {
      const code = normalizeCouponCode(row.code)
      if (code.length < 3) {
        throw new Error('The code needs at least 3 characters.')
      }
      const { data, error: e } = await client
        .from('coupons')
        .insert({ ...row, code, created_by: user.value?.id ?? null })
        .select('*')
        .single()
      if (e) throw new Error(e.message)
      coupons.value = [data as unknown as CouponRow, ...coupons.value]
      return { ok: true }
    } catch (e) {
      return fail(e, 'createCoupon failed')
    } finally {
      saving.value = false
    }
  }

  const updateCoupon = async (id: string, patch: Partial<CouponRow>): Promise<MutationResult> => {
    const index = coupons.value.findIndex(c => c.id === id)
    const previous = index >= 0 ? { ...coupons.value[index] } : null
    if (index >= 0) coupons.value[index] = { ...coupons.value[index], ...patch }

    saving.value = true
    try {
      const payload = { ...patch }
      if (payload.code) payload.code = normalizeCouponCode(payload.code)
      const { data, error: e } = await client
        .from('coupons')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single()
      if (e) throw new Error(e.message)
      if (index >= 0) coupons.value[index] = data as unknown as CouponRow
      return { ok: true }
    } catch (e) {
      if (previous && index >= 0) coupons.value[index] = previous
      return fail(e, 'updateCoupon failed')
    } finally {
      saving.value = false
    }
  }

  const deleteCoupon = async (id: string): Promise<MutationResult> => {
    saving.value = true
    try {
      const { error: e } = await client.from('coupons').delete().eq('id', id)
      if (e) throw new Error(e.message)
      coupons.value = coupons.value.filter(c => c.id !== id)
      const next = { ...allowLists.value }
      delete next[id]
      allowLists.value = next
      return { ok: true }
    } catch (e) {
      return fail(e, 'deleteCoupon failed')
    } finally {
      saving.value = false
    }
  }

  // -------------------------------------------------------------------------
  // Allow-list
  // -------------------------------------------------------------------------

  const loadAllowList = async (couponId: string, opts?: { force?: boolean }) => {
    if (allowLists.value[couponId] && !opts?.force) return allowLists.value[couponId]
    loading.value = true
    try {
      const { data, error: e } = await client
        .from('coupon_skaters')
        .select('id, coupon_id, skater_id, crew_member_id, created_at')
        .eq('coupon_id', couponId)
      if (e) throw new Error(e.message)
      const rows = (data || []) as unknown as CouponSkaterRow[]

      const profileIds = rows.map(r => r.skater_id).filter((v): v is string => !!v)
      const crewIds = rows.map(r => r.crew_member_id).filter((v): v is string => !!v)

      const names = new Map<string, string>()
      if (profileIds.length) {
        const { data: profiles } = await client
          .from('profiles')
          .select('id, full_name')
          .in('id', profileIds)
        for (const p of profiles || []) {
          names.set((p as { id: string }).id, (p as { full_name?: string }).full_name || '—')
        }
      }
      if (crewIds.length) {
        const { data: crew } = await client
          .from('crew_members')
          .select('id, first_name, last_name')
          .in('id', crewIds)
        for (const c of crew || []) {
          const row = c as { id: string; first_name?: string; last_name?: string }
          names.set(row.id, `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || '—')
        }
      }

      allowLists.value = {
        ...allowLists.value,
        [couponId]: rows.map(r => ({
          ...r,
          kind: r.crew_member_id ? ('crew' as const) : ('profile' as const),
          display_name: names.get((r.crew_member_id || r.skater_id) as string) || '—',
        })),
      }
    } catch (e) {
      fail(e, 'loadAllowList failed')
    } finally {
      loading.value = false
    }
    return allowLists.value[couponId] || []
  }

  const addToAllowList = async (
    couponId: string,
    target: { skaterId?: string | null; crewMemberId?: string | null },
  ): Promise<MutationResult> => {
    saving.value = true
    try {
      const { error: e } = await client.from('coupon_skaters').insert({
        coupon_id: couponId,
        skater_id: target.skaterId ?? null,
        crew_member_id: target.crewMemberId ?? null,
        added_by: user.value?.id ?? null,
      })
      if (e) throw new Error(e.message)
      await loadAllowList(couponId, { force: true })
      return { ok: true }
    } catch (e) {
      return fail(e, 'addToAllowList failed')
    } finally {
      saving.value = false
    }
  }

  const removeFromAllowList = async (couponId: string, entryId: string): Promise<MutationResult> => {
    saving.value = true
    try {
      const { error: e } = await client.from('coupon_skaters').delete().eq('id', entryId)
      if (e) throw new Error(e.message)
      allowLists.value = {
        ...allowLists.value,
        [couponId]: (allowLists.value[couponId] || []).filter(r => r.id !== entryId),
      }
      return { ok: true }
    } catch (e) {
      return fail(e, 'removeFromAllowList failed')
    } finally {
      saving.value = false
    }
  }

  // -------------------------------------------------------------------------
  // Redemption log
  // -------------------------------------------------------------------------

  const loadRedemptions = async (opts?: { force?: boolean; couponId?: string }) => {
    if (redemptions.value.length && !opts?.force) return redemptions.value
    loading.value = true
    try {
      let query = client
        .from('coupon_redemptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (opts?.couponId) query = query.eq('coupon_id', opts.couponId)
      const { data, error: e } = await query
      if (e) throw new Error(e.message)
      redemptions.value = (data || []) as unknown as CouponRedemptionRow[]
    } catch (e) {
      fail(e, 'loadRedemptions failed')
    } finally {
      loading.value = false
    }
    return redemptions.value
  }

  return {
    coupons,
    redemptions,
    allowLists,
    loading,
    saving,
    error,
    loadCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    loadAllowList,
    addToAllowList,
    removeFromAllowList,
    loadRedemptions,
  }
}
