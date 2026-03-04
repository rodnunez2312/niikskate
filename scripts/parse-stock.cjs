/**
 * Parse Stock Excel file and convert to JSON for the store
 * Source: Stock NiikSkateshop Deshuesaderosk8.xlsx
 * 
 * Run with: node scripts/parse-stock.cjs
 */

const XLSX = require('xlsx')
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')

const STOCK_FILE = join(__dirname, '..', 'data', 'Niik_source', 'Stock NiikSkateshop Deshuesaderosk8.xlsx')
const OUTPUT_DIR = join(__dirname, '..', 'public', 'data')
const OUTPUT_FILE = join(OUTPUT_DIR, 'niik-stock.json')

// Category mapping based on product names/descriptions and type
function detectCategory(name, tipo = '', description = '') {
  const text = `${name} ${tipo} ${description}`.toLowerCase()
  
  // Tablas (boards)
  if (text.includes('tabla') || text.includes('deck') || text.includes('board') || 
      text.includes('complete') || text.includes('longboard') || tipo.toLowerCase() === 'tablas') return 'tablas'
  
  // Llantas (wheels)
  if (text.includes('wheel') || text.includes('llanta') || text.includes('rueda') ||
      tipo.toLowerCase() === 'llantas') return 'llantas'
  
  // Lijas (grip tape)
  if (text.includes('grip') || text.includes('lija') || text.includes('griptape') ||
      tipo.toLowerCase() === 'lijas') return 'lijas'
  
  // Cascos (helmets)
  if (text.includes('helmet') || text.includes('casco') || tipo.toLowerCase() === 'cascos') return 'cascos'
  
  // Protecciones (protection gear)
  if (text.includes('pad') || text.includes('protection') || text.includes('protec') || 
      text.includes('rodillera') || text.includes('codera') || text.includes('wristguard') ||
      text.includes('guante') || text.includes('glove') || text.includes('protecciones') ||
      tipo.toLowerCase() === 'protecciones' || tipo.toLowerCase() === 'proteccion') return 'protecciones'
  
  // Merch (merchandise - clothing, accessories)
  if (text.includes('shirt') || text.includes('hoodie') || text.includes('playera') || 
      text.includes('merch') || text.includes('sticker') || text.includes('gorra') || 
      text.includes('calceta') || text.includes('beanie') || text.includes('camiseta') ||
      text.includes('pantalon') || text.includes('short') || text.includes('tenis') ||
      text.includes('cinturon') || text.includes('belt') || text.includes('gafas') ||
      text.includes('poster') || text.includes('socks') || text.includes('sock') ||
      tipo.toLowerCase() === 'beanie' || tipo.toLowerCase() === 'gorras' ||
      tipo.toLowerCase() === 'playeras' || tipo.toLowerCase() === 'calcetines' ||
      tipo.toLowerCase() === 'pantalones' || tipo.toLowerCase() === 'shorts' ||
      tipo.toLowerCase() === 'tenis' || tipo.toLowerCase() === 'cinturones' ||
      tipo.toLowerCase() === 'posters' || tipo.toLowerCase() === 'gafas') return 'merch'
  
  // Ramps
  if (text.includes('ramp') || text.includes('rampa')) return 'ramps'
  
  // Hardware (trucks, bearings, bolts, risers, rails, bushings, tools)
  if (text.includes('truck') || text.includes('bearing') || text.includes('balero') || 
      text.includes('tornillo') || text.includes('bolt') || text.includes('ejes') ||
      text.includes('elevador') || text.includes('riser') || text.includes('goma') ||
      text.includes('bushing') || text.includes('rieles') || text.includes('rail') ||
      text.includes('kingpin') || text.includes('herramienta') || text.includes('tool') ||
      text.includes('llave') || text.includes('hardware') || text.includes('pentel') ||
      text.includes('pilot') || text.includes('marcador') || text.includes('botiquin') ||
      tipo.toLowerCase() === 'baleros' || tipo.toLowerCase() === 'elevadores' ||
      tipo.toLowerCase() === 'gomas' || tipo.toLowerCase() === 'rieles' ||
      tipo.toLowerCase() === 'trucks' || tipo.toLowerCase() === 'ejes' ||
      tipo.toLowerCase() === 'tornilleria' || tipo.toLowerCase() === 'tornillos') return 'hardware'
  
  return 'hardware' // Default category
}

