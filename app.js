/* ===== Natura Viva Gardens — lógica v3 ===== */

// ============================================================
// SISTEMA DE AUTENTICACIÓN
// ============================================================
// IMPORTANTE: esto es una barrera de entrada básica, no seguridad real.
// Las contraseñas viven en el JS — quien sepa abrir Developer Tools las verá.
// Suficiente para uso interno del equipo.

const USERS = {
  'jrar':     { pass: 'naturaviva2026', name: 'José R.',  role: 'admin' },
  'alejo':    { pass: 'alejo2026',      name: 'Alejo',    role: 'alejo' },
  'cristian': { pass: 'cristian2026',   name: 'Cristian', role: 'cristian' }
};

// Permisos por rol
function canEditHours() {
  const u = currentUser();
  if (!u) return false;
  return u.role !== 'cristian'; // cristian solo puede VER horas
}
function canEditEquipo() {
  const u = currentUser();
  if (!u) return false;
  return true; // jrar y alejo y cristian pueden ver, alejo puede editar como jrar
  // El bloqueo de cristian es solo en horas (canEditHours)
}
function allowedVehicles() {
  const u = currentUser();
  if (!u) return Object.keys(VEHICLES_ALL);
  if (u.role === 'admin') return Object.keys(VEHICLES_ALL); // todos
  // alejo y cristian: solo Crafter y Otro
  return ['Crafter', 'Otro'];
}

// Estado de intentos fallidos para bloqueo temporal
let loginFailCount = parseInt(sessionStorage.getItem('nv_fail') || '0', 10);
let loginLockUntil = parseInt(sessionStorage.getItem('nv_lock') || '0', 10);

function isLoggedIn() {
  const u = localStorage.getItem('nv_session_user');
  return u && USERS[u];
}
function currentUser() {
  const u = localStorage.getItem('nv_session_user');
  return USERS[u] ? { username: u, ...USERS[u] } : null;
}
function doLogin(user, pass) {
  // Comprobar bloqueo por intentos
  const now = Date.now();
  if (loginLockUntil && now < loginLockUntil) {
    const secs = Math.ceil((loginLockUntil - now) / 1000);
    return { ok: false, msg: `Demasiados intentos. Espera ${secs}s.` };
  }
  const userLower = (user || '').toLowerCase().trim();
  const u = USERS[userLower];
  if (!u || u.pass !== pass) {
    loginFailCount++;
    sessionStorage.setItem('nv_fail', String(loginFailCount));
    if (loginFailCount >= 5) {
      loginLockUntil = now + 30000; // 30s
      sessionStorage.setItem('nv_lock', String(loginLockUntil));
      loginFailCount = 0;
      sessionStorage.setItem('nv_fail', '0');
      return { ok: false, msg: 'Demasiados intentos fallidos. Bloqueado 30 segundos.' };
    }
    return { ok: false, msg: `Usuario o contraseña incorrectos. (${5 - loginFailCount} intentos restantes)` };
  }
  // OK
  localStorage.setItem('nv_session_user', userLower);
  loginFailCount = 0;
  sessionStorage.setItem('nv_fail', '0');
  loginLockUntil = 0;
  sessionStorage.removeItem('nv_lock');
  return { ok: true };
}
function doLogout() {
  if (!confirm('¿Cerrar sesión?')) return;
  localStorage.removeItem('nv_session_user');
  location.reload();
}
function showLoginScreen() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  setTimeout(() => { const u = document.getElementById('login-user'); if (u) u.focus(); }, 60);
}
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  // Pintar nombre del usuario en la barra superior
  const cu = currentUser();
  if (cu) {
    const badge = document.getElementById('current-user-badge');
    if (badge) badge.textContent = cu.name;
  }
}

// Listener del formulario de login
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('login-btn');
  const userInp = document.getElementById('login-user');
  const passInp = document.getElementById('login-pass');
  const errEl = document.getElementById('login-error');
  const tryLogin = () => {
    const r = doLogin(userInp.value, passInp.value);
    if (!r.ok) {
      errEl.textContent = r.msg;
      passInp.value = '';
      passInp.focus();
      return;
    }
    errEl.textContent = '';
    showApp();
    // arrancar la app
    if (typeof buildWeek === 'function') buildWeek();
  };
  btn.addEventListener('click', tryLogin);
  passInp.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  userInp.addEventListener('keydown', e => { if (e.key === 'Enter') passInp.focus(); });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

  // Decidir qué mostrar al cargar
  if (isLoggedIn()) {
    showApp();
  } else {
    showLoginScreen();
  }
});

// ============================================================

const FINCAS = ['Tonyna','Tagomago','Seahouse','Greco','Batle Bujosa','Cabrera','Sa Vinya','Can Borras',"Puig de s'Espart",'Miró','Gerret','Alzina'];
const EMPLEADOS = [
  {init:'JR', name:'José R.',  zones:'', active:true},
  {init:'AL', name:'Alejo',    zones:'', active:true},
  {init:'CR', name:'Cristian', zones:'', active:true}
];
const EMP_NAMES = EMPLEADOS.map(e => e.name);
const FCLS = {Tonyna:'c-tonyna',Tagomago:'c-tagomago',Seahouse:'c-seahouse',Greco:'c-greco','Batle Bujosa':'c-batle',Cabrera:'c-cabrera','Sa Vinya':'c-savinya','Can Borras':'c-borras',"Puig de s'Espart":'c-puig','Miró':'c-miro',Gerret:'c-gerret',Alzina:'c-alzina'};
const FCOL = {Tonyna:'#ffc5c5',Tagomago:'#e8b4d8',Seahouse:'#b8d0f0',Greco:'#f5d9b0','Batle Bujosa':'#b8d8f0',Cabrera:'#c8c870','Sa Vinya':'#90d0b8','Can Borras':'#a8e0a8',"Puig de s'Espart":'#e0c898','Miró':'#c8b0e0',Gerret:'#ffd098',Alzina:'#c8e0a8'};
const DKEYS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const DLABELS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const HOURS = ['8:00','9:00','10:00','11:00','12:00','13:00','14:00','15:00'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// Horario BASE — por defecto. Cualquier casilla puede ser sobrescrita en scheduleOverrides
const BASE = {
  lunes: ['Tonyna','Tonyna','Tonyna','Gerret','Seahouse','Seahouse','Tagomago','Tagomago'],
  martes: ['Greco','Greco','Greco','Greco','Greco','Greco','Greco','Greco'],
  miercoles: ['Batle Bujosa','Batle Bujosa','Batle Bujosa','Cabrera','Cabrera','Sa Vinya','Sa Vinya','Sa Vinya'],
  jueves: ['Tagomago','Tagomago','Can Borras','Can Borras','Can Borras',"Puig de s'Espart","Puig de s'Espart",'Alzina'],
  viernes: ['Miró','Miró','Miró','Miró','Miró','Miró','Miró','Miró'],
  sabado: [null,null,null,null,null,null,null,null],
  domingo: [null,null,null,null,null,null,null,null]
};

// ===== ESTADO + PERSISTENCIA =====
// Versión del esquema de datos. Si cambia, se borran los datos antiguos automáticamente.
const DATA_VERSION = 4;

function loadState() {
  try {
    const storedVersion = parseInt(localStorage.getItem('nv_data_version') || '0', 10);
    if (storedVersion < DATA_VERSION) {
      // Datos antiguos (incluye ejemplos viejos) — limpiar
      localStorage.removeItem('nv_state');
      localStorage.setItem('nv_data_version', String(DATA_VERSION));
      return { fuelDays:{}, wkndTasks:{}, houseData: initHouseData(), empHours: initEmpHours(), schedOver:{}, nextId: 100 };
    }
    const s = JSON.parse(localStorage.getItem('nv_state') || '{}');
    return {
      fuelDays: s.fuelDays || {},
      wkndTasks: s.wkndTasks || {},
      houseData: s.houseData || initHouseData(),
      empHours: s.empHours || initEmpHours(),
      schedOver: s.schedOver || {},
      compras: s.compras || [],
      estancias: s.estancias || [],
      nextId: s.nextId || 100
    };
  } catch(e) {
    return { fuelDays:{}, wkndTasks:{}, houseData: initHouseData(), empHours: initEmpHours(), schedOver:{}, compras:[], estancias:[], nextId: 100 };
  }
}
function initHouseData() {
  // App vacía — lista para usar
  const hd = {};
  FINCAS.forEach(f => { hd[f] = { notas: [], tareas: [] }; });
  return hd;
}
function initEmpHours() {
  const eh = {};
  EMP_NAMES.forEach(n => eh[n] = {});
  return eh;
}
function saveState() {
  try {
    localStorage.setItem('nv_state', JSON.stringify({ fuelDays, wkndTasks, houseData, empHours, schedOver, compras, estancias, nextId }));
  } catch(e) { console.log('No se pudo guardar:', e); }
  // Subir a la nube si Firebase está activo
  if (window.NV_SYNC && window.NV_SYNC.enabled) {
    window.NV_SYNC.pushToCloud();
  }
}

const _s = loadState();
let fuelDays = _s.fuelDays;
let wkndTasks = _s.wkndTasks;
let houseData = _s.houseData;
let empHours = _s.empHours;
let schedOver = _s.schedOver;
let compras = _s.compras;
let estancias = _s.estancias;
let nextId = _s.nextId;
EMP_NAMES.forEach(n => { if (!empHours[n]) empHours[n] = {}; });
// asegurar IDs en notas antiguas (compatibilidad)
FINCAS.forEach(f => {
  if (!houseData[f]) houseData[f] = {notas:[], tareas:[]};
  (houseData[f].notas || []).forEach(n => { if (!n.id) n.id = nextId++; });
});

let weekOff = 0, monthOff = 0, fuelMonthOff = 0;
let currentHouse = null, currentTab = 'tareas';
let currentEmp = null, empTab = 'tareas', empCalView = 'mes', empMonthOff = 0, empWeekOff = 0;
let taskFilter = 'all', selectMode = false;
let selectedTasks = new Set();
let newTaskAssigns = new Set();
let newTaskAssignsHouse = new Set();
let modalKey = '', modalLabel = '';
let hoursModalKey = '', hoursModalEmp = '', hoursModalLabel = '';
let tareasMode = 'lista';
const wkBase = new Date(2026, 4, 11);

// ===== UTILIDADES =====
function dk(d) {
  // Usar fecha LOCAL, no UTC, para evitar desplazamientos por zona horaria
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function getWeekDates(off) { return DKEYS.map((_,i) => { const d = new Date(wkBase); d.setDate(d.getDate() + off*7 + i); return d; }); }
function isToday(d) { const t = new Date(); return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear(); }
function isWE(d) { return d.getDay() === 0 || d.getDay() === 6; }
// Comprueba si la finca tiene tareas pendientes EN GENERAL (sin filtrar hora)
function hasTasksGeneral(f) { return houseData[f] && houseData[f].tareas.some(t => !t.done); }
function hasNotesGeneral(f) { return houseData[f] && houseData[f].notas.length > 0; }
// Comprueba si la finca tiene tareas pendientes/notas APLICABLES a una casilla concreta (date, hi)
// Lógica: una tarea/nota aparece en una casilla si:
//  - schedule = null → aparece donde la finca tiene horas BASE (comportamiento clásico "En esta finca")
//  - schedule = {day, from:null, to:null} → aparece en todas las casillas de ese día concreto
//  - schedule = {day, from, to} → aparece SOLO en las casillas hi >= from && hi < to de ese día
function itemAppliesToCell(item, date, hi) {
  const s = item.schedule;
  const dateKey = dk(date);
  if (!s) return true; // En esta finca → siempre que la casilla sea de la finca, ya filtrado fuera
  if (s.day !== dateKey) return false;
  if (s.from === null || s.from === undefined) return true; // todo el día
  return hi >= s.from && hi < s.to;
}
function hasTasksInCell(f, date, hi) {
  if (!houseData[f]) return false;
  return houseData[f].tareas.some(t => !t.done && itemAppliesToCell(t, date, hi));
}
function hasNotesInCell(f, date, hi) {
  if (!houseData[f]) return false;
  return houseData[f].notas.some(n => itemAppliesToCell(n, date, hi));
}
// Compatibilidad — el código antiguo seguía usando hasTasks/hasNotes "general"
function hasTasks(f) { return hasTasksGeneral(f); }
function hasNotes(f) { return hasNotesGeneral(f); }
function showToast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2300); }
function refreshCals() {
  if (document.getElementById('view-mes').style.display !== 'none') buildMonth();
  if (document.getElementById('view-semana').style.display !== 'none') buildWeek();
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function laborableDays(year, month) {
  let n = 0;
  const dim = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}
function getHourValue(empName, k) {
  const raw = empHours[empName] && empHours[empName][k];
  if (!raw) return '';
  return typeof raw === 'string' ? raw : (raw.value || '');
}
function getHourNote(empName, k) {
  const raw = empHours[empName] && empHours[empName][k];
  if (!raw || typeof raw === 'string') return '';
  return raw.note || '';
}
function netHoursForMonth(empName, year, month) {
  let net = 0;
  const dim = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const k = dk(new Date(year, month, d));
    const v = getHourValue(empName, k);
    if (v) net += parseInt(v, 10) || 0;
  }
  return net;
}
// Obtener contenido real de una casilla (override > base)
function getCellContent(date, hi) {
  const key = `${dk(date)}_${hi}`;
  if (schedOver[key]) return schedOver[key]; // {type, value}
  const dow = (date.getDay() + 6) % 7;
  if (dow >= 5) return { type: 'libre' }; // fin de semana sin override = libre, editable
  const finca = BASE[DKEYS[dow]][hi];
  if (finca) return { type: 'finca', value: finca };
  return { type: 'libre' };
}

// ===== MODAL FIN DE SEMANA =====
// Estructura nueva: wkndTasks[fecha] = [{id, text, done, fromHour, toHour}]
//   fromHour=null y toHour=null → todo el día
//   fromHour/toHour son índices: 0=8:00, 1=9:00 ... 7=15:00, 8=16:00
let wkndEditingIdx = null; // si estamos editando una entrada existente

function hoursLabel(from, to) {
  if (from === null || from === undefined) return '🌞 Todo el día';
  const fromLabel = HOURS[from];
  const toLabel = to < 8 ? HOURS[to] : '16:00';
  return `⏰ ${fromLabel}–${toLabel}`;
}

function openWkndModal(key, label) {
  modalKey = key; modalLabel = label;
  wkndEditingIdx = null;
  const old = document.getElementById('wknd-modal'); if (old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'wknd-modal';
  const tasks = wkndTasks[key] || [];
  const listHtml = tasks.length ? tasks.map((t,i) => `
    <div class="modal-item">
      <div class="modal-check${t.done?' done':''}" onclick="toggleWknd('${key}',${i})">${t.done?'✓':''}</div>
      <div class="modal-item-text${t.done?' done-item':''}" onclick="editWkndTask('${key}',${i})"><div style="font-size:9px;color:var(--text-tertiary);margin-bottom:2px">${hoursLabel(t.fromHour, t.toHour)}</div>${escapeHtml(t.text)}</div>
      <button class="edit-btn" onclick="editWkndTask('${key}',${i})">✎</button>
      <button class="del-btn" onclick="removeWknd('${key}',${i})">×</button>
    </div>`).join('') : '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Sin entradas todavía.</div>';
  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">📅 ${escapeHtml(label)}</div>
    <div class="modal-list">${listHtml}</div>
    <div class="field-label" id="wknd-form-title">Nueva entrada</div>
    <textarea id="wknd-in" placeholder="Escribe tarea, nota, trabajo..."></textarea>
    <div class="field-label">¿Cuándo?</div>
    <div class="emp-pills" style="margin-bottom:10px">
      <div class="emp-pill on" id="wknd-scope-day" onclick="setWkndScope('day')">🌞 Todo el día</div>
      <div class="emp-pill" id="wknd-scope-hour" onclick="setWkndScope('hour')">⏰ Hora concreta</div>
    </div>
    <div id="wknd-hour-section" style="display:none;margin-bottom:10px">
      <div style="display:flex;gap:6px;align-items:center">
        <select id="wknd-hour-from" style="flex:1">${HOURS.map((h,i)=>`<option value="${i}">${h}</option>`).join('')}</select>
        <span style="font-size:12px;color:var(--text-secondary)">a</span>
        <select id="wknd-hour-to" style="flex:1">${HOURS.map((h,i)=>`<option value="${i+1}" ${i===0?'selected':''}>${i<7?HOURS[i+1]:'16:00'}</option>`).join('')}<option value="8">16:00</option></select>
      </div>
    </div>
    <div class="modal-btns">
      <div class="btn-cancel" onclick="closeWkndModal()">Cerrar</div>
      <div class="btn-ok" id="wknd-ok-btn" onclick="saveWkndTask()">Añadir</div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) closeWkndModal(); };
  wkndScope = 'day';
  setTimeout(() => { const ta = document.getElementById('wknd-in'); if (ta) ta.focus(); }, 40);
}

let wkndScope = 'day';
function setWkndScope(scope) {
  wkndScope = scope;
  document.getElementById('wknd-scope-day').classList.toggle('on', scope === 'day');
  document.getElementById('wknd-scope-hour').classList.toggle('on', scope === 'hour');
  document.getElementById('wknd-hour-section').style.display = scope === 'hour' ? 'block' : 'none';
}
function closeWkndModal() { const m = document.getElementById('wknd-modal'); if (m) m.remove(); wkndEditingIdx = null; }

function saveWkndTask() {
  const txt = document.getElementById('wknd-in').value.trim();
  if (!txt) { showToast('Escribe algo'); return; }
  let fromHour = null, toHour = null;
  if (wkndScope === 'hour') {
    fromHour = parseInt(document.getElementById('wknd-hour-from').value, 10);
    toHour = parseInt(document.getElementById('wknd-hour-to').value, 10);
    if (toHour <= fromHour) { showToast('La hora final debe ser mayor que la inicial'); return; }
  }
  if (!wkndTasks[modalKey]) wkndTasks[modalKey] = [];
  if (wkndEditingIdx !== null) {
    // editar entrada existente
    wkndTasks[modalKey][wkndEditingIdx] = { ...wkndTasks[modalKey][wkndEditingIdx], text: txt, fromHour, toHour };
    showToast('✅ Actualizada');
  } else {
    wkndTasks[modalKey].push({ id: nextId++, text: txt, done: false, fromHour, toHour });
    showToast('✅ Añadida');
  }
  saveState();
  openWkndModal(modalKey, modalLabel);
  refreshCals();
}
function toggleWknd(key, idx) { wkndTasks[key][idx].done = !wkndTasks[key][idx].done; saveState(); openWkndModal(key, modalLabel); refreshCals(); }
function removeWknd(key, idx) {
  if (!confirm('¿Borrar esta entrada?')) return;
  wkndTasks[key].splice(idx, 1);
  if (wkndTasks[key].length === 0) delete wkndTasks[key];
  saveState();
  openWkndModal(key, modalLabel);
  refreshCals();
}
function editWkndTask(key, idx) {
  const cur = wkndTasks[key][idx];
  wkndEditingIdx = idx;
  // rellenar el formulario con valores actuales
  setTimeout(() => {
    document.getElementById('wknd-form-title').textContent = 'Editar entrada';
    document.getElementById('wknd-in').value = cur.text;
    document.getElementById('wknd-ok-btn').textContent = 'Guardar';
    if (cur.fromHour !== null && cur.fromHour !== undefined) {
      setWkndScope('hour');
      document.getElementById('wknd-hour-from').value = cur.fromHour;
      document.getElementById('wknd-hour-to').value = cur.toHour;
    } else {
      setWkndScope('day');
    }
    document.getElementById('wknd-in').focus();
  }, 20);
}

