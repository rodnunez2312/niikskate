import type { ParseShopProductCsvResult } from '~/utils/shopProductBulk'
import { parseShopProductTable } from '~/utils/shopProductBulk'

/** First worksheet → same validation as CSV import. */
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
