/* =========================================================
   shared.js — configuración, datos y funciones comunes a las 3 páginas
   (captura.html, tablero.html, panel.html). Cárgalo ANTES que cada
   archivo de página en el <script>.
   ========================================================= */

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

const TIME_UNIDADES = [0,2,3,4,5]; // Empaque y Almacenado no manejan exceso de tiempo

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

const MAX_KG_LOTE_VENTA = 25000;

const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

let DATA = {
  baches: [],
  lotes: [],
  lvConsecutivo: 0,
  mapaMaestro: { recepcion:14, anaerobica:48, aerobica:48, presecado:8, secado:18 },
  maestroConversion: { anaerobico:800, presecado:720, secador:600, seco:360 },
  adminNombre: ''
};

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

function factorEquivalenteSeco(idx){
  const mc = DATA.maestroConversion;
  const map = {0:1000, 2:mc.anaerobico, 3:mc.anaerobico, 4:mc.presecado, 5:mc.secador, 6:mc.secador};
  return map[idx] ?? 1000;
}

function infoPesoBache(b){
  if(b.etapaIdx===7) return ocupacionLabel(b);
  const proySeco = b.peso_fresco * FACTOR_CONVERSION;
  return `Fresco ${b.peso_fresco.toFixed(0)} kg · Proy. seco ${proySeco.toFixed(0)} kg`;
}

function siguienteEtapaVisible(idx){
  const next = idx+1;
  return STAGES[next] === 'Despulpado' ? STAGES[next+1] : STAGES[next];
}

function fechaEmpaque(b){
  const h = (b.historial||[]).find(x=>x.etapaNombre==='Empaque');
  return h ? h.horaFin.slice(0,10) : null;
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

function csvEscape(v){
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}

function descargarArchivo(nombre, contenido, tipo){
  const blob = new Blob([contenido], {type: tipo});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

function getAdminNombre(){ return document.getElementById('admin-nombre').value.trim(); }

/* ---------- Conexión al backend (Cloudflare Worker + KV) ---------- */
// Reemplaza estos dos valores después de desplegar el Worker (ver worker/README).
const API_BASE = 'https://trazabilidad-bacao.mgereda.workers.dev';
const API_KEY  = 'B4c@02026';

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

/* ---------- Navegación por pestañas (dentro de una misma página) ---------- */
function inicializarTabs(){
  document.querySelectorAll('nav.tabs button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('nav.tabs button').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
      render();
    });
  });
}

function actualizarEncabezado(){
  document.getElementById('fecha-hoy').textContent = fmtDate(new Date());
  document.getElementById('sync-status').textContent = ultimoGuardadoOk ? '' : '⚠ Sin conexión — guardado solo en este dispositivo';
}
