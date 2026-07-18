# Tasks: Página "Fichadas de Hoy"

**Input**: Design documents from `/specs/010-fichadas-hoy/`
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/web-api.md](contracts/web-api.md), [contracts/control-api.md](contracts/control-api.md), [quickstart.md](quickstart.md)

**Tests**: Incluidos. La Constitución (Principio IV) exige test-first en capas críticas;
el cálculo de situación y la extensión de corrección/pausa impactan directamente el
dato de presentismo (liquidación), así que se tratan como críticas — mismo criterio
que la feature 004.

**Organization**: Tareas agrupadas por historia de usuario (spec.md), en orden de
prioridad P1→P4, sobre una fase Foundational compartida.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1 (P1) / US2 (P2) / US3 (P3) / US4 (P4)

## Path Conventions

Web app existente (single repo): backend en `src/`, frontend en `frontend/src/`, tests
en `tests/` (raíz, `node:test`) y `frontend/src/components/*.test.jsx` (Vitest) — ver
plan.md § Project Structure.

---

## Phase 1: Setup

- [X] T001 [P] Documentar las variables de entorno nuevas en `.env.example`:
  `FICHADAS_CONTROL_PORT` (proceso `rs956-fichadas.service`, servidor de control HTTP
  local, default `5006`) y `FICHADAS_CONTROL_URL` (proceso `rs956-web.service`, default
  `http://127.0.0.1:5006`) — research.md §4

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: la proyección de "situación de hoy" y el wiring del contexto web con el
padrón, base de la que dependen las 4 historias.

**⚠️ CRITICAL**: ninguna historia de usuario puede completarse sin esta fase.

- [X] T002 [P] Tests unitarios de `calcularSituacionHoy` (fixtures de calibración
  derivados de los Acceptance Scenarios de la Historia 1 del spec: `ESPERANDO`,
  `PRESENTE`, `TARDE`, `AUSENTE`, jornada `Completa`, `Feriado cumplido`, `No aplica`,
  `ANOMALIA`) en `tests/unit/presentismo-situacion-dia.test.js` — DEBEN fallar antes de
  T003 (Principio IV)
- [X] T003 Implementar `SituacionDia` (enum) y
  `calcularSituacionHoy({ clasificacion, auto, ajustado, ahora, params })` en
  `src/presentismo/domain/situacion-dia.js` (research.md §1) — depende de T002
- [X] T004 [P] Extender `crearContextoWeb` en `src/web/wiring.js` para construir un
  `ActiveEmployeesProvider` (adapter `local-file-active-employees-provider.js` sobre el
  snapshot del padrón ya usado por 004) y pasarlo, junto con un
  `EmployeeCategoryProvider` y un `FichadasProvider` sobre el archivo acumulativo del
  período (`archive-fichadas-provider.js`, ya existente), a
  `createCalcularPresentismoService` — hoy el contexto web no cablea ninguno de los
  tres (research.md §5)
- [X] T005 Agregar `calcularHoy(periodo, fecha, legajos)` a
  `src/presentismo/service/calcular-presentismo-service.js`: por cada legajo, llama
  `calcularEmpleado`, ubica la jornada de `fecha` en `resumen.jornadas`, y aplica
  `calcularSituacionHoy` — depende de T003, T004
- [X] T006 [P] Agregar `construirVistaFichadasHoy({ fecha, diaClasificacion, filas })`
  y `construirFilaFichadaHoy(...)` a `src/web/view-model.js`, produciendo la forma de
  `VistaFichadasHoy`/`FilaFichadaHoy` de data-model.md — depende de T005
- [X] T007 Crear `src/web/api/fichadas-hoy-handlers.js` con un `registrarRutas(router,
  ctx)` vacío y registrarlo desde `src/web/server.js` (mismo patrón que
  `calendario-handlers.js`) — depende de T006

**Checkpoint**: la base de cálculo y el wiring web están listos; las historias pueden
avanzar en orden de prioridad.

---

## Phase 3: User Story 1 - Ver el estado de asistencia del día (Priority: P1) 🎯 MVP

**Goal**: un administrador ve, para el día en curso, legajo/nombre/entrada/salida/horas
trabajadas/situación de todos los empleados esperados, en una sola pantalla.

