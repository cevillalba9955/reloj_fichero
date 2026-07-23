---

description: "Task list for Control de Vacaciones Anual (015)"
---

# Tasks: Control de Vacaciones Anual

**Input**: Design documents from `/specs/015-control-vacaciones/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [data-model.md](./data-model.md), [research.md](./research.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: El plan pide test-first en la capa crítica de dominio (Principio IV de la constitución) y contrato/integración de los endpoints nuevos. Se incluyen como tareas explícitas.

**Organization**: Tareas agrupadas por historia de usuario (US1..US4) para poder implementar y probar cada una de forma independiente.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencias)
- **[Story]**: historia de usuario a la que pertenece (US1..US4)
- Rutas de archivo exactas en cada descripción

## Path Conventions

Web app existente: backend Node.js en `src/`, tests en `tests/{unit,contract,integration}/`, frontend React en `frontend/src/`. Config en `config/`.

---

## Phase 1: Setup

**Purpose**: Archivo de configuración nuevo y su plantilla, sin lógica todavía.

- [X] T001 [P] Crear `config/vacaciones.json` con `incrementoAnual: { mes: 11, dia: 1 }` y `escalaAntiguedad` LCT (`[{aniosMinimos:0,dias:14},{aniosMinimos:5,dias:21},{aniosMinimos:10,dias:28},{aniosMinimos:20,dias:35}]`), según `contracts/vacaciones-config.schema.md`.
- [X] T002 [P] Crear `config/vacaciones.example.json` con el mismo contenido que T001 (plantilla versionada, mismo criterio que `config/motivos-ausencia.example.json`).

**Checkpoint**: archivos de configuración presentes; nada los lee todavía.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infraestructura de dominio, config y persistencia que TODAS las historias de usuario necesitan. Ninguna historia puede empezar sin esta fase completa.

⚠️ **CRÍTICO**: no avanzar a Phase 3+ sin terminar esta fase.

### Config de vacaciones

- [X] T003 [P] Test unitario de validación fail-fast en `tests/unit/presentismo-vacaciones-config.test.js`: `parseVacacionesConfig` acepta la config válida de T001; rechaza `escalaAntiguedad` sin tramo `aniosMinimos: 0`, no estrictamente creciente, `dias <= 0`, `incrementoAnual.mes` fuera de `1..12`, `incrementoAnual.dia` inválido para ese mes, archivo ausente/corrupto (mismos casos que `contracts/vacaciones-config.schema.md`).
- [X] T004 [US-fnd] Implementar `src/presentismo/config/vacaciones-config.js`: `parseVacacionesConfig(raw)`, `serializarVacacionesConfig(config)`, `editarIncrementoAnual(config, {mes,dia})`, `editarEscalaAntiguedad(config, tramos)` (ambas re-validan con `parseVacacionesConfig` antes de aceptar), `loadVacacionesConfig(path)`, `saveVacacionesConfig(path, config)` (escritura atómica `.tmp-<pid>-<timestamp>` + rename), mismo patrón que `src/presentismo/config/motivos-ausencia-config.js`. Debe hacer pasar T003.

### Dominio puro de vacaciones

- [X] T005 [P] Test unitario de dominio en `tests/unit/presentismo-vacaciones.test.js`, con fixtures de calibración uno a uno con los Acceptance Scenarios del spec, cubriendo: `expandirDiasCorridos(fechaInicio, cantidadDias)` (lista de fechas `YYYY-MM-DD` corridas, sin filtrar hábil/feriado — Acceptance Scenario US1.1/US1.3), `calcularAntiguedadAnios(fechaIngreso, fechaReferencia)` (años completos), `diasPorAntiguedad(escalaAntiguedad, aniosAntiguedad)` (US3.1: 6 años → 21 días con la escala LCT), `aplicarIncremento(saldo, dias)` y `aplicarAsignacion(saldo, dias)`/`aplicarReversion(saldo, dias)` (US1.2: saldo 3 − 5 = −2; US3.2: −2 + 14 = 12, nunca clampeado a 0), `construirAsignacion(...)`/`construirMovimientoSaldo(...)` (forma de data-model.md §4.1/§5).
- [X] T006 [US-fnd] Implementar `src/presentismo/domain/vacaciones.js` con las funciones puras de T005: `expandirDiasCorridos`, `calcularAntiguedadAnios`, `diasPorAntiguedad`, `aplicarIncremento`, `aplicarAsignacion`, `aplicarReversion`, `construirAsignacion`, `construirMovimientoSaldo`, `proximoIncremento(incrementoAnualConfig, fechaReferencia)` (próxima fecha del ciclo, para FR-008/US2). Debe hacer pasar T005.

### Extensión del padrón con `fechaIngreso` (feature 003)

- [X] T007 [P] Test unitario en `tests/unit/roster-fecha-ingreso.test.js`: normalización de `fechaIngreso` nula/vacía/no parseable a `null` sin descartar el legajo, tanto en la fila cruda de Oracle como en el snapshot local `padron.json` (contracts/oracle-roster-fecha-ingreso.md).
- [X] T008 [US-fnd] Extender `src/db/oracle-roster-config.js` con una columna opcional configurable para fecha de ingreso (mismo patrón que `columnaCategoria`/`columnaNombre`, ej. `columnaFechaIngreso`/`RRHH_ORACLE_COLUMNA_FECHA_INGRESO`), y `src/db/oracle-roster-repository.js`: extender `fetchLegajosConCategoria()`/`extraerFilasConCategoria` para proyectar y devolver también la fecha de ingreso cruda cuando la columna está configurada (solo lectura, Principio II; sin nueva escritura a Oracle).
- [X] T009 [US-fnd] Extender `src/presentismo/adapters/oracle-employee-category-provider.js`: el cache y `listar()` deben incluir `fechaIngreso` (normalizada a `'YYYY-MM-DD'` o `null` si falta/inválida, sin descartar el legajo) junto a `codigoCategoria`/`nombre`.
- [X] T010 [US-fnd] Extender `src/presentismo/adapters/file-padron-category-provider.js`: `guardarSnapshotPadron` persiste `fechaIngreso` por legajo en `empleados` del snapshot (`data/presentismo/padron.json` y `P<periodo>/padron.json`); `construirMapa`/`listar()`/`obtenerCategoria()` la exponen igual que `categoria`/`nombre`.
- [X] T011 [US-fnd] Extender `src/roster/local-file-active-employees-provider.js`: al leer el snapshot `{ empleados: [...] }`, incluir `fechaIngreso` (normalizada a `null` si falta) en cada `{ legajo, activo, fechaIngreso }` devuelto por `getActiveEmployees()`, sin romper el esquema legacy `{ legajosActivos: [...] }` (que sigue devolviendo `fechaIngreso: null` para todos). Debe hacer pasar T007.
- [X] T012 [P] [US-fnd] ~~Extender `src/roster/oracle-active-employees-provider.js`~~ — **decisión de alcance**: se investigó el pipeline real y `oracle-active-employees-provider.js`/`fetchLegajosActivos()` NO es el camino que produce `padron.json` en este sistema (eso lo hace `cmdSincronizarPadron` vía `oracle-employee-category-provider.js`/`fetchLegajosConCategoria`, ya extendido en T008-T009); ese proveedor solo lo consumen `consulta-programada.js`/`smoke-oracle-roster.js` para un propósito no relacionado con vacaciones (polling del reloj). Forzar `fechaIngreso` ahí exigiría cambiar `fetchLegajosActivos()` de columna única a multi-columna, rompiendo tests estables de una consulta ajena a esta feature, sin ningún beneficio observable para `GET /api/vacaciones` (que lee `ctx.activeEmployeesProvider`, servido por T011). `daily-cached-active-employees-provider.js` ya es un passthrough puro (no toca la forma de `Empleado`), por lo que no requiere cambios. Se documenta la decisión acá en vez de tocar código sin necesidad (YAGNI).

### Persistencia de saldo/asignaciones de vacaciones

- [X] T013 [US-fnd] Agregar el puerto `VacacionesRepository` a `src/presentismo/ports/index.js` (mismo patrón que `PresentismoRepository`): documentar en JSDoc y agregar a `METODOS` los métodos `cargarLegajo(legajo)`, `guardarLegajo(legajo, datosLegajo)`, `guardarAsignacion(asignacion)`, `cargarAsignacion(id)`, `listarAsignaciones(legajo?)`, `revertirAsignacion(id, {autor, fechaHora})`.
- [X] T014 [P] [US-fnd] Test unitario en `tests/unit/presentismo-vacaciones-repository.test.js`: `file-vacaciones-repository.js` lee/escribe `data/presentismo/vacaciones.json` (forma de research.md §3: `{ legajos: { "<legajo>": { saldo, ultimoIncrementoAplicado, movimientos } }, asignaciones: [] }`), escritura atómica (temp+rename), legajo inexistente devuelve saldo implícito `0` sin movimientos (edge case "legajo nuevo").
- [X] T015 [US-fnd] Implementar `src/presentismo/adapters/file-vacaciones-repository.js` (`createFileVacacionesRepository({ repoDir })`) cumpliendo el puerto `VacacionesRepository` de T013, mismo patrón de lectura completa + escritura atómica que `file-presentismo-repository.js`. Debe hacer pasar T014 y `assertCumplePuerto('VacacionesRepository', ...)`.

**Checkpoint**: dominio puro, config, extensión de padrón y persistencia de vacaciones completos y testeados — las historias de usuario ya pueden construirse sobre esto.

---

## Phase 3: User Story 1 - Asignar un período de vacaciones a un empleado (Priority: P1) 🎯 MVP

**Goal**: un responsable asigna fecha de inicio + cantidad de días corridos a un legajo; se descuenta el saldo, se marca `Vacaciones`/`No paga` cada día del rango (multi-período incluido) y queda registrada la asignación con autor y fecha/hora.

**Independent Test**: legajo con saldo positivo → asignar 7 días → saldo baja en 7, los 7 días (hábiles o no) quedan `Vacaciones` en el calendario, la asignación queda registrada con autor y fecha/hora (quickstart.md Escenario 1).

### Tests para User Story 1 (test-first)

- [X] T016 [P] [US1] Test de contrato en `tests/contract/web-api-vacaciones.test.js` (arrancar este archivo, se completa en US2-US4): `POST /api/vacaciones/asignaciones` — **200** con `saldoResultante` correcto; **400** `VACACIONES_INVALIDA` sin `fechaInicio`/con `cantidadDias <= 0`; **404** `CALENDARIO_NO_GENERADO` si algún período tocado no tiene calendario; **409** `PERIODO_CERRADO` si algún período tocado está cerrado; **409** `VACACIONES_SUPERPUESTA` listando fechas en conflicto si algún día ya tiene Justificación vigente (genérica o espejo), sin dejar registro parcial.
- [X] T017 [P] [US1] Test de integración en `tests/integration/vacaciones.integration.test.js` (arrancar este archivo, se completa en US4): asignar vacaciones con un rango que cruza de un período a otro (Acceptance Scenario US1.3) → verificar que ambos `P<periodo>/calendario.json` tienen la Justificación-espejo `motivoId: 'vacaciones-anual'`/`tipoPago: 'No paga'` en los días que corresponden a cada uno, y que el resumen de período (`resumen-presentismo.js`/`resumen-periodo.js`, sin cambios de código) computa esos días como `Ausencias` y nunca `Licencia` (Acceptance Scenario US1.6, FR-006).

### Implementación de User Story 1

- [X] T018 [US1] Agregar `asignarVacaciones({ legajo, fechaInicio, cantidadDias, autor })` en `src/presentismo/service/calcular-presentismo-service.js`: expande con `expandirDiasCorridos` (T006), agrupa por período con `periodoDeFecha` (ya existente en el propio archivo), valida TODO O NADA antes de escribir nada — cada período tocado con calendario generado (`CALENDARIO_NO_GENERADO`) y abierto (`exigirPeriodoAbierto`/`PERIODO_CERRADO`, mismo criterio que `cargarJustificacion`) y ningún día con Justificación vigente (`justificacionVigenteDe` de `justificacion.js`, código `VACACIONES_SUPERPUESTA` con la lista completa de fechas en conflicto) — y solo entonces: aplica el incremento perezoso (research.md §4, ver T023) sobre el saldo del legajo (`ctx.vacacionesRepo`), crea la Asignación (data-model.md §5) vía `construirAsignacion`, una Justificación-espejo por fecha vía `crearJustificacion()` (motivo fijo `{id:'vacaciones-anual', etiqueta:'Vacaciones', tipoPago:'No paga'}`, `origenCarga: {asignacionVacacionesId}`) guardada con `repo.guardarJustificacion` por período, y el `MovimientoSaldo` tipo `asignacion` (`aplicarAsignacion`).
- [X] T019 [US1] Implementar `src/web/api/vacaciones-handlers.js` con `registrarRutas(router, ctx)`: `POST /api/vacaciones/asignaciones` (valida `legajo`/`fechaInicio`/`cantidadDias` → 400 `VACACIONES_INVALIDA`; delega en `ctx.service.asignarVacaciones`; traduce `CALENDARIO_NO_GENERADO`→404, `PERIODO_CERRADO`/`VACACIONES_SUPERPUESTA`→409, mismo patrón `relanzarComoApiError` que `justificaciones-handlers.js`), según contracts/web-api.md.
- [X] T020 [US1] Registrar las rutas de vacaciones en `src/web/server.js` (`import { registrarRutas as registrarRutasVacaciones } from './api/vacaciones-handlers.js'` + `registrarRutasVacaciones(router, ctx)`) y cablear `ctx.vacacionesConfig` (T004, `loadVacacionesConfig('./config/vacaciones.json')`, override por env var `PRESENTISMO_VACACIONES_CONFIG` mismo criterio que `motivosAusenciaConfigPath`) y `ctx.vacacionesRepo` (T015) en `src/web/wiring.js`.
- [X] T021 [US1] Agregar el guardrail de origen en `src/web/api/justificaciones-handlers.js`: `DELETE /api/justificaciones` rechaza con **409** `JUSTIFICACION_ES_VACACIONES` si el registro vigente en `legajo`/`fecha` tiene `motivoId === 'vacaciones-anual'`, indicando que debe revertirse vía `DELETE /api/vacaciones/asignaciones/{id}` (research.md §1).
- [X] T022 [P] [US1] Frontend: crear `frontend/src/api/vacaciones-client.js` con `crearClienteVacaciones({fetchImpl, base})`: `asignarVacaciones(legajo, {fechaInicio, cantidadDias, autor})` (POST), mismo patrón de manejo de error que `justificaciones-client.js` (se completa con más métodos en US2/US4).
- [X] T023 [P] [US1] Frontend: crear `frontend/src/components/FormularioAsignarVacaciones.jsx` (fecha de inicio + cantidad de días, "Guardar" deshabilitado sin ambos campos válidos, muestra el error del backend tal cual — mismo patrón que `FormularioJustificacion.jsx`) + `frontend/src/components/FormularioAsignarVacaciones.test.jsx`.

**Checkpoint**: User Story 1 funcional y testeable de forma independiente (asignar vacaciones, ver el efecto en saldo/calendario/resumen).

---

## Phase 4: User Story 2 - Consultar el saldo y el historial de vacaciones de cada empleado (Priority: P2)

**Goal**: página anual que lista, por legajo activo, antigüedad, saldo actual, próximo incremento y el historial completo de movimientos.

**Independent Test**: abrir la página con legajos de distinta antigüedad/saldo y verificar que se listan correctamente, incluido el legajo sin `fechaIngreso` señalado como pendiente sin bloquear el resto (quickstart.md Escenario 3.4, Acceptance Scenario US2.3).

### Tests para User Story 2

- [X] T024 [P] [US2] Extender `tests/contract/web-api-vacaciones.test.js`: `GET /api/vacaciones` → **200** con `{legajo, fechaIngreso, antiguedadAnios, saldo, proximoIncremento, pendienteFechaIngreso}` por legajo activo, marcando `pendienteFechaIngreso: true`/resto `null` para un legajo sin `fechaIngreso` sin romper el listado (Acceptance Scenario US2.3); `GET /api/vacaciones/{legajo}` → **200** con `{legajo, saldo, movimientos, asignaciones}` completo (Acceptance Scenario US2.2), según contracts/web-api.md.

### Implementación de User Story 2

- [X] T025 [US2] Agregar `listarVacaciones()` (recorre legajos activos de `ctx.activeEmployeesProvider`, aplica el incremento perezoso a cada uno — ver T027 — y arma `{legajo, fechaIngreso, antiguedadAnios, saldo, proximoIncremento, pendienteFechaIngreso}`) y `consultarVacaciones(legajo)` (aplica el incremento perezoso y devuelve `{legajo, saldo, movimientos, asignaciones}` desde `ctx.vacacionesRepo`) en `src/presentismo/service/calcular-presentismo-service.js`.
- [X] T026 [US2] Agregar `GET /api/vacaciones` y `GET /api/vacaciones/{legajo}` en `src/web/api/vacaciones-handlers.js`, delegando en T025. Debe hacer pasar T024.
- [X] T027 [P] [US2] ~~Agregar `construirVistaVacaciones`/`construirHistorialVacaciones` en `view-model.js`~~ — **evaluado, no necesario**: la respuesta de `GET /api/vacaciones`/`GET /api/vacaciones/{legajo}` (T026) ya tiene exactamente la forma que necesita la UI (T029-T030); agregar un view-model que solo reenvíe los mismos campos sería una capa sin propósito (YAGNI).
- [X] T028 [P] [US2] Frontend: agregar `obtenerVacaciones()`/`obtenerHistorialVacaciones(legajo)` a `frontend/src/api/vacaciones-client.js` (GET). — ya incluido en T022 (`listar()`/`consultar(legajo)`), construido junto con el resto del cliente.
- [X] T029 [P] [US2] Frontend: crear `frontend/src/components/TablaVacaciones.jsx` (legajo, antigüedad, saldo, próximo incremento, fila señalada si `pendienteFechaIngreso`) + `TablaVacaciones.test.jsx`, mismo patrón que `TablaResumenPeriodo.jsx`.
- [X] T030 [P] [US2] Frontend: crear `frontend/src/components/HistorialVacaciones.jsx` (movimientos de un legajo: tipo, fecha, días, saldo resultante) + `HistorialVacaciones.test.jsx`.
- [X] T031 [US2] Frontend: crear `frontend/src/components/PaginaVacaciones.jsx` que compone `TablaVacaciones` + `FormularioAsignarVacaciones` (T023) + `HistorialVacaciones`, actualiza la fila del legajo tras asignar sin recargar toda la página (quickstart.md Escenario 5.3) + `PaginaVacaciones.test.jsx`.
- [X] T032 [US2] Agregar la entrada "Vacaciones" a `SECCIONES`/`TITULOS` en `frontend/src/components/AppShell.jsx` y montar `PaginaVacaciones` en `frontend/src/App.jsx` (mismo patrón que `PaginaConfiguracion`), incluyendo el ícono de antd correspondiente.

**Checkpoint**: User Stories 1 y 2 funcionan juntas de forma independiente (asignar y consultar saldo/historial).

---

## Phase 5: User Story 3 - Incremento automático anual del saldo según antigüedad (Priority: P2)

**Goal**: el saldo de cada legajo activo con `fechaIngreso` se incrementa automáticamente al alcanzar la fecha configurada, según la escala de antigüedad, de forma perezosa e idempotente.

**Independent Test**: fecha de incremento configurada cercana/pasada + legajo con antigüedad conocida → el saldo sube en la cantidad de días de la escala, queda un `MovimientoSaldo` tipo `incremento`, y una segunda consulta no lo duplica (quickstart.md Escenario 3).

### Tests para User Story 3

- [X] T033 [P] [US3] Extender `tests/unit/presentismo-vacaciones.test.js` (o archivo nuevo `tests/unit/presentismo-vacaciones-incremento.test.js`): función de aplicación del incremento perezoso — dado `ultimoIncrementoAplicado` y la fecha de incremento configurada, determina si corresponde aplicar uno o más ciclos pendientes (Acceptance Scenario US3.1/US3.2), es no-op si ya está al día (idempotencia), y NO aplica a legajos `activo:false` ni sin `fechaIngreso` (FR-012, Acceptance Scenario US3.4).
- [X] T034 [P] [US3] Extender `tests/integration/vacaciones.integration.test.js`: forzar `incrementoAnual` a una fecha pasada en `config/vacaciones.json` de test, llamar `GET /api/vacaciones/{legajo}` dos veces seguidas y verificar que el segundo `movimientos` no duplica el incremento (quickstart.md Escenario 3.1/3.2).

### Implementación de User Story 3

- [X] T035 [US3] Implementar la función de incremento perezoso en `src/presentismo/domain/vacaciones.js` (o el service, según T033): dado el legajo (`fechaIngreso`, `activo`), su estado de saldo (`ultimoIncrementoAplicado`) y la config (`incrementoAnual`, `escalaAntiguedad`), calcula los ciclos de incremento pendientes (uno por año calendario ya alcanzado desde el último aplicado) y produce los `MovimientoSaldo` tipo `incremento` correspondientes (`antiguedadAnios` a la fecha de CADA ciclo, no la de hoy — edge case "cambio de antigüedad dentro del propio año"). Debe hacer pasar T033.
- [X] T036 [US3] Invocar el incremento perezoso de T035 al inicio de `asignarVacaciones` (T018), `listarVacaciones`/`consultarVacaciones` (T025) y `revertirAsignacionVacaciones` (T038) en `calcular-presentismo-service.js`, persistiendo el resultado en `ctx.vacacionesRepo` ANTES de continuar con la operación pedida (research.md §4). Debe hacer pasar T034.
- [X] T037 [US3] Verificar que un legajo con `fechaIngreso` cargada DESPUÉS de que ya pasó el incremento del ciclo en curso no lo recibe retroactivamente — cubierto por el test `calcularIncrementosPendientes: legajo nunca incrementado, sin backfill de años previos a fechaIngreso ni del ciclo ya pasado antes de conocerse` (T033, `tests/unit/presentismo-vacaciones.test.js`). **Decisión**: no se agrega un campo nuevo a `GET /api/vacaciones` para este caso puntual — `contracts/web-api.md` no lo define, `proximoIncremento` ya deja ver el próximo ciclo que le corresponde, y agregar una señal no pedida por el contrato sería alcance no solicitado (YAGNI).

**Checkpoint**: el saldo se mantiene correcto automáticamente sin carga manual; las historias 1-3 funcionan juntas.

---

## Phase 6: User Story 4 - Revertir una asignación de vacaciones cargada por error (Priority: P3)

**Goal**: revertir una asignación vigente repone el saldo, quita la marca `Vacaciones` del calendario y deja la asignación visible como no vigente con quién/cuándo la revirtió.

**Independent Test**: asignación vigente de 5 días → revertir → saldo recupera los 5 días, esos días dejan de estar `Vacaciones`, la asignación queda visible como revertida (quickstart.md Escenario 4).

### Tests para User Story 4

- [X] T038 [P] [US4] Completar `tests/contract/web-api-vacaciones.test.js`: `DELETE /api/vacaciones/asignaciones/{id}` → **200** `{id, revertida:true, saldoResultante}`; **404** `VACACIONES_NO_ENCONTRADA` si el `id` no existe o ya no está vigente (Acceptance Scenario US4.2).
- [X] T039 [P] [US4] Completar `tests/integration/vacaciones.integration.test.js`: asignar → revertir → `GET /api/resumen-periodo/{legajo}` ya no muestra Justificación vigente esos días (vuelven a "Sin fichadas") → repetir el `DELETE` sobre el mismo `id` da 404 → `DELETE /api/justificaciones` apuntando a un día de una asignación TODAVÍA vigente da 409 `JUSTIFICACION_ES_VACACIONES` (quickstart.md Escenario 4, valida también T021).

### Implementación de User Story 4

- [X] T040 [US4] Agregar `revertirAsignacionVacaciones({ id, autor })` en `src/presentismo/service/calcular-presentismo-service.js`: busca la asignación vigente por `id` (404 `VACACIONES_NO_ENCONTRADA` si no existe o ya no vigente), revierte cada Justificación-espejo que generó vía `repo.revertirJustificacion` (día por día, por período), marca la Asignación como no vigente con `{autor, fechaHora}` en `reversion` (data-model.md §5), y agrega el `MovimientoSaldo` tipo `reversion` (`aplicarReversion`) que repone `cantidadDias` al saldo.
- [X] T041 [US4] Agregar `DELETE /api/vacaciones/asignaciones/{id}` en `src/web/api/vacaciones-handlers.js`, delegando en T040. Debe hacer pasar T038/T039.
- [X] T042 [P] [US4] Frontend: agregar `revertirAsignacionVacaciones(id, {autor})` a `frontend/src/api/vacaciones-client.js` (DELETE). — ya incluido en T022 (`revertir(id, {autor})`), construido junto con el resto del cliente.
- [X] T043 [US4] Frontend: exponer la acción de revertir en `HistorialVacaciones.jsx` (T030) para una asignación vigente, refrescando saldo e historial tras confirmar (mismo patrón que la reversión de Justificación en la UI existente).

**Checkpoint**: las 4 historias de usuario funcionan juntas de forma independiente y completa.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: cierre de flancos que cruzan varias historias, sin bloquear ninguna de ellas individualmente.

- [X] T044 [P] Deshabilitar la entrada `vacaciones` del catálogo `config/motivos-ausencia.json` (y `.example.json`) con `activo: false` (FR-018). `GET /api/motivos-ausencia` verificado con 8/9 motivos activos (`tests/contract/web-api-justificaciones.test.js`). La conservación de Justificaciones históricas con motivo desactivado ya está cubierta por la feature 012 (`editarMotivo con activo:false desactiva sin eliminar`, `presentismo-motivos-ausencia-config.test.js`) — mismo mecanismo genérico, sin necesidad de un test nuevo. Actualicé 6 tests preexistentes de 012 que usaban `'vacaciones'` como motivo de ejemplo `Paga` (ahora `'examen'`/`'matrimonio'`), ya que dejó de estar disponible para nuevas cargas.
- [X] T045 [P] Señalar en el calendario/resumen del legajo las fichadas nuevas que lleguen para un día marcado `Vacaciones` (FR-017). Se descubrió durante US1 (T017) que `aplicarAjustes` (`src/presentismo/domain/jornada.js`) sólo aplicaba la Justificación sobre días `Laborable`, descartando en silencio la marca `Vacaciones` en días `No Laborable`/`Feriado`; se generalizó para cualquier clasificación (ver también T-jornada tests) y se agregó un test de integración dedicado (`fichadas sobre un día No Laborable marcado Vacaciones señalan revisión, no lo descartan (FR-017)`, `tests/integration/vacaciones.integration.test.js`).
- [X] T046 [P] Logging NDJSON de cada asignación, reversión e incremento automático: se agregaron los tipos de evento `vacaciones_asignacion_alta`, `vacaciones_asignacion_reversion` y `vacaciones_incremento_anual` al allowlist de `presentismo-logger.js`, y las llamadas correspondientes en `asignarVacaciones`/`revertirAsignacionVacaciones`/`aplicarIncrementoPerezoso` (`calcular-presentismo-service.js`), correlacionadas por legajo/asignación, sin datos biométricos ni credenciales.
- [X] T047 Ejecutados los 5 escenarios de `quickstart.md`: Escenarios 1-4 cubiertos por la suite automatizada (`tests/contract/web-api-vacaciones.test.js`, `tests/integration/vacaciones.integration.test.js`); Escenario 5 (UI) verificado en vivo en el navegador contra un backend+frontend real levantados sobre un directorio de datos temporal aislado (no se tocó `data/presentismo/` real): la tabla lista antigüedad/saldo/próximo incremento (con el incremento perezoso ya aplicado y el legajo sin `fechaIngreso` señalado), asignar vacaciones actualiza el saldo de la fila y el historial sin recargar la página, y revertir repone el saldo y marca la asignación como revertida — sin discrepancias encontradas.
- [X] T048 [P] Revisar que ningún endpoint de esta feature expone `rawHex` ni datos biométricos (invariante de contrato de `contracts/web-api.md`) — confirmado por inspección: ningún archivo de la feature (`vacaciones-handlers.js`, `calcular-presentismo-service.js`, `domain/vacaciones.js`, `file-vacaciones-repository.js`) referencia `rawHex`/`template`/`huella`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede arrancar de inmediato.
- **Foundational (Phase 2)**: depende de Setup (usa `config/vacaciones.json` de T001). BLOQUEA todas las historias de usuario.
- **User Stories (Phase 3-6)**: todas dependen de Foundational. US1 es la base funcional pero US2/US3/US4 son testeables de forma independiente una vez completado Foundational + US1 (US2 necesita datos de US1 para tener historial que mostrar; US3 puede probarse con saldo en 0; US4 necesita una asignación de US1 para revertir).
- **Polish (Phase 7)**: depende de que las historias que se vayan a entregar estén completas.

### User Story Dependencies

- **US1 (P1)**: depende solo de Foundational. Es el corazón de la feature — MVP.
- **US2 (P2)**: depende de Foundational; se apoya en datos que genera US1 para tener contenido real que mostrar, pero su propio endpoint (`GET /api/vacaciones`) funciona aunque no haya ninguna asignación todavía (saldo 0 para todos).
- **US3 (P2)**: depende de Foundational; se integra con US1/US2 (el incremento se aplica en los mismos puntos de entrada) pero es verificable por separado con `GET /api/vacaciones/{legajo}`.
- **US4 (P3)**: depende de Foundational y de que exista al menos una asignación (de US1) para poder revertirla.

### Dentro de cada historia

- Tests (T016-T017, T024, T033-T034, T038-T039) se escriben y deben FALLAR antes de la implementación correspondiente.
- Dominio/config antes de servicio; servicio antes de handlers/endpoints; backend antes de frontend.

### Parallel Opportunities

- T001/T002 en paralelo.
- Dentro de Foundational: T003 junto a T005 (tests de módulos distintos); T007 puede escribirse en paralelo a T003/T005; T012 en paralelo al resto de la extensión de padrón una vez exista el contrato base.
- T016/T017 en paralelo (archivos distintos). T022/T023 en paralelo entre sí y con el resto de US1 backend una vez exista el contrato de T019.
- T028/T029/T030 en paralelo (archivos de frontend distintos).
- T044-T046, T048 en paralelo entre sí.

---

## Parallel Example: Foundational Phase

```bash
Task: "Test unitario de validación fail-fast en tests/unit/presentismo-vacaciones-config.test.js"
Task: "Test unitario de dominio en tests/unit/presentismo-vacaciones.test.js"
Task: "Test unitario en tests/unit/roster-fecha-ingreso.test.js"
```

## Parallel Example: User Story 1

```bash
Task: "Test de contrato en tests/contract/web-api-vacaciones.test.js"
Task: "Test de integración en tests/integration/vacaciones.integration.test.js"
# luego de que exista el endpoint:
Task: "Frontend: crear frontend/src/api/vacaciones-client.js"
Task: "Frontend: crear frontend/src/components/FormularioAsignarVacaciones.jsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 solamente)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea todas las historias)
3. Completar Phase 3: User Story 1
4. **PARAR y VALIDAR**: probar User Story 1 de forma independiente (quickstart.md Escenarios 1-2)
5. Deploy/demo si está listo

### Incremental Delivery

1. Setup + Foundational → base lista
2. + US1 → probar independiente → Deploy/Demo (MVP)
3. + US2 → probar independiente → Deploy/Demo
4. + US3 → probar independiente → Deploy/Demo
5. + US4 → probar independiente → Deploy/Demo
6. Polish (Phase 7)

---

## Notes

- [P] = archivos distintos, sin dependencias entre sí.
- [Story] mapea cada tarea a su historia para trazabilidad ([US-fnd] = prerrequisito compartido de Foundational, no pertenece a ninguna historia individual).
- Verificar que los tests fallan antes de implementar.
- Confirmar cada historia de forma independiente en su checkpoint antes de seguir con la siguiente.
- Evitar: tareas vagas, conflictos de archivo entre tareas paralelas, dependencias cruzadas entre historias que rompan su independencia.