// ===== MODAL EDITAR CASILLA DE SEMANA =====
let cellModalDate = null, cellModalHi = 0;
function openCellModal(date, hi) {
  cellModalDate = date; cellModalHi = hi;
  const old = document.getElementById('cell-modal'); if (old) old.remove();
  const content = getCellContent(date, hi);
  const dow = (date.getDay() + 6) % 7;
  const dateLabel = `${DLABELS[dow]} ${date.getDate()} ${MS[date.getMonth()]}`;
  const hourLabel = `${HOURS[hi]}–${hi<7?HOURS[hi+1]:'16:00'}`;

  const isCustom = content.type === 'custom';
  const isFinca = content.type === 'finca';
  const isLibre = content.type === 'libre';

  // Generar opciones de horas para selects
  const hoursOpts = HOURS.map((h, i) => `<option value="${i}">${h}</option>`).join('') + `<option value="8">16:00</option>`;

  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'cell-modal';
  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">✎ ${escapeHtml(dateLabel)}</div>
    <div class="field-label">¿Cuándo aplica?</div>
    <div class="emp-pills" style="margin-bottom:12px">
      <div class="emp-pill on" id="scope-hour" onclick="setCellScope('hour')">⏰ Solo ${hourLabel}</div>
      <div class="emp-pill" id="scope-day" onclick="setCellScope('day')">📅 Todo el día</div>
      <div class="emp-pill" id="scope-range" onclick="setCellScope('range')">⏱ Rango de horas</div>
    </div>
    <div id="range-section" style="display:none;margin-bottom:12px">
      <div class="field-label">Desde / Hasta</div>
      <div style="display:flex;gap:6px;align-items:center">
        <select id="range-from" style="flex:1">${HOURS.map((h, i) => `<option value="${i}" ${i===hi?'selected':''}>${h}</option>`).join('')}</select>
        <span style="font-size:12px;color:var(--text-secondary)">a</span>
        <select id="range-to" style="flex:1">${HOURS.map((h, i) => `<option value="${i+1}" ${i===hi?'selected':''}>${i<7?HOURS[i+1]:'16:00'}</option>`).join('')}<option value="8">16:00</option></select>
      </div>
    </div>
    <div class="field-label">Tipo de contenido</div>
    <div class="emp-pills" style="margin-bottom:12px">
      <div class="emp-pill${isFinca?' on':''}" onclick="setCellType('finca')">🏠 Finca</div>
      <div class="emp-pill${isCustom?' on':''}" onclick="setCellType('custom')">📝 Texto libre</div>
      <div class="emp-pill${isLibre?' on':''}" onclick="setCellType('libre')">○ Libre</div>
    </div>
    <div id="cell-finca-section" style="display:${isFinca?'block':'none'}">
      <div class="field-label">Finca</div>
      <select id="cell-finca-sel">${FINCAS.map(f => `<option value="${escapeHtml(f)}" ${isFinca && content.value===f?'selected':''}>${escapeHtml(f)}</option>`).join('')}</select>
    </div>
    <div id="cell-custom-section" style="display:${isCustom?'block':'none'}">
      <div class="field-label">Texto</div>
      <textarea id="cell-custom-in" placeholder="Ej: Visita Cliente X, Reunión, Día libre...">${isCustom?escapeHtml(content.value||''):''}</textarea>
    </div>
    <div class="modal-btns">
      <button class="btn-danger" onclick="resetCell()" title="Volver al horario por defecto">↺ Por defecto</button>
      <div class="btn-cancel" onclick="closeCellModal()">Cancelar</div>
      <div class="btn-ok" onclick="saveCell()">Guardar</div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) closeCellModal(); };
  // valores por defecto
  cellModalScope = 'hour';
  cellModalSelectedType = content.type === 'wknd' ? 'custom' : content.type;
}
function closeCellModal() { const m = document.getElementById('cell-modal'); if (m) m.remove(); }
let cellModalSelectedType = null;
let cellModalScope = 'hour'; // 'hour' | 'day' | 'range'
function setCellScope(scope) {
  cellModalScope = scope;
  ['hour','day','range'].forEach(s => {
    const el = document.getElementById('scope-' + s);
    if (el) el.classList.toggle('on', s === scope);
  });
  document.getElementById('range-section').style.display = scope === 'range' ? 'block' : 'none';
}
function setCellType(type) {
  cellModalSelectedType = type;
  document.querySelectorAll('#cell-modal .emp-pills')[1].querySelectorAll('.emp-pill').forEach(p => p.classList.remove('on'));
  const map = { finca: 0, custom: 1, libre: 2 };
  document.querySelectorAll('#cell-modal .emp-pills')[1].querySelectorAll('.emp-pill')[map[type]].classList.add('on');
  document.getElementById('cell-finca-section').style.display = type === 'finca' ? 'block' : 'none';
  document.getElementById('cell-custom-section').style.display = type === 'custom' ? 'block' : 'none';
}
function saveCell() {
  const date = cellModalDate, hi = cellModalHi;
  const type = cellModalSelectedType || getCellContent(date, hi).type;

  // Determinar qué horas aplicar
  let hoursToApply = [];
  if (cellModalScope === 'day') {
    // todo el día: horas 0..7 (8:00 a 16:00)
    hoursToApply = [0,1,2,3,4,5,6,7];
  } else if (cellModalScope === 'range') {
    const from = parseInt(document.getElementById('range-from').value, 10);
    const to = parseInt(document.getElementById('range-to').value, 10);
    if (to <= from) { showToast('La hora final debe ser mayor que la inicial'); return; }
    for (let h = from; h < to; h++) hoursToApply.push(h);
  } else {
    hoursToApply = [hi];
  }

  // Validar antes de guardar
  let value = null;
  if (type === 'finca') {
    value = document.getElementById('cell-finca-sel').value;
  } else if (type === 'custom') {
    value = document.getElementById('cell-custom-in').value.trim();
    if (!value) { showToast('Escribe algo o elige libre'); return; }
  }

  const baseKey = dk(date);
  // Determinar si es fin de semana → guardar como wkndTasks
  const dow = date.getDay();
  const isWknd = dow === 0 || dow === 6;

  if (isWknd && type === 'custom') {
    // En fin de semana, guardamos como tarea de wknd
    if (!wkndTasks[baseKey]) wkndTasks[baseKey] = [];
    const hourText = cellModalScope === 'day' ? '🌞 Todo el día' :
                     cellModalScope === 'range' ? `⏱ ${HOURS[hoursToApply[0]]}–${hoursToApply[hoursToApply.length-1]<7?HOURS[hoursToApply[hoursToApply.length-1]+1]:'16:00'}` :
                     `⏰ ${HOURS[hi]}`;
    wkndTasks[baseKey].push({ text: `${hourText}\n${value}`, done: false });
  } else {
    // L-V: guardar en schedOver por cada hora del rango
    hoursToApply.forEach(h => {
      const key = `${baseKey}_${h}`;
      if (type === 'finca') schedOver[key] = { type: 'finca', value };
      else if (type === 'custom') schedOver[key] = { type: 'custom', value };
      else if (type === 'libre') schedOver[key] = { type: 'libre' };
    });
  }
  saveState();
  closeCellModal();
  buildWeek();
  showToast('✅ Guardado');
}
function resetCell() {
  // Borra TODOS los overrides del día completo
  const baseKey = dk(cellModalDate);
  for (let h = 0; h < 8; h++) {
    delete schedOver[`${baseKey}_${h}`];
  }
  saveState();
  closeCellModal();
  buildWeek();
  showToast('↺ Por defecto');
}

// ===== MODAL HORAS EXTRAS =====
function openHoursModal(empName, key, label) {
  // Cristian solo puede VER horas, no editarlas
  if (!canEditHours()) {
    const raw = empHours[empName] && empHours[empName][key];
    if (!raw) { showToast('Sin horas registradas ese día'); return; }
    const val = typeof raw === 'string' ? raw : (raw.value || '');
    const note = typeof raw === 'string' ? '' : (raw.note || '');
    alert(`${empName} · ${label}\n\nHoras: ${val}${note ? '\nMotivo: ' + note : ''}\n\n(Solo lectura — pide a JRAR para editar)`);
    return;
  }
  hoursModalEmp = empName; hoursModalKey = key; hoursModalLabel = label;
  const old = document.getElementById('hours-modal'); if (old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'hours-modal';
  const raw = (empHours[empName] && empHours[empName][key]);
  // Compatibilidad: si es string antiguo, lo tratamos como value sin nota
  let curVal = '', curNote = '';
  if (raw) {
    if (typeof raw === 'string') curVal = raw;
    else { curVal = raw.value || ''; curNote = raw.note || ''; }
  }
  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">⏱ ${escapeHtml(empName)} · ${escapeHtml(label)}</div>
    <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px">Horas extras (+) o menos (–) sobre la jornada normal de 8 h.</div>
    <div class="quick-hours">
      <button class="q-hr-btn plus" onclick="setHr('+2')">+2</button>
      <button class="q-hr-btn plus" onclick="setHr('+4')">+4</button>
      <button class="q-hr-btn plus" onclick="setHr('+6')">+6</button>
      <button class="q-hr-btn plus" onclick="setHr('+8')">+8</button>
    </div>
    <div class="quick-hours">
      <button class="q-hr-btn minus" onclick="setHr('-2')">−2</button>
      <button class="q-hr-btn minus" onclick="setHr('-4')">−4</button>
      <button class="q-hr-btn minus" onclick="setHr('-6')">−6</button>
      <button class="q-hr-btn minus" onclick="setHr('-8')">−8</button>
      <button class="q-hr-btn zero" onclick="setHr('')">Borrar</button>
    </div>
    <div class="field-label">Horas</div>
    <input id="hr-in" placeholder="Ej: +3, -5" value="${escapeHtml(curVal)}">
    <div class="field-label">Motivo (opcional)</div>
    <input id="hr-note" class="hr-comment-input" placeholder="Ej: plantar jardín alemán, estaba enfermo..." value="${escapeHtml(curNote)}">
    <div class="modal-btns">
      <div class="btn-cancel" onclick="closeHoursModal()">Cancelar</div>
      <div class="btn-ok" onclick="saveHours()">Guardar</div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) closeHoursModal(); };
  setTimeout(() => { const inp = document.getElementById('hr-in'); if (inp) inp.focus(); }, 40);
}
function closeHoursModal() { const m = document.getElementById('hours-modal'); if (m) m.remove(); }
function setHr(v) { const inp = document.getElementById('hr-in'); if (inp) inp.value = v; }
function saveHours() {
  let v = document.getElementById('hr-in').value.trim();
  const note = (document.getElementById('hr-note').value || '').trim();
  if (v === '') {
    if (empHours[hoursModalEmp]) delete empHours[hoursModalEmp][hoursModalKey];
  } else {
    const m = v.match(/^([+-]?)(\d+)/);
    if (!m) { showToast('Escribe un número (ej. +4 o -3)'); return; }
    const sign = m[1] === '-' ? '-' : '+';
    const num = parseInt(m[2], 10);
    if (num === 0) { if (empHours[hoursModalEmp]) delete empHours[hoursModalEmp][hoursModalKey]; }
    else {
      if (!empHours[hoursModalEmp]) empHours[hoursModalEmp] = {};
      empHours[hoursModalEmp][hoursModalKey] = { value: sign + num, note };
    }
  }
  saveState();
  closeHoursModal();
  renderEmpleado();
  showToast('✅ Guardado');
}

// ===== MODAL EDITAR TAREA =====
// ===== HELPER: SELECTOR DE SCHEDULE (todo el día / en esta finca / hora concreta) =====
// scope values: 'finca' | 'day' | 'range'
// schedule object: null | { day:'YYYY-MM-DD', from:null, to:null } | { day, from, to }
// Schedule simplificado:
//   null                              → "En esta finca" — aparece donde la finca está en horario base
//   { day, from:null, to:null }       → todo el día (de la fecha 'day')
//   { day, from, to }                 → hora concreta (de la fecha 'day')
// La fecha 'day' siempre es el día en que se creó la tarea (currentHouseContextDate)
function renderScheduleSelector(containerId, prefix, currentSchedule) {
  const c = document.getElementById(containerId);
  if (!c) return;
  let curScope = 'finca';
  let curFrom = 0, curTo = 1;
  if (currentSchedule) {
    if (currentSchedule.from === null || currentSchedule.from === undefined) {
      curScope = 'day';
    } else {
      curScope = 'range';
      curFrom = currentSchedule.from;
      curTo = currentSchedule.to;
    }
  }

  // Etiqueta informativa con la fecha de contexto
  let dateInfo = '';
  if (currentHouseContextDate) {
    const d = currentHouseContextDate;
    const dow = (d.getDay() + 6) % 7;
    dateInfo = `<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px;background:var(--bg-secondary);padding:6px 10px;border-radius:var(--radius-md)">📅 Para el <strong>${DLABELS[dow]} ${d.getDate()}/${d.getMonth()+1}</strong></div>`;
  }

  c.innerHTML = `
    <div class="emp-pills" style="margin-bottom:10px">
      <div class="emp-pill${curScope==='finca'?' on':''}" id="${prefix}-scope-finca" onclick="setSchedScope('${prefix}','finca')">🏠 En esta finca</div>
      <div class="emp-pill${curScope==='day'?' on':''}" id="${prefix}-scope-day" onclick="setSchedScope('${prefix}','day')">🌞 Todo el día</div>
      <div class="emp-pill${curScope==='range'?' on':''}" id="${prefix}-scope-range" onclick="setSchedScope('${prefix}','range')">⏰ Hora concreta</div>
    </div>
    <div id="${prefix}-date-info" style="display:${curScope==='finca'?'none':'block'}">${dateInfo}</div>
    <div id="${prefix}-range-section" style="display:${curScope==='range'?'block':'none'};margin-bottom:10px">
      <div class="field-label" style="margin-bottom:4px">Desde / Hasta</div>
      <div style="display:flex;gap:6px;align-items:center">
        <select id="${prefix}-sched-from" style="flex:1">${HOURS.map((h,i)=>`<option value="${i}" ${i===curFrom?'selected':''}>${h}</option>`).join('')}</select>
        <span style="font-size:12px;color:var(--text-secondary)">a</span>
        <select id="${prefix}-sched-to" style="flex:1">${HOURS.map((h,i)=>`<option value="${i+1}" ${(i+1)===curTo?'selected':''}>${i<7?HOURS[i+1]:'16:00'}</option>`).join('')}<option value="8" ${curTo===8?'selected':''}>16:00</option></select>
      </div>
    </div>`;
  window['_schedScope_' + prefix] = curScope;
}
function setSchedScope(prefix, scope) {
  window['_schedScope_' + prefix] = scope;
  ['finca','day','range'].forEach(s => {
    const el = document.getElementById(`${prefix}-scope-${s}`);
    if (el) el.classList.toggle('on', s === scope);
  });
  const dInfo = document.getElementById(`${prefix}-date-info`);
  if (dInfo) dInfo.style.display = scope === 'finca' ? 'none' : 'block';
  document.getElementById(`${prefix}-range-section`).style.display = scope === 'range' ? 'block' : 'none';
}
function readScheduleFromSelector(prefix) {
  const scope = window['_schedScope_' + prefix] || 'finca';
  if (scope === 'finca') return null;
  // La fecha viene del contexto donde se abrió la finca
  let day;
  if (currentHouseContextDate) {
    day = dk(currentHouseContextDate);
  } else {
    day = dk(new Date());
  }
  if (scope === 'day') {
    return { day, from: null, to: null };
  }
  const from = parseInt(document.getElementById(`${prefix}-sched-from`).value, 10);
  const to = parseInt(document.getElementById(`${prefix}-sched-to`).value, 10);
  if (to <= from) return null;
  return { day, from, to };
}
function scheduleLabel(s) {
  if (!s) return '';
  const [y,m,d] = s.day.split('-').map(Number);
  const date = new Date(y, m-1, d);
  const dow = (date.getDay()+6)%7;
  const dayStr = `${DLABELS[dow]} ${d}/${m}`;
  if (s.from === null || s.from === undefined) return `🌞 ${dayStr} · todo el día`;
  const fromLabel = HOURS[s.from], toLabel = s.to<8?HOURS[s.to]:'16:00';
  return `⏰ ${dayStr} · ${fromLabel}–${toLabel}`;
}

