<script setup lang="ts">
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const client = useSupabaseClient()
const { language, formatPrice, currency } = useI18n()
const { syncing: syncingStock, syncStock } = useStockSync()

// State
const activeTab = ref<'sales' | 'catalog' | 'add' | 'sync'>('sales')
const lastSyncResult = ref<{ inserted: number; updated: number; total: number } | null>(null)
const loading = ref(true)
const products = ref<any[]>([])
const recentSales = ref<any[]>([])
const stats = ref({
  today_sales: 0,
  month_sales: 0,
  total_products: 0
})

// Category filter for catalog
const selectedCategory = ref<string>('all')

// Image upload state
const uploadingImage = ref(false)
const productImages = ref<string[]>([])
const imageInput = ref<HTMLInputElement | null>(null)

// New product form
const newProduct = ref({
  name: '',
  description: '',
  category: 'tablas',
  price: 0,
  stock_quantity: 0,
  brand: '',
  is_active: true
})

// Sale form
const saleForm = ref({
  product_id: '',
  quantity: 1,
  customer_name: '',
  payment_method: 'cash',
  notes: ''
})

const categories = [
  { id: 'tablas', name: 'Boards', name_es: 'Tablas', icon: '🛹' },
  { id: 'llantas', name: 'Wheels', name_es: 'Llantas', icon: '⚙️' },
  { id: 'hardware', name: 'Hardware', name_es: 'Hardware', icon: '🔧' },
  { id: 'lijas', name: 'Grip Tape', name_es: 'Lijas', icon: '📋' },
  { id: 'protecciones', name: 'Protection', name_es: 'Protecciones', icon: '🛡️' },
  { id: 'cascos', name: 'Helmets', name_es: 'Cascos', icon: '⛑️' },
  { id: 'merch', name: 'Merchandise', name_es: 'Merch', icon: '👕' },
  { id: 'ramps', name: 'Ramps', name_es: 'Rampas', icon: '🏗️' },
]

// Filtered products by category
const filteredProducts = computed(() => {
  if (selectedCategory.value === 'all') return products.value
  return products.value.filter(p => p.category === selectedCategory.value)
})

onMounted(async () => {
  await Promise.all([fetchProducts(), fetchSales()])
})

// Image upload handler
const handleImageUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files || input.files.length === 0) return
  
  uploadingImage.value = true
  
  try {
    for (const file of input.files) {
      // Create a unique file name
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `products/${fileName}`
      
      // Upload to Supabase Storage
      const { data, error } = await client.storage
        .from('images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        })
      
      if (error) {
        console.error('Upload error:', error)
        // Fallback: use local URL for demo
        const localUrl = URL.createObjectURL(file)
        productImages.value.push(localUrl)
      } else {
        // Get public URL
        const { data: urlData } = client.storage
          .from('images')
          .getPublicUrl(filePath)
        
        productImages.value.push(urlData.publicUrl)
      }
    }
  } catch (e) {
    console.error('Error uploading images:', e)
  } finally {
    uploadingImage.value = false
    // Reset file input
    if (imageInput.value) {
      imageInput.value.value = ''
    }
  }
}

// Remove image from list
const removeImage = (index: number) => {
  productImages.value.splice(index, 1)
}

const fetchProducts = async () => {
  loading.value = true
  try {
    const { data, count } = await client
      .from('products')
      .select('*', { count: 'exact' })
      .order('name')
    
    products.value = data || []
    stats.value.total_products = count || 0
  } catch (e) {
    console.error('Error fetching products:', e)
  } finally {
    loading.value = false
  }
}

const fetchSales = async () => {
  try {
    const { data } = await client
      .from('orders')
      .select('*')
      .eq('is_pos_sale', true)
      .order('created_at', { ascending: false })
      .limit(20)
    
    recentSales.value = data || []
    
    // Calculate stats
    const today = format(new Date(), 'yyyy-MM-dd')
    const todaySales = recentSales.value.filter(s => s.created_at?.startsWith(today))
    stats.value.today_sales = todaySales.reduce((sum, s) => sum + (s.total || 0), 0)
    stats.value.month_sales = recentSales.value.reduce((sum, s) => sum + (s.total || 0), 0)
  } catch (e) {
    console.error('Error fetching sales:', e)
  }
}

