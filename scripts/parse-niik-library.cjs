/**
 * Parse "1 - Manual de Trucos" from Niik_Plan_Clases.xlsx
 * and write data/niik-trick-library.json for the class planning section.
 *
 * Run: node scripts/parse-niik-library.cjs
 */

const XLSX = require('xlsx')
const { writeFileSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')

const projectRoot = join(__dirname, '..')
const excelPath = join(projectRoot, 'data', 'Niik_source', 'Niik_Plan_Clases.xlsx')
const outPath = join(projectRoot, 'data', 'niik-trick-library.json')
const outPathPublic = join(projectRoot, 'public', 'data', 'niik-trick-library.json')

const SHEET_NAME = '1 - Manual de Trucos'

// Map possible Excel column names to our schema keys
const NAME_KEYS = ['truco', 'trick', 'nombre', 'name', 'skill']
const NAME_ES_KEYS = ['nombre_es', 'name_es', 'truco_es', 'español', 'espanol']
const DESC_KEYS = ['descripción', 'descripcion', 'description', 'desc', 'comentarios']
const DESC_ES_KEYS = ['descripción_es', 'descripcion_es', 'description_es']
const DIFFICULTY_KEYS = ['categoría', 'categoria']  // "Categoria" column has difficulty (0-Calentamiento, 1-Basics, 2-Principiantes, 3-Intermedios)
const DIRIGIDO_KEYS = ['dirigido']  // "Dirigido" column has obstacle type (0-Todos, 1-Iniciacion, 2-Street, 3-Bowl)
const NEW_CATEGORY_KEYS = ['new category', 'nueva categoria', 'new_category']  // NEW CATEGORY column (user-defined)
const TYPE_KEYS = ['tipo', 'type']  // "Tipo" column has activity type (Ejercicios funcionales, Juego, Linea, Skill, Truco)
const MOTOR_SKILLS_KEYS = ['habilidad motriz', 'motor skills', 'body parts', 'desarrollada']
const URL_KEYS = ['url', 'link', 'video']

// Map "NEW CATEGORY" or "Dirigido" values to our activity categories
const ACTIVITY_CATEGORY_MAP = {
  excercise: ['ejercicios funcionales', 'ejercicios', 'funcionales', 'exercise', 'excercise'],
  iniciacion: ['0 - todos', 'todos', '1 - iniciacion', 'iniciacion', 'calentamiento', 'juegos', 'juego'],
  street_piso: ['2 - street - piso', 'street - piso', 'street piso', 'street-piso', 'piso'],
  street_obstaculos: ['3 - street - obstaculos', 'street - obstaculos', 'street obstáculos', 'street obstaculos', 'street-obstaculos', 'obstaculos'],
  vert_bowl: ['4 - bowl', 'bowl', 'vert-bowl', 'vert bowl', 'vert/bowl', 'vert'],
  surf_skate: ['surf skate', 'surfskate', 'surf-skate', 'surf'],
}

// Map "Categoria" values to difficulty levels
const DIFFICULTY_MAP = {
  beginner: ['0 - calentamiento', 'calentamiento', '1 - basics', 'basics', 'beginner', 'principiante', 'básico', 'basico'],
  intermediate: ['2 - principiantes', 'principiantes', 'intermediate', 'intermedio'],
  advanced: ['3 - intermedios', 'intermedios', 'advanced', 'avanzado', 'avanzados'],
}

// Normalize "Dirigido" value to activity category
function normalizeActivityCategory(dirigidoValue, tipoValue) {
  const tipo = (tipoValue || '').toString().toLowerCase().trim()
  // Prioritize exercise grouping from "Tipo"/"NEW CATEGORY" field.
  if (tipo.includes('ejercicio') || tipo.includes('funcional') || tipo.includes('exercise') || tipo.includes('excercise')) {
    return 'excercise'
  }

  if (!dirigidoValue || typeof dirigidoValue !== 'string') {
    // Fallback to tipo if no dirigido
    if (tipo.includes('juego')) return 'iniciacion'
    return 'iniciacion'
  }
  
  const v = dirigidoValue.toLowerCase().trim()
  for (const [cat, aliases] of Object.entries(ACTIVITY_CATEGORY_MAP)) {
    if (aliases.some(a => v.includes(a))) return cat
  }
  return 'iniciacion'
}

// Normalize "Categoria" value to difficulty level
function normalizeDifficulty(value) {
  if (!value || typeof value !== 'string') return 'beginner'
  const v = value.toLowerCase().trim()
  for (const [diff, aliases] of Object.entries(DIFFICULTY_MAP)) {
    if (aliases.some(a => v === a || v.includes(a))) return diff
  }
  return 'beginner'
}

function findColumn(row, keys) {
  for (let i = 0; i < row.length; i++) {
    const cell = (row[i] || '').toString().toLowerCase().trim()
    if (keys.some(k => cell.includes(k))) return i
  }
  return -1
}

function main() {
  if (!existsSync(excelPath)) {
    console.error('Excel file not found:', excelPath)
    console.error('Place Niik_Plan_Clases.xlsx in data/Niik_source/')
    process.exit(1)
  }

  console.log('Reading:', excelPath)
  const workbook = XLSX.readFile(excelPath)
  console.log('Sheets found:', workbook.SheetNames)
  
  const sheetName = workbook.SheetNames.find(
    n => n.toLowerCase().includes('manual') || n === SHEET_NAME
  ) || workbook.SheetNames[0]
  console.log('Using sheet:', sheetName)

  const sheet = workbook.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (raw.length < 2) {
    console.error('Sheet has no data rows. Expected header + at least one trick.')
    process.exit(1)
  }

  const headerRow = raw[0].map(c => (c || '').toString().trim())
  console.log('Header row:', headerRow)
  
  const nameCol = findColumn(headerRow, NAME_KEYS)
  const nameEsCol = findColumn(headerRow, NAME_ES_KEYS)
  const descCol = findColumn(headerRow, DESC_KEYS)
  const descEsCol = findColumn(headerRow, DESC_ES_KEYS)
  const difficultyCol = findColumn(headerRow, DIFFICULTY_KEYS)  // "Categoria" column
  const dirigidoCol = findColumn(headerRow, DIRIGIDO_KEYS)      // "Dirigido" column - obstacle type
  const newCategoryCol = findColumn(headerRow, NEW_CATEGORY_KEYS)  // "NEW CATEGORY" column (preferred)
  const typeCol = findColumn(headerRow, TYPE_KEYS)              // "Tipo" column - activity type
  const motorSkillsCol = findColumn(headerRow, MOTOR_SKILLS_KEYS)
  const urlCol = findColumn(headerRow, URL_KEYS)

  console.log('Column indices:', {
    name: nameCol,
    nameEs: nameEsCol,
    desc: descCol,
    difficulty: difficultyCol,
    dirigido: dirigidoCol,
    newCategory: newCategoryCol,
    type: typeCol,
    motorSkills: motorSkillsCol,
    url: urlCol
  })
  
  if (newCategoryCol >= 0) {
    console.log('✅ Found NEW CATEGORY column - will use it for activity categories')
  } else {
    console.log('⚠️ NEW CATEGORY column not found - falling back to Dirigido column')
  }

  if (nameCol < 0 && descCol < 0) {
    console.error('Could not find name or description column. Header row:', headerRow)
    process.exit(1)
  }

  const tricks = []
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i]
    const name = (row[nameCol] ?? row[0] ?? '').toString().trim()
    const nameEs = (nameEsCol >= 0 ? row[nameEsCol] : '').toString().trim()
    const description = (row[descCol] ?? '').toString().trim()
    const descriptionEs = (descEsCol >= 0 ? row[descEsCol] : '').toString().trim()
    
    // Get raw values for mapping
    const newCategoryValue = newCategoryCol >= 0 ? (row[newCategoryCol] || '').toString().trim() : ''
    const dirigidoValue = dirigidoCol >= 0 ? (row[dirigidoCol] || '').toString().trim() : ''
    const tipoValue = typeCol >= 0 ? (row[typeCol] || '').toString().trim() : ''
    const categoriaValue = difficultyCol >= 0 ? (row[difficultyCol] || '').toString().trim() : ''
    const urlValue = urlCol >= 0 ? (row[urlCol] || '').toString().trim() : ''
    
    // Map to our schema - prefer NEW CATEGORY column if available
    const activityCategory = normalizeActivityCategory(newCategoryValue || dirigidoValue, tipoValue)
    const difficulty = normalizeDifficulty(categoriaValue)
    
    // Parse motor skills (body parts) - split by comma and clean up
    let motorSkills = []
    if (motorSkillsCol >= 0 && row[motorSkillsCol]) {
      const rawMotorSkills = row[motorSkillsCol].toString().trim()
      motorSkills = rawMotorSkills
        .split(/[,،;]/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 60)
    }

    if (!name && !description) continue

    tricks.push({
      name: name || (nameEs || 'Unnamed trick'),
      name_es: nameEs || name || undefined,
      description: description || name || 'No description',
      description_es: descriptionEs || undefined,
      truco: name || undefined,
      categoria: categoriaValue || undefined,
      dirigido: dirigidoValue || undefined,
      comentarios: description || undefined,
      url: urlValue || undefined,
      new_category: newCategoryValue || undefined,
      habilidad_motriz_habilitada: motorSkills.length > 0 ? motorSkills : undefined,
      difficulty,
      category: activityCategory,  // Use activity category (from Dirigido column)
      activity_type: tipoValue || undefined,  // Keep original Tipo value for reference
      motor_skills: motorSkills.length > 0 ? motorSkills : undefined,
      sort_order: i,
    })
  }

  // Count by category
  const catCounts = {}
  tricks.forEach(t => { catCounts[t.category] = (catCounts[t.category] || 0) + 1 })
  console.log('\n--- Category distribution ---')
  Object.entries(catCounts).sort((a,b) => b[1] - a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`))

  console.log('\n--- Sample tricks (first 5) ---')
  tricks.slice(0, 5).forEach((t, i) => {
    console.log(`${i + 1}. ${t.name}`)
    console.log(`   Motor skills: ${t.motor_skills?.join(', ') || 'none'}`)
    console.log(`   Category: ${t.category}, Difficulty: ${t.difficulty}`)
  })

  const output = {
    source: '1 - Manual de Trucos',
    sourceFile: 'Niik_Plan_Clases.xlsx',
    generatedAt: new Date().toISOString(),
    totalTricks: tricks.length,
    tricks,
  }

  const dataDir = join(projectRoot, 'data')
  const publicDataDir = join(projectRoot, 'public', 'data')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(publicDataDir)) mkdirSync(publicDataDir, { recursive: true })
  const jsonStr = JSON.stringify(output, null, 2)
  writeFileSync(outPath, jsonStr, 'utf8')
  writeFileSync(outPathPublic, jsonStr, 'utf8')
  console.log('\n✅ Wrote', tricks.length, 'tricks to:')
  console.log('  -', outPath)
  console.log('  -', outPathPublic)
}

main()
