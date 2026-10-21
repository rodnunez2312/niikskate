const VERSION = 'v2'
const STATIC_CACHE = `niik-static-${VERSION}`
const PAGE_CACHE = `niik-pages-${VERSION}`
const DATA_CACHE = `niik-data-${VERSION}`
const KNOWN_CACHES = [STATIC_CACHE, PAGE_CACHE, DATA_CACHE]
const MAX_DATA_ENTRIES = 600
const MAX_PAGE_ENTRIES = 80

// Vite dev serves unhashed, constantly changing modules; caching them breaks HMR.
const DEV_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1']
const CACHING = !DEV_HOSTS.includes(self.location.hostname)

// App endpoints whose response the UI does not read, so they can run later.
const QUEUEABLE_API = ['/api/classes/session-status']

const DB_NAME = 'niik-offline'
const QUEUE_STORE = 'queue'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names
      .filter(name => name.startsWith('niik-') && !KNOWN_CACHES.includes(name))
      .map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

/* ---------- IndexedDB queue ---------- */

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, mode)
    const result = fn(tx.objectStore(QUEUE_STORE))
    tx.oncomplete = () => resolve(result && 'result' in result ? result.result : undefined)
    tx.onerror = () => reject(tx.error)
  })
}

const queueAll = () => withStore('readonly', store => store.getAll())
const queueAdd = entry => withStore('readwrite', store => store.add(entry))
const queueDelete = id => withStore('readwrite', store => store.delete(id))

async function notifyClients(message) {
  const list = await self.clients.matchAll({ includeUncontrolled: true })
  for (const client of list) client.postMessage(message)
}

async function broadcastQueue() {
  const entries = await queueAll().catch(() => [])
  await notifyClients({ type: 'offline-queue', pending: entries.length })
}

/* ---------- request classification ---------- */

const isSupabaseRest = url => url.pathname.startsWith('/rest/v1/')
const isSupabaseRpc = url => url.pathname.startsWith('/rest/v1/rpc/')
const isSupabasePublicFile = url => url.pathname.startsWith('/storage/v1/object/public/')
const isSameOrigin = url => url.origin === self.location.origin

// Only headers PostgREST / our API need; Authorization is replaced at replay time.
const KEPT_HEADERS = ['content-type', 'prefer', 'accept', 'apikey', 'content-profile', 'accept-profile', 'x-client-info']

function pickHeaders(headers) {
  const out = {}
  for (const name of KEPT_HEADERS) {
    const value = headers.get(name)
    if (value) out[name] = value
  }
  return out
}

/** Shape the fake reply like PostgREST would, so supabase-js reports success. */
function queuedResponse(request, bodyText, url) {
  const headers = { 'Content-Type': 'application/json', 'X-Niik-Queued': '1' }
  if (!isSupabaseRest(url)) {
    return new Response(JSON.stringify({ queued: true }), { status: 202, headers })
  }
  let parsed = null
  try { parsed = bodyText ? JSON.parse(bodyText) : null } catch { parsed = null }
  const accept = request.headers.get('accept') || ''
  const prefer = request.headers.get('prefer') || ''
  const rows = request.method === 'DELETE' || parsed == null ? [] : (Array.isArray(parsed) ? parsed : [parsed])
  if (accept.includes('vnd.pgrst.object')) {
    return new Response(JSON.stringify(rows[0] || {}), { status: 200, headers })
  }
  if (prefer.includes('return=representation')) {
    return new Response(JSON.stringify(rows), { status: 201, headers })
  }
  return new Response(null, { status: 204, headers: { 'X-Niik-Queued': '1' } })
}

function offlineError(message) {
  return new Response(JSON.stringify({ message, code: 'OFFLINE' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  })
}

/* ---------- caching helpers ---------- */

async function trimCache(name, max) {
  const cache = await caches.open(name)
  const keys = await cache.keys()
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i])
}

async function networkFirst(request, cacheName, cacheKey = request) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) {
      cache.put(cacheKey, response.clone()).then(() =>
        trimCache(cacheName, cacheName === PAGE_CACHE ? MAX_PAGE_ENTRIES : MAX_DATA_ENTRIES))
    }
    return response
  } catch (error) {
    const cached = await cache.match(cacheKey)
    if (cached) return cached
    throw error
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone())
  return response
}

