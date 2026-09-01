<script setup lang="ts">
/**
 * Spreadsheet-style editable grid used by every Finanzas ledger.
 * Laptop gets a scrollable table; phone gets one labelled card per row, so the
 * same data is editable on both without a second component.
 *
 * Cells commit on `change` (blur or Enter), not per keystroke, because each
 * commit is a Supabase write.
 */

import { ATTEND_WEEKDAYS, type FinanceTone } from '~/utils/finance'

export type FinanceSheetCellType =
  | 'text'
  | 'number'
  | 'money'
  | 'pct'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'computed'
  /** The block of L M M J V S D columns from the student control sheet. */
  | 'weekdays'

export interface FinanceSheetColumn {
  key: string
  label: string
  type: FinanceSheetCellType
  /** Applied to the desktop <th>/<td>; use a Tailwind width class. */
  width?: string
  options?: Array<{ value: string; label: string }>
  /** A predicate locks the cell per row, e.g. prices derived from another row. */
  readonly?: boolean | ((row: Record<string, any>) => boolean)
  /** Rendered text for `computed` columns, and for the mobile card summary. */
  compute?: (row: Record<string, any>) => string
  /** Keep the phone card short by dropping reference-only columns. */
  hideOnMobile?: boolean
  align?: 'left' | 'right' | 'center'
  step?: number
  min?: number
  placeholder?: string
  /** Emphasis for money columns that matter most (Precio final, Academia…). */
  highlight?: boolean
  /** Colour cue per row, the way the Excel shades a cell red or green. */
  tone?: (row: Record<string, any>) => FinanceTone
}

const TONE_TEXT: Record<'good' | 'warn' | 'bad', string> = {
  good: 'text-glass-green',
  warn: 'text-amber-300',
  bad: 'text-red-400',
}

const TONE_CELL: Record<'good' | 'warn' | 'bad', string> = {
  good: 'bg-glass-green/10',
  warn: 'bg-amber-500/10',
  bad: 'bg-red-500/10',
}

const props = withDefaults(
  defineProps<{
    columns: FinanceSheetColumn[]
    rows: Array<Record<string, any>>
    rowKey?: string
    /** Column key whose value titles each phone card. */
    titleKey?: string
    deletable?: boolean
    /** Footer values keyed by column key. */
    totals?: Record<string, string> | null
    emptyText?: string
  }>(),
  { rowKey: 'id', titleKey: '', deletable: false, totals: null, emptyText: '' },
)

const emit = defineEmits<{
  patch: [id: string, key: string, value: unknown]
  remove: [id: string]
}>()

const mobileColumns = computed(() => props.columns.filter(c => !c.hideOnMobile))

const idOf = (row: Record<string, any>) => String(row[props.rowKey] ?? '')

function isStatic(row: Record<string, any>, col: FinanceSheetColumn): boolean {
  if (col.type === 'computed') return true
  return typeof col.readonly === 'function' ? col.readonly(row) : !!col.readonly
}

function displayValue(row: Record<string, any>, col: FinanceSheetColumn): string {
  if (col.compute) return col.compute(row)
  const raw = row[col.key]
  if (raw == null || raw === '') return '—'
  return String(raw)
}

/** Percent columns are stored as fractions but edited as whole percents. */
function inputValue(row: Record<string, any>, col: FinanceSheetColumn): string | number {
  const raw = row[col.key]
  if (raw == null) return ''
  if (col.type === 'pct') return Math.round(Number(raw) * 1000) / 10
  return raw as string | number
}

function commit(row: Record<string, any>, col: FinanceSheetColumn, event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  const id = idOf(row)
  if (!id) return

  let value: unknown = target.value

  if (col.type === 'checkbox') {
    value = (target as HTMLInputElement).checked
  } else if (col.type === 'number' || col.type === 'money') {
    value = target.value === '' ? null : Number(target.value)
    if (typeof value === 'number' && Number.isNaN(value)) return
  } else if (col.type === 'pct') {
    value = target.value === '' ? null : Number(target.value) / 100
    if (typeof value === 'number' && Number.isNaN(value)) return
  } else if (target.value === '') {
    value = null
  }

  if (value === row[col.key]) return
  emit('patch', id, col.key, value)
}

function toggleWeekday(row: Record<string, any>, col: FinanceSheetColumn, day: number) {
  const id = idOf(row)
  if (!id) return
  const current: number[] = Array.isArray(row[col.key]) ? [...row[col.key]] : []
  const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day]
  emit('patch', id, col.key, next.sort((a, b) => a - b))
}

const isDayOn = (row: Record<string, any>, col: FinanceSheetColumn, day: number) =>
  Array.isArray(row[col.key]) && row[col.key].includes(day)

