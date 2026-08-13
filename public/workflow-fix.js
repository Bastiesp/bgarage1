/* BGarage - flujo Presupuesto -> Kanban -> Reparación
   Este archivo se carga después de app.js.
   No modifica la API ni los modelos: usa el campo "codes" del Repair
   para vincular cada reparación con su presupuesto mediante QUOTE:<id>.
*/
(function () {
  function quoteRepairMarker(quoteId){
    return 'QUOTE:' + String(quoteId || '');
  }

  function linkedRepairForQuote(quoteId){
    const marker = quoteRepairMarker(quoteId);
    return (state.repairs || []).find(r => Array.isArray(r.codes) && r.codes.includes(marker));
  }

  function vehicleLabelFromData(v){
    if(!v) return '';
    const main = [v.brand, v.model, v.year].filter(Boolean).join(' ');
    const plate = String(v.plate || '').trim();
    return [plate, main].filter(Boolean).join(' · ');
  }

  function quoteItemsSummary(items, quoteNumber){
    const rows = (items || []).map(i => {
      const desc = String(i.description || 'Item').trim();
      const brief = String(i.brief || '').trim();
      const price = money(i.unitPrice || 0);
      return `• ${desc}${brief ? ': ' + brief : ''} — ${price}`;
    });
    return [`Detalle presupuesto N° ${quoteNumber}`, ...rows].join('\n');
  }

  async function syncQuoteWithKanban(quote, vehicleId, items, total){
    if(!quote || !quote._id || !vehicleId) return;

    const marker = quoteRepairMarker(quote._id);
    const num = quote.quoteNumber || quoteNumberDisplay(quote);
    const firstItem = (items || []).find(i => i.description);
    const title = firstItem
      ? `Presupuesto N° ${num} · ${String(firstItem.description).trim()}`
      : `Presupuesto N° ${num}`;

    const diagnosis = quoteItemsSummary(items, num);
    const existing = linkedRepairForQuote(quote._id);

    if(existing){
      // Una vez iniciada la reparación, no pisamos diagnóstico/trabajos escritos por el taller.
      if(existing.status === 'presupuestado'){
        await api('/repairs/' + existing._id, {
          method:'PUT',
          body:JSON.stringify({
            vehicle: vehicleId,
            title,
            diagnosis,
            totalCharged: total,
            codes: Array.from(new Set([...(existing.codes || []), marker]))
          })
        });
      }
      return;
    }

    await api('/repairs', {
      method:'POST',
      body:JSON.stringify({
        vehicle: vehicleId,
        title,
        status:'presupuestado',
        diagnosis,
        workDone:'',
        extraProblems:'',
        totalCharged: total,
        codes:[marker]
      })
    });
  }

  window.fillQuoteVehicle = function fillQuoteVehicle(select){
    const vehicle = state.vehicles.find(v => String(v._id) === String(select.value));
    if(!vehicle) return;
    const form = select.closest('form');
    const map = {
      manualOwnerName: vehicle.ownerName,
      manualOwnerPhone: vehicle.ownerPhone,
      manualPlate: vehicle.plate,
      manualBrand: vehicle.brand,
      manualModel: vehicle.model,
      manualYear: vehicle.year,
      manualCurrentKm: vehicle.currentKm
    };
    for(const [name,val] of Object.entries(map)){
      const el = form.querySelector(`[name="${name}"]`);
      if(el) el.value = val || '';
    }
  };

  window.quoteForm = function quoteForm(id){
    const q = state.quotes.find(x => x._id === id) || {};
    const currentVehicleId = String(q.vehicle?._id || q.vehicle || '');
    const currentVehicle = q.vehicle && typeof q.vehicle === 'object' ? q.vehicle : {};

    const options = state.vehicles.map(v =>
      `<option value="${v._id}" ${currentVehicleId === String(v._id) ? 'selected' : ''}>` +
      `${safe(v.ownerName || '')} · ${safe(v.plate || '')} · ${safe(v.brand || '')} ${safe(v.model || '')}` +
      `</option>`
    ).join('');

    const itemRows = (q.items && q.items.length)
      ? q.items.map(i => quoteItemRow(i.description || '', i.brief || '', i.unitPrice || '')).join('')
      : quoteItemRow();

    const fallbackOwner = currentVehicle.ownerName || q.ownerName || '';
    const fallbackPlate = currentVehicle.plate || '';
    const fallbackBrand = currentVehicle.brand || '';
    const fallbackModel = currentVehicle.model || (!currentVehicleId ? (q.vehicleLabel || '') : '');
    const fallbackYear = currentVehicle.year || '';
    const fallbackKm = currentVehicle.currentKm || '';
    const fallbackPhone = currentVehicle.ownerPhone || '';

    baseForm(id ? 'Editar presupuesto profesional' : 'Nuevo presupuesto profesional', `
      <div class="form-section-title">Cliente y vehículo</div>
      <p class="muted small">Al guardar el presupuesto, el vehículo aparecerá automáticamente en Kanban como “Presupuestado”.</p>

      <select name="vehicle" onchange="fillQuoteVehicle(this)">
        <option value="">Nuevo cliente / vehículo</option>
        ${options}
      </select>

      <div class="manual-vehicle-grid">
        <input name="manualOwnerName" placeholder="Nombre cliente" required value="${safe(fallbackOwner)}">
        <input name="manualOwnerPhone" placeholder="Teléfono" value="${safe(fallbackPhone)}">
        <input name="manualPlate" placeholder="Patente" value="${safe(fallbackPlate)}">
        <input name="manualBrand" placeholder="Marca" value="${safe(fallbackBrand)}">
        <input name="manualModel" placeholder="Modelo" value="${safe(fallbackModel)}">
        <input name="manualYear" type="number" placeholder="Año" value="${safe(fallbackYear)}">
        <input name="manualCurrentKm" type="number" placeholder="KM actual" value="${safe(fallbackKm)}">
      </div>

      <div class="form-section-title">Items del presupuesto</div>
      <p class="muted small">Estos datos también quedarán precargados en la reparación para facilitar el informe posterior.</p>
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

          const vehicleData = {
            ownerName: String(fd.get('manualOwnerName') || '').trim(),
            ownerPhone: String(fd.get('manualOwnerPhone') || '').trim(),
            plate: String(fd.get('manualPlate') || '').trim(),
            brand: String(fd.get('manualBrand') || '').trim(),
            model: String(fd.get('manualModel') || '').trim(),
            year: fd.get('manualYear') || undefined,
            currentKm: fd.get('manualCurrentKm') || undefined
          };

          if(!vehicleData.ownerName) throw new Error('Debes indicar el nombre del cliente.');

          let vehicleId = String(fd.get('vehicle') || '');
          let vehicleObj = null;

          if(!vehicleId){
            // El presupuesto puede crear al cliente/vehículo directamente.
            vehicleObj = await api('/vehicles', {
              method:'POST',
              body:JSON.stringify(vehicleData)
            });
            vehicleId = String(vehicleObj._id);
          } else {
            vehicleObj = state.vehicles.find(v => String(v._id) === vehicleId) || vehicleData;
            // Mantiene actualizada la ficha si cambiaste teléfono, patente, KM, etc.
            const cleanVehicle = Object.fromEntries(
              Object.entries(vehicleData).filter(([_,v]) => v !== '' && v !== undefined)
            );
            if(Object.keys(cleanVehicle).length){
              vehicleObj = await api('/vehicles/' + vehicleId, {
                method:'PUT',
                body:JSON.stringify(cleanVehicle)
              });
            }
          }

          const quotePayload = {
            vehicle: vehicleId,
            ownerName: vehicleData.ownerName || vehicleObj?.ownerName || '',
            vehicleLabel: vehicleLabelFromData(vehicleObj || vehicleData),
            items,
            subtotal: total,
            total
          };

          const savedQuote = await api('/quotes' + (id ? '/' + id : ''), {
            method:id ? 'PUT' : 'POST',
            body:JSON.stringify(quotePayload)
          });

          // Crear/actualizar la tarjeta del Kanban vinculada al presupuesto.
          await syncQuoteWithKanban(savedQuote, vehicleId, items, total);

          closeModal();
          await loadAll();
          renderQuotes();
        }catch(err){
          showError(err);
        }
      }
    );

    recalcQuoteTotal();
  };


  window.useLegacyQuoteForRepair = async function useLegacyQuoteForRepair(id){
    const q = state.quotes.find(x => String(x._id) === String(id));
    if(!q) return;

    try{
      // Si ya existe una reparación vinculada, simplemente la abrimos.
      const existing = linkedRepairForQuote(q._id);
      if(existing){
        repairForm(existing._id);
        return;
      }

      let vehicleId = String(q.vehicle?._id || q.vehicle || '');
      let vehicleObj = q.vehicle && typeof q.vehicle === 'object' ? q.vehicle : null;

      // Presupuestos antiguos no tenían vehicle vinculado.
      // Primero intentamos reutilizar un cliente existente por nombre.
      if(!vehicleId){
        const ownerNorm = norm(q.ownerName || '');
        const labelNorm = norm(q.vehicleLabel || '');

        const candidate = (state.vehicles || []).find(v => {
          const sameOwner = ownerNorm && norm(v.ownerName || '') === ownerNorm;
          if(!sameOwner) return false;
          if(!labelNorm) return true;
          const vehicleHaystack = norm([v.plate, v.brand, v.model, v.year].join(' '));
          return vehicleHaystack.includes(labelNorm) || labelNorm.includes(vehicleHaystack);
        }) || (state.vehicles || []).find(v => ownerNorm && norm(v.ownerName || '') === ownerNorm);

        if(candidate){
          vehicleId = String(candidate._id);
          vehicleObj = candidate;
        }
      }

      // Si tampoco existe cliente, creamos uno usando exactamente lo que ya estaba
      // escrito en el presupuesto antiguo, sin pedir volver a escribirlo.
      if(!vehicleId){
        vehicleObj = await api('/vehicles', {
          method:'POST',
          body:JSON.stringify({
            ownerName: q.ownerName || 'Cliente presupuesto',
            model: q.vehicleLabel || `Vehículo presupuesto N° ${quoteNumberDisplay(q)}`
          })
        });
        vehicleId = String(vehicleObj._id);
      }

      // Guardamos el vínculo también en el presupuesto viejo para que quede reparado
      // hacia adelante.
      await api('/quotes/' + q._id, {
        method:'PUT',
        body:JSON.stringify({
          vehicle: vehicleId,
          ownerName: q.ownerName || vehicleObj?.ownerName || '',
          vehicleLabel: q.vehicleLabel || vehicleLabelFromData(vehicleObj || {})
        })
      });

      const num = quoteNumberDisplay(q);
      const items = q.items || [];
      const firstItem = items.find(i => i.description);
      const marker = quoteRepairMarker(q._id);
      const title = firstItem
        ? `Presupuesto N° ${num} · ${String(firstItem.description || '').trim()}`
        : `Presupuesto N° ${num}`;
      const diagnosis = quoteItemsSummary(items, num);

      const repair = await api('/repairs', {
        method:'POST',
        body:JSON.stringify({
          vehicle: vehicleId,
          title,
          status:'en_reparacion',
          diagnosis,
          workDone:'',
          extraProblems:'',
          totalCharged:Number(q.total || 0),
          codes:[marker]
        })
      });

      await loadAll();

      // Abre inmediatamente el formulario de reparación con cliente, vehículo,
      // items y total ya recuperados desde el presupuesto.
      repairForm(repair._id);
    }catch(err){
      showError(err);
    }
  };

  window.deleteQuoteLinked = async function deleteQuoteLinked(id){
    const q = state.quotes.find(x => String(x._id) === String(id));
    if(!q) return;

    const ok = confirm(`¿Seguro que quieres eliminar el presupuesto N° ${quoteNumberDisplay(q)}?`);
    if(!ok) return;

    try{
      const linked = linkedRepairForQuote(q._id);

      // Si aún está solamente presupuestado, eliminamos también su tarjeta del Kanban.
      // Si la reparación ya comenzó o fue entregada, conservamos el historial.
      if(linked && linked.status === 'presupuestado'){
        await api('/repairs/' + linked._id, { method:'DELETE' });
      }

      await api('/quotes/' + q._id, { method:'DELETE' });
      await loadAll();
      renderQuotes();
    }catch(err){
      showError(err);
    }
  };

  window.renderQuotes = function renderQuotes(){
    const quotes = filterList(state.quotes, 'quotes', quoteText);
    $('#content').innerHTML =
      `<div class="top"><h1>Presupuestos</h1><button class="add-only" title="Nuevo presupuesto" onclick="quoteForm()">+</button></div>` +
      `${searchBox('quotes')}` +
      `${table(quotes.map(q => [
        `N° ${quoteNumberDisplay(q)}`,
        safe(q.ownerName),
        safe(q.vehicleLabel),
        badge(q.status),
        money(q.total),
        `<button onclick="previewQuote('${q._id}')">Ver PDF</button> ` +
        `<button class="ghost" onclick="quotePDF('${q._id}')">Descargar</button> ` +
        `<button class="ghost" onclick="useLegacyQuoteForRepair('${q._id}')">Usar en reparación</button> ` +
        `<button class="ghost" onclick="quoteForm('${q._id}')">Editar</button> ` +
        `<button class="ghost danger" onclick="deleteQuoteLinked('${q._id}')">Eliminar</button>`
      ]), ['N°','Cliente','Vehículo','Estado','Total',''])}`;
  };
})();
