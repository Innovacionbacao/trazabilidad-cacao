/* =========================================================
   panel.js — Administrador: configuración, seguimiento, generación de
   lotes de venta, respaldo/exportación y herramientas de prueba.
   Requiere que shared.js esté cargado antes que este archivo.
   ========================================================= */

let lvTabActivo = 'ccn51';
let lvSeleccionados = new Set();

/* ---------- CONFIGURACIÓN ---------- */
function renderMapaMaestroForm(){
  document.getElementById('mm-recepcion').value = DATA.mapaMaestro.recepcion;
  document.getElementById('mm-anaerobica').value = DATA.mapaMaestro.anaerobica;
  document.getElementById('mm-aerobica').value = DATA.mapaMaestro.aerobica;
  document.getElementById('mm-presecado').value = DATA.mapaMaestro.presecado;
  document.getElementById('mm-secado').value = DATA.mapaMaestro.secado;
}

async function guardarMapaMaestro(){
  const nombre = getAdminNombre();
  DATA.mapaMaestro = {
    recepcion: parseFloat(document.getElementById('mm-recepcion').value) || 0,
    anaerobica: parseFloat(document.getElementById('mm-anaerobica').value) || 0,
    aerobica: parseFloat(document.getElementById('mm-aerobica').value) || 0,
    presecado: parseFloat(document.getElementById('mm-presecado').value) || 0,
    secado: parseFloat(document.getElementById('mm-secado').value) || 0
  };
  registrarMovimiento('Mapa maestro actualizado', JSON.stringify(DATA.mapaMaestro), nombre);
  await save();
  render();
}

function renderMaestroConversionForm(){
  document.getElementById('mc-anaerobica').value = DATA.maestroConversion.anaerobica;
  document.getElementById('mc-aerobica').value = DATA.maestroConversion.aerobica;
  document.getElementById('mc-presecado').value = DATA.maestroConversion.presecado;
  document.getElementById('mc-secado').value = DATA.maestroConversion.secado;
  document.getElementById('mc-seco').value = DATA.maestroConversion.seco;
}

async function guardarMaestroConversion(){
  const nombre = getAdminNombre();
  DATA.maestroConversion = {
    anaerobica: parseFloat(document.getElementById('mc-anaerobica').value) || 0,
    aerobica: parseFloat(document.getElementById('mc-aerobica').value) || 0,
    presecado: parseFloat(document.getElementById('mc-presecado').value) || 0,
    secado: parseFloat(document.getElementById('mc-secado').value) || 0,
    seco: parseFloat(document.getElementById('mc-seco').value) || 0
  };
  registrarMovimiento('Maestro de conversión actualizado', JSON.stringify(DATA.maestroConversion), nombre);
  await save();
  render();
}

function renderCapacidadForm(){
  const p = DATA.capacidadMaestro.porEtapa;
  document.getElementById('cap-bines-total').value = p['Recepción en bines'].total;
  document.getElementById('cap-bines-kg').value = p['Recepción en bines'].capKg;
  document.getElementById('cap-anaerobica-total').value = p['F. anaeróbica'].total;
  document.getElementById('cap-anaerobica-kg').value = p['F. anaeróbica'].capKg;
  document.getElementById('cap-aerobica-total').value = p['F. aeróbica'].total;
  document.getElementById('cap-aerobica-kg').value = p['F. aeróbica'].capKg;
  document.getElementById('cap-presecado-total').value = p['Presecado'].total;
  document.getElementById('cap-presecado-kg').value = p['Presecado'].capKg;
  document.getElementById('cap-secado-total').value = p['Secado'].total;
  document.getElementById('cap-secado-kg').value = p['Secado'].capKg;
  document.getElementById('cap-almacen-ton').value = DATA.capacidadMaestro.almacenTotalTon;
  document.getElementById('cap-peso-bulto-ccn51').value = pesoBultoDe('ccn51');
  document.getElementById('cap-peso-bulto-aromatico').value = pesoBultoDe('aromatico');
  document.getElementById('cap-peso-bulto-upia').value = pesoBultoDe('upia');
}

async function guardarCapacidadMaestro(){
  const nombre = getAdminNombre();
  const num = (id) => parseFloat(document.getElementById(id).value) || 0;
  DATA.capacidadMaestro = {
    porEtapa: {
      'Recepción en bines': {unidad:'Bin', total: num('cap-bines-total'), capKg: num('cap-bines-kg')},
      'F. anaeróbica':      {unidad:'Cajón anaeróbico', total: num('cap-anaerobica-total'), capKg: num('cap-anaerobica-kg')},
      'F. aeróbica':         {unidad:'Cajón aeróbico', total: num('cap-aerobica-total'), capKg: num('cap-aerobica-kg')},
      'Presecado':           {unidad:'Presecadora', total: num('cap-presecado-total'), capKg: num('cap-presecado-kg')},
      'Secado':              {unidad:'Secadora', total: num('cap-secado-total'), capKg: num('cap-secado-kg')}
    },
    almacenTotalTon: num('cap-almacen-ton'),
    almacenM2PorTon: DATA.capacidadMaestro.almacenM2PorTon
  };
  DATA.pesoBulto = {
    ccn51: num('cap-peso-bulto-ccn51') || 69,
    aromatico: num('cap-peso-bulto-aromatico') || 69,
    upia: num('cap-peso-bulto-upia') || 50
  };
  registrarMovimiento('Maestro de capacidad actualizado', JSON.stringify(DATA.capacidadMaestro) + ` · peso por bulto: ${JSON.stringify(DATA.pesoBulto)}`, nombre);
  await save();
  render();
}

/* ---------- SEGUIMIENTO ---------- */
function renderSeguimientoStats(){
  const activos = DATA.baches.filter(b=>ACTIVE_INDICES.includes(b.etapaIdx));
  const now = new Date();
  const excedidos = activos.filter(b=>{
    const horas = (now - new Date(b.horaInicioEtapa))/3600000;
    const lim = limiteHoras(b.etapaIdx, b.denom);
    return lim!=null && horas > lim;
  });
  const pendientesLib = DATA.baches.filter(b=>b.etapaIdx===7 && !b.liberado);

  document.getElementById('seg-stats').innerHTML = `
    <div class="stat"><div class="n">${activos.length}</div><div class="l">Baches activos</div></div>
    <div class="stat"><div class="n ${excedidos.length?'warn':''}">${excedidos.length}</div><div class="l">Excedidos</div></div>
    <div class="stat"><div class="n">${pendientesLib.length}</div><div class="l">Pendientes de liberación</div></div>
  `;

  const badge = document.getElementById('badge-seguimiento');
  const total = excedidos.length + pendientesLib.length;
  if(total>0){ badge.style.display='inline-block'; badge.textContent = total; badge.className = excedidos.length ? 'badge' : 'badge muted'; }
  else { badge.style.display='none'; }
}