function toneOf(row: Record<string, any>, col: FinanceSheetColumn) {
  return col.tone?.(row) ?? null
}

const toneText = (row: Record<string, any>, col: FinanceSheetColumn) => {
  const tone = toneOf(row, col)
  return tone ? TONE_TEXT[tone] : ''
}

const toneCell = (row: Record<string, any>, col: FinanceSheetColumn) => {
  const tone = toneOf(row, col)
  return tone ? TONE_CELL[tone] : ''
}

const alignClass = (col: FinanceSheetColumn) =>
  col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'

const inputClass = (row: Record<string, any>, col: FinanceSheetColumn) => {
  const tone = toneText(row, col)
  return [
    'w-full bg-transparent border border-transparent rounded-md px-2 py-1.5 text-xs',
    'hover:border-gray-700 focus:border-gold-400 focus:bg-gray-950 outline-none transition-colors',
    'tabular-nums',
    alignClass(col),
    tone ? `${tone} font-bold` : col.highlight ? 'font-bold text-gold-300' : 'text-white',
  ]
}
</script>

<template>
  <div>
    <!-- Laptop: real spreadsheet -->
    <div class="hidden md:block overflow-x-auto rounded-xl border border-gray-800">
      <table class="w-full min-w-max border-collapse">
        <thead>
          <tr class="bg-gray-900">
            <th
              v-for="col in columns"
              :key="col.key"
              scope="col"
              class="px-2 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-b border-gray-800 whitespace-nowrap"
              :class="[alignClass(col), col.width]"
            >
              {{ col.label }}
            </th>
            <th v-if="deletable" class="w-10 border-b border-gray-800" />
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="row in rows"
            :key="idOf(row)"
            class="border-b border-gray-800/60 hover:bg-gray-900/40 transition-colors"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-1 py-0.5 align-middle"
              :class="[col.width, toneCell(row, col)]"
            >
              <p
                v-if="isStatic(row, col)"
                class="px-2 py-1.5 text-xs tabular-nums"
                :class="[
                  alignClass(col),
                  toneText(row, col)
                    ? `${toneText(row, col)} font-bold`
                    : col.highlight ? 'font-bold text-gold-300' : 'text-gray-300',
                ]"
              >
                {{ displayValue(row, col) }}
              </p>

              <div v-else-if="col.type === 'weekdays'" class="flex gap-0.5 justify-center">
                <button
                  v-for="day in ATTEND_WEEKDAYS"
                  :key="day.value"
                  type="button"
                  class="w-6 h-6 rounded text-[10px] font-bold transition-colors"
                  :class="isDayOn(row, col, day.value)
                    ? 'bg-glass-blue text-white'
                    : 'bg-gray-950 text-gray-600 hover:text-gray-300'"
                  :title="day.es"
                  @click="toggleWeekday(row, col, day.value)"
                >
                  {{ isDayOn(row, col, day.value) ? 'X' : day.initial }}
                </button>
              </div>

              <select
                v-else-if="col.type === 'select'"
                :value="row[col.key] ?? ''"
                class="w-full bg-transparent border border-transparent hover:border-gray-700 focus:border-gold-400 focus:bg-gray-950 rounded-md px-2 py-1.5 text-xs text-white outline-none"
                @change="commit(row, col, $event)"
              >
                <option v-for="opt in col.options" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>

              <div v-else-if="col.type === 'checkbox'" class="flex justify-center">
                <input
                  type="checkbox"
                  :checked="!!row[col.key]"
                  class="w-4 h-4 rounded border-gray-600 text-gold-400 focus:ring-gold-400 bg-gray-900"
                  @change="commit(row, col, $event)"
                />
              </div>

              <input
                v-else
                :type="col.type === 'date' ? 'date' : col.type === 'text' ? 'text' : 'number'"
                :inputmode="col.type === 'text' || col.type === 'date' ? undefined : 'decimal'"
                :value="inputValue(row, col)"
                :step="col.step ?? (col.type === 'money' ? 1 : undefined)"
                :min="col.min ?? (col.type === 'money' || col.type === 'pct' ? 0 : undefined)"
                :placeholder="col.placeholder"
                :class="inputClass(row, col)"
                @change="commit(row, col, $event)"
              />
            </td>

            <td v-if="deletable" class="px-1">
              <button
                type="button"
                class="w-7 h-7 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                :title="'Eliminar'"
                @click="emit('remove', idOf(row))"
              >
                ✕
              </button>
            </td>
          </tr>

          <tr v-if="!rows.length">
            <td :colspan="columns.length + (deletable ? 1 : 0)" class="px-3 py-8 text-center">
              <p class="text-xs text-gray-500">{{ emptyText || '—' }}</p>
            </td>
          </tr>
        </tbody>

        <tfoot v-if="totals && rows.length">
          <tr class="bg-gray-900/80">
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-3 py-2 text-xs font-bold text-white tabular-nums border-t border-gray-800"
              :class="alignClass(col)"
            >
              {{ totals[col.key] ?? '' }}
            </td>
            <td v-if="deletable" class="border-t border-gray-800" />
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Phone: one card per row, same fields -->
    <div class="md:hidden space-y-2">
      <div
        v-for="row in rows"
        :key="idOf(row)"
        class="rounded-xl border border-gray-800 bg-gray-900/60 p-3"
      >
        <div v-if="titleKey" class="flex items-start justify-between gap-2 mb-2">
          <p class="text-sm font-bold text-white leading-tight">{{ row[titleKey] || '—' }}</p>
          <button
            v-if="deletable"
            type="button"
            class="shrink-0 w-7 h-7 rounded-md text-gray-600 hover:text-red-400"
            @click="emit('remove', idOf(row))"
          >
            ✕
          </button>
        </div>

        <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <div
            v-for="col in mobileColumns"
            :key="col.key"
            :class="(col.type === 'text' && col.key !== titleKey) || col.type === 'weekdays'
              ? 'col-span-2'
              : ''"
          >
            <label class="block text-[9px] uppercase tracking-wide text-gray-500 font-bold mb-0.5">
              {{ col.label }}
            </label>

            <p
              v-if="isStatic(row, col)"
              class="text-sm tabular-nums py-1"
              :class="toneText(row, col)
                ? `${toneText(row, col)} font-bold`
                : col.highlight ? 'font-bold text-gold-300' : 'text-gray-200'"
            >
              {{ displayValue(row, col) }}
            </p>

            <div v-else-if="col.type === 'weekdays'" class="flex gap-1 py-0.5">
              <button
                v-for="day in ATTEND_WEEKDAYS"
                :key="day.value"
                type="button"
                class="flex-1 h-9 rounded-lg text-xs font-bold transition-colors"
                :class="isDayOn(row, col, day.value)
                  ? 'bg-glass-blue text-white'
                  : 'bg-gray-950 border border-gray-800 text-gray-600'"
                :title="day.es"
                @click="toggleWeekday(row, col, day.value)"
              >
                {{ day.initial }}
              </button>
            </div>

            <select
              v-else-if="col.type === 'select'"
              :value="row[col.key] ?? ''"
              class="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-2 text-sm text-white outline-none focus:border-gold-400"
              @change="commit(row, col, $event)"
            >
              <option v-for="opt in col.options" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>

            <label v-else-if="col.type === 'checkbox'" class="flex items-center gap-2 py-1.5">
              <input
                type="checkbox"
                :checked="!!row[col.key]"
                class="w-4 h-4 rounded border-gray-600 text-gold-400 focus:ring-gold-400 bg-gray-900"
                @change="commit(row, col, $event)"
              />
              <span class="text-xs text-gray-400">{{ row[col.key] ? 'Sí' : 'No' }}</span>
            </label>

            <input
              v-else
              :type="col.type === 'date' ? 'date' : col.type === 'text' ? 'text' : 'number'"
              :inputmode="col.type === 'text' || col.type === 'date' ? undefined : 'decimal'"
              :value="inputValue(row, col)"
              :step="col.step ?? (col.type === 'money' ? 1 : undefined)"
              :min="col.min ?? (col.type === 'money' || col.type === 'pct' ? 0 : undefined)"
              :placeholder="col.placeholder"
              class="w-full bg-gray-950 border border-gray-800 rounded-lg px-2 py-2 text-sm text-white outline-none focus:border-gold-400 tabular-nums"
              :class="toneText(row, col)
                ? `${toneText(row, col)} font-bold`
                : col.highlight ? 'font-bold text-gold-300' : ''"
              @change="commit(row, col, $event)"
            />
          </div>
        </div>
      </div>

      <div v-if="totals && rows.length" class="rounded-xl border border-gold-400/30 bg-gold-400/5 p-3">
        <div class="grid grid-cols-2 gap-x-3 gap-y-1">
          <template v-for="col in mobileColumns" :key="`t-${col.key}`">
            <div v-if="totals[col.key]" class="col-span-1">
              <p class="text-[9px] uppercase tracking-wide text-gray-500 font-bold">{{ col.label }}</p>
              <p class="text-sm font-bold text-white tabular-nums">{{ totals[col.key] }}</p>
            </div>
          </template>
        </div>
      </div>

      <p v-if="!rows.length" class="text-xs text-gray-500 text-center py-6">
        {{ emptyText || '—' }}
      </p>
    </div>
  </div>
</template>
