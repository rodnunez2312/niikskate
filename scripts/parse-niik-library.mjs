/**
 * Parse "1 - Manual de Trucos" from Niik_Plan_Clases.xlsx
 * and write data/niik-trick-library.json for the class planning section.
 *
 * Run: node scripts/parse-niik-library.mjs
 */

import XLSX from 'xlsx'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const excelPath = join(projectRoot, 'data', 'Niik_source', 'Niik_Plan_Clases.xlsx')
const outPath = join(projectRoot, 'data', 'niik-trick-library.json')
const outPathPublic = join(projectRoot, 'public', 'data', 'niik-trick-library.json')

const SHEET_NAME = '1 - Manual de Trucos'

// Map possible Excel column names to our schema keys
const NAME_KEYS = ['truco', 'trick', 'nombre', 'name', 'skill', 'habilidad']
const NAME_ES_KEYS = ['nombre_es', 'name_es', 'truco_es', 'español', 'espanol']
const DESC_KEYS = ['descripción', 'descripcion', 'description', 'desc', 'comentarios']
const DESC_ES_KEYS = ['descripción_es', 'descripcion_es', 'description_es']
const DIFFICULTY_KEYS = ['categoría', 'categoria']
const DIRIGIDO_KEYS = ['dirigido']
const NEW_CATEGORY_KEYS = ['new category', 'nueva categoria', 'new_category']
const TYPE_KEYS = ['tipo', 'type']
const MOTOR_SKILLS_KEYS = ['habilidad motriz', 'motor skills', 'body parts', 'desarrollada']
const URL_KEYS = ['url', 'link', 'video']

const ACTIVITY_CATEGORY_MAP = {
  excercise: ['ejercicios funcionales', 'ejercicios', 'funcionales', 'exercise', 'excercise'],
  iniciacion: ['0 - todos', 'todos', '1 - iniciacion', 'iniciacion', 'calentamiento', 'juegos', 'juego'],
  street_piso: ['2 - street - piso', 'street - piso', 'street piso', 'street-piso', 'piso'],
  street_obstaculos: ['3 - street - obstaculos', 'street - obstaculos', 'street obstáculos', 'street obstaculos', 'street-obstaculos', 'obstaculos'],
  vert_bowl: ['4 - bowl', 'bowl', 'vert-bowl', 'vert bowl', 'vert/bowl', 'vert'],
  surf_skate: ['surf skate', 'surfskate', 'surf-skate', 'surf'],
}

const DIFFICULTY_MAP = {
  beginner: ['0 - calentamiento', 'calentamiento', '1 - basics', 'basics', 'beginner', 'principiante', 'básico', 'basico'],
  intermediate: ['2 - principiantes', 'principiantes', 'intermediate', 'intermedio'],
  advanced: ['3 - intermedios', 'intermedios', 'advanced', 'avanzado', 'avanzados'],
}

function normalizeActivityCategory(dirigidoValue, tipoValue) {
  const tipo = (tipoValue || '').toString().toLowerCase().trim()
  if (tipo.includes('ejercicio') || tipo.includes('funcional') || tipo.includes('exercise') || tipo.includes('excercise')) {
    return 'excercise'
  }

  if (!dirigidoValue || typeof dirigidoValue !== 'string') {
    return 'iniciacion'
  }
  const v = dirigidoValue.toLowerCase().trim()
  for (const [cat, aliases] of Object.entries(ACTIVITY_CATEGORY_MAP)) {
    if (aliases.some(a => v.includes(a))) return cat
  }
  return 'iniciacion'
}

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
    console.error('Place Niik_Plan_Clases.xlsx in data/Niik_trick_library/')
    process.exit(1)
  }

  const workbook = XLSX.readFile(excelPath)
  const sheetName = workbook.SheetNames.find(
    n => n.toLowerCase().includes('manual') || n === SHEET_NAME
  ) || workbook.SheetNames[0]

  const sheet = workbook.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (raw.length < 2) {
    console.error('Sheet has no data rows. Expected header + at least one trick.')
    process.exit(1)
  }

  const headerRow = raw[0].map(c => (c || '').toString().trim())
  const nameCol = findColumn(headerRow, NAME_KEYS)
  const nameEsCol = findColumn(headerRow, NAME_ES_KEYS)
  const descCol = findColumn(headerRow, DESC_KEYS)
  const descEsCol = findColumn(headerRow, DESC_ES_KEYS)
  const difficultyCol = findColumn(headerRow, DIFFICULTY_KEYS)
  const dirigidoCol = findColumn(headerRow, DIRIGIDO_KEYS)
  const newCategoryCol = findColumn(headerRow, NEW_CATEGORY_KEYS)
  const typeCol = findColumn(headerRow, TYPE_KEYS)
  const motorSkillsCol = findColumn(headerRow, MOTOR_SKILLS_KEYS)
  const urlCol = findColumn(headerRow, URL_KEYS)

  if (nameCol < 0 && descCol < 0) {
    console.error('Could not find name or description column. Header row:', headerRow)
    process.exit(1)
  }

  const tricks = []
  for (let i = 1; i < raw.length; i++) {
    const row = raw[i]
    const name = (row[nameCol] ?? row[0] ?? '').toString().trim()
    const nameEs = (nameEsCol >= 0 ? row[nameEsCol] : '').toString().trim()
    const description = (row[descCol] ?? row[1] ?? '').toString().trim()
    const descriptionEs = (descEsCol >= 0 ? row[descEsCol] : '').toString().trim()
    const newCategoryValue = newCategoryCol >= 0 ? (row[newCategoryCol] || '').toString().trim() : ''
    const dirigidoValue = dirigidoCol >= 0 ? (row[dirigidoCol] || '').toString().trim() : ''
    const tipoValue = typeCol >= 0 ? (row[typeCol] || '').toString().trim() : ''
    const categoriaValue = difficultyCol >= 0 ? (row[difficultyCol] || '').toString().trim() : ''
    const urlValue = urlCol >= 0 ? (row[urlCol] || '').toString().trim() : ''
    const category = normalizeActivityCategory(newCategoryValue || dirigidoValue, tipoValue)
    const difficulty = difficultyCol >= 0 ? normalizeDifficulty(row[difficultyCol]) : 'beginner'
    
    // Parse motor skills (body parts) - split by comma and clean up
    let motorSkills = []
    if (motorSkillsCol >= 0 && row[motorSkillsCol]) {
      const rawMotorSkills = row[motorSkillsCol].toString().trim()
      motorSkills = rawMotorSkills
        .split(/[,،;]/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && s.length < 50) // Filter out empty or very long strings
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
      category,
      activity_type: tipoValue || undefined,
      motor_skills: motorSkills.length > 0 ? motorSkills : undefined,
      sort_order: i,
    })
  }

  const output = {
    source: '1 - Manual de Trucos',
    sourceFile: 'Niik_Plan_Clases.xlsx',
    generatedAt: new Date().toISOString(),
    tricks,
  }

  const dataDir = join(projectRoot, 'data')
  const publicDataDir = join(projectRoot, 'public', 'data')
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true })
  if (!existsSync(publicDataDir)) mkdirSync(publicDataDir, { recursive: true })
  const jsonStr = JSON.stringify(output, null, 2)
  writeFileSync(outPath, jsonStr, 'utf8')
  writeFileSync(outPathPublic, jsonStr, 'utf8')
  console.log('Wrote', tricks.length, 'tricks to', outPath, 'and', outPathPublic)
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
