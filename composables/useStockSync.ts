/**
 * Client-side Stock sync from Excel file.
 * Parses the pre-converted JSON and upserts products to Supabase.
 */

const STOCK_DATA_URL = '/data/niik-stock.json'

export interface StockProduct {
  name: string
  description: string
  brand: string
  sku: string
  price: number
  stock_quantity: number
  category: string
  tipo?: string
  source_sheet?: string
}

export interface StockDataJson {
  source: string
  parsed_at: string
  total_products: number
  products: StockProduct[]
}

export interface StockSyncResult {
  ok: boolean
  inserted: number
  updated: number
  total: number
  message?: string
  categories?: Record<string, number>
}

export function useStockSync() {
  const client = useSupabaseClient()
  const syncing = ref(false)

  const syncStock = async (): Promise<StockSyncResult> => {
    syncing.value = true
    const result: StockSyncResult = { ok: false, inserted: 0, updated: 0, total: 0 }
    
    try {
      // Fetch the pre-parsed stock data
      const res = await $fetch<StockDataJson>(STOCK_DATA_URL)
      const products = res?.products || []
      result.total = products.length
      
      if (products.length === 0) {
        result.ok = true
        result.message = 'No products found in stock file'
        return result
      }

      // Get existing products by SKU or name
      const { data: existing } = await client
        .from('products')
        .select('id, sku, name')
      
      const bySku = new Map<string, string>()
      const byName = new Map<string, string>()
      
      for (const p of existing || []) {
        if (p.sku) bySku.set(p.sku.toLowerCase().trim(), p.id)
        if (p.name) byName.set(p.name.toLowerCase().trim(), p.id)
      }

      // Track categories
      const categories: Record<string, number> = {}

      for (const product of products) {
        // Try to find existing product by SKU or name
        const skuKey = product.sku?.toLowerCase().trim()
        const nameKey = product.name?.toLowerCase().trim()
        const existingId = bySku.get(skuKey) ?? byName.get(nameKey)

        const row = {
          sku: product.sku || `NIIK-${Date.now()}-${Math.random().toString(36).substring(7)}`,
          name: product.name || 'Unknown Product',
          description: product.description || '',
          brand: product.brand || null,
          category: product.category || 'hardware',
          price: product.price || 0,
          stock_quantity: product.stock_quantity || 0,
          is_active: product.stock_quantity > 0,
          is_featured: false,
          is_service: false,
          requires_quote: false,
          images: [],
        }

        // Track category
        categories[row.category] = (categories[row.category] || 0) + 1

        if (existingId) {
          // Update existing product (price and stock)
          const { error } = await client
            .from('products')
            .update({
              price: row.price,
              stock_quantity: row.stock_quantity,
              brand: row.brand,
              is_active: row.is_active,
            })
            .eq('id', existingId)
          
          if (!error) result.updated++
        } else {
          // Insert new product
          const { error } = await client
            .from('products')
            .insert(row)
          
          if (!error) result.inserted++
        }
      }
      
      result.ok = true
      result.categories = categories
    } catch (e: any) {
      console.error('Stock sync error:', e)
      result.message = e?.data?.message || e?.message || 'Sync failed'
    } finally {
      syncing.value = false
    }
    
    return result
  }

  return { syncing, syncStock }
}