**Independent Test**: con fichadas ya cargadas en el archivo del período actual,
`GET /api/fichadas-hoy` devuelve la lista correcta y la página la renderiza sin
necesitar ninguna acción de escritura.

### Tests for User Story 1

- [X] T008 [P] [US1] Test de contrato para `GET /api/fichadas-hoy` (200 con la forma de
  `VistaFichadasHoy`, padrón vacío, legajo con anomalía) en
  `tests/contract/web-api-fichadas-hoy.test.js` — DEBE fallar antes de T010
- [X] T009 [P] [US1] Test de integración: fichadas ya en el archivo del período → `GET`
  refleja `ESPERANDO`/`PRESENTE`/`TARDE`/`AUSENTE`/`Completa`/`Feriado cumplido` por
  cada Acceptance Scenario de la Historia 1 en
  `tests/integration/fichadas-hoy.integration.test.js` — DEBE fallar antes de T010

### Implementation for User Story 1

- [X] T010 [US1] Implementar el handler `GET /api/fichadas-hoy` en
  `src/web/api/fichadas-hoy-handlers.js` (usa `ctx.activeEmployeesProvider` +
  `service.calcularHoy` + `construirVistaFichadasHoy`) — depende de T007; hace pasar
  T008/T009
- [X] T011 [P] [US1] Crear `frontend/src/api/fichadas-hoy-client.js` con
  `obtenerFichadasHoy()` (mismo patrón que `calendario-client.js`)
- [X] T012 [P] [US1] Crear `frontend/src/components/TablaFichadasHoy.jsx` (fila por
  empleado: legajo, nombre, entrada, salida, horas trabajadas, situación con
  distinción visual por clave, mismo criterio de accesibilidad que `Leyenda.jsx`)
- [X] T013 [US1] Crear `frontend/src/components/PaginaFichadasHoy.jsx`: carga al
  montar vía `fichadas-hoy-client`, estados cargando/con-datos/error, renderiza
  `TablaFichadasHoy` — depende de T011, T012
- [X] T014 [US1] Agregar navegación simple (dos pestañas, sin librería de ruteo nueva)
  en `frontend/src/App.jsx` para alternar entre "Calendario" y "Fichadas de hoy",
  montando `PaginaFichadasHoy` — depende de T013
- [X] T015 [P] [US1] Tests de componente para `TablaFichadasHoy` (situación correcta
  por fila, sin datos personales de más) en
  `frontend/src/components/TablaFichadasHoy.test.jsx`
- [X] T016 [P] [US1] Test de componente para `PaginaFichadasHoy` (carga, error,
  reintento) en `frontend/src/components/PaginaFichadasHoy.test.jsx`

**Checkpoint**: US1 entrega la página de solo lectura, completa y demostrable.

---

## Phase 4: User Story 2 - Corregir manualmente un horario con justificación (Priority: P2)

**Goal**: un administrador corrige la hora de entrada y/o salida de un empleado,
dejando motivo obligatorio, y la corrección queda auditada y prevalece sobre fichadas
posteriores del mismo campo.

**Independent Test**: sobre la lista de US1, `POST
/api/fichadas-hoy/correcciones` con motivo actualiza la fila; sin motivo, se rechaza
con 400 y nada se persiste.

### Tests for User Story 2

- [X] T017 [P] [US2] Tests unitarios de `crearCorreccion`/`aplicarAjustes` extendidos
  para aceptar `entradaCorregida`/`salidaCorregida` (recomputa entrada/salida efectiva
  y el total) en `tests/unit/presentismo-correccion.test.js` y
  `tests/unit/presentismo-jornada.test.js` — DEBEN fallar antes de T020/T021
- [X] T018 [P] [US2] Test de contrato para `POST /api/fichadas-hoy/correcciones` (400
  sin motivo, 400 formato de hora inválido, 409 sin categoría, 200 fila recalculada)
  en `tests/contract/web-api-fichadas-hoy.test.js` — DEBE fallar antes de T023
- [X] T019 [P] [US2] Test de integración: la corrección persiste con autor/motivo/valor
  anterior-nuevo y prevalece frente a una fichada real posterior del mismo campo (spec,
  edge case) en `tests/integration/fichadas-hoy.integration.test.js` — DEBE fallar
  antes de T023

### Implementation for User Story 2

