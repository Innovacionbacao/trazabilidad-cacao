# Trazabilidad PHC — cacao

App de trazabilidad del proceso (recepción → fermentación → secado → empaque →
lote de venta → despacho), con dashboard gerencial y panel de administración.

Misma arquitectura que `mantenimiento-planta`: **GitHub Pages** para las páginas
y un **Worker de Cloudflare + KV** como backend. Las claves son nuevas y
propias de este proyecto — no se reutiliza nada del sistema de mantenimiento.

---

## 1. Estructura

Tres páginas, igual que en mantenimiento, compartiendo el mismo backend:

```
trazabilidad-cacao/
├── index.html          Captura — operarios en tableta (Registro + Operación)
├── panel.html           Panel — jefe de producción (configuración, liberación, lotes de venta, respaldo)
├── tablero.html          Tablero — gerencia (dashboard, proyección, trazabilidad, inventario)
├── style.css
├── logo-bacao.png
├── shared.js            configuración, datos y funciones comunes a las 3 páginas
├── captura.js            lógica de index.html
├── panel.js              lógica de panel.html
├── tablero.js            lógica de tablero.html
└── worker/
    ├── wrangler.toml
    └── src/index.js      backend: GET/POST /datos, GET /salud
```

`shared.js` va cargado **antes** que el script propio de cada página (ya está
así en el `<script>` de cada HTML, no hay que tocarlo). Ahí están `API_BASE` y
`API_KEY` — se editan una sola vez y quedan disponibles en las 3 páginas.

## 2. Desplegar el Worker (una sola vez)

Necesitas Node y Wrangler (`npm install -g wrangler`) y estar logueado
(`wrangler login`). (También se puede hacer todo desde el navegador, sin
instalar nada — ver la conversación donde armamos esto paso a paso si prefieres
esa vía.)

```bash
cd worker
wrangler kv namespace create BACHES
```

Eso imprime un `id`. Pégalo en `wrangler.toml`, en `PEGA_AQUI_EL_ID_DEL_NAMESPACE`.

Define la clave de acceso (invéntate una, no reutilices la de mantenimiento):

```bash
wrangler secret put CLAVE_ACCESO
```

Publica:

```bash
wrangler deploy
```

Te da una URL tipo `https://trazabilidad-cacao.TU-SUBDOMINIO.workers.dev`.
Pruébala: `.../salud?k=LA_CLAVE_QUE_PUSISTE` debe responder `{"ok":true,...}`.

## 3. Conectar las páginas al Worker

Abre **`shared.js`** (uno solo, no hay que repetirlo en cada página) y
reemplaza:

```js
const API_BASE = 'https://trazabilidad-cacao.TU-SUBDOMINIO.workers.dev';
const API_KEY  = 'CAMBIA-ESTA-CLAVE';
```

con la URL real y la clave que pusiste. Si cambias la clave más adelante,
tienes que cambiarla en los dos lados (Worker y `shared.js`) al mismo tiempo.

## 4. Publicar en GitHub Pages

1. Crea el repositorio `innovacionbacao/trazabilidad-cacao`.
2. Sube todos los archivos de la raíz (`index.html`, `panel.html`,
   `tablero.html`, `style.css`, `logo-bacao.png`, `shared.js`, `captura.js`,
   `panel.js`, `tablero.js`). La carpeta `worker/` conviene tenerla en el
   mismo repo para no perder el código del backend, aunque Pages no la usa.
3. Settings → Pages → Branch `main`, carpeta raíz.
4. Quedan en:
   - Captura: `https://innovacionbacao.github.io/trazabilidad-cacao/`
   - Panel: `https://innovacionbacao.github.io/trazabilidad-cacao/panel.html`
   - Tablero: `https://innovacionbacao.github.io/trazabilidad-cacao/tablero.html`

Las 3 páginas tienen enlaces cruzados arriba (Captura · Tablero · Panel) para
moverse entre ellas.

Para actualizar algo: subes el archivo con el mismo nombre y listo. Si no ves
el cambio en el celular, agrega `?v=2` a la dirección (caché).

## 5. Cómo guarda los datos

- Cada cambio hace `POST /datos` con **todo** el estado de la app (baches,
  lotes, configuración) como un único bloque JSON — se sobrescribe completo
  cada vez, no hay registros parciales.
- El Worker además guarda una copia con fecha (`respaldo:AAAA-MM-DD`) cada
  vez que alguien guarda ese día, así queda un historial de versiones por si
  hay que volver atrás.
- Si el celular se queda sin señal, la app guarda igual en `localStorage` de
  ese dispositivo y muestra "⚠ Sin conexión" en el encabezado; al recuperar
  señal hay que reabrir la página para que sincronice (por ahora no reintenta
  solo — es lo primero que conviene mejorar si esto pasa seguido).

## 6. Si algo se rompe