function renderFueraDeNorma(){
  const now = new Date();
  const activos = DATA.baches
    .filter(b=>ACTIVE_INDICES.includes(b.etapaIdx))
    .map(b=>{
      const horas = (now - new Date(b.horaInicioEtapa))/3600000;
      const lim = limiteHoras(b.etapaIdx, b.denom);
      const excedido = lim!=null && horas > lim;
      return {b, horas, lim, excedido};
    });

  const el = document.getElementById('admin-fuera-norma');
  if(activos.length===0){ el.innerHTML = '<div class="empty">No hay baches activos actualmente.</div>'; return; }

  const item = (x) => {
    const estadoTxt = x.excedido
      ? `<span class="warn">excede por ${(x.horas-x.lim).toFixed(1)} h</span>`
      : (x.lim!=null ? `<span class="ok">${x.horas.toFixed(1)} h (límite ${x.lim} h)</span>` : `<span class="section-hint" style="margin:0;">sin límite de tiempo</span>`);
    return `<div class="stage-item">
      <span><span class="tag" style="background:${DENOM[x.b.denom].color}">${DENOM[x.b.denom].label}</span> ${x.b.codigo}</span>
      ${estadoTxt}
    </div>`;
  };

  const excedidos = activos.filter(x=>x.excedido);
  let html = '';
  if(excedidos.length){
    html += `<details class="stage-group warn" open>
      <summary>Excedidos <span class="count">${excedidos.length} bache${excedidos.length===1?'':'s'}</span></summary>
      ${excedidos.map(item).join('')}
    </details>`;
  }
  TIME_UNIDADES.forEach(idx=>{
    const enEtapa = activos.filter(x=>x.b.etapaIdx===idx && !x.excedido);
    if(enEtapa.length===0) return;
    html += `<details class="stage-group">
      <summary>${STAGES[idx]} <span class="count">${enEtapa.length} bache${enEtapa.length===1?'':'s'}</span></summary>
      ${enEtapa.map(item).join('')}
    </details>`;
  });
  el.innerHTML = html;
}

async function liberarBache(codigo){
  const nombre = getAdminNombre();
  const msg = document.getElementById('admin-msg');
  if(!nombre){
    msg.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción antes de liberar.</div>';
    return;
  }
  const b = DATA.baches.find(x=>x.codigo===codigo);
  const gm = parseInt(document.getElementById('lib-gm-'+codigo).value) || 0;
  const gmv = parseInt(document.getElementById('lib-gmv-'+codigo).value) || 0;
  const gv = parseInt(document.getElementById('lib-gv-'+codigo).value) || 0;
  const gmoho = parseInt(document.getElementById('lib-gmoho-'+codigo).value) || 0;
  const libMsg = document.getElementById('lib-msg-'+codigo);

  if((gm+gmv+gv+gmoho) === 0){
    libMsg.innerHTML = '<div class="msg err">Registra el resultado de la prueba de corte (conteo sobre 50 granos) antes de liberar.</div>';
    return;
  }
  if((gm+gmv+gv+gmoho) > 50){
    libMsg.innerHTML = '<div class="msg err">La suma de granos contados no puede ser mayor a 50.</div>';
    return;
  }
  const pctMoho = (gmoho/50*100);
  const pctMarrones = ((gm+gmv)/50*100);
  const resultadoCorte = (pctMoho > 2 || pctMarrones < 80) ? 'Rechazado' : 'Aprobado';

  if(resultadoCorte === 'Rechazado'){
    if(!confirm(`La prueba de corte de ${codigo} dio RECHAZADO (moho ${pctMoho.toFixed(1)}%, marrones+marrones violeta ${pctMarrones.toFixed(1)}%). ¿Confirmas liberar de todas formas?`)) return;
  } else {
    if(!confirm(`Prueba de corte: Aprobado (moho ${pctMoho.toFixed(1)}%, marrones+marrones violeta ${pctMarrones.toFixed(1)}%). ¿Confirmas liberar el bache ${codigo}?`)) return;
  }

  b.pruebaCorte = {
    muestra: 50, granosMarrones: gm, granosMarronesVioleta: gmv, granosVioletas: gv, granosMoho: gmoho,
    pctMoho: Math.round(pctMoho*10)/10, pctMarrones: Math.round(pctMarrones*10)/10,
    resultado: resultadoCorte, fecha: new Date().toISOString(), operario: nombre
  };
  b.liberado = true;
  b.liberadoPor = nombre;
  b.liberadoFecha = new Date().toISOString();
  libAbierto = null;
  registrarMovimiento('Producto liberado', `Bache ${codigo}: ${b.peso_final} kg secos · Prueba de corte: ${resultadoCorte}`, nombre);
  msg.innerHTML = '';
  await save();
  render();
}

let libAbierto = null;
function toggleLibCard(codigo){
  libAbierto = (libAbierto === codigo) ? null : codigo;
  render();
}

