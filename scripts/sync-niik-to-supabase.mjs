/**
 * Sync niik-trick-library.json to Supabase skills_library table.
 * Run after updating Niik_Plan_Clases.xlsx and running: npm run niik:parse
 *
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) in .env
 * Run: node scripts/sync-niik-to-supabase.mjs
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

function normalizeSkillKey(value) {
  if (value == null || value === '') return ''
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function main() {
  const env = loadEnv()
  const url = env.SUPABASE_URL || process.env.SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY/SUPABASE_SERVICE_ROLE_KEY in .env')
    process.exit(1)
  }

  if (!existsSync(jsonPath)) {
    console.error('JSON not found. Run: npm run niik:parse')
    process.exit(1)
  }

  const raw = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const tricks = raw?.tricks || []
  if (tricks.length === 0) {
    console.log('No tricks in JSON. Exiting.')
    process.exit(0)
  }

  const supabase = createClient(url, key)
  const niikNameSet = new Set()

  // Build rows and normalize keys for matching
  for (const t of tricks) {
    const k1 = normalizeSkillKey(t.name_es || t.name || '')
    const k2 = normalizeSkillKey(t.name)
    if (k1) niikNameSet.add(k1)
    if (k2) niikNameSet.add(k2)
  }

  let existing
  let existingError
  try {
    const result = await supabase
      .from('skills_library')
      .select('id, name, name_es')
    existing = result.data
    existingError = result.error
  } catch (err) {
    console.error('Failed to reach Supabase (network error):', err.message)
    console.error('Tip: Sync from the app instead — open Coaching → Trucos and hard-refresh (Ctrl+F5).')
    if (err.cause) console.error('Cause:', err.cause.message || err.cause)
    process.exit(1)
  }
  if (existingError) {
    console.error('Failed to fetch skills_library:', existingError.message)
    const isNetwork = /fetch failed|ECONNREFUSED|ENOTFOUND|network|timeout|certificate/i.test(String(existingError.message || ''))
    if (isNetwork) {
      console.error('')
      console.error('Tip: Parse succeeded (160 tricks in JSON). Sync from the app instead:')
      console.error('  Run "npm run dev", open Coaching → Trucos, click "Sincronizar desde Excel", then hard-refresh (Ctrl+F5).')
    }
    process.exit(1)
  }

  const byName = new Map()
  for (const s of existing || []) {
    const n1 = normalizeSkillKey(s.name)
    const n2 = normalizeSkillKey(s.name_es)
    if (n1) byName.set(n1, s.id)
    if (n2) byName.set(n2, s.id)
  }

  const toInsert = []
  const toUpdate = []
  for (const t of tricks) {
    const key = normalizeSkillKey(t.name_es || t.name || '')
    const keyAlt = normalizeSkillKey(t.name)
    const existingId = byName.get(key) ?? byName.get(keyAlt)
    const row = {
      name: t.name || 'Unnamed',
      name_es: t.name_es || null,
      description: t.comentarios || t.description || '',
      description_es: t.description_es || null,
      difficulty: t.difficulty || 'beginner',
      category: t.category || 'iniciacion',
      categoria: t.categoria || null,
      video_url: t.url || null,
      sort_order: t.sort_order ?? 0,
      motor_skills: t.motor_skills || [],
      is_active: true,
      program: t.program || null,
    }
    if (existingId) {
      toUpdate.push({ id: existingId, row })
    } else {
      toInsert.push(row)
    }
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from('skills_library').insert(toInsert)
    if (error) {
      console.error('Insert failed:', error.message)
      process.exit(1)
    }
    console.log('Inserted', toInsert.length, 'new tricks')
  }

  for (const { id, row } of toUpdate) {
    const { error } = await supabase.from('skills_library').update(row).eq('id', id)
    if (error) {
      console.error('Update failed for', id, error.message)
      process.exit(1)
    }
  }
  if (toUpdate.length > 0) {
    console.log('Updated', toUpdate.length, 'existing tricks')
  }

  const toDeactivate = (existing || []).filter((s) => {
    const n1 = normalizeSkillKey(s.name)
    const n2 = normalizeSkillKey(s.name_es)
    return !niikNameSet.has(n1) && !niikNameSet.has(n2)
  })
  if (toDeactivate.length > 0) {
    const ids = toDeactivate.map((s) => s.id)
    const { error } = await supabase.from('skills_library').update({ is_active: false }).in('id', ids)
    if (error) {
      console.error('Deactivate failed:', error.message)
      process.exit(1)
    }
    console.log('Deactivated', toDeactivate.length, 'legacy skills')
  }

  console.log('Sync complete. Total tricks in file:', tricks.length)
}

main().catch((err) => {
  console.error('Error:', err.message)
  if (err.cause) {
    console.error('Cause:', err.cause.code || err.cause.message || err.cause)
  }
  if (err.message === 'fetch failed' || err.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || err.cause?.code === 'ECONNREFUSED' || err.cause?.code === 'ENOTFOUND') {
    console.error('')
    console.error('Tip: Sync from the app instead — run "npm run dev", open Coaching → Trucos, then hard-refresh (Ctrl+F5).')
  }
  process.exit(1)
})