- [X] T020 [US2] Extender `crearCorreccion` en `src/presentismo/domain/correccion.js`
  para aceptar `entradaCorregida`/`salidaCorregida` (minutos-del-día) — depende de T017
- [X] T021 [US2] Extender `aplicarAjustes` en `src/presentismo/domain/jornada.js` para
  recalcular `entradaEfectiva`/`salidaEfectiva` y el total a partir de la corrección de
  entrada/salida, cuando estén presentes — depende de T020
- [X] T022 [US2] Extender `cargarCorreccion` en
  `src/presentismo/service/calcular-presentismo-service.js` para aceptar
  entrada/salida en `'HH:MM'` (parseadas con `tiempo.js`) — depende de T021
- [X] T023 [US2] Implementar el handler `POST /api/fichadas-hoy/correcciones` en
  `src/web/api/fichadas-hoy-handlers.js` (validación y códigos de `ApiError` por
  contracts/web-api.md) — depende de T022; hace pasar T018/T019
- [X] T024 [P] [US2] Agregar `corregir(legajo, { fecha, entrada, salida, autor,
  motivo })` a `frontend/src/api/fichadas-hoy-client.js`
- [X] T025 [US2] Crear `frontend/src/components/FormularioCorreccion.jsx` (campos
  entrada/salida + motivo obligatorio; deshabilita "Guardar" sin motivo) — depende de
  T024
- [X] T026 [US2] Integrar `FormularioCorreccion` en `TablaFichadasHoy`/
  `PaginaFichadasHoy` (abrir por fila, refrescar la fila tras guardar) — depende de
  T025, T013
- [X] T027 [P] [US2] Tests de componente para `FormularioCorreccion` (rechazo sin
  motivo, envío exitoso) en `frontend/src/components/FormularioCorreccion.test.jsx`

**Checkpoint**: US1 y US2 funcionan de forma independiente y en conjunto.

---

## Phase 5: User Story 3 - Registrar pausa intermedia o retiro anticipado (Priority: P3)

**Goal**: un administrador agrega una pausa intermedia o marca un retiro anticipado,
ambos con motivo obligatorio, y el efecto se refleja en horas trabajadas y situación.

**Independent Test**: sobre una fila con entrada/salida ya determinadas, `POST
/api/fichadas-hoy/pausas` descuenta horas dentro de la jornada efectiva; `POST
/api/fichadas-hoy/retiros-anticipados` marca `situacion: "RETIRO_ANTICIPADO"`.

### Tests for User Story 3

- [X] T028 [P] [US3] Tests unitarios del campo `tipo` en Pausa (`descuentoPausas` sin
  cambios de comportamiento; `retiro_anticipado` con `hasta = cierreOficial`) en
  `tests/unit/presentismo-pausa.test.js` — DEBEN fallar antes de T032
- [X] T029 [P] [US3] Tests unitarios: `calcularSituacionHoy` con una pausa vigente
  `tipo: 'retiro_anticipado'` para el día → `RETIRO_ANTICIPADO` (extiende
  `tests/unit/presentismo-situacion-dia.test.js` de T002) — DEBEN fallar antes de T033
- [X] T030 [P] [US3] Tests de contrato para `POST /api/fichadas-hoy/pausas` y `POST
  /api/fichadas-hoy/retiros-anticipados` (400 sin motivo, 400 `desde >= hasta` / hora
  posterior al cierre, 200) en `tests/contract/web-api-fichadas-hoy.test.js` — DEBEN
  fallar antes de T035
- [X] T031 [P] [US3] Test de integración: la pausa descuenta horas dentro de la
  jornada efectiva; el retiro anticipado marca la situación y no duplica una salida
  real fichada después (spec, edge case) en
  `tests/integration/fichadas-hoy.integration.test.js` — DEBE fallar antes de T035

### Implementation for User Story 3

- [X] T032 [US3] Agregar el campo `tipo: 'intermedia' | 'retiro_anticipado'` (default
  `'intermedia'`) a la forma de Pausa en `src/presentismo/domain/pausa.js` y su paso a
  través en `src/presentismo/adapters/file-presentismo-repository.js` — depende de T028
- [X] T033 [US3] Extender `calcularSituacionHoy` para priorizar `RETIRO_ANTICIPADO`
  cuando exista una pausa vigente con `tipo: 'retiro_anticipado'` para el día — depende
  de T029, T032
