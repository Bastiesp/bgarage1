const token = localStorage.getItem('token');
if(!token && !location.pathname.includes('login') && !location.pathname.includes('register')) location.href='/login.html';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => '$' + Number(n || 0).toLocaleString('es-CL');
const safe = v => String(v ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

let state = { vehicles:[], repairs:[], quotes:[], oil:[], summary:null };
let filters = { dashboard:'', kanban:'', vehicles:'', quotes:'', oil:'', repairs:'', commercial:'' };

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

async function loadAll(){
  const [vehicles, repairs, quotes, oil, summary] = await Promise.all([
    api('/vehicles'), api('/repairs'), api('/quotes'), api('/oil-cards'), api('/dashboard/summary')
  ]);
  state = { vehicles, repairs, quotes, oil, summary };
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
function repairText(r){ return norm([r?.title, r?.status, r?.week, r?.vehicle?.ownerName, r?.vehicle?.plate, r?.vehicle?.brand, r?.vehicle?.model, r?.vehicle?.ownerPhone, r?.diagnosis, r?.workDone].join(' ')); }
function quoteText(q){ return norm([q?.ownerName, q?.vehicleLabel, ...(q?.items || []).map(i => i.description)].join(' ')); }
function oilText(o){ return norm([o?.ownerName, o?.brand, o?.model, o?.year, o?.currentKm, o?.nextKm, o?.oilUsed].join(' ')); }
function filterList(list, view, fn){ const q = norm(filters[view]); return q ? list.filter(x => fn(x).includes(q)) : list; }

async function render(view='dashboard'){
  if(view === 'dashboard') return renderDashboard();
  if(view === 'kanban') return renderKanban();
  if(view === 'vehicles') return renderVehicles();
  if(view === 'quotes') return renderQuotes();
  if(view === 'oil') return renderOil();
  if(view === 'repairs') return renderRepairs();
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
  $('#content').innerHTML = `<div class="top"><h1>Vehículos / Clientes</h1><button onclick="vehicleForm()">+ Nuevo vehículo</button></div>${searchBox('vehicles')}${table(vehicles.map(v => [safe(v.ownerName), safe(v.ownerPhone || ''), safe(v.plate || ''), `${safe(v.brand || '')} ${safe(v.model || '')}`, safe(v.year || ''), safe(v.currentKm || ''), `<button class="ghost" onclick="vehicleForm('${v._id}')">Editar</button>`]), ['Propietario','Teléfono','Patente','Vehículo','Año','KM',''])}`;
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
  $('#content').innerHTML = `<div class="top"><h1>Kanban de reparaciones</h1><button onclick="repairForm()">+ Nuevo informe</button></div>${searchBox('kanban')}<div class="kanban">${cols.map(([key,title]) => `<div class="col"><h2>${title}</h2>${repairs.filter(r => r.status === key).map(r => `<div class="card kanban-card">${carStatusIcon(r.status)}<h3>${safe(r.vehicle?.plate || 'Sin patente')} · ${safe(r.title)}</h3><p>${safe(r.vehicle?.ownerName || '')}</p><p>${safe(r.vehicle?.brand || '')} ${safe(r.vehicle?.model || '')}</p><p class="muted">Semana: ${safe(r.week || '-')}</p><p class="status-line">${badge(r.status)} <span>Utilidad: <b>${money(r.profit)}</b></span></p><select onchange="moveRepair('${r._id}',this.value)"><option>mover a...</option><option value="presupuestado">Presupuestado</option><option value="en_reparacion">En reparación</option><option value="entregado">Entregado</option></select><button class="ghost" onclick="repairForm('${r._id}')">Ver / editar</button></div>`).join('')}</div>`).join('')}</div>`;
}
async function moveRepair(id,status){ if(!status || status === 'mover a...') return; await api('/repairs/' + id, { method:'PUT', body:JSON.stringify({status}) }); await loadAll(); renderKanban(); }

function renderQuotes(){
  const quotes = filterList(state.quotes, 'quotes', quoteText);
  $('#content').innerHTML = `<div class="top"><h1>Presupuestos</h1><button onclick="quoteForm()">+ Presupuesto</button></div>${searchBox('quotes')}${table(quotes.map(q => [safe(q.ownerName), safe(q.vehicleLabel), badge(q.status), money(q.total), `<button onclick="quotePDF('${q._id}')">PDF</button>`]), ['Cliente','Vehículo','Estado','Total',''])}`;
}
function quoteItemRow(description='', brief='', price=''){
  return `<div class="quote-item-row"><input name="itemDescription" placeholder="Item" value="${safe(description)}"><input name="itemBrief" placeholder="Breve descripción" value="${safe(brief)}"><input name="itemPrice" type="number" placeholder="Precio" value="${safe(price)}" oninput="recalcQuoteTotal()"><button type="button" class="ghost mini" onclick="this.closest('.quote-item-row').remove(); recalcQuoteTotal();">Quitar</button></div>`;
}
function addQuoteItem(description='', brief='', price=''){ $('#quoteItems').insertAdjacentHTML('beforeend', quoteItemRow(description, brief, price)); recalcQuoteTotal(); }
function recalcQuoteTotal(){
  const total = $$('input[name="itemPrice"]').reduce((s, el) => s + Number(el.value || 0), 0);
  const box = $('#quoteTotalPreview'); if(box) box.textContent = money(total);
}
function quoteForm(){
  baseForm('Nuevo presupuesto profesional', `
    <input name="ownerName" placeholder="Cliente" required>
    <input name="vehicleLabel" placeholder="Vehículo / patente">
    <div class="form-section-title">Items del presupuesto</div>
    <p class="muted small">Agrega cada línea con item, descripción breve y precio. El total se calcula solo para mostrarlo en el PDF.</p>
    <div id="quoteItems">${quoteItemRow()}</div>
    <button type="button" class="ghost" onclick="addQuoteItem()">+ Agregar item</button>
    <div class="total-preview"><span>Total estimado</span><b id="quoteTotalPreview">$0</b></div>
    <textarea name="notes" placeholder="Observaciones para el cliente"></textarea>`,
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
        await api('/quotes', { method:'POST', body:JSON.stringify({ ownerName:fd.get('ownerName'), vehicleLabel:fd.get('vehicleLabel'), notes:fd.get('notes'), items, subtotal:total, total }) });
        closeModal(); await loadAll(); renderQuotes();
      }catch(err){ showError(err); }
    }
  );
  recalcQuoteTotal();
}