let editTaskCtx = null; // {finca, id}
function openEditTaskModal(finca, id) {
  const t = houseData[finca].tareas.find(x => x.id === id);
  if (!t) return;
  editTaskCtx = { finca, id };
  window._etPhotoData = t.img || null;
  const old = document.getElementById('edit-task-modal'); if (old) old.remove();
  const assigns = new Set(t.assigns || []);
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'edit-task-modal';
  const photoHtml = t.img ? `<img class="modal-photo-preview" src="${t.img}">` : '';
  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">✎ Editar tarea</div>
    <div class="field-label">Descripción</div>
    <input id="et-title" value="${escapeHtml(t.title)}">
    <div class="field-label">Finca</div>
    <select id="et-finca">${FINCAS.map(f => `<option value="${escapeHtml(f)}" ${f===finca?'selected':''}>${escapeHtml(f)}</option>`).join('')}</select>
    <div class="field-label">Asignar a</div>
    <div class="emp-pills" id="et-pills"></div>
    <div style="height:10px"></div>
    <div class="field-label">Prioridad</div>
    <select id="et-prio">
      <option value="normal" ${t.prio==='normal'?'selected':''}>Normal</option>
      <option value="urgent" ${t.prio==='urgent'?'selected':''}>Urgente</option>
    </select>
    <div class="field-label">¿Cuándo se hace?</div>
    <div id="et-schedule-container"></div>
    <div class="field-label" style="margin-top:8px">🔔 Aviso</div>
    ${renderReminderFieldHTML('et', t.reminder || null)}
    <div class="field-label">Foto</div>
    <div id="et-photo-area">${photoHtml}</div>
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      <label class="btn-foto-lbl">
        <input type="file" accept="image/*" class="file-input-hidden" id="et-foto-input" onchange="handleEditTaskPhoto(event)">
        📷 ${t.img?'Cambiar':'Añadir'} foto
      </label>
      ${t.img?'<button class="btn-cancel" onclick="removeEditTaskPhoto()">Quitar foto</button>':''}
    </div>
    <div class="modal-btns">
      <button class="btn-danger" onclick="deleteEditTask()">🗑 Borrar</button>
      <div class="btn-cancel" onclick="closeEditTaskModal()">Cancelar</div>
      <div class="btn-ok" onclick="saveEditTask()">Guardar</div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) closeEditTaskModal(); };
  renderScheduleSelector('et-schedule-container', 'et', t.schedule || null);
  const pillsEl = document.getElementById('et-pills');
  EMP_NAMES.forEach(name => {
    const isOn = assigns.has(name);
    const p = document.createElement('div'); p.className = 'emp-pill' + (isOn?' on':'');
    p.innerHTML = `${isOn?'✓ ':''}${name}`;
    p.onclick = () => {
      if (assigns.has(name)) assigns.delete(name); else assigns.add(name);
      openEditTaskModal_refreshPills(assigns);
    };
    pillsEl.appendChild(p);
  });
  window._etAssigns = assigns;
}
function handleEditTaskPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1500000) { showToast('Foto demasiado grande (máx 1.5 MB)'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 800;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = h * maxDim / w; w = maxDim; }
        else { w = w * maxDim / h; h = maxDim; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      window._etPhotoData = dataUrl;
      const area = document.getElementById('et-photo-area');
      if (area) area.innerHTML = `<img class="modal-photo-preview" src="${dataUrl}">`;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function removeEditTaskPhoto() {
  window._etPhotoData = null;
  const area = document.getElementById('et-photo-area');
  if (area) area.innerHTML = '';
}
function openEditTaskModal_refreshPills(assigns) {
  const pillsEl = document.getElementById('et-pills');
  if (!pillsEl) return;
  pillsEl.innerHTML = '';
  EMP_NAMES.forEach(name => {
    const isOn = assigns.has(name);
    const p = document.createElement('div'); p.className = 'emp-pill' + (isOn?' on':'');
    p.innerHTML = `${isOn?'✓ ':''}${name}`;
    p.onclick = () => { if (assigns.has(name)) assigns.delete(name); else assigns.add(name); openEditTaskModal_refreshPills(assigns); };
    pillsEl.appendChild(p);
  });
}
function closeEditTaskModal() { const m = document.getElementById('edit-task-modal'); if (m) m.remove(); editTaskCtx = null; window._etPhotoData = null; }
function saveEditTask() {
  if (!editTaskCtx) return;
  const { finca: oldFinca, id } = editTaskCtx;
  const t = houseData[oldFinca].tareas.find(x => x.id === id);
  if (!t) return;
  const title = document.getElementById('et-title').value.trim();
  const newFinca = document.getElementById('et-finca').value;
  const prio = document.getElementById('et-prio').value;
  const assigns = Array.from(window._etAssigns || []);
  if (!title) { showToast('La descripción no puede estar vacía'); return; }
  // Cancelar recordatorio anterior si lo había
  if (t.reminder && t.reminder.reminderId) NV_SYNC.deleteReminder(t.reminder.reminderId);
  t.title = title;
  t.prio = prio;
  t.assigns = assigns;
  t.img = window._etPhotoData || null;
  t.schedule = readScheduleFromSelector('et');
  t.reminder = readReminderFromField('et');
  if (newFinca !== oldFinca) {
    houseData[oldFinca].tareas = houseData[oldFinca].tareas.filter(x => x.id !== id);
    houseData[newFinca].tareas.unshift(t);
  }
  // Programar nuevo recordatorio
  if (t.reminder && t.reminder.fireAt) {
    scheduleTaskReminder(t, newFinca !== oldFinca ? newFinca : oldFinca);
  }
  saveState();
  closeEditTaskModal();
  rerenderActive();
  showToast('✅ Actualizada');
}
function deleteEditTask() {
  if (!editTaskCtx) return;
  if (!confirm('¿Borrar esta tarea?')) return;
  const { finca, id } = editTaskCtx;
  const t = houseData[finca].tareas.find(x => x.id === id);
  if (t && t.reminder && t.reminder.reminderId) NV_SYNC.deleteReminder(t.reminder.reminderId);
  houseData[finca].tareas = houseData[finca].tareas.filter(x => x.id !== id);
  saveState();
  closeEditTaskModal();
  rerenderActive();
  showToast('🗑 Borrada');
}

// ===== MODAL EDITAR NOTA =====
let editNoteCtx = null;
function openEditNoteModal(finca, id) {
  const n = houseData[finca].notas.find(x => x.id === id);
  if (!n) return;
  editNoteCtx = { finca, id };
  window._editNotePhotoData = n.img || null;
  const old = document.getElementById('edit-note-modal'); if (old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'edit-note-modal';
  const photoHtml = n.img ? `<img class="modal-photo-preview" src="${n.img}">` : '';
  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">✎ Editar nota</div>
    <div class="field-label">Texto</div>
    <textarea id="en-text" style="min-height:100px">${escapeHtml(n.text)}</textarea>
    <div class="field-label">¿Cuándo?</div>
    <div id="en-schedule-container"></div>
    <div class="field-label">Foto</div>
    <div id="en-photo-area">${photoHtml}</div>
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      <label class="btn-foto-lbl">
        <input type="file" accept="image/*" class="file-input-hidden" id="en-foto-input" onchange="handleEditNotePhoto(event)">
        📷 ${n.img?'Cambiar':'Añadir'} foto
      </label>
      ${n.img?'<button class="btn-cancel" onclick="removeEditNotePhoto()">Quitar foto</button>':''}
    </div>
    <div class="modal-btns">
      <button class="btn-danger" onclick="deleteEditNote()">🗑 Borrar</button>
      <div class="btn-cancel" onclick="closeEditNoteModal()">Cancelar</div>
      <div class="btn-ok" onclick="saveEditNote()">Guardar</div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) closeEditNoteModal(); };
  renderScheduleSelector('en-schedule-container', 'en', n.schedule || null);
}
function handleEditNotePhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1500000) { showToast('Foto demasiado grande (máx 1.5 MB)'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 800;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = h * maxDim / w; w = maxDim; }
        else { w = w * maxDim / h; h = maxDim; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      window._editNotePhotoData = dataUrl;
      const area = document.getElementById('en-photo-area');
      if (area) area.innerHTML = `<img class="modal-photo-preview" src="${dataUrl}">`;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function removeEditNotePhoto() {
  window._editNotePhotoData = null;
  const area = document.getElementById('en-photo-area');
  if (area) area.innerHTML = '';
}
function closeEditNoteModal() { const m = document.getElementById('edit-note-modal'); if (m) m.remove(); editNoteCtx = null; window._editNotePhotoData = null; }
function saveEditNote() {
  if (!editNoteCtx) return;
  const { finca, id } = editNoteCtx;
  const n = houseData[finca].notas.find(x => x.id === id);
  if (!n) return;
  const text = document.getElementById('en-text').value.trim();
  if (!text) { showToast('La nota no puede estar vacía'); return; }
  n.text = text;
  n.img = window._editNotePhotoData || null;
  n.schedule = readScheduleFromSelector('en');
  saveState();
  closeEditNoteModal();
  if (currentHouse === finca) renderHouse();
  refreshCals();
  showToast('✅ Actualizada');
}
function deleteEditNote() {
  if (!editNoteCtx) return;
  if (!confirm('¿Borrar esta nota?')) return;
  const { finca, id } = editNoteCtx;
  houseData[finca].notas = houseData[finca].notas.filter(x => x.id !== id);
  saveState();
  closeEditNoteModal();
  if (currentHouse === finca) renderHouse();
  refreshCals();
  showToast('🗑 Borrada');
}

function rerenderActive() {
  if (document.getElementById('view-tareas').style.display !== 'none') buildTareas();
  if (document.getElementById('view-casa').style.display !== 'none') renderHouse();
  if (document.getElementById('view-empleado').style.display !== 'none') renderEmpleado();
  if (document.getElementById('view-equipo').style.display !== 'none') buildEquipo();
  refreshCals();
}

// ===== MES =====
function buildMonth() {
  const vv = document.getElementById('view-mes'); vv.innerHTML = '';
  const now = new Date(new Date().getFullYear(), new Date().getMonth() + monthOff, 1);
  const hdr = document.createElement('div'); hdr.className = 'month-nav';
  hdr.innerHTML = `<button class="mnav-btn" onclick="monthOff--;buildMonth()">‹</button><div class="month-title">${MONTHS[now.getMonth()]} ${now.getFullYear()}</div><button class="mnav-btn" onclick="monthOff++;buildMonth()">›</button>`;
  vv.appendChild(hdr);
  const grid = document.createElement('div'); grid.className = 'month-grid';
  ['Lu','Ma','Mi','Ju','Vi','Sá','Do'].forEach(d => { const h = document.createElement('div'); h.className = 'day-hdr'; h.textContent = d; grid.appendChild(h); });
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7;
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const prev = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  for (let i = 0; i < startDow; i++) { const d = document.createElement('div'); d.className = 'month-day other-month'; d.innerHTML = `<div class="md-num">${prev - startDow + 1 + i}</div>`; grid.appendChild(d); }
  for (let day = 1; day <= dim; day++) {
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    const dow = (date.getDay() + 6) % 7;
    const weekend = dow >= 5;
    const td = isToday(date);
    const key = dk(date);
    const cell = document.createElement('div');
    cell.className = 'month-day' + (td ? ' today-day' : '') + (weekend ? ' weekend-day' : '');
    let html = `<div class="md-num${td?' today-num':''}">${day}</div>`;
    if (!weekend) {
      // Construir lista de fincas mostrando overrides aplicables
      const fincasUnique = new Set();
      for (let hi = 0; hi < 8; hi++) {
        const c = getCellContent(date, hi);
        if (c.type === 'finca') fincasUnique.add(c.value);
      }
      const uniq = [...fincasUnique];
      uniq.slice(0, 3).forEach(f => {
        let b = '';
        if (hasTasks(f)) b += `<span class="pip-t">!</span>`;
        if (hasNotes(f)) b += `<span class="pip-n">*</span>`;
        if (hasEstanciaEnFecha(f, date)) b += `<span class="pip-e">🏠</span>`;
        if (hasComprasPendientes(f)) b += `<span class="pip-c">🛒</span>`;
        html += `<div class="md-pip" style="background:${FCOL[f]};color:#333"><span style="flex:1;overflow:hidden;text-overflow:ellipsis">${escapeHtml(f)}</span>${b}</div>`;
      });
      if (uniq.length > 3) html += `<div style="font-size:8px;color:var(--text-tertiary)">+${uniq.length - 3}</div>`;
    } else {
      const wt = wkndTasks[key] || [];
      if (wt.length) {
        html += `<div class="md-wknd-task">${escapeHtml(wt[0].text)}</div>`;
        if (wt.length > 1) html += `<div style="font-size:7px;color:#5a8a50">+${wt.length - 1} más</div>`;
      } else {
        html += `<div class="md-wknd-add">+ tarea</div>`;
      }
    }
    if (fuelDays[key]) html += `<div style="font-size:9px;color:#BA7517">⛽</div>`;
    cell.innerHTML = html;
    cell.onclick = () => {
      if (weekend) openWkndModal(key, `${DLABELS[dow]} ${day} ${MS[date.getMonth()]}`);
      else { weekOff = Math.floor((date - wkBase) / (7 * 86400000)); switchMain('semana'); }
    };
    grid.appendChild(cell);
  }
  const total = startDow + dim; const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 0; i < rem; i++) { const d = document.createElement('div'); d.className = 'month-day other-month'; d.innerHTML = `<div class="md-num">${i+1}</div>`; grid.appendChild(d); }
  vv.appendChild(grid);
}

// ===== SEMANA — TODAS las casillas editables individualmente =====
function buildWeek() {
  const vv = document.getElementById('view-semana'); vv.innerHTML = '';
  const dates = getWeekDates(weekOff);
  const s = dates[0], e = dates[6];
  const title = s.getMonth() === e.getMonth() ? `${s.getDate()}–${e.getDate()} ${MS[e.getMonth()]} ${s.getFullYear()}` : `${s.getDate()} ${MS[s.getMonth()]} – ${e.getDate()} ${MS[e.getMonth()]}`;
  const wn = Math.floor((dates[4] - new Date(2026, 0, 2)) / (7 * 86400000));
  if (wn % 2 === 0) { const r = document.createElement('div'); r.className = 'reminder'; r.innerHTML = `🔧 <strong>Este viernes:</strong> limpiar herramientas y furgoneta`; vv.appendChild(r); }
  const wnr = document.createElement('div'); wnr.className = 'week-nav-row';
  wnr.innerHTML = `<div style="display:flex;align-items:center;gap:7px"><button class="mnav-btn" onclick="weekOff--;buildWeek()">‹</button><div class="week-title">Semana ${title}</div><button class="mnav-btn" onclick="weekOff++;buildWeek()">›</button></div><div style="font-size:10px;color:var(--text-tertiary)">toca para editar</div>`;
  vv.appendChild(wnr);
  const wrap = document.createElement('div'); wrap.className = 'cal-wrap';
  const grid = document.createElement('div'); grid.className = 'cal-grid';
  grid.appendChild(document.createElement('div'));
  dates.forEach((d, i) => {
    const h = document.createElement('div');
    h.className = 'chdr' + (isToday(d) ? ' today-c' : '') + (isWE(d) ? ' weekend-c' : '');
    h.innerHTML = `<div class="chdr-day">${DLABELS[i]}</div><div class="chdr-date">${d.getDate()}/${d.getMonth()+1}</div>`;
    grid.appendChild(h);
  });
  HOURS.forEach((hr, hi) => {
    const ts = document.createElement('div'); ts.className = 'tslot'; ts.textContent = hr; grid.appendChild(ts);
    DKEYS.forEach((day, di) => {
      const date = dates[di];
      const cell = document.createElement('div');
      const content = getCellContent(date, hi);
      // Todas las casillas L-D se comportan igual
      if (content.type === 'finca') {
        const finca = content.value;
        cell.className = 'ccell ' + (FCLS[finca] || 'c-libre');
        const tasks = hasTasksInCell(finca, date, hi), notes = hasNotesInCell(finca, date, hi);
        const hasCom = hasComprasPendientes(finca);
        const hasEst = hasEstanciaEnFecha(finca, date);
        let inner = `<div class="cell-name">${escapeHtml(finca)}</div>`;
        const badges = [];
        if (tasks) badges.push(`<div class="cb-t">!</div>`);
        if (notes) badges.push(`<div class="cb-n">*</div>`);
        if (hasEst) badges.push(`<div class="cb-e">🏠</div>`);
        if (hasCom) badges.push(`<div class="cb-c">🛒</div>`);
        if (badges.length) inner += `<div class="cell-badges">${badges.join('')}</div>`;
        cell.innerHTML = inner;
        let pressTimer;
        cell.addEventListener('touchstart', e => {
          pressTimer = setTimeout(() => { pressTimer = 'fired'; openCellModal(date, hi); }, 500);
        });
        cell.addEventListener('touchend', e => {
          if (pressTimer === 'fired') { pressTimer = null; return; }
          clearTimeout(pressTimer); pressTimer = null;
          openHouse(finca, date);
        });
        cell.addEventListener('click', e => {
          if (e.detail === 2) openCellModal(date, hi);
        });
        cell.style.position = 'relative';
        const editBtn = document.createElement('div');
        editBtn.textContent = '✎';
        editBtn.style.cssText = 'position:absolute;top:0;left:1px;font-size:9px;opacity:.5;cursor:pointer;padding:1px 3px;line-height:1';
        editBtn.onclick = (ev) => { ev.stopPropagation(); openCellModal(date, hi); };
        cell.appendChild(editBtn);
      } else if (content.type === 'custom') {
        cell.className = 'ccell c-custom';
        cell.innerHTML = `<div class="cell-name">${escapeHtml(content.value)}</div>`;
        cell.onclick = () => openCellModal(date, hi);
      } else {
        // libre o wknd vacío
        cell.className = 'ccell c-libre';
        cell.innerHTML = `<div class="cell-name" style="opacity:.5">+ editar</div>`;
        cell.onclick = () => openCellModal(date, hi);
      }
      grid.appendChild(cell);
    });
  });
  wrap.appendChild(grid); vv.appendChild(wrap);

  // ===== SLIDER HORIZONTAL para mover el calendario de L a D =====
  // Permite ver sábado/domingo sin tocar las casillas
  const sliderBox = document.createElement('div');
  sliderBox.className = 'day-slider-box';
  sliderBox.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;font-size:10px;color:var(--text-tertiary);margin-bottom:3px">
      <span>← Lun</span>
      <span>Dom →</span>
    </div>
    <input type="range" id="day-slider" min="0" max="100" value="0" step="1" class="day-slider">`;
  vv.appendChild(sliderBox);
  const slider = document.getElementById('day-slider');
  slider.addEventListener('input', e => {
    const pct = parseInt(e.target.value, 10) / 100;
    const maxScroll = wrap.scrollWidth - wrap.clientWidth;
    wrap.scrollLeft = maxScroll * pct;
  });
  // Si el usuario hace scroll directamente, sincronizar el slider
  wrap.addEventListener('scroll', () => {
    const maxScroll = wrap.scrollWidth - wrap.clientWidth;
    if (maxScroll <= 0) return;
    const pct = Math.round((wrap.scrollLeft / maxScroll) * 100);
    if (slider.value != pct) slider.value = pct;
  });
}

// ===== EQUIPO (con Combustible dentro) =====
function buildEquipo() {
  const vv = document.getElementById('view-equipo'); vv.innerHTML = '';
  const lbl1 = document.createElement('div'); lbl1.className = 'sec-lbl'; lbl1.textContent = '👥 Trabajadores'; lbl1.style.marginTop = '0';
  vv.appendChild(lbl1);
  EMPLEADOS.forEach(e => {
    const el = document.createElement('div'); el.className = 'emp-card';
    el.innerHTML = `<div class="emp-av">${e.init}</div><div style="flex:1"><div class="emp-name">${escapeHtml(e.name)}</div></div><div class="emp-dot ${e.active?'dot-on':'dot-off'}"></div>`;
    el.onclick = () => openEmpleado(e.name);
    vv.appendChild(el);
  });

  // Combustible como tarjeta clicable
  const lbl2 = document.createElement('div'); lbl2.className = 'sec-lbl'; lbl2.textContent = '⛽ Combustible';
  vv.appendChild(lbl2);

  // Calcular total del mes actual
  const now = new Date();
  const Y = now.getFullYear(), M = now.getMonth();
  let totalMes = 0, countMes = 0;
  Object.entries(fuelDays).forEach(([key, val]) => {
    const d = new Date(key);
    if (d.getFullYear() === Y && d.getMonth() === M && val) {
      const amount = typeof val === 'object' ? (val.amount || 0) : 0;
      totalMes += amount;
      countMes++;
    }
  });

  const card = document.createElement('div');
  card.className = 'emp-card';
  card.innerHTML = `<div class="emp-av" style="background:#fff1cc;color:#7a4f10">⛽</div>
    <div style="flex:1">
      <div class="emp-name">Combustible</div>
      <div class="emp-zone">${MONTHS[M]} · ${countMes} repostaje${countMes!==1?'s':''} · <strong>${totalMes.toFixed(2)} €</strong></div>
    </div>
    <div style="color:var(--text-tertiary);font-size:14px">›</div>`;
  card.onclick = () => openCombustible();
  vv.appendChild(card);
}

// ===== VISTA COMBUSTIBLE =====
let fuelEntryDate = null;
function openCombustible() {
  ['semana','mes','tareas','equipo'].forEach(v => document.getElementById('view-'+v).style.display = 'none');
  document.getElementById('view-casa').style.display = 'none';
  document.getElementById('view-empleado').style.display = 'none';
  document.getElementById('nav-tabs').style.display = 'none';
  document.getElementById('view-combustible').style.display = 'block';
  renderCombustible();
}
function renderCombustible() {
  const vv = document.getElementById('view-combustible'); vv.innerHTML = '';
  const back = document.createElement('div'); back.className = 'hv-back'; back.innerHTML = `‹ Volver`;
  back.onclick = () => { document.getElementById('view-combustible').style.display = 'none'; document.getElementById('nav-tabs').style.display = 'flex'; document.getElementById('view-equipo').style.display = 'block'; buildEquipo(); };
  vv.appendChild(back);

  // Header
  const hdr = document.createElement('div'); hdr.className = 'empd-header';
  hdr.innerHTML = `<div class="empd-av" style="background:#fff1cc;color:#7a4f10;font-size:22px">⛽</div><div style="flex:1"><div class="empd-name">Combustible</div><div class="empd-zone">Toca un día para registrar repostaje</div></div>`;
  vv.appendChild(hdr);

  // Calendario mensual
  const now = new Date(new Date().getFullYear(), new Date().getMonth() + fuelMonthOff, 1);
  const Y = now.getFullYear(), M = now.getMonth();
  const navHdr = document.createElement('div'); navHdr.className = 'fuel-month-nav';
  navHdr.innerHTML = `<button class="mnav-btn" onclick="fuelMonthOff--;renderCombustible()">‹</button><div style="font-size:13px;font-weight:500">${MONTHS[M]} ${Y}</div><button class="mnav-btn" onclick="fuelMonthOff++;renderCombustible()">›</button>`;
  vv.appendChild(navHdr);

  const grid = document.createElement('div'); grid.className = 'fuel-month-grid';
  ['Lu','Ma','Mi','Ju','Vi','Sá','Do'].forEach(d => { const h = document.createElement('div'); h.className = 'fuel-day-hdr'; h.textContent = d; grid.appendChild(h); });
  const first = new Date(Y, M, 1);
  const startDow = (first.getDay() + 6) % 7;
  const dim = new Date(Y, M + 1, 0).getDate();
  for (let i = 0; i < startDow; i++) { const d = document.createElement('div'); d.className = 'fuel-day-cell other'; grid.appendChild(d); }
  let totalMes = 0, countMes = 0, totalGasoil = 0, totalGasolina = 0;
  const byVehicle = {}; // {vehicleName: total}
  for (let day = 1; day <= dim; day++) {
    const date = new Date(Y, M, day);
    const key = dk(date);
    const val = fuelDays[key];
    const isFueled = !!val;
    const cell = document.createElement('div'); cell.className = 'fuel-day-cell' + (isFueled ? ' fueled' : '');
    let inner = `<div class="fuel-day-num">${day}</div>`;
    if (isFueled) {
      const amount = (typeof val === 'object') ? val.amount : 0;
      const type = (typeof val === 'object') ? val.type : 'gasoil';
      const vehicle = (typeof val === 'object' && val.vehicle) ? val.vehicle : '';
      inner += `<div style="font-size:11px;font-weight:600;color:#7a4f10;line-height:1">${amount}€</div>`;
      if (vehicle) {
        // Abreviar vehículo
        const abbr = vehicle.replace('Yamaha ', 'Y.').replace('Transporter','Trans.').replace('Crafter','Crafter');
        inner += `<div style="font-size:7px;color:var(--text-tertiary);line-height:1.1;text-align:center;width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(abbr)}</div>`;
      } else {
        inner += `<div style="font-size:8px;color:var(--text-tertiary);text-transform:uppercase;line-height:1.2">${type.slice(0,3)}</div>`;
      }
      totalMes += amount; countMes++;
      if (type === 'gasoil') totalGasoil += amount; else totalGasolina += amount;
      if (vehicle) byVehicle[vehicle] = (byVehicle[vehicle] || 0) + amount;
    }
    cell.innerHTML = inner;
    cell.onclick = () => openFuelEntryModal(date);
    grid.appendChild(cell);
  }
  const total = startDow + dim; const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 0; i < rem; i++) { const d = document.createElement('div'); d.className = 'fuel-day-cell other'; grid.appendChild(d); }
  vv.appendChild(grid);

  // Resumen del mes
  const sum = document.createElement('div'); sum.className = 'hr-summary';
  let vehicleRows = '';
  Object.entries(byVehicle).forEach(([v, t]) => {
    const fuel = VEHICLES[v] === 'gasoil' ? '🚐' : '🏍';
    vehicleRows += `<div class="hr-sum-row"><span>${fuel} ${escapeHtml(v)}</span><span>${t.toFixed(2)} €</span></div>`;
  });
  sum.innerHTML = `<div class="hr-sum-title">Resumen ${MONTHS[M]} ${Y}</div>
    <div class="hr-sum-row"><span>Repostajes</span><span>${countMes}</span></div>
    ${vehicleRows}
    <div class="hr-sum-row"><span style="color:var(--text-tertiary);font-size:11px">Gasoil total</span><span style="color:var(--text-tertiary);font-size:11px">${totalGasoil.toFixed(2)} €</span></div>
    <div class="hr-sum-row"><span style="color:var(--text-tertiary);font-size:11px">Gasolina total</span><span style="color:var(--text-tertiary);font-size:11px">${totalGasolina.toFixed(2)} €</span></div>
    <div class="hr-sum-row total"><span>Total mes</span><span>${totalMes.toFixed(2)} €</span></div>`;
  vv.appendChild(sum);
}
// Vehículos y sus tipos de combustible
const VEHICLES_ALL = {
  'Transporter': 'gasoil',
  'Crafter':     'gasoil',
  'Yamaha WR':   'gasolina',
  'Yamaha FX':   'gasolina',  // moto de agua
  'Otro':        'gasoil'      // por defecto gasoil; el usuario elige tipo si es Otro
};
// Compatibilidad — el modal sigue usando VEHICLES
const VEHICLES = VEHICLES_ALL;

