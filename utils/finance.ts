/**
 * Finance module: the business Excel expressed as types + math.
 *
 * Sheet columns map to code as:
 *   Precio        -> list_mxn
 *   Descuento     -> discount_pct        (0.20 = 20%)
 *   Precio final  -> final_mxn           (NULL sells at list price)
 *   Sesiones      -> sessions
 *   Vendidos      -> units_sold
 *   Total Vendido -> totalSoldMxn(row)
 *   Pago x dia    -> payPerSessionMxn(row)
 *   % Academia    -> academy_pct
 *   Academia      -> academyCutMxn(row)
 *   Pago Coach    -> coachPayMxn(row)
 *   Cuota minima  -> min_fee_mxn         (reserved, no logic yet)
 */

import { triggerBlobDownload } from '~/utils/shopProductBulkXlsx'
import type { CoachPricingTier, ClassPackageKind } from '~/utils/classPricing'

// ---------------------------------------------------------------------------
// Catalogs
// ---------------------------------------------------------------------------

/** Sheet labels for the three tiers. `principiante` is "Coach Niik" in the sheet. */
export const FINANCE_COACH_TIERS = [
  { id: 'principiante', es: 'Coach Niik', en: 'Coach Niik', color: '#22c55e' },
  { id: 'pro_street', es: 'Coach Pro Street', en: 'Coach Pro Street', color: '#38bdf8' },
  { id: 'pro_bowl', es: 'Coach Pro Bowl', en: 'Coach Pro Bowl', color: '#f59e0b' },
] as const satisfies ReadonlyArray<{ id: CoachPricingTier; es: string; en: string; color: string }>

export const FINANCE_CLASS_KINDS = [
  { id: 'monthly_4', es: 'Mensual (4 sesh)', en: 'Monthly (4 sesh)' },
  { id: 'monthly_8', es: 'Mensual (8 sesh)', en: 'Monthly (8 sesh)' },
  { id: 'monthly_12', es: 'Mensual (12 sesh)', en: 'Monthly (12 sesh)' },
  { id: 'monthly_16', es: 'Mensual (16 sesh)', en: 'Monthly (16 sesh)' },
  { id: 'monthly_24', es: 'Mensual (24 sesh)', en: 'Monthly (24 sesh)' },
  { id: 'group_session', es: 'Grupal · 1 sesión', en: 'Group · 1 session' },
  { id: 'individual_session', es: 'Individual · 1 sesión', en: 'Individual · 1 session' },
  { id: 'group_pack_3', es: 'Grupal 3 sesiones', en: 'Group 3 sessions' },
  { id: 'group_pack_5', es: 'Grupal 5 sesiones', en: 'Group 5 sessions' },
  { id: 'individual_pack_3', es: 'Ind 3 sesiones', en: 'Individual 3 sessions' },
  { id: 'individual_pack_5', es: 'Ind 5 sesiones', en: 'Individual 5 sessions' },
] as const satisfies ReadonlyArray<{ id: ClassPackageKind; es: string; en: string }>

export const PAYMENT_METHODS = [
  { id: 'cash', emoji: '💵', es: 'Efectivo', en: 'Cash' },
  { id: 'transfer', emoji: '🏦', es: 'Transferencia', en: 'Transfer' },
  { id: 'card', emoji: '💳', es: 'Tarjeta', en: 'Card' },
  { id: 'other', emoji: '🧾', es: 'Otro', en: 'Other' },
] as const

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]['id']

/** Money in. */
export const INCOME_CATEGORIES = [
  { id: 'class_program', emoji: '🛹', es: 'Programa de clases', en: 'Class program' },
  { id: 'drop_in', emoji: '🎟️', es: 'Clase suelta', en: 'Drop-in class' },
  { id: 'individual', emoji: '🎯', es: 'Clase individual', en: 'Individual class' },
  { id: 'summer_course', emoji: '☀️', es: 'Curso de verano', en: 'Summer course' },
  { id: 'competition', emoji: '🏆', es: 'Competencia', en: 'Competition' },
  { id: 'shop', emoji: '🏪', es: 'Skateshop', en: 'Skateshop' },
  { id: 'ramps', emoji: '🔧', es: 'Rampas', en: 'Ramps' },
  { id: 'other', emoji: '💰', es: 'Otro', en: 'Other' },
] as const

