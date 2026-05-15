/* ===== Natura Viva Gardens — lógica de la app ===== */

const FINCAS = ['Tonyna','Tagomago','Seahouse','Greco','Batle Bujosa','Cabrera','Sa Vinya','Can Borras',"Puig de s'Espart",'Miró','Gerret','Alzina'];
const EMPLEADOS = ['Jose R.','Alejo','Cristian'];
const FCLS = {Tonyna:'c-tonyna',Tagomago:'c-tagomago',Seahouse:'c-seahouse',Greco:'c-greco','Batle Bujosa':'c-batle',Cabrera:'c-cabrera','Sa Vinya':'c-savinya','Can Borras':'c-borras',"Puig de s'Espart":'c-puig','Miró':'c-miro',Gerret:'c-gerret',Alzina:'c-alzina'};
const FCOL = {Tonyna:'#ffc5c5',Tagomago:'#e8b4d8',Seahouse:'#b8d0f0',Greco:'#f5d9b0','Batle Bujosa':'#b8d8f0',Cabrera:'#c8c870','Sa Vinya':'#90d0b8','Can Borras':'#a8e0a8',"Puig de s'Espart":'#e0c898','Miró':'#c8b0e0',Gerret:'#ffd098',Alzina:'#c8e0a8'};
const DKEYS = ['lunes','martes','miercoles','jueves','viernes','sabado','domingo'];
const DLABELS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const HOURS = ['8:00','9:00','10:00','11:00','12:00','13:00','14:00','15:00'];
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

const BASE = {
  lunes: ['Tonyna','Tonyna','Tonyna','Tonyna','Tagomago','Tagomago','Seahouse','Gerret'],
  martes: ['Greco','Greco','Greco','Greco','Greco','Greco','Greco','Greco'],
  miercoles: ['Batle Bujosa','Batle Bujosa','Batle Bujosa','Cabrera','Cabrera','Sa Vinya','Sa Vinya','Sa Vinya'],
  jueves: ['Tagomago','Tagomago','Can Borras','Can Borras','Can Borras',"Puig de s'Espart","Puig de s'Espart",'Alzina'],
  viernes: ['Miró','Miró','Miró','Miró','Miró','Miró','Miró','Miró'],
  sabado: [null,null,null,null,null,null,null,null],
  domingo: [null,null,null,null,null,null,null,null]
};

// ===== ESTADO (con persistencia en localStorage) =====
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem('nv_state') || '{}');
    return {
      fuelDays: s.fuelDays || {},
      wkndTasks: s.wkndTasks || {},
      houseData: s.houseData || initHouseData(),
      nextId: s.nextId || 100
    };
  } catch(e) {
    return { fuelDays: {}, wkndTasks: {}, houseData: initHouseData(), nextId: 100 };
  }
}
function initHouseData() {
  const hd = {};
  FINCAS.forEach(f => { hd[f] = { notas: [], tareas: [] }; });
  hd['Tagomago'].tareas = [
    {id:1,title:'Revisar sistema de riego',prio:'urgent',done:false,assigns:['Jose R.','Alejo']},
    {id:2,title:'Podar palmera entrada',prio:'normal',done:false,assigns:['Alejo']}
  ];
  hd['Can Borras'].notas = [{text:'El perro está suelto\nEntrar con cuidado.',date:'12 may',img:null}];
  hd['Tonyna'].tareas = [{id:3,title:'Abonar seto trasero',prio:'normal',done:true,assigns:['Cristian']}];
  return hd;
}
function saveState() {
  try {
    localStorage.setItem('nv_state', JSON.stringify({ fuelDays, wkndTasks, houseData, nextId }));
  } catch(e) { console.log('No se pudo guardar:', e); }
}

const _s = loadState();
let fuelDays = _s.fuelDays;
let wkndTasks = _s.wkndTasks;
let houseData = _s.houseData;
let nextId = _s.nextId;

let weekOff = 0, monthOff = 0, fuelMonthOff = 0;
let currentHouse = null, currentTab = 'notas';
let taskFilter = 'all', selectMode = false;
let selectedTasks = new Set();
let newTaskAssigns = new Set();
let newTaskAssignsHouse = new Set();
let modalKey = '', modalLabel = '';
const wkBase = new Date(2026, 4, 11);

