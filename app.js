const STAGES = ['Recepción en bines','Despulpado','F. anaeróbica','F. aeróbica','Presecado','Secado','Empaque','Almacenado'];
const DENOM = {
  ccn51:      {label:'CCN-51',    letra:'c', color:'var(--c-ccn51)'},
  aromatico:  {label:'Aromático', letra:'a', color:'var(--c-aromatico)'},
  upia:       {label:'Upia',      letra:'o', color:'var(--c-upia)'}
};
// Índices activos en el proceso (excluye Despulpado, instantáneo y automático)
const ACTIVE_INDICES = [0,2,3,4,5,6];
// Todas las unidades con inventario físico, incluyendo Almacenado
const UNIDADES = [0,2,3,4,5,6,7];

// Capacidad física por etapa: cuántas unidades hay y qué carga soporta cada una
const CAPACIDAD = {
  'Recepción en bines': {unidad:'Bin', total:100, capKg:850},
  'F. anaeróbica':      {unidad:'Cajón anaeróbico', total:64, capKg:2000},
  'F. aeróbica':         {unidad:'Cajón aeróbico', total:200, capKg:720},
  'Presecado':           {unidad:'Presecadora', total:4, capKg:24000},
  'Secado':              {unidad:'Secadora', total:4, capKg:24000}
};
// Área de almacenamiento final: capacidad en toneladas y conversión a m²
const ALMACEN_CAP = { totalTon:200, m2PorTon: 4/6 };
// Factor teórico de conversión fruto fresco -> cacao a almacenado, para proyectar bodega
const FACTOR_CONVERSION = 0.36;

let DATA = {
  baches: [],
  lotes: [],
  lvConsecutivo: 0,
  mapaMaestro: { recepcion:14, anaerobica:48, aerobica:48, presecado:8, secado:18 },
  maestroConversion: { anaerobico:800, presecado:720, secador:600, seco:360 },
  adminNombre: ''
};

let opSeleccionado = null;
let traceSeleccionado = null;
let lvTabActivo = 'ccn51';
let lvSeleccionados = new Set();

