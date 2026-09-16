/* =========================================================
   captura.js — lógica de las pestañas Registro y Operación.
   Requiere que shared.js esté cargado antes que este archivo.
   ========================================================= */

let opSeleccionado = null;

/* ---------- REGISTRO ---------- */
function updateCodigoPreview(){
  const fh = document.getElementById('f-fecha').value;
  const denom = document.getElementById('f-denom').value;
  const peso = parseFloat(document.getElementById('f-peso').value);
  const directo = document.getElementById('f-directo').checked;
  const codigo = fh ? codigoBache(fh, denom) : null;
  document.getElementById('codigo-preview').textContent = codigo || '—';
  const bp = document.getElementById('bines-preview');
  const existente = codigo ? DATA.baches.find(b=>b.codigo===codigo) : null;

  if(existente){
    const totalConEste = existente.peso_fresco + (peso>0 ? peso : 0);
    bp.innerHTML = `Ya existe este bache con ${existente.peso_fresco} kg (${existente.basculas.length} pesaje(s)). Este pesaje se sumará: total quedaría en <b>${totalConEste} kg</b>.`;
  } else if(directo){
    bp.innerHTML = `Se enviará directo a <b>despulpado → F. anaeróbica</b>, sin pasar por bines.`;
  } else if(peso > 0){
    bp.innerHTML = `Aportará <b>${peso} kg</b> a recepción en bines.`;
  } else {
    bp.innerHTML = '';
  }
}

function renderResumenHoyAyer(){
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate()-1);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const keyHoy = fmt(hoy), keyAyer = fmt(ayer);

  const deHoy = DATA.baches.filter(b=>b.fecha===keyHoy);
  const deAyer = DATA.baches.filter(b=>b.fecha===keyAyer);
  const kgHoy = deHoy.reduce((s,b)=>s+b.peso_fresco,0);
  const kgAyer = deAyer.reduce((s,b)=>s+b.peso_fresco,0);
  const pesajesHoy = deHoy.reduce((s,b)=>s+(b.basculas||[]).length,0);
  const pesajesAyer = deAyer.reduce((s,b)=>s+(b.basculas||[]).length,0);

  document.getElementById('resumen-hoy-ayer').innerHTML = `
    <div class="dash-card"><div class="n">${(kgHoy/1000).toFixed(2)}</div><div class="label">ton recibidas hoy (${deHoy.length} bache${deHoy.length===1?'':'s'})</div></div>
    <div class="dash-card"><div class="n">${pesajesHoy}</div><div class="label">pesajes hoy</div></div>
    <div class="dash-card"><div class="n">${(kgAyer/1000).toFixed(2)}</div><div class="label">ton recibidas ayer (${deAyer.length} bache${deAyer.length===1?'':'s'})</div></div>
    <div class="dash-card"><div class="n">${pesajesAyer}</div><div class="label">pesajes ayer</div></div>
  `;
}

function renderCacaoLocal(){
  document.getElementById('cacao-local-total').textContent = (DATA.cacaoLocal.enProceso||0).toFixed(2);
}

async function registrarCacaoLocal(){
  const peso = parseFloat(document.getElementById('local-peso').value) || 0;
  const nota = document.getElementById('local-nota').value.trim();
  const msg = document.getElementById('local-msg');
  const operario = getOperario();
  if(!operario){
    msg.innerHTML = '<div class="msg err">Escribe tu nombre en "Operario" arriba antes de registrar.</div>';
    return;
  }
  if(peso <= 0){
    msg.innerHTML = '<div class="msg err">Ingresa un peso mayor a 0.</div>';
    return;
  }
  DATA.cacaoLocal.enProceso += peso;
  DATA.cacaoLocal.movimientos.push({ fecha: new Date().toISOString(), peso, nota, operario });
  registrarMovimiento('Entrada de cacao LOCAL', `${peso} kg${nota ? ' — ' + nota : ''} (fresco, pendiente de liberación)`, operario);
  document.getElementById('local-peso').value = '';
  document.getElementById('local-nota').value = '';
  msg.innerHTML = '<div class="msg ok">Entrada registrada como fresco, pendiente de que el jefe de producción lo libere.</div>';
  await save();
  render();
}

