/**
 * Finance data access: price sheet, income ledger, expense ledger, break-even settings.
 * Rows are cached in `useState` so moving between the Finanzas tabs does not refetch.
 */

import type {
  FinanceEnrollmentRow,
  FinanceExpenseRow,
  FinancePaymentRow,
  FinancePriceRow,
  FinanceSettingsRow,
} from '~/utils/finance'

const MIGRATION_HINT =
  'run supabase/migrations/add_finance_module.sql in the Supabase SQL Editor, then reload'

function friendlyError(message: string): string {
  if (
    /finance_(price_list|payments|expenses|settings|student_enrollments)|does not exist|schema cache/i
      .test(message)
  ) {
    return `${message} — ${MIGRATION_HINT}`
  }
  if (/row-level security/i.test(message)) {
    return `${message} — only admins can write finance rows; confirm your profile role is "admin".`
  }
  return message
}

export interface MonthRange {
  from: string
  to: string
}

/** First and last day of a month, as `YYYY-MM-DD`. */
export function monthRange(year: number, monthIndex: number): MonthRange {
  const pad = (n: number) => String(n).padStart(2, '0')
  const last = new Date(year, monthIndex + 1, 0).getDate()
  return {
    from: `${year}-${pad(monthIndex + 1)}-01`,
    to: `${year}-${pad(monthIndex + 1)}-${pad(last)}`,
  }
}

export function currentMonthKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function monthKeyRange(key: string): MonthRange {
  const [y, m] = key.split('-').map(Number)
  return monthRange(y, (m || 1) - 1)
}

type MutationResult = { ok: boolean; message?: string }