export type IncomeCategoryId = (typeof INCOME_CATEGORIES)[number]['id']

/** Money out. Keeps the four categories the old Pagos page used, plus the rest. */
export const EXPENSE_CATEGORIES = [
  { id: 'coaches', emoji: '👨‍🏫', es: 'Coaches', en: 'Coaches' },
  { id: 'rent', emoji: '🏠', es: 'Renta / parque', en: 'Rent / park' },
  { id: 'insumos', emoji: '📦', es: 'Insumos', en: 'Supplies' },
  { id: 'equipment', emoji: '🛹', es: 'Equipo', en: 'Equipment' },
  { id: 'maintenance', emoji: '🔧', es: 'Mantenimiento', en: 'Maintenance' },
  { id: 'marketing', emoji: '📣', es: 'Marketing', en: 'Marketing' },
  { id: 'transport', emoji: '🚚', es: 'Transporte', en: 'Transport' },
  { id: 'software', emoji: '💻', es: 'Software', en: 'Software' },
  { id: 'legal', emoji: '📄', es: 'Legal / permisos', en: 'Legal / permits' },
  { id: 'taxes', emoji: '🏛️', es: 'Impuestos', en: 'Taxes' },
  { id: 'other', emoji: '🧾', es: 'Otro', en: 'Other' },
] as const

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORIES)[number]['id']

/**
 * Weekday columns of the student control sheet, in Monday-first order.
 * `value` is the JS weekday so it lines up with DEFAULT_PROGRAM_WEEKDAYS.
 */
export const ATTEND_WEEKDAYS = [
  { value: 1, initial: 'L', es: 'Lunes', en: 'Mon' },
  { value: 2, initial: 'M', es: 'Martes', en: 'Tue' },
  { value: 3, initial: 'M', es: 'Miércoles', en: 'Wed' },
  { value: 4, initial: 'J', es: 'Jueves', en: 'Thu' },
  { value: 5, initial: 'V', es: 'Viernes', en: 'Fri' },
  { value: 6, initial: 'S', es: 'Sábado', en: 'Sat' },
  { value: 0, initial: 'D', es: 'Domingo', en: 'Sun' },
] as const

export const RECURRENCES = [
  { id: 'monthly', es: 'Mensual', en: 'Monthly', perMonth: 1 },
  { id: 'quarterly', es: 'Trimestral', en: 'Quarterly', perMonth: 1 / 3 },
  { id: 'yearly', es: 'Anual', en: 'Yearly', perMonth: 1 / 12 },
] as const

export type RecurrenceId = (typeof RECURRENCES)[number]['id']

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface FinancePriceRow {
  id: string
  coach_tier: CoachPricingTier
  class_kind: ClassPackageKind
  label_es: string
  label_en: string | null
  list_mxn: number
  discount_pct: number | null
  final_mxn: number | null
  sessions: number
  units_sold: number
  academy_pct: number
  min_fee_mxn: number | null
  notes: string | null
  sort_order: number
  is_active: boolean
  created_at?: string
  updated_at?: string
}

export interface FinancePaymentRow {
  id: string
  paid_on: string
  amount_mxn: number
  category: string
  payment_method: PaymentMethodId
  status: 'paid' | 'pending' | 'refunded'
  payer_name: string | null
  skater_id: string | null
  coach_id: string | null
  price_list_id: string | null
  coach_tier: CoachPricingTier | null
  class_kind: ClassPackageKind | null
  sessions: number | null
  academy_pct: number
  /** Generated by Postgres. */
  academy_cut_mxn?: number | null
  coach_pay_mxn?: number | null
  reference: string | null
  notes: string | null
  received_by: string | null
  created_at?: string
}

export interface FinanceExpenseRow {
  id: string
  incurred_on: string
  category: string
  vendor: string | null
  description: string | null
  amount_mxn: number
  payment_method: PaymentMethodId
  status: 'paid' | 'pending'
  is_recurring: boolean
  recurrence: RecurrenceId | null
  coach_id: string | null
  reference: string | null
  notes: string | null
  created_at?: string
}