- [X] T034 [US3] Agregar `cargarRetiroAnticipado({ periodo, legajo, fecha, hora, autor,
  motivo })` a `calcular-presentismo-service.js`: deriva `hasta` del `cierreOficial` de
  la modalidad del empleado ese día y delega en `cargarPausa` con `tipo:
  'retiro_anticipado'` — depende de T033
- [X] T035 [US3] Implementar los handlers `POST /api/fichadas-hoy/pausas` y `POST
  /api/fichadas-hoy/retiros-anticipados` en `fichadas-hoy-handlers.js` — depende de
  T034; hace pasar T030/T031
- [X] T036 [P] [US3] Agregar `agregarPausa(...)` y `registrarRetiroAnticipado(...)` a
  `frontend/src/api/fichadas-hoy-client.js`
- [X] T037 [US3] Crear `frontend/src/components/FormularioPausaRetiro.jsx` (dos modos:
  pausa intermedia / retiro anticipado; motivo obligatorio en ambos) — depende de T036
- [X] T038 [US3] Integrar `FormularioPausaRetiro` en `PaginaFichadasHoy`/
  `TablaFichadasHoy` — depende de T037, T013
- [X] T039 [P] [US3] Tests de componente para `FormularioPausaRetiro` en
  `frontend/src/components/FormularioPausaRetiro.test.jsx`

**Checkpoint**: US1, US2 y US3 funcionan de forma independiente.

---

## Phase 6: User Story 4 - Consultar nuevas fichadas al reloj (Priority: P4)

**Goal**: un administrador dispara bajo demanda una consulta de fichadas nuevas al
reloj, sin esperar el ciclo programado, viendo la lista actualizada o un error claro.

**Independent Test**: con el servicio de fichadas (`rs956-fichadas.service`) corriendo
y su servidor de control local activo, `POST /api/fichadas-hoy/consultar-reloj` trae
fichadas nuevas a la vista; con el servicio caído, devuelve 502 sin corromper los datos
existentes.

**Nota de arquitectura** (research.md §4): el servidor web y el servicio de fichadas
son procesos de SO separados en el despliegue real (`deploy/*.service`); esta historia
NO llama a ningún `scheduler` en proceso, sino a un servidor de control HTTP local
nuevo dentro del proceso de fichadas.

### Tests for User Story 4

- [X] T040 [P] [US4] Test unitario: `startService()` expone `tick()` en el handle
  devuelto (hoy solo `{ getState, stop }`) en
  `tests/unit/consulta-programada-service.test.js` — DEBE fallar antes de T044
- [X] T041 [P] [US4] Test de contrato para `POST /tick` del servidor de control (200
  con la forma `{ resultado, fichadasNuevas, detail }`) en
  `tests/contract/control-api.test.js` (contracts/control-api.md) — DEBE fallar antes
  de T045
- [X] T042 [P] [US4] Test de contrato para `POST /api/fichadas-hoy/consultar-reloj`
  (200 con vista actualizada, 502 si el control local no responde) en
  `tests/contract/web-api-fichadas-hoy.test.js` — DEBE fallar antes de T047
- [X] T043 [P] [US4] Test de integración: servidor de control caído → 502 sin alterar
  la vista existente; servidor de control con 2 fichadas nuevas → vista actualizada;
  dos consultas en paralelo → single-flight (una `"ok"`/`"omitido"`, la otra
  `"omitido"`) en `tests/integration/fichadas-hoy.integration.test.js` — DEBE fallar
  antes de T047

### Implementation for User Story 4

- [X] T044 [US4] Exponer `tick` en el handle devuelto por `startService()` en
  `src/service/consulta-programada-service.js` — depende de T040
- [X] T045 [US4] Agregar un servidor de control HTTP local (`node:http`, atado a
  `127.0.0.1`, puerto `FICHADAS_CONTROL_PORT`; si la variable no está seteada, no se
  levanta) con `POST /tick` en `src/cli/consulta-programada.js` — depende de T044; hace
  pasar T041
- [X] T046 [P] [US4] Crear `src/presentismo/service/consultar-reloj-cliente.js`:
  `fetch` `POST` a `FICHADAS_CONTROL_URL` + `/tick`, mapeando errores de conexión a un
  resultado tipado (`{ ok: false, motivo }`) — depende de T045