// Record a sale
const recordSale = async () => {
  if (!saleForm.value.product_id) return
  
  const product = products.value.find(p => p.id === saleForm.value.product_id)
  if (!product) return
  
  try {
    const total = product.price * saleForm.value.quantity
    
    // Create order
    const { error: orderError } = await client
      .from('orders')
      .insert({
        customer_name: saleForm.value.customer_name || 'Walk-in',
        subtotal: total,
        tax: 0,
        discount: 0,
        total,
        amount_paid: total,
        status: 'completed',
        payment_status: 'paid',
        payment_method: saleForm.value.payment_method,
        is_pos_sale: true,
        notes: saleForm.value.notes
      })
    
    if (orderError) throw orderError
    
    // Update product stock
    await client
      .from('products')
      .update({ stock_quantity: product.stock_quantity - saleForm.value.quantity })
      .eq('id', product.id)
    
    // Reset form and refresh
    saleForm.value = {
      product_id: '',
      quantity: 1,
      customer_name: '',
      payment_method: 'cash',
      notes: ''
    }
    
    await Promise.all([fetchProducts(), fetchSales()])
    activeTab.value = 'sales'
  } catch (e) {
    console.error('Error recording sale:', e)
  }
}

// Add new product
const addProduct = async () => {
  if (!newProduct.value.name || !newProduct.value.price) return
  
  try {
    const sku = `SKU-${Date.now()}`
    
    const { error } = await client
      .from('products')
      .insert({
        sku,
        ...newProduct.value,
        images: productImages.value,
        is_featured: false,
        is_service: newProduct.value.category === 'ramps',
        requires_quote: newProduct.value.category === 'ramps'
      })
    
    if (error) throw error
    
    // Reset form and refresh
    newProduct.value = {
      name: '',
      description: '',
      category: 'tablas',
      price: 0,
      stock_quantity: 0,
      brand: '',
      is_active: true
    }
    productImages.value = []
    
    await fetchProducts()
    activeTab.value = 'catalog'
  } catch (e) {
    console.error('Error adding product:', e)
  }
}

// Delete product
const deleteProduct = async (id: string) => {
  if (!confirm(language.value === 'es' ? '¿Eliminar este producto?' : 'Delete this product?')) return
  
  try {
    await client.from('products').delete().eq('id', id)
    await fetchProducts()
  } catch (e) {
    console.error('Error deleting product:', e)
  }
}

