<script setup lang="ts">
import type { ProductCategory } from '~/types'
import {
  composeProductDescription,
  extractUserAppendFromStoredDescription,
} from '~/utils/productDescriptionTemplate'
import { nextNumericProductId, normalizeNumericProductId } from '~/utils/productId'

type CategoryOption = {
  id: ProductCategory
  name: { en: string; es: string }
}

const props = defineProps<{
  products: any[]
  categories: CategoryOption[]
}>()

const emit = defineEmits<{ refresh: [] }>()

const client = useSupabaseClient()
const { language } = useI18n()
const es = computed(() => language.value === 'es')

const COLUMNS = [
  { id: 'sku', es: 'ID', en: 'ID' },
  { id: 'name', es: 'Nombre', en: 'Name' },
  { id: 'brand', es: 'Marca', en: 'Brand' },
  { id: 'category', es: 'Categoría', en: 'Category' },
  { id: 'price', es: 'Precio', en: 'Price' },
  { id: 'stock_quantity', es: 'Stock', en: 'Stock' },
  { id: 'size', es: 'Medida', en: 'Size' },
  { id: 'proveedor', es: 'Proveedor', en: 'Supplier' },
  { id: 'description', es: 'Descripción', en: 'Description' },
  { id: 'comentarios', es: 'Notas', en: 'Notes' },
  { id: 'is_active', es: 'Visible', en: 'Visible' },
  { id: 'is_featured', es: 'Destacado', en: 'Featured' },
] as const

type ColumnId = (typeof COLUMNS)[number]['id']

const visible = ref<Record<ColumnId, boolean>>({
  sku: true,
  name: true,
  brand: true,
  category: true,
  price: true,
  stock_quantity: true,
  size: true,
  proveedor: false,
  description: true,
  comentarios: false,
  is_active: true,
  is_featured: true,
})

const columnsOpen = ref(false)
const filtersOpen = ref(true)
const query = ref('')
const category = ref('all')
const brand = ref('all')
const status = ref<'all' | 'live' | 'hidden'>('all')
const featured = ref<'all' | 'yes' | 'no'>('all')
const priceMin = ref('')
const priceMax = ref('')
const message = ref('')
const error = ref('')
const savingId = ref('')

const draft = ref<null | Record<string, string | boolean>>(null)

if (import.meta.client) {
  try {
    const stored = JSON.parse(localStorage.getItem('niik-shop-table-columns') || '')
    for (const column of COLUMNS) {
      if (typeof stored[column.id] === 'boolean') visible.value[column.id] = stored[column.id]
    }
  } catch {
    /* keep defaults */
  }
}

watch(visible, (value) => {
  if (import.meta.client) localStorage.setItem('niik-shop-table-columns', JSON.stringify(value))
}, { deep: true })

const shownColumns = computed(() => COLUMNS.filter(column => visible.value[column.id]))

function columnClass(id: ColumnId) {
  const centered = id === 'sku' || id === 'price' || id === 'stock_quantity' || id === 'size'
  const align = centered ? 'text-center' : ''
  if (id === 'name' || id === 'description') return 'w-[50ch] max-w-[50ch]'
  if (id === 'size') return 'w-[10ch] max-w-[10ch] text-center'
  if (id === 'sku' || id === 'brand' || id === 'category' || id === 'price' || id === 'stock_quantity' || id === 'size') {
    return ['w-px whitespace-nowrap', align].filter(Boolean).join(' ')
  }
  return align
}

function fieldClass(id: ColumnId) {
  if (id === 'name') return 'w-full max-w-[50ch] bg-transparent px-1 py-0.5 text-xs text-gray-900'
  if (id === 'size') return 'w-full max-w-[10ch] bg-transparent px-1 py-0.5 text-center text-xs text-gray-900'
  if (id === 'sku' || id === 'price' || id === 'stock_quantity') {
    return 'w-auto min-w-[2.5rem] bg-transparent px-1 py-0.5 text-center text-xs text-gray-900 [field-sizing:content]'
  }
  if (id === 'brand') return 'w-auto min-w-[2.5rem] bg-transparent px-1 py-0.5 text-xs text-gray-900 [field-sizing:content]'
  return 'w-full min-w-[5rem] bg-transparent px-1 py-0.5 text-xs text-gray-900'
}