- [X] T047 [US4] Implementar el handler `POST /api/fichadas-hoy/consultar-reloj` en
  `fichadas-hoy-handlers.js`, usando `consultar-reloj-cliente.js` y traduciendo
  `resultado: "error"` o fallo de conexión a `502 ERROR_CONSULTANDO_RELOJ` — depende de
  T046; hace pasar T042/T043
- [X] T048 [P] [US4] Agregar `consultarReloj()` a
  `frontend/src/api/fichadas-hoy-client.js`
- [X] T049 [US4] Crear `frontend/src/components/BotonConsultarReloj.jsx` (dispara la
  consulta, se deshabilita mientras está en curso, muestra el error sin perder la
  tabla) — depende de T048
- [X] T050 [US4] Integrar `BotonConsultarReloj` en `PaginaFichadasHoy` (refresca la
  vista tras una consulta exitosa) — depende de T049, T013
- [X] T051 [P] [US4] Test de componente para `BotonConsultarReloj` (estado en curso,
  error visible, éxito refresca la tabla) en
  `frontend/src/components/BotonConsultarReloj.test.jsx`

**Checkpoint**: las 4 historias funcionan de forma independiente y en conjunto.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T052 [P] Actualizar `docs/` (o el README relevante de despliegue) con el flujo de
  dos procesos + control local de la Historia 4 (research.md §4)
- [X] T053 Ejecutar manualmente los 4 escenarios de `quickstart.md` de punta a punta y
  registrar el resultado (incluida la verificación de auditoría transversal)
- [X] T054 Revisar que los eventos NDJSON `correccion_alta`/`pausa_alta` (Principio V)
  cubran los campos nuevos (entrada/salida corregidas, `tipo` de pausa) sin datos
  biométricos, en `src/presentismo/service/calcular-presentismo-service.js`
- [X] T055 [P] Revisar `specs/010-fichadas-hoy/checklists/requirements.md`: confirmar
  que ningún supuesto documentado en Assumptions quedó invalidado por el diseño final
  (en particular, el hallazgo de research.md §4 sobre procesos separados)

---

# Iteración 2 — Navegación de días previos, columnas de pausa y modales (2026-07-18)

Delta incremental sobre la implementación ya entregada (T001–T055), derivado de las
clarificaciones del 2026-07-18 (spec.md § Clarifications; plan.md § Iteración 2;
research.md §6–§8). Historias afectadas: **US5** (nueva, navegación), **US1**
(extensión: columnas de pausa, FR-001) y **US2/US3** (extensión: formularios modales,
FR-018).

## Phase 8: Foundational iteración 2 (Blocking Prerequisites)

**Purpose**: el predicado único de navegabilidad de fechas, del que dependen el GET,
los POST de edición y el bloque `navegacion` de la vista.

- [X] T056 [P] Tests unitarios de `fechaNavegable(fecha, { hoy, periodos })` (bordes:
  hoy navegable, mañana no, día de período con calendario navegable, día de período
  sin calendario no, primer día del período más antiguo con calendario) en
  `tests/unit/web-view-model.test.js` (o archivo nuevo
  `tests/unit/fecha-navegable.test.js` si el view-model no tiene test propio) — DEBEN
  fallar antes de T057 (Principio IV: protege el dato que alimenta liquidación)
- [X] T057 Implementar `fechaNavegable(fecha, { hoy, periodos })` y el cálculo del
  bloque `navegacion { anterior, siguiente, esHoy }` en `src/web/view-model.js`,
  incorporándolo a `construirVistaFichadasHoy` (data-model.md, research.md §6) —
  depende de T056

**Checkpoint**: la regla "período de liquidación abierto" vive en un único punto,
lista para extenderse con "y no cerrado" cuando exista el cierre de período.

---

## Phase 9: User Story 5 - Navegar a días previos dentro del período abierto (Priority: P3)

**Goal**: un administrador navega a días anteriores dentro del período de liquidación
abierto con las mismas acciones que el día actual (salvo consultar el reloj); nunca a
días futuros ni a períodos sin calendario.