async function registrarBache(){
  const fh = document.getElementById('f-fecha').value;
  const denom = document.getElementById('f-denom').value;
  const peso = parseFloat(document.getElementById('f-peso').value);
  const bascula = document.getElementById('f-bascula').value.trim();
  const directo = document.getElementById('f-directo').checked;
  const operario = getOperario();
  const msg = document.getElementById('form-msg');
  msg.innerHTML = '';

  if(!operario){
    msg.innerHTML = '<div class="msg err">Escribe tu nombre en "Operario" arriba antes de registrar.</div>';
    return;
  }
  if(!fh || !peso || peso<=0 || !bascula){
    msg.innerHTML = '<div class="msg err">Completa fecha/hora, peso y báscula.</div>';
    return;
  }
  const codigo = codigoBache(fh, denom);
  const horaEntrada = new Date(fh);
  const existente = DATA.baches.find(b=>b.codigo===codigo);

  if(existente){
    if(existente.etapaIdx===7){
      msg.innerHTML = `<div class="msg err">El bache ${codigo} ya se cerró (está en Almacenado); no se puede agregar más fruta.</div>`;
      return;
    }
    existente.basculas.push({numero: bascula, peso, hora: horaEntrada.toISOString()});
    existente.peso_fresco += peso;
    registrarMovimiento('Pesaje agregado', `Bache ${codigo}: +${peso} kg (báscula ${bascula}), total ${existente.peso_fresco} kg`, operario);
    await save();
    msg.innerHTML = `<div class="msg ok">Se agregó el pesaje de báscula ${bascula} (${peso} kg) al bache ${codigo}. Total acumulado: ${existente.peso_fresco} kg.</div>`;
  } else {
    let etapaIdxInicial = 0;
    let historialInicial = [];
    if(directo){
      etapaIdxInicial = 2;
      historialInicial = [{
        etapaIdx:1, etapaNombre:'Despulpado',
        horaInicio:horaEntrada.toISOString(), horaFin:horaEntrada.toISOString(),
        duracionHoras:0, estado:'ok', limiteHoras:null, ocupacion:'—'
      }];
    }
    DATA.baches.push({
      codigo, fecha: fh.split('T')[0], denom, peso_fresco: peso,
      basculas: [{numero: bascula, peso, hora: horaEntrada.toISOString()}],
      etapaIdx: etapaIdxInicial,
      horaInicioEtapa: horaEntrada.toISOString(),
      historial: historialInicial,
      volteos: [],
      peso_final: null, peso_g1: null, peso_g2: null, peso_impurezas: null,
      humedadSalida: null, liberado: false, lvAsignaciones: []
    });
    registrarMovimiento('Bache creado', `Bache ${codigo}: ${peso} kg (báscula ${bascula})${directo ? ', directo a F. anaeróbica' : ', en recepción de bines'}`, operario);
    await save();
    msg.innerHTML = directo
      ? `<div class="msg ok">Bache ${codigo} creado, enviado directo a F. anaeróbica.</div>`
      : `<div class="msg ok">Bache ${codigo} creado en recepción de bines.</div>`;
  }
  document.getElementById('f-peso').value = '';
  document.getElementById('f-bascula').value = '';
  document.getElementById('f-directo').checked = false;
  render();
}

/* ---------- OPERACIÓN ---------- */
function seleccionarOp(codigo){
  opSeleccionado = (opSeleccionado === codigo) ? null : codigo;
  render();
}

