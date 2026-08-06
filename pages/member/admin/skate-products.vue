<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'member'],
  layout: 'member',
})

import type { ProductCategory } from '~/types'
import {
  parseShopProductCsv,
  mergeShopProductForUpsert,
  validateRowsForImport,
  productsToCsv,
  SHOP_PRODUCT_CSV_COLUMNS,
} from '~/utils/shopProductBulk'

type ShopGroupId = 'skate_equip' | 'security_equip' | 'clothing' | 'accessories'

const client = useSupabaseClient()
const user = useSupabaseUser()
const router = useRouter()
const { language, formatPrice } = useI18n()
const es = computed(() => language.value === 'es')

const loading = ref(true)
const saving = ref(false)
const products = ref<any[]>([])
const searchQuery = ref('')
const filterGroup = ref<ShopGroupId | 'all'>('all')
const panelOpen = ref(false)
const editingId = ref<string | null>(null)
const formError = ref<string | null>(null)
const uploadingImage = ref(false)
const productImages = ref<string[]>([])
const imageInput = ref<HTMLInputElement | null>(null)
const brandLogos = ref<Record<string, string>>({})
const uploadingBrand = ref<string | null>(null)
const brandFileInput = ref<HTMLInputElement | null>(null)
const brandUploadTarget = ref<string | null>(null)
const bulkImporting = ref(false)
const bulkPreview = ref<ReturnType<typeof parseShopProductCsv> | null>(null)
const bulkImportErrors = ref<string[]>([])
const bulkMessage = ref<string | null>(null)
const bulkFileInput = ref<HTMLInputElement | null>(null)
const clearingCatalog = ref(false)

const shopGroups: Array<{
  id: ShopGroupId
  label: { en: string; es: string }
  dbCategories: ProductCategory[]
  defaultCategory: ProductCategory
}> = [
  {
    id: 'skate_equip',
    label: { en: 'Skate equip', es: 'Equipo de skate' },
    dbCategories: ['tablas', 'llantas', 'lijas', 'ramps'],
    defaultCategory: 'tablas',
  },
  {
    id: 'security_equip',
    label: { en: 'Security equip', es: 'Equipo de seguridad' },
    dbCategories: ['protecciones', 'cascos'],
    defaultCategory: 'cascos',
  },
  {
    id: 'clothing',
    label: { en: 'Clothing', es: 'Ropa' },
    dbCategories: ['merch'],
    defaultCategory: 'merch',
  },
  {
    id: 'accessories',
    label: { en: 'Accessories', es: 'Accesorios' },
    dbCategories: ['hardware'],
    defaultCategory: 'hardware',
  },
]

const dbCategoryOptions: Array<{ id: ProductCategory; name: { en: string; es: string }; group: ShopGroupId }> = [
  { id: 'tablas', name: { en: 'Boards', es: 'Tablas' }, group: 'skate_equip' },
  { id: 'llantas', name: { en: 'Wheels', es: 'Llantas' }, group: 'skate_equip' },
  { id: 'lijas', name: { en: 'Grip tape', es: 'Lijas' }, group: 'skate_equip' },
  { id: 'ramps', name: { en: 'Ramps', es: 'Rampas' }, group: 'skate_equip' },
  { id: 'cascos', name: { en: 'Helmets', es: 'Cascos' }, group: 'security_equip' },
  { id: 'protecciones', name: { en: 'Pads', es: 'Protecciones' }, group: 'security_equip' },
  { id: 'merch', name: { en: 'Merch / clothing', es: 'Merch / ropa' }, group: 'clothing' },
  { id: 'hardware', name: { en: 'Hardware / accessories', es: 'Hardware / accesorios' }, group: 'accessories' },
]

const emptyForm = () => ({
  sku: '',
  name: '',
  description: '',
  brand: '',
  size: '',
  category: 'tablas' as ProductCategory,
  price: 0,
  stock_quantity: 0,
  is_active: true,
  is_featured: false,
})

const form = ref(emptyForm())