function parseStockFile() {
  if (!existsSync(STOCK_FILE)) {
    console.error('Stock file not found:', STOCK_FILE)
    process.exit(1)
  }

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  console.log('Reading stock file:', STOCK_FILE)
  
  const workbook = XLSX.readFile(STOCK_FILE)
  const products = []
  const seenProducts = new Set() // Track duplicates
  
  // Process main stock sheets only
  const stockSheets = ['Niik Stock', 'Deshuesadero Stock']
  
  for (const sheetName of workbook.SheetNames) {
    if (!stockSheets.some(s => sheetName.includes(s.split(' ')[0]))) {
      console.log(`\nSkipping sheet: ${sheetName}`)
      continue
    }
    
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Processing sheet: ${sheetName}`)
    console.log('='.repeat(60))
    
    const sheet = workbook.Sheets[sheetName]
    
    // Get raw data as array of arrays
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    
    console.log(`Total rows: ${rawData.length}`)
    
    // Find the header row
    let headerRowIndex = -1
    let columnMap = {}
    
    for (let i = 0; i < rawData.length; i++) {
      const row = rawData[i]
      if (!row) continue
      
      const rowStr = row.join(' ').toLowerCase()
      
      // Look for header with key columns
      if (rowStr.includes('descripcion') && (rowStr.includes('marca') || rowStr.includes('tipo'))) {
        headerRowIndex = i
        
        // Map columns
        for (let j = 0; j < row.length; j++) {
          const header = (row[j] || '').toString().toLowerCase().trim()
          if (header === 'descripcion') columnMap.name = j
          if (header === 'marca') columnMap.brand = j
          if (header === 'tipo') columnMap.tipo = j
          if (header === 'talla') columnMap.size = j
          if (header === 'quedan' || header === 'stock') columnMap.stock = j
          if (header === 'stock original') columnMap.stockOriginal = j
          if (header === 'id') columnMap.id = j
          if (header.includes('precio') || header.includes('costo')) {
            if (!columnMap.price) columnMap.price = j
          }
        }
        
        // Check for price column in later columns (might be index 10-12)
        for (let j = 10; j < Math.min(row.length, 15); j++) {
          const header = (row[j] || '').toString().toLowerCase().trim()
          if (header.includes('precio') || header.includes('venta') || header.includes('costo')) {
            columnMap.price = j
          }
        }
        
        console.log('Column mapping:', columnMap)
        break
      }
    }
    
    if (headerRowIndex === -1) {
      console.log('No header found in sheet')
      continue
    }
    
    // Parse data rows after header
    console.log(`Parsing data rows starting from row ${headerRowIndex + 1}...`)
    
    for (let i = headerRowIndex + 1; i < rawData.length; i++) {
      const row = rawData[i]
      if (!row || row.length < 5) continue
      
      const name = columnMap.name !== undefined ? row[columnMap.name] : ''
      const brand = columnMap.brand !== undefined ? row[columnMap.brand] : ''
      const tipo = columnMap.tipo !== undefined ? row[columnMap.tipo] : ''
      const size = columnMap.size !== undefined ? row[columnMap.size] : ''
      const id = columnMap.id !== undefined ? row[columnMap.id] : ''
      
      // Get stock from QUEDAN column (what's left)
      let stock = columnMap.stock !== undefined ? row[columnMap.stock] : 1
      
      // Get price - look for it in multiple columns
      let price = 0
      if (columnMap.price !== undefined) {
        price = row[columnMap.price]
      }
      // Also check specific columns that might have prices
      for (let j = 10; j < Math.min(row.length, 15); j++) {
        const val = parseFloat(row[j])
        if (!isNaN(val) && val > 10 && val < 50000 && price === 0) {
          price = val
        }
      }
      
      // Skip empty rows
      if (!name || typeof name !== 'string' || name.trim().length < 2) continue
      
      // Parse values
      let priceVal = parseFloat(String(price).replace(/[$,MXN\s]/gi, '')) || 0
      let stockVal = parseInt(String(stock).replace(/[^0-9]/g, '')) || 0
      
      // Skip items with 0 stock
      if (stockVal <= 0) continue
      
      // Detect category using both name and tipo (type)
      const category = detectCategory(name, tipo, '')
      
      // Create unique key to avoid duplicates
      const uniqueKey = `${name.trim().toLowerCase()}-${brand.trim().toLowerCase()}-${size}`.replace(/\s+/g, '')
      
      if (seenProducts.has(uniqueKey)) {
        // Find existing and add to stock
        const existing = products.find(p => 
          p.name.toLowerCase() === name.trim().toLowerCase() && 
          p.brand.toLowerCase() === brand.toString().trim().toLowerCase()
        )
        if (existing) {
          existing.stock_quantity += stockVal
        }
        continue
      }
      seenProducts.add(uniqueKey)
      
      const product = {
        name: name.toString().trim(),
        description: size ? `Talla: ${size}` : '',
        brand: (brand || '').toString().trim(),
        sku: id ? `NIIK-${id}` : `NIIK-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        price: priceVal,
        stock_quantity: stockVal,
        category: category,
        tipo: tipo.toString().trim(),
        source_sheet: sheetName
      }
      
      products.push(product)
      console.log(`  + [${category}] ${product.name.substring(0, 35)}... | $${product.price} | Stock: ${product.stock_quantity}`)
    }
  }
  
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Total unique products parsed: ${products.length}`)
  console.log('='.repeat(60))
  
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
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`)
  }
  
  // Print total stock value
  const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock_quantity), 0)
  console.log(`\nTotal stock value: $${totalValue.toLocaleString('es-MX')} MXN`)
  
  return output
}

// Run the parser
parseStockFile()
