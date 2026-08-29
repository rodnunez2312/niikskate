/**
 * Parse NiikSkate_Tricks_Manual.xlsx → niik-trick-library.json + niik-strength-library.json
 *
 * Skate_Manual sheet → tricks
 *   Columns: Skill, Area, Structure, Type, Program, Comentarios, URL,
 *            Habilidad motriz desarrollada (+ optional motor skill x-columns)
 *
 * Strength_Training sheet → strength exercises
 *   Columns: Ejercicio, Nivel, Pilar principal, Pilar secundario, Parte del cuerpo,
 *            Habilidad motriz desarrollada, Fase de entrenamiento, Aplicación al skate,
 *            Equipo, Duración / Reps, Descanso, Indicaciones del coach, Prioridad de selección
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
const strengthOutPath = join(projectRoot, 'data', 'niik-strength-library.json')
const strengthOutPathPublic = join(projectRoot, 'public', 'data', 'niik-strength-library.json')

/** Seconds charged per rep when the sheet prescribes reps instead of time. */
const SECONDS_PER_REP = 3

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

// ---------------------------------------------------------------------------
// Strength_Training sheet
// ---------------------------------------------------------------------------

const STRENGTH_LEVELS = {
  'básico': 'beginner',
  'basico': 'beginner',
  'principiante': 'beginner',
  'intermedio': 'intermediate',
  'avanzado': 'advanced',
}

const STRENGTH_PILLARS = ['balance', 'coordination', 'mobility', 'power', 'endurance']

const STRENGTH_BODY_AREAS = {
  'neck': 'neck',
  'cuello': 'neck',
  'shoulders': 'shoulders',
  'hombros': 'shoulders',
  'arms': 'arms',
  'brazos': 'arms',
  'core': 'core',
  'lower body': 'lower_body',
  'tren inferior': 'lower_body',
  'ankles': 'ankles',
  'tobillos': 'ankles',
}

const STRENGTH_PHASES = {
  'warm-up': 'warmup',
  'warmup': 'warmup',
  'calentamiento': 'warmup',
  'mobility': 'mobility',
  'movilidad': 'mobility',
  'activation': 'activation',
  'activación': 'activation',
  'activacion': 'activation',
  'balance': 'balance',
  'coordination': 'coordination',
  'coordinación': 'coordination',
  'coordinacion': 'coordination',
  'power': 'power',
  'potencia': 'power',
  'strength': 'strength',
  'fuerza': 'strength',
  'conditioning': 'conditioning',
  'acondicionamiento': 'conditioning',
  'cool-down / stretch': 'stretch',
  'cool-down': 'stretch',
  'stretch': 'stretch',
  'estiramiento': 'stretch',
}

const STRENGTH_PRIORITIES = {
  'primary': 'primary',
  'primario': 'primary',
  'secondary': 'secondary',
  'secundario': 'secondary',
  'support': 'support',
  'soporte': 'support',
}

/** Blank-ish cell: empty, dash, em dash, n/a. */
function isBlankCell(val) {
  const s = (val ?? '').toString().trim()
  return !s || /^[-–—]$/.test(s) || /^n\/?a$/i.test(s)
}

function cleanCell(val) {
  return isBlankCell(val) ? '' : (val ?? '').toString().trim()
}

function slugify(...parts) {
  return parts
    .map(p => (p ?? '').toString().trim())
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function mapEnum(table, val, label, rowRef, { required = false } = {}) {
  const raw = cleanCell(val)
  if (!raw) {
    if (required) throw new Error(`${rowRef}: missing ${label}`)
    return null
  }
  const hit = table[raw.toLowerCase()]
  if (!hit) throw new Error(`${rowRef}: unknown ${label} "${raw}"`)
  return hit
}

function mapPillar(val, rowRef, { required = false } = {}) {
  const raw = cleanCell(val)
  if (!raw) {
    if (required) throw new Error(`${rowRef}: missing pillar`)
    return null
  }
  const id = raw.toLowerCase()
  if (!STRENGTH_PILLARS.includes(id)) throw new Error(`${rowRef}: unknown pillar "${raw}"`)
  return id
}

function mapBodyAreas(val, rowRef) {
  const raw = cleanCell(val)
  if (!raw) return []
  const out = []
  for (const piece of raw.split(/[,;/]/)) {
    const key = piece.trim().toLowerCase()
    if (!key) continue
    const id = STRENGTH_BODY_AREAS[key]
    if (!id) throw new Error(`${rowRef}: unknown body area "${piece.trim()}"`)
    if (!out.includes(id)) out.push(id)
  }
  return out
}

/**
 * "8-10 reps por lado" → { work_seconds: 54, per_side: true, reps: 9 }
 * Range → midpoint; min → x60; reps → x SECONDS_PER_REP; per-side/per-direction → x2.
 */
function parsePrescription(val) {
  const raw = cleanCell(val)
  if (!raw) return { work_seconds: 0, per_side: false, reps: null }

  const lower = raw.toLowerCase()
  const perSide = /por\s+(lado|dirección|direccion|pierna|brazo)|each\s+side|per\s+side/.test(lower)

  const nums = (lower.match(/\d+(?:\.\d+)?/g) || []).map(Number)
  if (!nums.length) return { work_seconds: 0, per_side: perSide, reps: null }
  const value = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0]

  const isMinutes = /\bmin/.test(lower)
  const isSeconds = /\b(seg|sec|s)\b|segundo|second/.test(lower)
  const isReps = /rep/.test(lower)

  let work
  let reps = null
  if (isMinutes) {
    work = value * 60
  } else if (isSeconds) {
    work = value
  } else {
    // Bare counts ("8-12 por lado") and explicit reps both bill as reps.
    reps = value
    work = value * SECONDS_PER_REP
  }
  if (isReps && !isMinutes && !isSeconds) reps = value

  return {
    work_seconds: Math.round(work * (perSide ? 2 : 1)),
    per_side: perSide,
    reps: reps != null ? Math.round(reps) : null,
  }
}

