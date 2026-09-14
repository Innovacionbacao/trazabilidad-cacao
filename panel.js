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

/* ---------- SEGUIMIENTO ---------- */
function renderFueraDeNorma(){
  const now = new Date();
  const lista = DATA.baches
    .filter(b=>ACTIVE_INDICES.includes(b.etapaIdx))
    .map(b=>{
      const horas = (now - new Date(b.horaInicioEtapa))/3600000;
      const lim = limiteHoras(b.etapaIdx);
      return {b, horas, lim};
    })
    .filter(x=>x.lim!=null && x.horas > x.lim)
    .sort((a,b2)=> (b2.horas-b2.lim) - (a.horas-a.lim));

  const el = document.getElementById('admin-fuera-norma');
  el.innerHTML = lista.length ? lista.map(x=>`
    <div class="lv-history-item">
      <div><span class="tag" style="background:${DENOM[x.b.denom].color}">${DENOM[x.b.denom].label}</span> <span class="mono" style="margin-left:8px;">${x.b.codigo}</span></div>
      <div class="op-meta">${STAGES[x.b.etapaIdx]} · ${x.horas.toFixed(1)} h (límite ${x.lim} h, excede por ${(x.horas-x.lim).toFixed(1)} h)</div>
    </div>`).join('') : '<div class="empty">No hay baches fuera de norma actualmente.</div>';
}

async function liberarBache(codigo){
  const nombre = getAdminNombre();
  const msg = document.getElementById('admin-msg');
  if(!nombre){
    msg.innerHTML = '<div class="msg err">Ingresa el nombre del jefe de producción antes de liberar.</div>';
    return;
  }
  const b = DATA.baches.find(x=>x.codigo===codigo);
  b.liberado = true;
  b.liberadoPor = nombre;
  b.liberadoFecha = new Date().toISOString();
  registrarMovimiento('Producto liberado', `Bache ${codigo}: ${b.peso_final} kg secos`, nombre);
  msg.innerHTML = '';
  await save();
  render();
}

function renderLiberacion(){
  const pendientes = DATA.baches.filter(b=>b.etapaIdx===7 && !b.liberado);
  const el = document.getElementById('admin-liberacion');
  el.innerHTML = pendientes.length ? pendientes.map(b=>`
    <div class="lv-history-item">
      <div><span class="tag" style="background:${DENOM[b.denom].color}">${DENOM[b.denom].label}</span> <span class="mono" style="margin-left:8px;">${b.codigo}</span></div>
      <div class="op-meta">${b.peso_final} kg secos (G1 ${b.peso_g1 ?? '—'}, G2 ${b.peso_g2 ?? '—'})</div>
      <button onclick="liberarBache('${b.codigo}')">Liberar para despacho</button>
    </div>`).join('') : '<div class="empty">No hay baches pendientes de liberación.</div>';
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
  if(seleccionados.length===0) return;

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
  if(usados.length===0) return;

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
  const detalleBultos = usados.map(u=>({codigo:u.b.codigo, bultos:Math.floor(u.kg/69), kg:Math.round(u.kg)}));

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
      return `<div class="lv-pool-item"><input type="checkbox" ${checked?'checked':''} onchange="toggleSeleccionLV('${b.codigo}')"><span class="mono">${b.codigo}</span><span class="op-meta">${disp} kg disponibles (G1 ${b.peso_g1 ?? '—'}, G2 ${b.peso_g2 ?? '—'}) · ${Math.floor(disp/69)} sacos${parcial}</span></div>`;
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
      DATA = Object.assign({baches:[],lotes:[],lvConsecutivo:0,mapaMaestro:DATA.mapaMaestro,maestroConversion:DATA.maestroConversion}, parsed);
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
    aireacion: [{dia:1, hecho:false, hora:null},{dia:2, hecho:false, hora:null}],
    peso_final: pesoFinal!=null ? pesoFinal : null,
    peso_g1: pesoG1 ?? null, peso_g2: pesoG2 ?? null, peso_impurezas: pesoImpurezas ?? null,
    humedadSalida: null,
    liberado: liberado ?? false,
    lvAsignaciones: lv ? [{lv, kg: pesoFinal}] : []
  };
}

async function cargarEjemplo(){
  const c1 = baseBache(daysAgoCodStr(7), 'ccn51', 7, 96, 980, 'B-1001', 850, 'LV-0001', 700, 150, 20, true);
  const c2 = baseBache(daysAgoCodStr(6), 'ccn51', 7, 72, 1030, 'B-1002', 900, 'LV-0001', 750, 150, 25, true);
  const c3 = baseBache(daysAgoCodStr(5), 'aromatico', 7, 48, 890, 'B-1003', 780, null, 650, 130, 15, false);
  const c4 = baseBache(daysAgoCodStr(4), 'upia', 2, 60, 2500, 'B-1004', null, null); // excedido: >48h en F. anaeróbica
  const c5 = baseBache(daysAgoCodStr(3), 'ccn51', 3, 20, 1500, 'B-1005', null, null);
  c5.aireacion[0] = {dia:1, hecho:true, hora:hoursAgoIso(15)};
  const c6 = baseBache(daysAgoCodStr(2), 'aromatico', 4, 5, 3000, 'B-1006', null, null);
  const c7 = baseBache(daysAgoCodStr(1), 'upia', 5, 10, 2000, 'B-1007', null, null);
  const c8 = baseBache(daysAgoCodStr(0), 'ccn51', 0, 3, 1200, 'B-1008', null, null);
  const c9 = baseBache(daysAgoCodStr(0), 'aromatico', 6, 2, 1800, 'B-1009', null, null);
  // 'ccn51' del día 0 ya usado (c8): usamos otra denominación para el noveno ejemplo, sin choque de código.

  DATA.baches = [c1,c2,c3,c4,c5,c6,c7,c8,c9];
  DATA.lotes = [{
    codigo:'LV-0001', denom:'ccn51', baches:[c1.codigo,c2.codigo],
    total_kg: c1.peso_final+c2.peso_final, total_g1: c1.peso_g1+c2.peso_g1, total_g2: c1.peso_g2+c2.peso_g2, total_impurezas: c1.peso_impurezas+c2.peso_impurezas,
    detalleBultos: [
      {codigo:c1.codigo, bultos: Math.floor(c1.peso_final/69), kg:c1.peso_final},
      {codigo:c2.codigo, bultos: Math.floor(c2.peso_final/69), kg:c2.peso_final}
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
  renderFueraDeNorma();
  renderLiberacion();
  renderLotesPool();
  renderMovimientos();
}

inicializarAdminTabs();
document.getElementById('btn-guardar-mapa').addEventListener('click', guardarMapaMaestro);
document.getElementById('btn-guardar-conversion').addEventListener('click', guardarMaestroConversion);
document.getElementById('btn-backup').addEventListener('click', descargarBackup);
document.getElementById('btn-export-baches').addEventListener('click', exportarBachesCSV);
document.getElementById('btn-export-lotes').addEventListener('click', exportarLotesCSV);
document.getElementById('input-restore').addEventListener('change', restaurarBackup);
document.getElementById('btn-ejemplo').addEventListener('click', cargarEjemplo);
document.getElementById('btn-borrar').addEventListener('click', borrarBaches);
document.getElementById('mov-filtro').addEventListener('input', renderMovimientos);

load();
