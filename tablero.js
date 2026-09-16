/* =========================================================
   tablero.js — lógica de Trazabilidad, Dashboard, Proyección e Inventario.
   Requiere que shared.js esté cargado antes que este archivo.
   ========================================================= */

let traceSeleccionado = null;
let traceSeleccionados = new Set();

/* ---------- TRAZABILIDAD ---------- */
function seleccionarTrace(codigo){
  traceSeleccionado = (traceSeleccionado === codigo) ? null : codigo;
  render();
}

function toggleSeleccionTrace(codigo){
  if(traceSeleccionados.has(codigo)) traceSeleccionados.delete(codigo);
  else traceSeleccionados.add(codigo);
  render();
}

function bachesTrazabilidadFiltrados(){
  const fDenom = document.getElementById('trace-f-denom').value;
  const fDesde = document.getElementById('trace-f-desde').value;
  const fHasta = document.getElementById('trace-f-hasta').value;
  const fArea = document.getElementById('trace-f-area').value;
  const incluirDespachados = document.getElementById('trace-f-despachados').checked;
  const despachados = setDespachados();

  return DATA.baches.filter(b=>{
    if(!incluirDespachados && despachados.has(b.codigo)) return false;
    if(fDenom!=='todas' && b.denom!==fDenom) return false;
    if(fDesde && b.fecha < fDesde) return false;
    if(fHasta && b.fecha > fHasta) return false;
    if(fArea!=='todas' && String(b.etapaIdx)!==fArea) return false;
    return true;
  }).sort((a,b)=> b.fecha.localeCompare(a.fecha) || a.codigo.localeCompare(b.codigo));
}

function exportarTrazabilidadExcel(){
  const filtrados = bachesTrazabilidadFiltrados();
  const usarSeleccion = traceSeleccionados.size > 0;
  const baches = usarSeleccion ? filtrados.filter(b=>traceSeleccionados.has(b.codigo)) : filtrados;
  if(baches.length===0){
    alert('No hay baches para exportar (revisa la selección o los filtros).');
    return;
  }
  const cols = ['Código','Denominación','Etapa','Inicio','Fin','Duración (h)','Ocupación','Estado','Límite (h)'];
  const filas = [];
  baches.forEach(b=>{
    const denomLabel = DENOM[b.denom].label;
    (b.historial||[]).forEach(h=>{
      filas.push([
        b.codigo, denomLabel, h.etapaNombre,
        fmtDateTime(new Date(h.horaInicio)), fmtDateTime(new Date(h.horaFin)),
        Math.round(h.duracionHoras*10)/10, h.ocupacion || '—', h.estado, h.limiteHoras ?? ''
      ]);
    });
    // Etapa actual (en curso), si el bache sigue activo
    if(ACTIVE_INDICES.includes(b.etapaIdx)){
      filas.push([
        b.codigo, denomLabel, `${etapaMostrada(b)} (actual)`,
        fmtDateTime(new Date(b.horaInicioEtapa)), 'en curso', '', ocupacionLabel(b), 'en curso', ''
      ]);
    }
  });
  descargarExcel('trazabilidad-detalle.xlsx', 'Trazabilidad', cols, filas);
}

function renderTrazabilidad(){
  const selArea = document.getElementById('trace-f-area');
  if(selArea.options.length===0){
    selArea.innerHTML = '<option value="todas">Todas</option>' + UNIDADES.map(idx=>`<option value="${idx}">${STAGES[idx]}</option>`).join('');
  }
  const todos = bachesTrazabilidadFiltrados();

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
          <td>${etapaMostrada(b)} (actual)</td>
          <td>${fmtDateTime(new Date(b.horaInicioEtapa))}</td>
          <td>—</td>
          <td>en curso</td>
          <td>${ocupacionLabel(b)}</td>
          <td>—</td>
        </tr>`;
      const grados = b.peso_final!=null
        ? ` · Seco total: ${b.peso_final} kg (G1 ${b.peso_g1 ?? '—'} kg, G2 ${b.peso_g2 ?? '—'} kg, impurezas ${b.peso_impurezas ?? 0} kg)${b.factorConversion!=null ? ` · <span style="color:${(b.factorConversion<25||b.factorConversion>40)?'var(--warn)':'var(--ok)'}; font-weight:600;">% conversión: ${b.factorConversion}%</span>` : ''}`
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
          <input type="checkbox" ${traceSeleccionados.has(b.codigo)?'checked':''} onclick="event.stopPropagation()" onchange="toggleSeleccionTrace('${b.codigo}')" style="width:auto;">
          <span class="tag" style="background:${denomInfo.color}">${denomInfo.label}</span>
          <span class="op-codigo">${b.codigo}</span>
          <span class="op-meta">${etapaMostrada(b)}${(b.lvAsignaciones||[]).length ? ` · ${b.lvAsignaciones.map(a=>a.lv).join(', ')}` : ''}${b.parcialDe ? ` · parcial de ${b.parcialDe}` : ''}</span>
        </div>
        ${detalle}
      </div>`;
  }).join('');
}

