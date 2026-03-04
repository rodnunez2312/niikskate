import type { Product, ProductCategory, ProductFilters, InventoryTransaction, InventoryTransactionType } from '~/types'

export const useProducts = () => {
  const client = useSupabaseClient()
  
  const products = ref<Product[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Fetch products with optional filters
  const fetchProducts = async (filters?: ProductFilters) => {
    loading.value = true
    error.value = null
    
    try {
      let query = client
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('category')
        .order('name')
      
      if (filters?.category) {
        query = query.eq('category', filters.category)
      }
      if (filters?.brand) {
        query = query.eq('brand', filters.brand)
      }
      if (filters?.price_min !== undefined) {
        query = query.gte('price', filters.price_min)
      }
      if (filters?.price_max !== undefined) {
        query = query.lte('price', filters.price_max)
      }
      if (filters?.in_stock) {
        query = query.gt('stock_quantity', 0)
      }
      if (filters?.is_featured) {
        query = query.eq('is_featured', true)
      }
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%,brand.ilike.%${filters.search}%`)
      }

      const { data, error: fetchError } = await query
      
      if (fetchError) throw fetchError
      products.value = data as Product[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch products'
      console.error('Error fetching products:', e)
    } finally {
      loading.value = false
    }
  }

  // Fetch single product by ID
  const fetchProductById = async (id: string) => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: fetchError } = await client
        .from('products')
        .select('*')
        .eq('id', id)
        .single()
      
      if (fetchError) throw fetchError
      return data as Product
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch product'
      console.error('Error fetching product:', e)
      return null
    } finally {
      loading.value = false
    }
  }

  // Fetch featured products
  const fetchFeaturedProducts = async (limit = 6) => {
    try {
      const { data, error: fetchError } = await client
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(limit)
      
      if (fetchError) throw fetchError
      return data as Product[]
    } catch (e) {
      console.error('Error fetching featured products:', e)
      return []
    }
  }

  // Get products by category
  const fetchByCategory = async (category: ProductCategory) => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: fetchError } = await client
        .from('products')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .order('name')
      
      if (fetchError) throw fetchError
      return data as Product[]
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch products'
      console.error('Error fetching products by category:', e)
      return []
    } finally {
      loading.value = false
    }
  }

  // Get low stock products (for admin)
  const fetchLowStockProducts = async () => {
    try {
      const { data, error: fetchError } = await client
        .from('products')
        .select('*')
        .eq('is_active', true)
        .eq('is_service', false)
        .filter('stock_quantity', 'lte', 'min_stock_level')
        .order('stock_quantity')
      
      if (fetchError) throw fetchError
      return data as Product[]
    } catch (e) {
      console.error('Error fetching low stock products:', e)
      return []
    }
  }

  // Create a new product (admin)
  const createProduct = async (product: Omit<Product, 'id' | 'created_at' | 'updated_at'>) => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: insertError } = await client
        .from('products')
        .insert(product)
        .select()
        .single()
      
      if (insertError) throw insertError
      return { success: true, data: data as Product }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to create product'
      error.value = errorMsg
      return { success: false, error: errorMsg }
    } finally {
      loading.value = false
    }
  }

  // Update a product (admin)
  const updateProduct = async (id: string, updates: Partial<Product>) => {
    loading.value = true
    error.value = null
    
    try {
      const { data, error: updateError } = await client
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (updateError) throw updateError
      return { success: true, data: data as Product }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to update product'
      error.value = errorMsg
      return { success: false, error: errorMsg }
    } finally {
      loading.value = false
    }
  }

  // Adjust inventory (admin)
  const adjustInventory = async (
    productId: string,
    quantity: number, // positive to add, negative to remove
    transactionType: InventoryTransactionType,
    notes?: string
  ) => {
    loading.value = true
    error.value = null
    
    try {
      // Create inventory transaction
      const { error: transactionError } = await client
        .from('inventory_transactions')
        .insert({
          product_id: productId,
          transaction_type: transactionType,
          quantity,
          notes,
        })
      
      if (transactionError) throw transactionError
      
      // Update product stock (the trigger doesn't handle non-sale transactions)
      if (transactionType !== 'sale') {
        const { error: updateError } = await client
          .from('products')
          .update({
            stock_quantity: client.rpc('', {}) // We need to use raw SQL or get current value
          })
          .eq('id', productId)
        
        // Actually, let's just fetch and update
        const { data: product } = await client
          .from('products')
          .select('stock_quantity')
          .eq('id', productId)
          .single()
        
        if (product) {
          const { error: stockError } = await client
            .from('products')
            .update({ stock_quantity: product.stock_quantity + quantity })
            .eq('id', productId)
          
          if (stockError) throw stockError
        }
      }
      
      return { success: true }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Failed to adjust inventory'
      error.value = errorMsg
      return { success: false, error: errorMsg }
    } finally {
      loading.value = false
    }
  }

  // Get inventory history for a product
  const fetchInventoryHistory = async (productId: string, limit = 50) => {
    try {
      const { data, error: fetchError } = await client
        .from('inventory_transactions')
        .select(`
          *,
          performer:profiles!performed_by(id, full_name)
        `)
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(limit)
      
      if (fetchError) throw fetchError
      return data as InventoryTransaction[]
    } catch (e) {
      console.error('Error fetching inventory history:', e)
      return []
    }
  }

  // Get all brands
  const fetchBrands = async () => {
    try {
      const { data, error: fetchError } = await client
        .from('products')
        .select('brand')
        .eq('is_active', true)
        .not('brand', 'is', null)
      
      if (fetchError) throw fetchError
      
      const brands = [...new Set(data?.map(d => d.brand).filter(Boolean))]
      return brands as string[]
    } catch (e) {
      console.error('Error fetching brands:', e)
      return []
    }
  }

  return {
    products,
    loading,
    error,
    fetchProducts,
    fetchProductById,
    fetchFeaturedProducts,
    fetchByCategory,
    fetchLowStockProducts,
    createProduct,
    updateProduct,
    adjustInventory,
    fetchInventoryHistory,
    fetchBrands,
  }
}
