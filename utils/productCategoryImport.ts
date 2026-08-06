import type { ProductCategory } from '~/types'

export const SHOP_PRODUCT_CATEGORIES: ProductCategory[] = [
  'tablas',
  'llantas',
  'hardware',
  'lijas',
  'protecciones',
  'cascos',
  'merch',
  'ramps',
]

/**
 * Maps catalog / Excel product types → shop filter category (enum).
 * Column `category` can be playera, casco, baleros, etc.
 */
const IMPORT_CATEGORY_MAP: Record<string, ProductCategory> = {
  tablas: 'tablas',
  tabla: 'tablas',
  deck: 'tablas',
  decks: 'tablas',
  llantas: 'llantas',
  llanta: 'llantas',
  wheels: 'llantas',
  hardware: 'hardware',
  baleros: 'hardware',
  balero: 'hardware',
  bearings: 'hardware',
  rieles: 'hardware',
  riel: 'hardware',
  trucks: 'hardware',
  ejes: 'hardware',
  eje: 'hardware',
  tornillos: 'hardware',
  tornillo: 'hardware',
  elevadores: 'hardware',
  elevador: 'hardware',
  risers: 'hardware',
  gomas: 'hardware',
  goma: 'hardware',
  bushings: 'hardware',
  herramienta: 'hardware',
  herramientas: 'hardware',
  tool: 'hardware',
  tools: 'hardware',
  lijas: 'lijas',
  lija: 'lijas',
  grip: 'lijas',
  protecciones: 'protecciones',
  proteccion: 'protecciones',
  pads: 'protecciones',
  cascos: 'cascos',
  casco: 'cascos',
  helmet: 'cascos',
  helmets: 'cascos',
  merch: 'merch',
  merchandise: 'merch',
  playera: 'merch',
  playeras: 'merch',
  camiseta: 'merch',
  camisetas: 'merch',
  tshirt: 'merch',
  gorra: 'merch',
  gorras: 'merch',
  cap: 'merch',
  caps: 'merch',
  beanie: 'merch',
  beanies: 'merch',
  calcetines: 'merch',
  calcetin: 'merch',
  socks: 'merch',
  cartera: 'merch',
  carteras: 'merch',
  wallet: 'merch',
  cinturon: 'merch',
  cinturones: 'merch',
  belt: 'merch',
  pantalon: 'merch',
  pantalones: 'merch',
  pants: 'merch',
  short: 'merch',
  shorts: 'merch',
  'lentes sol': 'merch',
  lentes: 'merch',
  sunglasses: 'merch',
  marcador: 'merch',
  marcadores: 'merch',
  sticker: 'merch',
  stickers: 'merch',
  ropa: 'merch',
  clothing: 'merch',
  ramps: 'ramps',
  rampa: 'ramps',
  rampas: 'ramps',
}

function normalizeCategoryKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
}

export function normalizeImportCategory(raw: string): ProductCategory | null {
  const key = normalizeCategoryKey(raw)
  if (!key) return null
  if (SHOP_PRODUCT_CATEGORIES.includes(key as ProductCategory)) {
    return key as ProductCategory
  }
  return IMPORT_CATEGORY_MAP[key] ?? null
}

/** MXN price from Excel (empty / consultar → null). */
export function parsePriceMxnField(raw: string): number | null {
  let s = raw.trim()
  if (!s) return null
  const lower = s.toLowerCase()
  if (['n/a', 'na', 'consultar', 'cotizar', '-', '—', 'tbd'].includes(lower)) {
    return null
  }

  s = s.replace(/[$₡€£MXN\s]/gi, '')

  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf('.') > s.lastIndexOf(',')) {
      s = s.replace(/,/g, '')
    } else {
      s = s.replace(/\./g, '').replace(',', '.')
    }
  } else if (s.includes(',')) {
    const parts = s.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      s = `${parts[0].replace(/\./g, '')}.${parts[1]}`
    } else {
      s = s.replace(/,/g, '')
    }
  }

  const n = Number(s)
  if (Number.isNaN(n) || n < 0) return null
  return n
}

export function parseStockQuantityField(raw: string): number | null {
  const s = raw.trim()
  if (!s) return 0
  const lower = s.toLowerCase()
  if (['n/a', 'na', '-', '—'].includes(lower)) return 0
  const n = Number(s.replace(/,/g, ''))
  if (Number.isNaN(n) || n < 0) return null
  return Math.floor(n)
}