// ===== UTILIDADES =====
function dk(d) { return d.toISOString().split('T')[0]; }
function getWeekDates(off) { return DKEYS.map((_,i) => { const d = new Date(wkBase); d.setDate(d.getDate() + off*7 + i); return d; }); }
function isToday(d) { const t = new Date(); return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear(); }
function isWE(d) { return d.getDay() === 0 || d.getDay() === 6; }
function hasTasks(f) { return houseData[f] && houseData[f].tareas.some(t => !t.done); }
function hasNotes(f) { return houseData[f] && houseData[f].notas.length > 0; }
function showToast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2300); }
function refreshCals() {
  if (document.getElementById('view-mes').style.display !== 'none') buildMonth();
  if (document.getElementById('view-semana').style.display !== 'none') buildWeek();
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// ===== MODAL FIN DE SEMANA =====
function openWkndModal(key, label) {
  modalKey = key; modalLabel = label;
  const old = document.getElementById('wknd-modal');
  if (old) old.remove();
  const ov = document.createElement('div');
  ov.className = 'modal-overlay';
  ov.id = 'wknd-modal';
  const tasks = wkndTasks[key] || [];
  const listHtml = tasks.length ? tasks.map((t,i) => `
    <div class="modal-item">
      <div class="modal-check${t.done?' done':''}" onclick="toggleWknd('${key}',${i})">${t.done?'✓':''}</div>
      <div class="modal-item-text${t.done?' done-item':''}">${escapeHtml(t.text)}</div>
      <button class="del-btn" onclick="removeWknd('${key}',${i})">×</button>
    </div>`).join('') : '<div style="font-size:11px;color:var(--text-tertiary);margin-bottom:6px">Sin tareas todavía.</div>';
  ov.innerHTML = `<div class="modal-box">
    <div class="modal-title">📅 ${escapeHtml(label)}</div>
    <div class="modal-list">${listHtml}</div>
    <textarea id="wknd-in" placeholder="Escribe en varias líneas si lo necesitas..."></textarea>
    <div class="modal-btns">
      <div class="btn-cancel" onclick="closeWkndModal()">Cerrar</div>
      <div class="btn-ok" onclick="addWkndTask()">Añadir</div>
    </div>
  </div>`;
  document.body.appendChild(ov);
  ov.onclick = e => { if (e.target === ov) closeWkndModal(); };
  setTimeout(() => { const ta = document.getElementById('wknd-in'); if (ta) ta.focus(); }, 40);
}
function closeWkndModal() { const m = document.getElementById('wknd-modal'); if (m) m.remove(); }
function addWkndTask() {
  const txt = document.getElementById('wknd-in').value.trim();
  if (!txt) { showToast('Escribe algo'); return; }
  if (!wkndTasks[modalKey]) wkndTasks[modalKey] = [];
  wkndTasks[modalKey].push({ text: txt, done: false });
  saveState();
  openWkndModal(modalKey, modalLabel);
  refreshCals();
  showToast('✅ Añadido');
}
function toggleWknd(key, idx) { wkndTasks[key][idx].done = !wkndTasks[key][idx].done; saveState(); openWkndModal(key, modalLabel); refreshCals(); }
function removeWknd(key, idx) { wkndTasks[key].splice(idx, 1); saveState(); openWkndModal(key, modalLabel); refreshCals(); }

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
      const uniq = [...new Set((BASE[DKEYS[dow]] || []).filter(Boolean))];
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

// ===== SEMANA =====
function buildWeek() {
  const vv = document.getElementById('view-semana'); vv.innerHTML = '';
  const dates = getWeekDates(weekOff);
  const s = dates[0], e = dates[6];
  const title = s.getMonth() === e.getMonth() ? `${s.getDate()}–${e.getDate()} ${MS[e.getMonth()]} ${s.getFullYear()}` : `${s.getDate()} ${MS[s.getMonth()]} – ${e.getDate()} ${MS[e.getMonth()]}`;
  const wn = Math.floor((dates[4] - new Date(2026, 0, 2)) / (7 * 86400000));
  if (wn % 2 === 0) { const r = document.createElement('div'); r.className = 'reminder'; r.innerHTML = `🔧 <span><strong>Este viernes:</strong> limpiar herramientas y furgoneta</span>`; vv.appendChild(r); }
  const wnr = document.createElement('div'); wnr.className = 'week-nav-row';
  wnr.innerHTML = `<div style="display:flex;align-items:center;gap:7px"><button class="mnav-btn" onclick="weekOff--;buildWeek()">‹</button><div class="week-title">Semana ${title}</div><button class="mnav-btn" onclick="weekOff++;buildWeek()">›</button></div>`;
  vv.appendChild(wnr);
  const wrap = document.createElement('div'); wrap.className = 'cal-wrap';
  const grid = document.createElement('div'); grid.className = 'cal-grid';
  grid.appendChild(document.createElement('div'));
  dates.forEach((d,i) => {
    const h = document.createElement('div');
    h.className = 'chdr' + (isToday(d) ? ' today-c' : '') + (isWE(d) ? ' weekend-c' : '');
    h.innerHTML = `<div class="chdr-day">${DLABELS[i]}</div><div class="chdr-date">${d.getDate()}/${d.getMonth()+1}</div>`;
    grid.appendChild(h);
  });
  HOURS.forEach((hr, hi) => {
    const ts = document.createElement('div'); ts.className = 'tslot'; ts.textContent = hr; grid.appendChild(ts);
    DKEYS.forEach((day, di) => {
      const date = dates[di]; const finca = BASE[day][hi] || null;
      const cell = document.createElement('div'); const isWknd = di >= 5;
      if (isWknd) {
        cell.className = 'ccell c-wknd';
        if (hi === 0) {
          const wt = wkndTasks[dk(date)] || [];
          if (wt.length) { const txt = wt[0].text + (wt.length > 1 ? ` (+${wt.length-1})` : ''); cell.innerHTML = `<div class="wknd-cell-text">${escapeHtml(txt)}</div>`; }
          else cell.innerHTML = `<div class="wknd-add-lbl">+ añadir</div>`;
        } else {
          cell.style.cssText = 'border-radius:4px;height:30px;background:#f6faf4;border:1px solid #daecd2;cursor:pointer;min-width:0;overflow:hidden';
        }
        cell.onclick = () => openWkndModal(dk(date), `${DLABELS[di]} ${date.getDate()} ${MS[date.getMonth()]}`);
      } else {
        cell.className = 'ccell ' + (finca ? FCLS[finca] || 'c-libre' : 'c-libre');
        const tasks = finca && hasTasks(finca), notes = finca && hasNotes(finca);
        let inner = `<div class="cell-name">${escapeHtml(finca||'')}</div>`;
        if (finca && (tasks || notes)) inner += `<div class="cell-badges">${tasks?`<div class="cb-t">!</div>`:''}${notes?`<div class="cb-n">*</div>`:''}</div>`;
        cell.innerHTML = inner;
        if (finca) cell.onclick = () => openHouse(finca);
      }
      grid.appendChild(cell);
    });
  });
  wrap.appendChild(grid); vv.appendChild(wrap);
}

// ===== COMBUSTIBLE =====
function buildFuel() {
  const vv = document.getElementById('view-combustible'); vv.innerHTML = '';
  const now = new Date(new Date().getFullYear(), new Date().getMonth() + fuelMonthOff, 1);
  const hdr = document.createElement('div'); hdr.className = 'fuel-month-nav';
  hdr.innerHTML = `<button class="mnav-btn" onclick="fuelMonthOff--;buildFuel()">‹</button><div style="font-size:13px;font-weight:500">⛽ ${MONTHS[now.getMonth()]} ${now.getFullYear()}</div><button class="mnav-btn" onclick="fuelMonthOff++;buildFuel()">›</button>`;
  vv.appendChild(hdr);
  const grid = document.createElement('div'); grid.className = 'fuel-month-grid';
  ['Lu','Ma','Mi','Ju','Vi','Sá','Do'].forEach(d => { const h = document.createElement('div'); h.className = 'fuel-day-hdr'; h.textContent = d; grid.appendChild(h); });
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const startDow = (first.getDay() + 6) % 7;
  const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  for (let i = 0; i < startDow; i++) { const d = document.createElement('div'); d.className = 'fuel-day-cell other'; grid.appendChild(d); }
  let fueled = 0;
  for (let day = 1; day <= dim; day++) {
    const date = new Date(now.getFullYear(), now.getMonth(), day);
    const key = dk(date); const isFueled = !!fuelDays[key]; if (isFueled) fueled++;
    const cell = document.createElement('div'); cell.className = 'fuel-day-cell' + (isFueled ? ' fueled' : '');
    cell.innerHTML = `<div class="fuel-day-num">${day}</div>${isFueled ? '<div style="font-size:14px">⛽</div>' : ''}`;
    cell.onclick = () => { fuelDays[key] = !fuelDays[key]; saveState(); buildFuel(); if (fuelDays[key]) showToast('⛽ Repostaje registrado'); };
    grid.appendChild(cell);
  }
  const total = startDow + dim; const rem = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 0; i < rem; i++) { const d = document.createElement('div'); d.className = 'fuel-day-cell other'; grid.appendChild(d); }
  vv.appendChild(grid);
  const sum = document.createElement('div'); sum.className = 'fuel-summary';
  sum.innerHTML = `⛽ Este mes: <strong>${fueled} repostaje${fueled !== 1 ? 's' : ''}</strong>`;
  vv.appendChild(sum);
}

