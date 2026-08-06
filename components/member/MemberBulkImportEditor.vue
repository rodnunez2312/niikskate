<script setup lang="ts">
import type { BulkDuplicateGroup, ParsedShopProductRow } from '~/utils/shopProductBulk'
import { normalizeImportCategory, parsePriceMxnField } from '~/utils/productCategoryImport'

const props = defineProps<{
  rows: ParsedShopProductRow[]
  duplicateGroups: BulkDuplicateGroup[]
  es: boolean
}>()

const emit = defineEmits<{
  'update:rows': [ParsedShopProductRow[]]
}>()

const showDuplicatesOnly = ref(false)

const duplicateRowNumbers = computed(() => {
  const set = new Set<number>()
  for (const g of props.duplicateGroups) {
    for (const n of g.rowNumbers) set.add(n)
  }
  return set
})

const visibleIndices = computed(() => {
  const indices: number[] = []
  for (let i = 0; i < props.rows.length; i++) {
    const row = props.rows[i]!
    if (!showDuplicatesOnly.value || duplicateRowNumbers.value.has(row.rowNumber)) {
      indices.push(i)
    }
  }
  return indices
})

function rowIsDuplicate(row: ParsedShopProductRow): boolean {
  return duplicateRowNumbers.value.has(row.rowNumber)
}

function syncRowFields(row: ParsedShopProductRow) {
  const cat = row.category_raw.trim()
  row.category = cat ? normalizeImportCategory(cat) : null
  const priceRaw = row.price_mxn_raw.trim()
  row.price_mxn = priceRaw ? parsePriceMxnField(priceRaw) : null
}

function patchRow(index: number, patch: Partial<ParsedShopProductRow>) {
  const next = props.rows.map((r, i) => (i === index ? { ...r, ...patch } : r))
  const updated = next[index]
  if (updated) syncRowFields(updated)
  emit('update:rows', next)
}

function onField(index: number, field: keyof ParsedShopProductRow, value: string) {
  if (!props.rows[index]) return
  if (field === 'brand' || field === 'size') {
    patchRow(index, { [field]: value || null } as Partial<ParsedShopProductRow>)
  } else {
    patchRow(index, { [field]: value } as Partial<ParsedShopProductRow>)
  }
}

function onPriceInput(index: number, value: string) {
  patchRow(index, { price_mxn_raw: value })
}

function onStockInput(index: number, value: string) {
  const n = value.trim() === '' ? null : Number.parseInt(value, 10)
  patchRow(index, { stock_quantity: Number.isNaN(n as number) ? null : n })
}

function removeRow(index: number) {
  emit(
    'update:rows',
    props.rows.filter((_, i) => i !== index),
  )
}
</script>

<template>
  <details open class="rounded-xl border border-gray-700 bg-black/40 mt-3">
    <summary class="cursor-pointer px-3 py-2 text-sm font-bold text-white select-none">
      {{
        es
          ? `Editar aquí antes de importar (${rows.length} filas en el Excel)`
          : `Edit here before import (${rows.length} rows from Excel)`
      }}
    </summary>
    <div class="px-3 pb-3 space-y-2">
      <label v-if="duplicateGroups.length" class="flex items-center gap-2 text-xs text-amber-200/90">
        <input v-model="showDuplicatesOnly" type="checkbox" class="rounded" />
        {{
          es
            ? `Mostrar solo duplicados (${duplicateGroups.length} grupos)`
            : `Show duplicates only (${duplicateGroups.length} groups)`
        }}
      </label>
      <ul v-if="duplicateGroups.length" class="text-[11px] text-gray-400 space-y-0.5 max-h-20 overflow-y-auto">
        <li v-for="g in duplicateGroups" :key="g.key">
          {{ es ? 'Duplicado' : 'Duplicate' }}: «{{ g.name }}»
          <span v-if="g.brand"> / {{ g.brand }}</span>
          <span v-if="g.size"> / {{ g.size }}</span>
          — {{ es ? 'filas' : 'rows' }} {{ g.rowNumbers.join(', ') }}
        </li>
      </ul>
      <div class="overflow-x-auto max-h-[min(420px,50vh)] overflow-y-auto rounded-lg border border-gray-800">
        <table class="w-full text-left text-xs min-w-[720px]">
          <thead class="sticky top-0 bg-gray-900 text-gray-400 z-10">
            <tr>
              <th class="p-2 w-10">{{ es ? 'Fila' : 'Row' }}</th>
              <th class="p-2 min-w-[120px]">{{ es ? 'Nombre' : 'Name' }}</th>
              <th class="p-2">{{ es ? 'Marca' : 'Brand' }}</th>
              <th class="p-2">{{ es ? 'Categoría' : 'Category' }}</th>
              <th class="p-2">{{ es ? 'Talla' : 'Size' }}</th>
              <th class="p-2 w-20">{{ es ? 'Precio' : 'Price' }}</th>
              <th class="p-2 w-14">Stock</th>
              <th class="p-2 w-16" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="idx in visibleIndices"
              :key="rows[idx]!.rowNumber + '-' + idx"
              class="border-t border-gray-800/80"
              :class="rowIsDuplicate(rows[idx]!) ? 'bg-amber-500/10' : ''"
            >
              <td class="p-1.5 text-gray-500 tabular-nums">{{ rows[idx]!.rowNumber }}</td>
              <td class="p-1">
                <input
                  :value="rows[idx]!.name"
                  class="w-full rounded bg-gray-950 border border-gray-700 px-1.5 py-1 text-white"
                  @input="onField(idx, 'name', ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="p-1">
                <input
                  :value="rows[idx]!.brand ?? ''"
                  class="w-full rounded bg-gray-950 border border-gray-700 px-1.5 py-1 text-white"
                  @input="onField(idx, 'brand', ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="p-1">
                <input
                  :value="rows[idx]!.category_raw"
                  class="w-full rounded bg-gray-950 border border-gray-700 px-1.5 py-1 text-white"
                  :class="rows[idx]!.category_raw.trim() && !rows[idx]!.category ? 'border-flame-500' : ''"
                  @input="onField(idx, 'category_raw', ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="p-1">
                <input
                  :value="rows[idx]!.size ?? ''"
                  class="w-full rounded bg-gray-950 border border-gray-700 px-1.5 py-1 text-white"
                  @input="onField(idx, 'size', ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="p-1">
                <input
                  :value="rows[idx]!.price_mxn_raw"
                  class="w-full rounded bg-gray-950 border border-gray-700 px-1.5 py-1 text-white tabular-nums"
                  :class="rows[idx]!.price_mxn_raw.trim() && rows[idx]!.price_mxn == null ? 'border-flame-500' : ''"
                  @input="onPriceInput(idx, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="p-1">
                <input
                  :value="rows[idx]!.stock_quantity ?? ''"
                  type="number"
                  min="0"
                  class="w-full rounded bg-gray-950 border border-gray-700 px-1.5 py-1 text-white tabular-nums"
                  @input="onStockInput(idx, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td class="p-1">
                <button
                  type="button"
                  class="text-flame-400 hover:text-flame-300 font-bold whitespace-nowrap"
                  @click="removeRow(idx)"
                >
                  {{ es ? 'Quitar' : 'Remove' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-gray-500">
        {{
          es
            ? 'Corrige duplicados (cambia nombre/marca/talla o quita filas). Luego pulsa Importar filas.'
            : 'Fix duplicates (change name/brand/size or remove rows). Then click Import rows.'
        }}
      </p>
    </div>
  </details>
</template>
