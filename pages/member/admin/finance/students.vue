<script setup lang="ts">
/**
 * Per-student control sheet: classes paid for, the days the family committed to,
 * attendance, absences and classes remaining.
 *
 * Quedan is computed by Postgres as sessions_paid − attended − absences, so an
 * absence burns a class exactly as it does in the Excel.
 */
import type { FinanceSheetColumn } from '~/components/member/FinanceSheet.vue'
import {
  ATTEND_WEEKDAYS,
  FINANCE_COACH_TIERS,
  downloadCsv,
  effectivePriceMxn,
  enrollmentsCsv,
  enrollmentsCsvName,
  formatMoneyMxn,
  paymentTone,
  remainingSessions,
  remainingTone,
  sortPriceRows,
  summarizeEnrollments,
  weekdaysLabel,
  type FinanceEnrollmentRow,
} from '~/utils/finance'

definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

const client = useSupabaseClient()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const {
  enrollments,
  priceRows,
  loading,
  saving,
  error,
  loadEnrollments,
  loadPriceRows,
  addEnrollment,
  updateEnrollment,
  deleteEnrollment,
} = useFinance()

const skaters = ref<Array<{ id: string; full_name: string }>>([])
const search = ref('')
const filter = ref<'all' | 'out' | 'overdue' | 'active'>('all')
const showInactive = ref(false)

onMounted(async () => {
  await Promise.all([loadEnrollments({ force: true }), loadPriceRows()])
  const { data } = await client
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'customer')
    .order('full_name')
  skaters.value = (data as Array<{ id: string; full_name: string }>) || []
})

watch(showInactive, v => loadEnrollments({ force: true, includeInactive: v }))

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return enrollments.value.filter(row => {
    if (q && !row.student_name.toLowerCase().includes(q)) return false
    if (filter.value === 'out' && remainingSessions(row) > 0) return false
    if (filter.value === 'overdue' && paymentTone(row) !== 'bad') return false
    if (filter.value === 'active' && remainingSessions(row) <= 0) return false
    return true
  })
})

const stats = computed(() => summarizeEnrollments(filtered.value))

// ---------------------------------------------------------------------------
// Grid — mirrors the sheet's column order
// ---------------------------------------------------------------------------

const columns = computed((): FinanceSheetColumn[] => [
  {
    key: 'student_name',
    label: es.value ? 'Alumno' : 'Student',
    type: 'text',
    width: 'w-44',
    tone: row => remainingTone(row as FinanceEnrollmentRow),
  },
  {
    key: 'plan_label',
    label: es.value ? 'Tipo de clase' : 'Class type',
    type: 'text',
    width: 'w-36',
    placeholder: es.value ? '8 clases' : '8 classes',
  },
  { key: 'price_mxn', label: es.value ? 'Precio' : 'Price', type: 'money', align: 'right', width: 'w-24' },
  {
    key: 'last_payment_on',
    label: es.value ? 'Último pago' : 'Last payment',
    type: 'date',
    width: 'w-36',
    tone: row => paymentTone(row as FinanceEnrollmentRow),
  },
  { key: 'packages_paid', label: es.value ? 'Vendidos' : 'Sold', type: 'number', align: 'right', width: 'w-20' },
  {
    key: 'amount_paid_mxn',
    label: es.value ? 'Total vendido' : 'Total sold',
    type: 'money',
    align: 'right',
    width: 'w-28',
    highlight: true,
  },
  { key: 'sessions_paid', label: es.value ? 'Sesiones' : 'Sessions', type: 'number', align: 'right', width: 'w-20' },
  {
    key: 'attend_weekdays',
    label: es.value ? 'Días' : 'Days',
    type: 'weekdays',
    align: 'center',
    width: 'w-48',
  },
  { key: 'attended', label: es.value ? 'Asistencia' : 'Attended', type: 'number', align: 'right', width: 'w-24' },
  { key: 'absences', label: es.value ? 'Faltas' : 'Absences', type: 'number', align: 'right', width: 'w-20' },
  {
    key: 'remaining_sessions',
    label: es.value ? 'Quedan' : 'Left',
    type: 'computed',
    align: 'right',
    width: 'w-20',
    tone: row => remainingTone(row as FinanceEnrollmentRow),
    compute: row => String(remainingSessions(row as FinanceEnrollmentRow)),
  },
  {
    key: 'is_active',
    label: es.value ? 'Activo' : 'Active',
    type: 'checkbox',
    align: 'center',
    width: 'w-16',
    hideOnMobile: true,
  },
  { key: 'notes', label: es.value ? 'Notas' : 'Notes', type: 'text', width: 'w-44', hideOnMobile: true },
])

