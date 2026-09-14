/* =========================================================
   tablero.js — lógica de Trazabilidad, Dashboard, Proyección e Inventario.
   Requiere que shared.js esté cargado antes que este archivo.
   ========================================================= */

let traceSeleccionado = null;

/* ---------- TRAZABILIDAD ---------- */
function seleccionarTrace(codigo){
  traceSeleccionado = (traceSeleccionado === codigo) ? null : codigo;
  render();
}

function renderTrazabilidad(){
  const selArea = document.getElementById('trace-f-area');
  if(selArea.options.length===0){
    selArea.innerHTML = '<option value="todas">Todas</option>' + UNIDADES.map(idx=>`<option value="${idx}">${STAGES[idx]}</option>`).join('');
  }
  const fDenom = document.getElementById('trace-f-denom').value;
  const fDesde = document.getElementById('trace-f-desde').value;
  const fHasta = document.getElementById('trace-f-hasta').value;
  const fArea = selArea.value;
  const incluirDespachados = document.getElementById('trace-f-despachados').checked;

  const despachados = setDespachados();

  const todos = DATA.baches.filter(b=>{
    if(!incluirDespachados && despachados.has(b.codigo)) return false;
    if(fDenom!=='todas' && b.denom!==fDenom) return false;
    if(fDesde && b.fecha < fDesde) return false;
    if(fHasta && b.fecha > fHasta) return false;
    if(fArea!=='todas' && String(b.etapaIdx)!==fArea) return false;
    return true;
  }).sort((a,b)=> b.fecha.localeCompare(a.fecha) || a.codigo.localeCompare(b.codigo));

  const list = document.getElementById('trace-list');
  if(todos.length===0){ list.innerHTML = '<div class="empty">Ningún bache coincide con los filtros.</div>'; return; }

  list.innerHTML = todos.map(b=>{
    const denomInfo = DENOM[b.denom];
    let detalle = '';
    if(traceSeleccionado === b.codigo){
      const filas = b.historial.map(h=>`
        <tr>
          <td>${h.etapaNombre}</td>
          <td>${fmtDateTime(new Date(h.horaInicio))}</td>
          <td>${fmtDateTime(new Date(h.horaFin))}</td>
          <td>${h.duracionHoras.toFixed(1)} h</td>
          <td>${h.ocupacion || '—'}${h.humedadSalida!=null ? ` · humedad ${h.humedadSalida}%` : ''}</td>
          <td class="${h.estado==='excedido' ? 'cap-text excedido' : ''}">${h.estado}${h.limiteHoras!=null ? ` (límite ${h.limiteHoras} h)` : ''}</td>
        </tr>`).join('');
      const actual = `
        <tr>
          <td>${STAGES[b.etapaIdx]} (actual)</td>
          <td>${fmtDateTime(new Date(b.horaInicioEtapa))}</td>
          <td>—</td>
          <td>en curso</td>
          <td>${ocupacionLabel(b)}</td>
          <td>—</td>
        </tr>`;
      const grados = b.peso_final!=null
        ? ` · Seco total: ${b.peso_final} kg (G1 ${b.peso_g1 ?? '—'} kg, G2 ${b.peso_g2 ?? '—'} kg, impurezas ${b.peso_impurezas ?? 0} kg)`
        : '';
      const basculasTxt = (b.basculas||[]).map(x=>`${x.numero} (${x.peso} kg)`).join(', ');
      const disponible = disponibleLV(b);
      const asignTxt = (b.lvAsignaciones||[]).map(a=>{
        const lote = DATA.lotes.find(l=>l.codigo===a.lv);
        const estado = lote && lote.despacho ? 'despachado' : 'pendiente de despacho';
        return `${a.lv} (${a.kg} kg, ${estado})`;
      }).join(' · ');
      const despachoTxt = asignTxt
        ? ` · Lotes: ${asignTxt}${disponible>0 ? ` · disponible ${disponible} kg` : ''}`
        : (b.peso_final!=null && disponible>0 ? ` · Disponible para lote de venta: ${disponible} kg` : '');
      detalle = `
        <div style="margin-top:12px; overflow-x:auto;">
          <table class="proy trace">
            <thead><tr><th>Etapa</th><th>Inicio</th><th>Fin</th><th>Duración</th><th>Ocupación</th><th>Estado</th></tr></thead>
            <tbody>${filas}${actual}</tbody>
          </table>
          <div class="op-meta" style="margin-top:10px;">
            Básculas: ${basculasTxt} · Fresco total ${b.peso_fresco} kg${grados}${despachoTxt}
          </div>
        </div>`;
    }
    return `
      <div class="op-card ${traceSeleccionado===b.codigo?'selected':''}" onclick="seleccionarTrace('${b.codigo}')">
        <div class="op-top">
          <span class="tag" style="background:${denomInfo.color}">${denomInfo.label}</span>
          <span class="op-codigo">${b.codigo}</span>
          <span class="op-meta">${STAGES[b.etapaIdx]}${(b.lvAsignaciones||[]).length ? ` · ${b.lvAsignaciones.map(a=>a.lv).join(', ')}` : ''}${b.parcialDe ? ` · parcial de ${b.parcialDe}` : ''}</span>
        </div>
        ${detalle}
      </div>`;
  }).join('');
}