function renderLiberacion(){
  const pendientes = DATA.baches.filter(b=>b.etapaIdx===7 && !b.liberado);
  const el = document.getElementById('admin-liberacion');
  if(pendientes.length===0){ el.innerHTML = '<div class="empty">No hay baches pendientes de liberación.</div>'; return; }

  el.innerHTML = pendientes.map(b=>{
    const abierto = libAbierto ? libAbierto===b.codigo : (b===pendientes[0]);
    const basculasTxt = (b.basculas||[]).map(x=>`${x.numero} (${x.peso} kg)`).join(', ') || '—';
    const convTxt = b.factorConversion!=null
      ? ` · <span style="color:${(b.factorConversion<25||b.factorConversion>40)?'var(--warn)':'var(--ok)'}; font-weight:600;">% conversión: ${b.factorConversion}%</span>`
      : '';
    const horasEmpacado = ((new Date() - new Date(b.horaInicioEtapa))/3600000).toFixed(0);
    return `
    <div class="queue-card ${abierto?'open':''}">
      <div class="queue-head" onclick="toggleLibCard('${b.codigo}')">
        <span class="tag" style="background:${DENOM[b.denom].color}">${DENOM[b.denom].label}</span>
        <span class="code mono">${b.codigo}</span>
        <span class="meta">${b.peso_final} kg · ${b.bultos ?? 0} sacos · empacado hace ${horasEmpacado} h</span>
        <span class="chev">›</span>
      </div>
      <div class="queue-body">
        <p class="section-hint" style="margin-top:12px;">Fecha de recepción: ${b.fecha} · Peso fresco: ${b.peso_fresco} kg · Básculas: ${basculasTxt}</p>
        <p class="section-hint">Remanente recibido ${b.remanenteRecibido ?? 0} kg / resultante ${b.remanenteResultante ?? 0} kg · G2 ${b.peso_g2 ?? 0} kg · Impurezas ${b.peso_impurezas ?? 0} kg${convTxt}</p>
        <p class="block-title" style="margin-top:14px;">Prueba de corte (muestra de 50 granos)</p>
        <div class="row" style="display:flex; gap:10px; flex-wrap:wrap;" onclick="event.stopPropagation()">
          <div class="field" style="flex:1; min-width:120px; margin-bottom:0;"><label>Granos marrones</label><input type="number" id="lib-gm-${b.codigo}" min="0" max="50" step="1"></div>
          <div class="field" style="flex:1; min-width:120px; margin-bottom:0;"><label>Marrones violeta</label><input type="number" id="lib-gmv-${b.codigo}" min="0" max="50" step="1"></div>
          <div class="field" style="flex:1; min-width:120px; margin-bottom:0;"><label>Violetas</label><input type="number" id="lib-gv-${b.codigo}" min="0" max="50" step="1"></div>
          <div class="field" style="flex:1; min-width:120px; margin-bottom:0;"><label>Moho o pizarra</label><input type="number" id="lib-gmoho-${b.codigo}" min="0" max="50" step="1"></div>
        </div>
        <div id="lib-msg-${b.codigo}"></div>
        <div class="btn-row" style="display:flex; gap:10px; margin-top:8px;" onclick="event.stopPropagation()">
          <button onclick="liberarBache('${b.codigo}')">Liberar para despacho</button>
          <button class="secondary" onclick="retrocederDesdeAlmacenado('${b.codigo}')">↩ Devolver a Empaque</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function retrocederDesdeAlmacenado(codigo){
  const nombre = getAdminNombre();
  const msg = document.getElementById('lib-msg-'+codigo);
  if(!nombre){
    msg.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción arriba antes de devolver el bache.</div>';
    return;
  }
  const b = DATA.baches.find(x=>x.codigo===codigo);
  if(!b.historial.length){
    msg.innerHTML = '<div class="msg err">Este bache no tiene historial previo al cual devolver.</div>';
    return;
  }
  if(!confirm(`¿Confirmas devolver el bache ${codigo} a Empaque? Esto deshace el empaque registrado (bultos, remanente, G2, impurezas y prueba de corte si la hay).`)) return;

  let entry = b.historial.pop();
  if(entry && entry.etapaNombre === 'Despulpado'){
    const entryReal = b.historial.pop();
    if(entryReal) entry = entryReal;
  }
  if(!entry) return;

  if(b.contadoEnPoolG2){
    DATA.inventarioSecundario.grado2 -= (b.peso_g2||0);
    DATA.inventarioSecundario.impurezas -= (b.peso_impurezas||0);
    DATA.remanenteG1[b.denom] = b.remanenteRecibido || 0;
  }
  b.peso_g1 = null; b.peso_g2 = null; b.peso_impurezas = null; b.peso_final = null; b.liberado = false;
  b.bultos = null; b.remanenteRecibido = null; b.remanenteResultante = null; b.pruebaCorte = null; b.factorConversion = null;
  b.contadoEnPoolG2 = false;
  b.etapaIdx = entry.etapaIdx;
  b.horaInicioEtapa = entry.horaInicio;
  libAbierto = null;
  registrarMovimiento('Retroceso de etapa (desde liberación)', `Bache ${codigo}: vuelve a ${STAGES[b.etapaIdx]}`, nombre);
  await save();
  render();
}

/* ---------- LOTES DE VENTA (generación) ---------- */
function cambiarTabLV(denom){ lvTabActivo = denom; lvSeleccionados.clear(); render(); }

function toggleSeleccionLV(codigo){
  if(lvSeleccionados.has(codigo)) lvSeleccionados.delete(codigo); else lvSeleccionados.add(codigo);
  render();
}

async function crearLoteVenta(){
  const nombre = getAdminNombre();
  const msg = document.getElementById('admin-msg');
  if(!nombre){
    msg.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción antes de generar el lote.</div>';
    return;
  }
  const seleccionados = DATA.baches.filter(b=>lvSeleccionados.has(b.codigo));
  if(seleccionados.length===0){
    msg.innerHTML = '<div class="msg err">Selecciona al menos un bache liberado antes de generar el lote.</div>';
    return;
  }

  let restante = MAX_KG_LOTE_VENTA;
  const usados = [];
  for(const b of seleccionados){
    if(restante<=0) break;
    const disp = disponibleLV(b);
    if(disp<=0) continue;
    const kgUsado = Math.min(disp, restante);
    usados.push({b, kg: kgUsado});
    restante -= kgUsado;
  }
  if(usados.length===0){
    msg.innerHTML = '<div class="msg err">Los baches seleccionados ya no tienen grado 1 disponible (probablemente ya están asignados por completo a otro lote). Refresca la lista y vuelve a intentar.</div>';
    return;
  }

  DATA.lvConsecutivo += 1;
  const codigo = 'LV-' + String(DATA.lvConsecutivo).padStart(4,'0');
  const totalKg = usados.reduce((s,u)=>s+u.kg,0);
  let totalG1=0, totalG2=0, totalImp=0;
  usados.forEach(u=>{
    const frac = u.kg / u.b.peso_final;
    totalG1 += (u.b.peso_g1||0)*frac;
    totalG2 += (u.b.peso_g2||0)*frac;
    totalImp += (u.b.peso_impurezas||0)*frac;
  });
  const detalleBultos = usados.map(u=>({codigo:u.b.codigo, bultos:Math.floor(u.kg/pesoBultoDe(u.b.denom)), kg:Math.round(u.kg)}));

  DATA.lotes.push({
    codigo, denom:lvTabActivo, baches:usados.map(u=>u.b.codigo),
    total_kg:Math.round(totalKg), total_g1:Math.round(totalG1), total_g2:Math.round(totalG2), total_impurezas:Math.round(totalImp),
    detalleBultos, generadoPor: nombre, fecha:new Date().toISOString(), despacho:null
  });
  usados.forEach(u=>{
    if(!u.b.lvAsignaciones) u.b.lvAsignaciones = [];
    u.b.lvAsignaciones.push({lv: codigo, kg: Math.round(u.kg)});
  });

  const huboExcedente = seleccionados.some(b=>disponibleLV(b) > 0.01);
  lvSeleccionados.clear();
  registrarMovimiento('Lote de venta generado', `${codigo}: ${(totalKg/1000).toFixed(2)} ton, baches ${usados.map(u=>u.b.codigo).join(', ')}`, nombre);
  msg.innerHTML = huboExcedente
    ? `<div class="msg ok">Lote ${codigo} generado por ${nombre} con ${(totalKg/1000).toFixed(2)} ton (tope 25 ton). El excedente queda disponible para un próximo lote.</div>`
    : `<div class="msg ok">Lote ${codigo} generado por ${nombre} con ${(totalKg/1000).toFixed(2)} ton.</div>`;
  await save();
  render();
}

async function despacharLote(codigo){
  const nombre = getAdminNombre();
  const l = DATA.lotes.find(x=>x.codigo===codigo);
  const horaInput = document.getElementById('desp-hora-'+codigo);
  const encargadoInput = document.getElementById('desp-encargado-'+codigo);
  const remisionInput = document.getElementById('desp-remision-'+codigo);
  const empresaInput = document.getElementById('desp-empresa-'+codigo);
  const encargado = encargadoInput.value.trim();
  const remision = remisionInput.value.trim();
  const empresa = empresaInput.value.trim();
  const msgEl = document.getElementById('desp-msg-'+codigo);
  if(!nombre){
    msgEl.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción arriba (Identificación) antes de despachar.</div>';
    return;
  }
  if(!encargado || !remision || !empresa){
    msgEl.innerHTML = '<div class="msg err">Completa encargado, N° de remisión y empresa de despacho.</div>';
    return;
  }
  const hora = horaInput.value ? new Date(horaInput.value) : new Date();
  if(!confirm(`¿Confirmas el despacho del lote ${codigo}, autorizado por ${nombre}?`)) return;
  l.despacho = { fecha: hora.toISOString(), encargado, remision, empresa, autorizadoPor: nombre };
  registrarMovimiento('Lote despachado', `${codigo}: remisión ${remision}, transporta ${empresa}, autorizado por ${nombre}`, encargado);
  await save();
  render();
}

function renderLotesDespacho(){
  const wrap = document.getElementById('lv-despacho-list');
  const pendientes = DATA.lotes.filter(l=>!l.despacho).reverse();
  wrap.innerHTML = pendientes.length ? pendientes.map(l=>`
    <div class="lv-history-item" style="flex-direction:column; align-items:stretch;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div><span class="tag" style="background:${DENOM[l.denom].color}">${DENOM[l.denom].label}</span> <span class="mono" style="margin-left:8px;">${l.codigo}</span></div>
        <div class="op-meta">${(l.total_kg/1000).toFixed(2)} ton · generado por ${l.generadoPor||'—'}</div>
      </div>
      <div class="row" style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
        <div class="field" style="flex:1; min-width:160px; margin-bottom:0;"><label>Fecha y hora de despacho</label><input type="datetime-local" id="desp-hora-${l.codigo}" value="${toLocalInputValue(new Date())}"></div>
        <div class="field" style="flex:1; min-width:160px; margin-bottom:0;"><label>Encargado</label><input type="text" id="desp-encargado-${l.codigo}"></div>
        <div class="field" style="flex:1; min-width:160px; margin-bottom:0;"><label>N° remisión de salida</label><input type="text" id="desp-remision-${l.codigo}"></div>
        <div class="field" style="flex:1; min-width:160px; margin-bottom:0;"><label>Empresa de despacho</label><input type="text" id="desp-empresa-${l.codigo}"></div>
      </div>
      <div id="desp-msg-${l.codigo}"></div>
      <button onclick="despacharLote('${l.codigo}')" style="margin-top:10px;">Marcar como despachado</button>
    </div>`).join('') : '<div class="empty">No hay lotes pendientes de despacho.</div>';
}

function renderCacaoLocalPanel(){
  const enProceso = DATA.cacaoLocal.enProceso || 0;
  const secoPendiente = DATA.cacaoLocal.secoPendienteLiberar || 0;
  const total = DATA.cacaoLocal.total || 0;

  document.getElementById('local-pipe').innerHTML = `
    <div class="pipe-seg" style="background:var(--amber-1); color:#3d2c12;"><span class="n">${enProceso.toFixed(1)} kg</span><span class="l">fresco, sin secar</span></div>
    <div class="pipe-seg" style="background:var(--amber-2); color:#3d2c12;"><span class="n">${secoPendiente.toFixed(1)} kg</span><span class="l">seco, sin liberar</span></div>
    <div class="pipe-seg" style="background:var(--amber);"><span class="n">${total.toFixed(1)} kg</span><span class="l">liberado, disponible</span></div>`;

  document.getElementById('local-enproceso-sub').textContent = `${enProceso.toFixed(1)} kg fresco pendiente`;
  document.getElementById('local-secopendiente-sub').textContent = `${secoPendiente.toFixed(1)} kg seco pendiente`;
  document.getElementById('local-total-sub').textContent = `${total.toFixed(1)} kg liberado disponible`;

  const campoFresco = document.getElementById('secar-local-fresco');
  if(document.activeElement !== campoFresco) campoFresco.value = enProceso > 0 ? enProceso : '';
  const campoLib = document.getElementById('lib-local-cantidad');
  if(document.activeElement !== campoLib) campoLib.value = secoPendiente > 0 ? secoPendiente : '';
}

async function secarCacaoLocal(){
  const nombre = getAdminNombre();
  const msg = document.getElementById('secar-local-msg');
  if(!nombre){
    msg.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción arriba antes de continuar.</div>';
    return;
  }
  const fresco = parseFloat(document.getElementById('secar-local-fresco').value) || 0;
  const seco = parseFloat(document.getElementById('secar-local-seco').value) || 0;
  if(fresco<=0 || seco<=0){ msg.innerHTML = '<div class="msg err">Ingresa la cantidad fresca procesada y el peso seco resultante.</div>'; return; }
  if(fresco > (DATA.cacaoLocal.enProceso||0) + 0.01){ msg.innerHTML = '<div class="msg err">No hay suficiente cacao LOCAL fresco pendiente de secar.</div>'; return; }
  if(!confirm(`¿Confirmas pasar ${fresco} kg de cacao LOCAL fresco a ${seco} kg ya seco, registrado por ${nombre}?`)) return;
  DATA.cacaoLocal.enProceso -= fresco;
  DATA.cacaoLocal.secoPendienteLiberar += seco;
  registrarMovimiento('Cacao LOCAL secado', `${fresco} kg fresco → ${seco} kg seco`, nombre);
  await save();
  document.getElementById('secar-local-seco').value = '';
  msg.innerHTML = '<div class="msg ok">Registrado.</div>';
  render();
}

async function liberarCacaoLocal(){
  const nombre = getAdminNombre();
  const msg = document.getElementById('lib-local-msg');
  if(!nombre){
    msg.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción arriba antes de liberar.</div>';
    return;
  }
  const cant = parseFloat(document.getElementById('lib-local-cantidad').value) || 0;
  if(cant<=0){ msg.innerHTML = '<div class="msg err">Ingresa una cantidad a liberar.</div>'; return; }
  if(cant > (DATA.cacaoLocal.secoPendienteLiberar||0) + 0.01){ msg.innerHTML = '<div class="msg err">No hay suficiente cacao LOCAL seco pendiente de liberación.</div>'; return; }
  if(!confirm(`¿Confirmas liberar ${cant} kg de cacao LOCAL (ya seco) al inventario final, autorizado por ${nombre}?`)) return;
  DATA.cacaoLocal.secoPendienteLiberar -= cant;
  DATA.cacaoLocal.total += cant;
  registrarMovimiento('Cacao LOCAL liberado', `${cant} kg`, nombre);
  await save();
  msg.innerHTML = '<div class="msg ok">Liberado correctamente.</div>';
  render();
}

async function despacharCacaoLocal(){
  const nombre = getAdminNombre();
  const msg = document.getElementById('desp-local-msg');
  if(!nombre){
    msg.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción arriba antes de despachar.</div>';
    return;
  }
  const cant = parseFloat(document.getElementById('desp-local-cantidad').value) || 0;
  if(cant<=0){ msg.innerHTML = '<div class="msg err">Ingresa una cantidad a despachar.</div>'; return; }
  if(cant > (DATA.cacaoLocal.total||0) + 0.01){ msg.innerHTML = '<div class="msg err">No hay suficiente cacao LOCAL disponible.</div>'; return; }
  if(!confirm(`¿Confirmas despachar ${cant} kg de cacao LOCAL, autorizado por ${nombre}?`)) return;
  DATA.cacaoLocal.total -= cant;
  registrarMovimiento('Despacho de cacao LOCAL', `${cant} kg`, nombre);
  await save();
  document.getElementById('desp-local-cantidad').value = '';
  msg.innerHTML = '<div class="msg ok">Despacho registrado.</div>';
  render();
}

function renderInventarioSecundario(){
  const g2 = DATA.inventarioSecundario.grado2;
  const imp = DATA.inventarioSecundario.impurezas;
  document.getElementById('g2-pipe').innerHTML = `<div class="pipe-seg" style="background:var(--amber);"><span class="n">${(g2/1000).toFixed(2)} ton</span><span class="l">disponible para despachar</span></div>`;
  document.getElementById('imp-pipe').innerHTML = `<div class="pipe-seg" style="background:var(--amber-3);"><span class="n">${(imp/1000).toFixed(2)} ton</span><span class="l">disponible para despachar</span></div>`;
}

async function despacharGrado2(){
  const nombre = getAdminNombre();
  const msg = document.getElementById('desp-secundario-msg');
  if(!nombre){
    msg.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción arriba antes de despachar.</div>';
    return;
  }
  const g2 = parseFloat(document.getElementById('desp-g2-cantidad').value) || 0;
  if(g2<=0){ msg.innerHTML = '<div class="msg err">Ingresa una cantidad de Grado 2 a despachar.</div>'; return; }
  if(g2 > DATA.inventarioSecundario.grado2 + 0.01){ msg.innerHTML = '<div class="msg err">No hay suficiente Grado 2 disponible.</div>'; return; }
  if(!confirm(`¿Confirmas despachar ${g2} kg de Grado 2, autorizado por ${nombre}?`)) return;

  DATA.inventarioSecundario.grado2 -= g2;
  registrarMovimiento('Despacho de Grado 2', `${g2} kg`, nombre);
  await save();
  document.getElementById('desp-g2-cantidad').value = '';
  msg.innerHTML = '<div class="msg ok">Despacho de Grado 2 registrado.</div>';
  render();
}

async function despacharImpurezas(){
  const nombre = getAdminNombre();
  const msg = document.getElementById('desp-secundario-msg');
  if(!nombre){
    msg.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción arriba antes de despachar.</div>';
    return;
  }
  const imp = parseFloat(document.getElementById('desp-imp-cantidad').value) || 0;
  if(imp<=0){ msg.innerHTML = '<div class="msg err">Ingresa una cantidad de impurezas a despachar.</div>'; return; }
  if(imp > DATA.inventarioSecundario.impurezas + 0.01){ msg.innerHTML = '<div class="msg err">No hay suficientes impurezas disponibles.</div>'; return; }
  if(!confirm(`¿Confirmas despachar ${imp} kg de impurezas, autorizado por ${nombre}?`)) return;

  DATA.inventarioSecundario.impurezas -= imp;
  registrarMovimiento('Despacho de impurezas', `${imp} kg`, nombre);
  await save();
  document.getElementById('desp-imp-cantidad').value = '';
  msg.innerHTML = '<div class="msg ok">Despacho de impurezas registrado.</div>';
  render();
}

async function recalcularInventarioSecundario(){
  const nombre = getAdminNombre();
  const msg = document.getElementById('desp-secundario-msg');
  if(!nombre){
    msg.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción arriba antes de recalcular.</div>';
    return;
  }
  const pendientes = DATA.baches.filter(b => (b.peso_g2!=null || b.peso_impurezas!=null) && !b.contadoEnPoolG2);
  if(pendientes.length === 0){
    msg.innerHTML = '<div class="msg ok">No hay baches empacados pendientes de sumar — el inventario ya está al día.</div>';
    return;
  }
  const sumaG2 = pendientes.reduce((s,b)=>s+(b.peso_g2||0),0);
  const sumaImp = pendientes.reduce((s,b)=>s+(b.peso_impurezas||0),0);
  if(!confirm(`Se sumarán ${sumaG2} kg de Grado 2 y ${sumaImp} kg de impurezas al inventario, provenientes de ${pendientes.length} bache(s) empacados antes de esta función. ¿Confirmas?`)) return;

  DATA.inventarioSecundario.grado2 += sumaG2;
  DATA.inventarioSecundario.impurezas += sumaImp;
  pendientes.forEach(b => b.contadoEnPoolG2 = true);
  registrarMovimiento('Recálculo de inventario G2/impurezas', `+${sumaG2} kg G2, +${sumaImp} kg impurezas, desde ${pendientes.length} bache(s): ${pendientes.map(b=>b.codigo).join(', ')}`, nombre);
  await save();
  msg.innerHTML = '<div class="msg ok">Inventario recalculado.</div>';
  render();
}

async function devolverALiberacion(codigo){
  const nombre = getAdminNombre();
  if(!nombre){
    alert('Ingresa el nombre del jefe de producción arriba (Identificación) antes de continuar.');
    return;
  }
  const b = DATA.baches.find(x=>x.codigo===codigo);
  if(kgAsignadoLV(b) > 0){
    alert('Este bache ya tiene grado 1 asignado a un lote de venta; no se puede devolver a liberación desde aquí.');
    return;
  }
  if(!confirm(`¿Confirmas devolver el bache ${codigo} a "pendiente de liberación"? Se borra la prueba de corte registrada y deberás repetirla al liberarlo de nuevo.`)) return;
  b.liberado = false;
  b.liberadoPor = null;
  b.liberadoFecha = null;
  b.pruebaCorte = null;
  lvSeleccionados.delete(codigo);
  registrarMovimiento('Bache devuelto a liberación', `Bache ${codigo}`, nombre);
  await save();
  render();
}

function renderLotesPool(){
  const tabsEl = document.getElementById('lv-tabs');
  tabsEl.innerHTML = Object.keys(DENOM).map(k=>
    `<button class="tab-lv ${k===lvTabActivo?'active':''}" onclick="cambiarTabLV('${k}')">${DENOM[k].label}</button>`
  ).join('');

  const disponibles = DATA.baches.filter(b=>b.denom===lvTabActivo && b.etapaIdx===7 && b.liberado && disponibleLV(b) > 0);
  const pool = document.getElementById('lv-pool');
  if(disponibles.length===0){
    pool.innerHTML = '<div class="empty">Sin baches liberados disponibles para esta denominación.</div>';
  } else {
    let totalSel = 0;
    let items = disponibles.map(b=>{
      const checked = lvSeleccionados.has(b.codigo);
      const disp = disponibleLV(b);
      if(checked) totalSel += disp;
      const parcial = disp < b.peso_final ? ` · ${b.peso_final-disp} kg ya en otro lote` : '';
      const btnDevolver = kgAsignadoLV(b)===0
        ? `<button class="secondary" onclick="devolverALiberacion('${b.codigo}')" style="margin-left:auto; padding:6px 12px; min-height:auto; font-size:12.5px; white-space:nowrap;">↩ Devolver</button>`
        : '';
      return `<div class="lv-pool-item">
        <input type="checkbox" ${checked?'checked':''} onchange="toggleSeleccionLV('${b.codigo}')">
        <span class="mono">${b.codigo}</span>
        <span class="op-meta">${disp} kg de grado 1 disponibles · ${Math.floor(disp/pesoBultoDe(b.denom))} sacos${parcial}</span>
        ${btnDevolver}
      </div>`;
    }).join('');
    const excede = totalSel > MAX_KG_LOTE_VENTA;
    const avisoTope = excede
      ? `<div class="msg err" style="margin-top:8px;">El lote de venta tiene un máximo de ${(MAX_KG_LOTE_VENTA/1000)} ton. Se generará por ese tope y quedarán ${((totalSel-MAX_KG_LOTE_VENTA)/1000).toFixed(2)} ton disponibles para otro lote.</div>`
      : '';
    pool.innerHTML = items + `<div class="lv-total"><span class="op-meta">Total seleccionado: <b class="mono">${(totalSel/1000).toFixed(2)} ton</b></span><button onclick="crearLoteVenta()" ${totalSel===0?'disabled':''}>Crear lote de venta</button></div>${avisoTope}`;
  }
}

/* ---------- DATOS: respaldo, exportación y herramientas de prueba ---------- */
function descargarBackup(){
  const fecha = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  descargarArchivo(`backup-trazabilidad-${fecha}.json`, JSON.stringify(DATA, null, 2), 'application/json');
  document.getElementById('backup-msg').innerHTML = '<div class="msg ok">Backup descargado.</div>';
}

function exportarBachesCSV(){
  const cols = ['codigo','fecha','denom','etapaIdx','etapaNombre','peso_fresco','basculas','peso_final','peso_g1','peso_g2','peso_impurezas','humedadSalida','liberado','lvAsignaciones'];
  const filas = DATA.baches.map(b=>[
    b.codigo, b.fecha, b.denom, b.etapaIdx, etapaMostrada(b), b.peso_fresco,
    (b.basculas||[]).map(x=>`${x.numero}:${x.peso}`).join('|'),
    b.peso_final, b.peso_g1, b.peso_g2, b.peso_impurezas, b.humedadSalida, b.liberado,
    (b.lvAsignaciones||[]).map(a=>`${a.lv}:${a.kg}`).join('|')
  ]);
  const csv = [cols.join(',')].concat(filas.map(f=>f.map(csvEscape).join(','))).join('\n');
  descargarArchivo('baches.csv', csv, 'text/csv');
  document.getElementById('backup-msg').innerHTML = '<div class="msg ok">CSV de baches exportado.</div>';
}

function exportarLotesCSV(){
  const cols = ['codigo','denom','baches','total_kg','total_g1','total_g2','total_impurezas','generadoPor','fecha','despacho_fecha','despacho_encargado'];
  const filas = DATA.lotes.map(l=>[
    l.codigo, l.denom, (l.baches||[]).join('|'), l.total_kg, l.total_g1, l.total_g2, l.total_impurezas,
    l.generadoPor, l.fecha, l.despacho ? l.despacho.fecha : '', l.despacho ? l.despacho.encargado : ''
  ]);
  const csv = [cols.join(',')].concat(filas.map(f=>f.map(csvEscape).join(','))).join('\n');
  descargarArchivo('lotes-venta.csv', csv, 'text/csv');
  document.getElementById('backup-msg').innerHTML = '<div class="msg ok">CSV de lotes de venta exportado.</div>';
}

function restaurarBackup(ev){
  const file = ev.target.files[0];
  const msg = document.getElementById('backup-msg');
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      const parsed = JSON.parse(reader.result);
      if(!parsed.baches || !Array.isArray(parsed.baches)){
        msg.innerHTML = '<div class="msg err">El archivo no parece un backup válido.</div>';
        return;
      }
      DATA = Object.assign({
        baches:[], lotes:[], lvConsecutivo:0,
        mapaMaestro:DATA.mapaMaestro, maestroConversion:DATA.maestroConversion,
        capacidadMaestro:DATA.capacidadMaestro, inventarioSecundario:DATA.inventarioSecundario,
        pesoBulto:DATA.pesoBulto, remanenteG1:DATA.remanenteG1, cacaoLocal:DATA.cacaoLocal,
        movimientos:[]
      }, parsed);
      await save();
      msg.innerHTML = '<div class="msg ok">Backup restaurado correctamente.</div>';
      render();
    }catch(e){
      msg.innerHTML = '<div class="msg err">No se pudo leer el archivo (JSON inválido).</div>';
    }
  };
  reader.readAsText(file);
}

/* ---------- RENDER GLOBAL ---------- */
function hoursAgoIso(h){ return new Date(Date.now() - h*3600000).toISOString(); }

function daysAgoCodStr(n){
  const d = new Date(); d.setDate(d.getDate()-n);
  const pad = x => String(x).padStart(2,'0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`;
}

function baseBache(codStr, denom, etapaIdx, horasEnEtapa, pesoFresco, bascula, pesoFinal, lv, pesoG1, pesoG2, pesoImpurezas, liberado){
  const codigo = codStr + DENOM[denom].letra;
  return {
    codigo, fecha: `${codStr.slice(0,4)}-${codStr.slice(4,6)}-${codStr.slice(6,8)}`,
    denom, peso_fresco: pesoFresco,
    basculas: [{numero: bascula, peso: pesoFresco, hora: hoursAgoIso(horasEnEtapa)}],
    etapaIdx, horaInicioEtapa: hoursAgoIso(horasEnEtapa),
    historial: [],
    volteos: [],
    peso_final: pesoFinal!=null ? pesoFinal : null,
    peso_g1: pesoG1 ?? null, peso_g2: pesoG2 ?? null, peso_impurezas: pesoImpurezas ?? null,
    humedadSalida: null,
    liberado: liberado ?? false,
    lvAsignaciones: lv ? [{lv, kg: pesoFinal}] : []
  };
}

async function cargarEjemplo(){
  // peso_final = solo grado 1 (lo que sigue el circuito de lote de venta);
  // el grado 2 y las impurezas de cada uno se suman más abajo al inventario común.
  const c1 = baseBache(daysAgoCodStr(7), 'ccn51', 7, 96, 980, 'B-1001', 700, 'LV-0001', 700, 150, 20, true);
  const c2 = baseBache(daysAgoCodStr(6), 'ccn51', 7, 72, 1030, 'B-1002', 750, 'LV-0001', 750, 150, 25, true);
  const c3 = baseBache(daysAgoCodStr(5), 'aromatico', 7, 48, 890, 'B-1003', 650, null, 650, 130, 15, false);
  const c4 = baseBache(daysAgoCodStr(4), 'upia', 2, 60, 2500, 'B-1004', null, null); // excedido: >48h en F. anaeróbica
  const c5 = baseBache(daysAgoCodStr(3), 'ccn51', 3, 20, 1500, 'B-1005', null, null);
  c5.volteos = [{hora:hoursAgoIso(15), operario:'Ejemplo Demo'}];
  const c6 = baseBache(daysAgoCodStr(2), 'aromatico', 4, 5, 3000, 'B-1006', null, null);
  const c7 = baseBache(daysAgoCodStr(1), 'upia', 5, 10, 2000, 'B-1007', null, null);
  const c8 = baseBache(daysAgoCodStr(0), 'ccn51', 0, 3, 1200, 'B-1008', null, null);
  const c9 = baseBache(daysAgoCodStr(0), 'aromatico', 6, 2, 1800, 'B-1009', null, null);
  // 'ccn51' del día 0 ya usado (c8): usamos otra denominación para el noveno ejemplo, sin choque de código.

  DATA.baches = [c1,c2,c3,c4,c5,c6,c7,c8,c9];
  DATA.inventarioSecundario = {
    grado2: c1.peso_g2 + c2.peso_g2 + c3.peso_g2,
    impurezas: c1.peso_impurezas + c2.peso_impurezas + c3.peso_impurezas
  };
  DATA.lotes = [{
    codigo:'LV-0001', denom:'ccn51', baches:[c1.codigo,c2.codigo],
    total_kg: c1.peso_final+c2.peso_final, total_g1: c1.peso_g1+c2.peso_g1, total_g2: c1.peso_g2+c2.peso_g2, total_impurezas: c1.peso_impurezas+c2.peso_impurezas,
    detalleBultos: [
      {codigo:c1.codigo, bultos: Math.floor(c1.peso_final/pesoBultoDe('ccn51')), kg:c1.peso_final},
      {codigo:c2.codigo, bultos: Math.floor(c2.peso_final/pesoBultoDe('ccn51')), kg:c2.peso_final}
    ],
    generadoPor: 'Ejemplo Demo', fecha: hoursAgoIso(60),
    despacho: null
  }];
  DATA.lvConsecutivo = 1;
  registrarMovimiento('Datos de ejemplo cargados', '9 baches de ejemplo + LV-0001', getAdminNombre());
  await save();
  document.getElementById('ejemplo-msg').innerHTML = '<div class="msg ok">9 baches de ejemplo cargados, incluyendo uno excedido y un lote de venta ya consolidado. Revisa las páginas Captura y Tablero.</div>';
  render();
}

async function borrarBaches(){
  const nombre = getAdminNombre();
  DATA.baches = [];
  DATA.lotes = [];
  DATA.lvConsecutivo = 0;
  lvSeleccionados.clear();
  registrarMovimiento('Baches borrados (prueba)', 'Se vació toda la base de baches y lotes', nombre);
  await save();
  document.getElementById('ejemplo-msg').innerHTML = '<div class="msg ok">Todos los baches y lotes fueron borrados.</div>';
  render();
}

/* ---------- REGISTRO DE MOVIMIENTOS ---------- */
function renderMovimientos(){
  const filtro = (document.getElementById('mov-filtro').value || '').trim().toLowerCase();
  const lista = (DATA.movimientos || []).filter(m=>{
    if(!filtro) return true;
    return (m.accion+' '+m.detalle+' '+m.usuario).toLowerCase().includes(filtro);
  }).slice(0, 150);

  document.getElementById('admin-movimientos-lista').innerHTML = lista.length ? lista.map(m=>`
    <div class="lv-history-item">
      <div class="op-meta">${fmtDateTime(new Date(m.fecha))}</div>
      <div><b>${m.accion}</b> — ${m.detalle}</div>
      <div class="op-meta">Por: ${m.usuario}</div>
    </div>`).join('') : '<div class="empty">No hay movimientos registrados todavía.</div>';
}

/* ---------- EDITAR BACHES ---------- */
function renderListaCodigosEditar(){
  const dl = document.getElementById('edit-lista-codigos');
  dl.innerHTML = DATA.baches.map(b=>`<option value="${b.codigo}">`).join('');
}

function cargarBacheParaEditar(){
  const codigo = document.getElementById('edit-buscar').value.trim();
  const b = DATA.baches.find(x=>x.codigo===codigo);
  const wrap = document.getElementById('edit-form-wrap');
  if(!b){
    wrap.innerHTML = codigo ? '<div class="empty">No existe ningún bache con ese código.</div>' : '';
    return;
  }
  const opcionesEtapa = STAGES.map((nombre,i)=>`<option value="${i}" ${i===b.etapaIdx?'selected':''}>${i} — ${nombre}</option>`).join('');
  const opcionesDenom = Object.keys(DENOM).map(k=>`<option value="${k}" ${k===b.denom?'selected':''}>${DENOM[k].label}</option>`).join('');
  wrap.innerHTML = `
    <div class="mapa-form">
      <div class="field"><label>Fecha</label><input type="date" id="edit-fecha" value="${b.fecha}"></div>
      <div class="field"><label>Denominación</label><select id="edit-denom">${opcionesDenom}</select></div>
      <div class="field"><label>Peso fresco (kg)</label><input type="number" id="edit-peso-fresco" value="${b.peso_fresco}"></div>
      <div class="field"><label>Etapa actual</label><select id="edit-etapa">${opcionesEtapa}</select></div>
      <div class="field"><label>Peso G1 (kg)</label><input type="number" id="edit-g1" value="${b.peso_g1 ?? ''}"></div>
      <div class="field"><label>Peso G2 (kg)</label><input type="number" id="edit-g2" value="${b.peso_g2 ?? ''}"></div>
      <div class="field"><label>Impurezas (kg)</label><input type="number" id="edit-imp" value="${b.peso_impurezas ?? ''}"></div>
      <div class="field"><label>Humedad de salida (%)</label><input type="number" id="edit-humedad" value="${b.humedadSalida ?? ''}"></div>
    </div>
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:14px;">
      <input type="checkbox" id="edit-liberado" ${b.liberado ? 'checked' : ''} style="width:auto;">
      <label for="edit-liberado" style="font-size:13px; color:var(--ink-dim);">Liberado para lote de venta</label>
    </div>
    <div class="op-meta" style="margin-bottom:14px;">
      Básculas: ${(b.basculas||[]).map(x=>`${x.numero} (${x.peso} kg)`).join(', ') || '—'}
      ${(b.lvAsignaciones||[]).length ? ` · Lotes: ${b.lvAsignaciones.map(a=>`${a.lv} (${a.kg} kg)`).join(', ')}` : ''}
      ${b.volteos && b.volteos.length ? ` · Volteos en F. aeróbica: ${b.volteos.length}` : ''}
      ${b.bultos!=null ? ` · Bultos: ${b.bultos} · Remanente recibido: ${b.remanenteRecibido ?? 0} kg · Remanente resultante: ${b.remanenteResultante ?? 0} kg` : ''}
      ${b.factorConversion!=null ? ` · <span style="color:${(b.factorConversion<25||b.factorConversion>40)?'var(--warn)':'var(--ok)'}; font-weight:600;">% conversión: ${b.factorConversion}%</span>` : ''}
      ${b.pruebaCorte ? ` · Prueba de corte: <b>${b.pruebaCorte.resultado}</b> (marrones ${b.pruebaCorte.granosMarrones}, marrones violeta ${b.pruebaCorte.granosMarronesVioleta}, violetas ${b.pruebaCorte.granosVioletas}, moho ${b.pruebaCorte.granosMoho} de 50 — moho ${b.pruebaCorte.pctMoho}%, marrones+violeta ${b.pruebaCorte.pctMarrones}%)` : ''}
    </div>
    <div id="edit-msg"></div>
    <button id="btn-edit-guardar">Guardar cambios</button>
  `;
  document.getElementById('btn-edit-guardar').addEventListener('click', ()=>guardarEdicionBache(codigo));
}

async function guardarEdicionBache(codigo){
  const nombre = getAdminNombre();
  const msg = document.getElementById('edit-msg');
  if(!nombre){
    msg.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción arriba antes de guardar.</div>';
    return;
  }
  const b = DATA.baches.find(x=>x.codigo===codigo);
  if(!b) return;

  const cambios = [];
  const registrar = (campo, valorAnterior, valorNuevo) => {
    if(String(valorAnterior) !== String(valorNuevo)) cambios.push(`${campo}: ${valorAnterior} → ${valorNuevo}`);
  };

  const nuevaFecha = document.getElementById('edit-fecha').value;
  const nuevoDenom = document.getElementById('edit-denom').value;
  const nuevoPesoFresco = parseFloat(document.getElementById('edit-peso-fresco').value) || 0;
  const nuevaEtapa = parseInt(document.getElementById('edit-etapa').value, 10);
  const nuevoG1 = document.getElementById('edit-g1').value === '' ? null : parseFloat(document.getElementById('edit-g1').value);
  const nuevoG2 = document.getElementById('edit-g2').value === '' ? null : parseFloat(document.getElementById('edit-g2').value);
  const nuevoImp = document.getElementById('edit-imp').value === '' ? null : parseFloat(document.getElementById('edit-imp').value);
  const nuevaHumedad = document.getElementById('edit-humedad').value === '' ? null : parseFloat(document.getElementById('edit-humedad').value);
  const nuevoLiberado = document.getElementById('edit-liberado').checked;

  registrar('fecha', b.fecha, nuevaFecha);
  registrar('denom', b.denom, nuevoDenom);
  registrar('peso_fresco', b.peso_fresco, nuevoPesoFresco);
  registrar('etapaIdx', b.etapaIdx, nuevaEtapa);
  registrar('peso_g1', b.peso_g1, nuevoG1);
  registrar('peso_g2', b.peso_g2, nuevoG2);
  registrar('peso_impurezas', b.peso_impurezas, nuevoImp);
  registrar('humedadSalida', b.humedadSalida, nuevaHumedad);
  registrar('liberado', b.liberado, nuevoLiberado);

  if(cambios.length === 0){
    msg.innerHTML = '<div class="msg ok">No hay cambios que guardar.</div>';
    return;
  }
  if(!confirm(`¿Confirmas guardar estos cambios en ${codigo}?\n\n${cambios.join('\n')}`)) return;

  b.fecha = nuevaFecha;
  b.denom = nuevoDenom;
  b.peso_fresco = nuevoPesoFresco;
  b.etapaIdx = nuevaEtapa;
  b.peso_g1 = nuevoG1;
  b.peso_g2 = nuevoG2;
  b.peso_impurezas = nuevoImp;
  b.peso_final = (nuevoG1!=null && nuevoG2!=null) ? (nuevoG1+nuevoG2) : b.peso_final;
  b.humedadSalida = nuevaHumedad;
  b.liberado = nuevoLiberado;

  registrarMovimiento('Edición manual', `Bache ${codigo}: ${cambios.join('; ')}`, nombre);
  await save();
  msg.innerHTML = '<div class="msg ok">Cambios guardados.</div>';
  render();
}

/* ---------- SUB-PESTAÑAS DE ADMINISTRADOR ---------- */
function inicializarAdminTabs(){
  document.querySelectorAll('.admin-tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.admin-panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('admin-'+btn.dataset.admintab).classList.add('active');
    });
  });
}

