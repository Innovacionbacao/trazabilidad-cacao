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

## 11. Cambios de esta ronda

- **Unidades**: la entrada de datos (peso fresco, G1/G2/impurezas, básculas)
  sigue en kilogramos. Todo lo demás (capacidad, dashboard, proyección,
  inventario) se muestra en toneladas con 2 decimales.
- **Confirmación**: mover un bache de etapa o registrar su empaque ahora pide
  confirmar antes de aplicar el cambio.
- **Retroceder etapa**: cada bache activo tiene un botón "↩ Retroceder" para
  devolverlo a la etapa anterior (deshace el último paso de su historial; si
  ya estaba en Almacenado, también deshace el empaque, siempre que no esté
  liberado ni asignado a un lote de venta).
- **Maestro de capacidad**: en Panel → Configuración se edita cuántos bines,
  cajones, presecadoras, secadoras hay y cuánto soporta cada uno, más la
  capacidad total de bodega — ya no son valores fijos en el código.
- **Colores en Operación**: los baches dentro de tiempo se ven en verde, los
  excedidos en rojo (antes el "dentro de tiempo" no tenía color).
- **Barra deslizante**: al mover un bache parcialmente, además del campo
  numérico hay un control deslizante para elegir la cantidad.
- **Filtros de Dashboard por periodo**: reemplacé año/mes por: última semana,
  última quincena, mes calendario actual, últimos 3 meses, último semestre,
  todo el historial, o un rango personalizado (desde/hasta). Los gráficos
  muestran barras diarias si el rango es corto, o mensuales si es largo.
- **Editar cualquier bache**: en Panel → Editar baches se busca por código y
  se puede corregir cualquier campo (fecha, denominación, peso, etapa, grados,
  humedad, liberado). Cada cambio pide confirmación y queda en Movimientos.
- **Claves separadas por página**: Tablero y Panel ahora piden su propia
  clave (distinta a la de Captura), para que un operario no pueda entrar ahí
  aunque conozca la clave de Captura. Búscalas en `tablero.js` y `panel.js`:
  ```js
  inicializarGateSimple('phc-tablero-2026', 'acceso-valido-tablero');
  inicializarGateSimple('phc-panel-2026', 'acceso-valido-panel');
  ```
  Cámbialas por las tuyas antes de repartir el acceso a cada rol.

## 12. Grado 2 e impurezas: inventario común

Antes, el grado 2 y las impurezas quedaban "atados" al bache que los generó,
igual que el grado 1. Ahora no: solo el **grado 1** sigue el circuito formal
de bache → lote de venta → despacho (con su tope de 25 ton, sus sacos, etc.).

El **grado 2** y las **impurezas** se suman automáticamente a un inventario
común apenas se registra el empaque de un bache (en Captura), y desde ahí se
despachan por cantidad libre — sin necesidad de escoger un bache ni un lote
de venta. Está en Tablero → Inventario, al final de la página.

También en Panel → Seguimiento: la lista ahora muestra **todos** los baches
activos (no solo los que exceden el tiempo), con su estado en verde (dentro
de tiempo) o rojo (excedido), para tener visión completa de qué hay en
proceso.

## 13. Despacho de grado 2 / impurezas: ahora lo autoriza el jefe de producción

El despacho del inventario común de grado 2 e impurezas se movió a
**Panel → Lotes de venta** (junto a la generación de lotes), y exige el
nombre del jefe de producción en Identificación, igual que las demás
acciones de esa página.

En **Tablero → Inventario** y en el **Dashboard** el saldo de grado 2 e
impurezas se sigue viendo (de solo lectura) — ahí solo se consulta, no se
despacha.

## 14. Si el inventario de Grado 2 / impurezas te aparece en 0

Esto pasa si tienes baches que se empacaron **antes** de que existiera este
inventario común (sección 12) — sus valores de G2/impurezas quedaron
guardados en cada bache, pero nunca se sumaron al total porque esa lógica no
existía cuando se empacaron.

