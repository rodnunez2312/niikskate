/**
 * Coupon codes: shared math and labels for the client and the server routes.
 *
 * A coupon can never raise a price. `fixed_price` pins the total (grandfathered
 * pricing, e.g. the day 1s staying at $800), so if the list price is already below
 * the pinned amount the discount is simply zero.
 */
import type { ClassPackageKind, CoachPricingTier } from '~/utils/classPricing'

export type CouponDiscountType = 'percent' | 'fixed_amount' | 'fixed_price'

export interface CouponRow {
  id: string
  code: string
  label_es: string
  label_en: string | null
  description: string | null
  discount_type: CouponDiscountType
  discount_value: number
  applies_to_class_kinds: string[]
  applies_to_coach_tiers: string[]
  restricted_to_skaters: boolean
  max_redemptions: number | null
  max_per_skater: number | null
  times_redeemed: number
  starts_on: string | null
  expires_on: string | null
  is_active: boolean
  notes: string | null
  created_at?: string
}

export interface CouponSkaterRow {
  id: string
  coupon_id: string
  skater_id: string | null
  crew_member_id: string | null
  created_at?: string
}

export interface CouponRedemptionRow {
  id: string
  coupon_id: string | null
  code: string
  user_id: string | null
  crew_member_id: string | null
  context: 'book' | 'season_enroll' | 'admin_income' | 'admin_enrollment'
  class_kind: string | null
  coach_tier: string | null
  original_mxn: number
  discount_mxn: number
  final_mxn: number
  created_at: string
}

export const COUPON_DISCOUNT_TYPES = [
  {
    id: 'fixed_price' as const,
    es: 'Precio fijo',
    en: 'Fixed price',
    hintEs: 'El total queda en este monto (precio heredado).',
    hintEn: 'The total becomes this amount (grandfathered price).',
  },
  {
    id: 'percent' as const,
    es: 'Porcentaje',
    en: 'Percentage',
    hintEs: 'Descuenta este % del total.',
    hintEn: 'Takes this % off the total.',
  },
  {
    id: 'fixed_amount' as const,
    es: 'Monto fijo',
    en: 'Fixed amount',
    hintEs: 'Descuenta estos pesos del total.',
    hintEn: 'Takes these pesos off the total.',
  },
]

/** Codes are stored upper-case with no inner spaces, so casing never matters. */
export function normalizeCouponCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, '').toUpperCase()
}

export type CouponRejection =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'limit_reached'
  | 'skater_limit_reached'
  | 'not_allowed'
  | 'scope_class'
  | 'needs_login'
  | 'no_discount'
  | 'server_error'

export function couponRejectionMessage(reason: CouponRejection, es: boolean): string {
  switch (reason) {
    case 'not_found':
      return es ? 'Ese código no existe.' : 'That code does not exist.'
    case 'inactive':
      return es ? 'Ese código ya no está activo.' : 'That code is no longer active.'
    case 'not_started':
      return es ? 'Ese código aún no empieza.' : 'That code has not started yet.'
    case 'expired':
      return es ? 'Ese código ya venció.' : 'That code has expired.'
    case 'limit_reached':
      return es
        ? 'Ese código ya llegó a su límite de usos.'
        : 'That code reached its redemption limit.'
    case 'skater_limit_reached':
      return es
        ? 'Ya usaste ese código el número de veces permitido.'
        : 'You already used that code the maximum number of times.'
    case 'not_allowed':
      return es
        ? 'Ese código no está disponible para este alumno.'
        : 'That code is not available for this skater.'
    case 'scope_class':
      return es
        ? 'Ese código no aplica al paquete que elegiste.'
        : 'That code does not apply to the package you picked.'
    case 'needs_login':
      return es ? 'Inicia sesión para usar un código.' : 'Sign in to use a code.'
    case 'no_discount':
      return es
        ? 'Ese código no mejora este precio.'
        : 'That code does not improve this price.'
    default:
      return es
        ? 'No pudimos validar el código. Intenta de nuevo.'
        : 'We could not validate the code. Please try again.'
  }
}

