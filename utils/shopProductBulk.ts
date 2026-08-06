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

/** Row 1 labels in Excel (import accepts these via header aliases). */
export const SHOP_PRODUCT_EXCEL_HEADERS_ES = [
  'nombre',
  'marca',
  'categoria',
  'talla',
  'precio_mxn',
  'stock',
  'descripcion',
  'proveedor',
  'comentarios',
  'activo',
  'destacado',
] as const

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

/** Excel column letter (1 → A) for error messages. */
export function excelColumnLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
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
  /** Raw cell from price_mxn column (for admin error text). */
  price_mxn_raw: string
  /** Excel column letter for price_mxn in this file (from header position). */
  price_mxn_excel_col: string
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

/**
 * Deck sizes like 8.75" export without CSV quotes. The " toggles quote mode and
 * swallows ,1231,1 into the size cell — price_mxn looks empty in the app.
 */
function sanitizeCsvLineForSkateData(line: string): string {
  return line.replace(/(\d+(?:\.\d+)?)[\u2033"](?=[,;\t]|$)/g, '$1 in')
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
  return expandMergedRowCells(parseCsvLine(sanitizeCsvLineForSkateData(line), delimiter))
}

/**
 * Commas inside product name (without CSV quotes) add extra cells — category reads as stock, etc.
 */
function rebalanceRowCellsForCommaInName(
  cells: string[],
  columnIndexByField: Map<ShopProductCsvColumn, number>,
): string[] {
  const nameIdx = columnIndexByField.get('name')
  const stockIdx = columnIndexByField.get('stock_quantity')
  if (nameIdx == null || nameIdx !== 0 || stockIdx == null) return cells

  const logicalDataCols = stockIdx - nameIdx + 1
  if (cells.length <= logicalDataCols) return cells

  const extra = cells.length - logicalDataCols
  if (extra <= 0 || extra > 4) return cells

  const nameParts = cells.slice(0, 1 + extra)
  const rest = cells.slice(1 + extra)
  const merged = [nameParts.join(', '), ...rest]
  const maxIdx = Math.max(...columnIndexByField.values())
  while (merged.length <= maxIdx) merged.push('')
  return merged
}

/** Category cell looks like stock/price/size — columns shifted (often comma in name). */
export function categoryFieldLooksLikeColumnShift(raw: string): boolean {
  const s = raw.trim()
  if (!s) return false
  if (/^\d+$/.test(s)) return true
  if (/^\d+[.,]\d+$/.test(s)) return true
  if (/^[a-z]{1,4}$/i.test(s) && ['xs', 's', 'm', 'l', 'xl', 'xxl', 'unitalla'].includes(s.toLowerCase())) {
    return true
  }
  return false
}

/** Size cell absorbed price/stock because of inch mark (8.75") in CSV. */
export function sizeFieldLooksLikeCsvInchShift(size: string | null | undefined): boolean {
  const s = (size ?? '').trim()
  if (!s) return false
  return /,\s*\d{2,6}(?:\s*[,;]\s*\d+)?\s*$/.test(s) || /\d+(?:\.\d+)?"[,;]/.test(s)
}

function parseOptionalBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (['1', 'true', 'yes', 'y', 'si', 'sí', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false
  return null
}

function cellToImportString(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number') {
    if (Number.isFinite(value) && Number.isInteger(value)) return String(value)
    if (Number.isFinite(value)) {
      const rounded = Math.round(value * 100) / 100
      return Number.isInteger(rounded) ? String(rounded) : String(rounded)
    }
  }
  if (value instanceof Date) return value.toISOString()
  return String(value).trim()
}

function padTableRow(cells: unknown[], minCols: number): string[] {
  const out = cells.map(cellToImportString)
  while (out.length < minCols) out.push('')
  return out
}

/** Parse header + data rows (from .xlsx or from CSV lines). Row 1 = Excel row 1. */
export function parseShopProductTable(table: unknown[][]): ParseShopProductCsvResult {
  const issues: BulkImportIssue[] = []
  if (!table.length || !table.some(row => row.some(c => cellToImportString(c).length > 0))) {
    issues.push({
      row: 0,
      kind: 'other',
      detail: 'El archivo está vacío.',
    })
    return { rows: [], issues, duplicateCount: 0 }
  }

  const rawHeaderCells = padTableRow(table[0] ?? [], SHOP_PRODUCT_CSV_COLUMNS.length)
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

  const minCols = Math.max(...columnIndexByField.values()) + 1
  const priceMxnExcelCol =
    colIndex('price_mxn') >= 0 ? excelColumnLetter(colIndex('price_mxn')) : '?'

  const rows: ParsedShopProductRow[] = []

  for (let i = 1; i < table.length; i++) {
    const rowNumber = i + 1
    const sourceRow = table[i] ?? []
    if (!sourceRow.some(c => cellToImportString(c).length > 0)) continue
    let cells = padTableRow(sourceRow, minCols)
    cells = rebalanceRowCellsForCommaInName(cells, columnIndexByField)
    const get = (col: ShopProductCsvColumn) => cells[colIndex(col)]?.trim() ?? ''

    const name = get('name')
    const categoryRaw = get('category')
    const category = categoryRaw ? normalizeImportCategory(categoryRaw) : null

    if (!name.trim()) continue

    const priceRaw = get('price_mxn')
    const price_mxn = parsePriceMxnField(priceRaw)
    if (priceRaw.trim() && price_mxn == null) {
      issues.push({
        row: rowNumber,
        kind: 'bad_price',
        column: 'price_mxn',
        columnExcel: priceMxnExcelCol,
        productName: name.trim(),
        rawValue: priceRaw.trim(),
        detail: priceRaw.trim(),
      })
      continue
    }

    const stockParsed = parseStockQuantityField(get('stock_quantity'))
    if (get('stock_quantity').trim() && stockParsed == null) {
      issues.push({ row: rowNumber, kind: 'bad_stock' })
      continue
    }
    const stock_quantity = stockParsed

    if (categoryRaw.trim() && !category) {
      issues.push({
        row: rowNumber,
        kind: 'unknown_category',
        detail: categoryFieldLooksLikeColumnShift(categoryRaw)
          ? 'comma_in_name'
          : categoryRaw.trim(),
        productName: name.trim(),
        rawValue: categoryRaw.trim(),
      })
      continue
    }

    rows.push({
      rowNumber,
      name: name.trim(),
      brand: get('brand') || null,
      category,
      size: get('size') || null,
      price_mxn,
      price_mxn_raw: priceRaw,
      price_mxn_excel_col: priceMxnExcelCol,
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
    if (seen.has(key)) {
      duplicateCount += 1
      const prev = seen.get(key)!
      seen.set(key, {
        ...r,
        rowNumber: r.rowNumber,
        category: r.category ?? prev.category,
        price_mxn: r.price_mxn ?? prev.price_mxn,
        price_mxn_raw: r.price_mxn != null ? r.price_mxn_raw : prev.price_mxn_raw || r.price_mxn_raw,
        stock_quantity: r.stock_quantity ?? prev.stock_quantity,
        description: r.description.trim() ? r.description : prev.description,
        proveedor: r.proveedor.trim() ? r.proveedor : prev.proveedor,
        comentarios: r.comentarios.trim() ? r.comentarios : prev.comentarios,
        is_active: r.is_active ?? prev.is_active,
        is_featured: r.is_featured ?? prev.is_featured,
      })
    } else {
      seen.set(key, r)
    }
  }

  return { rows: [...seen.values()], issues, duplicateCount }
}

export function parseShopProductCsv(text: string): ParseShopProductCsvResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (!lines.length) {
    return parseShopProductTable([])
  }
  const delimiter = detectCsvDelimiter(lines[0])
  const table = lines.map(line => parseRowCells(line, delimiter))
  return parseShopProductTable(table)
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
      if (row.price_mxn == null) {
        issues.push({
          row: row.rowNumber,
          kind: 'missing_price',
          column: 'price_mxn',
          columnExcel: row.price_mxn_excel_col,
          productName: row.name.trim(),
          rawValue: row.price_mxn_raw.trim() || undefined,
          detail: sizeFieldLooksLikeCsvInchShift(row.size) ? 'inch_csv_shift' : undefined,
        })
      }
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