// Toggle product active status
const toggleProductStatus = async (product: any) => {
  try {
    await client
      .from('products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id)
    
    await fetchProducts()
  } catch (e) {
    console.error('Error updating product:', e)
  }
}

// Sync stock from Excel file
const handleSyncStock = async () => {
  const result = await syncStock()
  
  if (result.ok) {
    lastSyncResult.value = {
      inserted: result.inserted,
      updated: result.updated,
      total: result.total
    }
    await fetchProducts()
    
    // Show success message
    const msg = language.value === 'es' 
      ? `Stock sincronizado: ${result.inserted} nuevos, ${result.updated} actualizados de ${result.total} productos`
      : `Stock synced: ${result.inserted} new, ${result.updated} updated out of ${result.total} products`
    alert(msg)
  } else {
    alert(result.message || 'Sync failed')
  }
}

// Get selected product
const selectedProduct = computed(() => {
  return products.value.find(p => p.id === saleForm.value.product_id)
})

// Calculate sale total
const saleTotal = computed(() => {
  if (!selectedProduct.value) return 0
  return selectedProduct.value.price * saleForm.value.quantity
})
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <!-- Header -->
    <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-4 pt-safe pb-4">
      <div class="max-w-lg mx-auto pt-4">
        <h1 class="text-2xl font-bold text-white mb-2">
          {{ language === 'es' ? 'Tienda' : 'Store' }}
        </h1>
        
        <!-- Quick Stats -->
        <div class="grid grid-cols-3 gap-2 mb-4">
          <div class="bg-gray-800 rounded-xl p-3 text-center">
            <p class="text-lg font-bold text-gold-400">{{ formatPrice(stats.today_sales) }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Hoy' : 'Today' }}</p>
          </div>
          <div class="bg-gray-800 rounded-xl p-3 text-center">
            <p class="text-lg font-bold text-glass-green">{{ formatPrice(stats.month_sales) }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Mes' : 'Month' }}</p>
          </div>
          <div class="bg-gray-800 rounded-xl p-3 text-center">
            <p class="text-lg font-bold text-glass-blue">{{ stats.total_products }}</p>
            <p class="text-xs text-gray-400">{{ language === 'es' ? 'Productos' : 'Products' }}</p>
          </div>
        </div>
        
        <!-- Tabs -->
        <div class="flex gap-2">
          <button
            @click="activeTab = 'sales'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'sales' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Ventas' : 'Sales' }}
          </button>
          <button
            @click="activeTab = 'catalog'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'catalog' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? 'Catálogo' : 'Catalog' }}
          </button>
          <button
            @click="activeTab = 'add'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'add' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
          >
            {{ language === 'es' ? '+ Nuevo' : '+ New' }}
          </button>
          <button
            @click="activeTab = 'sync'"
            class="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all"
            :class="activeTab === 'sync' ? 'bg-glass-green text-black' : 'bg-gray-800 text-gray-400'"
          >
            🔄 Sync
          </button>
        </div>
      </div>
    </header>

    <div class="px-4 max-w-lg mx-auto py-4">
      <!-- Sales Tab -->
      <div v-if="activeTab === 'sales'">
        <!-- Quick Sale Form -->
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
          <h2 class="font-bold text-white mb-3">
            {{ language === 'es' ? 'Nueva Venta' : 'New Sale' }}
          </h2>
          
          <div class="space-y-3">
            <!-- Product Select -->
            <div>
              <label class="block text-sm text-gray-400 mb-1">
                {{ language === 'es' ? 'Producto' : 'Product' }}
              </label>
              <select
                v-model="saleForm.product_id"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
              >
                <option value="">{{ language === 'es' ? 'Seleccionar...' : 'Select...' }}</option>
                <option v-for="product in products.filter(p => p.is_active && p.stock_quantity > 0)" :key="product.id" :value="product.id">
                  {{ product.name }} - {{ formatPrice(product.price) }} ({{ product.stock_quantity }} {{ language === 'es' ? 'disponibles' : 'available' }})
                </option>
              </select>
            </div>
            
            <!-- Quantity -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm text-gray-400 mb-1">
                  {{ language === 'es' ? 'Cantidad' : 'Quantity' }}
                </label>
                <input
                  v-model.number="saleForm.quantity"
                  type="number"
                  min="1"
                  :max="selectedProduct?.stock_quantity || 1"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
                />
              </div>
              <div>
                <label class="block text-sm text-gray-400 mb-1">
                  {{ language === 'es' ? 'Método de Pago' : 'Payment Method' }}
                </label>
                <select
                  v-model="saleForm.payment_method"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
                >
                  <option value="cash">{{ language === 'es' ? 'Efectivo' : 'Cash' }}</option>
                  <option value="card">{{ language === 'es' ? 'Tarjeta' : 'Card' }}</option>
                  <option value="transfer">{{ language === 'es' ? 'Transferencia' : 'Transfer' }}</option>
                </select>
              </div>
            </div>
            
            <!-- Customer Name -->
            <div>
              <label class="block text-sm text-gray-400 mb-1">
                {{ language === 'es' ? 'Cliente (opcional)' : 'Customer (optional)' }}
              </label>
              <input
                v-model="saleForm.customer_name"
                type="text"
                :placeholder="language === 'es' ? 'Nombre del cliente' : 'Customer name'"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
              />
            </div>
            
            <!-- Total & Submit -->
            <div class="flex items-center justify-between pt-3 border-t border-gray-800">
              <div>
                <p class="text-sm text-gray-400">Total</p>
                <p class="text-2xl font-bold text-gold-400">{{ formatPrice(saleTotal) }}</p>
              </div>
              <button
                @click="recordSale"
                :disabled="!saleForm.product_id"
                class="px-6 py-3 bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold rounded-xl disabled:opacity-50"
              >
                {{ language === 'es' ? 'Registrar Venta' : 'Record Sale' }}
              </button>
            </div>
          </div>
        </div>
        
        <!-- Recent Sales -->
        <h2 class="font-bold text-white mb-3">
          {{ language === 'es' ? 'Ventas Recientes' : 'Recent Sales' }}
        </h2>
        
        <div v-if="recentSales.length === 0" class="text-center py-8">
          <p class="text-gray-500">{{ language === 'es' ? 'No hay ventas registradas' : 'No sales recorded' }}</p>
        </div>
        
        <div v-else class="space-y-2">
          <div
            v-for="sale in recentSales"
            :key="sale.id"
            class="bg-gray-900 border border-gray-800 rounded-xl p-4"
          >
            <div class="flex items-center justify-between">
              <div>
                <p class="font-semibold text-white">{{ sale.customer_name || 'Walk-in' }}</p>
                <p class="text-sm text-gray-400">
                  {{ format(new Date(sale.created_at), 'dd MMM HH:mm', { locale: language === 'es' ? es : undefined }) }}
                </p>
              </div>
              <div class="text-right">
                <p class="font-bold text-gold-400">{{ formatPrice(sale.total) }}</p>
                <p class="text-xs text-gray-500">{{ sale.payment_method }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Catalog Tab -->
      <div v-else-if="activeTab === 'catalog'">
        <!-- Category Filter -->
        <div class="mb-4 overflow-x-auto pb-2 -mx-4 px-4">
          <div class="flex gap-2 min-w-max">
            <button
              @click="selectedCategory = 'all'"
              class="px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all"
              :class="selectedCategory === 'all' ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
            >
              {{ language === 'es' ? 'Todos' : 'All' }}
            </button>
            <button
              v-for="cat in categories"
              :key="cat.id"
              @click="selectedCategory = cat.id"
              class="px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all flex items-center gap-1"
              :class="selectedCategory === cat.id ? 'bg-gold-400 text-black' : 'bg-gray-800 text-gray-400'"
            >
              <span>{{ cat.icon }}</span>
              <span>{{ language === 'es' ? cat.name_es : cat.name }}</span>
            </button>
          </div>
        </div>

        <div v-if="loading" class="py-8 text-center">
          <div class="animate-spin w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full mx-auto"></div>
        </div>
        
        <div v-else-if="filteredProducts.length === 0" class="text-center py-8">
          <p class="text-4xl mb-2">📦</p>
          <p class="text-gray-500">{{ language === 'es' ? 'No hay productos en esta categoría' : 'No products in this category' }}</p>
        </div>
        
        <div v-else class="space-y-2">
          <div
            v-for="product in filteredProducts"
            :key="product.id"
            class="bg-gray-900 border border-gray-800 rounded-xl p-4"
          >
            <div class="flex items-start gap-4">
              <!-- Product Image or Icon -->
              <div class="w-16 h-16 rounded-xl bg-gray-800 flex items-center justify-center overflow-hidden flex-shrink-0">
                <img 
                  v-if="product.images && product.images.length > 0" 
                  :src="product.images[0]" 
                  :alt="product.name"
                  class="w-full h-full object-cover"
                />
                <span v-else class="text-2xl">{{ categories.find(c => c.id === product.category)?.icon || '📦' }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0">
                    <h3 class="font-bold text-white truncate">{{ product.name }}</h3>
                    <p class="text-xs text-gray-500">{{ categories.find(c => c.id === product.category)?.icon }} {{ language === 'es' ? categories.find(c => c.id === product.category)?.name_es : categories.find(c => c.id === product.category)?.name }}</p>
                    <p v-if="product.brand" class="text-xs text-gray-400">{{ product.brand }}</p>
                  </div>
                  <span 
                    class="px-2 py-1 rounded text-xs font-bold flex-shrink-0"
                    :class="product.is_active ? 'bg-glass-green/20 text-glass-green' : 'bg-gray-700 text-gray-400'"
                  >
                    {{ product.is_active ? (language === 'es' ? 'Activo' : 'Active') : (language === 'es' ? 'Inactivo' : 'Inactive') }}
                  </span>
                </div>
                <div class="flex items-center justify-between mt-2">
                  <div class="flex items-center gap-4">
                    <p class="font-bold text-gold-400">{{ formatPrice(product.price) }}</p>
                    <p class="text-sm text-gray-500">
                      Stock: <span :class="product.stock_quantity > 0 ? 'text-glass-green' : 'text-flame-600'">{{ product.stock_quantity }}</span>
                    </p>
                  </div>
                  <div class="flex gap-2">
                    <button
                      @click="toggleProductStatus(product)"
                      class="p-2 bg-gray-800 rounded-lg text-gray-400 hover:text-white"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                    <button
                      @click="deleteProduct(product.id)"
                      class="p-2 bg-gray-800 rounded-lg text-flame-500 hover:bg-flame-500/20"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sync Stock Tab -->
      <div v-else-if="activeTab === 'sync'">
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 class="font-bold text-white mb-4 flex items-center gap-2">
            🔄 {{ language === 'es' ? 'Sincronizar Stock' : 'Sync Stock' }}
          </h2>
          
          <div class="space-y-4">
            <!-- Info -->
            <div class="bg-gray-800 rounded-xl p-4">
              <p class="text-gray-300 text-sm mb-3">
                {{ language === 'es' 
                  ? 'Sincroniza el inventario desde el archivo Excel de stock. Esto actualizará los precios y cantidades de todos los productos.' 
                  : 'Sync inventory from the stock Excel file. This will update prices and quantities for all products.'
                }}
              </p>
              
              <div class="flex items-center gap-3 text-sm text-gray-400">
                <span class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-glass-green"></span>
                  {{ language === 'es' ? 'Productos existentes se actualizan' : 'Existing products are updated' }}
                </span>
              </div>
              <div class="flex items-center gap-3 text-sm text-gray-400 mt-1">
                <span class="flex items-center gap-1">
                  <span class="w-2 h-2 rounded-full bg-gold-400"></span>
                  {{ language === 'es' ? 'Productos nuevos se agregan' : 'New products are added' }}
                </span>
              </div>
            </div>
            
            <!-- Source file info -->
            <div class="bg-gray-800/50 rounded-xl p-3 border border-gray-700">
              <p class="text-xs text-gray-500 mb-1">{{ language === 'es' ? 'Archivo fuente' : 'Source file' }}</p>
              <p class="text-sm text-white font-mono">Stock NiikSkateshop Deshuesaderosk8.xlsx</p>
              <p class="text-xs text-gray-500 mt-1">📁 data/Niik_source/</p>
            </div>
            
            <!-- Last sync result -->
            <div v-if="lastSyncResult" class="bg-glass-green/10 border border-glass-green/30 rounded-xl p-3">
              <p class="text-glass-green text-sm font-semibold mb-2">
                {{ language === 'es' ? 'Última sincronización' : 'Last sync' }}
              </p>
              <div class="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p class="text-lg font-bold text-gold-400">{{ lastSyncResult.inserted }}</p>
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Nuevos' : 'New' }}</p>
                </div>
                <div>
                  <p class="text-lg font-bold text-glass-green">{{ lastSyncResult.updated }}</p>
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Actualizados' : 'Updated' }}</p>
                </div>
                <div>
                  <p class="text-lg font-bold text-white">{{ lastSyncResult.total }}</p>
                  <p class="text-xs text-gray-400">{{ language === 'es' ? 'Total' : 'Total' }}</p>
                </div>
              </div>
            </div>
            
            <!-- Sync button -->
            <button
              @click="handleSyncStock"
              :disabled="syncingStock"
              class="w-full py-4 bg-gradient-to-r from-glass-green to-emerald-500 text-black font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <div v-if="syncingStock" class="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
              <span v-if="syncingStock">{{ language === 'es' ? 'Sincronizando...' : 'Syncing...' }}</span>
              <span v-else>🔄 {{ language === 'es' ? 'Sincronizar Ahora' : 'Sync Now' }}</span>
            </button>
            
            <!-- Instructions -->
            <div class="border-t border-gray-800 pt-4">
              <h3 class="font-semibold text-white text-sm mb-2">
                {{ language === 'es' ? 'Instrucciones para actualizar' : 'Update instructions' }}
              </h3>
              <ol class="text-xs text-gray-400 space-y-2 list-decimal list-inside">
                <li>{{ language === 'es' 
                  ? 'Actualiza el archivo Excel "Stock NiikSkateshop Deshuesaderosk8.xlsx" en la carpeta data/Niik_source/' 
                  : 'Update the Excel file "Stock NiikSkateshop Deshuesaderosk8.xlsx" in data/Niik_source/ folder'
                }}</li>
                <li>{{ language === 'es' 
                  ? 'Ejecuta en terminal: node scripts/parse-stock.cjs' 
                  : 'Run in terminal: node scripts/parse-stock.cjs'
                }}</li>
                <li>{{ language === 'es' 
                  ? 'Presiona el botón "Sincronizar Ahora" arriba' 
                  : 'Press the "Sync Now" button above'
                }}</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <!-- Add Product Tab -->
      <div v-else-if="activeTab === 'add'">
        <div class="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 class="font-bold text-white mb-4">
            {{ language === 'es' ? 'Agregar Producto' : 'Add Product' }}
          </h2>
          
          <div class="space-y-4">
            <!-- Image Upload Section -->
            <div>
              <label class="block text-sm text-gray-400 mb-2">
                {{ language === 'es' ? 'Imágenes del Producto' : 'Product Images' }}
              </label>
              
              <!-- Image Preview Grid -->
              <div v-if="productImages.length > 0" class="grid grid-cols-3 gap-2 mb-3">
                <div 
                  v-for="(img, idx) in productImages" 
                  :key="idx"
                  class="relative aspect-square rounded-xl overflow-hidden bg-gray-800"
                >
                  <img :src="img" class="w-full h-full object-cover" />
                  <button
                    @click="removeImage(idx)"
                    class="absolute top-1 right-1 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center text-white hover:bg-flame-500"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <!-- Upload Button -->
              <label class="block">
                <div 
                  class="border-2 border-dashed border-gray-700 rounded-xl p-4 text-center cursor-pointer hover:border-gold-400 transition-colors"
                  :class="{ 'opacity-50': uploadingImage }"
                >
                  <input
                    ref="imageInput"
                    type="file"
                    accept="image/*"
                    multiple
                    class="hidden"
                    @change="handleImageUpload"
                    :disabled="uploadingImage"
                  />
                  <div v-if="uploadingImage" class="flex items-center justify-center gap-2">
                    <div class="w-5 h-5 border-2 border-gold-400 border-t-transparent rounded-full animate-spin"></div>
                    <span class="text-gray-400">{{ language === 'es' ? 'Subiendo...' : 'Uploading...' }}</span>
                  </div>
                  <div v-else class="flex flex-col items-center gap-2">
                    <svg class="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span class="text-gray-400 text-sm">
                      {{ language === 'es' ? 'Toca para agregar fotos' : 'Tap to add photos' }}
                    </span>
                  </div>
                </div>
              </label>
            </div>
            
            <div>
              <label class="block text-sm text-gray-400 mb-1">
                {{ language === 'es' ? 'Nombre' : 'Name' }} *
              </label>
              <input
                v-model="newProduct.name"
                type="text"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
              />
            </div>
            
            <div>
              <label class="block text-sm text-gray-400 mb-1">
                {{ language === 'es' ? 'Marca' : 'Brand' }}
              </label>
              <input
                v-model="newProduct.brand"
                type="text"
                :placeholder="language === 'es' ? 'Ej: Santa Cruz, Spitfire...' : 'E.g: Santa Cruz, Spitfire...'"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500"
              />
            </div>
            
            <div>
              <label class="block text-sm text-gray-400 mb-1">
                {{ language === 'es' ? 'Descripción' : 'Description' }}
              </label>
              <textarea
                v-model="newProduct.description"
                rows="2"
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
              ></textarea>
            </div>
            
            <div>
              <label class="block text-sm text-gray-400 mb-2">
                {{ language === 'es' ? 'Categoría' : 'Category' }}
              </label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="cat in categories"
                  :key="cat.id"
                  @click="newProduct.category = cat.id"
                  class="flex items-center gap-2 px-3 py-3 rounded-xl border transition-all text-left"
                  :class="newProduct.category === cat.id 
                    ? 'bg-gold-400/20 border-gold-400 text-gold-400' 
                    : 'bg-gray-800 border-gray-700 text-gray-400'"
                >
                  <span class="text-lg">{{ cat.icon }}</span>
                  <span class="text-sm font-medium">{{ language === 'es' ? cat.name_es : cat.name }}</span>
                </button>
              </div>
            </div>
            
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm text-gray-400 mb-1">
                  {{ language === 'es' ? 'Precio (MXN)' : 'Price (MXN)' }} *
                </label>
                <input
                  v-model.number="newProduct.price"
                  type="number"
                  min="0"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
                />
              </div>
              <div>
                <label class="block text-sm text-gray-400 mb-1">
                  {{ language === 'es' ? 'Stock Inicial' : 'Initial Stock' }}
                </label>
                <input
                  v-model.number="newProduct.stock_quantity"
                  type="number"
                  min="0"
                  class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white"
                />
              </div>
            </div>
            
            <button
              @click="addProduct"
              :disabled="!newProduct.name || !newProduct.price"
              class="w-full py-4 bg-gradient-to-r from-gold-400 to-gold-500 text-black font-bold rounded-xl disabled:opacity-50"
            >
              {{ language === 'es' ? 'Agregar Producto' : 'Add Product' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