function fmtDate(d){ return d.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function fmtDateTime(d){ return d.toLocaleString('es-CO',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}); }
function toLocalInputValue(d){
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function codigoBache(fechaHora, denom){
  const datePart = fechaHora.split('T')[0];
  const [y,m,day] = datePart.split('-');
  return `${y}${m}${day}${DENOM[denom].letra}`;
}
function limiteHoras(idx){
  const mm = DATA.mapaMaestro;
  if(idx===6 || idx===7) return null; // Empaque y Almacenado no manejan exceso de tiempo
  return [mm.recepcion, null, mm.anaerobica, mm.aerobica, mm.presecado, mm.secado, mm.empaque][idx];
}
function pesoRelevante(b){ return b.peso_final!=null ? b.peso_final : b.peso_fresco; }

const MAX_KG_LOTE_VENTA = 25000;

function kgAsignadoLV(b){
  return (b.lvAsignaciones||[]).reduce((s,a)=>s+a.kg,0);
}
function disponibleLV(b){
  return (b.peso_final||0) - kgAsignadoLV(b);
}
function kgDespachado(b){
  return (b.lvAsignaciones||[]).filter(a=>{
    const lote = DATA.lotes.find(l=>l.codigo===a.lv);
    return lote && lote.despacho;
  }).reduce((s,a)=>s+a.kg,0);
}
function kgEnBodegaSinDespachar(b){
  return (b.peso_final||0) - kgDespachado(b);
}
function bacheDespachado(b){
  return b.peso_final!=null && (b.lvAsignaciones||[]).length>0 && kgEnBodegaSinDespachar(b) <= 0;
}
function setDespachados(){
  return new Set(DATA.baches.filter(bacheDespachado).map(b=>b.codigo));
}

function ocupacionLabel(b){
  const cap = CAPACIDAD[STAGES[b.etapaIdx]];
  if(cap){
    return `${pesoRelevante(b).toFixed(0)} kg`;
  }
  if(b.etapaIdx===7){
    const ton = pesoRelevante(b)/1000;
    return `${ton.toFixed(2)} ton (${(ton*ALMACEN_CAP.m2PorTon).toFixed(1)} m²)`;
  }
  return '—';
}

function agregadoEtapa(idx){
  const enEtapa = DATA.baches.filter(b=> b.etapaIdx===idx && (idx!==7 || disponibleLV(b) > 0));
  const count = enEtapa.length;
  const kg = enEtapa.reduce((s,b)=>s+pesoRelevante(b),0);
  const cap = CAPACIDAD[STAGES[idx]];
  let ocupText, pct, excedidoCap;
  if(cap){
    const capKgTotal = cap.total * cap.capKg;
    ocupText = `${(kg/1000).toFixed(1)}/${(capKgTotal/1000).toFixed(1)} ton`;
    pct = Math.min(100,(kg/capKgTotal)*100);
    excedidoCap = kg > capKgTotal;
  } else if(idx===7){
    const ton = kg/1000;
    ocupText = `${ton.toFixed(1)}/${ALMACEN_CAP.totalTon} ton`;
    pct = Math.min(100,(ton/ALMACEN_CAP.totalTon)*100);
    excedidoCap = ton > ALMACEN_CAP.totalTon;
  } else {
    ocupText = `${(kg/1000).toFixed(1)} ton`;
    pct = 0; excedidoCap = false;
  }
  return {count, kg, ocupText, pct, excedidoCap};
}

// ---------- Conexión al backend (Cloudflare Worker + KV) ----------
// Reemplaza estos dos valores después de desplegar el Worker (ver worker/README).
const API_BASE = 'https://trazabilidad-cacao.mgereda.workers.dev';
const API_KEY  = 'B4c@02026

let ultimoGuardadoOk = true;

async function load(){
  try{
    const r = await fetch(`${API_BASE}/datos?k=${encodeURIComponent(API_KEY)}`);
    if(r.ok){
      const parsed = await r.json();
      if(parsed && parsed.baches) DATA = Object.assign(DATA, parsed);
    } else if(r.status !== 404){
      console.warn('No se pudo cargar desde el servidor, código', r.status);
    }
  }catch(e){
    console.warn('Sin conexión al servidor, se usará lo que haya en este dispositivo.', e);
    try{
      const local = localStorage.getItem('trazabilidad-data-respaldo');
      if(local) DATA = Object.assign(DATA, JSON.parse(local));
    }catch(e2){ /* nada guardado localmente tampoco */ }
  }
  render();
}

async function save(){
  // Respaldo local inmediato: nunca se pierde lo que se acaba de hacer, aunque falle la red.
  try{ localStorage.setItem('trazabilidad-data-respaldo', JSON.stringify(DATA)); }catch(e){ /* almacenamiento local lleno o no disponible */ }

  try{
    const r = await fetch(`${API_BASE}/datos?k=${encodeURIComponent(API_KEY)}&confirmar=si`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(DATA)
    });
    ultimoGuardadoOk = r.ok;
    if(!r.ok) console.warn('El servidor rechazó el guardado, código', r.status);
  }catch(e){
    ultimoGuardadoOk = false;
    console.warn('Sin conexión: se guardó solo en este dispositivo, falta sincronizar.', e);
  }
}

/* ---------- TABS ---------- */
document.querySelectorAll('nav.tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
    render();
  });
});

document.querySelectorAll('.admin-tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('admin-'+btn.dataset.admintab).classList.add('active');
  });
});

/* ---------- DATOS DE EJEMPLO ---------- */
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
  opSeleccionado = null;
  await save();
  document.getElementById('ejemplo-msg').innerHTML = '<div class="msg ok">9 baches de ejemplo cargados, incluyendo uno excedido y un lote de venta ya consolidado. Revisa las pestañas Operación, Trazabilidad y Dashboard.</div>';
  render();
}

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

  document.getElementById('resumen-hoy-ayer').innerHTML = `
    <div class="dash-card"><div class="n">${kgHoy}</div><div class="label">kg recibidos hoy (${deHoy.length} bache${deHoy.length===1?'':'s'})</div></div>
    <div class="dash-card"><div class="n">${kgAyer}</div><div class="label">kg recibidos ayer (${deAyer.length} bache${deAyer.length===1?'':'s'})</div></div>
  `;
}