/* ---------- FLUJO Y CAPACIDAD ---------- */

/* ---------- DASHBOARD ---------- */
function poblarFiltroAnio(){
  const sel = document.getElementById('dash-anio');
  const years = [...new Set(DATA.baches.map(b=>b.fecha.slice(0,4)))].sort().reverse();
  const actual = sel.value;
  sel.innerHTML = '<option value="todos">Todos (últimos 14 días)</option>' + years.map(y=>`<option value="${y}">${y}</option>`).join('');
  sel.value = years.includes(actual) ? actual : 'todos';
}

function dibujarBarras(elId, datos, colorFn, vacioMsg){
  const max = Math.max(...datos.map(d=>d.kg), 1);
  const boxW=32, gap=8, chartH=120, startX=10, topPad=22, botPad=30;
  let bars = '';
  datos.forEach((d,i)=>{
    const h = (d.kg/max)*chartH;
    const x = startX + i*(boxW+gap);
    const y = chartH - h + topPad;
    const valorTxt = d.kg >= 1000 ? `${(d.kg/1000).toFixed(1)}t` : `${Math.round(d.kg)}`;
    bars += `<rect x="${x}" y="${y}" width="${boxW}" height="${Math.max(h,1)}" rx="2" style="fill:${colorFn(d)};"/>
      ${d.kg>0 ? `<text x="${x+boxW/2}" y="${y-5}" text-anchor="middle" style="font-size:8px; fill:var(--ink); font-family:'IBM Plex Mono';">${valorTxt}</text>` : ''}
      <text x="${x+boxW/2}" y="${chartH+topPad+16}" text-anchor="middle" style="font-size:9px; fill:var(--ink-dim); font-family:'Space Grotesk';">${d.label}</text>`;
  });
  const totalWidth = startX*2 + datos.length*(boxW+gap);
  document.getElementById(elId).innerHTML = datos.every(d=>d.kg===0)
    ? `<div class="empty">${vacioMsg}</div>`
    : `<svg viewBox="0 0 ${totalWidth} ${chartH+topPad+botPad}" style="width:100%; min-width:${totalWidth}px; display:block;">${bars}</svg>`;
}

function renderProcesadoChart(){
  const anio = document.getElementById('dash-anio').value;
  const mes = document.getElementById('dash-mes').value;
  const denomF = document.getElementById('dash-denom').value;
  const baches = DATA.baches.filter(b=> denomF==='todas' || b.denom===denomF);

  let datos;
  if(anio==='todos'){
    const hoy = new Date();
    const porDia = {};
    baches.forEach(b=>{ porDia[b.fecha] = (porDia[b.fecha]||0) + b.peso_fresco; });
    datos = [];
    for(let d=13; d>=0; d--){
      const dt = new Date(hoy); dt.setDate(dt.getDate()-d);
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      datos.push({label:`${dt.getDate()}/${dt.getMonth()+1}`, kg: porDia[key]||0});
    }
  } else if(mes==='todos'){
    const porMes = Array(12).fill(0);
    baches.forEach(b=>{
      const [y,m] = b.fecha.split('-');
      if(y===anio) porMes[parseInt(m,10)-1] += b.peso_fresco;
    });
    datos = porMes.map((kg,i)=>({label:MESES_LABEL[i], kg}));
  } else {
    const diasEnMes = new Date(parseInt(anio,10), parseInt(mes,10), 0).getDate();
    const porDia = {};
    baches.forEach(b=>{ porDia[b.fecha] = (porDia[b.fecha]||0) + b.peso_fresco; });
    datos = [];
    for(let d=1; d<=diasEnMes; d++){
      const key = `${anio}-${mes}-${String(d).padStart(2,'0')}`;
      datos.push({label:String(d), kg: porDia[key]||0});
    }
  }
  dibujarBarras('procesado-chart', datos, ()=>'var(--amber)', 'Sin fruto fresco registrado en el periodo seleccionado.');
}

