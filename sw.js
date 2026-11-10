/* Service worker рабочего стола: только показ уведомлений и переход по клику.
   Ничего не кэширует, чтобы данные на сайте всегда были свежими. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); return c.navigate(url); }
    }
    return self.clients.openWindow(url);
  })());
});
