---

description: "Task list for Reestructurar Almacenamiento por Período"
---

# Tasks: Reestructurar Almacenamiento por Período

**Input**: Design documents from `specs/013-reestructurar-data-periodos/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: incluidos — el plan (Principio IV, Test-First en Capas Críticas) exige test-first
para el repositorio de archivo (rutas nuevas) y el guardado de "cerrado" (bloqueo de
escritura); se reutiliza el test de contrato parametrizado existente.

**Organization**: Foundational = migración del layout de almacenamiento (usada por las
3 historias). US1 = un período autocontenido en su carpeta. US2 = padrón por período,
actualizado siempre sobre el mes en curso. US3 = ciclo de vida cerrado/reabierto.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias)
- **[Story]**: US1 / US2 / US3
- Rutas de archivo relativas a la raíz del repo (`C:\AI\rs956`)

---

## Phase 1: Setup

**Purpose**: Módulo puro nuevo que centraliza el layout de carpetas (research.md §1);
todo lo demás depende de él.

- [X] T001 [P] Crear `src/presentismo/domain/periodo-storage.js`: exporta
  `rutaCarpetaPeriodo(repoDir, periodo)` (= `path.join(repoDir, 'P' + periodo)`) y las
  constantes `ARCHIVO_CALENDARIO`/`ARCHIVO_FICHADAS`/`ARCHIVO_PADRON` (`calendario.json`,
  `fichadas.json`, `padron.json`). Valida `periodo` con el mismo patrón `^\d{6}$` que
  `calendario-mes.js` (`parsePeriodo`). Puro, sin I/O.
- [X] T002 [P] Test unitario test-first en `tests/unit/presentismo-periodo-storage.test.js`:
  `rutaCarpetaPeriodo('/repo', '202608')` → `/repo/P202608`; períodos distintos producen
  carpetas distintas; formato inválido lanza (mismo mensaje que `parsePeriodo`).

**Checkpoint**: `periodo-storage.js` listo y testeado; ningún adaptador lo usa todavía.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Migrar los tres adaptadores de persistencia y el cableado (CLI + web) al
layout `P<periodo>/{calendario,fichadas,padron}.json` (contracts/storage-layout.md).
**Ninguna historia de usuario es verificable de punta a punta hasta que esta fase esté
completa**: sin esto, ni siquiera "generar un calendario" escribe en el lugar correcto.

**⚠️ CRÍTICO**: no empezar Fase 3/4/5 antes de terminar esta fase.

- [X] T003 Reescribir `src/presentismo/adapters/file-presentismo-repository.js` para
  usar `rutaCarpetaPeriodo`/`ARCHIVO_CALENDARIO` de `periodo-storage.js`: `rutaDe(periodo)`
  pasa de `${repoDir}/${periodo}.json` a `${rutaCarpetaPeriodo(repoDir, periodo)}/calendario.json`,
  creando la carpeta del período de forma perezosa (`mkdirSync recursive` en `escribir`,
  no en el constructor). `listarPeriodos()` escanea subdirectorios `P\d{6}` (no archivos
  `\d{6}\.json`) y recorta el prefijo `P` al reportar el período. La forma persistida
  (`{ calendario, correcciones, pausas, justificaciones }`) NO cambia.
- [X] T004 [P] Actualizar `tests/unit/file-presentismo-repository-listar.test.js` al
  nuevo layout: `escribirCalendario` escribe en `P<periodo>/calendario.json` (crear el
  subdirectorio), el caso "ignora archivos que no matchean" pasa a "ignora entradas que
  no matchean `^P\d{6}$`" (carpetas sueltas, archivos sueltos como `padron.json` en la
  raíz, `P2026070` de 7 dígitos, `P20260` de 5 dígitos).
- [X] T005 [P] Reescribir `src/presentismo/adapters/file-fichadas-archive.js`: las
  funciones `cargarFichadasArchivadas`/`registrarFichadas` reciben `repoDir` en vez de
  `archiveDir` y resuelven la ruta con `rutaCarpetaPeriodo(repoDir, periodo)/fichadas.json`
  (vía `periodo-storage.js`); `mkdirSync` sobre la carpeta del período, no sobre
  `archiveDir` directo. La forma del archivo (`{ periodo, actualizadoEn, fichadas }`) y
  la deduplicación por `rawHex` no cambian. `leerExportsDeSesion` no cambia (no depende
  del layout de salida).
- [X] T006 [P] Actualizar `tests/unit/presentismo-fichadas-archive.test.js` al nuevo
  parámetro `repoDir` y a la ruta `P<periodo>/fichadas.json` (incluye los tests de
  escritura atómica y de "no reescribe sin altas").
- [X] T007 Actualizar `src/presentismo/adapters/archive-fichadas-provider.js`:
  `createArchiveFichadasProvider({ repoDir })` en vez de `{ archiveDir }` (mismo
  contrato `FichadasProvider.obtenerFichadasDelMes`, delega en `cargarFichadasArchivadas`
  con el `repoDir` recibido).
- [X] T008 [P] Actualizar `tests/unit/presentismo-fichadas-provider.test.js` al nuevo
  parámetro `repoDir`.
- [X] T009 [P] Actualizar `tests/unit/consulta-programada-fichadas-sink.test.js`: los
  tests de `createFichadasSink` pasan `repoDir` en vez de `archiveDir` y verifican
  `cargarFichadasArchivadas({ repoDir, periodo })`.
- [X] T010 Extender `tests/contract/presentismo-ports.contract.test.js` (ambas fábricas,
  `in-memory` y `file`) con un caso nuevo "un período no lee ni modifica a otro": guardar
  calendario/corrección/pausa/justificación en `202607` y en `202608`, y verificar que
  `cargarCalendario`, `listarCorrecciones`, `listarPausas` y `listarJustificaciones` de
  uno no ven ni alteran los datos del otro (Acceptance Scenario 3 de US1).
- [X] T011 Actualizar `src/web/wiring.js`: quitar `padronFile`/`fichadasDir` como rutas
  fijas separadas; `createArchiveFichadasProvider` pasa a recibir `{ repoDir }` (mismo
  `repoDir` que ya recibe `createFilePresentismoRepository`). Dejar por ahora
  `categoryProvider`/`activeEmployeesProvider` con `filePath: padronFile` tal cual (se
  migran en US2, T0xx) para no acoplar esta fase con la resolución dinámica de "mes en
  curso".
- [X] T012 Actualizar `src/cli/calcular-presentismo.js`: `rutaArchivoFichadas(args)` deja
  de leer `--fichadas-archive-dir`/`PRESENTISMO_FICHADAS_DIR` y devuelve directamente
  `repoDir` (para pasarlo a `createArchiveFichadasProvider({ repoDir })`); `cmdImportarFichadas`
  usa `registrarFichadas({ repoDir, periodo, fichadas })` y ajusta el mensaje de salida
  (ya no imprime `${archiveDir}/${periodo}.json`, imprime `P<periodo>/fichadas.json` bajo
  `repoDir`). No tocar todavía `rutaSnapshotPadron`/`--padron-file` (US2).
- [X] T013 Actualizar `src/cli/consulta-programada.js`: la opción `fichadasArchiveDir`
  (`--fichadas-archive-dir`/`PRESENTISMO_FICHADAS_DIR`) se reemplaza por `repoDir`
  (`--repo-dir`/`PRESENTISMO_REPO_DIR`, default `./data/presentismo`, mismo nombre de
  variable que ya usa el resto del sistema); `createFichadasSink({ repoDir })` y
  `runService` pasan `repoDir` al sink en vez de `fichadasArchiveDir`. Ajustar el mensaje
  `Fichadas persistidas en: ...`.
- [X] T014 Actualizar `tests/helpers/fichadas-hoy-entorno.js` (helper compartido por los
  tests de contrato/integración de 010/011/012): quitar `PRESENTISMO_PADRON_FILE`/
  `PRESENTISMO_FICHADAS_DIR` del `env` armado; escribir el padrón de prueba directamente
  en `P<periodo>/padron.json` bajo `repoDir` (usar `rutaCarpetaPeriodo`/`ARCHIVO_PADRON`
  o el mismo `mkdirSync`+`writeFileSync` equivalente); `registrarFichadas`/`agregarFichadas`
  pasan `{ repoDir }` en vez de `{ archiveDir: fichadasDir }`. Mantiene la forma pública
  del helper (`crearEntornoFichadasHoy`, `fechaDelMes`, etc.) para no romper a quienes lo
  consumen.
- [X] T015 [P] Correr y, si hace falta, ajustar las suites que dependen del helper T014
  sin lógica propia de rutas (deberían pasar solo con T003–T014 aplicados):
  `tests/contract/web-api-calendario.test.js`, `tests/contract/web-api-fichadas-hoy.test.js`,
  `tests/contract/web-api-justificaciones.test.js`, `tests/contract/web-api-resumen-periodo.test.js`,
  `tests/integration/fichadas-hoy.integration.test.js`, `tests/integration/justificacion.integration.test.js`,
  `tests/integration/resumen-periodo.integration.test.js`, `tests/integration/edge-cases.integration.test.js`.
- [X] T016 [P] Actualizar los tests de integración que arman su propio `repoDir`/
  `fichadasDir` a mano (sin pasar por el helper T014), al nuevo layout:
  `tests/integration/calcular-presentismo.integration.test.js`,
  `tests/integration/generar-calendario-contiguo.test.js`,
  `tests/integration/no-dedup.integration.test.js`, `tests/integration/no-delete.integration.test.js`,
  `tests/integration/performance.integration.test.js`, `tests/integration/presentismo-performance.integration.test.js`,
  `tests/integration/query-pending-fichadas.integration.test.js`,
  `tests/integration/consulta-programada-service.integration.test.js`.
- [X] T017 Correr la suite completa (`npm test`) y confirmar que no queda ninguna
  referencia activa a `<repoDir>/<periodo>.json`, `<repoDir>/fichadas/`, ni
  `<repoDir>/padron.json` (único) fuera de los comentarios que documentan el layout
  anterior en `research.md`/`data-model.md`/`contracts/`.

**Checkpoint**: el layout `P<periodo>/{calendario,fichadas}.json` funciona de punta a
punta (CLI + web); el padrón sigue siendo el archivo único viejo (`padronFile`) hasta US2.

---

## Phase 3: User Story 1 - Un período mensual vive en una carpeta propia y autocontenida (Priority: P1) 🎯 MVP

**Goal**: verificar de punta a punta que un período nuevo crea su carpeta `P<periodo>`
con calendario y fichadas, y que dos períodos coexisten sin mezclarse (ya implementado
por la Fase 2; esta fase es la prueba de aceptación explícita de US1 + los ajustes de
mensajes/documentación que le faltan a la Fase 2).

**Independent Test**: generar el calendario de un período nuevo → existe `P<periodo>/`
con su calendario; importar fichadas de ese período → quedan en `P<periodo>/fichadas.json`;
un segundo período no se ve afectado.

### Tests for User Story 1

- [X] T018 [P] [US1] Test de integración nuevo `tests/integration/periodo-carpeta.integration.test.js`
  (quickstart.md, Escenario 1): `generar-calendario --periodo 202608` crea
  `<repo-dir>/P202608/calendario.json` y NO crea `<repo-dir>/202608.json` ni
  `<repo-dir>/fichadas/`; `importar-fichadas --periodo 202608` deja las fichadas en
  `<repo-dir>/P202608/fichadas.json`; generar además `202607` dejar `P202607/` en
  paralelo sin que ninguna operación sobre uno toque los archivos del otro (reusar el
  helper de T010 a nivel de integración, invocando los comandos reales del CLI o el
  servicio directamente contra un `repoDir` temporal).

### Implementation for User Story 1

- [X] T019 [US1] Confirmar (y documentar con un comentario breve si hace falta) que
  `listarPeriodos()` de `file-presentismo-repository.js` (T003) reporta el período sin
  el prefijo `P` hacia el resto del sistema (invariante de data-model.md); agregar un
  caso puntual en `tests/unit/file-presentismo-repository-listar.test.js` (T004) que lo
  verifique explícitamente si no quedó cubierto.
- [X] T020 [P] [US1] Actualizar el comentario de cabecera de `src/presentismo/adapters/file-presentismo-repository.js`
  y `src/presentismo/adapters/file-fichadas-archive.js` para reflejar el layout nuevo
  (ya no "un archivo por período junto a `repoDir`", sino "una carpeta `P<periodo>` por
  período"), evitando que la documentación en código quede desalineada con T003/T005.

**Checkpoint**: US1 pasa su test independiente; el layout por carpeta está probado de
punta a punta con el CLI real.

---

## Phase 4: User Story 2 - El padrón queda fechado por período y se actualiza sobre el mes en curso (Priority: P2)

**Goal**: cada período tiene su propio `padron.json` (creado al generar su calendario);
toda sincronización posterior escribe siempre sobre el período del mes en curso
(reloj real al momento de sincronizar), nunca sobre un período pasado.

**Independent Test**: generar el calendario de un período nuevo (crea su padrón),
sincronizar el padrón (actualiza el mes en curso) y verificar que el padrón de un
período anterior no cambió.

### Tests for User Story 2

- [X] T021 [P] [US2] Test unitario test-first en `tests/unit/presentismo-file-padron-provider.test.js`
  (extender el existente): `createFilePadronCategoryProvider({ repoDir, now })` resuelve
  `P<mesActualPeriodo(now())>/padron.json` en cada llamada a `obtenerCategoria`/`listar`
  (no cachea el período al construirse); dos llamadas con `now` en meses distintos leen
  archivos distintos sin reiniciar el proceso (research.md §5).
- [X] T022 [P] [US2] Test unitario test-first en `tests/unit/local-file-active-employees-provider.test.js`
  (extender el existente): con `{ repoDir, now }`, `getActiveEmployees()` resuelve
  `P<mesActualPeriodo(now())>/padron.json`; con `{ filePath }` (modo legacy, sin
  cambios) sigue leyendo el archivo fijo indicado — no romper el uso existente de
  `consulta-programada.js`.
- [X] T023 [US2] Test de integración nuevo `tests/integration/padron-por-periodo.integration.test.js`
  (quickstart.md, Escenario 2): generar calendario de `202608` (mes en curso simulado) y
  de `202607` (mes pasado) → cada uno crea su propio `padron.json`; sincronizar el
  padrón → se actualiza `P202608/padron.json`, `P202607/padron.json` queda
  bit-a-bit idéntico (hash o `readFileSync` igual antes/después); avanzar el reloj
  inyectado a `202609` y sincronizar de nuevo → crea/actualiza `P202609/padron.json` sin
  tocar `P202608/` ni `P202607/`.

### Implementation for User Story 2

- [X] T024 [US2] Extender `src/presentismo/adapters/file-padron-category-provider.js`:
  `createFilePadronCategoryProvider({ repoDir, now = () => new Date() })` en vez de
  `{ filePath }`; resuelve la ruta con `rutaCarpetaPeriodo(repoDir, mesActualPeriodo(now()))`
  (importar `mesActualPeriodo` de `src/web/view-model.js` o la función equivalente
  consolidada en T031) en cada llamada; el caché interno pasa de una variable `cache`
  única a `Map<periodo, mapaEmpleados>` (una entrada por período visto, nunca invalidada
  entre llamadas del mismo período — solo agrega entradas nuevas cuando cambia el mes).
  `guardarSnapshotPadron` no cambia de forma, solo quién computa el `filePath` que recibe.
- [X] T025 [US2] Extender `src/roster/local-file-active-employees-provider.js`:
  `createLocalFileActiveEmployeesProvider` acepta DOS modos mutuamente excluyentes —
  `{ filePath }` (sin cambios, usado hoy por `consulta-programada.js` para
  `--roster-config`/`FICHADAS_ROSTER_CONFIG`, un archivo fijo NO ligado a períodos) o
  `{ repoDir, now = () => new Date() }` (nuevo: resuelve `P<mesActualPeriodo(now())>/padron.json`
  en cada llamada a `getActiveEmployees`, FR-004). Lanzar si se pasan ambos o ninguno.
- [X] T026 [US2] Actualizar `src/web/wiring.js`: `categoryProvider` y
  `activeEmployeesProvider` pasan de `{ filePath: padronFile }` a `{ repoDir }` (T024/T025);
  quitar la variable `padronFile` y la lectura de `PRESENTISMO_PADRON_FILE` del entorno.
- [X] T027 [US2] Actualizar `src/cli/calcular-presentismo.js`: quitar `rutaSnapshotPadron`/
  `--padron-file`/`PRESENTISMO_PADRON_FILE`; `construirCategoryProvider` (modo `archivo`)
  pasa a `createFilePadronCategoryProvider({ repoDir })` (T024); `cmdSincronizarPadron`
  calcula el `filePath` de destino como `rutaCarpetaPeriodo(repoDir, mesActualPeriodo())/padron.json`
  (siempre el mes en curso real, FR-004) y ya no acepta `--padron-file`.
- [X] T028 [US2] En el mismo `generar-calendario` (CLI, `cmdGenerarCalendario`) y en el
  handler web `POST /api/calendarios/:periodo/generar` (`src/web/api/calendario-handlers.js`),
  implementar FR-003: si `P<periodo>/padron.json` no existe todavía para el período que
  se está generando, crearlo con `guardarSnapshotPadron` a partir de la fuente de padrón
  resuelta (`--padron archivo|oracle` en el CLI; el `categoryProvider`/fuente ya cableada
  en `ctx` para el handler web) — no sobrescribir si ya existe (idempotencia del edge
  case "generar un período que ya existe").
- [X] T029 [P] [US2] Actualizar `tests/unit/daily-cached-active-employees-provider.test.js`
  y cualquier otro test que instancie `createLocalFileActiveEmployeesProvider` con
  `{ filePath }` para confirmar que el modo legacy sigue intacto tras T025 (sin cambios
  de comportamiento esperados, solo correr y confirmar).
- [X] T030 [P] [US2] Actualizar `tests/integration/consulta-programada-oracle-roster.integration.test.js`
  si referencia rutas de padrón/roster afectadas por T025/T027 (confirmar que sigue
  usando `{ filePath }`, no `{ repoDir }`).
- [X] T031 [US2] Consolidar `periodoDeFecha`/`mesActualPeriodo` en un único punto de
  verdad reutilizable (research.md, nota de `calendario-mes.js`): agregar
  `periodoDeFecha(fecha)` puro a `src/presentismo/domain/calendario-mes.js` (dado
  `'YYYY-MM-DD'` → `'YYYYMM'`) y hacer que `src/web/view-model.js` (`mesActualPeriodo`),
  `src/presentismo/service/calcular-presentismo-service.js` (función privada
  `periodoDeFecha`) y `src/web/api/*-handlers.js` (función privada `periodoDe`) lo
  reutilicen en vez de reimplementar el mismo cálculo por su cuenta. Cambio interno,
  sin efecto observable — correr toda la suite para confirmar que no hay regresiones.

**Checkpoint**: US1 y US2 funcionan juntas; el padrón es por período y solo se
actualiza sobre el mes en curso; un período pasado nunca cambia (SC-002).

---

## Phase 5: User Story 3 - Un período cerrado queda protegido de modificaciones (Priority: P3)

**Goal**: un responsable puede cerrar (y reabrir) un período; mientras está cerrado,
toda escritura sobre ese período se rechaza; la consulta sigue funcionando igual.

**Independent Test**: marcar un período como cerrado y verificar que reclasificar,
corregir, pausar, justificar o incorporar fichadas se rechaza, mientras que consultar
(calcular, resumen, detalle) sigue funcionando igual que antes.

### Tests for User Story 3

- [X] T032 [P] [US3] Test unitario test-first en `tests/unit/presentismo-calendario-mes.test.js`:
  `generarCalendario` devuelve `cerrado: false`, `cierre: null`, `reapertura: null` por
  defecto (Acceptance Scenario 4); `cerrarCalendario(cal, autor)` devuelve un calendario
  NUEVO con `cerrado: true` y `cierre: { autor, fechaHora }` sin mutar el original;
  `reabrirCalendario(cal, autor)` → `cerrado: false`, `reapertura: { autor, fechaHora }`,
  conservando el `cierre` previo como historial (no lo borra); cerrar un calendario ya
  cerrado (o reabrir uno ya abierto) es idempotente a nivel de dominio: no lanza, pero
  SÍ actualiza `cierre`/`reapertura` con el intento más reciente (edge case del spec).
- [X] T033 [P] [US3] Test unitario test-first, mismo archivo: `exigirPeriodoAbierto(calendario)`
  no lanza si `cerrado` es `false`/ausente; lanza (con un código identificable, p. ej.
  `err.httpCode === 'PERIODO_CERRADO'`) si `calendario.cerrado === true`.
- [X] T034 [US3] Test de integración nuevo `tests/integration/periodo-cerrado.integration.test.js`
  (quickstart.md, Escenario 3 + verificación transversal SC-004): con `202607` generado
  y con datos, cerrar el período (servicio o API); verificar que reclasificar, cargar
  corrección, pausa, retiro anticipado, justificación e importar fichadas sobre ese
  período son rechazados SIN alterar ningún archivo de `P202607/`; verificar que
  calcular presentismo, el resumen del período, el detalle de un empleado y listar el
  padrón siguen respondiendo igual que antes de cerrar (FR-007); reabrir el período y
  repetir las operaciones de escritura con éxito; calcular el mismo legajo antes y
  después del ciclo cerrar/reabrir y comparar que el resultado no cambió (SC-004).

### Implementation for User Story 3

- [X] T035 [US3] Extender `src/presentismo/domain/calendario-mes.js`: campos `cerrado`
  (default `false`), `cierre` (default `null`), `reapertura` (default `null`) en el
  objeto que devuelve `generarCalendario` (y preservarlos igual que `reclasificadoManual`
  al regenerar un calendario existente — no reiniciar el estado de cierre al
  regenerar). Nuevas funciones puras `cerrarCalendario(calendario, autor)`,
  `reabrirCalendario(calendario, autor)` y `exigirPeriodoAbierto(calendario)`
  (data-model.md, research.md §3/§4).
- [X] T036 [US3] Extender `src/presentismo/service/calcular-presentismo-service.js`:
  nuevas funciones `cerrarPeriodo(periodo, autor)`/`reabrirPeriodo(periodo, autor)` —
  cargan el calendario del período (lanzan si no existe, mismo mensaje que las demás
  operaciones: "no existe calendario para X; generalo primero"), aplican
  `cerrarCalendario`/`reabrirCalendario`, persisten con `repo.guardarCalendario` y
  loguean `periodo_cerrado`/`periodo_reabierto` (periodo, autor, fechaHora) — mismo
  patrón que `reclasificarDiaMes`. Exportarlas en el objeto devuelto por
  `createCalcularPresentismoService`.
- [X] T037 [US3] En el mismo archivo, invocar `exigirPeriodoAbierto(actual)` al
  principio de: `reclasificarDiaMes`, `cargarCorreccion`, `revertirCorreccion`,
  `cargarPausa` (cubre `cargarRetiroAnticipado`, que delega en `cargarPausa`),
  `revertirPausa`, y — por cada período involucrado — `cargarJustificacion` y
  `revertirJustificacion` (research.md §4). `cargarJustificacion` puede tocar varias
  fechas de distintos períodos (rango): verificar `exigirPeriodoAbierto` para CADA
  período distinto entre los días elegibles antes de registrar ninguno (todo o nada,
  ningún día se guarda si algún período tocado está cerrado).
- [X] T038 [US3] Agregar la misma guarda a los dos puntos de entrada de fichadas que NO
  pasan por el servicio (research.md §4): `cmdImportarFichadas` en
  `src/cli/calcular-presentismo.js` (cargar el calendario del período vía el repositorio
  antes de `registrarFichadas`; si `cerrado`, salir con exit 1 y un mensaje que indique
  el período y desde cuándo está cerrado) y `createFichadasSink`/`persistirFichadas` en
  `src/cli/consulta-programada.js` (por cada período del grupo: si está cerrado, omitir
  ese grupo sin lanzar — el servicio es de larga vida y no tiene un llamador HTTP
  esperando un error — y loguear un evento `fichadas_rechazadas_periodo_cerrado` con
  `periodo`/cantidad omitida).
- [X] T039 [US3] Agregar los subcomandos nuevos al CLI (`src/cli/calcular-presentismo.js`,
  contracts/cli-presentismo.md): `cerrar-periodo --periodo YYYYMM --autor <id>` y
  `reabrir-periodo --periodo YYYYMM --autor <id>`, delegando en
  `svc.cerrarPeriodo`/`svc.reabrirPeriodo` (T036); error claro (exit 1) si el período no
  tiene calendario generado.
- [X] T040 [US3] Agregar `POST /api/calendarios/:periodo/cerrar` y
  `POST /api/calendarios/:periodo/reabrir` en `src/web/api/calendario-handlers.js`
  (contracts/web-api.md): validan el formato del período (400 `PERIODO_INVALIDO`),
  llaman `ctx.service.cerrarPeriodo`/`reabrirPeriodo` con el `autor` del body (opcional),
  traducen "no existe calendario" a 404 `CALENDARIO_NO_GENERADO`, y devuelven la
  `VistaCalendarioMes` actualizada (200) en cualquier otro caso, incluido el idempotente
  (cerrar ya cerrado / reabrir ya abierto).
- [X] T041 [US3] Actualizar `src/web/view-model.js`: `construirVistaCalendario` agrega
  `cerrado: Boolean(calendario.cerrado)` (y opcionalmente `cierre`/`reapertura`) al nivel
  raíz de la vista (contracts/web-api.md — no rompe clientes que ignoran campos nuevos).
- [X] T042 [US3] Mapear el rechazo por período cerrado a **409 `PERIODO_CERRADO`** en los
  cinco endpoints de escritura existentes (contracts/web-api.md): el `catch` de
  `POST /api/calendarios/:periodo/reclasificar` (`src/web/api/calendario-handlers.js`,
  función `registrarReclasificar`) y los de `POST /api/fichadas-hoy/correcciones`,
  `/pausas`, `/retiros-anticipados` (`src/web/api/fichadas-hoy-handlers.js`) deben
  distinguir el error de `exigirPeriodoAbierto` (p. ej. por `err.httpCode ===
  'PERIODO_CERRADO'`, T033) del resto de errores de validación y devolver 409 en vez de
  400. En `src/web/api/justificaciones-handlers.js`, agregar `PERIODO_CERRADO: 409` al
  mapa de `relanzarComoApiError` (ya usa `err.httpCode`, cubre tanto `POST` como
  `DELETE /api/justificaciones`).
- [X] T043 [P] [US3] Actualizar el cliente API `frontend/src/api/calendario-client.js`:
  agregar `cerrarPeriodo(periodo, { autor })` / `reabrirPeriodo(periodo, { autor })`
  (`POST /calendarios/:periodo/cerrar` y `/reabrir`), mismo patrón que `reclasificar`.
- [X] T044 [US3] Actualizar `frontend/src/components/PaginaCalendario.jsx` (y
  `EncabezadoPeriodo.jsx` si es donde corresponde mostrar el indicador, ver
  research.md §6): botón "Cerrar período" / "Reabrir período" según `estado.vista.cerrado`,
  llamando a `cliente.cerrarPeriodo`/`reabrirPeriodo` (T043) y refrescando la vista con
  la respuesta; indicador visual de "cerrado" en el encabezado cuando
  `estado.vista.cerrado === true`.
- [X] T045 [P] [US3] Actualizar/extender `frontend/src/components/PaginaCalendario.test.jsx`
  y `frontend/src/components/EncabezadoPeriodo.test.jsx` para cubrir el botón nuevo y el
  indicador de cerrado (mock del cliente API).
- [X] T046 [US3] Documentar en el CLI (README o el propio `--help` si existe una lista
  de subcomandos) el cambio de ruptura deliberado: `--padron-file`/`PRESENTISMO_PADRON_FILE`
  y `--fichadas-archive-dir`/`PRESENTISMO_FICHADAS_DIR` fueron retirados (contracts/storage-layout.md);
  agregar una entrada al CHANGELOG del CLI si el proyecto mantiene uno.

**Checkpoint**: las 3 historias funcionan juntas; un período cerrado bloquea toda
escritura y sigue siendo consultable; reabrir restaura el comportamiento anterior sin
pérdida de datos.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: validación final end-to-end y limpieza.

- [X] T047 [P] Ejecutar manualmente (o como test de integración adicional) los 3
  escenarios completos de `quickstart.md`, incluida la "Verificación de rendimiento"
  (12 períodos en paralelo, ninguna operación individual escanea carpetas de otros
  períodos salvo `listarPeriodos()`).
- [X] T048 [P] Revisar que ningún log NDJSON (`src/presentismo/logging/presentismo-logger.js`,
  eventos `periodo_cerrado`/`periodo_reabierto`/`fichadas_rechazadas_periodo_cerrado`)
  incluya datos biométricos, credenciales, ni el `rawHex` de una fichada (Principio V).
- [X] T049 Correr la suite completa (`npm test` en la raíz y en `frontend/`) y confirmar
  que no queda ningún test rojo ni ninguna referencia residual al layout anterior
  (`<repoDir>/<periodo>.json`, `<repoDir>/fichadas/<periodo>.json`,
  `<repoDir>/padron.json` único) en código de producción o de test.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Fase 1)**: sin dependencias — puede empezar de inmediato.
- **Foundational (Fase 2)**: depende de la Fase 1 (`periodo-storage.js`) — **bloquea**
  las Fases 3, 4 y 5: ningún test de historia de usuario puede pasar contra el layout
  viejo.
- **US1 (Fase 3)**: depende solo de la Fase 2. Es, en la práctica, la verificación de
  que la Fase 2 cumple el pedido de US1.
- **US2 (Fase 4)**: depende de la Fase 2 (mismo `repoDir`/`periodo-storage.js`) y
  conceptualmente de US1 (la carpeta ya existe), pero NO depende de que la Fase 3 esté
  "cerrada" como checkpoint formal — puede arrancar en paralelo con la Fase 3.
- **US3 (Fase 5)**: depende de la Fase 2. Usa el mismo repositorio (T003) y el mismo
  servicio (extendido por T036/T037), pero no depende de los cambios de padrón de US2
  (T024–T031) más allá de compartir `repoDir` — puede desarrollarse en paralelo con US2
  si hay más de una persona, aunque T037 (guardas en `cargarJustificacion`) toca el mismo
  archivo que T031 (dedup `periodoDeFecha`), así que dentro de un mismo desarrollador
  conviene secuenciar T031 antes de T037.
- **Polish (Fase 6)**: depende de que Fases 3, 4 y 5 estén completas.

### Dentro de cada historia

- Tests (T018, T021–T023, T032–T034) se escriben y deben FALLAR antes de la
  implementación correspondiente (Principio IV).
- Dominio (`calendario-mes.js`, T035) antes que servicio (T036/T037) antes que
  adaptadores de entrada (CLI T038/T039, web T040–T042) antes que frontend (T043–T045).

### Oportunidades de paralelismo

- T001/T002 (Setup) en paralelo.
- Dentro de Foundational: T004, T005+T006, T007+T008, T009 pueden avanzar en paralelo
  una vez creado T003 (distintos archivos); T011–T014 dependen de T003/T005/T007
  completos. T015/T016 se corren en paralelo entre sí al final de la fase.
- US1 (T018–T020) puede avanzar en paralelo con el arranque de US2/US3 una vez cerrada
  la Fase 2.
- Dentro de US2: T021/T022 (tests) en paralelo; T024/T025 en paralelo (archivos
  distintos); T029/T030 en paralelo.
- Dentro de US3: T032/T033 (tests de dominio) en paralelo; T043/T045 (frontend) en
  paralelo con T038/T039 (CLI) una vez que T035–T037 estén listos.

---

## Parallel Example: Foundational (Fase 2)

```bash
# Una vez T003 (repositorio de calendario) está integrado:
Task: "Actualizar tests/unit/file-presentismo-repository-listar.test.js al nuevo layout (T004)"
Task: "Reescribir file-fichadas-archive.js + su test (T005/T006)"
Task: "Actualizar archive-fichadas-provider.js + su test (T007/T008)"
Task: "Actualizar consulta-programada-fichadas-sink.test.js (T009)"
```

## Parallel Example: User Story 3

```bash
Task: "Test unitario cerrado/cierre/reapertura por defecto en calendario-mes.js (T032)"
Task: "Test unitario exigirPeriodoAbierto (T033)"
# tras T035-T042:
Task: "Cliente API cerrar/reabrir período (T043)"
Task: "UI: botón + indicador de cerrado en PaginaCalendario (T044)"
```

---

## Implementation Strategy

### MVP First (Foundational + US1)

1. Fase 1: Setup (`periodo-storage.js`).
2. Fase 2: Foundational (migración de layout) — **crítica, bloquea todo lo demás**.
3. Fase 3: US1 — validar el escenario 1 de quickstart.md.
4. **DETENER y VALIDAR**: correr `tests/integration/periodo-carpeta.integration.test.js`
   y confirmar que dos períodos conviven sin mezclarse.

### Entrega incremental

1. Setup + Foundational → base lista (layout por carpeta, sin padrón por período ni
   cierre todavía).
2. + US1 → validado independientemente (carpeta autocontenida).
3. + US2 → padrón fechado por período, siempre actualizado sobre el mes en curso.
4. + US3 → ciclo de vida cerrado/abierto, con su reflejo en CLI, API y frontend.
5. + Polish → validación end-to-end de `quickstart.md` completo.

### Notas

- [P] = archivos distintos, sin dependencias entre sí.
- El repositorio (`file-presentismo-repository.js`) NO decide reglas de negocio de
  cierre (research.md §4): la guarda vive en el servicio, no en el adaptador.
- `createLocalFileActiveEmployeesProvider` debe seguir aceptando `{ filePath }` sin
  cambios para `consulta-programada.js` (T025) — no romper esa ruta al agregar el modo
  `{ repoDir }`.
- Evitar: escribir la ruta de un período a mano en un adaptador nuevo (siempre pasar
  por `periodo-storage.js`); cachear `mesActualPeriodo()` a nivel de proceso (el backend
  web es de larga vida, FR-004).