function renderProcesadoSecoChart(){
  const anio = document.getElementById('dash-anio').value;
  const mes = document.getElementById('dash-mes').value;
  const denomF = document.getElementById('dash-denom').value;
  const baches = DATA.baches.filter(b=> (denomF==='todas' || b.denom===denomF) && b.peso_final!=null && fechaEmpaque(b));

  let datos;
  if(anio==='todos'){
    const hoy = new Date();
    const porDia = {};
    baches.forEach(b=>{ const f=fechaEmpaque(b); porDia[f] = (porDia[f]||0) + b.peso_final; });
    datos = [];
    for(let d=13; d>=0; d--){
      const dt = new Date(hoy); dt.setDate(dt.getDate()-d);
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
      datos.push({label:`${dt.getDate()}/${dt.getMonth()+1}`, kg: porDia[key]||0});
    }
  } else if(mes==='todos'){
    const porMes = Array(12).fill(0);
    baches.forEach(b=>{
      const f = fechaEmpaque(b); const [y,m] = f.split('-');
      if(y===anio) porMes[parseInt(m,10)-1] += b.peso_final;
    });
    datos = porMes.map((kg,i)=>({label:MESES_LABEL[i], kg}));
  } else {
    const diasEnMes = new Date(parseInt(anio,10), parseInt(mes,10), 0).getDate();
    const porDia = {};
    baches.forEach(b=>{ const f=fechaEmpaque(b); porDia[f] = (porDia[f]||0) + b.peso_final; });
    datos = [];
    for(let d=1; d<=diasEnMes; d++){
      const key = `${anio}-${mes}-${String(d).padStart(2,'0')}`;
      datos.push({label:String(d), kg: porDia[key]||0});
    }
  }
  dibujarBarras('procesado-seco-chart', datos, ()=>'var(--ok)', 'Sin cacao seco empacado en el periodo seleccionado.');
}

