/**
 * Parse NiikSkate_Tricks_Manual.xlsx → niik-trick-library.json
 *
 * Columns: Skill, Area, Structure, Type, Program, Comentarios, URL,
 *          Habilidad motriz desarrollada (+ optional motor skill x-columns)
 *
 * Run: npm run niik:parse
 */

import XLSX from 'xlsx'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

function resolveExcelPath() {
  const candidates = [
    join(projectRoot, 'data', 'Niik_source', 'NiikSkate_Ticks_Manual.xlsx'),
    join(projectRoot, 'data', 'Niik_source', 'NiikSkate_Tricks_Manual.xlsx'),
    join(projectRoot, 'data', 'Niik_source', 'Niik_Plan_Clases.xlsx'),
    join(projectRoot, 'data', 'Niik_Plan_Clases.xlsx'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

const excelPath = resolveExcelPath()
const outPath = join(projectRoot, 'data', 'niik-trick-library.json')
const outPathPublic = join(projectRoot, 'public', 'data', 'niik-trick-library.json')

const MOTOR_LABELS = [
  'Coordinación',
  'Balance',
  'Resistencia',
  'Core',
  'Fuerza en Piernas',
  'Agilidad',
  'Confianza',
  'Tiempo de Reacción',
  'Control de Tabla',
  'Estabilidad',
]

function findHeaderIndex(headerRow, ...keywords) {
  for (let i = 0; i < headerRow.length; i++) {
    const cell = (headerRow[i] || '').toString().trim().toLowerCase()
    if (keywords.some(k => cell === k.toLowerCase() || cell.includes(k.toLowerCase()))) return i
  }
  return -1
}

function findHashColumnIndex(headerRow) {
  for (let i = 0; i < headerRow.length; i++) {
    if ((headerRow[i] || '').toString().trim() === '#') return i
  }
  return -1
}

function parseManualId(val) {
  if (val == null || val === '') return null
  const n = parseInt(String(val).trim(), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function normalizeStructure(val) {
  const s = (val || '').toString().trim()
  if (!s) return ''
  if (s === '0 - Warmup') return 'Strength Training'
  if (/stregth training/i.test(s)) return 'Strength Training'
  if (/^strength training$/i.test(s)) return 'Strength Training'
  return s
}

function normalizeDifficulty(structure) {
  if (!structure || typeof structure !== 'string') return 'beginner'
  const v = structure.toLowerCase().trim()
  if (/strength training|warmup|level 1|level 2/.test(v)) return 'beginner'
  if (/level 3|level 4/.test(v)) return 'intermediate'
  if (/level 5|advanced/.test(v)) return 'advanced'
  return 'beginner'
}

function normalizeCategory(area, program, tipo) {
  const t = (tipo || '').toString().toLowerCase().trim()
  if (/exercise|drill/.test(t) && program === 'Strength Training') return 'excercise'
  const a = (area || '').toString().toLowerCase().trim()
  if (a === 'warmup') return 'excercise'
  if (a === 'street') return 'street'
  if (['park', 'bowl', 'mini ramp', 'vert'].includes(a)) return 'vert_bowl'
  if (program === 'Foundations' || program === 'Beginners') return 'iniciacion'
  return 'iniciacion'
}

function isChecked(val) {
  if (val == null) return false
  const s = (val + '').trim().toLowerCase()
  if (!s) return false
  if (/^[x1sísiy✓✔+]$/.test(s)) return true
  if (s === 'yes' || s === 'true') return true
  return false
}

function main() {
  if (!existsSync(excelPath)) {
    console.error('Excel not found. Expected:', excelPath)
    process.exit(1)
  }

  const workbook = XLSX.readFile(excelPath)
  const sheetName =
    workbook.SheetNames.find(n => /skate_manual|manual|trucos/i.test(n))
    || workbook.SheetNames[0]
  console.log('File:', excelPath)
  console.log('Sheet:', sheetName)

  const sheet = workbook.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  if (raw.length < 2) {
    console.error('Sheet has no data rows.')
    process.exit(1)
  }

  let headerRow = null
  let dataStartIndex = 0
  for (let r = 0; r < Math.min(10, raw.length); r++) {
    const row = raw[r].map(c => (c ?? '').toString().trim())
    const idx = findHeaderIndex(row, 'Skill', 'Truco')
    if (idx >= 0) {
      headerRow = row
      dataStartIndex = r + 1
      break
    }
  }

  if (!headerRow) {
    console.error('Header row with "Skill" not found.')
    process.exit(1)
  }

  const colSkill = findHeaderIndex(headerRow, 'Skill', 'Truco')
  const colNum = findHashColumnIndex(headerRow)
  const colArea = findHeaderIndex(headerRow, 'Area')
  const colStructure = findHeaderIndex(headerRow, 'Structure', 'Categoria', 'Categoría')
  const colType = findHeaderIndex(headerRow, 'Type', 'Tipo')
  const colProgram = findHeaderIndex(headerRow, 'Program')
  const colComentarios = findHeaderIndex(headerRow, 'Comentarios')
  const colUrl = findHeaderIndex(headerRow, 'URL')
  const colMotorText = findHeaderIndex(headerRow, 'Habilidad motriz desarrollada')

  const motorCols = []
  for (let c = 0; c < headerRow.length; c++) {
    const h = (headerRow[c] || '').trim()
    const match = MOTOR_LABELS.find(l => h === l || h.toLowerCase().includes(l.toLowerCase()))
    if (match) motorCols.push({ index: c, label: match })
  }

  const tricks = []
  for (let i = dataStartIndex; i < raw.length; i++) {
    const row = raw[i]
    const name = (row[colSkill] ?? '').toString().trim()
    if (!name) continue

    const area = colArea >= 0 ? (row[colArea] ?? '').toString().trim() : ''
    const structureRaw = colStructure >= 0 ? (row[colStructure] ?? '').toString().trim() : ''
    const structure = normalizeStructure(structureRaw)
    const trickType = colType >= 0 ? (row[colType] ?? '').toString().trim() : ''
    const program = colProgram >= 0 ? (row[colProgram] ?? '').toString().trim() : ''
    const desc = colComentarios >= 0 ? (row[colComentarios] ?? '').toString().trim() : ''
    const url = colUrl >= 0 ? (row[colUrl] ?? '').toString().trim() : ''
    const motorText =
      colMotorText >= 0 ? (row[colMotorText] ?? '').toString().trim() : ''

    const motorSkills = []
    for (const { index, label } of motorCols) {
      if (isChecked(row[index])) motorSkills.push(label)
    }
    if (motorText && !motorSkills.length) {
      motorText.split(/[,;]/).map(s => s.trim()).filter(Boolean).forEach(s => motorSkills.push(s))
    }

    const manualId = colNum >= 0 ? parseManualId(row[colNum]) : null

    tricks.push({
      manual_id: manualId ?? undefined,
      name,
      name_es: name,
      description: desc || name,
      comentarios: desc || undefined,
      area: area || undefined,
      structure: structure || undefined,
      trick_type: trickType || undefined,
      categoria: structure || undefined,
      difficulty: normalizeDifficulty(structure),
      category: normalizeCategory(area, program, trickType),
      program: program || undefined,
      url: url || undefined,
      motor_skills: motorSkills.length ? motorSkills : undefined,
      activity_type: trickType || undefined,
      sort_order: manualId ?? tricks.length + 1,
    })
  }

  tricks.sort((a, b) => (a.sort_order ?? 999999) - (b.sort_order ?? 999999))

  const output = {
    source: sheetName,
    sourceFile: excelPath.split(/[/\\]/).pop(),
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
  console.log('Wrote', tricks.length, 'tricks to', outPath)
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
