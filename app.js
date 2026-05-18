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
      nextId: s.nextId || 100
    };
  } catch(e) {
    return { fuelDays:{}, wkndTasks:{}, houseData: initHouseData(), empHours: initEmpHours(), schedOver:{}, nextId: 100 };
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
    localStorage.setItem('nv_state', JSON.stringify({ fuelDays, wkndTasks, houseData, empHours, schedOver, nextId }));
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
function dk(d) { return d.toISOString().split('T')[0]; }
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
function renderScheduleSelector(containerId, prefix, currentSchedule) {
  const c = document.getElementById(containerId);
  if (!c) return;
  // Determinar scope actual
  let curScope = 'finca';
  let curDay = '';
  let curFrom = 0, curTo = 1;
  if (currentSchedule) {
    curDay = currentSchedule.day || '';
    if (currentSchedule.from === null || currentSchedule.from === undefined) {
      curScope = 'day';
    } else {
      curScope = 'range';
      curFrom = currentSchedule.from;
      curTo = currentSchedule.to;
    }
  }
  // Fecha por defecto si no hay (hoy)
  if (!curDay) curDay = dk(new Date());

  c.innerHTML = `
    <div class="emp-pills" style="margin-bottom:10px">
      <div class="emp-pill${curScope==='finca'?' on':''}" id="${prefix}-scope-finca" onclick="setSchedScope('${prefix}','finca')">🏠 En esta finca</div>
      <div class="emp-pill${curScope==='day'?' on':''}" id="${prefix}-scope-day" onclick="setSchedScope('${prefix}','day')">🌞 Todo el día</div>
      <div class="emp-pill${curScope==='range'?' on':''}" id="${prefix}-scope-range" onclick="setSchedScope('${prefix}','range')">⏰ Hora concreta</div>
    </div>
    <div id="${prefix}-date-section" style="display:${curScope==='finca'?'none':'block'};margin-bottom:10px">
      <div class="field-label" style="margin-bottom:4px">Fecha</div>
      <input type="date" id="${prefix}-sched-day" value="${curDay}" style="width:100%;border:1px solid var(--border);border-radius:var(--radius-md);padding:7px 9px;font-size:13px;background:var(--bg-secondary);color:var(--text-primary)">
    </div>
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
  document.getElementById(`${prefix}-date-section`).style.display = scope === 'finca' ? 'none' : 'block';
  document.getElementById(`${prefix}-range-section`).style.display = scope === 'range' ? 'block' : 'none';
}
function readScheduleFromSelector(prefix) {
  const scope = window['_schedScope_' + prefix] || 'finca';
  if (scope === 'finca') return null;
  const day = document.getElementById(`${prefix}-sched-day`).value;
  if (!day) return null;
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
  t.title = title;
  t.prio = prio;
  t.assigns = assigns;
  t.img = window._etPhotoData || null;
  t.schedule = readScheduleFromSelector('et');
  if (newFinca !== oldFinca) {
    houseData[oldFinca].tareas = houseData[oldFinca].tareas.filter(x => x.id !== id);
    houseData[newFinca].tareas.unshift(t);
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
        let b = ''; if (hasTasks(f)) b += `<span class="pip-t">!</span>`; if (hasNotes(f)) b += `<span class="pip-n">*</span>`;
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
        let inner = `<div class="cell-name">${escapeHtml(finca)}</div>`;
        if (tasks || notes) inner += `<div class="cell-badges">${tasks?`<div class="cb-t">!</div>`:''}${notes?`<div class="cb-n">*</div>`:''}</div>`;
        cell.innerHTML = inner;
        let pressTimer;
        cell.addEventListener('touchstart', e => {
          pressTimer = setTimeout(() => { pressTimer = 'fired'; openCellModal(date, hi); }, 500);
        });
        cell.addEventListener('touchend', e => {
          if (pressTimer === 'fired') { pressTimer = null; return; }
          clearTimeout(pressTimer); pressTimer = null;
          openHouse(finca);
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
  FINCAS.forEach(f => {
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
      el.innerHTML = `${selectMode?selBoxHtml:checkHtml}${thumbHtml}<div class="tinfo" ${tinfoClick}><div class="ttitle${t.done?' done':''}">${escapeHtml(t.title)}${photoIcon}</div><div class="tmeta"><span style="display:flex;align-items:center;gap:2px"><div style="width:7px;height:7px;border-radius:2px;background:${FCOL[f]}"></div>${escapeHtml(f)}</span>${aHtml}</div></div><span class="tbadge ${t.prio==='urgent'?'b-u':'b-n'}">${t.prio==='urgent'?'Urgente':'Normal'}</span>`;
      vv.appendChild(el);
    });
  });
  if (!any) { const el = document.createElement('div'); el.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:8px 0'; el.textContent = 'Sin tareas en esta vista.'; vv.appendChild(el); }
  const box = document.createElement('div'); box.className = 'add-task-box';
  box.innerHTML = `<div class="field-label">Nueva tarea</div><input id="gt-title" placeholder="Descripción..."><div class="assign-row"><span class="assign-label">Asignar a:</span><div class="emp-pills" id="gt-pills"></div></div><div class="add-task-row"><select id="gt-finca"><option value="">— Finca —</option>${FINCAS.map(f=>`<option>${f}</option>`).join('')}</select><select id="gt-prio"><option value="normal">Normal</option><option value="urgent">Urgente</option></select><button class="btn-send" onclick="addGlobalTask()">Enviar →</button></div>`;
  vv.appendChild(box);
  renderEmpPills('gt-pills', newTaskAssigns);
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
function toggleGT(f, id) { const t = houseData[f].tareas.find(x => x.id === id); if (t) { t.done = !t.done; saveState(); buildTareas(); } }
function bulkDone() { selectedTasks.forEach(tid => { const [f, idStr] = tid.split('::'); const t = houseData[f] && houseData[f].tareas.find(x => x.id === +idStr); if (t) t.done = true; }); selectedTasks.clear(); selectMode = false; saveState(); buildTareas(); showToast('✅ Hechas'); }
function bulkDelete() { if (!confirm('¿Borrar las tareas seleccionadas?')) return; selectedTasks.forEach(tid => { const [f, idStr] = tid.split('::'); if (houseData[f]) houseData[f].tareas = houseData[f].tareas.filter(x => x.id !== +idStr); }); selectedTasks.clear(); selectMode = false; saveState(); buildTareas(); showToast('🗑 Eliminadas'); }
function addGlobalTask() {
  const title = document.getElementById('gt-title').value.trim();
  const finca = document.getElementById('gt-finca').value;
  const prio = document.getElementById('gt-prio').value;
  if (!title) { showToast('Escribe una tarea'); return; }
  if (!finca) { showToast('Elige una finca'); return; }
  const assigns = Array.from(newTaskAssigns);
  houseData[finca].tareas.unshift({ id: nextId++, title, prio, done: false, assigns });
  newTaskAssigns.clear();
  saveState();
  buildTareas();
  showToast(`✅ Añadida en ${finca}`);
}

// ===== DETALLE CASA =====
function openHouse(finca) {
  currentHouse = finca; currentTab = 'tareas';
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
const TABS = ['semana','mes','tareas','equipo'];
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
}

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => switchMain(tab.dataset.tab));
});

// arranque: solo si hay sesión activa pinta la semana
if (isLoggedIn()) {
  buildWeek();
}