Solución: Panel → Lotes de venta → botón **"Recalcular desde baches ya
empacados"** (junto al despacho de grado 2). Suma automáticamente lo que
falte, y es seguro presionarlo más de una vez — no duplica, porque marca cada
bache ya sumado.

## 15. Rediseño visual (tema claro tipo tarjetas)

Se cambió el tema oscuro original por uno claro con tarjetas, inspirado en un
diseño de referencia. Solo se tocó `style.css` (colores, tipografía,
bordes/tarjetas) — ningún HTML, ID ni lógica de negocio cambió, así que todo
sigue funcionando igual. Si prefieres el tema oscuro anterior, avisa y se
puede restaurar o dejar ambos como opción.

De paso se corrigió un bug: el filtro "Todo el historial" del Dashboard
arrancaba en el año 2000 fijo, lo que aplastaba las barras del gráfico contra
cientos de meses vacíos. Ahora arranca desde la fecha del primer bache
registrado.

## 16. Cambios de esta ronda (grande)

1. **Pesajes hoy/ayer**: en Captura → Registro, junto a las toneladas recibidas hoy/ayer ahora se muestra también el conteo de pesajes (básculas) de cada día.

2. **Bug corregido**: generar un lote de venta con baches que ya no tenían grado 1 disponible fallaba en silencio (no pasaba nada, sin aviso). Ahora muestra un mensaje de error claro.

3. **Despacho de lotes de venta movido a Panel**: se autoriza desde Panel → Lotes de venta (exige el nombre del jefe de producción, como las demás acciones de Panel). En Tablero → Inventario el lote solo se ve, sin botón de despacho.

4. **Nueva pestaña "Despachos"** en Tablero: lista de lotes ya despachados, con filtro por denominación y rango de fechas, y botón para exportar a CSV.

5. **Empaque rediseñado (bultos + remanente)**: en vez de pesar un "grado 1" suelto, ahora se ingresan los **bultos llenados** (de un peso fijo, configurable en Panel → Configuración → "Peso por bulto de grado 1") y el **remanente resultante** (lo que sobra de un bulto incompleto). Ese remanente se guarda por denominación y se suma automáticamente al siguiente bache de esa misma denominación que se empaque, para consolidarlo en un bulto completo. Se ve (solo lectura) en Tablero → Inventario.

6. **Prueba de corte**: al empacar (liberar a Almacenado) ahora se registra una prueba de corte sobre una muestra de 50 granos: marrones, marrones violeta, violetas, y moho/pizarra. Se calcula el % de moho y el % de (marrones + marrones violeta), y el resultado es automático:
   - **Rechazado** si moho > 2% o (marrones + marrones violeta) < 80%.
   - **Aprobado** en cualquier otro caso.
   Queda guardado en el bache y visible desde Panel → Editar baches.

7. **Proyección del proceso a 7 o 15 días**: en Tablero → Proyección hay un selector de horizonte (7 o 15 días) que aplica tanto a la tabla de saturación por etapa como a la de etapa por bache — útil para planear personal.

8. **Un día adicional en F. aeróbica para Aromático y Upia**: CCN-51 sigue en 48 h (2 días); Aromático y Upia ahora tienen 72 h (3 días) antes de marcar "excedido".

9. **Contador de volteos en vez de aireación día 1/día 2**: como el presecado a veces se satura y el cacao se queda más días en F. aeróbica de los previstos, ya no hay solo dos casillas fijas — hay un botón "↩ Registrar volteo" que se puede usar tantas veces como haga falta mientras el bache esté en esa etapa, con fecha y operario guardados en cada volteo.

Nota: al revertir con "Retroceder etapa" un bache que ya estaba en Almacenado, ahora también se deshacen correctamente el remanente de grado 1, el inventario común de grado 2/impurezas, y la prueba de corte asociados a ese empaque.

## 17. Correcciones sobre la prueba de corte y el error de volteos

