import { execSync } from 'node:child_process'

export type AppBuildMeta = {
  shaShort: string
  shaFull: string
  message: string
  builtAt: string
  environment: string
  branch: string
}

function safeGit(args: string): string {
  try {
    return execSync(args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** Resolved once at build / server startup (Vercel git env or local git). */
export function resolveAppBuildMeta(): AppBuildMeta {
  const shaFull =
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    safeGit('git rev-parse HEAD') ||
    'unknown'

  const shaShort = shaFull === 'unknown' ? 'unknown' : shaFull.slice(0, 7)

  const message = (
    process.env.VERCEL_GIT_COMMIT_MESSAGE ||
    safeGit('git log -1 --pretty=%s') ||
    ''
  )
    .split('\n')[0]
    .trim()
    .slice(0, 200)

  const branch =
    process.env.VERCEL_GIT_COMMIT_REF?.trim() ||
    safeGit('git rev-parse --abbrev-ref HEAD') ||
    ''

  const environment =
    process.env.VERCEL_ENV?.trim() ||
    (process.env.NODE_ENV === 'production' ? 'production' : 'development')

  const builtAt = new Date().toISOString()

  return {
    shaShort,
    shaFull,
    message,
    builtAt,
    environment,
    branch,
  }
}
