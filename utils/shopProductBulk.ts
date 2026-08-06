import type { ProductCategory } from '~/types'
import { nextNumericProductId } from '~/utils/productId'
import {
  extractUserAppendFromStoredDescription,
  resolveBulkImportDescription,
} from '~/utils/productDescriptionTemplate'
import {
  normalizeImportCategory,
  parsePriceMxnField,
  parseStockQuantityField,
} from '~/utils/productCategoryImport'
import type { BulkImportIssue } from '~/utils/bulkImportMessages'

/** CSV columns (row 1 header). Save as .csv from Excel. Product IDs (001, 002…) are assigned by the app. */
export const SHOP_PRODUCT_CSV_COLUMNS = [
  'name',
  'brand',
  'category',
  'size',
  'price_mxn',
  'stock_quantity',
  'description',
  'proveedor',
  'comentarios',
  'is_active',
  'is_featured',
] as const

export type ShopProductCsvColumn = (typeof SHOP_PRODUCT_CSV_COLUMNS)[number]

/** Match key for bulk update without product_id in CSV. */
export function bulkProductMatchKey(
  name: string,
  brand: string | null,
  size: string | null,
): string {
  const n = name.trim().toLowerCase()
  const b = (brand || '').trim().toLowerCase()
  const s = (size || '').trim().toLowerCase()
  return `${n}\0${b}\0${s}`
}

export type ParsedShopProductRow = {
  rowNumber: number
  name: string
  brand: string | null
  /** null = leave unchanged on bulk update of existing SKU */
  category: ProductCategory | null
  size: string | null
  /** null = leave unchanged on bulk update of existing SKU */
  price_mxn: number | null
  /** null = leave unchanged on bulk update of existing SKU */
  stock_quantity: number | null
  description: string
  /** Empty string on bulk update = keep existing */
  proveedor: string
  comentarios: string
  is_active: boolean | null
  is_featured: boolean | null
}

export type ParseShopProductCsvResult = {
  rows: ParsedShopProductRow[]
  issues: BulkImportIssue[]
  duplicateCount: number
}

function parseCsvLine(line: string, delimiter = ','): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (c === delimiter && !inQuotes) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur.trim())
  return out
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let n = 0
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (!inQuotes && c === delimiter) n++
  }
  return n
}

/** Excel in many locales (incl. Mexico) exports CSV with semicolons. */
function detectCsvDelimiter(headerLine: string): string {
  const comma = countDelimiterOutsideQuotes(headerLine, ',')
  const semi = countDelimiterOutsideQuotes(headerLine, ';')
  const tab = countDelimiterOutsideQuotes(headerLine, '\t')
  const need = SHOP_PRODUCT_CSV_COLUMNS.length - 1
  if (semi >= need && semi >= comma) return ';'
  if (tab >= need && tab >= comma) return '\t'
  return ','
}

const HEADER_ALIASES: Record<string, ShopProductCsvColumn> = {
  name: 'name',
  nombre: 'name',
  producto: 'name',
  brand: 'brand',
  marca: 'brand',
  category: 'category',
  categoria: 'category',
  size: 'size',
  talla: 'size',
  medida: 'size',
  tamano: 'size',
  price_mxn: 'price_mxn',
  precio: 'price_mxn',
  precio_mxn: 'price_mxn',
  price: 'price_mxn',
  stock_quantity: 'stock_quantity',
  stock: 'stock_quantity',
  inventario: 'stock_quantity',
  cantidad: 'stock_quantity',
  description: 'description',
  descripcion: 'description',
  proveedor: 'proveedor',
  supplier: 'proveedor',
  comentarios: 'comentarios',
  notas: 'comentarios',
  is_active: 'is_active',
  activo: 'is_active',
  visible: 'is_active',
  is_featured: 'is_featured',
  destacado: 'is_featured',
  featured: 'is_featured',
}

function normalizeHeader(h: string): string {
  return h
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
}

function mapHeaderToColumn(normalized: string): ShopProductCsvColumn | null {
  if (SHOP_PRODUCT_CSV_COLUMNS.includes(normalized as ShopProductCsvColumn)) {
    return normalized as ShopProductCsvColumn
  }
  return HEADER_ALIASES[normalized] ?? null
}

/** Excel (e.g. es-MX) sometimes opens comma CSV into one cell: "name,brand,...". */
function expandMergedRowCells(cells: string[]): string[] {
  if (cells.length !== 1) return cells
  const single = cells[0]?.trim() ?? ''
  if (!single) return cells

  for (const alt of [',', ';', '\t']) {
    const parts = parseCsvLine(single, alt)
    if (parts.length < 5) continue
    const firstCol = mapHeaderToColumn(normalizeHeader(parts[0] ?? ''))
    if (firstCol === 'name' || parts.length >= SHOP_PRODUCT_CSV_COLUMNS.length - 2) {
      return parts
    }
  }
  return cells
}

function parseRowCells(line: string, delimiter: string): string[] {
  return expandMergedRowCells(parseCsvLine(line, delimiter))
}

function parseOptionalBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (['1', 'true', 'yes', 'y', 'si', 'sí', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false
  return null
}

export function parseShopProductCsv(text: string): ParseShopProductCsvResult {
  const issues: BulkImportIssue[] = []
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (!lines.length) {
    issues.push({
      row: 0,
      kind: 'other',
      detail: 'El archivo está vacío.',
    })
    return { rows: [], issues, duplicateCount: 0 }
  }

  const delimiter = detectCsvDelimiter(lines[0])
  const rawHeaderCells = parseRowCells(lines[0], delimiter)
  const columnIndexByField = new Map<ShopProductCsvColumn, number>()

  rawHeaderCells.forEach((cell, index) => {
    const mapped = mapHeaderToColumn(normalizeHeader(cell))
    if (mapped != null && !columnIndexByField.has(mapped)) {
      columnIndexByField.set(mapped, index)
    }
  })

  const colIndex = (name: ShopProductCsvColumn) => columnIndexByField.get(name) ?? -1

  for (const col of SHOP_PRODUCT_CSV_COLUMNS) {
    if (colIndex(col) < 0) {
      issues.push({ row: 1, kind: 'header', detail: `Missing column: ${col}` })
    }
  }

  if (issues.some(i => i.kind === 'header')) {
    return { rows: [], issues, duplicateCount: 0 }
  }

  const rows: ParsedShopProductRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1
    const cells = parseRowCells(lines[i], delimiter)
    const get = (col: ShopProductCsvColumn) => cells[colIndex(col)]?.trim() ?? ''

    const name = get('name')
    const categoryRaw = get('category')
    const category = categoryRaw ? normalizeImportCategory(categoryRaw) : null

    if (!name.trim()) continue

    const price_mxn = parsePriceMxnField(get('price_mxn'))
    if (get('price_mxn').trim() && price_mxn == null) {
      issues.push({ row: rowNumber, kind: 'bad_price', detail: get('price_mxn').trim() })
      continue
    }

    const stockParsed = parseStockQuantityField(get('stock_quantity'))
    if (get('stock_quantity').trim() && stockParsed == null) {
      issues.push({ row: rowNumber, kind: 'bad_stock' })
      continue
    }
    const stock_quantity = stockParsed

    if (categoryRaw.trim() && !category) {
      issues.push({ row: rowNumber, kind: 'unknown_category', detail: categoryRaw.trim() })
      continue
    }

    rows.push({
      rowNumber,
      name: name.trim(),
      brand: get('brand') || null,
      category,
      size: get('size') || null,
      price_mxn,
      stock_quantity,
      description: get('description') || '',
      proveedor: get('proveedor'),
      comentarios: get('comentarios'),
      is_active: parseOptionalBool(get('is_active')),
      is_featured: parseOptionalBool(get('is_featured')),
    })
  }

  const seen = new Map<string, ParsedShopProductRow>()
  let duplicateCount = 0
  for (const r of rows) {
    const key = bulkProductMatchKey(r.name, r.brand, r.size)
    if (seen.has(key)) duplicateCount += 1
    seen.set(key, r)
  }

  return { rows: [...seen.values()], issues, duplicateCount }
}

export function shopProductRowToDbPayload(row: ParsedShopProductRow, sku: string) {
  if (!row.category || row.price_mxn == null) {
    throw new Error('New products require category and price_mxn in CSV.')
  }
  const descFields = {
    name: row.name.trim(),
    brand: row.brand,
    category: row.category,
    size: row.size,
  }
  return {
    sku,
    name: row.name.trim(),
    brand: row.brand,
    category: row.category,
    size: row.size,
    price: row.price_mxn,
    stock_quantity: row.stock_quantity ?? 0,
    description: resolveBulkImportDescription(descFields, row.description),
    proveedor: row.proveedor.trim() || null,
    comentarios: row.comentarios.trim() || '',
    images: [] as string[],
    is_active: row.is_active ?? true,
    is_featured: row.is_featured ?? false,
    is_service: row.category === 'ramps',
    requires_quote: row.category === 'ramps',
    min_stock_level: 0,
    max_stock_level: 9999,
    updated_at: new Date().toISOString(),
  }
}

type ExistingProductRow = {
  sku: string
  name: string
  brand: string | null
  category: ProductCategory
  size: string | null
  price: number
  stock_quantity: number
  description: string
  proveedor: string | null
  comentarios: string
  images: string[]
  is_active: boolean
  is_featured: boolean
  is_service: boolean
  requires_quote: boolean
  min_stock_level: number
  max_stock_level: number
}