async function avanzarEtapa(codigo){
  const b = DATA.baches.find(x=>x.codigo===codigo);
  const horaInput = document.getElementById('mov-hora-'+codigo);
  const cantInput = document.getElementById('mov-cantidad-'+codigo);
  const horaReal = horaInput.value ? new Date(horaInput.value) : new Date();
  const msgEl = document.getElementById('mov-msg-'+codigo);
  const operario = getOperario();

  if(!operario){
    msgEl.innerHTML = '<div class="msg err">Escribe tu nombre en "Operario" arriba antes de mover el bache.</div>';
    return;
  }

  let cantidad = cantInput ? parseFloat(cantInput.value) : b.peso_fresco;
  if(isNaN(cantidad) || cantidad <= 0){
    msgEl.innerHTML = '<div class="msg err">Ingresa una cantidad válida a mover.</div>';
    return;
  }
  if(cantidad > b.peso_fresco + 0.01){
    msgEl.innerHTML = `<div class="msg err">No puedes mover más de lo disponible en este bache (${b.peso_fresco} kg).</div>`;
    return;
  }

  if(b.etapaIdx === 5){
    const humInput = document.getElementById('mov-humedad-'+codigo);
    const humedad = parseFloat(humInput.value);
    if(isNaN(humedad) || humedad < 0 || humedad > 100){
      msgEl.innerHTML = '<div class="msg err">Ingresa una humedad de salida válida (0-100%).</div>';
      return;
    }
  }

  const siguienteEtapaTxt = siguienteEtapaVisible(b.etapaIdx);
  const confirmTxt = cantidad < b.peso_fresco - 0.01
    ? `¿Confirmas mover ${cantidad} kg del bache ${codigo} a ${siguienteEtapaTxt}? El resto (${(b.peso_fresco-cantidad).toFixed(1)} kg) se queda en ${STAGES[b.etapaIdx]}.`
    : `¿Confirmas mover el bache ${codigo} completo (${b.peso_fresco} kg) a ${siguienteEtapaTxt}?`;
  if(!confirm(confirmTxt)) return;

  // Si la cantidad a mover es menor al total, se separa un bache parcial con ese peso;
  // el bache original conserva el resto, en la misma etapa, intacto.
  let target = b;
  const esParcial = cantidad < b.peso_fresco - 0.01;
  if(esParcial){
    target = crearBacheParcial(b, cantidad);
    b.peso_fresco -= cantidad;
  }

  if(target.etapaIdx === 5){
    const humInput = document.getElementById('mov-humedad-'+codigo);
    target.humedadSalida = parseFloat(humInput.value);
  }

  const inicio = new Date(target.horaInicioEtapa);
  const duracionHoras = (horaReal - inicio) / 3600000;
  const limite = limiteHoras(target.etapaIdx, target.denom);
  const estado = (limite!=null && duracionHoras > limite) ? 'excedido' : 'ok';

  target.historial.push({
    etapaIdx: target.etapaIdx, etapaNombre: STAGES[target.etapaIdx],
    horaInicio: target.horaInicioEtapa, horaFin: horaReal.toISOString(),
    duracionHoras, estado, limiteHoras: limite, ocupacion: ocupacionLabel(target),
    humedadSalida: target.etapaIdx===5 ? target.humedadSalida : undefined
  });

  const etapaOrigen = STAGES[target.etapaIdx];
  let siguienteIdx = target.etapaIdx + 1;
  if(STAGES[siguienteIdx] === 'Despulpado'){
    target.historial.push({
      etapaIdx: siguienteIdx, etapaNombre: 'Despulpado',
      horaInicio: horaReal.toISOString(), horaFin: horaReal.toISOString(),
      duracionHoras: 0, estado: 'ok', limiteHoras: null, ocupacion: '—'
    });
    siguienteIdx += 1;
  }

  target.etapaIdx = siguienteIdx;
  target.horaInicioEtapa = horaReal.toISOString();
  registrarMovimiento(
    'Cambio de etapa',
    `Bache ${target.codigo}${esParcial ? ` (parcial de ${b.codigo}, ${cantidad} kg)` : ''}: ${etapaOrigen} → ${STAGES[siguienteIdx]}`,
    operario
  );
  opSeleccionado = null;
  await save();
  render();
}