function renderDenomDonut(){
  const anio = document.getElementById('dash-anio').value;
  const mes = document.getElementById('dash-mes').value;
  const filtrados = filtrarPorPeriodo(DATA.baches, anio, mes);
  const totals = {ccn51:0, aromatico:0, upia:0};
  filtrados.forEach(b=>{ totals[b.denom] += b.peso_fresco; });
  const total = totals.ccn51 + totals.aromatico + totals.upia;
  const el = document.getElementById('denom-donut');
  if(total===0){ el.innerHTML = '<div class="empty">Sin datos de fruto fresco en el periodo seleccionado.</div>'; return; }

  let acc = 0;
  const stops = Object.keys(DENOM).map(k=>{
    const pct = totals[k]/total*100;
    const start = acc; acc += pct;
    return `${DENOM[k].color} ${start}% ${acc}%`;
  }).join(', ');
  const legend = Object.keys(DENOM).map(k=>{
    const pct = totals[k]/total*100;
    return `<div style="display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:6px;">
      <span style="width:11px; height:11px; border-radius:2px; background:${DENOM[k].color}; display:inline-block;"></span>
      <span>${DENOM[k].label}</span>
      <span class="op-meta" style="margin-left:auto;">${pct.toFixed(1)}% · ${(totals[k]/1000).toFixed(1)} ton</span>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div style="display:flex; gap:24px; align-items:center; flex-wrap:wrap;">
      <div style="position:relative; width:110px; height:110px; flex-shrink:0;">
        <div style="width:110px; height:110px; border-radius:50%; background:conic-gradient(${stops});"></div>
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:64px; height:64px; border-radius:50%; background:var(--bg); display:flex; align-items:center; justify-content:center; text-align:center;">
          <span style="font-size:11px; color:var(--ink-dim); font-family:'IBM Plex Mono',monospace;">${(total/1000).toFixed(1)}<br>ton</span>
        </div>
      </div>
      <div style="flex:1; min-width:200px;">${legend}</div>
    </div>`;
}

function renderInventarioProceso(){
  const despachados = setDespachados();

  // En proceso: aún no llega a Almacenado. Se muestra en equivalente seco (estimado según el maestro de conversión).
  const enProceso = DATA.baches.filter(b=>ACTIVE_INDICES.includes(b.etapaIdx) && !despachados.has(b.codigo));
  let totalEquiv = 0;
  const porDenomProceso = {ccn51:0, aromatico:0, upia:0};
  enProceso.forEach(b=>{
    const eq = b.peso_fresco * (factorEquivalenteSeco(b.etapaIdx)/1000);
    totalEquiv += eq;
    porDenomProceso[b.denom] += eq;
  });

  document.getElementById('inventario-proceso').innerHTML = `
    <div class="dash-grid">
      <div class="dash-card"><div class="n">${(totalEquiv/1000).toFixed(1)}</div><div class="label">Ton equiv. seco en proceso (estimado)</div></div>
      <div class="dash-card"><div class="n">${(porDenomProceso.ccn51/1000).toFixed(1)}</div><div class="label">CCN-51 (ton eq. seco)</div></div>
      <div class="dash-card"><div class="n">${(porDenomProceso.aromatico/1000).toFixed(1)}</div><div class="label">Aromático (ton eq. seco)</div></div>
      <div class="dash-card"><div class="n">${(porDenomProceso.upia/1000).toFixed(1)}</div><div class="label">Upia (ton eq. seco)</div></div>
    </div>`;

  // En bodega: ya empacado y pesado, cifra real (no estimada). Se descuenta lo ya despachado (parcial o total).
  const enBodega = DATA.baches.filter(b=>b.etapaIdx===7 && kgEnBodegaSinDespachar(b) > 0);
  const totalBodega = enBodega.reduce((s,b)=>s+kgEnBodegaSinDespachar(b),0);
  const porDenomBodega = {ccn51:0, aromatico:0, upia:0};
  enBodega.forEach(b=>{ porDenomBodega[b.denom] += kgEnBodegaSinDespachar(b); });

  document.getElementById('inventario-bodega').innerHTML = `
    <div class="dash-grid">
      <div class="dash-card"><div class="n">${(totalBodega/1000).toFixed(1)}</div><div class="label">Ton reales en bodega / ${ALMACEN_CAP.totalTon} ton cap.</div></div>
      <div class="dash-card"><div class="n">${(porDenomBodega.ccn51/1000).toFixed(1)}</div><div class="label">CCN-51 (ton)</div></div>
      <div class="dash-card"><div class="n">${(porDenomBodega.aromatico/1000).toFixed(1)}</div><div class="label">Aromático (ton)</div></div>
      <div class="dash-card"><div class="n">${(porDenomBodega.upia/1000).toFixed(1)}</div><div class="label">Upia (ton)</div></div>
    </div>`;
}

function renderDashboardKPIs(){
  const anio = document.getElementById('dash-anio').value;
  const mes = document.getElementById('dash-mes').value;
  const denomF = document.getElementById('dash-denom').value;
  const periodo = filtrarPorPeriodo(DATA.baches, anio, mes).filter(b=> denomF==='todas' || b.denom===denomF);

  const totalFresco = periodo.reduce((s,b)=>s+b.peso_fresco,0);
  const totalSeco = periodo.reduce((s,b)=>s+(b.peso_final||0),0);
  const conversion = totalFresco>0 ? (totalSeco/totalFresco*100) : 0;
  const enBodega = DATA.baches.filter(b=>b.etapaIdx===7).reduce((s,b)=>s+kgEnBodegaSinDespachar(b),0);

  document.getElementById('dash-kpis').innerHTML = `
    <div class="dash-card kpi"><div class="n">${(totalFresco/1000).toFixed(1)}</div><div class="label">Ton fresco ingresado (periodo)</div></div>
    <div class="dash-card kpi"><div class="n">${(totalSeco/1000).toFixed(1)}</div><div class="label">Ton seco procesado (periodo)</div></div>
    <div class="dash-card kpi"><div class="n">${conversion.toFixed(1)}%</div><div class="label">Conversión promedio</div></div>
    <div class="dash-card kpi"><div class="n">${(enBodega/1000).toFixed(1)}</div><div class="label">Ton en bodega ahora</div></div>
  `;

  const mesLabel = mes==='todos' ? '' : (' ' + MESES_LABEL[parseInt(mes,10)-1]);
  const periodoTxt = anio==='todos' ? 'Últimos 14 días' : `${mesLabel} ${anio}`.trim();
  const denomTxt = denomF==='todas' ? 'Todas las denominaciones' : DENOM[denomF].label;
  document.getElementById('dash-fecha-reporte').textContent = `Generado ${fmtDate(new Date())} · Periodo: ${periodoTxt} · ${denomTxt}`;
}

function exportarDashboardCSV(){
  const anio = document.getElementById('dash-anio').value;
  const mes = document.getElementById('dash-mes').value;
  const denomF = document.getElementById('dash-denom').value;
  const periodo = filtrarPorPeriodo(DATA.baches, anio, mes).filter(b=> denomF==='todas' || b.denom===denomF);
  const cols = ['codigo','fecha','denominacion','peso_fresco_kg','peso_seco_kg','fecha_empaque'];
  const filas = periodo.map(b=>[b.codigo, b.fecha, b.denom, b.peso_fresco, b.peso_final || '', fechaEmpaque(b) || '']);
  const csv = [cols.join(',')].concat(filas.map(f=>f.map(csvEscape).join(','))).join('\n');
  descargarArchivo('dashboard-resumen.csv', csv, 'text/csv');
}

function imprimirDashboard(){ window.print(); }

/* ---------- PROYECCIÓN ---------- */
function proyeccionCapacidadEtapas(dias){
  const activos = DATA.baches.filter(b=>ACTIVE_INDICES.includes(b.etapaIdx));
  const resultado = {};
  TIME_UNIDADES.forEach(idx=>{ resultado[idx] = new Array(dias).fill(0); });
  activos.forEach(b=>{
    const proy = computeProyeccion(b, dias);
    proy.forEach((stageName, d)=>{
      const idx = STAGES.indexOf(stageName);
      if(resultado[idx] !== undefined){
        resultado[idx][d] += b.peso_fresco;
      }
    });
  });
  return resultado;
}

function renderProyeccionCapacidad(){
  const dias = 7;
  const ocupacion = proyeccionCapacidadEtapas(dias);
  const hoy = new Date();

  let headerCols = '';
  for(let d=0; d<dias; d++){
    const dt = new Date(hoy); dt.setDate(dt.getDate()+d);
    headerCols += `<th>${dt.toLocaleDateString('es-CO',{weekday:'short',day:'2-digit'})}</th>`;
  }

  const alertas = [];
  const rows = TIME_UNIDADES.map(idx=>{
    const cap = CAPACIDAD[STAGES[idx]];
    const capKg = cap ? cap.total*cap.capKg : null;
    let primeraSaturacion = -1;
    const cells = ocupacion[idx].map((kg,d)=>{
      const over = capKg!=null && kg>capKg;
      if(over && primeraSaturacion===-1) primeraSaturacion = d;
      const texto = capKg!=null ? `${(kg/1000).toFixed(1)}/${(capKg/1000).toFixed(0)}` : `${(kg/1000).toFixed(1)}`;
      return `<td class="${over?'proy-saturado':''}">${texto}</td>`;
    }).join('');
    if(primeraSaturacion>=0){
      const dt = new Date(hoy); dt.setDate(dt.getDate()+primeraSaturacion);
      alertas.push(`<div class="msg err">${STAGES[idx]}: se proyecta saturación el ${fmtDate(dt)} (${(ocupacion[idx][primeraSaturacion]/1000).toFixed(1)}/${(capKg/1000).toFixed(0)} ton) — la producción de ese día podría retrasarse.</div>`);
    }
    return `<tr><td class="codigo-col">${STAGES[idx]} (ton)</td>${cells}</tr>`;
  }).join('');

  document.getElementById('proy-capacidad-wrap').innerHTML = `<table class="proy"><thead><tr><th>Etapa</th>${headerCols}</tr></thead><tbody>${rows}</tbody></table>`;
  document.getElementById('proy-capacidad-alertas').innerHTML = alertas.length
    ? alertas.join('')
    : '<div class="msg ok">No se proyecta saturación de capacidad en los próximos 7 días.</div>';
}

function computeProyeccion(b, dias){
  const now = new Date();
  const boundaries = [];
  let cursor = new Date(b.horaInicioEtapa);
  let lim = limiteHoras(b.etapaIdx);
  cursor = new Date(cursor.getTime() + (lim!=null?lim:0)*3600000);
  boundaries.push({idx:b.etapaIdx, fin:cursor});
  for(let i=b.etapaIdx+1; i<=6; i++){
    const l = limiteHoras(i);
    cursor = new Date(cursor.getTime() + (l!=null?l:0)*3600000);
    boundaries.push({idx:i, fin:cursor});
  }
  const resultado = [];
  for(let d=0; d<dias; d++){
    const punto = new Date(now);
    punto.setDate(punto.getDate()+d);
    punto.setHours(12,0,0,0);
    const b_ = boundaries.find(x=>punto < x.fin);
    resultado.push(b_ ? STAGES[b_.idx] : 'Almacenado');
  }
  return resultado;
}

function renderProyeccion(){
  const wrap = document.getElementById('proy-wrap');
  const activos = DATA.baches.filter(b=>ACTIVE_INDICES.includes(b.etapaIdx));
  if(activos.length===0){
    wrap.innerHTML = '<div class="empty">No hay baches en proceso para proyectar.</div>';
    return;
  }
  const dias = 7;
  const hoy = new Date();
  let headerCols = '';
  for(let d=0; d<dias; d++){
    const dt = new Date(hoy); dt.setDate(dt.getDate()+d);
    headerCols += `<th>${dt.toLocaleDateString('es-CO',{weekday:'short',day:'2-digit'})}</th>`;
  }
  let rows = activos.map(b=>{
    const proy = computeProyeccion(b, dias);
    const denomInfo = DENOM[b.denom];
    const cells = proy.map(p=>`<td class="${p==='Almacenado'?'proy-almacenado':''}">${p}</td>`).join('');
    return `<tr><td class="codigo-col"><span class="tag" style="background:${denomInfo.color}">${denomInfo.label}</span> ${b.codigo}</td>${cells}</tr>`;
  }).join('');
  wrap.innerHTML = `<table class="proy"><thead><tr><th>Bache</th>${headerCols}</tr></thead><tbody>${rows}</tbody></table>`;
}

function proyeccionBodega(dias){
  const now = new Date();
  let acumulado = DATA.baches.filter(b=>b.etapaIdx===7).reduce((s,b)=>s+kgEnBodegaSinDespachar(b),0);

  const arrivals = [];
  DATA.baches.filter(b=>ACTIVE_INDICES.includes(b.etapaIdx)).forEach(b=>{
    let cursor = new Date(b.horaInicioEtapa);
    let lim = limiteHoras(b.etapaIdx);
    cursor = new Date(cursor.getTime() + (lim!=null?lim:0)*3600000);
    for(let i=b.etapaIdx+1; i<=6; i++){
      const l = limiteHoras(i);
      cursor = new Date(cursor.getTime() + (l!=null?l:0)*3600000);
    }
    arrivals.push({fecha: cursor, kg: b.peso_fresco * FACTOR_CONVERSION, codigo: b.codigo, denom: b.denom});
  });

  const timeline = [];
  for(let d=0; d<dias; d++){
    const diaInicio = new Date(now); diaInicio.setHours(0,0,0,0); diaInicio.setDate(diaInicio.getDate()+d);
    const diaFin = new Date(diaInicio); diaFin.setDate(diaFin.getDate()+1);
    const llegadas = arrivals.filter(a=>a.fecha>=diaInicio && a.fecha<diaFin);
    const llegadasKg = llegadas.reduce((s,a)=>s+a.kg,0);
    acumulado += llegadasKg;
    timeline.push({fecha: diaInicio, kg: acumulado, llegadas});
  }
  return timeline;
}

function renderProyeccionBodega(){
  const dias = 21;
  const timeline = proyeccionBodega(dias);
  const capKg = ALMACEN_CAP.totalTon * 1000;
  const max = Math.max(capKg, ...timeline.map(t=>t.kg)) * 1.15;
  const boxW=34, gap=6, chartH=150, startX=10, topPad=28, botPad=30;
  let bars = '';
  timeline.forEach((t,i)=>{
    const h = (t.kg/max)*chartH;
    const x = startX + i*(boxW+gap);
    const y = chartH - h + topPad;
    const over = t.kg > capKg;
    const tooltip = t.llegadas.length
      ? `Llegarían: ${t.llegadas.map(a=>`${a.codigo} (${(a.kg/1000).toFixed(2)}t)`).join(', ')}`
      : 'Sin llegadas proyectadas ese día';
    bars += `<g>
      <title>${fmtDate(t.fecha)} · ${(t.kg/1000).toFixed(1)} ton acumuladas · ${tooltip}</title>
      <rect x="${x}" y="${y}" width="${boxW}" height="${Math.max(h,1)}" rx="2" style="fill:${over?'var(--warn)':'var(--ok)'};"/>
      <text x="${x+boxW/2}" y="${y-5}" text-anchor="middle" style="font-size:8.5px; fill:var(--ink); font-family:'IBM Plex Mono';">${(t.kg/1000).toFixed(1)}</text>
      <text x="${x+boxW/2}" y="${chartH+topPad+16}" text-anchor="middle" style="font-size:9px; fill:var(--ink-dim); font-family:'Space Grotesk';">${t.fecha.getDate()}/${t.fecha.getMonth()+1}</text>
    </g>`;
  });
  const capY = chartH - (capKg/max)*chartH + topPad;
  const totalWidth = startX*2 + timeline.length*(boxW+gap);
  const capLine = `<line x1="0" y1="${capY}" x2="${totalWidth}" y2="${capY}" style="stroke:var(--warn); stroke-width:1; stroke-dasharray:4,3;"/>
    <text x="${totalWidth-2}" y="${capY-4}" text-anchor="end" style="font-size:9px; fill:var(--warn); font-family:'IBM Plex Mono';">${ALMACEN_CAP.totalTon} ton cap.</text>`;
  document.getElementById('proy-bodega-chart').innerHTML =
    `<svg viewBox="0 0 ${totalWidth} ${chartH+topPad+botPad}" style="width:100%; min-width:${totalWidth}px; display:block;">${capLine}${bars}</svg>`;

  const overflowDay = timeline.find(t=>t.kg > capKg);
  const sugerencia = document.getElementById('proy-bodega-sugerencia');
  if(overflowDay){
    const exceso = overflowDay.kg - capKg;
    sugerencia.innerHTML = `<div class="msg err">Proyectado a superar la capacidad de bodega (${ALMACEN_CAP.totalTon} ton) el ${fmtDate(overflowDay.fecha)}, por ${(exceso/1000).toFixed(1)} ton. Se recomienda despachar un lote de venta antes de esa fecha.</div>`;
  } else {
    sugerencia.innerHTML = `<div class="msg ok">No se proyecta saturación de bodega en los próximos ${dias} días.</div>`;
  }
}

/* ---------- LOTES DE VENTA ---------- */

/* ---------- INVENTARIO (empacado pendiente + lotes de venta + despacho) ---------- */
function renderInventarioEmpacado(){
  const pendientes = DATA.baches.filter(b=>b.etapaIdx===7 && disponibleLV(b) > 0)
    .sort((a,b)=> new Date(b.horaInicioEtapa) - new Date(a.horaInicioEtapa));
  const el = document.getElementById('inventario-empacado');
  el.innerHTML = pendientes.length ? pendientes.map(b=>{
    const disp = disponibleLV(b);
    const parcial = disp < b.peso_final ? ` (${b.peso_final - disp} kg ya asignados a lote)` : '';
    return `
    <div class="lv-history-item">
      <div><span class="tag" style="background:${DENOM[b.denom].color}">${DENOM[b.denom].label}</span> <span class="mono" style="margin-left:8px;">${b.codigo}</span></div>
      <div class="op-meta">Disponible: ${disp} kg secos${parcial} · ${Math.floor(disp/69)} sacos (G1 ${b.peso_g1 ?? '—'}, G2 ${b.peso_g2 ?? '—'}, impurezas ${b.peso_impurezas ?? 0})</div>
      <div class="op-meta">${b.liberado ? `Liberado por ${b.liberadoPor}` : 'Pendiente de liberación (Administrador)'}</div>
    </div>`;
  }).join('') : '<div class="empty">No hay baches empacados pendientes de lote de venta.</div>';
}

async function despacharLote(codigo){
  const l = DATA.lotes.find(x=>x.codigo===codigo);
  const horaInput = document.getElementById('desp-hora-'+codigo);
  const encargadoInput = document.getElementById('desp-encargado-'+codigo);
  const remisionInput = document.getElementById('desp-remision-'+codigo);
  const empresaInput = document.getElementById('desp-empresa-'+codigo);
  const encargado = encargadoInput.value.trim();
  const remision = remisionInput.value.trim();
  const empresa = empresaInput.value.trim();
  const msgEl = document.getElementById('desp-msg-'+codigo);
  if(!encargado || !remision || !empresa){
    msgEl.innerHTML = '<div class="msg err">Completa encargado, N° de remisión y empresa de despacho.</div>';
    return;
  }
  const hora = horaInput.value ? new Date(horaInput.value) : new Date();
  l.despacho = { fecha: hora.toISOString(), encargado, remision, empresa };
  await save();
  render();
}

function renderLotesHistorial(){
  const hist = document.getElementById('lv-history');
  const lotesOrdenados = [...DATA.lotes].reverse();
  hist.innerHTML = lotesOrdenados.length ? lotesOrdenados.map(l=>{
    const bultosDetalle = (l.detalleBultos||[]).map(d=>`${d.codigo}: ${d.bultos} sacos (${d.kg} kg)`).join(' · ');
    const despachoInfo = l.despacho
      ? `<div class="msg ok" style="margin-top:10px;">Despachado ${fmtDateTime(new Date(l.despacho.fecha))} · Encargado: ${l.despacho.encargado} · Remisión ${l.despacho.remision} · Transporta: ${l.despacho.empresa}</div>`
      : `
        <div class="row" style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
          <div class="field" style="flex:1; min-width:160px; margin-bottom:0;"><label>Fecha y hora de despacho</label><input type="datetime-local" id="desp-hora-${l.codigo}" value="${toLocalInputValue(new Date())}"></div>
          <div class="field" style="flex:1; min-width:160px; margin-bottom:0;"><label>Encargado</label><input type="text" id="desp-encargado-${l.codigo}"></div>
          <div class="field" style="flex:1; min-width:160px; margin-bottom:0;"><label>N° remisión de salida</label><input type="text" id="desp-remision-${l.codigo}"></div>
          <div class="field" style="flex:1; min-width:160px; margin-bottom:0;"><label>Empresa de despacho</label><input type="text" id="desp-empresa-${l.codigo}"></div>
        </div>
        <div id="desp-msg-${l.codigo}"></div>
        <button onclick="despacharLote('${l.codigo}')" style="margin-top:10px;">Marcar como despachado</button>`;
    return `
      <div class="lv-history-item" style="flex-direction:column; align-items:stretch;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div><span class="tag" style="background:${DENOM[l.denom].color}">${DENOM[l.denom].label}</span> <span class="mono" style="margin-left:8px;">${l.codigo}</span></div>
          <div class="op-meta">${(l.total_kg/1000).toFixed(2)} ton (G1 ${((l.total_g1||0)/1000).toFixed(2)}, G2 ${((l.total_g2||0)/1000).toFixed(2)}) · generado por ${l.generadoPor||'—'}</div>
        </div>
        <div class="op-meta" style="margin-top:6px;">${bultosDetalle}</div>
        ${despachoInfo}
      </div>`;
  }).join('') : '<div class="empty">Aún no se han generado lotes de venta.</div>';
}

/* ---------- RENDER Y ARRANQUE DE ESTA PÁGINA ---------- */
function render(){
  actualizarEncabezado();
  renderTrazabilidad();
  poblarFiltroAnio();
  renderProcesadoChart();
  renderProcesadoSecoChart();
  renderDenomDonut();
  renderInventarioProceso();
  renderDashboardKPIs();
  renderProyeccionCapacidad();
  renderProyeccion();
  renderProyeccionBodega();
  renderInventarioEmpacado();
  renderLotesHistorial();
}

inicializarTabs();
document.getElementById('trace-f-denom').addEventListener('change', render);
document.getElementById('trace-f-desde').addEventListener('change', render);
document.getElementById('trace-f-hasta').addEventListener('change', render);
document.getElementById('trace-f-area').addEventListener('change', render);
document.getElementById('trace-f-despachados').addEventListener('change', render);
document.getElementById('dash-anio').addEventListener('change', render);
document.getElementById('dash-mes').addEventListener('change', render);
document.getElementById('dash-denom').addEventListener('change', render);
document.getElementById('btn-export-dashboard-csv').addEventListener('click', exportarDashboardCSV);
document.getElementById('btn-print-dashboard').addEventListener('click', imprimirDashboard);

load();
