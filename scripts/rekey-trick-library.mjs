/**
 * Emit a manual_id re-key migration for skills_library.
 *
 * skills_library upserts on manual_id (Excel column A). Deleting or reordering
 * rows in NiikSkate_Ticks_Manual.xlsx shifts every # below the edit, so a plain
 * "Sync from Excel" rewrites rows in place and silently re-points skaters'
 * completed tricks and trick bags at whatever trick inherited their number.
 *
 * This diffs the committed niik-trick-library.json (what the DB currently holds)
 * against the regenerated one and writes SQL that moves each trick to its new #
 * by identity instead of by position.
 *
 * Usage:
 *   git show HEAD:public/data/niik-trick-library.json > old.json
 *   npm run niik:parse
 *   node scripts/rekey-trick-library.mjs old.json supabase/migrations/<name>.sql
 */

import { readFileSync, writeFileSync } from 'fs'

const [, , oldPath, outPath] = process.argv
if (!oldPath || !outPath) {
  console.error('Usage: node scripts/rekey-trick-library.mjs <old.json> <out.sql>')
  process.exit(1)
}

const norm = s => (s || '').toString().trim().replace(/\s+/g, ' ').toLowerCase()
/** A trick's identity in the manual: what it is, where it is skated, at what level. */
const identity = t => [norm(t.name), norm(t.area), norm(t.structure)].join('|')

const readJson = p => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''))
const oldJ = readJson(oldPath)
const newJ = readJson('public/data/niik-trick-library.json')

/** Bucket by identity in sheet order, so the Nth copy pairs with the Nth copy. */
const bucket = (tricks, keyFn) => {
  const m = new Map()
  for (const t of [...tricks].sort((a, b) => a.manual_id - b.manual_id)) {
    const k = keyFn(t)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(t)
  }
  return m
}

const oldB = bucket(oldJ.tricks, identity)
const newB = bucket(newJ.tricks, identity)

const mapping = []
const merges = []
let leftoverOld = []
let leftoverNew = []

for (const [k, olds] of oldB) {
  const news = newB.get(k) || []
  for (let i = 0; i < olds.length; i++) {
    if (i < news.length) mapping.push({ oldId: olds[i].manual_id, newId: news[i].manual_id, name: olds[i].name })
    else if (news.length > 0) merges.push({ loserId: olds[i].manual_id, winnerId: olds[0].manual_id, name: olds[i].name })
    else leftoverOld.push(olds[i])
  }
}
for (const [k, news] of newB) {
  const olds = oldB.get(k) || []
  for (let i = olds.length; i < news.length; i++) leftoverNew.push(news[i])
}

// Second pass: a trick whose area or level was corrected in the sheet is the same
// trick, so follow it by name rather than retiring it and inserting a stranger.
const movedByName = []
const leftoverNewByName = bucket(leftoverNew, t => norm(t.name))
const consumed = new Set()
for (const o of [...leftoverOld].sort((a, b) => a.manual_id - b.manual_id)) {
  const candidates = leftoverNewByName.get(norm(o.name)) || []
  const hit = candidates.find(c => !consumed.has(c.manual_id))
  if (!hit) continue
  consumed.add(hit.manual_id)
  mapping.push({ oldId: o.manual_id, newId: hit.manual_id, name: o.name })
  movedByName.push({ oldId: o.manual_id, newId: hit.manual_id, name: o.name })
}
leftoverOld = leftoverOld.filter(o => !movedByName.some(m => m.oldId === o.manual_id))
leftoverNew = leftoverNew.filter(n => !consumed.has(n.manual_id))

const retired = leftoverOld.map(t => ({ oldId: t.manual_id, name: t.name }))
const inserts = leftoverNew.map(t => ({ newId: t.manual_id, name: t.name }))

// ---------------------------------------------------------------------------
// Sanity checks — a bad mapping is worse than no migration.
// ---------------------------------------------------------------------------
const die = msg => { console.error('ABORT:', msg); process.exit(1) }

const oldIds = mapping.map(m => m.oldId)
const newIds = mapping.map(m => m.newId)
if (new Set(oldIds).size !== oldIds.length) die('an old manual_id is mapped twice')
if (new Set(newIds).size !== newIds.length) die('two tricks map onto the same new manual_id')
if (mapping.length + merges.length + retired.length !== oldJ.tricks.length) die('old rows unaccounted for')
if (mapping.length + inserts.length !== newJ.tricks.length) die('new rows unaccounted for')
// The mapping is emitted inside a $$-quoted DO block.
const clashes = mapping.filter(m => m.name.includes('$$'))
if (clashes.length) die(`trick name contains $$ and would break dollar quoting: ${clashes[0].name}`)