**Independent Test**: con calendario generado y fichadas de días previos,
`GET /api/fichadas-hoy?fecha=<día previo>` devuelve la vista de ese día con
`esHoy: false`; un `POST` de corrección sobre esa fecha guarda y audita igual que hoy;
una fecha futura o de período sin calendario devuelve 400 `FECHA_FUERA_DE_RANGO`
(quickstart.md, Escenario 5).

### Tests for User Story 5

- [X] T058 [P] [US5] Tests de contrato del GET con fecha: `?fecha=` de día previo
  navegable → 200 con `navegacion` coherente (`esHoy: false`); fecha futura → 400
  `FECHA_FUERA_DE_RANGO`; fecha de período sin calendario → 400
  `FECHA_FUERA_DE_RANGO`; sin `?fecha=` → 200 con `esHoy: true` y `siguiente: null`,
  en `tests/contract/web-api-fichadas-hoy.test.js` — DEBEN fallar antes de T060
- [X] T059 [P] [US5] Tests de contrato de los POST con fecha fuera de rango:
  `POST /correcciones`, `POST /pausas` y `POST /retiros-anticipados` con fecha futura
  o de período sin calendario → 400 `FECHA_FUERA_DE_RANGO` (antes de cualquier otra
  validación de negocio), en `tests/contract/web-api-fichadas-hoy.test.js` — DEBEN
  fallar antes de T061
- [X] T060 [P] [US5] Test de integración: corregir un horario de un día previo
  navegable → 200, la corrección persiste con la fecha del día corregido y
  autor/motivo (auditoría igual que hoy), en
  `tests/integration/fichadas-hoy.integration.test.js` — DEBE fallar antes de T061

### Implementation for User Story 5

- [X] T061 [US5] Validar `fechaNavegable` en `src/web/api/fichadas-hoy-handlers.js`:
  en el GET (tras `validarFecha`) y en los tres POST de edición (tras
  `validarFechaCuerpo`), lanzando `ApiError(400, 'FECHA_FUERA_DE_RANGO', ...)`;
  `vistaHoy` pasa `periodos` (de `ctx.repo.listarPeriodos()`) al view-model para el
  bloque `navegacion` — depende de T057; hace pasar T058/T059/T060
- [X] T062 [P] [US5] Extender `obtenerFichadasHoy(fecha?)` en
  `frontend/src/api/fichadas-hoy-client.js` para agregar `?fecha=` cuando se pasa una
  fecha (sin fecha: comportamiento actual)
- [X] T063 [P] [US5] Crear `frontend/src/components/NavegacionDia.jsx`: fecha visible
  + botones «Día anterior» / «Día siguiente», habilitados según
  `navegacion.anterior`/`navegacion.siguiente` (null = deshabilitado); componente de
  presentación puro (Principio I)
- [X] T064 [US5] Integrar la navegación en
  `frontend/src/components/PaginaFichadasHoy.jsx`: estado de fecha seleccionada,
  `cargar(fecha)` vía el cliente extendido, montar `NavegacionDia` en el encabezado, y
  mostrar `BotonConsultarReloj` solo cuando `navegacion.esHoy` — depende de T062, T063
- [X] T065 [P] [US5] Tests de componente: `NavegacionDia` (botones
  habilitados/deshabilitados según `navegacion`) en
  `frontend/src/components/NavegacionDia.test.jsx`, y en
  `frontend/src/components/PaginaFichadasHoy.test.jsx` los casos "navegar al día
  anterior recarga la vista de esa fecha" y "el botón de consultar reloj no aparece
  cuando esHoy es false"

**Checkpoint**: US5 completa — la página navega días previos con edición y bloquea
futuro/períodos sin calendario (quickstart.md, Escenario 5).

---

## Phase 10: Extensión US1 - Columnas de pausa en la tabla (FR-001)

**Goal**: la tabla muestra «Inicio pausa» / «Fin pausa» con la pausa intermedia
principal del día por empleado, sin cambio de API (research.md §7).

**Independent Test**: con un empleado con una y con dos pausas intermedias, la tabla
muestra la primera por `desde` (con `+N` si hay más) y `—` en filas sin pausa; los
retiros anticipados no aparecen en esas columnas (quickstart.md, Escenario 6, pasos
1–3).

