/* ===== Sincronización en tiempo real + Push Notifications =====
 * Firebase Realtime Database para sync entre móviles.
 * Firebase Cloud Messaging para notificaciones push reales.
 */

window.NV_SYNC = {
  enabled: false,
  db: null,
  messaging: null,
  applyingRemote: false,
  dataRef: null,

  init: async function() {
    if (!window.FIREBASE_ENABLED) {
      console.log('[Sync] Firebase no configurado — modo local');
      return;
    }
    try {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
      const { getDatabase, ref, onValue, set } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');

      const app = initializeApp(window.FIREBASE_CONFIG);
      this.db = getDatabase(app);
      this.set = set;
      this.dataRef = ref(this.db, 'nv_state');

      // Listener sync en tiempo real
      onValue(this.dataRef, (snapshot) => {
        const remote = snapshot.val();
        if (!remote) { this.pushToCloud(); return; }
        this.applyingRemote = true;
        try {
          if (remote.fuelDays  !== undefined) window.fuelDays  = remote.fuelDays;
          if (remote.wkndTasks !== undefined) window.wkndTasks = remote.wkndTasks;
          if (remote.houseData !== undefined) window.houseData = remote.houseData;
          if (remote.empHours  !== undefined) window.empHours  = remote.empHours;
          if (remote.schedOver !== undefined) window.schedOver = remote.schedOver;
          if (remote.compras   !== undefined) window.compras   = remote.compras;
          if (remote.estancias !== undefined) window.estancias = remote.estancias;
          if (remote.nextId    !== undefined) window.nextId    = remote.nextId;
          localStorage.setItem('nv_state', JSON.stringify({
            fuelDays: window.fuelDays, wkndTasks: window.wkndTasks,
            houseData: window.houseData, empHours: window.empHours,
            schedOver: window.schedOver, compras: window.compras,
            estancias: window.estancias, nextId: window.nextId
          }));
          if (typeof rerenderActive === 'function') rerenderActive();
          else if (typeof buildWeek === 'function') buildWeek();
        } finally { this.applyingRemote = false; }
      });

      this.enabled = true;
      console.log('[Sync] ✓ Firebase Realtime Database conectado');

      // Inicializar FCM para push notifications
      await this.initMessaging(app);

    } catch(err) {
      console.error('[Sync] Error:', err);
    }
  },

  pushToCloud: function() {
    if (!this.enabled || this.applyingRemote || !this.db) return;
    try {
      this.set(this.dataRef, {
        fuelDays:  window.fuelDays  || {},
        wkndTasks: window.wkndTasks || {},
        houseData: window.houseData || {},
        empHours:  window.empHours  || {},
        schedOver: window.schedOver || {},
        compras:   window.compras   || [],
        estancias: window.estancias || [],
        nextId:    window.nextId    || 100,
        lastUpdate: Date.now(),
        lastUser: (typeof currentUser === 'function' && currentUser()) ? currentUser().name : 'unknown'
      });
    } catch(err) { console.error('[Sync] Error al subir:', err); }
  },

  initMessaging: async function(app) {
    // FCM solo funciona en contextos seguros (HTTPS o localhost) y si el SW está registrado
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.log('[FCM] No soportado en este entorno');
      return;
    }
    try {
      const { getMessaging, getToken, onMessage } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');
      this.messaging = getMessaging(app);

      // Listener para mensajes con la app en primer plano
      onMessage(this.messaging, (payload) => {
        console.log('[FCM] Mensaje recibido:', payload);
        const { title, body } = payload.notification || {};
        if (title && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: './icons/icon-192.png', badge: './icons/icon-192.png' });
        }
      });

      // Solicitar permiso y registrar token si aún no está guardado
      if (Notification.permission === 'granted') {
        await this.registerFCMToken();
      }
      // (el permiso se pide explícitamente cuando el usuario activa notificaciones)
      window.NV_FCM_READY = true;
    } catch(err) {
      console.warn('[FCM] No se pudo inicializar:', err.message);
    }
  },

  registerFCMToken: async function() {
    if (!this.messaging || !window.NV_VAPID_KEY) return null;
    try {
      const { getToken } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');
      const sw = await navigator.serviceWorker.ready;
      const token = await getToken(this.messaging, {
        vapidKey: window.NV_VAPID_KEY,
        serviceWorkerRegistration: sw
      });
      if (token) {
        // Guardar token en Firebase asociado al usuario actual
        const user = (typeof currentUser === 'function' && currentUser()) ? currentUser().username : 'unknown';
        const { getDatabase, ref, set } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        const db = getDatabase();
        await set(ref(db, `fcm_tokens/${user}`), { token, updated: Date.now() });
        localStorage.setItem('nv_fcm_token', token);
        console.log('[FCM] Token registrado:', token.slice(0,20) + '...');
        return token;
      }
    } catch(err) {
      console.warn('[FCM] Error al obtener token:', err.message);
    }
    return null;
  },

  requestPermission: async function() {
    if (!('Notification' in window)) return false;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await this.registerFCMToken();
      return true;
    }
    return false;
  },

  // Programar notificación local (respaldo para cuando FCM no esté disponible)
  // Firebase Functions sería necesario para server-side push; como alternativa
  // guardamos los recordatorios en Firebase y el SW los verifica periódicamente
  scheduleReminder: async function(reminder) {
    // reminder: { id, title, body, fireAt (timestamp ms), userId }
    if (!this.enabled) return;
    try {
      const { getDatabase, ref, set } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
      const db = getDatabase();
      const user = (typeof currentUser === 'function' && currentUser()) ? currentUser().username : 'unknown';
      await set(ref(db, `reminders/${user}/${reminder.id}`), reminder);
      console.log('[FCM] Recordatorio guardado:', reminder.title, 'a las', new Date(reminder.fireAt).toLocaleString());
    } catch(err) {
      console.warn('[FCM] Error al guardar recordatorio:', err);
    }
  },

  deleteReminder: async function(reminderId) {
    if (!this.enabled) return;
    try {
      const { getDatabase, ref, remove } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
      const db = getDatabase();
      const user = (typeof currentUser === 'function' && currentUser()) ? currentUser().username : 'unknown';
      await remove(ref(db, `reminders/${user}/${reminderId}`));
    } catch(err) { console.warn('[FCM] Error al borrar recordatorio:', err); }
  }
};

NV_SYNC.init();