onMounted(async () => {
  if (!user.value) {
    router.push('/auth/login?redirect=/member/admin/skate-products')
    return
  }
  const { data } = await client.from('profiles').select('role').eq('id', user.value.id).single()
  if (data?.role !== 'admin') {
    router.push('/member')
    return
  }
  await Promise.all([fetchProducts(), loadBrandLogos()])
})

async function loadBrandLogos() {
  const map: Record<string, string> = {}
  try {
    const { data } = await client.from('shop_brands').select('name, logo_url')
    for (const row of data || []) {
      if (row?.name && row?.logo_url) map[row.name] = row.logo_url
    }
  } catch {
    /* table may not exist yet */
  }
  try {
    const local = JSON.parse(localStorage.getItem('niik-shop-brand-logos') || '{}')
    Object.assign(map, local)
  } catch {
    /* ignore */
  }
  brandLogos.value = map
}

function persistBrandLogosLocal() {
  localStorage.setItem('niik-shop-brand-logos', JSON.stringify(brandLogos.value))
}

const catalogBrands = computed(() => {
  const names = new Set<string>()
  for (const p of products.value) {
    const name = (p.brand || '').trim()
    if (name) names.add(name)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
})

function brandLogo(name: string) {
  if (brandLogos.value[name]) return brandLogos.value[name]
  const key = Object.keys(brandLogos.value).find(
    k => k.trim().toLowerCase() === name.trim().toLowerCase(),
  )
  return key ? brandLogos.value[key] : null
}

function triggerBrandUpload(name: string) {
  brandUploadTarget.value = name
  brandFileInput.value?.click()
}

async function handleBrandLogoUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const name = brandUploadTarget.value
  if (!file || !name) return
  uploadingBrand.value = name
  try {
    const fileExt = file.name.split('.').pop()
    const safe = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const filePath = `brands/${safe}-${Date.now()}.${fileExt}`
    let logoUrl = ''
    const { error } = await client.storage.from('images').upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    })
    if (error) {
      logoUrl = URL.createObjectURL(file)
    } else {
      const { data: urlData } = client.storage.from('images').getPublicUrl(filePath)
      logoUrl = urlData.publicUrl
    }
    brandLogos.value = { ...brandLogos.value, [name]: logoUrl }
    persistBrandLogosLocal()
    try {
      await client.from('shop_brands').upsert({
        name,
        logo_url: logoUrl,
        updated_at: new Date().toISOString(),
      })
    } catch {
      /* table may not exist — localStorage still works for this browser */
    }
  } finally {
    uploadingBrand.value = null
    brandUploadTarget.value = null
    if (brandFileInput.value) brandFileInput.value.value = ''
  }
}

async function fetchProducts() {
  loading.value = true
  try {
    const { data, error } = await client
      .from('products')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    products.value = data || []
  } catch (e) {
    console.error(e)
    products.value = []
  } finally {
    loading.value = false
  }
}

function groupForCategory(category: string) {
  return shopGroups.find(g => g.dbCategories.includes(category as ProductCategory))
}

const filteredProducts = computed(() => {
  let list = products.value
  if (filterGroup.value !== 'all') {
    const group = shopGroups.find(g => g.id === filterGroup.value)
    if (group) list = list.filter(p => group.dbCategories.includes(p.category))
  }
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(p =>
      `${p.sku} ${p.name} ${p.brand || ''} ${p.size || ''} ${p.description || ''}`.toLowerCase().includes(q),
    )
  }
  return list
})

const stats = computed(() => ({
  total: products.value.length,
  active: products.value.filter(p => p.is_active).length,
  inactive: products.value.filter(p => !p.is_active).length,
}))

function openCreate() {
  editingId.value = null
  form.value = emptyForm()
  productImages.value = []
  formError.value = null
  panelOpen.value = true
}

function openEdit(product: any) {
  editingId.value = product.id
  form.value = {
    sku: product.sku || '',
    name: product.name || '',
    description: product.description || '',
    brand: product.brand || '',
    size: product.size || '',
    category: product.category || 'tablas',
    price: Number(product.price) || 0,
    stock_quantity: Number(product.stock_quantity) || 0,
    is_active: product.is_active !== false,
    is_featured: Boolean(product.is_featured),
  }
  productImages.value = Array.isArray(product.images) ? [...product.images] : []
  formError.value = null
  panelOpen.value = true
}

