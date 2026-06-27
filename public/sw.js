// Service worker SEGURO. Lección aprendida: cachear el documento "/" y los
// payloads RSC ("/?_rsc=") servía bundles VIEJOS tras un deploy -> pantalla
// congelada (mismatch de RSC viejo con JS nuevo). Ahora:
//  - documentos, JS y RSC: SIEMPRE de la red (nunca caché) -> jamás código viejo.
//  - solo se cachean estáticos inmutables (icono, manifest) para instalabilidad.
//  - en activate se BORRA todo caché anterior (se auto-cura en quien tenga el viejo).
const CACHE = "avihelp-v3";
const STATIC = ["/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Solo estáticos seguros desde caché; TODO lo demás va a la red sin fallback.
  if (STATIC.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
  // Documentos / RSC / JS / acciones: red directa (no respondWith) -> siempre fresco.
});