function renderOil(){
  const oil = filterList(state.oil, 'oil', oilText);
  $('#content').innerHTML = `<div class="top"><h1>Tarjetas cambio de aceite</h1><button onclick="oilForm()">+ Nueva tarjeta</button></div>${searchBox('oil')}${table(oil.map(o => [safe(o.ownerName), `${safe(o.brand || '')} ${safe(o.model || '')}`, safe(o.currentKm), safe(o.nextKm), safe(o.oilUsed), `<button onclick="oilPDF('${o._id}')">PDF</button>`]), ['Propietario','Vehículo','KM actual','Próximo cambio','Aceite',''])}`;
}
function oilForm(){
  baseForm('Tarjeta cambio de aceite', `<input name="ownerName" placeholder="Propietario"><input name="brand" placeholder="Marca"><input name="model" placeholder="Modelo"><input name="year" type="number" placeholder="Año"><input name="currentKm" type="number" placeholder="KM actual"><input name="nextKm" type="number" placeholder="Próximo cambio"><input name="oilUsed" placeholder="Aceite usado"><textarea name="notes" placeholder="Notas"></textarea>`, async e => { e.preventDefault(); try{ await api('/oil-cards', { method:'POST', body:JSON.stringify(formData(e.target)) }); closeModal(); await loadAll(); renderOil(); }catch(err){ showError(err); } });
}