const gridTotals = computed(
  (): Record<string, string> => ({
    student_name: `${stats.value.count} ${es.value ? 'alumnos' : 'students'}`,
    amount_paid_mxn: formatMoneyMxn(stats.value.paid),
    sessions_paid: String(stats.value.sessionsPaid),
    attended: String(stats.value.attended),
    absences: String(stats.value.absences),
    remaining_sessions: String(stats.value.remaining),
  }),
)

async function onPatch(id: string, key: string, value: unknown) {
  const res = await updateEnrollment(id, { [key]: value } as Partial<FinanceEnrollmentRow>)
  if (!res.ok && res.message) alert(res.message)
}

async function onRemove(id: string) {
  const row = enrollments.value.find(r => r.id === id)
  if (!confirm(es.value ? `¿Eliminar a ${row?.student_name}?` : `Delete ${row?.student_name}?`)) return
  const res = await deleteEnrollment(id)
  if (!res.ok && res.message) alert(res.message)
}

// ---------------------------------------------------------------------------
// New row
// ---------------------------------------------------------------------------

const showForm = ref(false)
const formError = ref('')

const blankForm = () => ({
  skater_id: '',
  student_name: '',
  price_list_id: '',
  plan_label: '',
  price_mxn: '' as string | number,
  packages_paid: 1,
  amount_paid_mxn: '' as string | number,
  sessions_paid: '' as string | number,
  last_payment_on: new Date().toISOString().slice(0, 10),
  attend_weekdays: [] as number[],
  attended: 0,
  absences: 0,
  notes: '',
})

const form = ref(blankForm())

const priceOptions = computed(() => sortPriceRows(priceRows.value.filter(r => r.is_active)))

/** Picking a package fills the price, the session count and the plan label. */
function applyPriceRow(id: string) {
  const row = priceRows.value.find(r => r.id === id)
  if (!row) return
  const price = effectivePriceMxn(row)
  form.value.price_mxn = price
  form.value.sessions_paid = row.sessions
  form.value.plan_label = es.value
    ? `${row.sessions} ${row.sessions === 1 ? 'clase' : 'clases'}`
    : `${row.sessions} ${row.sessions === 1 ? 'class' : 'classes'}`
  form.value.amount_paid_mxn = price * (Number(form.value.packages_paid) || 1)
}

function onSkaterPicked(id: string) {
  const skater = skaters.value.find(s => s.id === id)
  if (skater) form.value.student_name = skater.full_name
}

function toggleFormDay(day: number) {
  const days = form.value.attend_weekdays
  form.value.attend_weekdays = days.includes(day)
    ? days.filter(d => d !== day)
    : [...days, day].sort((a, b) => a - b)
}

async function submitEnrollment() {
  formError.value = ''
  if (!form.value.student_name.trim()) {
    formError.value = es.value ? 'Escribe el nombre del alumno.' : 'Enter the student name.'
    return
  }

  const priceRow = priceRows.value.find(r => r.id === form.value.price_list_id)
  const res = await addEnrollment({
    skater_id: form.value.skater_id || null,
    student_name: form.value.student_name.trim(),
    price_list_id: priceRow?.id ?? null,
    coach_tier: priceRow?.coach_tier ?? null,
    class_kind: priceRow?.class_kind ?? null,
    plan_label: form.value.plan_label || null,
    price_mxn: Number(form.value.price_mxn) || 0,
    packages_paid: Number(form.value.packages_paid) || 0,
    amount_paid_mxn: Number(form.value.amount_paid_mxn) || 0,
    sessions_paid: Number(form.value.sessions_paid) || 0,
    last_payment_on: form.value.last_payment_on || null,
    attend_weekdays: form.value.attend_weekdays,
    attended: Number(form.value.attended) || 0,
    absences: Number(form.value.absences) || 0,
    notes: form.value.notes || null,
    is_active: true,
  })

  if (!res.ok) {
    formError.value = res.message || (es.value ? 'No se pudo guardar.' : 'Could not save.')
    return
  }
  form.value = blankForm()
  showForm.value = false
}

function exportCsv() {
  downloadCsv(enrollmentsCsvName(), enrollmentsCsv(filtered.value, es.value))
}

