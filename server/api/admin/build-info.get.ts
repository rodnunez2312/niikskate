import { requireAdmin } from '~/server/utils/requireAdmin'

/** Admin-only: deployed app version (commit) for prod verification. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const config = useRuntimeConfig()
  return {
    shaShort: config.appBuildShaShort as string,
    shaFull: config.appBuildShaFull as string,
    message: config.appBuildMessage as string,
    builtAt: config.appBuildAt as string,
    environment: config.appBuildEnv as string,
    branch: config.appBuildBranch as string,
  }
})
