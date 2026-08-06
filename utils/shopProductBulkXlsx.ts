import { SHOP_PRODUCT_EXCEL_HEADERS_ES } from '~/utils/shopProductBulk'
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

const HEADER_ROW = [...SHOP_PRODUCT_EXCEL_HEADERS_ES]
const PRODUCT_SHEET_NAME = 'Productos'

const COLUMN_WIDTHS = [36, 16, 14, 10, 12, 8, 22, 14, 18, 8, 11]

function columnLetter(index: number): string {
  let n = index + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

function writeSheetFromRows(
  XLSX: typeof import('xlsx'),
  rows: string[][],
  colCount: number,
): import('xlsx').WorkSheet {
  const ws: import('xlsx').WorkSheet = {}
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? []
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      ws[addr] = { t: 's', v: String(row[c] ?? '') }
    }
  }
  const lastCol = columnLetter(colCount - 1)
  ws['!ref'] = `A1:${lastCol}${rows.length}`
  return ws
}

function buildHeaderOnlyProductSheet(XLSX: typeof import('xlsx')): import('xlsx').WorkSheet {
  const ws = writeSheetFromRows(XLSX, [HEADER_ROW], HEADER_ROW.length)
  ws['!cols'] = COLUMN_WIDTHS.map(wch => ({ wch }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' }
  return ws
}

function buildProductSheet(XLSX: typeof import('xlsx'), dataRows: string[][]): import('xlsx').WorkSheet {
  const ws = writeSheetFromRows(XLSX, [HEADER_ROW, ...dataRows], HEADER_ROW.length)
  ws['!cols'] = COLUMN_WIDTHS.map(wch => ({ wch }))
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' }
  return ws
}

async function xlsxBlobFromWorkbook(build: (XLSX: typeof import('xlsx')) => import('xlsx').WorkBook): Promise<Blob> {
  const XLSX = await import('xlsx')
  const wb = build(XLSX)
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function catalogDataRows(rows: CatalogExportRow[]): string[][] {
  return rows.map(p => [
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
}

export async function catalogToXlsxBlob(rows: CatalogExportRow[]): Promise<Blob> {
  return xlsxBlobFromWorkbook(XLSX => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, buildProductSheet(XLSX, catalogDataRows(rows)), PRODUCT_SHEET_NAME)
    return wb
  })
}

/** One sheet, row 1 = column headers only (paste catalog from row 2). */
export async function skateshopTemplateXlsxBlob(): Promise<Blob> {
  return xlsxBlobFromWorkbook(XLSX => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, buildHeaderOnlyProductSheet(XLSX), PRODUCT_SHEET_NAME)
    return wb
  })
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function parseShopProductXlsx(buffer: ArrayBuffer): Promise<ParseShopProductCsvResult> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const sheetName =
    workbook.SheetNames.find(n => n.toLowerCase() === PRODUCT_SHEET_NAME.toLowerCase()) ??
    workbook.SheetNames[0]
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