// ===== EQUIPO =====
function buildEquipo() {
  const vv = document.getElementById('view-equipo'); vv.innerHTML = '';
  [{init:'JR',name:'Jose R.',zones:'Lunes, Jueves',active:true},{init:'AL',name:'Alejo',zones:'Martes, Miércoles',active:true},{init:'CR',name:'Cristian',zones:'Viernes',active:false}].forEach(e => {
    let p = 0; FINCAS.forEach(f => { houseData[f].tareas.forEach(t => { if (!t.done && (t.assigns || []).includes(e.name)) p++; }); });
    const el = document.createElement('div'); el.className = 'emp-card';
    el.innerHTML = `<div class="emp-av">${e.init}</div><div style="flex:1"><div class="emp-name">${e.name}</div><div class="emp-zone">${e.zones}</div></div>${p?`<span class="notif-b">${p} tarea${p>1?'s':''}</span>`:''}<div class="emp-dot ${e.active?'dot-on':'dot-off'}"></div>`;
    vv.appendChild(el);
  });
  const lbl = document.createElement('div'); lbl.className = 'sec-lbl'; lbl.textContent = 'Pendientes por finca'; vv.appendChild(lbl);
  let any = false;
  FINCAS.forEach(f => {
    const p = houseData[f].tareas.filter(t => !t.done); if (!p.length) return; any = true;
    const el = document.createElement('div'); el.className = 'pending-row';
    el.innerHTML = `<div style="width:8px;height:8px;border-radius:2px;background:${FCOL[f]};flex-shrink:0"></div><div style="font-size:12px;font-weight:500;flex:1">${escapeHtml(f)}</div><span class="notif-b">${p.length}</span>`;
    el.onclick = () => openHouse(f); vv.appendChild(el);
  });
  if (!any) { const el = document.createElement('div'); el.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:6px 0'; el.textContent = 'Sin tareas pendientes.'; vv.appendChild(el); }
}

// ===== TAREAS =====
function buildTareas() {
  const vv = document.getElementById('view-tareas'); vv.innerHTML = '';
  if (selectMode && selectedTasks.size > 0) {
    const bar = document.createElement('div'); bar.className = 'bulk-bar';
    bar.innerHTML = `<span><strong>${selectedTasks.size}</strong> seleccionada${selectedTasks.size>1?'s':''}</span><button class="bulk-btn" onclick="bulkDone()">✓ Marcar hechas</button><button class="bulk-btn" onclick="bulkDelete()">✕ Eliminar</button><button class="bulk-btn" style="margin-left:auto" onclick="selectMode=false;selectedTasks.clear();buildTareas()">Cancelar</button>`;
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
      el.innerHTML = `${selectMode?selBoxHtml:checkHtml}<div class="tinfo"><div class="ttitle${t.done?' done':''}">${escapeHtml(t.title)}</div><div class="tmeta"><span style="display:flex;align-items:center;gap:2px"><div style="width:7px;height:7px;border-radius:2px;background:${FCOL[f]}"></div>${escapeHtml(f)}</span>${aHtml}</div></div><span class="tbadge ${t.prio==='urgent'?'b-u':'b-n'}">${t.prio==='urgent'?'Urgente':'Normal'}</span>`;
      vv.appendChild(el);
    });
  });
  if (!any) { const el = document.createElement('div'); el.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:8px 0'; el.textContent = 'Sin tareas en esta vista.'; vv.appendChild(el); }
  const box = document.createElement('div'); box.className = 'add-task-box';
  box.innerHTML = `<div style="font-size:10px;font-weight:500;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">Nueva tarea</div><input id="gt-title" placeholder="Descripción..."><div class="assign-row"><span class="assign-label">Asignar a:</span><div class="emp-pills" id="gt-pills"></div></div><div class="add-task-row"><select id="gt-finca"><option value="">— Finca —</option>${FINCAS.map(f=>`<option>${f}</option>`).join('')}</select><select id="gt-prio"><option value="normal">Normal</option><option value="urgent">Urgente</option></select><button class="btn-send" onclick="addGlobalTask()">Enviar →</button></div>`;
  vv.appendChild(box);
  renderEmpPills('gt-pills', newTaskAssigns);
}

