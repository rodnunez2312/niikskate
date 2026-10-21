export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) return

  const { online, pending, failed } = useOfflineState()
  const client = useSupabaseClient()
  online.value = navigator.onLine

  async function post(message: Record<string, unknown>) {
    const reg = await navigator.serviceWorker.ready
    reg.active?.postMessage(message)
  }

  async function replay() {
    if (!navigator.onLine || !pending.value) return
    const { data } = await client.auth.getSession()
    await post({ type: 'offline-replay', token: data.session?.access_token || '' })
  }

  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data || {}
    if (data.type === 'offline-queue') {
      const before = pending.value
      pending.value = Number(data.pending) || 0
      if (pending.value > before && navigator.onLine) replay()
    }
    if (data.type === 'offline-replay-failed') failed.value = data.failed || []
  })

  window.addEventListener('online', () => {
    online.value = true
    replay()
  })
  window.addEventListener('offline', () => {
    online.value = false
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') replay()
  })
  setInterval(replay, 30_000)

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') post({ type: 'offline-clear-data' })
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') replay()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => {
        const assets = performance.getEntriesByType('resource')
          .map(entry => entry.name)
          .filter(name => name.startsWith(`${location.origin}/_nuxt/`))
        post({ type: 'offline-warm', assets, page: location.pathname })
        post({ type: 'offline-status' })
      })
      .catch(() => {})
  })
})
