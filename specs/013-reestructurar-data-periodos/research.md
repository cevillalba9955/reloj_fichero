# Research: Reestructurar Almacenamiento por Período

Fase 0 del plan. No quedan `NEEDS CLARIFICATION` en el Technical Context — esta
feature reorganiza un almacenamiento ya existente (004/010/012) sin cambiar de
stack ni de nivel de persistencia (Principio VI). Este documento registra las
decisiones de diseño específicas.

## 1. Layout de carpetas y nombres de archivo

**Decisión**: `<repoDir>/P<periodo>/` (por ejemplo `data/presentismo/P202608/`) con
tres archivos de nombre fijo dentro: `calendario.json`, `fichadas.json`,
`padron.json`. Un helper puro nuevo, `periodo-storage.js`, centraliza
`rutaCarpetaPeriodo(repoDir, periodo)` y los tres nombres, para que ningún
adaptador construya la ruta a mano ni pueda desalinearse del layout.

**Rationale**: el pedido es explícito en el nombre de carpeta (`PYYYYMM`) y en los
tres archivos. Centralizar la construcción de rutas en un único módulo puro (sin
I/O) permite testear la convención de nombres una sola vez y reutilizarla desde los
tres adaptadores (calendario, fichadas, padrón) y desde el CLI, sin duplicar lógica
de `path.join`.

**Alternatives considered**: mantener `fichadas/` como subcarpeta aparte dentro de
`P<periodo>/` — descartado: el pedido es un archivo (`fichadas.json`), no una
subcarpeta, y no hay más de un archivo de fichadas por período que justifique una
subcarpeta.

## 2. `calendario.json` sigue siendo el mismo "estado operativo" de hoy

**Decisión**: `calendario.json` conserva exactamente la forma que hoy tiene
`<periodo>.json` (`{ calendario, correcciones, pausas, justificaciones }`, feature
004/012), con el agregado del indicador `cerrado` (ver §3) dentro del propio
`calendario`. No se separan correcciones/pausas/justificaciones a archivos propios.

**Rationale**: el pedido del usuario nombra tres archivos (`calendario.json`,
`fichadas.json`, `padron.json`), no cinco; separar correcciones/pausas/
justificaciones sería inventar alcance no pedido y complicaría la escritura atómica
que ya garantiza `file-presentismo-repository.js` (un `write` por período). Mantener
el bulto actual bajo el nombre `calendario.json` es el cambio de menor superficie
que cumple el pedido.

**Alternatives considered**: un archivo por tipo de estado — descartado por
alcance no pedido y por multiplicar los puntos de escritura atómica sin necesidad.

## 3. Dónde vive el indicador "cerrado" y cómo se audita

**Decisión**: `cerrado: boolean` (default `false`) y `cierre: { autor, fechaHora } |
null` viven dentro del objeto `calendario` (mismo nivel que `periodo`,
`esquemaSemanal`, `dias`). Dos funciones puras nuevas en `calendario-mes.js`:
`cerrarCalendario(calendario, autor)` y `reabrirCalendario(calendario, autor)`,
mismo patrón inmutable que `reclasificarDia` (devuelven un calendario nuevo). El
repositorio no necesita métodos nuevos: `cerrar`/`reabrir` son, para el
repositorio, un `guardarCalendario` más (igual que una reclasificación).

**Rationale**: reutiliza exactamente el mismo mecanismo de persistencia y de
auditoría que ya existe para reclasificar un día, sin agregar un nuevo tipo de
registro (a diferencia de Corrección Manual/Justificación, que sí son entidades
separadas porque conviven varias vigentes en el tiempo). Un calendario solo tiene
un estado de cierre a la vez, así que no hace falta una lista con "vigente".

**Alternatives considered**: modelar el cierre como una entidad de auditoría
separada (lista de eventos cerrar/reabrir, como Corrección Manual) — descartado por
sobre-ingeniería: alcanza con el estado actual (`cerrado`, `cierre`) más el log
NDJSON (Principio V) para la traza histórica de quién/cuándo, sin necesitar una
colección propia.

## 4. Punto único de bloqueo para las escrituras sobre un período cerrado

**Decisión**: una función pura `exigirPeriodoAbierto(calendario)` (en
`calendario-mes.js`, junto a `cerrarCalendario`) que lanza si
`calendario.cerrado === true`. El **servicio** (`calcular-presentismo-service.js`)
la invoca al principio de cada operación de escritura sobre un período:
`reclasificarDiaMes`, `cargarCorreccion`/`revertirCorreccion`,
`cargarPausa`/`cargarRetiroAnticipado`/`revertirPausa`,
`cargarJustificacion`/`revertirJustificacion`. Para la incorporación de fichadas
—que hoy NO pasa por el servicio (el CLI `importar-fichadas` y el consumidor del
scheduler llaman directo a `file-fichadas-archive.js`)— se agrega la misma guarda
en esos dos puntos de entrada (cargan el calendario vía el repositorio antes de
escribir fichadas).