const brands = computed(() => {
  const names = new Set<string>()
  for (const product of props.products) {
    const name = String(product.brand || '').trim()
    if (name) names.add(name)
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'es'))
})

const rows = computed(() => {
  const q = query.value.trim().toLowerCase()
  const min = priceMin.value === '' ? null : Number(priceMin.value)
  const max = priceMax.value === '' ? null : Number(priceMax.value)
  return props.products.filter((product) => {
    if (category.value !== 'all' && product.category !== category.value) return false
    if (brand.value !== 'all' && String(product.brand || '') !== brand.value) return false
    if (status.value === 'live' && !product.is_active) return false
    if (status.value === 'hidden' && product.is_active) return false
    if (featured.value === 'yes' && !product.is_featured) return false
    if (featured.value === 'no' && product.is_featured) return false
    const price = Number(product.price) || 0
    if (min != null && Number.isFinite(min) && price < min) return false
    if (max != null && Number.isFinite(max) && price > max) return false
    if (!q) return true
    return [product.sku, product.name, product.brand, product.proveedor, product.comentarios, product.description]
      .join(' ')
      .toLowerCase()
      .includes(q)
  })
})

function notesOf(product: any) {
  return extractUserAppendFromStoredDescription(product.description)
}

function cellValue(product: any, column: ColumnId) {
  if (column === 'description') return notesOf(product)
  if (column === 'price' || column === 'stock_quantity') return product[column] ?? 0
  if (column === 'is_active' || column === 'is_featured') return Boolean(product[column])
  return product[column] ?? ''
}

async function savePatch(product: any, patch: Record<string, unknown>) {
  savingId.value = product.id
  error.value = ''
  const next = { ...product, ...patch }
  if (patch.sku != null) {
    const sku = normalizeNumericProductId(String(patch.sku))
    const clash = props.products.some(row => row.id !== product.id && String(row.sku) === sku)
    if (!sku || clash) {
      error.value = es.value ? 'Ese ID ya existe o está vacío.' : 'That ID is empty or already used.'
      savingId.value = ''
      return
    }
    patch.sku = sku
    next.sku = sku
  }
  if ('name' in patch || 'brand' in patch || 'category' in patch || 'size' in patch || 'description' in patch) {
    const extra = 'description' in patch ? String(patch.description || '') : notesOf(product)
    patch.description = composeProductDescription({
      name: String(next.name || ''),
      brand: next.brand || null,
      category: next.category,
      size: next.size || null,
    }, extra)
  }
  const { error: updateError } = await client
    .from('products')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', product.id)
  savingId.value = ''
  if (updateError) {
    error.value = updateError.message
    return
  }
  Object.assign(product, patch)
  message.value = es.value ? 'Guardado' : 'Saved'
}

function onText(product: any, column: ColumnId, event: Event) {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value
  const current = String(cellValue(product, column) ?? '')
  if (value === current) return
  const patch: Record<string, unknown> = {}
  if (column === 'price' || column === 'stock_quantity') {
    const raw = value.replace(/[^0-9.]/g, '')
    patch[column] = Number(raw) || 0
  } else if (column === 'name' || column === 'description') patch[column] = value.slice(0, 50)
  else if (column === 'size') patch[column] = value.slice(0, 10)
  else patch[column] = value
  void savePatch(product, patch)
}

function addDraft() {
  draft.value = {
    sku: nextNumericProductId(props.products.map(product => String(product.sku || ''))),
    name: '',
    brand: '',
    category: 'tablas',
    price: '',
    stock_quantity: '0',
    size: '',
    proveedor: '',
    description: '',
    comentarios: '',
    is_active: true,
    is_featured: false,
  }
  error.value = ''
}