export interface FinanceEnrollmentRow {
  id: string
  skater_id: string | null
  student_name: string
  price_list_id: string | null
  coach_tier: CoachPricingTier | null
  class_kind: ClassPackageKind | null
  plan_label: string | null
  price_mxn: number
  packages_paid: number
  amount_paid_mxn: number
  sessions_paid: number
  last_payment_on: string | null
  attend_weekdays: number[]
  attended: number
  absences: number
  /** Generated by Postgres. */
  remaining_sessions?: number | null
  coach_id: string | null
  season_slug: string | null
  started_on: string | null
  notes: string | null
  is_active: boolean
  created_at?: string
}

export interface FinanceSettingsRow {
  id: boolean
  owner_draw_mxn: number
  target_profit_mxn: number
  reserve_pct: number
  extra_fixed_cost_mxn: number
  notes: string | null
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const pick = <T extends { es: string; en: string }>(row: T | undefined, es: boolean) =>
  row ? (es ? row.es : row.en) : ''

export const coachTierSheetLabel = (id: string | null | undefined, es: boolean) =>
  pick(FINANCE_COACH_TIERS.find(t => t.id === id), es) || (id ?? '')

export const classKindLabel = (id: string | null | undefined, es: boolean) =>
  pick(FINANCE_CLASS_KINDS.find(k => k.id === id), es) || (id ?? '')

export const paymentMethodLabel = (id: string | null | undefined, es: boolean) =>
  pick(PAYMENT_METHODS.find(m => m.id === id), es) || (id ?? '')

export const incomeCategoryLabel = (id: string | null | undefined, es: boolean) =>
  pick(INCOME_CATEGORIES.find(c => c.id === id), es) || (id ?? '')

export const expenseCategoryLabel = (id: string | null | undefined, es: boolean) =>
  pick(EXPENSE_CATEGORIES.find(c => c.id === id), es) || (id ?? '')

export const recurrenceLabel = (id: string | null | undefined, es: boolean) =>
  pick(RECURRENCES.find(r => r.id === id), es) || ''

export const categoryEmoji = (
  id: string | null | undefined,
  list: ReadonlyArray<{ id: string; emoji: string }>,
) => list.find(c => c.id === id)?.emoji ?? '•'

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Named to avoid colliding with the auto-imported formatMxn in classPricing.ts. */
export function formatMoneyMxn(value: number | null | undefined, withCents = false): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  }).format(value)
}

