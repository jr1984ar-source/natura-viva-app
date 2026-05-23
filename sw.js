// Service Worker principal — cache + coordinación con messaging SW
const CACHE_NAME = 'natura-viva-v17';
const ASSETS = [
  './', './index.html', './styles.css', './app.js',
  './firebase-config.js', './firebase-sync.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/apple-touch-icon.png', './icons/logo-header.png', './icons/logo-login.png'
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
  const url = new URL(e.request.url);
  const isCoreAsset = url.pathname.endsWith('.html') || url.pathname.endsWith('.css') ||
                      url.pathname.endsWith('.js')   || url.pathname === '/' ||
                      url.pathname.endsWith('/natura-viva-app/');
  if (isCoreAsset) {
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy)).catch(()=>{});
        return resp;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, resp.clone());
          return resp;
        }).catch(() => resp);
      })).catch(() => caches.match('./index.html'))
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