async function offlinePage(url) {
  const cache = await caches.open(PAGE_CACHE)
  const cached = await cache.match(url.pathname, { ignoreSearch: true })
  if (cached) return cached
  const keys = await cache.keys()
  const links = keys
    .map(req => new URL(req.url).pathname)
    .filter((path, i, all) => path.startsWith('/member') && all.indexOf(path) === i)
    .slice(0, 20)
    .map(path => `<li><a href="${path}">${path.replace('/member/', '')}</a></li>`)
    .join('')
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión · NiikSkate</title>
<style>body{margin:0;min-height:100vh;background:#151515;color:#F5F2EA;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;padding:24px}
main{max-width:420px}h1{font-size:20px;margin:0 0 8px}p{color:#F5F2EA99;font-size:14px;line-height:1.5}a{color:#C9EF42}ul{padding-left:18px;font-size:14px;line-height:1.9}
button{margin-top:12px;background:#C9EF42;color:#151515;border:0;border-radius:999px;padding:10px 18px;font-weight:600}</style></head>
<body><main><h1>Sin conexión</h1><p>Esta página todavía no se ha abierto en este teléfono, así que no está guardada. Abre una de las que ya visitaste o vuelve a intentar cuando tengas señal.</p>
${links ? `<ul>${links}</ul>` : ''}<button onclick="location.reload()">Reintentar</button></main></body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

/* ---------- fetch routing ---------- */

async function handleWrite(request, url) {
  const bodyText = await request.clone().text()
  try {
    return await fetch(request)
  } catch {
    await queueAdd({
      url: request.url,
      method: request.method,
      headers: pickHeaders(request.headers),
      body: bodyText || null,
      createdAt: Date.now(),
    })
    await broadcastQueue()
    return queuedResponse(request, bodyText, url)
  }
}

async function handleRpc(request) {
  const bodyText = await request.clone().text()
  const key = `${request.url}${request.url.includes('?') ? '&' : '?'}__niik_body=${encodeURIComponent(bodyText)}`
  const cache = await caches.open(DATA_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(key, response.clone())
    return response
  } catch {
    const cached = await cache.match(key)
    return cached || offlineError('Sin conexión.')
  }
}

self.addEventListener('fetch', (event) => {
  if (!CACHING) return
  const { request } = event
  const url = new URL(request.url)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return

  if (request.method !== 'GET') {
    if (isSupabaseRpc(url)) return event.respondWith(handleRpc(request))
    if (isSupabaseRest(url) && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
      return event.respondWith(handleWrite(request, url))
    }
    if (isSameOrigin(url) && request.method === 'POST' && QUEUEABLE_API.includes(url.pathname)) {
      return event.respondWith(handleWrite(request, url))
    }
    return
  }

  if (request.mode === 'navigate') {
    return event.respondWith(
      networkFirst(request, PAGE_CACHE, url.pathname).catch(() => offlinePage(url)),
    )
  }

  if (isSupabaseRest(url)) return event.respondWith(networkFirst(request, DATA_CACHE))
  if (isSupabasePublicFile(url)) return event.respondWith(cacheFirst(request))

  if (isSameOrigin(url)) {
    if (url.pathname.startsWith('/_nuxt/builds/')) return event.respondWith(networkFirst(request, STATIC_CACHE))
    if (url.pathname.startsWith('/_nuxt/')) return event.respondWith(cacheFirst(request))
    if (url.pathname.startsWith('/api/')) return event.respondWith(networkFirst(request, DATA_CACHE))
    if (/\.(png|jpe?g|webp|svg|gif|ico|woff2?|json)$/i.test(url.pathname)) {
      return event.respondWith(networkFirst(request, STATIC_CACHE))
    }
  }
})

/* ---------- replay ---------- */

let replaying = false

/** Runs queued writes oldest-first with the page's current login token. */
async function replayQueue(token) {
  if (replaying) return
  replaying = true
  const failed = []
  try {
    const entries = await queueAll()
    for (const entry of entries) {
      const headers = { ...entry.headers }
      if (token) headers.Authorization = `Bearer ${token}`
      let response
      try {
        response = await fetch(entry.url, { method: entry.method, headers, body: entry.body })
      } catch {
        break
      }
      if (response.status === 401) break
      if (!response.ok && response.status >= 500) break
      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        failed.push({ url: entry.url, method: entry.method, status: response.status, detail: detail.slice(0, 300) })
      }
      await queueDelete(entry.id)
    }
  } finally {
    replaying = false
    await broadcastQueue()
    if (failed.length) await notifyClients({ type: 'offline-replay-failed', failed })
    else await notifyClients({ type: 'offline-replay-done' })
  }
}

self.addEventListener('message', (event) => {
  const data = event.data || {}
  if (data.type === 'session-tick') {
    event.waitUntil(self.registration.showNotification(data.title || 'NiikSkate', {
      body: data.body || '',
      tag: 'niik-session',
      silent: true,
      renotify: false,
      icon: '/icons/icon-192.png',
    }))
  }
  if (data.type === 'session-stop') {
    event.waitUntil(
      self.registration.getNotifications({ tag: 'niik-session' }).then(list => {
        for (const note of list) note.close()
      }),
    )
  }
  if (data.type === 'offline-replay') event.waitUntil(replayQueue(data.token || ''))
  if (data.type === 'offline-status') event.waitUntil(broadcastQueue())
  if (data.type === 'offline-warm' && CACHING) {
    event.waitUntil((async () => {
      const staticCache = await caches.open(STATIC_CACHE)
      for (const asset of data.assets || []) {
        if (!(await staticCache.match(asset))) await staticCache.add(asset).catch(() => {})
      }
      const pageCache = await caches.open(PAGE_CACHE)
      if (data.page && !(await pageCache.match(data.page))) {
        await fetch(data.page, { credentials: 'include' })
          .then(res => (res.ok ? pageCache.put(data.page, res) : null))
          .catch(() => {})
      }
    })())
  }
  if (data.type === 'offline-clear-data') {
    event.waitUntil((async () => {
      await caches.delete(DATA_CACHE)
      await caches.delete(PAGE_CACHE)
    })())
  }
})