export function useFinance() {
  const client = useSupabaseClient()
  const user = useSupabaseUser()

  const priceRows = useState<FinancePriceRow[]>('finance-price-rows', () => [])
  const payments = useState<FinancePaymentRow[]>('finance-payments', () => [])
  const expenses = useState<FinanceExpenseRow[]>('finance-expenses', () => [])
  const enrollments = useState<FinanceEnrollmentRow[]>('finance-enrollments', () => [])
  const settings = useState<FinanceSettingsRow | null>('finance-settings', () => null)

  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)

  const fail = (e: unknown, fallback: string): MutationResult => {
    const raw = (e as { message?: string })?.message || fallback
    const message = friendlyError(raw)
    error.value = message
    console.error(fallback, e)
    return { ok: false, message }
  }

  // -------------------------------------------------------------------------
  // Price sheet
  // -------------------------------------------------------------------------

  const loadPriceRows = async (opts?: { force?: boolean }) => {
    if (priceRows.value.length && !opts?.force) return priceRows.value
    loading.value = true
    error.value = null
    try {
      const { data, error: e } = await client
        .from('finance_price_list')
        .select('*')
        .order('coach_tier')
        .order('sort_order')
      if (e) throw new Error(e.message)
      priceRows.value = (data || []) as unknown as FinancePriceRow[]
    } catch (e) {
      fail(e, 'loadPriceRows failed')
    } finally {
      loading.value = false
    }
    return priceRows.value
  }

  const updatePriceRow = async (
    id: string,
    patch: Partial<FinancePriceRow>,
  ): Promise<MutationResult> => {
    const index = priceRows.value.findIndex(r => r.id === id)
    const previous = index >= 0 ? { ...priceRows.value[index] } : null
    // Optimistic: the grid should feel like a spreadsheet.
    if (index >= 0) priceRows.value[index] = { ...priceRows.value[index], ...patch }

    saving.value = true
    error.value = null
    try {
      const { error: e } = await client.from('finance_price_list').update(patch).eq('id', id)
      if (e) throw new Error(e.message)
      return { ok: true }
    } catch (e) {
      if (previous && index >= 0) priceRows.value[index] = previous
      return fail(e, 'updatePriceRow failed')
    } finally {
      saving.value = false
    }
  }

  const addPriceRow = async (row: Partial<FinancePriceRow>): Promise<MutationResult> => {
    saving.value = true
    error.value = null
    try {
      const { data, error: e } = await client
        .from('finance_price_list')
        .insert(row)
        .select('*')
        .single()
      if (e) throw new Error(e.message)
      priceRows.value = [...priceRows.value, data as unknown as FinancePriceRow]
      return { ok: true }
    } catch (e) {
      return fail(e, 'addPriceRow failed')
    } finally {
      saving.value = false
    }
  }

  const deletePriceRow = async (id: string): Promise<MutationResult> => {
    saving.value = true
    try {
      const { error: e } = await client.from('finance_price_list').delete().eq('id', id)
      if (e) throw new Error(e.message)
      priceRows.value = priceRows.value.filter(r => r.id !== id)
      return { ok: true }
    } catch (e) {
      return fail(e, 'deletePriceRow failed')
    } finally {
      saving.value = false
    }
  }

  // -------------------------------------------------------------------------
  // Income ledger
  // -------------------------------------------------------------------------

  const loadPayments = async (range?: MonthRange) => {
    loading.value = true
    error.value = null
    try {
      let query = client.from('finance_payments').select('*').order('paid_on', { ascending: false })
      if (range) query = query.gte('paid_on', range.from).lte('paid_on', range.to)
      const { data, error: e } = await query.limit(1000)
      if (e) throw new Error(e.message)
      payments.value = (data || []) as unknown as FinancePaymentRow[]
    } catch (e) {
      fail(e, 'loadPayments failed')
    } finally {
      loading.value = false
    }
    return payments.value
  }

  const addPayment = async (row: Partial<FinancePaymentRow>): Promise<MutationResult> => {
    saving.value = true
    error.value = null
    try {
      const payload = {
        ...stripGenerated(row),
        received_by: row.received_by ?? user.value?.id ?? null,
      }
      const { data, error: e } = await client
        .from('finance_payments')
        .insert(payload)
        .select('*')
        .single()
      if (e) throw new Error(e.message)
      payments.value = [data as unknown as FinancePaymentRow, ...payments.value]
      return { ok: true }
    } catch (e) {
      return fail(e, 'addPayment failed')
    } finally {
      saving.value = false
    }
  }

  const updatePayment = async (
    id: string,
    patch: Partial<FinancePaymentRow>,
  ): Promise<MutationResult> => {
    const index = payments.value.findIndex(r => r.id === id)
    const previous = index >= 0 ? { ...payments.value[index] } : null
    if (index >= 0) payments.value[index] = { ...payments.value[index], ...patch }

    saving.value = true
    try {
      const { data, error: e } = await client
        .from('finance_payments')
        .update(stripGenerated(patch))
        .eq('id', id)
        .select('*')
        .single()
      if (e) throw new Error(e.message)
      // Re-read so the generated split columns stay in sync with the new amount.
      if (index >= 0) payments.value[index] = data as unknown as FinancePaymentRow
      return { ok: true }
    } catch (e) {
      if (previous && index >= 0) payments.value[index] = previous
      return fail(e, 'updatePayment failed')
    } finally {
      saving.value = false
    }
  }

  const deletePayment = async (id: string): Promise<MutationResult> => {
    saving.value = true
    try {
      const { error: e } = await client.from('finance_payments').delete().eq('id', id)
      if (e) throw new Error(e.message)
      payments.value = payments.value.filter(r => r.id !== id)
      return { ok: true }
    } catch (e) {
      return fail(e, 'deletePayment failed')
    } finally {
      saving.value = false
    }
  }

  // -------------------------------------------------------------------------
  // Expense ledger
  // -------------------------------------------------------------------------

  const loadExpenses = async (range?: MonthRange) => {
    loading.value = true
    error.value = null
    try {
      let query = client
        .from('finance_expenses')
        .select('*')
        .order('incurred_on', { ascending: false })
      if (range) {
        // Recurring rows describe an ongoing cost, so they belong to every month.
        query = query.or(
          `is_recurring.eq.true,and(incurred_on.gte.${range.from},incurred_on.lte.${range.to})`,
        )
      }
      const { data, error: e } = await query.limit(1000)
      if (e) throw new Error(e.message)
      expenses.value = (data || []) as unknown as FinanceExpenseRow[]
    } catch (e) {
      fail(e, 'loadExpenses failed')
    } finally {
      loading.value = false
    }
    return expenses.value
  }

  const addExpense = async (row: Partial<FinanceExpenseRow>): Promise<MutationResult> => {
    saving.value = true
    error.value = null
    try {
      const { data, error: e } = await client
        .from('finance_expenses')
        .insert({ ...row, created_by: user.value?.id ?? null })
        .select('*')
        .single()
      if (e) throw new Error(e.message)
      expenses.value = [data as unknown as FinanceExpenseRow, ...expenses.value]
      return { ok: true }
    } catch (e) {
      return fail(e, 'addExpense failed')
    } finally {
      saving.value = false
    }
  }

  const updateExpense = async (
    id: string,
    patch: Partial<FinanceExpenseRow>,
  ): Promise<MutationResult> => {
    const index = expenses.value.findIndex(r => r.id === id)
    const previous = index >= 0 ? { ...expenses.value[index] } : null
    if (index >= 0) expenses.value[index] = { ...expenses.value[index], ...patch }

    saving.value = true
    try {
      const { error: e } = await client.from('finance_expenses').update(patch).eq('id', id)
      if (e) throw new Error(e.message)
      return { ok: true }
    } catch (e) {
      if (previous && index >= 0) expenses.value[index] = previous
      return fail(e, 'updateExpense failed')
    } finally {
      saving.value = false
    }
  }

  const deleteExpense = async (id: string): Promise<MutationResult> => {
    saving.value = true
    try {
      const { error: e } = await client.from('finance_expenses').delete().eq('id', id)
      if (e) throw new Error(e.message)
      expenses.value = expenses.value.filter(r => r.id !== id)
      return { ok: true }
    } catch (e) {
      return fail(e, 'deleteExpense failed')
    } finally {
      saving.value = false
    }
  }

  // -------------------------------------------------------------------------
  // Student control sheet
  // -------------------------------------------------------------------------

  const loadEnrollments = async (opts?: { force?: boolean; includeInactive?: boolean }) => {
    if (enrollments.value.length && !opts?.force) return enrollments.value
    loading.value = true
    error.value = null
    try {
      let query = client
        .from('finance_student_enrollments')
        .select('*')
        .order('student_name')
      if (!opts?.includeInactive) query = query.eq('is_active', true)
      const { data, error: e } = await query.limit(1000)
      if (e) throw new Error(e.message)
      enrollments.value = (data || []) as unknown as FinanceEnrollmentRow[]
    } catch (e) {
      fail(e, 'loadEnrollments failed')
    } finally {
      loading.value = false
    }
    return enrollments.value
  }

  const addEnrollment = async (row: Partial<FinanceEnrollmentRow>): Promise<MutationResult> => {
    saving.value = true
    error.value = null
    try {
      const { data, error: e } = await client
        .from('finance_student_enrollments')
        .insert({ ...stripEnrollmentGenerated(row), created_by: user.value?.id ?? null })
        .select('*')
        .single()
      if (e) throw new Error(e.message)
      enrollments.value = [...enrollments.value, data as unknown as FinanceEnrollmentRow].sort(
        (a, b) => a.student_name.localeCompare(b.student_name),
      )
      return { ok: true }
    } catch (e) {
      return fail(e, 'addEnrollment failed')
    } finally {
      saving.value = false
    }
  }

  const updateEnrollment = async (
    id: string,
    patch: Partial<FinanceEnrollmentRow>,
  ): Promise<MutationResult> => {
    const index = enrollments.value.findIndex(r => r.id === id)
    const previous = index >= 0 ? { ...enrollments.value[index] } : null
    if (index >= 0) enrollments.value[index] = { ...enrollments.value[index], ...patch }

    saving.value = true
    try {
      const { data, error: e } = await client
        .from('finance_student_enrollments')
        .update(stripEnrollmentGenerated(patch))
        .eq('id', id)
        .select('*')
        .single()
      if (e) throw new Error(e.message)
      // Re-read so remaining_sessions reflects the new attendance figures.
      if (index >= 0) enrollments.value[index] = data as unknown as FinanceEnrollmentRow
      return { ok: true }
    } catch (e) {
      if (previous && index >= 0) enrollments.value[index] = previous
      return fail(e, 'updateEnrollment failed')
    } finally {
      saving.value = false
    }
  }

  const deleteEnrollment = async (id: string): Promise<MutationResult> => {
    saving.value = true
    try {
      const { error: e } = await client.from('finance_student_enrollments').delete().eq('id', id)
      if (e) throw new Error(e.message)
      enrollments.value = enrollments.value.filter(r => r.id !== id)
      return { ok: true }
    } catch (e) {
      return fail(e, 'deleteEnrollment failed')
    } finally {
      saving.value = false
    }
  }

  // -------------------------------------------------------------------------
  // Break-even settings
  // -------------------------------------------------------------------------

  const loadSettings = async (opts?: { force?: boolean }) => {
    if (settings.value && !opts?.force) return settings.value
    try {
      const { data, error: e } = await client
        .from('finance_settings')
        .select('*')
        .eq('id', true)
        .maybeSingle()
      if (e) throw new Error(e.message)
      settings.value = (data as unknown as FinanceSettingsRow) ?? null
    } catch (e) {
      fail(e, 'loadSettings failed')
    }
    return settings.value
  }

  const saveSettings = async (patch: Partial<FinanceSettingsRow>): Promise<MutationResult> => {
    const previous = settings.value ? { ...settings.value } : null
    settings.value = { ...(settings.value ?? emptySettings()), ...patch }
    saving.value = true
    try {
      const { error: e } = await client
        .from('finance_settings')
        .upsert({ id: true, ...patch }, { onConflict: 'id' })
      if (e) throw new Error(e.message)
      return { ok: true }
    } catch (e) {
      settings.value = previous
      return fail(e, 'saveSettings failed')
    } finally {
      saving.value = false
    }
  }

  return {
    priceRows,
    payments,
    expenses,
    enrollments,
    settings,
    loading,
    saving,
    error,
    loadPriceRows,
    addPriceRow,
    updatePriceRow,
    deletePriceRow,
    loadPayments,
    addPayment,
    updatePayment,
    deletePayment,
    loadExpenses,
    addExpense,
    updateExpense,
    deleteExpense,
    loadEnrollments,
    addEnrollment,
    updateEnrollment,
    deleteEnrollment,
    loadSettings,
    saveSettings,
  }
}

function emptySettings(): FinanceSettingsRow {
  return {
    id: true,
    owner_draw_mxn: 0,
    target_profit_mxn: 0,
    reserve_pct: 0,
    extra_fixed_cost_mxn: 0,
    notes: null,
  }
}

/** Postgres computes the split columns; sending them back would be rejected. */
function stripGenerated(row: Partial<FinancePaymentRow>): Partial<FinancePaymentRow> {
  const { academy_cut_mxn: _cut, coach_pay_mxn: _pay, ...rest } = row
  return rest
}

/** remaining_sessions is generated from sessions_paid, attended and absences. */
function stripEnrollmentGenerated(
  row: Partial<FinanceEnrollmentRow>,
): Partial<FinanceEnrollmentRow> {
  const { remaining_sessions: _remaining, ...rest } = row
  return rest
}