/* ---------- FLUJO Y CAPACIDAD ---------- */

/* ---------- DASHBOARD ---------- */

function dibujarBarras(elId, datos, colorFn, vacioMsg){
  const max = Math.max(...datos.map(d=>d.kg), 1);
  const boxW=32, gap=8, chartH=120, startX=10, topPad=22, botPad=30;
  let bars = '';
  datos.forEach((d,i)=>{
    const h = (d.kg/max)*chartH;
    const x = startX + i*(boxW+gap);
    const y = chartH - h + topPad;
    const valorTxt = (d.kg/1000).toFixed(2);
    bars += `<rect x="${x}" y="${y}" width="${boxW}" height="${Math.max(h,1)}" rx="3" style="fill:${colorFn(d)};"/>
      ${d.kg>0 ? `<text x="${x+boxW/2}" y="${y-5}" text-anchor="middle" style="font-size:8px; fill:var(--ink); font-family:'IBM Plex Mono';">${valorTxt}</text>` : ''}
      <text x="${x+boxW/2}" y="${chartH+topPad+16}" text-anchor="middle" style="font-size:9px; fill:var(--ink-dim); font-family:'Public Sans';">${d.label}</text>`;
  });
  const totalWidth = startX*2 + datos.length*(boxW+gap);
  document.getElementById(elId).innerHTML = datos.every(d=>d.kg===0)
    ? `<div class="empty">${vacioMsg}</div>`
    : `<svg viewBox="0 0 ${totalWidth} ${chartH+topPad+botPad}" style="width:100%; min-width:${totalWidth}px; display:block;">${bars}</svg>`;
}

function construirSerieTemporal(baches, rango, obtenerFecha, obtenerValor){
  const desde = new Date(rango.desde+'T00:00:00');
  const hasta = new Date(rango.hasta+'T00:00:00');
  const diffDias = Math.round((hasta-desde)/86400000) + 1;

  const porFecha = {};
  baches.forEach(b=>{
    const f = obtenerFecha(b);
    if(!f) return;
    porFecha[f] = (porFecha[f]||0) + obtenerValor(b);
  });

  if(diffDias <= 62){
    const datos = [];
    for(let i=0; i<diffDias; i++){
      const dt = new Date(desde); dt.setDate(dt.getDate()+i);
      datos.push({label:`${dt.getDate()}/${dt.getMonth()+1}`, kg: porFecha[fechaISOLocal(dt)]||0});
    }
    return datos;
  }

  // Rango largo: agrupar por mes calendario dentro del rango
  const porMes = {};
  Object.keys(porFecha).forEach(f=>{
    const ym = f.slice(0,7);
    porMes[ym] = (porMes[ym]||0) + porFecha[f];
  });
  const datos = [];
  let cursor = new Date(desde.getFullYear(), desde.getMonth(), 1);
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), 1);
  while(cursor <= fin){
    const ym = `${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`;
    datos.push({label:`${MESES_LABEL[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`, kg: porMes[ym]||0});
    cursor.setMonth(cursor.getMonth()+1);
  }
  return datos;
}

function renderProcesadoChart(){
  const denomF = document.getElementById('dash-denom').value;
  const rango = calcularRangoPeriodo();
  const baches = DATA.baches.filter(b=> denomF==='todas' || b.denom===denomF);
  const datos = construirSerieTemporal(baches, rango, b=>b.fecha, b=>b.peso_fresco);
  dibujarBarras('procesado-chart', datos, ()=>'var(--amber)', 'Sin fruto fresco registrado en el periodo seleccionado.');
}

function renderProcesadoSecoChart(){
  const denomF = document.getElementById('dash-denom').value;
  const rango = calcularRangoPeriodo();
  const baches = DATA.baches.filter(b=> (denomF==='todas' || b.denom===denomF) && b.peso_final!=null && fechaEmpaque(b));
  const datos = construirSerieTemporal(baches, rango, b=>fechaEmpaque(b), b=>b.peso_final);
  dibujarBarras('procesado-seco-chart', datos, ()=>'var(--ok)', 'Sin cacao seco empacado en el periodo seleccionado.');
}

function renderDenomDonut(){
  const rango = calcularRangoPeriodo();
  const filtrados = filtrarPorRango(DATA.baches, rango);
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
    return `<div class="row">
      <div class="label-line"><i class="dot" style="background:${DENOM[k].color};"></i>${DENOM[k].label}</div>
      <span class="pct">${pct.toFixed(1)}% · ${(totals[k]/1000).toFixed(2)} ton</span>
    </div>`;
  }).join('');
  el.innerHTML = `
    <div class="donut-row">
      <div style="position:relative; width:110px; height:110px; flex-shrink:0;">
        <div style="width:110px; height:110px; border-radius:50%; background:conic-gradient(${stops});"></div>
        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:64px; height:64px; border-radius:50%; background:var(--bg); display:flex; align-items:center; justify-content:center; text-align:center;">
          <span style="font-size:11px; color:var(--ink-dim); font-family:'IBM Plex Mono',monospace;">${(total/1000).toFixed(2)}<br>ton</span>
        </div>
      </div>
      <div class="donut-legend">${legend}</div>
    </div>`;
}

