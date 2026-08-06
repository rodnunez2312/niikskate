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
  /** CSV field name, e.g. price_mxn */
  column?: string
  /** Excel column letter from the uploaded file header */
  columnExcel?: string
  productName?: string
  rawValue?: string
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

function priceColumnLabel(i: BulkImportIssue, es: boolean): string {
  const letter = i.columnExcel ?? 'E'
  const field = i.column ?? 'price_mxn'
  return es
    ? `columna ${letter} (${field} / Precio)`
    : `column ${letter} (${field} / Price)`
}

function formatMissingPriceLine(i: BulkImportIssue, es: boolean): string {
  const col = priceColumnLabel(i, es)
  const name = i.productName?.trim()
  const namePart = name
    ? es
      ? `, producto «${name}»`
      : `, product «${name}»`
    : ''
  const raw = i.rawValue?.trim()
  if (raw) {
    return es
      ? `Fila ${i.row}, ${col}${namePart}: no se pudo leer el precio. Valor en la celda: «${raw}». Quita formato de moneda y escribe solo el número (ej. 1200), sin $ ni MXN.`
      : `Row ${i.row}, ${col}${namePart}: could not read price. Cell value: «${raw}». Remove currency format and enter digits only (e.g. 1200), no $ or MXN.`
  }
  return es
    ? `Fila ${i.row}, ${col}${namePart}: la celda está vacía. Escribe el precio en pesos (solo números, ej. 350 o 1200). Si este producto está repetido más abajo, la última fila debe traer precio o déjalo en la fila que sí lo tiene.`
    : `Row ${i.row}, ${col}${namePart}: cell is empty. Enter price in pesos (digits only, e.g. 350 or 1200). If this product is duplicated below, the last row needs a price or keep it on the row that has one.`
}

function formatBadPriceLine(i: BulkImportIssue, es: boolean): string {
  const col = priceColumnLabel(i, es)
  const name = i.productName?.trim()
  const namePart = name
    ? es
      ? `, producto «${name}»`
      : `, product «${name}»`
    : ''
  const raw = i.rawValue?.trim() || i.detail?.trim() || '?'
  return es
    ? `Fila ${i.row}, ${col}${namePart}: precio no válido («${raw}»). Usa solo números (1200) o formato mexicano ($1,200 o 1.200 sin centavos).`
    : `Row ${i.row}, ${col}${namePart}: invalid price («${raw}»). Use digits only (1200) or Mexican format ($1,200 or 1.200 with no cents).`
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

  const byKind = new Map<BulkImportIssue['kind'], BulkImportIssue[]>()
  for (const i of issues) {
    const list = byKind.get(i.kind) ?? []
    list.push(i)
    byKind.set(i.kind, list)
  }

  const summary: string[] = []
  const details: string[] = []

  const missingPrice = byKind.get('missing_price') ?? []
  if (missingPrice.length) {
    if (missingPrice.length === 1) {
      summary.push(formatMissingPriceLine(missingPrice[0]!, es))
    } else {
      for (const i of missingPrice) {
        details.push(formatMissingPriceLine(i, es))
      }
      summary.push(
        es
          ? `Falta el precio en ${missingPrice.length} producto(s). Revisa columna Precio (price_mxn). ${rowList(
              missingPrice.map(i => i.row),
              es,
            )}. Abre «Detalle por fila» para ver fila y columna exactas.`
          : `Missing price on ${missingPrice.length} product(s). Check Price column (price_mxn). ${rowList(
              missingPrice.map(i => i.row),
              es,
            )}. Open «Row details» for exact row and column.`,
      )
    }
  }

  const badPrice = byKind.get('bad_price') ?? []
  if (badPrice.length) {
    if (badPrice.length === 1) {
      summary.push(formatBadPriceLine(badPrice[0]!, es))
    } else {
      for (const i of badPrice) {
        details.push(formatBadPriceLine(i, es))
      }
      summary.push(
        es
          ? `Precio no válido en ${badPrice.length} fila(s). ${rowList(
              badPrice.map(i => i.row),
              es,
            )}.`
          : `Invalid price on ${badPrice.length} row(s). ${rowList(badPrice.map(i => i.row), es)}.`,
      )
    }
  }

  const missingCategory = byKind.get('missing_category') ?? []
  if (missingCategory.length) {
    summary.push(
      es
        ? `Falta la categoría en ${missingCategory.length} fila(s). Escribe el tipo de producto (playera, casco, tabla, gorra…). ${rowList(
            missingCategory.map(i => i.row),
            es,
          )}.`
        : `Missing category on ${missingCategory.length} row(s). Enter product type (playera, casco, tabla, gorra…). ${rowList(
            missingCategory.map(i => i.row),
            es,
          )}.`,
    )
  }

  const unknownCat = issues.filter(i => i.kind === 'unknown_category')
  if (unknownCat.length) {
    const names = [...new Set(unknownCat.map(i => i.detail).filter(Boolean))].slice(0, 5)
    summary.push(
      es
        ? `Tipo de producto no reconocido en ${unknownCat.length} fila(s)${names.length ? `: ${names.join(', ')}` : ''}. Usa palabras como playera, gorra, casco, tabla, baleros, tenis… ${rowList(
            unknownCat.map(i => i.row),
            es,
          )}.`
        : `Unrecognized product type on ${unknownCat.length} row(s)${names.length ? `: ${names.join(', ')}` : ''}. Use words like playera, gorra, casco, tabla, baleros, tenis… ${rowList(
            unknownCat.map(i => i.row),
            es,
          )}.`,
    )
  }

  const badStock = byKind.get('bad_stock') ?? []
  if (badStock.length) {
    summary.push(
      es
        ? `Stock no válido en ${badStock.length} fila(s): pon un número o déjalo vacío. ${rowList(
            badStock.map(i => i.row),
            es,
          )}.`
        : `Invalid stock on ${badStock.length} row(s): enter a number or leave blank. ${rowList(
            badStock.map(i => i.row),
            es,
          )}.`,
    )
  }

  const missingName = byKind.get('missing_name') ?? []
  if (missingName.length) {
    summary.push(
      es
        ? `Falta el nombre del producto en ${missingName.length} fila(s). ${rowList(
            missingName.map(i => i.row),
            es,
          )}.`
        : `Missing product name on ${missingName.length} row(s). ${rowList(
            missingName.map(i => i.row),
            es,
          )}.`,
    )
  }

  const other = issues.filter(i => i.kind === 'other')
  for (const o of other) {
    details.push(
      es ? `Fila ${o.row}: ${o.detail ?? 'Revisa esta fila'}` : `Row ${o.row}: ${o.detail ?? 'Check this row'}`,
    )
  }

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
    ? `${warningCount} producto(s) repetido(s) en el archivo — se importará la última fila de cada uno; si la última fila no trae precio, se usa el precio de una fila anterior del mismo producto.`
    : `${warningCount} duplicate product(s) in the file — the last row wins; if the last row has no price, the price from an earlier row for the same product is kept.`
}
