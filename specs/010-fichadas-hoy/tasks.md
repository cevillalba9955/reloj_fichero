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