- [X] T066 [P] [US1] Tests de componente de las columnas de pausa: fila sin pausas →
  `—`/`—`; una pausa intermedia → sus horas; dos pausas intermedias → la primera por
  `desde` + indicador `+1`; fila con solo retiro anticipado → `—` (no se muestra en
  estas columnas), en `frontend/src/components/TablaFichadasHoy.test.jsx` — DEBEN
  fallar antes de T067
- [X] T067 [US1] Agregar las columnas «Inicio pausa» / «Fin pausa» a
  `frontend/src/components/TablaFichadasHoy.jsx`, derivando la pausa principal de
  `fila.pausas[]` (primera vigente `tipo: 'intermedia'` ordenada por `desde`; `+N`
  para las adicionales) — depende de T066

**Checkpoint**: la tabla refleja las pausas sin tocar backend ni API.

---

## Phase 11: Extensión US2/US3 - Formularios de edición como modales (FR-018)

**Goal**: corrección, pausa y retiro anticipado se abren como diálogo modal, con el
patrón div+backdrop ya probado en 007 (research.md §8).

**Independent Test**: al hacer click en «Corregir» o «Pausa / Retiro», el formulario
aparece como modal (`role="dialog"`, `aria-modal`); Escape o click en el backdrop lo
cierra sin efecto; el flujo de guardado sigue funcionando igual (quickstart.md,
Escenario 6, paso 4).

- [X] T068 [P] [US2] Tests de componente de `Dialogo`: renderiza contenido con
  `role="dialog"` y `aria-modal="true"`, cierra con Escape y con click en el backdrop
  (llamando `onCerrar`), no cierra con click dentro del contenido, en
  `frontend/src/components/Dialogo.test.jsx` — DEBEN fallar antes de T069
- [X] T069 [US2] Crear `frontend/src/components/Dialogo.jsx` (backdrop + contenedor
  `role="dialog"`/`aria-modal="true"`/etiqueta accesible, cierre por Escape y click en
  backdrop; foco inicial dentro del diálogo) siguiendo el patrón de
  `DialogoConfirmarReclasificar.jsx` — depende de T068
- [X] T070 [US2] Envolver `FormularioCorreccion` y `FormularioPausaRetiro` en
  `Dialogo` desde `frontend/src/components/PaginaFichadasHoy.jsx` (cancelar = cerrar
  el diálogo, sin efecto; los formularios no cambian su lógica interna) — depende de
  T069
- [X] T071 [P] [US3] Ajustar los tests de página existentes para el nuevo patrón modal
  (los formularios se encuentran dentro de un `role="dialog"`) en
  `frontend/src/components/PaginaFichadasHoy.test.jsx`,
  `FormularioCorreccion.test.jsx` y `FormularioPausaRetiro.test.jsx` según haga falta
  — depende de T070

**Checkpoint**: toda la edición de la página pasa por modales consistentes.

---

## Phase 12: Polish iteración 2

- [X] T072 Ejecutar manualmente los Escenarios 5 y 6 de `quickstart.md` de punta a
  punta y registrar el resultado en el propio `quickstart.md` (mismo formato que la
  tabla de T053)
- [X] T073 [P] Correr las suites completas (backend `node --test` y frontend
  `npx vitest run`) confirmando que la iteración 2 no rompe nada de T001–T055

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA todas las historias.
- **User Stories (Phase 3-6)**: dependen de Foundational. Pueden avanzar en paralelo
  por equipo, pero **US2/US3/US4 reutilizan la página creada en US1** (T013) para
  integrar sus formularios/botón, así que en la práctica conviene completar US1 antes
  de integrar la UI de las siguientes (el backend de cada historia sí es independiente
  entre sí).
- **Polish (Phase 7)**: depende de las historias que se decida entregar.
- **Foundational iteración 2 (Phase 8)**: sin dependencias nuevas (la iteración 1 ya
  está entregada) — BLOQUEA la Phase 9 (US5). No bloquea las Phases 10 y 11.
- **US5 (Phase 9)**: depende de Phase 8.
- **Extensión columnas de pausa (Phase 10)** y **modales (Phase 11)**: independientes
  entre sí y de US5 — solo tocan frontend ya existente. Las tres phases 9/10/11
  convergen en `PaginaFichadasHoy.jsx`/`TablaFichadasHoy.jsx` y en
  `PaginaFichadasHoy.test.jsx`: si se trabajan en paralelo, coordinar la integración
  (T064, T067, T070, T071) en serie.