/** Upsert by SKU: new rows use CSV; existing rows keep fields when CSV cell is blank. */
export function mergeShopProductForUpsert(
  row: ParsedShopProductRow,
  existing: ExistingProductRow | null,
) {
  if (!existing) {
    throw new Error('mergeShopProductForUpsert requires an existing row when updating.')
  }

  const category = row.category || existing.category
  const images = Array.isArray(existing.images) ? existing.images : []
  const name = row.name.trim() || existing.name
  const brand = row.brand ?? existing.brand
  const size = row.size ?? existing.size
  const descFields = { name, brand, category, size }

  return {
    sku: existing.sku,
    name,
    brand,
    category,
    size,
    price: row.price_mxn ?? Number(existing.price),
    stock_quantity: row.stock_quantity ?? existing.stock_quantity,
    description: resolveBulkImportDescription(descFields, row.description, existing.description),
    proveedor: row.proveedor !== '' ? (row.proveedor.trim() || null) : existing.proveedor,
    comentarios: row.comentarios !== '' ? row.comentarios : existing.comentarios,
    images,
    is_active: row.is_active ?? existing.is_active,
    is_featured: row.is_featured ?? existing.is_featured,
    is_service: category === 'ramps',
    requires_quote: category === 'ramps',
    min_stock_level: existing.min_stock_level ?? 0,
    max_stock_level: existing.max_stock_level ?? 9999,
    updated_at: new Date().toISOString(),
  }
}

export function validateRowsForImport(
  rows: ParsedShopProductRow[],
  existingByMatchKey: Map<string, ExistingProductRow>,
): BulkImportIssue[] {
  const issues: BulkImportIssue[] = []
  for (const row of rows) {
    if (!row.name.trim()) {
      issues.push({ row: row.rowNumber, kind: 'missing_name' })
      continue
    }
    const key = bulkProductMatchKey(row.name, row.brand, row.size)
    const isNew = !existingByMatchKey.has(key)
    if (isNew) {
      if (!row.category) issues.push({ row: row.rowNumber, kind: 'missing_category' })
      if (row.price_mxn == null) issues.push({ row: row.rowNumber, kind: 'missing_price' })
    }
  }
  return issues
}

export type BulkImportBuildResult = {
  payloads: Record<string, unknown>[]
  created: number
  updated: number
  errors: string[]
}

/** Assign SKUs for new rows; match existing by name + brand + size. */
export function buildBulkImportPayloads(
  rows: ParsedShopProductRow[],
  catalogExisting: ExistingProductRow[],
): BulkImportBuildResult {
  const errors: string[] = []
  const existingByMatchKey = new Map<string, ExistingProductRow>()
  for (const p of catalogExisting) {
    existingByMatchKey.set(bulkProductMatchKey(p.name, p.brand, p.size), p)
  }

  const allSkus = catalogExisting.map(p => p.sku)
  const assignedInBatch: string[] = []
  const payloads: Record<string, unknown>[] = []
  let created = 0
  let updated = 0

  for (const row of rows) {
    const key = bulkProductMatchKey(row.name, row.brand, row.size)
    const existing = existingByMatchKey.get(key) || null

    try {
      if (existing) {
        payloads.push(mergeShopProductForUpsert(row, existing))
        updated += 1
      } else {
        const sku = nextNumericProductId([...allSkus, ...assignedInBatch])
        assignedInBatch.push(sku)
        allSkus.push(sku)
        payloads.push(shopProductRowToDbPayload(row, sku))
        created += 1
        existingByMatchKey.set(key, {
          sku,
          name: row.name.trim(),
          brand: row.brand,
          category: row.category!,
          size: row.size,
          price: row.price_mxn!,
          stock_quantity: row.stock_quantity ?? 0,
          description: resolveBulkImportDescription(
            {
              name: row.name.trim(),
              brand: row.brand,
              category: row.category!,
              size: row.size,
            },
            row.description,
          ),
          proveedor: row.proveedor.trim() || null,
          comentarios: row.comentarios.trim() || '',
          images: [],
          is_active: row.is_active ?? true,
          is_featured: row.is_featured ?? false,
          is_service: row.category === 'ramps',
          requires_quote: row.category === 'ramps',
          min_stock_level: 0,
          max_stock_level: 9999,
        })
      }
    } catch (e) {
      errors.push(
        `Row ${row.rowNumber}: ${e instanceof Error ? e.message : 'Could not build import row.'}`,
      )
    }
  }

  return { payloads, created, updated, errors }
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

/** Export current catalog for edit-in-Excel → re-import (bulk update). */
export function productsToCsv(rows: Array<{
  name: string
  brand?: string | null
  category: string
  size?: string | null
  price: number
  stock_quantity: number
  description?: string
  proveedor?: string | null
  comentarios?: string | null
  is_active: boolean
  is_featured: boolean
}>): string {
  const header = SHOP_PRODUCT_CSV_COLUMNS.join(',')
  const lines = rows.map(p => {
    return [
      csvEscape(p.name || ''),
      csvEscape(p.brand || ''),
      csvEscape(p.category || ''),
      csvEscape(p.size || ''),
      String(p.price ?? 0),
      String(p.stock_quantity ?? 0),
      csvEscape(extractUserAppendFromStoredDescription(p.description) || ''),
      csvEscape(p.proveedor || ''),
      csvEscape(p.comentarios || ''),
      p.is_active ? 'true' : 'false',
      p.is_featured ? 'true' : 'false',
    ].join(',')
  })
  return `\uFEFF${header}\n${lines.join('\n')}\n`
}