async function registrarEmpaque(codigo){
  const b = DATA.baches.find(x=>x.codigo===codigo);
  const bultosInput = document.getElementById('mov-bultos-'+codigo);
  const remInput = document.getElementById('mov-remanente-'+codigo);
  const g2Input = document.getElementById('mov-g2-'+codigo);
  const impInput = document.getElementById('mov-imp-'+codigo);
  const horaInput = document.getElementById('mov-hora-'+codigo);

  const bultos = parseInt(bultosInput.value) || 0;
  const remanenteNuevo = parseFloat(remInput.value) || 0;
  const g2 = parseFloat(g2Input.value) || 0;
  const imp = parseFloat(impInput.value) || 0;
  const horaReal = horaInput.value ? new Date(horaInput.value) : new Date();
  const msgEl = document.getElementById('mov-msg-'+codigo);
  const operario = getOperario();

  if(!operario){
    msgEl.innerHTML = '<div class="msg err">Escribe tu nombre en "Operario" arriba antes de registrar el empaque.</div>';
    return;
  }
  const pesoBulto = pesoBultoDe(b.denom);
  const bultosKg = Math.round(bultos * pesoBulto * 10) / 10;
  if(bultos <= 0 && remanenteNuevo <= 0 && g2 <= 0){
    msgEl.innerHTML = '<div class="msg err">Registra al menos sacos, remanente o grado 2.</div>';
    return;
  }

  const remanentePrevio = DATA.remanenteG1[b.denom] || 0;
  // Homólogo en kg de lo empacado: número de sacos × peso de bulto de esta denominación.
  const pesoSecoTotalAprox = bultosKg + remanenteNuevo + g2;
  const factor = pesoSecoTotalAprox / b.peso_fresco;
  if(factor < 0.20 || factor > 0.45){
    const minKg = Math.round(b.peso_fresco * 0.20);
    const maxKg = Math.round(b.peso_fresco * 0.45);
    msgEl.innerHTML = `<div class="msg err">El total (${bultos} sacos = ${bultosKg} kg, + remanente ${remanenteNuevo} kg + grado 2 ${g2} kg = ${pesoSecoTotalAprox} kg) está fuera del rango esperado para ${b.peso_fresco} kg de fresco: entre ${minKg} kg y ${maxKg} kg. Revisa los datos.</div>`;
    return;
  }

  if(!confirm(`¿Confirmas el empaque del bache ${codigo}? ${bultos} sacos (${bultosKg} kg) a lote de venta · remanente resultante ${remanenteNuevo} kg (remanente previo era ${remanentePrevio} kg) · G2 ${g2} kg · impurezas ${imp} kg. Esto lo pasa a Almacenado.`)) return;

  const inicio = new Date(b.horaInicioEtapa);
  const duracionHoras = (horaReal - inicio) / 3600000;
  const limite = limiteHoras(b.etapaIdx, b.denom);
  const estado = (limite!=null && duracionHoras > limite) ? 'excedido' : 'ok';

  b.historial.push({
    etapaIdx: b.etapaIdx, etapaNombre: STAGES[b.etapaIdx],
    horaInicio: b.horaInicioEtapa, horaFin: horaReal.toISOString(),
    duracionHoras, estado, limiteHoras: limite, ocupacion: '—'
  });

  b.bultos = bultos;
  b.remanenteRecibido = remanentePrevio;
  b.remanenteResultante = remanenteNuevo;
  b.peso_g2 = g2;
  b.peso_impurezas = imp;
  // Solo los sacos completos de grado 1 siguen el circuito formal de
  // bache → lote de venta → despacho. El remanente (lo que sobra sin llenar
  // un saco completo, pesado aparte) se guarda para consolidarse con el
  // siguiente bache de esta misma denominación que se empaque. El grado 2 y
  // las impurezas van directo al inventario común de bodega.
  b.peso_g1 = bultosKg;
  b.peso_final = bultosKg;
  b.factorConversion = Math.round(factor*1000)/10;
  DATA.remanenteG1[b.denom] = remanenteNuevo;
  DATA.inventarioSecundario.grado2 += g2;
  DATA.inventarioSecundario.impurezas += imp;
  b.contadoEnPoolG2 = true;
  b.etapaIdx = 7;
  b.liberado = false;
  b.horaInicioEtapa = horaReal.toISOString();
  registrarMovimiento('Empaque registrado', `Bache ${b.codigo}: ${bultos} sacos (${bultosKg} kg) a lote de venta · remanente resultante ${remanenteNuevo} kg (previo ${remanentePrevio} kg) · G2 ${g2} kg e impurezas ${imp} kg a inventario común`, operario);
  opSeleccionado = null;
  await save();
  render();
}

async function registrarVolteo(codigo){
  const b = DATA.baches.find(x=>x.codigo===codigo);
  const operario = getOperario();
  if(!operario){
    alert('Escribe tu nombre en "Operario" arriba antes de registrar un volteo.');
    return;
  }
  b.volteos = b.volteos || [];
  b.volteos.push({ hora: new Date().toISOString(), operario });
  registrarMovimiento('Volteo registrado', `Bache ${codigo}: volteo N° ${b.volteos.length}`, operario);
  await save();
  render();
}

async function eliminarBache(codigo){
  DATA.baches = DATA.baches.filter(b=>b.codigo!==codigo);
  await save();
  render();
}