function renderFlujoProduccion(){
  const denomF = document.getElementById('dash-denom').value;
  const rango = calcularRangoPeriodo();
  const despachadosSet = setDespachados();

  // 1) Fresco ingresado en el periodo
  const periodo = filtrarPorRango(DATA.baches, rango).filter(b=> denomF==='todas' || b.denom===denomF);
  const totalFresco = periodo.reduce((s,b)=>s+b.peso_fresco,0);

  // 2) En proceso ahora (estimado), sin filtrar por periodo (es una foto del momento)
  const enProceso = DATA.baches.filter(b=>ACTIVE_INDICES.includes(b.etapaIdx) && !despachadosSet.has(b.codigo) && (denomF==='todas' || b.denom===denomF));
  let totalProcesoEq = 0;
  const porDenomProceso = {ccn51:0, aromatico:0, upia:0};
  enProceso.forEach(b=>{ const eq = b.peso_fresco*factorConversionActual(); totalProcesoEq += eq; porDenomProceso[b.denom]+=eq; });

  // 3) En bodega ahora (real), sin filtrar por periodo
  const enBodega = DATA.baches.filter(b=>b.etapaIdx===7 && kgEnBodegaSinDespachar(b)>0 && (denomF==='todas' || b.denom===denomF));
  let totalBodega = 0;
  const porDenomBodega = {ccn51:0, aromatico:0, upia:0};
  enBodega.forEach(b=>{ const kg = kgEnBodegaSinDespachar(b); totalBodega += kg; porDenomBodega[b.denom]+=kg; });

  // 4) Despachado en el periodo
  const despachadosLotes = DATA.lotes.filter(l=>l.despacho).filter(l=>{
    if(denomF!=='todas' && l.denom!==denomF) return false;
    const f = l.despacho.fecha.slice(0,10);
    return f >= rango.desde && f <= rango.hasta;
  });
  const totalDespachado = despachadosLotes.reduce((s,l)=>s+l.total_kg,0);

  const max = Math.max(totalFresco, totalProcesoEq, totalBodega, totalDespachado, 1);
  const flex = (v) => Math.max(v/max, 0.12).toFixed(3);

  document.getElementById('flujo-produccion').innerHTML = `
    <div class="pipe-wrap">
      <div class="pipe">
        <div class="pipe-seg" style="flex:${flex(totalFresco)}; background:var(--amber-1); color:#3d2c12;"><span class="n">${(totalFresco/1000).toFixed(2)} ton</span><span class="l">Fresco ingresado</span></div>
        <div class="pipe-arrow">›</div>
        <div class="pipe-seg" style="flex:${flex(totalProcesoEq)}; background:var(--amber-2); color:#3d2c12;"><span class="n">${(totalProcesoEq/1000).toFixed(2)} ton</span><span class="l">En proceso (estimado)</span></div>
        <div class="pipe-arrow">›</div>
        <div class="pipe-seg" style="flex:${flex(totalBodega)}; background:var(--amber-3);"><span class="n">${(totalBodega/1000).toFixed(2)} ton</span><span class="l">En bodega (real)</span></div>
        <div class="pipe-arrow">›</div>
        <div class="pipe-seg" style="flex:${flex(totalDespachado)}; background:var(--amber);"><span class="n">${(totalDespachado/1000).toFixed(2)} ton</span><span class="l">Despachado (periodo)</span></div>
      </div>
    </div>
    <div class="pipe-detail">
      <span>● CCN-51 · proceso ${(porDenomProceso.ccn51/1000).toFixed(2)} · bodega ${(porDenomBodega.ccn51/1000).toFixed(2)}</span>
      <span>● Aromático · proceso ${(porDenomProceso.aromatico/1000).toFixed(2)} · bodega ${(porDenomBodega.aromatico/1000).toFixed(2)}</span>
      <span>● Upia · proceso ${(porDenomProceso.upia/1000).toFixed(2)} · bodega ${(porDenomBodega.upia/1000).toFixed(2)}</span>
    </div>
    <p class="section-hint" style="margin:10px 0 0;">El detalle de por-liberar / liberado / en-lote / despachado vive en la pestaña Inventario — aquí solo el resumen del periodo.</p>`;
}

const PERIODO_LABELS = {
  semana: 'Última semana', quincena: 'Última quincena', mes_calendario: 'Mes calendario actual',
  trimestre: 'Últimos 3 meses', semestre: 'Último semestre', todo: 'Todo el historial', personalizado: 'Personalizado'
};

