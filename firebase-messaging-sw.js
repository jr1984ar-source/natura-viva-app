/* ===== Firebase Messaging Service Worker =====
 * Recibe notificaciones push cuando la app está cerrada.
 * DEBE estar en la raíz del sitio (mismo nivel que index.html).
 */

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCTC-3sMnBPP7dTUYKfHyNAinegL97z_bI",
  authDomain: "natura-viva-ddc86.firebaseapp.com",
  databaseURL: "https://natura-viva-ddc86-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "natura-viva-ddc86",
  storageBucket: "natura-viva-ddc86.firebasestorage.app",
  messagingSenderId: "100541506547",
  appId: "1:100541506547:web:d84e06828742499d6b2886"
});

const messaging = firebase.messaging();

// Recibir notificaciones con la app en BACKGROUND o CERRADA
messaging.onBackgroundMessage((payload) => {
  console.log('[FCM SW] Notificación en background:', payload);
  const { title = 'Natura Viva', body = '' } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title, {
    body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag || 'nv-notification',
    renotify: true,
    data: { url: data.url || './' }
  });
});

// Al hacer clic en la notificación, abrir la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('natura-viva') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ===== VERIFICADOR PERIÓDICO DE RECORDATORIOS =====
// Cada 60 segundos comprueba si hay recordatorios que lanzar
// (fallback para cuando no hay servidor Firebase Functions)
self.addEventListener('activate', (event) => {
  // Registrar sync periódico si está disponible
  if ('periodicSync' in self.registration) {
    event.waitUntil(
      self.registration.periodicSync.register('check-reminders', { minInterval: 60 * 1000 })
        .catch(() => console.log('[SW] periodicSync no disponible'))
    );
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-reminders') {
    event.waitUntil(checkAndFireReminders());
  }
});

// También verificar cuando el SW se activa o recibe un mensaje
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_REMINDERS') {
    checkAndFireReminders();
  }
});

async function checkAndFireReminders() {
  try {
    // Leer recordatorios de Firebase
    const resp = await fetch(
      'https://natura-viva-ddc86-default-rtdb.europe-west1.firebasedatabase.app/reminders.json'
    );
    if (!resp.ok) return;
    const allReminders = await resp.json();
    if (!allReminders) return;

    const now = Date.now();
    const toFire = [];

    Object.values(allReminders).forEach(userReminders => {
      if (!userReminders) return;
      Object.entries(userReminders).forEach(([id, r]) => {
        if (r && r.fireAt && r.fireAt <= now && !r.fired) {
          toFire.push({ ...r, _key: id });
        }
      });
    });

    for (const r of toFire) {
      // Mostrar notificación
      await self.registration.showNotification(r.title || 'Natura Viva', {
        body: r.body || '',
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: `reminder-${r.id}`,
        renotify: true,
        vibrate: [200, 100, 200]
      });

      // Marcar como fired en Firebase
      await fetch(
        `https://natura-viva-ddc86-default-rtdb.europe-west1.firebasedatabase.app/reminders/${r.userId}/${r._key}/fired.json`,
        { method: 'PUT', body: 'true', headers: { 'Content-Type': 'application/json' } }
      );
    }
  } catch(err) {
    console.warn('[SW] Error al verificar recordatorios:', err);
  }
}
