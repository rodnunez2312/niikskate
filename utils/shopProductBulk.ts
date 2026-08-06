import type { ProductCategory } from '~/types'
import { nextNumericProductId } from '~/utils/productId'
import {
  extractUserAppendFromStoredDescription,
  resolveBulkImportDescription,
} from '~/utils/productDescriptionTemplate'

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

const VALID_CATEGORIES: ProductCategory[] = [
  'tablas',
  'llantas',
  'hardware',
  'lijas',
  'protecciones',
  'cascos',
  'merch',
  'ramps',
]

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
  errors: string[]
}

function parseCsvLine(line: string): string[] {
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
    if (c === ',' && !inQuotes) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur.trim())
  return out
}

function parseOptionalBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (['1', 'true', 'yes', 'y', 'si', 'sí', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false
  return null
}

function normalizeHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase()
}

export function parseShopProductCsv(text: string): ParseShopProductCsvResult {
  const errors: string[] = []
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  if (!lines.length) {
    return { rows: [], errors: ['File is empty.'] }
  }

  const headerCells = parseCsvLine(lines[0]).map(normalizeHeader)
  const colIndex = (name: ShopProductCsvColumn) => headerCells.indexOf(name)

  for (const col of SHOP_PRODUCT_CSV_COLUMNS) {
    if (colIndex(col) < 0) {
      errors.push(`Missing column: ${col}`)
    }
  }
  if (errors.length) return { rows: [], errors }

  const rows: ParsedShopProductRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const rowNumber = i + 1
    const cells = parseCsvLine(lines[i])
    const get = (col: ShopProductCsvColumn) => cells[colIndex(col)]?.trim() ?? ''

    const name = get('name')
    const categoryRaw = get('category').toLowerCase()
    const category = categoryRaw
      ? (VALID_CATEGORIES.includes(categoryRaw as ProductCategory) ? (categoryRaw as ProductCategory) : null)
      : null

    if (!name.trim()) continue

    const priceRaw = get('price_mxn')
    let price_mxn: number | null = null
    if (priceRaw) {
      price_mxn = Number(priceRaw)
      if (Number.isNaN(price_mxn) || price_mxn < 0) {
        errors.push(`Row ${rowNumber}: price_mxn must be a number >= 0.`)
        continue
      }
    }

    const stockRaw = get('stock_quantity')
    let stock_quantity: number | null = null
    if (stockRaw) {
      stock_quantity = Number(stockRaw)
      if (Number.isNaN(stock_quantity) || stock_quantity < 0) {
        errors.push(`Row ${rowNumber}: stock_quantity must be a number >= 0.`)
        continue
      }
    }

    if (categoryRaw && !category) {
      errors.push(
        `Row ${rowNumber}: invalid category "${categoryRaw}". Use: ${VALID_CATEGORIES.join(', ')}`,
      )
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

  const seen = new Set<string>()
  for (const r of rows) {
    const key = bulkProductMatchKey(r.name, r.brand, r.size)
    if (seen.has(key)) {
      errors.push(
        `Duplicate row in file (same name, brand, size): "${r.name}"${r.brand ? ` / ${r.brand}` : ''}${r.size ? ` / ${r.size}` : ''}`,
      )
    }
    seen.add(key)
  }

  return { rows, errors }
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
): string[] {
  const errors: string[] = []
  for (const row of rows) {
    if (!row.name.trim()) {
      errors.push(`Row ${row.rowNumber}: name is required.`)
      continue
    }
    const key = bulkProductMatchKey(row.name, row.brand, row.size)
    const isNew = !existingByMatchKey.has(key)
    if (isNew) {
      if (!row.category) errors.push(`Row ${row.rowNumber}: category is required for new product "${row.name}".`)
      if (row.price_mxn == null) errors.push(`Row ${row.rowNumber}: price_mxn is required for new product "${row.name}".`)
    }
  }
  return errors
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