/** Rest is always a duration; blank / "—" means none. */
function parseRestSeconds(val) {
  const raw = cleanCell(val)
  if (!raw) return 0
  const lower = raw.toLowerCase()
  const nums = (lower.match(/\d+(?:\.\d+)?/g) || []).map(Number)
  if (!nums.length) return 0
  const value = nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0]
  return Math.round(/\bmin/.test(lower) ? value * 60 : value)
}

function parseStrengthSheet(workbook) {
  const sheetName = workbook.SheetNames.find(n => /strength/i.test(n))
  if (!sheetName) {
    console.warn('No Strength_Training sheet found; skipping strength library.')
    return null
  }

  const raw = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' })
  const headerRow = (raw[0] || []).map(c => (c ?? '').toString().trim())

  const col = (...keywords) => findHeaderIndex(headerRow, ...keywords)
  const cEjercicio = col('Ejercicio', 'Exercise')
  const cNivel = col('Nivel')
  const cPilar1 = col('Pilar principal')
  const cPilar2 = col('Pilar secundario')
  const cCuerpo = col('Parte del cuerpo')
  const cMotriz = col('Habilidad motriz')
  const cFase = col('Fase de entrenamiento')
  const cAplicacion = col('Aplicación al skate', 'Aplicacion al skate')
  const cEquipo = col('Equipo')
  const cDuracion = col('Duración / Reps', 'Duración', 'Duracion')
  const cDescanso = col('Descanso')
  const cIndicaciones = col('Indicaciones del coach', 'Indicaciones')
  const cPrioridad = col('Prioridad de selección', 'Prioridad')

  if (cEjercicio < 0) throw new Error('Strength sheet: "Ejercicio" column not found')

  const exercises = []
  const slugs = new Set()

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i]
    const name = cleanCell(row[cEjercicio])
    if (!name) continue

    const rowRef = `Strength row ${i + 1} ("${name}")`
    const level = mapEnum(STRENGTH_LEVELS, row[cNivel], 'Nivel', rowRef, { required: true })
    const slug = slugify(name, cleanCell(row[cNivel]))
    if (slugs.has(slug)) {
      throw new Error(`${rowRef}: duplicate Ejercicio + Nivel. Each pair must be unique.`)
    }
    slugs.add(slug)

    const prescription = cleanCell(row[cDuracion])
    const { work_seconds, per_side, reps } = parsePrescription(prescription)
    const rest_seconds = parseRestSeconds(row[cDescanso])
    const equipment = cleanCell(row[cEquipo])

    exercises.push({
      slug,
      name,
      level,
      pillar_primary: mapPillar(row[cPilar1], rowRef, { required: true }),
      pillar_secondary: mapPillar(row[cPilar2], rowRef),
      body_areas: mapBodyAreas(row[cCuerpo], rowRef),
      motor_skill_es: cleanCell(row[cMotriz]) || null,
      training_phase: mapEnum(STRENGTH_PHASES, row[cFase], 'Fase de entrenamiento', rowRef, {
        required: true,
      }),
      skate_application_es: cleanCell(row[cAplicacion]) || null,
      equipment_es: /^ninguno$|^none$/i.test(equipment) ? null : equipment || null,
      prescription_es: prescription || null,
      rest_es: cleanCell(row[cDescanso]) || null,
      coach_cue_es: cleanCell(row[cIndicaciones]) || null,
      priority:
        mapEnum(STRENGTH_PRIORITIES, row[cPrioridad], 'Prioridad de selección', rowRef) || 'primary',
      work_seconds,
      rest_seconds,
      per_side,
      reps,
      est_seconds: work_seconds + rest_seconds,
      // Heuristic: advanced work is gated out of tots/kids sessions until reviewed.
      kid_safe: level !== 'advanced',
      sort_order: exercises.length + 1,
    })
  }

  const missingMotor = exercises.filter(e => !e.motor_skill_es).map(e => e.name)
  if (missingMotor.length) {
    console.warn(
      `Warning: ${missingMotor.length} exercise(s) missing "Habilidad motriz desarrollada": ${missingMotor.join(', ')}`,
    )
  }

  return { sheetName, exercises }
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

  const strength = parseStrengthSheet(workbook)
  if (strength) {
    const strengthOutput = {
      source: strength.sheetName,
      sourceFile: excelPath.split(/[/\\]/).pop(),
      generatedAt: new Date().toISOString(),
      secondsPerRep: SECONDS_PER_REP,
      exercises: strength.exercises,
    }
    const strengthStr = JSON.stringify(strengthOutput, null, 2)
    writeFileSync(strengthOutPath, strengthStr, 'utf8')
    writeFileSync(strengthOutPathPublic, strengthStr, 'utf8')

    const stretch = strength.exercises.filter(e => e.training_phase === 'stretch')
    const stretchSeconds = stretch.reduce((n, e) => n + e.est_seconds, 0)
    console.log('Wrote', strength.exercises.length, 'strength exercises to', strengthOutPath)
    console.log(
      `Stretch block: ${stretch.length} exercises, ${Math.floor(stretchSeconds / 60)}m ${stretchSeconds % 60}s`,
    )
  }
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