async function registrarBache(){
  const fh = document.getElementById('f-fecha').value;
  const denom = document.getElementById('f-denom').value;
  const peso = parseFloat(document.getElementById('f-peso').value);
  const bascula = document.getElementById('f-bascula').value.trim();
  const directo = document.getElementById('f-directo').checked;
  const msg = document.getElementById('form-msg');
  msg.innerHTML = '';

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
      aireacion: [ {dia:1, hecho:false, hora:null}, {dia:2, hecho:false, hora:null} ],
      peso_final: null, peso_g1: null, peso_g2: null, peso_impurezas: null,
      humedadSalida: null, liberado: false, lvAsignaciones: []
    });
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

function siguienteEtapaVisible(idx){
  const next = idx+1;
  return STAGES[next] === 'Despulpado' ? STAGES[next+1] : STAGES[next];
}

function crearBacheParcial(original, cantidad){
  const base = original.parcialDe || original.codigo;
  const existentes = DATA.baches.filter(x=>x.codigo.startsWith(base+'-P')).length;
  const nuevoCodigo = `${base}-P${existentes+1}`;
  const nuevo = {
    codigo: nuevoCodigo, fecha: original.fecha, denom: original.denom,
    peso_fresco: cantidad,
    basculas: original.basculas,
    etapaIdx: original.etapaIdx,
    horaInicioEtapa: original.horaInicioEtapa,
    historial: JSON.parse(JSON.stringify(original.historial)),
    aireacion: [{dia:1, hecho:false, hora:null},{dia:2, hecho:false, hora:null}],
    peso_final: null, peso_g1: null, peso_g2: null, peso_impurezas: null,
    humedadSalida: null, liberado: false, lvAsignaciones: [],
    parcialDe: base
  };
  DATA.baches.push(nuevo);
  return nuevo;
}

async function avanzarEtapa(codigo){
  const b = DATA.baches.find(x=>x.codigo===codigo);
  const horaInput = document.getElementById('mov-hora-'+codigo);
  const cantInput = document.getElementById('mov-cantidad-'+codigo);
  const horaReal = horaInput.value ? new Date(horaInput.value) : new Date();
  const msgEl = document.getElementById('mov-msg-'+codigo);

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
  const limite = limiteHoras(target.etapaIdx);
  const estado = (limite!=null && duracionHoras > limite) ? 'excedido' : 'ok';

  target.historial.push({
    etapaIdx: target.etapaIdx, etapaNombre: STAGES[target.etapaIdx],
    horaInicio: target.horaInicioEtapa, horaFin: horaReal.toISOString(),
    duracionHoras, estado, limiteHoras: limite, ocupacion: ocupacionLabel(target),
    humedadSalida: target.etapaIdx===5 ? target.humedadSalida : undefined
  });

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
  opSeleccionado = null;
  await save();
  render();
}

async function registrarEmpaque(codigo){
  const b = DATA.baches.find(x=>x.codigo===codigo);
  const g1Input = document.getElementById('mov-g1-'+codigo);
  const g2Input = document.getElementById('mov-g2-'+codigo);
  const impInput = document.getElementById('mov-imp-'+codigo);
  const horaInput = document.getElementById('mov-hora-'+codigo);
  const g1 = parseFloat(g1Input.value) || 0;
  const g2 = parseFloat(g2Input.value) || 0;
  const imp = parseFloat(impInput.value) || 0;
  const horaReal = horaInput.value ? new Date(horaInput.value) : new Date();
  const pesoFinal = g1 + g2;
  const msgEl = document.getElementById('mov-msg-'+codigo);
  if(pesoFinal <= 0) return;

  const factor = pesoFinal / b.peso_fresco;
  if(factor < 0.20 || factor > 0.45){
    const minKg = Math.round(b.peso_fresco * 0.20);
    const maxKg = Math.round(b.peso_fresco * 0.45);
    msgEl.innerHTML = `<div class="msg err">El peso seco total ingresado (${pesoFinal} kg) está fuera del rango esperado para ${b.peso_fresco} kg de fresco: entre ${minKg} kg y ${maxKg} kg. Revisa los pesos.</div>`;
    return;
  }

  const inicio = new Date(b.horaInicioEtapa);
  const duracionHoras = (horaReal - inicio) / 3600000;
  const limite = limiteHoras(b.etapaIdx);
  const estado = (limite!=null && duracionHoras > limite) ? 'excedido' : 'ok';

  b.historial.push({
    etapaIdx: b.etapaIdx, etapaNombre: STAGES[b.etapaIdx],
    horaInicio: b.horaInicioEtapa, horaFin: horaReal.toISOString(),
    duracionHoras, estado, limiteHoras: limite, ocupacion: '—'
  });

  b.peso_g1 = g1;
  b.peso_g2 = g2;
  b.peso_impurezas = imp;
  b.peso_final = pesoFinal;
  b.etapaIdx = 7;
  b.liberado = false;
  b.horaInicioEtapa = horaReal.toISOString();
  opSeleccionado = null;
  await save();
  render();
}