- **Prueba de corte movida**: ya no se pide al empacar (Captura → Operación). Ahora se hace en **Panel → Seguimiento**, al momento de liberar el bache para lote de venta — el jefe de producción cuenta los 50 granos justo ahí y el sistema calcula Aprobado/Rechazado. Si da Rechazado, pide una confirmación extra antes de liberar de todas formas.
- **Error "Cannot read properties of undefined (reading 'length')"**: quedó resuelto en la ronda anterior (baches antiguos sin el campo `volteos`); si lo seguías viendo, era porque probabas con un zip anterior a ese arreglo — este ya lo trae.
- **Recordatorio de dónde vive el remanente de grado 1**: `DATA.remanenteG1` (uno por denominación), visible de solo lectura en Tablero → Inventario. Se actualiza automáticamente al empacar, no requiere ninguna acción manual de despacho.

## 18. Cambios de esta ronda

1. **"Lotes de venta generados" quitado de Tablero → Inventario** — ya se ve en Panel (pendientes) y en la pestaña Despachos (despachados), así que aquí sobraba.

2. **Corregido el desborde de la tabla de proyección a 15 días** — ahora tiene scroll horizontal propio (como ya tenía la tabla de capacidad), sin empujar toda la página fuera de la pantalla.

3. **Cacao LOCAL**: nuevo inventario aparte que no pasa por ningún proceso. Se registra la entrada en Captura → Registro (peso + nota opcional), y se despacha desde Panel → Lotes de venta (autorizado por el jefe de producción). Se ve en Tablero → Inventario.

4. **Baches parciales al retroceder**: cuando un bache se divide (traslado parcial, código `-P1`, `-P2`...) y luego se retrocede uno de los pedazos, **no se vuelve a unir automáticamente** con el resto — queda como un bache independiente en la etapa anterior. Lo dejamos así (como preguntaste) porque re-unir automáticamente es riesgoso: cada pedazo pudo haber seguido caminos distintos (diferentes horas, posibles cambios), y forzar la unión podría mezclar mal los pesos o el historial. Si necesitas juntarlos, hazlo manualmente desde Panel → Editar baches.

5. y 6. **Exportación a Excel real** (no CSV) para Despachos (Tablero → Despachos) y para Trazabilidad filtrada (Tablero → Trazabilidad), usando la librería SheetJS incluida directamente en el proyecto (`xlsx.full.min.js`, sin depender de un CDN externo).

7. **Alarma de % de conversión**: al empacar un bache se guarda el % de conversión (seco/fresco), y se muestra resaltado en Trazabilidad, Editar baches y Liberación — verde si está en un rango típico (25%-40%), en color de advertencia si se acerca a los bordes del rango permitido (20%-45%), para tenerlo presente aunque ya haya pasado la validación.

8. **Liberación de producto (Panel → Seguimiento)** ahora muestra la información completa del bache (fecha, peso fresco, básculas, bultos, remanente recibido/resultante, G2, impurezas, % de conversión) además de los campos de la prueba de corte, y agrega un botón "↩ Devolver a Empaque" para corregir un bache liberado por error antes de asignarlo a un lote de venta.

## 19. Correcciones de esta ronda

1. **Inventario (Tablero) ahora muestra todo lo que hay en bodega**, separado en categorías claras: pendiente de liberación, liberado sin asignar a lote, asignado a lote pendiente de despacho, grado 2/impurezas, remanente de grado 1, y cacao LOCAL liberado. Antes se perdía de vista el cacao ya asignado a un lote que aún no se había despachado.

2. **Exportar Trazabilidad**: ahora puedes marcar uno o varios baches con la casilla de cada tarjeta y exportar solo esos (si no marcas ninguno, exporta todo lo que muestran los filtros). El archivo trae el detalle **por etapa** de cada bache: inicio, fin, duración y estado de cada paso — no solo un resumen por bache.