/** Stored as a fraction, shown as a percent. */
export function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${Math.round(value * 1000) / 10}%`
}

export function formatDateEs(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

// ---------------------------------------------------------------------------
// Price sheet math
// ---------------------------------------------------------------------------

/** What the customer actually pays: Precio final when set, otherwise Precio. */
export function effectivePriceMxn(row: Pick<FinancePriceRow, 'list_mxn' | 'final_mxn'>): number {
  return row.final_mxn != null && row.final_mxn > 0 ? Number(row.final_mxn) : Number(row.list_mxn || 0)
}

/** The sheet's formula: discount the list price, then round up to the nearest 100. */
export function suggestedFinalMxn(listMxn: number, discountPct: number | null): number | null {
  if (!discountPct || !listMxn) return null
  return Math.ceil((listMxn * (1 - discountPct)) / 100) * 100
}

/** Total Vendido = Precio final x Vendidos. */
export function totalSoldMxn(row: FinancePriceRow): number {
  return effectivePriceMxn(row) * (row.units_sold || 0)
}

/** Pago x dia = Precio final / Sesiones. */
export function payPerSessionMxn(row: FinancePriceRow): number {
  const sessions = row.sessions || 1
  return effectivePriceMxn(row) / sessions
}

/** Academia = Total Vendido x % Academia. */
export function academyCutMxn(row: FinancePriceRow): number {
  return totalSoldMxn(row) * (row.academy_pct || 0)
}

/** Pago Coach = Total Vendido - Academia. */
export function coachPayMxn(row: FinancePriceRow): number {
  return totalSoldMxn(row) - academyCutMxn(row)
}

/** What the academy keeps on a single unit — the number break-even runs on. */
export function academyPerUnitMxn(row: FinancePriceRow): number {
  return effectivePriceMxn(row) * (row.academy_pct || 0)
}

export function sortPriceRows(rows: FinancePriceRow[]): FinancePriceRow[] {
  const tierIndex = (t: string) => FINANCE_COACH_TIERS.findIndex(x => x.id === t)
  return [...rows].sort(
    (a, b) => tierIndex(a.coach_tier) - tierIndex(b.coach_tier) || a.sort_order - b.sort_order,
  )
}

// ---------------------------------------------------------------------------
// Ledger aggregates
// ---------------------------------------------------------------------------

export interface LedgerTotals {
  gross: number
  academyNet: number
  coachPayout: number
  pending: number
  count: number
}

export function summarizePayments(rows: FinancePaymentRow[]): LedgerTotals {
  let gross = 0
  let academyNet = 0
  let coachPayout = 0
  let pending = 0
  for (const r of rows) {
    const amount = Number(r.amount_mxn || 0)
    if (r.status === 'refunded') continue
    if (r.status === 'pending') {
      pending += amount
      continue
    }
    gross += amount
    const cut = r.academy_cut_mxn != null ? Number(r.academy_cut_mxn) : amount * Number(r.academy_pct || 0)
    academyNet += cut
    coachPayout += amount - cut
  }
  return { gross, academyNet, coachPayout, pending, count: rows.length }
}

export function summarizeExpenses(rows: FinanceExpenseRow[]) {
  let paid = 0
  let pending = 0
  for (const r of rows) {
    const amount = Number(r.amount_mxn || 0)
    if (r.status === 'pending') pending += amount
    else paid += amount
  }
  return { paid, pending, total: paid + pending, count: rows.length }
}

export function totalsByCategory(
  rows: Array<{ category: string; amount_mxn: number }>,
): Array<{ category: string; total: number; count: number }> {
  const map = new Map<string, { total: number; count: number }>()
  for (const r of rows) {
    const entry = map.get(r.category) ?? { total: 0, count: 0 }
    entry.total += Number(r.amount_mxn || 0)
    entry.count += 1
    map.set(r.category, entry)
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.total - a.total)
}

// ---------------------------------------------------------------------------
// Student control sheet
// ---------------------------------------------------------------------------

export type FinanceTone = 'good' | 'warn' | 'bad' | null

/** Quedan. Falls back to the formula when the generated column is not loaded. */
export function remainingSessions(row: FinanceEnrollmentRow): number {
  if (row.remaining_sessions != null) return Number(row.remaining_sessions)
  return Number(row.sessions_paid || 0) - Number(row.attended || 0) - Number(row.absences || 0)
}

/** Out of classes reads red, one or two left reads amber — same cue as the sheet. */
export function remainingTone(row: FinanceEnrollmentRow): FinanceTone {
  const left = remainingSessions(row)
  if (left <= 0) return 'bad'
  if (left <= 2) return 'warn'
  return 'good'
}

export function daysSincePayment(row: FinanceEnrollmentRow): number | null {
  if (!row.last_payment_on) return null
  const then = new Date(`${row.last_payment_on.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(then.getTime())) return null
  const now = new Date()
  return Math.floor((now.getTime() - then.getTime()) / 86_400_000)
}

/** A month without a payment is the point where the sheet turns the cell red. */
export function paymentTone(row: FinanceEnrollmentRow): FinanceTone {
  const age = daysSincePayment(row)
  if (age == null) return 'bad'
  if (age <= 20) return 'good'
  if (age <= 33) return 'warn'
  return 'bad'
}

/** "L·M" style summary of the committed days. */
export function weekdaysLabel(days: number[] | null | undefined): string {
  if (!days?.length) return '—'
  return ATTEND_WEEKDAYS.filter(d => days.includes(d.value))
    .map(d => d.initial)
    .join('·')
}

