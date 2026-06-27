// KILL-SWITCH. El service worker causó pantallas congeladas al servir bundles
// viejos cacheados. Para una app de crisis, fiabilidad > offline-shell.
// Este SW borra TODO el caché, se desregistra a sí mismo y recarga las ventanas
// una vez. Tras esto el sitio corre SIN service worker (siempre fresco).
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: "window" });
      for (const c of clients) {
        if ("navigate" in c) c.navigate(c.url).catch(() => {});
      }
    })(),
  );
});
