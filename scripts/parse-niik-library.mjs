/**
 * Parse "1 - Manual de Trucos" from Niik_Plan_Clases.xlsx
 * and write data/niik-trick-library.json for the class planning section.
 *
 * Run: node scripts/parse-niik-library.mjs
 */

import * as XLSX from 'xlsx'
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
const DESC_KEYS = ['descripción', 'descripcion', 'description', 'desc']
const DESC_ES_KEYS = ['descripción_es', 'descripcion_es', 'description_es']
const CATEGORY_KEYS = ['categoría', 'categoria', 'category', 'tipo', 'type']
const DIFFICULTY_KEYS = ['dificultad', 'difficulty', 'nivel', 'level']
const MOTOR_SKILLS_KEYS = ['habilidad motriz', 'motor skills', 'body parts', 'desarrollada']

const CATEGORY_MAP = {
  bowl: ['bowl', 'bowl'],
  street: ['street', 'street', 'calle'],
  surf_skate: ['surf skate', 'surf skate', 'surf', 'surfskate'],
  fundamentals: ['fundamentals', 'fundamentos', 'fundamento', 'basico', 'básico'],
  safety: ['safety', 'seguridad', 'safety'],
}

const DIFFICULTY_MAP = {
  beginner: ['beginner', 'principiante', 'básico', 'basico', 'principiantes', '1'],
  intermediate: ['intermediate', 'intermedio', 'intermedios', '2'],
  advanced: ['advanced', 'avanzado', 'avanzados', '3'],
}

function normalizeCategory(value) {
  if (!value || typeof value !== 'string') return 'fundamentals'
  const v = value.toLowerCase().trim()
  for (const [cat, aliases] of Object.entries(CATEGORY_MAP)) {
    if (aliases.some(a => v.includes(a))) return cat
  }
  return 'fundamentals'
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
  const categoryCol = findColumn(headerRow, CATEGORY_KEYS)
  const difficultyCol = findColumn(headerRow, DIFFICULTY_KEYS)
  const motorSkillsCol = findColumn(headerRow, MOTOR_SKILLS_KEYS)

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
    const category = categoryCol >= 0 ? normalizeCategory(row[categoryCol]) : 'fundamentals'
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
      difficulty,
      category,
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

main().catch(err => {
  console.error(err)
  process.exit(1)
})
