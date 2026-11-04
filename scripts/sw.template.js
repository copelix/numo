/* Numo: guarda la app para abrirla sin conexión. Tus datos nunca pasan por acá. (Archivo generado en el build.) */
const CACHE = "__CACHE__";
const SHELL = __SHELL__;

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const keep = (key, response) => {
    const copy = response.clone();
    caches.open(CACHE).then(c => c.put(key, copy));
    return response;
  };
  // La página y la configuración: primero la red (para recibir mejoras); sin conexión, lo guardado.
  if (request.mode === "navigate" || (sameOrigin && url.pathname === "/config.js")) {
    const key = request.mode === "navigate" ? "/" : "/config.js";
    event.respondWith(
      fetch(request)
        .then(r => keep(key, r))
        .catch(() => caches.match(key)),
    );
    return;
  }
  // Archivos de la app (con hash) y tipografías: primero lo guardado.
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!sameOrigin && !fonts) return;
  event.respondWith(
    caches
      .match(request)
      .then(hit => hit || fetch(request).then(r => (r.ok || r.type === "opaque" ? keep(request, r) : r))),
  );
});
