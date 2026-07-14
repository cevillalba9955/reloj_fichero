---

description: "Task list template for feature implementation"
---

# Tasks: Servicio de Consulta Programada de Fichadas

**Input**: Design documents from `/specs/002-servicio-fichadas-programado/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (todos presentes)

**Tests**: Incluidos para el scheduler/checkpoints, `ActiveEmployeesProvider` y la deduplicación del store.
No es el default genérico de la plantilla — el plan (`Constitution Check`)
se compromete explícitamente a ordenar tests antes de implementación para
estas capas, en línea con el espíritu del Principio IV de la Constitución
(test-first en capas críticas), ya que `ActiveEmployeesProvider` es la
futura puerta de entrada a Oracle (Principio II), el scheduler es la
lógica central de negocio de esta feature, y la deduplicación por `rawHex`
(FR-017) es una regla de datos no trivial de la que depende la integridad
de todo lo que expone `getState()`.

**Organization**: Tareas agrupadas por historia de usuario (US1/US2/US3, spec.md) para permitir implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: A qué historia de usuario pertenece (US1, US2, US3)
- Cada tarea incluye la ruta de archivo exacta

## Path Conventions

Proyecto único (Node.js, mismo repo que `001-consulta-fichadas-rs596`), según `plan.md`: `src/`, `tests/` en la raíz del repositorio.

**Nota de regeneración (2026-07-07)**: esta versión incorpora FR-017
(deduplicación de fichadas repetidas entre ciclos, comparando `rawHex`),
agregado en la sesión de `/speckit-clarify` del 2026-07-07 y propagado a
`research.md` (§9), `data-model.md` y `quickstart.md` en la re-ejecución de
`/speckit-plan`. Se renumeraron las tareas desde T005 en adelante para
insertar el test y la implementación correspondientes en la fase
Foundational (la deduplicación vive en `FichadasMemoryStore`, usada por
las tres historias de usuario).

> **⚠️ Cambio de modelo (Clarifications 2026-07-14) — REWORK COMPLETADO**:
> la spec pasó de **dos checkpoints con margen simétrico ±30** (entrada
> 07:00 / salida 16:00) a **un único checkpoint "entrada"** con **ventana
> de un solo lado** `[horaEsperada, horaEsperada + duracionMinutos]` (07:00
> → 07:30 por defecto). Las tareas T001–T030 de abajo se completaron en su
> momento contra el modelo anterior; el código en `src/` y sus tests se
> llevaron al modelo nuevo en la **Phase 7 (T031–T035)** al final de esta
> lista (checkpoint único, ventana de un solo lado, estado
> `cerrado_ventana_vencida`, config `duracionMinutos`, eliminación de
> "salida"). `node --test` en verde (265/265).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Inicialización de la estructura de directorios nueva de esta feature

- [X] T001 Crear la estructura de directorios nuevos del plan: `src/roster/`, `src/scheduling/`, `src/store/`, `src/service/`
- [X] T002 [P] Crear un archivo de configuración de ejemplo del padrón de empleados activos en `config/active-employees.example.json` (`{ "legajosActivos": [] }`, ver `contracts/roster-provider-contract.md`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Store en memoria (con deduplicación) y modelo de Checkpoint — infraestructura que TODAS las historias de usuario necesitan

**⚠️ CRITICAL**: Ninguna historia de usuario puede completarse hasta terminar esta fase

### Tests for Foundational layer (escribir PRIMERO, deben fallar antes de implementar — Constitución Principio IV)

- [X] T003 [P] Unit test de la ventana de aceptación de un Checkpoint (ventana de un solo lado `[horaEsperada, horaEsperada + duracionMinutos]`) y su transición `pendiente → abierto → cerrado_ventana_vencida` (con un predicado de completitud fijo en `false`, para no depender todavía del padrón de empleados) en `tests/unit/checkpoint.test.js` (data-model.md §3)
- [X] T004 [P] Unit test de `FichadasMemoryStore`: alta de una Fichada y su agrupación correcta por Empleado (legajo) y por Período (año-mes derivado de `fecha`, con respaldo a fecha de recolección si `fecha` es `null`) en `tests/unit/fichadas-memory-store.test.js` (data-model.md §1, §2, §4; research.md §5)
- [X] T005 [P] Unit test de deduplicación de `FichadasMemoryStore`: agregar dos veces una Fichada con el mismo `rawHex` (simulando que el reloj la vuelve a reportar en un ciclo posterior) resulta en un único registro en el store, sin duplicar en `periodos[]`, en el mismo archivo `tests/unit/fichadas-memory-store.test.js` (FR-017, research.md §9)

### Implementation

- [X] T006 [P] Implementar `FichadasMemoryStore`: alta de Fichadas, agrupación por Empleado/Período, asociación a checkpoint por hora (o por checkpoint abierto al momento de la descarga si `hora` es `null`), y deduplicación por `rawHex` (`Set<rawHex>` que descarta silenciosamente cualquier Fichada ya vista) en `src/store/fichadas-memory-store.js` (depende de T004, T005; hace pasar T004, T005; research.md §6, §9)
- [X] T007 [P] Implementar el módulo `Checkpoint`: configuración (`horaEsperada`/`duracionMinutos`), cálculo de ventana de aceptación de un solo lado, y máquina de estados `pendiente → abierto → cerrado_completo | cerrado_ventana_vencida` con un predicado de completitud inyectable (para no acoplar este módulo al padrón de empleados) en `src/scheduling/checkpoint.js` (depende de T003; hace pasar T003; data-model.md §3)
- [X] T008 Implementar el scheduler: temporizador de 5 minutos, prevención de solapamiento (single-flight, research.md §3), invocación de `runQuerySession` del cliente existente (`001-consulta-fichadas-rs596`), volcado de fichadas al store (que ya deduplica internamente), y evaluación de apertura/cierre de checkpoints en `src/scheduling/scheduler.js` (depende de T006, T007; research.md §2)
- [X] T009 [P] Implementar el registro estructurado de cada ciclo del scheduler (resultado `success`/`error`/`omitido`, cantidad de fichadas nuevas — ya deduplicadas —, duración), reutilizando el patrón NDJSON de `session-logger.js` de `001-consulta-fichadas-rs596`, en `src/logging/service-cycle-logger.js` (FR-015, contracts/service-contract.md)

**Checkpoint**: store en memoria (con deduplicación por `rawHex`) y
máquina de estados de Checkpoint funcionando y testeados de forma
aislada; el scheduler ya sabe sondear cada 5 minutos y evitar
solapamiento, aunque todavía cierra el checkpoint solo por vencimiento de
la ventana (sin padrón de empleados).

---

## Phase 3: User Story 1 - Recolectar fichadas del día automáticamente (Priority: P1) 🎯 MVP

**Goal**: El servicio consulta automáticamente al reloj (reutilizando el cliente de `001-consulta-fichadas-rs596`) mientras el checkpoint "entrada" esté abierto, acumula las fichadas en memoria (sin duplicados), y deja de consultar cuando el checkpoint se cierra (por ahora, cierre solo por vencimiento de la ventana de 30 min — el cierre por completitud es de US2).

**Independent Test**: Arrancar el servicio con un `now()` simulado dentro de la ventana del checkpoint "entrada", contra un mock TCP con fichadas pendientes, y verificar que las fichadas aparecen acumuladas en memoria dentro de los siguientes 5 minutos (sin contarlas dos veces si el mock las repite entre ticks), y que el servicio deja de consultar una vez vencida la ventana del checkpoint.

### Tests for User Story 1 (escribir PRIMERO, deben fallar antes de implementar)

- [X] T010 [P] [US1] Integration test: el servicio consulta al reloj al abrir el checkpoint "entrada", acumula fichadas nuevas en cada tick de 5 minutos, y deja de consultar una vez que la ventana del checkpoint vence, en `tests/integration/consulta-programada-service.integration.test.js`
- [X] T011 [P] [US1] Integration test: si una consulta todavía está en curso, el siguiente tick de 5 minutos no dispara una segunda consulta en paralelo (single-flight) y queda registrado como ciclo `omitido`, en el mismo archivo

### Implementation for User Story 1

- [X] T012 [US1] Implementar el punto de entrada del servicio (`startService(options)` / `stop()`) orquestando scheduler + store + cliente existente en `src/service/consulta-programada-service.js` (depende de T008; contracts/service-contract.md)
- [X] T013 [US1] Implementar una primera versión de `getState()` exponiendo `fechaServicio`, `checkpoints[]` y las fichadas acumuladas (ya deduplicadas) agrupadas en `periodos[]` (sin `empleados[]`/completitud todavía, eso es de US2) en `src/service/consulta-programada-service.js` (depende de T012; contracts/state-schema.json, subconjunto)
- [X] T014 [US1] Integrar el logger de ciclo (T009) en el scheduler/servicio: cada tick registra su resultado, cantidad de fichadas nuevas y duración en `src/scheduling/scheduler.js` (depende de T008, T009) — ya integrado directamente en la implementación de T008 (`registrar()`/`cycleLogger.logCiclo` en cada rama de `tick()`)

**Checkpoint**: User Story 1 funciona de punta a punta contra el mock —
recolección automática dentro de la ventana horaria (sin duplicados) y
cierre por vencimiento de la ventana de 30 min, sin intervención manual.

---

## Phase 4: User Story 2 - Cerrar la ventana de entrada apenas se completa o se cumplen los 30 minutos (Priority: P2)

**Goal**: Además del cierre por vencimiento de la ventana (ya cubierto en US1), el servicio cierra el checkpoint "entrada" apenas todos los empleados activos (obtenidos de `ActiveEmployeesProvider`) ya tengan al menos una fichada dentro de la ventana, y expone a los incompletos sin generar ninguna alerta ni forzar un valor.

**Independent Test**: Simular que ya hay al menos una fichada de todos los empleados activos del padrón dentro de la ventana del checkpoint "entrada", y verificar que el servicio no dispara una consulta adicional en el siguiente ciclo y cierra el checkpoint; y, en el caso contrario, que al vencer la ventana de 30 min sin completar a todos, el servicio los expone como incompletos sin alertar.

### Tests for User Story 2 (escribir PRIMERO, deben fallar antes de implementar)

- [X] T015 [P] [US2] Unit test de `LocalFileActiveEmployeesProvider`: lee el archivo de configuración y expone `getActiveEmployees()`; rechaza con `RosterNoDisponibleError` si el archivo falta o tiene formato inválido, en `tests/unit/local-file-active-employees-provider.test.js` (contracts/roster-provider-contract.md)
- [X] T016 [P] [US2] Integration test: el checkpoint "entrada" se cierra por completitud (`cerrado_completo`) antes de vencer su ventana cuando todos los empleados activos del padrón ya tienen al menos una fichada válida dentro de la ventana, en `tests/integration/consulta-programada-service.integration.test.js`
- [X] T017 [P] [US2] Integration test: al vencer la ventana de 30 min con empleados activos todavía incompletos, el servicio no genera ninguna alerta ni fuerza un valor, y los expone como incompletos en el estado en memoria (FR-007/SC-006), en el mismo archivo
- [X] T018 [P] [US2] Integration test: si `ActiveEmployeesProvider.getActiveEmployees()` falla, el ciclo se registra como `error` (`RosterNoDisponibleError`) y el servicio NO asume un padrón vacío (FR-013), en el mismo archivo

### Implementation for User Story 2

- [X] T019 [P] [US2] Definir la interfaz `ActiveEmployeesProvider` (forma esperada del resultado, validación básica) en `src/roster/active-employees-provider.js` (contracts/roster-provider-contract.md)
- [X] T020 [US2] Implementar `LocalFileActiveEmployeesProvider` (adapter placeholder de archivo local, explícitamente documentado como temporal hasta la integración real con Oracle/RRHH) en `src/roster/local-file-active-employees-provider.js` (depende de T019; hace pasar T015)
- [X] T021 [US2] Integrar el padrón de empleados activos como predicado de completitud real del `Checkpoint`, y manejar `RosterNoDisponibleError` en el scheduler (FR-013) en `src/scheduling/scheduler.js` y `src/scheduling/checkpoint.js` (depende de T007, T008, T020; hace pasar T016/T017/T018)
- [X] T022 [US2] Extender `getState()` para incluir `empleados[]` con su estado de completitud (`completo`/`incompleto`) por checkpoint en `src/service/consulta-programada-service.js` (depende de T013, T021)

**Checkpoint**: US1 y US2 funcionan juntas — el servicio cierra el
checkpoint "entrada" apenas corresponde (completitud o vencimiento de la
ventana), y los empleados incompletos quedan expuestos sin alertas ni
valores forzados.

---

## Phase 5: User Story 3 - Consultar el estado acumulado en memoria (Priority: P3)

**Goal**: `getState()` expone la vista completa y agregada del progreso del día: fichadas por empleado y período, y completitud por checkpoint, sin necesitar leer logs ni código.

**Independent Test**: Consultar `getState()` en distintos momentos del día y verificar que refleja correctamente las fichadas acumuladas (sin duplicados) agrupadas por empleado y período, y qué empleados activos quedan incompletos para cada checkpoint.

### Tests for User Story 3 (escribir PRIMERO, deben fallar antes de implementar)

- [X] T023 [P] [US3] Test que valida que `getState()` cumple la forma completa de `contracts/state-schema.json` (`checkpoints`, `empleados`, `periodos`, `ultimoCiclo`) en `tests/unit/service-state.test.js`
- [X] T024 [P] [US3] Test de agrupación de `periodos[]`: fichadas del mismo legajo en meses distintos quedan en períodos separados, y una fichada con `fecha: null` se agrupa por fecha de recolección marcada con `periodoAproximado: true`, en el mismo archivo

### Implementation for User Story 3

- [X] T025 [US3] Completar `getState()` agregando `periodos[]` (agrupación por legajo+período) y `ultimoCiclo` (diagnóstico del último ciclo del scheduler: `ejecutadoEn`, `resultado`, `fichadasNuevas`, `duracionMs`) en `src/service/consulta-programada-service.js` (depende de T022; hace pasar T023/T024)

**Checkpoint**: Las tres historias de usuario funcionan de forma
independiente y en conjunto contra el mock — el estado en memoria refleja
fielmente la recolección (sin duplicados), la completitud por checkpoint,
y el progreso por período.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validación end-to-end y auditoría de cumplimiento constitucional

- [X] T026 [P] Ejecutar `quickstart.md` completo como checklist formal contra el mock (los cinco escenarios: cierre por completitud, cierre por ventana vencida, no-solapamiento, fallo del padrón de empleados activos, deduplicación de fichadas repetidas) — recorrido explícito realizado el 2026-07-07 con un script descartable que ejercita `startService`/`createLocalFileActiveEmployeesProvider` reales (no solo assertions unitarias) contra un mock TCP; los 5 escenarios OK
- [X] T027 [P] Revisar la lista de "Edge Cases" de `spec.md` uno por uno contra la suite de tests existente y agregar el/los test(s) que falten (arranque del servicio después de la hora esperada de un checkpoint, reinicio a mitad de ventana, fichada que llega al día siguiente para un checkpoint ya cerrado)
- [X] T028 [P] Auditar el logger de ciclo (T009) para confirmar que nunca expone el `rawHex` completo de una Fichada ni credenciales (Constitución, Principio V), con el mismo criterio de test dedicado usado para `session-logger.js` en `001-consulta-fichadas-rs596`
- [X] T029 [P] Documentar en un comentario de cabecera de `local-file-active-employees-provider.js` (y referenciar en el README si existe) que este adapter es temporal y debe reemplazarse por una integración real de Oracle/RRHH detrás de la misma interfaz `ActiveEmployeesProvider`, sin tocar el resto del servicio (research.md §4) — sin README en el repo (igual que 001-consulta-fichadas-rs596); comentario de cabecera ya presente en el archivo
- [X] T030 [P] Agregar un CLI para correr el servicio (`src/cli/consulta-programada.js`)
  que arranca `startService()` con la configuración por flags/env, imprime un resumen
  del estado (`getState()`) al iniciar y periódicamente, y se detiene de forma limpia
  con Ctrl+C, con test en `tests/unit/consulta-programada-cli.test.js` — materializa
  SC-003 (un operador puede conocer el progreso sin leer logs ni código). Tarea
  registrada retroactivamente: el CLI se implementó en el commit `0adc660` fuera de la
  lista original de tareas.

---

## Phase 7: Rework — checkpoint único "entrada" con ventana de un solo lado (Clarifications 2026-07-14)

**Purpose**: Alinear la implementación con el cambio de modelo de la spec
(un único checkpoint "entrada", ventana de un solo lado `[horaEsperada,
horaEsperada + duracionMinutos]`, sin "salida", sin margen simétrico). Las
tareas T001–T030 se completaron contra el modelo anterior; estas tareas
llevan el código y los tests al modelo nuevo. **Escribir/ajustar los tests
primero (Constitución Principio IV).**

- [X] T031 [P] Ajustar `tests/unit/checkpoint.test.js`: la ventana pasa a ser de un solo lado (`[horaEsperada, horaEsperada + duracionMinutos]`), el estado de cierre por tiempo es `cerrado_ventana_vencida`, y la config usa `duracionMinutos` en vez de `margenMinutos` (data-model.md §3)
- [X] T032 Reescribir `src/scheduling/checkpoint.js`: renombrar `margenMinutos → duracionMinutos`, calcular `_inicio = base` y `_fin = base + duracionMinutos` (ventana de un solo lado), renombrar el estado `CERRADO_MARGEN_AGOTADO → CERRADO_VENTANA_VENCIDA` (`'cerrado_ventana_vencida'`), y hacer que `createDefaultCheckpoints()` devuelva **solo** el checkpoint "entrada" (eliminar "salida") (depende de T031; hace pasar T031)
- [X] T033 [P] Ajustar `src/scheduling/scheduler.js` y `tests/integration/consulta-programada-service.integration.test.js` para operar sobre un único checkpoint "entrada" y el nuevo estado/config (eliminar toda referencia a "salida" y a `margenMinutos`) — el Edge Case "fichada nueva de empleado ya completo" se reescribió con un solo checkpoint y ticks manuales (bajo el modelo nuevo, al cerrarse "entrada" el scheduler deja de sondear)
- [X] T034 [P] Ajustar `src/service/consulta-programada-service.js` y `src/cli/consulta-programada.js` (más sus tests) para exponer/consumir un único checkpoint "entrada", el estado `cerrado_ventana_vencida` y la config `duracionMinutos` (contracts/state-schema.json, service-contract.md ya actualizados) — también `.env.example` (`FICHADAS_ENTRADA_DURACION`, sin `FICHADAS_SALIDA_*`)
- [X] T035 [P] Barrido final: grep de `salida`, `margen`, `cerrado_margen_agotado` en `src/` y `tests/` del ámbito de esta feature; 0 ocurrencias remanentes y `node --test` en verde (265/265)
- [X] T036 Acotar la completitud al día de servicio en curso (FR-006, Clarifications 2026-07-14): `FichadasMemoryStore` expone `getFichadaQueCompleta(legajo, checkpointId, fechaServicio)` y `tieneFichadaValidaParaCheckpoint(..., fechaServicio)` que solo cuentan fichadas cuyo día (`fecha`, o día local de recolección si `fecha` es null) coincide con `fechaServicio`; `consulta-programada-service.js` pasa `formatFecha(now())` en `computeCompletitud` y en la vista `getState().empleados[]`. Tests en `tests/unit/fichadas-memory-store.test.js`
- [X] T037 Restringir el respaldo de tageo al checkpoint abierto SOLO a fichadas con `hora === null` (FR-006): en `elegirCheckpoint` de `fichadas-memory-store.js`, una fichada con hora válida fuera de la ventana queda con `checkpointId: null` (p. ej. una salida de un día previo descargada durante la ventana de entrada de hoy), en vez de tagearse "entrada". Test dedicado en `tests/unit/fichadas-memory-store.test.js`

**Checkpoint**: la implementación refleja el modelo de la spec 2026-07-14
(un checkpoint "entrada", ventana de un solo lado de 30 min por defecto) y
la completitud acotada al día en curso. Las fichadas posteriores a la
ventana (p. ej. salidas de la tarde) se recuperan en el sondeo de la mañana
siguiente sin falsear la completitud. Las tareas T001–T030 quedan
consistentes con spec/plan/data-model. `node --test` en verde (269/269).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA todas las historias de usuario
- **User Story 1 (Phase 3)**: depende de Foundational — es el MVP, sin dependencias de otras historias
- **User Story 2 (Phase 4)**: depende de Foundational; reutiliza `Checkpoint`/`getState()` de US1 pero es testeable de forma independiente sobre esa base (cierre por completitud es un comportamiento adicional al de US1, no un reemplazo)
- **User Story 3 (Phase 5)**: depende de Foundational, US1 (fichadas/períodos) y US2 (completitud por empleado) para tener algo completo que exponer, pero se prueba con su propio criterio independiente (forma del snapshot)
- **Polish (Phase 6)**: depende de que las historias que se quieran pulir ya estén completas

### User Story Dependencies

- **US1 (P1)**: ninguna dependencia de otras historias — MVP autocontenido (cierre solo por vencimiento de la ventana; deduplicación ya activa desde Foundational)
- **US2 (P2)**: se apoya en el `Checkpoint`/scheduler/`getState()` creados en US1 (T007, T008, T013) pero agrega su propio criterio de completitud, testeable de forma independiente (T016-T018)
- **US3 (P3)**: se apoya en las estructuras de datos y el `getState()` parcial de US1/US2 (T013, T022) pero se prueba con su propio criterio independiente (T023/T024) — es la única historia que no aporta comportamiento nuevo del scheduler, solo completa la vista de lectura

### Within Each User Story

- Tests antes que implementación (deben fallar primero)
- Store/Checkpoint (modelo) antes que scheduler (servicio)
- Scheduler antes que `consulta-programada-service.js` (punto de entrada)
- Historia completa y con checkpoint validado antes de pasar a la siguiente prioridad

### Parallel Opportunities

- T001-T002 (Setup): en paralelo (archivos/directorios distintos)
- T003-T005 (tests Foundational): en paralelo entre sí (T004/T005 comparten archivo pero son casos de test independientes; T003 es un archivo distinto)
- T006-T007 (implementación Foundational): en paralelo (archivos distintos); T009 en paralelo con T006-T008
- T010-T011 (tests US1): en paralelo entre sí
- T015-T018 (tests US2): en paralelo entre sí
- T019 en paralelo con T003-T014 (archivo distinto, sin dependencias)
- T023-T024 (tests US3): en paralelo entre sí
- T026-T029 (Polish): todas en paralelo entre sí (archivos/alcances distintos)

---

## Parallel Example: Foundational Tests

```bash
# Lanzar juntos los tests de la capa fundacional (antes de implementar nada):
Task: "Unit test de ventana de aceptación y transición de Checkpoint en tests/unit/checkpoint.test.js"
Task: "Unit test de agrupación de FichadasMemoryStore en tests/unit/fichadas-memory-store.test.js"
Task: "Unit test de deduplicación por rawHex de FichadasMemoryStore en el mismo archivo"
```

## Parallel Example: User Story 2

```bash
# Lanzar juntos los tests de User Story 2:
Task: "Unit test de LocalFileActiveEmployeesProvider en tests/unit/local-file-active-employees-provider.test.js"
Task: "Integration test de cierre por completitud en tests/integration/consulta-programada-service.integration.test.js"
Task: "Integration test de cierre por ventana vencida con incompletos en el mismo archivo"
Task: "Integration test de fallo del padrón de empleados activos en el mismo archivo"
```

---

## Implementation Strategy

### MVP First (User Story 1 solamente)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (CRÍTICO — bloquea todas las historias)
3. Completar Phase 3: User Story 1
4. **DETENER Y VALIDAR**: correr `quickstart.md` (escenarios que no dependan del padrón de empleados, incluyendo el de deduplicación) contra el mock
5. Este es el entregable mínimo: el servicio sondea automáticamente y acumula fichadas en memoria sin duplicados, cerrando el checkpoint por vencimiento de la ventana

### Incremental Delivery

1. Setup + Foundational → base lista (incluye deduplicación por `rawHex`)
2. User Story 1 → probar de forma independiente → MVP entregable (recolección automática sin duplicados)
3. User Story 2 → probar de forma independiente → cierre inteligente por completitud + padrón de empleados activos
4. User Story 3 → probar de forma independiente → vista de consulta completa del estado acumulado
5. Cada historia agrega valor sin romper las anteriores

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes entre sí (o casos de test independientes dentro del mismo archivo, ver Parallel Opportunities)
- [Story] mapea cada tarea a su historia de usuario para trazabilidad
- Verificar que los tests fallen antes de implementar (Constitución Principio IV)
- La deduplicación por `rawHex` (FR-017, T005/T006) vive enteramente dentro de `FichadasMemoryStore` — ninguna historia de usuario necesita reimplementarla ni saber cómo funciona internamente, solo se benefician de que el store nunca las duplica
- `ActiveEmployeesProvider`/`LocalFileActiveEmployeesProvider` son un adapter placeholder explícito (research.md §4, contracts/roster-provider-contract.md) — no se conecta a Oracle en esta feature; reemplazar el adapter es trabajo de una feature futura
- Ningún archivo fuera de `src/protocol/` debe construir o interpretar bytes crudos del protocolo RS956 (Constitución Principio III; esta feature solo consume `runQuerySession`)
- El servicio no persiste nada en disco/DB más allá del log NDJSON de ciclos y el archivo de configuración placeholder del padrón — el estado de fichadas/empleados/períodos (y el `Set<rawHex>` de deduplicación) vive solo en memoria de proceso (spec, Assumptions)
- Detenerse en cada checkpoint para validar la historia de forma independiente antes de continuar
