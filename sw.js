// sw.js — Service Worker mínimo
// Cachea el shell de la app para que cargue rápido / funcione offline básico.
// NO cachea respuestas de TMDB ni datos de usuario (IndexedDB los maneja).

const CACHE_NAME = 'simpsoteca-v1';
const SHELL = [
  './',
  './index.html',
  './peliculas.html',
  './series.html',
  './explorar.html',
  './buscar.html',
  './detalle.html',
  './temporadas.html',
  './episodios.html',
  './mi-lista.html',
  './reproductor.html',
  './admin.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/css/admin.css',
  './assets/js/app.js',
  './assets/js/database.js',
  './assets/js/tmdb.js',
  './assets/js/importador.js',
  './assets/js/catalogo.js',
  './assets/js/reproductor.js',
  './assets/js/admin.js',
  './assets/js/backup.js',
  './assets/icons/icon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(SHELL.map(url => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // No interceptar: TMDB, otras APIs, blobs, chrome-extension
  if (url.hostname !== location.hostname) return;
  if (req.method !== 'GET') return;

  // HTML y JS: network-first (busca actualización, si falla usa caché)
  if (req.destination === 'document' || url.pathname.endsWith('.js')) {
    e.respondWith(
      fetch(req).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // CSS, imágenes, manifest: cache-first
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, clone));
      }
      return res;
    }))
  );
});