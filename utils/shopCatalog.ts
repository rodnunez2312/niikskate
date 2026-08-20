import type { Product, ProductCategory } from '~/types'
import { CATEGORY_LABELS } from '~/types'

export type ShopGroupId = 'skate_equip' | 'security_equip' | 'clothing' | 'accessories'

export type ShopIcon = 'skate' | 'helmet' | 'shirt' | 'hat'

export type ShopGroup = {
  id: ShopGroupId
  /** Short tile label (ALL CAPS in UI) */
  label: { en: string; es: string }
  title: { en: string; es: string }
  icon: ShopIcon
  dbCategories: ProductCategory[]
  defaultCategory: ProductCategory
}

export const SHOP_GROUPS: ShopGroup[] = [
  {
    id: 'skate_equip',
    label: { en: 'Skate', es: 'Skate' },
    title: { en: 'Skate equip', es: 'Equipo de skate' },
    icon: 'skate',
    dbCategories: ['tablas', 'llantas', 'lijas', 'ramps'],
    defaultCategory: 'tablas',
  },
  {
    id: 'security_equip',
    label: { en: 'Protective', es: 'Seguridad' },
    title: { en: 'Security equip', es: 'Equipo de seguridad' },
    icon: 'helmet',
    dbCategories: ['protecciones', 'cascos'],
    defaultCategory: 'cascos',
  },
  {
    id: 'clothing',
    label: { en: 'Clothing', es: 'Ropa' },
    title: { en: 'Clothing', es: 'Ropa' },
    icon: 'shirt',
    dbCategories: ['merch'],
    defaultCategory: 'merch',
  },
  {
    id: 'accessories',
    label: { en: 'Accessories', es: 'Accesorios' },
    title: { en: 'Accessories', es: 'Accesorios' },
    icon: 'hat',
    dbCategories: ['hardware'],
    defaultCategory: 'hardware',
  },
]

export function groupForProductCategory(category: string): ShopGroup | undefined {
  return SHOP_GROUPS.find(g => g.dbCategories.includes(category as ProductCategory))
}

/** Skate → security → clothing → accessories; unknown categories last. */
export function shopGroupOrderIndex(category: string): number {
  const id = groupForProductCategory(category)?.id
  const index = SHOP_GROUPS.findIndex(g => g.id === id)
  return index < 0 ? SHOP_GROUPS.length : index
}

export function compareShopProducts(
  a: { name?: string | null; category?: string | null; is_featured?: boolean | null },
  b: { name?: string | null; category?: string | null; is_featured?: boolean | null },
): number {
  const featuredDiff = Number(Boolean(b.is_featured)) - Number(Boolean(a.is_featured))
  if (featuredDiff !== 0) return featuredDiff
  const groupDiff = shopGroupOrderIndex(a.category || '') - shopGroupOrderIndex(b.category || '')
  if (groupDiff !== 0) return groupDiff
  return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
}

export function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
}

type SearchableProduct = Pick<Product, 'name' | 'category'> &
  Partial<Pick<Product, 'brand' | 'size' | 'sku' | 'description' | 'proveedor' | 'comentarios'>>

export function productSearchHaystack(product: SearchableProduct): string {
  const group = groupForProductCategory(product.category)
  const cat = CATEGORY_LABELS[product.category as ProductCategory]
  return [
    product.name,
    product.brand,
    product.size,
    product.sku,
    product.description,
    product.proveedor,
    product.comentarios,
    group?.label.en,
    group?.label.es,
    group?.title.en,
    group?.title.es,
    cat?.name,
    cat?.name_es,
  ]
    .filter(Boolean)
    .join(' ')
}

export function productMatchesSearch(product: SearchableProduct, rawQuery: string) {
  const tokens = normalizeSearchText(rawQuery)
    .split(/\s+/)
    .filter(Boolean)
  if (!tokens.length) return true

  const hay = normalizeSearchText(productSearchHaystack(product))
  const nameHay = normalizeSearchText(product.name || '')

  return tokens.every(token =>
    hay.includes(token)
    || nameHay.split(/\s+/).some(word => word.includes(token)),
  )
}

/** Public HTTPS URLs only — blob: previews from failed uploads must not reach the storefront */
export function productImageUrl(product: { images?: string[] | null }): string | null {
  const url = product.images?.find(
    img => typeof img === 'string' && /^https?:\/\//i.test(img.trim()),
  )
  return url?.trim() || null
}