function renderDashboardKPIs(){
  const denomF = document.getElementById('dash-denom').value;
  const rango = calcularRangoPeriodo();
  const periodo = filtrarPorRango(DATA.baches, rango).filter(b=> denomF==='todas' || b.denom===denomF);

  const totalFresco = periodo.reduce((s,b)=>s+b.peso_fresco,0);
  const totalSeco = periodo.reduce((s,b)=>s+(b.peso_final||0),0);
  const conversion = totalSeco>0 ? (totalSeco/totalFresco*100) : null;
  const enBodega = DATA.baches.filter(b=>b.etapaIdx===7).reduce((s,b)=>s+kgEnBodegaSinDespachar(b),0);

  document.getElementById('dash-kpis').innerHTML = `
    <div class="hero-kpi"><div class="n">${(enBodega/1000).toFixed(2)} <span style="font-size:15px;">ton</span></div><div class="label">En bodega ahora mismo</div></div>
    <div class="dash-card kpi"><div class="n">${(totalFresco/1000).toFixed(2)}</div><div class="label">Ton fresco ingresado (periodo)</div></div>
    <div class="dash-card kpi"><div class="n">${(totalSeco/1000).toFixed(2)}</div><div class="label">Ton seco procesado (periodo)</div></div>
    <div class="dash-card kpi"><div class="n">${conversion!=null ? conversion.toFixed(1)+'%' : '—'}</div><div class="label">% conversión real (seco / fresco × 100)${conversion==null ? ' — aún sin cacao seco en el periodo' : ''}</div></div>
  `;

  const periodoSel = document.getElementById('dash-periodo').value;
  const periodoTxt = periodoSel==='personalizado' ? `${rango.desde} a ${rango.hasta}` : PERIODO_LABELS[periodoSel];
  const denomTxt = denomF==='todas' ? 'Todas las denominaciones' : DENOM[denomF].label;
  document.getElementById('dash-fecha-reporte').textContent = `Generado ${fmtDate(new Date())} · Periodo: ${periodoTxt} · ${denomTxt}`;
}

function exportarDashboardCSV(){
  const denomF = document.getElementById('dash-denom').value;
  const rango = calcularRangoPeriodo();
  const periodo = filtrarPorRango(DATA.baches, rango).filter(b=> denomF==='todas' || b.denom===denomF);
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

  const hoy = new Date(); hoy.setHours(0,0,0,0);

  activos.forEach(b=>{
    // Construir el intervalo [inicio, fin) de cada etapa futura de este bache.
    let cursor = new Date(b.horaInicioEtapa);
    let lim = limiteHoras(b.etapaIdx, b.denom);
    let fin = new Date(cursor.getTime() + (lim!=null?lim:0)*3600000);
    const intervalos = [{ idx: b.etapaIdx, inicio: cursor, fin }];
    for(let i=b.etapaIdx+1; i<=6; i++){
      const l = limiteHoras(i, b.denom);
      const inicio2 = fin;
      fin = new Date(inicio2.getTime() + (l!=null?l:0)*3600000);
      intervalos.push({ idx: i, inicio: inicio2, fin });
    }

    // Por cada día del horizonte, sumar el peso en TODAS las etapas cuyo
    // intervalo se solape con ese día (no solo la etapa "de mediodía"), para
    // no perder etapas cortas (p.ej. presecado de 8h) entre dos muestras.
    for(let d=0; d<dias; d++){
      const diaInicio = new Date(hoy); diaInicio.setDate(diaInicio.getDate()+d);
      const diaFin = new Date(diaInicio); diaFin.setDate(diaFin.getDate()+1);
      intervalos.forEach(iv=>{
        if(resultado[iv.idx] === undefined) return;
        if(iv.inicio < diaFin && iv.fin > diaInicio){
          resultado[iv.idx][d] += b.peso_fresco;
        }
      });
    }
  });
  return resultado;
}

function colorSaturacion(pct){
  if(pct >= 100) return '#b23a2e';
  if(pct >= 70) return '#c99a51';
  return '#2f7a3d';
}