function renderEmpPills(containerId, setRef) {
  const c = document.getElementById(containerId); if (!c) return; c.innerHTML = '';
  EMPLEADOS.forEach(name => {
    const isOn = setRef.has(name);
    const p = document.createElement('div'); p.className = 'emp-pill' + (isOn?' on':'');
    p.innerHTML = `${isOn?'✓ ':''}${name}`;
    p.onclick = () => { if (setRef.has(name)) setRef.delete(name); else setRef.add(name); renderEmpPills(containerId, setRef); };
    c.appendChild(p);
  });
}

function toggleGT(f, id) { const t = houseData[f].tareas.find(x => x.id === id); if (t) { t.done = !t.done; saveState(); buildTareas(); } }
function bulkDone() { selectedTasks.forEach(tid => { const [f, idStr] = tid.split('::'); const t = houseData[f] && houseData[f].tareas.find(x => x.id === +idStr); if (t) t.done = true; }); selectedTasks.clear(); selectMode = false; saveState(); buildTareas(); showToast('✅ Marcadas como hechas'); }
function bulkDelete() { selectedTasks.forEach(tid => { const [f, idStr] = tid.split('::'); if (houseData[f]) houseData[f].tareas = houseData[f].tareas.filter(x => x.id !== +idStr); }); selectedTasks.clear(); selectMode = false; saveState(); buildTareas(); showToast('🗑 Eliminadas'); }
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
  showToast(`✅ Añadida${assigns.length?' · '+assigns.length+' asignado'+(assigns.length>1?'s':''):''}`);
}

