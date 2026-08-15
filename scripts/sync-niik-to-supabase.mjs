/**
 * Sync niik-trick-library.json to Supabase skills_library table.
 * One row per Excel column A (manual_id) — exactly 320 active tricks after sync.
 *
 * Run: npm run niik:sync
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const jsonPath = join(projectRoot, 'data', 'niik-trick-library.json')

function loadEnv() {
  const envPath = join(projectRoot, '.env')
  if (!existsSync(envPath)) return {}
  const content = readFileSync(envPath, 'utf8')
  const env = {}
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return env
}

function buildRow(t) {
  const manualId = t.manual_id ?? (t.sort_order > 0 ? t.sort_order : null)
  if (manualId == null || manualId < 1) {
    throw new Error(`Trick "${t.name}" missing manual_id (# column)`)
  }
  return {
    manual_id: manualId,
    name: t.name || 'Unnamed',
    name_es: t.name_es || null,
    description: t.comentarios || t.description || '',
    description_es: t.description_es || null,
    difficulty: t.difficulty || 'beginner',
    category: t.category || 'iniciacion',
    categoria: t.structure || t.categoria || null,
    area: t.area || null,
    structure: t.structure || null,
    trick_type: t.trick_type || null,
    video_url: t.url || null,
    sort_order: manualId,
    motor_skills: t.motor_skills || [],
    is_active: true,
    program: t.program || null,
  }
}

async function main() {
  const env = loadEnv()
  const url = env.SUPABASE_URL || process.env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY in .env')
    process.exit(1)
  }
  if (!existsSync(jsonPath)) {
    console.error('JSON not found. Run: npm run niik:parse')
    process.exit(1)
  }

  const raw = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const tricks = raw?.tricks || []
  if (tricks.length === 0) {
    console.log('No tricks in JSON.')
    process.exit(0)
  }

  const manualIds = new Set()
  const rows = tricks.map(t => {
    const row = buildRow(t)
    if (manualIds.has(row.manual_id)) {
      throw new Error(`Duplicate manual_id #${row.manual_id}`)
    }
    manualIds.add(row.manual_id)
    return row
  })

  const supabase = createClient(url, key)

  const { data: beforeRows } = await supabase
    .from('skills_library')
    .select('manual_id')
    .in('manual_id', [...manualIds])
  const existingManualIds = new Set((beforeRows || []).map(r => Number(r.manual_id)))

  const { data: deactivated } = await supabase
    .from('skills_library')
    .update({ is_active: false })
    .eq('is_active', true)
    .select('id')
  console.log('Deactivated', deactivated?.length ?? 0, 'rows before upsert')

  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50)
    const { error } = await supabase.from('skills_library').upsert(chunk, { onConflict: 'manual_id' })
    if (error) {
      console.error('Upsert failed:', error.message)
      console.error('Run migration: supabase/migrations/add_skills_library_manual_id_unique.sql')
      process.exit(1)
    }
  }

  const inserted = rows.filter(r => !existingManualIds.has(r.manual_id)).length
  console.log('Inserted', inserted, 'new · Updated', rows.length - inserted)

  const { count: activeCount } = await supabase
    .from('skills_library')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  console.log('Active tricks now:', activeCount, '(expected', rows.length, ')')
  if (activeCount !== rows.length) {
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err.message)
  process.exit(1)
})