async function saveDraft() {
  if (!draft.value) return
  const name = String(draft.value.name || '').trim()
  const price = Number(draft.value.price)
  const sku = normalizeNumericProductId(String(draft.value.sku || ''))
  if (!name || !price || !sku) {
    error.value = es.value ? 'La fila nueva necesita ID, nombre y precio.' : 'A new row needs an ID, name, and price.'
    return
  }
  savingId.value = 'draft'
  error.value = ''
  const categoryId = draft.value.category as ProductCategory
  const payload = {
    sku,
    name,
    brand: String(draft.value.brand || '').trim() || null,
    category: categoryId,
    price,
    stock_quantity: Number(draft.value.stock_quantity) || 0,
    size: String(draft.value.size || '').trim() || null,
    proveedor: String(draft.value.proveedor || '').trim() || null,
    comentarios: String(draft.value.comentarios || ''),
    description: composeProductDescription({
      name,
      brand: String(draft.value.brand || '') || null,
      category: categoryId,
      size: String(draft.value.size || '') || null,
    }, String(draft.value.description || '')),
    is_active: Boolean(draft.value.is_active),
    is_featured: Boolean(draft.value.is_featured),
    is_service: categoryId === 'ramps',
    requires_quote: categoryId === 'ramps',
    images: [],
    min_stock_level: 0,
    max_stock_level: 9999,
  }
  const { error: insertError } = await client.from('products').insert(payload)
  savingId.value = ''
  if (insertError) {
    error.value = insertError.message
    return
  }
  draft.value = null
  message.value = es.value ? 'Fila agregada' : 'Row added'
  emit('refresh')
}