- **Polish iteración 2 (Phase 12)**: depende de Phases 9–11.

### User Story Dependencies

- **US1 (P1)**: solo depende de Foundational.
- **US2 (P2)**: backend independiente de US1; el paso de integración de UI (T026)
  depende de `PaginaFichadasHoy` (T013, US1).
- **US3 (P3)**: backend independiente de US1/US2 (usa `situacion-dia` de Foundational,
  no la extensión de corrección de US2); integración de UI (T038) depende de T013.
- **US4 (P4)**: completamente independiente de US2/US3 en backend; integración de UI
  (T050) depende de T013.

### Within Each User Story

- Tests antes de implementación (Principio IV) — deben fallar primero.
- Dominio → servicio → handler API → cliente frontend → componente → integración UI →
  tests de componente.

### Parallel Opportunities

- T002, T004 (Foundational) en paralelo entre sí (archivos distintos).
- Dentro de cada historia, todos los tests marcados `[P]` en paralelo.
- T011/T012 (US1), T024 (US2), T036 (US3), T046/T048 (US4) en paralelo con otras tareas
  de su fase que no dependan de ellas.
- Backend de US2, US3 y US4 pueden implementarse en paralelo por distintas personas una
  vez completada Foundational (tocan archivos de dominio/servicio distintos entre sí:
  `correccion.js`/`jornada.js` para US2, `pausa.js` para US3,
  `consulta-programada-service.js`/`consulta-programada.js` para US4); solo convergen
  al agregar sus rutas al mismo `fichadas-hoy-handlers.js` y al integrar sus
  componentes en la misma `PaginaFichadasHoy.jsx`.

---

## Parallel Example: User Story 1

```bash
# Tests de US1 en paralelo:
Task: "Contract test for GET /api/fichadas-hoy in tests/contract/web-api-fichadas-hoy.test.js"
Task: "Integration test for Historia 1 in tests/integration/fichadas-hoy.integration.test.js"

# Piezas de frontend de US1 en paralelo (antes de integrarlas en la página):
Task: "Create frontend/src/api/fichadas-hoy-client.js"
Task: "Create frontend/src/components/TablaFichadasHoy.jsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Fase 1: Setup.
2. Completar Fase 2: Foundational (crítica — bloquea todas las historias).
3. Completar Fase 3: User Story 1.
4. **DETENER Y VALIDAR**: correr el Escenario 1 de `quickstart.md`.
5. Demo/deploy si está listo — ya es una página de administración útil, aunque sin
   escritura.

### Incremental Delivery

1. Setup + Foundational → base lista.
2. US1 → validar independientemente → demo (MVP: ver el estado del día).
3. US2 → validar independientemente → demo (agrega corrección auditable).
4. US3 → validar independientemente → demo (agrega pausa/retiro anticipado).
5. US4 → validar independientemente → demo (agrega la consulta manual al reloj).
6. Cada historia suma valor sin romper las anteriores.

### Parallel Team Strategy

Con más de una persona, tras completar Foundational: una persona en US1 (la que
integra `PaginaFichadasHoy`), y en paralelo otras en el *backend* de US2/US3/US4 (no
dependen entre sí ni de la UI de US1) — la integración de cada formulario/botón en la
página queda como último paso de cada historia, una vez que T013 (US1) esté disponible.

### Iteración 2 (MVP y entrega incremental)

1. Phase 8 (fechaNavegable) + Phase 9 (US5) → validar con el Escenario 5 de
   quickstart.md → **entregable por sí solo** (navegación con edición de días previos).
2. Phase 10 (columnas de pausa) → validar con el Escenario 6 pasos 1–3 → entregable.
3. Phase 11 (modales) → validar con el Escenario 6 paso 4 → entregable.
4. Phase 12 cierra la iteración (quickstart 5–6 registrados + suites completas).

Las tres entregas (US5, columnas, modales) son independientes; el orden sugerido
prioriza US5 por ser la única con superficie de backend. En paralelo: T056/T058/T059/
T060 (tests), y las Phases 10 y 11 completas pueden avanzar mientras se implementa la
Phase 9, coordinando en serie solo los toques a `PaginaFichadasHoy.jsx` y sus tests.
