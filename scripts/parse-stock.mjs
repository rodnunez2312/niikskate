/**
 * Parse Stock Excel file and convert to JSON for the store
 * Source: Stock NiikSkateshop Deshuesaderosk8.xlsx
 * 
 * Run with: node scripts/parse-stock.mjs
 */

import * as XLSX from 'xlsx'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const STOCK_FILE = join(__dirname, '..', 'data', 'Niik_source', 'Stock NiikSkateshop Deshuesaderosk8.xlsx')
const OUTPUT_FILE = join(__dirname, '..', 'public', 'data', 'niik-stock.json')

// Category mapping based on product names/descriptions
function detectCategory(name, description = '') {
  const text = `${name} ${description}`.toLowerCase()
  
  if (text.includes('deck') || text.includes('tabla') || text.includes('board')) return 'tablas'
  if (text.includes('wheel') || text.includes('llanta') || text.includes('rueda')) return 'llantas'
  if (text.includes('truck') || text.includes('bearing') || text.includes('balero') || text.includes('hardware')) return 'hardware'
  if (text.includes('grip') || text.includes('lija')) return 'lijas'
  if (text.includes('pad') || text.includes('protection') || text.includes('protec')) return 'protecciones'
  if (text.includes('helmet') || text.includes('casco')) return 'cascos'
  if (text.includes('shirt') || text.includes('hoodie') || text.includes('playera') || text.includes('merch') || text.includes('sticker')) return 'merch'
  if (text.includes('ramp') || text.includes('rampa')) return 'ramps'
  
  return 'hardware' // Default category
}

function parseStockFile() {
  if (!existsSync(STOCK_FILE)) {
    console.error('Stock file not found:', STOCK_FILE)
    process.exit(1)
  }

  console.log('Reading stock file:', STOCK_FILE)
  
  const workbook = XLSX.readFile(STOCK_FILE)
  const products = []
  
  // Process all sheets
  for (const sheetName of workbook.SheetNames) {
    console.log(`\nProcessing sheet: ${sheetName}`)
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(sheet, { defval: '' })
    
    console.log(`Found ${data.length} rows`)
    
    if (data.length > 0) {
      console.log('Sample row keys:', Object.keys(data[0]))
    }
    
    for (const row of data) {
      // Try to find product name from various possible column names
      const name = row['Producto'] || row['Name'] || row['Nombre'] || row['PRODUCTO'] || row['producto'] || 
                   row['Item'] || row['item'] || row['Articulo'] || row['ARTICULO'] || ''
      
      // Skip empty rows
      if (!name || name.toString().trim() === '') continue
      
      // Try to find price
      let price = row['Precio'] || row['Price'] || row['PRECIO'] || row['precio'] || 
                  row['Precio Venta'] || row['PrecioVenta'] || row['Venta'] || 0
      
      // Clean price - remove currency symbols, commas, etc.
      if (typeof price === 'string') {
        price = parseFloat(price.replace(/[^0-9.]/g, '')) || 0
      }
      
      // Try to find stock quantity
      let stock = row['Stock'] || row['Cantidad'] || row['STOCK'] || row['stock'] || 
                  row['Existencia'] || row['Qty'] || row['qty'] || 1
      
      if (typeof stock === 'string') {
        stock = parseInt(stock.replace(/[^0-9]/g, '')) || 1
      }
      
      // Try to find brand
      const brand = row['Marca'] || row['Brand'] || row['MARCA'] || row['marca'] || ''
      
      // Try to find description
      const description = row['Descripcion'] || row['Description'] || row['DESCRIPCION'] || 
                         row['descripcion'] || row['Desc'] || ''
      
      // Try to find SKU
      const sku = row['SKU'] || row['Codigo'] || row['Código'] || row['codigo'] || 
                  row['Code'] || row['code'] || ''
      
      // Detect category
      const category = detectCategory(name.toString(), description.toString())
      
      const product = {
        name: name.toString().trim(),
        description: description.toString().trim(),
        brand: brand.toString().trim(),
        sku: sku.toString().trim() || `NIIK-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        price: price,
        stock_quantity: stock,
        category: category,
        source_sheet: sheetName
      }
      
      // Only add products with valid names and prices
      if (product.name && product.price > 0) {
        products.push(product)
        console.log(`  + ${product.name} | $${product.price} | Stock: ${product.stock_quantity} | ${product.category}`)
      }
    }
  }
  
  console.log(`\n\nTotal products parsed: ${products.length}`)
  
  // Write output
  const output = {
    source: 'Stock NiikSkateshop Deshuesaderosk8.xlsx',
    parsed_at: new Date().toISOString(),
    total_products: products.length,
    products: products
  }
  
  writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`\nOutput written to: ${OUTPUT_FILE}`)
  
  // Print category summary
  const byCategory = {}
  for (const p of products) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1
  }
  console.log('\nProducts by category:')
  for (const [cat, count] of Object.entries(byCategory)) {
    console.log(`  ${cat}: ${count}`)
  }
  
  return output
}

// Run the parser
parseStockFile()