async function removeRow(product: any) {
  const ok = confirm(es.value ? `¿Eliminar "${product.name}"?` : `Delete "${product.name}"?`)
  if (!ok) return
  const { error: deleteError } = await client.from('products').delete().eq('id', product.id)
  if (deleteError) {
    error.value = deleteError.message
    return
  }
  emit('refresh')
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function exportCsv() {
  const columns = shownColumns.value
  const header = columns.map(column => csvCell(es.value ? column.es : column.en)).join(',')
  const body = rows.value.map(product =>
    columns.map(column => csvCell(cellValue(product, column.id))).join(','),
  )
  const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `skateshop-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
}

</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="px-3 py-2 rounded-xl border border-gray-700 text-sm" @click="filtersOpen = !filtersOpen">
        {{ es ? 'Filtros' : 'Filters' }}
      </button>
      <button type="button" class="px-3 py-2 rounded-xl border border-gray-700 text-sm" @click="columnsOpen = !columnsOpen">
        {{ es ? 'Columnas' : 'Columns' }}
      </button>
      <button type="button" class="px-3 py-2 rounded-xl border border-gray-700 text-sm" @click="exportCsv">
        {{ es ? 'Exportar CSV' : 'Export CSV' }}
      </button>
      <button type="button" class="px-3 py-2 rounded-xl bg-acid text-charcoal text-sm font-bold" @click="addDraft">
        {{ es ? '+ Fila' : '+ Row' }}
      </button>
      <span class="text-xs text-gray-500">{{ rows.length }} / {{ products.length }}</span>
      <span v-if="message" class="text-xs text-acid">{{ message }}</span>
    </div>

    <div v-if="filtersOpen" class="grid md:grid-cols-3 lg:grid-cols-6 gap-2">
      <input v-model="query" type="search" class="px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm" :placeholder="es ? 'Buscar' : 'Search'">
      <select v-model="category" class="px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm">
        <option value="all">{{ es ? 'Todas las categorías' : 'All categories' }}</option>
        <option v-for="option in categories" :key="option.id" :value="option.id">{{ es ? option.name.es : option.name.en }}</option>
      </select>
      <select v-model="brand" class="px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm">
        <option value="all">{{ es ? 'Todas las marcas' : 'All brands' }}</option>
        <option v-for="name in brands" :key="name" :value="name">{{ name }}</option>
      </select>
      <select v-model="status" class="px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm">
        <option value="all">{{ es ? 'Visibles y ocultos' : 'Visible and hidden' }}</option>
        <option value="live">{{ es ? 'Visible' : 'Visible' }}</option>
        <option value="hidden">{{ es ? 'Ocultos' : 'Hidden' }}</option>
      </select>
      <select v-model="featured" class="px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm">
        <option value="all">{{ es ? 'Destacados y el resto' : 'Featured and the rest' }}</option>
        <option value="yes">{{ es ? 'Solo destacados' : 'Featured only' }}</option>
        <option value="no">{{ es ? 'Sin destacar' : 'Not featured' }}</option>
      </select>
      <div class="flex gap-2">
        <input v-model="priceMin" type="number" min="0" class="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm" :placeholder="es ? 'Precio mín' : 'Min price'">
        <input v-model="priceMax" type="number" min="0" class="w-full px-3 py-2 rounded-xl bg-gray-900 border border-gray-700 text-sm" :placeholder="es ? 'Precio máx' : 'Max price'">
      </div>
    </div>

    <div v-if="columnsOpen" class="flex flex-wrap gap-3 rounded-xl border border-gray-800 bg-gray-900 px-3 py-3">
      <label v-for="column in COLUMNS" :key="column.id" class="flex items-center gap-2 text-xs text-gray-300">
        <input v-model="visible[column.id]" type="checkbox" class="accent-acid">
        {{ es ? column.es : column.en }}
      </label>
    </div>

    <p v-if="error" class="text-sm text-amber-200">{{ error }}</p>

    <div class="overflow-x-auto rounded-2xl border border-gray-200 bg-white text-gray-900 [color-scheme:light]">
      <table class="min-w-[960px] w-full text-sm border-collapse text-gray-900">
        <thead class="bg-gray-100 text-left text-[11px] uppercase tracking-wide text-gray-900">
          <tr>
            <th
              v-for="column in shownColumns"
              :key="column.id"
              class="px-2 py-1 font-bold border-b border-gray-200"
              :class="columnClass(column.id)"
            >
              {{ es ? column.es : column.en }}
            </th>
            <th class="px-2 py-1 border-b border-gray-200" />
          </tr>
        </thead>
        <tbody>
          <tr v-if="draft" class="bg-gray-100">
            <td v-for="column in shownColumns" :key="column.id" class="px-1 py-0.5 border-b border-gray-200 align-middle" :class="columnClass(column.id)">
              <select
                v-if="column.id === 'category'"
                v-model="draft.category"
                class="w-max px-2 py-1 rounded-lg bg-white border border-gray-300 text-gray-900 text-xs"
              >
                <option v-for="option in categories" :key="option.id" :value="option.id">{{ es ? option.name.es : option.name.en }}</option>
              </select>
              <input
                v-else-if="column.id === 'is_active' || column.id === 'is_featured'"
                v-model="draft[column.id]"
                type="checkbox"
                class="accent-acid"
              >
              <span v-else class="inline-flex items-center justify-center gap-0.5 text-xs text-gray-900">
                <span v-if="column.id === 'price'" aria-hidden="true">$</span>
                <input
                  v-model="draft[column.id]"
                  :type="column.id === 'stock_quantity' ? 'number' : 'text'"
                  :class="column.id === 'name'
                    ? 'w-full max-w-[50ch] px-2 py-1 rounded-lg bg-white border border-gray-300 text-gray-900 text-xs'
                    : column.id === 'size'
                      ? 'w-full max-w-[10ch] px-2 py-1 rounded-lg bg-white border border-gray-300 text-center text-gray-900 text-xs'
                      : column.id === 'sku' || column.id === 'price' || column.id === 'stock_quantity'
                      ? 'w-auto min-w-[2.5rem] px-2 py-1 rounded-lg bg-white border border-gray-300 text-center text-gray-900 text-xs [field-sizing:content]'
                      : column.id === 'brand'
                        ? 'w-auto min-w-[2.5rem] px-2 py-1 rounded-lg bg-white border border-gray-300 text-gray-900 text-xs [field-sizing:content]'
                        : 'w-full min-w-[6rem] px-2 py-1 rounded-lg bg-white border border-gray-300 text-gray-900 text-xs'"
                  :maxlength="column.id === 'name' || column.id === 'description' ? 50 : column.id === 'size' ? 10 : undefined"
                >
              </span>
            </td>
            <td class="px-2 py-1 border-b border-gray-200 whitespace-nowrap">
              <button type="button" class="text-xs font-bold text-acid mr-2" :disabled="savingId === 'draft'" @click="saveDraft">
                {{ es ? 'Guardar' : 'Save' }}
              </button>
              <button type="button" class="text-xs text-gray-400" @click="draft = null">{{ es ? 'Cancelar' : 'Cancel' }}</button>
            </td>
          </tr>
          <tr v-for="product in rows" :key="product.id" class="odd:bg-white even:bg-gray-100 hover:bg-gray-200/70">
            <td v-for="column in shownColumns" :key="column.id" class="px-1 py-0.5 border-b border-gray-200 align-middle" :class="columnClass(column.id)">
              <select
                v-if="column.id === 'category'"
                class="w-max max-w-none bg-transparent px-1 py-0.5 text-xs text-gray-900"
                :value="product.category"
                @change="savePatch(product, { category: ($event.target as HTMLSelectElement).value })"
              >
                <option v-for="option in categories" :key="option.id" :value="option.id">{{ es ? option.name.es : option.name.en }}</option>
              </select>
              <input
                v-else-if="column.id === 'is_active' || column.id === 'is_featured'"
                type="checkbox"
                class="accent-acid"
                :checked="Boolean(product[column.id])"
                @change="savePatch(product, { [column.id]: ($event.target as HTMLInputElement).checked })"
              >
              <textarea
                v-else-if="column.id === 'description' || column.id === 'comentarios'"
                class="w-full max-w-[50ch] bg-transparent px-1 py-0.5 text-xs text-gray-900 resize-y"
                rows="1"
                maxlength="50"
                :value="cellValue(product, column.id)"
                @blur="onText(product, column.id, $event)"
              />
              <span v-else-if="column.id === 'price'" class="inline-flex items-center justify-center gap-0.5 text-xs text-gray-900">
                <span aria-hidden="true">$</span>
                <input
                  class="w-auto min-w-[2.5rem] bg-transparent px-1 py-0.5 text-center text-xs text-gray-900 [field-sizing:content]"
                  type="text"
                  inputmode="decimal"
                  :value="cellValue(product, column.id)"
                  @blur="onText(product, column.id, $event)"
                >
              </span>
              <input
                v-else
                :class="fieldClass(column.id)"
                :type="column.id === 'stock_quantity' ? 'number' : 'text'"
                :maxlength="column.id === 'name' ? 50 : column.id === 'size' ? 10 : undefined"
                :value="cellValue(product, column.id)"
                @blur="onText(product, column.id, $event)"
              >
            </td>
            <td class="px-2 py-1 border-b border-gray-200 whitespace-nowrap">
              <button type="button" class="text-[11px] text-red-700" @click="removeRow(product)">{{ es ? 'Borrar' : 'Delete' }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="text-[11px] text-gray-500">
      {{ es
        ? 'Los cambios se guardan al salir de la celda. El CSV exporta las filas filtradas y las columnas visibles.'
        : 'Edits save when you leave the cell. CSV exports the filtered rows and the visible columns.' }}
    </p>
  </section>
</template>
