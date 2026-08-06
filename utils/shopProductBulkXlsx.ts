import { SHOP_PRODUCT_CSV_COLUMNS } from '~/utils/shopProductBulk'
import { extractUserAppendFromStoredDescription } from '~/utils/productDescriptionTemplate'
import type { ParseShopProductCsvResult } from '~/utils/shopProductBulk'
import { parseShopProductTable } from '~/utils/shopProductBulk'

export type CatalogExportRow = {
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
}

function catalogRowsToAoA(rows: CatalogExportRow[]): string[][] {
  const header = [...SHOP_PRODUCT_CSV_COLUMNS]
  const data = rows.map(p => [
    p.name || '',
    p.brand || '',
    p.category || '',
    p.size || '',
    String(p.price ?? 0),
    String(p.stock_quantity ?? 0),
    extractUserAppendFromStoredDescription(p.description) || '',
    p.proveedor || '',
    p.comentarios || '',
    p.is_active ? 'true' : 'false',
    p.is_featured ? 'true' : 'false',
  ])
  return [header, ...data]
}

async function xlsxBlobFromAoA(rows: string[][], sheetName: string): Promise<Blob> {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

export async function catalogToXlsxBlob(rows: CatalogExportRow[]): Promise<Blob> {
  return xlsxBlobFromAoA(catalogRowsToAoA(rows), 'Productos')
}

export async function skateshopTemplateXlsxBlob(): Promise<Blob> {
  const header = [...SHOP_PRODUCT_CSV_COLUMNS]
  const example: string[] = [
    'Playera logo (ejemplo)',
    'Tu marca',
    'playera',
    'M',
    '350',
    '5',
    '',
    '',
    '',
    'true',
    'false',
  ]
  return xlsxBlobFromAoA([header, example], 'Productos')
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** First worksheet → same validation as table import. */
export async function parseShopProductXlsx(buffer: ArrayBuffer): Promise<ParseShopProductCsvResult> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return parseShopProductTable([])
  }
  const sheet = workbook.Sheets[sheetName]
  const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  })
  return parseShopProductTable(table)
}