console.log(`mapped ${mapping.length} (of which ${movedByName.length} followed by name)`)
console.log(`merged duplicates ${merges.length}, retired ${retired.length}, inserted by sync ${inserts.length}`)
for (const m of movedByName) console.log(`   moved  #${m.oldId} -> #${m.newId}  ${m.name}`)
for (const m of merges) console.log(`   merge  #${m.loserId} -> #${m.winnerId}  ${m.name}`)
for (const r of retired) console.log(`   retire #${r.oldId}  ${r.name}`)
for (const i of inserts) console.log(`   new    #${i.newId}  ${i.name}`)

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------
const q = s => `'${String(s).replace(/'/g, "''")}'`
const OFFSET = 1000000
const oldCount = oldJ.tricks.length
const newCount = newJ.tricks.length

mapping.sort((a, b) => a.oldId - b.oldId)
merges.sort((a, b) => a.loserId - b.loserId)
retired.sort((a, b) => a.oldId - b.oldId)

/** Numbers in aligned rows so the arrays stay skimmable. */
const intArray = (nums, perLine = 16) => {
  const rows = []
  for (let i = 0; i < nums.length; i += perLine) {
    rows.push('    ' + nums.slice(i, i + perLine).map(n => String(n).padStart(3)).join(', '))
  }
  return rows.join(',\n')
}

/** Names one per line, each annotated with the move it belongs to. */
const nameArray = entries => {
  const pad = Math.min(64, Math.max(...entries.map(e => q(e.name).length)) + 1)
  return entries
    .map((e, i) => {
      const lit = q(e.name) + (i < entries.length - 1 ? ',' : '')
      return `    ${lit.padEnd(pad)} -- #${e.oldId} -> #${e.newId}`
    })
    .join('\n')
}