function renderProyeccionCapacidad(){
  const dias = parseInt(document.getElementById('proy-dias').value, 10) || 7;
  document.getElementById('proy-capacidad-titulo').textContent = `Saturación de capacidad por etapa (próximos ${dias} días)`;
  const ocupacion = proyeccionCapacidadEtapas(dias);
  const hoy = new Date();

  let headerCols = '';
  for(let d=0; d<dias; d++){
    const dt = new Date(hoy); dt.setDate(dt.getDate()+d);
    headerCols += `<th>${dt.toLocaleDateString('es-CO',{weekday:'short',day:'2-digit'})}</th>`;
  }

  const alertas = [];
  const rows = TIME_UNIDADES.map(idx=>{
    const cap = capacidadDe(STAGES[idx]);
    const capKg = cap ? cap.total*cap.capKg : null;
    let primeraSaturacion = -1;
    const cells = ocupacion[idx].map((kg,d)=>{
      const pct = capKg!=null ? (kg/capKg*100) : null;
      const over = pct!=null && pct>=100;
      if(over && primeraSaturacion===-1) primeraSaturacion = d;
      if(pct==null) return `<td class="cell" style="background:var(--panel-2); color:var(--ink-dim);">${(kg/1000).toFixed(2)}</td>`;
      return `<td class="cell" style="background:${colorSaturacion(pct)};" title="${(kg/1000).toFixed(2)}/${(capKg/1000).toFixed(0)} ton">${pct.toFixed(0)}%</td>`;
    }).join('');
    if(primeraSaturacion>=0){
      const dt = new Date(hoy); dt.setDate(dt.getDate()+primeraSaturacion);
      const pctSat = (ocupacion[idx][primeraSaturacion]/capKg*100).toFixed(0);
      alertas.push(`<div class="report-card" style="border-left:3px solid var(--warn); margin-bottom:12px;"><p class="block-title" style="color:var(--warn); margin-bottom:6px;">Alerta de saturación</p><p style="margin:0; font-size:13px;">${STAGES[idx]}: se proyecta saturación el <b>${fmtDate(dt)}</b> (${pctSat}% · ${(ocupacion[idx][primeraSaturacion]/1000).toFixed(2)}/${(capKg/1000).toFixed(0)} ton) — la producción de ese día podría retrasarse.</p></div>`);
    }
    return `<tr><td>${STAGES[idx]}</td>${cells}</tr>`;
  }).join('');

  document.getElementById('proy-capacidad-wrap').innerHTML = `
    <div class="heat-wrap"><table class="heat"><thead><tr><th>Etapa</th>${headerCols}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="heat-legend">
      <span><i style="background:#2f7a3d;"></i>holgado (&lt;70%)</span>
      <span><i style="background:#c99a51;"></i>ajustado (70-99%)</span>
      <span><i style="background:#b23a2e;"></i>saturado (100%+)</span>
    </div>`;
  document.getElementById('proy-capacidad-alertas').innerHTML = alertas.length
    ? alertas.join('')
    : `<div class="msg ok">No se proyecta saturación de capacidad en los próximos ${dias} días.</div>`;
}

function computeProyeccion(b, dias){
  const now = new Date();
  const boundaries = [];
  let cursor = new Date(b.horaInicioEtapa);
  let lim = limiteHoras(b.etapaIdx, b.denom);
  cursor = new Date(cursor.getTime() + (lim!=null?lim:0)*3600000);
  boundaries.push({idx:b.etapaIdx, fin:cursor});
  for(let i=b.etapaIdx+1; i<=6; i++){
    const l = limiteHoras(i, b.denom);
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
  const dias = parseInt(document.getElementById('proy-dias').value, 10) || 7;
  document.getElementById('proy-titulo').textContent = `Proyección de etapa por bache (próximos ${dias} días)`;
  const activos = DATA.baches.filter(b=>ACTIVE_INDICES.includes(b.etapaIdx));
  if(activos.length===0){
    wrap.innerHTML = '<div class="empty">No hay baches en proceso para proyectar.</div>';
    return;
  }
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
    return `<tr style="border-left:3px solid ${denomInfo.color};"><td class="codigo-col"><span class="tag" style="background:${denomInfo.color}">${denomInfo.label}</span> ${b.codigo}</td>${cells}</tr>`;
  }).join('');
  wrap.innerHTML = `<table class="proy"><thead><tr><th>Bache</th>${headerCols}</tr></thead><tbody>${rows}</tbody></table>`;
}