export function summarizeEnrollments(rows: FinanceEnrollmentRow[]) {
  let paid = 0
  let sessionsPaid = 0
  let attended = 0
  let absences = 0
  let remaining = 0
  let outOfClasses = 0
  let overdue = 0
  for (const r of rows) {
    paid += Number(r.amount_paid_mxn || 0)
    sessionsPaid += Number(r.sessions_paid || 0)
    attended += Number(r.attended || 0)
    absences += Number(r.absences || 0)
    const left = remainingSessions(r)
    remaining += Math.max(0, left)
    if (left <= 0) outOfClasses += 1
    if (paymentTone(r) === 'bad') overdue += 1
  }
  return {
    paid,
    sessionsPaid,
    attended,
    absences,
    remaining,
    outOfClasses,
    overdue,
    count: rows.length,
    attendanceRate: attended + absences > 0 ? attended / (attended + absences) : 0,
  }
}

export function enrollmentsCsv(rows: FinanceEnrollmentRow[], es: boolean): string {
  return buildCsv(
    [
      'Alumno', 'Tipo de clase', 'Precio', 'Ultimo pago', 'Vendidos', 'Total Vendido',
      'Sesiones', ...ATTEND_WEEKDAYS.map(d => (es ? d.es : d.en)),
      'Asistencia', 'Faltas', 'Quedan', 'Coach tier', 'Activo', 'Notas',
    ],
    rows.map(r => [
      r.student_name,
      r.plan_label ?? classKindLabel(r.class_kind, es),
      Number(r.price_mxn || 0),
      r.last_payment_on ?? '',
      r.packages_paid,
      Number(r.amount_paid_mxn || 0),
      r.sessions_paid,
      ...ATTEND_WEEKDAYS.map(d => (r.attend_weekdays?.includes(d.value) ? 'X' : '')),
      r.attended,
      r.absences,
      remainingSessions(r),
      coachTierSheetLabel(r.coach_tier, es),
      r.is_active ? 'si' : 'no',
      r.notes ?? '',
    ]),
  )
}

// ---------------------------------------------------------------------------
// Minimum viable income
// ---------------------------------------------------------------------------

/** A recurring expense normalized to a monthly figure. */
export function monthlyAmount(row: FinanceExpenseRow): number {
  if (!row.is_recurring) return 0
  const per = RECURRENCES.find(r => r.id === row.recurrence)?.perMonth ?? 1
  return Number(row.amount_mxn || 0) * per
}

export function monthlyFixedCostMxn(rows: FinanceExpenseRow[]): number {
  return rows.reduce((sum, r) => sum + monthlyAmount(r), 0)
}

export interface BreakEven {
  /** Recurring expenses normalized to a month. */
  fixedCost: number
  /** Fixed cost + owner draw + target profit, grossed up for the reserve. */
  minimumViableIncome: number
  /** Same figure expressed as gross sales, given the academy's average cut. */
  requiredGrossSales: number
  avgAcademyPct: number
}

export function computeBreakEven(input: {
  expenses: FinanceExpenseRow[]
  settings: Pick<
    FinanceSettingsRow,
    'owner_draw_mxn' | 'target_profit_mxn' | 'reserve_pct' | 'extra_fixed_cost_mxn'
  > | null
  priceRows: FinancePriceRow[]
}): BreakEven {
  const s = input.settings
  const fixedCost =
    monthlyFixedCostMxn(input.expenses) + Number(s?.extra_fixed_cost_mxn || 0)

  const needed = fixedCost + Number(s?.owner_draw_mxn || 0) + Number(s?.target_profit_mxn || 0)
  const reserve = Math.min(Number(s?.reserve_pct || 0), 0.95)
  const minimumViableIncome = reserve > 0 ? needed / (1 - reserve) : needed

  const active = input.priceRows.filter(r => r.is_active && r.academy_pct > 0)
  const avgAcademyPct = active.length
    ? active.reduce((sum, r) => sum + Number(r.academy_pct), 0) / active.length
    : 0

  return {
    fixedCost,
    minimumViableIncome,
    requiredGrossSales: avgAcademyPct > 0 ? minimumViableIncome / avgAcademyPct : 0,
    avgAcademyPct,
  }
}

