const token = localStorage.getItem('token');
if(!token && !location.pathname.includes('login') && !location.pathname.includes('register')) location.href='/login.html';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => '$' + Number(n || 0).toLocaleString('es-CL');
const safe = v => String(v ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

let state = { vehicles:[], repairs:[], quotes:[], oil:[], services:[], summary:null };
let filters = { dashboard:'', kanban:'', vehicles:'', quotes:'', oil:'', repairs:'', fichas:'', services:'', commercial:'' };
let dateFilters = { repairsFrom:'', repairsTo:'' };
let kanbanExpanded = new Set();

const api = async (url, opts={}) => {
  const r = await fetch('/api' + url, {
    ...opts,
    headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + token, ...(opts.headers || {}) }
  });
  const j = await r.json().catch(() => ({}));
  if(!r.ok){
    if(r.status === 401){ localStorage.clear(); location.href='/login.html'; return; }
    throw new Error(j.error || 'Error del servidor');
  }
  return j;
};

const showError = (e) => { console.error(e); alert(e.message || 'Ocurrió un error. Revisa los logs.'); };
async function deleteRecord(path, label, after){
  const ok = confirm(`¿Seguro que quieres eliminar ${label}? Esta acción no se puede deshacer.`);
  if(!ok) return;
  try{
    await api(path, { method:'DELETE' });
    await loadAll();
    if(typeof after === 'function') after();
  }catch(err){ showError(err); }
}


async function loadAll(){
  const [vehicles, repairs, quotes, oil, services, summary] = await Promise.all([
    api('/vehicles'), api('/repairs'), api('/quotes'), api('/oil-cards'), api('/service-reminders'), api('/dashboard/summary')
  ]);
  state = { vehicles, repairs, quotes, oil, services, summary };
}

