/**
 * Public class prices for customer-facing checkout.
 *
 * `finance_price_list` is staff-only because it also holds the academy split,
 * minimum fees and planning figures. This route exposes only what a family needs
 * to see, so /book can quote the same numbers the admin edits in Finanzas.
 */
import { getServiceSupabase } from '~/server/utils/bookableSessions'
import { effectivePriceMxn } from '~/utils/finance'

export default defineEventHandler(async () => {
  const supabase = getServiceSupabase()

  const { data, error } = await supabase
    .from('finance_price_list')
    .select('coach_tier, class_kind, label_es, label_en, list_mxn, final_mxn, sessions, is_active')
    .eq('is_active', true)

  // Before add_finance_module.sql has been run there is simply no sheet yet; the
  // page falls back to its built-in prices rather than breaking.
  if (error) {
    return { rows: [] as PublicPriceRow[], available: false as const }
  }

  const rows: PublicPriceRow[] = (data || []).map((row) => {
    const r = row as {
      coach_tier: string
      class_kind: string
      label_es: string
      label_en: string | null
      list_mxn: number
      final_mxn: number | null
      sessions: number
    }
    return {
      coachTier: r.coach_tier,
      classKind: r.class_kind,
      labelEs: r.label_es,
      labelEn: r.label_en,
      priceMxn: effectivePriceMxn(r),
      listMxn: Number(r.list_mxn) || 0,
      sessions: r.sessions,
    }
  })

  return { rows, available: rows.length > 0 }
})

export interface PublicPriceRow {
  coachTier: string
  classKind: string
  labelEs: string
  labelEn: string | null
  /** What the family pays: the sheet's "Precio final", or list when there is none. */
  priceMxn: number
  listMxn: number
  sessions: number
}