function proyeccionBodega(dias){
  const now = new Date();
  let acumulado = DATA.baches.filter(b=>b.etapaIdx===7).reduce((s,b)=>s+kgEnBodegaSinDespachar(b),0);

  const arrivals = [];
  DATA.baches.filter(b=>ACTIVE_INDICES.includes(b.etapaIdx)).forEach(b=>{
    let cursor = new Date(b.horaInicioEtapa);
    let lim = limiteHoras(b.etapaIdx, b.denom);
    cursor = new Date(cursor.getTime() + (lim!=null?lim:0)*3600000);
    for(let i=b.etapaIdx+1; i<=6; i++){
      const l = limiteHoras(i, b.denom);
      cursor = new Date(cursor.getTime() + (l!=null?l:0)*3600000);
    }
    arrivals.push({fecha: cursor, kg: b.peso_fresco * factorConversionActual(), codigo: b.codigo, denom: b.denom});
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
  document.getElementById('proy-bodega-factor').textContent = `Factor de conversión de referencia: ${DATA.maestroConversion.seco} kg de seco por tonelada de fresco (editable en Panel → Configuración).`;
  const timeline = proyeccionBodega(dias);
  const capKg = DATA.capacidadMaestro.almacenTotalTon * 1000;
  const max = Math.max(capKg, ...timeline.map(t=>t.kg)) * 1.15;
  const boxW=34, gap=6, chartH=150, startX=10, topPad=28, botPad=30;
  let bars = '';
  timeline.forEach((t,i)=>{
    const h = (t.kg/max)*chartH;
    const x = startX + i*(boxW+gap);
    const y = chartH - h + topPad;
    const pctCap = (t.kg/capKg)*100;
    const over = pctCap >= 100;
    const colorBarra = colorSaturacion(pctCap);
    const tooltip = t.llegadas.length
      ? `Llegarían: ${t.llegadas.map(a=>`${a.codigo} (${(a.kg/1000).toFixed(2)}t)`).join(', ')}`
      : 'Sin llegadas proyectadas ese día';
    bars += `<g>
      <title>${fmtDate(t.fecha)} · ${(t.kg/1000).toFixed(2)} ton acumuladas (${pctCap.toFixed(0)}%) · ${tooltip}</title>
      <rect x="${x}" y="${y}" width="${boxW}" height="${Math.max(h,1)}" rx="2" style="fill:${colorBarra};"/>
      <text x="${x+boxW/2}" y="${y-5}" text-anchor="middle" style="font-size:8.5px; fill:var(--ink); font-family:'IBM Plex Mono';">${(t.kg/1000).toFixed(2)}</text>
      <text x="${x+boxW/2}" y="${chartH+topPad+16}" text-anchor="middle" style="font-size:9px; fill:var(--ink-dim); font-family:'Public Sans';">${t.fecha.getDate()}/${t.fecha.getMonth()+1}</text>
    </g>`;
  });
  const capY = chartH - (capKg/max)*chartH + topPad;
  const totalWidth = startX*2 + timeline.length*(boxW+gap);
  const capLine = `<line x1="0" y1="${capY}" x2="${totalWidth}" y2="${capY}" style="stroke:var(--warn); stroke-width:1; stroke-dasharray:4,3;"/>
    <text x="${totalWidth-2}" y="${capY-4}" text-anchor="end" style="font-size:9px; fill:var(--warn); font-family:'IBM Plex Mono';">${DATA.capacidadMaestro.almacenTotalTon} ton cap.</text>`;
  document.getElementById('proy-bodega-chart').innerHTML =
    `<svg viewBox="0 0 ${totalWidth} ${chartH+topPad+botPad}" style="width:100%; min-width:${totalWidth}px; display:block;">${capLine}${bars}</svg>`;

  const overflowDay = timeline.find(t=>t.kg > capKg);
  const sugerencia = document.getElementById('proy-bodega-sugerencia');
  if(overflowDay){
    const exceso = overflowDay.kg - capKg;
    sugerencia.innerHTML = `<div class="msg err">Proyectado a superar la capacidad de bodega (${DATA.capacidadMaestro.almacenTotalTon} ton) el ${fmtDate(overflowDay.fecha)}, por ${(exceso/1000).toFixed(2)} ton. Se recomienda despachar un lote de venta antes de esa fecha.</div>`;
  } else {
    sugerencia.innerHTML = `<div class="msg ok">No se proyecta saturación de bodega en los próximos ${dias} días.</div>`;
  }
}

/* ---------- LOTES DE VENTA ---------- */

/* ---------- INVENTARIO (empacado pendiente + lotes de venta + despacho) ---------- */
let invStageAbierto = null;
function toggleInvStage(id){
  invStageAbierto = (invStageAbierto === id) ? null : id;
  renderInventarioTab();
}

function renderInventarioTab(){
  const porLiberar = DATA.baches.filter(b=>b.etapaIdx===7 && !b.liberado)
    .sort((a,b)=> new Date(b.horaInicioEtapa) - new Date(a.horaInicioEtapa));
  const totalPorLiberar = porLiberar.reduce((s,b)=>s+(b.peso_final||0),0);

  const liberadoSinAsignar = DATA.baches.filter(b=>b.etapaIdx===7 && b.liberado && disponibleLV(b) > 0)
    .sort((a,b)=> new Date(b.horaInicioEtapa) - new Date(a.horaInicioEtapa));
  const totalLiberadoSinAsignar = liberadoSinAsignar.reduce((s,b)=>s+disponibleLV(b),0);

  const lotesPendientes = [...DATA.lotes].reverse().filter(l=>!l.despacho);
  const totalEnLote = lotesPendientes.reduce((s,l)=>s+l.total_kg,0);

  const totalBodega = totalPorLiberar + totalLiberadoSinAsignar + totalEnLote;

  // ---- Hero ----
  document.getElementById('inv-hero-total').innerHTML = `${(totalBodega/1000).toFixed(2)}<span>ton</span>`;
  const pctA = totalBodega>0 ? totalPorLiberar/totalBodega*100 : 0;
  const pctB = totalBodega>0 ? totalLiberadoSinAsignar/totalBodega*100 : 0;
  const pctC = totalBodega>0 ? totalEnLote/totalBodega*100 : 0;
  document.getElementById('inv-hero-bar').innerHTML = totalBodega>0 ? `
    <div style="width:${pctA}%; background:var(--amber-2);"></div>
    <div style="width:${pctB}%; background:var(--amber-3);"></div>
    <div style="width:${pctC}%; background:var(--amber);"></div>` : '';
  document.getElementById('inv-hero-legend').innerHTML = `
    <span><i class="dot" style="background:var(--amber-2);"></i>Por liberar · ${(totalPorLiberar/1000).toFixed(2)} ton</span>
    <span><i class="dot" style="background:var(--amber-3);"></i>Liberado sin lote · ${(totalLiberadoSinAsignar/1000).toFixed(2)} ton</span>
    <span><i class="dot" style="background:var(--amber);"></i>En lote, sin despachar · ${(totalEnLote/1000).toFixed(2)} ton</span>`;

  // ---- Embudo ----
  const maxF = Math.max(totalPorLiberar, totalLiberadoSinAsignar, totalEnLote, 1);
  const flex = (v) => Math.max(v/maxF, 0.15).toFixed(3);
  document.getElementById('inv-funnel').innerHTML = `
    <div class="pipe-wrap">
      <div class="pipe">
        <div class="pipe-seg" style="flex:${flex(totalPorLiberar)}; background:var(--amber-2); color:#3d2c12;"><span class="n">${(totalPorLiberar/1000).toFixed(2)} ton</span><span class="l">Por liberar</span></div>
        <div class="pipe-arrow">›</div>
        <div class="pipe-seg" style="flex:${flex(totalLiberadoSinAsignar)}; background:var(--amber-3);"><span class="n">${(totalLiberadoSinAsignar/1000).toFixed(2)} ton</span><span class="l">Liberado</span></div>
        <div class="pipe-arrow">›</div>
        <div class="pipe-seg" style="flex:${flex(totalEnLote)}; background:var(--amber);"><span class="n">${(totalEnLote/1000).toFixed(2)} ton</span><span class="l">En lote</span></div>
      </div>
    </div>
    <p class="section-hint" style="margin-top:8px;">Lo despachado ya salió de bodega — se ve completo en la pestaña Despachos.</p>`;

  // ---- Tarjetas colapsables por estado ----
  const stageCard = (id, titulo, count, kg, itemsHtml) => `
    <div class="queue-card ${invStageAbierto===id?'open':''}">
      <div class="queue-head" onclick="toggleInvStage('${id}')">
        <span class="code">${titulo}</span>
        <span class="meta">${count}</span>
        <span class="stage-kg mono" style="font-weight:600;">${(kg/1000).toFixed(2)} ton</span>
        <span class="chev">›</span>
      </div>
      <div class="queue-body">${itemsHtml}</div>
    </div>`;

  document.getElementById('inv-stage-porliberar').innerHTML = stageCard(
    'porliberar', 'Pendiente de liberación', `${porLiberar.length} bache${porLiberar.length===1?'':'s'}`, totalPorLiberar,
    porLiberar.length ? porLiberar.map(b=>`
      <div class="stage-item">
        <span><span class="tag" style="background:${DENOM[b.denom].color}">${DENOM[b.denom].label}</span> ${b.codigo}</span>
        <span class="section-hint" style="margin:0;">${b.peso_final} kg · ${b.bultos ?? 0} sacos · G2 ${b.peso_g2 ?? 0} kg</span>
      </div>`).join('') : '<div class="empty">No hay baches pendientes de liberación.</div>'
  );

  document.getElementById('inv-stage-liberado').innerHTML = stageCard(
    'liberado', 'Liberado, sin asignar a lote', `${liberadoSinAsignar.length} bache${liberadoSinAsignar.length===1?'':'s'}`, totalLiberadoSinAsignar,
    liberadoSinAsignar.length ? liberadoSinAsignar.map(b=>{
      const disp = disponibleLV(b);
      const parcial = disp < b.peso_final ? ` (${b.peso_final-disp} kg ya en otro lote)` : '';
      return `<div class="stage-item">
        <span><span class="tag" style="background:${DENOM[b.denom].color}">${DENOM[b.denom].label}</span> ${b.codigo}</span>
        <span class="section-hint" style="margin:0;">${disp} kg${parcial} · ${Math.floor(disp/pesoBultoDe(b.denom))} sacos</span>
      </div>`;
    }).join('') : '<div class="empty">No hay baches liberados pendientes de asignar a un lote.</div>'
  );

  document.getElementById('inv-stage-enlote').innerHTML = stageCard(
    'enlote', 'Asignado a lote, pendiente de despacho', `${lotesPendientes.length} lote${lotesPendientes.length===1?'':'s'}`, totalEnLote,
    lotesPendientes.length ? lotesPendientes.map(l=>`
      <div class="stage-item">
        <span><span class="tag" style="background:${DENOM[l.denom].color}">${DENOM[l.denom].label}</span> ${l.codigo}</span>
        <span class="section-hint" style="margin:0;">${(l.total_kg/1000).toFixed(2)} ton · ${(l.baches||[]).join(', ')}</span>
      </div>`).join('') : '<div class="empty">No hay lotes pendientes de despacho.</div>'
  );

  // ---- Otros inventarios ----
  document.getElementById('other-g2').innerHTML = `${(DATA.inventarioSecundario.grado2/1000).toFixed(2)}<span style="font-size:12px; color:var(--ink-dim);"> ton</span>`;
  document.getElementById('other-imp').innerHTML = `${(DATA.inventarioSecundario.impurezas/1000).toFixed(2)}<span style="font-size:12px; color:var(--ink-dim);"> ton</span>`;
  const r = DATA.remanenteG1;
  const remTotal = (r.ccn51||0)+(r.aromatico||0)+(r.upia||0);
  document.getElementById('other-remanente').innerHTML = `${remTotal.toFixed(0)}<span style="font-size:12px; color:var(--ink-dim);"> kg</span>`;
  document.getElementById('other-remanente-detalle').textContent = `CCN-51 ${(r.ccn51||0).toFixed(0)} · Aromático ${(r.aromatico||0).toFixed(0)} · Upia ${(r.upia||0).toFixed(0)}`;
  document.getElementById('other-local').innerHTML = `${((DATA.cacaoLocal.total||0)/1000).toFixed(2)}<span style="font-size:12px; color:var(--ink-dim);"> ton</span>`;
}

/* ---------- DESPACHOS (lotes de venta ya despachados) ---------- */
function lotesDespachadosFiltrados(){
  const denomF = document.getElementById('desp-f-denom').value;
  const desde = document.getElementById('desp-f-desde').value;
  const hasta = document.getElementById('desp-f-hasta').value;
  return DATA.lotes.filter(l=>{
    if(!l.despacho) return false;
    if(denomF!=='todas' && l.denom!==denomF) return false;
    const f = l.despacho.fecha.slice(0,10);
    if(desde && f < desde) return false;
    if(hasta && f > hasta) return false;
    return true;
  }).sort((a,b)=> b.despacho.fecha.localeCompare(a.despacho.fecha));
}

function renderDespachosTab(){
  const lotes = lotesDespachadosFiltrados();
  const wrap = document.getElementById('despachos-lista');
  wrap.innerHTML = lotes.length ? lotes.map(l=>`
    <div class="lv-history-item" style="flex-direction:column; align-items:stretch;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div><span class="tag" style="background:${DENOM[l.denom].color}">${DENOM[l.denom].label}</span> <span class="mono" style="margin-left:8px;">${l.codigo}</span></div>
        <div class="op-meta">${(l.total_kg/1000).toFixed(2)} ton · generado por ${l.generadoPor||'—'}</div>
      </div>
      <div class="op-meta" style="margin-top:6px;">Despachado ${fmtDateTime(new Date(l.despacho.fecha))} · Encargado: ${l.despacho.encargado} · Remisión ${l.despacho.remision} · Transporta: ${l.despacho.empresa}${l.despacho.autorizadoPor ? ` · Autorizó: ${l.despacho.autorizadoPor}` : ''}</div>
    </div>`).join('') : '<div class="empty">No hay lotes despachados con estos filtros.</div>';
}

function exportarDespachosExcel(){
  const lotes = lotesDespachadosFiltrados();
  const cols = ['Código LV','Denominación','Total kg','Baches','Fecha despacho','Encargado','Remisión','Empresa','Autorizado por'];
  const filas = lotes.map(l=>[
    l.codigo, DENOM[l.denom].label, l.total_kg, (l.baches||[]).join(' '),
    l.despacho.fecha.slice(0,10), l.despacho.encargado, l.despacho.remision, l.despacho.empresa, l.despacho.autorizadoPor || ''
  ]);
  descargarExcel('lotes-despachados.xlsx', 'Despachos', cols, filas);
}

/* ---------- RENDER Y ARRANQUE DE ESTA PÁGINA ---------- */
function render(){
  actualizarEncabezado();
  renderTrazabilidad();
  renderProcesadoChart();
  renderProcesadoSecoChart();
  renderDenomDonut();
  renderFlujoProduccion();
  renderDashboardKPIs();
  renderProyeccionCapacidad();
  renderProyeccion();
  renderProyeccionBodega();
  renderInventarioTab();
  renderDespachosTab();
}

inicializarTabs();
inicializarGateSimple('phc2026', 'acceso-valido-tablero', 'nombre-guardado-tablero');
document.getElementById('trace-f-denom').addEventListener('change', render);
document.getElementById('trace-f-desde').addEventListener('change', render);
document.getElementById('trace-f-hasta').addEventListener('change', render);
document.getElementById('trace-f-area').addEventListener('change', render);
document.getElementById('trace-f-despachados').addEventListener('change', render);
document.getElementById('btn-export-trazabilidad').addEventListener('click', exportarTrazabilidadExcel);
document.getElementById('dash-periodo').addEventListener('change', ()=>{
  const esPersonalizado = document.getElementById('dash-periodo').value === 'personalizado';
  document.getElementById('dash-desde-wrap').style.display = esPersonalizado ? 'flex' : 'none';
  document.getElementById('dash-hasta-wrap').style.display = esPersonalizado ? 'flex' : 'none';
  render();
});
document.getElementById('dash-desde').addEventListener('change', render);
document.getElementById('dash-hasta').addEventListener('change', render);
document.getElementById('dash-denom').addEventListener('change', render);
document.getElementById('btn-export-dashboard-csv').addEventListener('click', exportarDashboardCSV);
document.getElementById('btn-print-dashboard').addEventListener('click', imprimirDashboard);
document.getElementById('desp-f-denom').addEventListener('change', render);
document.getElementById('desp-f-desde').addEventListener('change', render);
document.getElementById('desp-f-hasta').addEventListener('change', render);
document.getElementById('btn-export-despachos').addEventListener('click', exportarDespachosExcel);
document.getElementById('proy-dias').addEventListener('change', render);

load();