async function toggleAireacion(codigo, dia){
  const b = DATA.baches.find(x=>x.codigo===codigo);
  const item = b.aireacion.find(a=>a.dia===dia);
  item.hecho = !item.hecho;
  item.hora = item.hecho ? new Date().toISOString() : null;
  await save();
  render();
}

async function eliminarBache(codigo){
  DATA.baches = DATA.baches.filter(b=>b.codigo!==codigo);
  await save();
  render();
}

function infoPesoBache(b){
  if(b.etapaIdx===7) return ocupacionLabel(b);
  const proySeco = b.peso_fresco * FACTOR_CONVERSION;
  return `Fresco ${b.peso_fresco.toFixed(0)} kg · Proy. seco ${proySeco.toFixed(0)} kg`;
}

function renderOpCard(b){
  const denomInfo = DENOM[b.denom];
  const now = new Date();
  const inicio = new Date(b.horaInicioEtapa);
  const horas = (now - inicio)/3600000;
  const limite = limiteHoras(b.etapaIdx);
  const excedido = limite!=null && horas > limite;
  const durClass = excedido ? 'excedido' : 'ok';
  const durTxt = horas < 24 ? `${horas.toFixed(1)} h en etapa` : `${(horas/24).toFixed(1)} d en etapa`;
  const limTxt = limite!=null ? ` (límite ${limite} h)` : '';

  let accion = '';
  if(opSeleccionado === b.codigo){
    if(b.etapaIdx === 3){
      accion += `
        <div class="aireacion-btns">
          ${b.aireacion.map(a=>`<button class="${a.hecho?'done secondary':'secondary'}" onclick="event.stopPropagation(); toggleAireacion('${b.codigo}', ${a.dia})">
            Aireación día ${a.dia} ${a.hecho ? '✓' : ''}
          </button>`).join('')}
        </div>`;
    }
    if(b.etapaIdx === 6){
      const minKg = Math.round(b.peso_fresco * 0.20);
      const maxKg = Math.round(b.peso_fresco * 0.45);
      accion += `
        <div class="op-action" onclick="event.stopPropagation()">
          <div class="op-preview">Peso fresco: <b>${b.peso_fresco} kg</b> · Rango esperado de peso seco total (G1+G2): <b>${minKg} kg – ${maxKg} kg</b></div>
          <div class="row">
            <div class="field"><label>Ensacado grado 1 (kg)</label><input type="number" id="mov-g1-${b.codigo}" min="0" step="0.1"></div>
            <div class="field"><label>Ensacado grado 2 (kg)</label><input type="number" id="mov-g2-${b.codigo}" min="0" step="0.1"></div>
            <div class="field"><label>Impurezas / grado 3 (kg)</label><input type="number" id="mov-imp-${b.codigo}" min="0" step="0.1"></div>
            <div class="field"><label>Fecha y hora real</label><input type="datetime-local" id="mov-hora-${b.codigo}" value="${toLocalInputValue(new Date())}"></div>
          </div>
          <div id="mov-msg-${b.codigo}"></div>
          <button class="big" onclick="registrarEmpaque('${b.codigo}')">Registrar empaque</button>
        </div>`;
    } else {
      const siguiente = siguienteEtapaVisible(b.etapaIdx);
      const capSig = CAPACIDAD[siguiente];
      const preview = capSig
        ? `Aportará <b>${pesoRelevante(b).toFixed(0)} kg</b> a ${siguiente} (o la cantidad parcial que indiques).`
        : (siguiente==='Almacenado' ? `Ocupará bodega al empacar (aún sin peso seco).` : '');
      const humedadField = b.etapaIdx===5
        ? `<div class="field"><label>Humedad de salida (%)</label><input type="number" id="mov-humedad-${b.codigo}" min="0" max="100" step="0.1"></div>`
        : '';
      accion += `
        <div class="op-action" onclick="event.stopPropagation()">
          <div class="row">
            <div class="field"><label>Cantidad a mover (kg, máx ${b.peso_fresco})</label><input type="number" id="mov-cantidad-${b.codigo}" min="0" max="${b.peso_fresco}" step="0.1" value="${b.peso_fresco}"></div>
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

const TIME_UNIDADES = [0,2,3,4,5]; // Empaque y Almacenado no manejan exceso de tiempo

function renderOpDashGrid(){
  const grid = document.getElementById('op-dash-grid');
  const now = new Date();
  let html = '';
  for(const idx of TIME_UNIDADES){
    const enEtapa = DATA.baches.filter(b=>b.etapaIdx===idx);
    let excedidos = [];
    enEtapa.forEach(b=>{
      const horas = (now - new Date(b.horaInicioEtapa))/3600000;
      const lim = limiteHoras(idx);
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

/* ---------- DASHBOARD ---------- */
const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function poblarFiltroAnio(){
  const sel = document.getElementById('dash-anio');
  const years = [...new Set(DATA.baches.map(b=>b.fecha.slice(0,4)))].sort().reverse();
  const actual = sel.value;
  sel.innerHTML = '<option value="todos">Todos (últimos 14 días)</option>' + years.map(y=>`<option value="${y}">${y}</option>`).join('');
  sel.value = years.includes(actual) ? actual : 'todos';
}

function filtrarPorPeriodo(baches, anio, mes){
  return baches.filter(b=>{
    if(anio==='todos') return true;
    const [y,m] = b.fecha.split('-');
    if(y!==anio) return false;
    if(mes==='todos') return true;
    return m===mes;
  });
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

function fechaEmpaque(b){
  const h = (b.historial||[]).find(x=>x.etapaNombre==='Empaque');
  return h ? h.horaFin.slice(0,10) : null;
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

function factorEquivalenteSeco(idx){
  const mc = DATA.maestroConversion;
  const map = {0:1000, 2:mc.anaerobico, 3:mc.anaerobico, 4:mc.presecado, 5:mc.secador, 6:mc.secador};
  return map[idx] ?? 1000;
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

function renderMapaMaestroForm(){
  document.getElementById('mm-recepcion').value = DATA.mapaMaestro.recepcion;
  document.getElementById('mm-anaerobica').value = DATA.mapaMaestro.anaerobica;
  document.getElementById('mm-aerobica').value = DATA.mapaMaestro.aerobica;
  document.getElementById('mm-presecado').value = DATA.mapaMaestro.presecado;
  document.getElementById('mm-secado').value = DATA.mapaMaestro.secado;
}
async function guardarMapaMaestro(){
  DATA.mapaMaestro = {
    recepcion: parseFloat(document.getElementById('mm-recepcion').value) || 0,
    anaerobica: parseFloat(document.getElementById('mm-anaerobica').value) || 0,
    aerobica: parseFloat(document.getElementById('mm-aerobica').value) || 0,
    presecado: parseFloat(document.getElementById('mm-presecado').value) || 0,
    secado: parseFloat(document.getElementById('mm-secado').value) || 0
  };
  await save();
  render();
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

function renderMaestroConversionForm(){
  document.getElementById('mc-anaerobico').value = DATA.maestroConversion.anaerobico;
  document.getElementById('mc-presecado').value = DATA.maestroConversion.presecado;
  document.getElementById('mc-secador').value = DATA.maestroConversion.secador;
  document.getElementById('mc-seco').value = DATA.maestroConversion.seco;
}
async function guardarMaestroConversion(){
  DATA.maestroConversion = {
    anaerobico: parseFloat(document.getElementById('mc-anaerobico').value) || 0,
    presecado: parseFloat(document.getElementById('mc-presecado').value) || 0,
    secador: parseFloat(document.getElementById('mc-secador').value) || 0,
    seco: parseFloat(document.getElementById('mc-seco').value) || 0
  };
  await save();
  render();
}

function getAdminNombre(){ return document.getElementById('admin-nombre').value.trim(); }

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

async function borrarBaches(){
  DATA.baches = [];
  DATA.lotes = [];
  DATA.lvConsecutivo = 0;
  opSeleccionado = null;
  traceSeleccionado = null;
  lvSeleccionados.clear();
  await save();
  document.getElementById('ejemplo-msg').innerHTML = '<div class="msg ok">Todos los baches y lotes fueron borrados.</div>';
  render();
}

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
  msg.innerHTML = huboExcedente
    ? `<div class="msg ok">Lote ${codigo} generado por ${nombre} con ${(totalKg/1000).toFixed(2)} ton (tope 25 ton). El excedente queda disponible para un próximo lote.</div>`
    : `<div class="msg ok">Lote ${codigo} generado por ${nombre} con ${(totalKg/1000).toFixed(2)} ton.</div>`;
  await save();
  render();
}
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

function descargarArchivo(nombre, contenido, tipo){
  const blob = new Blob([contenido], {type: tipo});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function descargarBackup(){
  const fecha = new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  descargarArchivo(`backup-trazabilidad-${fecha}.json`, JSON.stringify(DATA, null, 2), 'application/json');
  document.getElementById('backup-msg').innerHTML = '<div class="msg ok">Backup descargado.</div>';
}

function csvEscape(v){
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

function exportarBachesCSV(){
  const cols = ['codigo','fecha','denom','etapaIdx','etapaNombre','peso_fresco','basculas','peso_final','peso_g1','peso_g2','peso_impurezas','humedadSalida','liberado','lvAsignaciones'];
  const filas = DATA.baches.map(b=>[
    b.codigo, b.fecha, b.denom, b.etapaIdx, STAGES[b.etapaIdx], b.peso_fresco,
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
function render(){
  document.getElementById('fecha-hoy').textContent = fmtDate(new Date());
  document.getElementById('sync-status').textContent = ultimoGuardadoOk ? '' : '⚠ Sin conexión — guardado solo en este dispositivo';
  updateCodigoPreview();
  renderResumenHoyAyer();
  renderFlujo();
  renderCapTable();
  renderOpDashGrid();
  renderOpList();
  renderTrazabilidad();
  poblarFiltroAnio();
  renderProcesadoChart();
  renderProcesadoSecoChart();
  renderDenomDonut();
  renderInventarioProceso();
  renderDashboardKPIs();
  renderMapaMaestroForm();
  renderMaestroConversionForm();
  renderFueraDeNorma();
  renderLiberacion();
  renderInventarioEmpacado();
  renderLotesPool();
  renderProyeccionCapacidad();
  renderProyeccion();
  renderProyeccionBodega();
  renderLotesHistorial();
}

document.getElementById('f-fecha').addEventListener('input', updateCodigoPreview);
document.getElementById('f-denom').addEventListener('change', updateCodigoPreview);
document.getElementById('f-peso').addEventListener('input', updateCodigoPreview);
document.getElementById('f-directo').addEventListener('change', updateCodigoPreview);
document.getElementById('btn-registrar').addEventListener('click', registrarBache);
document.getElementById('btn-ejemplo').addEventListener('click', cargarEjemplo);
document.getElementById('btn-borrar').addEventListener('click', borrarBaches);
document.getElementById('btn-guardar-mapa').addEventListener('click', guardarMapaMaestro);
document.getElementById('trace-f-denom').addEventListener('change', render);
document.getElementById('trace-f-desde').addEventListener('change', render);
document.getElementById('trace-f-hasta').addEventListener('change', render);
document.getElementById('trace-f-area').addEventListener('change', render);
document.getElementById('trace-f-despachados').addEventListener('change', render);
document.getElementById('dash-anio').addEventListener('change', render);
document.getElementById('dash-mes').addEventListener('change', render);
document.getElementById('dash-denom').addEventListener('change', render);
document.getElementById('btn-guardar-conversion').addEventListener('click', guardarMaestroConversion);
document.getElementById('btn-export-dashboard-csv').addEventListener('click', exportarDashboardCSV);
document.getElementById('btn-print-dashboard').addEventListener('click', imprimirDashboard);
document.getElementById('btn-backup').addEventListener('click', descargarBackup);
document.getElementById('btn-export-baches').addEventListener('click', exportarBachesCSV);
document.getElementById('btn-export-lotes').addEventListener('click', exportarLotesCSV);
document.getElementById('input-restore').addEventListener('change', restaurarBackup);
document.getElementById('f-fecha').value = toLocalInputValue(new Date());

load();
