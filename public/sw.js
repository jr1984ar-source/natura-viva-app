// Service Worker principal — cache + coordinación con messaging SW
const CACHE_NAME = 'natura-viva-v368';
const ASSETS = [
  './', './index.html', './styles.css',
  './firebase-config.js', './firebase-sync.js', './manifest.json?v=337',
  './modules/icons.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/apple-touch-icon.png', './icons/logo-header.png?v=336', './icons/logo-login.png?v=336'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  // Solo cacheamos peticiones GET del mismo origen. POST (Firebase, etc.)
  // y peticiones cross-origin se dejan pasar sin tocar (Cache solo admite GET).
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  const isCoreAsset = url.pathname.endsWith('.html') || url.pathname.endsWith('.css') ||
                      url.pathname.endsWith('.js')   || url.pathname === '/' ||
                      url.pathname.endsWith('/natura-viva-app/');
  if (isCoreAsset) {
    // Network-first para código, saltando la caché HTTP del navegador
    // (sin esto, max-age del hosting hacía que se sirviera JS de hasta 1h antes)
    e.respondWith(
      fetch(req, { cache: 'no-cache' }).then(resp => {
        if (resp && resp.ok && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(()=>{});
        }
        return resp;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
  } else {
    // Cache-first para el resto de estáticos del mismo origen
    e.respondWith(
      caches.match(req).then(r => r || fetch(req).then(resp => {
        if (resp && resp.ok && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(()=>{});
        }
        return resp;
      }).catch(() => caches.match('./index.html')))
    );
  }
});

// Verificar recordatorios cada vez que la app se activa
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'APP_ACTIVE') {
    // Reenviar al messaging SW si está disponible
    self.clients.matchAll().then(clients => {
      clients.forEach(client => client.postMessage({ type: 'CHECK_REMINDERS' }));
    });
  }
});