export interface CouponDiscount {
  discountMxn: number
  finalMxn: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Never returns a total above `subtotalMxn`, and never a negative total. */
export function computeCouponDiscount(
  coupon: Pick<CouponRow, 'discount_type' | 'discount_value'>,
  subtotalMxn: number,
): CouponDiscount {
  const subtotal = Math.max(0, Number(subtotalMxn) || 0)
  const value = Math.max(0, Number(coupon.discount_value) || 0)

  let discount = 0
  switch (coupon.discount_type) {
    case 'percent':
      discount = subtotal * (Math.min(value, 100) / 100)
      break
    case 'fixed_amount':
      discount = Math.min(value, subtotal)
      break
    case 'fixed_price':
      discount = Math.max(0, subtotal - value)
      break
  }

  discount = round2(Math.min(discount, subtotal))
  return { discountMxn: discount, finalMxn: round2(subtotal - discount) }
}

export function couponLabel(coupon: Pick<CouponRow, 'label_es' | 'label_en'>, es: boolean): string {
  return (es ? coupon.label_es : coupon.label_en || coupon.label_es) || ''
}

/** Short human summary, e.g. "Total $800" or "20% menos". */
export function couponDiscountSummary(
  coupon: Pick<CouponRow, 'discount_type' | 'discount_value'>,
  es: boolean,
): string {
  const value = Number(coupon.discount_value) || 0
  const money = `$${value.toLocaleString('es-MX')}`
  switch (coupon.discount_type) {
    case 'percent':
      return es ? `${value}% de descuento` : `${value}% off`
    case 'fixed_amount':
      return es ? `${money} de descuento` : `${money} off`
    case 'fixed_price':
      return es ? `Total fijo ${money}` : `Fixed total ${money}`
    default:
      return ''
  }
}

/** Empty scope arrays mean "everything", which is how the DB defaults them. */
export function couponScopeSummary(coupon: CouponRow, es: boolean): string {
  const kinds = coupon.applies_to_class_kinds?.length
    ? coupon.applies_to_class_kinds.join(', ')
    : es ? 'todos los paquetes' : 'all packages'
  const tiers = coupon.applies_to_coach_tiers?.length
    ? coupon.applies_to_coach_tiers.join(', ')
    : es ? 'todos los coaches' : 'all coach tiers'
  return `${kinds} · ${tiers}`
}

export function couponCoversScope(
  coupon: Pick<CouponRow, 'applies_to_class_kinds' | 'applies_to_coach_tiers'>,
  classKind: string | null | undefined,
  coachTier: string | null | undefined,
): boolean {
  const kinds = coupon.applies_to_class_kinds ?? []
  const tiers = coupon.applies_to_coach_tiers ?? []
  // An unknown purchase shape only passes when the coupon is unscoped.
  if (kinds.length && (!classKind || !kinds.includes(classKind))) return false
  if (tiers.length && (!coachTier || !tiers.includes(coachTier))) return false
  return true
}

/**
 * Map the hardcoded package ids used by the /book wizard onto the price-sheet
 * vocabulary, so a coupon can be scoped once and work on every surface.
 */
export function classKindForBookOption(
  optionId: string | null | undefined,
): { classKind: ClassPackageKind; coachTier: CoachPricingTier } | null {
  switch (optionId) {
    case 'monthly':
      return { classKind: 'monthly_8', coachTier: 'principiante' }
    case 'monthly_intermediate':
      return { classKind: 'monthly_8', coachTier: 'pro_street' }
    case 'saturdays':
      return { classKind: 'monthly_4', coachTier: 'principiante' }
    case 'grouped':
      return { classKind: 'group_session', coachTier: 'principiante' }
    case 'individual':
      return { classKind: 'individual_session', coachTier: 'principiante' }
    case 'pkg_3':
      return { classKind: 'group_pack_3', coachTier: 'principiante' }
    case 'pkg_5':
      return { classKind: 'group_pack_5', coachTier: 'principiante' }
    case 'ind_3':
      return { classKind: 'individual_pack_3', coachTier: 'principiante' }
    case 'ind_5':
      return { classKind: 'individual_pack_5', coachTier: 'principiante' }
    case 'pro_group_single':
      return { classKind: 'group_session', coachTier: 'pro_street' }
    case 'pro_max_single':
      return { classKind: 'individual_session', coachTier: 'pro_street' }
    case 'pro_group_3':
      return { classKind: 'group_pack_3', coachTier: 'pro_street' }
    case 'pro_group_5':
      return { classKind: 'group_pack_5', coachTier: 'pro_street' }
    case 'pro_ind_3':
      return { classKind: 'individual_pack_3', coachTier: 'pro_street' }
    case 'pro_ind_5':
      return { classKind: 'individual_pack_5', coachTier: 'pro_street' }
    case 'pro_monthly':
      return { classKind: 'monthly_16', coachTier: 'pro_street' }
    default:
      return null
  }
}

/** Season packs are expressed as a class count (4, 8, 12, 16, 24). */
export function classKindForPack(pack: number | null | undefined): ClassPackageKind | null {
  switch (Number(pack)) {
    case 1:
      return 'group_session'
    case 4:
      return 'monthly_4'
    case 8:
      return 'monthly_8'
    case 12:
      return 'monthly_12'
    case 16:
      return 'monthly_16'
    case 24:
      return 'monthly_24'
    default:
      return null
  }
}