function logout(){ localStorage.clear(); location.href='/login.html'; }
function nav(view){ $$('.nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view)); render(view); }
function openModal(html){ $('#modal').innerHTML = '<div class="modal-box">' + html + '</div>'; $('#modal').classList.add('open'); }
function closeModal(){ $('#modal').classList.remove('open'); }
document.addEventListener('click', e => { if(e.target.id === 'modal') closeModal(); });

function baseForm(title, fields, onsubmit){
  openModal(`<h2>${title}</h2><form id="f">${fields}<div class="actions"><button>Guardar</button><button type="button" class="ghost" onclick="closeModal()">Cerrar</button></div></form>`);
  $('#f').onsubmit = onsubmit;
}
function formData(form){ const o = Object.fromEntries(new FormData(form)); for(const k in o){ if(o[k] === '') delete o[k]; } return o; }
function badge(x){ return `<span class="pill">${safe(String(x || '').replace('_',' '))}</span>`; }
function table(rows, headers){
  return `<table class="table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function searchBox(view, label='Buscar por cliente, patente, marca o modelo'){
  return `<div class="searchbar"><span>🔎</span><input value="${safe(filters[view] || '')}" oninput="filters.${view}=this.value; render('${view}')" placeholder="${label}"></div>`;
}
function vehicleText(v){ return norm([v?.ownerName, v?.ownerPhone, v?.ownerEmail, v?.plate, v?.brand, v?.model, v?.year, v?.currentKm].join(' ')); }
function repairText(r){ return norm([r?.title, r?.status, r?.week, dateCL(r?.repairDate), dateCL(r?.deliveredAt), dateCL(r?.createdAt), r?.vehicle?.ownerName, r?.vehicle?.plate, r?.vehicle?.brand, r?.vehicle?.model, r?.vehicle?.ownerPhone, r?.diagnosis, r?.workDone].join(' ')); }
function quoteText(q){ return norm([q?.ownerName, q?.vehicleLabel, ...(q?.items || []).map(i => i.description)].join(' ')); }
function oilText(o){ return norm([o?.ownerName, o?.brand, o?.model, o?.year, o?.currentKm, o?.nextKm, o?.oilUsed].join(' ')); }
function serviceText(x){ return norm([x?.serviceType, x?.summary, x?.status, x?.vehicle?.ownerName, x?.vehicle?.ownerPhone, x?.vehicle?.plate, x?.vehicle?.brand, x?.vehicle?.model, x?.dueKm, x?.notes].join(' ')); }
function filterList(list, view, fn){ const q = norm(filters[view]); return q ? list.filter(x => fn(x).includes(q)) : list; }
function filterRepairsByDate(list){
  const from = dateFilters.repairsFrom ? new Date(dateFilters.repairsFrom + 'T00:00:00') : null;
  const to = dateFilters.repairsTo ? new Date(dateFilters.repairsTo + 'T23:59:59') : null;
  return list.filter(r => {
    const d = new Date(r.repairDate || r.deliveredAt || r.createdAt || Date.now());
    if(from && d < from) return false;
    if(to && d > to) return false;
    return true;
  });
}
function repairDateControls(){
  return `<div class="date-filters"><label>Desde <input type="date" value="${safe(dateFilters.repairsFrom)}" onchange="dateFilters.repairsFrom=this.value; render('repairs')"></label><label>Hasta <input type="date" value="${safe(dateFilters.repairsTo)}" onchange="dateFilters.repairsTo=this.value; render('repairs')"></label><button class="ghost mini" onclick="dateFilters.repairsFrom=''; dateFilters.repairsTo=''; render('repairs')">Limpiar fechas</button></div>`;
}

async function render(view='dashboard'){
  if(view === 'dashboard') return renderDashboard();
  if(view === 'kanban') return renderKanban();
  if(view === 'vehicles') return renderVehicles();
  if(view === 'quotes') return renderQuotes();
  if(view === 'oil') return renderOil();
  if(view === 'repairs') return renderRepairs();
  if(view === 'fichas') return renderFichas();
  if(view === 'services') return renderServices();
  if(view === 'commercial') return renderCommercial();
}

function renderDashboard(){
  const s = state.summary || { recent:[] };
  const recent = filterList(s.recent || [], 'dashboard', repairText);
  $('#content').innerHTML = `
    <div class="top"><div><h1>Panel BGarage</h1><p class="muted">Resumen general del taller</p></div><button onclick="loadAll().then(()=>renderDashboard())">Actualizar</button></div>
    ${searchBox('dashboard')}
    <div class="grid">
      <div class="card"><h3>Ingresos mes</h3><div class="stat">${money(s.monthIncome)}</div></div>
      <div class="card"><h3>Costos mes</h3><div class="stat">${money(s.monthCost)}</div></div>
      <div class="card"><h3>Utilidad mes</h3><div class="stat">${money(s.monthProfit)}</div></div>
      <div class="card"><h3>Entregados mes</h3><div class="stat">${s.deliveredThisMonth || 0}</div></div>
    </div>
    <h2>Últimos trabajos</h2>
    ${table(recent.map(r => [r.vehicle?.plate || '', r.vehicle ? `${safe(r.vehicle.brand || '')} ${safe(r.vehicle.model || '')}` : '', safe(r.title), badge(r.status), money(r.profit)]), ['Patente','Vehículo','Trabajo','Estado','Utilidad'])}`;
}

function renderVehicles(){
  const vehicles = filterList(state.vehicles, 'vehicles', vehicleText);
  $('#content').innerHTML = `<div class="top"><h1>Vehículos / Clientes</h1><button onclick="vehicleForm()">+ Nuevo vehículo</button></div>${searchBox('vehicles')}${table(vehicles.map(v => [safe(v.ownerName), safe(v.ownerPhone || ''), safe(v.plate || ''), `${safe(v.brand || '')} ${safe(v.model || '')}`, safe(v.year || ''), safe(v.currentKm || ''), `<button class="ghost" onclick="vehicleFicha('${v._id}')">Ficha</button> <button class="ghost" onclick="vehicleForm('${v._id}')">Editar</button> <button class="ghost danger" onclick="deleteRecord('/vehicles/${v._id}','este cliente/vehículo y sus datos vinculados',renderVehicles)">Eliminar</button>`]), ['Propietario','Teléfono','Patente','Vehículo','Año','KM',''])}`;
}
function vehicleForm(id){
  const v = state.vehicles.find(x => x._id === id) || {};
  baseForm(id ? 'Editar vehículo' : 'Nuevo vehículo', `
    <input name="ownerName" placeholder="Propietario" required value="${safe(v.ownerName || '')}">
    <input name="ownerPhone" placeholder="Teléfono" value="${safe(v.ownerPhone || '')}">
    <input name="ownerEmail" placeholder="Email" value="${safe(v.ownerEmail || '')}">
    <input name="plate" placeholder="Patente" value="${safe(v.plate || '')}">
    <input name="brand" placeholder="Marca" value="${safe(v.brand || '')}">
    <input name="model" placeholder="Modelo" value="${safe(v.model || '')}">
    <input name="year" type="number" placeholder="Año" value="${safe(v.year || '')}">
    <input name="currentKm" type="number" placeholder="KM actual" value="${safe(v.currentKm || '')}">
    <textarea name="notes" placeholder="Notas">${safe(v.notes || '')}</textarea>`,
    async e => { e.preventDefault(); try{ const data = formData(e.target); await api('/vehicles' + (id ? '/' + id : ''), { method:id?'PUT':'POST', body:JSON.stringify(data) }); closeModal(); await loadAll(); renderVehicles(); }catch(err){ showError(err); } }
  );
}

function carStatusIcon(status){
  return `<div class="car-status car-${safe(status)}" title="${safe(String(status || '').replace('_',' '))}">
    <svg viewBox="0 0 64 36" aria-hidden="true"><path d="M12 25h40c3.5 0 6-2.5 6-5.5v-3.2c0-2.4-1.8-4.4-4.2-4.8l-7.4-1.2-5.6-6.5A8 8 0 0 0 34.7 1H24a8 8 0 0 0-6.4 3.2l-4.5 6.1-5.5 1.1A5.8 5.8 0 0 0 3 17.1v2.4C3 22.5 5.5 25 9 25h3Z"/><path d="M20 10h10V6h-5.5c-1.4 0-2.8.7-3.6 1.8L20 10Zm15 0h9l-3.5-3.8A5 5 0 0 0 36.8 6H35v4Z" fill="rgba(255,255,255,.72)" stroke="none"/><circle cx="18" cy="26" r="6" fill="#23343a" stroke="none"/><circle cx="46" cy="26" r="6" fill="#23343a" stroke="none"/><circle cx="18" cy="26" r="2.4" fill="#fff" stroke="none"/><circle cx="46" cy="26" r="2.4" fill="#fff" stroke="none"/></svg>
  </div>`;
}
function renderKanban(){
  const repairs = filterList(state.repairs, 'kanban', repairText);
  const cols = [['presupuestado','Presupuestados'], ['en_reparacion','En reparación'], ['entregado','Entregados']];
  const card = (r) => {
    const expanded = kanbanExpanded.has(String(r._id));
    const details = expanded ? `<div class="kanban-details"><p>${safe(r.vehicle?.brand || '')} ${safe(r.vehicle?.model || '')}</p><p class="muted">Fecha ingreso: ${dateCL(r.createdAt)}</p><p class="muted">Último movimiento: ${dateCL(r.statusChangedAt || r.updatedAt || r.createdAt)}</p><p class="status-line">${badge(r.status)} <span>Utilidad: <b>${money(r.profit)}</b></span></p></div>` : '';
    return `<div class="card kanban-card ${expanded ? 'expanded' : 'compact'}">${carStatusIcon(r.status)}<h3>${safe(r.vehicle?.plate || 'Sin patente')}</h3><p class="kanban-title">${safe(r.title)}</p><p class="kanban-client">${safe(r.vehicle?.ownerName || '')}</p>${details}<div class="kanban-actions"><button class="ghost mini" onclick="toggleKanbanCard('${r._id}')">${expanded ? 'Reducir' : 'Ampliar'}</button><select onchange="moveRepair('${r._id}',this.value)"><option>mover a...</option><option value="presupuestado">Presupuestado</option><option value="en_reparacion">En reparación</option><option value="entregado">Entregado</option></select><button class="ghost mini" onclick="repairForm('${r._id}')">Ver / editar</button><button class="ghost danger mini" onclick="deleteRecord('/repairs/${r._id}','este informe del Kanban / historial',renderKanban)">Eliminar</button></div></div>`;
  };
  $('#content').innerHTML = `<div class="top"><h1>Kanban de reparaciones</h1><button class="add-only" title="Nuevo" onclick="repairForm()">+</button></div>${searchBox('kanban')}<div class="kanban">${cols.map(([key,title]) => `<div class="col"><h2>${title}</h2>${repairs.filter(r => r.status === key).map(card).join('')}</div>`).join('')}</div>`;
}
function toggleKanbanCard(id){
  id = String(id);
  if(kanbanExpanded.has(id)) kanbanExpanded.delete(id);
  else kanbanExpanded.add(id);
  renderKanban();
}
async function moveRepair(id,status){
  if(!status || status === 'mover a...') return;
  try{
    const payload = { status, statusChangedAt:new Date().toISOString() };
    if(status === 'entregado'){ payload.deliveredAt = new Date().toISOString(); payload.repairDate = new Date().toISOString(); }
    await api('/repairs/' + id, { method:'PUT', body:JSON.stringify(payload) });
    await loadAll();
    renderKanban();
    if(status === 'entregado') alert('Vehículo marcado como entregado. El informe de reparación queda disponible automáticamente en Reparaciones y en la ficha del vehículo.');
  }catch(err){ showError(err); }
}

function renderQuotes(){
  const quotes = filterList(state.quotes, 'quotes', quoteText);
  $('#content').innerHTML = `<div class="top"><h1>Presupuestos</h1><button class="add-only" title="Nuevo presupuesto" onclick="quoteForm()">+</button></div>${searchBox('quotes')}${table(quotes.map(q => [`N° ${quoteNumberDisplay(q)}`, safe(q.ownerName), safe(q.vehicleLabel), badge(q.status), money(q.total), `<button onclick="previewQuote('${q._id}')">Ver PDF</button> <button class="ghost" onclick="quotePDF('${q._id}')">Descargar</button> <button class="ghost" onclick="quoteForm('${q._id}')">Editar</button> <button class="ghost danger" onclick="deleteRecord('/quotes/${q._id}','este presupuesto',renderQuotes)">Eliminar</button>`]), ['N°','Cliente','Vehículo','Estado','Total',''])}`;
}
function quoteItemRow(description='', brief='', price=''){
  return `<div class="quote-item-row"><input name="itemDescription" placeholder="Item" value="${safe(description)}"><input name="itemBrief" placeholder="Breve descripción" value="${safe(brief)}"><input name="itemPrice" type="number" placeholder="Precio" value="${safe(price)}" oninput="recalcQuoteTotal()"><button type="button" class="ghost mini" onclick="this.closest('.quote-item-row').remove(); recalcQuoteTotal();">Quitar</button></div>`;
}
function addQuoteItem(description='', brief='', price=''){ $('#quoteItems').insertAdjacentHTML('beforeend', quoteItemRow(description, brief, price)); recalcQuoteTotal(); }
function recalcQuoteTotal(){
  const total = $$('input[name="itemPrice"]').reduce((s, el) => s + Number(el.value || 0), 0);
  const box = $('#quoteTotalPreview'); if(box) box.textContent = money(total);
}
function quoteForm(id){
  const q = state.quotes.find(x => x._id === id) || {};
  const itemRows = (q.items && q.items.length)
    ? q.items.map(i => quoteItemRow(i.description || '', i.brief || '', i.unitPrice || '')).join('')
    : quoteItemRow();

  baseForm(id ? 'Editar presupuesto profesional' : 'Nuevo presupuesto profesional', `
    <input name="ownerName" placeholder="Cliente" required value="${safe(q.ownerName || '')}">
    <input name="vehicleLabel" placeholder="Vehículo / patente" value="${safe(q.vehicleLabel || '')}">
    <div class="form-section-title">Items del presupuesto</div>
    <p class="muted small">Agrega cada línea con item, descripción breve y precio. El total se calcula automáticamente.</p>
    <div id="quoteItems">${itemRows}</div>
    <button type="button" class="ghost" onclick="addQuoteItem()">+ Agregar item</button>
    <div class="total-preview"><span>Total estimado</span><b id="quoteTotalPreview">$0</b></div>`,
    async e => {
      e.preventDefault();
      try{
        const fd = new FormData(e.target);
        const descriptions = fd.getAll('itemDescription');
        const briefs = fd.getAll('itemBrief');
        const prices = fd.getAll('itemPrice');
        const items = descriptions.map((description, idx) => ({
          description: String(description || '').trim(),
          brief: String(briefs[idx] || '').trim(),
          qty: 1,
          unitPrice: Number(prices[idx] || 0)
        })).filter(i => i.description || i.brief || i.unitPrice);
        const total = items.reduce((s,i) => s + Number(i.unitPrice || 0), 0);
        await api('/quotes' + (id ? '/' + id : ''), { method:id ? 'PUT' : 'POST', body:JSON.stringify({ ownerName:fd.get('ownerName'), vehicleLabel:fd.get('vehicleLabel'), items, subtotal:total, total }) });
        closeModal(); await loadAll(); renderQuotes();
      }catch(err){ showError(err); }
    }
  );
  recalcQuoteTotal();
}

function renderOil(){
  const oil = filterList(state.oil, 'oil', oilText);
  $('#content').innerHTML = `<div class="top"><h1>Tarjetas cambio de aceite</h1><button onclick="oilForm()">+ Nueva tarjeta</button></div>${searchBox('oil')}${table(oil.map(o => [safe(o.ownerName), `${safe(o.brand || '')} ${safe(o.model || '')}`, safe(o.currentKm), safe(o.nextKm), safe(o.oilUsed), `<button onclick="oilPDF('${o._id}')">PDF</button> <button class="ghost danger" onclick="deleteRecord('/oil-cards/${o._id}','esta tarjeta de cambio de aceite',renderOil)">Eliminar</button>`]), ['Propietario','Vehículo','KM actual','Próximo cambio','Aceite',''])}`;
}
function oilForm(){
  const options = state.vehicles.map(v => `<option value="${v._id}" data-owner="${safe(v.ownerName || '')}" data-brand="${safe(v.brand || '')}" data-model="${safe(v.model || '')}" data-year="${safe(v.year || '')}" data-km="${safe(v.currentKm || '')}">${safe(v.ownerName || '')} · ${safe(v.plate || '')} · ${safe(v.brand || '')} ${safe(v.model || '')}</option>`).join('');
  baseForm('Tarjeta cambio de aceite', `
    <select name="vehicle" onchange="fillOilVehicle(this)"><option value="">Seleccionar vehículo/cliente existente</option>${options}</select>
    <input name="ownerName" placeholder="Propietario">
    <input name="brand" placeholder="Marca">
    <input name="model" placeholder="Modelo">
    <input name="year" type="number" placeholder="Año">
    <input name="currentKm" type="number" placeholder="KM actual">
    <input name="nextKm" type="number" placeholder="Próximo cambio">
    <input name="oilUsed" placeholder="Aceite usado">
    <textarea name="notes" placeholder="Notas"></textarea>`, async e => {
      e.preventDefault();
      try{
        const data = formData(e.target);
        await api('/oil-cards', { method:'POST', body:JSON.stringify(data) });
        closeModal(); await loadAll(); renderOil();
      }catch(err){ showError(err); }
    });
}
function fillOilVehicle(select){
  const opt = select.selectedOptions && select.selectedOptions[0];
  if(!opt) return;
  const form = select.closest('form');
  const set = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if(el && !el.value) el.value = val || ''; };
  set('ownerName', opt.dataset.owner);
  set('brand', opt.dataset.brand);
  set('model', opt.dataset.model);
  set('year', opt.dataset.year);
  set('currentKm', opt.dataset.km);
}

function renderRepairs(){
  const repairs = filterRepairsByDate(filterList(state.repairs, 'repairs', repairText));
  $('#content').innerHTML = `<div class="top"><div><h1>Reparaciones</h1><p class="muted">Listado de reparaciones e informes descargables para respaldo del cliente.</p></div><button class="add-only" title="Nuevo informe" onclick="repairForm()">+</button></div>${searchBox('repairs')}${repairDateControls()}${table(repairs.map(r => [dateCL(r.repairDate || r.deliveredAt || r.createdAt), safe(r.vehicle?.ownerName || ''), safe(r.vehicle?.plate || ''), safe(r.title), badge(r.status), money(r.totalCharged), money(r.profit), `<button onclick="previewRepair('${r._id}')">Ver informe</button> <button class="ghost" onclick="repairPDF('${r._id}')">PDF</button> <button class="ghost" onclick="repairForm('${r._id}')">Editar</button> <button class="ghost" onclick="photoForm('${r._id}')">Fotos</button> <button class="ghost danger" onclick="deleteRecord('/repairs/${r._id}','esta reparación',renderRepairs)">Eliminar</button>`]), ['Fecha','Cliente','Patente','Trabajo','Estado','Cobrado','Utilidad',''])}`;
}
function repairForm(id){
  const r = state.repairs.find(x => x._id === id) || {};
  const currentVehicleId = String(r.vehicle?._id || r.vehicle || '');
  const options = state.vehicles.map(v => `<option value="${v._id}" ${currentVehicleId === String(v._id) ? 'selected' : ''}>${safe(v.ownerName || '')} · ${safe(v.plate || '')} · ${safe(v.brand || '')} ${safe(v.model || '')}</option>`).join('');
  const v = r.vehicle || {};
  baseForm(id ? 'Editar reparación' : 'Nueva reparación', `
    <div class="form-section-title">Cliente y vehículo</div>
    <select name="vehicle" onchange="fillRepairVehicle(this)"><option value="">Escribir cliente manualmente o seleccionar existente</option>${options}</select>
    <div class="manual-vehicle-grid">
      <input name="manualOwnerName" placeholder="Nombre cliente" value="${safe(v.ownerName || '')}">
      <input name="manualOwnerPhone" placeholder="Teléfono" value="${safe(v.ownerPhone || '')}">
      <input name="manualPlate" placeholder="Patente" value="${safe(v.plate || '')}">
      <input name="manualBrand" placeholder="Marca" value="${safe(v.brand || '')}">
      <input name="manualModel" placeholder="Modelo" value="${safe(v.model || '')}">
      <input name="manualYear" type="number" placeholder="Año" value="${safe(v.year || '')}">
      <input name="manualCurrentKm" type="number" placeholder="KM actual" value="${safe(v.currentKm || '')}">
    </div>
    <div class="form-section-title">Datos de reparación</div>
    <input name="repairDate" type="date" value="${r.repairDate ? new Date(r.repairDate).toISOString().slice(0,10) : new Date().toISOString().slice(0,10)}">
    <input name="title" placeholder="Título reparación" required value="${safe(r.title || '')}">
    <select name="status"><option value="presupuestado">Presupuestado</option><option value="en_reparacion" ${r.status === 'en_reparacion' ? 'selected' : ''}>En reparación</option><option value="entregado" ${r.status === 'entregado' ? 'selected' : ''}>Entregado</option></select>
    <input name="week" placeholder="Semana / fecha comprometida" value="${safe(r.week || '')}">
    <textarea name="diagnosis" placeholder="Diagnóstico">${safe(r.diagnosis || '')}</textarea>
    <textarea name="workDone" placeholder="Trabajos realizados">${safe(r.workDone || '')}</textarea>
    <textarea name="extraProblems" placeholder="Problemas adicionales / códigos">${safe(r.extraProblems || '')}</textarea>
    <input name="laborPrice" type="number" placeholder="Mano de obra cobrada" value="${safe(r.laborPrice || '')}">
    <input name="externalCosts" type="number" placeholder="Costos externos" value="${safe(r.externalCosts || '')}">
    <input name="totalCharged" type="number" placeholder="Total cobrado al cliente" value="${safe(r.totalCharged || '')}">
    <textarea name="partsText" placeholder="Repuestos: nombre | costo | precio venta"></textarea>`,
    async e => {
      e.preventDefault();
      try{
        const d = formData(e.target);
        const manualVehicle = {
          ownerName: d.manualOwnerName,
          ownerPhone: d.manualOwnerPhone,
          plate: d.manualPlate,
          brand: d.manualBrand,
          model: d.manualModel,
          year: d.manualYear,
          currentKm: d.manualCurrentKm
        };
        ['manualOwnerName','manualOwnerPhone','manualPlate','manualBrand','manualModel','manualYear','manualCurrentKm'].forEach(k => delete d[k]);
        if(!d.vehicle){
          if(!manualVehicle.ownerName) throw new Error('Selecciona un cliente existente o escribe el nombre del cliente.');
          const createdVehicle = await api('/vehicles', { method:'POST', body:JSON.stringify(manualVehicle) });
          d.vehicle = createdVehicle._id;
        } else if(id) {
          // Si se editan los datos manuales de un cliente existente, actualiza la ficha del vehículo.
          const clean = Object.fromEntries(Object.entries(manualVehicle).filter(([_,val]) => val !== undefined && val !== ''));
          if(Object.keys(clean).length) await api('/vehicles/' + d.vehicle, { method:'PUT', body:JSON.stringify(clean) });
        }
        if(d.partsText){ d.partsChanged = d.partsText.split('\n').filter(Boolean).map(line => { const [name,cost,sellPrice] = line.split('|').map(x => x.trim()); return { name, cost:Number(cost || 0), sellPrice:Number(sellPrice || 0) }; }); delete d.partsText; }
        if(d.repairDate) d.repairDate = new Date(d.repairDate + 'T12:00:00').toISOString();
        if(d.status === 'entregado' && !d.deliveredAt) d.deliveredAt = new Date().toISOString();
        await api('/repairs' + (id ? '/' + id : ''), { method:id?'PUT':'POST', body:JSON.stringify(d) });
        closeModal(); await loadAll(); renderRepairs();
      }catch(err){ showError(err); }
    }
  );
}
function fillRepairVehicle(select){
  const vehicle = state.vehicles.find(v => String(v._id) === String(select.value));
  if(!vehicle) return;
  const form = select.closest('form');
  const map = { manualOwnerName:vehicle.ownerName, manualOwnerPhone:vehicle.ownerPhone, manualPlate:vehicle.plate, manualBrand:vehicle.brand, manualModel:vehicle.model, manualYear:vehicle.year, manualCurrentKm:vehicle.currentKm };
  for(const [name,val] of Object.entries(map)){ const el = form.querySelector(`[name="${name}"]`); if(el) el.value = val || ''; }
}
function photoForm(id){
  openModal(`<h2>Subir fotos comprimidas</h2><p class="muted">Se comprimen antes de guardarlas. Si Cloudinary está configurado se suben a Cloudinary; si no, quedan guardadas comprimidas en la base de datos.</p><form id="pf"><input type="file" name="photos" accept="image/*" multiple><div class="upload-status" id="uploadStatus"><div class="upload-track"><div class="upload-fill" id="uploadFill"></div></div><p id="uploadText">Esperando fotos...</p></div><div class="actions"><button id="uploadBtn">Subir</button><button type="button" class="ghost" onclick="closeModal()">Cerrar</button></div></form>`);
  $('#pf').onsubmit = e => {
    e.preventDefault();
    const fileInput = e.target.querySelector('input[type="file"]');
    if(!fileInput.files.length){ alert('Selecciona al menos una foto.'); return; }
    const fd = new FormData(e.target);
    const fill = $('#uploadFill');
    const text = $('#uploadText');
    const btn = $('#uploadBtn');
    btn.disabled = true;
    text.textContent = 'Subiendo fotos... 0%';
    fill.style.width = '0%';
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/repairs/' + id + '/photos');
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
    xhr.upload.onprogress = ev => {
      if(ev.lengthComputable){
        const pct = Math.max(1, Math.round((ev.loaded / ev.total) * 100));
        fill.style.width = pct + '%';
        text.textContent = `Subiendo fotos... ${pct}%`;
      } else {
        fill.style.width = '55%';
        text.textContent = 'Subiendo fotos...';
      }
    };
    xhr.onload = async () => {
      let j = {}; try{ j = JSON.parse(xhr.responseText || '{}'); }catch(_){ }
      if(xhr.status >= 200 && xhr.status < 300){
        fill.style.width = '100%';
        text.textContent = `Foto subida correctamente. ${j.photos?.length || fileInput.files.length} archivo(s) guardado(s).`;
        btn.disabled = false;
        await loadAll();
        setTimeout(()=>{ closeModal(); renderRepairs(); }, 900);
      } else {
        btn.disabled = false;
        text.textContent = j.error || 'Error al subir fotos';
        alert(j.error || 'Error al subir fotos');
      }
    };
    xhr.onerror = () => {
      btn.disabled = false;
      text.textContent = 'Error de conexión al subir fotos.';
      alert('Error de conexión al subir fotos.');
    };
    xhr.send(fd);
  };
}


function dateCL(d){ return d ? new Date(d).toLocaleDateString('es-CL') : '-'; }
function quoteNumberDisplay(q){
  if(q?.quoteNumber) return Number(q.quoteNumber);
  const sorted = [...state.quotes].sort((a,b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const idx = sorted.findIndex(x => x._id === q?._id);
  return 1032 + Math.max(0, idx);
}
function daysUntil(d){ if(!d) return null; return Math.ceil((new Date(d).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000); }
function serviceBadge(s){
  const d = daysUntil(s.dueDate);
  if(s.status !== 'pendiente') return `<span class="pill">${safe(s.status)}</span>`;
  if(d !== null && d < 0) return `<span class="pill late">vencido</span>`;
  if(d !== null && d <= 14) return `<span class="pill warn">próximo</span>`;
  return `<span class="pill">pendiente</span>`;
}
function vehicleMatchesText(v, q){ return vehicleText(v).includes(norm(q)); }
function vehicleRelated(v){
  const vehicleLabel = norm([v.ownerName, v.plate, v.brand, v.model, v.year].join(' '));
  const repairs = state.repairs.filter(r => String(r.vehicle?._id || r.vehicle) === String(v._id)).sort((a,b) => new Date(b.repairDate || b.deliveredAt || b.createdAt || 0) - new Date(a.repairDate || a.deliveredAt || a.createdAt || 0));
  const quotes = state.quotes.filter(q => norm([q.ownerName, q.vehicleLabel].join(' ')).includes(norm(v.ownerName || '')) || norm(q.vehicleLabel || '').includes(norm(v.plate || '')));
  const oil = state.oil.filter(o => norm([o.ownerName,o.brand,o.model,o.year].join(' ')).includes(norm(v.ownerName || '')) || vehicleLabel.includes(norm([o.ownerName,o.brand,o.model].join(' '))));
  const services = state.services.filter(s => String(s.vehicle?._id || s.vehicle) === String(v._id));
  return { repairs, quotes, oil, services };
}
function renderFichas(){
  const vehicles = filterList(state.vehicles, 'fichas', vehicleText);
  $('#content').innerHTML = `<div class="top"><div><h1>Fichas de vehículo</h1><p class="muted">Historial completo por auto: presupuestos, reparaciones, fotos, costos, utilidad y próximos servicios.</p></div><button onclick="vehicleForm()">+ Nuevo vehículo</button></div>${searchBox('fichas')}
  <div class="grid">${vehicles.map(v => { const rel = vehicleRelated(v); const income = rel.repairs.reduce((s,r)=>s+Number(r.totalCharged||0),0); const profit = rel.repairs.reduce((s,r)=>s+Number(r.profit||0),0); const photos = rel.repairs.reduce((s,r)=>s+(r.photos?.length||0),0); return `<div class="card ficha-card"><h3>${safe(v.plate || 'Sin patente')} · ${safe(v.brand || '')} ${safe(v.model || '')}</h3><p><b>${safe(v.ownerName || '')}</b> · ${safe(v.ownerPhone || '')}</p><p class="muted">Año ${safe(v.year || '-')} · KM ${safe(v.currentKm || '-')}</p><div class="ficha-stats"><span>${rel.repairs.length} reparaciones</span><span>${rel.quotes.length} presupuestos</span><span>${photos} fotos</span><span>${money(profit)} utilidad</span></div><div class="actions"><button onclick="vehicleFicha('${v._id}')">Abrir ficha</button>${whatsappButton(v,'general')}</div></div>`; }).join('')}</div>`;
}
function vehicleFicha(id){
  const v = state.vehicles.find(x => String(x._id) === String(id)); if(!v) return;
  const rel = vehicleRelated(v);
  const totalIncome = rel.repairs.reduce((s,r)=>s+Number(r.totalCharged||0),0);
  const totalCost = rel.repairs.reduce((s,r)=>s+Number(r.totalCost||0),0);
  const totalProfit = rel.repairs.reduce((s,r)=>s+Number(r.profit||0),0);
  const photos = rel.repairs.flatMap(r => (r.photos||[]).map(p => ({...p, repairTitle:r.title})));
  openModal(`<h2>Ficha vehículo · ${safe(v.plate || 'Sin patente')}</h2>
    <div class="ficha-head"><div><h3>${safe(v.brand || '')} ${safe(v.model || '')} ${safe(v.year || '')}</h3><p><b>Cliente:</b> ${safe(v.ownerName || '')}</p><p><b>Teléfono:</b> ${safe(v.ownerPhone || '')}</p><p><b>KM actual:</b> ${safe(v.currentKm || '-')}</p></div><div class="actions ficha-actions">${whatsappButton(v,'general')}<button class="ghost" onclick="serviceForm('', '${v._id}')">+ Próx. servicio</button><button class="ghost" onclick="vehicleForm('${v._id}')">Editar datos</button></div></div>
    <div class="grid compact"><div class="card"><h3>Ingresos</h3><div class="stat">${money(totalIncome)}</div></div><div class="card"><h3>Costos</h3><div class="stat">${money(totalCost)}</div></div><div class="card"><h3>Utilidad</h3><div class="stat">${money(totalProfit)}</div></div></div>
    <h3>Próximos servicios</h3>${table(rel.services.map(s => [safe(s.serviceType), dateCL(s.dueDate), safe(s.dueKm || ''), serviceBadge(s), whatsappButton(v,'service',s)]), ['Servicio','Fecha','KM','Estado','WhatsApp'])}
    <h3>Historial de reparaciones</h3>${table(rel.repairs.map(r => [dateCL(r.deliveredAt || r.createdAt), safe(r.title), badge(r.status), money(r.totalCharged), money(r.totalCost), money(r.profit), `<button onclick="previewRepair('${r._id}')">Ver</button> <button class="ghost" onclick="repairPDF('${r._id}')">PDF</button>`]), ['Fecha','Trabajo','Estado','Cobrado','Costo','Utilidad',''])}
    <h3>Presupuestos</h3>${table(rel.quotes.map(q => [dateCL(q.createdAt), `N° ${quoteNumberDisplay(q)}`, safe(q.vehicleLabel), badge(q.status), money(q.total), `<button onclick="previewQuote('${q._id}')">Ver</button> <button class="ghost" onclick="quotePDF('${q._id}')">PDF</button>`]), ['Fecha','N°','Vehículo','Estado','Total',''])}
    <h3>Tarjetas aceite</h3>${table(rel.oil.map(o => [dateCL(o.date || o.createdAt), safe(o.oilUsed), safe(o.currentKm), safe(o.nextKm), `<button onclick="oilPDF('${o._id}')">PDF</button> <button class="ghost danger" onclick="deleteRecord('/oil-cards/${o._id}','esta tarjeta de cambio de aceite',renderOil)">Eliminar</button>`]), ['Fecha','Aceite','KM actual','Próximo KM',''])}
    <h3>Fotos de respaldo</h3><div class="photo-row">${photos.length ? photos.map(p => `<a href="${safe(p.url)}" target="_blank"><img src="${safe(p.url)}" title="${safe(p.repairTitle)}"></a>`).join('') : '<p class="muted">Sin fotos registradas.</p>'}</div>
    <div class="actions"><button type="button" class="ghost" onclick="closeModal()">Cerrar</button></div>`);
}
function whatsappClean(phone){ let p = String(phone || '').replace(/\D/g,''); if(!p) return ''; if(p.startsWith('0')) p = p.slice(1); if(!p.startsWith('56')) p = '56' + p; return p; }
function whatsappUrl(vehicle, type='general', service=null){
  const phone = whatsappClean(vehicle?.ownerPhone);
  const veh = `${vehicle?.brand || ''} ${vehicle?.model || ''} patente ${vehicle?.plate || ''}`.trim();
  let msg = `Hola ${vehicle?.ownerName || ''}, soy Bastian de BGarage. Te contacto por tu vehículo ${veh}.`;
  if(type === 'service' && service){ msg = `Hola ${vehicle?.ownerName || ''}, soy Bastian de BGarage. Según nuestro registro, tu ${veh} tiene pendiente ${service.serviceType || 'un próximo servicio'}${service.dueDate ? ' para el ' + dateCL(service.dueDate) : ''}${service.dueKm ? ' o cerca de los ' + service.dueKm + ' km' : ''}. ¿Quieres que coordinemos una revisión?`; }
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}` : '';
}
function whatsappButton(vehicle, type='general', service=null){
  const url = whatsappUrl(vehicle,type,service);
  if(!url) return `<button class="ghost" disabled>Sin teléfono</button>`;
  const click = service ? `onclick="markContacted('${service._id}')"` : '';
  return `<a class="btn whatsapp" target="_blank" href="${url}" ${click}>WhatsApp</a>`;
}
async function markContacted(id){ try{ const s = state.services.find(x => x._id === id); if(!s) return; await api('/service-reminders/' + id, { method:'PUT', body:JSON.stringify({ status:'contactado', lastContactedAt:new Date().toISOString() }) }); await loadAll(); }catch(e){ console.warn(e); } }
function renderServices(){
  const services = filterList(state.services, 'services', serviceText).sort((a,b) => new Date(a.dueDate || 8640000000000000) - new Date(b.dueDate || 8640000000000000));
  $('#content').innerHTML = `<div class="top"><div><h1>Próximo servicio</h1><p class="muted">Se genera automáticamente desde reparaciones entregadas y desde tarjetas de cambio de aceite. Agenda 6 meses y/o próximo kilometraje.</p></div><button onclick="serviceForm()">+ Servicio manual</button></div>${searchBox('services')}
    ${table(services.map(s => { const v = s.vehicle || {}; return [safe(v.ownerName || ''), safe(v.ownerPhone || ''), `${safe(v.plate || '')} · ${safe(v.brand || '')} ${safe(v.model || '')}`, safe(s.serviceType), dateCL(s.dueDate), safe(s.dueKm || ''), serviceBadge(s), whatsappButton(v,'service',s), `<button class="ghost" onclick="serviceForm('${s._id}')">Editar</button>`]; }), ['Cliente','Teléfono','Vehículo','Servicio','Fecha','KM','Estado','Contacto',''])}`;
}
function serviceForm(id='', vehicleId=''){
  const s = state.services.find(x => x._id === id) || {};
  const selectedVehicle = vehicleId || String(s.vehicle?._id || s.vehicle || '');
  const options = state.vehicles.map(v => `<option value="${v._id}" ${String(selectedVehicle) === String(v._id) ? 'selected' : ''}>${safe(v.ownerName || '')} · ${safe(v.plate || '')} · ${safe(v.brand || '')} ${safe(v.model || '')}</option>`).join('');
  baseForm(id ? 'Editar próximo servicio' : 'Nuevo próximo servicio', `
    <select name="vehicle" required><option value="">Seleccionar vehículo</option>${options}</select>
    <input name="serviceType" placeholder="Tipo de servicio" required value="${safe(s.serviceType || '')}">
    <input name="summary" placeholder="Resumen / motivo" value="${safe(s.summary || '')}">
    <input name="dueDate" type="date" value="${s.dueDate ? new Date(s.dueDate).toISOString().slice(0,10) : ''}">
    <input name="dueKm" type="number" placeholder="KM objetivo" value="${safe(s.dueKm || '')}">
    <select name="status"><option value="pendiente">Pendiente</option><option value="contactado" ${s.status === 'contactado' ? 'selected' : ''}>Contactado</option><option value="realizado" ${s.status === 'realizado' ? 'selected' : ''}>Realizado</option><option value="cancelado" ${s.status === 'cancelado' ? 'selected' : ''}>Cancelado</option></select>
    <textarea name="notes" placeholder="Notas internas">${safe(s.notes || '')}</textarea>`,
    async e => { e.preventDefault(); try{ const data = formData(e.target); data.source = s.source || 'manual'; await api('/service-reminders' + (id ? '/' + id : ''), { method:id?'PUT':'POST', body:JSON.stringify(data) }); closeModal(); await loadAll(); renderServices(); }catch(err){ showError(err); } }
  );
}

function renderCommercial(){
  const delivered = filterList(state.repairs.filter(r => r.status === 'entregado'), 'commercial', repairText);
  const income = delivered.reduce((s,r) => s + Number(r.totalCharged || 0), 0);
  const cost = delivered.reduce((s,r) => s + Number(r.totalCost || 0), 0);
  const profit = income - cost;
  const goal = Number(localStorage.getItem('bgarageProfitGoal') || 0);
  const pct = goal > 0 ? Math.min(100, Math.round((profit / goal) * 100)) : 0;
  $('#content').innerHTML = `
    <div class="top"><h1>Gestión comercial</h1></div>
    ${searchBox('commercial')}
    <div class="goal-card card">
      <div><h3>Meta de utilidad</h3><p class="muted">Ingresa una meta en dinero y BGarage calcula tu avance con la utilidad de vehículos entregados.</p></div>
      <div class="goal-form"><input id="goalInput" type="number" placeholder="Ej: 2000000" value="${goal || ''}"><button onclick="saveGoal()">Guardar meta</button></div>
      <div class="progress-wrap"><div class="progress-bar" style="width:${pct}%"></div></div>
      <div class="goal-numbers"><b>${money(profit)}</b><span>de ${goal ? money(goal) : 'meta no definida'} · ${pct}%</span></div>
    </div>
    <div class="grid"><div class="card"><h3>Ingresos entregados</h3><div class="stat">${money(income)}</div></div><div class="card"><h3>Costos entregados</h3><div class="stat">${money(cost)}</div></div><div class="card"><h3>Utilidad entregados</h3><div class="stat">${money(profit)}</div></div></div>
    <h2>Utilidad por auto</h2>
    ${table(delivered.map(r => [safe(r.vehicle?.ownerName || ''), safe(r.vehicle?.plate || ''), `${safe(r.vehicle?.brand || '')} ${safe(r.vehicle?.model || '')}`, money(r.totalCharged), money(r.totalCost), money(r.profit)]), ['Cliente','Patente','Vehículo','Cobrado','Costo','Utilidad'])}`;
}
function saveGoal(){ localStorage.setItem('bgarageProfitGoal', Number($('#goalInput').value || 0)); renderCommercial(); }

function pdfBase(title){ const { jsPDF } = window.jspdf; const doc = new jsPDF(); pdfHeader(doc,title); return doc; }
function drawWrench(doc,x,y,s=1,color=[20,25,28]){
  doc.setDrawColor(...color); doc.setFillColor(...color); doc.setLineWidth(1.1*s);
  doc.circle(x+3*s,y+3*s,3.2*s,'S');
  doc.setDrawColor(255,255,255); doc.setLineWidth(1.4*s); doc.line(x+1.2*s,y+1.2*s,x+4.8*s,y+4.8*s);
  doc.setDrawColor(...color); doc.setLineWidth(1.6*s); doc.line(x+5.2*s,y+5.2*s,x+17*s,y+17*s);
  doc.setFillColor(...color); doc.circle(x+18.4*s,y+18.4*s,2.2*s,'F');
  doc.setFillColor(255,255,255); doc.circle(x+18.4*s,y+18.4*s,.85*s,'F');
}
function pdfHeader(doc,title){
  doc.setFillColor(255,255,255); doc.rect(0,0,210,34,'F');
  doc.setDrawColor(226,234,236); doc.line(14,33,196,33);
  // Logo igual al login: llave inglesa + BGarage negro, sin círculo de fondo.
  drawWrench(doc,16,8,.62,[10,10,10]);
  doc.setTextColor(10,10,10); doc.setFont(undefined,'bold'); doc.setFontSize(19); doc.text('BGarage',34,21);
  doc.setFont(undefined,'normal'); doc.setFontSize(8.5); doc.setTextColor(85,95,100); doc.text('Taller mecánico · Diagnóstico · Reparación · Historial digital',34,27);
  doc.setTextColor(9,102,113); doc.setFont(undefined,'bold'); doc.setFontSize(16); doc.text(title,196,20,{align:'right'});
  doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.setTextColor(85,95,100); doc.text(new Date().toLocaleDateString('es-CL'),196,27,{align:'right'});
  doc.setTextColor(25,35,40);
}
function pdfFooter(doc){
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(210,225,230); doc.line(14,h-26,196,h-26);
  doc.setFontSize(10); doc.setTextColor(35,45,50); doc.text('Firmado por Bastian Espinoza · +56959355607',14,h-16);
  doc.setTextColor(20,20,20); doc.setFont(undefined,'bold'); doc.text('BGarage',196,h-16,{align:'right'}); doc.setFont(undefined,'normal');
}
function pdfSection(doc,icon,title,y){
  // Sin símbolos antes del título. Título centrado y subrayado calipso a lo ancho.
  doc.setTextColor(20,30,35); doc.setFont(undefined,'bold'); doc.setFontSize(12.5);
  doc.text(title,105,y+6,{align:'center'});
  doc.setDrawColor(25,184,200); doc.setLineWidth(0.75); doc.line(16,y+10,194,y+10);
  doc.setFont(undefined,'normal'); doc.setLineWidth(0.2);
  return y + 17;
}
function ensurePage(doc,y,title='Continuación'){ if(y > 265){ pdfFooter(doc); doc.addPage(); pdfHeader(doc,title); return 43; } return y; }
function pdfTextBlock(doc,text,x,y,w){ const lines = doc.splitTextToSize(String(text || ''), w); doc.text(lines,x,y); return y + (lines.length * 5) + 4; }
function pdfInfoRow(doc,label,value,y){ doc.setFontSize(10.5); doc.setTextColor(9,102,113); doc.setFont(undefined,'bold'); doc.text(label,18,y); doc.setFont(undefined,'normal'); doc.setTextColor(35,45,50); doc.text(String(value || ''),60,y); doc.setDrawColor(235,242,244); doc.line(18,y+3,190,y+3); return y + 9; }
function drawOilIcon(doc,x,y,s=1,color=[255,255,255]){
  doc.setDrawColor(...color); doc.setFillColor(...color);
  doc.setLineWidth(1.2*s);
  doc.roundedRect(x,y+9*s,26*s,15*s,3*s,3*s,'S');
  doc.line(x+5*s,y+9*s,x+9*s,y+3*s); doc.line(x+9*s,y+3*s,x+18*s,y+3*s); doc.line(x+18*s,y+3*s,x+21*s,y+9*s);
  doc.line(x+26*s,y+12*s,x+36*s,y+8*s); doc.line(x+36*s,y+8*s,x+39*s,y+11*s); doc.line(x+26*s,y+17*s,x+36*s,y+13*s);
  doc.circle(x+33*s,y+25*s,2.5*s,'F');
}
function quoteTableHeader(doc,y){
  doc.setFillColor(9,102,113); doc.roundedRect(16,y,178,9,2,2,'F'); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold'); doc.setFontSize(9);
  doc.text('ITEM',20,y+6); doc.text('DESCRIPCIÓN',62,y+6); doc.text('PRECIO',190,y+6,{align:'right'}); doc.setFont(undefined,'normal'); return y + 14;
}

function quotePDFDoc(id){
  const q = state.quotes.find(x => x._id === id); const num = quoteNumberDisplay(q); const doc = pdfBase('Presupuesto de reparación'); let y = 44;
  // Número de presupuesto arriba a la derecha, justo sobre el título del documento.
  doc.setFont(undefined,'bold'); doc.setFontSize(10.5); doc.setTextColor(10,10,10);
  doc.text(`N° ${num}`,196,11,{align:'right'});
  doc.setFont(undefined,'normal');
  doc.setFontSize(10); doc.setTextColor(70,80,84); doc.text('Documento técnico-comercial emitido por BGarage para revisión y aprobación del cliente.',14,y); y += 8;
  y = pdfSection(doc,'👤','Datos del cliente y vehículo',y);
  y = pdfInfoRow(doc,'Cliente', q.ownerName || '', y);
  y = pdfInfoRow(doc,'Vehículo', q.vehicleLabel || '', y);
  y = pdfInfoRow(doc,'N° presupuesto', num, y);
  y = pdfInfoRow(doc,'Fecha', new Date(q.createdAt || Date.now()).toLocaleDateString('es-CL'), y);
  y += 3; y = pdfSection(doc,'🧾','Detalle del presupuesto',y);
  y = quoteTableHeader(doc,y);
  (q.items || []).forEach((i,idx) => {
    if(y > 250){ pdfFooter(doc); doc.addPage(); pdfHeader(doc,'Presupuesto de reparación'); y = 43; y = quoteTableHeader(doc,y); }
    const briefLines = doc.splitTextToSize(String(i.brief || ''),86);
    const rowH = Math.max(16, 8 + (briefLines.length * 4));
    doc.setFillColor(idx % 2 ? 250 : 244, idx % 2 ? 253 : 251, idx % 2 ? 253 : 252); doc.roundedRect(16,y-5,178,rowH,2,2,'F');
    doc.setTextColor(25,35,40); doc.setFont(undefined,'bold'); doc.setFontSize(10); doc.text(String(i.description || 'Item'),20,y+1);
    doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.setTextColor(75,85,90); doc.text(briefLines,62,y+1);
    doc.setTextColor(25,35,40); doc.setFont(undefined,'bold'); doc.text(money(i.unitPrice),190,y+1,{align:'right'}); doc.setFont(undefined,'normal'); y += rowH + 2;
  });
  if(!(q.items || []).length){ doc.setTextColor(80,90,95); doc.text('Sin items registrados.',20,y); y += 10; }
  if(y > 242){ pdfFooter(doc); doc.addPage(); pdfHeader(doc,'Presupuesto de reparación'); y = 48; }
  y += 5;
  doc.setDrawColor(210,225,230); doc.line(116,y,194,y);
  doc.setTextColor(10,10,10); doc.setFont(undefined,'bold'); doc.setFontSize(16);
  doc.text(`TOTAL ${money(q.total)}`,190,y+10,{align:'right'});
  doc.setFont(undefined,'normal');
  y += 28; if(y > 255){ pdfFooter(doc); doc.addPage(); pdfHeader(doc,'Presupuesto de reparación'); y = 54; }
  doc.setDrawColor(150,180,185); doc.line(126,y,190,y); doc.setTextColor(9,102,113); doc.setFont(undefined,'bold'); doc.setFontSize(10); doc.text('Bastian Espinoza',158,y+7,{align:'center'}); doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.text('Responsable BGarage',158,y+12,{align:'center'});
  pdfFooter(doc);
  return { doc, filename:`presupuesto-bgarage-${num}-${q.ownerName || 'cliente'}.pdf` };
}
function quotePDF(id){ const out = quotePDFDoc(id); out.doc.save(out.filename); }
function previewQuote(id){ const out = quotePDFDoc(id); previewPdf(out.doc, out.filename); }

function oilPDF(id){
  const o = state.oil.find(x => x._id === id); const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a5' });
  doc.setFillColor(239,247,248); doc.rect(0,0,210,148,'F');
  doc.setFillColor(255,255,255); doc.setDrawColor(205,220,224); doc.setLineWidth(.8); doc.roundedRect(9,8,192,132,8,8,'FD');
  doc.setFillColor(9,102,113); doc.roundedRect(16,15,178,34,6,6,'F');
  drawOilIcon(doc,27,18,.62,[255,255,255]);
  doc.setTextColor(255,255,255); doc.setFont(undefined,'bold'); doc.setFontSize(29); doc.text('BGarage',105,29,{align:'center'});
  doc.setFontSize(12); doc.setFont(undefined,'normal'); doc.text('TARJETA DE CAMBIO DE ACEITE',105,42,{align:'center'});
  doc.setDrawColor(25,184,200); doc.setLineWidth(1.1); doc.line(22,55,188,55);
  const fields = [
    ['PROPIETARIO',o.ownerName||''],
    ['VEHÍCULO',`${o.brand||''} ${o.model||''} ${o.year||''}`.trim()],
    ['KM ACTUAL',o.currentKm||''],
    ['PRÓXIMO CAMBIO',o.nextKm||''],
    ['ACEITE USADO',o.oilUsed||''],
    ['FECHA',new Date(o.date || Date.now()).toLocaleDateString('es-CL')]
  ];
  // Recuadros más altos para que los datos queden dentro de la viñeta gris.
  const positions = [[22,63],[108,63],[22,85],[108,85],[22,107],[108,107]];
  fields.forEach((f,idx) => {
    const [x,y] = positions[idx];
    doc.setFillColor(248,252,253); doc.setDrawColor(218,230,233); doc.setLineWidth(.35); doc.roundedRect(x,y,78,18,3,3,'FD');
    doc.setTextColor(9,102,113); doc.setFont(undefined,'bold'); doc.setFontSize(7.2); doc.text(f[0],x+4,y+5.2);
    doc.setTextColor(25,35,40); doc.setFont(undefined,'bold'); doc.setFontSize(9.8);
    const valueLines = doc.splitTextToSize(String(f[1] || '-'), 68);
    doc.text(valueLines.slice(0,2),x+4,y+11.5);
  });
  if(o.notes){ doc.setFont(undefined,'normal'); doc.setFontSize(7.5); doc.setTextColor(70,80,84); doc.text(doc.splitTextToSize('Notas: ' + o.notes,150),22,130); }
  doc.setTextColor(20,20,20); doc.setFont(undefined,'bold'); doc.setFontSize(11.5); doc.text('SERVICIO CERTIFICADO',22,135);
  doc.setFont(undefined,'normal'); doc.setFontSize(9.5); doc.text('Bastian Espinoza · +56959355607',188,135,{align:'right'});
  doc.save('tarjeta-cambio-aceite-bgarage.pdf');
}


function previewPdf(doc, filename='documento-bgarage.pdf'){
  const url = doc.output('bloburl');
  openModal(`<div class="preview-head"><h2>${safe(filename)}</h2><button type="button" onclick="closeModal()" class="ghost">Cerrar</button></div><iframe class="pdf-preview" src="${url}"></iframe><div class="actions"><button onclick="window.open('${url}','_blank')">Abrir en otra pestaña</button></div>`);
}
function repairPDFDoc(id){
  const r = state.repairs.find(x => x._id === id); const doc = pdfBase('Informe de reparación'); let y = 44;
  doc.setFontSize(10); doc.setTextColor(70,80,84); doc.text('Resumen profesional del servicio realizado y respaldo digital del vehículo.',14,y); y += 8;
  y = pdfSection(doc,'🚗','Datos del vehículo',y);
  y = pdfInfoRow(doc,'Cliente', r.vehicle?.ownerName || '', y);
  y = pdfInfoRow(doc,'Vehículo', `${r.vehicle?.brand || ''} ${r.vehicle?.model || ''}`.trim(), y);
  y = pdfInfoRow(doc,'Patente', r.vehicle?.plate || '', y);
  y = pdfInfoRow(doc,'Trabajo', r.title || '', y);
  y = pdfInfoRow(doc,'Fecha reparación', dateCL(r.repairDate || r.deliveredAt || r.createdAt), y);
  y = pdfInfoRow(doc,'Estado', String(r.status || '').replace('_',' '), y);
  y += 3; y = pdfSection(doc,'🔎','Diagnóstico inicial',y); doc.setFontSize(10.5); doc.setTextColor(35,45,55); y = pdfTextBlock(doc, r.diagnosis || 'Sin diagnóstico registrado.',18,y,174);
  y = ensurePage(doc,y,'Informe de reparación'); y = pdfSection(doc,'🔧','Trabajos realizados',y); y = pdfTextBlock(doc, r.workDone || 'Sin trabajos registrados.',18,y,174);
  y = ensurePage(doc,y,'Informe de reparación'); y = pdfSection(doc,'⚙','Repuestos instalados',y);
  const parts = r.partsChanged || [];
  if(!parts.length){ doc.setTextColor(70,80,84); doc.text('Sin repuestos registrados.',18,y); y += 8; }
  parts.forEach((p,idx) => { y = ensurePage(doc,y,'Informe de reparación'); doc.setFillColor(245,251,252); doc.roundedRect(16,y-5,178,11,2,2,'F'); doc.setTextColor(25,35,40); doc.setFont(undefined,'bold'); doc.text(`${p.name || 'Repuesto'}`,20,y+2); doc.setTextColor(25,184,200); doc.text('Instalado',190,y+2,{align:'right'}); doc.setFont(undefined,'normal'); y += 14; });
  y += 3; y = ensurePage(doc,y,'Informe de reparación'); y = pdfSection(doc,'📝','Observaciones y códigos',y); y = pdfTextBlock(doc, r.extraProblems || 'Sin observaciones adicionales.',18,y,174);
  y = ensurePage(doc,y,'Informe de reparación'); doc.setFillColor(235,250,252); doc.roundedRect(14,y,182,17,4,4,'F'); doc.setTextColor(9,102,113); doc.setFont(undefined,'bold'); doc.setFontSize(11); doc.text('Resumen cliente',20,y+7); doc.setTextColor(45,60,65); doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.text('Informe generado digitalmente por BGarage para respaldar el historial del vehículo.',20,y+13);
  pdfFooter(doc);
  return { doc, filename:`informe-reparacion-bgarage-${r.vehicle?.plate || 'vehiculo'}.pdf` };
}
function repairPDF(id){ const out = repairPDFDoc(id); out.doc.save(out.filename); }
function previewRepair(id){ const out = repairPDFDoc(id); previewPdf(out.doc, out.filename); }

window.addEventListener('DOMContentLoaded', async () => { try{ await loadAll(); nav('dashboard'); }catch(e){ showError(e); } });