const attendanceRatePct = computed(() => Math.round(stats.value.attendanceRate * 100))
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <MemberFinanceHeader
      :subtitle="es
        ? `Alumnos · ${stats.count} inscripciones`
        : `Students · ${stats.count} enrollments`"
    >
      <template #actions>
        <button
          type="button"
          :disabled="!filtered.length"
          class="px-3 py-2 rounded-xl border border-gray-700 text-gray-200 text-xs font-bold disabled:opacity-40"
          @click="exportCsv"
        >
          ⬇ CSV
        </button>
        <button
          type="button"
          class="px-3 py-2 rounded-xl bg-gold-400 text-black text-xs font-bold"
          @click="showForm = true"
        >
          + {{ es ? 'Alumno' : 'Student' }}
        </button>
      </template>
    </MemberFinanceHeader>

    <div class="px-4 py-4 max-w-[1400px] mx-auto space-y-4">
      <p v-if="error" class="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
        {{ error }}
      </p>

      <!-- KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <div class="rounded-xl border border-gold-400/30 bg-gold-400/10 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Cobrado' : 'Collected' }}
          </p>
          <p class="text-xl font-bold text-gold-300 tabular-nums">{{ formatMoneyMxn(stats.paid) }}</p>
        </div>
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Clases restantes' : 'Classes left' }}
          </p>
          <p class="text-xl font-bold text-white tabular-nums">{{ stats.remaining }}</p>
          <p class="text-[10px] text-gray-500">
            {{ es ? 'de' : 'of' }} {{ stats.sessionsPaid }} {{ es ? 'pagadas' : 'paid' }}
          </p>
        </div>
        <div class="rounded-xl border border-glass-green/30 bg-glass-green/10 p-3">
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Asistencia' : 'Attendance' }}
          </p>
          <p class="text-xl font-bold text-glass-green tabular-nums">{{ attendanceRatePct }}%</p>
          <p class="text-[10px] text-gray-500">
            {{ stats.attended }} / {{ stats.attended + stats.absences }}
          </p>
        </div>
        <button
          type="button"
          class="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-left"
          @click="filter = filter === 'out' ? 'all' : 'out'"
        >
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Sin clases' : 'Out of classes' }}
          </p>
          <p class="text-xl font-bold text-red-300 tabular-nums">{{ stats.outOfClasses }}</p>
          <p class="text-[10px] text-gray-500">{{ es ? 'toca para filtrar' : 'tap to filter' }}</p>
        </button>
        <button
          type="button"
          class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left"
          @click="filter = filter === 'overdue' ? 'all' : 'overdue'"
        >
          <p class="text-[10px] uppercase tracking-wide text-gray-400 font-bold">
            {{ es ? 'Pago atrasado' : 'Payment overdue' }}
          </p>
          <p class="text-xl font-bold text-amber-300 tabular-nums">{{ stats.overdue }}</p>
          <p class="text-[10px] text-gray-500">{{ es ? 'más de 33 días' : 'over 33 days' }}</p>
        </button>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-2">
        <input
          v-model="search"
          type="text"
          :placeholder="es ? 'Buscar alumno…' : 'Search student…'"
          class="flex-1 min-w-[12rem] px-3 py-2 rounded-xl bg-gray-900 border border-gray-800 text-white text-sm placeholder-gray-500"
        />
        <div class="flex rounded-xl border border-gray-800 overflow-hidden">
          <button
            v-for="f in [
              { id: 'all', label: es ? 'Todos' : 'All' },
              { id: 'active', label: es ? 'Con clases' : 'With classes' },
              { id: 'out', label: es ? 'Sin clases' : 'Out' },
              { id: 'overdue', label: es ? 'Atrasados' : 'Overdue' },
            ]"
            :key="f.id"
            type="button"
            class="px-3 py-2 text-xs font-semibold transition-colors"
            :class="filter === f.id ? 'bg-gold-400 text-black' : 'bg-gray-900 text-gray-400'"
            @click="filter = f.id as typeof filter"
          >
            {{ f.label }}
          </button>
        </div>
        <label class="flex items-center gap-2 text-xs text-gray-400">
          <input
            v-model="showInactive"
            type="checkbox"
            class="w-4 h-4 rounded border-gray-600 text-gold-400 focus:ring-gold-400 bg-gray-900"
          />
          {{ es ? 'Ver inactivos' : 'Show inactive' }}
        </label>
        <span v-if="loading" class="text-xs text-gray-500">{{ es ? 'Cargando…' : 'Loading…' }}</span>
      </div>

      <MemberFinanceSheet
        :columns="columns"
        :rows="filtered"
        title-key="student_name"
        deletable
        :totals="gridTotals"
        :empty-text="es
          ? 'Sin alumnos capturados. Usa + Alumno para agregar el primero.'
          : 'No students yet. Use + Student to add the first one.'"
        @patch="onPatch"
        @remove="onRemove"
      />

      <p class="text-[11px] text-gray-600 leading-snug">
        {{ es
          ? 'Quedan = Sesiones − Asistencia − Faltas, así que una falta consume una clase. El color del nombre indica clases restantes y el de Último pago la antigüedad del pago.'
          : 'Left = Sessions − Attended − Absences, so an absence burns a class. The name colour tracks classes left; the last-payment colour tracks how long ago they paid.' }}
      </p>
    </div>

    <!-- New enrollment -->
    <Teleport to="body">
      <div v-if="showForm" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div class="absolute inset-0 bg-black/80" @click="showForm = false" />
        <div
          class="relative bg-gray-900 border border-gray-800 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col"
        >
          <div class="px-5 py-4 border-b border-gray-800 flex items-center justify-between shrink-0">
            <h3 class="text-lg font-bold text-white">
              {{ es ? 'Nueva inscripción' : 'New enrollment' }}
            </h3>
            <button type="button" class="p-2 text-gray-400" @click="showForm = false">✕</button>
          </div>

          <form class="p-5 space-y-3 overflow-y-auto" @submit.prevent="submitEnrollment">
            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ es ? 'Patinador registrado' : 'Registered skater' }}
              </label>
              <select
                v-model="form.skater_id"
                class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                @change="onSkaterPicked(form.skater_id)"
              >
                <option value="">{{ es ? '— Capturar nombre manualmente —' : '— Type a name instead —' }}</option>
                <option v-for="s in skaters" :key="s.id" :value="s.id">{{ s.full_name }}</option>
              </select>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ es ? 'Alumno' : 'Student' }} *
              </label>
              <input
                v-model="form.student_name"
                type="text"
                required
                class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
              />
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ es ? 'Paquete' : 'Package' }}
              </label>
              <select
                v-model="form.price_list_id"
                class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                @change="applyPriceRow(form.price_list_id)"
              >
                <option value="">{{ es ? '— Sin paquete —' : '— No package —' }}</option>
                <optgroup
                  v-for="tier in FINANCE_COACH_TIERS"
                  :key="tier.id"
                  :label="es ? tier.es : tier.en"
                >
                  <option
                    v-for="row in priceOptions.filter(r => r.coach_tier === tier.id)"
                    :key="row.id"
                    :value="row.id"
                  >
                    {{ row.label_es }} — {{ formatMoneyMxn(effectivePriceMxn(row)) }}
                  </option>
                </optgroup>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Tipo de clase' : 'Class type' }}
                </label>
                <input
                  v-model="form.plan_label"
                  type="text"
                  :placeholder="es ? '8 clases' : '8 classes'"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Precio' : 'Price' }}
                </label>
                <input
                  v-model="form.price_mxn"
                  type="number"
                  min="0"
                  inputmode="decimal"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Vendidos' : 'Sold' }}
                </label>
                <input
                  v-model="form.packages_paid"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Total' : 'Total' }}
                </label>
                <input
                  v-model="form.amount_paid_mxn"
                  type="number"
                  min="0"
                  inputmode="decimal"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm font-bold"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Sesiones' : 'Sessions' }}
                </label>
                <input
                  v-model="form.sessions_paid"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-2">
                {{ es ? 'Días que va a asistir' : 'Days they will attend' }}
              </label>
              <div class="flex gap-1.5">
                <button
                  v-for="day in ATTEND_WEEKDAYS"
                  :key="day.value"
                  type="button"
                  class="flex-1 h-11 rounded-xl text-sm font-bold border transition-all"
                  :class="form.attend_weekdays.includes(day.value)
                    ? 'border-glass-blue bg-glass-blue/30 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-500'"
                  :title="es ? day.es : day.en"
                  @click="toggleFormDay(day.value)"
                >
                  {{ day.initial }}
                </button>
              </div>
              <p v-if="form.attend_weekdays.length" class="text-[10px] text-gray-500 mt-1">
                {{ weekdaysLabel(form.attend_weekdays) }} ·
                {{ form.attend_weekdays.length }} {{ es ? 'días por semana' : 'days per week' }}
              </p>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Último pago' : 'Last payment' }}
                </label>
                <input
                  v-model="form.last_payment_on"
                  type="date"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Asistencia' : 'Attended' }}
                </label>
                <input
                  v-model="form.attended"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-400 mb-1">
                  {{ es ? 'Faltas' : 'Absences' }}
                </label>
                <input
                  v-model="form.absences"
                  type="number"
                  min="0"
                  class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs font-medium text-gray-400 mb-1">
                {{ es ? 'Notas' : 'Notes' }}
              </label>
              <textarea
                v-model="form.notes"
                rows="2"
                class="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm resize-none"
              />
            </div>

            <p v-if="formError" class="text-xs text-red-300 bg-red-500/10 rounded-lg p-2">
              {{ formError }}
            </p>

            <div class="flex gap-3 pt-1">
              <button
                type="button"
                class="flex-1 py-3 bg-gray-800 text-white font-semibold rounded-xl"
                @click="showForm = false"
              >
                {{ es ? 'Cancelar' : 'Cancel' }}
              </button>
              <button
                type="submit"
                :disabled="saving"
                class="flex-1 py-3 bg-gold-400 text-black font-bold rounded-xl disabled:opacity-50"
              >
                {{ saving ? '…' : (es ? 'Guardar' : 'Save') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>
  </div>
</template>