/** How many of this package must sell in a month to reach the target. */
export function unitsToTarget(row: FinancePriceRow, targetMxn: number): number | null {
  const perUnit = academyPerUnitMxn(row)
  if (perUnit <= 0 || targetMxn <= 0) return null
  return Math.ceil(targetMxn / perUnit)
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

function csvCell(value: unknown): string {
  if (value == null) return ''
  const s = String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildCsv(headers: string[], rows: Array<Array<unknown>>): string {
  return [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n')
}

/** BOM so Excel opens accents correctly on Windows. */
export function downloadCsv(filename: string, csv: string) {
  triggerBlobDownload(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), filename)
}

const stamp = () => new Date().toISOString().slice(0, 10)

export function priceListCsv(rows: FinancePriceRow[], es: boolean): string {
  return buildCsv(
    [
      'Coach', 'Tipo de clase', 'Precio', 'Precio final', 'Sesiones', 'Descuento',
      'Vendidos', 'Total Vendido', 'Pago x dia', '% Academia', 'Academia',
      'Cuota minima', 'Pago Coach', 'Activo', 'Notas',
    ],
    sortPriceRows(rows).map(r => [
      coachTierSheetLabel(r.coach_tier, es),
      r.label_es,
      r.list_mxn,
      r.final_mxn ?? '',
      r.sessions,
      r.discount_pct != null ? `${Math.round(r.discount_pct * 100)}%` : '',
      r.units_sold,
      totalSoldMxn(r),
      Math.round(payPerSessionMxn(r) * 100) / 100,
      `${Math.round(r.academy_pct * 100)}%`,
      Math.round(academyCutMxn(r) * 100) / 100,
      r.min_fee_mxn ?? '',
      Math.round(coachPayMxn(r) * 100) / 100,
      r.is_active ? 'si' : 'no',
      r.notes ?? '',
    ]),
  )
}

export function paymentsCsv(rows: FinancePaymentRow[], es: boolean): string {
  return buildCsv(
    [
      'Fecha', 'Monto', 'Categoria', 'Metodo', 'Estatus', 'Pagado por', 'Coach',
      'Tipo de clase', 'Sesiones', '% Academia', 'Academia', 'Pago Coach',
      'Referencia', 'Notas',
    ],
    rows.map(r => {
      const amount = Number(r.amount_mxn || 0)
      const cut = r.academy_cut_mxn != null ? Number(r.academy_cut_mxn) : amount * r.academy_pct
      return [
        r.paid_on,
        amount,
        incomeCategoryLabel(r.category, es),
        paymentMethodLabel(r.payment_method, es),
        r.status,
        r.payer_name ?? '',
        coachTierSheetLabel(r.coach_tier, es),
        classKindLabel(r.class_kind, es),
        r.sessions ?? '',
        `${Math.round(r.academy_pct * 100)}%`,
        Math.round(cut * 100) / 100,
        Math.round((amount - cut) * 100) / 100,
        r.reference ?? '',
        r.notes ?? '',
      ]
    }),
  )
}

export function expensesCsv(rows: FinanceExpenseRow[], es: boolean): string {
  return buildCsv(
    [
      'Fecha', 'Categoria', 'Proveedor', 'Descripcion', 'Monto', 'Metodo',
      'Estatus', 'Recurrente', 'Frecuencia', 'Mensualizado', 'Referencia', 'Notas',
    ],
    rows.map(r => [
      r.incurred_on,
      expenseCategoryLabel(r.category, es),
      r.vendor ?? '',
      r.description ?? '',
      Number(r.amount_mxn || 0),
      paymentMethodLabel(r.payment_method, es),
      r.status,
      r.is_recurring ? 'si' : 'no',
      recurrenceLabel(r.recurrence, es),
      Math.round(monthlyAmount(r) * 100) / 100,
      r.reference ?? '',
      r.notes ?? '',
    ]),
  )
}

export const priceListCsvName = () => `niik-precios-${stamp()}.csv`
export const paymentsCsvName = () => `niik-ingresos-${stamp()}.csv`
export const expensesCsvName = () => `niik-gastos-${stamp()}.csv`
export const enrollmentsCsvName = () => `niik-alumnos-${stamp()}.csv`