function openFuelEntryModal(date) {
  fuelEntryDate = date;
  const key = dk(date);
  const existing = fuelDays[key];
  const curAmount = (existing && typeof existing === 'object') ? existing.amount : 50;
  const allowed = allowedVehicles();
  let curVehicle = (existing && typeof existing === 'object' && existing.vehicle) ? existing.vehicle : allowed[0];
  // Si el usuario actual no tiene permiso para ese vehículo, ajustar
  if (!allowed.includes(curVehicle)) curVehicle = allowed[0];
  const curType = (existing && typeof existing === 'object' && existing.type) ? existing.type : (VEHICLES_ALL[curVehicle] || 'gasoil');
  const dow = (date.getDay() + 6) % 7;
  const label = `${DLABELS[dow]} ${date.getDate()} ${MS[date.getMonth()]}`;

  const old = document.getElementById('fuel-modal'); if (old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'fuel-modal';

  // Solo los vehículos que el usuario puede elegir
  const vehicleBtns = allowed.map(v => {
    const t = VEHICLES_ALL[v];
    const isOn = v === curVehicle;
    let icon = '🚐';
    if (v === 'Yamaha WR') icon = '🏍';
    else if (v === 'Yamaha FX') icon = '🚤';
    else if (v === 'Otro') icon = '⛽';
    return `<div class="emp-pill${isOn?' on':''}" data-vehicle="${escapeHtml(v)}" onclick="setFuelVehicle('${escapeHtml(v)}')">${icon} ${escapeHtml(v)}</div>`;
  }).join('');

  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">⛽ ${escapeHtml(label)}</div>
    <div class="field-label">Vehículo</div>
    <div class="emp-pills" style="margin-bottom:6px">${vehicleBtns}</div>
    <div id="fuel-type-info" style="font-size:11px;color:var(--text-secondary);margin-bottom:10px"></div>
    <div id="fuel-type-picker" style="display:none;margin-bottom:10px">
      <div class="field-label">Tipo de combustible</div>
      <div class="emp-pills">
        <div class="emp-pill" id="ft-gasoil" onclick="setOtroFuelType('gasoil')">⛽ Gasoil</div>
        <div class="emp-pill" id="ft-gasolina" onclick="setOtroFuelType('gasolina')">⛽ Gasolina</div>
      </div>
    </div>
    <div class="field-label">Cantidad (€)</div>
    <input id="fuel-amount" type="number" inputmode="decimal" step="0.01" value="${curAmount}" placeholder="50">
    <div class="quick-hours" style="margin-bottom:0">
      <button class="q-hr-btn" onclick="setFuelAmount(20)">20€</button>
      <button class="q-hr-btn" onclick="setFuelAmount(30)">30€</button>
      <button class="q-hr-btn" onclick="setFuelAmount(40)">40€</button>
      <button class="q-hr-btn" onclick="setFuelAmount(50)">50€</button>
      <button class="q-hr-btn" onclick="setFuelAmount(60)">60€</button>
      <button class="q-hr-btn" onclick="setFuelAmount(80)">80€</button>
    </div>
    <div style="height:10px"></div>
    <div class="modal-btns">
      ${existing ? `<button class="btn-danger" onclick="deleteFuelEntry()">🗑 Borrar</button>` : ''}
      <div class="btn-cancel" onclick="closeFuelModal()">Cancelar</div>
      <div class="btn-ok" onclick="saveFuelEntry()">Guardar</div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) closeFuelModal(); };
  window._fuelVehicle = curVehicle;
  window._fuelTypeOtro = curType;
  updateFuelTypeUI();
  setTimeout(() => { const a = document.getElementById('fuel-amount'); if (a) a.select(); }, 60);
}
function updateFuelTypeUI() {
  const v = window._fuelVehicle;
  const isOtro = v === 'Otro';
  document.getElementById('fuel-type-picker').style.display = isOtro ? 'block' : 'none';
  if (isOtro) {
    const t = window._fuelTypeOtro || 'gasoil';
    document.getElementById('ft-gasoil').classList.toggle('on', t === 'gasoil');
    document.getElementById('ft-gasolina').classList.toggle('on', t === 'gasolina');
    document.getElementById('fuel-type-info').innerHTML = `Combustible: <strong>${t === 'gasoil' ? '⛽ Gasoil' : '⛽ Gasolina'}</strong>`;
  } else {
    const type = VEHICLES_ALL[v];
    document.getElementById('fuel-type-info').innerHTML = `Combustible: <strong>${type === 'gasoil' ? '⛽ Gasoil' : '⛽ Gasolina'}</strong> (automático según vehículo)`;
  }
}
function setFuelVehicle(v) {
  window._fuelVehicle = v;
  document.querySelectorAll('#fuel-modal [data-vehicle]').forEach(p => p.classList.toggle('on', p.dataset.vehicle === v));
  updateFuelTypeUI();
}
function setOtroFuelType(t) {
  window._fuelTypeOtro = t;
  updateFuelTypeUI();
}
function setFuelAmount(n) { const a = document.getElementById('fuel-amount'); if (a) a.value = n; }
function closeFuelModal() { const m = document.getElementById('fuel-modal'); if (m) m.remove(); fuelEntryDate = null; }
function saveFuelEntry() {
  const amount = parseFloat(document.getElementById('fuel-amount').value);
  if (isNaN(amount) || amount <= 0) { showToast('Cantidad no válida'); return; }
  const vehicle = window._fuelVehicle || 'Crafter';
  // Tipo: si es Otro usa la selección manual, si no se deduce del vehículo
  const type = vehicle === 'Otro' ? (window._fuelTypeOtro || 'gasoil') : VEHICLES_ALL[vehicle];
  const key = dk(fuelEntryDate);
  fuelDays[key] = { amount, type, vehicle };
  saveState();
  closeFuelModal();
  renderCombustible();
  showToast('⛽ Repostaje guardado');
}
function deleteFuelEntry() {
  if (!confirm('¿Borrar este repostaje?')) return;
  const key = dk(fuelEntryDate);
  delete fuelDays[key];
  saveState();
  closeFuelModal();
  renderCombustible();
  showToast('🗑 Borrado');
}

// ===== DETALLE EMPLEADO =====
function openEmpleado(name) {
  currentEmp = name; empTab = 'tareas'; empMonthOff = 0; empWeekOff = 0; empCalView = 'mes';
  ['semana','mes','tareas','equipo'].forEach(v => document.getElementById('view-'+v).style.display = 'none');
  document.getElementById('view-casa').style.display = 'none';
  document.getElementById('nav-tabs').style.display = 'none';
  document.getElementById('view-empleado').style.display = 'block';
  renderEmpleado();
}
function renderEmpleado() {
  const vv = document.getElementById('view-empleado'); vv.innerHTML = '';
  const emp = EMPLEADOS.find(e => e.name === currentEmp);
  if (!emp) { switchMain('equipo'); return; }
  const back = document.createElement('div'); back.className = 'hv-back'; back.innerHTML = `‹ Volver`;
  back.onclick = () => { document.getElementById('view-empleado').style.display = 'none'; document.getElementById('nav-tabs').style.display = 'flex'; document.getElementById('view-equipo').style.display = 'block'; buildEquipo(); };
  vv.appendChild(back);
  const hdr = document.createElement('div'); hdr.className = 'empd-header';
  hdr.innerHTML = `<div class="empd-av">${emp.init}</div><div style="flex:1"><div class="empd-name">${escapeHtml(emp.name)}</div></div><div class="emp-dot ${emp.active?'dot-on':'dot-off'}"></div>`;
  vv.appendChild(hdr);
  // Solo horas — sin pestañas
  renderEmpHoras(vv, emp.name);
}
function toggleEmpT(f, id) { const t = houseData[f].tareas.find(x => x.id === id); if (t) { t.done = !t.done; saveState(); renderEmpleado(); } }

function renderEmpHoras(vv, empName) {
  const tog = document.createElement('div'); tog.className = 'hr-view-toggle';
  [{k:'mes',l:'📅 Mes'},{k:'semana',l:'🗓️ Semana'}].forEach(({k,l}) => {
    const b = document.createElement('div'); b.className = 'hr-view-btn' + (empCalView===k?' active':'');
    b.textContent = l;
    b.onclick = () => { empCalView = k; renderEmpleado(); };
    tog.appendChild(b);
  });
  vv.appendChild(tog);
  if (empCalView === 'mes') renderEmpHorasMes(vv, empName);
  else renderEmpHorasSemana(vv, empName);

  const now = empCalView === 'mes' ? new Date(new Date().getFullYear(), new Date().getMonth() + empMonthOff, 1) : (function(){ const d = new Date(wkBase); d.setDate(d.getDate() + empWeekOff*7 + 3); return d; })();
  const Y = now.getFullYear(), M = now.getMonth();
  const labDays = laborableDays(Y, M);
  const baseHrs = labDays * 8;
  const net = netHoursForMonth(empName, Y, M);
  const total = baseHrs + net;
  const sum = document.createElement('div'); sum.className = 'hr-summary';
  sum.innerHTML = `<div class="hr-sum-title">Resumen ${MONTHS[M]} ${Y}</div>
    <div class="hr-sum-row"><span>Días laborables (L–V)</span><span>${labDays} días</span></div>
    <div class="hr-sum-row"><span>Jornada base</span><span>${labDays} × 8 h = ${baseHrs} h</span></div>
    <div class="hr-sum-row"><span>Ajuste extras / menos</span><span class="hr-sum-val ${net>0?'plus':(net<0?'minus':'')}">${net>0?'+':''}${net} h</span></div>
    <div class="hr-sum-row total"><span>Total del mes</span><span>${total} h</span></div>`;
  vv.appendChild(sum);
}
function renderEmpHorasMes(vv, empName) {
  const now = new Date(new Date().getFullYear(), new Date().getMonth() + empMonthOff, 1);
  const hdr = document.createElement('div'); hdr.className = 'hr-month-nav';
  hdr.innerHTML = `<button class="mnav-btn" onclick="empMonthOff--;renderEmpleado()">‹</button><div style="font-size:13px;font-weight:500">${MONTHS[now.getMonth()]} ${now.getFullYear()}</div><button class="mnav-btn" onclick="empMonthOff++;renderEmpleado()">›</button>`;
  vv.appendChild(hdr);
  const grid = document.createElement('div'); grid.className = 'hr-month-grid';
  ['Lu','Ma','Mi','Ju','Vi','Sá','Do'].forEach(d => { const h = document.createElement('div'); h.className = 'fuel-day-hdr'; h.textContent = d; grid.appendChild(h); });
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7;
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  for (let i = 0; i < startDow; i++) { const d = document.createElement('div'); d.className = 'hr-day-cell other'; grid.appendChild(d); }
  for (let day = 1; day <= dim; day++) {
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    const dow = (date.getDay() + 6) % 7;
    const weekend = dow >= 5;
    const key = dk(date);
    const val = getHourValue(empName, key);
    const note = getHourNote(empName, key);
    const cell = document.createElement('div'); cell.className = 'hr-day-cell' + (weekend ? ' weekend' : '');
    let valHtml = '';
    if (val) {
      const isPlus = val.startsWith('+');
      valHtml = `<div class="hr-day-val ${isPlus?'plus':'minus'}">${val}</div>`;
      if (note) valHtml += `<div class="hr-day-comment" title="${escapeHtml(note)}">${escapeHtml(note)}</div>`;
    }
    cell.innerHTML = `<div class="hr-day-num">${day}</div>${valHtml}`;
    cell.onclick = () => openHoursModal(empName, key, `${DLABELS[dow]} ${day} ${MS[date.getMonth()]}`);
    grid.appendChild(cell);
  }
  const total = startDow + dim; const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 0; i < rem; i++) { const d = document.createElement('div'); d.className = 'hr-day-cell other'; grid.appendChild(d); }
  vv.appendChild(grid);
}
function renderEmpHorasSemana(vv, empName) {
  const dates = getWeekDates(empWeekOff);
  const s = dates[0], e = dates[6];
  const title = s.getMonth() === e.getMonth() ? `${s.getDate()}–${e.getDate()} ${MS[e.getMonth()]}` : `${s.getDate()} ${MS[s.getMonth()]} – ${e.getDate()} ${MS[e.getMonth()]}`;
  const hdr = document.createElement('div'); hdr.className = 'hr-month-nav';
  hdr.innerHTML = `<button class="mnav-btn" onclick="empWeekOff--;renderEmpleado()">‹</button><div style="font-size:13px;font-weight:500">Semana ${title}</div><button class="mnav-btn" onclick="empWeekOff++;renderEmpleado()">›</button>`;
  vv.appendChild(hdr);
  const grid = document.createElement('div'); grid.className = 'hr-week-grid';
  dates.forEach((d, i) => {
    const weekend = i >= 5;
    const key = dk(d);
    const val = getHourValue(empName, key);
    const note = getHourNote(empName, key);
    const cell = document.createElement('div'); cell.className = 'hr-week-day' + (weekend ? ' weekend' : '') + (isToday(d) ? ' today' : '');
    let valHtml = '';
    if (val) {
      const isPlus = val.startsWith('+');
      valHtml = `<div class="hr-wd-val ${isPlus?'plus':'minus'}">${val}</div>`;
      if (note) valHtml += `<div class="hr-wd-comment">${escapeHtml(note)}</div>`;
    }
    else { valHtml = `<div class="hr-wd-empty">+</div>`; }
    cell.innerHTML = `<div><div class="hr-wd-label">${DLABELS[i].slice(0,3)}</div><div class="hr-wd-date">${d.getDate()}/${d.getMonth()+1}</div></div>${valHtml}`;
    cell.onclick = () => openHoursModal(empName, key, `${DLABELS[i]} ${d.getDate()} ${MS[d.getMonth()]}`);
    grid.appendChild(cell);
  });
  vv.appendChild(grid);
}