async function retrocederEtapa(codigo){
  const b = DATA.baches.find(x=>x.codigo===codigo);
  const operario = getOperario();
  if(!operario){
    alert('Escribe tu nombre en "Operario" arriba antes de retroceder un bache.');
    return;
  }
  if(b.etapaIdx===7 && (b.liberado || (b.lvAsignaciones||[]).length>0)){
    alert('Este bache ya fue liberado o asignado a un lote de venta; no se puede retroceder desde aquí. Corrígelo desde Panel si es necesario.');
    return;
  }
  if(!b.historial.length){
    alert('Este bache está en su primera etapa, no hay a dónde retroceder.');
    return;
  }
  if(!confirm(`¿Confirmas devolver el bache ${codigo} a la etapa anterior? Se descontará el paso más reciente de su historial.`)) return;

  const eraEmpaque = b.etapaIdx === 7;
  let entry = b.historial.pop();
  if(entry && entry.etapaNombre === 'Despulpado'){
    const entryReal = b.historial.pop();
    if(entryReal) entry = entryReal;
  }
  if(!entry) return;

  if(eraEmpaque){
    if(b.contadoEnPoolG2){
      DATA.inventarioSecundario.grado2 -= (b.peso_g2||0);
      DATA.inventarioSecundario.impurezas -= (b.peso_impurezas||0);
      DATA.remanenteG1[b.denom] = b.remanenteRecibido || 0;
    }
    b.peso_g1 = null; b.peso_g2 = null; b.peso_impurezas = null; b.peso_final = null; b.liberado = false;
    b.bultos = null; b.remanenteRecibido = null; b.remanenteResultante = null; b.pruebaCorte = null; b.factorConversion = null;
    b.contadoEnPoolG2 = false;
  }
  if(entry.etapaIdx === 5){
    b.humedadSalida = null;
  }
  b.etapaIdx = entry.etapaIdx;
  b.horaInicioEtapa = entry.horaInicio;
  registrarMovimiento('Retroceso de etapa', `Bache ${codigo}: vuelve a ${STAGES[b.etapaIdx]}`, operario);
  opSeleccionado = null;
  await save();
  render();
}

