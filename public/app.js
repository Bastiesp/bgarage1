const token = localStorage.getItem('token');
if(!token && !location.pathname.includes('login') && !location.pathname.includes('register')) location.href='/login.html';
const $ = s => document.querySelector(s);
const api = async (url, opts={}) => {
  const r = await fetch('/api'+url, {
    ...opts,
    headers:{'Content-Type':'application/json', Authorization:'Bearer '+token, ...(opts.headers||{})}
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok){
    if(r.status === 401){
      localStorage.clear();
      location.href='/login.html';
      return;
    }
    throw new Error(j.error || 'Error del servidor');
  }
  return j;
};
const showError = (e) => {
  console.error(e);
  alert(e.message || 'Ocurrió un error. Revisa los logs.');
};
const money = n => '$'+Number(n||0).toLocaleString('es-CL');
let state = { vehicles:[], repairs:[], quotes:[], oil:[], summary:null };
async function loadAll(){
  const [vehicles,repairs,quotes,oil,summary] = await Promise.all([api('/vehicles'),api('/repairs'),api('/quotes'),api('/oil-cards'),api('/dashboard/summary')]);
  state={vehicles,repairs,quotes,oil,summary};
}
function logout(){ localStorage.clear(); location.href='/login.html'; }
function nav(view){ document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view)); render(view); }
function openModal(html){ $('#modal').innerHTML='<div class="modal-box">'+html+'</div>'; $('#modal').classList.add('open'); }
function closeModal(){ $('#modal').classList.remove('open'); }
document.addEventListener('click', e=>{ if(e.target.id==='modal') closeModal(); });
function baseForm(title, fields, onsubmit){ openModal(`<h2>${title}</h2><form id="f">${fields}<div class="actions"><button>Guardar</button><button type="button" class="ghost" onclick="closeModal()">Cerrar</button></div></form>`); $('#f').onsubmit=onsubmit; }
function formData(form){ const o=Object.fromEntries(new FormData(form)); for(const k in o){ if(o[k]==='') delete o[k]; } return o; }
async function render(view='dashboard'){
  if(view==='dashboard') return renderDashboard();
  if(view==='kanban') return renderKanban();
  if(view==='vehicles') return renderVehicles();
  if(view==='quotes') return renderQuotes();
  if(view==='oil') return renderOil();
  if(view==='repairs') return renderRepairs();
  if(view==='commercial') return renderCommercial();
}
function renderDashboard(){ const s=state.summary; $('#content').innerHTML=`<div class="top"><div><h1>Panel BGarage</h1><p class="muted">Resumen general del taller</p></div><button onclick="loadAll().then(()=>renderDashboard())">Actualizar</button></div><div class="grid"><div class="card"><h3>Ingresos mes</h3><div class="stat">${money(s.monthIncome)}</div></div><div class="card"><h3>Costos mes</h3><div class="stat">${money(s.monthCost)}</div></div><div class="card"><h3>Utilidad mes</h3><div class="stat">${money(s.monthProfit)}</div></div><div class="card"><h3>Entregados mes</h3><div class="stat">${s.deliveredThisMonth}</div></div></div><h2>Últimos trabajos</h2>${table(s.recent.map(r=>[r.vehicle?.plate||'', r.vehicle?`${r.vehicle.brand||''} ${r.vehicle.model||''}`:'', r.title, badge(r.status), money(r.profit)]), ['Patente','Vehículo','Trabajo','Estado','Utilidad'])}`; }
function badge(x){ return `<span class="pill">${String(x||'').replace('_',' ')}</span>`; }
function table(rows, headers){ return `<table class="table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c??''}</td>`).join('')}</tr>`).join('')}</tbody></table>`; }
function renderVehicles(){ $('#content').innerHTML=`<div class="top"><h1>Vehículos / Clientes</h1><button onclick="vehicleForm()">+ Nuevo vehículo</button></div>${table(state.vehicles.map(v=>[v.ownerName,v.ownerPhone||'',v.plate||'',`${v.brand||''} ${v.model||''}`,v.year||'',v.currentKm||'',`<button class="ghost" onclick="vehicleForm('${v._id}')">Editar</button>`]),['Propietario','Teléfono','Patente','Vehículo','Año','KM',''])}`; }
function vehicleForm(id){ const v=state.vehicles.find(x=>x._id===id)||{}; baseForm(id?'Editar vehículo':'Nuevo vehículo',`<input name="ownerName" placeholder="Propietario" required value="${v.ownerName||''}"><input name="ownerPhone" placeholder="Teléfono" value="${v.ownerPhone||''}"><input name="ownerEmail" placeholder="Email" value="${v.ownerEmail||''}"><input name="plate" placeholder="Patente" value="${v.plate||''}"><input name="brand" placeholder="Marca" value="${v.brand||''}"><input name="model" placeholder="Modelo" value="${v.model||''}"><input name="year" type="number" placeholder="Año" value="${v.year||''}"><input name="currentKm" type="number" placeholder="KM actual" value="${v.currentKm||''}"><textarea name="notes" placeholder="Notas">${v.notes||''}</textarea>`, async e=>{e.preventDefault(); try{ const data=formData(e.target); await api('/vehicles'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(data)}); closeModal(); await loadAll(); renderVehicles(); }catch(err){ showError(err); }}); }
function carStatusIcon(status){
  return `<div class="car-status car-${status}" title="${String(status||'').replace('_',' ')}">
    <svg viewBox="0 0 64 36" aria-hidden="true">
      <path d="M12 25h40c3.5 0 6-2.5 6-5.5v-3.2c0-2.4-1.8-4.4-4.2-4.8l-7.4-1.2-5.6-6.5A8 8 0 0 0 34.7 1H24a8 8 0 0 0-6.4 3.2l-4.5 6.1-5.5 1.1A5.8 5.8 0 0 0 3 17.1v2.4C3 22.5 5.5 25 9 25h3Z"/>
      <path d="M20 10h10V6h-5.5c-1.4 0-2.8.7-3.6 1.8L20 10Zm15 0h9l-3.5-3.8A5 5 0 0 0 36.8 6H35v4Z" fill="rgba(255,255,255,.72)" stroke="none"/>
      <circle cx="18" cy="26" r="6" fill="#23343a" stroke="none"/><circle cx="46" cy="26" r="6" fill="#23343a" stroke="none"/>
      <circle cx="18" cy="26" r="2.4" fill="#fff" stroke="none"/><circle cx="46" cy="26" r="2.4" fill="#fff" stroke="none"/>
    </svg>
  </div>`;
}
function renderKanban(){ const cols=[['presupuestado','Presupuestados'],['en_reparacion','En reparación'],['entregado','Entregados']]; $('#content').innerHTML=`<div class="top"><h1>Kanban de reparaciones</h1><button onclick="repairForm()">+ Nuevo informe</button></div><div class="kanban">${cols.map(([key,title])=>`<div class="col"><h2>${title}</h2>${state.repairs.filter(r=>r.status===key).map(r=>`<div class="card kanban-card">${carStatusIcon(r.status)}<h3>${r.vehicle?.plate||'Sin patente'} · ${r.title}</h3><p>${r.vehicle?.brand||''} ${r.vehicle?.model||''}</p><p class="muted">Semana: ${r.week||'-'}</p><p class="status-line">${badge(r.status)} <span>Utilidad: <b>${money(r.profit)}</b></span></p><select onchange="moveRepair('${r._id}',this.value)"><option>mover a...</option><option value="presupuestado">Presupuestado</option><option value="en_reparacion">En reparación</option><option value="entregado">Entregado</option></select><button class="ghost" onclick="repairForm('${r._id}')">Ver / editar</button></div>`).join('')}</div>`).join('')}</div>`; }
async function moveRepair(id,status){ await api('/repairs/'+id,{method:'PUT',body:JSON.stringify({status})}); await loadAll(); renderKanban(); }
function renderQuotes(){ $('#content').innerHTML=`<div class="top"><h1>Presupuestos</h1><button onclick="quoteForm()">+ Presupuesto</button></div>${table(state.quotes.map(q=>[q.ownerName,q.vehicleLabel,badge(q.status),money(q.total),`<button onclick="quotePDF('${q._id}')">PDF</button>`]),['Cliente','Vehículo','Estado','Total',''])}`; }
function quoteForm(){ baseForm('Nuevo presupuesto',`<input name="ownerName" placeholder="Cliente" required><input name="vehicleLabel" placeholder="Vehículo / patente"><textarea name="notes" placeholder="Detalle del presupuesto, una línea por item. Ej: Cambio embrague | 1 | 250000"></textarea>`, async e=>{e.preventDefault(); try{ const d=formData(e.target); const items=(d.notes||'').split('\n').filter(Boolean).map(line=>{const [description,qty,unitPrice]=line.split('|').map(x=>x.trim()); return {description, qty:Number(qty||1), unitPrice:Number(unitPrice||0)}}); const total=items.reduce((s,i)=>s+i.qty*i.unitPrice,0); await api('/quotes',{method:'POST',body:JSON.stringify({...d,items,subtotal:total,total})}); closeModal(); await loadAll(); renderQuotes(); }catch(err){ showError(err); }}); }
function renderOil(){ $('#content').innerHTML=`<div class="top"><h1>Tarjetas cambio de aceite</h1><button onclick="oilForm()">+ Nueva tarjeta</button></div>${table(state.oil.map(o=>[o.ownerName,`${o.brand||''} ${o.model||''}`,o.currentKm,o.nextKm,o.oilUsed,`<button onclick="oilPDF('${o._id}')">PDF</button>`]),['Propietario','Vehículo','KM actual','Próximo cambio','Aceite',''])}`; }
function oilForm(){ baseForm('Tarjeta cambio de aceite',`<input name="ownerName" placeholder="Propietario"><input name="brand" placeholder="Marca"><input name="model" placeholder="Modelo"><input name="year" type="number" placeholder="Año"><input name="currentKm" type="number" placeholder="KM actual"><input name="nextKm" type="number" placeholder="Próximo cambio KM"><input name="oilUsed" placeholder="Aceite usado"><textarea name="notes" placeholder="Notas"></textarea>`, async e=>{e.preventDefault(); try{ await api('/oil-cards',{method:'POST',body:JSON.stringify(formData(e.target))}); closeModal(); await loadAll(); renderOil(); }catch(err){ showError(err); }}); }
function renderRepairs(){ $('#content').innerHTML=`<div class="top"><h1>Informes de reparación / Historial</h1><button onclick="repairForm()">+ Nuevo informe</button></div>${state.repairs.map(r=>`<div class="card"><h3>${r.title} · ${r.vehicle?.plate||''}</h3><p>${r.vehicle?.ownerName||''} | ${r.vehicle?.brand||''} ${r.vehicle?.model||''}</p><p>${badge(r.status)} Utilidad: <b>${money(r.profit)}</b></p><div class="photo-row">${(r.photos||[]).map(p=>`<img src="${p.url}">`).join('')}</div><div class="actions"><button onclick="repairForm('${r._id}')">Editar</button><button class="ghost" onclick="repairPDF('${r._id}')">PDF cliente</button><button class="ghost" onclick="photoForm('${r._id}')">Subir fotos</button></div></div>`).join('')}`; }
function repairForm(id){ const r=state.repairs.find(x=>x._id===id)||{}; const opts=state.vehicles.map(v=>`<option value="${v._id}" ${r.vehicle?._id===v._id?'selected':''}>${v.plate||''} ${v.brand||''} ${v.model||''} - ${v.ownerName}</option>`).join(''); baseForm(id?'Editar informe':'Nuevo informe',`<select name="vehicle" required><option value="">Vehículo...</option>${opts}</select><input name="title" placeholder="Título reparación" required value="${r.title||''}"><select name="status"><option value="presupuestado">Presupuestado</option><option value="en_reparacion" ${r.status==='en_reparacion'?'selected':''}>En reparación</option><option value="entregado" ${r.status==='entregado'?'selected':''}>Entregado</option></select><input name="week" placeholder="Semana / fecha comprometida" value="${r.week||''}"><textarea name="diagnosis" placeholder="Diagnóstico">${r.diagnosis||''}</textarea><textarea name="workDone" placeholder="Trabajos realizados">${r.workDone||''}</textarea><textarea name="extraProblems" placeholder="Problemas adicionales / códigos">${r.extraProblems||''}</textarea><input name="laborPrice" type="number" placeholder="Mano de obra cobrada" value="${r.laborPrice||''}"><input name="externalCosts" type="number" placeholder="Costos externos" value="${r.externalCosts||''}"><input name="totalCharged" type="number" placeholder="Total cobrado al cliente" value="${r.totalCharged||''}"><textarea name="partsText" placeholder="Repuestos: nombre | costo | precio venta"></textarea>`, async e=>{e.preventDefault(); try{ const d=formData(e.target); if(d.partsText){ d.partsChanged=d.partsText.split('\n').filter(Boolean).map(line=>{const [name,cost,sellPrice]=line.split('|').map(x=>x.trim());return {name,cost:Number(cost||0),sellPrice:Number(sellPrice||0)}}); delete d.partsText;} await api('/repairs'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(d)}); closeModal(); await loadAll(); renderRepairs(); }catch(err){ showError(err); }}); }
function photoForm(id){ openModal(`<h2>Subir fotos comprimidas</h2><p class="muted">Se comprimen en el servidor antes de Cloudinary.</p><form id="pf"><input type="file" name="photos" accept="image/*" multiple><div class="actions"><button>Subir</button><button type="button" class="ghost" onclick="closeModal()">Cerrar</button></div></form>`); $('#pf').onsubmit=async e=>{e.preventDefault(); const fd=new FormData(e.target); const r=await fetch('/api/repairs/'+id+'/photos',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd}); const j=await r.json(); if(!r.ok) return alert(j.error||'Error'); closeModal(); await loadAll(); renderRepairs();}; }
function renderCommercial(){ const delivered=state.repairs.filter(r=>r.status==='entregado'); const income=delivered.reduce((s,r)=>s+Number(r.totalCharged||0),0); const cost=delivered.reduce((s,r)=>s+Number(r.totalCost||0),0); $('#content').innerHTML=`<div class="top"><h1>Gestión comercial</h1></div><div class="grid"><div class="card"><h3>Ingresos históricos</h3><div class="stat">${money(income)}</div></div><div class="card"><h3>Costos históricos</h3><div class="stat">${money(cost)}</div></div><div class="card"><h3>Utilidad histórica</h3><div class="stat">${money(income-cost)}</div></div></div><h2>Utilidad por auto</h2>${table(delivered.map(r=>[r.vehicle?.plate||'',`${r.vehicle?.brand||''} ${r.vehicle?.model||''}`,money(r.totalCharged),money(r.totalCost),money(r.profit)]),['Patente','Vehículo','Cobrado','Costo','Utilidad'])}`; }
function pdfBase(title){
  const { jsPDF } = window.jspdf;
  const doc=new jsPDF();
  pdfHeader(doc,title);
  return doc;
}
function pdfHeader(doc,title){
  doc.setFillColor(25,184,200);
  doc.roundedRect(12,10,186,24,5,5,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(22);
  doc.setFont(undefined,'bold');
  doc.text('BGarage',22,26);
  doc.setFontSize(10);
  doc.text('CRM Taller Mecánico',22,32);
  doc.setFontSize(18);
  doc.text(title,128,26,{align:'center'});
  doc.setDrawColor(16,149,163);
  doc.setLineWidth(.8);
  doc.line(14,40,196,40);
  doc.setTextColor(25,35,40);
  doc.setFont(undefined,'normal');
}
function pdfFooter(doc){
  const h=doc.internal.pageSize.getHeight();
  doc.setDrawColor(220,235,240);
  doc.line(14,h-24,196,h-24);
  doc.setFontSize(10);
  doc.setTextColor(70,85,95);
  doc.text('Bastian Espinoza · +56959355607',14,h-15);
  doc.setTextColor(16,149,163);
  doc.setFont(undefined,'bold');
  doc.text('SERVICIO CERTIFICADO',196,h-15,{align:'right'});
  doc.setFont(undefined,'normal');
}
function pdfSection(doc,icon,title,y){
  doc.setFillColor(235,250,252);
  doc.setDrawColor(185,238,243);
  doc.roundedRect(14,y,182,10,3,3,'FD');
  doc.setFillColor(25,184,200);
  doc.circle(20,y+5,3.5,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(8);
  doc.setFont(undefined,'bold');
  doc.text(icon,20,y+6,{align:'center'});
  doc.setTextColor(16,80,90);
  doc.setFontSize(12);
  doc.text(title,27,y+6.5);
  doc.setFont(undefined,'normal');
  return y+15;
}
function pdfLineItem(doc,left,right,y){
  doc.setFontSize(10.5);
  doc.setTextColor(30,45,52);
  doc.text(String(left||''),18,y);
  if(right!==undefined) doc.text(String(right||''),190,y,{align:'right'});
  doc.setDrawColor(235,242,244);
  doc.line(18,y+3,190,y+3);
  return y+9;
}
function ensurePage(doc,y){
  if(y>265){ pdfFooter(doc); doc.addPage(); pdfHeader(doc,'Continuación'); return 48; }
  return y;
}
function quotePDF(id){
  const q=state.quotes.find(x=>x._id===id); const doc=pdfBase('Presupuesto'); let y=50;
  y=pdfSection(doc,'1','Datos del cliente',y);
  y=pdfLineItem(doc,`Cliente: ${q.ownerName||''}`,undefined,y);
  y=pdfLineItem(doc,`Vehículo / patente: ${q.vehicleLabel||''}`,undefined,y);
  y+=3; y=pdfSection(doc,'2','Detalle de items',y);
  if(!(q.items||[]).length){ y=pdfLineItem(doc,'Sin items registrados','',y); }
  (q.items||[]).forEach((i,idx)=>{ y=ensurePage(doc,y); const total=Number(i.qty||0)*Number(i.unitPrice||0); y=pdfLineItem(doc,`${idx+1}. ${i.description||'Item'}  ·  Cant: ${i.qty||1}`,money(total),y); });
  y+=4; doc.setFillColor(16,149,163); doc.roundedRect(118,y,78,16,4,4,'F'); doc.setTextColor(255,255,255); doc.setFontSize(15); doc.setFont(undefined,'bold'); doc.text(`Total: ${money(q.total)}`,190,y+10,{align:'right'}); doc.setFont(undefined,'normal');
  y+=26; y=pdfSection(doc,'3','Observaciones',y); doc.setFontSize(10.5); doc.setTextColor(60,75,85); doc.text(doc.splitTextToSize('Presupuesto emitido por BGarage. Valores sujetos a confirmación según inspección final del vehículo y disponibilidad de repuestos.',174),18,y);
  pdfFooter(doc); doc.save(`presupuesto-bgarage-${q.ownerName||'cliente'}.pdf`);
}
function oilPDF(id){
  const o=state.oil.find(x=>x._id===id); const { jsPDF } = window.jspdf; const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a5'});
  doc.setFillColor(245,251,252); doc.rect(0,0,210,148,'F');
  doc.setFillColor(255,255,255); doc.setDrawColor(180,225,230); doc.setLineWidth(1.2); doc.roundedRect(12,12,186,124,8,8,'FD');
  doc.setFillColor(25,184,200); doc.roundedRect(12,12,186,24,8,8,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(24); doc.setFont(undefined,'bold'); doc.text('BGarage',24,29); doc.setFontSize(12); doc.text('Tarjeta cambio de aceite',122,28,{align:'center'});
  doc.setFont(undefined,'normal'); doc.setTextColor(45,55,60); doc.setFontSize(11);
  const rows=[['Propietario',o.ownerName||''],['Vehículo',`${o.brand||''} ${o.model||''} ${o.year||''}`.trim()],['KM actual',o.currentKm||''],['Próximo cambio',o.nextKm||''],['Aceite usado',o.oilUsed||''],['Notas',o.notes||'']];
  let y=50; rows.forEach(([label,val],idx)=>{ const x=22+(idx%2)*88; if(idx%2===0 && idx>0) y+=22; doc.setTextColor(16,149,163); doc.setFont(undefined,'bold'); doc.text(label.toUpperCase(),x,y); doc.setTextColor(25,35,40); doc.setFont(undefined,'normal'); doc.line(x,y+3,x+72,y+3); doc.text(doc.splitTextToSize(String(val),70),x,y+11); });
  doc.setDrawColor(210,225,230); doc.setLineDashPattern([2,2],0); doc.line(22,108,188,108); doc.setLineDashPattern([],0);
  doc.setFillColor(25,184,200); doc.roundedRect(22,115,72,13,4,4,'F'); doc.setTextColor(255,255,255); doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.text('SERVICIO CERTIFICADO',58,124,{align:'center'});
  doc.setTextColor(40,50,55); doc.setFontSize(11); doc.text('Bastian Espinoza',188,120,{align:'right'}); doc.text('+56959355607',188,127,{align:'right'});
  doc.save(`tarjeta-aceite-bgarage.pdf`);
}
function repairPDF(id){
  const r=state.repairs.find(x=>x._id===id); const doc=pdfBase('Informe de reparación'); let y=50;
  y=pdfSection(doc,'1','Datos del vehículo',y);
  y=pdfLineItem(doc,`Cliente: ${r.vehicle?.ownerName||''}`,undefined,y);
  y=pdfLineItem(doc,`Vehículo: ${r.vehicle?.brand||''} ${r.vehicle?.model||''} ${r.vehicle?.plate||''}`,undefined,y);
  y=pdfLineItem(doc,`Trabajo: ${r.title||''}`,`Estado: ${String(r.status||'').replace('_',' ')}`,y);
  y+=4; y=pdfSection(doc,'2','Diagnóstico',y); doc.setFontSize(10.5); doc.setTextColor(35,45,55); let txt=doc.splitTextToSize(r.diagnosis||'Sin diagnóstico registrado.',174); doc.text(txt,18,y); y+=txt.length*5+6;
  y=ensurePage(doc,y); y=pdfSection(doc,'3','Trabajos realizados',y); txt=doc.splitTextToSize(r.workDone||'Sin trabajos registrados.',174); doc.text(txt,18,y); y+=txt.length*5+6;
  y=ensurePage(doc,y); y=pdfSection(doc,'4','Repuestos cambiados',y);
  const parts=(r.partsChanged||[]); if(!parts.length){ y=pdfLineItem(doc,'Sin repuestos registrados','',y); } else { parts.forEach((p,idx)=>{ y=ensurePage(doc,y); y=pdfLineItem(doc,`${idx+1}. ${p.name||'Repuesto'}`,'Instalado',y); }); }
  y+=3; y=ensurePage(doc,y); y=pdfSection(doc,'5','Observaciones / códigos',y); txt=doc.splitTextToSize(r.extraProblems||'Sin observaciones adicionales.',174); doc.text(txt,18,y); y+=txt.length*5+6;
  y=ensurePage(doc,y); doc.setFillColor(235,250,252); doc.roundedRect(14,y,182,14,4,4,'F'); doc.setTextColor(16,80,90); doc.setFontSize(11); doc.setFont(undefined,'bold'); doc.text('Resumen para cliente',20,y+9); doc.setTextColor(45,60,65); doc.setFont(undefined,'normal'); doc.text('Este informe oculta costos internos y muestra solo el resumen del servicio realizado.',190,y+9,{align:'right'});
  pdfFooter(doc); doc.save(`informe-bgarage-${r.vehicle?.plate||'vehiculo'}.pdf`);
}
window.addEventListener('DOMContentLoaded', async()=>{ try{ await loadAll(); nav('dashboard'); } catch(e){ showError(e); } });