const sql = `-- Re-key skills_library.manual_id after tricks were removed from NiikSkate_Ticks_Manual.xlsx
-- (${oldCount} rows -> ${newCount} rows). Deleting duplicates renumbered Excel column A, so all but
-- a couple of tricks now sit at a different #. skills_library upserts on manual_id,
-- so syncing without re-keying first would rewrite rows in place and silently
-- re-point every skater's completed tricks and trick bag at the wrong trick.
--
-- RUN THIS BEFORE the next "Sincronizar Excel".
--
-- Tricks are matched by identity (name + area + structure), not by position:
--   ${String(mapping.length).padStart(3)} moved to a new #, keeping their UUID and all skater progress
--   ${String(merges.length).padStart(3)} duplicate row(s) folded into the surviving copy, progress carried over
--   ${String(retired.length).padStart(3)} dropped from the sheet, deactivated rather than deleted so no FK is orphaned
--   ${String(inserts.length).padStart(3)} genuinely new, left for the sync to insert
--
-- Generated by scripts/rekey-trick-library.mjs. Re-runnable: it no-ops once applied.
--
-- One DO block on purpose: the Supabase SQL editor does not keep temp tables alive
-- between statements, and a single statement either applies whole or rolls back.

DO $$
DECLARE
  -- Tricks that stay, listed old # -> new #. The three arrays are parallel.
  v_old INTEGER[] := ARRAY[
${intArray(mapping.map(m => m.oldId))}
  ];
  v_new INTEGER[] := ARRAY[
${intArray(mapping.map(m => m.newId))}
  ];
  v_name TEXT[] := ARRAY[
${nameArray(mapping)}
  ];

  -- Duplicate rows folded into the copy that survived.
  v_lose INTEGER[] := ARRAY[${merges.map(m => m.loserId).join(', ')}];
  v_win  INTEGER[] := ARRAY[${merges.map(m => m.winnerId).join(', ')}];

  -- Dropped from the sheet entirely.
  v_retire INTEGER[] := ARRAY[
${intArray(retired.map(r => r.oldId))}
  ];

  v_pre      INTEGER;
  v_post     INTEGER;
  v_mismatch TEXT;
  v_moved    INTEGER;
  v_merged   INTEGER;
  v_retired  INTEGER;
BEGIN
  IF array_length(v_old, 1) <> ${mapping.length}
     OR array_length(v_new, 1) <> ${mapping.length}
     OR array_length(v_name, 1) <> ${mapping.length} THEN
    RAISE EXCEPTION 'Mapping arrays are not all ${mapping.length} long; the migration file is corrupt.';
  END IF;

  -- Which layout is the library in? Ask the tricks themselves rather than
  -- trusting a row count, so hand-added tricks above the manual do not matter.
  SELECT COUNT(*) INTO v_pre
  FROM generate_subscripts(v_old, 1) AS g(i)
  JOIN skills_library s ON s.manual_id = v_old[g.i]
  WHERE lower(btrim(s.name)) = lower(btrim(v_name[g.i]));

  SELECT COUNT(*) INTO v_post
  FROM generate_subscripts(v_old, 1) AS g(i)
  JOIN skills_library s ON s.manual_id = v_new[g.i]
  WHERE lower(btrim(s.name)) = lower(btrim(v_name[g.i]));

  IF v_post = ${mapping.length} AND v_pre < ${mapping.length} THEN
    RAISE NOTICE 'Library is already re-keyed. Skipping.';
    RETURN;
  END IF;

  IF v_pre <> ${mapping.length} THEN
    RAISE EXCEPTION
      'Library is in neither the expected before nor after state (% of ${mapping.length} tricks sit at their old #, % at their new #). Re-generate the mapping against the live library.',
      v_pre, v_post;
  END IF;

  -- Spell out any drift before touching anything.
  SELECT string_agg(format('#%s expected "%s" but found "%s"', v_old[g.i], v_name[g.i], s.name), '; ')
  INTO v_mismatch
  FROM generate_subscripts(v_old, 1) AS g(i)
  JOIN skills_library s ON s.manual_id = v_old[g.i]
  WHERE lower(btrim(s.name)) IS DISTINCT FROM lower(btrim(v_name[g.i]));
  IF v_mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'Library does not match the mapping: %', left(v_mismatch, 600);
  END IF;

  -- Fold duplicate rows into the copy that survived, so a skater who completed
  -- the duplicate keeps the credit. UNIQUE(student_id, skill_id) means the move
  -- has to skip skaters who already hold the survivor.
  UPDATE student_progress p
  SET skill_id = win.id
  FROM generate_subscripts(v_lose, 1) AS g(i)
  JOIN skills_library lose ON lose.manual_id = v_lose[g.i]
  JOIN skills_library win  ON win.manual_id  = v_win[g.i]
  WHERE p.skill_id = lose.id
    AND NOT EXISTS (SELECT 1 FROM student_progress d WHERE d.student_id = p.student_id AND d.skill_id = win.id);

  -- Whatever is left on a losing row is a skater who already had the survivor.
  DELETE FROM student_progress p
  USING skills_library lose
  WHERE lose.manual_id = ANY(v_lose) AND p.skill_id = lose.id;

  UPDATE student_skill_focus f
  SET skill_id = win.id
  FROM generate_subscripts(v_lose, 1) AS g(i)
  JOIN skills_library lose ON lose.manual_id = v_lose[g.i]
  JOIN skills_library win  ON win.manual_id  = v_win[g.i]
  WHERE f.skill_id = lose.id
    AND NOT EXISTS (SELECT 1 FROM student_skill_focus d WHERE d.student_id = f.student_id AND d.skill_id = win.id);

  DELETE FROM student_skill_focus f
  USING skills_library lose
  WHERE lose.manual_id = ANY(v_lose) AND f.skill_id = lose.id;

  -- Free the numbers held by rows that are leaving, without deleting the rows:
  -- their UUIDs are still referenced by progress, trick bags and class plans.
  UPDATE skills_library SET manual_id = NULL, is_active = false
  WHERE manual_id = ANY(v_lose);
  GET DIAGNOSTICS v_merged = ROW_COUNT;

  UPDATE skills_library SET manual_id = NULL, is_active = false
  WHERE manual_id = ANY(v_retire);
  GET DIAGNOSTICS v_retired = ROW_COUNT;

  -- Two passes through an out-of-range offset: manual_id is unique and the
  -- source and target ranges overlap, so a single UPDATE would collide.
  UPDATE skills_library s
  SET manual_id = v_new[g.i] + ${OFFSET}
  FROM generate_subscripts(v_old, 1) AS g(i)
  WHERE s.manual_id = v_old[g.i];

  UPDATE skills_library
  SET manual_id = manual_id - ${OFFSET},
      sort_order = manual_id - ${OFFSET},
      is_active = true
  WHERE manual_id > ${OFFSET};
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  IF v_moved <> ${mapping.length} THEN
    RAISE EXCEPTION 'Expected to move ${mapping.length} tricks, moved %.', v_moved;
  END IF;

  -- Every trick must now answer to its new # under its own name.
  SELECT COUNT(*) INTO v_post
  FROM generate_subscripts(v_old, 1) AS g(i)
  JOIN skills_library s ON s.manual_id = v_new[g.i]
  WHERE lower(btrim(s.name)) = lower(btrim(v_name[g.i]));
  IF v_post <> ${mapping.length} THEN
    RAISE EXCEPTION 'Only % of ${mapping.length} tricks landed on their new #. Rolling back.', v_post;
  END IF;

  RAISE NOTICE 'Re-keyed % tricks, merged % duplicate(s), retired %. Now run "Sincronizar Excel" to pick up the ${inserts.length} new trick(s).',
    v_moved, v_merged, v_retired;
END $$;
`

writeFileSync(outPath, sql, 'utf8')
console.log('\nWrote', outPath)
