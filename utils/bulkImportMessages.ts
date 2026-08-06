/** One problem on one Excel row (row number = sheet row, same as Excel). */
export type BulkImportIssue = {
  row: number
  kind:
    | 'header'
    | 'bad_price'
    | 'bad_stock'
    | 'unknown_category'
    | 'missing_name'
    | 'missing_category'
    | 'missing_price'
    | 'other'
  detail?: string
}

function rowList(rows: number[], es: boolean): string {
  const uniq = [...new Set(rows)].sort((a, b) => a - b)
  if (uniq.length <= 6) {
    return es ? `Filas de Excel: ${uniq.join(', ')}` : `Excel rows: ${uniq.join(', ')}`
  }
  const head = uniq.slice(0, 5).join(', ')
  const rest = uniq.length - 5
  return es ? `Filas de Excel: ${head} (+${rest} más)` : `Excel rows: ${head} (+${rest} more)`
}

/** Short messages for admins (no IT jargon). */
export function summarizeBulkImportIssues(
  issues: BulkImportIssue[],
  es: boolean,
): { summary: string[]; details: string[] } {
  if (!issues.length) return { summary: [], details: [] }

  const header = issues.filter(i => i.kind === 'header')
  if (header.length) {
    const msg = es
      ? 'No se leyeron las columnas del archivo. Descarga la plantilla otra vez, pega tus productos debajo de la fila de títulos y guarda como CSV UTF-8.'
      : 'Could not read column headers. Download the template again, paste products under the title row, and save as CSV UTF-8.'
    return {
      summary: [msg, ...(header[0]?.detail ? [header[0].detail] : [])],
      details: [],
    }
  }

  const byKind = new Map<BulkImportIssue['kind'], number[]>()
  for (const i of issues) {
    const list = byKind.get(i.kind) ?? []
    list.push(i.row)
    byKind.set(i.kind, list)
  }

  const summary: string[] = []

  const missingPrice = byKind.get('missing_price') ?? []
  if (missingPrice.length) {
    summary.push(
      es
        ? `Falta el precio (columna price_mxn) en ${missingPrice.length} producto(s). Escribe solo el número en pesos, por ejemplo 350 o 1200. ${rowList(missingPrice, es)}.`
        : `Missing price (price_mxn column) on ${missingPrice.length} product(s). Enter the amount in pesos only, e.g. 350 or 1200. ${rowList(missingPrice, es)}.`,
    )
  }

  const badPrice = byKind.get('bad_price') ?? []
  if (badPrice.length) {
    summary.push(
      es
        ? `Precio no válido en ${badPrice.length} fila(s): quita símbolos raros y usa solo números. ${rowList(badPrice, es)}.`
        : `Invalid price on ${badPrice.length} row(s): use numbers only, no symbols. ${rowList(badPrice, es)}.`,
    )
  }

  const missingCategory = byKind.get('missing_category') ?? []
  if (missingCategory.length) {
    summary.push(
      es
        ? `Falta la categoría en ${missingCategory.length} fila(s). Escribe el tipo de producto (playera, casco, tabla, gorra…). ${rowList(missingCategory, es)}.`
        : `Missing category on ${missingCategory.length} row(s). Enter product type (playera, casco, tabla, gorra…). ${rowList(missingCategory, es)}.`,
    )
  }

  const unknownCat = issues.filter(i => i.kind === 'unknown_category')
  if (unknownCat.length) {
    const names = [...new Set(unknownCat.map(i => i.detail).filter(Boolean))].slice(0, 5)
    summary.push(
      es
        ? `Tipo de producto no reconocido en ${unknownCat.length} fila(s)${names.length ? `: ${names.join(', ')}` : ''}. Usa palabras como playera, gorra, casco, tabla, baleros, tenis… ${rowList(unknownCat.map(i => i.row), es)}.`
        : `Unrecognized product type on ${unknownCat.length} row(s)${names.length ? `: ${names.join(', ')}` : ''}. Use words like playera, gorra, casco, tabla, baleros, tenis… ${rowList(unknownCat.map(i => i.row), es)}.`,
    )
  }

  const badStock = byKind.get('bad_stock') ?? []
  if (badStock.length) {
    summary.push(
      es
        ? `Stock no válido en ${badStock.length} fila(s): pon un número o déjalo vacío. ${rowList(badStock, es)}.`
        : `Invalid stock on ${badStock.length} row(s): enter a number or leave blank. ${rowList(badStock, es)}.`,
    )
  }

  const missingName = byKind.get('missing_name') ?? []
  if (missingName.length) {
    summary.push(
      es
        ? `Falta el nombre del producto en ${missingName.length} fila(s). ${rowList(missingName, es)}.`
        : `Missing product name on ${missingName.length} row(s). ${rowList(missingName, es)}.`,
    )
  }

  const other = issues.filter(i => i.kind === 'other')
  const details = other.map(i =>
    es ? `Fila ${i.row}: ${i.detail ?? 'Revisa esta fila'}` : `Row ${i.row}: ${i.detail ?? 'Check this row'}`,
  )

  if (summary.length === 0 && other.length) {
    summary.push(
      es
        ? `Hay ${other.length} problema(s) en el archivo.`
        : `${other.length} issue(s) in the file.`,
    )
  }

  for (const o of other) {
    if (o.row === 0 && o.detail) summary.unshift(o.detail)
  }

  return { summary: [...new Set(summary)], details }
}

export function summarizeBulkImportWarnings(warningCount: number, es: boolean): string | null {
  if (!warningCount) return null
  return es
    ? `${warningCount} producto(s) repetido(s) en el archivo — se importará la última fila de cada uno.`
    : `${warningCount} duplicate product(s) in the file — the last row of each will be imported.`
}
