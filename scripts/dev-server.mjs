/**
 * Local dev launcher. On Windows (corporate VPN/proxy), Node often rejects Supabase
 * HTTPS with "self-signed certificate in certificate chain" while the browser works.
 */
import { spawn } from 'node:child_process'

const allowInsecure =
  process.env.NIIK_ALLOW_INSECURE_TLS === '1'
  || (process.platform === 'win32' && process.env.NIIK_ALLOW_INSECURE_TLS !== '0')

if (allowInsecure) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  console.warn(
    '[niikskate] NODE_TLS_REJECT_UNAUTHORIZED=0 for local dev (corporate proxy). Set NIIK_ALLOW_INSECURE_TLS=0 to disable.',
  )
}

const nuxtArgs = ['nuxt', 'dev', ...process.argv.slice(2)]
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', nuxtArgs, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