function renderOpCard(b){
  const denomInfo = DENOM[b.denom];
  const now = new Date();
  const inicio = new Date(b.horaInicioEtapa);
  const horas = (now - inicio)/3600000;
  const limite = limiteHoras(b.etapaIdx, b.denom);
  const excedido = limite!=null && horas > limite;
  const durClass = excedido ? 'excedido' : 'ok';
  const durTxt = horas < 24 ? `${horas.toFixed(1)} h en etapa` : `${(horas/24).toFixed(1)} d en etapa`;
  const limTxt = limite!=null ? ` (límite ${limite} h)` : '';

  let accion = '';
  if(opSeleccionado === b.codigo){
    if(b.etapaIdx === 3){
      const volteos = b.volteos || [];
      const ultimoVolteo = volteos.length ? fmtDateTime(new Date(volteos[volteos.length-1].hora)) : null;
      accion += `
        <div class="op-meta">Volteos registrados: <b>${volteos.length}</b>${ultimoVolteo ? ` · último: ${ultimoVolteo}` : ''}</div>
        <button class="secondary" onclick="event.stopPropagation(); registrarVolteo('${b.codigo}')">↻ Registrar volteo</button>`;
    }
    if(b.etapaIdx === 6){
      const pesoBulto = pesoBultoDe(b.denom);
      const remanentePrevio = DATA.remanenteG1[b.denom] || 0;
      const minSacos = Math.floor((b.peso_fresco * 0.20) / pesoBulto);
      const maxSacos = Math.floor((b.peso_fresco * 0.45) / pesoBulto);
      accion += `
        <div class="op-action" onclick="event.stopPropagation()">
          <div class="op-preview">Peso fresco: <b>${b.peso_fresco} kg</b> · Remanente de ${DENOM[b.denom].label} disponible antes de ensacar (ya mézclalo con este bache): <b>${remanentePrevio} kg</b> · Sacos esperados aprox. (de ${pesoBulto} kg c/u): <b>${minSacos} – ${maxSacos}</b></div>
          <div class="row">
            <div class="field"><label>Sacos de grado 1 llenados</label><input type="number" id="mov-bultos-${b.codigo}" min="0" step="1"></div>
            <div class="field"><label>Remanente resultante (kg, pesado aparte)</label><input type="number" id="mov-remanente-${b.codigo}" min="0" step="0.1"></div>
            <div class="field"><label>Ensacado grado 2 (kg)</label><input type="number" id="mov-g2-${b.codigo}" min="0" step="0.1"></div>
            <div class="field"><label>Impurezas / grado 3 (kg)</label><input type="number" id="mov-imp-${b.codigo}" min="0" step="0.1"></div>
            <div class="field"><label>Fecha y hora real</label><input type="datetime-local" id="mov-hora-${b.codigo}" value="${toLocalInputValue(new Date())}"></div>
          </div>
          <div id="mov-msg-${b.codigo}"></div>
          <button class="big" onclick="registrarEmpaque('${b.codigo}')">Registrar empaque</button>
        </div>`;
    } else {
      const siguiente = siguienteEtapaVisible(b.etapaIdx);
      const capSig = capacidadDe(siguiente);
      const preview = capSig
        ? `Aportará <b>${(pesoRelevante(b)/1000).toFixed(2)} ton</b> a ${siguiente} (o la cantidad parcial que indiques).`
        : (siguiente==='Almacenado' ? `Ocupará bodega al empacar (aún sin peso seco).` : '');
      const humedadField = b.etapaIdx===5
        ? `<div class="field"><label>Humedad de salida (%)</label><input type="number" id="mov-humedad-${b.codigo}" min="0" max="100" step="0.1"></div>`
        : '';
      accion += `
        <div class="op-action" onclick="event.stopPropagation()">
          <div class="row">
            <div class="field"><label>Cantidad a mover (kg, máx ${b.peso_fresco})</label>
              <input type="number" id="mov-cantidad-${b.codigo}" min="0" max="${b.peso_fresco}" step="0.1" value="${b.peso_fresco}" oninput="document.getElementById('mov-cantidad-slider-${b.codigo}').value=this.value">
              <input type="range" id="mov-cantidad-slider-${b.codigo}" min="0" max="${b.peso_fresco}" step="0.1" value="${b.peso_fresco}" style="width:100%; margin-top:8px;" oninput="document.getElementById('mov-cantidad-${b.codigo}').value=this.value">
            </div>
            ${humedadField}
            <div class="field"><label>Fecha y hora real de traslado a ${siguiente}</label><input type="datetime-local" id="mov-hora-${b.codigo}" value="${toLocalInputValue(new Date())}"></div>
          </div>
          <div class="op-preview">${preview} Si mueves menos del total, el resto queda en este bache en ${STAGES[b.etapaIdx]}.</div>
          <div id="mov-msg-${b.codigo}"></div>
          <button class="big" onclick="avanzarEtapa('${b.codigo}')">Mover a ${siguiente}</button>
        </div>`;
    }
  }

  return `
    <div class="op-card ${opSeleccionado===b.codigo?'selected':''}" onclick="seleccionarOp('${b.codigo}')">
      <div class="op-top">
        <span class="tag" style="background:${denomInfo.color}">${denomInfo.label}</span>
        <span class="op-codigo">${b.codigo}</span>
        <span class="op-meta">${infoPesoBache(b)}${b.parcialDe ? ` · parcial de ${b.parcialDe}` : ''}</span>
        <button class="secondary" style="margin-left:auto;" onclick="event.stopPropagation(); seleccionarOp('${b.codigo}')">
          ${opSeleccionado===b.codigo ? 'Cerrar' : 'Cambiar de etapa'}
        </button>
        ${b.historial.length ? `<button class="secondary" onclick="event.stopPropagation(); retrocederEtapa('${b.codigo}')">↩ Retroceder</button>` : ''}
      </div>
      <div class="op-dur ${durClass}">${durTxt}${limTxt}${excedido?' — excedido':''}</div>
      ${accion}
    </div>`;
}

function renderOpList(){
  const list = document.getElementById('op-list');
  let total = 0;
  let html = '';
  ACTIVE_INDICES.forEach(idx=>{
    const enEtapa = DATA.baches.filter(b=>b.etapaIdx===idx)
      .sort((a,b)=> new Date(a.horaInicioEtapa) - new Date(b.horaInicioEtapa));
    if(enEtapa.length===0) return;
    total += enEtapa.length;
    html += `<p class="block-title" style="margin-top:22px;">${STAGES[idx]} (${enEtapa.length})</p>
      <div class="op-list">${enEtapa.map(renderOpCard).join('')}</div>`;
  });
  document.getElementById('op-count').textContent = `Baches activos (${total})`;
  list.innerHTML = total ? html : '<div class="empty">No hay baches en proceso.</div>';
}