3. **"↩ Devolver a liberación"**: en Panel → Lotes de venta, junto a cada bache liberado disponible para generar un lote, hay un botón para devolverlo a "pendiente de liberación" si algo quedó mal (solo si todavía no tiene nada asignado a un lote de venta).

4. **Remanente de grado 1 ahora se suma automáticamente**: en el empaque ya no se pide "bultos llenados" por separado — se pide el **grado 1 pesado de este bache**, y el sistema suma el remanente pendiente de la misma denominación antes de calcular cuántos bultos completos salen y cuánto sobra. Ya no depende de que alguien haga la suma a mano.

5. **Cacao LOCAL ahora es "fresco" hasta que se libera**: al registrarlo en Captura queda como pendiente de liberación (no aparece en el inventario final). En Panel → Lotes de venta hay una sección para liberarlo (con el total pendiente pre-cargado, editable para liberar solo una parte); solo después de liberado aparece en Tablero → Inventario y puede despacharse.

## 20. Correcciones de esta ronda

1. **Peso por bulto ahora es por denominación**: CCN-51 y Aromático a 69 kg, Upia a 50 kg (editable en Panel → Configuración → Maestro de capacidad, ahora con 3 campos). El número de sacos sigue guardándose en cada bache (`b.bultos`) y se ve en Trazabilidad, Editar baches, Liberación e Inventario.

2. **Cacao LOCAL con etapa de secado**: como el cacao LOCAL entra fresco y también pierde peso al secarse, ahora tiene 3 pasos en vez de 2:
   - **Entra fresco** (Captura) → queda "pendiente de secar".
   - **Se seca** (Panel → Lotes de venta → "Secar cacao LOCAL"): el líder registra cuánto fresco tomó y cuánto pesó ya seco → pasa a "pendiente de liberación".
   - **Se libera** (mismo lugar, sección "Liberar cacao LOCAL"): el jefe de producción libera lo ya seco → recién ahí aparece en Tablero → Inventario, disponible para despacho.
   Este cacao **no se suma** en ningún KPI del Dashboard (fruto fresco ingresado, seco procesado, etc.) — es un inventario totalmente aparte de los baches normales.

3. **Botón "Devolver a liberación" más visible**: en Panel → Lotes de venta, ahora aparece en su propia línea con texto completo, debajo de la información de cada bache liberado (antes era un botón pequeño dentro de la misma fila, fácil de pasar por alto).

4. **Nuevo total en Inventario** ("Total real en bodega") al principio de la pestaña, calculado exactamente igual que el "Ton en bodega ahora" del Dashboard — sirve para comparar directamente. Si veías 41.12 en Dashboard y 41 en Inventario antes, probablemente estabas viendo una cifra distinta (como el remanente, que se muestra en kg con 1 decimal, no en toneladas); con este total nuevo puedes verificar que ambos coinciden exactamente.

## 21. Rediseño aplicado al código real (Tablero y Panel)

Se llevaron los 3 preliminares de diseño (Inventario, Dashboard/Proyección, Panel) al código real:

**Tablero → Dashboard**: el KPI "en bodega ahora" es el destacado (tarjeta oscura). Las 3 secciones repetidas de inventario (en proceso / en bodega / despachado) se reemplazaron por un solo "Flujo de producción" (embudo de 4 pasos: fresco → proceso → bodega → despachado), con el detalle por denominación debajo. El cacao LOCAL y grado 2/impurezas ya no se mezclan aquí — viven solo en Inventario.

**Tablero → Proyección**: la tabla de saturación por etapa ahora es un mapa de calor con **porcentajes de ocupación** (no toneladas), coloreado verde/ámbar/rojo según qué tan llena está cada etapa. La tabla por bache lleva un borde de color por denominación. El gráfico de bodega también usa el mismo semáforo de colores.

**Tablero → Inventario**: hero con el total en bodega + barra de proporciones, embudo (por liberar → liberado → en lote), tarjetas colapsables por estado (toca para expandir), y "otros inventarios" (grado 2, impurezas, remanente, cacao LOCAL) agrupados aparte con tratamiento visual distinto.

