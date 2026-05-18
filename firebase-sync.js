/* ===== Sincronización en tiempo real con Firebase =====
 * Carga Firebase SDK desde CDN y sincroniza el estado entre móviles.
 * Si no hay configuración válida, la app funciona en modo local.
 */

window.NV_SYNC = {
  enabled: false,
  db: null,
  ref: null,
  ready: false,
  applyingRemote: false,
  init: async function() {
    if (!window.FIREBASE_ENABLED) {
      console.log('[Sync] Firebase no configurado — modo local');
      this.ready = true;
      return;
    }
    try {
      // Cargar SDKs (versión modular v10)
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
      const { getDatabase, ref, onValue, set, off } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
      const app = initializeApp(window.FIREBASE_CONFIG);
      this.db = getDatabase(app);
      this.ref = ref;
      this.onValue = onValue;
      this.set = set;
      // Listener: cuando cambian datos en la nube, actualizar local
      this.dataRef = ref(this.db, 'nv_state');
      onValue(this.dataRef, (snapshot) => {
        const remote = snapshot.val();
        if (!remote) {
          // Primera vez: subir el estado local actual a la nube
          if (typeof saveState === 'function') {
            this.pushToCloud();
          }
          return;
        }
        // Aplicar remoto a local
        this.applyingRemote = true;
        try {
          if (remote.fuelDays !== undefined) window.fuelDays = remote.fuelDays;
          if (remote.wkndTasks !== undefined) window.wkndTasks = remote.wkndTasks;
          if (remote.houseData !== undefined) window.houseData = remote.houseData;
          if (remote.empHours !== undefined) window.empHours = remote.empHours;
          if (remote.schedOver !== undefined) window.schedOver = remote.schedOver;
          if (remote.nextId !== undefined) window.nextId = remote.nextId;
          // Refrescar UI activa
          if (typeof rerenderActive === 'function') rerenderActive();
          else if (typeof buildWeek === 'function') buildWeek();
          // Persistir también local como backup offline
          localStorage.setItem('nv_state', JSON.stringify({
            fuelDays: window.fuelDays, wkndTasks: window.wkndTasks,
            houseData: window.houseData, empHours: window.empHours,
            schedOver: window.schedOver, nextId: window.nextId
          }));
        } finally {
          this.applyingRemote = false;
        }
      });
      this.enabled = true;
      this.ready = true;
      console.log('[Sync] ✓ Firebase conectado — sincronización activa');
    } catch(err) {
      console.error('[Sync] Error al inicializar Firebase:', err);
      this.ready = true;
    }
  },
  pushToCloud: function() {
    if (!this.enabled || this.applyingRemote) return;
    if (!this.db) return;
    try {
      this.set(this.dataRef, {
        fuelDays: window.fuelDays || {},
        wkndTasks: window.wkndTasks || {},
        houseData: window.houseData || {},
        empHours: window.empHours || {},
        schedOver: window.schedOver || {},
        nextId: window.nextId || 100,
        lastUpdate: Date.now(),
        lastUser: (typeof currentUser === 'function' && currentUser()) ? currentUser().name : 'unknown'
      });
    } catch(err) {
      console.error('[Sync] Error al subir:', err);
    }
  }
};

// Inicializar tan pronto como cargue el script
NV_SYNC.init();