function renderRepairs(){
  const repairs = filterList(state.repairs, 'repairs', repairText);
  $('#content').innerHTML = `<div class="top"><h1>Reparaciones / Historial</h1><button onclick="repairForm()">+ Nuevo informe</button></div>${searchBox('repairs')}${table(repairs.map(r => [safe(r.vehicle?.ownerName || ''), safe(r.vehicle?.plate || ''), safe(r.title), badge(r.status), money(r.totalCharged), money(r.profit), `<button onclick="repairPDF('${r._id}')">PDF</button> <button class="ghost" onclick="repairForm('${r._id}')">Editar</button> <button class="ghost" onclick="photoForm('${r._id}')">Fotos</button>`]), ['Cliente','Patente','Trabajo','Estado','Cobrado','Utilidad',''])}`;
}
function repairForm(id){
  const r = state.repairs.find(x => x._id === id) || {};
  const options = state.vehicles.map(v => `<option value="${v._id}" ${String(r.vehicle?._id || r.vehicle || '') === String(v._id) ? 'selected' : ''}>${safe(v.ownerName || '')} · ${safe(v.plate || '')} · ${safe(v.brand || '')} ${safe(v.model || '')}</option>`).join('');
  baseForm(id ? 'Editar informe' : 'Nuevo informe', `
    <select name="vehicle" required><option value="">Seleccionar vehículo/cliente</option>${options}</select>
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
    async e => { e.preventDefault(); try{ const d = formData(e.target); if(d.partsText){ d.partsChanged = d.partsText.split('\n').filter(Boolean).map(line => { const [name,cost,sellPrice] = line.split('|').map(x => x.trim()); return { name, cost:Number(cost || 0), sellPrice:Number(sellPrice || 0) }; }); delete d.partsText; } await api('/repairs' + (id ? '/' + id : ''), { method:id?'PUT':'POST', body:JSON.stringify(d) }); closeModal(); await loadAll(); renderRepairs(); }catch(err){ showError(err); } }
  );
}
function photoForm(id){
  openModal(`<h2>Subir fotos comprimidas</h2><p class="muted">Se comprimen en el servidor antes de Cloudinary.</p><form id="pf"><input type="file" name="photos" accept="image/*" multiple><div class="actions"><button>Subir</button><button type="button" class="ghost" onclick="closeModal()">Cerrar</button></div></form>`);
  $('#pf').onsubmit = async e => { e.preventDefault(); try{ const fd = new FormData(e.target); const r = await fetch('/api/repairs/' + id + '/photos', { method:'POST', headers:{ Authorization:'Bearer ' + token }, body:fd }); const j = await r.json(); if(!r.ok) throw new Error(j.error || 'Error al subir fotos'); closeModal(); await loadAll(); renderRepairs(); }catch(err){ showError(err); } };
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
function pdfHeader(doc,title){
  doc.setFillColor(9, 102, 113); doc.rect(0,0,210,32,'F');
  doc.setFillColor(25,184,200); doc.roundedRect(14,9,36,14,4,4,'F');
  doc.setTextColor(255,255,255); doc.setFont(undefined,'bold'); doc.setFontSize(17); doc.text('BGarage',19,19);
  doc.setFontSize(18); doc.text(title,196,19,{align:'right'});
  doc.setFontSize(9); doc.setFont(undefined,'normal'); doc.text('Taller mecánico · Gestión profesional de servicios',196,26,{align:'right'});
  doc.setTextColor(25,35,40);
}
function pdfFooter(doc){
  const h = doc.internal.pageSize.getHeight();
  doc.setDrawColor(210,225,230); doc.line(14,h-26,196,h-26);
  doc.setFontSize(10); doc.setTextColor(50,65,70); doc.text('Firmado por Bastian Espinoza · +56959355607',14,h-16);
  doc.setTextColor(16,149,163); doc.setFont(undefined,'bold'); doc.text('BGARAGE · SERVICIO CERTIFICADO',196,h-16,{align:'right'}); doc.setFont(undefined,'normal');
}
function pdfSection(doc,icon,title,y){
  doc.setFillColor(235,250,252); doc.setDrawColor(180,230,236); doc.roundedRect(14,y,182,12,3,3,'FD');
  doc.setFillColor(25,184,200); doc.circle(21,y+6,4.2,'F'); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold'); doc.setFontSize(8); doc.text(icon,21,y+7,{align:'center'});
  doc.setTextColor(9,102,113); doc.setFontSize(12); doc.text(title,29,y+7.5); doc.setFont(undefined,'normal');
  return y + 17;
}
function ensurePage(doc,y,title='Continuación'){ if(y > 265){ pdfFooter(doc); doc.addPage(); pdfHeader(doc,title); return 43; } return y; }
function pdfTextBlock(doc,text,x,y,w){ const lines = doc.splitTextToSize(String(text || ''), w); doc.text(lines,x,y); return y + (lines.length * 5) + 4; }
function pdfInfoRow(doc,label,value,y){ doc.setFontSize(10.5); doc.setTextColor(9,102,113); doc.setFont(undefined,'bold'); doc.text(label,18,y); doc.setFont(undefined,'normal'); doc.setTextColor(35,45,50); doc.text(String(value || ''),60,y); doc.setDrawColor(235,242,244); doc.line(18,y+3,190,y+3); return y + 9; }
function drawOilIcon(doc,x,y,s=1){
  doc.setDrawColor(255,255,255); doc.setFillColor(255,255,255);
  doc.setLineWidth(1.2*s);
  doc.roundedRect(x,y+9*s,26*s,15*s,3*s,3*s,'S');
  doc.line(x+5*s,y+9*s,x+9*s,y+3*s); doc.line(x+9*s,y+3*s,x+18*s,y+3*s); doc.line(x+18*s,y+3*s,x+21*s,y+9*s);
  doc.line(x+26*s,y+12*s,x+36*s,y+8*s); doc.line(x+36*s,y+8*s,x+39*s,y+11*s); doc.line(x+26*s,y+17*s,x+36*s,y+13*s);
  doc.circle(x+33*s,y+25*s,2.5*s,'F');
}

function quotePDF(id){
  const q = state.quotes.find(x => x._id === id); const doc = pdfBase('Presupuesto de reparación'); let y = 44;
  doc.setFontSize(10); doc.setTextColor(70,80,84); doc.text('Documento técnico-comercial emitido por BGarage para revisión y aprobación del cliente.',14,y); y += 8;
  y = pdfSection(doc,'1','Datos del cliente y vehículo',y);
  y = pdfInfoRow(doc,'Cliente', q.ownerName || '', y);
  y = pdfInfoRow(doc,'Vehículo', q.vehicleLabel || '', y);
  y = pdfInfoRow(doc,'Fecha', new Date(q.createdAt || Date.now()).toLocaleDateString('es-CL'), y);
  y += 3; y = pdfSection(doc,'2','Detalle del presupuesto',y);
  doc.setFillColor(9,102,113); doc.roundedRect(16,y,178,9,2,2,'F'); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold'); doc.setFontSize(9);
  doc.text('ITEM',20,y+6); doc.text('DESCRIPCIÓN',62,y+6); doc.text('PRECIO',190,y+6,{align:'right'}); doc.setFont(undefined,'normal'); y += 14;
  (q.items || []).forEach((i,idx) => {
    y = ensurePage(doc,y,'Presupuesto');
    doc.setFillColor(idx % 2 ? 250 : 244, idx % 2 ? 253 : 251, idx % 2 ? 253 : 252); doc.roundedRect(16,y-5,178,16,2,2,'F');
    doc.setTextColor(25,35,40); doc.setFont(undefined,'bold'); doc.setFontSize(10); doc.text(String(i.description || 'Item'),20,y+1);
    doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.setTextColor(75,85,90); doc.text(doc.splitTextToSize(String(i.brief || ''),86),62,y+1);
    doc.setTextColor(25,35,40); doc.setFont(undefined,'bold'); doc.text(money(i.unitPrice),190,y+1,{align:'right'}); doc.setFont(undefined,'normal'); y += 18;
  });
  if(!(q.items || []).length){ doc.setTextColor(80,90,95); doc.text('Sin items registrados.',20,y); y += 10; }
  y += 4; doc.setFillColor(25,184,200); doc.roundedRect(116,y,78,18,4,4,'F'); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold'); doc.setFontSize(16); doc.text(`TOTAL ${money(q.total)}`,188,y+12,{align:'right'}); doc.setFont(undefined,'normal');
  y += 28; y = ensurePage(doc,y,'Presupuesto'); y = pdfSection(doc,'3','Condiciones y observaciones',y); doc.setFontSize(10); doc.setTextColor(45,55,60);
  y = pdfTextBlock(doc, q.notes || 'Presupuesto sujeto a revisión final del vehículo, disponibilidad de repuestos y aprobación del cliente antes de iniciar trabajos.',18,y,174);
  y += 10; doc.setDrawColor(150,180,185); doc.line(126,y,190,y); doc.setTextColor(9,102,113); doc.setFont(undefined,'bold'); doc.text('Bastian Espinoza',158,y+7,{align:'center'}); doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.text('Responsable BGarage',158,y+12,{align:'center'});
  pdfFooter(doc); doc.save(`presupuesto-bgarage-${q.ownerName || 'cliente'}.pdf`);
}

function oilPDF(id){
  const o = state.oil.find(x => x._id === id); const { jsPDF } = window.jspdf; const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a5' });
  doc.setFillColor(231,246,248); doc.rect(0,0,210,148,'F');
  doc.setFillColor(255,255,255); doc.setDrawColor(9,102,113); doc.setLineWidth(1.2); doc.roundedRect(12,10,186,128,8,8,'FD');
  doc.setFillColor(9,102,113); doc.roundedRect(12,10,186,42,8,8,'F');
  doc.setTextColor(255,255,255); doc.setFont(undefined,'bold'); doc.setFontSize(30); doc.text('BGarage',105,26,{align:'center'});
  doc.setFontSize(13); doc.text('TARJETA DE CAMBIO DE ACEITE',105,39,{align:'center'});
  drawOilIcon(doc,25,17,.7); drawOilIcon(doc,158,17,.7);
  doc.setFillColor(245,251,252); doc.roundedRect(22,62,166,42,6,6,'F');
  doc.setTextColor(9,102,113); doc.setFont(undefined,'bold'); doc.setFontSize(9);
  const fields = [ ['PROPIETARIO',o.ownerName||''], ['VEHÍCULO',`${o.brand||''} ${o.model||''} ${o.year||''}`.trim()], ['KM ACTUAL',o.currentKm||''], ['PRÓXIMO CAMBIO',o.nextKm||''], ['ACEITE USADO',o.oilUsed||''], ['FECHA',new Date(o.date || Date.now()).toLocaleDateString('es-CL')] ];
  let y = 72; fields.forEach((f,idx) => { const x = idx % 2 ? 108 : 30; if(idx > 0 && idx % 2 === 0) y += 14; doc.setTextColor(9,102,113); doc.setFont(undefined,'bold'); doc.text(f[0],x,y); doc.setTextColor(25,35,40); doc.setFont(undefined,'normal'); doc.text(String(f[1]),x,y+6); });
  if(o.notes){ doc.setFontSize(8); doc.setTextColor(70,80,84); doc.text(doc.splitTextToSize('Notas: ' + o.notes,150),30,112); }
  doc.setFillColor(25,184,200); doc.roundedRect(22,119,72,13,4,4,'F'); doc.setTextColor(255,255,255); doc.setFont(undefined,'bold'); doc.setFontSize(12); doc.text('SERVICIO CERTIFICADO',58,128,{align:'center'});
  doc.setTextColor(35,45,50); doc.setFontSize(11); doc.text('Bastian Espinoza',188,123,{align:'right'}); doc.text('+56959355607',188,130,{align:'right'});
  doc.save('tarjeta-cambio-aceite-bgarage.pdf');
}

function repairPDF(id){
  const r = state.repairs.find(x => x._id === id); const doc = pdfBase('Informe de historial'); let y = 44;
  doc.setFontSize(10); doc.setTextColor(70,80,84); doc.text('Resumen profesional del servicio realizado. Costos internos ocultos para el cliente.',14,y); y += 8;
  y = pdfSection(doc,'1','Datos del vehículo',y);
  y = pdfInfoRow(doc,'Cliente', r.vehicle?.ownerName || '', y);
  y = pdfInfoRow(doc,'Vehículo', `${r.vehicle?.brand || ''} ${r.vehicle?.model || ''}`.trim(), y);
  y = pdfInfoRow(doc,'Patente', r.vehicle?.plate || '', y);
  y = pdfInfoRow(doc,'Trabajo', r.title || '', y);
  y = pdfInfoRow(doc,'Estado', String(r.status || '').replace('_',' '), y);
  y += 3; y = pdfSection(doc,'2','Diagnóstico inicial',y); doc.setFontSize(10.5); doc.setTextColor(35,45,55); y = pdfTextBlock(doc, r.diagnosis || 'Sin diagnóstico registrado.',18,y,174);
  y = ensurePage(doc,y,'Informe'); y = pdfSection(doc,'3','Trabajos realizados',y); y = pdfTextBlock(doc, r.workDone || 'Sin trabajos registrados.',18,y,174);
  y = ensurePage(doc,y,'Informe'); y = pdfSection(doc,'4','Repuestos instalados',y);
  const parts = r.partsChanged || [];
  if(!parts.length){ doc.setTextColor(70,80,84); doc.text('Sin repuestos registrados.',18,y); y += 8; }
  parts.forEach((p,idx) => { y = ensurePage(doc,y,'Informe'); doc.setFillColor(245,251,252); doc.roundedRect(16,y-5,178,11,2,2,'F'); doc.setTextColor(25,35,40); doc.setFont(undefined,'bold'); doc.text(`${idx+1}. ${p.name || 'Repuesto'}`,20,y+2); doc.setTextColor(25,184,200); doc.text('Instalado',190,y+2,{align:'right'}); doc.setFont(undefined,'normal'); y += 14; });
  y += 3; y = ensurePage(doc,y,'Informe'); y = pdfSection(doc,'5','Observaciones y códigos',y); y = pdfTextBlock(doc, r.extraProblems || 'Sin observaciones adicionales.',18,y,174);
  y = ensurePage(doc,y,'Informe'); doc.setFillColor(235,250,252); doc.roundedRect(14,y,182,17,4,4,'F'); doc.setTextColor(9,102,113); doc.setFont(undefined,'bold'); doc.setFontSize(11); doc.text('Resumen cliente',20,y+7); doc.setTextColor(45,60,65); doc.setFont(undefined,'normal'); doc.setFontSize(9); doc.text('Informe generado digitalmente por BGarage para respaldar el historial del vehículo.',20,y+13);
  pdfFooter(doc); doc.save(`informe-historial-bgarage-${r.vehicle?.plate || 'vehiculo'}.pdf`);
}

window.addEventListener('DOMContentLoaded', async () => { try{ await loadAll(); nav('dashboard'); }catch(e){ showError(e); } });