**Rationale**: un único predicado puro reutilizado desde todos los puntos de
escritura evita que una vía nueva se cuele sin el chequeo (igual razonamiento que
"defensa en profundidad" ya aplicado en `presentismo-repo-ops.js` para el motivo de
una corrección). Ponerlo en el servicio (no en el repositorio) porque el
repositorio no conoce las reglas de negocio de qué es una "escritura sobre el
período"; el repositorio solo persiste.

**Alternatives considered**: chequear `cerrado` dentro de cada adaptador de
persistencia (`file-presentismo-repository.js`) — descartado: el repositorio no
debería tomar decisiones de negocio (mismo criterio arquitectónico que ya separa
dominio de adaptadores en 004); además el archivo de fichadas ni siquiera pasa por
ese repositorio.

## 5. Resolución dinámica de "mes en curso" para el padrón (proceso de larga vida)

**Decisión**: `file-padron-category-provider.js` y
`local-file-active-employees-provider.js` dejan de recibir un `filePath` fijo:
reciben `{ repoDir }` y, en cada llamada (`obtenerCategoria`, `listar`,
`getActiveEmployees`), resuelven `rutaCarpetaPeriodo(repoDir, mesActualPeriodo())`
con el reloj real de ese instante (`now = () => new Date()`, inyectable para
tests). El caché interno de `file-padron-category-provider.js` se re-clave por
período (`Map<periodo, mapaEmpleados>`) en vez de una única variable `cache`
eterna, así un proceso que sigue corriendo cuando cambia el mes relee el padrón del
mes nuevo en la primera llamada de ese mes, sin reinicio.

**Rationale**: `crearContextoWeb` arma sus proveedores una sola vez al arrancar el
servidor (`src/web/wiring.js`); un `filePath` fijo calculado en ese momento nunca
volvería a apuntar al período correcto una vez que cambia el mes (violaría FR-004
del spec — "apunta a la carpeta del mes en curso al actualizar el padrón"). Mover
la resolución de ruta adentro del adaptador, evaluada por llamada, es el cambio
mínimo que lo corrige sin reestructurar el ciclo de vida del servidor.

**Alternatives considered**: recrear los proveedores en `wiring.js` con un timer
que detecte el cambio de mes — descartado: más complejo, y el patrón "resolver en
cada llamada" ya es el que usa el resto del sistema para "hoy" (`hoyLocal()`,
`mesActualPeriodo()` en `view-model.js` se recalculan en cada request, nunca se
cachean a nivel de proceso).

## 6. Alcance de UI (frontend)

**Decisión**: se agrega un botón "Cerrar período" / "Reabrir período" y un
indicador visual de "cerrado" al encabezado de `PaginaCalendario.jsx`, consumiendo
los dos endpoints nuevos (`POST /api/calendarios/:periodo/cerrar` y `/reabrir`) a
través del cliente API existente (`calendario-client.js`). Es la única pieza de UI
de esta feature.

**Rationale**: el spec formula User Story 3 desde la perspectiva de un responsable
que "quiere poder marcar" y que el sistema "rechace indicando" — implica una acción
accesible desde la interfaz que ya usa a diario, no solo un comando de
administración de sistema. El resto de las acciones equivalentes del sistema
(reclasificar, corregir, pausar, justificar) ya tienen su reflejo en la UI; dejar
cerrar/reabrir solo en el CLI rompería esa consistencia sin necesidad.

**Alternatives considered**: CLI-only (sin UI) — descartado por la razón anterior;
se mantiene como opción de fallback operativo (el CLI también expone
`cerrar-periodo`/`reabrir-periodo`, útil para automatizar el cierre de fin de mes),
pero no reemplaza la acción en la UI.

## 7. Compatibilidad con la configuración existente (`PRESENTISMO_PADRON_FILE`, `PRESENTISMO_FICHADAS_DIR`)

**Decisión**: estas dos variables de entorno/flags de CLI se **retiran**: dejan de
tener sentido una vez que padrón y fichadas son siempre `P<periodo>/padron.json` y
`P<periodo>/fichadas.json` bajo `PRESENTISMO_REPO_DIR`/`--repo-dir`, que sigue
siendo la única raíz configurable. Es un cambio de ruptura deliberado en la
configuración (no en los datos de producción, que todavía no existen — ver
Assumptions del spec), documentado en el CHANGELOG del CLI (contracts/cli-presentismo.md).

**Rationale**: mantenerlas como alias "compatibles" obligaría a soportar dos
layouts en paralelo indefinidamente, contradiciendo el pedido explícito de
reestructurar. Como el spec ya declara fuera de alcance la migración de datos
existentes (son datos de desarrollo, gitignored, no productivos todavía), no hay
costo de compatibilidad real que justifique mantener las variables viejas.

**Alternatives considered**: mantener `PRESENTISMO_PADRON_FILE`/`PRESENTISMO_FICHADAS_DIR`
como overrides opcionales que ignoran el layout por período — descartado: reintroduce
exactamente el problema que esta feature busca resolver (padrón único global,
fichadas fuera de la carpeta del período).
