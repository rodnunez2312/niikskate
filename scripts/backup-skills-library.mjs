/**
 * Back up the trick library (Bolsa de trucos) from Supabase into the repo.
 * The app is the source of truth; this snapshot is what gets committed.
 *
 * Writes:
 *   backups/skills_library.json          every row, in library order
 *   backups/skills_library.xlsx          same data as a spreadsheet
 *   backups/skills_library_changes.json  latest change history
 *
 * Run: npm run niik:backup   (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env or the environment)
 */

import { createClient } from '@supabase/supabase-js'
import XLSX from 'xlsx'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(projectRoot, 'backups')
const PAGE = 1000
const HISTORY_LIMIT = 5000

function loadEnv() {
  const envPath = join(projectRoot, '.env')
  if (!existsSync(envPath)) return {}
  const env = {}
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

async function fetchAll(query) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

function fail(message) {
  // On GitHub Actions this becomes a run annotation, visible without opening the log.
  const line = String(message).replace(/\s*\n\s*/g, ' / ')
  console.error(process.env.GITHUB_ACTIONS ? `::error title=Trick library backup::${line}` : line)
  process.exit(1)
}

// Describes the shape of the secrets without printing them.
function checkCredentials(url, key) {
  const problems = []
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) {
    const hints = []
    if (!url.startsWith('https://')) hints.push('does not start with https://')
    if (url.endsWith('/')) hints.push('ends with /')
    if (url.includes('/rest/') || url.includes('/dashboard')) hints.push('contains a path')
    if (/\s/.test(url)) hints.push('contains spaces or line breaks')
    if (/["']/.test(url)) hints.push('contains quotes')
    if (hints.length) problems.push(`SUPABASE_URL should be exactly https://<project>.supabase.co (it ${hints.join(', ')})`)
  }
  if (/\s|["']/.test(key)) problems.push('SUPABASE_SERVICE_ROLE_KEY contains spaces, line breaks or quotes')
  if (key.startsWith('sb_publishable_')) problems.push('SUPABASE_SERVICE_ROLE_KEY is a publishable key, not a secret key')
  if (key.startsWith('eyJ')) {
    try {
      const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role
      if (role !== 'service_role') problems.push(`SUPABASE_SERVICE_ROLE_KEY has role "${role}", expected "service_role"`)
    } catch {
      problems.push('SUPABASE_SERVICE_ROLE_KEY looks like a JWT but is not readable (copied partially?)')
    }
  } else if (!key.startsWith('sb_secret_') && !key.startsWith('sb_publishable_')) {
    problems.push('SUPABASE_SERVICE_ROLE_KEY does not look like a Supabase key (should start with eyJ or sb_secret_)')
  }
  return problems
}

async function main() {
  const env = loadEnv()
  const url = (process.env.SUPABASE_URL || env.SUPABASE_URL || '').trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '').trim()
  if (!url || !key) fail(`Missing ${!url ? 'SUPABASE_URL' : 'SUPABASE_SERVICE_ROLE_KEY'}`)
  const problems = checkCredentials(url, key)
  if (problems.length) fail(problems.join('; '))
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  const skills = await fetchAll(() => supabase
    .from('skills_library')
    .select('*')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('manual_id', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true }))

  let history = []
  const { data: historyData, error: historyError } = await supabase
    .from('skills_library_changes')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  if (historyError) console.warn(`History skipped: ${historyError.message}`)
  else history = historyData

  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'skills_library.json'), `${JSON.stringify(skills, null, 2)}\n`, 'utf8')
  writeFileSync(join(outDir, 'skills_library_changes.json'), `${JSON.stringify(history, null, 2)}\n`, 'utf8')

  const sheetRows = skills.map(sk => ({
    '#': sk.sort_order ?? '',
    'Excel #': sk.manual_id ?? '',
    Habilidad: sk.name_es || sk.name || '',
    Name: sk.name || '',
    Structure: sk.structure || sk.categoria || '',
    Area: sk.area || '',
    Type: sk.trick_type || '',
    Program: sk.program || '',
    Difficulty: sk.difficulty || '',
    Rareza: sk.rarity || '',
    Video: sk.video_url || '',
    Comentarios: sk.description || '',
    'Habilidad motriz': Array.isArray(sk.motor_skills) ? sk.motor_skills.join(', ') : '',
    Activo: sk.is_active ? 'Sí' : 'No',
    id: sk.id,
  }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sheetRows), 'Skate_Manual')
  XLSX.writeFile(book, join(outDir, 'skills_library.xlsx'))

  const active = skills.filter(sk => sk.is_active).length
  console.log(`Backed up ${skills.length} tricks (${active} active) and ${history.length} history entries to backups/`)
}

main().catch((e) => {
  fail([...new Set([e?.message, e?.code, e?.details, e?.hint, e?.cause?.message].filter(Boolean))].join(' | ') || String(e))
})
