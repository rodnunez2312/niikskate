/**
 * Local dev launcher. On Windows (corporate VPN/proxy), Node often rejects Supabase
 * HTTPS with "self-signed certificate in certificate chain" while the browser works.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const allowInsecure =
  process.env.NIIK_ALLOW_INSECURE_TLS === '1'
  || (process.platform === 'win32' && process.env.NIIK_ALLOW_INSECURE_TLS !== '0')

if (allowInsecure) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  console.warn(
    '[niikskate] NODE_TLS_REJECT_UNAUTHORIZED=0 for local dev (corporate proxy). Set NIIK_ALLOW_INSECURE_TLS=0 to disable.',
  )
}

/**
 * Run the Nuxt CLI entry with this Node binary instead of going through npx.
 * On Windows npx resolves to npx.cmd, which can only be spawned with
 * shell: true, and Node 22+ deprecates that combination with an args array
 * (DEP0190) because a shell concatenates arguments without escaping them.
 */
// Built from the repo root rather than require.resolve, whose subpath lookup the
// nuxt package blocks through its exports map.
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const nuxtBin = join(projectRoot, 'node_modules', 'nuxt', 'bin', 'nuxt.mjs')

if (!existsSync(nuxtBin)) {
  console.error(`[niikskate] Cannot find the Nuxt CLI at ${nuxtBin}. Run npm install first.`)
  process.exit(1)
}

const child = spawn(process.execPath, [nuxtBin, 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