function renderOpDashGrid(){
  const grid = document.getElementById('op-dash-grid');
  const now = new Date();
  let html = '';
  for(const idx of TIME_UNIDADES){
    const enEtapa = DATA.baches.filter(b=>b.etapaIdx===idx);
    let excedidos = [];
    enEtapa.forEach(b=>{
      const horas = (now - new Date(b.horaInicioEtapa))/3600000;
      const lim = limiteHoras(idx, b.denom);
      if(lim!=null && horas>lim) excedidos.push(`${b.codigo} (+${(horas-lim).toFixed(1)} h)`);
    });
    html += `
      <div class="dash-card" ${excedidos.length ? `title="${excedidos.join(', ')}"` : ''}>
        <div class="n">${enEtapa.length}</div>
        <div class="label">${STAGES[idx]}</div>
        ${excedidos.length ? `<details style="margin-top:8px;"><summary style="cursor:pointer; color:var(--warn); font-size:12px;">${excedidos.length} excedido(s)</summary><div class="excedidos" style="margin-top:6px;">${excedidos.join(', ')}</div></details>` : ''}
      </div>`;
  }
  grid.innerHTML = html;
}

/* ---------- FLUJO Y CAPACIDAD ---------- */
function renderFlujo(){
  const boxW = 128, boxH = 96, gap = 42, startX = 16, y = 14;
  let boxesSvg = '', arrowsSvg = '';
  UNIDADES.forEach((idx,i)=>{
    const {count, ocupText, excedidoCap} = agregadoEtapa(idx);
    const x = startX + i*(boxW+gap);
    const borderColor = excedidoCap ? 'var(--warn)' : (count>0 ? 'var(--amber)' : 'var(--line)');
    boxesSvg += `
      <g>
        <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="3" style="fill:var(--panel-2); stroke:${borderColor}; stroke-width:1.5;"/>
        <text x="${x+boxW/2}" y="${y+20}" text-anchor="middle" style="font-size:11px; fill:var(--ink-dim); font-family:'Space Grotesk';">${STAGES[idx]}</text>
        <text x="${x+boxW/2}" y="${y+46}" text-anchor="middle" style="font-size:20px; font-weight:600; fill:var(--ink); font-family:'IBM Plex Mono';">${count}</text>
        <text x="${x+boxW/2}" y="${y+64}" text-anchor="middle" style="font-size:10px; fill:var(--ink-dim); font-family:'Space Grotesk';">baches</text>
        <text x="${x+boxW/2}" y="${y+84}" text-anchor="middle" style="font-size:11px; fill:${excedidoCap?'var(--warn)':'var(--ink-dim)'}; font-family:'IBM Plex Mono';">${ocupText}</text>
      </g>`;
    if(i < UNIDADES.length-1){
      const ax1 = x+boxW, ax2 = x+boxW+gap, ay = y+boxH/2;
      arrowsSvg += `<line x1="${ax1}" y1="${ay}" x2="${ax2-6}" y2="${ay}" style="stroke:var(--line); stroke-width:1.5;" marker-end="url(#arrowhead)"/>`;
    }
  });
  const totalWidth = startX*2 + UNIDADES.length*boxW + (UNIDADES.length-1)*gap;
  document.getElementById('flujo-svg').innerHTML = `
    <svg viewBox="0 0 ${totalWidth} ${boxH+28}" style="width:100%; min-width:${totalWidth}px; display:block;">
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" style="fill:var(--line);"/>
        </marker>
      </defs>
      ${arrowsSvg}
      ${boxesSvg}
    </svg>`;
}

function renderCapTable(){
  const rows = UNIDADES.map(idx=>{
    const {ocupText, pct, excedidoCap} = agregadoEtapa(idx);
    const barColor = excedidoCap ? 'var(--warn)' : 'var(--ok)';
    return `
      <div class="cap-row">
        <div>${STAGES[idx]}</div>
        <div class="cap-bar"><div class="cap-fill" style="width:${pct}%; background:${barColor};"></div></div>
        <div class="cap-text ${excedidoCap?'excedido':''}">${ocupText}</div>
      </div>`;
  }).join('');
  document.getElementById('cap-table').innerHTML = rows;
}