/* ---------- RENDER Y ARRANQUE DE ESTA PÁGINA ---------- */
function render(){
  actualizarEncabezado();
  renderMapaMaestroForm();
  renderMaestroConversionForm();
  renderCapacidadForm();
  renderFueraDeNorma();
  renderSeguimientoStats();
  renderLiberacion();
  renderLotesPool();
  renderLotesDespacho();
  renderCacaoLocalPanel();
  renderInventarioSecundario();
  renderMovimientos();
  renderListaCodigosEditar();
}

inicializarAdminTabs();
inicializarGateSimple('phc2026', 'acceso-valido-panel');
document.getElementById('btn-guardar-mapa').addEventListener('click', guardarMapaMaestro);
document.getElementById('btn-guardar-conversion').addEventListener('click', guardarMaestroConversion);
document.getElementById('btn-guardar-capacidad').addEventListener('click', guardarCapacidadMaestro);
document.getElementById('btn-edit-cargar').addEventListener('click', cargarBacheParaEditar);
document.getElementById('btn-despachar-secundario-g2').addEventListener('click', despacharGrado2);
document.getElementById('btn-despachar-secundario-imp').addEventListener('click', despacharImpurezas);
document.getElementById('btn-despachar-local').addEventListener('click', despacharCacaoLocal);
document.getElementById('btn-liberar-local').addEventListener('click', liberarCacaoLocal);
document.getElementById('btn-secar-local').addEventListener('click', secarCacaoLocal);
document.getElementById('btn-recalcular-secundario').addEventListener('click', recalcularInventarioSecundario);
document.getElementById('btn-backup').addEventListener('click', descargarBackup);
document.getElementById('btn-export-baches').addEventListener('click', exportarBachesCSV);
document.getElementById('btn-export-lotes').addEventListener('click', exportarLotesCSV);
document.getElementById('input-restore').addEventListener('change', restaurarBackup);
document.getElementById('btn-ejemplo').addEventListener('click', cargarEjemplo);
document.getElementById('btn-borrar').addEventListener('click', borrarBaches);
document.getElementById('mov-filtro').addEventListener('input', renderMovimientos);

load();
