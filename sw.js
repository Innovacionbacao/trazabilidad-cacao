/* Service worker de Captura (index.html). Solo cachea el "cascarón" de la
   app (HTML/CSS/JS/íconos) para que abra rápido y sin señal; las llamadas al
   Worker (datos reales) siempre van directo a la red, nunca se cachean, para
   no mostrar información vieja. */

const CACHE_NAME = 'trazabilidad-captura-v1';
const APP_SHELL = [
  './index.html',
  './style.css',
  './shared.js',
  './captura.js',
  './manifest.json',
  './logo-bacao.png',
  './icons/icono-192.png',
  './icons/icono-512.png',
  './icons/icono-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Solo intervenir en archivos propios de este sitio (mismo origen).
  // Cualquier otra cosa (el Worker de Cloudflare, fuentes de Google, etc.)
  // sigue de largo directo a la red, sin pasar por el caché.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cacheado) => {
      const red = fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copia = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copia));
          }
          return resp;
        })
        .catch(() => cacheado); // sin señal: usa lo que haya en caché
      return cacheado || red;
    })
  );
});