- **La página no carga datos:** revisa `.../salud?k=CLAVE`. Si responde,
  el problema es de `API_BASE`/`API_KEY` en `shared.js` (deben coincidir con
  el Worker). Si no responde, revisa en Cloudflare que el Worker esté
  desplegado y el KV enlazado como `BACHES`.
- **Se perdió el acceso a la cuenta de Cloudflare:** creas un Worker nuevo,
  un KV nuevo, subes de nuevo `worker/src/index.js`, generas una clave nueva,
  y actualizas `shared.js`. Los datos de ese Worker perdido no se recuperan
  salvo que hayas bajado `/respaldo.json` antes.
- **Quieres bajar todo a un archivo:** `.../respaldo.json?k=CLAVE` descarga
  el estado completo, o desde el Panel → Datos → "Descargar backup completo".
  Guárdalo de vez en cuando en OneDrive, igual que hacen con mantenimiento.
- **Los botones no responden / no cambian de pestaña:** revisa la consola del
  navegador (clic derecho → Inspeccionar → Console). Casi siempre es un
  archivo `.js` editado con un programa que cambió comillas rectas por
  curvas (Word, WordPad) — vuelve a editarlo con el Bloc de notas.

## 7. Herramientas de prueba

En Panel → Datos hay dos botones para probar la app sin datos reales:
"Cargar baches de ejemplo" (carga 9 baches en distintas etapas) y "Borrar
todos los baches" (limpia todo). Quítalos cuando la planta empiece a operar
con esto en serio — o simplemente no los uses, no afectan nada más.


## 8. Instalar Captura como app en Android

`index.html` (Captura) ya viene listo para instalarse como app: tiene
`manifest.json`, `sw.js` (funcionamiento básico sin señal) e íconos en
`icons/`. Una vez publicado en GitHub Pages:

1. Abre la dirección de Captura en Chrome, en el celular Android.
2. Chrome muestra un aviso "Agregar Trazabilidad PHC a la pantalla de inicio"
   (o desde el menú ⋮ → "Instalar app" / "Agregar a pantalla de inicio").
3. Queda como un ícono más, se abre en su propia ventana (sin la barra del
   navegador) y recuerda la última pantalla vista aunque se pierda la señal
   un momento.

No hace falta Play Store ni generar un `.apk` — esto es una PWA (Progressive
Web App), el mecanismo estándar para instalar sitios web como si fueran apps
en Android. Si el celular no ofrece la opción de instalar, revisa que la
página se esté sirviendo por `https://` (GitHub Pages ya lo hace) y que
`manifest.json` cargue sin error 404.

Si más adelante quieres lo mismo para `panel.html` o `tablero.html`, se
repite el mismo patrón (su propio manifest e íconos, o comparten los mismos
íconos con otro `start_url`).

## 9. Botón "Instalar app"

Además de que Chrome ofrezca instalar la página solo, agregué un botón
visible **"📲 Instalar app"** junto al campo de Operario en Captura. Aparece
automáticamente cuando el navegador detecta que la página cumple los
requisitos para instalarse (tiene `manifest.json`, `sw.js`, íconos, y se
sirve por `https://`), y al tocarlo dispara el mismo instalador nativo de
Android — un solo toque, sin pasar por el menú ⋮.

Notas:
- Solo funciona en navegadores basados en Chromium (Chrome, Edge, Brave,
  Samsung Internet). En iPhone/iPad no existe este botón — ahí se instala
  manualmente desde Compartir → "Agregar a inicio".
- Si la app ya está instalada, o el usuario ya la descartó antes, el botón no
  aparece — es el navegador quien decide cuándo mostrar el evento, no algo
  que se pueda forzar desde el código.
- Esto sigue sin ser un archivo `.apk` descargable. Si en algún momento
  necesitas eso (por ejemplo para repartirlo por WhatsApp como si fuera un
  instalador), la vía más simple sin programar nada extra es
  [pwabuilder.com](https://www.pwabuilder.com): pegas la URL de Captura y te
  genera un `.apk` firmado a partir del mismo `manifest.json` que ya está
  aquí.

## 10. Ventana inicial de acceso (operario + clave)

Captura ahora pide, antes de mostrar cualquier cosa, quién captura y una
clave de acceso — igual que las tres páginas de mantenimiento. Es una clave
simple, pensada para que nadie entre por accidente, **no para guardar
secretos** (viaja visible en `captura.js`, cualquiera con algo de
conocimiento técnico puede leerla).

Está en `captura.js`, cerca del final:

```js
const CLAVE_ACCESO_PANTALLA = '202699';
```

Cámbiala por la que quieras usar en planta, y avísale al equipo — si cambias
esta clave, quien ya haya entrado antes en su celular no necesita volver a
escribirla (queda recordada en ese dispositivo), pero un dispositivo nuevo sí
la va a pedir.

El nombre del operario y la validez de la clave quedan guardados en el
navegador de ese dispositivo (`localStorage`). Para cambiar de operario sin
cerrar la app, se usa el enlace "cambiar" junto al nombre en la barra
superior.
