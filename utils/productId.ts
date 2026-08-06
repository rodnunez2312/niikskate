/** Numeric catalog IDs: 001, 002, … (3 digits). */
export function formatNumericProductId(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(3, '0')
}

export function normalizeNumericProductId(raw: string): string {
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) {
    return formatNumericProductId(Number.parseInt(trimmed, 10))
  }
  return trimmed
}

export function nextNumericProductId(existingSkus: string[]): string {
  let max = 0
  for (const sku of existingSkus) {
    const t = (sku || '').trim()
    if (/^\d+$/.test(t)) {
      max = Math.max(max, Number.parseInt(t, 10))
    }
  }
  return formatNumericProductId(max + 1)
}

export function normalizeImportProductId(raw: string): string {
  return normalizeNumericProductId(raw)
}
