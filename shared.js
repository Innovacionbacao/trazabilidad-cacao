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

// Capacidad física por etapa y de bodega: vive en DATA.capacidadMaestro para
// que se pueda editar desde Panel → Configuración cuando aumente la planta.
function capacidadDe(stageName){
  return (DATA.capacidadMaestro && DATA.capacidadMaestro.porEtapa[stageName]) || null;
}
// Área de almacenamiento final: capacidad en toneladas y conversión a m²
// Factor teórico de conversión fruto fresco -> cacao a almacenado, para proyectar bodega.
// Para "cacao seco equivalente" en el Tablero se usa SIEMPRE el factor final
// (seco), sin importar la etapa: interesa cuánto va a rendir al final, no el
// peso a mitad de proceso.
function factorConversionActual(){ return (DATA.maestroConversion.seco || 360) / 1000; }

// Esta sí varía por etapa: sirve para VER la merma esperada en cada etapa
// (Panel → Configuración), no para el cálculo de inventario del Tablero.
function factorEquivalenteSeco(idx){
  const mc = DATA.maestroConversion;
  const map = {0:1000, 2:mc.anaerobica, 3:mc.aerobica, 4:mc.presecado, 5:mc.secado, 6:mc.seco};
  return map[idx] ?? 1000;
}

const MAX_KG_LOTE_VENTA = 25000;

const MESES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

