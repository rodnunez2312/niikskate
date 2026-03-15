/**
 * Parse "1 - Manual de Trucos" from Niik_Plan_Clases.xlsx → niik-trick-library.json
 *
 * Expected columns (from current Excel):
 *   #, Truco, Categoria, Tipo, Program, Comentarios, URL,
 *   Habilidad motriz desarrollada (sub-columns: Coordinación, Balance, Resistencia, Fuerza, Agilidad, Confianza, Estabilidad)
 *
 * Run: npm run niik:parse
 * Excel: data/Niik_source/Niik_Plan_Clases.xlsx or data/Niik_Plan_Clases.xlsx
 */

import XLSX from 'xlsx'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

function resolveExcelPath() {
  const withSource = join(projectRoot, 'data', 'Niik_source', 'Niik_Plan_Clases.xlsx')
  const rootData = join(projectRoot, 'data', 'Niik_Plan_Clases.xlsx')
  if (existsSync(withSource)) return withSource
  if (existsSync(rootData)) return rootData
  return withSource
}

const excelPath = resolveExcelPath()
const outPath = join(projectRoot, 'data', 'niik-trick-library.json')
const outPathPublic = join(projectRoot, 'public', 'data', 'niik-trick-library.json')

const SHEET_MATCH = /1\s*-\s*manual\s*de\s*trucos|manual|trucos/i

const MOTOR_LABELS = [
  'Coordinación',
  'Balance',
  'Resistencia',
  'Fuerza',
  'Agilidad',
  'Confianza',
  'Estabilidad',
]

function findHeaderIndex(headerRow, ...keywords) {
  for (let i = 0; i < headerRow.length; i++) {
    const cell = (headerRow[i] || '').toString().trim().toLowerCase()
    if (keywords.some(k => cell === k.toLowerCase() || cell.includes(k.toLowerCase()))) return i
  }
  return -1
}

function normalizeDifficulty(categoria) {
  if (!categoria || typeof categoria !== 'string') return 'beginner'
  const v = categoria.toLowerCase().trim()
  if (/0\s*-\s*warmup|1\s*-\s*basics|warmup|basics/.test(v)) return 'beginner'
  if (/2\s*-\s*principiantes|principiantes/.test(v)) return 'beginner'
  if (/3\s*-\s*intermedios|intermedios/.test(v)) return 'intermediate'
  if (/4\s*-\s*avanzados|avanzados/.test(v)) return 'advanced'
  return 'beginner'
}

function normalizeCategory(program, tipo) {
  const t = (tipo || '').toString().toLowerCase().trim()
  if (/ejercicio|funcional|exercise/.test(t)) return 'excercise'
  const p = (program || '').toString().toLowerCase().trim()
  if (p === 'strength training') return 'excercise'
  if (p === 'iniciacion') return 'iniciacion'
  if (p === 'street') return 'street'
  if (p === 'park/bowl') return 'vert_bowl'
  return 'iniciacion'
}

function isChecked(val) {
  if (val == null) return false
  const s = (val + '').trim().toLowerCase()
  if (!s) return false
  if (/^[x1sísiy✓✔+]$/.test(s)) return true
  if (s === 'yes' || s === 'true') return true
  return s.length > 0 && s.length < 25
}

function main() {
  if (!existsSync(excelPath)) {
    console.error('Excel not found. Tried: data/Niik_source/Niik_Plan_Clases.xlsx and data/Niik_Plan_Clases.xlsx')
    process.exit(1)
  }

  const workbook = XLSX.readFile(excelPath)
  const sheetName = workbook.SheetNames.find(n => SHEET_MATCH.test(n)) || workbook.SheetNames[0]
  console.log('Sheet:', sheetName)

  const sheet = workbook.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (raw.length < 2) {
    console.error('Sheet has no data rows.')
    process.exit(1)
  }

  // Find row that contains "Truco" (header row)
  let headerRow = null
  let dataStartIndex = 0
  for (let r = 0; r < Math.min(10, raw.length); r++) {
    const row = raw[r].map(c => (c ?? '').toString().trim())
    const idx = findHeaderIndex(row, 'Truco')
    if (idx >= 0) {
      headerRow = row
      dataStartIndex = r + 1
      break
    }
  }

  if (!headerRow) {
    console.error('Header row with "Truco" not found. First row cells:', raw[0]?.slice(0, 8))
    process.exit(1)
  }

  const colTruco = findHeaderIndex(headerRow, 'Truco')
  const colCategoria = findHeaderIndex(headerRow, 'Categoria', 'Categoría')
  const colTipo = findHeaderIndex(headerRow, 'Tipo')
  const colProgram = findHeaderIndex(headerRow, 'Program')
  const colComentarios = findHeaderIndex(headerRow, 'Comentarios')
  const colUrl = findHeaderIndex(headerRow, 'URL')

  if (colTruco < 0) {
    console.error('Column "Truco" not found.')
    process.exit(1)
  }

  // Motor skill sub-columns: headers that match MOTOR_LABELS
  const motorCols = []
  for (let c = 0; c < headerRow.length; c++) {
    const h = (headerRow[c] || '').trim()
    const match = MOTOR_LABELS.find(l => h === l || h.toLowerCase().includes(l.toLowerCase()))
    if (match) motorCols.push({ index: c, label: match })
  }
  console.log('Columns: Truco, Categoria, Tipo, Program, Comentarios, URL', motorCols.length ? ', motor:' + motorCols.map(m => m.label).join(', ') : '')

  const tricks = []
  for (let i = dataStartIndex; i < raw.length; i++) {
    const row = raw[i]
    const name = (row[colTruco] ?? '').toString().trim()
    const desc = colComentarios >= 0 ? (row[colComentarios] ?? '').toString().trim() : ''
    if (!name && !desc) continue

    const categoriaRaw = colCategoria >= 0 ? (row[colCategoria] ?? '').toString().trim() : ''
    const tipo = colTipo >= 0 ? (row[colTipo] ?? '').toString().trim() : ''
    const program = colProgram >= 0 ? (row[colProgram] ?? '').toString().trim() : ''
    const url = colUrl >= 0 ? (row[colUrl] ?? '').toString().trim() : ''

    const motorSkills = []
    for (const { index, label } of motorCols) {
      if (isChecked(row[index])) motorSkills.push(label)
    }

    tricks.push({
      name: name || desc?.slice(0, 200) || 'Unnamed',
      name_es: name || undefined,
      description: desc || name || '',
      comentarios: desc || undefined,
      categoria: categoriaRaw || undefined,
      difficulty: normalizeDifficulty(categoriaRaw),
      category: normalizeCategory(program, tipo),
      program: program || undefined,
      url: url || undefined,
      motor_skills: motorSkills.length ? motorSkills : undefined,
      activity_type: tipo || undefined,
      sort_order: tricks.length,
    })
  }

  const output = {
    source: sheetName,
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
