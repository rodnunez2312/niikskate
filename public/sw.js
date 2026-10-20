self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', () => {})

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
})