/* ---------- OPERARIO (identificación de quien usa la tableta) ---------- */
function getOperario(){
  try{ return localStorage.getItem('operario-nombre') || ''; }catch(e){ return ''; }
}

/* ---------- RENDER Y ARRANQUE DE ESTA PÁGINA ---------- */
function render(){
  actualizarEncabezado();
  updateCodigoPreview();
  renderResumenHoyAyer();
  renderCacaoLocal();
  renderFlujo();
  renderCapTable();
  renderOpDashGrid();
  renderOpList();
}

inicializarTabs();
document.getElementById('f-fecha').addEventListener('input', updateCodigoPreview);
document.getElementById('f-denom').addEventListener('change', updateCodigoPreview);
document.getElementById('f-peso').addEventListener('input', updateCodigoPreview);
document.getElementById('f-directo').addEventListener('change', updateCodigoPreview);
document.getElementById('btn-registrar').addEventListener('click', registrarBache);
document.getElementById('btn-registrar-local').addEventListener('click', registrarCacaoLocal);
document.getElementById('f-fecha').value = toLocalInputValue(new Date());

/* ---------- Ventana inicial de acceso (operario + clave) ---------- */
// La clave es solo para que nadie entre por accidente, igual que en la app de
// mantenimiento — no sirve para guardar secretos reales. Cámbiala aquí y avísale
// al equipo cuando la cambies.
const CLAVE_ACCESO_PANTALLA = '202699';

function actualizarDisplayOperario(){
  document.getElementById('operario-display-nombre').textContent = getOperario() || '—';
}

function mostrarGate(prellenarNombre){
  document.getElementById('gate-operario').value = prellenarNombre || '';
  document.getElementById('gate-clave').value = '';
  document.getElementById('gate-msg').innerHTML = '';
  document.getElementById('gate-overlay').style.display = 'flex';
  document.getElementById('gate-operario').focus();
}
function ocultarGate(){
  document.getElementById('gate-overlay').style.display = 'none';
}

function verificarAcceso(){
  const yaValidado = (()=>{ try{ return localStorage.getItem('acceso-valido') === 'si'; }catch(e){ return false; } })();
  if(yaValidado && getOperario()){
    actualizarDisplayOperario();
  } else {
    mostrarGate(getOperario());
  }
}

document.getElementById('gate-btn').addEventListener('click', ()=>{
  const nombre = document.getElementById('gate-operario').value.trim();
  const clave = document.getElementById('gate-clave').value.trim();
  const msg = document.getElementById('gate-msg');
  if(!nombre){ msg.innerHTML = '<div class="msg err">Escribe tu nombre.</div>'; return; }
  if(clave !== CLAVE_ACCESO_PANTALLA){ msg.innerHTML = '<div class="msg err">Clave incorrecta.</div>'; return; }
  try{
    localStorage.setItem('operario-nombre', nombre);
    localStorage.setItem('acceso-valido', 'si');
  }catch(e){ /* sin localStorage: seguirá pidiendo acceso cada vez */ }
  ocultarGate();
  actualizarDisplayOperario();
});
document.getElementById('gate-clave').addEventListener('keydown', (e)=>{ if(e.key==='Enter') document.getElementById('gate-btn').click(); });

document.getElementById('btn-cambiar-operario').addEventListener('click', (e)=>{
  e.preventDefault();
  mostrarGate(getOperario());
});

verificarAcceso();

/* ---------- Botón "Instalar app" (PWA) ---------- */
// Siempre visible: si el navegador ya tiene el instalador listo, lo usamos;
// si no, mostramos cómo instalarla manualmente en vez de no hacer nada.
let promptInstalacion = null;
const btnInstalar = document.getElementById('btn-instalar-app');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptInstalacion = e;
});

btnInstalar.addEventListener('click', async () => {
  if(promptInstalacion){
    btnInstalar.disabled = true;
    promptInstalacion.prompt();
    await promptInstalacion.userChoice;
    promptInstalacion = null;
    btnInstalar.disabled = false;
  } else {
    alert('Para instalar: toca el menú ⋮ de Chrome (arriba a la derecha) y elige "Instalar app" o "Agregar a pantalla de inicio".');
  }
});

window.addEventListener('appinstalled', () => {
  promptInstalacion = null;
});

load();