// ===== TAREAS — SOLO tareas (sin horas) =====
function buildTareas() {
  const vv = document.getElementById('view-tareas'); vv.innerHTML = '';
  const mr = document.createElement('div'); mr.className = 'mode-row';
  [{k:'lista',l:'📋 Lista'},{k:'finca',l:'🏠 Por finca'},{k:'persona',l:'👤 Por persona'}].forEach(({k,l}) => {
    const b = document.createElement('div'); b.className = 'mode-btn' + (tareasMode===k?' active':'');
    b.textContent = l;
    b.onclick = () => { tareasMode = k; buildTareas(); };
    mr.appendChild(b);
  });
  vv.appendChild(mr);
  if (tareasMode === 'finca') return buildTareasPorFinca(vv);
  if (tareasMode === 'persona') return buildTareasPorPersona(vv);
  buildTareasLista(vv);
}
function buildTareasLista(vv) {
  if (selectMode && selectedTasks.size > 0) {
    const bar = document.createElement('div'); bar.className = 'bulk-bar';
    bar.innerHTML = `<span><strong>${selectedTasks.size}</strong> seleccionada${selectedTasks.size>1?'s':''}</span><button class="bulk-btn" onclick="bulkDone()">✓ Hechas</button><button class="bulk-btn" onclick="bulkDelete()">✕ Eliminar</button><button class="bulk-btn" style="margin-left:auto" onclick="selectMode=false;selectedTasks.clear();buildTareas()">Cancelar</button>`;
    vv.appendChild(bar);
  }
  const fr = document.createElement('div'); fr.className = 'filter-row';
  [['all','Todas'],['pending','Pendientes'],['done','Hechas']].forEach(([k,l]) => {
    const b = document.createElement('div'); b.className = 'filter-btn' + (taskFilter===k?' active':''); b.textContent = l;
    b.onclick = () => { taskFilter = k; buildTareas(); }; fr.appendChild(b);
  });
  const selBtn = document.createElement('div'); selBtn.className = 'sel-toggle' + (selectMode?' on':'');
  selBtn.textContent = selectMode ? '✓ Seleccionando' : 'Seleccionar';
  selBtn.onclick = () => { selectMode = !selectMode; if (!selectMode) selectedTasks.clear(); buildTareas(); };
  fr.appendChild(selBtn); vv.appendChild(fr);
  let any = false;
  // Incluir fincas normales + bucket libre
  const allBuckets = [...FINCAS, ...(houseData['__libre__'] ? ['__libre__'] : [])];
  allBuckets.forEach(f => {
    if (!houseData[f]) return;
    houseData[f].tareas.forEach(t => {
      if (taskFilter === 'pending' && t.done) return;
      if (taskFilter === 'done' && !t.done) return;
      any = true;
      const tid = `${f}::${t.id}`; const isSel = selectedTasks.has(tid);
      const el = document.createElement('div'); el.className = 'task-global-item' + (isSel?' sel':'');
      if (selectMode) { el.onclick = () => { if (selectedTasks.has(tid)) selectedTasks.delete(tid); else selectedTasks.add(tid); buildTareas(); }; el.style.cursor = 'pointer'; }
      const selBoxHtml = `<div class="sel-box${isSel?' checked':''}">${isSel?'✓':''}</div>`;
      const checkHtml = `<div class="tcheck${t.done?' done':''}" onclick="event.stopPropagation();toggleGT('${f}',${t.id})">${t.done?'✓':''}</div>`;
      const assigns = (t.assigns || []);
      const aHtml = assigns.length ? `<span>👤 ${escapeHtml(assigns.join(', '))}</span>` : '';
      const tinfoClick = selectMode ? '' : `onclick="openEditTaskModal('${f}',${t.id})"`;
      const photoIcon = t.img ? '<span style="margin-left:4px">📷</span>' : '';
      const thumbHtml = t.img ? `<img src="${t.img}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;flex-shrink:0;cursor:pointer" onclick="event.stopPropagation();openPhotoViewer('${t.img}')">` : '';
      const locationLabel = f === '__libre__' ? (t.libreLocation || 'Sin ubicación') : f;
      const locationColor = f === '__libre__' ? '#aaa' : FCOL[f];
      el.innerHTML = `${selectMode?selBoxHtml:checkHtml}${thumbHtml}<div class="tinfo" ${tinfoClick}><div class="ttitle${t.done?' done':''}">${escapeHtml(t.title)}${photoIcon}</div><div class="tmeta"><span style="display:flex;align-items:center;gap:2px"><div style="width:7px;height:7px;border-radius:2px;background:${locationColor}"></div>${escapeHtml(locationLabel)}</span>${aHtml}</div></div><span class="tbadge ${t.prio==='urgent'?'b-u':'b-n'}">${t.prio==='urgent'?'Urgente':'Normal'}</span>`;
      vv.appendChild(el);
    });
  });
  if (!any) { const el = document.createElement('div'); el.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:8px 0'; el.textContent = 'Sin tareas en esta vista.'; vv.appendChild(el); }
  const box = document.createElement('div'); box.className = 'add-task-box'; box.id = 'add-task-form'; box.style.display = 'none';
  box.innerHTML = `<div class="field-label">Nueva tarea</div><input id="gt-title" placeholder="Descripción..."><div class="assign-row"><span class="assign-label">Asignar a:</span><div class="emp-pills" id="gt-pills"></div></div><div class="add-task-row"><select id="gt-finca"><option value="">— Finca —</option>${FINCAS.map(f=>`<option>${f}</option>`).join('')}</select><div class="emp-pill" id="gt-libre-pill" onclick="toggleGtLibre()" style="white-space:nowrap">✏️ Libre</div><select id="gt-prio"><option value="normal">Normal</option><option value="urgent">Urgente</option></select><button class="btn-send" onclick="addGlobalTask()">Enviar →</button></div><div id="gt-libre-row" style="display:none;margin-top:6px"><input id="gt-libre-text" placeholder="Escribe dónde es el trabajo..."></div>`;

  const toggleBtn = document.createElement('div');
  toggleBtn.className = 'add-toggle-btn'; toggleBtn.id = 'add-task-toggle-btn';
  toggleBtn.textContent = '+ Nueva tarea';
  toggleBtn.onclick = toggleAddTaskForm;
  vv.appendChild(toggleBtn);
  vv.appendChild(box);
  renderEmpPills('gt-pills', newTaskAssigns);
  window._gtLibreActive = false;
}
function buildTareasPorFinca(vv) {
  let any = false;
  FINCAS.forEach(f => {
    const p = houseData[f].tareas.filter(t => !t.done);
    const all = houseData[f].tareas.length;
    if (!all) return;
    any = true;
    const el = document.createElement('div'); el.className = 'group-card';
    el.innerHTML = `<div style="width:10px;height:36px;border-radius:3px;background:${FCOL[f]};flex-shrink:0"></div><div style="flex:1"><div style="font-size:13px;font-weight:500">${escapeHtml(f)}</div><div style="font-size:10px;color:var(--text-tertiary)">${all} tarea${all!==1?'s':''} totales</div></div>${p.length?`<span class="notif-b">${p.length} pendiente${p.length>1?'s':''}</span>`:'<span style="font-size:10px;color:var(--text-tertiary)">✓ todo hecho</span>'}`;
    el.onclick = () => openHouse(f);
    vv.appendChild(el);
  });
  if (!any) { const el = document.createElement('div'); el.style.cssText='font-size:12px;color:var(--text-tertiary);padding:12px 0;text-align:center'; el.textContent = 'No hay tareas todavía.'; vv.appendChild(el); }
}
function buildTareasPorPersona(vv) {
  EMPLEADOS.forEach(e => {
    let pending = 0, done = 0;
    FINCAS.forEach(f => {
      houseData[f].tareas.forEach(t => {
        if ((t.assigns || []).includes(e.name)) { if (t.done) done++; else pending++; }
      });
    });
    if (pending === 0 && done === 0) return;
    const el = document.createElement('div'); el.className = 'group-card';
    el.innerHTML = `<div class="emp-av" style="width:32px;height:32px;font-size:11px">${e.init}</div><div style="flex:1"><div style="font-size:13px;font-weight:500">${escapeHtml(e.name)}</div><div style="font-size:10px;color:var(--text-tertiary)">${done} hecha${done!==1?'s':''}</div></div>${pending?`<span class="notif-b">${pending} pendiente${pending>1?'s':''}</span>`:'<span style="font-size:10px;color:var(--text-tertiary)">✓ al día</span>'}`;
    el.onclick = () => openEmpleado(e.name);
    vv.appendChild(el);
  });
}

function renderEmpPills(containerId, setRef) {
  const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
  EMP_NAMES.forEach(name => {
    const isOn = setRef.has(name);
    const p = document.createElement('div'); p.className = 'emp-pill' + (isOn?' on':'');
    p.innerHTML = `${isOn?'✓ ':''}${name}`;
    p.onclick = () => { if (setRef.has(name)) setRef.delete(name); else setRef.add(name); renderEmpPills(containerId, setRef); };
    c.appendChild(p);
  });
}
function toggleGT(f, id) {
  if (!houseData[f] && f === '__libre__' && houseData['__libre__']) f = '__libre__';
  const t = houseData[f] && houseData[f].tareas.find(x => x.id === id);
  if (t) { t.done = !t.done; saveState(); buildTareas(); }
}
function bulkDone() {
  selectedTasks.forEach(tid => {
    const [f, idStr] = tid.split('::');
    const bucket = houseData[f] || (f === '__libre__' && houseData['__libre__']);
    const t = bucket && bucket.tareas.find(x => x.id === +idStr);
    if (t) t.done = true;
  });
  selectedTasks.clear(); selectMode = false; saveState(); buildTareas(); showToast('✅ Hechas');
}
function bulkDelete() {
  if (!confirm('¿Borrar las tareas seleccionadas?')) return;
  selectedTasks.forEach(tid => {
    const [f, idStr] = tid.split('::');
    if (houseData[f]) houseData[f].tareas = houseData[f].tareas.filter(x => x.id !== +idStr);
  });
  selectedTasks.clear(); selectMode = false; saveState(); buildTareas(); showToast('🗑 Eliminadas');
}
function toggleGtLibre() {
  window._gtLibreActive = !window._gtLibreActive;
  const pill = document.getElementById('gt-libre-pill');
  const row = document.getElementById('gt-libre-row');
  const sel = document.getElementById('gt-finca');
  if (pill) pill.classList.toggle('on', window._gtLibreActive);
  if (row) row.style.display = window._gtLibreActive ? 'block' : 'none';
  if (sel) sel.disabled = window._gtLibreActive;
  if (window._gtLibreActive && sel) sel.value = '';
}

function addGlobalTask() {
  const title = document.getElementById('gt-title').value.trim();
  const prio = document.getElementById('gt-prio').value;
  if (!title) { showToast('Escribe una tarea'); return; }
  const assigns = Array.from(newTaskAssigns);
  if (window._gtLibreActive) {
    const libreText = (document.getElementById('gt-libre-text').value || '').trim();
    if (!libreText) { showToast('Escribe la ubicación'); return; }
    if (!houseData['__libre__']) houseData['__libre__'] = { notas: [], tareas: [] };
    houseData['__libre__'].tareas.unshift({ id: nextId++, title, prio, done: false, assigns, libreLocation: libreText });
    newTaskAssigns.clear();
    saveState(); buildTareas();
    showToast(`✅ Añadida en "${libreText}"`);
  } else {
    const finca = document.getElementById('gt-finca').value;
    if (!finca) { showToast('Elige una finca o activa Libre'); return; }
    houseData[finca].tareas.unshift({ id: nextId++, title, prio, done: false, assigns });
    newTaskAssigns.clear();
    saveState(); buildTareas();
    showToast(`✅ Añadida en ${finca}`);
  }
}

// ===== DETALLE CASA =====
let currentHouseContextDate = null; // Fecha desde la que se abrió la finca

function openHouse(finca, contextDate) {
  currentHouse = finca; currentTab = 'tareas';
  currentHouseContextDate = contextDate || null;
  ['semana','mes','tareas','equipo'].forEach(v => document.getElementById('view-'+v).style.display = 'none');
  document.getElementById('view-empleado').style.display = 'none';
  document.getElementById('nav-tabs').style.display = 'none';
  document.getElementById('view-casa').style.display = 'block';
  renderHouse();
}
function renderHouse() {
  const vv = document.getElementById('view-casa'); vv.innerHTML = '';
  const f = currentHouse; const col = FCOL[f] || '#ccc';
  const back = document.createElement('div'); back.className = 'hv-back';
  back.innerHTML = `‹ Volver`;
  back.onclick = () => { document.getElementById('view-casa').style.display = 'none'; document.getElementById('nav-tabs').style.display = 'flex'; switchMain('semana'); };
  vv.appendChild(back);
  let slots = '';
  DKEYS.forEach((day, di) => { const hrs = []; BASE[day].forEach((s, hi) => { if (s === f) hrs.push(hi); }); if (hrs.length) { const t = `${HOURS[hrs[0]]}–${hrs[hrs.length-1]<7?HOURS[hrs[hrs.length-1]+1]:'16:00'}`; slots += `${DLABELS[di]} ${t}  `; } });
  const hdr2 = document.createElement('div'); hdr2.className = 'hv-header';
  hdr2.innerHTML = `<div class="hv-color" style="background:${col}"></div><div><div class="hv-name">${escapeHtml(f)}</div><div class="hv-time">${escapeHtml(slots.trim() || 'Sin horario fijo')}</div></div>`;
  vv.appendChild(hdr2);
  const tabs = document.createElement('div'); tabs.className = 'tabs2';
  [{k:'tareas',label:'✓ Tareas'},{k:'notas',label:'📝 Notas'}].forEach(({k,label}) => {
    const tab = document.createElement('div'); tab.className = 'tab2' + (currentTab===k?' active':'');
    const p = k==='tareas' ? houseData[f].tareas.filter(t=>!t.done).length : 0;
    tab.innerHTML = `${label}${p?` <span style="background:#FCEBEB;color:#A32D2D;font-size:9px;padding:1px 5px;border-radius:20px">${p}</span>`:''}`;
    tab.onclick = () => { currentTab = k; renderHouse(); }; tabs.appendChild(tab);
  });
  vv.appendChild(tabs);
  if (currentTab === 'notas') renderNotas(vv, f); else renderTareasFinca(vv, f);
}
function renderNotas(vv, f) {
  const notas = houseData[f].notas;
  if (!notas.length) { const el = document.createElement('div'); el.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:8px 0 10px'; el.textContent = 'Sin notas todavía.'; vv.appendChild(el); }
  notas.forEach(n => {
    const el = document.createElement('div'); el.className = 'nota-item';
    const imgHtml = n.img ? `<img class="nota-photo" src="${n.img}" alt="Foto" onclick="openPhotoViewer('${n.img}')">` : '';
    const sLabel = scheduleLabel(n.schedule);
    const sHtml = sLabel ? `<div style="font-size:10px;color:var(--green);margin-top:2px">${sLabel}</div>` : '';
    el.innerHTML = `<div style="flex:1;min-width:0">
        <div class="nota-text" onclick="openEditNoteModal('${f}',${n.id})">${escapeHtml(n.text)}</div>
        ${imgHtml}
        ${sHtml}
        <div class="nota-meta">🕐 ${escapeHtml(n.date)}</div>
      </div>
      <div class="nota-actions">
        <button class="edit-btn" onclick="openEditNoteModal('${f}',${n.id})">✎</button>
        <button class="del-btn" onclick="quickDeleteNote('${f}',${n.id})">×</button>
      </div>`;
    vv.appendChild(el);
  });
  const box = document.createElement('div'); box.className = 'add-box';
  box.innerHTML = `<div class="field-label">Nueva nota</div>
    <textarea id="nota-in" placeholder="Escribe en varias líneas..."></textarea>
    <div class="field-label">¿Cuándo?</div>
    <div id="new-nota-schedule-container"></div>
    <div id="nota-photo-preview" style="margin-top:6px"></div>
    <div class="box-btns">
      <label class="btn-foto-lbl">
        <input type="file" accept="image/*" class="file-input-hidden" id="nota-foto-input" onchange="handleNotaPhoto(event)">
        📷 Foto
      </label>
      <button class="btn-save" onclick="saveNota('${f}')">Guardar</button>
    </div>`;
  vv.appendChild(box);
  renderScheduleSelector('new-nota-schedule-container', 'nn', null);
  window._notaPhotoData = null;
}
function handleNotaPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  // Limitar a 1.5 MB para no llenar localStorage
  if (file.size > 1500000) {
    showToast('Foto demasiado grande (máx 1.5 MB)');
    return;
  }
  const reader = new FileReader();
  reader.onload = ev => {
    // Redimensionar para que no ocupe mucho
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 800;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = h * maxDim / w; w = maxDim; }
        else { w = w * maxDim / h; h = maxDim; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      window._notaPhotoData = dataUrl;
      const prev = document.getElementById('nota-photo-preview');
      if (prev) prev.innerHTML = `<div class="photo-preview-mini"><img src="${dataUrl}"><button class="remove-photo" onclick="removeNotaPhoto()">×</button></div>`;
      showToast('📷 Foto añadida');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function removeNotaPhoto() {
  window._notaPhotoData = null;
  const prev = document.getElementById('nota-photo-preview');
  if (prev) prev.innerHTML = '';
  const inp = document.getElementById('nota-foto-input');
  if (inp) inp.value = '';
}
function openPhotoViewer(src) {
  const old = document.getElementById('photo-viewer'); if (old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay'; ov.id = 'photo-viewer';
  ov.style.padding = '20px';
  ov.innerHTML = `<div style="max-width:100%;max-height:100%;display:flex;align-items:center;justify-content:center"><img src="${src}" style="max-width:100%;max-height:90vh;border-radius:var(--radius-md)"></div>`;
  document.body.appendChild(ov);
  ov.onclick = () => ov.remove();
}
function quickDeleteNote(f, id) {
  if (!confirm('¿Borrar esta nota?')) return;
  houseData[f].notas = houseData[f].notas.filter(x => x.id !== id);
  saveState();
  renderHouse();
  refreshCals();
  showToast('🗑 Borrada');
}
function saveNota(f) {
  const txt = document.getElementById('nota-in').value.trim();
  if (!txt) { showToast('Escribe algo'); return; }
  const d = new Date();
  const img = window._notaPhotoData || null;
  const schedule = readScheduleFromSelector('nn');
  houseData[f].notas.unshift({ id: nextId++, text: txt, date: `${d.getDate()} ${MS[d.getMonth()]}`, img, schedule });
  window._notaPhotoData = null;
  saveState();
  renderHouse();
  refreshCals();
  showToast('✅ Guardada');
}
function renderTareasFinca(vv, f) {
  const tareas = houseData[f].tareas;
  if (!tareas.length) { const el = document.createElement('div'); el.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:8px 0 10px'; el.textContent = 'Sin tareas.'; vv.appendChild(el); }
  tareas.forEach(t => {
    const el = document.createElement('div'); el.className = 'task-item';
    const assigns = (t.assigns || []);
    const aHtml = assigns.length ? `👤 ${escapeHtml(assigns.join(', '))}` : '';
    const photoIcon = t.img ? ' 📷' : '';
    const thumbHtml = t.img ? `<img src="${t.img}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;flex-shrink:0;cursor:pointer" onclick="event.stopPropagation();openPhotoViewer('${t.img}')">` : '';
    const sLabel = scheduleLabel(t.schedule);
    const sHtml = sLabel ? `<div style="font-size:10px;color:var(--green);margin-top:2px">${sLabel}</div>` : '';
    el.innerHTML = `<div class="tcheck${t.done?' done':''}" onclick="event.stopPropagation();toggleT('${f}',${t.id})">${t.done?'✓':''}</div>
      ${thumbHtml}
      <div class="tinfo" onclick="openEditTaskModal('${f}',${t.id})">
        <div class="ttitle${t.done?' done':''}">${escapeHtml(t.title)}${photoIcon}</div>
        <div class="tmeta">${aHtml}</div>
        ${sHtml}
      </div>
      <span class="tbadge ${t.prio==='urgent'?'b-u':'b-n'}">${t.prio==='urgent'?'Urgente':'Normal'}</span>`;
    vv.appendChild(el);
  });
  const box = document.createElement('div'); box.className = 'add-box';
  box.innerHTML = `<div class="field-label">Nueva tarea</div>
    <input id="task-in" placeholder="Descripción...">
    <div class="assign-row"><span class="assign-label">Asignar a:</span><div class="emp-pills" id="house-pills"></div></div>
    <div class="field-label">¿Cuándo se hace?</div>
    <div id="new-task-schedule-container"></div>
    <div id="task-photo-preview" style="margin-top:6px"></div>
    <div class="box-btns">
      <select id="task-prio"><option value="normal">Normal</option><option value="urgent">Urgente</option></select>
      <label class="btn-foto-lbl">
        <input type="file" accept="image/*" class="file-input-hidden" id="task-foto-input" onchange="handleNewTaskPhoto(event)">
        📷 Foto
      </label>
      <button class="btn-save" onclick="addTarea('${f}')">Enviar →</button>
    </div>`;
  vv.appendChild(box);
  newTaskAssignsHouse.clear();
  renderEmpPills('house-pills', newTaskAssignsHouse);
  renderScheduleSelector('new-task-schedule-container', 'nt', null);
  window._newTaskPhoto = null;
}
function handleNewTaskPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 1500000) { showToast('Foto demasiado grande (máx 1.5 MB)'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 800;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = h * maxDim / w; w = maxDim; }
        else { w = w * maxDim / h; h = maxDim; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
      window._newTaskPhoto = dataUrl;
      const prev = document.getElementById('task-photo-preview');
      if (prev) prev.innerHTML = `<div class="photo-preview-mini"><img src="${dataUrl}"><button class="remove-photo" onclick="removeNewTaskPhoto()">×</button></div>`;
      showToast('📷 Foto añadida');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function removeNewTaskPhoto() {
  window._newTaskPhoto = null;
  const prev = document.getElementById('task-photo-preview');
  if (prev) prev.innerHTML = '';
  const inp = document.getElementById('task-foto-input');
  if (inp) inp.value = '';
}
function toggleT(f, id) { const t = houseData[f].tareas.find(x => x.id === id); if (t) { t.done = !t.done; saveState(); renderHouse(); } }
function addTarea(f) {
  const title = document.getElementById('task-in').value.trim();
  const prio = document.getElementById('task-prio').value;
  if (!title) { showToast('Escribe una tarea'); return; }
  const assigns = Array.from(newTaskAssignsHouse);
  const img = window._newTaskPhoto || null;
  const schedule = readScheduleFromSelector('nt');
  houseData[f].tareas.unshift({ id: nextId++, title, prio, done: false, assigns, img, schedule });
  newTaskAssignsHouse.clear();
  window._newTaskPhoto = null;
  saveState();
  renderHouse();
  showToast(`✅ Enviada${assigns.length?' · '+assigns.length+' asignado'+(assigns.length>1?'s':''):''}`);
}

// ===== NAVEGACIÓN =====
const TABS = ['semana','mes','tareas','equipo','compras','estancias'];
function switchMain(tab) {
  TABS.forEach((t, i) => {
    document.getElementById('view-' + t).style.display = 'none';
    document.querySelectorAll('.nav-tab')[i].classList.remove('active');
  });
  document.getElementById('view-casa').style.display = 'none';
  document.getElementById('view-empleado').style.display = 'none';
  document.getElementById('nav-tabs').style.display = 'flex';
  document.getElementById('view-' + tab).style.display = 'block';
  document.querySelectorAll('.nav-tab')[TABS.indexOf(tab)].classList.add('active');
  if (tab === 'semana') buildWeek();
  if (tab === 'mes') buildMonth();
  if (tab === 'tareas') buildTareas();
  if (tab === 'equipo') buildEquipo();
  if (tab === 'compras') { currentComprasFinca = null; buildCompras(); }
  if (tab === 'estancias') buildEstancias();
}

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => switchMain(tab.dataset.tab));
});

// arranque: solo si hay sesión activa pinta la semana
if (isLoggedIn()) {
  buildWeek();
}

// ============================================================
// ===== COMPRAS =====
// ============================================================
// Estructura: compras = [{id, desc, finca, libreText, img, done, fecha}]
// finca: nombre de finca, o '__libre__' si es texto libre
// libreText: texto cuando finca === '__libre__'

let comprasFilter = 'pending'; // 'pending' | 'done'
let comprasMode = 'lista';     // 'lista' | 'finca'
let comprasSelectMode = false;
let selectedCompras = new Set();
let comprasPhotoData = null;

function buildCompras() {
  const vv = document.getElementById('view-compras'); vv.innerHTML = '';

  // Barra de modo
  const mr = document.createElement('div'); mr.className = 'mode-row';
  [{k:'lista',l:'📋 Lista'},{k:'finca',l:'🏠 Por finca'}].forEach(({k,l}) => {
    const b = document.createElement('div'); b.className = 'mode-btn' + (comprasMode===k?' active':'');
    b.textContent = l;
    b.onclick = () => { comprasMode = k; buildCompras(); };
    mr.appendChild(b);
  });
  vv.appendChild(mr);

  if (comprasMode === 'finca') return buildComprasPorFinca(vv);
  buildComprasLista(vv);
}

function buildComprasLista(vv) {
  // Barra selección + exportar
  if (comprasSelectMode && selectedCompras.size > 0) {
    const bar = document.createElement('div'); bar.className = 'bulk-bar';
    const conFoto = [...selectedCompras].filter(id => {
      const c = compras.find(x => x.id === id);
      return c && c.img;
    }).length;
    bar.innerHTML = `<span><strong>${selectedCompras.size}</strong> seleccionada${selectedCompras.size>1?'s':''}</span>
      ${conFoto > 0 ? `<button class="bulk-btn" onclick="exportarFacturasPDF()">📄 Exportar ${conFoto} factura${conFoto>1?'s':''}</button>` : ''}
      <button class="bulk-btn" onclick="bulkComprasDone()">✓ Hechas</button>
      <button class="bulk-btn" onclick="bulkComprasDelete()">✕ Eliminar</button>
      <button class="bulk-btn" style="margin-left:auto" onclick="comprasSelectMode=false;selectedCompras.clear();buildCompras()">Cancelar</button>`;
    vv.appendChild(bar);
  }

  // Filtros
  const fr = document.createElement('div'); fr.className = 'filter-row';
  [['pending','Pendientes'],['done','Hechas'],['all','Todas']].forEach(([k,l]) => {
    const b = document.createElement('div'); b.className = 'filter-btn' + (comprasFilter===k?' active':'');
    b.textContent = l;
    b.onclick = () => { comprasFilter = k; buildCompras(); };
    fr.appendChild(b);
  });
  const selBtn = document.createElement('div'); selBtn.className = 'sel-toggle' + (comprasSelectMode?' on':'');
  selBtn.textContent = comprasSelectMode ? '✓ Seleccionando' : 'Seleccionar';
  selBtn.onclick = () => { comprasSelectMode = !comprasSelectMode; if (!comprasSelectMode) selectedCompras.clear(); buildCompras(); };
  fr.appendChild(selBtn);
  vv.appendChild(fr);

  // Lista
  const filtered = compras.filter(c => {
    if (comprasFilter === 'pending') return !c.done;
    if (comprasFilter === 'done') return c.done;
    return true;
  });

  if (!filtered.length) {
    const el = document.createElement('div'); el.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:12px 0';
    el.textContent = 'Sin compras en esta vista.'; vv.appendChild(el);
  }

  filtered.forEach(c => {
    const isSel = selectedCompras.has(c.id);
    const el = document.createElement('div'); el.className = 'task-global-item' + (isSel?' sel':'');
    if (comprasSelectMode) {
      el.onclick = () => { if (selectedCompras.has(c.id)) selectedCompras.delete(c.id); else selectedCompras.add(c.id); buildCompras(); };
      el.style.cursor = 'pointer';
    }
    const locLabel = c.finca === '__libre__' ? (c.libreText || 'Sin ubicación') : c.finca;
    const locColor = c.finca === '__libre__' ? '#aaa' : (FCOL[c.finca] || '#ccc');
    const thumbHtml = c.img ? `<img src="${c.img}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;flex-shrink:0;cursor:pointer" onclick="event.stopPropagation();openPhotoViewer('${c.img}')">` : '';
    const selBoxHtml = `<div class="sel-box${isSel?' checked':''}">${isSel?'✓':''}</div>`;
    const checkHtml = `<div class="tcheck${c.done?' done':''}" onclick="event.stopPropagation();toggleCompra(${c.id})">${c.done?'✓':''}</div>`;
    const editClick = comprasSelectMode ? '' : `onclick="openEditCompraModal(${c.id})"`;
    el.innerHTML = `${comprasSelectMode?selBoxHtml:checkHtml}${thumbHtml}
      <div class="tinfo" ${editClick}>
        <div class="ttitle${c.done?' done':''}">${escapeHtml(c.desc)}${c.img?' 📷':''}</div>
        <div class="tmeta"><span style="display:flex;align-items:center;gap:2px"><div style="width:7px;height:7px;border-radius:2px;background:${locColor}"></div>${escapeHtml(locLabel)}</span></div>
        ${c.fecha ? `<div style="font-size:10px;color:var(--text-tertiary)">${escapeHtml(c.fecha)}</div>` : ''}
      </div>
      <span class="tbadge b-n" style="background:#e8f5e9;color:#2e7d32">${c.done?'✓ Hecha':'Pendiente'}</span>`;
    vv.appendChild(el);
  });

  // Formulario nueva compra — colapsable
  const toggleBtn = document.createElement('div');
  toggleBtn.className = 'add-toggle-btn'; toggleBtn.id = 'add-compra-toggle-btn';
  toggleBtn.textContent = '+ Nueva compra';
  toggleBtn.onclick = toggleAddCompraForm;
  vv.appendChild(toggleBtn);

  const box = document.createElement('div'); box.id = 'add-compra-form'; box.className = 'add-task-box'; box.style.display = 'none';
  box.innerHTML = `
    <div class="field-label">Nueva compra</div>
    <input id="nc-desc" placeholder="Descripción del material o compra...">
    <div class="add-task-row" style="margin-top:6px;flex-wrap:wrap;gap:6px">
      <select id="nc-finca" style="flex:1;min-width:120px">
        <option value="">— Finca —</option>
        ${FINCAS.map(f=>`<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
      </select>
      <div class="emp-pill" id="nc-libre-pill" onclick="toggleNcLibre()" style="white-space:nowrap">✏️ Libre</div>
    </div>
    <div id="nc-libre-row" style="display:none;margin-top:6px">
      <input id="nc-libre-text" placeholder="Escribe la ubicación o contexto...">
    </div>
    <div id="nc-photo-preview" style="margin-top:6px"></div>
    <div class="box-btns" style="margin-top:8px">
      <label class="btn-foto-lbl">
        <input type="file" accept="image/*" class="file-input-hidden" id="nc-foto-input" onchange="handleCompraPhoto(event)">
        📷 Foto/Factura
      </label>
      <button class="btn-send" onclick="addCompra()">Enviar →</button>
    </div>`;
  vv.appendChild(box);
  comprasPhotoData = null;
  window._ncLibreActive = false;
}

function renderAddCompraForm(vv) {
  const box = document.createElement('div'); box.className = 'add-task-box';
  box.innerHTML = `
    <div class="field-label">Nueva compra</div>
    <input id="nc-desc" placeholder="Descripción del material o compra...">
    <div class="add-task-row" style="margin-top:6px;flex-wrap:wrap;gap:6px">
      <select id="nc-finca" style="flex:1;min-width:120px">
        <option value="">— Finca —</option>
        ${FINCAS.map(f=>`<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')}
      </select>
      <div class="emp-pill" id="nc-libre-pill" onclick="toggleNcLibre()" style="white-space:nowrap">✏️ Libre</div>
    </div>
    <div id="nc-libre-row" style="display:none;margin-top:6px">
      <input id="nc-libre-text" placeholder="Escribe la ubicación o contexto...">
    </div>
    <div id="nc-photo-preview" style="margin-top:6px"></div>
    <div class="box-btns" style="margin-top:8px">
      <label class="btn-foto-lbl">
        <input type="file" accept="image/*" class="file-input-hidden" id="nc-foto-input" onchange="handleCompraPhoto(event)">
        📷 Foto/Factura
      </label>
      <button class="btn-send" onclick="addCompra()">Enviar →</button>
    </div>`;
  vv.appendChild(box);
  comprasPhotoData = null;
  window._ncLibreActive = false;
}

function buildComprasPorFinca(vv) {
  // Agrupar por finca
  const grupos = {};
  compras.forEach(c => {
    const key = c.finca === '__libre__' ? '__libre__' : (c.finca || '__libre__');
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(c);
  });

  if (!Object.keys(grupos).length) {
    const el = document.createElement('div'); el.style.cssText='font-size:12px;color:var(--text-tertiary);padding:12px 0;text-align:center';
    el.textContent = 'No hay compras todavía.'; vv.appendChild(el);
    return;
  }

  // Primero las fincas conocidas (en orden), luego libres
  const ordered = [...FINCAS.filter(f => grupos[f]), ...(grupos['__libre__'] ? ['__libre__'] : [])];
  ordered.forEach(key => {
    const items = grupos[key];
    const pending = items.filter(c => !c.done).length;
    const locLabel = key === '__libre__' ? '✏️ Ubicación libre' : key;
    const locColor = key === '__libre__' ? '#aaa' : (FCOL[key] || '#ccc');

    const card = document.createElement('div'); card.className = 'group-card';
    card.innerHTML = `<div style="width:10px;height:36px;border-radius:3px;background:${locColor};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${escapeHtml(locLabel)}</div>
        <div style="font-size:10px;color:var(--text-tertiary)">${items.length} compra${items.length!==1?'s':''} totales</div>
      </div>
      ${pending ? `<span class="notif-b">${pending} pendiente${pending>1?'s':''}</span>` : '<span style="font-size:10px;color:var(--text-tertiary)">✓ todo hecho</span>'}
      <span style="color:var(--text-tertiary);font-size:14px;margin-left:4px">›</span>`;
    card.onclick = () => openComprasFinca(key);
    vv.appendChild(card);
  });

  // Botón añadir
  const addBtn = document.createElement('div'); addBtn.className = 'add-task-box';
  addBtn.innerHTML = `<div style="text-align:center;padding:4px 0"><button class="btn-save" onclick="comprasMode='lista';buildCompras()">+ Nueva compra</button></div>`;
  vv.appendChild(addBtn);
}

// Estado para detalle de finca en compras
let currentComprasFinca = null;

function openComprasFinca(fincaKey) {
  currentComprasFinca = fincaKey;
  // Ocultar nav y mostrar vista detalle usando view-compras
  document.getElementById('nav-tabs').style.display = 'none';
  document.getElementById('view-compras').style.display = 'block';
  renderComprasFincaDetail();
}

function renderComprasFincaDetail() {
  const vv = document.getElementById('view-compras'); vv.innerHTML = '';
  const key = currentComprasFinca;
  const locLabel = key === '__libre__' ? '✏️ Ubicación libre' : key;
  const locColor = key === '__libre__' ? '#aaa' : (FCOL[key] || '#ccc');

  // Back
  const back = document.createElement('div'); back.className = 'hv-back';
  back.innerHTML = '‹ Volver';
  back.onclick = () => {
    currentComprasFinca = null;
    document.getElementById('nav-tabs').style.display = 'flex';
    buildCompras();
  };
  vv.appendChild(back);

  // Header estilo finca
  const hdr = document.createElement('div'); hdr.className = 'hv-header';
  hdr.innerHTML = `<div class="hv-color" style="background:${locColor}"></div><div><div class="hv-name">${escapeHtml(locLabel)}</div></div>`;
  vv.appendChild(hdr);

  // Filtros
  const fr = document.createElement('div'); fr.className = 'filter-row';
  [['pending','Pendientes'],['done','Hechas'],['all','Todas']].forEach(([k,l]) => {
    const b = document.createElement('div'); b.className = 'filter-btn' + (comprasFilter===k?' active':'');
    b.textContent = l;
    b.onclick = () => { comprasFilter = k; renderComprasFincaDetail(); };
    fr.appendChild(b);
  });
  vv.appendChild(fr);

  const items = compras.filter(c => {
    const ck = c.finca === '__libre__' ? '__libre__' : (c.finca || '__libre__');
    if (ck !== key) return false;
    if (comprasFilter === 'pending') return !c.done;
    if (comprasFilter === 'done') return c.done;
    return true;
  });

  if (!items.length) {
    const el = document.createElement('div'); el.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:12px 0';
    el.textContent = 'Sin compras en esta vista.'; vv.appendChild(el);
  }

  items.forEach(c => {
    const el = document.createElement('div'); el.className = 'task-global-item';
    const thumbHtml = c.img ? `<img src="${c.img}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;flex-shrink:0;cursor:pointer" onclick="event.stopPropagation();openPhotoViewer('${c.img}')">` : '';
    const subLabel = key === '__libre__' ? (c.libreText || '') : '';
    el.innerHTML = `<div class="tcheck${c.done?' done':''}" onclick="event.stopPropagation();toggleCompraDetail(${c.id})">${c.done?'✓':''}</div>
      ${thumbHtml}
      <div class="tinfo" onclick="openEditCompraModal(${c.id})">
        <div class="ttitle${c.done?' done':''}">${escapeHtml(c.desc)}${c.img?' 📷':''}</div>
        ${subLabel ? `<div style="font-size:10px;color:var(--text-secondary)">${escapeHtml(subLabel)}</div>` : ''}
        ${c.fecha ? `<div style="font-size:10px;color:var(--text-tertiary)">${escapeHtml(c.fecha)}</div>` : ''}
      </div>
      <span class="tbadge b-n" style="background:${c.done?'#e8f5e9':'#fff3e0'};color:${c.done?'#2e7d32':'#e65100'}">${c.done?'✓ Hecha':'Pendiente'}</span>`;
    vv.appendChild(el);
  });

  // Formulario añadir compra (preseleccionada la finca actual)
  const box = document.createElement('div'); box.className = 'add-task-box';
  const isLibre = key === '__libre__';
  box.innerHTML = `
    <div class="field-label">Nueva compra en ${escapeHtml(locLabel)}</div>
    <input id="nc-desc" placeholder="Descripción del material o compra...">
    ${isLibre ? `<div style="margin-top:6px"><input id="nc-libre-text" placeholder="Ubicación específica (opcional)..."></div>` : ''}
    <div id="nc-photo-preview" style="margin-top:6px"></div>
    <div class="box-btns" style="margin-top:8px">
      <label class="btn-foto-lbl">
        <input type="file" accept="image/*" class="file-input-hidden" id="nc-foto-input" onchange="handleCompraPhoto(event)">
        📷 Foto/Factura
      </label>
      <button class="btn-send" onclick="addCompraEnFinca('${key}')">Enviar →</button>
    </div>`;
  vv.appendChild(box);
  comprasPhotoData = null;
}

function toggleCompraDetail(id) {
  const c = compras.find(x => x.id === id);
  if (c) { c.done = !c.done; saveState(); renderComprasFincaDetail(); }
}

function addCompraEnFinca(fincaKey) {
  const desc = (document.getElementById('nc-desc').value || '').trim();
  if (!desc) { showToast('Escribe la descripción'); return; }
  const d = new Date();
  const fecha = `${d.getDate()} ${MS[d.getMonth()]} ${d.getFullYear()}`;
  const libreText = fincaKey === '__libre__' ? ((document.getElementById('nc-libre-text') || {}).value || '').trim() : '';
  compras.unshift({ id: nextId++, desc, finca: fincaKey, libreText, done: false, fecha, img: comprasPhotoData || null });
  comprasPhotoData = null;
  saveState();
  renderComprasFincaDetail();
  showToast('✅ Compra añadida');
}

function handleCompraPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 3000000) { showToast('Foto demasiado grande (máx 3 MB)'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Para facturas guardamos más resolución (1200px) para que sea legible
      const maxDim = 1200;
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) { h = h * maxDim / w; w = maxDim; }
        else { w = w * maxDim / h; h = maxDim; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      comprasPhotoData = dataUrl;
      const prev = document.getElementById('nc-photo-preview');
      if (prev) prev.innerHTML = `<div class="photo-preview-mini"><img src="${dataUrl}"><button class="remove-photo" onclick="removeCompraPhoto()">×</button></div>`;
      showToast('📷 Foto añadida');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function removeCompraPhoto() {
  comprasPhotoData = null;
  const prev = document.getElementById('nc-photo-preview');
  if (prev) prev.innerHTML = '';
  const inp = document.getElementById('nc-foto-input');
  if (inp) inp.value = '';
}

function toggleNcLibre() {
  window._ncLibreActive = !window._ncLibreActive;
  const pill = document.getElementById('nc-libre-pill');
  const row = document.getElementById('nc-libre-row');
  const sel = document.getElementById('nc-finca');
  if (pill) pill.classList.toggle('on', window._ncLibreActive);
  if (row) row.style.display = window._ncLibreActive ? 'block' : 'none';
  if (sel) sel.disabled = window._ncLibreActive;
  if (window._ncLibreActive && sel) sel.value = '';
}

function addCompra() {
  const desc = (document.getElementById('nc-desc').value || '').trim();
  if (!desc) { showToast('Escribe la descripción'); return; }
  const d = new Date();
  const fecha = `${d.getDate()} ${MS[d.getMonth()]} ${d.getFullYear()}`;
  const newC = { id: nextId++, desc, done: false, fecha, img: comprasPhotoData || null };
  if (window._ncLibreActive) {
    const libre = (document.getElementById('nc-libre-text').value || '').trim();
    newC.finca = '__libre__';
    newC.libreText = libre;
  } else {
    const fincaVal = document.getElementById('nc-finca').value;
    newC.finca = fincaVal || '__libre__';
    newC.libreText = '';
  }
  compras.unshift(newC);
  comprasPhotoData = null;
  saveState();
  buildCompras();
  showToast('✅ Compra añadida');
}

function toggleCompra(id) {
  const c = compras.find(x => x.id === id);
  if (c) { c.done = !c.done; saveState(); buildCompras(); }
}

// Modal editar compra
let editCompraId = null;
function openEditCompraModal(id) {
  const c = compras.find(x => x.id === id);
  if (!c) return;
  editCompraId = id;
  window._editCompraPhoto = c.img || null;
  const old = document.getElementById('edit-compra-modal'); if (old) old.remove();
  const ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'edit-compra-modal';
  const photoHtml = c.img ? `<img class="modal-photo-preview" src="${c.img}" onclick="openPhotoViewer('${c.img}')">` : '';
  const isLibre = c.finca === '__libre__';
  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">✎ Editar compra</div>
    <div class="field-label">Descripción</div>
    <input id="ec-desc" value="${escapeHtml(c.desc)}">
    <div class="field-label">Ubicación</div>
    <select id="ec-finca">
      <option value="">— Sin finca —</option>
      ${FINCAS.map(f=>`<option value="${escapeHtml(f)}" ${!isLibre && c.finca===f?'selected':''}>${escapeHtml(f)}</option>`).join('')}
      <option value="__libre__" ${isLibre?'selected':''}>✏️ Texto libre...</option>
    </select>
    <div id="ec-libre-row" style="display:${isLibre?'block':'none'};margin-top:6px">
      <input id="ec-libre-text" value="${escapeHtml(c.libreText||'')}" placeholder="Ubicación...">
    </div>
    <div class="field-label" style="margin-top:10px">Foto / Factura</div>
    <div id="ec-photo-area">${photoHtml}</div>
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      <label class="btn-foto-lbl">
        <input type="file" accept="image/*" class="file-input-hidden" id="ec-foto-input" onchange="handleEditCompraPhoto(event)">
        📷 ${c.img?'Cambiar':'Añadir'} foto
      </label>
      ${c.img?'<button class="btn-cancel" onclick="removeEditCompraPhoto()">Quitar foto</button>':''}
    </div>
    <div class="modal-btns">
      <button class="btn-danger" onclick="deleteCompra()">🗑 Borrar</button>
      <div class="btn-cancel" onclick="closeEditCompraModal()">Cancelar</div>
      <div class="btn-ok" onclick="saveEditCompra()">Guardar</div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) closeEditCompraModal(); };
  // listener select
  setTimeout(() => {
    const sel = document.getElementById('ec-finca');
    if (sel) sel.addEventListener('change', () => {
      const r = document.getElementById('ec-libre-row');
      if (r) r.style.display = sel.value === '__libre__' ? 'block' : 'none';
    });
  }, 20);
}
function handleEditCompraPhoto(e) {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > 3000000) { showToast('Foto demasiado grande (máx 3 MB)'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 1200; let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) { if (w > h) { h = h*maxDim/w; w=maxDim; } else { w=w*maxDim/h; h=maxDim; } }
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      window._editCompraPhoto = dataUrl;
      const area = document.getElementById('ec-photo-area');
      if (area) area.innerHTML = `<img class="modal-photo-preview" src="${dataUrl}" onclick="openPhotoViewer('${dataUrl}')">`;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function removeEditCompraPhoto() {
  window._editCompraPhoto = null;
  const area = document.getElementById('ec-photo-area'); if (area) area.innerHTML = '';
}
function closeEditCompraModal() { const m = document.getElementById('edit-compra-modal'); if (m) m.remove(); editCompraId = null; }
function saveEditCompra() {
  const c = compras.find(x => x.id === editCompraId); if (!c) return;
  const desc = (document.getElementById('ec-desc').value || '').trim();
  if (!desc) { showToast('La descripción no puede estar vacía'); return; }
  const fincaVal = document.getElementById('ec-finca').value;
  c.desc = desc;
  c.img = window._editCompraPhoto || null;
  if (fincaVal === '__libre__') {
    c.finca = '__libre__';
    c.libreText = (document.getElementById('ec-libre-text').value || '').trim();
  } else {
    c.finca = fincaVal || '__libre__';
    c.libreText = '';
  }
  saveState();
  closeEditCompraModal();
  if (currentComprasFinca) renderComprasFincaDetail(); else buildCompras();
  showToast('✅ Actualizada');
}
function deleteCompra() {
  if (!confirm('¿Borrar esta compra?')) return;
  compras = compras.filter(x => x.id !== editCompraId);
  saveState();
  closeEditCompraModal();
  if (currentComprasFinca) renderComprasFincaDetail(); else buildCompras();
  showToast('🗑 Borrada');
}

function bulkComprasDone() {
  selectedCompras.forEach(id => { const c = compras.find(x => x.id === id); if (c) c.done = true; });
  selectedCompras.clear(); comprasSelectMode = false;
  saveState(); buildCompras(); showToast('✅ Hechas');
}
function bulkComprasDelete() {
  if (!confirm('¿Borrar las compras seleccionadas?')) return;
  compras = compras.filter(x => !selectedCompras.has(x.id));
  selectedCompras.clear(); comprasSelectMode = false;
  saveState(); buildCompras(); showToast('🗑 Eliminadas');
}

// ===== EXPORTAR FACTURAS PDF =====
async function exportarFacturasPDF() {
  const ids = [...selectedCompras];
  const conFoto = ids.map(id => compras.find(x => x.id === id)).filter(c => c && c.img);
  if (!conFoto.length) { showToast('Las compras seleccionadas no tienen foto'); return; }

  // Generar HTML con una imagen por página A4 y abrirlo para imprimir
  const imgsHtml = conFoto.map(c => {
    const loc = c.finca === '__libre__' ? (c.libreText || '') : c.finca;
    return `<div class="factura-page"><img src="${c.img}" alt="${escapeHtml(c.desc)}"></div>`;
  }).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Facturas Natura Viva</title><style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#fff; }
    .factura-page {
      width: 210mm;
      height: 297mm;
      display: flex;
      align-items: center;
      justify-content: center;
      page-break-after: always;
      overflow: hidden;
    }
    .factura-page img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    @media print {
      .factura-page { page-break-after: always; }
    }
  </style></head><body>${imgsHtml}<script>window.onload=function(){window.print();}<\/script></body></html>`;

  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Si el popup está bloqueado, descargar como HTML
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturas_${new Date().toISOString().slice(0,10)}.html`;
    a.click();
    showToast('📄 Descargado — ábrelo y usa Imprimir → Guardar como PDF');
  } else {
    showToast(`✅ ${conFoto.length} factura${conFoto.length>1?'s':''} — usa Imprimir para guardar PDF`);
  }
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ============================================================
// ===== HELPERS CALENDARIOS — ESTANCIAS Y COMPRAS =====
// ============================================================

function hasComprasPendientes(finca) {
  return compras.some(c => !c.done && c.finca === finca);
}

function hasEstanciaEnFecha(finca, date) {
  const d = dk(date);
  return estancias.some(e => e.finca === finca && e.entrada <= d && e.salida > d);
}

function getEstanciasEnFecha(finca, date) {
  const d = dk(date);
  return estancias.filter(e => e.finca === finca && e.entrada <= d && e.salida > d);
}

// ============================================================
// ===== FORMULARIOS COLAPSABLES: TAREAS Y COMPRAS =====
// ============================================================
// El buildTareasLista y buildComprasLista ya tienen sus botones
// Aquí están las funciones toggle

function toggleAddTaskForm() {
  const form = document.getElementById('add-task-form');
  const btn = document.getElementById('add-task-toggle-btn');
  if (!form) return;
  const open = form.style.display !== 'none';
  form.style.display = open ? 'none' : 'block';
  if (btn) btn.textContent = open ? '+ Nueva tarea' : '− Cerrar';
}

function toggleAddCompraForm() {
  const form = document.getElementById('add-compra-form');
  const btn = document.getElementById('add-compra-toggle-btn');
  if (!form) return;
  const open = form.style.display !== 'none';
  form.style.display = open ? 'none' : 'block';
  if (btn) btn.textContent = open ? '+ Nueva compra' : '− Cerrar';
}

// ============================================================
// ===== ESTANCIAS =====
// ============================================================
// Estructura: estancias = [{id, finca, entrada:'YYYY-MM-DD', salida:'YYYY-MM-DD', notas, cliente}]

let estanciasSubTab = 'todas'; // 'todas' | 'finca' | 'calendario'
let estanciasCalOff = 0; // offset de mes para calendario de estancias

function buildEstancias() {
  const vv = document.getElementById('view-estancias'); vv.innerHTML = '';

  // Subpestañas
  const tabs = document.createElement('div'); tabs.className = 'tabs2';
  [{k:'todas',l:'📋 Todas'},{k:'finca',l:'🏠 Por finca'},{k:'calendario',l:'📅 Calendario'}].forEach(({k,l}) => {
    const t = document.createElement('div'); t.className = 'tab2' + (estanciasSubTab===k?' active':'');
    t.textContent = l;
    t.onclick = () => { estanciasSubTab = k; buildEstancias(); };
    tabs.appendChild(t);
  });
  vv.appendChild(tabs);

  if (estanciasSubTab === 'todas') buildEstanciasTodas(vv);
  else if (estanciasSubTab === 'finca') buildEstanciasPorFinca(vv);
  else buildEstanciasCalendario(vv);
}

function buildEstanciasTodas(vv) {
  const ahora = dk(new Date());
  // Ordenar: primero activas, luego futuras, luego pasadas
  const sorted = [...estancias].sort((a, b) => {
    const aActiva = a.entrada <= ahora && a.salida > ahora;
    const bActiva = b.entrada <= ahora && b.salida > ahora;
    if (aActiva && !bActiva) return -1;
    if (!aActiva && bActiva) return 1;
    return a.entrada.localeCompare(b.entrada);
  });

  if (!sorted.length) {
    const el = document.createElement('div'); el.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:16px 0;text-align:center';
    el.textContent = 'Sin estancias registradas.'; vv.appendChild(el);
  }

  sorted.forEach(e => {
    const el = renderEstanciaCard(e, ahora);
    vv.appendChild(el);
  });

  renderAddEstanciaForm(vv);
}

function buildEstanciasPorFinca(vv) {
  const ahora = dk(new Date());
  FINCAS.forEach(f => {
    const items = estancias.filter(e => e.finca === f);
    if (!items.length) return;
    const activas = items.filter(e => e.entrada <= ahora && e.salida > ahora).length;
    const card = document.createElement('div'); card.className = 'group-card';
    card.innerHTML = `<div style="width:10px;height:36px;border-radius:3px;background:${FCOL[f]||'#ccc'};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:500">${escapeHtml(f)}</div>
        <div style="font-size:10px;color:var(--text-tertiary)">${items.length} estancia${items.length!==1?'s':''}</div>
      </div>
      ${activas ? `<span class="notif-b" style="background:#fff8e1;color:#e65100">🏠 Ocupada</span>` : ''}
      <span style="color:var(--text-tertiary);font-size:14px;margin-left:4px">›</span>`;
    card.onclick = () => openEstanciasFinca(f);
    vv.appendChild(card);
  });

  const addBtn = document.createElement('div'); addBtn.className = 'add-task-box';
  addBtn.innerHTML = `<div style="text-align:center;padding:4px 0"><button class="btn-save" onclick="estanciasSubTab='todas';buildEstancias()">+ Nueva estancia</button></div>`;
  vv.appendChild(addBtn);
}

let currentEstanciasFinca = null;
function openEstanciasFinca(f) {
  currentEstanciasFinca = f;
  document.getElementById('nav-tabs').style.display = 'none';
  renderEstanciasFincaDetail();
}

function renderEstanciasFincaDetail() {
  const vv = document.getElementById('view-estancias'); vv.innerHTML = '';
  const f = currentEstanciasFinca;
  const ahora = dk(new Date());

  const back = document.createElement('div'); back.className = 'hv-back'; back.innerHTML = '‹ Volver';
  back.onclick = () => { currentEstanciasFinca = null; document.getElementById('nav-tabs').style.display = 'flex'; buildEstancias(); };
  vv.appendChild(back);

  const hdr = document.createElement('div'); hdr.className = 'hv-header';
  hdr.innerHTML = `<div class="hv-color" style="background:${FCOL[f]||'#ccc'}"></div><div><div class="hv-name">${escapeHtml(f)}</div></div>`;
  vv.appendChild(hdr);

  const items = [...estancias.filter(e => e.finca === f)].sort((a,b) => b.entrada.localeCompare(a.entrada));
  if (!items.length) {
    const el = document.createElement('div'); el.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:12px 0';
    el.textContent = 'Sin estancias en esta finca.'; vv.appendChild(el);
  }
  items.forEach(e => { vv.appendChild(renderEstanciaCard(e, ahora)); });
  renderAddEstanciaForm(vv, f);
}

function buildEstanciasCalendario(vv) {
  const now = new Date(new Date().getFullYear(), new Date().getMonth() + estanciasCalOff, 1);
  const Y = now.getFullYear(), M = now.getMonth();
  const ahora = dk(new Date());

  const nav = document.createElement('div'); nav.className = 'month-nav';
  nav.innerHTML = `<button class="mnav-btn" onclick="estanciasCalOff--;buildEstancias()">‹</button><div class="month-title">${MONTHS[M]} ${Y}</div><button class="mnav-btn" onclick="estanciasCalOff++;buildEstancias()">›</button>`;
  vv.appendChild(nav);

  const grid = document.createElement('div'); grid.className = 'month-grid';
  ['Lu','Ma','Mi','Ju','Vi','Sá','Do'].forEach(d => { const h = document.createElement('div'); h.className = 'day-hdr'; h.textContent = d; grid.appendChild(h); });

  const first = new Date(Y, M, 1);
  const startDow = (first.getDay() + 6) % 7;
  const dim = new Date(Y, M + 1, 0).getDate();
  const prev = new Date(Y, M, 0).getDate();

  for (let i = 0; i < startDow; i++) { const d = document.createElement('div'); d.className = 'month-day other-month'; d.innerHTML = `<div class="md-num">${prev - startDow + 1 + i}</div>`; grid.appendChild(d); }

  for (let day = 1; day <= dim; day++) {
    const date = new Date(Y, M, day);
    const dow = (date.getDay() + 6) % 7;
    const weekend = dow >= 5;
    const td = isToday(date);
    const dStr = dk(date);
    const cell = document.createElement('div');
    cell.className = 'month-day' + (td?' today-day':'') + (weekend?' weekend-day':'');
    let html = `<div class="md-num${td?' today-num':''}">${day}</div>`;

    // Estancias activas ese día
    const activas = estancias.filter(e => e.entrada <= dStr && e.salida > dStr);
    activas.slice(0, 3).forEach(e => {
      const col = FCOL[e.finca] || '#ffe082';
      html += `<div class="md-pip" style="background:${col};color:#333;font-size:8px">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis">${escapeHtml(e.finca)}</span>
        <span style="font-size:7px">🏠</span>
      </div>`;
    });
    if (activas.length > 3) html += `<div style="font-size:7px;color:var(--text-tertiary)">+${activas.length-3}</div>`;

    cell.innerHTML = html;
    cell.onclick = () => openEstanciaDayModal(dStr, activas);
    grid.appendChild(cell);
  }

  const total = startDow + dim; const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 0; i < rem; i++) { const d = document.createElement('div'); d.className = 'month-day other-month'; d.innerHTML = `<div class="md-num">${i+1}</div>`; grid.appendChild(d); }
  vv.appendChild(grid);

  renderAddEstanciaForm(vv);
}

function openEstanciaDayModal(dStr, activas) {
  if (!activas.length) return;
  const old = document.getElementById('estancia-day-modal'); if (old) old.remove();
  const ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'estancia-day-modal';
  const [y,m,d] = dStr.split('-').map(Number);
  const label = `${d} ${MS[m-1]} ${y}`;
  const rows = activas.map(e => `
    <div class="modal-item" onclick="openEditEstanciaModal(${e.id});document.getElementById('estancia-day-modal').remove()">
      <div style="width:8px;height:8px;border-radius:50%;background:${FCOL[e.finca]||'#ccc'};flex-shrink:0;margin-top:3px"></div>
      <div class="modal-item-text">
        <div style="font-weight:500">${escapeHtml(e.finca)}</div>
        <div style="font-size:10px;color:var(--text-tertiary)">${formatDateLabel(e.entrada)} → ${formatDateLabel(e.salida)}${e.cliente?' · '+escapeHtml(e.cliente):''}</div>
        ${e.notas?`<div style="font-size:10px;color:var(--text-secondary)">${escapeHtml(e.notas)}</div>`:''}
      </div>
    </div>`).join('');
  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">🏠 ${label}</div>
    <div class="modal-list">${rows}</div>
    <div class="modal-btns"><div class="btn-cancel" onclick="document.getElementById('estancia-day-modal').remove()">Cerrar</div></div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
}

function formatDateLabel(str) {
  if (!str) return '?';
  const [y,m,d] = str.split('-').map(Number);
  return `${d} ${MS[m-1]}`;
}

function renderEstanciaCard(e, ahora) {
  const activa = e.entrada <= ahora && e.salida > ahora;
  const pasada = e.salida <= ahora;
  const el = document.createElement('div'); el.className = 'task-global-item';
  el.style.cursor = 'pointer';
  el.onclick = () => openEditEstanciaModal(e.id);
  const col = FCOL[e.finca] || '#ffe082';
  const estado = activa ? `<span class="tbadge" style="background:#fff8e1;color:#e65100;border:1px solid #ffe082">🏠 Activa</span>` :
                 pasada ? `<span class="tbadge" style="background:#f5f5f5;color:#999">Pasada</span>` :
                          `<span class="tbadge" style="background:#e8f5e9;color:#2e7d32">Próxima</span>`;
  el.innerHTML = `<div style="width:8px;height:36px;border-radius:3px;background:${col};flex-shrink:0"></div>
    <div class="tinfo">
      <div class="ttitle">${escapeHtml(e.finca)}${e.cliente?' · <span style="font-weight:400;color:var(--text-secondary)">'+escapeHtml(e.cliente)+'</span>':''}</div>
      <div class="tmeta">${formatDateLabel(e.entrada)} → ${formatDateLabel(e.salida)}${e.notas?' · '+escapeHtml(e.notas.slice(0,30)):''}</div>
    </div>
    ${estado}`;
  return el;
}

function renderAddEstanciaForm(vv, prefinca) {
  // Botón colapsable
  const toggleBtn = document.createElement('div');
  toggleBtn.className = 'add-toggle-btn'; toggleBtn.id = 'add-estancia-toggle-btn';
  toggleBtn.textContent = '+ Nueva estancia';
  toggleBtn.onclick = () => {
    const f = document.getElementById('add-estancia-form');
    const open = f.style.display !== 'none';
    f.style.display = open ? 'none' : 'block';
    toggleBtn.textContent = open ? '+ Nueva estancia' : '− Cerrar';
  };
  vv.appendChild(toggleBtn);

  const box = document.createElement('div'); box.id = 'add-estancia-form'; box.className = 'add-task-box'; box.style.display = 'none';
  box.innerHTML = `
    <div class="field-label">Finca</div>
    <select id="ne-finca">${FINCAS.map(f=>`<option value="${escapeHtml(f)}" ${prefinca===f?'selected':''}>${escapeHtml(f)}</option>`).join('')}</select>
    <div class="field-label" style="margin-top:8px">Cliente (opcional)</div>
    <input id="ne-cliente" placeholder="Nombre del cliente o reserva...">
    <div style="display:flex;gap:8px;margin-top:8px">
      <div style="flex:1"><div class="field-label">Entrada</div><input type="date" id="ne-entrada"></div>
      <div style="flex:1"><div class="field-label">Salida</div><input type="date" id="ne-salida"></div>
    </div>
    <div class="field-label" style="margin-top:8px">Notas (opcional)</div>
    <input id="ne-notas" placeholder="Observaciones...">
    <div class="box-btns" style="margin-top:10px">
      <button class="btn-save" onclick="addEstancia()">Guardar estancia</button>
    </div>`;
  vv.appendChild(box);
}

function addEstancia() {
  const finca = document.getElementById('ne-finca').value;
  const entrada = document.getElementById('ne-entrada').value;
  const salida = document.getElementById('ne-salida').value;
  const cliente = (document.getElementById('ne-cliente').value || '').trim();
  const notas = (document.getElementById('ne-notas').value || '').trim();
  if (!finca) { showToast('Elige una finca'); return; }
  if (!entrada || !salida) { showToast('Indica entrada y salida'); return; }
  if (salida <= entrada) { showToast('La salida debe ser posterior a la entrada'); return; }
  estancias.unshift({ id: nextId++, finca, entrada, salida, cliente, notas });
  saveState();
  if (currentEstanciasFinca) renderEstanciasFincaDetail();
  else buildEstancias();
  showToast('✅ Estancia añadida');
}

// Modal editar estancia
let editEstanciaId = null;
function openEditEstanciaModal(id) {
  const e = estancias.find(x => x.id === id); if (!e) return;
  editEstanciaId = id;
  const old = document.getElementById('edit-estancia-modal'); if (old) old.remove();
  const ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'edit-estancia-modal';
  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">✎ Editar estancia</div>
    <div class="field-label">Finca</div>
    <select id="ee-finca">${FINCAS.map(f=>`<option value="${escapeHtml(f)}" ${e.finca===f?'selected':''}>${escapeHtml(f)}</option>`).join('')}</select>
    <div class="field-label" style="margin-top:8px">Cliente (opcional)</div>
    <input id="ee-cliente" value="${escapeHtml(e.cliente||'')}">
    <div style="display:flex;gap:8px;margin-top:8px">
      <div style="flex:1"><div class="field-label">Entrada</div><input type="date" id="ee-entrada" value="${e.entrada}"></div>
      <div style="flex:1"><div class="field-label">Salida</div><input type="date" id="ee-salida" value="${e.salida}"></div>
    </div>
    <div class="field-label" style="margin-top:8px">Notas</div>
    <input id="ee-notas" value="${escapeHtml(e.notas||'')}">
    <div class="field-label" style="margin-top:8px">🔔 Aviso de llegada</div>
    ${renderReminderFieldHTML('ee', e.reminder || null, e.entrada)}
    <div class="modal-btns" style="margin-top:12px">
      <button class="btn-danger" onclick="deleteEstancia()">🗑 Borrar</button>
      <div class="btn-cancel" onclick="closeEditEstanciaModal()">Cancelar</div>
      <div class="btn-ok" onclick="saveEditEstancia()">Guardar</div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = ev => { if (ev.target === ov) closeEditEstanciaModal(); };
}
function closeEditEstanciaModal() { const m = document.getElementById('edit-estancia-modal'); if (m) m.remove(); editEstanciaId = null; }
function saveEditEstancia() {
  const e = estancias.find(x => x.id === editEstanciaId); if (!e) return;
  if (e.reminder && e.reminder.reminderId) NV_SYNC.deleteReminder(e.reminder.reminderId);
  e.finca = document.getElementById('ee-finca').value;
  e.cliente = document.getElementById('ee-cliente').value.trim();
  e.entrada = document.getElementById('ee-entrada').value;
  e.salida = document.getElementById('ee-salida').value;
  e.notas = document.getElementById('ee-notas').value.trim();
  e.reminder = readReminderFromField('ee', e.entrada);
  if (!e.entrada || !e.salida || e.salida <= e.entrada) { showToast('Fechas no válidas'); return; }
  if (e.reminder && e.reminder.fireAt) scheduleEstanciaReminder(e);
  saveState();
  closeEditEstanciaModal();
  if (currentEstanciasFinca) renderEstanciasFincaDetail(); else buildEstancias();
  refreshCals();
  showToast('✅ Actualizada');
}
function deleteEstancia() {
  if (!confirm('¿Borrar esta estancia?')) return;
  const e = estancias.find(x => x.id === editEstanciaId);
  if (e && e.reminder && e.reminder.reminderId) NV_SYNC.deleteReminder(e.reminder.reminderId);
  estancias = estancias.filter(x => x.id !== editEstanciaId);
  saveState();
  closeEditEstanciaModal();
  if (currentEstanciasFinca) renderEstanciasFincaDetail(); else buildEstancias();
  refreshCals();
  showToast('🗑 Borrada');
}

// ============================================================
// ===== SISTEMA DE NOTIFICACIONES PUSH =====
// ============================================================

// ---- UI: botón de activar notificaciones en la topbar ----
(function() {
  document.addEventListener('DOMContentLoaded', () => {
    // Añadir botón 🔔 en la topbar si las notificaciones son soportadas
    if (!('Notification' in window)) return;
    const topRight = document.querySelector('.topbar > div:last-child');
    if (!topRight) return;
    const btn = document.createElement('button');
    btn.id = 'notif-btn';
    btn.title = 'Activar notificaciones';
    btn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:18px;padding:4px 6px;opacity:.7;transition:opacity .2s';
    btn.onclick = toggleNotifications;
    topRight.insertBefore(btn, topRight.firstChild);
    updateNotifBtn();
  });
})();

function updateNotifBtn() {
  const btn = document.getElementById('notif-btn');
  if (!btn) return;
  const perm = Notification.permission;
  btn.textContent = perm === 'granted' ? '🔔' : '🔕';
  btn.title = perm === 'granted' ? 'Notificaciones activas' : 'Activar notificaciones';
  btn.style.opacity = perm === 'granted' ? '1' : '0.5';
}

async function toggleNotifications() {
  if (!('Notification' in window)) { showToast('Tu dispositivo no soporta notificaciones'); return; }
  if (Notification.permission === 'granted') {
    showToast('🔔 Notificaciones ya activas');
    return;
  }
  showToast('Solicitando permiso...');
  const ok = await NV_SYNC.requestPermission();
  updateNotifBtn();
  if (ok) {
    showToast('🔔 Notificaciones activadas');
  } else {
    showToast('❌ Permiso denegado — actívalo en ajustes del navegador');
  }
}

// ---- Renderizar campo de aviso (HTML) ----
// prefix: 'et' (edit task) | 'ee' (edit estancia)
// currentReminder: objeto guardado o null
// dateHint: fecha base para estancias (YYYY-MM-DD)
function renderReminderFieldHTML(prefix, currentReminder, dateHint) {
  const hasReminder = currentReminder && currentReminder.fireAt;
  const curDate = hasReminder ? new Date(currentReminder.fireAt) : null;
  const curDateStr = curDate ? `${curDate.getFullYear()}-${String(curDate.getMonth()+1).padStart(2,'0')}-${String(curDate.getDate()).padStart(2,'0')}` : (dateHint || '');
  const curTimeStr = curDate ? `${String(curDate.getHours()).padStart(2,'0')}:${String(curDate.getMinutes()).padStart(2,'0')}` : '09:00';
  const curOffset = hasReminder ? (currentReminder.offsetMinutes || 0) : 0;

  return `
    <div id="${prefix}-reminder-section" style="background:var(--bg-secondary);border-radius:var(--radius-md);padding:10px;margin-bottom:8px">
      <div class="emp-pills" style="margin-bottom:8px">
        <div class="emp-pill${!hasReminder?' on':''}" id="${prefix}-rem-off" onclick="setReminderMode('${prefix}','off')">Sin aviso</div>
        <div class="emp-pill${hasReminder?' on':''}" id="${prefix}-rem-on" onclick="setReminderMode('${prefix}','on')">🔔 Programar</div>
      </div>
      <div id="${prefix}-rem-detail" style="display:${hasReminder?'block':'none'}">
        <div style="display:flex;gap:6px;margin-bottom:8px">
          <div style="flex:1"><div class="field-label">Fecha</div><input type="date" id="${prefix}-rem-date" value="${curDateStr}"></div>
          <div style="flex:1"><div class="field-label">Hora</div><input type="time" id="${prefix}-rem-time" value="${curTimeStr}"></div>
        </div>
        <div class="field-label">Avisar también</div>
        <div class="emp-pills" style="flex-wrap:wrap;gap:4px" id="${prefix}-rem-offsets">
          ${[
            {v:0,   l:'A la hora'},
            {v:10,  l:'10 min antes'},
            {v:60,  l:'1 hora antes'},
            {v:120, l:'2 horas antes'},
            {v:1440,l:'1 día antes'},
            {v:2880,l:'2 días antes'}
          ].map(o => `<div class="emp-pill${curOffset===o.v?' on':''}" onclick="selectReminderOffset('${prefix}',${o.v})">${o.l}</div>`).join('')}
        </div>
      </div>
    </div>`;
}

function setReminderMode(prefix, mode) {
  const detail = document.getElementById(`${prefix}-rem-detail`);
  const offBtn = document.getElementById(`${prefix}-rem-off`);
  const onBtn  = document.getElementById(`${prefix}-rem-on`);
  if (!detail) return;
  detail.style.display = mode === 'on' ? 'block' : 'none';
  offBtn.classList.toggle('on', mode === 'off');
  onBtn.classList.toggle('on', mode === 'on');
}

function selectReminderOffset(prefix, val) {
  const container = document.getElementById(`${prefix}-rem-offsets`);
  if (!container) return;
  container.querySelectorAll('.emp-pill').forEach(p => p.classList.remove('on'));
  const pills = container.querySelectorAll('.emp-pill');
  const offsets = [0, 10, 60, 120, 1440, 2880];
  const idx = offsets.indexOf(val);
  if (idx >= 0 && pills[idx]) pills[idx].classList.add('on');
  container.dataset.selected = val;
}

function readReminderFromField(prefix, dateHint) {
  const onBtn = document.getElementById(`${prefix}-rem-on`);
  if (!onBtn || !onBtn.classList.contains('on')) return null;
  const dateEl = document.getElementById(`${prefix}-rem-date`);
  const timeEl = document.getElementById(`${prefix}-rem-time`);
  if (!dateEl || !timeEl || !dateEl.value || !timeEl.value) return null;

  const [y,m,d] = dateEl.value.split('-').map(Number);
  const [hh,mm] = timeEl.value.split(':').map(Number);
  const fireAt = new Date(y, m-1, d, hh, mm).getTime();
  if (isNaN(fireAt) || fireAt < Date.now() - 60000) {
    showToast('La fecha del aviso ya ha pasado'); return null;
  }

  const container = document.getElementById(`${prefix}-rem-offsets`);
  const offsetMinutes = container && container.dataset.selected !== undefined
    ? parseInt(container.dataset.selected, 10) : 0;

  const reminderId = `rem_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
  return { fireAt, offsetMinutes, reminderId };
}

// ---- Programar recordatorios ----
function scheduleTaskReminder(task, finca) {
  if (!task.reminder || !task.reminder.fireAt) return;
  const user = (typeof currentUser === 'function' && currentUser()) ? currentUser().username : 'unknown';
  const reminders = buildReminderTimes(task.reminder);
  reminders.forEach((fireAt, i) => {
    NV_SYNC.scheduleReminder({
      id: `${task.reminder.reminderId}_${i}`,
      reminderId: task.reminder.reminderId,
      title: `📋 Tarea: ${task.title}`,
      body: finca ? `En ${finca}` : '',
      fireAt,
      userId: user,
      type: 'tarea',
      fired: false
    });
  });
  // Disparar verificación inmediata
  kickReminderCheck();
}

function scheduleEstanciaReminder(estancia) {
  if (!estancia.reminder || !estancia.reminder.fireAt) return;
  const user = (typeof currentUser === 'function' && currentUser()) ? currentUser().username : 'unknown';
  const reminders = buildReminderTimes(estancia.reminder);
  reminders.forEach((fireAt, i) => {
    NV_SYNC.scheduleReminder({
      id: `${estancia.reminder.reminderId}_${i}`,
      reminderId: estancia.reminder.reminderId,
      title: `🏠 Llegada en ${estancia.finca}`,
      body: estancia.cliente ? `Cliente: ${estancia.cliente}` : `Entrada: ${formatDateLabel(estancia.entrada)}`,
      fireAt,
      userId: user,
      type: 'estancia',
      fired: false
    });
  });
  kickReminderCheck();
}

function buildReminderTimes(reminder) {
  // Siempre añadir el aviso principal + el offset seleccionado
  const times = new Set([reminder.fireAt]);
  if (reminder.offsetMinutes && reminder.offsetMinutes > 0) {
    times.add(reminder.fireAt - reminder.offsetMinutes * 60000);
  }
  return [...times].filter(t => t > Date.now());
}

function kickReminderCheck() {
  // Pedir al SW que verifique recordatorios ahora
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'CHECK_REMINDERS' });
  }
}

// Verificar recordatorios al cargar la app (en primer plano)
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkRemindersInForeground, 3000);
  setInterval(checkRemindersInForeground, 60000); // cada minuto
});

async function checkRemindersInForeground() {
  if (!window.FIREBASE_ENABLED || Notification.permission !== 'granted') return;
  try {
    const user = (typeof currentUser === 'function' && currentUser()) ? currentUser().username : null;
    if (!user) return;
    const resp = await fetch(`https://natura-viva-ddc86-default-rtdb.europe-west1.firebasedatabase.app/reminders/${user}.json`);
    if (!resp.ok) return;
    const userReminders = await resp.json();
    if (!userReminders) return;
    const now = Date.now();
    for (const [key, r] of Object.entries(userReminders)) {
      if (r && r.fireAt && r.fireAt <= now && !r.fired) {
        // Mostrar notificación
        new Notification(r.title || 'Natura Viva', {
          body: r.body || '',
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          tag: `reminder-${r.id}`
        });
        // Marcar como fired
        await fetch(
          `https://natura-viva-ddc86-default-rtdb.europe-west1.firebasedatabase.app/reminders/${user}/${key}/fired.json`,
          { method: 'PUT', body: 'true', headers: { 'Content-Type': 'application/json' } }
        );
      }
    }
  } catch(err) { /* silencioso */ }
}