// ===== DETALLE CASA =====
function openHouse(finca) {
  currentHouse = finca; currentTab = 'notas';
  ['mes','semana','combustible','equipo','tareas'].forEach(v => document.getElementById('view-'+v).style.display = 'none');
  document.getElementById('nav-tabs').style.display = 'none';
  document.getElementById('view-casa').style.display = 'block';
  renderHouse();
}
function renderHouse() {
  const vv = document.getElementById('view-casa'); vv.innerHTML = '';
  const f = currentHouse; const col = FCOL[f] || '#ccc';
  const back = document.createElement('div'); back.className = 'hv-back';
  back.innerHTML = `‹ Volver`;
  back.onclick = () => { document.getElementById('nav-tabs').style.display = 'flex'; document.getElementById('view-casa').style.display = 'none'; document.getElementById('view-semana').style.display = 'block'; buildWeek(); };
  vv.appendChild(back);
  let slots = '';
  DKEYS.forEach((day, di) => { const hrs = []; BASE[day].forEach((s, hi) => { if (s === f) hrs.push(hi); }); if (hrs.length) { const t = `${HOURS[hrs[0]]}–${hrs[hrs.length-1]<7?HOURS[hrs[hrs.length-1]+1]:'16:00'}`; slots += `${DLABELS[di]} ${t}  `; } });
  const hdr2 = document.createElement('div'); hdr2.className = 'hv-header';
  hdr2.innerHTML = `<div class="hv-color" style="background:${col}"></div><div><div class="hv-name">${escapeHtml(f)}</div><div class="hv-time">${escapeHtml(slots.trim() || 'Sin horario fijo')}</div></div>`;
  vv.appendChild(hdr2);
  const tabs = document.createElement('div'); tabs.className = 'tabs2';
  [{k:'notas',label:'📝 Notas y fotos'},{k:'tareas',label:'✓ Tareas'}].forEach(({k,label}) => {
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
    el.innerHTML = `<div class="nota-text">${escapeHtml(n.text)}</div><div class="nota-meta">🕐 ${escapeHtml(n.date)}</div>`;
    vv.appendChild(el);
  });
  const box = document.createElement('div'); box.className = 'add-box';
  box.innerHTML = `<div style="font-size:10px;font-weight:500;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">Nueva nota</div><textarea id="nota-in" placeholder="Escribe en varias líneas..."></textarea><div class="box-btns"><button class="btn-save" onclick="saveNota('${f}')">Guardar</button></div>`;
  vv.appendChild(box);
}
function saveNota(f) {
  const txt = document.getElementById('nota-in').value.trim();
  if (!txt) { showToast('Escribe algo'); return; }
  const d = new Date();
  houseData[f].notas.unshift({ text: txt, date: `${d.getDate()} ${MS[d.getMonth()]}`, img: null });
  saveState();
  renderHouse();
  showToast('✅ Guardada');
}
function renderTareasFinca(vv, f) {
  const tareas = houseData[f].tareas;
  if (!tareas.length) { const el = document.createElement('div'); el.style.cssText = 'font-size:12px;color:var(--text-tertiary);padding:8px 0 10px'; el.textContent = 'Sin tareas.'; vv.appendChild(el); }
  tareas.forEach(t => {
    const el = document.createElement('div'); el.className = 'task-item';
    const assigns = (t.assigns || []);
    const aHtml = assigns.length ? `👤 ${escapeHtml(assigns.join(', '))}` : '';
    el.innerHTML = `<div class="tcheck${t.done?' done':''}" onclick="toggleT('${f}',${t.id})">${t.done?'✓':''}</div><div class="tinfo"><div class="ttitle${t.done?' done':''}">${escapeHtml(t.title)}</div><div class="tmeta">${aHtml}</div></div><span class="tbadge ${t.prio==='urgent'?'b-u':'b-n'}">${t.prio==='urgent'?'Urgente':'Normal'}</span>`;
    vv.appendChild(el);
  });
  const box = document.createElement('div'); box.className = 'add-box';
  box.innerHTML = `<div style="font-size:10px;font-weight:500;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">Nueva tarea</div><input id="task-in" placeholder="Descripción..."><div class="assign-row"><span class="assign-label">Asignar a:</span><div class="emp-pills" id="house-pills"></div></div><div class="box-btns"><select id="task-prio"><option value="normal">Normal</option><option value="urgent">Urgente</option></select><button class="btn-save" onclick="addTarea('${f}')">Enviar →</button></div>`;
  vv.appendChild(box);
  newTaskAssignsHouse.clear();
  renderEmpPills('house-pills', newTaskAssignsHouse);
}
function toggleT(f, id) { const t = houseData[f].tareas.find(x => x.id === id); if (t) { t.done = !t.done; saveState(); renderHouse(); } }
function addTarea(f) {
  const title = document.getElementById('task-in').value.trim();
  const prio = document.getElementById('task-prio').value;
  if (!title) { showToast('Escribe una tarea'); return; }
  const assigns = Array.from(newTaskAssignsHouse);
  houseData[f].tareas.unshift({ id: nextId++, title, prio, done: false, assigns });
  newTaskAssignsHouse.clear();
  saveState();
  renderHouse();
  showToast(`✅ Enviada${assigns.length?' · '+assigns.length+' asignado'+(assigns.length>1?'s':''):''}`);
}

// ===== NAVEGACIÓN =====
const TABS = ['mes','semana','combustible','equipo','tareas'];
function switchMain(tab) {
  TABS.forEach((t, i) => {
    document.getElementById('view-' + t).style.display = 'none';
    document.querySelectorAll('.nav-tab')[i].classList.remove('active');
  });
  document.getElementById('view-casa').style.display = 'none';
  document.getElementById('nav-tabs').style.display = 'flex';
  document.getElementById('view-' + tab).style.display = 'block';
  document.querySelectorAll('.nav-tab')[TABS.indexOf(tab)].classList.add('active');
  if (tab === 'mes') buildMonth();
  if (tab === 'semana') buildWeek();
  if (tab === 'combustible') buildFuel();
  if (tab === 'equipo') buildEquipo();
  if (tab === 'tareas') buildTareas();
}

// listeners
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => switchMain(tab.dataset.tab));
});

// arranque
buildMonth();
