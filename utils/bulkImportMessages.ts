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
  if (i.detail === 'inch_csv_shift') {
    return es
      ? `Fila ${i.row}, ${col}${namePart}: en Excel se ve precio, pero la talla con comillas de pulgadas (ej. 8.75") puede fallar. Usa 8.75 in o 8.75 sin comilla en columna size.`
      : `Row ${i.row}, ${col}${namePart}: price may look fine, but inch quotes in size (e.g. 8.75") can fail. Use 8.75 in or 8.75 without " in the size column.`
  }
  if (raw) {
    return es
      ? `Fila ${i.row}, ${col}${namePart}: no se pudo leer el precio. Valor en la celda: «${raw}». Quita formato de moneda y escribe solo el número (ej. 1200), sin $ ni MXN.`
      : `Row ${i.row}, ${col}${namePart}: could not read price. Cell value: «${raw}». Remove currency format and enter digits only (e.g. 1200), no $ or MXN.`
  }
  return es
    ? `Fila ${i.row}, ${col}${namePart}: falta precio en el Excel. Revisa la columna price_mxn.`
    : `Row ${i.row}, ${col}${namePart}: missing price in Excel. Check the price_mxn column.`
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

function formatUnknownCategoryLine(i: BulkImportIssue, es: boolean): string {
  const name = i.productName?.trim()
  const namePart = name ? (es ? `, producto «${name}»` : `, product «${name}»`) : ''
  if (i.detail === 'comma_in_name') {
    const read = i.rawValue?.trim()
    const readPart = read ? (es ? ` (leyó «${read}» en categoría)` : ` (read «${read}» as category)`) : ''
    return es
      ? `Fila ${i.row}${namePart}: revisa la columna category (playera, tabla, PROTECCIONES…). Si el nombre tiene comas, no debería pasar con .xlsx; confirma que category no quedó vacía.`
      : `Row ${i.row}${namePart}: check the category column (playera, tabla, PROTECCIONES…). Commas in names are fine in .xlsx; make sure category is filled.`
  }
  const tipo = i.detail ?? i.rawValue ?? '?'
  return es
    ? `Fila ${i.row}${namePart}: tipo «${tipo}» no reconocido. En columna category usa playera, gorra, casco, tabla, PROTECCIONES, baleros, tenis…`
    : `Row ${i.row}${namePart}: type «${tipo}» not recognized. In category column use playera, gorra, casco, tabla, PROTECCIONES, baleros, tenis…`
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
      ? 'No se leyeron las columnas del Excel. Descarga la plantilla, pega tus productos debajo de la fila de títulos y guarda como .xlsx.'
      : 'Could not read Excel columns. Download the template, paste products under the title row, and save as .xlsx.'
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
    if (unknownCat.length === 1) {
      summary.push(formatUnknownCategoryLine(unknownCat[0]!, es))
    } else {
      for (const i of unknownCat) {
        details.push(formatUnknownCategoryLine(i, es))
      }
      const labels = [
        ...new Set(
          unknownCat
            .map(i => (i.detail === 'comma_in_name' ? (es ? 'columnas corridas (coma en nombre)' : 'shifted columns (comma in name)') : i.detail))
            .filter(Boolean),
        ),
      ].slice(0, 5)
      summary.push(
        es
          ? `Tipo de producto no reconocido en ${unknownCat.length} fila(s)${labels.length ? `: ${labels.join(', ')}` : ''}. ${rowList(
              unknownCat.map(i => i.row),
              es,
            )}.`
          : `Unrecognized product type on ${unknownCat.length} row(s)${labels.length ? `: ${labels.join(', ')}` : ''}. ${rowList(
              unknownCat.map(i => i.row),
              es,
            )}.`,
      )
    }
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
    ? `${warningCount} fila(s) repetida(s) (mismo nombre/marca/talla). Edítalas abajo o quita la fila extra; al importar se combina la última fila de cada grupo.`
    : `${warningCount} duplicate row(s) (same name/brand/size). Edit below or remove extras; import merges the last row in each group.`
}
