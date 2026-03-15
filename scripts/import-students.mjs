/**
 * Bulk import students into Supabase auth + profiles.
 *
 * Requirements:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 *
 * Run:
 *   node scripts/import-students.mjs
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const students = [
  { status: 'Active', firstName: 'Rodrigo', lastName: 'Sanchez Reyes', city: 'Merida', age: 13, levelEs: 'Intermedio', dob: '06/08/12' },
  { status: 'Active', firstName: 'Itza', lastName: 'Sanchez Reyes', city: 'Merida', age: 16, levelEs: 'Intermedio', dob: '12/23/09' },
  { status: 'Active', firstName: 'Jorge', lastName: 'Esma Vazquez', city: 'Merida', age: 11, levelEs: 'Intermedio', dob: '11/27/14' },
  { status: 'Active', firstName: 'Kyan', lastName: 'Bell', city: 'Merida', age: 13, levelEs: 'Principiante', dob: '05/22/12' },
  { status: 'Active', firstName: 'Brooklyn', lastName: 'Haapamaki', city: 'Merida', age: 7, levelEs: 'Principiante', dob: '02/19/19' },
  { status: 'Active', firstName: 'Edward', lastName: 'Hill Gomez', city: 'Merida', age: 7, levelEs: 'Principiante', dob: '03/19/18' },
  { status: 'Active', firstName: 'Bruno', lastName: 'Cutz', city: 'Merida', age: 126, levelEs: 'Principiante', dob: '' },
  { status: 'Active', firstName: 'Derek', lastName: '', city: 'Merida', age: 126, levelEs: 'Intermedio', dob: '' },
  { status: 'Active', firstName: 'Angel Paul', lastName: 'Uc Alcocer', city: 'Merida', age: 10, levelEs: 'Principiante', dob: '03/23/15' },
  { status: 'Active', firstName: 'Isaac', lastName: 'Gonzalez Caro', city: 'Merida', age: 7, levelEs: 'Principiante', dob: '05/26/18' },
  { status: 'Active', firstName: 'Fabrizio', lastName: '', city: 'Merida', age: null, levelEs: 'Principiante', dob: '' },
  { status: 'Active', firstName: 'Alaia Rose', lastName: 'Dominguez Martin', city: 'Merida', age: 8, levelEs: 'Principiante', dob: '04/08/17' },
]

const tempPassword = process.env.STUDENT_DEFAULT_PASSWORD || 'NiikTemp123!'

const normalize = (value) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')

const makeEmailBase = (firstName, lastName) => {
  const f = normalize(firstName)
  const l = normalize(lastName)
  if (f && l) return `${f}.${l}`
  return f || l || 'student'
}

const levelToEn = (levelEs) => {
  const value = (levelEs || '').toLowerCase()
  if (value.includes('intermedio')) return 'intermediate'
  if (value.includes('avanz')) return 'advanced'
  return 'beginner'
}

async function createOrSkipStudent(student, usedEmails) {
  const fullName = `${student.firstName || ''} ${student.lastName || ''}`.trim()
  const base = makeEmailBase(student.firstName, student.lastName)
  let email = `${base}@students.niik.local`
  let i = 2
  while (usedEmails.has(email)) {
    email = `${base}.${i}@students.niik.local`
    i += 1
  }
  usedEmails.add(email)

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      source: 'manual-bulk-import',
      status: student.status,
      city: student.city || null,
      age: Number.isFinite(student.age) ? student.age : null,
      level_es: student.levelEs || null,
      level: levelToEn(student.levelEs),
      dob_raw: student.dob || null,
    },
  })

  if (authError) {
    if (authError.message?.toLowerCase().includes('already registered')) {
      console.log(`SKIP existing: ${email} (${fullName})`)
      return { created: false, skipped: true, email, fullName }
    }
    throw new Error(`Failed creating auth user ${fullName}: ${authError.message}`)
  }

  const userId = authData?.user?.id
  if (!userId) throw new Error(`No user id returned for ${fullName}`)

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email,
        full_name: fullName,
        role: 'customer',
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    )

  if (profileError) {
    throw new Error(`Profile upsert failed for ${fullName}: ${profileError.message}`)
  }

  console.log(`CREATED: ${email} (${fullName})`)
  return { created: true, skipped: false, email, fullName }
}

async function main() {
  const usedEmails = new Set()
  let created = 0
  let skipped = 0

  for (const student of students) {
    const result = await createOrSkipStudent(student, usedEmails)
    if (result.created) created += 1
    if (result.skipped) skipped += 1
  }

  console.log('\nImport complete')
  console.log(`Created: ${created}`)
  console.log(`Skipped (already exists): ${skipped}`)
  console.log(`Temp password used: ${tempPassword}`)
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