let DATA = {
  baches: [],
  lotes: [],
  lvConsecutivo: 0,
  mapaMaestro: { recepcion:14, anaerobica:48, aerobica:48, presecado:8, secado:18 },
  maestroConversion: { anaerobica:800, aerobica:720, presecado:640, secado:520, seco:360 },
  capacidadMaestro: {
    porEtapa: {
      'Recepción en bines': {unidad:'Bin', total:100, capKg:850},
      'F. anaeróbica':      {unidad:'Cajón anaeróbico', total:64, capKg:2000},
      'F. aeróbica':         {unidad:'Cajón aeróbico', total:200, capKg:720},
      'Presecado':           {unidad:'Presecadora', total:4, capKg:24000},
      'Secado':              {unidad:'Secadora', total:4, capKg:24000}
    },
    almacenTotalTon: 200,
    almacenM2PorTon: 4/6
  },
  // Grado 2 e impurezas: se acumulan en bodega como un inventario común, sin
  // necesidad de rastrear de qué bache o lote de venta salieron. Se despachan
  // por cantidad, no por bache.
  inventarioSecundario: { grado2: 0, impurezas: 0 },
  // Peso de un bulto/saco de grado 1 (kg). Al empacar, solo se llenan bultos
  // completos; lo que sobra de un bulto incompleto se guarda aquí por
  // denominación y se suma al siguiente bache que se empaque de esa misma
  // denominación, para consolidarlo en un bulto completo.
  pesoBulto: 69,
  remanenteG1: { ccn51: 0, aromatico: 0, upia: 0 },
  // Cacao LOCAL: entra directo al inventario final, sin pasar por ningún
  // proceso (recepción, fermentación, secado, etc.). Es un inventario aparte.
  cacaoLocal: { total: 0, movimientos: [] },
  movimientos: [],
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

function limiteHoras(idx, denom){
  const mm = DATA.mapaMaestro;
  if(idx===6 || idx===7) return null; // Empaque y Almacenado no manejan exceso de tiempo
  if(idx===3 && (denom==='aromatico' || denom==='upia')){
    return mm.aerobica + 24; // Aromático y Upia: un día adicional en F. aeróbica
  }
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

// Para mostrar en pantalla: "Almacenado" es solo mientras el producto sigue
// físicamente en bodega. En cuanto ya salió por completo en un lote de venta
// despachado, se muestra como "Despachado" — son estados distintos aunque el
// etapaIdx interno (7) sea el mismo, porque el bache ya no ocupa inventario.
function etapaMostrada(b){
  return bacheDespachado(b) ? 'Despachado' : STAGES[b.etapaIdx];
}

function setDespachados(){
  return new Set(DATA.baches.filter(bacheDespachado).map(b=>b.codigo));
}

function ocupacionLabel(b){
  const cap = capacidadDe(STAGES[b.etapaIdx]);
  if(cap){
    return `${(pesoRelevante(b)/1000).toFixed(2)} ton`;
  }
  if(b.etapaIdx===7){
    const ton = pesoRelevante(b)/1000;
    return `${ton.toFixed(2)} ton (${(ton*DATA.capacidadMaestro.almacenM2PorTon).toFixed(1)} m²)`;
  }
  return '—';
}

function agregadoEtapa(idx){
  const enEtapa = DATA.baches.filter(b=> b.etapaIdx===idx && (idx!==7 || disponibleLV(b) > 0));
  const count = enEtapa.length;
  const kg = enEtapa.reduce((s,b)=>s+pesoRelevante(b),0);
  const cap = capacidadDe(STAGES[idx]);
  let ocupText, pct, excedidoCap;
  if(cap){
    const capKgTotal = cap.total * cap.capKg;
    ocupText = `${(kg/1000).toFixed(2)}/${(capKgTotal/1000).toFixed(2)} ton`;
    pct = Math.min(100,(kg/capKgTotal)*100);
    excedidoCap = kg > capKgTotal;
  } else if(idx===7){
    const ton = kg/1000;
    ocupText = `${ton.toFixed(2)}/${DATA.capacidadMaestro.almacenTotalTon} ton`;
    pct = Math.min(100,(ton/DATA.capacidadMaestro.almacenTotalTon)*100);
    excedidoCap = ton > DATA.capacidadMaestro.almacenTotalTon;
  } else {
    ocupText = `${(kg/1000).toFixed(2)} ton`;
    pct = 0; excedidoCap = false;
  }
  return {count, kg, ocupText, pct, excedidoCap};
}

// ---------- Conexión al backend (Cloudflare Worker + KV) ----------
// Reemplaza estos dos valores después de desplegar el Worker (ver worker/README).

function infoPesoBache(b){
  if(b.etapaIdx===7) return ocupacionLabel(b);
  const proySeco = b.peso_fresco * factorConversionActual();
  return `Fresco ${(b.peso_fresco/1000).toFixed(2)} ton · Proy. seco ${(proySeco/1000).toFixed(2)} ton`;
}

function registrarMovimiento(accion, detalle, usuario){
  if(!DATA.movimientos) DATA.movimientos = [];
  DATA.movimientos.unshift({
    fecha: new Date().toISOString(),
    accion, detalle,
    usuario: (usuario || '').trim() || '—'
  });
  if(DATA.movimientos.length > 500) DATA.movimientos.length = 500;
}

function siguienteEtapaVisible(idx){
  const next = idx+1;
  return STAGES[next] === 'Despulpado' ? STAGES[next+1] : STAGES[next];
}

function fechaEmpaque(b){
  const h = (b.historial||[]).find(x=>x.etapaNombre==='Empaque');
  return h ? h.horaFin.slice(0,10) : null;
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

// Exporta un arreglo de arreglos (filas) a un archivo .xlsx real usando SheetJS
// (cargado por <script> en la página). encabezados es la primera fila.
function descargarExcel(nombreArchivo, nombreHoja, encabezados, filas){
  if(typeof XLSX === 'undefined'){
    alert('No se pudo cargar el generador de Excel (sin conexión a internet). Intenta de nuevo cuando tengas señal.');
    return;
  }
  const datos = [encabezados, ...filas];
  const hoja = XLSX.utils.aoa_to_sheet(datos);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, nombreHoja.slice(0,31));
  XLSX.writeFile(libro, nombreArchivo);
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
    volteos: [],
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

function inicializarGateSimple(clave, storageKey){
  const overlay = document.getElementById('gate-overlay');
  const claveInput = document.getElementById('gate-clave');
  const msg = document.getElementById('gate-msg');
  const btn = document.getElementById('gate-btn');

  function verificar(){
    let ok = false;
    try{ ok = localStorage.getItem(storageKey) === 'si'; }catch(e){ /* sin localStorage */ }
    if(ok){ overlay.style.display = 'none'; }
    else{ overlay.style.display = 'flex'; claveInput.focus(); }
  }

  btn.addEventListener('click', ()=>{
    if(claveInput.value.trim() !== clave){
      msg.innerHTML = '<div class="msg err">Clave incorrecta.</div>';
      return;
    }
    try{ localStorage.setItem(storageKey, 'si'); }catch(e){ /* sin localStorage: pedirá clave cada vez */ }
    overlay.style.display = 'none';
  });
  claveInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') btn.click(); });

  verificar();
}

function fechaISOLocal(d){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function calcularRangoPeriodo(){
  const periodo = document.getElementById('dash-periodo').value;
  const hoy = new Date();
  let desde;

  if(periodo === 'semana'){
    desde = new Date(hoy); desde.setDate(desde.getDate()-6);
  } else if(periodo === 'quincena'){
    desde = new Date(hoy); desde.setDate(desde.getDate()-14);
  } else if(periodo === 'mes_calendario'){
    desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  } else if(periodo === 'trimestre'){
    desde = new Date(hoy); desde.setDate(desde.getDate()-89);
  } else if(periodo === 'semestre'){
    desde = new Date(hoy); desde.setDate(desde.getDate()-179);
  } else if(periodo === 'todo'){
    const fechas = DATA.baches.map(b=>b.fecha).filter(Boolean).sort();
    desde = fechas.length ? new Date(fechas[0]+'T00:00:00') : new Date(hoy);
  } else if(periodo === 'personalizado'){
    const d = document.getElementById('dash-desde').value;
    const h = document.getElementById('dash-hasta').value;
    const fechasTodas = DATA.baches.map(b=>b.fecha).filter(Boolean).sort();
    return {
      desde: d || (fechasTodas.length ? fechasTodas[0] : fechaISOLocal(hoy)),
      hasta: h || fechaISOLocal(hoy)
    };
  } else {
    desde = new Date(hoy); desde.setDate(desde.getDate()-6);
  }
  return { desde: fechaISOLocal(desde), hasta: fechaISOLocal(hoy) };
}

function filtrarPorRango(baches, rango){
  return baches.filter(b => b.fecha >= rango.desde && b.fecha <= rango.hasta);
}

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
