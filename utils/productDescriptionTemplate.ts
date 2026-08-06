import type { ProductCategory } from '~/types'
import { CATEGORY_LABELS } from '~/types'

/** Split auto-generated copy from optional merchant notes in stored descriptions. */
export const PRODUCT_DESC_USER_SEPARATOR = '\n\n—\n\n'

export type ProductDescriptionFields = {
  name: string
  brand?: string | null
  category: ProductCategory
  size?: string | null
}

const CATEGORY_PITCH_ES: Record<ProductCategory, string> = {
  tablas:
    'Ideal para armar tu setup o reemplazar tu deck. Pensada para el uso diario en street, park o mini rampa.',
  llantas:
    'Ruedas con buen balance entre agarre y desliz; listas para piso liso, concreto o skatepark.',
  hardware:
    'Componentes confiables para mantener tu patineta al 100: ejes, tornillería y piezas de repuesto.',
  lijas:
    'Lija con buen agarre para control en trucos y slides. Recorta fácil a tu tabla.',
  protecciones:
    'Protección cómoda para entrenar con más confianza — recomendada en Niik Academy y sesiones en rampa.',
  cascos:
    'Casco esencial para cuidarte en rampa, bowl y aprendizaje de nuevos trucos. Ajuste seguro y uso frecuente.',
  merch:
    'Pieza oficial del estilo Niik — para la comunidad skater dentro y fuera del parque.',
  ramps:
    'Rampas y obstáculos a medida. Cuéntanos tu espacio en la tienda y te orientamos con cotización personalizada.',
}

/** Customer-facing block built from catalog fields (Spanish). */
export function buildAutoProductDescription(fields: ProductDescriptionFields): string {
  const name = fields.name.trim()
  const catEs = CATEGORY_LABELS[fields.category]?.name_es ?? fields.category
  const lines: string[] = []

  lines.push(`${name} — ${catEs.toLowerCase()} en Niik Skateshop.`)

  const specs: string[] = []
  if (fields.brand?.trim()) specs.push(`Marca ${fields.brand.trim()}`)
  if (fields.size?.trim()) specs.push(`Medida ${fields.size.trim()}`)
  specs.push(`Categoría ${catEs}`)
  if (specs.length) {
    lines.push(specs.join(' · ') + '.')
  }

  lines.push(CATEGORY_PITCH_ES[fields.category] ?? CATEGORY_LABELS[fields.category]?.description ?? '')

  return lines.filter(Boolean).join('\n\n')
}

export function extractUserAppendFromStoredDescription(stored: string | null | undefined): string {
  const text = (stored ?? '').trim()
  if (!text) return ''
  const sep = PRODUCT_DESC_USER_SEPARATOR
  const idx = text.indexOf(sep)
  if (idx >= 0) return text.slice(idx + sep.length).trim()
  return ''
}

/**
 * Full description for the storefront: auto template + optional notes (CSV or admin).
 * When `userAppend` is omitted and `existingDescription` is set, keeps prior notes after the separator.
 */
export function composeProductDescription(
  fields: ProductDescriptionFields,
  userAppend?: string,
  existingDescription?: string | null,
): string {
  const auto = buildAutoProductDescription(fields)
  let extra = (userAppend ?? '').trim()
  if (!extra && existingDescription) {
    extra = extractUserAppendFromStoredDescription(existingDescription)
  }
  if (!extra) return auto
  return `${auto}${PRODUCT_DESC_USER_SEPARATOR}${extra}`
}

/** Resolve description on bulk import from CSV cell + merged fields. */
export function resolveBulkImportDescription(
  fields: ProductDescriptionFields,
  csvDescriptionCell: string,
  existingDescription?: string | null,
): string {
  const fromCsv = csvDescriptionCell.trim()
  if (fromCsv) {
    return composeProductDescription(fields, fromCsv)
  }
  return composeProductDescription(fields, undefined, existingDescription ?? undefined)
}
