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
 * Excel `category` = your catalog product type (playera, gorra, …).
 * Stored in DB as shop filter `ProductCategory` (merch, hardware, …).
 * All apparel / lifestyle SKUs below → merch (Ropa en /skateshop).
 */
const MERCH_PRODUCT_TYPES = [
  'playera',
  'playeras',
  'camiseta',
  'camisetas',
  'tshirt',
  'gorra',
  'gorras',
  'cap',
  'caps',
  'beanie',
  'beanies',
  'calcetines',
  'calcetin',
  'socks',
  'cartera',
  'carteras',
  'wallet',
  'cinturon',
  'cinturones',
  'belt',
  'pantalon',
  'pantalones',
  'pants',
  'short',
  'shorts',
  'lentes sol',
  'lentes',
  'sunglasses',
  'marcador',
  'marcadores',
  'sticker',
  'stickers',
  'ropa',
  'clothing',
  'sudadera',
  'sudaderas',
  'hoodie',
  'hoodies',
  'chamarra',
  'chamarras',
  'mochila',
  'mochilas',
  'bag',
  'bags',
] as const

const IMPORT_CATEGORY_MAP: Record<string, ProductCategory> = {
  tablas: 'tablas',
  tabla: 'tablas',
  deck: 'tablas',
  decks: 'tablas',
  longboard: 'tablas',
  longboards: 'tablas',
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
  guantes: 'protecciones',
  guante: 'protecciones',
  gloves: 'protecciones',
  glove: 'protecciones',
  cascos: 'cascos',
  casco: 'cascos',
  helmet: 'cascos',
  helmets: 'cascos',
  merch: 'merch',
  merchandise: 'merch',
  merh: 'merch',
  sudadera: 'merch',
  sudaderas: 'merch',
  hoodie: 'merch',
  hoodies: 'merch',
  chamarra: 'merch',
  chamarras: 'merch',
  mochila: 'merch',
  mochilas: 'merch',
  bag: 'merch',
  bags: 'merch',
  tenis: 'merch',
  zapatos: 'merch',
  zapatillas: 'merch',
  shoes: 'merch',
  sneakers: 'merch',
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

for (const key of MERCH_PRODUCT_TYPES) {
  if (!(key in IMPORT_CATEGORY_MAP)) {
    IMPORT_CATEGORY_MAP[key] = 'merch'
  }
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

/** MXN price from Excel (empty / consultar → null). Accepts $, MXN, 1.200, 1,200, no decimals. */
export function parsePriceMxnField(raw: string): number | null {
  let s = raw
    .replace(/\u00a0|\u202f/g, ' ')
    .trim()
  if (!s) return null
  const lower = s.toLowerCase().replace(/\s+/g, ' ')
  if (['n/a', 'na', 'consultar', 'cotizar', '-', '—', 'tbd'].includes(lower)) {
    return null
  }

  s = s.replace(/\bmxn\b/gi, '').replace(/\bpesos?\b/gi, '')
  s = s.replace(/[$₡€£¥]/g, '').replace(/\s/g, '')

  // Mexico: 1.200 or 12.345.678 (dot = thousands)
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '')
  } else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',') && s.includes('.')) {
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
  } else if (/^\d+\.\d{3}$/.test(s)) {
    // e.g. 1.200 mis-read as decimal — treat as thousands when 3 digits after dot
    const asThousands = s.replace('.', '')
    const nThousands = Number(asThousands)
    if (!Number.isNaN(nThousands) && nThousands >= 100) {
      return nThousands
    }
  }

  const n = Number(s)
  if (Number.isNaN(n) || n < 0) return null
  return Math.round(n * 100) / 100
}

export function parseStockQuantityField(raw: string): number | null {
  const s = raw.trim()
  if (!s) return 0
  const lower = s.toLowerCase()
  if (['n/a', 'na', '-', '—', 'unitalla', 'unitalla.', 'varios', 'vario'].includes(lower)) {
    return 0
  }
  let num = s.replace(/,/g, '.')
  const n = Number.parseFloat(num)
  if (Number.isNaN(n) || n < 0) return null
  return Math.floor(n)
}
