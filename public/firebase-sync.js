/* ===== Sincronización Firebase + Auth — Natura Viva ===== */
// Modelo:
//  - Admin: email real + contraseña. Datos en users/<adminUid>/...
//  - Empleado: email interno "usuario+orgSlug@nv.local". La app carga el cajón del admin.
//  - Super-admin: UID con permiso para crear/listar códigos de licencia.

window.NV_SYNC = {
  // Momento de arranque de la sesión (para distinguir datos creados AHORA de
  // datos viejos de la caché local — ver _aplicarFactRemoto).
  _sessionStart: Date.now(),
  enabled: false,
  db: null,
  auth: null,
  // UID del super-admin (inmune a verificación de email y demás restricciones).
  SUPER_ADMIN_UID: 'HaiM2tV9KjShHbY9GRUBaqeGGYh2',
  messaging: null,
  applyingRemote: false,
  dataRef: null,
  _firebaseApp: null,
  _uid: null,
  _email: null,
  _adminUid: null, // UID del admin del cajón activo (= _uid si admin, o el adminUid del empleado)

  init: async function() {
    if (!window.FIREBASE_ENABLED) return;
    try {
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
      const { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithCustomToken, signOut, sendPasswordResetEmail, sendEmailVerification, setPersistence, browserLocalPersistence, indexedDBLocalPersistence, deleteUser, updatePassword, reauthenticateWithCredential, EmailAuthProvider } =
        await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

      this._firebaseApp = initializeApp(window.FIREBASE_CONFIG);

      // ---- App Check (anti-bots) ----
      // Solo se activa si hay clave reCAPTCHA en firebase-config.js
      // (NV_APPCHECK_SITE_KEY). Sin clave, la app funciona igual que siempre.
      try {
        if (window.NV_APPCHECK_SITE_KEY) {
          const { initializeAppCheck, ReCaptchaV3Provider } =
            await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js');
          initializeAppCheck(this._firebaseApp, {
            provider: new ReCaptchaV3Provider(window.NV_APPCHECK_SITE_KEY),
            isTokenAutoRefreshEnabled: true
          });
        }
      } catch(e) { console.warn('[Sync] App Check no disponible:', e && e.message); }

      this.auth = getAuth(this._firebaseApp);
      this._authFns = { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification, deleteUser, updatePassword, reauthenticateWithCredential, EmailAuthProvider };

      // Mantener la sesión iniciada de forma persistente (sobrevive a cerrar la PWA).
      // En PWA de iOS (standalone), iOS puede purgar localStorage y tirar la sesión
      // → login repetido. indexedDB aguanta mucho mejor, así que va PRIMERO.
      try {
        await setPersistence(this.auth, indexedDBLocalPersistence);
      } catch(e) {
        try { await setPersistence(this.auth, browserLocalPersistence); } catch(e2) {}
      }

      // ---- Auto-login tras el pago ----
      // La pantalla de gracias (web) nos manda un token de un solo uso en la URL
      // (?t=...). Si está, entramos directos y limpiamos la URL para que el token
      // no quede a la vista. Si falla o caduca, seguimos al login normal.
      try {
        const _tok = new URLSearchParams(location.search).get('t');
        if (_tok) {
          try { history.replaceState(null, '', location.pathname); } catch(e) {}
          await signInWithCustomToken(this.auth, _tok);
          console.log('[Auth] Auto-login con token OK');
        }
      } catch(e) {
        console.warn('[Auth] Auto-login: token no válido o caducado:', e && e.message);
      }

      onAuthStateChanged(this.auth, (user) => {
        if (user) {
          this._uid = user.uid;
          this._email = user.email || null;
          if (typeof setAuthUser === 'function') setAuthUser(user.uid, user.email);
          console.log('[Auth] Sesión iniciada:', user.email);
          this._onSignedIn();
        } else {
          this._uid = null;
          this._email = null;
          this._adminUid = null;
          if (typeof setAuthUser === 'function') setAuthUser(null, null);
          if (typeof setActiveOrgAdminUid === 'function') setActiveOrgAdminUid(null);
          if (typeof setEmployeeProfile === 'function') setEmployeeProfile(null);
          console.log('[Auth] Sin sesión');
          this._onSignedOut();
        }
      });
      console.log('[Sync] ✓ Auth listo');
    } catch(err) { console.error('[Sync] Error init:', err); }
  },

  _onSignedIn: async function() {
    // Durante el registro con licencia NO arrancamos la app hasta validar el código.
    // Si el código es inválido se hace rollback (deleteUser) y nunca debe verse la app.
    if (this._signupInProgress) {
      console.log('[Auth] Registro en curso — esperando validación de licencia.');
      return;
    }

    // ---- Gate de verificación de email (solo ADMINS con email real) ----
    // Empleados (@nv.local) y super-admin quedan exentos. Si un admin no ha
    // verificado su email, NO arrancamos la app: mostramos la pantalla de
    // verificación y mantenemos la sesión viva para poder reenviar/recargar.
    const _email0 = this._email || '';
    const _esEmpleado0 = _email0.endsWith('@nv.local');
    const _esSuperAdmin0 = this._uid === this.SUPER_ADMIN_UID;
    const _u0 = this.auth && this.auth.currentUser;
    if (!_esEmpleado0 && !_esSuperAdmin0 && _u0 && _u0.emailVerified === false) {
      console.log('[Auth] Email sin verificar — mostrando pantalla de verificación.');
      window._bootResolved = true;
      if (typeof onEmailUnverified === 'function') onEmailUnverified(_email0);
      return;
    }

    try {
      const { getDatabase, ref, onValue, set, get, update, remove } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
      if (!this.db) this.db = getDatabase(this._firebaseApp);
      this.set = set;
      this._dbRef = ref;
      this._dbGet = get;
      this._dbOnValue = onValue;
      this._dbUpdate = update;
      this._dbRemove = remove;

      const email = this._email || '';
      const isEmployee = email.endsWith('@nv.local');

      if (isEmployee) {
        // EMPLEADO: buscar a qué admin pertenece consultando la lista de teams
        // El email es "usuario+orgSlug@nv.local"; el orgSlug se usa para buscar el admin
        // que tiene este empleado registrado en su lista team.
        const r = await this._resolveEmployeeAdmin(email);
        if (!r.ok) {
          console.error('[Auth] No se encontró admin para el empleado:', r.msg);
          alert('Esta cuenta de empleado no está vinculada a ningún administrador. Pide a tu admin que vuelva a crearte el usuario.');
          await this.signOutUser();
          return;
        }
        this._adminUid = r.adminUid;
        if (typeof setActiveOrgAdminUid === 'function') setActiveOrgAdminUid(r.adminUid);
        if (typeof setEmployeeProfile === 'function') setEmployeeProfile(r.profile);
      } else {
        // ADMIN
        this._adminUid = this._uid;
        if (typeof setActiveOrgAdminUid === 'function') setActiveOrgAdminUid(this._uid);
        if (typeof setEmployeeProfile === 'function') setEmployeeProfile(null);
      }

      if (typeof reloadStateAfterAuth === 'function') reloadStateAfterAuth();

      // Hay sesión: que el timeout del boot no muestre el login mientras cargamos.
      window._bootResolved = true;

      // ARRANQUE INSTANTÁNEO: pintamos la app YA desde la caché local, sin esperar
      // a la nube — pero SOLO si la caché local tiene contenido (fincas). Si iOS
      // purgó localStorage, pintaríamos la semana gris y medio segundo después
      // llegarían los colores (flash feo): en ese caso mantenemos el boot-screen
      // hasta el primer dato de la nube y pintamos ya con colores.
      const _hayCacheLocal = Array.isArray(window.CONFIG_FINCAS) && window.CONFIG_FINCAS.length > 0;
      if (!this._appShown && _hayCacheLocal) {
        this._appShown = true;
        if (typeof onAuthReadyApp === 'function') onAuthReadyApp();
      }

      // Conectar a la ruta de datos del admin (común a admin y empleado)
      const path = `users/${this._adminUid}/nv_state`;
      this.dataRef = ref(this.db, path);
      this.enabled = true;
      this._uploadedOnce = false;

      // Limpiar listener anterior si quedó vivo de una sesión previa
      // (BUGFIX: antes onValue no se desuscribía en logout → al cambiar de
      // cuenta el listener viejo seguía sobrescribiendo window.* con los
      // datos de la cuenta anterior.)
      if (this._dataUnsub) { try { this._dataUnsub(); } catch(e) {} this._dataUnsub = null; }

      this._dataUnsub = onValue(this.dataRef, (snapshot) => {
        const remote = snapshot.val();
        if (!remote) {
          this._stateLoaded = true;   // nube vacía: la copia local es la buena
          if (!this._uploadedOnce && !isEmployee) {
            this._uploadedOnce = true;
            console.log('[Sync] Nube vacía — subiendo local (una vez)');
            this.pushToCloud();
          }
          // Nube vacía (cuenta nueva o sin datos): mostrar la app igualmente.
          if (!this._appShown) {
            this._appShown = true;
            if (typeof onAuthReadyApp === 'function') onAuthReadyApp();
          }
          // NOTA: las facturas (nv_fact) ya NO se cargan al arrancar — se cargan
          // BAJO DEMANDA con NV_SYNC.cargarFacturas() al entrar en Facturación/
          // Contabilidad/Ajustes o al generar una factura. Ahorra descargar
          // facturas en cada apertura de la app que no las necesita.
          this._initComprasSync(ref, onValue, isEmployee);
          this._initPrivSync(ref, onValue, isEmployee);
          return;
        }
        this._uploadedOnce = true;
        // 🔴 Fusión por clave: de este snapshot se aplica TODO lo que este
        // dispositivo no haya cambiado desde el último push. Lo que sí tiene
        // cambios locales sin subir se conserva (lo subirá el push pendiente).
        // Así ni se revierte lo recién hecho aquí ni se pierde lo que hizo otra
        // persona: antes se elegía entre una cosa o la otra y algo se perdía.
        const _locales = this._stateValues();
        const _dirty = {};
        Object.keys(_locales).forEach(k => {
          if (k === 'houseData' || k === 'schedOver') return;   // se fusionan clave a clave
          _dirty[k] = (JSON.stringify(_locales[k] === undefined ? null : _locales[k]) !== this._lastKeyJson[k]);
        });
        // ¿Se puede aplicar esta clave del remoto?
        //  - Sin referencia previa (primer snapshot de la sesión): sí, la nube
        //    manda... salvo que haya un push en vuelo (habría cambios locales
        //    recién hechos que aún no han subido).
        //  - Con referencia: solo si el valor local sigue siendo el que ya
        //    conocíamos del servidor (o sea, no lo hemos tocado aquí).
        const _puedo = (k) => (this._lastKeyJson[k] === undefined) ? !this._pushTimer : !_dirty[k];
        this.applyingRemote = true;
        this._stateLoaded = true;
        try {
          if (_puedo('fuelDays')  && remote.fuelDays  && Object.keys(remote.fuelDays).length)  { window.fuelDays  = remote.fuelDays;  this._lastKeyJson.fuelDays  = JSON.stringify(remote.fuelDays); }
          if (_puedo('wkndTasks') && remote.wkndTasks && Object.keys(remote.wkndTasks).length) { window.wkndTasks = remote.wkndTasks; this._lastKeyJson.wkndTasks = JSON.stringify(remote.wkndTasks); }
          // houseData: fusión FINCA A FINCA (dos personas en fincas distintas
          // no deben pisarse). Solo se toca la finca que no tenga cambios locales.
          if (remote.houseData && Object.keys(remote.houseData).length) {
            const hdLocal = window.houseData || (window.houseData = {});
            Object.keys(remote.houseData).forEach(f => {
              const jl = JSON.stringify(hdLocal[f] === undefined ? null : hdLocal[f]);
              const sinRef = (this._lastHdJson[f] === undefined);
              // Una finca que aquí no existe se aplica siempre (no hay nada
              // local que proteger); las demás, solo si no las he tocado yo.
              const sinLocal = (hdLocal[f] === undefined);
              if (sinLocal || (sinRef ? !this._pushTimer : (jl === this._lastHdJson[f]))) {
                hdLocal[f] = remote.houseData[f];
                this._lastHdJson[f] = JSON.stringify(remote.houseData[f]);
              }
            });
            // Fincas que ya no están en el servidor y tampoco tocadas aquí
            Object.keys(hdLocal).forEach(f => {
              if (remote.houseData[f] === undefined && this._lastHdJson[f] !== undefined
                  && JSON.stringify(hdLocal[f]) === this._lastHdJson[f]) {
                delete hdLocal[f]; delete this._lastHdJson[f];
              }
            });
          }
          if (_puedo('empHours')  && remote.empHours  && Object.keys(remote.empHours).length)  { window.empHours  = remote.empHours;  this._lastKeyJson.empHours  = JSON.stringify(remote.empHours); }
          // schedOver: fusión TURNO A TURNO (mismo criterio que houseData). Sin
          // esto, dos personas tocando días distintos del calendario se pisaban.
          if (remote.schedOver && Object.keys(remote.schedOver).length) {
            const soLocal = window.schedOver || (window.schedOver = {});
            Object.keys(remote.schedOver).forEach(k => {
              const jl = JSON.stringify(soLocal[k] === undefined ? null : soLocal[k]);
              const sinRef = (this._lastSoJson[k] === undefined);
              const sinLocal = (soLocal[k] === undefined);
              // - Sin referencia Y sin nada local: turno nuevo de otra persona,
              //   no hay nada que proteger → se aplica siempre.
              // - Sin referencia pero con algo local: lo he creado yo y aún no
              //   ha subido → no pisarlo si hay un push en vuelo.
              // - Con referencia: solo si sigue igual que lo último que se supo
              //   del servidor. Si aquí se cambió o se BORRÓ, manda lo local
              //   (jl === 'null' no coincide con la referencia) y lo sube el push.
              //   🔴 Por eso no vale el "sinLocal" a secas de houseData: un turno
              //   borrado aquí resucitaría con el siguiente eco del servidor.
              if ((sinLocal && sinRef) || (sinRef ? !this._pushTimer : (jl === this._lastSoJson[k]))) {
                soLocal[k] = remote.schedOver[k];
                this._lastSoJson[k] = JSON.stringify(remote.schedOver[k]);
              }
            });
            // Turnos que ya no están en el servidor y tampoco tocados aquí
            Object.keys(soLocal).forEach(k => {
              if (remote.schedOver[k] === undefined && this._lastSoJson[k] !== undefined
                  && JSON.stringify(soLocal[k]) === this._lastSoJson[k]) {
                delete soLocal[k]; delete this._lastSoJson[k];
              }
            });
          }
          // COMPRAS-SPLIT: compras vive ahora en su propio nodo (nv_compras).
          // Solo se aplica desde nv_state como LEGACY mientras el nuevo no cargue.
          if (!this._comprasLoaded && Array.isArray(remote.compras)) window.compras = remote.compras;
          if (_puedo('estancias') && Array.isArray(remote.estancias)) { window.estancias = remote.estancias; this._lastKeyJson.estancias = JSON.stringify(remote.estancias); }
          if (_puedo('recordatorios') && Array.isArray(remote.recordatorios)) { window.recordatorios = remote.recordatorios; this._lastKeyJson.recordatorios = JSON.stringify(remote.recordatorios); }
          if (_puedo('tratamientos') && Array.isArray(remote.tratamientos)) { window.tratamientos = remote.tratamientos; this._lastKeyJson.tratamientos = JSON.stringify(remote.tratamientos); }
          // PRIV-SPLIT: clientes/resumenesFinca viven ahora en su propio nodo
          // solo-admin (nv_priv). Solo se aplican desde nv_state como LEGACY,
          // mientras el nodo nuevo no haya cargado (datos antiguos sin migrar).
          if (!this._privLoaded) {
            if (Array.isArray(remote.resumenesFinca)) { window.resumenesFinca = remote.resumenesFinca; this._lastKeyJson.resumenesFinca = JSON.stringify(remote.resumenesFinca); }
            if (Array.isArray(remote.clientes)) { window.clientes = remote.clientes; this._lastKeyJson.clientes = JSON.stringify(remote.clientes); }
          }
          // FACT-SPLIT: facturas/papelera/misDatos viven ahora en su propio nodo
          // (nv_fact). Solo se aplican desde nv_state como LEGACY, mientras el
          // nodo nuevo no haya cargado (compatibilidad con datos antiguos).
          if (!this._factLoaded) {
            if (remote.misDatos && typeof remote.misDatos === 'object') window.misDatos = remote.misDatos;
            if (Array.isArray(remote.facturas)) window.facturas = remote.facturas;
            if (Array.isArray(remote.papelera)) window.papelera = remote.papelera;
          }
          // NOTA: los fichajes ya NO se aplican desde nv_state. Su fuente es el
          // nodo protegido 'fichajes/<adminUid>' (append-only, inmutable por reglas),
          // que tiene su propio listener más abajo. La copia en nv_state queda solo
          // como respaldo y NO debe sobrescribir window.fichajes.
          if (_puedo('permisos') && remote.permisos  && Object.keys(remote.permisos).length)  { window.permisos  = remote.permisos; this._lastKeyJson.permisos = JSON.stringify(remote.permisos); }
          if (remote.nextId    > (window.nextId || 0)) { window.nextId = remote.nextId; this._lastKeyJson.nextId = JSON.stringify(remote.nextId); }
          if (_puedo('config') && remote.config) {
            if (Array.isArray(remote.config.fincas)    && remote.config.fincas.length)    window.CONFIG_FINCAS    = remote.config.fincas;
            if (Array.isArray(remote.config.empleados) && remote.config.empleados.length) window.CONFIG_EMPLEADOS = remote.config.empleados;
            if (Array.isArray(remote.config.vehiculos) && remote.config.vehiculos.length) window.CONFIG_VEHICULOS = remote.config.vehiculos;
            if (Array.isArray(remote.config.materiales) && remote.config.materiales.length) window.CONFIG_MATERIALES = remote.config.materiales;
            if (Array.isArray(remote.config.manoObra) && remote.config.manoObra.length) window.CONFIG_MANO_OBRA = remote.config.manoObra;
            if (Array.isArray(remote.config.fitosanitarios)) window.CONFIG_FITOSANITARIOS = remote.config.fitosanitarios;
            if (Array.isArray(remote.config.plantas)) window.CONFIG_PLANTAS = remote.config.plantas;
          }
          // PRIV-SPLIT: tras aplicar config, volcar los campos privados de los
          // empleados (dirección, teléfono, carnés) desde la caché de nv_priv:
          // el config que llega de nv_state ya viene SIN ellos.
          this._mergeEmpPriv();
          if (typeof refreshConfigGlobals === 'function') refreshConfigGlobals();
          if (typeof ensureHouseData === 'function') ensureHouseData();
          if (_puedo('config')) this._lastKeyJson.config = JSON.stringify(this._stateValues().config);
          if (remote.matLastMonth) window.matLastMonth = remote.matLastMonth;
          if (remote.fitoLastMonth) window.fitoLastMonth = remote.fitoLastMonth;
          if (remote.plantasLastMonth) window.plantasLastMonth = remote.plantasLastMonth;
          ['matLastMonth','fitoLastMonth','plantasLastMonth'].forEach(k => { this._lastKeyJson[k] = JSON.stringify(window[k] || null); });
          if (typeof checkMaterialesRollover === 'function') { try { checkMaterialesRollover(); } catch(e){} }
          if (typeof checkFitosanitariosRollover === 'function') { try { checkFitosanitariosRollover(); } catch(e){} }
          if (typeof checkPlantasRollover === 'function') { try { checkPlantasRollover(); } catch(e){} }
          this._saveLocal();
          if (typeof rerenderActive === 'function') rerenderActive();
          else if (typeof buildWeek === 'function') buildWeek();
        } finally {
          this.applyingRemote = false;
          // Si algo guardó durante el apply (p. ej. el rollover mensual de
          // materiales), o hubo un push en espera de la primera carga, se
          // dispara ahora en vez de perderse.
          if (this._pushTrasApply || this._pushTrasCarga) { this._pushTrasApply = false; this._pushTrasCarga = false; this.pushToCloud(); }
          // Caché local vacía al arrancar: mostramos la app AHORA, ya con los
          // datos (y colores) de la nube aplicados. Sin flash gris.
          if (!this._appShown) {
            this._appShown = true;
            if (typeof onAuthReadyApp === 'function') onAuthReadyApp();
          }
          // FACT-SPLIT: las facturas (nv_fact) se cargan BAJO DEMANDA, no aquí
          // (ver NV_SYNC.cargarFacturas). Compras y nv_priv sí van al arrancar.
          this._initComprasSync(ref, onValue, isEmployee);
          this._initPrivSync(ref, onValue, isEmployee);
          // FITO-SPLIT: sacar de nv_state las fotos de los fitosanitarios.
          if (!isEmployee) { try { this._migrarFitoFotos(); } catch(e) {} }
        }
      });

      console.log('[Sync] ✓ Conectado a', path);
      // ===== FICHAJES: nodo protegido (append-only, inmutable por reglas) =====
      // Vive FUERA de users/<uid> a propósito: en RTDB no se puede revocar la
      // escritura concedida en un padre, así que el registro horario necesita su
      // propio árbol con reglas de solo-añadir para ser inviolable.
      try {
        // 🔴 El empleado solo se suscribe a SU nodo: los fichajes llevan
        // geolocalización, y antes cada trabajador se descargaba el árbol entero
        // (dónde y a qué hora había estado cada compañero). Las reglas ya solo
        // le dejan leer el suyo; el admin sigue leyendo la cuenta completa.
        const _miClave = isEmployee ? String((this._email || '').split('@')[0].split('+')[0] || '') : null;
        this.fichajesRef = ref(this.db, 'fichajes/' + this._adminUid + (_miClave ? '/' + _miClave : ''));
        // Migración única: si el nodo está vacío y hay fichajes locales, subirlos.
        try {
          if (!isEmployee) {
            const snapF = await get(this.fichajesRef);
            if (!snapF.exists() && window.fichajes && Object.keys(window.fichajes).length) {
              await this._migrarFichajes(ref, set);
            }
          }
        } catch (e) { console.warn('[Fichaje] migración omitida:', e && e.message); }
        if (this._fichajesUnsub) { try { this._fichajesUnsub(); } catch(e) {} this._fichajesUnsub = null; }
        this._fichajesUnsub = onValue(this.fichajesRef, (snapF) => {
          // Al empleado le llega solo su nodo: se reenvuelve con su clave para
          // que el resto del código lo vea con la misma forma de siempre.
          const v = _miClave ? { [_miClave]: (snapF.val() || {}) } : (snapF.val() || {});
          const mergeById = (localArr, protArr) => {
            const m = {};
            (localArr||[]).forEach(x=>{ if(x&&x.id!=null) m[x.id]=x; });
            (protArr||[]).forEach(x=>{ if(x&&x.id!=null) m[x.id]=x; }); // protegido pisa
            return Object.keys(m).map(k=>m[k]).sort((a,b)=>(a.ts||0)-(b.ts||0));
          };
          const base = (window.fichajes && typeof window.fichajes==='object') ? window.fichajes : {};
          const out = {};
          // partir de lo que ya hay en memoria/caché local (no perder nada reciente)
          Object.keys(base).forEach(k=>{
            const b=base[k]||{};
            out[k] = { eventos:this._fjObjToArr(b.eventos), anulaciones:this._fjObjToArr(b.anulaciones), auditoria:this._fjObjToArr(b.auditoria) };
          });
          // fusionar el nodo protegido (fuente inmutable, tiene precedencia)
          Object.keys(v).forEach(k=>{
            const node=v[k]||{};
            out[k] = out[k] || { eventos:[], anulaciones:[], auditoria:(base[k]&&base[k].auditoria)||[] };
            out[k].eventos     = mergeById(out[k].eventos,     this._fjObjToArr(node.eventos));
            out[k].anulaciones = mergeById(out[k].anulaciones, this._fjObjToArr(node.anulaciones));
          });
          window.fichajes = out;
          // Auto-reparación: subir al nodo protegido los registros que solo están
          // en local (p. ej. creados sin conexión y perdidos antes de sincronizar).
          try {
            Object.keys(out).forEach(k=>{
              const node=v[k]||{};
              const pe={}; this._fjObjToArr(node.eventos).forEach(e=>{ if(e&&e.id!=null) pe[e.id]=1; });
              const pa={}; this._fjObjToArr(node.anulaciones).forEach(a=>{ if(a&&a.id!=null) pa[a.id]=1; });
              out[k].eventos.forEach(ev=>{ if(ev&&ev.id!=null && !pe[ev.id]) this.fichajeAppend(k, ev); });
              // Las anulaciones ya solo las escribe el admin (corregir un fichaje
              // es cosa suya): al empleado ni se le intenta, daría permiso denegado.
              if (!isEmployee) out[k].anulaciones.forEach(an=>{ if(an&&an.id!=null && !pa[an.id]) this.fichajeAnular(k, an); });
            });
          } catch(e) { /* no crítico */ }
          if (typeof rerenderActive === 'function') { try { rerenderActive(); } catch(e) {} }
        });
      } catch (e) { console.warn('[Fichaje] listener no disponible:', e && e.message); }

      if (window.PLAN && PLAN.init) { try { await PLAN.init(); } catch(e) {} }
      // Push según plan: solo pedimos permiso y registramos token si el plan incluye avisos al móvil.
      if (!window.PLAN || !PLAN.permite || PLAN.permite('push')) {
        await this.initMessaging(this._firebaseApp);
      } else {
        // Plan sin push: quitar cualquier token previo para no recibir avisos.
        try { await this.dbWrite(`users/${this._uid}/fcm_token`, null); localStorage.removeItem('nv_fcm_token'); } catch(e) {}
      }
      if (typeof onAuthReadyApp === 'function' && !this._appShown) onAuthReadyApp();
    } catch(err) { console.error('[Sync] Error _onSignedIn:', err); }
  },

  // ===== FACT-SPLIT: nodo separado users/<adminUid>/nv_fact =====
  // Contiene lo pesado que no hace falta en cada arranque: facturas, papelera,
  // misDatos (empresa/plantilla email/logo). Los módulos siguen leyendo
  // window.facturas etc. — solo cambia dónde se sincroniza.
  _factPayload: function() {
    return {
      facturas: window.facturas || [],
      papelera: window.papelera || [],
      misDatos: window.misDatos || {}
    };
  },
  // Carga las facturas de la nube BAJO DEMANDA (ya NO al arrancar). Idempotente:
  // la primera llamada arranca el listener; devuelve una promesa que resuelve
  // cuando window.facturas ya está fresco. Se llama al entrar en Facturación/
  // Contabilidad/Ajustes y ANTES de generar cualquier factura (número correcto).
  cargarFacturas: function() {
    if (this._factReady) return this._factReady;
    this._factReady = new Promise((resolve) => { this._factReadyResolve = resolve; });
    // Salvaguarda: nunca colgar más de 5s. Si el listener no respondiera,
    // seguimos con lo que haya en memoria/caché (no bloquear al usuario).
    try { setTimeout(() => this._marcarFactListo(), 5000); } catch(e) {}
    try {
      if (this._dbRef && this._dbOnValue && this.db && this._adminUid) {
        const isEmployee = !!(this._email && this._email.endsWith('@nv.local'));
        this._initFactSync(this._dbRef, this._dbOnValue, isEmployee);
      } else {
        // DB aún no lista: resolvemos ya (los datos locales/caché están cargados).
        this._marcarFactListo();
      }
    } catch (e) { this._marcarFactListo(); }
    return this._factReady;
  },
  _marcarFactListo: function() {
    if (this._factReadyResolve) { this._factReadyResolve(); this._factReadyResolve = null; }
    // Si se resolvió SIN datos reales aplicados (timeout de 5 s o snapshot
    // descartado), la promesa no se cachea: la próxima llamada a
    // cargarFacturas volverá a esperar en vez de dar por buena la caché vieja
    // (antes, generar una factura con red lenta usaba numeración desactualizada
    // para siempre).
    if (!this._factLoaded) this._factReady = null;
  },
  // Borra la copia vieja (legacy) de facturas/papelera/misDatos de nv_state.
  // Se llama SOLO tras confirmar que están a salvo en nv_fact (ver _initFactSync).
  _limpiarLegacyNvState: function() {
    if (this._legacyLimpiado || !this.dataRef || !this._dbUpdate) return;
    this._legacyLimpiado = true;
    try {
      this._dbUpdate(this.dataRef, { facturas: null, papelera: null, misDatos: null })
        .then(() => console.log('[Sync] Copia legacy de facturas eliminada de nv_state'))
        .catch(e => { this._legacyLimpiado = false; console.warn('[Sync] limpieza legacy nv_state:', e && e.message); });
    } catch (e) { this._legacyLimpiado = false; }
  },
  _initFactSync: function(ref, onValue, isEmployee) {
    if (this._factSyncStarted) return;
    // Nodo solo-admin: al empleado ni se le suscribe (las reglas se lo deniegan
    // y cada intento cuenta como rechazo). Mismo patrón que _initPrivSync y
    // _initComprasSync. Se deja factRef a null a propósito: así _doPush tampoco
    // intenta escribir nv_fact. Y se marca listo para no dejar colgada 5 s a
    // quien esté esperando cargarFacturas().
    if (isEmployee) {
      this._factSyncStarted = true;
      this._factLoaded = true;
      this._marcarFactListo();
      return;
    }
    this._factSyncStarted = true;
    try {
      this.factRef = ref(this.db, `users/${this._adminUid}/nv_fact`);
      if (this._factUnsub) { try { this._factUnsub(); } catch(e) {} this._factUnsub = null; }
      this._factUnsub = onValue(this.factRef, (snap) => {
        const v = snap.val();
        // Nº de facturas que había ANTES de aplicar (para no borrar el legacy si
        // nv_fact tuviera menos — salvaguarda contra pérdida de datos).
        const legacyCount = Array.isArray(window.facturas) ? window.facturas.length : 0;
        if (!v) {
          // Nodo nuevo aún vacío: migrar UNA VEZ desde lo ya cargado (legacy/local).
          this._factLoaded = true;
          this._marcarFactListo();
          const pl = this._factPayload();
          const hayDatos = (pl.facturas.length || pl.papelera.length || Object.keys(pl.misDatos).length);
          if (hayDatos && !isEmployee && !this._factMigrated) {
            this._factMigrated = true;
            this._lastFactJson = JSON.stringify(pl);
            console.log('[Sync] Migrando facturas/misDatos al nodo nv_fact');
            this.set(this.factRef, Object.assign({ lastUpdate: Date.now() }, pl))
              .then(() => { if (!isEmployee) this._limpiarLegacyNvState(); }) // limpiar SOLO tras confirmar en nv_fact
              .catch(err => { this._lastFactJson = null; console.warn('[Sync] Migración nv_fact:', err); });
          }
          return;
        }
        // BUGFIX: no pisar cambios locales que aún no han subido. Si hay un push
        // pendiente (debounce) o una escritura de nv_fact en vuelo, este snapshot
        // es el estado ANTERIOR: aplicarlo revertía cosas recién marcadas (p.ej.
        // "email enviado" volvía a gris hasta refrescar). El snapshot NO se tira:
        // se marca _factRelee y al terminar el push se relee la nube (get), que
        // ya incluye nuestro cambio Y lo que hubiera subido otro dispositivo.
        // OJO: _factLoaded NO se marca aquí — hasta aplicar un snapshot real,
        // _doPush tiene prohibido subir nv_fact (evita machacar la nube con
        // una caché local vieja o vacía).
        // Disparar la relectura AQUÍ: si el snapshot llega cuando _doPush ya
        // pasó por _programarRelectura, nadie releía y el cambio del otro
        // dispositivo quedaba en el limbo hasta el siguiente push local.
        if (this._pushTimer || this._factPushing) { this._factRelee = true; this._marcarFactListo(); this._programarRelectura(); return; }
        this._aplicarFactRemoto(v, isEmployee, legacyCount);
      });
    } catch(e) { console.warn('[Sync] fact-sync no disponible:', e && e.message); }
  },
  // Aplica un estado remoto de nv_fact (desde el listener o desde la relectura
  // tras un push). Idempotente.
  _aplicarFactRemoto: function(v, isEmployee, legacyCount) {
    const primeraCarga = !this._factLoaded;
    this._factLoaded = true;
    this.applyingRemote = true;
    try {
      if (Array.isArray(v.facturas)) {
        let nuevas = v.facturas;
        // Primera carga con red lenta/offline: conservar facturas creadas EN
        // ESTA SESIÓN que aún no llegaron a la nube. Se exige savedAt posterior
        // al arranque de la sesión para NO resucitar facturas borradas desde
        // otro dispositivo (la caché local vieja no cuenta).
        if (primeraCarga && Array.isArray(window.facturas) && window.facturas.length) {
          const ids = {};
          nuevas.forEach(f => { if (f && f.id != null) ids[f.id] = 1; });
          (Array.isArray(v.papelera) ? v.papelera : []).forEach(f => { if (f && f.id != null) ids[f.id] = 1; });
          const locales = window.facturas.filter(f => f && f.id != null && !ids[f.id] && (+f.savedAt || 0) >= this._sessionStart);
          if (locales.length) { nuevas = nuevas.concat(locales); this._factFusion = true; }
        }
        window.facturas = nuevas;
      }
      if (Array.isArray(v.papelera)) window.papelera = v.papelera;
      if (v.misDatos && typeof v.misDatos === 'object') window.misDatos = v.misDatos;
      // Si se han rescatado facturas locales, el estado ya NO coincide con la
      // nube: dejar _lastFactJson a null para que el push las suba de verdad
      // (con el JSON ya fusionado, el push se saltaba por "no ha cambiado").
      this._lastFactJson = this._factFusion ? null : JSON.stringify(this._factPayload());
      if (this._factFusion) { this._factFusion = false; this._pushTrasApply = true; }
      this._saveLocal();
      this._marcarFactListo(); // facturas frescas ya aplicadas
      if (typeof rerenderActive === 'function') { try { rerenderActive(); } catch(e) {} }
      // Limpiar la copia legacy de nv_state SOLO si nv_fact es igual o MÁS
      // completo (nunca borrar si nv_fact tuviera menos facturas que el legacy).
      if (!isEmployee && Array.isArray(v.facturas) && v.facturas.length >= legacyCount) {
        this._limpiarLegacyNvState();
      }
    } finally {
      this.applyingRemote = false;
      if (this._pushTrasApply) { this._pushTrasApply = false; this.pushToCloud(); }
    }
  },

  // ===== COMPRAS-SPLIT: nodo separado users/<adminUid>/nv_compras =====
  // Las compras eran el 90% del peso de nv_state (fotos de tickets en base64):
  // cada cambio de CUALQUIER cosa re-descargaba ~11 MB a todos los dispositivos
  // (~16 €/día de ancho de banda). Ahora: la lista vive en nv_compras (ligera,
  // solo miniaturas) y cada foto grande en nv_compras_fotos/<id>, que se baja
  // SOLO cuando alguien la abre.
  _comprasPayload: function() { return { compras: window.compras || [] }; },

  _initComprasSync: function(ref, onValue, isEmployee) {
    if (this._comprasSyncStarted) return;
    // Compras es zona de admin: al empleado ni se le suscribe (las reglas se lo
    // deniegan, y sin esto el listener soltaría un error de permisos en bucle).
    if (isEmployee) { this._comprasSyncStarted = true; return; }
    this._comprasSyncStarted = true;
    try {
      this.comprasRef = ref(this.db, `users/${this._adminUid}/nv_compras`);
      if (this._comprasUnsub) { try { this._comprasUnsub(); } catch(e) {} this._comprasUnsub = null; }
      this._comprasUnsub = onValue(this.comprasRef, (snap) => {
        const v = snap.val();
        if (!v) {
          // Nodo aún no creado: seguimos en modo legacy (compras dentro de
          // nv_state). Migra SOLO el admin, una única vez.
          if (!isEmployee && !this._comprasMigrated) {
            this._comprasMigrated = true;
            this._migrarCompras();
          }
          return;
        }
        // Guard ANTES de marcar el nodo como listo: si este snapshot se
        // descarta, _doPush no debe ni subir nv_compras ni borrar el respaldo
        // legacy de nv_state (eso, solo tras aplicar datos de verdad). El
        // snapshot no se tira: _comprasRelee fuerza una relectura tras el push.
        if (this._pushTimer || this._comprasPushing) { this._comprasRelee = true; this._programarRelectura(); return; }
        this._aplicarComprasRemoto(v);
      });
    } catch(e) { console.warn('[Sync] compras-sync no disponible:', e && e.message); }
  },
  // Aplica un estado remoto de nv_compras (listener o relectura). Idempotente.
  _aplicarComprasRemoto: function(v) {
    this._comprasLoaded = true;
    this._comprasNodeReady = true;
    this.applyingRemote = true;
    try {
      if (Array.isArray(v.compras)) window.compras = v.compras;
      this._lastComprasJson = JSON.stringify(this._comprasPayload());
      this._saveLocal();
      if (typeof rerenderActive === 'function') { try { rerenderActive(); } catch(e) {} }
      try {
        // Solo repintar Compras si el usuario está DENTRO de esa pestaña y no
        // en el detalle de una finca (buildCompras cambiaba de vista y dejaba
        // la app sin barra de navegación).
        const vc = document.getElementById('view-compras');
        // 🔴 _selectedFincaView y currentComprasFinca son `let` de nivel
        // superior en scripts clásicos: NO existen como window.*. Con
        // window.currentComprasFinca (siempre undefined) el guard nunca
        // saltaba y el eco del sync, ~1 s después de añadir una compra desde
        // una finca, repintaba la lista general encima del detalle (y sin
        // barra de navegación: no se podía ni volver).
        const enDetalleFinca = !!((typeof _selectedFincaView !== 'undefined' && _selectedFincaView) ||
                                  (typeof currentComprasFinca !== 'undefined' && currentComprasFinca));
        if (vc && vc.style.display !== 'none' && !enDetalleFinca && typeof buildCompras === 'function') buildCompras();
      } catch(e) {}
    } finally {
      this.applyingRemote = false;
      if (this._pushTrasApply) { this._pushTrasApply = false; this.pushToCloud(); }
      // TH-SPLIT: sacar las miniaturas inline al nodo nv_compras_th (solo admin).
      if (!(this._email && this._email.endsWith('@nv.local'))) { try { this._migrarComprasThumbs(); } catch(e) {} }
    }
  },

  // Migración única (admin): sube cada foto grande a nv_compras_fotos/<id>,
  // deja en la compra miniatura + referencia, escribe nv_compras y borra la
  // copia legacy de nv_state. Si alguna foto falla, se queda inline (no se
  // pierde nada) y el legacy NO se borra.
  _migrarCompras: async function() {
    try {
      const arr = Array.isArray(window.compras) ? window.compras : [];
      let todasOk = true;
      for (const c of arr) {
        if (c && typeof c.img === 'string' && c.img.indexOf('data:') === 0) {
          const fid = 'cf_' + (c.id != null ? c.id : Math.random().toString(36).slice(2, 10));
          try {
            const th = await this._thumbDataUrl(c.img, 96, 0.6);
            await this.set(this._dbRef(this.db, `users/${this._adminUid}/nv_compras_fotos/${fid}`), c.img);
            c.imgRef = fid;
            if (th) c.imgTh = th;
            delete c.img;
          } catch(e) { todasOk = false; console.warn('[Sync] Migración foto compra:', e && e.message); }
        }
      }
      const pl = this._comprasPayload();
      const j = JSON.stringify(pl);
      this._lastComprasJson = j;
      this._comprasPushing = j;
      await this.set(this.comprasRef, Object.assign({ lastUpdate: Date.now() }, pl));
      this._comprasPushing = null;
      this._comprasLoaded = true;
      this._comprasNodeReady = true;
      if (todasOk) { try { await this._dbUpdate(this.dataRef, { compras: null }); } catch(e) {} }
      this._saveLocal();
      console.log('[Sync] Compras migradas a nv_compras (' + arr.length + ' items)');
    } catch(e) {
      this._comprasPushing = null;
      console.warn('[Sync] Migración compras:', e && e.message);
    }
  },

  // Miniatura JPEG de un dataURL (para las listas). Devuelve null si falla.
  _thumbDataUrl: function(dataUrl, maxDim, calidad) {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          try {
            let w = img.width, h = img.height;
            if (w > h) { if (w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; } }
            else { if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; } }
            const cv = document.createElement('canvas');
            cv.width = w; cv.height = h;
            cv.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(cv.toDataURL('image/jpeg', calidad || 0.6));
          } catch(e) { resolve(null); }
        };
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      } catch(e) { resolve(null); }
    });
  },

  // API de fotos de compras (bajo demanda)
  comprasFotoGet: async function(fid) {
    try {
      if (!fid || !this._adminUid || !this.db) return null;
      const snap = await this._dbGet(this._dbRef(this.db, `users/${this._adminUid}/nv_compras_fotos/${fid}`));
      return snap.val() || null;
    } catch(e) { return null; }
  },
  comprasFotoSet: async function(fid, b64) {
    try {
      if (!fid || !this._adminUid || !this.db) return false;
      await this.set(this._dbRef(this.db, `users/${this._adminUid}/nv_compras_fotos/${fid}`), b64 || null);
      return true;
    } catch(e) { return false; }
  },

  // ===== TH-SPLIT: miniaturas de compras en users/<adminUid>/nv_compras_th =====
  // Vivían dentro de nv_compras (145 KB de los 160 que pesa el nodo), que se
  // baja ENTERA al arrancar el admin aunque no vaya a pisar Compras. Ahora van
  // en un nodo aparte de una sola lectura, que se pide solo cuando de verdad se
  // van a pintar miniaturas (Compras, o Contabilidad → Facturas de gasto).
  // Las compras antiguas o creadas sin conexión siguen llevando c.imgTh inline:
  // _compraThumb() acepta las dos formas.
  cargarComprasThumbs: function() {
    if (this._thReady) return this._thReady;
    // 🔴 Nodo solo-admin: al empleado ni se le pide (las reglas se lo deniegan y
    // cada intento cuenta como rechazo). Se deja el mapa vacío y _compraThumb
    // cae en la miniatura inline, si la compra la trae.
    if (this._email && this._email.endsWith('@nv.local')) {
      window._comprasTh = window._comprasTh || {};
      this._thReady = Promise.resolve();
      return this._thReady;
    }
    this._thReady = (async () => {
      try {
        if (!this._adminUid || !this.db || !this._dbGet) { window._comprasTh = window._comprasTh || {}; this._thReady = null; return; }
        const snap = await this._dbGet(this._dbRef(this.db, `users/${this._adminUid}/nv_compras_th`));
        window._comprasTh = snap.val() || {};
        // Repintar: la vista ya se pintó sin miniaturas mientras esto llegaba.
        if (typeof rerenderActive === 'function') { try { rerenderActive(); } catch(e) {} }
      } catch(e) {
        window._comprasTh = window._comprasTh || {};
        this._thReady = null;   // no cachear un fallo: reintentar la próxima vez
      }
    })();
    return this._thReady;
  },
  comprasThumbSet: async function(cid, b64) {
    try {
      if (cid == null || !this._adminUid || !this.db) return false;
      const k = String(cid);
      await this.set(this._dbRef(this.db, `users/${this._adminUid}/nv_compras_th/${k}`), b64 || null);
      if (!window._comprasTh) window._comprasTh = {};
      if (b64) window._comprasTh[k] = b64; else delete window._comprasTh[k];
      return true;
    } catch(e) { return false; }
  },
  // Migración única (admin): mueve las miniaturas inline de nv_compras al nodo
  // nv_compras_th. Solo se retiran de la lista las que se confirmen subidas.
  _migrarComprasThumbs: async function() {
    if (this._thMigrando || this._thMigrated) return;
    const arr = window.compras;
    if (!Array.isArray(arr)) return;
    const pend = arr.filter(c => c && c.id != null && typeof c.imgTh === 'string' && c.imgTh.startsWith('data:'));
    if (!pend.length) { this._thMigrated = true; return; }
    this._thMigrando = true;
    try {
      let movidas = 0;
      for (const c of pend) {
        if (!await this.comprasThumbSet(c.id, c.imgTh)) break;
        // Releer en el array VIVO: el sync puede haber reemplazado window.compras
        // durante la subida y el delete caería en un objeto huérfano.
        const live = (window.compras || []).find(x => x && x.id === c.id) || c;
        delete live.imgTh;
        movidas++;
      }
      if (movidas) {
        console.log('[Sync] Miniaturas de compras movidas a nv_compras_th (' + movidas + ')');
        if (movidas === pend.length) this._thMigrated = true;
        if (typeof saveState === 'function') saveState(); else this.pushToCloud();
      }
    } catch(e) { console.warn('[Sync] migración miniaturas compras:', e && e.message); }
    finally { this._thMigrando = false; }
  },

  // ===== FITO-SPLIT: fotos de fitosanitarios en users/<adminUid>/nv_fito_fotos =====
  // Eran el 66% del peso de nv_state (3 fotos = 612 KB dentro de
  // config.fitosanitarios), y nv_state se re-descarga ENTERO a todos los
  // dispositivos en cada cambio de cualquier cosa. Ahora en el catálogo queda
  // solo la miniatura (p.fotoTh, ~2 KB) y la marca p.fotoRef; la foto grande se
  // pide al abrir la ficha. Mismo patrón que las fotos de compras.
  _fitoFotoCache: {},
  fitoFotoGet: async function(fid) {
    try {
      if (fid == null || !this._adminUid || !this.db || !this._dbGet) return null;
      const k = String(fid);
      if (this._fitoFotoCache[k] !== undefined) return this._fitoFotoCache[k];
      const snap = await this._dbGet(this._dbRef(this.db, `users/${this._adminUid}/nv_fito_fotos/${k}`));
      const v = snap.val() || null;
      this._fitoFotoCache[k] = v;
      return v;
    } catch(e) { return null; }
  },
  fitoFotoSet: async function(fid, b64) {
    try {
      if (fid == null || !this._adminUid || !this.db) return false;
      const k = String(fid);
      await this.set(this._dbRef(this.db, `users/${this._adminUid}/nv_fito_fotos/${k}`), b64 || null);
      this._fitoFotoCache[k] = b64 || null;
      return true;
    } catch(e) { return false; }
  },
  // Migración única (admin). Si una subida falla no se borra nada y se reintenta
  // en el próximo arranque: la foto nunca se pierde.
  _migrarFitoFotos: async function() {
    if (this._fitoMigrando || this._fitoMigrated) return;
    const cat = window.CONFIG_FITOSANITARIOS;
    if (!Array.isArray(cat)) return;
    const pend = cat.filter(p => p && p.id != null && typeof p.foto === 'string' && p.foto.startsWith('data:'));
    if (!pend.length) { this._fitoMigrated = true; return; }
    this._fitoMigrando = true;
    try {
      let movidas = 0;
      for (const p of pend) {
        if (!await this.fitoFotoSet(p.id, p.foto)) break;
        let th = null;
        try { th = await this._thumbDataUrl(p.foto, 96, 0.6); } catch(e) {}
        const live = (window.CONFIG_FITOSANITARIOS || []).find(x => x && x.id === p.id) || p;
        live.fotoRef = true;
        if (th) live.fotoTh = th;
        delete live.foto;
        movidas++;
      }
      if (movidas) {
        console.log('[Sync] Fotos de fitosanitarios movidas a nv_fito_fotos (' + movidas + ')');
        if (movidas === pend.length) this._fitoMigrated = true;
        if (typeof saveState === 'function') saveState(); else this.pushToCloud();
      }
    } catch(e) { console.warn('[Sync] migración fito-fotos:', e && e.message); }
    finally { this._fitoMigrando = false; }
  },

  // ===== PRIV-SPLIT: nodo separado users/<adminUid>/nv_priv (SOLO ADMIN) =====
  // Datos que un empleado no debe poder leer: la cartera de clientes (nombres,
  // direcciones, emails), los resúmenes de finca (importes) y los datos
  // personales de los compañeros (dirección, teléfono, carnés). Antes viajaban
  // dentro de nv_state, que todo el equipo lee. Los módulos siguen usando
  // window.clientes, window.resumenesFinca y CONFIG_EMPLEADOS — solo cambia
  // dónde se sincronizan. En nv_state los empleados quedan solo con sus campos
  // públicos (init, name, active, username).
  _EMP_PRIV_CAMPOS: ['direccion', 'telefono', 'carnes', 'categoria'],
  _empPrivKey: function(e) { return String((e && (e.username || e.name)) || '_').replace(/[.#$/\[\]]/g, '_'); },
  // Lista de empleados SIN campos privados (lo que va en nv_state).
  _empPublicos: function() {
    const lista = Array.isArray(window.CONFIG_EMPLEADOS) ? window.CONFIG_EMPLEADOS : [];
    return lista.map(e => {
      if (!e || typeof e !== 'object') return e;
      const pub = Object.assign({}, e);
      this._EMP_PRIV_CAMPOS.forEach(k => { delete pub[k]; });
      return pub;
    });
  },
  // Mapa clave→campos privados de cada empleado (lo que va en nv_priv).
  _empPrivMap: function() {
    const out = {};
    (Array.isArray(window.CONFIG_EMPLEADOS) ? window.CONFIG_EMPLEADOS : []).forEach(e => {
      if (!e || typeof e !== 'object') return;
      const priv = {};
      let hay = false;
      this._EMP_PRIV_CAMPOS.forEach(k => {
        if (e[k] !== undefined && e[k] !== null && e[k] !== '') { priv[k] = e[k]; hay = true; }
      });
      if (hay) out[this._empPrivKey(e)] = priv;
    });
    return out;
  },
  // Vuelca los campos privados (caché de nv_priv) sobre CONFIG_EMPLEADOS.
  // Con la caché cargada también BORRA los campos que ya no estén en la nube
  // (si el admin quitó un teléfono en otro dispositivo, aquí desaparece).
  _mergeEmpPriv: function() {
    if (!this._empPrivCache) return;
    const lista = Array.isArray(window.CONFIG_EMPLEADOS) ? window.CONFIG_EMPLEADOS : [];
    lista.forEach(e => {
      if (!e || typeof e !== 'object') return;
      const priv = this._empPrivCache[this._empPrivKey(e)] || {};
      this._EMP_PRIV_CAMPOS.forEach(k => {
        if (priv[k] !== undefined) e[k] = priv[k]; else delete e[k];
      });
    });
  },
  _privPayload: function() {
    return {
      clientes: window.clientes || [],
      resumenesFinca: window.resumenesFinca || [],
      empPriv: this._empPrivMap()
    };
  },
  _initPrivSync: function(ref, onValue, isEmployee) {
    if (this._privSyncStarted) return;
    // Nodo solo-admin: al empleado ni se le suscribe (las reglas se lo deniegan
    // y el listener soltaría un error de permisos en bucle).
    if (isEmployee) { this._privSyncStarted = true; return; }
    this._privSyncStarted = true;
    try {
      this.privRef = ref(this.db, `users/${this._adminUid}/nv_priv`);
      if (this._privUnsub) { try { this._privUnsub(); } catch(e) {} this._privUnsub = null; }
      this._privUnsub = onValue(this.privRef, (snap) => {
        const v = snap.val();
        if (!v) {
          // Nodo aún no creado: migrar UNA VEZ desde lo ya cargado (legacy/local).
          if (!this._privMigrated) { this._privMigrated = true; this._migrarPriv(); }
          return;
        }
        // Guard ANTES de marcar el nodo como listo (mismo patrón que nv_fact y
        // nv_compras): si hay un push pendiente o escritura en vuelo, este
        // snapshot es el estado anterior. No se tira: se relee tras el push.
        if (this._pushTimer || this._privPushing) { this._privRelee = true; this._programarRelectura(); return; }
        this._aplicarPrivRemoto(v);
      });
    } catch(e) { console.warn('[Sync] priv-sync no disponible:', e && e.message); }
  },
  // Aplica un estado remoto de nv_priv (listener o relectura). Idempotente.
  // El set siempre lleva lastUpdate, así que el nodo nunca queda vacío; una
  // clave ausente significa "vaciado" (RTDB poda arrays/objetos vacíos).
  _aplicarPrivRemoto: function(v) {
    this._privLoaded = true;
    this._privNodeReady = true;
    this.applyingRemote = true;
    try {
      window.clientes = Array.isArray(v.clientes) ? v.clientes : [];
      window.resumenesFinca = Array.isArray(v.resumenesFinca) ? v.resumenesFinca : [];
      this._empPrivCache = (v.empPriv && typeof v.empPriv === 'object') ? v.empPriv : {};
      this._mergeEmpPriv();
      this._lastPrivJson = JSON.stringify(this._privPayload());
      this._saveLocal();
      if (typeof rerenderActive === 'function') { try { rerenderActive(); } catch(e) {} }
    } finally {
      this.applyingRemote = false;
      if (this._pushTrasApply) { this._pushTrasApply = false; this.pushToCloud(); }
    }
  },
  // Migración única (admin): escribe nv_priv con lo cargado del legacy/local y
  // dispara un push para retirar la copia legacy de nv_state (clientes y
  // resumenesFinca a null, config.empleados sin campos privados).
  _migrarPriv: async function() {
    try {
      const pl = this._privPayload();
      const j = JSON.stringify(pl);
      this._lastPrivJson = j;
      this._privPushing = j;
      this._empPrivCache = pl.empPriv;
      await this.set(this.privRef, Object.assign({ lastUpdate: Date.now() }, pl));
      this._privPushing = null;
      this._privLoaded = true;
      this._privNodeReady = true;
      this._saveLocal();
      console.log('[Sync] Clientes/resúmenes/datos de empleados migrados a nv_priv');
      this.pushToCloud();
    } catch(e) {
      this._privPushing = null;
      this._privMigrated = false;
      this._lastPrivJson = null;
      console.warn('[Sync] Migración nv_priv:', e && e.message);
    }
  },

  _onSignedOut: function() {
    // Cortar el listener de datos si aún estaba activo (lo abrió _onSignedIn).
    // BUGFIX: sin esto, al cambiar de cuenta el listener de la cuenta anterior
    // seguía vivo y podía sobrescribir window.* con datos cruzados.
    if (this._dataUnsub) { try { this._dataUnsub(); } catch(e) {} this._dataUnsub = null; }
    if (this._fichajesUnsub) { try { this._fichajesUnsub(); } catch(e) {} this._fichajesUnsub = null; }
    if (this._factUnsub) { try { this._factUnsub(); } catch(e) {} this._factUnsub = null; }
    this._factSyncStarted = false;
    this._factLoaded = false;
    this._factMigrated = false;
    this._lastFactJson = null;
    this._factPushing = null;
    this.factRef = null;
    if (this._comprasUnsub) { try { this._comprasUnsub(); } catch(e) {} this._comprasUnsub = null; }
    this._comprasSyncStarted = false;
    this._comprasLoaded = false;
    this._comprasMigrated = false;
    this._comprasNodeReady = false;
    this._lastComprasJson = null;
    this._comprasPushing = null;
    this.comprasRef = null;
    if (this._privUnsub) { try { this._privUnsub(); } catch(e) {} this._privUnsub = null; }
    this._privSyncStarted = false;
    this._privLoaded = false;
    this._privMigrated = false;
    this._privNodeReady = false;
    this._lastPrivJson = null;
    this._privPushing = null;
    this._empPrivCache = null;
    this.privRef = null;
    // Referencias de "lo último que se supo del servidor" y cachés de fotos: si
    // sobreviven a un cambio de cuenta, la cuenta nueva se compara contra los
    // datos de la vieja (claves que no se aplican, miniaturas cruzadas).
    this._lastKeyJson = {};
    this._lastHdJson = {};
    this._lastSoJson = {};
    this._thReady = null;
    this._thMigrated = false;
    this._thMigrando = false;
    window._comprasTh = null;
    this._fitoFotoCache = {};
    this._fitoMigrated = false;
    this._fitoMigrando = false;
    this._signupInProgress = false;
    this.enabled = false;
    this.dataRef = null;
    this._uploadedOnce = false;
    this._adminUid = null;
    this._appShown = false;
    if (typeof onAuthSignedOutApp === 'function') onAuthSignedOutApp();
  },

  // ===== API FICHAJES (nodo protegido, append-only) =====
  _fjSafeKey: function(k){ return String(k==null?'_':k).replace(/[.#$/\[\]]/g,'_'); },
  _fjObjToArr: function(o){
    if (Array.isArray(o)) return o.filter(x=>x!=null);
    if (o && typeof o==='object') return Object.keys(o).map(kk=>o[kk]).filter(x=>x!=null).sort((a,b)=>(a.ts||0)-(b.ts||0));
    return [];
  },
  // Añade un evento de fichaje. Devuelve Promise<bool> (true si quedó en el nodo protegido).
  fichajeAppend: function(empKey, ev){
    if (!this.enabled || !this._adminUid || !this.set || !this._dbRef || !this.db) return Promise.resolve(false);
    if (!ev || ev.id==null) return Promise.resolve(false);
    const path = 'fichajes/'+this._adminUid+'/'+this._fjSafeKey(empKey)+'/eventos/'+ev.id;
    return this.set(this._dbRef(this.db, path), ev).then(()=>true).catch(e=>{ console.warn('[Fichaje] append err:', e&&e.message); return false; });
  },
  // Añade una anulación (corrección trazable; nunca toca el evento original).
  fichajeAnular: function(empKey, an){
    if (!this.enabled || !this._adminUid || !this.set || !this._dbRef || !this.db) return Promise.resolve(false);
    if (!an || an.id==null) return Promise.resolve(false);
    const path = 'fichajes/'+this._adminUid+'/'+this._fjSafeKey(empKey)+'/anulaciones/'+an.id;
    return this.set(this._dbRef(this.db, path), an).then(()=>true).catch(e=>{ console.warn('[Fichaje] anular err:', e&&e.message); return false; });
  },
  // Migración única de fichajes locales (nv_state) al nodo protegido.
  _migrarFichajes: async function(ref, set){
    const src = window.fichajes || {};
    let n=0;
    for (const empKey of Object.keys(src)) {
      const k = this._fjSafeKey(empKey);
      const node = src[empKey] || {};
      const evs = Array.isArray(node.eventos) ? node.eventos : [];
      for (const ev of evs) {
        if (!ev || ev.id==null || !ev.tipo || ev.ts==null) continue;
        try { await set(ref(this.db, 'fichajes/'+this._adminUid+'/'+k+'/eventos/'+ev.id), ev); n++; } catch(e){}
        if (ev.anulado === true) {
          const an = { id:'mig_'+ev.id, eventoId:ev.id, ts:ev.anuladoTs||Date.now(), autor:ev.anuladoPor||'admin', motivo:ev.anuladoMotivo||'migración' };
          try { await set(ref(this.db, 'fichajes/'+this._adminUid+'/'+k+'/anulaciones/'+an.id), an); } catch(e){}
        }
      }
      const ans = Array.isArray(node.anulaciones) ? node.anulaciones : [];
      for (const an of ans) {
        if (!an || an.id==null || an.eventoId==null || an.ts==null) continue;
        try { await set(ref(this.db, 'fichajes/'+this._adminUid+'/'+k+'/anulaciones/'+an.id), an); } catch(e){}
      }
    }
    console.log('[Fichaje] migración a nodo protegido completada ('+n+' eventos)');
  },

  // Resolver qué admin tiene a este empleado registrado.
  // El email interno es "usuario+orgSlug@nv.local" y el índice global
  // `employee_index/<orgSlug>__<usuario>` guarda el adminUid.
  // SEGURIDAD: ese índice YA NO es legible desde el cliente (cualquier usuario
  // podía descargar la lista de empleados de todas las cuentas). Lo resuelve la
  // function miAdminEmpleado, que lo deduce del token del propio empleado.
  _resolveEmployeeAdmin: async function(email) {
    try {
      const local = email.split('@')[0]; // "usuario+orgSlug"
      const [usuario, slug] = local.split('+');
      if (!usuario || !slug) return { ok: false, msg: 'Email interno con formato inválido.' };
      const d = await this._callable('miAdminEmpleado');
      if (!d || !d.adminUid) return { ok: false, msg: 'Empleado no indexado.' };
      return { ok: true, adminUid: d.adminUid, profile: d.profile || null };
    } catch(err) {
      return { ok: false, msg: (err && err.message) || 'Error resolviendo admin.' };
    }
  },

  // ---------- AUTH ----------
  signIn: async function(email, password) {
    try {
      const r = await this._authFns.signInWithEmailAndPassword(this.auth, email, password);
      return { ok: true, user: r.user };
    } catch(err) { return { ok: false, code: err.code, msg: this._authMsg(err) }; }
  },
  signUp: async function(email, password) {
    try {
      const r = await this._authFns.createUserWithEmailAndPassword(this.auth, email, password);
      return { ok: true, user: r.user };
    } catch(err) { return { ok: false, code: err.code, msg: this._authMsg(err) }; }
  },
  // Registro de admin con código de licencia, en orden seguro:
  // 1) crear cuenta (así quedamos autenticados y las reglas permiten leer/escribir licenses)
  // 2) validar el código YA autenticado
  // 3) consumirlo. Si el código no es válido, se borra la cuenta recién creada (rollback).
  signUpWithLicense: async function(email, password, code) {
    const c = this._normCode(code);
    if (!c) return { ok: false, msg: 'Falta el código de licencia.' };
    // Activamos la bandera ANTES de crear la cuenta para que _onSignedIn no
    // arranque la app mientras validamos el código.
    this._signupInProgress = true;
    // 1) crear cuenta
    let user;
    try {
      const r = await this._authFns.createUserWithEmailAndPassword(this.auth, email, password);
      user = r.user;
    } catch(err) {
      this._signupInProgress = false;
      return { ok: false, code: err.code, msg: this._authMsg(err) };
    }
    // 2) validar + 3) consumir (ya autenticados)
    try {
      await this._ensureDb();
      const lic = await this.checkLicense(c);
      if (!lic.ok) {
        await this._rollbackSignup(user);
        return { ok: false, msg: lic.msg || 'Código de licencia no válido.' };
      }
      const cons = await this.consumeLicense(c, user.uid);
      if (!cons.ok) {
        await this._rollbackSignup(user);
        return { ok: false, msg: cons.msg || 'No se pudo registrar el código.' };
      }
      // Éxito: liberamos la bandera. Antes de arrancar, enviamos el email de
      // verificación (cuenta de admin con email real). _onSignedIn detectará que
      // aún no está verificado y mostrará la pantalla de verificación.
      try {
        await this._sendVerification(user);
      } catch (e) { console.warn('[Auth] No se pudo enviar verificación:', e); }
      this._signupInProgress = false;
      this._onSignedIn();
      return { ok: true, user };
    } catch(err) {
      await this._rollbackSignup(user);
      return { ok: false, msg: err.message || 'Error al validar el código.' };
    }
  },
  // Deshace un registro fallido: borra la cuenta recién creada (o cierra sesión)
  // y libera la bandera de registro.
  _rollbackSignup: async function(user) {
    try { await this._authFns.deleteUser(user); }
    catch(e) { try { await this._authFns.signOut(this.auth); } catch(e2) {} }
    this._signupInProgress = false;
  },
  // Normaliza un código de licencia igual que al crearlo: mayúsculas y solo A-Z 0-9 -
  _normCode: function(code) {
    return String(code || '').toUpperCase().trim().replace(/[^A-Z0-9-]/g, '');
  },
  signOutUser: async function() {
    // 🔴 Antes de cerrar sesión hay que dejar el dispositivo limpio. Es lo
    // normal en esta app: la tablet o el móvil de la cuadrilla los usan varias
    // personas. Sin esto quedaban dos regalos para el siguiente que entrara:
    //  - el token de notificaciones seguía apuntando a la cuenta anterior, y le
    //    llegaban en la pantalla de bloqueo los recordatorios del jefe;
    //  - en localStorage quedaba el estado entero (facturas, NIF, IBAN,
    //    clientes, fichajes), legible desde la consola sin ninguna sesión.
    const uid = this._uid;
    // 1) Token de notificaciones: quitarlo de la nube y del dispositivo.
    try {
      if (uid && this.set && this._dbRef && this.db) {
        await this.set(this._dbRef(this.db, `users/${uid}/fcm_token`), null);
      }
    } catch (e) { console.warn('[Auth] limpiar fcm_token:', e && e.message); }
    try {
      if (this.messaging) {
        const { deleteToken } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');
        await deleteToken(this.messaging);
      }
    } catch (e) { /* si no se puede borrar, el nodo ya está limpio */ }
    // 2) Caché local del inquilino.
    try { this.limpiarCacheLocal(); } catch (e) {}
    try { await this._authFns.signOut(this.auth); return { ok: true }; }
    catch(err) { return { ok: false, msg: err.message }; }
  },
  // Borra del navegador todo lo que sea de la cuenta. Se llama al cerrar sesión.
  limpiarCacheLocal: function() {
    try {
      Object.keys(localStorage)
        .filter(k => /^nv_(state|fact|fcm_token|plantas|backup|fotos_migrated|compras)/.test(k))
        .forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
    } catch (e) { console.warn('[Auth] limpiar caché local:', e && e.message); }
  },
  // Envía el email de verificación. Intenta con URL de retorno a la app; si el
  // dominio no estuviera autorizado (auth/unauthorized-continue-uri u otro fallo
  // de la URL), reintenta SIN actionCodeSettings para que el correo salga igual.
  _sendVerification: async function(user) {
    try {
      await this._authFns.sendEmailVerification(user, { url: 'https://app.appnaturaviva.com' });
    } catch (e) {
      console.warn('[Auth] Verificación con URL falló, reintento sin URL:', e && e.code);
      await this._authFns.sendEmailVerification(user);
    }
  },
  resetPassword: async function(email) {
    try { await this._authFns.sendPasswordResetEmail(this.auth, email); return { ok: true }; }
    catch(err) { return { ok: false, msg: this._authMsg(err) }; }
  },
  // Cambia la contraseña del admin logueado directamente (sin salir).
  // Si Firebase pide login reciente, reautentica con la contraseña actual.
  changePassword: async function(newPass, currentPass) {
    try {
      const u = this.auth && this.auth.currentUser;
      if (!u) return { ok: false, msg: 'No hay sesión activa.' };
      // Validar SIEMPRE la contraseña actual reautenticando antes de cambiar
      if (currentPass && u.email && this._authFns.EmailAuthProvider) {
        const cred = this._authFns.EmailAuthProvider.credential(u.email, currentPass);
        await this._authFns.reauthenticateWithCredential(u, cred);
      }
      await this._authFns.updatePassword(u, newPass);
      return { ok: true };
    } catch (err) {
      const c = err && err.code;
      if (c === 'auth/weak-password') return { ok: false, msg: 'Contraseña demasiado débil (mín. 6).' };
      if (c === 'auth/wrong-password' || c === 'auth/invalid-credential' || c === 'auth/invalid-login-credentials') return { ok: false, msg: 'La contraseña actual no es correcta.' };
      if (c === 'auth/too-many-requests') return { ok: false, msg: 'Demasiados intentos. Espera un poco e inténtalo de nuevo.' };
      if (c === 'auth/requires-recent-login') return { ok: false, msg: 'Vuelve a iniciar sesión e inténtalo de nuevo.' };
      return { ok: false, msg: this._authMsg ? this._authMsg(err) : ('Error: ' + (c || err.message || '')) };
    }
  },
  // Reenvía el email de verificación al usuario autenticado actual.
  resendVerification: async function() {
    try {
      const u = this.auth && this.auth.currentUser;
      if (!u) return { ok: false, msg: 'No hay sesión activa.' };
      await this._sendVerification(u);
      return { ok: true };
    } catch(err) { return { ok: false, msg: this._authMsg(err) }; }
  },
  // Recarga el usuario y comprueba si ya verificó el email.
  checkVerified: async function() {
    try {
      const u = this.auth && this.auth.currentUser;
      if (!u) return { ok: false, verified: false, msg: 'No hay sesión activa.' };
      await u.reload();
      return { ok: true, verified: !!this.auth.currentUser.emailVerified };
    } catch(err) { return { ok: false, verified: false, msg: this._authMsg(err) }; }
  },

  // Login de empleado: traduce "usuario" + contraseña → email interno
  // No conocemos el orgSlug en este punto, así que probamos con un índice
  // global de usuarios que mantiene "usuario_global_index/<usuario>" = orgSlug.
  signInEmployee: async function(username, password) {
    try {
      const u = String(username || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      if (!u) return { ok: false, msg: 'Usuario vacío.' };
      // BUGFIX: en una instalación fresca cuyo PRIMER login es de empleado,
      // _dbGet/_dbRef aún no se han cargado (solo se cargan dentro de
      // _onSignedIn). Sin esto, this._dbGet es null → TypeError → catch
      // devolvía el mensaje engañoso "Usuario o contraseña incorrectos".
      if (!await this._ensureDb()) return { ok: false, msg: 'No se pudo conectar para verificar el usuario. Comprueba tu internet e inténtalo de nuevo.' };
      // Buscar el orgSlug del usuario. SEGURIDAD: username_index ya no se puede
      // leer desde el cliente (se podía sacar la lista de usuarios de todas las
      // cuentas); lo resuelve la function resolverUsuarioEmpleado, limitada por IP.
      let slug = null;
      try {
        const d = await this._callable('resolverUsuarioEmpleado', { usuario: u });
        slug = (d && d.slug) || null;
      } catch(e) {
        // Diferenciar "no existe" (mensaje normal de login) de un fallo de red,
        // para no decirle "contraseña incorrecta" a quien se ha quedado sin cobertura.
        const code = (e && e.code) || '';
        if (code.indexOf('resource-exhausted') >= 0) return { ok: false, msg: 'Demasiados intentos. Prueba en unos minutos.' };
        if (code.indexOf('internal') >= 0 || code.indexOf('unavailable') >= 0 || code.indexOf('deadline') >= 0) {
          return { ok: false, msg: 'No se pudo conectar para verificar el usuario. Comprueba tu internet e inténtalo de nuevo.' };
        }
      }
      if (!slug) return { ok: false, msg: 'Usuario o contraseña incorrectos.' };
      const internalEmail = `${u}+${slug}@nv.local`;
      const r = await this._authFns.signInWithEmailAndPassword(this.auth, internalEmail, password);
      return { ok: true, user: r.user };
    } catch(err) {
      return { ok: false, msg: 'Usuario o contraseña incorrectos.' };
    }
  },

  _authMsg: function(err) {
    const c = err && err.code || '';
    if (c === 'auth/invalid-email')      return 'El email no es válido.';
    if (c === 'auth/missing-password')   return 'Falta la contraseña.';
    if (c === 'auth/weak-password')      return 'La contraseña debe tener al menos 6 caracteres.';
    if (c === 'auth/email-already-in-use') return 'Ese email ya tiene cuenta — usa "Entrar" en su lugar.';
    if (c === 'auth/invalid-credential' || c === 'auth/wrong-password' || c === 'auth/user-not-found')
      return 'Email o contraseña incorrectos.';
    if (c === 'auth/too-many-requests') return 'Demasiados intentos. Espera unos minutos.';
    if (c === 'auth/network-request-failed') return 'Sin conexión a internet.';
    if (c === 'auth/operation-not-allowed' || c === 'auth/admin-restricted-operation')
      return 'El registro de cuentas no está habilitado. Contacta con el administrador.';
    if (c === 'auth/missing-email')      return 'Falta el email.';
    if (c === 'auth/invalid-login-credentials') return 'Email o contraseña incorrectos.';
    if (c === 'auth/user-disabled')      return 'Esta cuenta está desactivada.';
    if (c === 'auth/quota-exceeded')     return 'Se ha superado el límite de solicitudes. Inténtalo más tarde.';
    // Error genérico de reCAPTCHA / protección de enumeración (ej. email ya en uso con protección activa)
    const msg = err && err.message || '';
    if (msg.includes('RECAPTCHA') || msg.includes('recaptcha'))
      return 'Error de verificación. Recarga la página e inténtalo de nuevo.';
    if (msg.includes('400'))
      return 'No se pudo completar la operación. Si el email ya tiene cuenta, usa "Entrar".';
    return msg || 'Error de autenticación.';
  },

  // ---------- LICENCIAS ----------
  // Garantiza que tenemos db + helpers cargados aunque NO haya sesión todavía
  // (necesario para verificar/consumir el código DURANTE el registro de un admin).
  _ensureDb: async function() {
    if (this.db && this._dbRef && this._dbGet && this._dbUpdate && this._dbRemove) return true;
    try {
      const { getDatabase, ref, onValue, set, get, update, remove } =
        await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
      const app = this._firebaseApp;
      if (!app) return false;
      if (!this.db) this.db = getDatabase(app);
      this.set = this.set || set;
      this._dbRef = this._dbRef || ref;
      this._dbGet = this._dbGet || get;
      this._dbOnValue = this._dbOnValue || onValue;
      this._dbUpdate = this._dbUpdate || update;
      this._dbRemove = this._dbRemove || remove;
      return true;
    } catch(err) { console.error('[Sync] _ensureDb error:', err); return false; }
  },

  // Helpers genéricos de lectura/escritura puntual (usados por plan.js).
  dbReadOnce: async function(path) {
    try {
      if (!await this._ensureDb()) return null;
      const snap = await this._dbGet(this._dbRef(this.db, path));
      return snap.exists() ? snap.val() : null;
    } catch(e) { return null; }
  },
  dbWrite: async function(path, val) {
    try {
      if (!await this._ensureDb()) return false;
      await this.set(this._dbRef(this.db, path), val);
      return true;
    } catch(e) { return false; }
  },
  // Confirma el número de una factura que se está GUARDANDO. Una transacción
  // de RTDB decide: si ese número aún está libre, se queda; si otro dispositivo
  // ya lo usó, devuelve el siguiente libre. Así dos personas facturando a la
  // vez nunca repiten número, y las vistas previas que no se llegan a guardar
  // no queman números (la serie no tiene huecos).
  // Devuelve el número definitivo, o el propuesto si no hay conexión.
  confirmarNumFactura: async function(num) {
    const propuesto = parseInt(num, 10) || 0;
    try {
      if (!propuesto) return propuesto;
      if (!await this._ensureDb()) return propuesto;
      if (!this._adminUid) return propuesto;
      const { runTransaction } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
      const r = this._dbRef(this.db, `users/${this._adminUid}/nv_facturaSeq`);
      const res = await runTransaction(r, (cur) => {
        const c = parseInt(cur, 10) || 0;
        return (c < propuesto) ? propuesto : c + 1;   // libre → el propuesto; ocupado → el siguiente
      });
      if (res && res.committed && res.snapshot) {
        const n = parseInt(res.snapshot.val(), 10);
        if (!isNaN(n)) return n;
      }
      return propuesto;
    } catch (e) { console.warn('[Sync] confirmarNumFactura:', e && e.message); return propuesto; }
  },

  // Helper para llamar a una Cloud Function callable (httpsCallable).
  _callable: async function(nombre, datos, timeout) {
    const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
    const functions = getFunctions(this._firebaseApp, 'europe-west1');
    const fn = httpsCallable(functions, nombre, timeout ? { timeout: timeout } : undefined);
    const res = await fn(datos || {});
    return res.data || null;
  },

  // Llama a la Cloud Function setPlan (solo super-admin). Cambia el plan + validez.
  setPlanRemoto: async function(email, plan, meses) {
    try {
      const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
      const functions = getFunctions(this._firebaseApp, 'europe-west1');
      const fn = httpsCallable(functions, 'setPlan');
      const res = await fn({ email: email, plan: plan, meses: meses });
      return res.data || { ok: false, msg: 'Sin respuesta' };
    } catch(e) {
      return { ok: false, msg: (e && e.message) || 'Error' };
    }
  },

  // Envía la factura/resumen por email (Resend) con el PDF adjunto.
  enviarFacturaEmailRemoto: async function(payload) {
    try {
      if (!this._adminUid) return { ok: false, error: 'Sin cuenta activa' };
      const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
      const functions = getFunctions(this._firebaseApp, 'europe-west1');
      const fn = httpsCallable(functions, 'enviarFacturaEmail', { timeout: 120000 });
      const res = await fn(Object.assign({ adminUid: this._adminUid }, payload));
      return res.data || { ok: false, error: 'Sin respuesta' };
    } catch(e) {
      console.error('enviarFacturaEmailRemoto', e);
      return { ok: false, error: (e && e.message) || 'Error' };
    }
  },

  // Llama a la Cloud Function generarFacturaPDF: envía el HTML de impresión,
  // devuelve { ok, url, path, filename } con el PDF ya guardado en Storage.
  generarFacturaPDFRemoto: async function(html, filename, docId, tipo) {
    try {
      if (!this._adminUid) return { ok: false, error: 'Sin cuenta activa' };
      const { getFunctions, httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js');
      const functions = getFunctions(this._firebaseApp, 'europe-west1');
      const fn = httpsCallable(functions, 'generarFacturaPDF', { timeout: 120000 });
      const res = await fn({ html: html, filename: filename, docId: docId, tipo: tipo, adminUid: this._adminUid });
      return res.data || { ok: false, error: 'Sin respuesta' };
    } catch(e) {
      console.error('generarFacturaPDFRemoto', e);
      return { ok: false, error: (e && e.message) || 'Error' };
    }
  },

  // checkLicense: el código existe y no está usado. Lectura pública controlada por reglas.
  checkLicense: async function(code) {
    try {
      if (!await this._ensureDb()) return { ok: false, msg: 'No se pudo conectar para verificar el código.' };
      const c = this._normCode(code);
      if (!c) return { ok: false, msg: 'Código vacío.' };
      const snap = await this._dbGet(this._dbRef(this.db, `licenses/${c}`));
      const data = snap.val();
      if (!data)        return { ok: false, msg: 'Código no válido.' };
      if (data.usedBy)  return { ok: false, msg: 'Ese código ya fue usado.' };
      if (data.revoked) return { ok: false, msg: 'Código revocado.' };
      return { ok: true, code: c };
    } catch(err) { return { ok: false, msg: 'No se pudo verificar el código.' }; }
  },
  // consumeLicense: marcar la licencia con el uid que la usó (escritura ÚNICA atómica)
  consumeLicense: async function(code, uid) {
    try {
      if (!await this._ensureDb()) return { ok: false, msg: 'No se pudo conectar.' };
      const c = this._normCode(code);
      // Un solo update multi-campo: la regla valida que usedBy pase de null a auth.uid.
      await this._dbUpdate(this._dbRef(this.db, `licenses/${c}`), {
        usedBy: uid,
        usedAt: Date.now()
      });
      // Guardar el código en el perfil del admin para resolver su plan al entrar.
      try { await this.set(this._dbRef(this.db, `users/${uid}/_licenseCode`), c); } catch(e) {}
      return { ok: true };
    } catch(err) { return { ok: false, msg: err.message }; }
  },
  // listLicenses: solo super-admin
  listLicenses: async function() {
    try {
      if (!await this._ensureDb()) return null;
      const snap = await this._dbGet(this._dbRef(this.db, 'licenses'));
      return snap.val() || {};
    } catch(err) { return null; }
  },
  // createLicense: solo super-admin
  createLicense: async function(code, notas, plan) {
    try {
      if (!await this._ensureDb()) return { ok: false, msg: 'No se pudo conectar.' };
      const c = this._normCode(code);
      if (!c) return { ok: false, msg: 'Código vacío.' };
      const snap = await this._dbGet(this._dbRef(this.db, `licenses/${c}`));
      if (snap.exists()) return { ok: false, msg: 'Ese código ya existe.' };
      const planOk = ['free','autonomo','empresa','pro'].indexOf(plan) >= 0 ? plan : 'autonomo';
      await this.set(this._dbRef(this.db, `licenses/${c}`), {
        code: c, notas: notas || '', plan: planOk, createdAt: Date.now(), createdBy: this._uid, usedBy: null
      });
      return { ok: true };
    } catch(err) { return { ok: false, msg: err.message }; }
  },
  revokeLicense: async function(code) {
    try {
      if (!await this._ensureDb()) return { ok: false, msg: 'No se pudo conectar.' };
      const c = this._normCode(code);
      await this.set(this._dbRef(this.db, `licenses/${c}/revoked`), true);
      return { ok: true };
    } catch(err) { return { ok: false, msg: err.message }; }
  },
  // deleteLicense: borrar el código por completo (solo super-admin por reglas)
  deleteLicense: async function(code) {
    try {
      if (!await this._ensureDb()) return { ok: false, msg: 'No se pudo conectar.' };
      const c = this._normCode(code);
      await this._dbRemove(this._dbRef(this.db, `licenses/${c}`));
      return { ok: true };
    } catch(err) { return { ok: false, msg: err.message }; }
  },
  // Crear un empleado: nombre, usuario, contraseña, permisos.
  // Crea cuenta Firebase Auth con email interno y guarda perfil en users/<adminUid>/team/<usuario>.
  // Mantiene índices: employee_index y username_index.
  createEmployee: async function(opts) {
    try {
      if (!this._uid) return { ok: false, msg: 'Sin sesión admin.' };
      if (this._email && this._email.endsWith('@nv.local')) return { ok: false, msg: 'Los empleados no pueden crear empleados.' };
      const adminUid = this._uid;
      const adminEmail = this._email;
      const orgName = opts.orgName || (window.NV_ORG_NAME || 'Natura Viva');
      const slug = (typeof orgSlug === 'function') ? orgSlug(orgName) : orgName.toLowerCase().replace(/[^a-z0-9]/g, '');
      const usuario = String(opts.username || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
      if (!usuario) return { ok: false, msg: 'Usuario vacío.' };
      const password = String(opts.password || '');
      if (password.length < 6) return { ok: false, msg: 'La contraseña debe tener al menos 6 caracteres.' };
      // Comprobar que ese usuario no exista ya (índice global). Lo comprueba la
      // function usuarioEmpleadoLibre: el índice ya no es legible desde el cliente.
      try {
        const d = await this._callable('usuarioEmpleadoLibre', { usuario: usuario });
        if (d && d.libre === false) return { ok: false, msg: 'Ese usuario ya existe en el sistema.' };
      } catch(e) {
        return { ok: false, msg: 'No se pudo comprobar si el usuario está libre. Inténtalo de nuevo.' };
      }

      const internalEmail = `${usuario}+${slug}@nv.local`;

      // Crear cuenta Firebase Auth para el empleado.
      // Importante: createUserWithEmailAndPassword cambia la sesión al nuevo usuario.
      // Para no perder la sesión admin, usamos una segunda app Firebase.
      const { initializeApp, deleteApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
      const { getAuth, createUserWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
      const secondaryApp = initializeApp(window.FIREBASE_CONFIG, 'secondary-' + Date.now());
      const secondaryAuth = getAuth(secondaryApp);
      let createdUid = null;
      try {
        const r = await createUserWithEmailAndPassword(secondaryAuth, internalEmail, password);
        createdUid = r.user.uid;
        // Cerrar sesión en la app secundaria
        try { await secondaryAuth.signOut(); } catch(e) {}
      } catch(err) {
        try { await deleteApp(secondaryApp); } catch(e) {}
        return { ok: false, msg: this._authMsg(err) };
      }
      try { await deleteApp(secondaryApp); } catch(e) {}

      // Guardar perfil del empleado bajo el admin
      const perfil = {
        username: usuario, name: opts.name || usuario, uid: createdUid,
        permisos: opts.permisos || {}, createdAt: Date.now(), orgSlug: slug
      };
      await this.set(this._dbRef(this.db, `users/${adminUid}/team/${usuario}`), perfil);

      // 🔴 ORDEN: primero los índices globales, y SOLO si se consiguen se da el
      // acceso al cajón (team_uids). Antes era al revés y, si el índice estaba
      // pillado por otro, el alta fallaba pero el acceso quedaba concedido.
      // Las reglas exigen ahora que el perfil de team ya exista (por eso va
      // antes) y que la entrada lleve el campo 'usuario'.
      try {
        await this.set(this._dbRef(this.db, `employee_index/${slug}__${usuario}`), {
          adminUid: adminUid, uid: createdUid, usuario: usuario, createdAt: Date.now()
        });
        await this.set(this._dbRef(this.db, `username_index/${usuario}`), {
          slug: slug, adminUid: adminUid, createdAt: Date.now()
        });
      } catch (err) {
        // Deshacer el perfil para no dejar un empleado a medias.
        try { await this.set(this._dbRef(this.db, `users/${adminUid}/team/${usuario}`), null); } catch (e) {}
        return { ok: false, msg: 'Ese usuario ya está ocupado. Prueba con otro nombre.' };
      }

      // Lista de UIDs autorizados a leer/escribir el cajón del admin
      await this.set(this._dbRef(this.db, `users/${adminUid}/team_uids/${createdUid}`), true);

      return { ok: true, profile: perfil };
    } catch(err) { return { ok: false, msg: err.message || 'Error creando empleado.' }; }
  },

  // Borrar un empleado (sus índices y perfil).
  // Nota: NO podemos borrar la cuenta Firebase Auth del empleado desde el cliente.
  // Lo que sí hacemos: quitarlo de los índices, de modo que no pueda volver a entrar
  // (signInEmployee falla porque no encontrará el username en el índice).
  deleteEmployee: async function(usuario) {
    try {
      if (!this._uid) return { ok: false, msg: 'Sin sesión admin.' };
      const adminUid = this._uid;
      const snap = await this._dbGet(this._dbRef(this.db, `users/${adminUid}/team/${usuario}`));
      const prof = snap.val();
      if (!prof) return { ok: false, msg: 'Empleado no encontrado.' };
      const slug = prof.orgSlug || '';
      const empUid = prof.uid || null;
      await this.set(this._dbRef(this.db, `users/${adminUid}/team/${usuario}`), null);
      if (empUid) await this.set(this._dbRef(this.db, `users/${adminUid}/team_uids/${empUid}`), null);
      if (slug) await this.set(this._dbRef(this.db, `employee_index/${slug}__${usuario}`), null);
      await this.set(this._dbRef(this.db, `username_index/${usuario}`), null);
      return { ok: true };
    } catch(err) { return { ok: false, msg: err.message }; }
  },

  // Actualizar permisos del empleado
  updateEmployeePermisos: async function(usuario, permisos) {
    try {
      if (!this._uid) return { ok: false, msg: 'Sin sesión.' };
      await this.set(this._dbRef(this.db, `users/${this._uid}/team/${usuario}/permisos`), permisos || {});
      return { ok: true };
    } catch(err) { return { ok: false, msg: err.message }; }
  },

  // Cambiar contraseña del empleado: borramos y recreamos (única forma desde el cliente).
  // No es ideal — provoca cambio de UID. Aceptable porque ningún dato lleva el uid del empleado.
  changeEmployeePassword: async function(usuario, newPassword) {
    try {
      if (!this._uid) return { ok: false, msg: 'Sin sesión.' };
      if (newPassword.length < 6) return { ok: false, msg: 'La contraseña debe tener al menos 6 caracteres.' };
      const adminUid = this._uid;
      const snap = await this._dbGet(this._dbRef(this.db, `users/${adminUid}/team/${usuario}`));
      const prof = snap.val();
      if (!prof) return { ok: false, msg: 'Empleado no encontrado.' };
      const slug = prof.orgSlug;
      const internalEmail = `${usuario}+${slug}@nv.local`;

      // Crear cuenta nueva con misma email y nueva contraseña. Firebase no permite esto
      // directamente, así que el cambio de contraseña sin re-autenticar al empleado
      // requiere Admin SDK en servidor. Aquí ofrecemos un workaround: enviar email de
      // recuperación al email interno NO sirve (el dominio @nv.local no existe).
      // Plan B práctico: marcar el perfil con un flag para que el admin sepa que debe
      // borrarlo y recrearlo. Por ahora devolvemos un mensaje claro.
      return { ok: false, msg: 'Para cambiar la contraseña: borra el empleado y créalo otra vez con la nueva contraseña.' };
    } catch(err) { return { ok: false, msg: err.message }; }
  },

  _saveLocal: function() {
    const _slKey = (typeof stateKey === 'function' ? stateKey() : 'nv_state');
    const _slObj = {
        fuelDays:  window.fuelDays  || {},
        wkndTasks: window.wkndTasks || {},
        houseData: window.houseData || {},
        empHours:  window.empHours  || {},
        schedOver: window.schedOver || {},
        compras:   window.compras   || [],
        estancias: window.estancias || [],
        recordatorios: window.recordatorios || [],
        tratamientos: window.tratamientos || [],
        resumenesFinca: window.resumenesFinca || [],
        clientes: window.clientes || [],
        misDatos: window.misDatos || {},
        facturas: window.facturas || [],
        papelera: window.papelera || [],
        fichajes: window.fichajes || {},
        permisos:  window.permisos  || {},
        config: {
          fincas:    window.CONFIG_FINCAS    || [],
          empleados: window.CONFIG_EMPLEADOS || [],
          vehiculos: window.CONFIG_VEHICULOS || [],
          materiales: window.CONFIG_MATERIALES || [],
          manoObra: window.CONFIG_MANO_OBRA || [],
          fitosanitarios: window.CONFIG_FITOSANITARIOS || [],
          plantas: window.CONFIG_PLANTAS || []
        },
        nextId: window.nextId || 100,
        matLastMonth: window.matLastMonth || null,
        fitoLastMonth: window.fitoLastMonth || null,
        plantasLastMonth: window.plantasLastMonth || null
      };
    try {
      localStorage.setItem(_slKey, JSON.stringify(_slObj));
    } catch(e) {
      // Cuota llena: guardar al menos la copia SIN imágenes base64 (mismo
      // criterio que saveState). Congelar la caché era peor: el siguiente
      // arranque aplicaba un estado viejo y agrandaba las ventanas de pérdida.
      try {
        if (typeof stripImagesForLocal === 'function') localStorage.setItem(_slKey, JSON.stringify(stripImagesForLocal(_slObj)));
      } catch(e2) {}
    }
  },

  // Valores locales de cada clave de nv_state (misma forma que llega del
  // servidor). Se usa tanto para subir solo lo cambiado como para saber, al
  // recibir un snapshot, qué claves tienen cambios locales sin subir.
  _stateValues: function() {
    return {
      fuelDays:  window.fuelDays  || {},
      wkndTasks: window.wkndTasks || {},
      houseData: window.houseData || {},
      empHours:  window.empHours  || {},
      schedOver: window.schedOver || {},
      estancias: window.estancias || [],
      recordatorios: window.recordatorios || [],
      tratamientos: window.tratamientos || [],
      // PRIV-SPLIT: clientes y resumenesFinca ya NO van en nv_state (viven en
      // nv_priv, solo-admin); su retirada legacy se maneja aparte en _doPush.
      permisos:  window.permisos  || {},
      config: {
        fincas:    window.CONFIG_FINCAS    || [],
        // Con nv_priv confirmado, a nv_state van solo los campos públicos de
        // cada empleado; hasta entonces, la lista completa (transición segura).
        empleados: this._privNodeReady ? this._empPublicos() : (window.CONFIG_EMPLEADOS || []),
        vehiculos: window.CONFIG_VEHICULOS || [],
        materiales: window.CONFIG_MATERIALES || [],
        manoObra: window.CONFIG_MANO_OBRA || [],
        fitosanitarios: window.CONFIG_FITOSANITARIOS || [],
        plantas: window.CONFIG_PLANTAS || []
      },
      nextId:     window.nextId    || 100,
      matLastMonth: window.matLastMonth || null,
      fitoLastMonth: window.fitoLastMonth || null,
      plantasLastMonth: window.plantasLastMonth || null
    };
  },
  // Registro de lo último que sabemos del servidor, por clave (y por finca en
  // houseData). Diferencia "esto lo he cambiado yo y aún no ha subido" de
  // "esto no lo he tocado" al decidir qué aplicar de un snapshot.
  _lastKeyJson: {},
  _lastHdJson: {},
  // Lo último que se sabe del servidor de cada turno de schedOver (clave
  // "YYYY-MM-DD_h"). Mismo papel que _lastHdJson pero para el calendario.
  _lastSoJson: {},

  pushToCloud: function() {
    if (!this.enabled || !this.db) return;
    // Durante un apply remoto no se puede subir, pero el push NO se pierde:
    // se marca y el propio apply lo dispara al terminar (antes, los guardados
    // hechos desde un listener — p. ej. el rollover mensual — se esfumaban).
    if (this.applyingRemote) { this._pushTrasApply = true; return; }
    if (this._pushTimer) clearTimeout(this._pushTimer);
    this._pushTimer = setTimeout(() => { this._pushTimer = null; this._doPush(); }, 500);
  },

  // Sube YA, sin esperar el debounce de 500 ms. Para acciones donde el usuario
  // espera ver el cambio al instante (marcar una factura como enviada).
  flushPush: function() {
    if (this._pushTimer) { clearTimeout(this._pushTimer); this._pushTimer = null; }
    this._doPush();
  },

  _doPush: function() {
    if (!this.enabled || this.applyingRemote || !this.db || !this.dataRef) return;
    try {
      // FACT-SPLIT: nv_state ya NO lleva facturas/papelera/misDatos (van en
      // nv_fact) ni fichajes (nodo protegido es la fuente). Se escribe con
      // update() y no con set() para NO borrar las copias legacy que siguen
      // en nv_state como respaldo hasta confirmar la migración (fase B2).
      //
      // 🔴 Se suben SOLO las claves que han cambiado de verdad en este
      // dispositivo (y dentro de houseData, solo las fincas que cambiaron).
      // Antes se subía el estado ENTERO en cada push: si otra persona tocaba
      // algo a la vez, su cambio se machacaba aunque fuera de otra finca.
      // Hasta que no se haya aplicado un snapshot de nv_state (o se sepa que la
      // nube está vacía) NO se sube nada: arrancar sin conexión y subir después
      // la caché local vieja pisaba en la nube el trabajo de días.
      if (!this._stateLoaded) this._pushTrasCarga = true;
      const vals = this._stateValues();
      const _stPayload = {};
      let _hayCambio = false;
      const _pushedKeys = [];
      if (this._stateLoaded) Object.keys(vals).forEach(k => {
        if (k === 'houseData' || k === 'schedOver') return;   // aparte, clave a clave
        const j = JSON.stringify(vals[k] === undefined ? null : vals[k]);
        if (j !== this._lastKeyJson[k]) { _stPayload[k] = vals[k]; this._lastKeyJson[k] = j; _pushedKeys.push(k); _hayCambio = true; }
      });
      // houseData: por finca, para que dos personas en fincas distintas no se pisen
      const hd = this._stateLoaded ? (vals.houseData || {}) : {};
      const _hdSafe = Object.keys(hd).every(k => !/[.#$\[\]\/]/.test(k));
      if (!this._stateLoaded) { /* aún sin primera carga: no se toca nv_state */ }
      else if (_hdSafe) {
        Object.keys(hd).forEach(f => {
          const j = JSON.stringify(hd[f] === undefined ? null : hd[f]);
          if (j !== this._lastHdJson[f]) { _stPayload['houseData/' + f] = hd[f]; this._lastHdJson[f] = j; _pushedKeys.push('houseData/' + f); _hayCambio = true; }
        });
        // Fincas borradas en este dispositivo: mandar null explícito
        Object.keys(this._lastHdJson).forEach(f => {
          if (hd[f] === undefined && this._lastHdJson[f] !== 'null') {
            _stPayload['houseData/' + f] = null; this._lastHdJson[f] = 'null'; _pushedKeys.push('houseData/' + f); _hayCambio = true;
          }
        });
      }
      // schedOver: TURNO A TURNO. Es lo que más se toca de toda la app (el
      // calendario) y como bloque entero mandaba los ~114 KB del nodo a cada
      // dispositivo conectado por cada turno movido. Además, dos personas
      // editando días distintos se pisaban, igual que pasaba con las fincas.
      const so = this._stateLoaded ? (vals.schedOver || {}) : {};
      const _soSafe = Object.keys(so).every(k => !/[.#$\[\]\/]/.test(k));
      if (!this._stateLoaded) { /* aún sin primera carga: no se toca nv_state */ }
      else if (_soSafe) {
        Object.keys(so).forEach(k => {
          const j = JSON.stringify(so[k] === undefined ? null : so[k]);
          if (j !== this._lastSoJson[k]) { _stPayload['schedOver/' + k] = so[k]; this._lastSoJson[k] = j; _pushedKeys.push('schedOver/' + k); _hayCambio = true; }
        });
        // Turnos borrados en este dispositivo: mandar null explícito o el
        // servidor los seguiría teniendo y volverían en el siguiente snapshot.
        Object.keys(this._lastSoJson).forEach(k => {
          if (so[k] === undefined && this._lastSoJson[k] !== 'null') {
            _stPayload['schedOver/' + k] = null; this._lastSoJson[k] = 'null'; _pushedKeys.push('schedOver/' + k); _hayCambio = true;
          }
        });
      } else {
        // Clave con caracteres no válidos para una ruta: subir el bloque entero
        const j = JSON.stringify(so);
        if (j !== this._lastKeyJson.schedOver) { _stPayload.schedOver = so; this._lastKeyJson.schedOver = j; _pushedKeys.push('schedOver'); _hayCambio = true; }
      }
      if (!_hdSafe && this._stateLoaded) {
        // Nombre de finca con caracteres no válidos para una ruta: subir entero
        const j = JSON.stringify(hd);
        if (j !== this._lastKeyJson.houseData) { _stPayload.houseData = hd; this._lastKeyJson.houseData = j; _pushedKeys.push('houseData'); _hayCambio = true; }
      }
      // COMPRAS-SPLIT: mientras el nodo nuevo no esté confirmado, compras sigue
      // viajando en nv_state (transición segura, nada se pierde). Cuando
      // nv_compras existe, aquí se manda null a propósito: si un dispositivo
      // con la app vieja re-sube la copia legacy (11 MB), el siguiente push
      // de cualquier app nueva la vuelve a borrar.
      if (this._stateLoaded) {
        const _comprasLegacy = this._comprasNodeReady ? null : (window.compras || []);
        const _jComp = JSON.stringify(_comprasLegacy);
        if (_jComp !== this._lastKeyJson.compras) { _stPayload.compras = _comprasLegacy; this._lastKeyJson.compras = _jComp; _pushedKeys.push('compras'); _hayCambio = true; }
      }
      // PRIV-SPLIT: mientras nv_priv no esté confirmado, clientes y
      // resumenesFinca siguen viajando en nv_state (transición segura). Con el
      // nodo listo se manda null a propósito: si un dispositivo con la app
      // vieja re-sube la copia legacy, el siguiente push la vuelve a borrar.
      // 🔴 SOLO el admin: esas claves son de escritura solo-admin en las
      // reglas, y un update() de empleado que las incluyera fallaría ENTERO.
      if (this._stateLoaded && !(this._email && this._email.endsWith('@nv.local'))) {
        const _cliLegacy = this._privNodeReady ? null : (window.clientes || []);
        const _jCli = JSON.stringify(_cliLegacy);
        if (_jCli !== this._lastKeyJson.clientes) { _stPayload.clientes = _cliLegacy; this._lastKeyJson.clientes = _jCli; _pushedKeys.push('clientes'); _hayCambio = true; }
        const _resLegacy = this._privNodeReady ? null : (window.resumenesFinca || []);
        const _jRes = JSON.stringify(_resLegacy);
        if (_jRes !== this._lastKeyJson.resumenesFinca) { _stPayload.resumenesFinca = _resLegacy; this._lastKeyJson.resumenesFinca = _jRes; _pushedKeys.push('resumenesFinca'); _hayCambio = true; }
      }

      if (_hayCambio) {
        _stPayload.lastUpdate = Date.now();
        _stPayload.lastEmail = this._email || null;
        this._dbUpdate(this.dataRef, _stPayload).catch(err => {
          // Si falla, olvidar lo "ya subido" para reintentarlo en el próximo push
          _pushedKeys.forEach(k => {
            if (k.indexOf('houseData/') === 0) delete this._lastHdJson[k.slice(10)];
            else if (k.indexOf('schedOver/') === 0) delete this._lastSoJson[k.slice(10)];
            else delete this._lastKeyJson[k];
          });
          console.warn('[Sync] Error al subir:', err);
        });
      }

      // Subir nv_compras SOLO si cambió (y solo cuando el nodo ya existe)
      if (this.comprasRef && this._comprasNodeReady) {
        const plc = this._comprasPayload();
        const jc = JSON.stringify(plc);
        if (jc !== this._lastComprasJson) {
          this._lastComprasJson = jc;
          this._comprasPushing = jc;
          this.set(this.comprasRef, Object.assign({ lastUpdate: Date.now() }, plc))
            .then(() => { if (this._comprasPushing === jc) this._comprasPushing = null; })
            .catch(err => { if (this._comprasPushing === jc) this._comprasPushing = null; this._lastComprasJson = null; console.warn('[Sync] Error al subir nv_compras:', err); });
        }
      }

      // Subir nv_priv SOLO si cambió (solo el admin tiene privRef)
      if (this.privRef && this._privNodeReady) {
        const plp = this._privPayload();
        const jp = JSON.stringify(plp);
        if (jp !== this._lastPrivJson) {
          this._lastPrivJson = jp;
          this._privPushing = jp;
          this.set(this.privRef, Object.assign({ lastUpdate: Date.now() }, plp))
            .then(() => { if (this._privPushing === jp) this._privPushing = null; })
            .catch(err => { if (this._privPushing === jp) this._privPushing = null; this._lastPrivJson = null; console.warn('[Sync] Error al subir nv_priv:', err); });
        }
      }

      // Subir nv_fact SOLO si cambió de verdad (evita re-subir el logo y todas
      // las facturas cada vez que se toca una tarea del calendario).
      if (this.factRef) {
        const pl = this._factPayload();
        const j = JSON.stringify(pl);
        if (j !== this._lastFactJson) {
          if (this._factLoaded) {
            this._lastFactJson = j;
            // _factPushing = escritura en vuelo. Mientras dure, el listener ignora
            // los snapshots entrantes para no revertir lo que acabamos de marcar.
            this._factPushing = j;
            this.set(this.factRef, Object.assign({ lastUpdate: Date.now() }, pl))
              .then(() => { if (this._factPushing === j) this._factPushing = null; })
              .catch(err => { if (this._factPushing === j) this._factPushing = null; this._lastFactJson = null; console.warn('[Sync] Error al subir nv_fact:', err); });
          } else {
            // Aún no se ha aplicado ningún snapshot del nodo (red lenta): NO se
            // puede escribir el nodo entero con la copia local (borraría de la
            // nube las facturas de otros dispositivos). Se lee primero, se
            // fusiona y entonces se escribe.
            this._pushFactFusionado();
          }
        }
      }
      // Si durante la ventana de este push se descartó algún snapshot de
      // nv_fact/nv_compras, releer la nube cuando asiente la escritura.
      this._programarRelectura();
    } catch(err) { console.error('[Sync] Error al subir:', err); }
  },

  // Lee nv_fact de la nube, lo fusiona con lo local (conservando lo creado en
  // esta sesión) y lo escribe. Se usa cuando hay que guardar una factura pero
  // el nodo aún no ha cargado (red lenta): así nunca se machaca la nube.
  _pushFactFusionado: async function() {
    if (this._factFusionandoPush) return;
    this._factFusionandoPush = true;
    try {
      if (!this._dbGet || !this.factRef) return;
      const snap = await this._dbGet(this.factRef);
      const v = snap && snap.val();
      if (v) {
        const isEmployee = !!(this._email && this._email.endsWith('@nv.local'));
        this._aplicarFactRemoto(v, isEmployee, Array.isArray(window.facturas) ? window.facturas.length : 0);
      } else {
        this._factLoaded = true;   // nodo vacío: nuestra copia es la buena
      }
      const pl = this._factPayload();
      const j = JSON.stringify(pl);
      if (j !== this._lastFactJson) {
        this._lastFactJson = j;
        this._factPushing = j;
        await this.set(this.factRef, Object.assign({ lastUpdate: Date.now() }, pl))
          .then(() => { if (this._factPushing === j) this._factPushing = null; })
          .catch(err => { if (this._factPushing === j) this._factPushing = null; this._lastFactJson = null; console.warn('[Sync] Error al subir nv_fact (fusión):', err); });
      }
    } catch (e) {
      console.warn('[Sync] _pushFactFusionado:', e && e.message);
    } finally { this._factFusionandoPush = false; }
  },

  // Relee nv_fact/nv_compras tras un push si su listener descartó un snapshot
  // durante la ventana de escritura. get() devuelve el estado del servidor YA
  // con nuestro push aplicado, así que aplicarlo nunca revierte nada y recupera
  // lo que hubiera subido otro dispositivo (antes, esos snapshots se perdían
  // para siempre y el siguiente set() borraba sus datos de la nube).
  _programarRelectura: function() {
    if (!this._factRelee && !this._comprasRelee && !this._privRelee) return;
    if (this._releyendo) return;
    this._releyendo = true;
    setTimeout(async () => {
      this._releyendo = false;
      if (this._pushTimer) return; // hay otro push en cola: se releerá tras él
      // Si la escritura sigue en vuelo, reintentar más tarde (antes la
      // relectura pendiente podía quedarse sin hacer hasta el siguiente push).
      if (this._factPushing || this._comprasPushing || this._privPushing) { this._programarRelectura(); return; }
      try {
        if (this._factRelee && this.factRef && this._dbGet && !this._factPushing) {
          this._factRelee = false;
          const s = await this._dbGet(this.factRef);
          const v = s && s.val();
          if (v && !this._pushTimer && !this._factPushing) {
            const isEmployee = !!(this._email && this._email.endsWith('@nv.local'));
            this._aplicarFactRemoto(v, isEmployee, Array.isArray(window.facturas) ? window.facturas.length : 0);
          }
        }
        if (this._comprasRelee && this.comprasRef && this._dbGet && !this._comprasPushing) {
          this._comprasRelee = false;
          const s2 = await this._dbGet(this.comprasRef);
          const v2 = s2 && s2.val();
          if (v2 && !this._pushTimer && !this._comprasPushing) this._aplicarComprasRemoto(v2);
        }
        if (this._privRelee && this.privRef && this._dbGet && !this._privPushing) {
          this._privRelee = false;
          const s3 = await this._dbGet(this.privRef);
          const v3 = s3 && s3.val();
          if (v3 && !this._pushTimer && !this._privPushing) this._aplicarPrivRemoto(v3);
        }
      } catch (e) { /* no crítico: la próxima escritura remota re-dispara onValue */ }
    }, 1500);
  },

  initMessaging: async function(app) {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    try {
      const { getMessaging, onMessage } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');
      this.messaging = getMessaging(app);
      onMessage(this.messaging, (payload) => {
        const { title, body } = payload.notification || {};
        if (title && Notification.permission === 'granted') {
          navigator.serviceWorker.ready.then(sw => sw.showNotification(title, { body, icon: './icons/icon-192.png' })).catch(() => {});
        }
      });
      if (Notification.permission === 'granted') await this.registerFCMToken();
      window.NV_FCM_READY = true;
    } catch(err) { console.warn('[FCM]', err.message); }
  },

  registerFCMToken: async function() {
    if (!this.messaging || !window.NV_VAPID_KEY || !this._uid) return;
    try {
      const { getToken } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js');
      // Registrar EXPLÍCITAMENTE el service worker de FCM (su propio archivo)
      // y usar ESE registro para getToken. Es lo que permite recibir push
      // con la app en segundo plano o cerrada.
      let fcmSW;
      try {
        fcmSW = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/firebase-cloud-messaging-push-scope' });
        await navigator.serviceWorker.ready;
      } catch(regErr) {
        console.warn('[FCM] No se pudo registrar SW propio, usando el general:', regErr.message);
        fcmSW = await navigator.serviceWorker.ready;
      }
      const token = await getToken(this.messaging, { vapidKey: window.NV_VAPID_KEY, serviceWorkerRegistration: fcmSW });
      if (token) {
        await this.set(this._dbRef(this.db, `users/${this._uid}/fcm_token`), { token, updated: Date.now() });
        localStorage.setItem('nv_fcm_token', token);
        console.log('[FCM] Token registrado correctamente');
      } else {
        console.warn('[FCM] getToken devolvió vacío');
      }
    } catch(err) { console.warn('[FCM] Token error:', err.message); }
  },

  requestPermission: async function() {
    if (!('Notification' in window)) return false;
    const ok = await Notification.requestPermission() === 'granted';
    if (ok) await this.registerFCMToken();
    return ok;
  },

  scheduleReminder: async function(reminder) {
    if (!this.enabled || !this._adminUid) return;
    try {
      // Los avisos cuelgan SIEMPRE del nodo del admin, pero el token FCM de
      // cada usuario cuelga de su propio uid. Guardamos aqui el uid de quien
      // crea el aviso para que la Cloud Function envie el push a SU movil y no
      // al del admin (antes un empleado programaba un aviso y le sonaba al
      // admin, o no le llegaba a nadie).
      const payload = Object.assign({}, reminder, { uid: this._uid || null });
      await this.set(this._dbRef(this.db, `users/${this._adminUid}/reminders/${reminder.id}`), payload);
    } catch(err) { console.warn('[FCM] Reminder error:', err); }
  },

  // Los avisos de tareas y estancias NO se guardan con la clave `reminderId`:
  // se guardan con sufijo (`${reminderId}_0` para la hora del evento,
  // `${reminderId}_1` para el "X antes"). Borrar la clave exacta no encontraba
  // nada, asi que al editar o borrar una estancia los avisos viejos seguian
  // vivos y saltaban a su hora antigua. Borramos la clave exacta (formato de
  // 14-recordatorios.js) Y todas las que empiecen por `${reminderId}_`.
  deleteReminder: async function(reminderId) {
    if (!this.enabled || !this._adminUid || !reminderId) return;
    try {
      if (!await this._ensureDb()) return;
      const base = `users/${this._adminUid}/reminders`;
      const snap = await this._dbGet(this._dbRef(this.db, base));
      if (!snap.exists()) return;
      const todos = snap.val() || {};
      const pref = `${reminderId}_`;
      const borrados = {};
      Object.keys(todos).forEach(k => {
        if (k === reminderId || k.indexOf(pref) === 0) borrados[k] = null;
      });
      if (Object.keys(borrados).length) {
        await this._dbUpdate(this._dbRef(this.db, base), borrados);
      }
    } catch(err) { console.warn('[FCM] deleteReminder:', err && err.message); }
  }
};

NV_SYNC.init();

// ===== Subida de emergencia al cerrar u ocultar la app =====
// Sin esto, cerrar la PWA (o cambiar de app en el móvil) dentro de los 500 ms
// del debounce perdía el último cambio para siempre: la nube no lo recibía y
// el siguiente arranque pisaba el localStorage con el snapshot viejo.
try {
  window.addEventListener('pagehide', () => {
    try { if (NV_SYNC._pushTimer) NV_SYNC.flushPush(); } catch (e) {}
  });
  document.addEventListener('visibilitychange', () => {
    try { if (document.visibilityState === 'hidden' && NV_SYNC._pushTimer) NV_SYNC.flushPush(); } catch (e) {}
  });
} catch (e) {}