function closePanel() {
  panelOpen.value = false
  editingId.value = null
  formError.value = null
}

async function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return
  uploadingImage.value = true
  formError.value = null
  try {
    for (const file of Array.from(input.files)) {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`
      const filePath = `products/${fileName}`
      const { error } = await client.storage.from('images').upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      })
      if (error) {
        console.error(error)
        formError.value = es.value
          ? `No se pudo subir la foto: ${error.message}. Revisa que exista el bucket "images" en Supabase y que tu usuario admin tenga permiso.`
          : `Photo upload failed: ${error.message}. Ensure the "images" bucket exists and admins can upload to products/.`
        continue
      }
      const { data: urlData } = client.storage.from('images').getPublicUrl(filePath)
      productImages.value.push(urlData.publicUrl)
    }
  } finally {
    uploadingImage.value = false
    if (imageInput.value) imageInput.value.value = ''
  }
}

function persistableProductImages() {
  return productImages.value.filter(url => typeof url === 'string' && /^https?:\/\//i.test(url.trim()))
}

function removeImage(index: number) {
  productImages.value.splice(index, 1)
}

async function assertSkuAvailable(sku: string, excludeId?: string | null) {
  let query = client.from('products').select('id').eq('sku', sku)
  if (excludeId) query = query.neq('id', excludeId)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  if (data) {
    throw new Error(
      es.value
        ? `El ID "${sku}" ya existe. Usa otro product_id o edita ese producto.`
        : `Product ID "${sku}" already exists. Use another product_id or edit that product.`,
    )
  }
}

async function saveProduct() {
  const sku = form.value.sku.trim()
  if (!sku || !form.value.name.trim() || !form.value.price) {
    formError.value = es.value
      ? 'ID de producto, nombre y precio son obligatorios.'
      : 'Product ID, name, and price are required.'
    return
  }
  saving.value = true
  formError.value = null
  try {
    await assertSkuAvailable(sku, editingId.value)

    let images = persistableProductImages()
    if (productImages.value.length && !images.length) {
      formError.value = es.value
        ? 'Las fotos no están en la nube. Sube de nuevo o revisa Storage en Supabase.'
        : 'Photos were not saved to cloud storage. Re-upload or check Supabase Storage.'
      saving.value = false
      return
    }

    const payload = {
      sku,
      name: form.value.name.trim(),
      description: form.value.description.trim() || '',
      brand: form.value.brand.trim() || null,
      size: form.value.size.trim() || null,
      category: form.value.category,
      price: Number(form.value.price),
      stock_quantity: Number(form.value.stock_quantity) || 0,
      is_active: form.value.is_active,
      is_featured: form.value.is_featured,
      images,
      is_service: form.value.category === 'ramps',
      requires_quote: form.value.category === 'ramps',
      updated_at: new Date().toISOString(),
    }

    if (editingId.value) {
      const { error } = await client.from('products').update(payload).eq('id', editingId.value)
      if (error) throw error
    } else {
      const { error } = await client.from('products').insert({
        ...payload,
        min_stock_level: 0,
        max_stock_level: 9999,
      })
      if (error) throw error
    }

    await fetchProducts()
    closePanel()
    bulkMessage.value = es.value ? 'Producto guardado.' : 'Product saved.'
  } catch (e: any) {
    console.error(e)
    formError.value = e?.message || (es.value ? 'No se pudo guardar.' : 'Could not save.')
  } finally {
    saving.value = false
  }
}

async function toggleActive(product: any) {
  try {
    const { error } = await client
      .from('products')
      .update({ is_active: !product.is_active, updated_at: new Date().toISOString() })
      .eq('id', product.id)
    if (error) throw error
    await fetchProducts()
  } catch (e) {
    console.error(e)
  }
}

async function deleteProduct(product: any) {
  const msg = es.value
    ? `¿Eliminar "${product.name}" del catálogo?`
    : `Delete "${product.name}" from the catalog?`
  if (!confirm(msg)) return
  try {
    const { error } = await client.from('products').delete().eq('id', product.id)
    if (error) throw error
    await fetchProducts()
  } catch (e) {
    console.error(e)
  }
}

function onShopGroupPick(groupId: ShopGroupId) {
  const group = shopGroups.find(g => g.id === groupId)
  if (!group) return
  if (!group.dbCategories.includes(form.value.category)) {
    form.value.category = group.defaultCategory
  }
}

async function onBulkFileSelected(event: Event) {
  bulkMessage.value = null
  bulkImportErrors.value = []
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const text = await file.text()
  const parsed = parseShopProductCsv(text)
  if (parsed.errors.length) {
    bulkPreview.value = parsed
    bulkImportErrors.value = parsed.errors
    if (bulkFileInput.value) bulkFileInput.value.value = ''
    return
  }
  const skus = parsed.rows.map(r => r.product_id.trim())
  const { data: existing } = await client.from('products').select('sku').in('sku', skus)
  const existingSkus = new Set((existing || []).map(r => r.sku))
  const importErrors = validateRowsForImport(parsed.rows, existingSkus)
  bulkPreview.value = parsed
  bulkImportErrors.value = importErrors
  if (bulkFileInput.value) bulkFileInput.value.value = ''
}

async function runBulkImport() {
  if (!bulkPreview.value?.rows.length || bulkImportErrors.value.length) return
  bulkImporting.value = true
  bulkMessage.value = null
  try {
    const skus = bulkPreview.value.rows.map(r => r.product_id.trim())
    const { data: existingRows, error: fetchErr } = await client.from('products').select('*').in('sku', skus)
    if (fetchErr) throw fetchErr
    const bySku = new Map((existingRows || []).map(r => [r.sku, r]))
    let created = 0
    let updated = 0
    const payloads = bulkPreview.value.rows.map(row => {
      const ex = bySku.get(row.product_id.trim()) || null
      if (ex) updated += 1
      else created += 1
      return mergeShopProductForUpsert(row, ex as any)
    })
    const { error } = await client.from('products').upsert(payloads, { onConflict: 'sku' })
    if (error) throw error
    bulkMessage.value = es.value
      ? `Listo: ${created} nuevos, ${updated} actualizados (por product_id).`
      : `Done: ${created} created, ${updated} updated (by product_id).`
    bulkPreview.value = null
    bulkImportErrors.value = []
    await fetchProducts()
  } catch (e: any) {
    bulkMessage.value = e?.message || (es.value ? 'Error en importación.' : 'Import failed.')
  } finally {
    bulkImporting.value = false
  }
}

function downloadCatalogExport() {
  const csv = productsToCsv(products.value)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `skateshop-catalog-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  bulkMessage.value = es.value
    ? 'CSV exportado. Edítalo en Excel y vuelve a importar.'
    : 'CSV exported. Edit in Excel and re-import.'
}

async function clearEntireCatalog() {
  const msg = es.value
    ? '¿Eliminar TODOS los productos del catálogo? Esto no se puede deshacer.'
    : 'Delete ALL products from the catalog? This cannot be undone.'
  if (!confirm(msg)) return
  if (!confirm(es.value ? 'Confirmar otra vez.' : 'Confirm again.')) return
  clearingCatalog.value = true
  bulkMessage.value = null
  try {
    const { error } = await client.from('products').delete().gte('price', 0)
    if (error) throw error
    bulkMessage.value = es.value ? 'Catálogo vacío.' : 'Catalog cleared.'
    await fetchProducts()
  } catch (e: any) {
    bulkMessage.value = e?.message || (es.value ? 'No se pudo vaciar.' : 'Could not clear catalog.')
  } finally {
    clearingCatalog.value = false
  }
}

const bulkColumnHelp = computed(() =>
  SHOP_PRODUCT_CSV_COLUMNS.map(c => `• ${c}`).join('\n'),
)
</script>

<template>
  <div class="min-h-screen bg-black pb-24">
    <div class="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 class="text-2xl font-black text-white">Skateshop</h1>
          <p class="text-sm text-gray-400 mt-1">
            {{
              es
                ? 'Administra el catálogo que se muestra en /skateshop'
                : 'Manage the catalog shown on /skateshop'
            }}
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <NuxtLink
            to="/skateshop"
            class="px-4 py-2 rounded-xl border border-white/15 text-sm font-bold text-gray-200 hover:border-gold-400/50"
          >
            {{ es ? 'Ver tienda' : 'View shop' }}
          </NuxtLink>
          <button
            type="button"
            class="px-4 py-2 rounded-xl bg-gold-400 text-black text-sm font-bold hover:bg-gold-300"
            @click="openCreate"
          >
            + {{ es ? 'Agregar producto' : 'Add product' }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
          <p class="text-xl font-black text-white">{{ stats.total }}</p>
          <p class="text-xs text-gray-500">{{ es ? 'Total' : 'Total' }}</p>
        </div>
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
          <p class="text-xl font-black text-glass-green">{{ stats.active }}</p>
          <p class="text-xs text-gray-500">{{ es ? 'En tienda' : 'Live' }}</p>
        </div>
        <div class="rounded-xl border border-gray-800 bg-gray-900 p-3 text-center">
          <p class="text-xl font-black text-gray-400">{{ stats.inactive }}</p>
          <p class="text-xs text-gray-500">{{ es ? 'Ocultos' : 'Hidden' }}</p>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row gap-3">
        <input
          v-model="searchQuery"
          type="search"
          class="flex-1 px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-gold-400"
          :placeholder="es ? 'Buscar producto…' : 'Search product…'"
        />
        <select
          v-model="filterGroup"
          class="px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm"
        >
          <option value="all">{{ es ? 'Todas las categorías' : 'All categories' }}</option>
          <option v-for="g in shopGroups" :key="g.id" :value="g.id">
            {{ es ? g.label.es : g.label.en }}
          </option>
        </select>
      </div>

      <!-- Bulk import -->
      <section class="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <h2 class="font-bold text-white">{{ es ? 'Importación masiva (CSV / Excel)' : 'Bulk import (CSV / Excel)' }}</h2>
        <p class="text-xs text-gray-500 whitespace-pre-line">
          {{
            es
              ? `Individual: Agregar / Editar guarda un producto. Masivo: exporta el catálogo, edita CSV en Excel, importa (mismo product_id = actualizar). Celdas vacías en filas existentes no borran ese campo (excepto descripción). Columnas:\n${bulkColumnHelp}`
              : `Individual: Add / Edit saves one product. Bulk: export catalog, edit CSV in Excel, import (same product_id = update). Blank cells on existing SKUs keep that field (description excepted). Columns:\n${bulkColumnHelp}`
          }}
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="px-4 py-2 rounded-xl border border-white/20 text-sm font-bold text-gray-200 hover:border-gold-400/50 disabled:opacity-50"
            :disabled="!products.length"
            @click="downloadCatalogExport"
          >
            {{ es ? 'Exportar catálogo CSV' : 'Export catalog CSV' }}
          </button>
          <a
            href="/templates/skateshop-products-template.csv"
            download="skateshop-products-template.csv"
            class="px-4 py-2 rounded-xl border border-gold-400/40 text-gold-400 text-sm font-bold hover:bg-gold-400/10"
          >
            {{ es ? 'Descargar plantilla CSV' : 'Download CSV template' }}
          </a>
          <label class="px-4 py-2 rounded-xl bg-gray-800 text-sm font-bold text-gray-200 cursor-pointer hover:text-white">
            {{ es ? 'Elegir archivo…' : 'Choose file…' }}
            <input
              ref="bulkFileInput"
              type="file"
              accept=".csv,text/csv"
              class="hidden"
              @change="onBulkFileSelected"
            />
          </label>
          <button
            type="button"
            class="px-4 py-2 rounded-xl bg-gold-400 text-black text-sm font-bold disabled:opacity-50"
            :disabled="bulkImporting || !bulkPreview?.rows.length || bulkImportErrors.length > 0"
            @click="runBulkImport"
          >
            {{ bulkImporting ? (es ? 'Importando…' : 'Importing…') : (es ? 'Importar filas' : 'Import rows') }}
          </button>
          <button
            type="button"
            class="px-4 py-2 rounded-xl border border-flame-500/50 text-flame-500 text-sm font-bold disabled:opacity-50"
            :disabled="clearingCatalog"
            @click="clearEntireCatalog"
          >
            {{ clearingCatalog ? '…' : (es ? 'Vaciar catálogo' : 'Clear catalog') }}
          </button>
        </div>
        <ul v-if="bulkImportErrors.length" class="text-sm text-flame-500 space-y-1">
          <li v-for="(err, i) in bulkImportErrors" :key="i">{{ err }}</li>
        </ul>
        <p v-else-if="bulkPreview?.rows.length" class="text-sm text-glass-green">
          {{ bulkPreview.rows.length }} {{ es ? 'filas listas (nuevas o actualización por product_id).' : 'rows ready (new or update by product_id).' }}
        </p>
        <p v-if="bulkMessage" class="text-sm text-gray-300">{{ bulkMessage }}</p>
      </section>

      <!-- Brand logos for Marcas filter -->
      <section class="rounded-2xl border border-gray-800 bg-gray-900 p-4 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="font-bold text-white">{{ es ? 'Marcas' : 'Brands' }}</h2>
            <p class="text-xs text-gray-500 mt-0.5">
              {{ es
                ? 'Sube el logo de cada marca para las tarjetas grandes en Skateshop.'
                : 'Upload each brand logo for the big Marcas cards on Skateshop.' }}
            </p>
          </div>
        </div>
        <input
          ref="brandFileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="handleBrandLogoUpload"
        />
        <p v-if="!catalogBrands.length" class="text-sm text-gray-500">
          {{ es
            ? 'Agrega un campo Marca a tus productos para verlas aquí.'
            : 'Add a Brand field on products to see them here.' }}
        </p>
        <div v-else class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="name in catalogBrands"
            :key="name"
            class="flex items-center gap-3 rounded-xl border border-gray-800 bg-black/40 p-3"
          >
            <div class="w-14 h-14 rounded-lg bg-gray-800 overflow-hidden shrink-0">
              <img
                v-if="brandLogo(name)"
                :src="brandLogo(name)!"
                :alt="name"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center text-[10px] text-gray-500 text-center px-1">
                {{ es ? 'Sin logo' : 'No logo' }}
              </div>
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-bold text-white text-sm truncate uppercase">{{ name }}</p>
              <button
                type="button"
                class="mt-1 text-xs font-bold text-gold-400 hover:text-gold-300 disabled:opacity-50"
                :disabled="uploadingBrand === name"
                @click="triggerBrandUpload(name)"
              >
                {{ uploadingBrand === name
                  ? (es ? 'Subiendo…' : 'Uploading…')
                  : (brandLogo(name) ? (es ? 'Cambiar logo' : 'Change logo') : (es ? 'Subir logo' : 'Upload logo')) }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div v-if="loading" class="py-16 text-center">
        <div class="w-8 h-8 border-2 border-gold-400 border-t-transparent rounded-full animate-spin mx-auto" />
      </div>

      <div v-else-if="!filteredProducts.length" class="rounded-2xl border border-gray-800 bg-gray-900 p-10 text-center">
        <p class="text-gray-400 mb-4">
          {{ es ? 'No hay productos. Agrega el primero.' : 'No products yet. Add the first one.' }}
        </p>
        <button
          type="button"
          class="px-4 py-2 rounded-xl bg-gold-400 text-black text-sm font-bold"
          @click="openCreate"
        >
          + {{ es ? 'Agregar producto' : 'Add product' }}
        </button>
      </div>

      <div v-else class="space-y-3">
        <article
          v-for="product in filteredProducts"
          :key="product.id"
          class="rounded-2xl border border-gray-800 bg-gray-900 p-4 flex gap-4"
        >
          <div class="w-20 h-20 rounded-xl bg-gray-800 overflow-hidden shrink-0">
            <img
              v-if="product.images?.[0]"
              :src="product.images[0]"
              :alt="product.name"
              class="w-full h-full object-cover"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-xs text-gray-500 px-1 text-center">
              {{ es ? 'Sin foto' : 'No photo' }}
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <h2 class="font-bold text-white truncate">{{ product.name }}</h2>
                <p class="text-xs text-gray-500 font-mono">{{ product.sku }}</p>
                <p class="text-xs text-gray-500">
                  {{ es ? groupForCategory(product.category)?.label.es : groupForCategory(product.category)?.label.en }}
                  <span v-if="product.brand"> · {{ product.brand }}</span>
                  <span v-if="product.size"> · {{ es ? 'Talla' : 'Size' }} {{ product.size }}</span>
                </p>
              </div>
              <span
                class="text-[10px] font-bold uppercase px-2 py-1 rounded shrink-0"
                :class="product.is_active ? 'bg-glass-green/20 text-glass-green' : 'bg-gray-700 text-gray-400'"
              >
                {{ product.is_active ? (es ? 'En tienda' : 'Live') : (es ? 'Oculto' : 'Hidden') }}
              </span>
            </div>
            <div class="mt-2 flex items-center justify-between gap-2">
              <div class="text-sm">
                <span class="font-bold text-gold-400">{{ formatPrice(product.price) }}</span>
                <span class="text-gray-500 ml-2">Stock: {{ product.stock_quantity }}</span>
              </div>
              <div class="flex gap-1.5">
                <button
                  type="button"
                  class="px-2.5 py-1.5 rounded-lg bg-gray-800 text-xs font-bold text-gray-200 hover:text-white"
                  @click="openEdit(product)"
                >
                  {{ es ? 'Editar' : 'Edit' }}
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1.5 rounded-lg bg-gray-800 text-xs font-bold"
                  :class="product.is_active ? 'text-gray-300' : 'text-glass-green'"
                  @click="toggleActive(product)"
                >
                  {{ product.is_active ? (es ? 'Ocultar' : 'Hide') : (es ? 'Publicar' : 'Publish') }}
                </button>
                <button
                  type="button"
                  class="px-2.5 py-1.5 rounded-lg bg-gray-800 text-xs font-bold text-flame-500"
                  @click="deleteProduct(product)"
                >
                  {{ es ? 'Borrar' : 'Delete' }}
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- Add / Edit panel -->
    <Teleport to="body">
      <div
        v-if="panelOpen"
        class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/70 p-4"
        @click.self="closePanel"
      >
        <div class="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl">
          <div class="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-950">
            <h3 class="text-lg font-black text-white">
              {{
                editingId
                  ? (es ? 'Editar producto' : 'Edit product')
                  : (es ? 'Nuevo producto' : 'New product')
              }}
            </h3>
            <button type="button" class="text-gray-400 hover:text-white" @click="closePanel">✕</button>
          </div>

          <div class="p-5 space-y-4">
            <div>
              <label class="block text-xs text-gray-400 mb-2">
                {{ es ? 'Fotos' : 'Photos' }}
              </label>
              <div v-if="productImages.length" class="grid grid-cols-3 gap-2 mb-2">
                <div
                  v-for="(img, idx) in productImages"
                  :key="img + idx"
                  class="relative aspect-square rounded-xl overflow-hidden bg-gray-800"
                >
                  <img :src="img" class="w-full h-full object-cover" alt="" />
                  <button
                    type="button"
                    class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/70 text-white text-xs"
                    @click="removeImage(idx)"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <label class="block border border-dashed border-gray-700 rounded-xl p-4 text-center cursor-pointer hover:border-gold-400">
                <input
                  ref="imageInput"
                  type="file"
                  accept="image/*"
                  multiple
                  class="hidden"
                  :disabled="uploadingImage"
                  @change="handleImageUpload"
                />
                <span class="text-sm text-gray-400">
                  {{
                    uploadingImage
                      ? (es ? 'Subiendo…' : 'Uploading…')
                      : (es ? 'Toca para agregar fotos' : 'Tap to add photos')
                  }}
                </span>
              </label>
            </div>

            <div>
              <label class="block text-xs text-gray-400 mb-1">
                {{ es ? 'ID de producto (SKU)' : 'Product ID (SKU)' }} *
              </label>
              <input
                v-model="form.sku"
                type="text"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm font-mono uppercase"
                :placeholder="es ? 'Ej. DW-JF-825' : 'e.g. DW-JF-825'"
              />
            </div>

            <div>
              <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Nombre' : 'Name' }} *</label>
              <input
                v-model="form.name"
                type="text"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm"
              />
            </div>

            <div>
              <label class="block text-xs text-gray-400 mb-1">{{ es ? 'Marca' : 'Brand' }}</label>
              <input
                v-model="form.brand"
                type="text"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm"
              />
            </div>

            <div>
              <label class="block text-xs text-gray-400 mb-1">
                {{ es ? 'Tamaño / medida' : 'Size' }}
              </label>
              <input
                v-model="form.size"
                type="text"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm"
                :placeholder="es ? 'Ej. 8.25, M, 54mm' : 'e.g. 8.25, M, 54mm'"
              />
            </div>

            <div>
              <label class="block text-xs text-gray-400 mb-1">
                {{ es ? 'Categoría en la tienda' : 'Shop category' }}
              </label>
              <div class="grid grid-cols-2 gap-2 mb-2">
                <button
                  v-for="g in shopGroups"
                  :key="g.id"
                  type="button"
                  class="px-3 py-2 rounded-xl text-xs font-bold border transition-colors"
                  :class="groupForCategory(form.category)?.id === g.id
                    ? 'border-gold-400 bg-gold-400/10 text-gold-400'
                    : 'border-gray-700 text-gray-400'"
                  @click="onShopGroupPick(g.id)"
                >
                  {{ es ? g.label.es : g.label.en }}
                </button>
              </div>
              <select
                v-model="form.category"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm"
              >
                <option v-for="opt in dbCategoryOptions" :key="opt.id" :value="opt.id">
                  {{ es ? opt.name.es : opt.name.en }}
                </option>
              </select>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-gray-400 mb-1">
                  {{ es ? 'Precio (MXN)' : 'Price (MXN)' }} *
                </label>
                <input
                  v-model.number="form.price"
                  type="number"
                  min="0"
                  step="0.01"
                  class="w-full px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm"
                />
              </div>
              <div>
                <label class="block text-xs text-gray-400 mb-1">Stock</label>
                <input
                  v-model.number="form.stock_quantity"
                  type="number"
                  min="0"
                  step="1"
                  class="w-full px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm"
                />
              </div>
            </div>

            <div>
              <label class="block text-xs text-gray-400 mb-1">
                {{ es ? 'Descripción (Detalles)' : 'Description (Details)' }}
              </label>
              <textarea
                v-model="form.description"
                rows="3"
                class="w-full px-3 py-2.5 rounded-xl bg-gray-900 border border-gray-700 text-white text-sm resize-y"
              />
            </div>

            <label class="flex items-center gap-2 text-sm text-gray-300">
              <input v-model="form.is_active" type="checkbox" class="rounded border-gray-600" />
              {{ es ? 'Visible en /skateshop' : 'Visible on /skateshop' }}
            </label>

            <p v-if="formError" class="text-sm text-flame-500">{{ formError }}</p>

            <div class="flex gap-2 pt-2">
              <button
                type="button"
                class="flex-1 py-3 rounded-xl bg-gray-800 text-white text-sm font-bold"
                @click="closePanel"
              >
                {{ es ? 'Cancelar' : 'Cancel' }}
              </button>
              <button
                type="button"
                class="flex-1 py-3 rounded-xl bg-gold-400 text-black text-sm font-bold disabled:opacity-50"
                :disabled="saving"
                @click="saveProduct"
              >
                {{ saving ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar' : 'Save') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
