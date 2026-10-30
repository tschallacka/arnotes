// Web Push in the service worker: show what the server sent, and take the person
// to it when they click. Imported by the generated service worker (nuxt.config.ts)
// and registered on its own where that one is not (development).
self.addEventListener('push', (event) => {
  let message = { title: 'Taskmanager', body: '', url: '/projects/inbox', tag: 'taskmanager' }
  try {
    message = { ...message, ...event.data.json() }
  } catch { /* a push with no readable payload still gets a notification */ }

  event.waitUntil((async () => {
    // A window the person is looking at already shows it in the app.
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (windows.some(client => client.visibilityState === 'visible' && client.focused)) return
    await self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: message.url }
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/projects/inbox', self.location.origin).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = windows.find(client => new URL(client.url).origin === self.location.origin)
    if (open) {
      await open.focus()
      if ('navigate' in open) await open.navigate(target).catch(() => {})
    } else {
      await self.clients.openWindow(target)
    }
  })())
})