**Panel**: pestañas reordenadas — Seguimiento, Despachos productos (antes "Lotes de venta"), Editar baches, Movimientos primero (uso diario); Configuración y Datos al final (uso ocasional), con una barra de identificación fija arriba. Seguimiento muestra primero la cola de liberación (tarjetas colapsables con la prueba de corte) y despliega la lista de tiempo por etapa colapsada, agrupada, con excedidos siempre visibles arriba. Despachos productos separa Grado 2 e Impurezas en tarjetas propias y consolida el ciclo de Cacao LOCAL (secar → liberar → despachar) en una sola tarjeta. Configuración y Datos ahora son listas compactas tipo "ajustes", colapsadas por defecto.

Todo funcionalmente probado de nuevo tras el rediseño (liberar con prueba de corte, generar y despachar lote, despachar grado 2/impurezas, ciclo completo de cacao LOCAL, devolver a liberación) — cero errores de consola en las 3 páginas.

## 22. Corrección: empaque en número de sacos, no en kg

Había quedado mal desde una ronda anterior: pedía el "grado 1 pesado en kg" y calculaba los sacos a partir de eso. Correcto ahora:

- El operario reporta el **número de sacos llenados** (lo que realmente cuenta en planta).
- El **remanente resultante** se pesa aparte y se ingresa directo en kg (no se deriva de ningún cálculo).
- El homólogo en kg (lo que se registra como grado 1 del bache, `peso_g1`/`peso_final`) es simplemente **sacos × peso de bulto de esa denominación** (69 kg para CCN-51/Aromático, 50 kg para Upia).
- El remanente previo de esa denominación se sigue mostrando como referencia antes de ensacar, para que el operario lo mezcle físicamente, pero ya no se suma "por dentro" — el remanente resultante que se guarda es exactamente el que se pesa y se escribe.

## 23. Dos correcciones más sobre empaque y el pool de liberados

1. **Remanentes que se combinan automáticamente en un saco más**: el operario sigue reportando sacos (de este bache) y remanente (pesado aparte, de este bache) — pero ahora, si el remanente que ya estaba guardado de esa denominación **más** el remanente que acaba de reportar alcanzan para un saco completo (o más), el sistema agrega esos sacos extra solos al total del bache, y deja el remanente verdadero (lo que sobra después de formar esos sacos) como el nuevo remanente pendiente. El operario no tiene que hacer esa cuenta — el aviso de confirmación se lo muestra si pasó.

2. **Botón "Devolver" en la misma línea de cada bache** (Panel → Despachos productos → Generar lote de venta), no debajo en su propia fila — como en el diseño original.

## 24. Claves unificadas, nombre al entrar, y Captura al mismo nivel visual

1. **Claves de Tablero y Panel unificadas a `phc2026`** (antes eran distintas: `phc-tablero-2026` y `phc-panel-2026`).

2. **Tablero y Panel ahora piden el nombre junto con la clave**, igual que Captura. En Panel, ese nombre prellena automáticamente el campo "Jefe de producción" (no hay que escribirlo dos veces). En Tablero se ve en la barra superior ("Tablero: nombre — cambiar"), con opción de cambiarlo.

3. **Captura llevada al mismo nivel visual que el resto**: el embudo de "Flujo de inventario" ahora es igual al de Dashboard/Inventario (con scroll), "Capacidad ocupada" muestra el mismo semáforo verde/ámbar/rojo con porcentaje que Proyección, las tarjetas de "excesos de tiempo" usan el mismo estilo que Panel → Seguimiento, cada bache en Operación tiene el borde de color de su denominación, y los formularios de Registro quedaron dentro de tarjetas — antes estaban sueltos. De paso until se corrigió otra referencia a la tipografía huérfana (`Space Grotesk`) que quedaba en el SVG del flujo de Captura.
